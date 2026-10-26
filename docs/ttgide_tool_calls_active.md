# 🛠️ DANH MỤC TOÀN BỘ 23 TOOL CALLS ĐANG HOẠT ĐỘNG TRONG TTG IDE

> **Tài liệu chuẩn hóa chính thức của dự án TTG IDE** (`Anchuyennganh`).
> - **Cấu trúc 1 Tool = 1 File Go chuyên biệt** theo đúng tên gọi của tool: `<tool_name>.go`.
> - **Toàn bộ 23 tools** đã được đăng ký vào `capabilities.Manager`, tích hợp vào `Harness` và kiểm thử tự động 100% đạt chuẩn (`go test ./...` PASS).
> - Áp dụng tinh hoa từ **Google Antigravity**, **Claude Code**, **Cline v4**, và **Cursor**.

---

## I. TỔNG QUAN KIẾN TRÚC 6 NHÓM CÔNG CỤ (23 TOOLS)

```mermaid
graph TD
    subgraph TTG_Tool_Ecosystem [Hệ Sinh Thái 23 Tool Calls - 1 File / 1 Tool]
        direction TB
        subgraph G1 [1. Thao Tác Tệp & Mã Nguồn - fs (8 Tools)]
            T1["read_file.go -> read_file"]
            T2["write_file.go -> write_file"]
            T3["edit_file.go -> edit_file (Multi-Chunk / Cline Diff)"]
            T4["list_dir.go -> list_dir (Phân cấp & kích thước)"]
            T5["list_files.go -> list_files (Alias tương thích)"]
            T6["delete_file.go -> delete_file (Xóa an toàn)"]
            T7["move_file.go -> move_file (Đổi tên / di chuyển)"]
            T8["file_ops.go -> file_ops (Hợp nhất thao tác)"]
        end
        subgraph G2 [2. Khám Phá & Phân Tích AST - search (4 Tools)]
            T9["grep_search.go -> grep_search (+context_lines / Ripgrep)"]
            T10["find_files.go -> find_files (Glob pattern matcher)"]
            T11["extract_symbols.go -> extract_symbols (Go AST 2ms / TS / Python)"]
            T12["search_code.go -> search_code (Alias tương thích)"]
        end
        subgraph G3 [3. Terminal & Tiến Trình - terminal (2 Tools)]
            T13["run_command.go -> run_command (Reactive shell + StdinPipe)"]
            T14["manage_task.go -> manage_task (list, status, logs, send_input, kill)"]
        end
        subgraph G4 [4. Quản Lý Phiên Bản - git (4 Tools)]
            T15["git_action.go -> git_action (status, diff, commit, log, branch)"]
            T16["git_status.go -> git_status (Alias tương thích)"]
            T17["git_diff.go -> git_diff (Alias tương thích)"]
            T18["git_commit.go -> git_commit (Alias tương thích)"]
        end
        subgraph G5 [5. Web Scraping & Headless Browser - web (2 Tools)]
            T19["fetch_web_request.go -> fetch_web_request (HTTP nhanh, nhẹ)"]
            T20["fetch_web_browser.go -> fetch_web_browser (Headless Chrome/Edge SPA)"]
        end
        subgraph G6 [6. Điều Phối Agent & Tương Tác - agent/memory (3 Tools)]
            T21["spawn_subagent.go -> spawn_subagent (Chia việc subagent độc lập)"]
            T22["remember_lesson.go -> remember_lesson (Lưu bài học dài hạn)"]
            T23["ask_question.go -> ask_question (Hộp thoại hỏi người dùng)"]
        end
    end
```

---

## II. BẢNG TRA CỨU FILE NGUỒN VÀ TOOL CALLS CHI TIẾT

| STT | Tên Tool Call | Tên File Go Tương Ứng | Phân Loại | Đặc Điểm Kỹ Thuật Nổi Bật |
|:---:|:---|:---|:---:|:---|
| **1** | `read_file` | `tools/fs/read_file.go` | `fs` | Đánh số dòng `%4d | `, tự phát hiện binary file, hỗ trợ `start_line` & `end_line` cắt dòng tiết kiệm token. |
| **2** | `write_file` | `tools/fs/write_file.go` | `fs` | Ghi đè hoặc tạo file mới an toàn, tự động tạo toàn bộ thư mục cha nếu chưa tồn tại. |
| **3** | `edit_file` | `tools/fs/edit_file.go` | `fs` | **Nâng cấp Multi-Chunk**: Hỗ trợ sửa nhiều khối mã không liền kề cùng lúc (`replacements`), khối diff Cline (`SEARCH/REPLACE`), bộ khớp 3 lớp chịu lệch khoảng trắng. |
| **4** | `list_dir` | `tools/fs/list_dir.go` | `fs` | Cây thư mục phân cấp trực quan, hiển thị dung lượng file dạng người đọc (`KB/MB`) và đếm số phần tử con, tự bỏ qua `node_modules`, `.git`. |
| **5** | `list_files` | `tools/fs/list_files.go` | `fs` | Alias tương thích ngược cho `list_dir`. |
| **6** | `delete_file` | `tools/fs/delete_file.go` | `fs` | Xóa vĩnh viễn file hoặc thư mục một cách an toàn. |
| **7** | `move_file` | `tools/fs/move_file.go` | `fs` | Di chuyển hoặc đổi tên file/thư mục, tự tạo thư mục đích nếu chưa có. |
| **8** | `file_ops` | `tools/fs/file_ops.go` | `fs` | Công cụ hợp nhất `delete`, `move`, `copy` trong một lời gọi duy nhất. |
| **9** | `grep_search` | `tools/search/grep_search.go` | `search` | **Nâng cấp Context Lines**: Sử dụng Ripgrep (hoặc Go Regex fallback), hỗ trợ `context_lines` xem ngữ cảnh trước/sau match, lọc glob `includes`, `case_sensitive`. |
| **10** | `find_files` | `tools/search/find_files.go` | `search` | Tìm kiếm siêu tốc file trong dự án theo mẫu glob (ví dụ: `*.go`, `*harness*.json`). |
| **11** | `extract_symbols` | `tools/search/extract_symbols.go` | `search` | Bộ bóc tách AST chuyên sâu (Go AST 2ms qua thư viện chuẩn, Regex parser cho TypeScript, JavaScript, Python) tiết kiệm 90% token. |
| **12** | `search_code` | `tools/search/search_code.go` | `search` | Alias tương thích ngược cho `grep_search`. |
| **13** | `run_command` | `tools/terminal/run_command.go` | `terminal` | Shell phản ứng (Reactive Shell), tự động chuyển nền nếu lệnh vượt quá `wait_ms`, bảo vệ cắt gọn 25KB, blocklist lệnh nguy hiểm, gắn sẵn `StdinPipe`. |
| **14** | `manage_task` | `tools/terminal/manage_task.go` | `terminal` | **Nâng cấp send_input**: Quản lý task chạy ngầm (`list`, `status`, `logs`, `send_input` cho lệnh CLI cần nhập y/n hoặc tương tác, `kill`). |
| **15** | `git_action` | `tools/git/git_action.go` | `git` | Hợp nhất Git: `status`, `diff`, `commit`, `log`, `branch`. |
| **16** | `git_status` | `tools/git/git_status.go` | `git` | Alias tương thích lấy trạng thái thay đổi kho Git. |
| **17** | `git_diff` | `tools/git/git_diff.go` | `git` | Alias tương thích xem chi tiết mã thay đổi so với commit gần nhất. |
| **18** | `git_commit` | `tools/git/git_commit.go` | `git` | Alias tương thích tự stage toàn bộ và commit vào kho Git. |
| **19** | `fetch_web_request` | `tools/web/fetch_web_request.go` | `web` | Cào nội dung HTTP nhanh, nhẹ, không tốn RAM. Tự động phát hiện bot shield/Cloudflare để gợi ý chuyển sang Browser. |
| **20** | `fetch_web_browser` | `tools/web/fetch_web_browser.go` | `web` | Khởi chạy trình duyệt thật (Headless Edge/Chrome), chạy JavaScript đầy đủ, vượt qua Single Page App và hỗ trợ chụp screenshot. |
| **21** | `spawn_subagent` | `tools/agent/spawn_subagent.go` | `agent` | Khởi tạo Agent con chuyên trách chạy độc lập trên context riêng, tổng hợp báo cáo súc tích gửi về Agent cha. |
| **22** | `remember_lesson` | `tools/agent/remember_lesson.go` | `memory` | Lưu bài học kinh nghiệm, quy ước kiến trúc vào bộ nhớ dài hạn của dự án để tái sử dụng xuyên suốt các phiên sau. |
| **23** | `ask_question` | `tools/agent/ask_question.go` | `agent` | **Nâng cấp Mới**: Mở hộp thoại modal tương tác trực tiếp với lập trình viên khi cần làm rõ yêu cầu, lựa chọn thiết kế hoặc xác nhận hành động nguy hiểm. |

---

## III. CẤU TRÚC THƯ MỤC THỰC TẾ TRONG DỰ ÁN

```text
c:\code\python\Anchuyennganh\internal\capabilities\tools\
├── agent\
│   ├── agent_tools.go        # Bộ điều phối đăng ký tools nhóm agent
│   ├── ask_question.go       # [Tool 23] Hộp thoại hỏi ý kiến lập trình viên
│   ├── remember_lesson.go    # [Tool 22] Lưu bài học bộ nhớ dài hạn
│   └── spawn_subagent.go     # [Tool 21] Khởi tạo Subagent độc lập
├── fs\
│   ├── delete_file.go        # [Tool 6]  Xóa file / thư mục an toàn
│   ├── edit_file.go          # [Tool 3]  Sửa file (Multi-Chunk / Cline Diff)
│   ├── file_ops.go           # [Tool 8]  Hợp nhất delete/move/copy
│   ├── fs_tools.go           # Bộ điều phối đăng ký tools nhóm fs
│   ├── helpers.go            # Hàm bổ trợ định dạng dung lượng, lọc thư mục
│   ├── list_dir.go           # [Tool 4]  Cây thư mục phân cấp
│   ├── list_files.go         # [Tool 5]  Alias tương thích
│   ├── move_file.go          # [Tool 7]  Di chuyển / đổi tên file
│   ├── read_file.go          # [Tool 1]  Đọc file kèm số dòng %4d
│   └── write_file.go         # [Tool 2]  Ghi mới / ghi đè an toàn
├── git\
│   ├── git_action.go         # [Tool 15] Thao tác Git tổng hợp
│   ├── git_commit.go         # [Tool 18] Alias commit
│   ├── git_diff.go           # [Tool 17] Alias diff
│   ├── git_status.go         # [Tool 16] Alias status
│   └── git_tools.go          # Bộ điều phối đăng ký tools nhóm git
├── search\
│   ├── extract_symbols.go    # [Tool 11] Go AST / TS / Python symbol extraction
│   ├── find_files.go         # [Tool 10] Tìm file theo glob
│   ├── grep_search.go        # [Tool 9]  Tìm kiếm Ripgrep + Context Lines
│   ├── helpers.go            # Hàm bổ trợ kiểm tra thư mục bỏ qua
│   ├── search_code.go        # [Tool 12] Alias tương thích
│   └── search_tools.go       # Bộ điều phối đăng ký tools nhóm search
├── terminal\
│   ├── manage_task.go        # [Tool 14] Quản lý task ngầm + send_input
│   ├── run_command.go        # [Tool 13] Shell phản ứng + StdinPipe
│   ├── task_manager.go       # Quản lý luồng BackgroundTask
│   └── terminal_tools.go     # Bộ điều phối đăng ký tools nhóm terminal
└── web\
    ├── fetch_web_browser.go  # [Tool 20] Headless Edge/Chrome SPA
    ├── fetch_web_request.go  # [Tool 19] HTTP request cào dữ liệu nhanh
    └── web_tools.go          # Bộ điều phối đăng ký tools nhóm web
```
