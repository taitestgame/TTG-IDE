package context

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// ProjectMemory lưu trữ các quy chuẩn kiến trúc, nguyên tắc và bài học kinh nghiệm dài hạn
type ProjectMemory struct {
	ProjectName  string   `json:"projectName"`  // Tên dự án
	TechStack    string   `json:"techStack"`    // Công nghệ sử dụng (vd: Go, React)
	Architecture string   `json:"architecture"` // Kiến trúc (vd: Clean Architecture)
	Rules        []string `json:"rules"`        // Các nguyên tắc bắt buộc AI tuân thủ
	Database     string   `json:"database"`     // Loại cơ sở dữ liệu
	Lessons      []string `json:"lessons"`      // Bài học kinh nghiệm tích luỹ dài hạn (Cross-Session)
}

// MemoryManager quản lý bộ nhớ dài hạn của workspace, tự động đồng bộ xuống đĩa
type MemoryManager struct {
	mu            sync.RWMutex
	memory        ProjectMemory
	workspacePath string
}

// NewMemoryManager khởi tạo bộ quản lý bộ nhớ dự án
func NewMemoryManager(workspacePath ...string) *MemoryManager {
	ws := ""
	if len(workspacePath) > 0 {
		ws = workspacePath[0]
	}
	mgr := &MemoryManager{
		workspacePath: ws,
		memory: ProjectMemory{
			Rules:   []string{},
			Lessons: []string{},
		},
	}
	if ws != "" {
		_ = mgr.Load()
	}
	return mgr
}

// SetWorkspace cập nhật workspace và tải bộ nhớ nếu có
func (m *MemoryManager) SetWorkspace(path string) {
	m.mu.Lock()
	m.workspacePath = path
	m.mu.Unlock()
	_ = m.Load()
}

// GetMemory trả về bản sao bộ nhớ hiện tại
func (m *MemoryManager) GetMemory() ProjectMemory {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.memory
}

// UpdateMemory cập nhật toàn bộ thông tin bộ nhớ
func (m *MemoryManager) UpdateMemory(mem ProjectMemory) {
	m.mu.Lock()
	m.memory = mem
	m.mu.Unlock()
	_ = m.Save()
}

// AddLesson bổ sung một bài học kinh nghiệm dài hạn mới và lưu lại
func (m *MemoryManager) AddLesson(lesson string) {
	if lesson == "" {
		return
	}
	m.mu.Lock()
	// Tránh trùng lặp bài học
	for _, l := range m.memory.Lessons {
		if l == lesson {
			m.mu.Unlock()
			return
		}
	}
	m.memory.Lessons = append(m.memory.Lessons, lesson)
	m.mu.Unlock()
	_ = m.Save()
}

// AddRule bổ sung quy tắc mới
func (m *MemoryManager) AddRule(rule string) {
	if rule == "" {
		return
	}
	m.mu.Lock()
	for _, r := range m.memory.Rules {
		if r == rule {
			m.mu.Unlock()
			return
		}
	}
	m.memory.Rules = append(m.memory.Rules, rule)
	m.mu.Unlock()
	_ = m.Save()
}

// Save lưu bộ nhớ vào file .ttgide/memory.json trong workspace
func (m *MemoryManager) Save() error {
	if m.workspacePath == "" {
		return nil
	}
	m.mu.RLock()
	data, err := json.MarshalIndent(m.memory, "", "  ")
	m.mu.RUnlock()
	if err != nil {
		return err
	}
	dir := filepath.Join(m.workspacePath, ".ttgide")
	_ = os.MkdirAll(dir, 0755)
	return os.WriteFile(filepath.Join(dir, "memory.json"), data, 0644)
}

// Load tải bộ nhớ từ .ttgide/memory.json nếu có
func (m *MemoryManager) Load() error {
	if m.workspacePath == "" {
		return nil
	}
	filePath := filepath.Join(m.workspacePath, ".ttgide", "memory.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return json.Unmarshal(data, &m.memory)
}
