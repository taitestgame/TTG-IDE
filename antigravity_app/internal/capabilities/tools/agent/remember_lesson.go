package agenttools

import (
	"context"
	"fmt"

	"ttgide/internal/capabilities"
)

// RegisterRememberLessonTool dang ky cong cu remember_lesson cho AI Agent
func RegisterRememberLessonTool(m *capabilities.Manager, host AgentHost) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "remember_lesson",
			Description: "Luu lai mot bai hoc kinh nghiem, quy uoc kien truc hoac giai phap quan trong vao Bo nho dai han cua du an de tai su dung o cac phien sau.",
			Category:    "memory",
			Parameters: map[string]any{
				"lesson": "Noi dung bai hoc hoac quy uoc can ghi nho lau dai",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			if host == nil {
				return "", fmt.Errorf("AgentHost chua duoc khoi tao de ghi nho bai hoc")
			}
			lesson, _ := args["lesson"].(string)
			if lesson == "" {
				return "", fmt.Errorf("tham so 'lesson' khong duoc de trong")
			}
			host.RememberLesson(lesson)
			return fmt.Sprintf("✓ Da ghi nho vao bo nho dai han: %s", lesson), nil
		},
	})
}
