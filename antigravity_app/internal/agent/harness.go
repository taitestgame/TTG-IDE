package agent

import (
	"context"
	"sync"

	"ttgide/internal/capabilities"
	tfContext "ttgide/internal/context"
)

// Harness là trái tim điều phối Agent (Codex + Antigravity + Claude + Harness²),
// kết nối các lớp Context, Planner, Executor, Verifier, Safety Gate và Checkpoints.
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
	sessionLastFiles map[string][]string
	historyMu        sync.Mutex
	permissionMode   string // "full", "ask", "plan"
	permMu           sync.RWMutex
	sessionCancels   map[string]context.CancelFunc
	cancelMu         sync.Mutex
	sessionSteers    map[string][]string // sessionID -> chỉ dẫn bổ sung chèn trực tiếp
	steerMu          sync.Mutex
	activeSessionID  string
	activeSessMu     sync.RWMutex
}

// NewHarness khởi tạo bộ điều phối Agent Harness với cấu hình mặc định (tương thích 100% với app.go)
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

// NewHarnessWithConfig khởi tạo bộ điều phối Agent Harness với cấu hình tùy biến
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
		permissionMode:   "full",
		sessionHistories: make(map[string][]map[string]any),
		sessionLastFiles: make(map[string][]string),
		sessionCancels:   make(map[string]context.CancelFunc),
		sessionSteers:    make(map[string][]string),
	}
	h.registerSystemTools()
	return h
}

// SetConfig cập nhật cấu hình hoạt động của Harness (Model, BaseURL, APIKey...)
func (h *Harness) SetConfig(cfg HarnessConfig) {
	h.config = cfg
}

// GetConfig lấy cấu hình hoạt động hiện tại của Harness
func (h *Harness) GetConfig() HarnessConfig {
	return h.config
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
