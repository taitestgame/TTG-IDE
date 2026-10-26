package terminal

import (
	"ttgide/internal/capabilities"
)

// RegisterTerminalTools dieu phoi dang ky toan bo cac cong cu terminal:
// 1. run_command_tool.go -> run_command
// 2. manage_task_tool.go -> manage_task
func RegisterTerminalTools(m *capabilities.Manager, workspaceRoot string) {
	RegisterRunCommandTool(m, workspaceRoot)
	RegisterManageTaskTool(m)
	RegisterScheduleTool(m)
}
