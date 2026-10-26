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
	// Chỉ kích hoạt compact khi thực sự vượt ngưỡng token hoặc lịch sử quá dài (> 30 tin nhắn)
	if (estTokens <= limit && len(ch.messages) <= 30) || len(ch.messages) <= 8 {
		return
	}

	// Cắt gọn nhưng luôn bảo toàn:
	// - ch.messages[0]: System prompt (được gộp tóm tắt ngữ cảnh cũ)
	// - ch.messages[1]: Yêu cầu ban đầu của User (để AI không bao giờ quên mục tiêu chính)
	// - ch.messages[midEnd:]: Các lượt tương tác gần nhất
	targetRecent := 8
	if len(ch.messages) <= 16 {
		targetRecent = 6
	}
	desiredMidEnd := len(ch.messages) - targetRecent
	if desiredMidEnd <= 2 {
		return
	}

	// Tìm điểm cắt an toàn midEnd: Ưu tiên bắt đầu bằng tin nhắn role="user"
	// để bảo đảm 100% không bao giờ cắt rời cặp assistant (tool_calls) và tool (result)
	midEnd := -1
	for i := desiredMidEnd; i >= 2; i-- {
		r, _ := ch.messages[i]["role"].(string)
		if r == "user" {
			midEnd = i
			break
		}
	}
	if midEnd <= 2 {
		for i := desiredMidEnd + 1; i < len(ch.messages)-1; i++ {
			r, _ := ch.messages[i]["role"].(string)
			if r == "user" {
				midEnd = i
				break
			}
		}
	}

	// Nếu không tìm được turn user, tìm assistant KHÔNG có tool_calls
	if midEnd <= 2 {
		for i := desiredMidEnd; i >= 2; i-- {
			r, _ := ch.messages[i]["role"].(string)
			if r == "assistant" {
				if _, hasTC := ch.messages[i]["tool_calls"]; !hasTC {
					midEnd = i
					break
				}
			}
		}
	}

	// Nếu vẫn không tìm được điểm cắt an toàn, tạm dừng compact để tránh lỗi giao thức API
	if midEnd <= 2 || midEnd >= len(ch.messages)-1 {
		return
	}

	var summary strings.Builder
	summary.WriteString("[TỰ ĐỘNG NÉN NGỮ CẢNH — COMPACTED CONTEXT] Tóm tắt các thao tác và kết quả đã thực hiện trước đó:\n")
	if len(ch.messages) > 1 {
		if firstGoal, ok := ch.messages[1]["content"].(string); ok && firstGoal != "" {
			if len(firstGoal) > 160 {
				firstGoal = firstGoal[:160] + "..."
			}
			summary.WriteString(fmt.Sprintf("- [Mục tiêu ban đầu của phiên]: %s\n", strings.ReplaceAll(firstGoal, "\n", " ")))
		}
	}
	for i := 2; i < midEnd; i++ {
		role, _ := ch.messages[i]["role"].(string)
		content, _ := ch.messages[i]["content"].(string)
		if len(content) > 150 {
			content = content[:150] + "..."
		}
		if content != "" {
			summary.WriteString(fmt.Sprintf("- [%s]: %s\n", role, strings.ReplaceAll(content, "\n", " ")))
		}
	}

	// Gộp tóm tắt trực tiếp vào system prompt (index 0) để không tạo 2 system message liên tiếp
	origSysContent, _ := ch.messages[0]["content"].(string)
	mergedSysMsg := map[string]any{
		"role":    "system",
		"content": origSysContent + "\n\n" + summary.String(),
	}

	compacted := []map[string]any{mergedSysMsg}
	if len(ch.messages) > 1 && ch.messages[1]["role"] == "user" {
		compacted = append(compacted, ch.messages[1])
	}
	compacted = append(compacted, ch.messages[midEnd:]...)
	ch.messages = compacted
}
