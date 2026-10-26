package agent

import (
	"strings"
	"sync"
	"testing"

	"ttgide/internal/capabilities"
)

// TestHarnessConfig_Default kiểm tra cấu hình mặc định của Harness
func TestHarnessConfig_Default(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.Model == "" {
		t.Errorf("Model mặc định không được để trống")
	}
	if cfg.MaxTurns <= 0 {
		t.Errorf("MaxTurns phải lớn hơn 0, nhận: %d", cfg.MaxTurns)
	}
	if cfg.BaseURL == "" {
		t.Errorf("BaseURL mặc định không được để trống")
	}
}

// TestThinkingTokenIsolation kiểm tra khả năng bóc tách thẻ suy luận <think> và <thought>
func TestThinkingTokenIsolation(t *testing.T) {
	input := `<think>
Tôi cần đọc file main.go để phân tích cấu trúc.
Sau đó tôi sẽ sửa hàm init.
</think>
Dưới đây là phân tích chi tiết của tôi về dự án.`

	thinking, cleanText := IsolateThinking(input)
	if !strings.Contains(thinking, "Tôi cần đọc file main.go") {
		t.Errorf("Thinking trích xuất không đúng: %s", thinking)
	}
	if strings.Contains(cleanText, "<think>") || strings.Contains(cleanText, "</think>") {
		t.Errorf("cleanText vẫn chứa thẻ <think>: %s", cleanText)
	}
	if !strings.Contains(cleanText, "Dưới đây là phân tích chi tiết") {
		t.Errorf("cleanText bị mất nội dung thực thi: %s", cleanText)
	}
}

// TestAntiPromiseGuard kiểm tra phát hiện câu hứa hẹn nhưng không gọi tool
func TestAntiPromiseGuard(t *testing.T) {
	promises := []string{
		"Bây giờ tôi sẽ tiến hành build frontend và cấu hình lại cho bạn ngay lập tức!",
		"Tôi sẽ bắt đầu sửa file index.js.",
		"Hãy chờ tôi cập nhật lại mã nguồn.",
		"I will now create the file app.py",
		"Let's proceed to install dependencies.",
	}

	for _, p := range promises {
		if !containsUnfulfilledPromise(p) {
			t.Errorf("Mong đợi phát hiện câu hứa hẹn, nhưng bỏ sót: '%s'", p)
		}
		snippet := extractPromiseSnippet(p)
		if snippet == "" {
			t.Errorf("Snippet trích xuất rỗng cho câu: '%s'", p)
		}
	}

	normalAnswers := []string{
		"Dự án này là một web thương mại điện tử kết hợp React và Express.",
		"File app.exe đã được build xong tại thư mục gốc.",
		"Lỗi trên xảy ra do thiếu module pkg trong node_modules.",
	}

	for _, na := range normalAnswers {
		if containsUnfulfilledPromise(na) {
			t.Errorf("Bắt nhầm câu trả lời bình thường thành câu hứa hẹn: '%s'", na)
		}
	}
}

// TestContextHistoryCompaction_PreservesIntegrity kiểm tra trượt ngữ cảnh không làm mồ côi tool_call
func TestContextHistoryCompaction_PreservesIntegrity(t *testing.T) {
	ch := &ContextHistory{
		messages: []map[string]any{
			{"role": "system", "content": "You are TTG IDE AI."},
			{"role": "user", "content": "Mục tiêu ban đầu của tôi: sửa lỗi build."},
		},
	}

	// Thêm 35 tin nhắn hội thoại ReAct
	for i := 1; i <= 10; i++ {
		ch.Add(map[string]any{
			"role":    "assistant",
			"content": "Tôi đang kiểm tra file.",
			"tool_calls": []ToolCall{
				{ID: "call_1", Name: "view_file", Arguments: map[string]any{"path": "main.go"}},
			},
		})
		ch.Add(map[string]any{
			"role":         "tool",
			"tool_call_id": "call_1",
			"content":      "package main...",
		})
		ch.Add(map[string]any{
			"role":    "user",
			"content": "Hãy tiếp tục sửa file.",
		})
	}

	if len(ch.messages) <= 30 {
		t.Fatalf("Số tin nhắn cần > 30 để kích hoạt test compact, hiện tại: %d", len(ch.messages))
	}

	// Kích hoạt compact
	ch.Compact(1000, 0.5)

	if len(ch.messages) >= 32 {
		t.Errorf("Compact không giảm số lượng tin nhắn: %d", len(ch.messages))
	}

	// Kiểm tra tính toàn vẹn:
	// Tin 0 phải là system
	if ch.messages[0]["role"] != "system" {
		t.Errorf("Tin nhắn đầu tiên phải là system, nhận: %v", ch.messages[0]["role"])
	}
	// Tin 1 phải là user (mục tiêu gốc)
	if ch.messages[1]["role"] != "user" {
		t.Errorf("Tin nhắn thứ hai phải là user, nhận: %v", ch.messages[1]["role"])
	}

	// Tin nhắn bắt đầu khối gần nhất (index 2) KHÔNG được phép là role="tool" mồ côi
	if ch.messages[2]["role"] == "tool" {
		t.Errorf("Điểm cắt compact rơi vào role='tool' mồ côi!")
	}
}

// TestToolExtraction_CleanParsing kiểm tra trích xuất tool call chuẩn xác không đoán mò
func TestToolExtraction_CleanParsing(t *testing.T) {
	// 1. Tag <tool_call>
	textTag := `<tool_call>
{"name": "read_file", "arguments": {"path": "server/index.js"}}
</tool_call>`
	tcsTag := extractTextToolCalls(textTag)
	if len(tcsTag) != 1 || tcsTag[0].Name != "read_file" {
		t.Fatalf("Không bóc tách được tag tool_call chuẩn: %v", tcsTag)
	}
	if tcsTag[0].Arguments["path"] != "server/index.js" {
		t.Errorf("Path trích xuất sai: %v", tcsTag[0].Arguments["path"])
	}

	// 2. Bare JSON block
	textJSON := "```json\n{\"name\": \"run_command\", \"arguments\": {\"command\": \"go test ./...\"}}\n```"

	tcsJSON := extractTextToolCalls(textJSON)
	if len(tcsJSON) != 1 || tcsJSON[0].Name != "run_command" {
		t.Fatalf("Không bóc tách được markdown json tool call: %v", tcsJSON)
	}

	// 3. Text bình thường KHÔNG bị bắt nhầm thành tool call hay tạo file đoán mò
	normalText := "Dưới đây là ví dụ lệnh bạn có thể chạy: npm run dev hoặc vào file get_time.py để xem."
	tcsNormal := extractTextToolCalls(normalText)
	if len(tcsNormal) > 0 {
		t.Errorf("Bắt nhầm text hướng dẫn bình thường thành tool call: %v", tcsNormal)
	}
}

// TestEventEmitter_UIIntegration kiểm tra hệ thống phát sự kiện đầy đủ lên UI
func TestEventEmitter_UIIntegration(t *testing.T) {
	var events []AgentEvent
	var mu sync.Mutex

	eventCb := func(evt AgentEvent) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, evt)
	}

	mgr := capabilities.NewManager()
	h := NewHarness(nil, mgr, nil, eventCb)

	// Kiểm tra phát sự kiện status
	h.emit("status", "test_session", StatusPlanning)
	h.emit("thought", "test_session", map[string]any{"text": "Đang phân tích..."})
	h.emit("tool_start", "test_session", ToolCall{Name: "view_file"})
	h.emit("tool_end", "test_session", ToolCall{Name: "view_file", Result: "ok"})
	h.emit("answer", "test_session", map[string]any{"text": "Hoàn tất."})

	mu.Lock()
	defer mu.Unlock()

	expectedTypes := []string{"status", "thought", "tool_start", "tool_end", "answer"}
	if len(events) != len(expectedTypes) {
		t.Fatalf("Số lượng sự kiện phát lên UI không khớp. Mong đợi %d, nhận %d", len(expectedTypes), len(events))
	}

	for i, exp := range expectedTypes {
		if events[i].Type != exp {
			t.Errorf("Sự kiện thứ %d không đúng loại. Mong đợi '%s', nhận '%s'", i, exp, events[i].Type)
		}
		if events[i].SessionID != "test_session" {
			t.Errorf("SessionID của sự kiện không đúng: %s", events[i].SessionID)
		}
	}
}

// TestCleanFilePath kiểm tra làm sạch đường dẫn file chuẩn IDE
func TestCleanFilePath(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"{} src/index.css", "src/index.css"},
		{"[] app.go:#L10-20", "app.go"},
		{"📄 main.py:50", "main.py"},
		{"\"server/index.js\"", "server/index.js"},
		{"'frontend/src/App.tsx'", "frontend/src/App.tsx"},
	}

	for _, c := range cases {
		actual := CleanFilePath(c.input)
		if actual != c.expected {
			t.Errorf("CleanFilePath('%s') = '%s'; mong đợi '%s'", c.input, actual, c.expected)
		}
	}
}

// TestAttemptCompletionProtocol kiểm tra trích xuất kết quả hoàn tất chuẩn Cline/Devin
func TestAttemptCompletionProtocol(t *testing.T) {
	args := map[string]any{
		"result": "Đã sửa xong lỗi build và kiểm thử thành công.",
	}
	res := extractResultArg(args)
	if res != "Đã sửa xong lỗi build và kiểm thử thành công." {
		t.Errorf("extractResultArg trích xuất sai: %s", res)
	}

	argsUpper := map[string]any{
		"Result": "Hoàn tất qua param chữ hoa.",
	}
	resUpper := extractResultArg(argsUpper)
	if resUpper != "Hoàn tất qua param chữ hoa." {
		t.Errorf("extractResultArg chữ hoa trích xuất sai: %s", resUpper)
	}
}

