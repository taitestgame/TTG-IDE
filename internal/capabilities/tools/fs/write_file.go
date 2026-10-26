package fs

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"ttgide/internal/capabilities"
)

// RegisterWriteFileTool dang ky cong cu write_file va write_to_file (Antigravity)
func RegisterWriteFileTool(m *capabilities.Manager, workspaceRoot string) {
	writeHandler := func(ctx context.Context, args map[string]any) (string, error) {
		path, ok := args["path"].(string)
		if !ok || path == "" {
			return "", fmt.Errorf("thieu tham so 'path'")
		}
		content, _ := args["content"].(string)
		fullPath := resolvePath(workspaceRoot, path)

		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			return "", fmt.Errorf("khong the tao thu muc cha: %w", err)
		}
		if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
			return "", fmt.Errorf("ghi file that bai: %w", err)
		}
		return fmt.Sprintf("Da tao/ghi de file thanh cong: %s (%d bytes)", path, len(content)), nil
	}

	// 1. Dang ky write_file (chuan TTG IDE)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "write_file",
			Description: "Tao them mot file moi hoac ghi de toan bo file hien co voi noi dung duoc cung cap. Tu dong tao thu muc cha neu chua co.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"path":    "chuoi duong dan file can tao hoac ghi de",
				"content": "toan bo noi dung van ban can ghi vao file",
			},
		},
		Handler: writeHandler,
	})

	// 2. Dang ky write_to_file (chuan Google Antigravity 2.0)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "write_to_file",
			Description: "Ghi noi dung tap tin tren he thong (Antigravity parity). Yeu cau TargetFile va CodeContent.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"TargetFile":  "duong dan tuyet doi hoac tuong doi toi file can ghi",
				"CodeContent": "toan bo ma nguon hoac noi dung can ghi vao file",
				"Overwrite":   "cho phep ghi de neu file da ton tai (boolean)",
			},
		},
		Handler: writeHandler,
	})

	// 3. Alias Claude Code
	m.RegisterAlias("FileWrite", "write_file")
}
