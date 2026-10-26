package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"sync/atomic"
	"time"

	"ttgide/internal/logger"
)

// =============================================================================
// MODEL CONTEXT PROTOCOL (MCP) - INDUSTRIAL JSON-RPC 2.0 STDIO CLIENT
// =============================================================================

type JSONRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      uint64 `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      uint64          `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *JSONRPCError   `json:"error,omitempty"`
}

type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

type MCPToolInfo struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

type MCPResourceInfo struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

// Client quản lý kết nối STDIO JSON-RPC 2.0 với một máy chủ MCP bên ngoài
type Client struct {
	cfg          MCPServerConfig
	workspaceDir string

	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser

	reqSeq   atomic.Uint64
	pending  map[uint64]chan *JSONRPCResponse
	pMu      sync.Mutex
	isClosed bool
	closeMu  sync.Mutex
}

// NewClient tạo instance MCP client cho một MCPServerConfig
func NewClient(cfg MCPServerConfig, workspaceDir string) *Client {
	return &Client{
		cfg:          cfg,
		workspaceDir: workspaceDir,
		pending:      make(map[uint64]chan *JSONRPCResponse),
	}
}

// Start khởi chạy tiến trình con và thực hiện bắt tay khởi tạo MCP (Initialize Handshake)
func (c *Client) Start(ctx context.Context) error {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()

	if c.cmd != nil && c.cmd.Process != nil {
		return nil // Đã chạy
	}

	cmd := exec.CommandContext(ctx, c.cfg.Command, c.cfg.Args...)
	if c.workspaceDir != "" {
		cmd.Dir = c.workspaceDir
	}

	// Thiết lập biến môi trường
	if len(c.cfg.Env) > 0 {
		for k, v := range c.cfg.Env {
			cmd.Env = append(cmd.Environ(), fmt.Sprintf("%s=%s", k, v))
		}
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("không thể mở stdin pipe cho MCP server %s: %w", c.cfg.Name, err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return fmt.Errorf("không thể mở stdout pipe cho MCP server %s: %w", c.cfg.Name, err)
	}

	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return fmt.Errorf("không thể khởi chạy tiến trình MCP server %s (%s): %w", c.cfg.Name, c.cfg.Command, err)
	}

	c.cmd = cmd
	c.stdin = stdin
	c.stdout = stdout
	c.isClosed = false

	// Khởi chạy goroutine đọc dòng stdout JSON-RPC 2.0
	go c.readLoop(stdout)

	// Bắt tay khởi tạo MCP: initialize request
	initParams := map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities": map[string]any{
			"roots": map[string]any{
				"listChanged": false,
			},
			"sampling": map[string]any{},
		},
		"clientInfo": map[string]any{
			"name":    "ttgide",
			"version": "1.0.0",
		},
	}

	initCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	_, err = c.sendRequest(initCtx, "initialize", initParams)
	if err != nil {
		logger.Log("WARN", "MCP", fmt.Sprintf("Bắt tay initialize với server '%s' thất bại: %v", c.cfg.Name, err))
		// Nhiều server đơn giản vẫn hoạt động ngay cả khi bỏ qua initialize
	}

	// Gửi thông báo initialized
	_ = c.sendNotification("notifications/initialized", map[string]any{})
	logger.Log("INFO", "MCP", fmt.Sprintf("MCP Server '%s' đã kết nối STDIO thành công (PID: %d)", c.cfg.Name, cmd.Process.Pid))
	return nil
}

func (c *Client) readLoop(r io.Reader) {
	scanner := bufio.NewScanner(r)
	// Buffer lớn cho các phản hồi dữ liệu lớn
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var resp JSONRPCResponse
		if err := json.Unmarshal(line, &resp); err != nil {
			// Bỏ qua log debug không phải JSON-RPC hợp lệ từ server
			continue
		}

		if resp.ID > 0 {
			c.pMu.Lock()
			ch, exists := c.pending[resp.ID]
			if exists {
				delete(c.pending, resp.ID)
				ch <- &resp
			}
			c.pMu.Unlock()
		}
	}
}

func (c *Client) sendRequest(ctx context.Context, method string, params any) (*JSONRPCResponse, error) {
	reqID := c.reqSeq.Add(1)
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      reqID,
		Method:  method,
		Params:  params,
	}

	data, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	data = append(data, '\n')

	respChan := make(chan *JSONRPCResponse, 1)
	c.pMu.Lock()
	c.pending[reqID] = respChan
	c.pMu.Unlock()

	c.closeMu.Lock()
	if c.stdin == nil || c.isClosed {
		c.closeMu.Unlock()
		c.pMu.Lock()
		delete(c.pending, reqID)
		c.pMu.Unlock()
		return nil, fmt.Errorf("MCP client '%s' chưa được kết nối hoặc đã đóng", c.cfg.Name)
	}
	_, writeErr := c.stdin.Write(data)
	c.closeMu.Unlock()

	if writeErr != nil {
		c.pMu.Lock()
		delete(c.pending, reqID)
		c.pMu.Unlock()
		return nil, fmt.Errorf("lỗi ghi STDIO vào MCP server %s: %w", c.cfg.Name, writeErr)
	}

	select {
	case <-ctx.Done():
		c.pMu.Lock()
		delete(c.pending, reqID)
		c.pMu.Unlock()
		return nil, ctx.Err()
	case resp := <-respChan:
		if resp.Error != nil {
			return nil, fmt.Errorf("MCP error (code %d): %s", resp.Error.Code, resp.Error.Message)
		}
		return resp, nil
	}
}

func (c *Client) sendNotification(method string, params any) error {
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	}
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}
	data = append(data, '\n')

	c.closeMu.Lock()
	defer c.closeMu.Unlock()
	if c.stdin == nil || c.isClosed {
		return fmt.Errorf("stdin đã đóng")
	}
	_, err = c.stdin.Write(data)
	return err
}

// CallTool gọi công cụ trên máy chủ MCP theo chuẩn Model Context Protocol (tools/call)
func (c *Client) CallTool(ctx context.Context, toolName string, args map[string]any) (string, error) {
	if c.cmd == nil || c.cmd.Process == nil {
		if err := c.Start(ctx); err != nil {
			return "", err
		}
	}

	params := map[string]any{
		"name":      toolName,
		"arguments": args,
	}

	resp, err := c.sendRequest(ctx, "tools/call", params)
	if err != nil {
		return "", err
	}

	var callResult struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}

	if err := json.Unmarshal(resp.Result, &callResult); err != nil {
		// Trả về chuỗi thô nếu không khớp cấu trúc content array
		return string(resp.Result), nil
	}

	var sb []string
	for _, item := range callResult.Content {
		if item.Text != "" {
			sb = append(sb, item.Text)
		}
	}

	resultText := string(resp.Result)
	if len(sb) > 0 {
		resultText = ""
		for i, s := range sb {
			if i > 0 {
				resultText += "\n"
			}
			resultText += s
		}
	}

	if callResult.IsError {
		return "", fmt.Errorf("MCP tool trả về lỗi: %s", resultText)
	}

	return resultText, nil
}

// ListTools khám phá danh sách công cụ được cung cấp bởi MCP Server (tools/list)
func (c *Client) ListTools(ctx context.Context) ([]MCPToolInfo, error) {
	if c.cmd == nil || c.cmd.Process == nil {
		if err := c.Start(ctx); err != nil {
			return nil, err
		}
	}

	resp, err := c.sendRequest(ctx, "tools/list", map[string]any{})
	if err != nil {
		return nil, err
	}

	var listResult struct {
		Tools []MCPToolInfo `json:"tools"`
	}
	if err := json.Unmarshal(resp.Result, &listResult); err != nil {
		return nil, fmt.Errorf("lỗi giải mã danh sách tools từ MCP server: %w", err)
	}

	return listResult.Tools, nil
}

// ListResources khám phá danh sách tài nguyên của MCP Server (resources/list)
func (c *Client) ListResources(ctx context.Context) ([]MCPResourceInfo, error) {
	if c.cmd == nil || c.cmd.Process == nil {
		if err := c.Start(ctx); err != nil {
			return nil, err
		}
	}

	resp, err := c.sendRequest(ctx, "resources/list", map[string]any{})
	if err != nil {
		return nil, err
	}

	var resResult struct {
		Resources []MCPResourceInfo `json:"resources"`
	}
	if err := json.Unmarshal(resp.Result, &resResult); err != nil {
		return nil, fmt.Errorf("lỗi giải mã danh sách resources: %w", err)
	}

	return resResult.Resources, nil
}

// ReadResource đọc nội dung tài nguyên qua URI (resources/read)
func (c *Client) ReadResource(ctx context.Context, uri string) (string, error) {
	if c.cmd == nil || c.cmd.Process == nil {
		if err := c.Start(ctx); err != nil {
			return "", err
		}
	}

	resp, err := c.sendRequest(ctx, "resources/read", map[string]any{"uri": uri})
	if err != nil {
		return "", err
	}

	var readResult struct {
		Contents []struct {
			URI      string `json:"uri"`
			MimeType string `json:"mimeType"`
			Text     string `json:"text"`
			Blob     string `json:"blob"`
		} `json:"contents"`
	}
	if err := json.Unmarshal(resp.Result, &readResult); err != nil {
		return string(resp.Result), nil
	}

	if len(readResult.Contents) > 0 {
		return readResult.Contents[0].Text, nil
	}
	return string(resp.Result), nil
}

// Close ngắt kết nối và đóng tiến trình MCP Server
func (c *Client) Close() error {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()

	c.isClosed = true
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	if c.stdout != nil {
		_ = c.stdout.Close()
	}
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
	return nil
}
