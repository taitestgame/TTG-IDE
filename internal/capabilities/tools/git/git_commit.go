package git

import (
	"context"
	"fmt"

	"ttgide/internal/capabilities"
)

// RegisterGitCommitTool dang ky rieng cong cu git_commit
func RegisterGitCommitTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "git_commit",
			Description: "Alias tuong thich: Tu dong stage toan bo thay doi va tao mot commit moi trong Git.",
			Category:    "git",
			RequiresAuth: true,
			Parameters: map[string]any{
				"message": "thong diep commit (commit message)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			msg, _ := args["message"].(string)
			if msg == "" {
				return "", fmt.Errorf("thong diep commit khong duoc de trong")
			}
			if _, err := runGitRunner(ctx, workspaceRoot, "add", "-A"); err != nil {
				return "", err
			}
			return runGitRunner(ctx, workspaceRoot, "commit", "-m", msg)
		},
	})
}
