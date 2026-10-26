package search

func isIgnoredDir(name string) bool {
	ignored := map[string]bool{
		".git":         true,
		"node_modules": true,
		"vendor":       true,
		".ttgide":      true,
		".idea":        true,
		".vscode":      true,
		"dist":         true,
		"bin":          true,
		".gemini":      true,
	}
	return ignored[name]
}
