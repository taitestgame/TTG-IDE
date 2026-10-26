package web

import (
	"context"
	"testing"
	"time"

	"ttgide/internal/capabilities"
)

func TestSearchWebTool(t *testing.T) {
	mgr := capabilities.NewManager()
	RegisterSearchWebTool(mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	output, err := mgr.Execute(ctx, "search_web", map[string]any{
		"query":       "golang net/http documentation",
		"num_results": float64(3),
	})

	if err != nil {
		t.Fatalf("search_web failed: %v", err)
	}

	t.Logf("Search Output:\n%s", output)
	if len(output) < 50 {
		t.Errorf("Search output unexpectedly short: %s", output)
	}
}
