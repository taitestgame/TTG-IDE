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
	cancel         context.CancelFunc
	IsBackgrounded bool
}

// TaskCompletionCallback duoc goi khi mot BackgroundTask ket thuc thuc thi
type TaskCompletionCallback func(task *BackgroundTask)

// TaskManager quan ly tap trung cac tien trinh chay ngam
type TaskManager struct {
	mu         sync.RWMutex
	tasks      map[string]*BackgroundTask
	onComplete TaskCompletionCallback
}

var globalTaskManager = &TaskManager{
	tasks: make(map[string]*BackgroundTask),
}

// SetTaskCompletionCallback dang ky ham callback lang nghe su kien khi task chay ngam hoan tat
func SetTaskCompletionCallback(cb TaskCompletionCallback) {
	globalTaskManager.mu.Lock()
	defer globalTaskManager.mu.Unlock()
	globalTaskManager.onComplete = cb
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

// GetSummary tra ve thong tin tom tat an toan cua background task
func (t *BackgroundTask) GetSummary(maxChars int) (id, cmd string, exitCode int, done bool, err error, output string) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	id = t.ID
	cmd = t.Command
	exitCode = t.ExitCode
	done = t.Done
	err = t.Err
	if t.Buffer != nil {
		output = truncateOutput(t.Buffer.String(), maxChars)
	}
	return
}

// truncateOutput gioi han do dai ky tu dau ra de ngan chan tran context
func truncateOutput(output string, maxChars int) string {
	if len(output) <= maxChars {
		return output
	}
	truncatedBytes := len(output) - maxChars
	return output[:maxChars] + fmt.Sprintf("\n\n... [CAT BOT: Dau ra qua dai, da luoc bo %d ky tu de bao ve context window] ...", truncatedBytes)
}
