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
		path, ok := args["path"].(string)
		if !ok || path == "" {
			return "", fmt.Errorf("thieu tham so 'path'")
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
			}

			maxLines := 250
			endLine := 0
			if el, ok := args["end_line"].(float64); ok && el > 0 {
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

	// 1. Dang ky read_file (chuẩn TTG IDE)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "read_file",
			Description: "Doc noi dung file kem so thu tu dong (%4d | ). Tu dong phat hien file nhi phan (anh, pdf, zip). Ho tro cat dong (start_line, end_line) de tiet kiem token.",
			Category:    "fs",
			Parameters: map[string]any{
				"path":       "duong dan tuong doi hoac tuyet doi cua file can doc",
				"start_line": "dong bat dau doc (1-indexed, tuy chon, mac dinh la 1)",
				"end_line":   "dong ket thuc doc (tuy chon, mac dinh doc toi da 250 dong)",
			},
		},
		Handler: readHandler,
	})

	// 2. Dang ky view_file (chuẩn Google Antigravity 2.0)
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "view_file",
			Description: "Xem noi dung tap tin tren he thong (Antigravity parity). Ho tro StartLine, EndLine va nhan dien file nhi phan.",
			Category:    "fs",
			Parameters: map[string]any{
				"AbsolutePath": "duong dan tuyet doi hoac tuong doi toi file can xem",
				"StartLine":    "dong bat dau doc (1-indexed, tuy chon)",
				"EndLine":      "dong ket thuc doc (tuy chon)",
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

