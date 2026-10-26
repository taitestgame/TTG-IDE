package fs

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"ttgide/internal/capabilities"
)

// RegisterMoveFileTool dang ky rieng cong cu move_file
func RegisterMoveFileTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "move_file",
			Description: "Di chuyen hoac doi ten file/thu muc tu duong dan cu sang duong dan moi.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"source":      "duong dan goc hien tai cua file",
				"destination": "duong dan moi can chuyen toi",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			src, ok1 := args["source"].(string)
			dst, ok2 := args["destination"].(string)
			if !ok1 || src == "" {
				src, _ = args["path"].(string)
			}
			if !ok2 || dst == "" {
				dst, _ = args["target_path"].(string)
			}
			if src == "" || dst == "" {
				return "", fmt.Errorf("thieu duong dan 'source' hoac 'destination'")
			}

			fullSrc := resolvePath(workspaceRoot, src)
			fullDst := resolvePath(workspaceRoot, dst)

			if err := os.MkdirAll(filepath.Dir(fullDst), 0755); err != nil {
				return "", fmt.Errorf("khong the tao thu muc cha cho destination: %w", err)
			}
			if err := os.Rename(fullSrc, fullDst); err != nil {
				return "", fmt.Errorf("di chuyen file that bai: %w", err)
			}
			return fmt.Sprintf("Da di chuyen thanh cong tu %s sang %s", src, dst), nil
		},
	})
}
