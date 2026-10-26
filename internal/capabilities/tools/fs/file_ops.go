package fs

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"ttgide/internal/capabilities"
)

// RegisterFileOpsTool dang ky rieng cong cu file_ops
func RegisterFileOpsTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "file_ops",
			Description: "Thao tac file/thu muc hop nhat: xoa (delete), di chuyen/doi ten (move), sao chep (copy).",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"action":      "hanh dong can thuc hien: 'delete', 'move', 'copy'",
				"path":        "duong dan file hoac thu muc goc",
				"target_path": "duong dan file hoac thu muc dich (cho move hoac copy)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			action, ok := args["action"].(string)
			if !ok || action == "" {
				return "", fmt.Errorf("thieu tham so 'action' (delete, move, copy)")
			}

			path, ok := args["path"].(string)
			if !ok || path == "" {
				return "", fmt.Errorf("thieu tham so 'path'")
			}
			src := resolvePath(workspaceRoot, path)

			switch action {
			case "delete":
				if err := os.RemoveAll(src); err != nil {
					return "", fmt.Errorf("xoa file/thu muc that bai: %w", err)
				}
				return fmt.Sprintf("Da xoa thanh cong: %s", path), nil

			case "move":
				target, _ := args["target_path"].(string)
				if target == "" {
					return "", fmt.Errorf("thieu tham so 'target_path' cho hanh dong move")
				}
				dst := resolvePath(workspaceRoot, target)
				if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
					return "", fmt.Errorf("khong the tao thu muc cha cho dich den: %w", err)
				}
				if err := os.Rename(src, dst); err != nil {
					return "", fmt.Errorf("di chuyen/doi ten that bai: %w", err)
				}
				return fmt.Sprintf("Da di chuyen/doi ten tu %s sang %s", path, target), nil

			case "copy":
				target, _ := args["target_path"].(string)
				if target == "" {
					return "", fmt.Errorf("thieu tham so 'target_path' cho hanh dong copy")
				}
				dst := resolvePath(workspaceRoot, target)
				if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
					return "", fmt.Errorf("khong the tao thu muc cha cho dich den: %w", err)
				}
				in, err := os.Open(src)
				if err != nil {
					return "", fmt.Errorf("khong the mo file nguon: %w", err)
				}
				defer in.Close()

				out, err := os.Create(dst)
				if err != nil {
					return "", fmt.Errorf("khong the tao file dich: %w", err)
				}
				defer out.Close()

				if _, err := io.Copy(out, in); err != nil {
					return "", fmt.Errorf("sao chep file that bai: %w", err)
				}
				return fmt.Sprintf("Da sao chep tu %s sang %s", path, target), nil

			default:
				return "", fmt.Errorf("hanh dong '%s' khong hop le. Cac hanh dong ho tro: delete, move, copy", action)
			}
		},
	})
}
