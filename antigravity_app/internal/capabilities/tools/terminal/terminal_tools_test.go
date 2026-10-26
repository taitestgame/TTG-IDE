package terminal

import (
	"context"
	"runtime"
	"strings"
	"testing"

	"ttgide/internal/capabilities"
)

func TestRunCommand_PowerShellUnwrap(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Chỉ kiểm tra PowerShell trên Windows")
	}

	cm := capabilities.NewManager()
	RegisterRunCommandTool(cm, ".")

	// Lệnh có bọc thừa powershell -NoProfile -Command "..."
	cmdInput := `powershell -NoProfile -Command "Write-Output ('HELLO' + '_WORLD')"`
	res, err := cm.Execute(context.Background(), "run_command", map[string]any{
		"command": cmdInput,
	})
	if err != nil {
		t.Fatalf("Execute thất bại: %v", err)
	}
	if !strings.Contains(res, "HELLO_WORLD") {
		t.Errorf("Kết quả mong đợi chứa 'HELLO_WORLD', nhưng nhận: %s", res)
	}
}
