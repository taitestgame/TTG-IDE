package mcp

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestJSONRPCSerialization(t *testing.T) {
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "tools/call",
		Params: map[string]any{
			"name": "navigate_to_url",
			"arguments": map[string]any{
				"url": "http://localhost:3000",
			},
		},
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Unmarshal error: %v", err)
	}

	if parsed["jsonrpc"] != "2.0" {
		t.Errorf("Expected jsonrpc 2.0, got %v", parsed["jsonrpc"])
	}
	if parsed["method"] != "tools/call" {
		t.Errorf("Expected method tools/call, got %v", parsed["method"])
	}
}

func TestMCPManagerAutoConfig(t *testing.T) {
	tempDir := t.TempDir()
	mgr := GetManager(tempDir)

	servers := mgr.ListServers()
	if len(servers) == 0 {
		t.Errorf("Expected default MCP servers to be configured automatically, got 0")
	}

	hasChromeDevtools := false
	for _, s := range servers {
		if s.Name == "chrome_devtools" {
			hasChromeDevtools = true
			if s.Command != "npx" {
				t.Errorf("Expected npx command, got %s", s.Command)
			}
		}
	}

	if !hasChromeDevtools {
		t.Errorf("Expected chrome_devtools server to be auto-configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Calling non-existent server should give clean descriptive error
	_, err := mgr.GetClient(ctx, "non_existent_server_xyz")
	if err == nil {
		t.Errorf("Expected error for non-existent server, got nil")
	}
}
