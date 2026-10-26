package agent

import (
	"fmt"
	"strings"
)

// =============================================================================
// SAFETY GATE — CỔNG AN TOÀN 3 LỚP (Claude Code + Antigravity)
// =============================================================================

type PermissionLevel int

const (
	PermReadOnly PermissionLevel = iota
	PermWrite
	PermDangerous
)

// Danh sách lệnh cấm tuyệt đối (Pattern Blocklist)
var blockedPatterns = []string{
	"rm -rf /", "rm -rf ~", "rm -rf *",
	"git push -f", "git push --force",
	"DROP DATABASE", "DROP TABLE",
	"format C:", "del /s /q C:",
	":(){:|:&};:", // Fork bomb
	"mkfs.", "dd if=",
}

type SafetyGate struct {
	mode string
}

func NewSafetyGate(mode string) *SafetyGate {
	if mode == "" {
		mode = "balanced"
	}
	return &SafetyGate{mode: mode}
}

func (sg *SafetyGate) Check(toolName string, args map[string]any, requiresAuth bool) (bool, string) {
	// Lớp 1: Pattern Blocklist - Chặn các lệnh phá hoại tuyệt đối
	if toolName == "run_command" {
		cmd, _ := args["command"].(string)
		cmdLower := strings.ToLower(cmd)
		for _, pattern := range blockedPatterns {
			if strings.Contains(cmdLower, strings.ToLower(pattern)) {
				return false, fmt.Sprintf("❌ BLOCKED: Lệnh chứa pattern nguy hiểm '%s'", pattern)
			}
		}
	}

	// Lớp 2: Permission Classification & Auth check
	if sg.mode == "yolo" {
		return true, "YOLO mode: Tự động phê duyệt"
	}

	if requiresAuth && sg.mode == "strict" {
		return false, fmt.Sprintf("⚠️ Tool '%s' yêu cầu người dùng xác nhận phê duyệt (Strict Mode)", toolName)
	}

	// Kiểm tra các công cụ xoá file / thư mục
	switch toolName {
	case "delete_file", "delete_directory":
		if sg.mode != "yolo" {
			return false, fmt.Sprintf("⚠️ Tool xoá '%s' yêu cầu phê duyệt an toàn", toolName)
		}
	}

	return true, "Phê duyệt an toàn"
}
