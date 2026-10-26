package terminal

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"ttgide/internal/capabilities"
)

// Danh sach lenh nguy hiem chan tuyet doi
var forbiddenCommands = []string{
	"format C:", "del /s /q C:", "rm -rf /", "rm -rf ~", "rm -rf *",
	"DROP DATABASE", "DROP TABLE", ":(){:|:&};:",
}

// RegisterRunCommandTool dang ky rieng cong cu run_command
func RegisterRunCommandTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "run_command",
			Description: "Execute a shell command (PowerShell / Command Prompt on Windows). If the command runs longer than wait_ms, it is automatically converted into a Background Task and returns a TaskId without blocking the agent.",
			Category:    "terminal",
			RequiresAuth: true,
			Parameters: map[string]any{
				"command": "The shell command string to execute",
				"wait_ms": "Milliseconds to wait synchronously before backgrounding (optional, default: 5000ms)",
				"cwd":     "Working directory path (relative or absolute, optional)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			cmdStr, ok := args["command"].(string)
			if !ok || cmdStr == "" {
				return "", fmt.Errorf("thieu tham so 'command'")
			}

			// Kiem tra an toan lenh
			lowerCmd := strings.ToLower(cmdStr)
			for _, pattern := range forbiddenCommands {
				if strings.Contains(lowerCmd, strings.ToLower(pattern)) {
					return "", fmt.Errorf("LENH BI CHAN: Phat hien lenh nguy hiem chua pattern '%s'", pattern)
				}
			}

			// Bảo vệ: Nếu lệnh yêu cầu tắt cmd/powershell hàng loạt, chỉ diệt các tiến trình do IDE sinh ra (không tắt nhầm CMD khác trên máy)
			if strings.Contains(lowerCmd, "taskkill") && (strings.Contains(lowerCmd, "cmd") || strings.Contains(lowerCmd, "powershell")) {
				globalTaskManager.mu.Lock()
				count := 0
				for _, t := range globalTaskManager.tasks {
					t.cancel()
					if t.Cmd != nil && t.Cmd.Process != nil {
						killCmd := exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", t.Cmd.Process.Pid))
						capabilities.HideWindow(killCmd)
						_ = killCmd.Run()
						_ = t.Cmd.Process.Kill()
					}
					t.Done = true
					count++
				}
				globalTaskManager.mu.Unlock()
				return fmt.Sprintf("✓ Đã dừng toàn bộ %d tiến trình CMD/PowerShell do IDE khởi tạo (an toàn, không tắt các cửa sổ CMD khác trên máy).", count), nil
			}

			// Tự động chuyển đổi toán tử && sang ; cho PowerShell trên Windows
			if runtime.GOOS == "windows" && strings.Contains(cmdStr, " && ") {
				cmdStr = strings.ReplaceAll(cmdStr, " && ", " ; ")
			}

			// Tự động gỡ bọc thừa nếu mô hình gõ 'powershell -Command "..."' hoặc 'powershell -NoProfile -Command "..."'
			// vì shell thực thi bên dưới đã mặc định là PowerShell, tránh lỗi thoát chuỗi kép (nested quote escaping error)
			if runtime.GOOS == "windows" {
				trimmed := strings.TrimSpace(cmdStr)
				lowerTrimmed := strings.ToLower(trimmed)
				prefixFound := ""
				for _, p := range []string{
					"powershell -noprofile -command ",
					"powershell -command ",
					"powershell -c ",
					"powershell ",
				} {
					if strings.HasPrefix(lowerTrimmed, p) {
						prefixFound = p
						break
					}
				}
				if prefixFound != "" {
					inner := strings.TrimSpace(trimmed[len(prefixFound):])
					if (strings.HasPrefix(inner, "\"") && strings.HasSuffix(inner, "\"")) ||
						(strings.HasPrefix(inner, "'") && strings.HasSuffix(inner, "'")) {
						if len(inner) >= 2 {
							inner = inner[1 : len(inner)-1]
						}
					}
					if inner != "" {
						cmdStr = inner
					}
				}
			}

			waitMs := 35000
			lowerCmdStr := strings.ToLower(cmdStr)
			if strings.Contains(lowerCmdStr, "pip install") || strings.Contains(lowerCmdStr, "npm install") ||
				strings.Contains(lowerCmdStr, "npm i") || strings.Contains(lowerCmdStr, "yarn") ||
				strings.Contains(lowerCmdStr, "go get") || strings.Contains(lowerCmdStr, "git clone") ||
				strings.Contains(lowerCmdStr, "pip ") || strings.Contains(lowerCmdStr, "build") ||
				strings.Contains(lowerCmdStr, "test") || strings.Contains(lowerCmdStr, "tsc") ||
				strings.Contains(lowerCmdStr, "compile") {
				waitMs = 120000
			}
			if w, ok := args["wait_ms"].(float64); ok && w > 0 {
				waitMs = int(w)
			}

			targetCwd := workspaceRoot
			if cwdArg, ok := args["cwd"].(string); ok && cwdArg != "" {
				if filepath.IsAbs(cwdArg) {
					targetCwd = cwdArg
				} else {
					targetCwd = filepath.Join(workspaceRoot, cwdArg)
				}
			}

			taskCtx, cancel := context.WithCancel(context.Background())
			var cmd *exec.Cmd

			if runtime.GOOS == "windows" {
				if _, err := exec.LookPath("powershell"); err == nil {
					cmd = exec.CommandContext(taskCtx, "powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmdStr)
				} else {
					cmd = exec.CommandContext(taskCtx, "cmd", "/C", cmdStr)
				}
			} else {
				cmd = exec.CommandContext(taskCtx, "sh", "-c", cmdStr)
			}

			cmd.Dir = targetCwd
			buf := &bytes.Buffer{}
			cmd.Stdout = buf
			cmd.Stderr = buf

			capabilities.HideWindow(cmd)

			stdinPipe, err := cmd.StdinPipe()
			if err != nil {
				cancel()
				return "", fmt.Errorf("khoi tao stdin pipe that bai: %w", err)
			}

			if err := cmd.Start(); err != nil {
				cancel()
				return "", fmt.Errorf("khoi dong lenh that bai: %w", err)
			}

			taskID := fmt.Sprintf("task_%d", time.Now().UnixNano()/1e6)
			bgTask := &BackgroundTask{
				ID:        taskID,
				Command:   cmdStr,
				StartTime: time.Now(),
				Cmd:       cmd,
				Buffer:    buf,
				Stdin:     stdinPipe,
				cancel:    cancel,
			}

			globalTaskManager.mu.Lock()
			globalTaskManager.tasks[taskID] = bgTask
			globalTaskManager.mu.Unlock()

			doneChan := make(chan error, 1)
			go func() {
				err := cmd.Wait()
				bgTask.mu.Lock()
				bgTask.Done = true
				bgTask.Err = err
				if cmd.ProcessState != nil {
					bgTask.ExitCode = cmd.ProcessState.ExitCode()
				}
				wasBg := bgTask.IsBackgrounded
				globalTaskManager.mu.RLock()
				cb := globalTaskManager.onComplete
				globalTaskManager.mu.RUnlock()
				bgTask.mu.Unlock()
				doneChan <- err

				if wasBg && cb != nil {
					cb(bgTask)
				}
			}()

			select {
			case err := <-doneChan:
				outStr := truncateOutput(buf.String(), 25000)
				if err != nil {
					// Nếu output đã chứa thông báo cài đặt thành công của pip/npm thì không coi là lỗi dù có notice/warning
					if strings.Contains(outStr, "Successfully installed") || strings.Contains(outStr, "Requirement already satisfied") {
						return outStr, nil
					}
					return outStr, fmt.Errorf("lenh chay that bai (exit code: %d): %w\nDau ra: %s", bgTask.ExitCode, err, outStr)
				}
				return outStr, nil

			case <-time.After(time.Duration(waitMs) * time.Millisecond):
				bgTask.mu.Lock()
				bgTask.IsBackgrounded = true
				bgTask.mu.Unlock()
				return fmt.Sprintf("[TIEN TRINH CHAY NGAM] Lenh van dang thuc thi sau %d ms.\nTaskId: \"%s\"\nLenh: %s\nSu dung tool 'manage_task' voi action='status', 'logs', 'send_input' (khi can nhap du lieu) hoac 'kill' de quan ly.", waitMs, taskID, cmdStr), nil
			}
		},
	})

	m.RegisterAlias("execute_command", "run_command")
	m.RegisterAlias("Bash", "run_command")
}
