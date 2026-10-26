package fs

import (
	"fmt"
	"os"
)

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
		"venv":         true,
		"__pycache__":  true,
	}
	return ignored[name]
}

func countChildren(dirPath string) int {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if !isIgnoredDir(e.Name()) {
			count++
		}
	}
	return count
}

func formatFileSize(bytes int64) string {
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	} else if bytes < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
}
