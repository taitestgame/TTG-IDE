package checkpoint

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"ttgide/internal/agent"
)

// FileSnapshot chứa bản chụp nội dung ban đầu của file trước khi bị chỉnh sửa
type FileSnapshot struct {
	Path    string `json:"path"`
	Content []byte `json:"-"`
}

// SnapshotRecord lưu trữ thông tin một bản ghi checkpoint cùng dữ liệu snapshot
type SnapshotRecord struct {
	Checkpoint agent.Checkpoint
	Snapshots  map[string][]byte
}

// Manager quản lý việc tạo các điểm sao lưu (Checkpoint) và phục hồi mã nguồn (Rollback)
type Manager struct {
	mu          sync.Mutex
	workspace   string
	checkpoints map[string]*SnapshotRecord
	history     []string // Thứ tự ID của các checkpoint theo thời gian
}

// NewManager khởi tạo bộ quản lý Checkpoint
func NewManager(workspace string) *Manager {
	return &Manager{
		workspace:   workspace,
		checkpoints: make(map[string]*SnapshotRecord),
		history:     make([]string, 0),
	}
}

// CreateCheckpoint chụp trạng thái hiện tại của các file mục tiêu trước khi AI Agent thực hiện thay đổi
func (m *Manager) CreateCheckpoint(sessionID, desc string, filePaths []string) (*agent.Checkpoint, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := fmt.Sprintf("cp_%d", time.Now().UnixMilli())
	snapshots := make(map[string][]byte)
	var modifiedFiles []string
	var createdFiles []string

	for _, p := range filePaths {
		fullPath := p
		if !filepath.IsAbs(p) {
			fullPath = filepath.Join(m.workspace, p)
		}
		data, err := os.ReadFile(fullPath)
		if err == nil {
			snapshots[p] = data
			modifiedFiles = append(modifiedFiles, p)
		} else {
			// File chưa tồn tại trước đó -> Nếu AI tạo tệp thì khi rollback sẽ xóa tệp này
			snapshots[p] = nil
			createdFiles = append(createdFiles, p)
		}
	}

	cp := agent.Checkpoint{
		ID:            id,
		SessionID:     sessionID,
		Description:   desc,
		Files:         filePaths,
		ModifiedFiles: modifiedFiles,
		CreatedFiles:  createdFiles,
		CreatedAt:     time.Now(),
	}

	m.checkpoints[id] = &SnapshotRecord{
		Checkpoint: cp,
		Snapshots:  snapshots,
	}
	m.history = append(m.history, id)

	return &cp, nil
}

// Rollback khôi phục toàn bộ các file về trạng thái chính xác tại thời điểm lưu checkpointID
// Tệp đã sửa đổi sẽ được ghi lại nội dung gốc; tệp do AI tạo mới sẽ bị xóa đi hoàn toàn
func (m *Manager) Rollback(checkpointID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	record, exists := m.checkpoints[checkpointID]
	if !exists {
		return fmt.Errorf("không tìm thấy checkpoint có mã %s", checkpointID)
	}

	for p, content := range record.Snapshots {
		fullPath := p
		if !filepath.IsAbs(p) {
			fullPath = filepath.Join(m.workspace, p)
		}
		if content == nil {
			// File do AI tạo mới trong phiên này -> Xóa đi để hoàn tác 100%
			_ = os.Remove(fullPath)
		} else {
			// File đã tồn tại từ trước -> Phục hồi lại nội dung gốc
			if err := os.WriteFile(fullPath, content, 0644); err != nil {
				return fmt.Errorf("không thể phục hồi file %s: %w", p, err)
			}
		}
	}

	return nil
}

// ListCheckpoints trả về danh sách các điểm sao lưu gần nhất theo thứ tự thời gian mới nhất
func (m *Manager) ListCheckpoints() []agent.Checkpoint {
	m.mu.Lock()
	defer m.mu.Unlock()

	result := make([]agent.Checkpoint, 0, len(m.history))
	for i := len(m.history) - 1; i >= 0; i-- {
		id := m.history[i]
		if rec, ok := m.checkpoints[id]; ok {
			result = append(result, rec.Checkpoint)
		}
	}
	return result
}
