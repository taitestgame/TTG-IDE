package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"ttgide/internal/agent"
	"ttgide/internal/capabilities"
	fsTool "ttgide/internal/capabilities/tools/fs"
	gitTool "ttgide/internal/capabilities/tools/git"
	searchTool "ttgide/internal/capabilities/tools/search"
	termTool "ttgide/internal/capabilities/tools/terminal"
	webTool "ttgide/internal/capabilities/tools/web"
	"ttgide/internal/capabilities/tools/mcp"
	"ttgide/internal/checkpoint"
	tfContext "ttgide/internal/context"
	"ttgide/internal/logger"
	"ttgide/internal/skills"
	"ttgide/internal/storage/sqlite"
)

// ensureBridgeRunning kiểm tra và tự động khởi động Sing-box (:2080), OpenCode (:4096) và Bridge (:5050) nếu chưa chạy
func ensureBridgeRunning() {
	// 0. Kiểm tra Sing-box Cloudflare WARP proxy (:2080)
	conn2080, err2080 := net.DialTimeout("tcp", "127.0.0.1:2080", 250*time.Millisecond)
	if err2080 != nil {
		singboxExe := `C:\code\python\ip\bin\sing-box.exe`
		singboxCfg := `C:\code\python\ip\singbox_config.json`
		if _, err := os.Stat(singboxExe); err == nil && fileExists(singboxCfg) {
			cmd := exec.Command(singboxExe, "run", "-c", singboxCfg)
			capabilities.HideWindow(cmd)
			_ = cmd.Start()
			time.Sleep(300 * time.Millisecond)
		}
	} else {
		conn2080.Close()
	}

	// 1. Kiểm tra OpenCode Server (:4096)
	conn4096, err4096 := net.DialTimeout("tcp", "127.0.0.1:4096", 300*time.Millisecond)
	if err4096 != nil {
		opencodeCmd := `C:\nvm4w\nodejs\opencode.cmd`
		if _, err := os.Stat(opencodeCmd); err == nil {
			cmd := exec.Command(opencodeCmd, "serve", "--port", "4096", "--pure")
			cmd.Env = append(os.Environ(), "HTTP_PROXY=http://127.0.0.1:2080", "HTTPS_PROXY=http://127.0.0.1:2080")
			capabilities.HideWindow(cmd)
			_ = cmd.Start()
		}
	} else {
		conn4096.Close()
	}

	// 2. Kiểm tra OpenCode Free API Bridge (:5050)
	conn5050, err5050 := net.DialTimeout("tcp", "127.0.0.1:5050", 300*time.Millisecond)
	if err5050 == nil {
		conn5050.Close()
		return
	}
	bridgePath := `C:\code\python\Antesst\opencode_free_api\bridge.py`
	if _, err := os.Stat(bridgePath); err == nil {
		cmd := exec.Command("python", bridgePath)
		cmd.Env = os.Environ()
		capabilities.HideWindow(cmd)
		_ = cmd.Start()
		for i := 0; i < 6; i++ {
			time.Sleep(500 * time.Millisecond)
			c, err := net.DialTimeout("tcp", "127.0.0.1:5050", 400*time.Millisecond)
			if err == nil {
				c.Close()
				break
			}
		}
	}
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

// App là struct cầu nối chính giữa Go backend và giao diện React thông qua Wails
type App struct {
	ctx           context.Context
	workspaceRoot string
	activeMode    agent.Mode

	// Các thành phần cốt lõi
	db               *sqlite.DB
	capManager       *capabilities.Manager
	checkpointMgr    *checkpoint.Manager
	memManager       *tfContext.MemoryManager
	contextEngine    *tfContext.Engine
	skillsMgr        *skills.Manager
	harness          *agent.Harness
	multiAIArena     *agent.MultiAIArena
	configuredModels []agent.MultiAIConfig
}

func getInitialWorkspace() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = os.Getenv("USERPROFILE")
	}
	lastWsFile := filepath.Join(appData, "TaitestgameIDE", "last_workspace.txt")
	if data, err := os.ReadFile(lastWsFile); err == nil {
		ws := strings.TrimSpace(string(data))
		if fi, err := os.Stat(ws); err == nil && fi.IsDir() {
			return ws
		}
	}
	cwd, _ := os.Getwd()
	userProfile := os.Getenv("USERPROFILE")
	if cwd != "" && cwd != userProfile && cwd != filepath.Dir(userProfile) {
		return cwd
	}
	defaultDir := `C:\code\python\Anchuyennganh`
	if fi, err := os.Stat(defaultDir); err == nil && fi.IsDir() {
		return defaultDir
	}
	return cwd
}

// NewApp khởi tạo ứng dụng TTG IDE cùng toàn bộ các dịch vụ nội bộ
func NewApp() *App {
	cwd := getInitialWorkspace()
	capMgr := capabilities.NewManager()
	cpMgr := checkpoint.NewManager(cwd)
	memMgr := tfContext.NewMemoryManager()
	ctxEng := tfContext.NewEngine(cwd, memMgr)
	skillsMgr := skills.NewManager(filepath.Join(cwd, "skills"))
	_ = skillsMgr.LoadAll()

	// Đăng ký các công cụ hệ thống vào Capability Manager
	fsTool.RegisterFSTools(capMgr, cwd)
	termTool.RegisterTerminalTools(capMgr, cwd)
	gitTool.RegisterGitTools(capMgr, cwd)
	searchTool.RegisterSearchTools(capMgr, cwd)
	webTool.RegisterWebTools(capMgr, cwd)
	mcp.RegisterMCPTools(capMgr, cwd)

	app := &App{
		workspaceRoot: cwd,
		activeMode:    agent.ModeVibe, // Mặc định mở ở chế độ Vibe Mode
		capManager:    capMgr,
		checkpointMgr: cpMgr,
		memManager:    memMgr,
		contextEngine: ctxEng,
		skillsMgr:     skillsMgr,
		configuredModels: []agent.MultiAIConfig{
			{
				ID:      "nemotron-3.5-lightning-free",
				Name:    "Nemotron 3.5 Lightning (Free - Siêu Tốc)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "nemotron-3.5-lightning-free",
			},
			{
				ID:      "glm-5.3-flash-free",
				Name:    "GLM-5.3 Flash (Free - Đa Năng)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "glm-5.3-flash-free",
			},
			{
				ID:      "deepseek-v4.1-flash-free",
				Name:    "DeepSeek V4.1 Flash (Free - Coding)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "deepseek-v4.1-flash-free",
			},
			{
				ID:      "beam-free",
				Name:    "Beam Free",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "beam-free",
			},
			{
				ID:      "big-pickle",
				Name:    "Big Pickle (Reasoning Suy Luận)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "big-pickle",
			},
			{
				ID:      "longcat-2.5-preview-free",
				Name:    "LongCat 2.5 Preview (Ngữ Cảnh Dài)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "longcat-2.5-preview-free",
			},
			{
				ID:      "mimo-v2.6-flash-free",
				Name:    "MiMo-V2.6 Flash (Free)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "mimo-v2.6-flash-free",
			},
			{
				ID:      "nemotron-3.5-super-vl-free",
				Name:    "Nemotron 3.5 Super VL (Free)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "nemotron-3.5-super-vl-free",
			},
			{
				ID:      "nemotron-3-ultra-free",
				Name:    "Nemotron 3 Ultra (Free)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "nemotron-3-ultra-free",
			},
			{
				ID:      "minimax-m3.1-flash-free",
				Name:    "MiniMax M3.1 Flash (Free)",
				BaseURL: "http://127.0.0.1:5050/v1",
				APIKey:  "free",
				Model:   "minimax-m3.1-flash-free",
			},
			{
				ID:      "claude-3-7-sonnet",
				Name:    "Claude 3.7 Sonnet (Anthropic)",
				BaseURL: "https://api.anthropic.com/v1",
				APIKey:  "",
				Model:   "claude-3-7-sonnet",
			},
		},
	}

	app.harness = agent.NewHarness(ctxEng, capMgr, cpMgr, func(evt agent.AgentEvent) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "agent:event", evt)
		}
	})

	app.multiAIArena = agent.NewMultiAIArena(cwd, ctxEng, cpMgr, func(evt agent.AgentEvent) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "agent:event", evt)
		}
	})

	// Dang ky callback tien trinh ngam hoan tat (Antigravity Reactive Wakeup & UI updates)
	termTool.SetTaskCompletionCallback(func(task *termTool.BackgroundTask) {
		taskID, cmdStr, exitCode, _, err, output := task.GetSummary(2000)
		statusText := "thành công (Exit 0)"
		if err != nil || exitCode != 0 {
			statusText = fmt.Sprintf("thất bại (Exit %d)", exitCode)
		}
		logger.Log("INFO", "Terminal", fmt.Sprintf("Tiến trình ngầm hoàn tất: %s (%s) - %s", taskID, cmdStr, statusText))

		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, "agent:event", agent.AgentEvent{
				Type:      "task_completed",
				SessionID: "active_session",
				Payload: map[string]any{
					"task_id":   taskID,
					"command":   cmdStr,
					"exit_code": exitCode,
					"output":    output,
				},
			})
		}

		if app.harness != nil {
			activeSess := app.harness.GetActiveSessionID()
			if activeSess != "" {
				notifyMsg := fmt.Sprintf("[Hệ thống thông báo tiến trình ngầm]: Tiến trình '%s' (Lệnh: %s) đã hoàn tất %s.\nĐầu ra gần nhất:\n%s", taskID, cmdStr, statusText, output)
				app.harness.SteerSession(activeSess, notifyMsg)
			}
		}
	})

	return app
}

// startup được Wails gọi khi ứng dụng desktop bắt đầu khởi chạy
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	logger.Init(a.workspaceRoot)
	logger.Log("INFO", "System", fmt.Sprintf("TTG IDE Desktop Runtime khởi động. Workspace: %s", a.workspaceRoot))
	a.memManager.SetWorkspace(a.workspaceRoot)

	// Đảm bảo OpenCode Bridge (:5050) đang hoạt động ngầm
	go ensureBridgeRunning()

	// Khởi tạo cơ sở dữ liệu SQLite trong thư mục .ttgide của workspace
	dbPath := filepath.Join(a.workspaceRoot, ".ttgide", "ttgide.db")
	db, err := sqlite.Open(dbPath)
	if err == nil {
		a.db = db
	}
	// Nạp lại danh sách AI models đã cấu hình trước đó
	a.loadModelsFromDB()
	if a.db != nil {
		if savedModel, err := a.db.GetSetting("selected_model"); err == nil && savedModel != "" {
			_ = a.SetAgentModel(savedModel)
		}
	}

	// Lắng nghe sự kiện kéo thả file/thư mục từ hệ điều hành vào ứng dụng (báo sự kiện cho frontend xử lý an toàn)
	wailsRuntime.OnFileDrop(a.ctx, func(x, y int, paths []string) {
		if len(paths) > 0 {
			wailsRuntime.EventsEmit(a.ctx, "os:file-drop", map[string]any{
				"x":     x,
				"y":     y,
				"paths": paths,
			})
		}
	})
}

// shutdown được Wails gọi khi ứng dụng desktop đóng lại: dừng toàn bộ tiến trình con
func (a *App) shutdown(ctx context.Context) {
	logger.Log("INFO", "System", "TTG IDE Desktop Runtime đóng lại. Đang dọn dẹp toàn bộ tiến trình con...")
	if a.capManager != nil {
		_, _ = a.capManager.Execute(ctx, "manage_task", map[string]any{
			"action": "kill_all",
		})
	}
	if a.db != nil {
		_ = a.db.Close()
	}
}

// SetWorkspace cập nhật thư mục dự án đang làm việc và tái khởi tạo các công cụ liên quan
func (a *App) SetWorkspace(path string) error {
	fi, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("thư mục không tồn tại: %w", err)
	}
	if !fi.IsDir() {
		path = filepath.Dir(path)
	}
	path = filepath.Clean(path)

	// Bảo vệ chống vòng lặp tái kích hoạt vô tận (infinite ping-pong loop)
	if a.workspaceRoot == path && a.capManager != nil {
		return nil
	}

	a.workspaceRoot = path
	logger.Log("INFO", "Workspace", fmt.Sprintf("Chuyển thư mục dự án sang: %s", path))
	a.memManager.SetWorkspace(path)

	// Ghi nhớ thư mục vừa chọn để khởi động lại tự mở đúng dự án
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = os.Getenv("USERPROFILE")
	}
	wsDir := filepath.Join(appData, "TaitestgameIDE")
	_ = os.MkdirAll(wsDir, 0755)
	_ = os.WriteFile(filepath.Join(wsDir, "last_workspace.txt"), []byte(path), 0644)

	// Tái khởi tạo các module phụ thuộc vào thư mục workspace
	a.capManager = capabilities.NewManager()
	fsTool.RegisterFSTools(a.capManager, path)
	termTool.RegisterTerminalTools(a.capManager, path)
	gitTool.RegisterGitTools(a.capManager, path)
	searchTool.RegisterSearchTools(a.capManager, path)
	webTool.RegisterHTTPRequestTool(a.capManager)
	webTool.RegisterBrowserTool(a.capManager, path)
	a.checkpointMgr = checkpoint.NewManager(path)
	a.contextEngine = tfContext.NewEngine(path, a.memManager)
	a.harness = agent.NewHarness(a.contextEngine, a.capManager, a.checkpointMgr, func(evt agent.AgentEvent) {
		if a.ctx != nil {
			wailsRuntime.EventsEmit(a.ctx, "agent:event", evt)
		}
	})
	a.multiAIArena = agent.NewMultiAIArena(path, a.contextEngine, a.checkpointMgr, func(evt agent.AgentEvent) {
		if a.ctx != nil {
			wailsRuntime.EventsEmit(a.ctx, "agent:event", evt)
		}
	})

	if a.db != nil {
		if savedModel, err := a.db.GetSetting("selected_model"); err == nil && savedModel != "" {
			_ = a.SetAgentModel(savedModel)
		}
	}

	// Bắn sự kiện cập nhật workspace cho frontend
	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, "workspace:changed", path)
	}

	return nil
}

// GetWorkspace trả về đường dẫn thư mục dự án hiện tại
func (a *App) GetWorkspace() string {
	return a.workspaceRoot
}

// SetMode chuyển đổi giữa chế độ "ide" và "vibe"
func (a *App) SetMode(m string) {
	a.activeMode = agent.Mode(m)
}

// GetMode lấy chế độ hoạt động hiện tại
func (a *App) GetMode() string {
	return string(a.activeMode)
}

// ListWorkspaceFiles trả về danh sách toàn bộ file trong thư mục dự án (đường dẫn tương đối sạch sẽ)
func (a *App) ListWorkspaceFiles() (string, error) {
	if a.workspaceRoot == "" {
		return "", nil
	}
	var files []string
	err := filepath.WalkDir(a.workspaceRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()
		if d.IsDir() {
			if strings.HasPrefix(name, ".") || name == "node_modules" || name == "dist" || name == "build" || name == "vendor" {
				return filepath.SkipDir
			}
			return nil
		}
		// Bỏ qua các file ẩn bắt đầu bằng dấu chấm
		if strings.HasPrefix(name, ".") {
			return nil
		}
		rel, err := filepath.Rel(a.workspaceRoot, p)
		if err == nil {
			files = append(files, filepath.ToSlash(rel))
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return strings.Join(files, "\n"), nil
}

// ReadFile đọc nội dung một file cho trình biên tập (Editor)
func (a *App) ReadFile(path string) (string, error) {
	fullPath := path
	if !filepath.IsAbs(fullPath) {
		fullPath = filepath.Join(a.workspaceRoot, fullPath)
	}
	rawBytes, err := os.ReadFile(fullPath)
	if err != nil && a.workspaceRoot != "" {
		targetBase := filepath.Base(path)
		var foundPath string
		_ = filepath.WalkDir(a.workspaceRoot, func(p string, d fs.DirEntry, wErr error) error {
			if wErr != nil || d.IsDir() {
				return nil
			}
			if filepath.Base(p) == targetBase {
				foundPath = p
				return filepath.SkipAll
			}
			return nil
		})
		if foundPath != "" {
			if rb, err2 := os.ReadFile(foundPath); err2 == nil {
				return fsTool.DecodeToUTF8(rb), nil
			}
		}
		return "", fmt.Errorf("không thể mở file để đọc: %w", err)
	}
	if err != nil {
		return "", fmt.Errorf("không thể mở file để đọc: %w", err)
	}
	return fsTool.DecodeToUTF8(rawBytes), nil
}

// SaveFile lưu nội dung vào file
func (a *App) SaveFile(path, content string) (string, error) {
	return a.capManager.Execute(a.ctx, "write_file", map[string]any{
		"path":    path,
		"content": content,
	})
}

// RunTerminalCommand thực thi lệnh dòng lệnh trong thư mục dự án
func (a *App) RunTerminalCommand(command string) (string, error) {
	return a.capManager.Execute(a.ctx, "run_command", map[string]any{
		"command": command,
	})
}

// DeleteFile xóa một file hoặc thư mục trong dự án
func (a *App) DeleteFile(path string) (string, error) {
	return a.capManager.Execute(a.ctx, "delete_file", map[string]any{"path": path})
}

// GrepSearch tìm kiếm chuỗi / regex xuyên qua codebase
func (a *App) GrepSearch(query, includes string) (string, error) {
	args := map[string]any{"query": query}
	if includes != "" {
		args["includes"] = includes
	}
	return a.capManager.Execute(a.ctx, "grep_search", args)
}

// GitStatus lấy trạng thái Git ngắn gọn
func (a *App) GitStatus() (string, error) {
	return a.capManager.Execute(a.ctx, "git_status", map[string]any{})
}

// GitCommit tạo commit Git với nội dung thông điệp
func (a *App) GitCommit(message string) (string, error) {
	return a.capManager.Execute(a.ctx, "git_commit", map[string]any{"message": message})
}

// CreateFolder tạo thư mục mới trong dự án
func (a *App) CreateFolder(path string) error {
	fullPath := filepath.Join(a.workspaceRoot, path)
	return os.MkdirAll(fullPath, 0755)
}

// RenameFile đổi tên hoặc di chuyển tệp tin/thư mục trong dự án
func (a *App) RenameFile(oldPath, newPath string) error {
	fullOld := oldPath
	if !filepath.IsAbs(fullOld) {
		fullOld = filepath.Join(a.workspaceRoot, fullOld)
	}
	fullNew := newPath
	if !filepath.IsAbs(fullNew) {
		fullNew = filepath.Join(a.workspaceRoot, fullNew)
	}
	_ = os.MkdirAll(filepath.Dir(fullNew), 0755)
	return os.Rename(fullOld, fullNew)
}

// RevealInExplorer mở Windows Explorer và chọn tệp tin tương ứng
func (a *App) RevealInExplorer(path string) error {
	fullPath := path
	if !filepath.IsAbs(fullPath) {
		fullPath = filepath.Join(a.workspaceRoot, fullPath)
	}
	if fi, err := os.Stat(fullPath); err == nil && fi.IsDir() {
		return exec.Command("explorer.exe", fullPath).Start()
	}
	return exec.Command("explorer.exe", "/select,", fullPath).Start()
}

// ensureSessionLoaded kiểm tra và nạp lại toàn bộ lịch sử tin nhắn cùng các file vừa thao tác từ SQLite nếu chưa có trong RAM
func (a *App) ensureSessionLoaded(sessionID string) {
	if a.harness == nil || a.harness.HasSessionHistory(sessionID) || a.db == nil {
		return
	}
	msgs, err := a.db.GetMessages(sessionID)
	if err != nil || len(msgs) == 0 {
		return
	}
	var hist []map[string]any
	var lastFiles []string
	reAlphaNum := regexp.MustCompile(`[a-zA-Z0-9\p{L}]`)
	for _, m := range msgs {
		if m.Sender == "error" || strings.HasPrefix(m.Content, "⚠️") ||
			strings.HasPrefix(m.Content, "## Important Details") || strings.HasPrefix(m.Content, "Thought for ") {
			continue // Do not leak errors or raw scratchpad thoughts into agent context
		}
		if m.Sender == "user" {
			clean := strings.TrimSpace(m.Content)
			if !reAlphaNum.MatchString(clean) {
				continue
			}
		}
		role := "user"
		if m.Sender == "agent" || m.Sender == "assistant" {
			role = "assistant"
		}
		hist = append(hist, map[string]any{
			"role":    role,
			"content": m.Content,
		})
		if m.ToolCallsJSON != "" {
			var tcData struct {
				ToolCalls []agent.ToolCall `json:"toolCalls"`
				Files     []string         `json:"files"`
			}
			if err := json.Unmarshal([]byte(m.ToolCallsJSON), &tcData); err == nil {
				for _, tc := range tcData.ToolCalls {
					if p, ok := tc.Arguments["path"].(string); ok && p != "" {
						lastFiles = append(lastFiles, p)
					}
				}
				for _, f := range tcData.Files {
					if f != "" {
						lastFiles = append(lastFiles, f)
					}
				}
			}
		}
	}
	if len(hist) > 0 {
		a.harness.LoadSessionHistory(sessionID, hist, lastFiles)
		logger.Log("INFO", "Agent", fmt.Sprintf("Đã khôi phục %d tin nhắn và %d tệp tin cho session '%s' từ SQLite", len(hist), len(lastFiles), sessionID))
	}
}

// TriggerAgent kích hoạt chu trình AI Agent Vibe Loop
func (a *App) TriggerAgent(sessionID, prompt, verifyCmd string, files []string) (*agent.Plan, error) {
	logger.Log("INFO", "Agent", fmt.Sprintf("TriggerAgent [session=%s]: prompt='%s', files=%v", sessionID, prompt, files))
	a.ensureSessionLoaded(sessionID)
	return a.harness.RunVibeLoop(a.ctx, sessionID, prompt, verifyCmd, files)
}

// SetPermissionMode cài đặt chế độ cấp quyền: "full", "ask", "plan"
func (a *App) SetPermissionMode(mode string) {
	if a.harness != nil {
		a.harness.SetPermissionMode(mode)
	}
}

// GetPermissionMode lấy chế độ cấp quyền hiện tại
func (a *App) GetPermissionMode() string {
	if a.harness != nil {
		return a.harness.GetPermissionMode()
	}
	return "full"
}

// Rollback khôi phục dự án về một checkpoint đã lưu
func (a *App) Rollback(checkpointID string) error {
	return a.checkpointMgr.Rollback(checkpointID)
}

// ListCheckpoints lấy danh sách toàn bộ các checkpoint đã lưu
func (a *App) ListCheckpoints() []agent.Checkpoint {
	return a.checkpointMgr.ListCheckpoints()
}

// GetSkills trả về danh sách tất cả các kỹ năng đã được nạp
func (a *App) GetSkills() []skills.Skill {
	return a.skillsMgr.ListSkills()
}

// AnswerAgentQuestion chuyen tiep cau tra loi cua lap trinh vien vao Harness (Human-in-the-Loop)
func (a *App) AnswerAgentQuestion(answer string) {
	if a.harness != nil {
		a.harness.AnswerQuestion(answer)
	}
}

// SteerAgent chèn trực tiếp yêu cầu bổ sung của người dùng vào phiên đang chạy
func (a *App) SteerAgent(sessionID, text string) {
	if a.harness != nil {
		a.harness.SteerSession(sessionID, text)
	}
}

// TriggerMultiAIAgent kich hoat dau truong so sanh 2-4 AI tren cung 1 cau hoi voi Sandbox co lap
func (a *App) TriggerMultiAIAgent(sessionID, prompt, verifyCmd string, models []agent.MultiAIConfig) (*agent.MultiAISession, error) {
	if a.multiAIArena == nil {
		return nil, fmt.Errorf("MultiAIArena chua duoc khoi tao")
	}
	return a.multiAIArena.RunArena(a.ctx, sessionID, prompt, verifyCmd, models)
}

// SelectMultiAISolution ap dung ma nguon tu Sandbox cua AI duoc nguoi dung chon vao project chinh
func (a *App) SelectMultiAISolution(sessionID, selectedModelID string) error {
	if a.multiAIArena == nil {
		return fmt.Errorf("MultiAIArena chua duoc khoi tao")
	}
	return a.multiAIArena.SelectSolution(sessionID, selectedModelID)
}

// GetRegisteredTools tra ve toan bo danh sach cac cong cu (Tool Calls) da duoc dang ky
func (a *App) GetRegisteredTools() []capabilities.ToolDefinition {
	if a.capManager == nil {
		return nil
	}
	return a.capManager.GetDefinitions()
}

// OpenProjectDialog mo hop thoai chon thu muc tren he dieu hanh
func (a *App) OpenProjectDialog() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("context chua duoc khoi tao")
	}
	dir, err := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Chọn thư mục dự án (Open Workspace Folder)",
	})
	if err != nil {
		return "", err
	}
	if dir != "" {
		if err := a.SetWorkspace(dir); err != nil {
			return "", err
		}
	}
	return dir, nil
}

func (a *App) getGlobalConfigDir() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = os.Getenv("USERPROFILE")
	}
	dir := filepath.Join(appData, "TaitestgameIDE")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (a *App) saveModelsToDB() {
	dir := a.getGlobalConfigDir()
	filePath := filepath.Join(dir, "models.json")
	if data, err := json.MarshalIndent(a.configuredModels, "", "  "); err == nil {
		_ = os.WriteFile(filePath, data, 0644)
	}
	if a.db != nil {
		if data, err := json.Marshal(a.configuredModels); err == nil {
			_ = a.db.SetSetting("custom_models", string(data))
		}
	}
}

func (a *App) loadModelsFromDB() {
	dir := a.getGlobalConfigDir()
	filePath := filepath.Join(dir, "models.json")
	if data, err := os.ReadFile(filePath); err == nil && len(data) > 0 {
		var loaded []agent.MultiAIConfig
		if err := json.Unmarshal(data, &loaded); err == nil && len(loaded) > 0 {
			a.configuredModels = loaded
			return
		}
	}
	if a.db != nil {
		val, err := a.db.GetSetting("custom_models")
		if err == nil && val != "" {
			var loaded []agent.MultiAIConfig
			if err := json.Unmarshal([]byte(val), &loaded); err == nil && len(loaded) > 0 {
				a.configuredModels = loaded
				return
			}
		}
	}
}

// GetAIModels tra ve danh sach cac model AI da cau hinh
func (a *App) GetAIModels() []agent.MultiAIConfig {
	if len(a.configuredModels) == 0 {
		a.loadModelsFromDB()
	}
	return a.configuredModels
}

// AddAIModel them mot model AI moi vao he thong
func (a *App) AddAIModel(cfg agent.MultiAIConfig) []agent.MultiAIConfig {
	for i, m := range a.configuredModels {
		if m.ID == cfg.ID {
			a.configuredModels[i] = cfg
			a.saveModelsToDB()
			return a.configuredModels
		}
	}
	a.configuredModels = append(a.configuredModels, cfg)
	a.saveModelsToDB()
	return a.configuredModels
}

// RemoveAIModel xoa mot model AI khoi he thong
func (a *App) RemoveAIModel(id string) []agent.MultiAIConfig {
	var updated []agent.MultiAIConfig
	for _, m := range a.configuredModels {
		if m.ID != id {
			updated = append(updated, m)
		}
	}
	a.configuredModels = updated
	a.saveModelsToDB()
	return a.configuredModels
}

// SaveAIModels luu toan bo danh sach cac model da cau hinh
func (a *App) SaveAIModels(models []agent.MultiAIConfig) []agent.MultiAIConfig {
	a.configuredModels = models
	a.saveModelsToDB()
	return a.configuredModels
}

// SetAgentModel cập nhật model đang dùng cho Harness
func (a *App) SetAgentModel(modelID string) error {
	if a.db != nil {
		_ = a.db.SetSetting("selected_model", modelID)
	}
	// 1. Ưu tiên khớp ID định danh duy nhất của model theo từng Provider
	for _, m := range a.configuredModels {
		if m.ID == modelID {
			if a.harness != nil {
				cfg := a.harness.GetConfig()
				cfg.Model = m.Model
				cfg.BaseURL = m.BaseURL
				cfg.APIKey = m.APIKey
				a.harness.SetConfig(cfg)
			}
			return nil
		}
	}
	// 2. Dự phòng tìm theo tên Model nếu truyền tên thuần
	for _, m := range a.configuredModels {
		if m.Model == modelID {
			if a.harness != nil {
				cfg := a.harness.GetConfig()
				cfg.Model = m.Model
				cfg.BaseURL = m.BaseURL
				cfg.APIKey = m.APIKey
				a.harness.SetConfig(cfg)
			}
			return nil
		}
	}
	if a.harness != nil {
		cfg := a.harness.GetConfig()
		cfg.Model = modelID
		a.harness.SetConfig(cfg)
	}
	return nil
}

// ConfigureHarness cấu hình trực tiếp Harness với model, baseUrl, apiKey
func (a *App) ConfigureHarness(model, baseURL, apiKey string) error {
	if a.harness != nil {
		cfg := a.harness.GetConfig()
		if model != "" {
			cfg.Model = model
		}
		if baseURL != "" {
			cfg.BaseURL = baseURL
		}
		if apiKey != "" {
			cfg.APIKey = apiKey
		}
		a.harness.SetConfig(cfg)
	}
	return nil
}

// SaveSession lưu hoặc cập nhật tiêu đề session vào SQLite
func (a *App) SaveSession(id, title string) error {
	if a.db != nil {
		return a.db.SaveSession(id, title, a.workspaceRoot)
	}
	return nil
}

// ListSessions lấy danh sách session của workspace hiện tại
func (a *App) ListSessions() ([]sqlite.SessionRecord, error) {
	if a.db != nil {
		return a.db.ListSessions(a.workspaceRoot)
	}
	return nil, nil
}

// DeleteSession xóa một session khỏi SQLite
func (a *App) DeleteSession(id string) error {
	if a.db != nil {
		return a.db.DeleteSession(id)
	}
	return nil
}

// SaveMessage lưu tin nhắn vào SQLite
func (a *App) SaveMessage(id, sessionID, sender, content, toolCallsJSON string) error {
	if a.db != nil {
		return a.db.SaveMessage(id, sessionID, sender, content, toolCallsJSON)
	}
	return nil
}

// GetMessages lấy toàn bộ tin nhắn của một session
func (a *App) GetMessages(sessionID string) ([]sqlite.MessageRecord, error) {
	if a.db != nil {
		return a.db.GetMessages(sessionID)
	}
	return nil, nil
}

// CancelAgent dừng ngay lập tức chu trình AI của session
func (a *App) CancelAgent(sessionID string) {
	if a.harness != nil {
		a.harness.CancelSession(sessionID)
	}
}

// DeleteMessagesFrom xóa tin nhắn từ messageID này trở về sau và hủy mọi tiến trình đang chạy (cho tính năng Undo)
func (a *App) DeleteMessagesFrom(sessionID, messageID string) error {
	if a.harness != nil {
		a.harness.CancelSession(sessionID)
		a.harness.ClearSessionHistory(sessionID)
	}
	if a.db != nil {
		return a.db.DeleteMessagesFromId(sessionID, messageID)
	}
	return nil
}

// ClearSessionHistory xóa sạch ngữ cảnh RAM của phiên
func (a *App) ClearSessionHistory(sessionID string) {
	if a.harness != nil {
		a.harness.ClearSessionHistory(sessionID)
	}
}

// KillTask dừng một tiến trình chạy ngầm theo TaskID
func (a *App) KillTask(taskID string) (string, error) {
	if a.capManager != nil {
		res, err := a.capManager.Execute(context.Background(), "manage_task", map[string]any{
			"action":  "kill",
			"task_id": taskID,
		})
		if a.ctx != nil {
			wailsRuntime.EventsEmit(a.ctx, "task:killed", taskID)
		}
		return res, err
	}
	return "", fmt.Errorf("capManager chưa được khởi tạo")
}

// KillAllBackgroundTasks dừng toàn bộ các tiến trình đang chạy ngầm của hệ thống
func (a *App) KillAllBackgroundTasks() (string, error) {
	if a.capManager != nil {
		res, err := a.capManager.Execute(context.Background(), "manage_task", map[string]any{
			"action": "kill_all",
		})
		if a.ctx != nil {
			wailsRuntime.EventsEmit(a.ctx, "task:killed_all", true)
		}
		return res, err
	}
	return "", fmt.Errorf("capManager chưa được khởi tạo")
}

// GetActiveTasks trả về danh sách các taskID đang chạy ngầm
func (a *App) GetActiveTasks() []string {
	return termTool.GetActiveTaskIDs()
}

// SaveSetting lưu cấu hình vào SQLite
func (a *App) SaveSetting(key, value string) error {
	if a.db != nil {
		return a.db.SetSetting(key, value)
	}
	return nil
}

// GetSetting đọc cấu hình từ SQLite
func (a *App) GetSetting(key string) (string, error) {
	if a.db != nil {
		return a.db.GetSetting(key)
	}
	return "", nil
}

// SaveMultiAIRun lưu phiên chạy Multi-AI vào SQLite
func (a *App) SaveMultiAIRun(id, prompt, strategy, nodesJSON, resultsJSON, synthesis string) error {
	if a.db != nil {
		return a.db.SaveMultiAIRun(id, prompt, strategy, nodesJSON, resultsJSON, synthesis)
	}
	return nil
}

// ListMultiAIRuns lấy danh sách lịch sử Multi-AI từ SQLite
func (a *App) ListMultiAIRuns() ([]sqlite.MultiAIRunRecord, error) {
	if a.db != nil {
		return a.db.ListMultiAIRuns()
	}
	return nil, nil
}

// FetchAvailableModels lấy danh sách model thực tế từ OpenAI-compatible endpoint
func (a *App) FetchAvailableModels(baseURL, apiKey string) ([]string, error) {
	if baseURL == "" {
		baseURL = "http://127.0.0.1:5050/v1"
	}
	trimmed := strings.TrimRight(baseURL, "/")
	endpoint := trimmed + "/models"
	if strings.HasSuffix(trimmed, "/models") {
		endpoint = trimmed
	}

	req, err := http.NewRequestWithContext(a.ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" && apiKey != "free" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var ids []string
	seen := make(map[string]bool)

	// 1. Chuẩn OpenAI: {"data": [{"id": "model-1"}]}
	var openAIRes struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &openAIRes); err == nil && len(openAIRes.Data) > 0 {
		for _, m := range openAIRes.Data {
			if m.ID != "" && !seen[m.ID] {
				ids = append(ids, m.ID)
				seen[m.ID] = true
			}
		}
	}

	// 2. Chuẩn Ollama tags: {"models": [{"name": "llama3.2"}]}
	if len(ids) == 0 {
		var ollamaRes struct {
			Models []struct {
				Name string `json:"name"`
				ID   string `json:"id"`
			} `json:"models"`
		}
		if err := json.Unmarshal(body, &ollamaRes); err == nil && len(ollamaRes.Models) > 0 {
			for _, m := range ollamaRes.Models {
				name := m.Name
				if name == "" {
					name = m.ID
				}
				if name != "" && !seen[name] {
					ids = append(ids, name)
					seen[name] = true
				}
			}
		}
	}

	// 3. Chuẩn mảng phẳng: ["model1", "model2"]
	if len(ids) == 0 {
		var arrRes []string
		if err := json.Unmarshal(body, &arrRes); err == nil && len(arrRes) > 0 {
			for _, item := range arrRes {
				if item != "" && !seen[item] {
					ids = append(ids, item)
					seen[item] = true
				}
			}
		}
	}

	return ids, nil
}

// CallAIModel gọi trực tiếp một model AI cho node trong Multi-AI pipeline
func (a *App) CallAIModel(cfg agent.MultiAIConfig, systemInstruction, userPrompt string) (string, error) {
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = "http://127.0.0.1:5050/v1"
	}
	apiKey := cfg.APIKey
	if apiKey == "" {
		if strings.Contains(baseURL, "127.0.0.1") || strings.Contains(baseURL, "localhost") {
			apiKey = "free"
		}
	}

	messages := []map[string]string{}
	if systemInstruction != "" {
		messages = append(messages, map[string]string{
			"role":    "system",
			"content": systemInstruction,
		})
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": userPrompt,
	})

	reqBody := map[string]any{
		"model":    cfg.Model,
		"messages": messages,
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(baseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(a.ctx, "POST", endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("API HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error any `json:"error,omitempty"`
	}
	if err := json.Unmarshal(bodyBytes, &parsed); err != nil {
		return "", fmt.Errorf("JSON parse error: %w (Body: %s)", err, string(bodyBytes))
	}

	if len(parsed.Choices) > 0 {
		return parsed.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("không nhận được câu trả lời từ model (Body: %s)", string(bodyBytes))
}

// GetMCPServers trả về danh sách MCP servers đã cấu hình
func (a *App) GetMCPServers() []mcp.MCPServerConfig {
	mgr := mcp.GetManager(a.workspaceRoot)
	return mgr.ListServers()
}

// SaveMCPServer lưu hoặc cập nhật cấu hình một MCP server
func (a *App) SaveMCPServer(name, command string, args []string, env map[string]string) error {
	mgr := mcp.GetManager(a.workspaceRoot)
	return mgr.SaveServer(name, command, args, env)
}

// DeleteMCPServer xóa MCP server
func (a *App) DeleteMCPServer(name string) error {
	mgr := mcp.GetManager(a.workspaceRoot)
	return mgr.DeleteServer(name)
}
