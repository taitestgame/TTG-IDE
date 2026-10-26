package agent

import "time"

// Mode đại diện cho chế độ hoạt động của TTG IDE
type Mode string

const (
	ModeIDE  Mode = "ide"  // Chế độ IDE truyền thống cho lập trình viên
	ModeVibe    Mode = "vibe"
	ModeMultiAI Mode = "multi_ai" // Chế độ Vibe Coding tự nhiên cho người mới
)

// AgentStatus thể hiện trạng thái trong vòng lặp thực thi của AI Agent
type AgentStatus string

const (
	StatusIdle             AgentStatus = "idle"              // Trạng thái nghỉ / chờ lệnh
	StatusPlanning         AgentStatus = "planning"          // Đang phân tích và lập kế hoạch
	StatusExecuting        AgentStatus = "executing"         // Đang chạy các công cụ / viết code
	StatusVerifying        AgentStatus = "verifying"         // Đang chạy kiểm thử / build
	StatusRepairing        AgentStatus = "repairing"         // Đang tự sửa lỗi sau khi test fail (Self-Healing)
	StatusAwaitingApproval AgentStatus = "awaiting_approval" // Chờ người dùng duyệt lệnh nguy hiểm (Safety Gate)
	StatusSuccess          AgentStatus = "success"           // Hoàn thành xuất sắc
	StatusFailed           AgentStatus = "failed"            // Thực thi thất bại
	StatusRolledBack       AgentStatus = "rolled_back"       // Đã rollback khôi phục lại mã nguồn
)

// Message đại diện cho một tin nhắn hội thoại giữa Người dùng và Agent
type Message struct {
	ID        string     `json:"id"`
	SessionID string     `json:"sessionId"`
	Sender    string     `json:"sender"` // "user", "agent", "system", "tool"
	Content   string     `json:"content"`
	ToolCalls []ToolCall `json:"toolCalls,omitempty"`
	Timestamp time.Time  `json:"timestamp"`
}

// Plan đại diện cho kế hoạch thực thi tổng thể do Planner lập ra
type Plan struct {
	ID          string     `json:"id"`
	Goal        string     `json:"goal"`
	Steps       []PlanStep `json:"steps"`
	CurrentStep int        `json:"currentStep"`
	Answer      string     `json:"answer,omitempty"`
	Thinking    string     `json:"thinking,omitempty"`
	ToolCalls   []ToolCall `json:"toolCalls,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// PlanStep là một bước hành động nguyên tử trong Kế hoạch
type PlanStep struct {
	ID          int         `json:"id"`
	Description string      `json:"description"`
	Status      AgentStatus `json:"status"` // pending, executing, success, failed
	Tool        string      `json:"tool,omitempty"`
	Input       any         `json:"input,omitempty"`
	Result      string      `json:"result,omitempty"`
	Error       string      `json:"error,omitempty"`
}

// ToolCall đại diện cho một yêu cầu kích hoạt công cụ của AI Agent
type ToolCall struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
	Result    string         `json:"result,omitempty"`
	IsError   bool           `json:"isError,omitempty"`
}

// Checkpoint đại diện cho một điểm sao lưu mã nguồn an toàn trước khi chỉnh sửa
type Checkpoint struct {
	ID            string    `json:"id"`
	SessionID     string    `json:"sessionId"`
	Description   string    `json:"description"`
	Files         []string  `json:"files"`
	ModifiedFiles []string  `json:"modifiedFiles,omitempty"`
	CreatedFiles  []string  `json:"createdFiles,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
}

// AgentEvent đại diện cho sự kiện thời gian thực được stream lên giao diện người dùng
type AgentEvent struct {
	Type      string `json:"type"` // "status", "thought", "plan", "tool_start", "tool_end", "error", "checkpoint", "repair"
	SessionID string `json:"sessionId"`
	Payload   any    `json:"payload"`
}