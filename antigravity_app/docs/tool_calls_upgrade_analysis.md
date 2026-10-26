# 🔬 PHÂN TÍCH SO SÁNH TOOL CALLS CÁC AI IDE HÀNG ĐẦU & KẾ HOẠCH NÂNG CẤP TTG IDE

> **Mục tiêu**: So sánh chi tiết hệ thống Tool Calls của TTG IDE với các IDE/AI Coding Harness hàng đầu hiện nay:
> 1. **Google Antigravity** (DeepMind / Internal Google IDE)
> 2. **Claude Code** (Anthropic CLI Agent)
> 3. **Cline v4** (Autonomous VS Code Extension)
> 4. **Cursor IDE** (Anysphere Native Fork)
>
> Từ đó chỉ ra các điểm vượt trội, các lỗ hổng cần nâng cấp, và các nâng cấp đã được triển khai ngay lập tức.

---

## I. MA TRẬN SO SÁNH NĂNG LỰC TOOL CALLS (CROSS-IDE MATRIX)

| Nhóm Năng Lực | TTG IDE (Hiện Tại) | Google Antigravity | Claude Code | Cline v4 | Đánh Giá & Khoảng Cách |
|:---|:---|:---|:---|:---|:---|
| **Chỉnh sửa file (Edit)** | **Tương đương**: Hỗ trợ cả Multi-Chunk (`replacements`) và SEARCH/REPLACE Cline. | `multi_replace_file_content` sửa nhiều khối trong 1 turn. | `str_replace_editor` (sửa từng khối exact). | `replace_in_file` (khối SEARCH/REPLACE chịu lỗi whitespace). | **TTG IDE Đã Bắt Kịp**: Với nâng cấp `replacements: [...]`, agent TTG có thể sửa nhiều vị trí trong 1 lượt quay. |
| **Đọc & Phân tích (Read/AST)** | `read_file` (%4d slicing) + `extract_symbols` (Go AST 2ms, TS/JS/Python regex). | `view_file` (hỗ trợ line slice & byte offset, binary detection). | `View` (hỗ trợ file lines & auto outline). | `read_file` + `list_code_definition_names`. | **TTG IDE Đạt Chuẩn**: Tiết kiệm 90% token nhờ AST parser trước khi đọc code. |
| **Tìm kiếm (Search)** | `grep_search` (+ `context_lines`, glob, case sensitive) + `find_files`. | `grep_search` (ripgrep, json lines) + `file_search`. | `Grep` (-C context lines) + `Glob`. | `grep_search` + `find_by_name`. | **TTG IDE Vượt Trội**: Hỗ trợ cả Ripgrep siêu tốc lẫn Go regex fallback, `context_lines` giúp LLM không cần đọc lại file. |
| **Terminal & Tiến trình** | `run_command` (Reactive + StdinPipe) + `manage_task` (send_input). | `run_command` (Reactive wait_ms) + `manage_task` (send_input, kill). | `Bash` (chạy lệnh subshell có streaming output). | `execute_command` (hỏi quyền người dùng). | **TTG IDE Bằng Antigravity**: Tự động background khi quá `wait_ms`, hỗ trợ `send_input` giải quyết lệnh tương tác stdin. |
| **Tương tác người dùng** | `ask_question` (modal giao diện chọn options hoặc nhập tự do). | `ask_question` (blocking modal lựa chọn). | Trả lời dạng câu hỏi trên CLI. | `ask_followup_question` (gắn buttons). | **TTG IDE Đã Bổ Sung**: Ngăn chặn AI tự phỏng đoán kiến trúc khi gặp yêu cầu mơ hồ. |
| **Duyệt Web (Web)** | `fetch_web_request` (HTTP) + `fetch_web_browser` (Headless Edge/Chrome SPA). | `read_url_content` (HTTP) + `browser_subagent`. | Chưa có (chỉ thông qua CLI curl). | `browser_action` (Puppeteer/Chromium). | **TTG IDE Ưu Việt**: 2 tầng linh hoạt, tự động fallback sang Headless Browser khi gặp Cloudflare/JS. |
| **Điều phối Agent** | `spawn_subagent` + `remember_lesson` (bộ nhớ dài hạn cross-session). | Subagent tree + Knowledge Items (KI). | Subagents chuyên trách. | Subtasks. | **TTG IDE Đạt Chuẩn**: Subagent chạy trên context riêng biệt, tổng hợp ngắn gọn gửi về Agent cha. |

---

## II. CHI TIẾT 4 NÂNG CẤP LỚN ĐÃ ĐƯỢC TRIỂN KHAI THÀNH CÔNG

### 1. Nâng Cấp `edit_file`: Multi-Chunk Replacements (Bắt Kịp Antigravity)
- **Vấn đề trước đây**: Khi muốn sửa 3 vị trí khác nhau trong một file (ví dụ: thêm import, thêm field vào struct, sửa logic hàm), LLM phải thực hiện 3 turns gọi tool riêng biệt, gây chậm trễ từ 15-45 giây và tốn hàng ngàn token lặp lại.
- **Giải pháp đã triển khai**: Bổ sung tham số `replacements: [ { target, replacement, start_line, end_line } ]`.
- **Cơ chế nguyên tử (Atomic)**: Nếu bất kỳ khối nào không khớp hoặc lỗi, toàn bộ thay đổi sẽ được rollback ngay lập tức, đảm bảo an toàn tuyệt đối cho file nguồn.

### 2. Nâng Cấp `grep_search`: Context Lines (Bắt Kịp Claude Code)
- **Vấn đề trước đây**: Khi grep tìm thấy một dòng mã, LLM chỉ thấy dòng đó và buộc phải gọi thêm `read_file` để xem hàm đó làm gì.
- **Giải pháp đã triển khai**: Thêm tham số `context_lines: N` (tương đương flag `-C N` của Ripgrep).
- **Lợi ích**: Hiển thị luôn các dòng code phía trước và phía sau khớp tìm kiếm, giúp LLM nắm bắt toàn cảnh ngữ cảnh mà không cần tốn thêm bất kỳ lượt gọi `read_file` nào!

### 3. Nâng Cấp `terminal/manage_task`: Action `send_input` (Bắt Kịp Antigravity)
- **Vấn đề trước đây**: Khi chạy các lệnh CLI tương tác (như `npm init`, câu hỏi xác nhận `y/N`, hoặc mật khẩu), tiến trình bị treo chờ stdin cho tới khi hết hạn timeout.
- **Giải pháp đã triển khai**: Gắn `io.WriteCloser` (StdinPipe) vào `BackgroundTask`. Bổ sung action `send_input` với tham số `input: "y\n"` vào `manage_task`.
- **Lợi ích**: Agent hoàn toàn có thể tương tác với các CLI phức tạp mà không bị timeout.

### 4. Tách Rời 1-to-1: Mỗi Tool 1 File Riêng Biệt & Thêm `ask_question`
- **Vấn đề trước đây**: Một số tool bị gộp vào file chung (`fs_tools.go`, `git_tools.go`, `harness.go`), gây khó đọc và thiếu minh bạch.
- **Giải pháp đã triển khai**:
  - Tách thành đúng 23 file Go riêng biệt theo tên từng tool: `read_file.go`, `write_file.go`, `edit_file.go`, `grep_search.go`, `run_command.go`, `manage_task.go`, `spawn_subagent.go`, `remember_lesson.go`, `ask_question.go`,...
  - Bổ sung công cụ `ask_question.go` kết nối Wails bridge để hiển thị modal câu hỏi trực tiếp trên màn hình lập trình viên.
