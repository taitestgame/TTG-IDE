package fs

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf16"

	"ttgide/internal/capabilities"
)

// RegisterReadFileTool dang ky rieng cong cu read_file va view_file (Antigravity)
func RegisterReadFileTool(m *capabilities.Manager, workspaceRoot string) {
	readHandler := func(ctx context.Context, args map[string]any) (string, error) {
		path, _ := args["path"].(string)
		if path == "" {
			path, _ = args["AbsolutePath"].(string)
		}
		if path == "" {
			path, _ = args["targetFile"].(string)
		}
		if path == "" {
			path, _ = args["filePath"].(string)
		}
		if path == "" {
			return "", fmt.Errorf("thieu tham so 'path' hoac 'AbsolutePath'")
		}
		fullPath := resolvePath(workspaceRoot, path)

		// 1. Kiem tra dinh dang file nhi phan (Antigravity parity)
		if isBinaryExtension(fullPath) {
			info, err := os.Stat(fullPath)
			sizeStr := "unknown"
			if err == nil {
				sizeStr = formatFileSize(info.Size())
			}
			return fmt.Sprintf("[TAP TIN NHI PHAN - BINARY FILE]: %s (%s). Khong the doc duoi dang van ban plain text.", path, sizeStr), nil
		}

		rawBytes, err := os.ReadFile(fullPath)
		if err != nil {
			return "", fmt.Errorf("khong the mo file de doc: %w", err)
		}

		startLine := 1
		if sl, ok := args["start_line"].(float64); ok && sl > 0 {
			startLine = int(sl)
		} else if sl, ok := args["StartLine"].(float64); ok && sl > 0 {
			startLine = int(sl)
		}

		maxLines := 800
		endLine := 0
		if el, ok := args["end_line"].(float64); ok && el > 0 {
			endLine = int(el)
		} else if el, ok := args["EndLine"].(float64); ok && el > 0 {
			endLine = int(el)
		} else {
			endLine = startLine + maxLines - 1
		}

			if endLine < startLine {
				return "", fmt.Errorf("end_line (%d) phai lon hon hoac bang start_line (%d)", endLine, startLine)
			}

			contentStr := DecodeToUTF8(rawBytes)
			scanner := bufio.NewScanner(strings.NewReader(contentStr))
			buf := make([]byte, 64*1024)
			scanner.Buffer(buf, 1024*1024)

			var lines []string
			currentLine := 0
			totalLines := 0

			for scanner.Scan() {
				currentLine++
				totalLines++
				if currentLine >= startLine && currentLine <= endLine {
					lines = append(lines, fmt.Sprintf("%4d | %s", currentLine, scanner.Text()))
				}
			}

			if err := scanner.Err(); err != nil {
				return "", fmt.Errorf("loi khi doc file: %w", err)
			}

			if totalLines > 0 && endLine > totalLines {
				endLine = totalLines
			}
			args["start_line"] = startLine
			args["end_line"] = endLine

			if len(lines) == 0 && startLine > totalLines {
				return fmt.Sprintf("File %s chi co %d dong (start_line=%d vuot qua cuoi file).", path, totalLines, startLine), nil
			}

			result := strings.Join(lines, "\n")
			if totalLines > endLine {
				result += fmt.Sprintf("\n\n... [CAT BOT: File co tong cong %d dong. Da hien thi dong %d-%d. Dung start_line=%d de doc tiep] ...", totalLines, startLine, endLine, endLine+1)
			}

			return result, nil
	}

	// 1. Register read_file (Standard TTG IDE)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "read_file",
			Description: "Read file contents with line numbers (%4d | ). Automatically detects binary files (images, pdf, zip). Supports start_line and end_line for token-efficient pagination.",
			Category:    "fs",
			Parameters: map[string]any{
				"path":       "Relative or absolute path of the file to read",
				"start_line": "Starting line number (1-indexed, optional, default: 1)",
				"end_line":   "Ending line number (optional, default: up to 250 lines)",
			},
		},
		Handler: readHandler,
	})

	// 2. Register view_file (Antigravity parity)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "view_file",
			Description: "View file contents from the filesystem (Antigravity parity). Supports StartLine, EndLine, and binary detection.",
			Category:    "fs",
			Parameters: map[string]any{
				"AbsolutePath": "Absolute or relative path to the file to view",
				"StartLine":    "Starting line number (1-indexed, optional)",
				"EndLine":      "Ending line number (optional)",
			},
		},
		Handler: readHandler,
	})

	// 3. Alias Claude Code
	m.RegisterAlias("FileRead", "read_file")
}

func isBinaryExtension(filePath string) bool {
	ext := strings.ToLower(filepath.Ext(filePath))
	binaryExts := map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".ico": true,
		".pdf": true, ".zip": true, ".tar": true, ".gz": true, ".7z": true, ".rar": true,
		".exe": true, ".bin": true, ".dll": true, ".so": true, ".dylib": true, ".wasm": true,
		".mp3": true, ".mp4": true, ".avi": true, ".mov": true, ".wav": true,
	}
	return binaryExts[ext]
}

// DecodeToUTF8 tu dong phat hien va chuyen doi UTF-16LE, UTF-16BE va strip UTF-8 BOM
func DecodeToUTF8(raw []byte) string {
	if len(raw) >= 3 && raw[0] == 0xef && raw[1] == 0xbb && raw[2] == 0xbf {
		return string(raw[3:])
	}
	if len(raw) >= 2 && raw[0] == 0xff && raw[1] == 0xfe {
		// UTF-16 LE
		u16 := make([]uint16, 0, len(raw)/2)
		for i := 2; i+1 < len(raw); i += 2 {
			u16 = append(u16, uint16(raw[i])|uint16(raw[i+1])<<8)
		}
		return string(utf16.Decode(u16))
	}
	if len(raw) >= 2 && raw[0] == 0xfe && raw[1] == 0xff {
		// UTF-16 BE
		u16 := make([]uint16, 0, len(raw)/2)
		for i := 2; i+1 < len(raw); i += 2 {
			u16 = append(u16, uint16(raw[i])<<8|uint16(raw[i+1]))
		}
		return string(utf16.Decode(u16))
	}
	return string(raw)
}

