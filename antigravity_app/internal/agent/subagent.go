package agent

import (
	"context"
	"fmt"
	"time"

	agenttools "ttgide/internal/capabilities/tools/agent"
	"ttgide/internal/logger"
)

// registerSystemTools đăng ký các công cụ cấp hệ thống (Subagent, Memory, AskQuestion)
func (h *Harness) registerSystemTools() {
	if h.capManager == nil {
		return
	}
	agenttools.RegisterAgentTools(h.capManager, h)
}

// AskQuestion gửi câu hỏi tương tác lên giao diện người dùng qua Wails và chờ phản hồi (Antigravity/Cline parity)
func (h *Harness) AskQuestion(ctx context.Context, question string, options []string, allowCustom bool) (string, error) {
	if h.askChan == nil {
		h.askChan = make(chan string, 1)
	}
	select {
	case <-h.askChan:
	default:
	}

	h.activeSessMu.RLock()
	sessID := h.activeSessionID
	h.activeSessMu.RUnlock()
	if sessID == "" {
		sessID = "active_session"
	}

	h.emit("ask_question", sessID, map[string]any{
		"question":    question,
		"options":     options,
		"allowCustom": allowCustom,
	})

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case ans := <-h.askChan:
		return ans, nil
	case <-time.After(5 * time.Minute):
		return "[TIMEOUT]: Người dùng không phản hồi trong 5 phút. Tiếp tục với phương án mặc định.", nil
	}
}

// AnswerQuestion tiếp nhận câu trả lời của người dùng gửi vào kênh tương tác của Harness
func (h *Harness) AnswerQuestion(answer string) {
	logger.Log("INFO", "Agent", fmt.Sprintf("Nhận câu trả lời từ người dùng cho ask_question: '%s'", answer))
	if h.askChan != nil {
		select {
		case h.askChan <- answer:
		default:
		}
	}
}

// RememberLesson lưu bài học kinh nghiệm dài hạn vào Context Engine & lưu xuống đĩa
func (h *Harness) RememberLesson(lesson string) {
	if h.contextEngine != nil && h.contextEngine.GetMemoryManager() != nil {
		h.contextEngine.GetMemoryManager().AddLesson(lesson)
	}
}

// RunSubAgent điều phối một Subagent chuyên trách chạy trong ngữ cảnh độc lập với số lượt quay giới hạn
func (h *Harness) RunSubAgent(ctx context.Context, parentSessionID, task, instructions string) (string, error) {
	subSessionID := fmt.Sprintf("%s_sub_%d", parentSessionID, time.Now().UnixMilli())
	h.emit("subagent_start", parentSessionID, map[string]any{
		"subSessionId": subSessionID,
		"task":         task,
	})

	systemPrompt := fmt.Sprintf(`You are a specialized subagent of TTG IDE.
Task: %s
Instructions: %s
Rules:
1. You have access to tools for viewing files, searching code, and running commands to accomplish your task.
2. Provide a concise, comprehensive response and do NOT call additional tools once the task is complete.
3. Always respond in the language used by the user.`, task, instructions)

	subHistory := &ContextHistory{
		messages: []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": task},
		},
	}

	allSchemas := h.buildOpenAIToolSchemas()
	// Lọc bỏ chính spawn_subagent để ngăn đệ quy vô hạn
	var subSchemas []map[string]any
	for _, ts := range allSchemas {
		if fn, ok := ts["function"].(map[string]any); ok {
			if fn["name"] != "spawn_subagent" {
				subSchemas = append(subSchemas, ts)
			}
		}
	}

	maxSubTurns := 8
	for turn := 1; turn <= maxSubTurns; turn++ {
		parsed, err := h.callModelOrFallback(ctx, subHistory.messages, subSchemas)
		if err != nil {
			return "", fmt.Errorf("subagent gọi model lỗi: %w", err)
		}

		if len(parsed.ToolCalls) == 0 {
			h.emit("subagent_end", parentSessionID, map[string]any{
				"subSessionId": subSessionID,
				"result":       parsed.ContentText,
			})
			return fmt.Sprintf("[KẾT QUẢ TỪ SUBAGENT]:\n%s", parsed.ContentText), nil
		}

		if parsed.RawMessage != nil {
			subHistory.Add(parsed.RawMessage)
		} else {
			subHistory.Add(map[string]any{
				"role":       "assistant",
				"content":    parsed.ContentText,
				"tool_calls": parsed.ToolCalls,
			})
		}

		for _, tc := range parsed.ToolCalls {
			EnrichToolCallMetadata(&tc)
			h.emit("tool_start", subSessionID, tc)
			out, _ := h.executor.ExecuteTool(ctx, tc.Name, tc.Arguments)
			tc.Result = out
			h.emit("tool_end", subSessionID, tc)
			subHistory.Add(map[string]any{
				"role":         "tool",
				"tool_call_id": tc.ID,
				"content":      out,
			})
		}
	}

	return "[KẾT QUẢ TỪ SUBAGENT]: Đã đạt số lượt tối đa mà chưa kết thúc.", nil
}
