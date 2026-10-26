package web

import (
	"ttgide/internal/capabilities"
)

// RegisterWebTools dieu phoi dang ky toan bo 2 cong cu Web:
// 1. fetch_web_request.go -> fetch_web_request (HTTP request nhanh, nhe)
// 2. fetch_web_browser.go -> fetch_web_browser (Headless Chrome/Edge chay JS)
func RegisterWebTools(m *capabilities.Manager, workspaceRoot string) {
	RegisterHTTPRequestTool(m)
	RegisterBrowserTool(m, workspaceRoot)

	// Aliases cho Antigravity & Cline
	m.RegisterAlias("read_url_content", "fetch_web_request")
	m.RegisterAlias("browser_subagent", "fetch_web_browser")
	m.RegisterAlias("browser_action", "fetch_web_browser")
}
