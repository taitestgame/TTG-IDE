package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	FinishReason string
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
		if idx := strings.Index(content, "<tool_call"); idx >= 0 {
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
			var required []string
			for k, v := range params {
				desc := fmt.Sprintf("%v", v)
				props[k] = map[string]any{
					"type":        "string",
					"description": desc,
				}
				lowerDesc := strings.ToLower(desc)
				if !strings.Contains(lowerDesc, "optional") {
					required = append(required, k)
				}
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

	// 2. Chuyển đổi và chuẩn hóa từng tin nhắn (áp dụng Claude Code Tool Output Pruning)
	var preNormalized []map[string]any
	for msgIdx, msg := range nonSystem {
		r, _ := msg["role"].(string)

		if r == "tool" {
			toolContent, _ := msg["content"].(string)
			callID, _ := msg["tool_call_id"].(string)

			// CLAUDE CODE & ANTIGRAVITY PATTERN:
			// Thu gọn kết quả công cụ cũ (hơn 4 tin nhắn trước) và dài > 500 ký tự
			// để bảo vệ ngân sách max_tokens cho câu trả lời của AI
			if msgIdx < len(nonSystem)-4 && len(toolContent) > 500 {
				cutLen := len(toolContent) - 300
				toolContent = toolContent[:200] + fmt.Sprintf("\n... [Đã thu gọn %d ký tự kết quả công cụ cũ theo chuẩn Claude Code/Antigravity] ...\n", cutLen) + toolContent[len(toolContent)-100:]
			}

			if !useNativeTools {
				preNormalized = append(preNormalized, map[string]any{
					"role":    "user",
					"content": fmt.Sprintf("[TOOL RESULT]:\n%s", toolContent),
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
						tcMap := map[string]any{
							"id":   tc.ID,
							"type": "function",
							"function": map[string]any{
								"name":      tc.Name,
								"arguments": string(b),
							},
						}
						if tc.ExtraContent != nil {
							tcMap["extra_content"] = tc.ExtraContent
						}
						openAIToolCalls = append(openAIToolCalls, tcMap)
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
				} else if prevContent, ok := prevMsg["content"].(string); ok && strings.Contains(prevContent, "<tool_call>") {
					prevHasTools = true
				}
			}
			if (prevRole == "assistant" && prevHasTools) || prevRole == "tool" {
				finalSeq = append(finalSeq, msg)
			} else {
				c, _ := msg["content"].(string)
				finalSeq = append(finalSeq, map[string]any{
					"role":    "user",
					"content": fmt.Sprintf("[Tool Result]:\n%s", c),
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

	// 4. Hợp nhất các tin nhắn liên tiếp cùng role="user"
	// để bảo đảm 100% không bao giờ vi phạm quy tắc xoay tua (turn alternation) của Gemini / Claude API
	var alternatingSeq []map[string]any
	for _, msg := range finalSeq {
		r, _ := msg["role"].(string)
		if len(alternatingSeq) > 0 && r == "user" {
			prev := alternatingSeq[len(alternatingSeq)-1]
			prevR, _ := prev["role"].(string)
			if prevR == "user" {
				prevContent, _ := prev["content"].(string)
				currContent, _ := msg["content"].(string)
				prev["content"] = strings.TrimSpace(prevContent + "\n\n" + currContent)
				continue
			}
		}
		alternatingSeq = append(alternatingSeq, msg)
	}

	result = append(result, alternatingSeq...)
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
	reqURL := endpoint
	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewBuffer(jsonData))
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

	var transport http.RoundTripper = http.DefaultTransport
	if !isLocal {
		// Tự động kết nối qua Sing-box WARP Proxy (:2080) cho Google Gemini / Anthropic để chống chặn vùng
		if proxyURL, pErr := url.Parse("http://127.0.0.1:2080"); pErr == nil {
			transport = &http.Transport{
				Proxy: http.ProxyURL(proxyURL),
			}
		}
	}
	client := &http.Client{
		Timeout:   reqTimeout,
		Transport: transport,
	}
	startTime := time.Now()
	logger.Log("INFO", "AI-Req", fmt.Sprintf("Bắt đầu gọi AI model='%s' tại %s (timeout: %v)", h.config.Model, reqURL, reqTimeout))

	resp, err := client.Do(req)

	// Nếu gửi kèm tools bị lỗi 400 Bad Request từ model không hỗ trợ tool schema, tự động thử lại không kèm tools
	if resp != nil && resp.StatusCode == 400 && len(tools) > 0 && !isLocal {
		resp.Body.Close()
		delete(reqBody, "tools")
		noToolsData, _ := json.Marshal(reqBody)
		retryReq, rErr := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewBuffer(noToolsData))
		if rErr == nil {
			retryReq.Header.Set("Content-Type", "application/json")
			if apiKey != "" {
				retryReq.Header.Set("Authorization", "Bearer "+apiKey)
			}
			resp, err = client.Do(retryReq)
		}
	}

	var origStatusCode int
	var origBodyStr string

	// Xử lý thông minh khi gặp HTTP 429 (Rate Limit / Quota Exceeded)
	if resp != nil && resp.StatusCode == 429 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		resp = nil
		bodyStr := string(b)
		logger.Log("WARN", "AI-RateLimit", fmt.Sprintf("Gặp lỗi 429 Rate Limit từ %s: %s", reqURL, bodyStr))

		// Trích xuất số giây retry nếu Gemini báo
		waitSec := 3.0
		reRetry := regexp.MustCompile(`(?i)retry\s+in\s+([0-9\.]+)s`)
		if m := reRetry.FindStringSubmatch(bodyStr); len(m) > 1 {
			if s, err := strconv.ParseFloat(m[1], 64); err == nil && s > 0 {
				waitSec = s
			}
		}

		// Nếu thời gian chờ hợp lý (<= 65s, điển hình trên Free Tier 15 req/phút của Gemini)
		if waitSec <= 65.0 {
			h.emit("status", "system", fmt.Sprintf("⏳ Gemini đạt hạn ngạch miễn phí (15 req/phút). Tự động đếm ngược chờ %.0fs để tiếp tục chu trình...", waitSec))
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(waitSec*1000+1000) * time.Millisecond):
			}
			retryReq, rErr := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewBuffer(jsonData))
			if rErr == nil {
				retryReq.Header.Set("Content-Type", "application/json")
				if apiKey != "" {
					retryReq.Header.Set("Authorization", "Bearer "+apiKey)
				}
				resp, err = client.Do(retryReq)
			}
		}

		// Nếu sau khi thử lại vẫn 429:
		if resp == nil || resp.StatusCode == 429 {
			if resp != nil {
				b2, _ := io.ReadAll(resp.Body)
				resp.Body.Close()
				resp = nil
				if len(b2) > 0 {
					bodyStr = string(b2)
				}
			}

			// Nếu đang trong chu trình ReAct cần thực thi công cụ (tools > 0),
			// không được chuyển sang bridge không hỗ trợ tool schema vì sẽ làm hỏng phiên
			if len(tools) > 0 {
				return &ParsedModelOutput{
					ContentText: fmt.Sprintf("⚠️ Mô hình %s đạt giới hạn tần suất yêu cầu (Rate Limit 429) của gói miễn phí. Vui lòng đợi khoảng 1 phút rồi tiếp tục gửi yêu cầu để thực hiện tiếp các bước còn lại.", h.config.Model),
				}, nil
			}

			// Chỉ thử Fallback cho câu trả lời văn bản thông thường (không có tools)
			bridgeURL := "http://127.0.0.1:5050/v1/chat/completions"
			fbCandidates := []string{"nemotron-3.5-lightning-free", "minimax-m3.1-flash-free"}
			var fbResp *http.Response
			for _, fbModel := range fbCandidates {
				h.emit("status", "system", fmt.Sprintf("Gemini đạt giới hạn tần suất, tạm thời chuyển dự phòng sang %s để tổng hợp câu trả lời...", fbModel))
				logger.Log("WARN", "AI-Fallback", fmt.Sprintf("Gemini 429, thử chuyển dự phòng sang %s qua Bridge", fbModel))
				fbBody := make(map[string]any)
				for k, v := range reqBody {
					fbBody[k] = v
				}
				fbBody["model"] = fbModel
				fbData, _ := json.Marshal(fbBody)
				fbReq, fbReqErr := http.NewRequestWithContext(ctx, "POST", bridgeURL, bytes.NewBuffer(fbData))
				if fbReqErr == nil {
					fbReq.Header.Set("Content-Type", "application/json")
					fbClient := &http.Client{Timeout: 45 * time.Second}
					res, resErr := fbClient.Do(fbReq)
					if resErr == nil && res != nil && res.StatusCode < 400 {
						fbResp = res
						break
					} else if res != nil {
						res.Body.Close()
					}
				}
			}

			if fbResp != nil {
				resp = fbResp
				err = nil
				origStatusCode = 0
				origBodyStr = ""
			} else {
				return nil, fmt.Errorf("Mô hình AI (%s) tạm thời đạt giới hạn tần suất Free Tier (Cần chờ thêm %.0f giây). Vui lòng thử lại sau giây lát hoặc chọn mô hình khác.", h.config.Model, waitSec)
			}
		}
	}

	// Tự động chuyển đổi dự phòng (Auto-Fallback) sang model tốc độ cao nếu model chính bị lỗi kết nối
	if resp != nil && resp.StatusCode >= 400 {
		origStatusCode = resp.StatusCode
		b, _ := io.ReadAll(resp.Body)
		origBodyStr = string(b)
		resp.Body.Close()
		resp = nil
	}

	if err != nil || resp == nil {
		if err != nil {
			logger.Log("ERROR", "AI-Req", fmt.Sprintf("Lỗi kết nối AI: %v", err))
		}
		if origStatusCode > 0 {
			return nil, fmt.Errorf("máy chủ AI tại %s trả về lỗi HTTP %d: %s", reqURL, origStatusCode, origBodyStr)
		}
		if isLocal && strings.Contains(reqURL, ":5050") {
			return nil, fmt.Errorf("không thể kết nối OpenCode Bridge tại %s: %w. Đang kiểm tra kết nối :5050", reqURL, err)
		}
		if err != nil {
			return nil, fmt.Errorf("lỗi kết nối máy chủ AI tại %s: %w", reqURL, err)
		}
		return nil, fmt.Errorf("máy chủ AI tại %s không trả về dữ liệu", reqURL)
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

	var toolCalls []ToolCall
	var finishReason string

	if resp.StatusCode < 400 && isSSE {
		accumulator := NewStreamAccumulator(activeSessID, func(evtType, sessID string, payload any) {
			if h != nil {
				h.emit(evtType, sessID, payload)
			}
		})

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
						Delta        map[string]any `json:"delta"`
						FinishReason string         `json:"finish_reason"`
					} `json:"choices"`
				}
				if json.Unmarshal([]byte(rawJSON), &chunk) == nil && len(chunk.Choices) > 0 {
					if chunk.Choices[0].FinishReason != "" {
						accumulator.IngestFinishReason(chunk.Choices[0].FinishReason)
					}
					accumulator.IngestDelta(chunk.Choices[0].Delta)
				}
			}
		}

		cleanText, thinking, toolCalls, msgMap = accumulator.Finalize()
		finishReason = accumulator.GetFinishReason()
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
				Message      map[string]any `json:"message"`
				FinishReason string         `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal(bodyBytes, &aiResp); err != nil {
			return nil, fmt.Errorf("lỗi giải mã JSON từ Model (%s): %w", string(bodyBytes), err)
		}

		if len(aiResp.Choices) == 0 {
			return nil, fmt.Errorf("không nhận được phản hồi từ AI: %s", string(bodyBytes))
		}

		finishReason = aiResp.Choices[0].FinishReason
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

	if len(toolCalls) == 0 {
		if rawTC, ok := msgMap["tool_calls"].([]any); ok {
			for _, tcItem := range rawTC {
				tcBytes, _ := json.Marshal(tcItem)
				var tc struct {
					ID           string `json:"id"`
					ExtraContent any    `json:"extra_content,omitempty"`
					Function     struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
				}
				if err := json.Unmarshal(tcBytes, &tc); err == nil {
					var args map[string]any
					_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
					toolCallObj := ToolCall{
						ID:           tc.ID,
						Name:         tc.Function.Name,
						Arguments:    args,
						ExtraContent: tc.ExtraContent,
					}
					EnrichToolCallMetadata(&toolCallObj)
					toolCalls = append(toolCalls, toolCallObj)
				}
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
	for i := range toolCalls {
		EnrichToolCallMetadata(&toolCalls[i])
	}

	// Làm sạch mọi thẻ <tool_call>...</tool_call> và <｜DSML｜ calls> khỏi ContentText để không bao giờ in text thô ra màn hình chat
	reToolCall := regexp.MustCompile(`(?s)<tool_call>.*?(?:</tool_call>|$)`)
	cleanText = strings.TrimSpace(reToolCall.ReplaceAllString(cleanText, ""))
	reDanglingToolCall := regexp.MustCompile(`(?i)</?tool(?:_call)?>`)
	cleanText = strings.TrimSpace(reDanglingToolCall.ReplaceAllString(cleanText, ""))

	if strings.Contains(cleanText, "DSML") {
		reDSML := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+calls>.*?</[｜|]DSML[｜|]\s+calls>`)
		cleanText = strings.TrimSpace(reDSML.ReplaceAllString(cleanText, ""))
		reDSMLInvoke := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+invoke.*?</[｜|]DSML[｜|]\s+invoke>`)
		cleanText = strings.TrimSpace(reDSMLInvoke.ReplaceAllString(cleanText, ""))
		reDanglingDSML := regexp.MustCompile(`(?i)</?[｜|]DSML[｜|][^>]*>`)
		cleanText = strings.TrimSpace(reDanglingDSML.ReplaceAllString(cleanText, ""))
	}

	if len(toolCalls) > 0 {
		if msgMap == nil {
			msgMap = make(map[string]any)
		}
		msgMap["role"] = "assistant"
		if msgMap["content"] == nil {
			msgMap["content"] = cleanText
		}
		if msgMap["tool_calls"] == nil {
			var openAIToolCalls []map[string]any
			for _, tc := range toolCalls {
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
			msgMap["tool_calls"] = openAIToolCalls
		}
	}

	return &ParsedModelOutput{
		ThinkingText: thinking,
		ContentText:  cleanText,
		ToolCalls:    toolCalls,
		RawMessage:   msgMap,
		FinishReason: finishReason,
	}, nil
}

// repairTruncatedJSON cố gắng đóng các chuỗi ngoặc hoặc nháy kép bị đứt quãng do streaming max_tokens
func repairTruncatedJSON(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}

	inString := false
	var escaped bool
	openBraces := 0
	openBrackets := 0

	for i := 0; i < len(s); i++ {
		ch := s[i]
		if escaped {
			escaped = false
			continue
		}
		if ch == '\\' {
			escaped = true
			continue
		}
		if ch == '"' {
			inString = !inString
			continue
		}
		if !inString {
			if ch == '{' {
				openBraces++
			} else if ch == '}' && openBraces > 0 {
				openBraces--
			} else if ch == '[' {
				openBrackets++
			} else if ch == ']' && openBrackets > 0 {
				openBrackets--
			}
		}
	}

	var sb strings.Builder
	sb.WriteString(s)
	if inString {
		sb.WriteString("\"")
	}
	for openBrackets > 0 {
		sb.WriteString("]")
		openBrackets--
	}
	for openBraces > 0 {
		sb.WriteString("}")
		openBraces--
	}
	return sb.String()
}

// extractTextToolCalls trích xuất tool calls từ định dạng tag <tool_call>, block JSON, hoặc lệnh gọi hàm rõ ràng
func extractTextToolCalls(text string, _ ...string) []ToolCall {
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

	// 1. Quét cú pháp thẻ <tool_call>...</tool_call> (kể cả khi dở dang không có thẻ đóng)
	reTag := regexp.MustCompile(`(?s)<tool_call>(.*?)(?:</tool_call>|$)`)
	matches := reTag.FindAllStringSubmatch(text, -1)
	for i, m := range matches {
		raw := strings.TrimSpace(m[1])
		if raw == "" {
			continue
		}
		// 1.1 Thử parse JSON tiêu chuẩn hoặc tự sửa JSON đứt quãng
		var tcItem struct {
			Name      string         `json:"name"`
			Tool      string         `json:"tool"`
			Arguments map[string]any `json:"arguments"`
			Path      string         `json:"path"`
			Content   string         `json:"content"`
			Command   string         `json:"command"`
		}
		parsedOk := false
		if err := json.Unmarshal([]byte(raw), &tcItem); err == nil && (tcItem.Name != "" || tcItem.Tool != "") {
			parsedOk = true
		} else {
			repaired := repairTruncatedJSON(raw)
			if err := json.Unmarshal([]byte(repaired), &tcItem); err == nil && (tcItem.Name != "" || tcItem.Tool != "") {
				parsedOk = true
			}
		}
		if parsedOk {
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

	// 2.5. Quét cú pháp gọi hàm dạng text: read_file("..."), list_dir("..."), run_command("...")
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

	return tcs
}

