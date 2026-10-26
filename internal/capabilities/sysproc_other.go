//go:build !windows

package capabilities

import "os/exec"

// HideWindow khong can thuc hien gi tren Unix/Linux/macOS
func HideWindow(cmd *exec.Cmd) {}
