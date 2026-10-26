package web

import (
	"context"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"ttgide/internal/capabilities"
)

var (
	reUddgURL  = regexp.MustCompile(`uddg=([^&"]+)`)
	reSnippet  = regexp.MustCompile(`(?s)<a class="result__snippet"[^>]*>(.*?)</a>`)
	reHTMLTags = regexp.MustCompile(`<[^>]+>`)
	reTitle    = regexp.MustCompile(`(?s)<a class="result__url"[^>]*>(.*?)</a>`)
)

// RegisterSearchWebTool đăng ký công cụ tìm kiếm trên Internet (Google/DuckDuckGo Engine)
func RegisterSearchWebTool(m *capabilities.Manager) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "search_web",
			Description: "Tìm kiếm thông tin, tài liệu kỹ thuật, thư viện, mã nguồn trên Internet. Trả về danh sách kết quả gồm tiêu đề, liên kết URL gốc và đoạn trích tóm tắt (snippet) chi tiết.",
			Category:    "web",
			Parameters: map[string]any{
				"query":       "từ khóa hoặc câu hỏi cần tìm kiếm trên Internet (ví dụ: 'nextjs ecommerce template github')",
				"num_results": "số lượng kết quả mong muốn (tùy chọn, mặc định 5, tối đa 10)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			query, _ := args["query"].(string)
			if query == "" {
				// Fallback nếu model dùng tham số 'q' hoặc 'search' hoặc 'url'
				if q, ok := args["q"].(string); ok && q != "" {
					query = q
				} else if s, ok := args["search"].(string); ok && s != "" {
					query = s
				} else if u, ok := args["url"].(string); ok && u != "" {
					// Nếu truyền nhầm URL, điều hướng sang fetch_web_request
					return m.Execute(ctx, "fetch_web_request", map[string]any{"url": u})
				}
			}

			query = strings.TrimSpace(query)
			if query == "" {
				return "", fmt.Errorf("thiếu tham số 'query' cần tìm kiếm")
			}

			numResults := 5
			if n, ok := args["num_results"].(float64); ok && n > 0 {
				numResults = int(n)
			}
			if numResults > 10 {
				numResults = 10
			}

			// Thực hiện tìm kiếm qua DuckDuckGo HTML
			results, err := executeWebSearch(ctx, query, numResults)
			if err != nil {
				return "", fmt.Errorf("lỗi khi tìm kiếm web: %w", err)
			}

			if len(results) == 0 {
				return fmt.Sprintf("Không tìm thấy kết quả phù hợp trên Internet cho từ khóa: \"%s\". Hãy thử cụm từ tìm kiếm khác cụ thể hơn.", query), nil
			}

			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("### Kết quả tìm kiếm Internet cho: \"%s\"\n\n", query))
			for i, r := range results {
				sb.WriteString(fmt.Sprintf("%d. **[%s](%s)**\n", i+1, r.Title, r.URL))
				if r.Snippet != "" {
					sb.WriteString(fmt.Sprintf("   > %s\n\n", r.Snippet))
				} else {
					sb.WriteString("\n")
				}
			}

			return sb.String(), nil
		},
	})
}

type SearchResultItem struct {
	Title   string
	URL     string
	Snippet string
}

func executeWebSearch(ctx context.Context, query string, maxResults int) ([]SearchResultItem, error) {
	searchURL := "https://html.duckduckgo.com/html/?q=" + url.QueryEscape(query)

	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7")

	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	htmlContent := string(bodyBytes)

	// Trích xuất kết quả
	var items []SearchResultItem
	snippetMatches := reSnippet.FindAllStringSubmatch(htmlContent, maxResults*2)

	for _, m := range snippetMatches {
		if len(m) < 2 {
			continue
		}
		rawSnippet := m[1]
		cleanSnippet := strings.TrimSpace(reHTMLTags.ReplaceAllString(rawSnippet, ""))
		cleanSnippet = html.UnescapeString(cleanSnippet)

		// Trích xuất target URL từ uddg
		fullMatch := m[0]
		targetURL := ""
		if urlMatch := reUddgURL.FindStringSubmatch(fullMatch); len(urlMatch) > 1 {
			if decoded, err := url.QueryUnescape(urlMatch[1]); err == nil {
				targetURL = decoded
			}
		}

		if targetURL == "" || strings.Contains(targetURL, "duckduckgo.com/y.js") || strings.Contains(targetURL, "bing.com/aclick") {
			continue
		}

		// Rút gọn title từ URL nếu không tìm thấy title riêng
		title := targetURL
		if parsed, err := url.Parse(targetURL); err == nil {
			title = strings.TrimPrefix(parsed.Path, "/")
			if title == "" {
				title = parsed.Host
			} else {
				title = parsed.Host + " - " + title
			}
		}

		items = append(items, SearchResultItem{
			Title:   title,
			URL:     targetURL,
			Snippet: cleanSnippet,
		})

		if len(items) >= maxResults {
			break
		}
	}

	return items, nil
}
