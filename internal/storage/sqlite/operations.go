package sqlite

import (
	"database/sql"
	"time"
)

// SessionRecord đại diện cho phiên hội thoại lưu trong SQLite
type SessionRecord struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	WorkspacePath string    `json:"workspacePath"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// MessageRecord đại diện cho một tin nhắn
type MessageRecord struct {
	ID            string    `json:"id"`
	SessionID     string    `json:"sessionId"`
	Sender        string    `json:"sender"`
	Content       string    `json:"content"`
	ToolCallsJSON string    `json:"toolCallsJson"`
	Timestamp     time.Time `json:"timestamp"`
}

// AutomationRecord đại diện cho luồng tự động hóa
type AutomationRecord struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	TriggerType string    `json:"triggerType"`
	ActionType  string    `json:"actionType"`
	ConfigJSON  string    `json:"configJson"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
}

// MultiAIRunRecord đại diện cho phiên chạy Multi-AI
type MultiAIRunRecord struct {
	ID          string    `json:"id"`
	Prompt      string    `json:"prompt"`
	Strategy    string    `json:"strategy"`
	NodesJSON   string    `json:"nodesJson"`
	ResultsJSON string    `json:"resultsJson"`
	Synthesis   string    `json:"synthesis"`
	CreatedAt   time.Time `json:"createdAt"`
}

// SaveSession tạo hoặc cập nhật session
func (d *DB) SaveSession(id, title, wsPath string) error {
	query := `INSERT INTO sessions (id, title, workspace_path, updated_at) 
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP`
	_, err := d.conn.Exec(query, id, title, wsPath)
	return err
}

// ListSessions lấy danh sách session theo workspace
func (d *DB) ListSessions(wsPath string) ([]SessionRecord, error) {
	query := `SELECT id, title, workspace_path, created_at, updated_at 
		FROM sessions WHERE workspace_path = ? ORDER BY updated_at DESC`
	rows, err := d.conn.Query(query, wsPath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []SessionRecord
	for rows.Next() {
		var s SessionRecord
		if err := rows.Scan(&s.ID, &s.Title, &s.WorkspacePath, &s.CreatedAt, &s.UpdatedAt); err == nil {
			list = append(list, s)
		}
	}
	return list, nil
}

// DeleteSession xóa session và các tin nhắn liên quan
func (d *DB) DeleteSession(id string) error {
	_, err := d.conn.Exec(`DELETE FROM sessions WHERE id = ?`, id)
	return err
}

// SaveMessage lưu tin nhắn
func (d *DB) SaveMessage(id, sessionID, sender, content, toolCallsJSON string) error {
	query := `INSERT INTO messages (id, session_id, sender, content, tool_calls_json, timestamp)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	_, err := d.conn.Exec(query, id, sessionID, sender, content, toolCallsJSON)
	return err
}

// GetMessages lấy toàn bộ tin nhắn của một session
func (d *DB) GetMessages(sessionID string) ([]MessageRecord, error) {
	query := `SELECT id, session_id, sender, content, tool_calls_json, timestamp 
		FROM messages WHERE session_id = ? ORDER BY timestamp ASC`
	rows, err := d.conn.Query(query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []MessageRecord
	for rows.Next() {
		var m MessageRecord
		var toolJSON sql.NullString
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Sender, &m.Content, &toolJSON, &m.Timestamp); err == nil {
			if toolJSON.Valid {
				m.ToolCallsJSON = toolJSON.String
			}
			list = append(list, m)
		}
	}
	return list, nil
}

// DeleteMessagesFromId xóa tin nhắn từ messageID này trở về sau trong session (cho tính năng Undo / Thu hồi)
func (d *DB) DeleteMessagesFromId(sessionID, messageID string) error {
	var rowID int64
	err := d.conn.QueryRow(`SELECT rowid FROM messages WHERE session_id = ? AND id = ?`, sessionID, messageID).Scan(&rowID)
	if err == nil && rowID > 0 {
		_, err = d.conn.Exec(`DELETE FROM messages WHERE session_id = ? AND rowid >= ?`, sessionID, rowID)
		return err
	}
	var ts string
	err = d.conn.QueryRow(`SELECT timestamp FROM messages WHERE session_id = ? AND id = ?`, sessionID, messageID).Scan(&ts)
	if err == nil && ts != "" {
		_, err = d.conn.Exec(`DELETE FROM messages WHERE session_id = ? AND timestamp >= ?`, sessionID, ts)
		return err
	}
	_, err = d.conn.Exec(`DELETE FROM messages WHERE session_id = ? AND id = ?`, sessionID, messageID)
	return err
}

// SetSetting lưu cấu hình
func (d *DB) SetSetting(key, value string) error {
	query := `INSERT INTO settings (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`
	_, err := d.conn.Exec(query, key, value)
	return err
}

// GetSetting lấy giá trị cấu hình
func (d *DB) GetSetting(key string) (string, error) {
	var val string
	err := d.conn.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return val, err
}

// SaveMultiAIRun lưu phiên chạy Multi-AI
func (d *DB) SaveMultiAIRun(id, prompt, strategy, nodesJSON, resultsJSON, synthesis string) error {
	query := `INSERT INTO multi_ai_runs (id, prompt, strategy, nodes_json, results_json, synthesis, created_at)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	_, err := d.conn.Exec(query, id, prompt, strategy, nodesJSON, resultsJSON, synthesis)
	return err
}

// ListMultiAIRuns lấy danh sách lịch sử chạy Multi-AI
func (d *DB) ListMultiAIRuns() ([]MultiAIRunRecord, error) {
	query := `SELECT id, prompt, strategy, nodes_json, results_json, synthesis, created_at 
		FROM multi_ai_runs ORDER BY created_at DESC LIMIT 50`
	rows, err := d.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []MultiAIRunRecord
	for rows.Next() {
		var r MultiAIRunRecord
		if err := rows.Scan(&r.ID, &r.Prompt, &r.Strategy, &r.NodesJSON, &r.ResultsJSON, &r.Synthesis, &r.CreatedAt); err == nil {
			list = append(list, r)
		}
	}
	return list, nil
}
