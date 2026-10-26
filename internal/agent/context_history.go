package agent

import (
	"fmt"
	"strings"
)

// =============================================================================
// CONTEXT HISTORY — SLIDING WINDOW & COMPACTION (Antigravity + Claude Code)
// =============================================================================

type ContextHistory struct {
	messages []map[string]any
}

func (ch *ContextHistory) Add(msg map[string]any) {
	ch.messages = append(ch.messages, msg)
}

func (ch *ContextHistory) Compact(maxTokens int, threshold float64) {
	if maxTokens <= 0 {
		maxTokens = 24000
	}
	if threshold <= 0 {
		threshold = 0.75
	}
	estTokens := 0
	for _, m := range ch.messages {
		if c, ok := m["content"].(string); ok {
			estTokens += len(c) / 4
		} else {
			estTokens += 200
		}
	}

	limit := int(float64(maxTokens) * threshold)
	// Kích hoạt compact nếu tổng token vượt ngưỡng hoặc số tin nhắn trong chuỗi đã quá dài (> 12 tin)
	if (estTokens <= limit && len(ch.messages) <= 12) || len(ch.messages) <= 6 {
		return
	}

	// Xác định điểm cắt an toàn (midEnd):
	// QUY TẮC BẢO VỆ API TOOL CALLS (Gemini / OpenAI / Claude):
	// 1. Phần giữ lại (ch.messages[midEnd:]) BẮT BUỘC phải bắt đầu bằng một tin nhắn role="user".
	// 2. Tuyệt đối không được bắt đầu bằng role="tool" (kết quả công cụ mồ côi).
	// 3. Tuyệt đối không được cắt ngang giữa một assistant có tool_calls và các tool responses của nó.
	targetRecent := 6
	if len(ch.messages) <= 10 {
		targetRecent = 4
	}
	desiredMidEnd := len(ch.messages) - targetRecent
	if desiredMidEnd <= 1 {
		return
	}

	// Tìm tin nhắn role="user" gần nhất xung quanh desiredMidEnd
	midEnd := -1
	for i := desiredMidEnd; i >= 1; i-- {
		if r, ok := ch.messages[i]["role"].(string); ok && r == "user" {
			midEnd = i
			break
		}
	}
	if midEnd <= 1 {
		for i := desiredMidEnd + 1; i < len(ch.messages)-1; i++ {
			if r, ok := ch.messages[i]["role"].(string); ok && r == "user" {
				midEnd = i
				break
			}
		}
	}

	// Nếu không tìm được điểm cắt an toàn bắt đầu bằng user, tạm dừng compact
	if midEnd <= 1 || midEnd >= len(ch.messages)-1 {
		return
	}

	var summary strings.Builder
	summary.WriteString("[TỰ ĐỘNG NÉN NGỮ CẢNH — COMPACTED CONTEXT] Tóm tắt các thao tác và kết quả đã thực hiện trước đó:\n")
	for i := 1; i < midEnd; i++ {
		role, _ := ch.messages[i]["role"].(string)
		content, _ := ch.messages[i]["content"].(string)
		if len(content) > 120 {
			content = content[:120] + "..."
		}
		summary.WriteString(fmt.Sprintf("- [%s]: %s\n", role, strings.ReplaceAll(content, "\n", " ")))
	}

	// Gộp tóm tắt trực tiếp vào system prompt (index 0) để không tạo 2 system message liên tiếp
	origSysContent, _ := ch.messages[0]["content"].(string)
	mergedSysMsg := map[string]any{
		"role":    "system",
		"content": origSysContent + "\n\n" + summary.String(),
	}

	compacted := []map[string]any{mergedSysMsg}
	compacted = append(compacted, ch.messages[midEnd:]...)
	ch.messages = compacted
}
