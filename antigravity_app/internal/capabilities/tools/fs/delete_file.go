package fs

import (
	"context"
	"fmt"
	"os"

	"ttgide/internal/capabilities"
)

// RegisterDeleteFileTool dang ky rieng cong cu delete_file
func RegisterDeleteFileTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "delete_file",
			Description: "Permanently delete a file or directory from the workspace.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"path": "Relative or absolute path of the file or directory to delete",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			path, ok := args["path"].(string)
			if !ok || path == "" {
				return "", fmt.Errorf("thieu tham so 'path'")
			}
			fullPath := resolvePath(workspaceRoot, path)
			if err := os.RemoveAll(fullPath); err != nil {
				return "", fmt.Errorf("xoa file that bai: %w", err)
			}
			return fmt.Sprintf("Da xoa thanh cong: %s", path), nil
		},
	})
}
