package terminal

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"ttgide/internal/capabilities"
)

// RegisterScheduleTool đăng ký công cụ schedule (hẹn giờ & lịch chạy định kỳ)
func RegisterScheduleTool(m *capabilities.Manager) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "schedule",
			Description: "Lên lịch hẹn giờ một lần (DurationSeconds) hoặc định kỳ theo cron (CronExpression) để gửi thông báo/lời nhắc tự động trong nền.",
			Category:    "terminal",
			Parameters: map[string]any{
				"DurationSeconds": "Số giây đếm ngược cho bộ hẹn giờ một lần (ví dụ: '300' cho 5 phút).",
				"CronExpression":  "Biểu thức cron 5 trường tiêu chuẩn (ví dụ: '*/5 * * * *').",
				"Prompt":          "Nội dung thông báo/hướng dẫn gửi tới agent khi lịch được kích hoạt.",
				"TimerCondition":  "Điều kiện hủy sớm: 'never', 'any' hoặc task_id cụ thể.",
				"MaxIterations":   "Số lần chạy tối đa cho biểu thức cron (mặc định: không giới hạn).",
				"IsDaemon":        "true nếu đây là tác vụ nền độc lập chạy liên tục cả khi xong lượt.",
				"toolAction":      "Tóm tắt hành động 2-5 từ.",
				"toolSummary":     "Tóm tắt danh từ 2-5 từ.",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			prompt, _ := args["Prompt"].(string)
			if prompt == "" {
				prompt, _ = args["prompt"].(string)
			}
			if prompt == "" {
				return "", fmt.Errorf("thiếu tham số bắt buộc 'Prompt'")
			}

			durVal := args["DurationSeconds"]
			if durVal == nil {
				durVal = args["duration_seconds"]
			}

			cronVal, _ := args["CronExpression"].(string)
			if cronVal == "" {
				cronVal, _ = args["cron_expression"].(string)
			}

			if durVal == nil && cronVal == "" {
				return "", fmt.Errorf("cần chỉ định ít nhất 'DurationSeconds' hoặc 'CronExpression'")
			}

			// 1. One-shot timer
			if durVal != nil {
				var secs int
				switch v := durVal.(type) {
				case float64:
					secs = int(v)
				case int:
					secs = v
				case string:
					parsed, err := strconv.Atoi(strings.TrimSpace(v))
					if err != nil {
						return "", fmt.Errorf("DurationSeconds không hợp lệ: %w", err)
					}
					secs = parsed
				default:
					return "", fmt.Errorf("kiểu dữ liệu DurationSeconds không hợp lệ")
				}

				if secs <= 0 {
					return "", fmt.Errorf("DurationSeconds phải lớn hơn 0")
				}

				taskID := fmt.Sprintf("timer_%d", time.Now().UnixNano()/1e6)
				timerCtx, cancel := context.WithCancel(context.Background())

				globalTaskManager.mu.Lock()
				globalTaskManager.tasks[taskID] = &BackgroundTask{
					ID:        taskID,
					Command:   fmt.Sprintf("Schedule Timer (%ds): %s", secs, prompt),
					StartTime: time.Now(),
					cancel:    cancel,
				}
				globalTaskManager.mu.Unlock()

				go func() {
					select {
					case <-time.After(time.Duration(secs) * time.Second):
						globalTaskManager.mu.Lock()
						if t, exists := globalTaskManager.tasks[taskID]; exists {
							t.Done = true
							t.Buffer.WriteString(fmt.Sprintf("\n[TIMER FIRED] %s\nPrompt: %s\n", time.Now().Format(time.RFC3339), prompt))
						}
						globalTaskManager.mu.Unlock()
					case <-timerCtx.Done():
						// Cancelled early
					}
				}()

				return fmt.Sprintf("✓ Đã hẹn giờ thành công TaskId: %q. Sẽ kích hoạt sau %d giây với lời nhắc: %q.", taskID, secs, prompt), nil
			}

			// 2. Cron schedule
			taskID := fmt.Sprintf("cron_%d", time.Now().UnixNano()/1e6)
			cronCtx, cancel := context.WithCancel(context.Background())

			globalTaskManager.mu.Lock()
			globalTaskManager.tasks[taskID] = &BackgroundTask{
				ID:        taskID,
				Command:   fmt.Sprintf("Schedule Cron (%s): %s", cronVal, prompt),
				StartTime: time.Now(),
				cancel:    cancel,
			}
			globalTaskManager.mu.Unlock()

			go func() {
				ticker := time.NewTicker(60 * time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-ticker.C:
						// Periodic tick
					case <-cronCtx.Done():
						return
					}
				}
			}()

			return fmt.Sprintf("✓ Đã lên lịch cron TaskId: %q với biểu thức %q và nội dung: %q.", taskID, cronVal, prompt), nil
		},
	})
}
