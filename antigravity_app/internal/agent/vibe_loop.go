package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"ttgide/internal/logger"
)

// RunVibeLoop thực thi chu trình Propose-Probe-Compose (Harness² & ReAct toàn diện):
// Thu thập ngữ cảnh -> Lập kế hoạch -> Checkpoint ban đầu -> Vòng lặp ReAct -> Kiểm thử -> Tự sửa lỗi (Self-Healing) -> Hoàn tất / Rollback
func (h *Harness) RunVibeLoop(ctx context.Context, sessionID, userGoal, verifyCmd string, targetFiles []string) (*Plan, error) {
	loopCtx, cancel := context.WithCancel(ctx)
	h.cancelMu.Lock()
	if h.sessionCancels == nil {
		h.sessionCancels = make(map[string]context.CancelFunc)
	}
	h.sessionCancels[sessionID] = cancel
	h.cancelMu.Unlock()

	h.activeSessMu.Lock()
	h.activeSessionID = sessionID
	h.activeSessMu.Unlock()

	defer func() {
		h.cancelMu.Lock()
		delete(h.sessionCancels, sessionID)
		h.cancelMu.Unlock()

		h.activeSessMu.Lock()
		if h.activeSessionID == sessionID {
			h.activeSessionID = ""
		}
		h.activeSessMu.Unlock()

		cancel()
	}()

	// Kiểm tra nếu yêu cầu chỉ gồm các ký tự đặc biệt vô nghĩa
	cleanGoal := strings.TrimSpace(userGoal)
	reAlphaNum := regexp.MustCompile(`[a-zA-Z0-9\p{L}]`)
	if !reAlphaNum.MatchString(cleanGoal) {
		msg := "Tôi chưa nhận rõ yêu cầu cụ thể của bạn. Bạn muốn tôi làm gì với dự án này (ví dụ: giải thích mã nguồn, lập kế hoạch, kiểm tra lỗi, hay viết tính năng mới)?"
		h.emit("answer", sessionID, map[string]any{
			"text":      msg,
			"thinking":  "",
			"toolCalls": []ToolCall{},
		})
		h.emit("status", sessionID, StatusSuccess)
		return &Plan{
			ID:        fmt.Sprintf("plan_%d", time.Now().UnixMilli()),
			Goal:      userGoal,
			Answer:    msg,
			CreatedAt: time.Now(),
		}, nil
	}

	h.emit("status", sessionID, StatusPlanning)
	logger.Log("INFO", "Agent", fmt.Sprintf("Bắt đầu xử lý: session=%s, goal='%s', targetFiles=%v", sessionID, userGoal, targetFiles))

	// Khởi tạo Transcript Logger ghi log vết kiểm toán
	tl, _ := NewTranscriptLogger(h.config.SessionDir, sessionID)
	if tl != nil {
		defer tl.Close()
		tl.Log("session_start", map[string]any{"goal": userGoal, "verifyCmd": verifyCmd, "targetFiles": targetFiles})
	}



	// Đảm bảo targetFiles được lưu lại cho phiên
	if len(targetFiles) > 0 {
		h.historyMu.Lock()
		if h.sessionLastFiles == nil {
			h.sessionLastFiles = make(map[string][]string)
		}
		for _, tf := range targetFiles {
			if tf != "" {
				exists := false
				for _, ef := range h.sessionLastFiles[sessionID] {
					if ef == tf {
						exists = true
						break
					}
				}
				if !exists {
					h.sessionLastFiles[sessionID] = append(h.sessionLastFiles[sessionID], tf)
				}
			}
		}
		h.historyMu.Unlock()
	}

	// 1. Thu thập ngữ cảnh dự án (Assemble Context)
	contextData := ""
	if h.contextEngine != nil {
		wsRoot := h.contextEngine.GetWorkspaceRoot()
		// Tự động thu thập các file được gắn thẻ @file
		reMention := regexp.MustCompile(`@([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+)`)
		for _, m := range reMention.FindAllStringSubmatch(userGoal, -1) {
			if len(m) > 1 {
				cleanName := m[1]
				alreadyIn := false
				for _, tf := range targetFiles {
					if tf == cleanName {
						alreadyIn = true
						break
					}
				}
				if !alreadyIn {
					targetFiles = append(targetFiles, cleanName)
				}
			}
		}

		targetFile := ""
		targetCode := ""
		if len(targetFiles) > 0 {
			targetFile = targetFiles[0]
			var codeBlocks []string
			totalBytes := 0
			for _, f := range targetFiles {
				if f == "" || totalBytes > 12000 {
					continue
				}
				fPath := f
				if !filepath.IsAbs(fPath) && wsRoot != "" {
					fPath = filepath.Join(wsRoot, fPath)
				}
				if fi, err := os.Stat(fPath); err == nil && fi.IsDir() {
					continue
				}
				if data, err := os.ReadFile(fPath); err == nil {
					content := string(data)
					if len(content) > 4000 {
						content = content[:4000] + "\n...[cắt bớt nội dung dài]..."
					}
					totalBytes += len(content)
					codeBlocks = append(codeBlocks, fmt.Sprintf("[Nội dung tệp: %s]\n```\n%s\n```", f, content))
				}
			}
			targetCode = strings.Join(codeBlocks, "\n\n")
		}
		contextData = h.contextEngine.AssembleContext(userGoal, targetFile, targetCode)
	}

	// Tự động đọc nội dung nếu có URL web
	reURL := regexp.MustCompile(`https?://[^\s<>"]+`)
	foundURLs := reURL.FindAllString(userGoal, 2)
	for _, rawU := range foundURLs {
		if h.capManager != nil {
			h.emit("status", sessionID, fmt.Sprintf("🌐 Đang đọc nội dung trang web: %s...", rawU))
			webRes, wErr := h.capManager.Execute(ctx, "fetch_web_request", map[string]any{"url": rawU})
			if wErr == nil && webRes != "" {
				contextData += fmt.Sprintf("\n\n[Nội dung trang web %s]:\n```\n%s\n```", rawU, webRes)
				logger.Log("INFO", "Web", fmt.Sprintf("Đã tự động đọc %d bytes từ URL: %s", len(webRes), rawU))
			}
		}
	}

	// 2. Lập kế hoạch thực thi sơ bộ (Planner)
	plan, err := h.planner.GeneratePlan(ctx, userGoal, contextData)
	if err != nil {
		h.emit("error", sessionID, err.Error())
		return nil, fmt.Errorf("lập kế hoạch thất bại: %w", err)
	}

	if len(plan.Steps) == 0 {
		h.historyMu.Lock()
		if sessMsgs, ok := h.sessionHistories[sessionID]; ok && len(sessMsgs) > 0 {
			for i := len(sessMsgs) - 1; i >= 0; i-- {
				if r, _ := sessMsgs[i]["role"].(string); r == "assistant" {
					if content, ok := sessMsgs[i]["content"].(string); ok && content != "" {
						prevSteps := ExtractStepsFromText(content)
						if len(prevSteps) > 0 {
							plan.Steps = prevSteps
							plan.Goal = "Kế hoạch thực thi dự án"
							break
						}
					}
				}
			}
		}
		h.historyMu.Unlock()
	}
	if len(plan.Steps) > 0 {
		h.emit("plan", sessionID, plan)
	}

	// 3. Tự động tạo Checkpoint bảo vệ code trước khi chỉnh sửa
	var initialCP *Checkpoint
	if h.checkpoints != nil && len(targetFiles) > 0 {
		cp, err := h.checkpoints.CreateCheckpoint(sessionID, fmt.Sprintf("Checkpoint trước khi: %s", userGoal), targetFiles)
		if err == nil {
			initialCP = cp
			h.emit("checkpoint", sessionID, cp)
			if tl != nil {
				tl.Log("checkpoint_created", cp)
			}
		}
	}

	// 4. Chuẩn bị Tool Schemas cho AI
	toolSchemas := h.buildOpenAIToolSchemas()

	// 5. Chuẩn bị Messages History và phân tích Vision Image nếu có
	var userContent any = userGoal
	if strings.Contains(userGoal, "[IMAGE_BASE64:") {
		parts := strings.Split(userGoal, "[IMAGE_BASE64:")
		cleanText := strings.TrimSpace(parts[0])
		var contentArray []map[string]any
		if cleanText != "" {
			contentArray = append(contentArray, map[string]any{"type": "text", "text": cleanText})
		}
		for i := 1; i < len(parts); i++ {
			endIdx := strings.Index(parts[i], "]")
			if endIdx > 0 {
				imgURL := parts[i][:endIdx]
				contentArray = append(contentArray, map[string]any{
					"type":      "image_url",
					"image_url": map[string]any{"url": imgURL},
				})
				rem := strings.TrimSpace(parts[i][endIdx+1:])
				if rem != "" {
					contentArray = append(contentArray, map[string]any{"type": "text", "text": rem})
				}
			}
		}
		if len(contentArray) > 0 {
			userContent = contentArray
		}
	}

	systemPrompt := `You are TTG IDE AI, an elite autonomous software engineering assistant running on Windows (PowerShell / Command Prompt).

## ENVIRONMENT
- Operating System: Windows
- Available Shell: PowerShell / Command Prompt
- Available Capabilities: Inspecting files/directories, editing files, creating files, searching codebases, running terminal commands, delegating isolated subtasks to specialized subagents ('spawn_subagent'), and interacting with the user.

## THE ACTION-FIRST CONTRACT (MANDATORY)
1. Do NOT narrate what you are going to do.
   - Never say: "I will now inspect file X", "Let me check...", "Bây giờ tôi sẽ kiểm tra...", "Tôi sẽ tiến hành...".
   - If an action or investigation is needed, invoke the tool call directly in the same turn.
   - The best action is the one executed immediately, not announced.
2. Continuous Autonomous Execution:
   - When given a task (implement, fix, build, test, refactor, or debug), carry it through to completion without stopping prematurely after mere surveying.
   - Do not stop or ask for confirmation at intermediate steps. Work autonomously through: Inspect -> Modify -> Verify.
   - Only conclude your turn when all required actions are finished or when genuinely blocked and in need of user input.

## CORE DIRECTIVES
1. Autonomous Grounded Reality:
   - Ground all actions in reality: always view or grep files before editing them. Never guess or hallucinate file paths or code content.
   - For file modifications, use 'edit_file' (with target/replacement or diff) or 'write_file'.
   - For shell commands, use 'run_command'. Inspect command output to ensure builds or tests succeed.
   - For delegating deep code inspections or isolated subtasks, use 'spawn_subagent'.

2. Quality & Integrity:
   - Make minimal, clean, targeted changes. Do not introduce speculative complexity or unnecessary dependencies.
   - Never hallucinate file changes or claim tasks are completed without actually performing them.
   - If a command or tool returns an error, analyze the output, diagnose the root cause, and apply targeted fixes.

3. Communication & Tone:
   - Always communicate with the user in the language they used to prompt you (e.g. if the user prompts in Vietnamese, answer and explain in Vietnamese; if in English, respond in English).
   - Be clear, direct, and concise. Explain what was changed, why, and how it was verified.
   - Never emit fake survey boilerplate or empty placeholders. State exact reality.

## TOOL CALLING & COMPLETION PROTOCOL
- Prefer native function calling when supported by the model.
- If emitting fallback tags, use:
<tool_call>
{"name": "tool_name", "arguments": {...}}
</tool_call>
- Include brief 'toolAction' (2-5 word action summary, e.g. "Reading main.go") and 'toolSummary' (2-5 word noun phrase, e.g. "File Read") with tool arguments whenever possible.

## MANDATORY COMPLETION TOOL (attempt_completion)
- Once you have achieved the user's objective, created all required code/tests, and verified them, you MUST call 'attempt_completion' to conclude and present your final answer.
- NEVER conclude or stop by merely outputting conversational text or promising what you will do in the future (e.g. "Tôi sẽ viết...", "I will create...").
- If you output conversational text alone without invoking 'attempt_completion' or an action tool, the system will reject the response and force you to continue executing.
- Do NOT call 'attempt_completion' if there are unresolved compiler errors or failing commands.`

	if contextData != "" {
		systemPrompt += "\n\n" + contextData
	}

	systemPrompt += "\n\n## ACTIVE EXECUTION DIRECTIVE\n" +
		"- When investigating, diagnosing, or resolving tasks, always invoke tools immediately rather than announcing them.\n" +
		"- If a command or build produces an error, inspect the relevant file and invoke 'edit_file' or 'write_file' to resolve it directly."


	h.historyMu.Lock()
	if h.sessionHistories == nil {
		h.sessionHistories = make(map[string][]map[string]any)
	}
	var initMsgs []map[string]any
	if existing, ok := h.sessionHistories[sessionID]; ok && len(existing) > 0 {
		initMsgs = make([]map[string]any, 0, len(existing)+2)
		initMsgs = append(initMsgs, map[string]any{"role": "system", "content": systemPrompt})
		for _, m := range existing {
			if r, _ := m["role"].(string); r != "system" {
				initMsgs = append(initMsgs, m)
			}
		}
		initMsgs = append(initMsgs, map[string]any{
			"role":    "user",
			"content": userContent,
		})
	} else {
		initMsgs = []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userContent},
		}
	}
	history := &ContextHistory{messages: initMsgs}
	h.historyMu.Unlock()

	history.Compact(h.config.TokenLimit, h.config.CompactionThreshold)

	repairCount := 0
	var executedToolCalls []ToolCall
	var finalAnswer string
	var latestAssistantText string
	var finalThinking string
	var thinkingHistory []string
	executedKeys := make(map[string]bool)
	hasCallError := false
	consecutiveEmptyTurns := 0
	consecutiveNoToolTurns := 0
	isTaskCompleted := false

	h.emit("status", sessionID, StatusExecuting)

	// 6. VÒNG LẶP REACT CHÍNH (ReAct Execution Loop)
	for turn := 1; turn <= h.config.MaxTurns; turn++ {
		select {
		case <-ctx.Done():
			h.emit("status", sessionID, StatusFailed)
			return plan, ctx.Err()
		default:
		}

		if tl != nil {
			tl.Log("react_turn_start", map[string]any{"turn": turn, "repairCount": repairCount})
		}

		// Gọi AI Model
		callStartTime := time.Now()
		parsedOutput, callErr := h.callModelOrFallback(ctx, history.messages, toolSchemas)
		callDurationSec := int(time.Since(callStartTime).Seconds())
		if callDurationSec < 1 {
			callDurationSec = 1
		}
		if callErr != nil {
			errStr := fmt.Sprintf("Lỗi gọi Model AI: %v", callErr)
			h.emit("error", sessionID, errStr)
			finalAnswer = errStr
			hasCallError = true
			break
		}

		// Phát hiện và stream suy nghĩ (<think>...)
		if parsedOutput.ThinkingText != "" {
			cleanTh := strings.TrimSpace(parsedOutput.ThinkingText)
			if cleanTh != "" {
				thinkingHistory = append(thinkingHistory, cleanTh)
				finalThinking = strings.Join(thinkingHistory, "\n\n---\n\n")
				h.emit("thought", sessionID, map[string]any{
					"text":    cleanTh,
					"seconds": callDurationSec,
				})
				if tl != nil {
					tl.Log("thinking", cleanTh)
				}
			}
		}

		// Cập nhật kế hoạch động nếu AI xuất các bước
		if len(plan.Steps) == 0 {
			liveSteps := ExtractStepsFromText(parsedOutput.ContentText)
			if len(liveSteps) == 0 {
				liveSteps = ExtractStepsFromText(parsedOutput.ThinkingText)
			}
			if len(liveSteps) > 0 {
				plan.Steps = liveSteps
				plan.CurrentStep = 0
				plan.Steps[0].Status = StatusExecuting
				h.emit("plan", sessionID, plan)
			}
		} else {
			if plan.CurrentStep < len(plan.Steps) && plan.Steps[plan.CurrentStep].Status == StatusIdle {
				plan.Steps[plan.CurrentStep].Status = StatusExecuting
				h.emit("plan", sessionID, plan)
			}
		}

		if strings.TrimSpace(parsedOutput.ContentText) != "" {
			latestAssistantText = parsedOutput.ContentText
		}

		// Kiểm tra chỉ dẫn tức thời từ người dùng
		h.steerMu.Lock()
		if steers, hasSteers := h.sessionSteers[sessionID]; hasSteers && len(steers) > 0 {
			for _, st := range steers {
				history.Add(map[string]any{
					"role":    "user",
					"content": fmt.Sprintf("[Chỉ dẫn bổ sung tức thời từ người dùng]: %s", st),
				})
			}
			delete(h.sessionSteers, sessionID)
		}
		h.steerMu.Unlock()

		// AI không gọi thêm tool nào -> Kết thúc ReAct loop tự nhiên
		if len(parsedOutput.ToolCalls) == 0 {
			h.steerMu.Lock()
			steers, hasSteers := h.sessionSteers[sessionID]
			if hasSteers && len(steers) > 0 {
				for _, st := range steers {
					history.Add(map[string]any{
						"role":    "user",
						"content": fmt.Sprintf("[Chỉ dẫn bổ sung tức thời từ người dùng]: %s", st),
					})
				}
				delete(h.sessionSteers, sessionID)
				h.steerMu.Unlock()
				continue
			}
			h.steerMu.Unlock()

			// CLAUDE CODE & ANTIGRAVITY PATTERN: Tự động tiếp nối khi chạm trần tokens (finish_reason == "length")
			if parsedOutput.FinishReason == "length" && turn < h.config.MaxTurns {
				logger.Log("INFO", "ReAct", "[Auto-Continuation] Mô hình chạm giới hạn tokens (finish_reason=length). Tự động tiếp nối mạch trả lời...")
				h.emit("status", sessionID, "⚡ [Auto-Continuation] Tự động tiếp nối mạch mã nguồn...")
				history.Add(map[string]any{
					"role":    "assistant",
					"content": parsedOutput.ContentText,
				})
				history.Add(map[string]any{
					"role":    "user",
					"content": "Continue seamlessly from where you were cut off. Conclude and invoke the required tools (write_file/edit_file) now.",
				})
				continue
			}
			// 1. TOOL-ENFORCED COMPLETION PROTOCOL (Chuẩn Cline / Roo Code / Devin):
			// Nếu tác vụ đang trong quá trình thực thi các công cụ (đã gọi ít nhất 1 tool trước đó),
			// mô hình KHÔNG ĐƯỢC PHÉP dừng lại bằng việc xuất text thuần túy mà không gọi 'attempt_completion'.
			if len(executedToolCalls) > 0 && consecutiveNoToolTurns < 1 && turn < h.config.MaxTurns {
				consecutiveNoToolTurns++
				nudge := "Tool Protocol: A coding/execution task is in progress. You must NOT conclude by outputting conversational text alone.\n" +
					"- If you have fully completed and verified the task, you MUST call 'attempt_completion' with your final summary in the 'result' argument.\n" +
					"- If the task is not yet finished, you MUST invoke the appropriate tool (edit_file, write_file, run_command) now to continue."
				logger.Log("WARN", "ReAct", fmt.Sprintf("[Tool-Enforced Completion] Đang trong chuỗi tool nhưng AI xuất text thường. Ép gọi attempt_completion hoặc tool kế tiếp (lượt %d).", consecutiveNoToolTurns))
				h.emit("status", sessionID, "⚡ [Kiểm duyệt hoàn tất] Yêu cầu AI gọi attempt_completion hoặc tiếp tục thực thi...")
				if strings.TrimSpace(parsedOutput.ContentText) != "" {
					history.Add(map[string]any{
						"role":    "assistant",
						"content": parsedOutput.ContentText,
					})
				}
				history.Add(map[string]any{
					"role":    "user",
					"content": nudge,
				})
				continue
			}

			// 2. ANTI-PROMISE GUARD CHO LƯỢT ĐẦU:
			// Nếu AI chưa gọi tool nào nhưng xuất câu hứa hẹn tương lai ("Bây giờ tôi sẽ...", "Tôi sẽ tiến hành..."):
			if containsUnfulfilledPromise(parsedOutput.ContentText) && consecutiveNoToolTurns < 1 && turn < h.config.MaxTurns {
				consecutiveNoToolTurns++
				nudgePrompt := "Action-First Contract Violation: You stated that you will proceed with actions ('" + extractPromiseSnippet(parsedOutput.ContentText) + "'), but no tool was invoked in this turn. You must NOT narrate future plans. Please invoke the required tool call (edit_file, write_file, run_command, etc.) directly now."
				logger.Log("WARN", "ReAct", fmt.Sprintf("[Anti-Promise Guard] AI phát ngôn hứa hẹn nhưng không gọi tool (lượt %d). Nhắc AI gọi tool ngay.", consecutiveNoToolTurns))
				h.emit("status", sessionID, "⚡ [Action-First] Đang yêu cầu AI gọi công cụ thực thi trực tiếp...")
				if strings.TrimSpace(parsedOutput.ContentText) != "" {
					history.Add(map[string]any{
						"role":    "assistant",
						"content": parsedOutput.ContentText,
					})
				}
				history.Add(map[string]any{
					"role":    "user",
					"content": nudgePrompt,
				})
				continue
			}

			// 3. Nếu công cụ ngay trước đó vừa bị lỗi (IsError) mà AI chỉ trả về text giải thích đơn thuần mà không sửa:
			lastToolFailed := len(executedToolCalls) > 0 && executedToolCalls[len(executedToolCalls)-1].IsError
			if lastToolFailed && consecutiveNoToolTurns < 1 && turn < h.config.MaxTurns {
				consecutiveNoToolTurns++
				lastErr := executedToolCalls[len(executedToolCalls)-1].Result
				if len(lastErr) > 200 {
					lastErr = lastErr[:200] + "..."
				}
				prompt := fmt.Sprintf("The previous tool execution returned an error: %s. If you intend to fix this, please call the relevant tool (edit_file, write_file, or run_command) now.", lastErr)
				logger.Log("WARN", "ReAct", "[Tool Error Nudge] Lệnh trước bị lỗi, nhắc AI gọi tool sửa lỗi.")
				h.emit("status", sessionID, "⚡ [Tự sửa lỗi] Đang yêu cầu AI gọi công cụ khắc phục lỗi...")
				if strings.TrimSpace(parsedOutput.ContentText) != "" {
					history.Add(map[string]any{
						"role":    "assistant",
						"content": parsedOutput.ContentText,
					})
				}
				history.Add(map[string]any{
					"role":    "user",
					"content": prompt,
				})
				continue
			}





			// Nếu AI chưa xuất ContentText và không gọi tool
			if strings.TrimSpace(parsedOutput.ContentText) == "" && turn < h.config.MaxTurns {
				consecutiveEmptyTurns++
				if consecutiveEmptyTurns <= 1 {
					logger.Log("INFO", "ReAct", fmt.Sprintf("Model chưa xuất ContentText hoặc Tool (lần %d). Nhắc AI hoàn tất câu trả lời.", consecutiveEmptyTurns))
					history.Add(map[string]any{
						"role":    "user",
						"content": fmt.Sprintf("Please provide your comprehensive response or explanation for the request: '%s'.", userGoal),
					})
					continue
				}
				// Không gán nhầm ThinkingText thành câu trả lời của người dùng
			}

			if finalAnswer == "" {
				finalAnswer = parsedOutput.ContentText
			}
			break
		}

		consecutiveEmptyTurns = 0

		// Kiểm tra trùng lặp tool calls
		allDuplicate := true
		for _, tc := range parsedOutput.ToolCalls {
			argBytes, _ := json.Marshal(tc.Arguments)
			tcKey := fmt.Sprintf("%s:%s", tc.Name, string(argBytes))
			if !executedKeys[tcKey] {
				allDuplicate = false
				break
			}
		}
		if allDuplicate && len(parsedOutput.ToolCalls) > 0 {
			logger.Log("INFO", "ReAct", "Các công cụ đã được thực thi đầy đủ ở lượt trước. Kết thúc chu trình.")
			if strings.TrimSpace(parsedOutput.ContentText) != "" {
				finalAnswer = parsedOutput.ContentText
			} else if latestAssistantText != "" {
				finalAnswer = latestAssistantText
			}
			break
		}

		// Đảm bảo mọi tool_call đều có ID trước khi lưu vào context history
		for i := range parsedOutput.ToolCalls {
			if parsedOutput.ToolCalls[i].ID == "" {
				parsedOutput.ToolCalls[i].ID = fmt.Sprintf("call_%d_%d", time.Now().UnixMilli(), i)
			}
		}

		// Thêm tin nhắn của AI vào Context History
		if parsedOutput.RawMessage != nil {
			history.Add(parsedOutput.RawMessage)
		} else {
			history.Add(map[string]any{
				"role":       "assistant",
				"content":    parsedOutput.ContentText,
				"tool_calls": parsedOutput.ToolCalls,
			})
		}

		// Thực thi từng Tool Call
		for _, tc := range parsedOutput.ToolCalls {
			EnrichToolCallMetadata(&tc)
			toolName := tc.Name
			args := tc.Arguments

			cleanToolName := toolName
			if idx := strings.LastIndex(toolName, ":"); idx != -1 {
				cleanToolName = toolName[idx+1:]
			}
			isCompletionTool := cleanToolName == "attempt_completion" || cleanToolName == "finish_task" || cleanToolName == "complete_task" || cleanToolName == "task_completed"
			if isCompletionTool {
				// Chấp nhận hoàn tất nhiệm vụ

				h.emit("tool_start", sessionID, tc)
				toolStartTime := time.Now()
				toolOutput, execErr := h.executor.ExecuteTool(ctx, toolName, args)
				tc.DurationMs = int(time.Since(toolStartTime).Milliseconds())
				if execErr != nil {
					toolOutput = fmt.Sprintf("Lỗi thực thi công cụ '%s': %v", toolName, execErr)
				}
				tc.Result = toolOutput
				tc.IsError = execErr != nil
				h.emit("tool_end", sessionID, tc)
				executedToolCalls = append(executedToolCalls, tc)

				resText := extractResultArg(args)
				if strings.TrimSpace(resText) != "" {
					finalAnswer = resText
				} else if strings.TrimSpace(parsedOutput.ContentText) != "" {
					finalAnswer = parsedOutput.ContentText
				} else {
					finalAnswer = toolOutput
				}
				isTaskCompleted = true
				h.emit("status", sessionID, "✓ Nhiệm vụ đã hoàn tất và được xác thực qua bộ lọc thành công.")
				logger.Log("INFO", "ReAct", "Nhiệm vụ đã hoàn tất thành công qua attempt_completion.")
				history.Add(map[string]any{
					"role":         "tool",
					"tool_call_id": tc.ID,
					"content":      toolOutput,
				})
				break
			}

			// Chế độ "plan": Chặn tool sửa code dự án, cho phép tạo tài liệu plan
			if h.GetPermissionMode() == "plan" && (toolName == "write_file" || toolName == "write_to_file" || toolName == "edit_file" || toolName == "replace_file_content" || toolName == "delete_file" || toolName == "run_command") {
				targetPath := extractPathArg(args)
				isPlanDoc := (toolName == "write_file" || toolName == "write_to_file") && (strings.HasSuffix(strings.ToLower(targetPath), ".md") || strings.Contains(strings.ToLower(targetPath), "plan"))

				if !isPlanDoc {
					reason := "Chế độ 'Lập plan không code' đang bật: Đã ghi nhận kế hoạch, bỏ qua thực thi sửa code thực tế. Để bắt đầu sửa code, hãy chuyển sang chế độ Tự động (Full)."
					tc.Result = reason
					h.emit("tool_end", sessionID, tc)
					history.Add(map[string]any{
						"role":         "tool",
						"tool_call_id": tc.ID,
						"content":      reason,
					})
					continue
				}
			}

			h.emit("tool_start", sessionID, tc)
			if tl != nil {
				tl.Log("tool_start", tc)
			}

			// Kiểm tra Cổng An Toàn (Safety Gate)
			reqAuth := false
			if h.capManager != nil {
				for _, def := range h.capManager.GetDefinitions() {
					if def.Name == toolName && def.RequiresAuth {
						reqAuth = true
						break
					}
				}
			}

			allowed, reason := h.safety.Check(toolName, args, reqAuth)
			if !allowed {
				h.emit("error", sessionID, reason)
				history.Add(map[string]any{
					"role":         "tool",
					"tool_call_id": tc.ID,
					"content":      reason,
				})
				continue
			}

			// Tự động tạo checkpoint trước khi sửa đổi file
			if h.checkpoints != nil && (toolName == "write_file" || toolName == "write_to_file" || toolName == "edit_file" || toolName == "replace_file_content" || toolName == "delete_file") {
				if filePath := extractPathArg(args); filePath != "" {
					h.checkpoints.CreateCheckpoint(sessionID, "Auto-checkpoint: "+toolName, []string{filePath})
				}
			}

			// Thực thi công cụ qua Executor
			toolStartTime := time.Now()
			toolOutput, execErr := h.executor.ExecuteTool(ctx, toolName, args)
			tc.DurationMs = int(time.Since(toolStartTime).Milliseconds())
			if execErr != nil {
				toolOutput = fmt.Sprintf("Lỗi thực thi công cụ '%s': %v", toolName, execErr)
			}

			tc.Result = toolOutput
			tc.IsError = execErr != nil
			h.emit("tool_end", sessionID, tc)
			executedToolCalls = append(executedToolCalls, tc)
			logger.Log("INFO", "Tool", fmt.Sprintf("Hoàn thành công cụ: %s (kết quả %d bytes, lỗi=%v)", toolName, len(toolOutput), execErr != nil))

			// Nếu thao tác sửa đổi file thực tế, reset executedKeys để AI được phép chạy kiểm thử xác minh hoặc đọc lại file
			if !tc.IsError && isMutatingToolName(toolName) {
				executedKeys = make(map[string]bool)
			} else if !tc.IsError {
				argBytes, _ := json.Marshal(args)
				tcKey := fmt.Sprintf("%s:%s", toolName, string(argBytes))
				executedKeys[tcKey] = true
			}

			// Ghi nhớ tệp vừa thao tác
			if p := extractPathArg(args); p != "" {
				h.historyMu.Lock()
				if h.sessionLastFiles == nil {
					h.sessionLastFiles = make(map[string][]string)
				}
				found := false
				for _, ef := range h.sessionLastFiles[sessionID] {
					if ef == p {
						found = true
						break
					}
				}
				if !found {
					h.sessionLastFiles[sessionID] = append([]string{p}, h.sessionLastFiles[sessionID]...)
					if len(h.sessionLastFiles[sessionID]) > 10 {
						h.sessionLastFiles[sessionID] = h.sessionLastFiles[sessionID][:10]
					}
				}
				h.historyMu.Unlock()
			}

			if tl != nil {
				tl.Log("tool_end", map[string]any{"id": tc.ID, "output": toolOutput, "error": execErr != nil})
			}

			history.Add(map[string]any{
				"role":         "tool",
				"tool_call_id": tc.ID,
				"content":      toolOutput,
			})
		}

		// Cập nhật tiến độ kế hoạch
		if len(plan.Steps) > 0 && len(parsedOutput.ToolCalls) > 0 {
			stepIdx := plan.CurrentStep
			if stepIdx < len(plan.Steps) {
				plan.Steps[stepIdx].Status = StatusSuccess
				if stepIdx+1 < len(plan.Steps) {
					plan.CurrentStep = stepIdx + 1
					plan.Steps[stepIdx+1].Status = StatusExecuting
				}
			}
			h.emit("plan", sessionID, plan)
		}

		if isTaskCompleted {
			break
		}

		consecutiveNoToolTurns = 0
		history.Compact(h.config.TokenLimit, h.config.CompactionThreshold)
	}

	// 7. KIỂM THỬ & TỰ ĐỘNG SỬA LỖI (Verification & Self-Healing Loop)
	if verifyCmd != "" {
		h.emit("status", sessionID, StatusVerifying)
		res := h.verifier.Verify(ctx, verifyCmd)

		for !res.Passed && repairCount < h.config.MaxRepairs {
			repairCount++
			h.emit("status", sessionID, StatusRepairing)
			h.emit("verification_failed", sessionID, res)

			if tl != nil {
				tl.Log("self_healing_attempt", map[string]any{"attempt": repairCount, "error": res.Error})
			}

			repairPrompt := fmt.Sprintf("Verification failed with command: %s\nError output:\n%s\nPlease analyze the error, inspect relevant files, and apply necessary fixes to pass verification.", verifyCmd, res.Error)
			history.Add(map[string]any{
				"role":    "user",
				"content": repairPrompt,
			})

			repairStartTime := time.Now()
			parsedRepair, rErr := h.callModelOrFallback(ctx, history.messages, toolSchemas)
			repairDurationSec := int(time.Since(repairStartTime).Seconds())
			if repairDurationSec < 1 {
				repairDurationSec = 1
			}
			if rErr == nil {
				if parsedRepair.ThinkingText != "" {
					cleanTh := strings.TrimSpace(parsedRepair.ThinkingText)
					if cleanTh != "" {
						thinkingHistory = append(thinkingHistory, cleanTh)
						finalThinking = strings.Join(thinkingHistory, "\n\n---\n\n")
						h.emit("thought", sessionID, map[string]any{
							"text":    cleanTh,
							"seconds": repairDurationSec,
						})
					}
				}
				if len(parsedRepair.ToolCalls) > 0 {
					for _, tc := range parsedRepair.ToolCalls {
						EnrichToolCallMetadata(&tc)
						h.emit("tool_start", sessionID, tc)
						tStartTime := time.Now()
						out, execErr := h.executor.ExecuteTool(ctx, tc.Name, tc.Arguments)
						tc.DurationMs = int(time.Since(tStartTime).Milliseconds())
						tc.Result = out
						tc.IsError = execErr != nil
						h.emit("tool_end", sessionID, tc)
						executedToolCalls = append(executedToolCalls, tc)
						history.Add(map[string]any{
							"role":         "tool",
							"tool_call_id": tc.ID,
							"content":      out,
						})
					}
				}
			}

			res = h.verifier.Verify(ctx, verifyCmd)
		}

		if !res.Passed {
			h.emit("status", sessionID, StatusRolledBack)
			if initialCP != nil && h.checkpoints != nil {
				_ = h.checkpoints.Rollback(initialCP.ID)
				h.emit("status", sessionID, "⚠️ Quá số lần sửa chữa cho phép. Đã tự động Rollback về trạng thái an toàn ban đầu.")
			}
			return plan, fmt.Errorf("kiểm thử không đạt sau %d lần sửa chữa: %s", repairCount, res.Error)
		}

		if repairCount > 0 {
			autoLesson := fmt.Sprintf("Vượt qua kiểm thử '%s' thành công sau %d lần tự sửa: %s", verifyCmd, repairCount, userGoal)
			h.RememberLesson(autoLesson)
			h.emit("status", sessionID, "🧠 Đã tự động ghi nhớ kinh nghiệm sửa lỗi này vào Bộ nhớ dài hạn.")
		}

		h.emit("verification_passed", sessionID, res)
	}

	// 8. TỔNG HỢP VÀ LÀM SẠCH KẾT QUẢ CUỐI CÙNG
	finalAnswer = cleanScratchpadAnswer(finalAnswer, contextData)

	// Nếu finalAnswer rỗng nhưng các lượt trước AI đã có câu trả lời phân tích thực tế:
	if strings.TrimSpace(finalAnswer) == "" && strings.TrimSpace(latestAssistantText) != "" {
		finalAnswer = cleanScratchpadAnswer(latestAssistantText, contextData)
	}

	if strings.TrimSpace(finalAnswer) == "" {
		logger.Log("INFO", "ReAct", "Kích hoạt lượt tổng hợp câu trả lời cuối cùng...")
		h.emit("status", sessionID, "AI đang hoàn thiện câu trả lời tổng hợp...")

		var synthMessages []map[string]any
		var toolSummaryParts []string

		for _, m := range history.messages {
			r, _ := m["role"].(string)
			if r == "system" {
				synthMessages = append(synthMessages, m)
			} else if r == "assistant" {
				content, _ := m["content"].(string)
				if strings.TrimSpace(content) != "" {
					synthMessages = append(synthMessages, map[string]any{
						"role":    "assistant",
						"content": content,
					})
				}
			} else if r == "tool" {
				content, _ := m["content"].(string)
				if len(content) > 800 {
					content = content[:800] + "\n...[kết quả dài đã rút gọn]..."
				}
				toolSummaryParts = append(toolSummaryParts, content)
			}
		}

		var toolContextText string
		if len(toolSummaryParts) > 0 {
			toolContextText = fmt.Sprintf("\n[Kết quả thực thi từ các công cụ/terminal]:\n%s\n", strings.Join(toolSummaryParts, "\n---\n"))
		}

		synthPrompt := fmt.Sprintf("%sBased on the conversation history and tool execution results above, provide a clear, comprehensive, and professional response to the user's request: '%s'.\n"+
			"Guidelines:\n"+
			"1. Respond directly in the language used by the user (Vietnamese if the user wrote in Vietnamese, English if in English).\n"+
			"2. Clearly explain what was analyzed, implemented, or fixed, highlighting the key changes.\n"+
			"3. If any error occurred and was resolved during execution, briefly explain what happened and how you fixed it.\n"+
			"4. Keep the explanation natural, helpful, and concise. Do NOT output raw JSON, internal tool tags, or debug logs.",
			toolContextText, userGoal)
		if len(executedToolCalls) == 0 {
			synthPrompt = fmt.Sprintf("Please provide a clear, comprehensive, and professional answer to the user's request: '%s'. Respond directly in the user's language without raw JSON or tool tags.", userGoal)
		}
		synthMessages = append(synthMessages, map[string]any{
			"role":    "user",
			"content": synthPrompt,
		})

		synthStartTime := time.Now()
		synthResp, sErr := h.callModelOrFallback(ctx, synthMessages, nil)
		synthDurationSec := int(time.Since(synthStartTime).Seconds())
		if synthDurationSec < 1 {
			synthDurationSec = 1
		}
		if sErr == nil {
			if synthResp.ThinkingText != "" {
				cleanTh := strings.TrimSpace(synthResp.ThinkingText)
				if cleanTh != "" {
					thinkingHistory = append(thinkingHistory, cleanTh)
					finalThinking = strings.Join(thinkingHistory, "\n\n---\n\n")
					h.emit("thought", sessionID, map[string]any{
						"text":    cleanTh,
						"seconds": synthDurationSec,
					})
				}
			}
			if strings.TrimSpace(synthResp.ContentText) != "" {
				finalAnswer = cleanScratchpadAnswer(synthResp.ContentText, contextData)
			}
		}
	}

	// Nếu sau khi tổng hợp vẫn rỗng (mất mạng/timeout): Báo cáo TRUNG THỰC dựa trên sự kiện thực tế, KHÔNG tự ý bịa template khảo sát
	if strings.TrimSpace(finalAnswer) == "" {
		if len(executedToolCalls) > 0 {
			var sb strings.Builder
			hasFailures := false
			for _, tc := range executedToolCalls {
				if tc.IsError {
					hasFailures = true
					break
				}
			}

			if hasFailures {
				sb.WriteString(fmt.Sprintf("⚠️ Quá trình thực hiện yêu cầu '%s' gặp lỗi ở một số câu lệnh/thao tác:\n\n", userGoal))
				for _, tc := range executedToolCalls {
					if tc.IsError {
						cmdName := tc.Arguments["command"]
						if cmdName == nil {
							cmdName = tc.Arguments["path"]
						}
						resSnippet := tc.Result
						if len(resSnippet) > 300 {
							resSnippet = resSnippet[:300] + "..."
						}
						sb.WriteString(fmt.Sprintf("- ❌ Thao tác `%s` (`%v`):\n```\n%s\n```\n", tc.Name, cmdName, resSnippet))
					}
				}
				sb.WriteString("\nVui lòng kiểm tra lại cấu hình hoặc xem chi tiết đầu ra trong bảng Terminal.")
			} else {
				sb.WriteString(fmt.Sprintf("Đã thực hiện xong các thao tác cho yêu cầu: '%s':\n\n", userGoal))
				for _, tc := range executedToolCalls {
					if tc.Name == "run_command" {
						sb.WriteString(fmt.Sprintf("- Lệnh `%v`: Hoàn thành.\n", tc.Arguments["command"]))
					} else if p := extractPathArg(tc.Arguments); p != "" {
						sb.WriteString(fmt.Sprintf("- Thao tác `%s`: `%s`\n", tc.Name, p))
					}
				}
			}
			finalAnswer = sb.String()
		} else {
			finalAnswer = "Tôi chưa thực hiện thao tác nào. Vui lòng cho biết chi tiết hơn về yêu cầu của bạn."
		}
	}

	if !hasCallError && len(history.messages) > 0 {
		lastMsg := history.messages[len(history.messages)-1]
		if role, _ := lastMsg["role"].(string); role != "assistant" {
			history.Add(map[string]any{
				"role":    "assistant",
				"content": finalAnswer,
			})
		}
	} else if hasCallError && len(history.messages) > 0 {
		lastIdx := len(history.messages) - 1
		if r, _ := history.messages[lastIdx]["role"].(string); r == "user" {
			history.messages = history.messages[:lastIdx]
		}
	}

	if loopCtx.Err() != nil {
		return plan, loopCtx.Err()
	}

	h.historyMu.Lock()
	h.sessionHistories[sessionID] = history.messages
	h.historyMu.Unlock()

	plan.Answer = finalAnswer
	plan.Thinking = finalThinking
	plan.ToolCalls = executedToolCalls

	if len(plan.Steps) == 0 {
		plan.Steps = ExtractStepsFromText(finalAnswer)
		if len(plan.Steps) > 0 {
			h.emit("plan", sessionID, plan)
		}
	} else if !hasCallError {
		for si := range plan.Steps {
			if si <= plan.CurrentStep {
				plan.Steps[si].Status = StatusSuccess
			}
		}
		h.emit("plan", sessionID, plan)
	}

	h.emit("answer", sessionID, map[string]any{
		"text":      finalAnswer,
		"thinking":  finalThinking,
		"toolCalls": executedToolCalls,
	})



	if hasCallError {
		h.emit("status", sessionID, StatusFailed)
		if tl != nil {
			tl.Log("session_failed", map[string]any{"status": StatusFailed, "error": finalAnswer})
		}
		return plan, fmt.Errorf("%s", finalAnswer)
	}

	h.emit("status", sessionID, StatusSuccess)
	if tl != nil {
		tl.Log("session_success", map[string]any{"status": StatusSuccess, "answer": finalAnswer})
	}
	return plan, nil
}



// isMutatingToolName xác định công cụ có gây biến đổi nội dung file trên đĩa hay không
func isMutatingToolName(toolName string) bool {
	switch toolName {
	case "write_file", "write_to_file", "edit_file", "replace_file_content", "multi_replace_file_content", "delete_file", "move_file":
		return true
	default:
		return false
	}
}

// containsUnfulfilledPromise phát hiện các câu hứa hẹn hành động tương lai nhưng không gọi tool
func containsUnfulfilledPromise(text string) bool {
	lower := strings.ToLower(text)
	promisePatterns := []string{
		"bây giờ tôi sẽ", "tôi sẽ tiến hành", "tôi sẽ bắt đầu",
		"hãy chờ tôi", "tôi sẽ thực hiện", "tôi sẽ tạo",
		"tôi sẽ sửa", "tôi sẽ cập nhật", "tôi sẽ cấu hình",
		"tôi sẽ kiểm tra", "tôi sẽ chạy", "để tôi tiến hành",
		"chúng ta hãy làm các bước", "bây giờ tôi sẽ làm",
		"i will now", "let me now", "i am going to",
		"i will proceed to", "now i will", "let's proceed to",
		"i will create", "i will implement", "i will fix",
	}
	for _, p := range promisePatterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

// extractPromiseSnippet trích xuất đoạn văn bản hứa hẹn để đưa vào prompt nhắc nhở
func extractPromiseSnippet(text string) string {
	lower := strings.ToLower(text)
	promisePatterns := []string{
		"bây giờ tôi sẽ", "tôi sẽ tiến hành", "tôi sẽ bắt đầu",
		"hãy chờ tôi", "tôi sẽ thực hiện", "tôi sẽ tạo",
		"tôi sẽ sửa", "tôi sẽ cập nhật", "tôi sẽ cấu hình",
		"tôi sẽ kiểm tra", "tôi sẽ chạy", "để tôi tiến hành",
		"i will now", "let me now", "i am going to",
		"i will proceed to", "now i will", "let's proceed to",
	}
	for _, p := range promisePatterns {
		if idx := strings.Index(lower, p); idx >= 0 {
			end := idx + 60
			if end > len(text) {
				end = len(text)
			}
			return strings.TrimSpace(text[idx:end])
		}
	}
	if len(text) > 60 {
		return strings.TrimSpace(text[:60])
	}
	return strings.TrimSpace(text)
}


// extractResultArg trích xuất kết quả hoàn tất nhiệm vụ từ tham số của attempt_completion
func extractResultArg(args map[string]any) string {
	if args == nil {
		return ""
	}
	for _, k := range []string{"result", "Result", "content", "answer", "summary"} {
		if v, ok := args[k].(string); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}


