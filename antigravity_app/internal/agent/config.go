package agent

import (
	"os"
	"path/filepath"
)

// CheckpointProvider định nghĩa giao diện tương tác với cơ chế Checkpoint & Rollback
type CheckpointProvider interface {
	CreateCheckpoint(sessionID, desc string, filePaths []string) (*Checkpoint, error)
	Rollback(checkpointID string) error
}

// HarnessConfig chứa toàn bộ tham số cấu hình nâng cao của Agent Harness
type HarnessConfig struct {
	Model               string  `json:"model"`
	MaxTurns            int     `json:"maxTurns"`
	MaxRepairs          int     `json:"maxRepairs"`
	SafetyMode          string  `json:"safetyMode"` // "strict", "balanced", "yolo"
	TokenLimit          int     `json:"tokenLimit"`
	CompactionThreshold float64 `json:"compactionThreshold"`
	BaseURL             string  `json:"baseUrl"`
	APIKey              string  `json:"apiKey"`
	SessionDir          string  `json:"sessionDir"`
}

// DefaultConfig trả về cấu hình tối ưu mặc định kết nối với AI Bridge hoặc OpenAI-compatible API
func DefaultConfig() HarnessConfig {
	model := os.Getenv("AI_MODEL")
	if model == "" {
		model = "glm-5.3-flash-free"
	}

	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("AI_API_KEY")
	}
	if apiKey == "" {
		apiKey = "free"
	}

	baseURL := os.Getenv("AI_BASE_URL")
	if baseURL == "" {
		baseURL = "http://127.0.0.1:5050/v1"
	}

	return HarnessConfig{
		Model:               model,
		MaxTurns:            25,
		MaxRepairs:          3,
		SafetyMode:          "balanced",
		TokenLimit:          24000,
		CompactionThreshold: 0.75,
		BaseURL:             baseURL,
		APIKey:              apiKey,
		SessionDir:          filepath.Join(".ttgide", "sessions"),
	}
}
