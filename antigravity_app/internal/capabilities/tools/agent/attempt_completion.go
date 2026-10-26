package agenttools

import (
	"context"
	"fmt"
	"strings"

	"ttgide/internal/capabilities"
)

// RegisterAttemptCompletionTool dang ky cong cu attempt_completion (chuan Cline, Roo Code, Devin)
// Day la cong cu dung duy nhat de agent bao hieu da hoan thanh nhiem vu va trinh bay ket qua cuoi cung
func RegisterAttemptCompletionTool(m *capabilities.Manager) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "attempt_completion",
			Description: "Call this tool ONCE you have fully implemented, tested, and completed the user's task. This is the mandatory completion tool in this IDE. Do NOT conclude by outputting conversational text alone.",
			Category:    "agent",
			Parameters: map[string]any{
				"result":  "The comprehensive explanation, summary of changes made, and test results (required)",
				"command": "A CLI verification or test command to run or demonstrate completion (optional)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			res, _ := args["result"].(string)
			if res == "" {
				res, _ = args["Result"].(string)
			}
			if res == "" {
				res, _ = args["content"].(string)
			}
			if res == "" {
				res, _ = args["answer"].(string)
			}
			if strings.TrimSpace(res) == "" {
				return "", fmt.Errorf("thieu tham so 'result' trinh bay ket qua hoan thanh")
			}
			cmd, _ := args["command"].(string)
			if cmd != "" {
				return fmt.Sprintf("✓ Hoàn thành nhiệm vụ:\n%s\n(Lệnh kiểm thử đã xác minh: %s)", res, cmd), nil
			}
			return fmt.Sprintf("✓ Hoàn thành nhiệm vụ:\n%s", res), nil
		},
	})

	// Aliases cho cac chuan khac
	m.RegisterAlias("finish_task", "attempt_completion")
	m.RegisterAlias("complete_task", "attempt_completion")
	m.RegisterAlias("task_completed", "attempt_completion")
}
