package skills

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Skill đại diện cho một gói hướng dẫn kỹ năng chuyên môn dạng module cho AI Agent
type Skill struct {
	Name        string `json:"name"`        // Tên kỹ năng (vd: react, flutter, go, debugging)
	Description string `json:"description"` // Mô tả mục đích của kỹ năng
	Content     string `json:"content"`     // Nội dung hướng dẫn Markdown bên trong SKILL.md
	Path        string `json:"path"`        // Đường dẫn file
}

// Manager phụ trách nạp và tìm kiếm các kỹ năng sẵn có trong thư mục skills/
type Manager struct {
	skillsDir string
	skills    map[string]Skill
}

// NewManager khởi tạo bộ quản lý kỹ năng
func NewManager(skillsDir string) *Manager {
	return &Manager{
		skillsDir: skillsDir,
		skills:    make(map[string]Skill),
	}
}

// LoadAll quét toàn bộ thư mục skills/ và nạp tất cả các file SKILL.md vào bộ nhớ
func (m *Manager) LoadAll() error {
	if _, err := os.Stat(m.skillsDir); os.IsNotExist(err) {
		return nil
	}

	return filepath.WalkDir(m.skillsDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if strings.EqualFold(d.Name(), "SKILL.md") {
			data, readErr := os.ReadFile(p)
			if readErr == nil {
				skillName := filepath.Base(filepath.Dir(p))
				m.skills[skillName] = Skill{
					Name:    skillName,
					Content: string(data),
					Path:    p,
				}
			}
		}
		return nil
	})
}

// GetSkill lấy thông tin một kỹ năng cụ thể theo tên
func (m *Manager) GetSkill(name string) (Skill, error) {
	s, ok := m.skills[name]
	if !ok {
		return Skill{}, fmt.Errorf("không tìm thấy kỹ năng có tên '%s'", name)
	}
	return s, nil
}

// ListSkills trả về danh sách toàn bộ các kỹ năng đã được nạp
func (m *Manager) ListSkills() []Skill {
	res := make([]Skill, 0, len(m.skills))
	for _, s := range m.skills {
		res = append(res, s)
	}
	return res
}
