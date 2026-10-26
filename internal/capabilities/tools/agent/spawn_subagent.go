package agenttools

import (
	"context"
	"fmt"

	"ttgide/internal/capabilities"
)

// RegisterSpawnSubagentTool dang ky cong cu spawn_subagent cho AI Agent
func RegisterSpawnSubagentTool(m *capabilities.Manager, host AgentHost) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "spawn_subagent",
			Description: "Khoi tao mot Agent phu (Subagent) chuyen trach xu ly tac vu con doc lap (khao sat code, doc tai lieu, kiem tra logic) va tra ve ket qua suc tich cho Agent chinh.",
			Category:    "agent",
			Parameters: map[string]any{
				"task":         "Nhiem vu cu the can giao cho subagent",
				"instructions": "Chi dan chi tiet bo sung hoac pham vi kiem tra",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			if host == nil {
				return "", fmt.Errorf("AgentHost chua duoc khoi tao de spawn subagent")
			}
			task, _ := args["task"].(string)
			inst, _ := args["instructions"].(string)
			if task == "" {
				return "", fmt.Errorf("tham so 'task' khong duoc de trong")
			}
			return host.RunSubAgent(ctx, "subagent_task", task, inst)
		},
	})
}
