package terminal

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"ttgide/internal/capabilities"
)

// RegisterManageTaskTool dang ky rieng cong cu manage_task (ho tro ca send_input tuong tac)
func RegisterManageTaskTool(m *capabilities.Manager) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "manage_task",
			Description: "Quan ly cac tien trinh chay ngam: liet ke (list), kiem tra trang thai (status), xem nhat ky (logs), gui du lieu vao stdin (send_input cho lenh tuong tac), hoac dung tien trinh (kill, kill_all).",
			Category:    "terminal",
			Parameters: map[string]any{
				"action":  "hanh dong can thuc hien: 'list', 'status', 'logs', 'send_input', 'kill', 'kill_all'",
				"task_id": "ma dinh danh cua task (bat buoc cho status, logs, send_input, kill)",
				"input":   "chuoi du lieu can gui vao stdin cua tien trinh (bat buoc khi action='send_input', vi du: 'y\\n')",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			action, ok := args["action"].(string)
			if !ok || action == "" {
				return "", fmt.Errorf("thieu tham so 'action' (list, status, logs, send_input, kill, kill_all)")
			}

			taskID, _ := args["task_id"].(string)

			globalTaskManager.mu.RLock()
			defer globalTaskManager.mu.RUnlock()

			switch strings.ToLower(action) {
			case "list":
				if len(globalTaskManager.tasks) == 0 {
					return "Hien tai khong co tien trinh chay ngam nao.", nil
				}
				var lines []string
				for id, t := range globalTaskManager.tasks {
					t.mu.RLock()
					status := "RUNNING"
					if t.Done {
						if t.Err != nil {
							status = fmt.Sprintf("FAILED (Exit: %d)", t.ExitCode)
						} else {
							status = "DONE"
						}
					}
					duration := time.Since(t.StartTime).Round(time.Second)
					lines = append(lines, fmt.Sprintf("- [%s] TaskId: %s | Lenh: %q | Thoi gian: %s", status, id, t.Command, duration))
					t.mu.RUnlock()
				}
				return strings.Join(lines, "\n"), nil

			case "status":
				if taskID == "" {
					return "", fmt.Errorf("thieu tham so 'task_id'")
				}
				t, exists := globalTaskManager.tasks[taskID]
				if !exists {
					return "", fmt.Errorf("khong tim thay task voi ID: %s", taskID)
				}
				t.mu.RLock()
				defer t.mu.RUnlock()
				if t.Done {
					if t.Err != nil {
						return fmt.Sprintf("Task %s da hoan thanh voi LOI (Exit Code: %d): %v", taskID, t.ExitCode, t.Err), nil
					}
					return fmt.Sprintf("Task %s da HOAN THANH thanh cong (Exit Code: 0).", taskID), nil
				}
				return fmt.Sprintf("Task %s DANG CHAY (thoi gian: %s).", taskID, time.Since(t.StartTime).Round(time.Second)), nil

			case "logs":
				if taskID == "" {
					return "", fmt.Errorf("thieu tham so 'task_id'")
				}
				t, exists := globalTaskManager.tasks[taskID]
				if !exists {
					return "", fmt.Errorf("khong tim thay task voi ID: %s", taskID)
				}
				t.mu.RLock()
				defer t.mu.RUnlock()
				logs := truncateOutput(t.Buffer.String(), 20000)
				if logs == "" {
					return fmt.Sprintf("Task %s chua co output nao.", taskID), nil
				}
				return fmt.Sprintf("=== LOGS CUA TASK %s ===\n%s", taskID, logs), nil

			case "send_input":
				if taskID == "" {
					return "", fmt.Errorf("thieu tham so 'task_id'")
				}
				inputStr, _ := args["input"].(string)
				if inputStr == "" {
					return "", fmt.Errorf("thieu tham so 'input' can gui toi tien trinh")
				}
				t, exists := globalTaskManager.tasks[taskID]
				if !exists {
					return "", fmt.Errorf("khong tim thay task voi ID: %s", taskID)
				}
				t.mu.Lock()
				if t.Done {
					t.mu.Unlock()
					return "", fmt.Errorf("task %s da ket thuc, khong the gui input", taskID)
				}
				if t.Stdin == nil {
					t.mu.Unlock()
					return "", fmt.Errorf("task %s khong co stdin pipe", taskID)
				}
				if !strings.HasSuffix(inputStr, "\n") {
					inputStr += "\n"
				}
				_, err := t.Stdin.Write([]byte(inputStr))
				t.mu.Unlock()
				if err != nil {
					return "", fmt.Errorf("loi khi gui du lieu vao stdin cua task %s: %w", taskID, err)
				}
				return fmt.Sprintf("✓ Da gui input toi task %s: %q", taskID, strings.TrimSpace(inputStr)), nil

			case "kill":
				if taskID == "" {
					return "", fmt.Errorf("thieu tham so 'task_id'")
				}
				t, exists := globalTaskManager.tasks[taskID]
				if !exists {
					return "", fmt.Errorf("khong tim thay task voi ID: %s", taskID)
				}
				t.cancel()
				if t.Cmd != nil && t.Cmd.Process != nil {
					if runtime.GOOS == "windows" {
						killCmd := exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", t.Cmd.Process.Pid))
						capabilities.HideWindow(killCmd)
						_ = killCmd.Run()
					}
					_ = t.Cmd.Process.Kill()
				}
				t.mu.Lock()
				t.Done = true
				t.mu.Unlock()
				return fmt.Sprintf("Da dung tien trinh cua Task: %s", taskID), nil

			case "kill_all":
				count := 0
				for _, t := range globalTaskManager.tasks {
					t.cancel()
					if t.Cmd != nil && t.Cmd.Process != nil {
						if runtime.GOOS == "windows" {
							killCmd := exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", t.Cmd.Process.Pid))
							capabilities.HideWindow(killCmd)
							_ = killCmd.Run()
						}
						_ = t.Cmd.Process.Kill()
					}
					t.mu.Lock()
					t.Done = true
					t.mu.Unlock()
					count++
				}
				return fmt.Sprintf("Da dung toan bo %d tien trinh chay ngam.", count), nil

			default:
				return "", fmt.Errorf("hanh dong '%s' khong hop le. Cac hanh dong ho tro: list, status, logs, send_input, kill, kill_all", action)
			}
		},
	})
}
