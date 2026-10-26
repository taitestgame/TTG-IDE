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
		path, _ := args["path"].(string)
		if path == "" {
			path, _ = args["TargetFile"].(string)
		}
		if path == "" {
			path, _ = args["targetFile"].(string)
		}
		if path == "" {
			path, _ = args["AbsolutePath"].(string)
		}
		if path == "" {
			return "", fmt.Errorf("thieu tham so 'path' hoac 'TargetFile'")
		}
		content, _ := args["content"].(string)
		if content == "" {
			content, _ = args["CodeContent"].(string)
		}
		fullPath := resolvePath(workspaceRoot, path)

		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			return "", fmt.Errorf("khong the tao thu muc cha: %w", err)
		}
		if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
			return "", fmt.Errorf("ghi file that bai: %w", err)
		}
		return fmt.Sprintf("Da tao/ghi de file thanh cong: %s (%d bytes)", path, len(content)), nil
	}

	// 1. Register write_file (Standard TTG IDE)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "write_file",
			Description: "Create a new file or completely overwrite an existing file with the provided content. Automatically creates parent directories if needed.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"path":    "Relative or absolute path of the file to create or overwrite",
				"content": "Full text or code content to write into the file",
			},
		},
		Handler: writeHandler,
	})

	// 2. Register write_to_file (Antigravity parity)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "write_to_file",
			Description: "Write content to a file on the filesystem (Antigravity parity). Requires TargetFile and CodeContent.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"TargetFile":  "Absolute or relative path to the target file",
				"CodeContent": "Full source code or text to write into the file",
				"Overwrite":   "Whether to overwrite an existing file (boolean, optional)",
			},
		},
		Handler: writeHandler,
	})

	// 3. Alias Claude Code
	m.RegisterAlias("FileWrite", "write_file")
}
