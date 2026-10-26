package search

import (
	"context"

	"ttgide/internal/capabilities"
)

// RegisterSearchCodeTool dang ky rieng cong cu search_code (alias tuong thich cua grep_search)
func RegisterSearchCodeTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "search_code",
			Description: "Alias tuong thich nguoc cua grep_search: Tim kiem chuoi ma nguon trong project.",
			Category:    "search",
			Parameters: map[string]any{
				"query": "chuoi van ban can tim",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			return m.Execute(ctx, "grep_search", args)
		},
	})
}
