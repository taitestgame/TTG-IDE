package search

import (
	"ttgide/internal/capabilities"
)

// RegisterSearchTools dieu phoi dang ky toan bo 4 cong cu tim kiem va AST:
// 1. grep_search_tool.go    -> grep_search
// 2. search_code_tool.go    -> search_code
// 3. find_files_tool.go     -> find_files
// 4. extract_symbols_tool.go -> extract_symbols
func RegisterSearchTools(m *capabilities.Manager, workspaceRoot string) {
	RegisterGrepSearchTool(m, workspaceRoot)
	RegisterSearchCodeTool(m, workspaceRoot)
	RegisterFindFilesTool(m, workspaceRoot)
	RegisterExtractSymbolsTool(m, workspaceRoot)

	// Aliases cho Claude Code & Cline AST
	m.RegisterAlias("Grep", "grep_search")
	m.RegisterAlias("Glob", "find_files")
	m.RegisterAlias("list_code_definition_names", "extract_symbols")
}
