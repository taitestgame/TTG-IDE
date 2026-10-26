package search

import (
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"

	"ttgide/internal/capabilities"
)

// RegisterFindFilesTool dang ky rieng cong cu find_files
func RegisterFindFilesTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "find_files",
			Description: "Tim nhanh cac file trong project theo ten hoac mau glob (vi du: '*harness*.go', '*.json').",
			Category:    "search",
			Parameters: map[string]any{
				"pattern": "mau ten file can tim (vi du: '*.go', '*test*')",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			pattern, ok := args["pattern"].(string)
			if !ok || pattern == "" {
				pattern, ok = args["Pattern"].(string)
			}
			if !ok || pattern == "" {
				pattern, ok = args["query"].(string)
			}
			if !ok || pattern == "" {
				pattern, ok = args["Query"].(string)
			}
			if !ok || pattern == "" {
				pattern, ok = args["glob"].(string)
			}
			if !ok || pattern == "" {
				return "", fmt.Errorf("thieu tham so 'pattern'")
			}

			searchPath, _ := args["path"].(string)
			if searchPath == "" {
				searchPath, _ = args["SearchPath"].(string)
			}
			if searchPath == "" {
				searchPath, _ = args["search_path"].(string)
			}
			if searchPath == "" {
				searchPath, _ = args["dir"].(string)
			}
			targetRoot := workspaceRoot
			if searchPath != "" {
				if filepath.IsAbs(searchPath) {
					targetRoot = searchPath
				} else {
					targetRoot = filepath.Join(workspaceRoot, searchPath)
				}
			}

			var matches []string
			maxFiles := 50

			_ = filepath.WalkDir(targetRoot, func(p string, d fs.DirEntry, err error) error {
				if err != nil || len(matches) >= maxFiles {
					return nil
				}
				name := d.Name()
				if d.IsDir() && isIgnoredDir(name) {
					return filepath.SkipDir
				}
				if d.IsDir() {
					return nil
				}

				matched, _ := filepath.Match(pattern, name)
				if !matched {
					if !strings.Contains(pattern, "*") && strings.Contains(strings.ToLower(name), strings.ToLower(pattern)) {
						matched = true
					}
				}

				if matched {
					relPath, _ := filepath.Rel(workspaceRoot, p)
					matches = append(matches, filepath.ToSlash(relPath))
				}
				return nil
			})

			if len(matches) == 0 {
				return fmt.Sprintf("Khong tim thay file nao khop voi pattern: '%s'", pattern), nil
			}
			return strings.Join(matches, "\n"), nil
		},
	})
}
