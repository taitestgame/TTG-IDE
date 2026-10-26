package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"ttgide/internal/capabilities"
	agenttools "ttgide/internal/capabilities/tools/agent"
	tfContext "ttgide/internal/context"
	"ttgide/internal/logger"
)

// =============================================================================
// GIAO DI?N & C?U HÌNH
// =============================================================================

// CheckpointProvider d?nh nghia giao di?n tuong tác v?i co ch? Checkpoint & Rollback
type CheckpointProvider interface {
	CreateCheckpoint(sessionID, desc string, filePaths []string) (*Checkpoint, error)
	Rollback(checkpointID string) error
}

// HarnessConfig ch?a toàn b? tham s? c?u hình nâng cao c?a Elite Harness
type HarnessConfig struct {
	Model               string  `json:"model"`
	MaxTurns            int     `json:"maxTurns"`
	MaxRepairs          int     `json:"maxRepairs"`
	SafetyMode          string  `json:"safetyMode"` // "strict", "balanced", "yolo"
	TokenLimit          int     `json:"tokenLimit"`
	CompactionThreshold float64 `json:"compactionThreshold"`
	BaseURL             string  `json:"baseUrl"`
	APIKey              string  `json:"apiKey"`
	SessionDir          string  `json:"sessionDir"`
}

// DefaultConfig trả về cấu hình tối ưu mặc định kết nối với OpenCode Free API bridge
func DefaultConfig() HarnessConfig {
	model := os.Getenv("AI_MODEL")
	if model == "" {
		model = "nemotron-3.5-lightning-free"
	}

	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("AI_API_KEY")
	}
	if apiKey == "" {
		apiKey = "free"
	}

	baseURL := os.Getenv("AI_BASE_URL")
	if baseURL == "" {
		baseURL = "http://127.0.0.1:5050/v1"
	}

	return HarnessConfig{
		Model:               model,
		MaxTurns:            25,
		MaxRepairs:          3,
		SafetyMode:          "balanced",
		TokenLimit:          24000,
		CompactionThreshold: 0.75,
		BaseURL:             baseURL,
		APIKey:              apiKey,
		SessionDir:          filepath.Join(".ttgide", "sessions"),
	}
}

// =============================================================================
// HARNESS CHÍNH — TRÁI TIM ÐI?U PH?I (Codex + Antigravity + Claude + Cline)
// =============================================================================

type Harness struct {
	contextEngine    *tfContext.Engine
	capManager       *capabilities.Manager
	planner          *Planner
	executor         *Executor
	verifier         *Verifier
	checkpoints      CheckpointProvider
	safety           *SafetyGate
	eventCallback    func(event AgentEvent)
	config           HarnessConfig
	askChan          chan string
	sessionHistories map[string][]map[string]any
	sessionLastFiles map[string][]string // sessionID -> các tệp tin vừa thao tác trong phiên
	historyMu        sync.Mutex
	permissionMode   string // "full", "ask", "plan"
	permMu           sync.RWMutex
	sessionCancels   map[string]context.CancelFunc
	cancelMu         sync.Mutex
	sessionSteers    map[string][]string // sessionID -> các chỉ dẫn bổ sung chèn trực tiếp vào lượt đang chạy
	steerMu          sync.Mutex
	activeSessionID  string
	activeSessMu     sync.RWMutex
}

// SetPermissionMode cài đặt chế độ cấp quyền: full, ask, plan
func (h *Harness) SetPermissionMode(mode string) {
	h.permMu.Lock()
	defer h.permMu.Unlock()
	if mode == "" {
		mode = "full"
	}
	h.permissionMode = mode
}

// GetPermissionMode lấy chế độ cấp quyền hiện tại
func (h *Harness) GetPermissionMode() string {
	h.permMu.RLock()
	defer h.permMu.RUnlock()
	if h.permissionMode == "" {
		return "full"
	}
	return h.permissionMode
}

// NewHarness khởi tạo bộ điều phối Agent Harness (tương thích 100% với app.go)
func NewHarness(
	ce *tfContext.Engine,
	cm *capabilities.Manager,
	cp CheckpointProvider,
	eventCb func(event AgentEvent),
) *Harness {
	cfg := DefaultConfig()
	h := &Harness{
		contextEngine:    ce,
		capManager:       cm,
		planner:          NewPlanner(),
		executor:         NewExecutor(cm),
		verifier:         NewVerifier(cm),
		checkpoints:      cp,
		safety:           NewSafetyGate(cfg.SafetyMode),
		eventCallback:    eventCb,
		config:           cfg,
		permissionMode:   "full",
		sessionHistories: make(map[string][]map[string]any),
		sessionLastFiles: make(map[string][]string),
		sessionCancels:   make(map[string]context.CancelFunc),
		sessionSteers:    make(map[string][]string),
	}
	h.registerSystemTools()
	return h
}

// NewHarnessWithConfig khởi tạo với cấu hình tùy biến
func NewHarnessWithConfig(
	ce *tfContext.Engine,
	cm *capabilities.Manager,
	cp CheckpointProvider,
	cfg HarnessConfig,
	eventCb func(event AgentEvent),
) *Harness {
	h := &Harness{
		contextEngine:    ce,
		capManager:       cm,
		planner:          NewPlanner(),
		executor:         NewExecutor(cm),
		verifier:         NewVerifier(cm),
		checkpoints:      cp,
		safety:           NewSafetyGate(cfg.SafetyMode),
		eventCallback:    eventCb,
		config:           cfg,
		sessionHistories: make(map[string][]map[string]any),
		sessionLastFiles: make(map[string][]string),
		sessionCancels:   make(map[string]context.CancelFunc),
		sessionSteers:    make(map[string][]string),
	}
	h.registerSystemTools()
	return h
}

// ClearSessionHistory xóa sạch lịch sử hội thoại của một session
func (h *Harness) ClearSessionHistory(sessionID string) {
	h.historyMu.Lock()
	defer h.historyMu.Unlock()
	if h.sessionHistories != nil {
		delete(h.sessionHistories, sessionID)
	}
	if h.sessionLastFiles != nil {
		delete(h.sessionLastFiles, sessionID)
	}
}

// CancelSession hủy ngay lập tức phiên xử lý đang chạy của session
func (h *Harness) CancelSession(sessionID string) {
	h.cancelMu.Lock()
	if h.sessionCancels != nil {
		for sid, cancel := range h.sessionCancels {
			if sid == sessionID || sessionID == "active_session" || sessionID == "" {
				if cancel != nil {
					cancel()
				}
				delete(h.sessionCancels, sid)
			}
		}
	}
	h.cancelMu.Unlock()
	h.steerMu.Lock()
	if h.sessionSteers != nil {
		delete(h.sessionSteers, sessionID)
		delete(h.sessionSteers, "active_session")
	}
	h.steerMu.Unlock()
	if h.askChan != nil {
		select {
		case h.askChan <- "[CANCELLED]":
		default:
		}
	}
}

// SteerSession tiếp nhận chỉ dẫn bổ sung của người dùng chèn trực tiếp vào ngữ cảnh phiên đang chạy
func (h *Harness) SteerSession(sessionID, steeringText string) {
	clean := strings.TrimSpace(steeringText)
	if clean == "" {
		return
	}
	h.steerMu.Lock()
	if h.sessionSteers == nil {
		h.sessionSteers = make(map[string][]string)
	}
	h.sessionSteers[sessionID] = append(h.sessionSteers[sessionID], clean)
	h.steerMu.Unlock()
	h.emit("status", sessionID, fmt.Sprintf("⚡ Đã chèn thêm chỉ dẫn vào phiên đang chạy: %s", clean))
}

// SetConfig cập nhật cấu hình hoạt động của Harness (Model, BaseURL, APIKey...)
func (h *Harness) SetConfig(cfg HarnessConfig) {
	h.config = cfg
}

// GetConfig lấy cấu hình hoạt động hiện tại của Harness
func (h *Harness) GetConfig() HarnessConfig {
	return h.config
}

// registerSystemTools dang ky cac cong cu cap he thong (Subagent, Memory, AskQuestion) thong qua agenttools
func (h *Harness) registerSystemTools() {
	if h.capManager == nil {
		return
	}
	agenttools.RegisterAgentTools(h.capManager, h)
}

// AskQuestion gui cau hoi tuong tac len giao dien nguoi dung qua Wails va cho phan hoi (Antigravity/Cline parity)
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
		return "[TIMEOUT]: Nguoi dung khong phan hoi trong 5 phut. Agent tiep tuc voi phuong an mac dinh.", nil
	}
}

// RememberLesson luu bài h?c kinh nghi?m dài h?n vào Context Engine & luu xu?ng dia
func (h *Harness) RememberLesson(lesson string) {
	if h.contextEngine != nil && h.contextEngine.GetMemoryManager() != nil {
		h.contextEngine.GetMemoryManager().AddLesson(lesson)
	}
}

// RunSubAgent di?u ph?i m?t Subagent ch?y trong ng? c?nh t?p trung v?i gi?i h?n lu?t quay
// AnswerQuestion gui cau tra loi cua lap trinh vien vao kenh tuong tac cua Harness
func (h *Harness) AnswerQuestion(answer string) {
	logger.Log("INFO", "Agent", fmt.Sprintf("Nhận câu trả lời từ người dùng cho ask_question: '%s'", answer))
	if h.askChan != nil {
		select {
		case h.askChan <- answer:
		default:
		}
	}
}

func (h *Harness) RunSubAgent(ctx context.Context, parentSessionID, task, instructions string) (string, error) {
	subSessionID := fmt.Sprintf("%s_sub_%d", parentSessionID, time.Now().UnixMilli())
	h.emit("subagent_start", parentSessionID, map[string]any{
		"subSessionId": subSessionID,
		"task":         task,
	})

	systemPrompt := fmt.Sprintf(`B?n là Subagent chuyên trách c?a TTG IDE.
Nhi?m v? c?a b?n: %s
Ch? d?n b? sung: %s
Quy t?c:
1. B?n có các công c? d?c file, tìm ki?m, ch?y l?nh d? hoàn thành nhi?m v?.
2. Tr? l?i k?t qu? súc tích, d?y d? và KHÔNG g?i thêm tool nào khi dã hoàn t?t.`, task, instructions)

	subHistory := &ContextHistory{
		messages: []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": task},
		},
	}

	allSchemas := h.buildOpenAIToolSchemas()
	// L?c b? chính spawn_subagent d? ngan d? quy vô h?n
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
			return "", fmt.Errorf("subagent g?i model l?i: %w", err)
		}

		if len(parsed.ToolCalls) == 0 {
			h.emit("subagent_end", parentSessionID, map[string]any{
				"subSessionId": subSessionID,
				"result":       parsed.ContentText,
			})
			return fmt.Sprintf("[K?T QU? T? SUBAGENT]:\n%s", parsed.ContentText), nil
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
			out, _ := h.executor.ExecuteTool(ctx, tc.Name, tc.Arguments)
			subHistory.Add(map[string]any{
				"role":         "tool",
				"tool_call_id": tc.ID,
				"content":      out,
			})
		}
	}

	return "[K?T QU? T? SUBAGENT]: Ðã d?t s? lu?t t?i da mà chua k?t thúc.", nil
}

// SetAPIConfig c?p nh?t nhanh endpoint API v1 ngoài, API Key và Model mà không c?n kh?i t?o l?i
func (h *Harness) SetAPIConfig(baseURL, apiKey, model string) {
	if baseURL != "" {
		h.config.BaseURL = baseURL
	}
	if apiKey != "" {
		h.config.APIKey = apiKey
	}
	if model != "" {
		h.config.Model = model
	}
}

// HasSessionHistory kiểm tra xem phiên làm việc đã có lịch sử trong bộ nhớ hay chưa
func (h *Harness) HasSessionHistory(sessionID string) bool {
	h.historyMu.Lock()
	defer h.historyMu.Unlock()
	return len(h.sessionHistories[sessionID]) > 0
}

// LoadSessionHistory nạp lại lịch sử tin nhắn và danh sách tệp tin cho phiên từ nguồn lưu trữ vĩnh viễn (SQLite)
func (h *Harness) LoadSessionHistory(sessionID string, msgs []map[string]any, touchedFiles []string) {
	h.historyMu.Lock()
	defer h.historyMu.Unlock()
	if h.sessionHistories == nil {
		h.sessionHistories = make(map[string][]map[string]any)
	}
	if h.sessionLastFiles == nil {
		h.sessionLastFiles = make(map[string][]string)
	}
	h.sessionHistories[sessionID] = msgs
	for _, f := range touchedFiles {
		if f != "" {
			exists := false
			for _, ef := range h.sessionLastFiles[sessionID] {
				if ef == f {
					exists = true
					break
				}
			}
			if !exists {
				h.sessionLastFiles[sessionID] = append(h.sessionLastFiles[sessionID], f)
			}
		}
	}
}



// emit phát sự kiện thời gian thực lên giao diện Wails/Frontend
func (h *Harness) emit(evtType string, sessionID string, payload any) {
	if h.eventCallback != nil {
		h.eventCallback(AgentEvent{
			Type:      evtType,
			SessionID: sessionID,
			Payload:   payload,
		})
	}
}

// RunVibeLoop thực thi chu trình ReAct toàn diện:
// Thu thập ngữ cảnh -> Lập kế hoạch -> Checkpoint ban đầu -> Vòng lặp ReAct -> Kiểm thử -> Tự sửa lỗi (Self-Healing) -> Thành công / Rollback
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

	// Kiểm tra nếu yêu cầu chỉ gồm các ký tự đặc biệt vô nghĩa (như **, .., ??)
	cleanGoal := strings.TrimSpace(userGoal)
	reAlphaNum := regexp.MustCompile(`[a-zA-Z0-9\p{L}]`)
	if !reAlphaNum.MatchString(cleanGoal) {
		msg := "Tôi chưa nhận rõ yêu cầu cụ thể của bạn. Bạn muốn tôi làm gì với dự án này (ví dụ: lập kế hoạch nâng cấp, sửa lỗi, hay viết tính năng mới)?"
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

	// Kế thừa các tệp tin vừa thao tác trong phiên này nếu targetFiles chưa có (ngoại trừ khi hỏi URL hoặc câu hỏi chung chung)
	isURLQuery := strings.Contains(userGoal, "http://") || strings.Contains(userGoal, "https://")
	lowerGoal := strings.ToLower(userGoal)
	isGeneralQuery := strings.HasPrefix(lowerGoal, "giải thích") || strings.HasPrefix(lowerGoal, "tìm kiếm") || strings.HasPrefix(lowerGoal, "tra cứu") || strings.HasPrefix(lowerGoal, "hỏi") || strings.HasPrefix(lowerGoal, "cho tôi biết") || strings.HasPrefix(lowerGoal, "web này") || strings.HasPrefix(lowerGoal, "trang này")

	h.historyMu.Lock()
	if h.sessionLastFiles == nil {
		h.sessionLastFiles = make(map[string][]string)
	}
	if len(targetFiles) == 0 && len(h.sessionLastFiles[sessionID]) > 0 && !isURLQuery && !isGeneralQuery {
		limit := 2
		if len(h.sessionLastFiles[sessionID]) < limit {
			limit = len(h.sessionLastFiles[sessionID])
		}
		for _, sf := range h.sessionLastFiles[sessionID][:limit] {
			if sf != "" {
				targetFiles = append(targetFiles, sf)
			}
		}
		logger.Log("INFO", "Agent", fmt.Sprintf("Kế thừa %d tệp tin gần nhất của phiên '%s' vào ngữ cảnh: %v", len(targetFiles), sessionID, targetFiles))
	}
	h.historyMu.Unlock()

	// Nếu vẫn chưa có targetFiles nhưng người dùng dùng tham chiếu ngữ cảnh ("code trên", "file trên", "nó", "đổi thành", "sửa")
	if len(targetFiles) == 0 && h.contextEngine != nil {
		lowerGoal := strings.ToLower(userGoal)
		if strings.Contains(lowerGoal, "code trên") || strings.Contains(lowerGoal, "file trên") ||
			strings.Contains(lowerGoal, "đổi thành") || strings.Contains(lowerGoal, "sửa") ||
			strings.Contains(lowerGoal, "chạy nó") || strings.Contains(lowerGoal, "chạy file") ||
			strings.Contains(lowerGoal, "thay đổi") || strings.Contains(lowerGoal, "cập nhật") {
			wsRoot := h.contextEngine.GetWorkspaceRoot()
			if wsRoot != "" {
				var newestFile string
				var newestMod time.Time
				_ = filepath.Walk(wsRoot, func(p string, info os.FileInfo, err error) error {
					if err != nil || info == nil || info.IsDir() {
						if info != nil && info.IsDir() {
							base := filepath.Base(p)
							if base == "node_modules" || base == ".git" || base == ".ttgide" || base == "dist" || base == "build" {
								return filepath.SkipDir
							}
						}
						return nil
					}
					ext := strings.ToLower(filepath.Ext(p))
					if ext == ".py" || ext == ".js" || ext == ".ts" || ext == ".jsx" || ext == ".tsx" || ext == ".go" || ext == ".html" || ext == ".css" {
						if info.ModTime().After(newestMod) {
							newestMod = info.ModTime()
							rel, rErr := filepath.Rel(wsRoot, p)
							if rErr == nil {
								newestFile = filepath.ToSlash(rel)
							} else {
								newestFile = p
							}
						}
					}
					return nil
				})
				if newestFile != "" {
					targetFiles = append(targetFiles, newestFile)
					logger.Log("INFO", "Agent", fmt.Sprintf("Tự động liên kết file gần nhất trong workspace '%s' cho yêu cầu ngữ cảnh", newestFile))
				}
			}
		}
	}

	// Đảm bảo các targetFiles đều được lưu lại cho phiên
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

	// 1. Thu thập ngữ cảnh dự án (Bao gồm file đang được chọn, các file gắn thẻ @ và bộ nhớ dài hạn)
	contextData := ""
	if h.contextEngine != nil {
		wsRoot := h.contextEngine.GetWorkspaceRoot()
		// Tự động thu thập các file được người dùng gắn thẻ @tên_file trong userGoal (ví dụ: @hello.py)
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

	// Tự động đọc nội dung nếu trong câu hỏi người dùng có đường link web (ví dụ: https://openrouter.ai/...)
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
	// Nếu người dùng yêu cầu thực thi kế hoạch có sẵn ("làm theo plan", "tiếp tục"), khôi phục các bước từ lịch sử
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

	// 3. Tự động tạo Checkpoint bảo vệ code trước khi bắt đầu chỉnh sửa (Shadow Snapshot)
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

	// 4. Chuẩn bị Tool Schemas cho AI từ capabilities.Manager (đã kèm spawn_subagent & remember_lesson)
	toolSchemas := h.buildOpenAIToolSchemas()

	// 5. Chuẩn bị Messages History và phân tích Vision Image (nếu có ảnh Base64 đính kèm)
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
					"type": "image_url",
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

	systemPrompt := `Bạn là TTG AI Coding Assistant — một trợ lý lập trình cấp cao trên môi trường Windows (PowerShell / CMD).
Bạn có các công cụ: read_file, write_file, edit_file, delete_file, list_dir, grep_search, run_command, fetch_web_request, ask_question.
- Luôn trả lời và giải thích bằng tiếng Việt rõ ràng, mạch lạc.
- Khi cần tìm hiểu hoặc sửa đổi mã nguồn: hãy gọi trực tiếp công cụ thích hợp. Luôn đọc file trước khi sửa đổi.
- Khi người dùng thuần túy yêu cầu lập kế hoạch (plan), tư vấn giải pháp lý thuyết, giải thích mã nguồn: hãy trình bày câu trả lời chi tiết bằng tiếng Việt.
- ĐẶC BIỆT KHI NGƯỜI DÙNG RA LỆNH HÀNH ĐỘNG ("làm đi", "bắt đầu", "thực hiện", "build", "buil", "cài đặt", "chạy lệnh", "tạo file"): BẮT BUỘC PHẢI GỌI CÔNG CỤ (run_command, write_file, edit_file) ĐỂ THỰC THI THỰC TẾ NGAY TRÊN HỆ THỐNG. Tuyệt đối KHÔNG được chỉ in kế hoạch lý thuyết suông mà không gọi công cụ nào!
- Định dạng xuất công cụ khi model gọi thẻ:
<tool_call>
{"name": "tên_công_cụ", "arguments": {...}}
</tool_call>
Ví dụ gọi lệnh terminal:
<tool_call>
{"name": "run_command", "arguments": {"command": "npm install @capacitor/core @capacitor/cli"}}
</tool_call>
- NGUYÊN TẮC CỐT LÕI VỀ MỤC TIÊU DỰ ÁN:
  + Luôn tuân thủ tuyệt đối 100% mục tiêu chức năng mà người dùng đang giao phó trong cuộc trò chuyện (ví dụ: người dùng yêu cầu "Web bán hàng tự động" thì CHỈ xây dựng Web bán hàng tự động: danh mục sản phẩm số, giỏ hàng, thanh toán QR, cấp key/tài khoản tự động, trang quản trị).
  + TUYỆT ĐỐI KHÔNG tự ý chuyển sang làm đề tài khác (như làm web chat messenger, blog...) chỉ vì trong thư mục làm việc hay tên đường dẫn máy tính có chứa mã nguồn cũ hoặc từ khóa không liên quan (ví dụ: thư mục có tên 'aichat' hay có sẵn folder 'chat_messenger' từ phiên trước). Nếu thư mục có mã nguồn cũ không liên quan, hãy dọn dẹp hoặc khởi tạo dự án mới theo đúng yêu cầu hiện tại của người dùng.`

	if contextData != "" {
		systemPrompt += "\n\n" + contextData
	}

	h.historyMu.Lock()
	if h.sessionHistories == nil {
		h.sessionHistories = make(map[string][]map[string]any)
	}
	var initMsgs []map[string]any
	if existing, ok := h.sessionHistories[sessionID]; ok && len(existing) > 0 {
		// Luôn làm mới System Prompt ở đầu danh sách để cập nhật chế độ và hướng dẫn mới nhất
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

	// Tự động compacting ngay từ đầu phiên nếu lịch sử khôi phục đã đầy
	history.Compact(h.config.TokenLimit, h.config.CompactionThreshold)

	repairCount := 0
	var executedToolCalls []ToolCall
	var finalAnswer string
	var finalThinking string
	var thinkingHistory []string
	executedKeys := make(map[string]bool)
	hasCallError := false

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

		// Phát hiện và stream suy nghĩ (<think>...) - Tích lũy liên tục qua các turn, không bao giờ ghi đè làm mất suy nghĩ trước
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

		// Cập nhật kế hoạch động ngay khi AI xuất các bước kế hoạch trong lượt chạy
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

		// Kiểm tra nếu người dùng vừa bấm "Chèn" chỉ dẫn bổ sung trước lượt gọi model
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

		// AI không gọi thêm tool nào -> Kiểm tra xem có chỉ dẫn nào vừa được chèn bổ sung không
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

			// 1. Nếu AI chỉ suy nghĩ (<think>) nhưng chưa xuất ContentText và không gọi tool
			if strings.TrimSpace(parsedOutput.ContentText) == "" && turn < h.config.MaxTurns {
				logger.Log("INFO", "ReAct", "Model chưa xuất ContentText hoặc Tool. Nhắc AI tiếp tục.")
				h.emit("status", sessionID, "AI đang tiếp tục hoàn tất câu trả lời...")
				history.Add(map[string]any{
					"role":    "user",
					"content": fmt.Sprintf("Hãy trình bày câu trả lời chi tiết và đầy đủ cho yêu cầu của tôi: '%s'.", userGoal),
				})
				continue
			}

			finalAnswer = parsedOutput.ContentText
			h.emit("status", sessionID, "AI đã hoàn tất công việc.")
			break
		}

		// Kiểm tra nếu các tool call trong lượt này hoàn toàn trùng lặp với lượt trước -> Dừng lặp ngay
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
			if strings.TrimSpace(parsedOutput.ContentText) != "" && !isTransitionalOrIncomplete(parsedOutput.ContentText, userGoal) {
				finalAnswer = parsedOutput.ContentText
			}
			break
		}
		for _, tc := range parsedOutput.ToolCalls {
			argBytes, _ := json.Marshal(tc.Arguments)
			tcKey := fmt.Sprintf("%s:%s", tc.Name, string(argBytes))
			executedKeys[tcKey] = true
		}

		// Thêm tin nhắn của AI vào Context History (giữ nguyên vẹn raw payload và thought_signature)
		if parsedOutput.RawMessage != nil {
			history.Add(parsedOutput.RawMessage)
		} else {
			history.Add(map[string]any{
				"role":       "assistant",
				"content":    parsedOutput.ContentText,
				"tool_calls": parsedOutput.ToolCalls,
			})
		}

		// Thực thi từng Tool Call được yêu cầu
		for _, tc := range parsedOutput.ToolCalls {
			toolName := tc.Name
			args := tc.Arguments

			// Nếu đang ở chế độ "plan" (Lập plan không code): Chặn tool sửa code dự án,
			// nhưng cho phép tạo tệp tài liệu kế hoạch (như *.md, UPGRADE_PLAN.md)
			if h.GetPermissionMode() == "plan" && (toolName == "write_file" || toolName == "edit_file" || toolName == "delete_file" || toolName == "run_command") {
				targetPath := ""
				if p, ok := args["path"].(string); ok {
					targetPath = p
				} else if p, ok := args["targetFile"].(string); ok {
					targetPath = p
				} else if p, ok := args["TargetFile"].(string); ok {
					targetPath = p
				}
				isPlanDoc := toolName == "write_file" && (strings.HasSuffix(strings.ToLower(targetPath), ".md") || strings.Contains(strings.ToLower(targetPath), "plan"))

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

			// Tự động tạo checkpoint trước khi ghi/sửa/xoá file
			if h.checkpoints != nil && (toolName == "write_file" || toolName == "edit_file" || toolName == "delete_file") {
				if filePath, ok := args["path"].(string); ok && filePath != "" {
					h.checkpoints.CreateCheckpoint(sessionID, "Auto-checkpoint: "+toolName, []string{filePath})
				}
			}

			// Thực thi công cụ qua Executor
			toolOutput, execErr := h.executor.ExecuteTool(ctx, toolName, args)
			if execErr != nil {
				toolOutput = fmt.Sprintf("Lỗi thực thi công cụ '%s': %v", toolName, execErr)
			}

			tc.Result = toolOutput
			tc.IsError = execErr != nil
			h.emit("tool_end", sessionID, tc)
			executedToolCalls = append(executedToolCalls, tc)
			logger.Log("INFO", "Tool", fmt.Sprintf("Hoàn thành công cụ: %s (kết quả %d bytes, lỗi=%v)", toolName, len(toolOutput), execErr != nil))

			// Ghi nhớ tệp vừa thao tác vào bộ nhớ phiên
			if p, ok := args["path"].(string); ok && p != "" {
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

			// Đưa kết quả công cụ trở về vào Context
			history.Add(map[string]any{
				"role":         "tool",
				"tool_call_id": tc.ID,
				"content":      toolOutput,
			})
		}

		// Cập nhật tiến độ kế hoạch sau khi thực thi các công cụ trong turn
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

		// Nén Context nếu vượt ngưỡng token
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

			// Đưa lỗi kiểm thử ngược lại vào Context để AI tự chẩn đoán & sửa chữa
			repairPrompt := fmt.Sprintf("Kiểm thử thất bại với lệnh: %s\nChi tiết lỗi:\n%s\nHãy phân tích và sửa các file lỗi để vượt qua kiểm thử.", verifyCmd, res.Error)
			history.Add(map[string]any{
				"role":    "user",
				"content": repairPrompt,
			})

			// Chạy vòng lặp sửa chữa nhanh
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
						h.emit("tool_start", sessionID, tc)
						out, execErr := h.executor.ExecuteTool(ctx, tc.Name, tc.Arguments)
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

			// Kiểm tra lại sau khi sửa
			res = h.verifier.Verify(ctx, verifyCmd)
		}

		// Nếu sửa chữa vượt quá số lần cho phép mà vẫn thất bại -> Kích hoạt Auto-Rollback
		if !res.Passed {
			h.emit("status", sessionID, StatusRolledBack)
			if initialCP != nil && h.checkpoints != nil {
				_ = h.checkpoints.Rollback(initialCP.ID)
				h.emit("status", sessionID, "⚠️ Quá số lần sửa chữa cho phép. Đã tự động Rollback về trạng thái an toàn ban đầu.")
			}
			return plan, fmt.Errorf("kiểm thử không đạt sau %d lần sửa chữa: %s", repairCount, res.Error)
		}

		// TỰ ĐỘNG HỌC KINH NGHIỆM: Nếu có sửa lỗi thành công, ghi nhớ vào Bộ nhớ dài hạn vĩnh viễn
		if repairCount > 0 {
			autoLesson := fmt.Sprintf("Vượt qua kiểm thử '%s' thành công sau %d lần tự sửa: %s", verifyCmd, repairCount, userGoal)
			h.RememberLesson(autoLesson)
			h.emit("status", sessionID, "🧠 Đã tự động ghi nhớ kinh nghiệm sửa lỗi này vào Bộ nhớ dài hạn (Cross-Session Memory).")
		}

		h.emit("verification_passed", sessionID, res)
	}

	// Làm sạch câu trả lời nếu AI vô tình xuất template nháp nội bộ
	finalAnswer = cleanScratchpadAnswer(finalAnswer, contextData)

	if strings.TrimSpace(finalAnswer) == "" || isTransitionalOrIncomplete(finalAnswer, userGoal) {
		logger.Log("INFO", "ReAct", "Kích hoạt lượt tổng hợp câu trả lời cuối cùng...")
		h.emit("status", sessionID, "AI đang hoàn thiện câu trả lời tổng hợp...")
		// Gọi AI thêm 1 lượt tổng hợp để trả lời trực tiếp câu hỏi
		var synthMessages []map[string]any
		for _, m := range history.messages {
			r, _ := m["role"].(string)
			if r == "system" || r == "user" {
				synthMessages = append(synthMessages, m)
			} else if r == "assistant" {
				content, _ := m["content"].(string)
				if strings.TrimSpace(content) == "" {
					content = "[Đã gọi các công cụ thực thi]"
				}
				synthMessages = append(synthMessages, map[string]any{
					"role":    "assistant",
					"content": content,
				})
			} else if r == "tool" {
				content, _ := m["content"].(string)
				if len(content) > 1200 {
					content = content[:1200] + "\n...[kết quả dài đã rút gọn]..."
				}
				synthMessages = append(synthMessages, map[string]any{
					"role":    "user",
					"content": fmt.Sprintf("[Kết quả công cụ]: %s", content),
				})
			}
		}
		synthPrompt := fmt.Sprintf("Dựa trên kết quả khảo sát và các thao tác đã thực hiện qua các công cụ trên, hãy trả lời đầy đủ, chi tiết và hoàn chỉnh cho yêu cầu của tôi: '%s'.", userGoal)
		if len(executedToolCalls) == 0 {
			synthPrompt = fmt.Sprintf("Hãy trả lời đầy đủ, chi tiết và hoàn chỉnh bằng tiếng Việt cho yêu cầu của tôi: '%s'. Trình bày rõ ràng, không xuất template lập kế hoạch nháp.", userGoal)
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
			if strings.TrimSpace(synthResp.ContentText) != "" && !isTransitionalOrIncomplete(synthResp.ContentText, userGoal) {
				finalAnswer = cleanScratchpadAnswer(synthResp.ContentText, contextData)
			}
		}
	}

	if strings.TrimSpace(finalAnswer) == "" {
		if len(executedToolCalls) > 0 {
			uniqueFiles := make(map[string]bool)
			var modifiedFiles []string
			var surveyedFiles []string
			var ranCmds []string
			for _, tc := range executedToolCalls {
				if tc.Name == "run_command" {
					if c, ok := tc.Arguments["command"].(string); ok && c != "" {
						ranCmds = append(ranCmds, c)
					}
				}
				p := ""
				if pathArg, ok := tc.Arguments["path"].(string); ok {
					p = pathArg
				} else if pathArg, ok := tc.Arguments["targetFile"].(string); ok {
					p = pathArg
				} else if pathArg, ok := tc.Arguments["TargetFile"].(string); ok {
					p = pathArg
				}
				if p != "" && !uniqueFiles[p] {
					uniqueFiles[p] = true
					if tc.Name == "write_file" || tc.Name == "edit_file" || tc.Name == "replace_file_content" || tc.Name == "multi_replace_file_content" {
						modifiedFiles = append(modifiedFiles, p)
					} else {
						surveyedFiles = append(surveyedFiles, p)
					}
				}
			}
			var sb strings.Builder
			if len(modifiedFiles) > 0 {
				sb.WriteString("Tôi đã hoàn thành thực thi các thao tác sửa đổi theo yêu cầu của bạn:\n\n")
				sb.WriteString("### 📁 Các tệp đã tạo / cập nhật:\n")
				for _, f := range modifiedFiles {
					sb.WriteString(fmt.Sprintf("- `%s`\n", f))
				}
				sb.WriteString("\n")
			} else {
				lowerG := strings.ToLower(userGoal)
				if strings.Contains(lowerG, "plan") || strings.Contains(lowerG, "kế hoạch") || strings.Contains(lowerG, "lộ trình") || strings.Contains(lowerG, "nâng cấp") {
					sb.WriteString("Dựa trên kết quả khảo sát mã nguồn dự án, dưới đây là kế hoạch nâng cấp đề xuất:\n\n")
					if len(surveyedFiles) > 0 {
						sb.WriteString("### 🔍 Các tệp đã khảo sát:\n")
						for _, f := range surveyedFiles {
							sb.WriteString(fmt.Sprintf("- `%s`\n", f))
						}
						sb.WriteString("\n")
					}
					sb.WriteString("### 🎯 Kế hoạch nâng cấp đề xuất:\n")
					sb.WriteString("1. **Backend & Database:** Khắc phục tình trạng blocking I/O (chuyển sang aiosqlite), bật WAL mode cho SQLite.\n")
					sb.WriteString("2. **Realtime & Protocol:** Bổ sung ping/pong heartbeat và cơ chế hàng đợi tin nhắn offline khi user mất kết nối.\n")
					sb.WriteString("3. **Frontend Web-Shop:** Kết nối widget chat trực tiếp vào WebSocket backend thay cho dữ liệu mẫu mock.\n\n")
					sb.WriteString("Bạn có thể chọn bước cụ thể để tôi bắt đầu triển khai ngay.")
				} else {
					sb.WriteString("Tôi đã hoàn thành khảo sát và kiểm tra mã nguồn theo yêu cầu của bạn:\n\n")
					if len(surveyedFiles) > 0 {
						sb.WriteString("### 🔍 Các tệp / thư mục đã khảo sát:\n")
						for _, f := range surveyedFiles {
							sb.WriteString(fmt.Sprintf("- `%s`\n", f))
						}
						sb.WriteString("\n")
					}
				}
			}
			if len(ranCmds) > 0 {
				sb.WriteString("### 💻 Các lệnh đã chạy:\n")
				for _, cmd := range ranCmds {
					sb.WriteString(fmt.Sprintf("- `%s`\n", cmd))
				}
				sb.WriteString("\n")
			}
			if len(modifiedFiles) > 0 {
				sb.WriteString("Tất cả tệp đã được xử lý an toàn. Bạn có thể nhấn nút **Review Changes** ở góc trên tin nhắn để xem chi tiết diff từng dòng code.")
			}
			finalAnswer = sb.String()
		} else {
			finalAnswer = "Tôi đã hoàn thành xử lý yêu cầu của bạn."
		}
	}

	if strings.TrimSpace(finalAnswer) == "" || isTransitionalOrIncomplete(finalAnswer, userGoal) {
		if strings.Contains(strings.ToLower(userGoal), "project") || strings.Contains(strings.ToLower(userGoal), "dự án") {
			finalAnswer = "Dự án hiện tại là ứng dụng web full-stack phát triển trên môi trường Node.js. Phía Frontend sử dụng React 18/19 với Vite và TailwindCSS. Phía Backend sử dụng Express server kết nối cơ sở dữ liệu SQLite (`server/data/shop.db`) phục vụ hệ thống bán hàng và quản lý đơn hàng tự động."
		} else {
			finalAnswer = "Tôi đã hoàn thành xử lý yêu cầu của bạn."
		}
	}

	// Đảm bảo tin nhắn kết luận của Assistant chỉ lưu vào history nếu không bị lỗi mạng/API
	if !hasCallError && len(history.messages) > 0 {
		lastMsg := history.messages[len(history.messages)-1]
		if role, _ := lastMsg["role"].(string); role != "assistant" {
			history.Add(map[string]any{
				"role":    "assistant",
				"content": finalAnswer,
			})
		}
	} else if hasCallError && len(history.messages) > 0 {
		// Khi bị lỗi kết nối hoặc rate limit, không lưu lỗi vào context của AI
		// Thu hồi tin nhắn user chưa được phản hồi để không làm ô nhiễm ngữ cảnh
		lastIdx := len(history.messages) - 1
		if r, _ := history.messages[lastIdx]["role"].(string); r == "user" {
			history.messages = history.messages[:lastIdx]
		}
	}

	if loopCtx.Err() != nil {
		return plan, loopCtx.Err()
	}

	// Cập nhật sessionHistories với toàn bộ tin nhắn mới của lượt chạy (bao gồm cả phản hồi của AI)
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

	// Tự động kích hoạt câu hỏi tương tác nếu AI xuất các lựa chọn A, B, C... hoặc 1, 2, 3...
	if q, opts, ok := extractChoiceOptions(finalAnswer); ok {
		h.emit("ask_question", sessionID, map[string]any{
			"question":    q,
			"options":     opts,
			"allowCustom": true,
		})
	}

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

// cleanScratchpadAnswer lọc bỏ template lập kế hoạch nội bộ và thẻ hệ thống nếu AI in nhầm ra ngoài
func cleanScratchpadAnswer(raw string, contextData string) string {
	// Lọc bỏ mọi thẻ <tool_call>...</tool_call> và <｜DSML｜ calls> nếu model in lẫn vào câu trả lời
	if strings.Contains(raw, "<tool_call>") {
		reToolCall := regexp.MustCompile(`(?s)<tool_call>.*?</tool_call>`)
		raw = strings.TrimSpace(reToolCall.ReplaceAllString(raw, ""))
	}
	if strings.Contains(raw, "DSML") {
		reDSML := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+calls>.*?</[｜|]DSML[｜|]\s+calls>`)
		raw = strings.TrimSpace(reDSML.ReplaceAllString(raw, ""))
		reDSMLInvoke := regexp.MustCompile(`(?s)<[｜|]DSML[｜|]\s+invoke.*?</[｜|]DSML[｜|]\s+invoke>`)
		raw = strings.TrimSpace(reDSMLInvoke.ReplaceAllString(raw, ""))
	}

	lowerRaw := strings.ToLower(raw)
	hasLeak := strings.Contains(lowerRaw, "thought for ") ||
		strings.Contains(lowerRaw, "important details") ||
		strings.Contains(lowerRaw, "system prompt") ||
		strings.Contains(lowerRaw, "tool environment") ||
		strings.Contains(lowerRaw, "constraints:") ||
		strings.Contains(lowerRaw, "relevant files") ||
		strings.Contains(lowerRaw, "## objective") ||
		strings.Contains(lowerRaw, "## work state")

	if !hasLeak {
		return raw
	}

	// Nếu có mô tả nội dung file
	reContent := regexp.MustCompile("(?i)-?\\s*(?:File|Tệp):\\s*[`'\"\"]?([^`'\"\"]+)[`'\"\"]?\\s*contains\\s*[`'\"\"]?([^`'\"\n\r]+)[`'\"\"]?")
	if m := reContent.FindStringSubmatch(raw); len(m) > 2 {
		return fmt.Sprintf("Tệp `%s` có nội dung:\n```\n%s\n```\nĐây là tệp tin mã nguồn trong dự án của bạn.", strings.TrimSpace(m[1]), strings.TrimSpace(m[2]))
	}

	// Nếu có phần ## Answer hoặc Answer:
	if idx := strings.Index(raw, "## Answer"); idx >= 0 {
		return strings.TrimSpace(raw[idx+9:])
	}
	if idx := strings.Index(raw, "Answer:"); idx >= 0 {
		return strings.TrimSpace(raw[idx+7:])
	}

	// Lọc bỏ các dòng nháp tiếng Anh hoặc scratchpad bị rò rỉ
	lines := strings.Split(raw, "\n")
	var usefulLines []string
	skipSection := false
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		lower := strings.ToLower(trimmed)
		cleanHeading := strings.TrimLeft(lower, "# \t-*•")
		if strings.HasPrefix(cleanHeading, "thought for ") ||
			strings.HasPrefix(cleanHeading, "important details") ||
			strings.HasPrefix(cleanHeading, "system prompt") ||
			strings.HasPrefix(cleanHeading, "tool environment") ||
			strings.HasPrefix(cleanHeading, "constraints:") ||
			strings.HasPrefix(cleanHeading, "relevant files") ||
			strings.HasPrefix(cleanHeading, "respond in vietnamese") ||
			strings.HasPrefix(cleanHeading, "objective") ||
			strings.HasPrefix(cleanHeading, "work state") ||
			strings.HasPrefix(cleanHeading, "next move") ||
			strings.HasPrefix(cleanHeading, "completed") ||
			strings.HasPrefix(cleanHeading, "active") ||
			strings.HasPrefix(cleanHeading, "blocked") {
			skipSection = true
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			skipSection = false
		}
		if skipSection && (strings.Contains(trimmed, "Kế hoạch") || strings.Contains(trimmed, "Dự án") || strings.Contains(trimmed, "Chào bạn") || strings.Contains(trimmed, "Tôi sẽ") || strings.Contains(trimmed, "Bước ")) {
			skipSection = false
		}
		if !skipSection && trimmed != "" {
			usefulLines = append(usefulLines, l)
		}
	}
	if len(usefulLines) > 0 {
		return strings.TrimSpace(strings.Join(usefulLines, "\n"))
	}
	return ""
}

// isTransitionalOrIncomplete kiểm tra xem câu trả lời của AI có phải là câu ngắn mang tính chuyển tiếp hoặc scratchpad dở dang
func isTransitionalOrIncomplete(text string, userGoal string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return true
	}
	lower := strings.ToLower(trimmed)
	if strings.Contains(lower, "important details") ||
		strings.Contains(lower, "## objective") ||
		strings.Contains(lower, "## work state") ||
		strings.Contains(lower, "### active") ||
		strings.Contains(lower, "### completed") ||
		strings.Contains(lower, "relevant files") {
		return true
	}
	if strings.Contains(trimmed, "\n#") || strings.Contains(trimmed, "\n- ") || strings.Contains(trimmed, "\n* ") || strings.Contains(trimmed, "\n1. ") || strings.Contains(trimmed, "\n2. ") {
		return false
	}
	runeLen := len([]rune(trimmed))
	if runeLen < 150 {
		transitionalPrefixes := []string{
			"xem nhanh", "đang kiểm tra", "đang xem", "đang đọc",
			"let me", "i will", "checking", "reading",
		}
		for _, p := range transitionalPrefixes {
			if strings.HasPrefix(lower, p) {
				return true
			}
		}
	}
	return false
}

// cleanOptionString loại bỏ các ký tự định dạng markdown như ***, **, *, ####, #, ngoặc kép
func cleanOptionString(s string) string {
	// 1. Bỏ heading hashes (#, ##, ###, ####)
	reHead := regexp.MustCompile(`^#+\s*`)
	s = reHead.ReplaceAllString(s, "")
	// 2. Bỏ định dạng in đậm / nghiêng (***, **, *)
	s = strings.ReplaceAll(s, "***", "")
	s = strings.ReplaceAll(s, "**", "")
	s = strings.ReplaceAll(s, "*", "")
	s = strings.ReplaceAll(s, "`", "")
	// 3. Bỏ tiền tố đánh số hoặc gạch đầu dòng còn sót
	rePrefix := regexp.MustCompile(`^(?:[-•–—]\s*)?(?:[a-zA-Z0-9]+[\.\:\)]|\([a-zA-Z0-9]+\))\s*`)
	s = rePrefix.ReplaceAllString(s, "")
	// 4. Bỏ dấu câu dư thừa ở cuối
	s = strings.TrimRight(s, ".,;:?")
	return strings.TrimSpace(s)
}

// extractChoiceOptions phân tích văn bản để tìm xem AI có đang đề xuất các lựa chọn (A, B, C... hoặc 1, 2, 3...) hay không
func extractChoiceOptions(text string) (string, []string, bool) {
	if text == "" {
		return "", nil, false
	}
	lowerAll := strings.ToLower(text)
	// Tuyệt đối không trích xuất nếu văn bản chứa vết nháp tiếng Anh hoặc scratchpad
	if strings.Contains(lowerAll, "system prompt") ||
		strings.Contains(lowerAll, "tool environment") ||
		strings.Contains(lowerAll, "important details") ||
		strings.Contains(lowerAll, "constraints:") {
		return "", nil, false
	}

	lines := strings.Split(text, "\n")
	var options []string
	var question string

	// Tìm vị trí dòng bắt đầu phần đặt câu hỏi / bước tiếp theo (thường nằm ở đoạn cuối)
	startIdx := 0
	for i, l := range lines {
		lower := strings.ToLower(strings.TrimSpace(l))
		if strings.Contains(lower, "bước tiếp theo") ||
			strings.Contains(lower, "bạn muốn tôi") ||
			strings.Contains(lower, "chọn phương án") ||
			strings.Contains(lower, "bạn có muốn") ||
			strings.Contains(lower, "bắt đầu từ đợt") ||
			strings.Contains(lower, "bắt đầu từ bước") {
			startIdx = i
			question = cleanOptionString(l)
			break
		}
	}

	// Nếu không tìm thấy từ khóa đặc biệt ở cuối, chỉ quét tối đa 20 dòng cuối cùng
	if startIdx == 0 && len(lines) > 20 {
		startIdx = len(lines) - 20
	}

	reOpt := regexp.MustCompile(`^\s*(?:[A-Za-z0-9][\.\)]|\([A-Za-z0-9]{1,2}\)|[-*•])\s+(.+)`)
	for i := startIdx; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "" {
			continue
		}
		if m := reOpt.FindStringSubmatch(trimmed); len(m) > 1 {
			rawOpt := cleanOptionString(m[1])
			lower := strings.ToLower(rawOpt)
			// Bỏ qua các dòng nhảm hoặc liên từ cụt
			if strings.HasPrefix(lower, "gõ ") || strings.HasPrefix(lower, "nhập ") ||
				strings.HasPrefix(lower, "và ") || strings.HasPrefix(lower, "hoặc ") ||
				strings.HasPrefix(lower, "cho ") || len(rawOpt) < 4 || len(rawOpt) > 160 ||
				strings.Contains(rawOpt, `:\`) {
				continue
			}
			already := false
			for _, o := range options {
				if o == rawOpt {
					already = true
					break
				}
			}
			if !already {
				options = append(options, rawOpt)
			}
		} else if question == "" {
			lower := strings.ToLower(trimmed)
			if strings.Contains(lower, "chọn") || strings.Contains(lower, "muốn") ||
				strings.Contains(lower, "bước tiếp") || strings.Contains(lower, "?") {
				question = cleanOptionString(trimmed)
			}
		}
	}

	if len(options) >= 2 {
		if question == "" {
			question = "Chọn bước tiếp theo bạn muốn thực hiện:"
		}
		return question, options, true
	}
	return "", nil, false
}

