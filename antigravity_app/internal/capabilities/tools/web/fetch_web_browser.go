package web

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"ttgide/internal/capabilities"
)

// RegisterBrowserTool đăng ký công cụ cào web nâng cao bằng trình duyệt thật (Headless Browser)
// Được kích hoạt khi HTTP request thông thường bị chặn (403/429/Cloudflare) hoặc trang web cần chạy JavaScript
func RegisterBrowserTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "fetch_web_browser",
			Description: "Mở trình duyệt ngầm (Headless Chrome/Edge) để tải trang web. Có khả năng chạy JavaScript đầy đủ, vượt qua các trang Single Page App và cơ chế chống bot/Cloudflare mà HTTP Request thông thường không xem được.",
			Category:    "web",
			Parameters: map[string]any{
				"url":             "chuỗi URL cần truy cập",
				"wait_seconds":    "thời gian chờ trang web chạy xong JavaScript (mặc định 5s)",
				"take_screenshot": "boolean (true nếu muốn chụp ảnh màn hình lưu vào workspace)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			rawURL, ok := args["url"].(string)
			if !ok || rawURL == "" {
				return "", fmt.Errorf("thiếu tham số 'url'")
			}

			waitSeconds := 5
			if w, ok := args["wait_seconds"].(float64); ok && w > 0 {
				waitSeconds = int(w)
			}

			takeScreenshot, _ := args["take_screenshot"].(bool)

			// 1. Tìm kiếm đường dẫn trình duyệt thực tế có sẵn trên máy (Edge, Chrome hoặc Chromium)
			browserPath := findBrowserExecutable()
			if browserPath == "" {
				return "", fmt.Errorf("không tìm thấy trình duyệt (Microsoft Edge hoặc Google Chrome) trên máy để thực thi chế độ Browser")
			}

			// 2. Thiết lập thời gian timeout cho tiến trình headless browser
			execCtx, cancel := context.WithTimeout(ctx, time.Duration(waitSeconds+15)*time.Second)
			defer cancel()

			cmdArgs := []string{
				"--headless=new",
				"--disable-gpu",
				"--no-sandbox",
				"--disable-dev-shm-usage",
				fmt.Sprintf("--virtual-time-budget=%d", waitSeconds*1000), // Cho phép chạy JS trong waitSeconds
				"--dump-dom", // Kết xuất mã nguồn DOM đầy đủ sau khi thực thi JavaScript
				"--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
			}

			// Tùy chọn chụp ảnh màn hình nếu được yêu cầu
			screenshotPath := ""
			if takeScreenshot {
				screenshotFileName := fmt.Sprintf("screenshot_%d.png", time.Now().UnixMilli())
				screenshotPath = filepath.Join(workspaceRoot, screenshotFileName)
				cmdArgs = append(cmdArgs, fmt.Sprintf("--screenshot=%s", screenshotPath))
			}

			cmdArgs = append(cmdArgs, rawURL)

			cmd := exec.CommandContext(execCtx, browserPath, cmdArgs...)
			capabilities.HideWindow(cmd)
			var stdout, stderr bytes.Buffer
			cmd.Stdout = &stdout
			cmd.Stderr = &stderr

			err := cmd.Run()
			domOutput := stdout.String()

			if err != nil && len(domOutput) == 0 {
				return "", fmt.Errorf("trình duyệt headless gặp lỗi khi truy cập %s: %w\nStderr: %s", rawURL, err, stderr.String())
			}

			// 3. Làm sạch DOM và trích xuất nội dung văn bản cho AI
			cleanText := stripHTML(domOutput)
			if len(cleanText) > 12000 {
				cleanText = cleanText[:12000] + "\n\n...[Nội dung DOM còn tiếp nhưng đã được cắt ngắn]..."
			}

			var result strings.Builder
			result.WriteString(fmt.Sprintf("=== NỘI DUNG TẢI BẰNG TRÌNH DUYỆT (HEADLESS BROWSER): %s ===\n", rawURL))
			result.WriteString(fmt.Sprintf("Trình duyệt sử dụng: %s\n", filepath.Base(browserPath)))
			if screenshotPath != "" {
				result.WriteString(fmt.Sprintf("Ảnh chụp màn hình đã lưu tại: %s\n", screenshotPath))
			}
			result.WriteString("\n[NỘI DUNG VĂN BẢN TRÍCH XUẤT]:\n")
			result.WriteString(cleanText)

			return result.String(), nil
		},
	})
}

// findBrowserExecutable tìm file thực thi của Edge hoặc Chrome trên hệ điều hành Windows/Linux/macOS
func findBrowserExecutable() string {
	if runtime.GOOS == "windows" {
		candidates := []string{
			// Microsoft Edge (luôn có sẵn 100% trên Windows 10/11)
			`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
			// Google Chrome
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
			os.Getenv("LOCALAPPDATA") + `\Google\Chrome\Application\chrome.exe`,
			os.Getenv("LOCALAPPDATA") + `\Microsoft\Edge\Application\msedge.exe`,
		}
		for _, path := range candidates {
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
	} else if runtime.GOOS == "darwin" {
		candidates := []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
		}
		for _, path := range candidates {
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
	} else {
		// Linux
		candidates := []string{"google-chrome", "chromium-browser", "chromium", "microsoft-edge"}
		for _, name := range candidates {
			if path, err := exec.LookPath(name); err == nil {
				return path
			}
		}
	}

	return ""
}
