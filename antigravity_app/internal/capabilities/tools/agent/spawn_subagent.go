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
			Description: "Spawn a specialized subagent to perform an isolated subtask (code inspection, reading docs, testing logic) and return concise results to the parent agent.",
			Category:    "agent",
			Parameters: map[string]any{
				"task":         "Specific task description to delegate to the subagent",
				"instructions": "Additional constraints, guidelines, or inspection scope for the subagent (optional)",
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
