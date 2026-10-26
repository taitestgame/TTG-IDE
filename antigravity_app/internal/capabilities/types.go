package capabilities

import "context"

// ToolDefinition mô tả định nghĩa và schema của một công cụ dành cho AI Agent
type ToolDefinition struct {
	Name         string         `json:"name"`
	Description  string         `json:"description"`
	Category     string         `json:"category"`     // Phân loại: "fs", "terminal", "search", "git", "browser", "mcp"
	Parameters   map[string]any `json:"parameters"`
	RequiresAuth bool           `json:"requiresAuth"` // Các tác vụ can thiệp sâu đòi hỏi xác nhận từ người dùng
}

// ToolHandler là hàm thực thi logic cho từng công cụ
type ToolHandler func(ctx context.Context, args map[string]any) (string, error)

// Tool đại diện cho một công cụ đã được đăng ký vào hệ thống
type Tool struct {
	Definition ToolDefinition
	Handler    ToolHandler
}
