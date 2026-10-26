package git

import (
	"context"

	"ttgide/internal/capabilities"
)

// RegisterGitDiffTool dang ky rieng cong cu git_diff
func RegisterGitDiffTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "git_diff",
			Description: "Alias tuong thich: Hien thi chi tiet cac dong code thay doi so voi commit gan nhat.",
			Category:    "git",
			Parameters: map[string]any{
				"file": "chuoi ten file cu the (tuy chon)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			cmdArgs := []string{"diff"}
			if f, ok := args["file"].(string); ok && f != "" {
				cmdArgs = append(cmdArgs, f)
			}
			return runGitRunner(ctx, workspaceRoot, cmdArgs...)
		},
	})
}
