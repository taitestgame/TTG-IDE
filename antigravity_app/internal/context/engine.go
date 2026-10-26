package context

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Engine chịu trách nhiệm thu thập, tối ưu hóa và định dạng ngữ cảnh cho AI nhằm tiết kiệm token và tăng độ chính xác
type Engine struct {
	workspaceRoot string
	memManager    *MemoryManager
}

// NewEngine khởi tạo Context Engine
func NewEngine(workspaceRoot string, memManager *MemoryManager) *Engine {
	return &Engine{
		workspaceRoot: workspaceRoot,
		memManager:    memManager,
	}
}

// GetMemoryManager trả về bộ quản lý bộ nhớ dài hạn
func (e *Engine) GetMemoryManager() *MemoryManager {
	return e.memManager
}

// GetWorkspaceRoot trả về đường dẫn workspace
func (e *Engine) GetWorkspaceRoot() string {
	return e.workspaceRoot
}

// AssembleContext tổng hợp ngữ cảnh hoàn chỉnh bao gồm thư mục, quy tắc dự án, bài học dài hạn và file đang mở
func (e *Engine) AssembleContext(userRequest string, activeFile string, activeCode string) string {
	var sb strings.Builder

	sb.WriteString("=== NGỮ CẢNH DỰ ÁN TTG IDE ===\n")
	sb.WriteString(fmt.Sprintf("Thư mục dự án: %s\n", e.workspaceRoot))
	sb.WriteString(fmt.Sprintf("[YÊU CẦU NGƯỜI DÙNG]: \"%s\"\n", userRequest))

	// Tự động đính kèm danh sách file gốc để AI luôn nắm rõ dự án từ đầu
	if e.workspaceRoot != "" {
		entries, err := os.ReadDir(e.workspaceRoot)
		if err == nil && len(entries) > 0 {
			sb.WriteString("\n[CÁC TỆP / THƯ MỤC TRONG DỰ ÁN]:\n")
			count := 0
			for _, entry := range entries {
				name := entry.Name()
				if strings.HasPrefix(name, ".") || name == "node_modules" || name == "dist" || name == "__pycache__" {
					continue
				}
				if entry.IsDir() {
					sb.WriteString(fmt.Sprintf("- [DIR] %s/\n", name))
				} else {
					sb.WriteString(fmt.Sprintf("- [FILE] %s\n", name))
				}
				count++
				if count >= 25 {
					sb.WriteString("- ...\n")
					break
				}
			}
		}

		// Đọc tệp package.json nếu có
		pkgPath := filepath.Join(e.workspaceRoot, "package.json")
		if data, err := os.ReadFile(pkgPath); err == nil && len(data) > 0 {
			sb.WriteString("\n[TỆP CẤU HÌNH package.json]:\n```json\n" + string(data) + "\n```\n")
		}
	}

	if e.memManager != nil {
		mem := e.memManager.GetMemory()
		if mem.ProjectName != "" || len(mem.Rules) > 0 || len(mem.Lessons) > 0 {
			sb.WriteString("\n[BỘ NHỚ & NGUYÊN TẮC DỰ ÁN DÀI HẠN]\n")
			if mem.TechStack != "" {
				sb.WriteString(fmt.Sprintf("- Công nghệ: %s\n", mem.TechStack))
			}
			if mem.Architecture != "" {
				sb.WriteString(fmt.Sprintf("- Kiến trúc: %s\n", mem.Architecture))
			}
			for _, r := range mem.Rules {
				sb.WriteString(fmt.Sprintf("- Quy tắc: %s\n", r))
			}
			if len(mem.Lessons) > 0 {
				sb.WriteString("- Bài học & kinh nghiệm dài hạn (Cross-Session):\n")
				for _, l := range mem.Lessons {
					sb.WriteString(fmt.Sprintf("  * %s\n", l))
				}
			}
		}
	}

	if activeFile != "" {
		sb.WriteString(fmt.Sprintf("\n[ACTIVE FILE]: %s\n", activeFile))
		if activeCode != "" {
			sb.WriteString("```\n" + activeCode + "\n```\n")
		}
	}

	sb.WriteString("\n=== KẾT THÚC NGỮ CẢNH ===\n")
	return sb.String()
}
