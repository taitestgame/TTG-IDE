package fs

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"ttgide/internal/capabilities"
)

// RegisterEditFileTool dang ky rieng cong cu edit_file voi bo so khop 3 lop, ho tro ca don le va Multi-Chunk replacements
func RegisterEditFileTool(m *capabilities.Manager, workspaceRoot string) {
	editHandler := func(ctx context.Context, args map[string]any) (string, error) {
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
		path = cleanPath(path)

		fullPath := resolvePath(workspaceRoot, path)
		data, err := os.ReadFile(fullPath)
		if err != nil {
			return "", fmt.Errorf("khong the mo file de sua: %w", err)
		}

		rawContent := string(data)
		isCRLF := strings.Contains(rawContent, "\r\n")
		content := strings.ReplaceAll(rawContent, "\r\n", "\n")

		// 1. Nang cap Multi-Chunk Replacements (Antigravity multi_replace_file_content parity)
		rawRepls, ok := args["replacements"].([]any)
		if !ok || len(rawRepls) == 0 {
			rawRepls, ok = args["ReplacementChunks"].([]any)
		}
		if ok && len(rawRepls) > 0 {
			return applyMultiReplacements(fullPath, content, rawRepls, path, isCRLF)
		}

		target, _ := args["target"].(string)
		if target == "" {
			target, _ = args["TargetContent"].(string)
		}
		replacement, _ := args["replacement"].(string)
		if replacement == "" {
			replacement, _ = args["ReplacementContent"].(string)
		}

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

		startLine := parseIntArg(args["start_line"], args["StartLine"], args["startLine"])
		endLine := parseIntArg(args["end_line"], args["EndLine"], args["endLine"])

		targetNorm := strings.ReplaceAll(target, "\r\n", "\n")
		replacementNorm := strings.ReplaceAll(replacement, "\r\n", "\n")

		// 3. Neu target rong nhung co replacement va pham vi dong (vi du end_line = 50, start_line = 1 hoac 0)
		if strings.TrimSpace(target) == "" && replacementNorm != "" && endLine > 0 {
			lines := strings.Split(content, "\n")
			sIdx := startLine - 1
			if sIdx < 0 {
				sIdx = 0
			}
			eIdx := endLine
			if eIdx > len(lines) {
				eIdx = len(lines)
			}
			if sIdx > len(lines) {
				sIdx = len(lines)
			}
			var newLines []string
			newLines = append(newLines, lines[:sIdx]...)
			newLines = append(newLines, replacementNorm)
			if eIdx < len(lines) {
				newLines = append(newLines, lines[eIdx:]...)
			}
			newContent := strings.Join(newLines, "\n")
			if isCRLF {
				newContent = strings.ReplaceAll(newContent, "\n", "\r\n")
			}
			if err := os.WriteFile(fullPath, []byte(newContent), 0644); err != nil {
				return "", fmt.Errorf("loi khi ghi file sau khi sua: %w", err)
			}
			return fmt.Sprintf("Da sua doi thanh cong cac dong %d-%d trong file: %s", startLine, endLine, path), nil
		}

		if target == "" {
			return "", fmt.Errorf("thieu doan ma muc tieu can thay the (target, diff hoac replacements)")
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

	// 1. Register edit_file (Standard TTG IDE)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "edit_file",
			Description: "Edit code in an existing file. Supports single snippet replacement (target/replacement or Cline-style SEARCH/REPLACE diff) and multi-snippet replacements (replacements: [{target, replacement}]). Tolerates whitespace/indentation variations.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"path":         "Relative or absolute path of the file to edit",
				"target":       "Original code snippet to replace (optional if using diff or replacements)",
				"replacement":  "New replacement code snippet (optional if using diff or replacements)",
				"diff":         "Cline-style SEARCH/REPLACE diff block (optional)",
				"replacements": "Array of replacement objects: [{target, replacement, start_line, end_line}] (optional)",
				"start_line":   "Start line number to constrain the search (1-indexed, optional)",
				"end_line":     "End line number to constrain the search (optional)",
			},
		},
		Handler: editHandler,
	})

	// 2. Register multi_replace_file_content (Antigravity parity)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "multi_replace_file_content",
			Description: "Replace multiple non-contiguous blocks of code in the same file (Antigravity parity). Each chunk contains TargetContent, ReplacementContent, StartLine, and EndLine.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"TargetFile":        "Absolute or relative path to the file to edit",
				"ReplacementChunks": "Array of replacement chunks: [{TargetContent, ReplacementContent, StartLine, EndLine}]",
			},
		},
		Handler: editHandler,
	})

	// 3. Register replace_file_content (Antigravity parity)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "replace_file_content",
			Description: "Replace a single contiguous block of code in a file (Antigravity parity). Requires TargetFile, TargetContent, and ReplacementContent.",
			Category:    "fs",
			RequiresAuth: true,
			Parameters: map[string]any{
				"TargetFile":         "Absolute or relative path to the file to edit",
				"TargetContent":      "Exact target code to replace",
				"ReplacementContent": "New replacement code",
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

// parseIntArg trich xuat so nguyen tu cac tham so co the la int, float64 hoac chuoi string so ("50")
func parseIntArg(vals ...any) int {
	for _, v := range vals {
		if v == nil {
			continue
		}
		switch val := v.(type) {
		case int:
			return val
		case int64:
			return int(val)
		case float64:
			return int(val)
		case string:
			trimmed := strings.TrimSpace(val)
			if n, err := strconv.Atoi(trimmed); err == nil {
				return n
			}
		}
	}
	return 0
}
