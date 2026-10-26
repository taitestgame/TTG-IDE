package fs

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"ttgide/internal/capabilities"
)

// RegisterListDirTool dang ky rieng cong cu list_dir
func RegisterListDirTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "list_dir",
			Description: "List directory structure compactly, showing file sizes and children counts. Automatically filters out noisy directories like node_modules, .git, dist, etc.",
			Category:    "fs",
			Parameters: map[string]any{
				"path":  "Directory path to inspect (optional, default: workspace root)",
				"depth": "Depth level for listing subdirectories (optional, default: 1, max: 3)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			relPath, _ := args["path"].(string)
			if relPath == "" {
				relPath, _ = args["DirectoryPath"].(string)
			}
			if relPath == "" {
				relPath, _ = args["directoryPath"].(string)
			}
			if relPath == "" {
				relPath, _ = args["dir_path"].(string)
			}
			if relPath == "" {
				relPath, _ = args["dir"].(string)
			}
			targetDir := resolvePath(workspaceRoot, relPath)

			depth := 1
			if d, ok := args["depth"].(float64); ok && d > 0 {
				depth = int(d)
				if depth > 3 {
					depth = 3
				}
			}

			info, err := os.Stat(targetDir)
			if err != nil {
				return "", fmt.Errorf("thu muc khong ton tai hoac khong the truy cap: %w", err)
			}
			if !info.IsDir() {
				return "", fmt.Errorf("duong dan '%s' la mot file, khong phai thu muc", relPath)
			}

			var lines []string
			count := 0
			maxItems := 120

			var walkLevel func(currentDir string, currentDepth int, prefix string) error
			walkLevel = func(currentDir string, currentDepth int, prefix string) error {
				if currentDepth > depth || count >= maxItems {
					return nil
				}

				entries, err := os.ReadDir(currentDir)
				if err != nil {
					return err
				}

				var dirs []os.DirEntry
				var files []os.DirEntry

				for _, e := range entries {
					name := e.Name()
					if isIgnoredDir(name) {
						continue
					}
					if e.IsDir() {
						dirs = append(dirs, e)
					} else {
						files = append(files, e)
					}
				}

				sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name() < dirs[j].Name() })
				sort.Slice(files, func(i, j int) bool { return files[i].Name() < files[j].Name() })

				for _, d := range dirs {
					if count >= maxItems {
						break
					}
					subPath := filepath.Join(currentDir, d.Name())
					childCount := countChildren(subPath)
					lines = append(lines, fmt.Sprintf("%s[DIR]  %s/ (%d items)", prefix, d.Name(), childCount))
					count++

					if currentDepth < depth {
						_ = walkLevel(subPath, currentDepth+1, prefix+"  ")
					}
				}

				for _, f := range files {
					if count >= maxItems {
						break
					}
					fInfo, err := f.Info()
					sizeStr := "unknown"
					if err == nil {
						sizeStr = formatFileSize(fInfo.Size())
					}
					lines = append(lines, fmt.Sprintf("%s[FILE] %s (%s)", prefix, f.Name(), sizeStr))
					count++
				}

				return nil
			}

			if err := walkLevel(targetDir, 1, ""); err != nil {
				return "", fmt.Errorf("loi khi doc thu muc: %w", err)
			}

			displayPath := relPath
			if displayPath == "" {
				displayPath = "."
			}

			header := fmt.Sprintf("=== THU MUC: %s (Hien thi %d muc, do sau: %d) ===\n", displayPath, len(lines), depth)
			result := header + strings.Join(lines, "\n")
			if count >= maxItems {
				result += "\n\n... [CAT BOT: Thu muc co qua nhieu muc, chi hien thi 120 muc dau tien] ..."
			}
			return result, nil
		},
	})
}
