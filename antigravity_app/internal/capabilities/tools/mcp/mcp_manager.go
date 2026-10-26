package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"ttgide/internal/capabilities"
	"ttgide/internal/logger"
)

// MCPServerConfig định nghĩa cấu hình của một máy chủ Model Context Protocol (MCP)
type MCPServerConfig struct {
	Name    string            `json:"name"`
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
}

// Manager quản lý danh sách và vòng đời của các MCP server theo từng workspace
type Manager struct {
	workspaceRoot string
	configFile    string
	servers       map[string]MCPServerConfig
	clients       map[string]*Client
	mu            sync.RWMutex
}

var (
	managers   = make(map[string]*Manager)
	managersMu sync.Mutex
)

// GetManager lấy hoặc khởi tạo instance Manager cho workspaceRoot
func GetManager(workspaceRoot string) *Manager {
	managersMu.Lock()
	defer managersMu.Unlock()

	if mgr, exists := managers[workspaceRoot]; exists {
		return mgr
	}

	cfgDir := filepath.Join(workspaceRoot, ".ttgide")
	_ = os.MkdirAll(cfgDir, 0755)
	cfgFile := filepath.Join(cfgDir, "mcp_servers.json")

	mgr := &Manager{
		workspaceRoot: workspaceRoot,
		configFile:    cfgFile,
		servers:       make(map[string]MCPServerConfig),
		clients:       make(map[string]*Client),
	}
	mgr.load()
	managers[workspaceRoot] = mgr
	return mgr
}

func (m *Manager) load() {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.configFile)
	if err == nil {
		var list []MCPServerConfig
		if err := json.Unmarshal(data, &list); err == nil {
			for _, s := range list {
				m.servers[s.Name] = s
			}
		}
	}

	// Tự động cấu hình chrome_devtools nếu chưa có server nào
	if len(m.servers) == 0 {
		m.servers["chrome_devtools"] = MCPServerConfig{
			Name:    "chrome_devtools",
			Command: "npx",
			Args:    []string{"-y", "chrome-devtools-mcp"},
			Env:     map[string]string{},
		}
		_ = m.saveLocked()
	}
}

func (m *Manager) saveLocked() error {
	var list []MCPServerConfig
	for _, s := range m.servers {
		list = append(list, s)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.configFile, data, 0644)
}

// ListServers trả về danh sách các MCP Server đã cấu hình
func (m *Manager) ListServers() []MCPServerConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var res []MCPServerConfig
	for _, s := range m.servers {
		res = append(res, s)
	}
	return res
}

// SaveServer lưu hoặc cập nhật cấu hình của một MCP Server
func (m *Manager) SaveServer(name, command string, args []string, env map[string]string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if name == "" {
		return fmt.Errorf("tên MCP server không được để trống")
	}

	m.servers[name] = MCPServerConfig{
		Name:    name,
		Command: command,
		Args:    args,
		Env:     env,
	}

	// Nếu đã có client cũ đang chạy, đóng để lần gọi tiếp theo nạp cấu hình mới
	if oldClient, ok := m.clients[name]; ok {
		_ = oldClient.Close()
		delete(m.clients, name)
	}

	return m.saveLocked()
}

// DeleteServer xóa MCP Server theo tên
func (m *Manager) DeleteServer(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if oldClient, ok := m.clients[name]; ok {
		_ = oldClient.Close()
		delete(m.clients, name)
	}

	delete(m.servers, name)
	return m.saveLocked()
}

// GetClient lấy hoặc khởi chạy MCP Client kết nối thật tới tiến trình server
func (m *Manager) GetClient(ctx context.Context, serverName string) (*Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cfg, exists := m.servers[serverName]
	if !exists {
		// Thử tìm case-insensitive
		for k, v := range m.servers {
			if strings.EqualFold(k, serverName) {
				cfg = v
				serverName = k
				exists = true
				break
			}
		}
	}

	if !exists {
		var available []string
		for k := range m.servers {
			available = append(available, k)
		}
		return nil, fmt.Errorf("MCP server '%s' chưa được cấu hình. Danh sách khả dụng: %v", serverName, available)
	}

	if client, ok := m.clients[serverName]; ok {
		return client, nil
	}

	client := NewClient(cfg, m.workspaceRoot)
	if err := client.Start(ctx); err != nil {
		return nil, fmt.Errorf("không thể khởi chạy MCP server '%s': %w", serverName, err)
	}

	m.clients[serverName] = client
	return client, nil
}

// CloseAll đóng toàn bộ các tiến trình MCP con đang chạy
func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, client := range m.clients {
		_ = client.Close()
	}
	m.clients = make(map[string]*Client)
}

// RegisterMCPTools đăng ký các công cụ giao tiếp Model Context Protocol chuẩn RFC vào capabilities.Manager
func RegisterMCPTools(cm *capabilities.Manager, workspaceRoot string) {
	if cm == nil {
		return
	}

	mgr := GetManager(workspaceRoot)

	// 1. call_mcp_tool: Gọi công cụ thực tế qua JSON-RPC 2.0 (tools/call)
	cm.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "call_mcp_tool",
			Description: "Gọi một công cụ từ máy chủ Model Context Protocol (MCP) đã đăng ký thông qua giao thức JSON-RPC 2.0.",
			Category:    "mcp",
			Parameters: map[string]any{
				"server_name": "Tên MCP server đã cấu hình (ví dụ: 'chrome_devtools')",
				"tool_name":   "Tên công cụ cần gọi trên MCP server (ví dụ: 'navigate_to_url', 'take_screenshot')",
				"arguments":   "Tham số truyền vào dưới dạng JSON object hoặc map",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			sName, _ := args["server_name"].(string)
			tName, _ := args["tool_name"].(string)
			if sName == "" || tName == "" {
				return "", fmt.Errorf("cần cung cấp server_name và tool_name")
			}

			toolArgs := make(map[string]any)
			if rawArgs, ok := args["arguments"]; ok {
				switch v := rawArgs.(type) {
				case map[string]any:
					toolArgs = v
				case string:
					_ = json.Unmarshal([]byte(v), &toolArgs)
				}
			}

			logger.Log("INFO", "MCP", fmt.Sprintf("Thực thi MCP tool '%s' trên server '%s'...", tName, sName))
			client, err := mgr.GetClient(ctx, sName)
			if err != nil {
				return "", err
			}

			result, err := client.CallTool(ctx, tName, toolArgs)
			if err != nil {
				return "", fmt.Errorf("lỗi thực thi MCP tool '%s/%s': %w", sName, tName, err)
			}

			logger.Log("INFO", "MCP", fmt.Sprintf("Hoàn thành MCP tool '%s/%s' (kết quả: %d bytes)", sName, tName, len(result)))
			return result, nil
		},
	})

	// 2. list_mcp_tools: Khám phá danh sách công cụ từ MCP Server (tools/list)
	cm.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "list_mcp_tools",
			Description: "Khám phá danh sách các công cụ khả dụng được cung cấp bởi một máy chủ Model Context Protocol (MCP).",
			Category:    "mcp",
			Parameters: map[string]any{
				"server_name": "Tên MCP server cần liệt kê công cụ (ví dụ: 'chrome_devtools')",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			sName, _ := args["server_name"].(string)
			if sName == "" {
				servers := mgr.ListServers()
				b, _ := json.MarshalIndent(servers, "", "  ")
				return fmt.Sprintf("Danh sách MCP servers đã cấu hình:\n%s\nHãy chỉ định server_name để xem danh sách tools cụ thể.", string(b)), nil
			}

			client, err := mgr.GetClient(ctx, sName)
			if err != nil {
				return "", err
			}

			tools, err := client.ListTools(ctx)
			if err != nil {
				return "", err
			}

			b, err := json.MarshalIndent(tools, "", "  ")
			if err != nil {
				return "", err
			}
			return string(b), nil
		},
	})

	// 3. list_mcp_resources: Liệt kê tài nguyên (resources/list)
	cm.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "list_mcp_resources",
			Description: "Liệt kê danh sách tài nguyên khả dụng từ máy chủ Model Context Protocol (MCP).",
			Category:    "mcp",
			Parameters: map[string]any{
				"server_name": "Tên MCP server (tùy chọn)",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			sName, _ := args["server_name"].(string)
			if sName == "" {
				servers := mgr.ListServers()
				b, _ := json.MarshalIndent(servers, "", "  ")
				return string(b), nil
			}

			client, err := mgr.GetClient(ctx, sName)
			if err != nil {
				return "", err
			}

			resList, err := client.ListResources(ctx)
			if err != nil {
				return "", err
			}

			b, _ := json.MarshalIndent(resList, "", "  ")
			return string(b), nil
		},
	})

	// 4. read_mcp_resource: Đọc tài nguyên (resources/read)
	cm.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "read_mcp_resource",
			Description: "Đọc nội dung của một tài nguyên MCP thông qua URI.",
			Category:    "mcp",
			Parameters: map[string]any{
				"server_name": "Tên MCP server quản lý tài nguyên",
				"uri":         "Đường dẫn URI của tài nguyên",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			sName, _ := args["server_name"].(string)
			uri, _ := args["uri"].(string)
			if uri == "" {
				return "", fmt.Errorf("cần cung cấp uri tài nguyên")
			}

			if sName == "" {
				// Thử suy đoán server name từ URI nếu có dạng mcp://serverName/...
				if strings.HasPrefix(uri, "mcp://") {
					parts := strings.Split(strings.TrimPrefix(uri, "mcp://"), "/")
					if len(parts) > 0 {
						sName = parts[0]
					}
				}
			}

			if sName == "" {
				return "", fmt.Errorf("cần chỉ định server_name để đọc tài nguyên")
			}

			client, err := mgr.GetClient(ctx, sName)
			if err != nil {
				return "", err
			}

			return client.ReadResource(ctx, uri)
		},
	})
}
