package web

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"ttgide/internal/capabilities"
)

// RegisterHTTPRequestTool đăng ký công cụ cào web / tải nội dung thông qua HTTP Request thông thường (nhanh, nhẹ)
func RegisterHTTPRequestTool(m *capabilities.Manager) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "fetch_web_request",
			Description: "Tải và trích xuất nội dung từ một URL thông qua giao thức HTTP Request (nhanh, nhẹ, không tốn RAM). Tự động phát hiện nếu bị chặn để đề xuất chuyển sang Browser.",
			Category:    "web",
			Parameters: map[string]any{
				"url":     "chuỗi URL cần truy cập (bắt đầu bằng http:// hoặc https://)",
				"timeout": "thời gian chờ tối đa bằng giây (tùy chọn, mặc định 15s)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			rawURL, ok := args["url"].(string)
			if !ok || rawURL == "" {
				return "", fmt.Errorf("thiếu tham số 'url'")
			}

			timeoutSec := 15
			if t, ok := args["timeout"].(float64); ok && t > 0 {
				timeoutSec = int(t)
			}

			client := &http.Client{
				Timeout: time.Duration(timeoutSec) * time.Second,
			}

			req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
			if err != nil {
				return "", fmt.Errorf("không thể tạo HTTP request: %w", err)
			}

			// Giả lập Headers trình duyệt thông dụng để giảm thiểu rủi ro bị chặn 403
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
			req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
			req.Header.Set("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7")

			resp, err := client.Do(req)
			if err != nil {
				return "", fmt.Errorf("lỗi kết nối khi gửi request tới %s: %w", rawURL, err)
			}
			defer resp.Body.Close()

			bodyBytes, err := io.ReadAll(resp.Body)
			if err != nil {
				return "", fmt.Errorf("lỗi đọc dữ liệu phản hồi: %w", err)
			}
			bodyStr := string(bodyBytes)

			// 1. Kiểm tra mã phản hồi HTTP có bị chặn không
			if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
				return "", fmt.Errorf("REQUEST_BLOCKED (Mã %d): Trang web chặn HTTP Request thông thường. Hãy chuyển sang dùng tool 'fetch_web_browser' để vượt qua bảo vệ", resp.StatusCode)
			}

			// 2. Kiểm tra các dấu hiệu trang web yêu cầu JavaScript hoặc có Cloudflare/DDoS Shield
			lowerBody := strings.ToLower(bodyStr)
			isAntiBot := strings.Contains(lowerBody, "cloudflare") ||
				strings.Contains(lowerBody, "checking your browser") ||
				strings.Contains(lowerBody, "enable javascript to run this app") ||
				strings.Contains(lowerBody, "please enable javascript") ||
				strings.Contains(lowerBody, "just a moment...") ||
				strings.Contains(lowerBody, "captcha")

			if isAntiBot {
				return "", fmt.Errorf("REQUEST_BLOCKED: Phát hiện trang web bắt buộc thực thi JavaScript hoặc bật tường lửa Anti-Bot/Cloudflare. Hãy chuyển sang dùng tool 'fetch_web_browser'")
			}

			// 3. Trích xuất văn bản sạch từ HTML (loại bỏ thẻ style, script, html tags)
			cleanText := stripHTML(bodyStr)

			// Giới hạn độ dài trả về để tránh quá tải token của LLM
			if len(cleanText) > 10000 {
				cleanText = cleanText[:10000] + "\n\n...[Nội dung còn tiếp nhưng đã được cắt bớt để tối ưu token]..."
			}

			return fmt.Sprintf("=== NỘI DUNG TẢI TỪ (HTTP REQUEST): %s ===\n%s", rawURL, cleanText), nil
		},
	})
}

// stripHTML làm sạch các thẻ HTML và giữ lại văn bản hữu ích
func stripHTML(htmlStr string) string {
	// Xóa thẻ script và style
	reScript := regexp.MustCompile(`(?is)<script.*?>.*?</script>`)
	htmlStr = reScript.ReplaceAllString(htmlStr, "")
	reStyle := regexp.MustCompile(`(?is)<style.*?>.*?</style>`)
	htmlStr = reStyle.ReplaceAllString(htmlStr, "")

	// Xóa các thẻ HTML còn lại
	reTag := regexp.MustCompile(`<[^>]*>`)
	text := reTag.ReplaceAllString(htmlStr, " ")

	// Chuẩn hóa khoảng trắng và dòng trống
	lines := strings.Split(text, "\n")
	var cleanedLines []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			cleanedLines = append(cleanedLines, trimmed)
		}
	}
	return strings.Join(cleanedLines, "\n")
}
