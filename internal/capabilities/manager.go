package capabilities

import (
	"context"
	"fmt"
	"strings"
	"sync"
)

// Manager quản lý việc đăng ký, phân quyền và điều phối thực thi các công cụ (Tool) của hệ thống
type Manager struct {
	mu          sync.RWMutex
	tools       map[string]Tool
	aliases     map[string]string
	requireAuth map[string]bool
}

// NewManager khởi tạo một đối tượng quản lý năng lực (Capability Manager) mới
func NewManager() *Manager {
	return &Manager{
		tools:       make(map[string]Tool),
		aliases:     make(map[string]string),
		requireAuth: make(map[string]bool),
	}
}

// Register đăng ký một công cụ mới vào hệ thống
func (m *Manager) Register(tool Tool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tools[tool.Definition.Name] = tool
	if tool.Definition.RequiresAuth {
		m.requireAuth[tool.Definition.Name] = true
	}
}

// RegisterAlias đăng ký một tên gọi bí danh (alias) trỏ về công cụ đích
func (m *Manager) RegisterAlias(aliasName, targetName string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.aliases[aliasName] = targetName
}

// GetDefinitions trả về danh sách định nghĩa (schema) của toàn bộ các tool để AI Agent sử dụng khi gọi Tool (Tool Calling)
func (m *Manager) GetDefinitions() []ToolDefinition {
	m.mu.RLock()
	defer m.mu.RUnlock()
	defs := make([]ToolDefinition, 0, len(m.tools))
	for _, t := range m.tools {
		defs = append(defs, t.Definition)
	}
	return defs
}

// Execute thực thi an toàn một công cụ dựa trên tên và các tham số đầu vào
func (m *Manager) Execute(ctx context.Context, name string, args map[string]any) (string, error) {
	// 1. Tự động bóc tách namespace (ví dụ: default_api:view_file -> view_file, tools:read_file -> read_file)
	cleanName := name
	if idx := strings.LastIndex(name, ":"); idx != -1 {
		cleanName = name[idx+1:]
	}

	m.mu.RLock()
	tool, exists := m.tools[name]
	if !exists {
		tool, exists = m.tools[cleanName]
	}
	if !exists {
		if targetName, ok := m.aliases[name]; ok {
			tool, exists = m.tools[targetName]
		} else if targetName, ok := m.aliases[cleanName]; ok {
			tool, exists = m.tools[targetName]
		}
	}
	m.mu.RUnlock()

	if !exists {
		return "", fmt.Errorf("công cụ '%s' chưa được đăng ký trong hệ thống", name)
	}

	// 2. Tự động chuẩn hóa tham số (Argument Normalization) giữa các chuẩn schema Antigravity, Claude Code, Cline và OpenAI Codex
	normalizedArgs := normalizeToolArgs(args)

	// Nếu công cụ yêu cầu quyền xác thực (RequiresAuth), hệ thống có thể phát sự kiện lên giao diện để người dùng bấm đồng ý
	return tool.Handler(ctx, normalizedArgs)
}

// normalizeToolArgs ánh xạ các tham số tương đương giữa các hệ thống AI Harness
func normalizeToolArgs(args map[string]any) map[string]any {
	if args == nil {
		return make(map[string]any)
	}
	res := make(map[string]any, len(args)+6)
	for k, v := range args {
		res[k] = v
	}

	// Chuẩn hóa path / TargetFile / AbsolutePath
	if _, ok := res["path"]; !ok {
		for _, alt := range []string{"TargetFile", "targetFile", "AbsolutePath", "absolutePath", "filePath", "file_path", "file"} {
			if v, found := res[alt]; found && v != "" {
				res["path"] = v
				break
			}
		}
	}
	// Chuẩn hóa content / CodeContent
	if _, ok := res["content"]; !ok {
		for _, alt := range []string{"CodeContent", "codeContent", "code"} {
			if v, found := res[alt]; found && v != "" {
				res["content"] = v
				break
			}
		}
	}
	// Chuẩn hóa target / TargetContent
	if _, ok := res["target"]; !ok {
		for _, alt := range []string{"TargetContent", "targetContent", "old_string", "old_str"} {
			if v, found := res[alt]; found && v != "" {
				res["target"] = v
				break
			}
		}
	}
	// Chuẩn hóa replacement / ReplacementContent
	if _, ok := res["replacement"]; !ok {
		for _, alt := range []string{"ReplacementContent", "replacementContent", "new_string", "new_str"} {
			if v, found := res[alt]; found && v != "" {
				res["replacement"] = v
				break
			}
		}
	}
	// Chuẩn hóa replacements / ReplacementChunks
	if _, ok := res["replacements"]; !ok {
		for _, alt := range []string{"ReplacementChunks", "replacementChunks", "chunks"} {
			if v, found := res[alt]; found {
				res["replacements"] = v
				break
			}
		}
	}
	// Chuẩn hóa command / CommandLine
	if _, ok := res["command"]; !ok {
		for _, alt := range []string{"CommandLine", "commandLine", "cmd"} {
			if v, found := res[alt]; found && v != "" {
				res["command"] = v
				break
			}
		}
	}
	// Chuẩn hóa cwd / Cwd
	if _, ok := res["cwd"]; !ok {
		if v, found := res["Cwd"]; found && v != "" {
			res["cwd"] = v
		}
	}
	// Chuẩn hóa wait_ms / WaitMsBeforeAsync
	if _, ok := res["wait_ms"]; !ok {
		for _, alt := range []string{"WaitMsBeforeAsync", "waitMsBeforeAsync", "timeout"} {
			if v, found := res[alt]; found {
				res["wait_ms"] = v
				break
			}
		}
	}
	// Chuẩn hóa query / Query
	if _, ok := res["query"]; !ok {
		for _, alt := range []string{"Query", "pattern"} {
			if v, found := res[alt]; found && v != "" {
				res["query"] = v
				break
			}
		}
	}
	// Chuẩn hóa question / Question
	if _, ok := res["question"]; !ok {
		if v, found := res["Question"]; found && v != "" {
			res["question"] = v
		}
	}
	// Chuẩn hóa action / Action
	if _, ok := res["action"]; !ok {
		if v, found := res["Action"]; found && v != "" {
			res["action"] = v
		}
	}
	// Chuẩn hóa task_id / TaskId
	if _, ok := res["task_id"]; !ok {
		for _, alt := range []string{"TaskId", "taskId"} {
			if v, found := res[alt]; found && v != "" {
				res["task_id"] = v
				break
			}
		}
	}

	return res
}

