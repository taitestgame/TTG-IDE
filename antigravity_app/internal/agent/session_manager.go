package agent

import (
	"fmt"
	"strings"
)

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

// ClearSessionHistory xóa sạch lịch sử hội thoại của một session khỏi RAM
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

// SetAPIConfig cập nhật nhanh endpoint API v1 ngoài, API Key và Model mà không cần khởi tạo lại Harness
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

// GetActiveSessionID tra ve ID cua session hien dang thuc thi trong Vibe Loop (neu co)
func (h *Harness) GetActiveSessionID() string {
	h.activeSessMu.RLock()
	defer h.activeSessMu.RUnlock()
	return h.activeSessionID
}

