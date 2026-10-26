package fs

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"ttgide/internal/capabilities"
)

func TestEditFile_LineRangeAndBadgePath(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_edit_file_*")
	if err != nil {
		t.Fatalf("Không tạo được temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	subDir := filepath.Join(tempDir, "src")
	_ = os.MkdirAll(subDir, 0755)
	testFile := filepath.Join(subDir, "index.css")

	initialContent := "/* Line 1 */\n/* Line 2 */\n/* Line 3 */\n/* Line 4 */\n/* Line 5 */\n"
	if err := os.WriteFile(testFile, []byte(initialContent), 0644); err != nil {
		t.Fatalf("Không ghi được test file: %v", err)
	}

	mgr := capabilities.NewManager()
	RegisterEditFileTool(mgr, tempDir)

	// Test 1: Sửa file với path có badge "{} src/index.css", end_line là chuỗi "3", target rỗng
	args := map[string]any{
		"path":        "{} src/index.css",
		"start_line":  "1",
		"end_line":    "3",
		"replacement": "@import \"tailwindcss\";",
	}

	res, err := mgr.Execute(context.Background(), "edit_file", args)
	if err != nil {
		t.Fatalf("edit_file thất bại: %v", err)
	}
	if !strings.Contains(res, "thành công") && !strings.Contains(res, "thanh cong") {
		t.Errorf("Kết quả trả về không như mong đợi: %s", res)
	}

	updated, err := os.ReadFile(testFile)
	if err != nil {
		t.Fatalf("Không đọc được file sau khi sửa: %v", err)
	}
	updatedStr := string(updated)

	if !strings.Contains(updatedStr, "@import \"tailwindcss\";") {
		t.Errorf("Nội dung thay thế không có trong file: %s", updatedStr)
	}
	if !strings.Contains(updatedStr, "/* Line 4 */") {
		t.Errorf("Các dòng ngoài phạm vi bị mất: %s", updatedStr)
	}
	if strings.Contains(updatedStr, "/* Line 1 */") {
		t.Errorf("Dòng 1 chưa bị thay thế: %s", updatedStr)
	}
}
