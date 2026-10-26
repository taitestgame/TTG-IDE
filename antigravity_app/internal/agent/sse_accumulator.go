package agent

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

// RawToolCallChunk đại diện cho một mẩu tool call nhận được từ SSE chunk
type rawToolCallDelta struct {
	Index        int
	ID           string
	Name         string
	ArgumentsBuf strings.Builder
	ExtraContent any
}

// StreamAccumulator tích lũy và ráp nối toàn bộ các mẩu stream (Content, Reasoning, Native Tool Calls)
type StreamAccumulator struct {
	contentBuilder   strings.Builder
	reasoningBuilder strings.Builder
	toolCallsMap     map[int]*rawToolCallDelta
	activeSessID     string
	startTime        time.Time
	eventEmitter     func(evtType string, sessionID string, payload any)
	finishReason     string
}

// NewStreamAccumulator khởi tạo bộ tích lũy stream
func NewStreamAccumulator(activeSessID string, emit func(evtType string, sessionID string, payload any)) *StreamAccumulator {
	return &StreamAccumulator{
		toolCallsMap: make(map[int]*rawToolCallDelta),
		activeSessID: activeSessID,
		startTime:    time.Now(),
		eventEmitter: emit,
	}
}

// IngestFinishReason ghi nhận lý do kết thúc stream (ví dụ "length", "stop", "tool_calls")
func (acc *StreamAccumulator) IngestFinishReason(reason string) {
	if reason != "" {
		acc.finishReason = reason
	}
}

// GetFinishReason trả về lý do kết thúc của stream
func (acc *StreamAccumulator) GetFinishReason() string {
	return acc.finishReason
}

// IngestDelta xử lý một delta chunk từ OpenAI / Gemini / DeepSeek SSE stream
func (acc *StreamAccumulator) IngestDelta(delta map[string]any) {
	if delta == nil {
		return
	}

	// 1. Thinking / Reasoning delta
	var rDelta string
	if rc, ok := delta["reasoning_content"].(string); ok && rc != "" {
		rDelta = rc
	} else if r, ok := delta["reasoning"].(string); ok && r != "" {
		rDelta = r
	} else if th, ok := delta["thought"].(string); ok && th != "" {
		rDelta = th
	}
	if rDelta != "" {
		acc.reasoningBuilder.WriteString(rDelta)
		if acc.eventEmitter != nil {
			acc.eventEmitter("thought_stream", acc.activeSessID, map[string]any{
				"delta":   rDelta,
				"full":    acc.reasoningBuilder.String(),
				"seconds": int(time.Since(acc.startTime).Seconds()),
			})
		}
	}

	// 2. Content delta
	if c, ok := delta["content"].(string); ok && c != "" {
		acc.contentBuilder.WriteString(c)
		if acc.eventEmitter != nil {
			cleanStream := extractUserStreamText(acc.contentBuilder.String())
			acc.eventEmitter("content_stream", acc.activeSessID, map[string]any{
				"delta": c,
				"full":  cleanStream,
			})
		}
	}

	// 3. Native Tool Calls delta chunking
	if rawTCs, ok := delta["tool_calls"].([]any); ok {
		for _, tcItem := range rawTCs {
			tcMap, ok := tcItem.(map[string]any)
			if !ok {
				continue
			}

			// Lấy index của tool call trong chuỗi stream
			idx := 0
			if idxVal, found := tcMap["index"]; found {
				switch v := idxVal.(type) {
				case float64:
					idx = int(v)
				case int:
					idx = v
				}
			}

			itemDelta, exists := acc.toolCallsMap[idx]
			if !exists {
				itemDelta = &rawToolCallDelta{Index: idx}
				acc.toolCallsMap[idx] = itemDelta
			}

			if id, ok := tcMap["id"].(string); ok && id != "" {
				itemDelta.ID = id
			}

			if ec, ok := tcMap["extra_content"]; ok && ec != nil {
				itemDelta.ExtraContent = ec
			}

			if fn, ok := tcMap["function"].(map[string]any); ok {
				if name, ok := fn["name"].(string); ok && name != "" {
					itemDelta.Name += name
				}
				if argsChunk, ok := fn["arguments"].(string); ok && argsChunk != "" {
					itemDelta.ArgumentsBuf.WriteString(argsChunk)
				}
			}
		}
	}
}

var reStreamClosedTool = regexp.MustCompile(`(?s)<tool(?:_call)?>.*?</tool(?:_call)?>|<[｜|]DSML[｜|]\s+calls>.*?</[｜|]DSML[｜|]\s+calls>|<[｜|]DSML[｜|]\s+invoke.*?</[｜|]DSML[｜|]\s+invoke>|<function=.*?</function>`)
var reOrphanStreamToolTags = regexp.MustCompile(`(?i)</?(?:[｜|]DSML[｜|]|tool_call|tool|function|invoke)[^>]*>`)

// extractUserStreamText lọc bỏ các khối tool call đang stream để không bao giờ rò rỉ mã JSON hoặc tag nội bộ ra màn hình chat người dùng
func extractUserStreamText(full string) string {
	res := reStreamClosedTool.ReplaceAllString(full, "")
	tags := []string{"<tool_call", "<tool", "</tool", "<｜DSML｜", "</｜DSML｜", "<|DSML|", "</|DSML|", "<function=", "<invoke"}
	earliestIdx := -1
	for _, t := range tags {
		if idx := strings.Index(res, t); idx >= 0 {
			if earliestIdx == -1 || idx < earliestIdx {
				earliestIdx = idx
			}
		}
	}
	if earliestIdx >= 0 {
		res = res[:earliestIdx]
	}
	res = reOrphanStreamToolTags.ReplaceAllString(res, "")
	return strings.TrimSpace(res)
}

// Finalize ráp nối toàn bộ dữ liệu hoàn chỉnh sau khi kết thúc stream (data: [DONE])
func (acc *StreamAccumulator) Finalize() (string, string, []ToolCall, map[string]any) {
	rawContent := acc.contentBuilder.String()
	rawReasoning := acc.reasoningBuilder.String()

	th, cleanText := IsolateThinking(rawContent)
	var finalThinking string
	if rawReasoning != "" {
		if th != "" {
			finalThinking = th + "\n\n---\n\n" + rawReasoning
		} else {
			finalThinking = rawReasoning
		}
	} else {
		finalThinking = th
	}

	// Sắp xếp các tool calls theo đúng index
	var sortedIndices []int
	for idx := range acc.toolCallsMap {
		sortedIndices = append(sortedIndices, idx)
	}
	sort.Ints(sortedIndices)

	var toolCalls []ToolCall
	var rawOpenAIToolCalls []map[string]any

	for _, idx := range sortedIndices {
		d := acc.toolCallsMap[idx]
		if d.Name == "" && d.ArgumentsBuf.Len() == 0 {
			continue
		}

		callID := d.ID
		if callID == "" {
			callID = fmt.Sprintf("call_stream_%d_%d", time.Now().UnixMilli(), idx)
		}

		argsStr := d.ArgumentsBuf.String()
		var args map[string]any
		if strings.TrimSpace(argsStr) != "" {
			if err := json.Unmarshal([]byte(argsStr), &args); err != nil {
				// Thử làm sạch nếu JSON bị cắt cụt dấu ngoặc
				cleaned := strings.TrimSpace(argsStr)
				if !strings.HasSuffix(cleaned, "}") {
					cleaned += "}"
				}
				_ = json.Unmarshal([]byte(cleaned), &args)
			}
		}
		if args == nil {
			args = make(map[string]any)
		}

		tc := ToolCall{
			ID:           callID,
			Name:         d.Name,
			Arguments:    args,
			ExtraContent: d.ExtraContent,
		}
		EnrichToolCallMetadata(&tc)
		toolCalls = append(toolCalls, tc)

		tcMap := map[string]any{
			"id":   callID,
			"type": "function",
			"function": map[string]any{
				"name":      d.Name,
				"arguments": argsStr,
			},
		}
		if d.ExtraContent != nil {
			tcMap["extra_content"] = d.ExtraContent
		}
		rawOpenAIToolCalls = append(rawOpenAIToolCalls, tcMap)
	}

	msgMap := map[string]any{
		"role":              "assistant",
		"content":           cleanText,
		"reasoning_content": finalThinking,
	}
	if len(rawOpenAIToolCalls) > 0 {
		msgMap["tool_calls"] = rawOpenAIToolCalls
	}

	return cleanText, finalThinking, toolCalls, msgMap
}
