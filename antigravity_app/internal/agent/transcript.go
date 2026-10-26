package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// =============================================================================
// TRANSCRIPT LOGGER — PERSISTENCE & AUDIT TRAIL (Antigravity JSONL)
// =============================================================================

type TranscriptLogger struct {
	mu   sync.Mutex
	file *os.File
}

func NewTranscriptLogger(sessionDir, sessionID string) (*TranscriptLogger, error) {
	if sessionDir == "" {
		sessionDir = filepath.Join(os.TempDir(), "ttgide_transcripts")
	}
	dir := filepath.Join(sessionDir, sessionID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(dir, "transcript.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}
	return &TranscriptLogger{file: f}, nil
}

func (tl *TranscriptLogger) Log(stepType string, data any) {
	if tl == nil || tl.file == nil {
		return
	}
	tl.mu.Lock()
	defer tl.mu.Unlock()

	entry := map[string]any{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"type":      stepType,
		"data":      data,
	}
	line, _ := json.Marshal(entry)
	tl.file.Write(append(line, '\n'))
}

func (tl *TranscriptLogger) Close() {
	if tl != nil && tl.file != nil {
		tl.file.Close()
	}
}
