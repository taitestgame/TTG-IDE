package fs

import (
	"path/filepath"

	"ttgide/internal/capabilities"
)

// RegisterFSTools dieu phoi dang ky toan bo 8 cong cu thao tac file:
// 1. read_file_tool.go   -> read_file
// 2. write_file_tool.go  -> write_file
// 3. edit_file_tool.go   -> edit_file
// 4. list_dir_tool.go    -> list_dir
// 5. list_files_tool.go  -> list_files
// 6. delete_file_tool.go -> delete_file
// 7. move_file_tool.go   -> move_file
// 8. file_ops_tool.go    -> file_ops
func RegisterFSTools(m *capabilities.Manager, workspaceRoot string) {
	RegisterReadFileTool(m, workspaceRoot)
	RegisterWriteFileTool(m, workspaceRoot)
	RegisterEditFileTool(m, workspaceRoot)
	RegisterListDirTool(m, workspaceRoot)
	RegisterListFilesTool(m, workspaceRoot)
	RegisterDeleteFileTool(m, workspaceRoot)
	RegisterMoveFileTool(m, workspaceRoot)
	RegisterFileOpsTool(m, workspaceRoot)
}

// Cac alias tuong thich nguoc de bao dam zero regression voi cac test cu
func RegisterReadTool(m *capabilities.Manager, workspaceRoot string) {
	RegisterReadFileTool(m, workspaceRoot)
}

func RegisterWriteTool(m *capabilities.Manager, workspaceRoot string) {
	RegisterWriteFileTool(m, workspaceRoot)
}

func RegisterEditTool(m *capabilities.Manager, workspaceRoot string) {
	RegisterEditFileTool(m, workspaceRoot)
}

func RegisterListTool(m *capabilities.Manager, workspaceRoot string) {
	RegisterListDirTool(m, workspaceRoot)
	RegisterListFilesTool(m, workspaceRoot)
}

func RegisterDeleteTool(m *capabilities.Manager, workspaceRoot string) {
	RegisterDeleteFileTool(m, workspaceRoot)
}

func RegisterMoveTool(m *capabilities.Manager, workspaceRoot string) {
	RegisterMoveFileTool(m, workspaceRoot)
}

// resolvePath chuyen duong dan tuong doi thanh tuyet doi dua tren thu muc goc workspace
func resolvePath(root, p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(root, p)
}
