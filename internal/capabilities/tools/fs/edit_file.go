package fs

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"

	"ttgide/internal/capabilities"
)

// RegisterEditFileTool dang ky rieng cong cu edit_file voi bo so khop 3 lop, ho tro ca don le va Multi-Chunk replacements
func RegisterEditFileTool(m *capabilities.Manager, workspaceRoot string) {
	editHandler := func(ctx context.Context, args map[string]any) (string, error) {
		path, ok := args["path"].(string)
		if !ok || path == "" {
			return "", fmt.Errorf("thieu tham so 'path'")
		}

			fullPath := resolvePath(workspaceRoot, path)
			data, err := os.ReadFile(fullPath)
			if err != nil {
				return "", fmt.Errorf("khong the mo file de sua: %w", err)
			}

			rawContent := string(data)
			isCRLF := strings.Contains(rawContent, "\r\n")
			content := strings.ReplaceAll(rawContent, "\r\n", "\n")

			// 1. Nang cap Multi-Chunk Replacements (Antigravity multi_replace_file_content parity)
			if rawRepls, ok := args["replacements"].([]any); ok && len(rawRepls) > 0 {
				return applyMultiReplacements(fullPath, content, rawRepls, path, isCRLF)
			}

			target, _ := args["target"].(string)
			replacement, _ := args["replacement"].(string)

			// 2. Trich xuat tu khoi diff Cline neu co
			if diff, ok := args["diff"].(string); ok && diff != "" {
				extractedTarget, extractedRepl, err := parseSearchReplaceBlock(diff)
				if err == nil {
					target = extractedTarget
					replacement = extractedRepl
				}
			} else if strings.Contains(target, "<<<<<<< SEARCH") {
				extractedTarget, extractedRepl, err := parseSearchReplaceBlock(target)
				if err == nil {
					target = extractedTarget
					replacement = extractedRepl
				}
			}

			if target == "" {
				return "", fmt.Errorf("thieu doan ma muc tieu can thay the (target, diff hoac replacements)")
			}

			targetNorm := strings.ReplaceAll(target, "\r\n", "\n")
			replacementNorm := strings.ReplaceAll(replacement, "\r\n", "\n")

			startLine := 0
			endLine := 0
			if sl, ok := args["start_line"].(float64); ok && sl > 0 {
				startLine = int(sl)
			}
			if el, ok := args["end_line"].(float64); ok && el > 0 {
				endLine = int(el)
			}

			newContent, replaced := applyTolerantEditWithBounds(content, targetNorm, replacementNorm, startLine, endLine)
			if !replaced {
				return "", fmt.Errorf("khong tim thay doan ma 'target' trong file %s.\nGoi y: Hay dung 'read_file' de xem ma nguon va so dong chinh xac truoc khi sua.", path)
			}

			if isCRLF {
				newContent = strings.ReplaceAll(newContent, "\n", "\r\n")
			}

			if err := os.WriteFile(fullPath, []byte(newContent), 0644); err != nil {
				return "", fmt.Errorf("loi khi ghi file sau khi sua: %w", err)
			}

			return fmt.Sprintf("Da sua doi thanh cong ma nguon trong file: %s", path), nil
	}

	// 1. Dang ky edit_file (chuan TTG IDE)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "edit_file",
			Description: "Sua ma nguon ben bi trong file. Ho tro ca 1 khoi (target/replacement hoac diff SEARCH/REPLACE kieu Cline) va nhieu khoi cung luc (replacements: [ {target, replacement} ]), bo qua lech khoang trang/tab va gioi han khoang dong.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"path":         "duong dan file can sua",
				"target":       "doan ma goc can thay the (tuy chon neu dung diff hoac replacements)",
				"replacement":  "doan ma moi thay the vao (tuy chon neu dung diff hoac replacements)",
				"diff":         "khoi SEARCH/REPLACE theo dinh dang Cline (tuy chon)",
				"replacements": "danh sach nhieu doan ma can thay the dong thoi trong cung 1 turn (array of objects chua target, replacement, start_line, end_line)",
				"start_line":   "dong bat dau gioi han tim kiem (1-indexed, tuy chon)",
				"end_line":     "dong ket thuc gioi han tim kiem (tuy chon)",
			},
		},
		Handler: editHandler,
	})

	// 2. Dang ky multi_replace_file_content (chuan Google Antigravity 2.0)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "multi_replace_file_content",
			Description: "Thay the nhieu khoi ma nguon khong lien tuc trong cung mot file (Antigravity parity). Moi khoi chua TargetContent, ReplacementContent, StartLine, EndLine.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"TargetFile":        "duong dan tuyet doi hoac tuong doi toi file can sua",
				"ReplacementChunks": "danh sach cac khoi thay the (array of objects chua TargetContent, ReplacementContent, StartLine, EndLine)",
			},
		},
		Handler: editHandler,
	})

	// 3. Dang ky replace_file_content (chuan Google Antigravity 2.0 don khoi)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "replace_file_content",
			Description: "Thay the mot khoi ma nguon trong file (Antigravity parity). Yeu cau TargetFile, TargetContent, ReplacementContent.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"TargetFile":         "duong dan file can sua",
				"TargetContent":      "doan ma goc can thay the",
				"ReplacementContent": "doan ma moi thay the vao",
			},
		},
		Handler: editHandler,
	})

	// 4. Cac alias tuong thich nguoc va da nen tang
	m.RegisterAlias("replace_in_file", "edit_file")
	m.RegisterAlias("FileEdit", "edit_file")
}

// applyMultiReplacements thuc hien thay the nhieu doan ma cung luc voi nguyen tac nguyen tu (atomic)
func applyMultiReplacements(fullPath, content string, repls []any, displayPath string, isCRLF bool) (string, error) {
	currentContent := content
	appliedCount := 0

	for i, item := range repls {
		obj, ok := item.(map[string]any)
		if !ok {
			return "", fmt.Errorf("khoi replacement thu %d khong hop le (phai la object)", i+1)
		}

		target, _ := obj["target"].(string)
		if target == "" {
			target, _ = obj["TargetContent"].(string)
		}
		replacement, _ := obj["replacement"].(string)
		if replacement == "" {
			replacement, _ = obj["ReplacementContent"].(string)
		}

		if diff, ok := obj["diff"].(string); ok && diff != "" {
			if t, r, err := parseSearchReplaceBlock(diff); err == nil {
				target = t
				replacement = r
			}
		}

		if target == "" {
			return "", fmt.Errorf("khoi replacement thu %d thieu tham so 'target' hoac 'TargetContent'", i+1)
		}

		targetNorm := strings.ReplaceAll(target, "\r\n", "\n")
		replacementNorm := strings.ReplaceAll(replacement, "\r\n", "\n")

		startLine := 0
		endLine := 0
		if sl, ok := obj["start_line"].(float64); ok && sl > 0 {
			startLine = int(sl)
		} else if sl, ok := obj["StartLine"].(float64); ok && sl > 0 {
			startLine = int(sl)
		}
		if el, ok := obj["end_line"].(float64); ok && el > 0 {
			endLine = int(el)
		} else if el, ok := obj["EndLine"].(float64); ok && el > 0 {
			endLine = int(el)
		}

		newContent, replaced := applyTolerantEditWithBounds(currentContent, targetNorm, replacementNorm, startLine, endLine)
		if !replaced {
			return "", fmt.Errorf("that bai o khoi replacement thu %d/%d: Khong tim thay 'target' trong file %s. Da huy toan bo thay doi de bao ve file.", i+1, len(repls), displayPath)
		}

		currentContent = newContent
		appliedCount++
	}

	if isCRLF {
		currentContent = strings.ReplaceAll(currentContent, "\n", "\r\n")
	}

	if err := os.WriteFile(fullPath, []byte(currentContent), 0644); err != nil {
		return "", fmt.Errorf("loi khi ghi file sau khi thuc hien multi-replacement: %w", err)
	}

	return fmt.Sprintf("✓ Da sua doi thanh cong %d khoi ma nguon trong file: %s", appliedCount, displayPath), nil
}

// parseSearchReplaceBlock trich xuat target va replacement tu khoi SEARCH/REPLACE cua Cline
func parseSearchReplaceBlock(diff string) (string, string, error) {
	re := regexp.MustCompile(`(?s)<<<<<<< SEARCH\r?\n(.*?)\r?\n=======\r?\n(.*?)\r?\n>>>>>>> REPLACE`)
	matches := re.FindStringSubmatch(diff)
	if len(matches) == 3 {
		return matches[1], matches[2], nil
	}
	return "", "", fmt.Errorf("dinh dang SEARCH/REPLACE khong hop le")
}

// applyTolerantEdit ap dung bo so khop 2 lop (Exact -> Trimmed Line Match)
func applyTolerantEdit(content, target, replacement string) (string, bool) {
	if strings.Contains(content, target) {
		return strings.Replace(content, target, replacement, 1), true
	}

	cLines := strings.Split(content, "\n")
	tLines := strings.Split(target, "\n")

	startT := 0
	for startT < len(tLines) && strings.TrimSpace(tLines[startT]) == "" {
		startT++
	}
	endT := len(tLines)
	for endT > startT && strings.TrimSpace(tLines[endT-1]) == "" {
		endT--
	}
	tLinesTrimmed := tLines[startT:endT]
	if len(tLinesTrimmed) == 0 {
		return content, false
	}

	matchLen := len(tLinesTrimmed)
	for i := 0; i <= len(cLines)-matchLen; i++ {
		matched := true
		for j := 0; j < matchLen; j++ {
			if strings.TrimSpace(cLines[i+j]) != strings.TrimSpace(tLinesTrimmed[j]) {
				matched = false
				break
			}
		}

		if matched {
			var resultLines []string
			resultLines = append(resultLines, cLines[:i]...)
			if replacement != "" {
				resultLines = append(resultLines, replacement)
			}
			resultLines = append(resultLines, cLines[i+matchLen:]...)
			return strings.Join(resultLines, "\n"), true
		}
	}

	return content, false
}

func applyTolerantEditWithBounds(content, target, replacement string, startLine, endLine int) (string, bool) {
	cLines := strings.Split(content, "\n")
	tLines := strings.Split(target, "\n")

	startT := 0
	for startT < len(tLines) && strings.TrimSpace(tLines[startT]) == "" {
		startT++
	}
	endT := len(tLines)
	for endT > startT && strings.TrimSpace(tLines[endT-1]) == "" {
		endT--
	}
	tLinesTrimmed := tLines[startT:endT]
	if len(tLinesTrimmed) == 0 {
		return content, false
	}

	searchStart := 0
	searchEnd := len(cLines)
	if startLine > 0 && startLine-1 < len(cLines) {
		searchStart = startLine - 1
	}
	if endLine > 0 && endLine <= len(cLines) && endLine > searchStart {
		searchEnd = endLine
	}

	matchLen := len(tLinesTrimmed)
	for i := searchStart; i <= searchEnd-matchLen && i <= len(cLines)-matchLen; i++ {
		matched := true
		for j := 0; j < matchLen; j++ {
			if strings.TrimSpace(cLines[i+j]) != strings.TrimSpace(tLinesTrimmed[j]) {
				matched = false
				break
			}
		}

		if matched {
			var resultLines []string
			resultLines = append(resultLines, cLines[:i]...)
			if replacement != "" {
				resultLines = append(resultLines, replacement)
			}
			resultLines = append(resultLines, cLines[i+matchLen:]...)
			return strings.Join(resultLines, "\n"), true
		}
	}

	if startLine > 0 || endLine > 0 {
		return applyTolerantEdit(content, target, replacement)
	}

	return content, false
}
