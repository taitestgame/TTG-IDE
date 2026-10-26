package git

import (
	"context"

	"ttgide/internal/capabilities"
)

// RegisterGitStatusTool dang ky rieng cong cu git_status
func RegisterGitStatusTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "git_status",
			Description: "Alias tuong thich: Lay trang thai hien tai cua kho Git (cac file da sua doi, file moi).",
			Category:    "git",
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			return runGitRunner(ctx, workspaceRoot, "status", "--short")
		},
	})
}
