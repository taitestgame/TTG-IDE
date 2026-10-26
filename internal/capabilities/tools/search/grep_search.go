package search

import (
	"bytes"
	"context"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"ttgide/internal/capabilities"
)

// RegisterGrepSearchTool dang ky rieng cong cu grep_search ho tro context_lines va case_sensitive (Claude Code / Ripgrep parity)
func RegisterGrepSearchTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "grep_search",
			Description: "Tim kiem chuoi hoac regex xuyen qua cac file trong project. Ho tro context_lines (hien thi cac dong xung quanh nhu Claude Code/Ripgrep -C), loc includes (*.go) va case_sensitive.",
			Category:    "search",
			Parameters: map[string]any{
				"query":          "chuoi van ban hoac bieu thuc regex can tim",
				"includes":       "mau loc ten file (tuy chon, vi du: '*.go', '*.tsx')",
				"is_regex":       "true neu query la bieu thuc regex (tuy chon, mac dinh la false)",
				"context_lines":  "so dong ngu canh hien thi truoc va sau moi ket qua tim kiem (tuy chon, vi du: 2 hoac 3 de xem ham xung quanh)",
				"case_sensitive": "true neu muon phan biet chu hoa/chu thuong (tuy chon, mac dinh la false)",
				"max_results":    "so ket qua toi da (tuy chon, mac dinh 50)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			query, ok := args["query"].(string)
			if !ok || query == "" {
				return "", fmt.Errorf("thieu tham so 'query'")
			}

			includePattern, _ := args["includes"].(string)
			isRegex := false
			if r, ok := args["is_regex"].(bool); ok {
				isRegex = r
			}

			caseSensitive := false
			if cs, ok := args["case_sensitive"].(bool); ok {
				caseSensitive = cs
			}

			contextLines := 0
			if cl, ok := args["context_lines"].(float64); ok && cl > 0 {
				contextLines = int(cl)
			}

			maxResults := 50
			if mVal, ok := args["max_results"].(float64); ok && mVal > 0 {
				maxResults = int(mVal)
			}

			// Kiem tra ripgrep (rg) co san tren he thong
			if rgPath, err := exec.LookPath("rg"); err == nil {
				cmdArgs := []string{"-n", "--max-count", fmt.Sprintf("%d", maxResults), "--heading"}
				if !isRegex {
					cmdArgs = append(cmdArgs, "-F")
				}
				if !caseSensitive {
					cmdArgs = append(cmdArgs, "-i")
				}
				if contextLines > 0 {
					cmdArgs = append(cmdArgs, "-C", fmt.Sprintf("%d", contextLines))
				}
				if includePattern != "" {
					cmdArgs = append(cmdArgs, "--glob", includePattern)
				}
				cmdArgs = append(cmdArgs, query, ".")

				cmd := exec.CommandContext(ctx, rgPath, cmdArgs...)
				capabilities.HideWindow(cmd)
				cmd.Dir = workspaceRoot
				var stdout bytes.Buffer
				cmd.Stdout = &stdout
				_ = cmd.Run()
				output := strings.TrimSpace(stdout.String())
				if output != "" {
					return output, nil
				}
			}

			// Fallback sang Go scanner voi bo dem Context Lines
			var re *regexp.Regexp
			var err error
			patternPrefix := ""
			if !caseSensitive {
				patternPrefix = "(?i)"
			}

			if isRegex {
				re, err = regexp.Compile(patternPrefix + query)
				if err != nil {
					return "", fmt.Errorf("regex khong hop le: %w", err)
				}
			} else {
				re = regexp.MustCompile(patternPrefix + regexp.QuoteMeta(query))
			}

			var results []string
			_ = filepath.WalkDir(workspaceRoot, func(p string, d fs.DirEntry, err error) error {
				if err != nil || len(results) >= maxResults {
					return nil
				}
				name := d.Name()
				if d.IsDir() && isIgnoredDir(name) {
					return filepath.SkipDir
				}
				if d.IsDir() {
					return nil
				}

				if includePattern != "" {
					matched, _ := filepath.Match(includePattern, name)
					if !matched {
						return nil
					}
				}

				data, err := os.ReadFile(p)
				if err != nil {
					return nil
				}

				lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
				relPath, _ := filepath.Rel(workspaceRoot, p)
				slashPath := filepath.ToSlash(relPath)

				for i, line := range lines {
					if re.MatchString(line) {
						var block []string
						// Dong ngu canh phia truoc
						startIdx := i - contextLines
						if startIdx < 0 {
							startIdx = 0
						}
						for c := startIdx; c < i; c++ {
							block = append(block, fmt.Sprintf("%s-%d- %s", slashPath, c+1, lines[c]))
						}
						// Dong match chinh
						block = append(block, fmt.Sprintf("%s:%d: %s", slashPath, i+1, line))
						// Dong ngu canh phia sau
						endIdx := i + contextLines
						if endIdx >= len(lines) {
							endIdx = len(lines) - 1
						}
						for c := i + 1; c <= endIdx; c++ {
							block = append(block, fmt.Sprintf("%s-%d- %s", slashPath, c+1, lines[c]))
						}

						results = append(results, strings.Join(block, "\n"))
						if len(results) >= maxResults {
							break
						}
					}
				}
				return nil
			})

			if len(results) == 0 {
				return fmt.Sprintf("Khong tim thay ket qua phu hop cho query: '%s'", query), nil
			}
			return strings.Join(results, "\n---\n"), nil
		},
	})
}
