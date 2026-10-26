package terminal

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

// BackgroundTask dai dien cho mot tien trinh shell dang chay ngam
type BackgroundTask struct {
	ID        string
	Command   string
	StartTime time.Time
	Cmd       *exec.Cmd
	Buffer    *bytes.Buffer
	Stdin     io.WriteCloser
	mu        sync.RWMutex
	Done      bool
	ExitCode  int
	Err       error
	cancel    context.CancelFunc
}

// TaskManager quan ly tap trung cac tien trinh chay ngam
type TaskManager struct {
	mu    sync.RWMutex
	tasks map[string]*BackgroundTask
}

var globalTaskManager = &TaskManager{
	tasks: make(map[string]*BackgroundTask),
}

// IsTaskRunning kiem tra xem taskID con dang chay khong
func IsTaskRunning(taskID string) bool {
	globalTaskManager.mu.RLock()
	defer globalTaskManager.mu.RUnlock()
	t, exists := globalTaskManager.tasks[taskID]
	if !exists {
		return false
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	return !t.Done
}

// GetActiveTaskIDs tra ve danh sach cac taskID dang thuc su chay ngam
func GetActiveTaskIDs() []string {
	globalTaskManager.mu.RLock()
	defer globalTaskManager.mu.RUnlock()
	var running []string
	for id, t := range globalTaskManager.tasks {
		t.mu.RLock()
		if !t.Done {
			running = append(running, id)
		}
		t.mu.RUnlock()
	}
	return running
}

// truncateOutput gioi han do dai ky tu dau ra de ngan chan tran context
func truncateOutput(output string, maxChars int) string {
	if len(output) <= maxChars {
		return output
	}
	truncatedBytes := len(output) - maxChars
	return output[:maxChars] + fmt.Sprintf("\n\n... [CAT BOT: Dau ra qua dai, da luoc bo %d ky tu de bao ve context window] ...", truncatedBytes)
}
