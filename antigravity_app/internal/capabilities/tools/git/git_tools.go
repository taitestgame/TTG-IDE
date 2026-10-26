package git

import (
	"ttgide/internal/capabilities"
)

// RegisterGitTools dieu phoi dang ky toan bo 4 cong cu Git:
// 1. git_action_tool.go -> git_action
// 2. git_status_tool.go -> git_status
// 3. git_diff_tool.go   -> git_diff
// 4. git_commit_tool.go -> git_commit
func RegisterGitTools(m *capabilities.Manager, workspaceRoot string) {
	RegisterGitActionTool(m, workspaceRoot)
	RegisterGitStatusTool(m, workspaceRoot)
	RegisterGitDiffTool(m, workspaceRoot)
	RegisterGitCommitTool(m, workspaceRoot)
}
