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
			Description: "Search for string or regex patterns across files in the workspace. Supports context_lines (showing surrounding lines like Ripgrep -C), file filtering via includes (*.go), and case_sensitive.",
			Category:    "search",
			Parameters: map[string]any{
				"query":          "Text string or regex pattern to search for",
				"includes":       "File pattern to filter (optional, e.g. '*.go', '*.tsx')",
				"is_regex":       "Whether query is a regex pattern (boolean, optional, default: false)",
				"context_lines":  "Number of surrounding context lines to display before and after match (optional, default: 0)",
				"case_sensitive": "Whether search is case-sensitive (boolean, optional, default: false)",
				"max_results":    "Maximum number of match results to return (optional, default: 50)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			query, ok := args["query"].(string)
			if !ok || query == "" {
				query, ok = args["Query"].(string)
			}
			if !ok || query == "" {
				return "", fmt.Errorf("thieu tham so 'query'")
			}

			searchPath, _ := args["path"].(string)
			if searchPath == "" {
				searchPath, _ = args["SearchPath"].(string)
			}
			if searchPath == "" {
				searchPath, _ = args["search_path"].(string)
			}
			targetRoot := workspaceRoot
			if searchPath != "" {
				if filepath.IsAbs(searchPath) {
					targetRoot = searchPath
				} else {
					targetRoot = filepath.Join(workspaceRoot, searchPath)
				}
			}

			var includePatterns []string
			if incStr, ok := args["includes"].(string); ok && incStr != "" {
				includePatterns = append(includePatterns, incStr)
			} else if incArr, ok := args["includes"].([]any); ok {
				for _, item := range incArr {
					if s, ok := item.(string); ok && s != "" {
						includePatterns = append(includePatterns, s)
					}
				}
			} else if incArrStr, ok := args["Includes"].([]string); ok {
				includePatterns = append(includePatterns, incArrStr...)
			} else if incArrAny, ok := args["Includes"].([]any); ok {
				for _, item := range incArrAny {
					if s, ok := item.(string); ok && s != "" {
						includePatterns = append(includePatterns, s)
					}
				}
			} else if incStr2, ok := args["Includes"].(string); ok && incStr2 != "" {
				includePatterns = append(includePatterns, incStr2)
			}

			isRegex := false
			if r, ok := args["is_regex"].(bool); ok {
				isRegex = r
			} else if r2, ok := args["IsRegex"].(bool); ok {
				isRegex = r2
			}

			caseSensitive := false
			if cs, ok := args["case_sensitive"].(bool); ok {
				caseSensitive = cs
			} else if ci, ok := args["CaseInsensitive"].(bool); ok {
				caseSensitive = !ci
			} else if cs2, ok := args["CaseSensitive"].(bool); ok {
				caseSensitive = cs2
			}

			contextLines := 0
			if cl, ok := args["context_lines"].(float64); ok && cl > 0 {
				contextLines = int(cl)
			} else if cl2, ok := args["ContextLines"].(float64); ok && cl2 > 0 {
				contextLines = int(cl2)
			}

			maxResults := 50
			if mVal, ok := args["max_results"].(float64); ok && mVal > 0 {
				maxResults = int(mVal)
			} else if mVal2, ok := args["MaxResults"].(float64); ok && mVal2 > 0 {
				maxResults = int(mVal2)
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
				for _, pat := range includePatterns {
					cmdArgs = append(cmdArgs, "--glob", pat)
				}
				cmdArgs = append(cmdArgs, query, targetRoot)

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
			_ = filepath.WalkDir(targetRoot, func(p string, d fs.DirEntry, err error) error {
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

				if len(includePatterns) > 0 {
					anyMatched := false
					for _, pat := range includePatterns {
						if m, _ := filepath.Match(pat, name); m {
							anyMatched = true
							break
						}
					}
					if !anyMatched {
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
