package git

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"

	"ttgide/internal/capabilities"
)

// runGitRunner ham helper thuc thi git
func runGitRunner(ctx context.Context, workspaceRoot string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	capabilities.HideWindow(cmd)
	cmd.Dir = workspaceRoot
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("lenh git %s that bai: %w (%s)", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

// RegisterGitActionTool dang ky rieng cong cu git_action
func RegisterGitActionTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "git_action",
			Description: "Thao tac Git tong hop: kiem tra trang thai (status), xem diff, commit code, xem lich su log hoac danh sach branch.",
			Category:    "git",
			Parameters: map[string]any{
				"action":  "hanh dong Git: 'status', 'diff', 'commit', 'log', 'branch'",
				"message": "thong diep commit (bat buoc cho action='commit')",
				"file":    "file cu the can xem diff (tuy chon cho action='diff')",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			action, ok := args["action"].(string)
			if !ok || action == "" {
				action = "status"
			}

			switch strings.ToLower(action) {
			case "status":
				out, err := runGitRunner(ctx, workspaceRoot, "status", "--short")
				if err != nil {
					return "", err
				}
				if out == "" {
					return "Working tree clean (Khong co file nao bi sua doi).", nil
				}
				return out, nil

			case "diff":
				cmdArgs := []string{"diff"}
				if f, ok := args["file"].(string); ok && f != "" {
					cmdArgs = append(cmdArgs, f)
				}
				out, err := runGitRunner(ctx, workspaceRoot, cmdArgs...)
				if err != nil {
					return "", err
				}
				if out == "" {
					return "Khong co thay doi code nao so voi commit gan nhat.", nil
				}
				return out, nil

			case "commit":
				msg, _ := args["message"].(string)
				if msg == "" {
					return "", fmt.Errorf("thieu thong diep commit ('message')")
				}
				if _, err := runGitRunner(ctx, workspaceRoot, "add", "-A"); err != nil {
					return "", fmt.Errorf("git add that bai: %w", err)
				}
				return runGitRunner(ctx, workspaceRoot, "commit", "-m", msg)

			case "log":
				return runGitRunner(ctx, workspaceRoot, "log", "-n", "10", "--oneline")

			case "branch":
				return runGitRunner(ctx, workspaceRoot, "branch", "-a")

			default:
				return "", fmt.Errorf("hanh dong git '%s' khong duoc ho tro. Cac hanh dong ho tro: status, diff, commit, log, branch", action)
			}
		},
	})
}
