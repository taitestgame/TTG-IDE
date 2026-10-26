package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	mu      sync.Mutex
	logPath string
)

// Init khởi tạo file log ghi sự kiện theo thời gian thực
func Init(workspaceRoot string) {
	mu.Lock()
	defer mu.Unlock()

	candidates := []string{
		`C:\code\python\Anchuyennganh\out.log`,
		filepath.Join(workspaceRoot, "out.log"),
	}

	for _, p := range candidates {
		dir := filepath.Dir(p)
		if dir != "" {
			_ = os.MkdirAll(dir, 0755)
		}
		f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if err == nil {
			f.Close()
			logPath = p
			break
		}
	}

	// Ghi dòng mở đầu
	ts := time.Now().Format("2006-01-02 15:04:05.000")
	startMsg := fmt.Sprintf("[%s] [INFO ] [System] === TTG IDE Log Engine khởi tạo thành công. LogPath: %s ===\n", ts, logPath)
	fmt.Print(startMsg)
	if logPath != "" {
		if f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644); err == nil {
			_, _ = f.WriteString(startMsg)
			_ = f.Close()
		}
	}
}

// Log ghi một dòng log kèm timestamp chuẩn ra console và file out.log
func Log(level, tag, msg string) {
	mu.Lock()
	defer mu.Unlock()

	ts := time.Now().Format("2006-01-02 15:04:05.000")
	line := fmt.Sprintf("[%s] [%-5s] [%s] %s\n", ts, level, tag, msg)
	fmt.Print(line)

	if logPath != "" {
		if f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644); err == nil {
			_, _ = f.WriteString(line)
			_ = f.Close()
		}
	}
}
