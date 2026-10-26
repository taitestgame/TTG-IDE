package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"ttgide/internal/logger"
)

// =============================================================================
// MODEL CLIENT & THINKING TOKEN ISOLATOR (DeepSeek R1 + OpenAI Compat)
// =============================================================================

type ParsedModelOutput struct {
	ThinkingText string
	ContentText  string
	ToolCalls    []ToolCall
	RawMessage   map[string]any
}

// IsolateThinking tách reasoning tokens <think>...</think>, <thought>...</thought>, hoặc scratchpad block khỏi nội dung thực thi
func IsolateThinking(content string) (thinking, cleanText string) {
	// 1. Trích xuất tất cả các khối <think>...</think> (kể cả trường hợp không có thẻ đóng)
	if strings.Contains(content, "<think>") {
		var thinkBlocks []string
		curr := content
		for {
			start := strings.Index(curr, "<think>")
			if start < 0 {
				break
			}
			end := strings.Index(curr, "</think>")
			if end > start {
				th := strings.TrimSpace(curr[start+7 : end])
				if th != "" {
					thinkBlocks = append(thinkBlocks, th)
				}
				curr = curr[:start] + curr[end+8:]
			} else {
				th := strings.TrimSpace(curr[start+7:])
				if th != "" {
					thinkBlocks = append(thinkBlocks, th)
				}
				curr = curr[:start]
				break
			}
		}
		if len(thinkBlocks) > 0 {
			return strings.Join(thinkBlocks, "\n\n---\n\n"), strings.TrimSpace(curr)
		}
	}

	// 2. Thẻ <thought>...</thought> hoặc <thinking>...</thinking>
	if strings.Contains(content, "<thought>") {
		var thinkBlocks []string
		curr := content
		for {
			startThought := strings.Index(curr, "<thought>")
			if startThought < 0 {
				break
			}
			endThought := strings.Index(curr, "</thought>")
			if endThought > startThought {
				th := strings.TrimSpace(curr[startThought+9 : endThought])
				if th != "" {
					thinkBlocks = append(thinkBlocks, th)
				}
				curr = curr[:startThought] + curr[endThought+10:]
			} else {
				th := strings.TrimSpace(curr[startThought+9:])
				if th != "" {
					thinkBlocks = append(thinkBlocks, th)
				}
				curr = curr[:startThought]
				break
			}
		}
		if len(thinkBlocks) > 0 {
			return strings.Join(thinkBlocks, "\n\n---\n\n"), strings.TrimSpace(curr)
		}
	}
	if strings.Contains(content, "<thinking>") {
		var thinkBlocks []string
		curr := content
		for {
			startThinking := strings.Index(curr, "<thinking>")
			if startThinking < 0 {
				break
			}
			endThinking := strings.Index(curr, "</thinking>")
			if endThinking > startThinking {
				th := strings.TrimSpace(curr[startThinking+10 : endThinking])
				if th != "" {
					thinkBlocks = append(thinkBlocks, th)
				}
				curr = curr[:startThinking] + curr[endThinking+11:]
			} else {
				th := strings.TrimSpace(curr[startThinking+10:])
				if th != "" {
					thinkBlocks = append(thinkBlocks, th)
				}
				curr = curr[:startThinking]
				break
			}
		}
		if len(thinkBlocks) > 0 {
			return strings.Join(thinkBlocks, "\n\n---\n\n"), strings.TrimSpace(curr)
		}
	}

	// 3. Khối markdown scratchpad planning / thinking dump từ OpenCode / DeepSeek
	lowerContent := strings.ToLower(content)
	if strings.Contains(content, "## Objective") ||
		strings.Contains(content, "## Work State") ||
		strings.Contains(content, "## Important Details") ||
		strings.Contains(lowerContent, "thought for ") ||
		strings.Contains(lowerContent, "anchored summary") ||
		strings.HasPrefix(strings.TrimSpace(content), "Thought:") {

		if idx := strings.Index(content, "## Answer"); idx >= 0 {
			thinking = strings.TrimSpace(content[:idx])
			cleanText = strings.TrimSpace(content[idx+9:])
			return thinking, cleanText
		}
		if idx := strings.Index(content, "Answer:"); idx >= 0 {
			thinking = strings.TrimSpace(content[:idx])
			cleanText = strings.TrimSpace(content[idx+7:])
			return thinking, cleanText
		}
		if idx := strings.Index(content, "<tool_call>"); idx >= 0 {
			thinking = strings.TrimSpace(content[:idx])
			cleanText = strings.TrimSpace(content[idx:])
			return thinking, cleanText
		}

		// Toàn bộ khối này là reasoning / thinking nội bộ, không phải câu trả lời hiển thị cho người dùng
		return strings.TrimSpace(content), ""
	}

	return "", strings.TrimSpace(content)
}

// buildOpenAIToolSchemas chuẩn hóa tool definitions thành OpenAI JSON Schema
func (h *Harness) buildOpenAIToolSchemas() []map[string]any {
	if h.capManager == nil {
		return nil
	}
	defs := h.capManager.GetDefinitions()
	schemas := make([]map[string]any, 0, len(defs))
	for _, def := range defs {
		params := def.Parameters
		if params == nil {
			params = map[string]any{"type": "object", "properties": map[string]any{}}
		} else if _, hasType := params["type"]; !hasType {
			props := make(map[string]any)
			required := make([]string, 0, len(params))
			for k, v := range params {
				desc := fmt.Sprintf("%v", v)
				props[k] = map[string]any{
					"type":        "string",
					"description": desc,
				}
				required = append(required, k)
			}
			params = map[string]any{
				"type":       "object",
				"properties": props,
				"required":   required,
			}
		}

		schemas = append(schemas, map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        def.Name,
				"description": def.Description,
				"parameters":  params,
			},
		})
	}
	return schemas
}

// formatOpenAIMessages chuẩn hóa định dạng tin nhắn và bảo vệ tính toàn vẹn thứ tự hội thoại cho OpenAI / Gemini API
func formatOpenAIMessages(messages []map[string]any, useNativeTools bool) []map[string]any {
	if len(messages) == 0 {
		return messages
	}

	// 1. Tách và gộp toàn bộ system messages vào duy nhất 1 system prompt ở đầu
	var systemParts []string
	var nonSystem []map[string]any

	for _, m := range messages {
		r, _ := m["role"].(string)
		if r == "system" {
			if s, ok := m["content"].(string); ok && strings.TrimSpace(s) != "" {
				systemParts = append(systemParts, s)
			}
		} else {
			nonSystem = append(nonSystem, m)
		}
	}

	var result []map[string]any
	if len(systemParts) > 0 {
		result = append(result, map[string]any{
			"role":    "system",
			"content": strings.Join(systemParts, "\n\n"),
		})
	}

	if len(nonSystem) == 0 {
		return result
	}

	// 2. Chuyển đổi và chuẩn hóa từng tin nhắn
	var preNormalized []map[string]any
	for _, msg := range nonSystem {
		r, _ := msg["role"].(string)

		if r == "tool" {
			toolContent, _ := msg["content"].(string)
			callID, _ := msg["tool_call_id"].(string)
			if !useNativeTools {
				preNormalized = append(preNormalized, map[string]any{
					"role":    "user",
					"content": fmt.Sprintf("[KẾT QUẢ CÔNG CỤ]:\n%s", toolContent),
				})
			} else {
				if callID == "" {
					callID = "call_default"
				}
				preNormalized = append(preNormalized, map[string]any{
					"role":         "tool",
					"tool_call_id": callID,
					"content":      toolContent,
				})
			}
		} else if r == "assistant" {
			contentStr, _ := msg["content"].(string)
			cleanMsg := map[string]any{
				"role":    "assistant",
				"content": contentStr,
			}

			// Kiểm tra tool_calls
			if tcs, ok := msg["tool_calls"].([]ToolCall); ok && len(tcs) > 0 {
				if useNativeTools {
					var openAIToolCalls []map[string]any
					for _, tc := range tcs {
						b, _ := json.Marshal(tc.Arguments)
						openAIToolCalls = append(openAIToolCalls, map[string]any{
							"id":   tc.ID,
							"type": "function",
							"function": map[string]any{
								"name":      tc.Name,
								"arguments": string(b),
							},
						})
					}
					cleanMsg["tool_calls"] = openAIToolCalls
				} else {
					var callsText []string
					for _, tc := range tcs {
						b, _ := json.Marshal(tc.Arguments)
						callsText = append(callsText, fmt.Sprintf("<tool_call>\n{\"name\": \"%s\", \"arguments\": %s}\n</tool_call>", tc.Name, string(b)))
					}
					if contentStr == "" {
						cleanMsg["content"] = strings.Join(callsText, "\n")
					} else {
						cleanMsg["content"] = contentStr + "\n" + strings.Join(callsText, "\n")
					}
				}
			} else if rawTC, ok := msg["tool_calls"].([]any); ok && len(rawTC) > 0 {
				if useNativeTools {
					cleanMsg["tool_calls"] = rawTC
				} else {
					cleanMsg["content"] = contentStr
				}
			}
			preNormalized = append(preNormalized, cleanMsg)
		} else {
			preNormalized = append(preNormalized, msg)
		}
	}

	// 3. Bảo vệ thứ tự hội thoại nghiêm ngặt cho Gemini / OpenAI:
	// - Sau system, tin nhắn đầu tiên BẮT BUỘC phải là "user".
	// - role="tool" CHỈ được xuất hiện ngay sau assistant có tool_calls hoặc một tool khác.
	// - assistant có tool_calls CHỈ được xuất hiện ngay sau user hoặc tool (không được đứng sau system).
	// - Nếu assistant có tool_calls nhưng tin nhắn tiếp theo là user (không có tool response), phải gỡ bỏ tool_calls.
	var finalSeq []map[string]any
	for i, msg := range preNormalized {
		r, _ := msg["role"].(string)

		if i == 0 && r != "user" {
			finalSeq = append(finalSeq, map[string]any{
				"role":    "user",
				"content": "Bắt đầu yêu cầu.",
			})
		}

		if r == "tool" {
			var prevRole string
			var prevHasTools bool
			if len(finalSeq) > 0 {
				prevMsg := finalSeq[len(finalSeq)-1]
				prevRole, _ = prevMsg["role"].(string)
				if _, ok := prevMsg["tool_calls"]; ok {
					prevHasTools = true
				}
			}
			if (prevRole == "assistant" && prevHasTools) || prevRole == "tool" {
				finalSeq = append(finalSeq, msg)
			} else {
				c, _ := msg["content"].(string)
				finalSeq = append(finalSeq, map[string]any{
					"role":    "user",
					"content": fmt.Sprintf("[KẾT QUẢ CÔNG CỤ TRƯỚC]:\n%s", c),
				})
			}
		} else if r == "assistant" {
			if _, hasTC := msg["tool_calls"]; hasTC {
				nextIsTool := false
				if i+1 < len(preNormalized) {
					nextRole, _ := preNormalized[i+1]["role"].(string)
					if nextRole == "tool" {
						nextIsTool = true
					}
				}
				if !nextIsTool {
					newMsg := map[string]any{
						"role":    "assistant",
						"content": msg["content"],
					}
					finalSeq = append(finalSeq, newMsg)
					continue
				}
			}
			finalSeq = append(finalSeq, msg)
		} else {
			finalSeq = append(finalSeq, msg)
		}
	}

	result = append(result, finalSeq...)
	return result
}

// callModelOrFallback gọi model AI hoặc fallback nếu không có API key
func (h *Harness) callModelOrFallback(ctx context.Context, messages []map[string]any, tools []map[string]any) (*ParsedModelOutput, error) {
	apiKey := h.config.APIKey
	isLocal := strings.Contains(h.config.BaseURL, "127.0.0.1") || strings.Contains(h.config.BaseURL, "localhost")
	if apiKey == "" {
		if isLocal {
			apiKey = "free"
		} else {
			return &ParsedModelOutput{
				ContentText: "Không phát hiện API Key, chế độ tự động thực thi tuần tự hoàn tất.",
			}, nil
		}
	}

	// Trích xuất user prompt gần nhất
	userGoal := ""
	for i := len(messages) - 1; i >= 0; i-- {
		if r, ok := messages[i]["role"].(string); ok && r == "user" {
			if s, ok := messages[i]["content"].(string); ok {
				userGoal = s
				break
			} else if arr, ok := messages[i]["content"].([]any); ok {
				for _, item := range arr {
					if mItem, isM := item.(map[string]any); isM {
						if mItem["type"] == "text" {
							if t, isT := mItem["text"].(string); isT {
								userGoal = t
								break
							}
						}
					}
				}
				if userGoal != "" {
					break
				}
			} else if arrMap, ok := messages[i]["content"].([]map[string]any); ok {
				for _, item := range arrMap {
					if item["type"] == "text" {
						if t, isT := item["text"].(string); isT {
							userGoal = t
							break
						}
					}
				}
				if userGoal != "" {
					break
				}
			}
		}
	}

	isOpenCodeBridge := strings.Contains(h.config.BaseURL, ":5050")
	useNativeTools := len(tools) > 0 && !isOpenCodeBridge
	normalizedMessages := formatOpenAIMessages(messages, useNativeTools)

	reqBody := map[string]any{
		"model":    h.config.Model,
		"messages": normalizedMessages,
		"stream":   true,
	}
	if useNativeTools {
		reqBody["tools"] = tools
	}
	jsonData, _ := json.Marshal(reqBody)

	endpoint := strings.TrimRight(h.config.BaseURL, "/")
	if !strings.HasSuffix(endpoint, "/chat/completions") {
		if !strings.HasSuffix(endpoint, "/v1") && !strings.Contains(endpoint, "/v1") {
			endpoint += "/v1"
		}
		endpoint += "/chat/completions"
	}
	url := endpoint
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	reqTimeout := 90 * time.Second
	if isLocal {
		reqTimeout = 50 * time.Second
	}
	client := &http.Client{Timeout: reqTimeout}
	startTime := time.Now()
	logger.Log("INFO", "AI-Req", fmt.Sprintf("Bắt đầu gọi AI model='%s' tại %s (timeout: %v)", h.config.Model, url, reqTimeout))

	resp, err := client.Do(req)

	// Nếu gửi kèm tools bị lỗi 400 Bad Request từ model không hỗ trợ tool schema, tự động thử lại không kèm tools
	if resp != nil && resp.StatusCode == 400 && len(tools) > 0 && !isLocal {
		resp.Body.Close()
		delete(reqBody, "tools")
		noToolsData, _ := json.Marshal(reqBody)
		retryReq, rErr := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(noToolsData))
		if rErr == nil {
			retryReq.Header.Set("Content-Type", "application/json")
			if apiKey != "" {
				retryReq.Header.Set("Authorization", "Bearer "+apiKey)
			}
			resp, err = client.Do(retryReq)
		}
	}

	// Tự động chuyển đổi dự phòng (Auto-Fallback) sang model tốc độ cao nếu model chính bị nghẽn
	var origStatusCode int
	var origBodyStr string
	if resp != nil && resp.StatusCode >= 400 {
		origStatusCode = resp.StatusCode
		b, _ := io.ReadAll(resp.Body)
		origBodyStr = string(b)
		resp.Body.Close()
		resp = nil
	}

	// Tự động chuyển đổi dự phòng (Auto-Fallback) sang model tốc độ cao nếu model chính bị nghẽn (chỉ áp dụng cho OpenCode Bridge :5050)
	if (err != nil || origStatusCode >= 400) && isLocal && strings.Contains(url, ":5050") {
		fbCandidates := []string{"nemotron-3.5-lightning-free", "minimax-m3.1-flash-free"}
		for _, fbModel := range fbCandidates {
			if fbModel == h.config.Model {
				continue
			}
			h.emit("status", "system", fmt.Sprintf("Model %s phản hồi chậm/lỗi, chuyển dự phòng sang %s...", h.config.Model, fbModel))
			logger.Log("WARN", "AI-Fallback", fmt.Sprintf("Model %s lỗi, thử chuyển sang %s", h.config.Model, fbModel))
			reqBody["model"] = fbModel
			fbData, _ := json.Marshal(reqBody)
			fbReq, fbReqErr := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(fbData))
			if fbReqErr == nil {
				fbReq.Header.Set("Content-Type", "application/json")
				if apiKey != "" {
					fbReq.Header.Set("Authorization", "Bearer "+apiKey)
				}
				fbClient := &http.Client{Timeout: 45 * time.Second}
				fbResp, fbErr := fbClient.Do(fbReq)
				if fbErr == nil && fbResp != nil && fbResp.StatusCode < 400 {
					resp = fbResp
					err = nil
					origStatusCode = 0
					origBodyStr = ""
					h.config.Model = fbModel
					break
				} else if fbResp != nil {
					fbResp.Body.Close()
				}
			}
		}
	}

	if err != nil || resp == nil {
		if err != nil {
			logger.Log("ERROR", "AI-Req", fmt.Sprintf("Lỗi kết nối AI: %v", err))
		}
		if origStatusCode > 0 {
			return nil, fmt.Errorf("máy chủ AI tại %s trả về lỗi HTTP %d: %s", url, origStatusCode, origBodyStr)
		}
		if isLocal && strings.Contains(url, ":5050") {
			return nil, fmt.Errorf("không thể kết nối OpenCode Bridge tại %s: %w. Đang kiểm tra kết nối :5050", url, err)
		}
		if err != nil {
			return nil, fmt.Errorf("lỗi kết nối máy chủ AI tại %s: %w", url, err)
		}
		return nil, fmt.Errorf("máy chủ AI tại %s không trả về dữ liệu", url)
	}
	defer resp.Body.Close()

	duration := time.Since(startTime).Seconds()
	logger.Log("INFO", "AI-Resp", fmt.Sprintf("Nhận phản hồi từ model='%s' sau %.2fs. StatusCode=%d", h.config.Model, duration, resp.StatusCode))

	var msgMap map[string]any
	var thinking string
	var cleanText string

	var activeSessID string
	if h != nil {
		h.activeSessMu.RLock()
		activeSessID = h.activeSessionID
		h.activeSessMu.RUnlock()
	}
	if activeSessID == "" {
		activeSessID = "active_session"
	}

	contentType := resp.Header.Get("Content-Type")
	isSSE := strings.Contains(contentType, "text/event-stream")

	if resp.StatusCode < 400 && isSSE {
		var contentBuilder strings.Builder
		var reasoningBuilder strings.Builder
		var streamToolCalls []any

		scanner := bufio.NewScanner(resp.Body)
		buf := make([]byte, 1024*1024)
		scanner.Buffer(buf, 5*1024*1024)

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, ":") {
				continue
			}
			if line == "data: [DONE]" {
				break
			}
			if strings.HasPrefix(line, "data: ") {
				rawJSON := strings.TrimPrefix(line, "data: ")
				var chunk struct {
					Choices []struct {
						Delta map[string]any `json:"delta"`
					} `json:"choices"`
				}
				if json.Unmarshal([]byte(rawJSON), &chunk) == nil && len(chunk.Choices) > 0 {
					delta := chunk.Choices[0].Delta
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
						reasoningBuilder.WriteString(rDelta)
						currentTh := reasoningBuilder.String()
						h.emit("thought_stream", activeSessID, map[string]any{
							"delta":   rDelta,
							"full":    currentTh,
							"seconds": int(time.Since(startTime).Seconds()),
						})
					}

					// 2. Content delta
					if c, ok := delta["content"].(string); ok && c != "" {
						contentBuilder.WriteString(c)
						h.emit("content_stream", activeSessID, map[string]any{
							"delta": c,
							"full":  contentBuilder.String(),
						})
					}

					// 3. Native tool_calls (nếu có)
					if tcs, ok := delta["tool_calls"].([]any); ok {
						streamToolCalls = append(streamToolCalls, tcs...)
					}
				}
			}
		}

		rawFullContent := contentBuilder.String()
		rawFullReasoning := reasoningBuilder.String()

		th, clean := IsolateThinking(rawFullContent)
		if rawFullReasoning != "" {
			if th != "" {
				thinking = th + "\n\n---\n\n" + rawFullReasoning
			} else {
				thinking = rawFullReasoning
			}
		} else {
			thinking = th
		}
		cleanText = clean

		msgMap = map[string]any{
			"role":              "assistant",
			"content":           cleanText,
			"reasoning_content": thinking,
		}
		if len(streamToolCalls) > 0 {
			msgMap["tool_calls"] = streamToolCalls
		}
	} else {
		bodyBytes, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			return nil, fmt.Errorf("lỗi đọc dữ liệu phản hồi từ AI: %w", readErr)
		}

		if resp.StatusCode >= 400 {
			errText := string(bodyBytes)
			if resp.StatusCode == 504 || strings.Contains(errText, "504 Gateway Time-out") {
				return nil, fmt.Errorf("máy chủ AI phản hồi quá thời gian (504 Gateway Timeout). Vui lòng thử lại hoặc đổi sang model nhanh hơn như laguna-s-2.1-free / longcat-2.5-preview-free")
			}
			if resp.StatusCode == 502 || resp.StatusCode == 503 {
				return nil, fmt.Errorf("máy chủ AI tạm thời gián đoạn (HTTP %d). Vui lòng thử lại sau giây lát", resp.StatusCode)
			}
			if strings.Contains(errText, "<html") {
				reTitle := regexp.MustCompile(`(?i)<title>(.*?)</title>`)
				if m := reTitle.FindStringSubmatch(errText); len(m) > 1 {
					errText = m[1]
				}
			}
			return nil, fmt.Errorf("mô hình AI trả về lỗi HTTP %d: %s", resp.StatusCode, errText)
		}

		var aiResp struct {
			Choices []struct {
				Message map[string]any `json:"message"`
			} `json:"choices"`
		}

		if err := json.Unmarshal(bodyBytes, &aiResp); err != nil {
			return nil, fmt.Errorf("lỗi giải mã JSON từ Model (%s): %w", string(bodyBytes), err)
		}

		if len(aiResp.Choices) == 0 {
			return nil, fmt.Errorf("không nhận được phản hồi từ AI: %s", string(bodyBytes))
		}

		msgMap = aiResp.Choices[0].Message
		contentStr, _ := msgMap["content"].(string)
		thinking, cleanText = IsolateThinking(contentStr)

		var apiReasoning string
		if rc, ok := msgMap["reasoning_content"].(string); ok && strings.TrimSpace(rc) != "" {
			apiReasoning = strings.TrimSpace(rc)
		} else if r, ok := msgMap["reasoning"].(string); ok && strings.TrimSpace(r) != "" {
			apiReasoning = strings.TrimSpace(r)
		} else if th, ok := msgMap["thought"].(string); ok && strings.TrimSpace(th) != "" {
			apiReasoning = strings.TrimSpace(th)
		}
		if apiReasoning != "" {
			if thinking != "" {
				thinking = thinking + "\n\n---\n\n" + apiReasoning
			} else {
				thinking = apiReasoning
			}
		}
	}

	var toolCalls []ToolCall
	if rawTC, ok := msgMap["tool_calls"].([]any); ok {
		for _, tcItem := range rawTC {
			tcBytes, _ := json.Marshal(tcItem)
			var tc struct {
				ID       string `json:"id"`
				Function struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"function"`
			}
			if err := json.Unmarshal(tcBytes, &tc); err == nil {
				var args map[string]any
				_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
				toolCalls = append(toolCalls, ToolCall{
					ID:        tc.ID,
					Name:      tc.Function.Name,
					Arguments: args,
				})
			}
		}
	}

	// Tìm file vừa được thao tác gần nhất trong context messages
	lastActiveFile := ""
	for i := len(messages) - 1; i >= 0; i-- {
		// 1. Kiểm tra []ToolCall
		if tcList, ok := messages[i]["tool_calls"].([]ToolCall); ok {
			for _, tc := range tcList {
				if p, ok := tc.Arguments["path"].(string); ok && p != "" {
					lastActiveFile = p
					break
				}
			}
		}
		// 2. Kiểm tra []any (OpenAI raw tool_calls)
		if lastActiveFile == "" {
			if anyList, ok := messages[i]["tool_calls"].([]any); ok {
				for _, rawItem := range anyList {
					if m, ok := rawItem.(map[string]any); ok {
						if fn, ok := m["function"].(map[string]any); ok {
							if argsStr, ok := fn["arguments"].(string); ok {
								var args map[string]any
								if err := json.Unmarshal([]byte(argsStr), &args); err == nil {
									if p, ok := args["path"].(string); ok && p != "" {
										lastActiveFile = p
										break
									}
								}
							}
						}
						if args, ok := m["arguments"].(map[string]any); ok {
							if p, ok := args["path"].(string); ok && p != "" {
								lastActiveFile = p
								break
							}
						}
					}
				}
			}
		}
		// 3. Quét thẻ tệp tin trong nội dung text: [Nội dung tệp: ...] hoặc [FILE ĐANG ĐƯỢC CHỌN]: ...
		if lastActiveFile == "" {
			if contentStr, ok := messages[i]["content"].(string); ok {
				reFileTag := regexp.MustCompile(`(?i)(?:\[(?:Nội\s+dung\s+tệp|Tệp\s+đính\s+kèm|Tệp\s+tin|FILE\s+ĐANG\s+ĐƯỢC\s+CHỌN)\]?[:\s]*)[` + "`'\"" + `]?([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)`)
				if m := reFileTag.FindStringSubmatch(contentStr); len(m) > 1 {
					lastActiveFile = strings.TrimSpace(m[1])
				}
			}
		}
		if lastActiveFile != "" {
			break
		}
	}

	// 4. Dự phòng nếu context messages chưa có nhưng Harness sessionLastFiles có
	if lastActiveFile == "" && h != nil {
		h.historyMu.Lock()
		for _, files := range h.sessionLastFiles {
			if len(files) > 0 && files[0] != "" {
				lastActiveFile = files[0]
				break
			}
		}
		h.historyMu.Unlock()
	}

	// Nếu không có native tool_calls, tự động trích xuất hoặc suy luận từ văn bản (sau khi đã bóc tách reasoning/thinking)
	if len(toolCalls) == 0 {
		toolCalls = extractTextToolCalls(cleanText, userGoal, lastActiveFile)
	}

	// Làm sạch mọi thẻ <tool_call>...</tool_call> và <｜DSML｜ calls> khỏi ContentText để không bao giờ in text thô ra màn hình chat
	reToolCall := regexp.MustCompile(`(?s)<tool_call>.*?</tool_call>`)
	cleanText = strings.TrimSpace(reToolCall.ReplaceAllString(cleanText, ""))

	if strings.Contains(cleanText, "DSML") {
		reDSML := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+calls>.*?</[｜|]DSML[｜|]\s+calls>`)
		cleanText = strings.TrimSpace(reDSML.ReplaceAllString(cleanText, ""))
		reDSMLInvoke := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+invoke.*?</[｜|]DSML[｜|]\s+invoke>`)
		cleanText = strings.TrimSpace(reDSMLInvoke.ReplaceAllString(cleanText, ""))
	}

	return &ParsedModelOutput{
		ThinkingText: thinking,
		ContentText:  cleanText,
		ToolCalls:    toolCalls,
		RawMessage:   msgMap,
	}, nil
}

// createReactProjectTools sinh bộ file khởi tạo hoàn chỉnh cho dự án ReactJS Vite
func createReactProjectTools() []ToolCall {
	now := time.Now().UnixMilli()
	pkgJSON := `{
  "name": "react-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.1"
  }
}
`
	indexHTML := `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App - TTG IDE</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
	viteConfig := `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`
	mainJSX := `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`
	appJSX := `import React, { useState } from 'react'
import './index.css'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="container">
      <h1>🚀 React Project - TTG IDE</h1>
      <p>Dự án ReactJS được tạo thành công bởi TTG IDE AI!</p>
      <div className="card">
        <button onClick={() => setCount((c) => c + 1)}>
          Đã bấm: {count} lần
        </button>
      </div>
      <p className="hint">Chạy <code>npm install</code> và <code>npm run dev</code> để bắt đầu ứng dụng.</p>
    </div>
  )
}
`
	indexCSS := `body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
  font-family: Inter, system-ui, -apple-system, sans-serif;
  background-color: #0f172a;
  color: #f8fafc;
}
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}
button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  background-color: #0284c7;
  color: white;
  cursor: pointer;
  transition: all 0.25s;
}
button:hover {
  background-color: #0369a1;
}
.card {
  padding: 2em;
}
.hint {
  color: #94a3b8;
  font-size: 0.9em;
}
`

	return []ToolCall{
		{ID: fmt.Sprintf("call_create_%d_1", now), Name: "write_file", Arguments: map[string]any{"path": "package.json", "content": pkgJSON}},
		{ID: fmt.Sprintf("call_create_%d_2", now), Name: "write_file", Arguments: map[string]any{"path": "index.html", "content": indexHTML}},
		{ID: fmt.Sprintf("call_create_%d_3", now), Name: "write_file", Arguments: map[string]any{"path": "vite.config.js", "content": viteConfig}},
		{ID: fmt.Sprintf("call_create_%d_4", now), Name: "write_file", Arguments: map[string]any{"path": "src/main.jsx", "content": mainJSX}},
		{ID: fmt.Sprintf("call_create_%d_5", now), Name: "write_file", Arguments: map[string]any{"path": "src/App.jsx", "content": appJSX}},
		{ID: fmt.Sprintf("call_create_%d_6", now), Name: "write_file", Arguments: map[string]any{"path": "src/index.css", "content": indexCSS}},
	}
}

// extractTextToolCalls trích xuất tool calls từ định dạng tag <tool_call>, block JSON, hoặc lệnh tạo/sửa file
func extractTextToolCalls(text string, userGoals ...string) []ToolCall {
	userGoal := ""
	if len(userGoals) > 0 {
		userGoal = userGoals[0]
	}
	var tcs []ToolCall

	// 0. Quét cú pháp DSML của DeepSeek: <｜DSML｜ invoke name="...">...<｜DSML｜ parameter name="...">...</｜DSML｜ invoke>
	if strings.Contains(text, "DSML") {
		reDSMLInvoke := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+invoke\s+name=["']([^"']+)["']>(.*?)</[｜|]DSML[｜|]\s+invoke>`)
		reDSMLParam := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+parameter\s+name=["']([^"']+)["'][^>]*>(.*?)</[｜|]DSML[｜|]\s+parameter>`)
		dsmlMatches := reDSMLInvoke.FindAllStringSubmatch(text, -1)
		for i, m := range dsmlMatches {
			toolName := strings.TrimSpace(m[1])
			body := m[2]
			args := make(map[string]any)
			paramMatches := reDSMLParam.FindAllStringSubmatch(body, -1)
			for _, pm := range paramMatches {
				k := strings.TrimSpace(pm[1])
				v := strings.TrimSpace(pm[2])
				args[k] = v
			}
			if toolName != "" {
				tcs = append(tcs, ToolCall{
					ID:        fmt.Sprintf("call_dsml_%d_%d", time.Now().UnixMilli(), i),
					Name:      toolName,
					Arguments: args,
				})
			}
		}
		if len(tcs) > 0 {
			return tcs
		}
	}

	// 1. Quét cú pháp thẻ <tool_call>...</tool_call>
	reTag := regexp.MustCompile(`(?s)<tool_call>(.*?)</tool_call>`)
	matches := reTag.FindAllStringSubmatch(text, -1)
	for i, m := range matches {
		raw := strings.TrimSpace(m[1])
		// 1.1 Thử parse JSON tiêu chuẩn
		var tcItem struct {
			Name      string         `json:"name"`
			Tool      string         `json:"tool"`
			Arguments map[string]any `json:"arguments"`
			Path      string         `json:"path"`
			Content   string         `json:"content"`
			Command   string         `json:"command"`
		}
		if err := json.Unmarshal([]byte(raw), &tcItem); err == nil {
			toolName := tcItem.Name
			if toolName == "" {
				toolName = tcItem.Tool
			}
			args := tcItem.Arguments
			if args == nil {
				args = make(map[string]any)
			}
			if tcItem.Path != "" {
				args["path"] = tcItem.Path
			}
			if tcItem.Content != "" {
				args["content"] = tcItem.Content
			}
			if tcItem.Command != "" {
				args["command"] = tcItem.Command
			}
			if toolName != "" {
				tcs = append(tcs, ToolCall{
					ID:        fmt.Sprintf("call_tag_%d_%d", time.Now().UnixMilli(), i),
					Name:      toolName,
					Arguments: args,
				})
			}
			continue
		}

		// 1.2 Thử parse dạng thẻ XML/Arg: run<arg_key>cmd</arg_key><arg_value>...</arg_value>
		if strings.Contains(raw, "<arg_key>") {
			firstArgKey := strings.Index(raw, "<arg_key>")
			toolName := ""
			if firstArgKey > 0 {
				toolName = strings.TrimSpace(raw[:firstArgKey])
				toolName = strings.TrimPrefix(toolName, "<tool_name>")
				toolName = strings.TrimSuffix(toolName, "</tool_name>")
				toolName = strings.TrimPrefix(toolName, "<function>")
				toolName = strings.TrimSuffix(toolName, "</function>")
				toolName = strings.TrimSpace(toolName)
			}
			args := make(map[string]any)
			reArg := regexp.MustCompile(`(?s)<arg_key>(.*?)</arg_key>\s*<arg_value>(.*?)</arg_value>`)
			argMatches := reArg.FindAllStringSubmatch(raw, -1)
			for _, am := range argMatches {
				k := strings.TrimSpace(am[1])
				v := strings.TrimSpace(am[2])
				if (toolName == "run" || toolName == "run_command" || toolName == "bash" || toolName == "cmd") && (k == "cmd" || k == "sh" || k == "exec") {
					k = "command"
				}
				if k == "file" || k == "filename" || k == "filepath" {
					k = "path"
				}
				if k == "text" || k == "code" {
					k = "content"
				}
				args[k] = v
			}
			switch toolName {
			case "run", "bash", "cmd", "sh", "exec", "terminal":
				toolName = "run_command"
			case "read", "cat", "view":
				toolName = "read_file"
			case "write", "save", "create":
				toolName = "write_file"
			case "edit", "patch", "modify":
				toolName = "edit_file"
			case "list", "ls", "dir":
				toolName = "list_dir"
			}
			if toolName == "" {
				if _, ok := args["command"]; ok {
					toolName = "run_command"
				} else if _, ok := args["path"]; ok {
					toolName = "read_file"
				}
			}
			if toolName != "" {
				tcs = append(tcs, ToolCall{
					ID:        fmt.Sprintf("call_xml_%d_%d", time.Now().UnixMilli(), i),
					Name:      toolName,
					Arguments: args,
				})
				continue
			}
		}

		// 1.3 Thử trích xuất đối tượng JSON lồng bên trong <tool_call>
		// Làm sạch cú pháp JSON bị lỗi phổ biến của các model (như Claude Sonnet, DeepSeek)
		rawClean := raw
		// Sửa lỗi "arguments": "key": ... -> "arguments": {"key": ...
		reFixArgs := regexp.MustCompile(`"arguments"\s*:\s*"([a-zA-Z0-9_]+)"\s*:`)
		rawClean = reFixArgs.ReplaceAllString(rawClean, `"arguments": {"$1":`)
		// Xóa các ký tự xuống dòng bị lọt vào giữa chuỗi đường dẫn tệp
		reBreakInStr := regexp.MustCompile(`"([^"\r\n]*)\r?\n([^"\r\n]*)"`)
		for reBreakInStr.MatchString(rawClean) {
			rawClean = reBreakInStr.ReplaceAllString(rawClean, `"$1$2"`)
		}

		reJSONInside := regexp.MustCompile(`(?s)\{.*"(?:name|tool)"\s*:.*`)
		if jm := reJSONInside.FindString(rawClean); jm != "" {
			var tcInner struct {
				Name      string         `json:"name"`
				Tool      string         `json:"tool"`
				Arguments map[string]any `json:"arguments"`
				Path      string         `json:"path"`
				Content   string         `json:"content"`
				Command   string         `json:"command"`
			}
			cleanJSON := strings.TrimSpace(jm)
			cleanJSON = strings.TrimSuffix(cleanJSON, "</tool_call>")
			cleanJSON = strings.TrimSpace(cleanJSON)
			parsedOk := false
			if err := json.Unmarshal([]byte(cleanJSON), &tcInner); err == nil && (tcInner.Name != "" || tcInner.Tool != "") {
				parsedOk = true
			} else {
				// Thử sửa ngoặc nếu bị dư "}}" hoặc thiếu "}"
				if strings.HasSuffix(cleanJSON, "}}") && !strings.Contains(cleanJSON, `": {`) {
					cleanJSON = strings.TrimSuffix(cleanJSON, "}")
				} else if strings.Count(cleanJSON, "{") > strings.Count(cleanJSON, "}") {
					cleanJSON = cleanJSON + strings.Repeat("}", strings.Count(cleanJSON, "{")-strings.Count(cleanJSON, "}"))
				}
				if err := json.Unmarshal([]byte(cleanJSON), &tcInner); err == nil && (tcInner.Name != "" || tcInner.Tool != "") {
					parsedOk = true
				}
			}

			if parsedOk {
				toolName := tcInner.Name
				if toolName == "" {
					toolName = tcInner.Tool
				}
				args := tcInner.Arguments
				if args == nil {
					args = make(map[string]any)
				}
				if tcInner.Path != "" {
					args["path"] = tcInner.Path
				}
				if tcInner.Content != "" {
					args["content"] = tcInner.Content
				}
				if tcInner.Command != "" {
					args["command"] = tcInner.Command
				}
				if toolName != "" {
					tcs = append(tcs, ToolCall{
						ID:        fmt.Sprintf("call_inner_json_%d_%d", time.Now().UnixMilli(), i),
						Name:      toolName,
						Arguments: args,
					})
					continue
				}
			}

			// 1.4 Fallback trích xuất regex siêu cấp cho trường hợp JSON hoàn toàn hỏng cấu trúc
			reTool := regexp.MustCompile(`"(?:name|tool)"\s*:\s*"([^"]+)"`)
			if tm := reTool.FindStringSubmatch(raw); len(tm) > 1 {
				toolName := tm[1]
				args := make(map[string]any)
				reP := regexp.MustCompile(`"path"\s*:\s*"([^"]+)"`)
				flatRaw := strings.ReplaceAll(strings.ReplaceAll(raw, "\r", ""), "\n", "")
				if pm := reP.FindStringSubmatch(flatRaw); len(pm) > 1 {
					args["path"] = strings.TrimSpace(pm[1])
				}
				reCmd := regexp.MustCompile(`"command"\s*:\s*"([^"]+)"`)
				if cm := reCmd.FindStringSubmatch(raw); len(cm) > 1 {
					args["command"] = strings.TrimSpace(cm[1])
				}
				reSL := regexp.MustCompile(`"(?:start_line|startLine)"\s*:\s*(\d+)`)
				if slm := reSL.FindStringSubmatch(raw); len(slm) > 1 {
					if sl, err := strconv.Atoi(slm[1]); err == nil {
						args["start_line"] = sl
					}
				}
				reEL := regexp.MustCompile(`"(?:end_line|endLine)"\s*:\s*(\d+)`)
				if elm := reEL.FindStringSubmatch(raw); len(elm) > 1 {
					if el, err := strconv.Atoi(elm[1]); err == nil {
						args["end_line"] = el
					}
				}
				if len(args) > 0 && toolName != "" {
					tcs = append(tcs, ToolCall{
						ID:        fmt.Sprintf("call_regex_fallback_%d_%d", time.Now().UnixMilli(), i),
						Name:      toolName,
						Arguments: args,
					})
					continue
				}
			}
		}
	}
	if len(tcs) > 0 {
		return tcs
	}

	// 2. Quét block markdown JSON chứa {"name": ...} hoặc {"tool": ...}
	reCode := regexp.MustCompile("(?s)```(?:json)?\\s*\\{.*?(?:\"name\"|\"tool\").*?\\}\\s*```")
	codeMatches := reCode.FindAllString(text, -1)
	for i, cm := range codeMatches {
		clean := strings.TrimPrefix(cm, "```json")
		clean = strings.TrimPrefix(clean, "```")
		clean = strings.TrimSuffix(clean, "```")
		clean = strings.TrimSpace(clean)

		var tcItem struct {
			Name      string         `json:"name"`
			Tool      string         `json:"tool"`
			Arguments map[string]any `json:"arguments"`
			Path      string         `json:"path"`
			Content   string         `json:"content"`
			Command   string         `json:"command"`
		}
		if err := json.Unmarshal([]byte(clean), &tcItem); err == nil {
			toolName := tcItem.Name
			if toolName == "" {
				toolName = tcItem.Tool
			}
			args := tcItem.Arguments
			if args == nil {
				args = make(map[string]any)
			}
			if tcItem.Path != "" {
				args["path"] = tcItem.Path
			}
			if tcItem.Content != "" {
				args["content"] = tcItem.Content
			}
			if tcItem.Command != "" {
				args["command"] = tcItem.Command
			}
			if toolName != "" {
				tcs = append(tcs, ToolCall{
					ID:        fmt.Sprintf("call_json_%d_%d", time.Now().UnixMilli(), i),
					Name:      toolName,
					Arguments: args,
				})
			}
		}
	}
	if len(tcs) > 0 {
		return tcs
	}

	// 2.2. Quét JSON trần không bọc code block: {"name": "...", "arguments": {...}}
	reBareJSON := regexp.MustCompile(`(?s)\{\s*"(?:name|tool)"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|parameters)"\s*:\s*(\{.*?\})\s*\}`)
	bareMatches := reBareJSON.FindAllStringSubmatch(text, -1)
	for i, bm := range bareMatches {
		toolName := bm[1]
		var args map[string]any
		if err := json.Unmarshal([]byte(bm[2]), &args); err == nil && toolName != "" {
			tcs = append(tcs, ToolCall{
				ID:        fmt.Sprintf("call_bare_%d_%d", time.Now().UnixMilli(), i),
				Name:      toolName,
				Arguments: args,
			})
		}
	}
	if len(tcs) > 0 {
		return tcs
	}

	// 2.3. Quét khối lệnh bash/sh/powershell/cmd (ví dụ: ```bash\n npm install ...\n```) khi có ý định thực thi
	reBash := regexp.MustCompile("(?s)```(?:bash|sh|powershell|cmd|shell)\\r?\\n(.*?)\\r?\\n```")
	bashMatches := reBash.FindAllStringSubmatch(text, -1)
	isActionIntent := regexp.MustCompile(`(?i)\b(làm đi|thực hiện|cài đặt|chạy|build|buil|install|run|setup|sync|tạo apk|init|áp dụng|bắt đầu)\b`).MatchString(userGoal)
	if isActionIntent && len(bashMatches) > 0 {
		for i, bm := range bashMatches {
			rawCmd := strings.TrimSpace(bm[1])
			lines := strings.Split(rawCmd, "\n")
			for j, line := range lines {
				line = strings.TrimSpace(line)
				if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
					continue
				}
				line = strings.TrimPrefix(line, "$ ")
				line = strings.TrimPrefix(line, "> ")
				if strings.HasPrefix(line, "npm ") || strings.HasPrefix(line, "npx ") ||
					strings.HasPrefix(line, "node ") || strings.HasPrefix(line, "python ") ||
					strings.HasPrefix(line, "pip ") || strings.HasPrefix(line, "go ") ||
					strings.HasPrefix(line, "cargo ") || strings.HasPrefix(line, "git ") ||
					strings.HasPrefix(line, "gradlew ") || strings.HasPrefix(line, "./gradlew ") {
					tcs = append(tcs, ToolCall{
						ID:   fmt.Sprintf("call_cmd_%d_%d_%d", time.Now().UnixMilli(), i, j),
						Name: "run_command",
						Arguments: map[string]any{
							"command": line,
						},
					})
				}
			}
		}
		if len(tcs) > 0 {
			logger.Log("INFO", "Tool-Infer", fmt.Sprintf("Tự động trích xuất %d lệnh thực thi run_command từ code block", len(tcs)))
			return tcs
		}
	}

	// 2.4. Quét trực tiếp câu lệnh từ userGoal nếu người dùng bảo chạy lệnh cụ thể
	reDirectCmd := regexp.MustCompile("(?i)(?:chạy|run|exec|thực thi|gõ lệnh|lệnh)\\s*[:\\s]+[`\"]?((?:npm|npx|node|python|pip|go|cargo|git|gradlew)\\s+[^`\"\\n\\r]+)[`\"]?")
	if cm := reDirectCmd.FindStringSubmatch(userGoal); len(cm) > 1 {
		cmdStr := strings.TrimSpace(cm[1])
		tcs = append(tcs, ToolCall{
			ID:   fmt.Sprintf("call_direct_cmd_%d", time.Now().UnixMilli()),
			Name: "run_command",
			Arguments: map[string]any{
				"command": cmdStr,
			},
		})
		logger.Log("INFO", "Tool-Infer", fmt.Sprintf("Tự động trích xuất lệnh trực tiếp từ người dùng: '%s'", cmdStr))
		return tcs
	}

	quoteChars := `'"` + "`"

	// 2.5. Quét cú pháp gọi hàm dạng text: read_file("..."), list_dir("..."), run_command("...")
	// Bắt buộc đối số phải nằm trong dấu nháy kép, nháy đơn hoặc backtick để tránh bắt nhầm chú thích dạng text như list_dir (unavailable)
	reFunc := regexp.MustCompile("(?i)\\b(read_file|list_dir|run_command|write_file|grep_search)\\s*\\(\\s*(?:path\\s*=\\s*|cmd\\s*=\\s*|command\\s*=\\s*)?[\"'`]+([^\"'`\\)\\r\\n]+)[\"'`]+\\s*\\)")
	funcMatches := reFunc.FindAllStringSubmatch(text, -1)
	for i, fm := range funcMatches {
		fName := strings.ToLower(fm[1])
		argVal := strings.TrimSpace(fm[2])
		lowerArg := strings.ToLower(argVal)
		if lowerArg == "unavailable" || lowerArg == "none" || lowerArg == "null" || lowerArg == "undefined" || lowerArg == "" {
			continue
		}
		args := make(map[string]any)
		if fName == "run_command" {
			args["command"] = argVal
		} else if fName == "grep_search" {
			args["query"] = argVal
		} else {
			args["path"] = argVal
		}
		tcs = append(tcs, ToolCall{
			ID:        fmt.Sprintf("call_func_%d_%d", time.Now().UnixMilli(), i),
			Name:      fName,
			Arguments: args,
		})
	}
	if len(tcs) > 0 {
		return tcs
	}

	// Hỗ trợ gọi list_dir() không tham số
	reListEmpty := regexp.MustCompile(`(?i)\blist_dir\s*\(\s*\)`)
	if reListEmpty.MatchString(text) {
		tcs = append(tcs, ToolCall{
			ID:        fmt.Sprintf("call_func_%d_dir", time.Now().UnixMilli()),
			Name:      "list_dir",
			Arguments: map[string]any{"path": "."},
		})
		return tcs
	}

	// 3. Fallback: Phát hiện yêu cầu tạo project ReactJS (chỉ khi có ý định tạo, không kích hoạt khi người dùng hỏi "ở đâu", "ko thấy")
	combinedLower := strings.ToLower(userGoal + " " + text)
	isQuestion := strings.Contains(combinedLower, "ở đâu") || strings.Contains(combinedLower, "đâu vậy") ||
		strings.Contains(combinedLower, "ko thấy") || strings.Contains(combinedLower, "không thấy") ||
		strings.Contains(combinedLower, "tại sao") || strings.Contains(combinedLower, "where") ||
		strings.Contains(combinedLower, "sao lại")

	if !isQuestion && strings.Contains(combinedLower, "react") {
		reReact := regexp.MustCompile(`(?i)(?:tạo|khởi tạo|init|create|setup|build)\s+(?:cho\s+(?:tôi|em|anh)\s+)?(?:một\s+)?(?:dự án|project|ứng dụng|app)?\s*react`)
		if reReact.MatchString(userGoal) {
			return createReactProjectTools()
		}
	}

	// 3.5. Fallback: Phát hiện ý định đọc/xem file (read_file) từ userGoal hoặc text phản hồi
	isReadIntent := regexp.MustCompile(`(?i)\b(đọc|xem|kiểm tra|read|view|cat|open|mở|nội dung|là gì|thế nào|chức năng|giải thích|phân tích|nói về|tìm hiểu|about|explain|what is)\b`).MatchString(userGoal) ||
		strings.Contains(userGoal, "@") ||
		strings.Contains(strings.ToLower(text), "read_file") ||
		strings.Contains(strings.ToLower(text), "cat ") ||
		strings.Contains(strings.ToLower(text), "type ") ||
		strings.Contains(strings.ToLower(text), "file in question")
	isCreateIntent := regexp.MustCompile(`(?i)\b(tạo|khởi tạo|ghi|viết|create|write|make|setup|init)\b`).MatchString(userGoal)

	if isReadIntent && !isCreateIntent {
		readTarget := ""
		// Ưu tiên 1: Lấy từ tag @tên_file trong userGoal (ví dụ: @hello.py)
		reAt := regexp.MustCompile(`@([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)`)
		if m := reAt.FindStringSubmatch(userGoal); len(m) > 1 {
			readTarget = m[1]
		}
		// Ưu tiên 2: Cú pháp đọc/xem file trong userGoal
		if readTarget == "" {
			reReadUser := regexp.MustCompile(`(?i)(?:đọc|xem|kiểm tra|read|view|cat|open|mở|nội dung|giải thích|phân tích|về)\s+(?:cho\s+(?:tôi|em|anh|ad)\s+)?(?:giúp\s+)?(?:của\s+)?(?:tệp|file|code)?\s*[` + quoteChars + `@]?([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)[` + quoteChars + `]?`)
			if m := reReadUser.FindStringSubmatch(userGoal); len(m) > 1 {
				readTarget = strings.Trim(m[1], quoteChars+"@")
			}
		}
		// Ưu tiên 3: File in question / Target file / cat / Relevant Files trong text phản hồi
		if readTarget == "" {
			reTargetFile := regexp.MustCompile(`(?i)(?:Target\s+file|File\s+in\s+question|Retry\s+['"` + quoteChars + `]?read_file['"` + quoteChars + `]?\s+tool\s+call\s+for|File:)\s*[` + quoteChars + `@]?([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)[` + quoteChars + `]?`)
			if m := reTargetFile.FindStringSubmatch(text); len(m) > 1 {
				readTarget = strings.Trim(m[1], quoteChars+"@")
			} else {
				reCat := regexp.MustCompile(`(?i)(?:cat|type)\s+[` + quoteChars + `]?([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)[` + quoteChars + `]?`)
				if m := reCat.FindStringSubmatch(text); len(m) > 1 {
					readTarget = strings.Trim(m[1], quoteChars)
				} else {
					reRelFile := regexp.MustCompile(`(?i)(?:Relevant\s+Files?|Tệp\s+liên\s+quan)[\s\S]*?-\s*[` + quoteChars + `]?([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)[` + quoteChars + `]?`)
					if m := reRelFile.FindStringSubmatch(text); len(m) > 1 {
						readTarget = strings.Trim(m[1], quoteChars)
					}
				}
			}
		}

		if readTarget != "" {
			tcs = append(tcs, ToolCall{
				ID:   fmt.Sprintf("call_read_%d", time.Now().UnixMilli()),
				Name: "read_file",
				Arguments: map[string]any{
					"path": readTarget,
				},
			})
			logger.Log("INFO", "Tool-Infer", fmt.Sprintf("Tự động trích xuất lệnh đọc file '%s'", readTarget))
			return tcs
		}
	}

	// 3.6. Fallback: Phát hiện ý định liệt kê danh sách file (list_dir) khi người dùng yêu cầu xem cây thư mục
	if regexp.MustCompile(`(?i)\b(danh sách file|liệt kê file|thư mục có gì|xem thư mục|list file|ls\b|dir\b)\b`).MatchString(userGoal) {
		tcs = append(tcs, ToolCall{
			ID:   fmt.Sprintf("call_list_%d", time.Now().UnixMilli()),
			Name: "list_dir",
			Arguments: map[string]any{
				"path": ".",
			},
		})
		logger.Log("INFO", "Tool-Infer", "Tự động trích xuất lệnh khám phá thư mục 'list_dir'")
		return tcs
	}

	// 4. Fallback: Phát hiện ý định tạo/ghi/sửa tệp tin (từ cả userGoal và text)
	if !isQuestion {
		reFileAction := regexp.MustCompile(`(?i)(?:tạo|ghi|viết|sửa|chỉnh|chỉnh\s+sửa|cập\s+nhật|đổi|thay|create|write|make|edit|modify|fix|update|patch)\s+(?:cho\s+(?:tôi|em|anh|ad)\s+)?(?:giúp\s+)?(?:một\s+)?(?:a\s+)?(?:tệp|file|code)?\s*[` + quoteChars + `]?([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)[` + quoteChars + `]?`)
		// Regex rộng hơn: tìm tên file bất kỳ sau động từ tạo (kể cả "tạo cho tôi file mmm.py")
		reFileAnywhere := regexp.MustCompile(`(?i)(?:tạo|ghi|viết|sửa|đổi|create|write|make)\b.{0,40}?\b([a-zA-Z0-9_\-]+\.[a-zA-Z]{1,6})\b`)
		targetFile := ""
		if m := reFileAction.FindStringSubmatch(userGoal); len(m) > 1 {
			targetFile = strings.Trim(m[1], quoteChars+"@")
		} else if m := reFileAnywhere.FindStringSubmatch(userGoal); len(m) > 1 {
			targetFile = strings.Trim(m[1], quoteChars+"@")
		} else if m := reFileAction.FindStringSubmatch(text); len(m) > 1 {
			targetFile = strings.Trim(m[1], quoteChars+"@")
		}

		// Nếu không tìm thấy tên file trực tiếp nhưng người dùng bảo "code trên", "đổi thành", "sửa..." và có lastActiveFile
		if targetFile == "" && len(userGoals) > 1 && userGoals[1] != "" {
			combinedGoal := strings.ToLower(userGoal)
			isTestOrCheck := strings.Contains(combinedGoal, "test") || strings.Contains(combinedGoal, "chạy") || strings.Contains(combinedGoal, "kiểm tra") || strings.Contains(combinedGoal, "xem")
			if !isTestOrCheck && (strings.Contains(combinedGoal, "code trên") || strings.Contains(combinedGoal, "file trên") ||
				strings.Contains(combinedGoal, "đổi thành") || strings.Contains(combinedGoal, "sửa") ||
				strings.Contains(combinedGoal, "thay đổi") || strings.Contains(combinedGoal, "cập nhật") ||
				strings.Contains(combinedGoal, "chuyển thành") || strings.Contains(combinedGoal, "viết tiếp") || strings.Contains(combinedGoal, "chỉnh")) {
				targetFile = userGoals[1]
			}
		}

		// Nếu người dùng yêu cầu tạo file nhưng không nêu tên file có đuôi mở rộng (ví dụ "tạo cho tôi file lấy thời gian của máy tôi đi")
		if targetFile == "" {
			lowerGoal := strings.ToLower(userGoal)
			isCreatePrompt := regexp.MustCompile(`(?i)\b(tạo|ghi|viết|create|write|make)\b.{0,30}?\b(file|tệp|code)\b`).MatchString(userGoal)
			if isCreatePrompt {
				if strings.Contains(lowerGoal, "thời gian") || strings.Contains(lowerGoal, "time") || strings.Contains(lowerGoal, "ngày giờ") || strings.Contains(lowerGoal, "máy tính") || strings.Contains(lowerGoal, "máy tôi") {
					targetFile = "get_time.py"
				} else if strings.Contains(lowerGoal, "hello") || strings.Contains(lowerGoal, "chào") {
					targetFile = "hello.py"
				} else {
					targetFile = "main.py"
				}
			}
		}

		if targetFile != "" {
			// Kiểm tra khối SEARCH/REPLACE kiểu Cline trước
			if strings.Contains(text, "<<<<<<< SEARCH") && strings.Contains(text, ">>>>>>> REPLACE") {
				diffRe := regexp.MustCompile(`(?s)(<<<<<<< SEARCH[\r\n]+.*?>>>>>>> REPLACE)`)
				diffMatch := diffRe.FindString(text)
				if diffMatch != "" {
					tcs = append(tcs, ToolCall{
						ID:   fmt.Sprintf("call_edit_%d", time.Now().UnixMilli()),
						Name: "edit_file",
						Arguments: map[string]any{
							"path": targetFile,
							"diff": diffMatch,
						},
					})
					logger.Log("INFO", "Tool-Infer", fmt.Sprintf("Tự động trích xuất khối diff sửa file '%s'", targetFile))
					return tcs
				}
			}

			// Tìm khối code block trong text
			reBlock := regexp.MustCompile("(?s)```[a-zA-Z0-9_-]*\\r?\\n(.*?)\\r?\\n```")
			blockMatch := reBlock.FindStringSubmatch(text)
			var fileContent string
			if len(blockMatch) > 1 && strings.TrimSpace(blockMatch[1]) != "" {
				fileContent = blockMatch[1]
			} else {
				// Kiểm tra nếu text có lệnh echo ... > targetFile
				reEcho := regexp.MustCompile(`(?i)echo\s+(.*?)\s*>\s*` + regexp.QuoteMeta(targetFile))
				if echoM := reEcho.FindStringSubmatch(text); len(echoM) > 1 {
					cleanCode := strings.TrimSpace(echoM[1])
					cleanCode = strings.Trim(cleanCode, `"'`)
					fileContent = cleanCode + "\n"
				}
			}

			if fileContent == "" {
				lowerGoal := strings.ToLower(userGoal)
				if strings.Contains(lowerGoal, "thời gian") || strings.Contains(lowerGoal, "time") || strings.Contains(lowerGoal, "ngày giờ") || strings.Contains(lowerGoal, "máy tính") || strings.Contains(lowerGoal, "máy tôi") {
					ext := strings.ToLower(filepath.Ext(targetFile))
					switch ext {
					case ".py":
						fileContent = "from datetime import datetime\n\nprint(\"Thời gian hiện tại:\", datetime.now().strftime(\"%Y-%m-%d %H:%M:%S\"))\n"
					case ".js", ".ts":
						fileContent = "console.log(\"Thời gian hiện tại:\", new Date().toLocaleString());\n"
					case ".go":
						fileContent = "package main\n\nimport (\n\t\"fmt\"\n\t\"time\"\n)\n\nfunc main() {\n\tfmt.Println(\"Thời gian hiện tại:\", time.Now().Format(\"2006-01-02 15:04:05\"))\n}\n"
					default:
						fileContent = fmt.Sprintf("# Updated %s\nprint(\"Current Time\")\n", targetFile)
					}
				} else {
					rePrint := regexp.MustCompile(`(?i)\b(?:in ra|print|hiển thị|output|xuất ra|log)\s+["']?([^"'\n\.]{1,80})["']?`)
					if pm := rePrint.FindStringSubmatch(userGoal); len(pm) > 1 {
						hint := strings.TrimSpace(pm[1])
						ext2 := strings.ToLower(filepath.Ext(targetFile))
						switch ext2 {
						case ".py":
							fileContent = fmt.Sprintf("print(\"%s\")\n", hint)
						case ".js", ".ts":
							fileContent = fmt.Sprintf("console.log(\"%s\");\n", hint)
						default:
							fileContent = hint + "\n"
						}
					}
				}
			}
			if fileContent == "" {
				isCreatePrompt := regexp.MustCompile(`(?i)\b(tạo|ghi|viết|create|write|make)\b.{0,30}?\b(file|tệp|code)\b`).MatchString(userGoal)
				if !isCreatePrompt {
					// Tuyệt đối không tự bịa write_file ("Hello, World!") ghi đè file có sẵn khi model không xuất code!
					return tcs
				}
				ext2 := strings.ToLower(filepath.Ext(targetFile))
				switch ext2 {
				case ".py":
					fileContent = "print(\"Hello, World!\")\n"
				case ".go":
					fileContent = "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"Hello, World!\")\n}\n"
				case ".js", ".ts":
					fileContent = "console.log(\"Hello, World!\");\n"
				case ".html":
					fileContent = "<!DOCTYPE html>\n<html>\n<head>\n  <title>App</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n</body>\n</html>\n"
				case ".css":
					fileContent = "body {\n  margin: 0;\n  padding: 1rem;\n}\n"
				case ".json":
					fileContent = "{\n  \"message\": \"Hello, World!\"\n}\n"
				default:
					fileContent = fmt.Sprintf("// %s\n", targetFile)
				}
			}

			toolName := "write_file"
			toolArgs := map[string]any{
				"path":    targetFile,
				"content": fileContent,
			}

			tcs = append(tcs, ToolCall{
				ID:        fmt.Sprintf("call_inferred_%d", time.Now().UnixMilli()),
				Name:      toolName,
				Arguments: toolArgs,
			})
			logger.Log("INFO", "Tool-Infer", fmt.Sprintf("Tự động trích xuất lệnh %s cho file '%s' từ yêu cầu người dùng", toolName, targetFile))
			return tcs
		}
	}

	return tcs
}
