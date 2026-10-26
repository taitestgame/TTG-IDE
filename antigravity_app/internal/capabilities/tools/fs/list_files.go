package fs

import (
	"context"

	"ttgide/internal/capabilities"
)

// RegisterListFilesTool dang ky rieng cong cu list_files (alias tuong thich cua list_dir)
func RegisterListFilesTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "list_files",
			Description: "Alias tuong thich nguoc cua list_dir: Liet ke danh sach file va thu muc trong project.",
			Category:    "fs",
			Parameters: map[string]any{
				"path":  "duong dan thu muc can xem (tuy chon, mac dinh la goc project)",
				"depth": "do sau can liet ke (tuy chon, mac dinh la 1)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			return m.Execute(ctx, "list_dir", args)
		},
	})
}
