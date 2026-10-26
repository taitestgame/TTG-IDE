# Phân Tích & Hướng Dẫn Tham Khảo Kiến Trúc Harness của Claude CLI (Claude Code)

Tài liệu này được trích xuất trực tiếp từ mã nguồn gói `@anthropic-ai/claude-code` (v2.1.273) trên máy tính của bạn, dùng làm tài liệu tham khảo thiết kế cho **TTG IDE**.

---

## 1. Các File Mã Nguồn Đã Trích Xuất

Tất cả các file tham khảo gốc đã được sao chép vào thư mục `docs\references\claude_cli_harness`:
* **claude_sdk_tools.d.ts**: Toàn bộ 168 KB định nghĩa TypeScript Interfaces & JSON Schema của tất cả công cụ (Tools) trong Claude CLI.
* **cli_wrapper.cjs**: Script khởi động, quản lý kiến trúc đa nền tảng (Windows/Linux/macOS, ARM/x64).
* **claude_code_package.json**: Cấu hình dependencies và metadata của Claude Code.

---

## 2. Mô Hình Kiến Trúc "Harness" Của Claude Code

Trong Claude Code, **Harness** là bộ khung thực thi (Execution Engine) chịu trách nhiệm:

```
                      ┌──────────────────────────────────────┐
                      │             User Prompt              │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │          1. Agent Loop Lõi           │
                      │  - Plan Mode (Enter/ExitPlanMode)    │
                      │  - Task Graph (Create/Update/List)   │
                      │  - Subagents Fanout (AgentInput)     │
                      └──────────────────┬───────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
│  2. File Operations   │    │  3. Execution & Shell │    │  4. Context & Memory  │
│ - FileRead (offset)   │    │ - Bash (active voice) │    │ - Project metadata    │
│ - FileEdit (chunks)   │    │ - Terminal snapshots  │    │ - History jsonl       │
│ - FileWrite           │    │ - Background tasks    │    │ - Context compaction  │
│ - Backup & History    │    │ - Sandboxing gates    │    │ - System prompt snap  │
└───────────────────────┘    └───────────────────────┘    └───────────────────────┘
```

---

## 3. Các Tool Chuẩn (Schemas) Đáng Học Hỏi Cho TTG IDE

Dưới đây là các định nghĩa công cụ cốt lõi được trích từ `claude_sdk_tools.d.ts`:

### 3.1. File Manipulation (Thao tác File thông minh)

#### A. FileEditInput (Sửa file bằng cách thay thế cụm chuỗi)
Thay vì bắt AI sinh lại cả file hàng nghìn dòng, Claude Code yêu cầu chỉ định chuỗi cũ và chuỗi mới:
```typescript
export interface FileEditInput {
  /** Đường dẫn tuyệt đối của file */
  file_path: string;
  /** Chuỗi ký tự cũ cần thay thế (phải trùng khớp chính xác) */
  old_string: string;
  /** Chuỗi ký tự mới thay vào */
  new_string: string;
  /** Có thay thế toàn bộ các lần xuất hiện hay không (mặc định: false) */
  replace_all?: boolean;
}
```
> **Ứng dụng cho TTG IDE**: Trong `internal/capabilities/tools/fs/edit_tool.go`, bạn đã cài đặt cơ chế `TargetContent` và `ReplacementContent`, hoàn toàn tương thích với chuẩn `old_string` / `new_string` này!

#### B. FileReadInput (Đọc file có phân trang dòng)
```typescript
export interface FileReadInput {
  file_path: string;
  /** Dòng bắt đầu đọc (dành cho file quá lớn) */
  offset?: number;
  /** Số lượng dòng cần đọc */
  limit?: number;
  /** Dải trang nếu là file PDF (ví dụ: "1-5", "10-20") */
  pages?: string;
}
```

---

### 3.2. Terminal Execution (BashInput)

Một điểm đặc sắc nhất trong thiết kế của Anthropic là thuộc tính `description` theo dạng **Active Voice**:
```typescript
export interface BashInput {
  /** Câu lệnh cần thực thi */
  command: string;
  /** Thời gian chờ tối đa (ms) */
  timeout?: number;
  /**
   * Mô tả ngắn gọn (5-10 từ) về việc câu lệnh này làm gì, viết ở thể chủ động (active voice).
   * Không lặp lại câu lệnh, flags hay file path - UI sẽ dùng text này hiển thị spinner cho người dùng!
   * Ví dụ:
   *   - "List files in current directory" (thay vì "ls")
   *   - "Install package dependencies" (thay vì "npm install")
   *   - "Discard all local changes" (thay vì "git reset --hard")
   */
  description?: string;
  /** Chạy ngầm trong background (không chặn agent) */
  run_in_background?: boolean;
}
```
> **Ứng dụng cho TTG IDE**: Khi AI Agent trong TTG IDE chạy câu lệnh shell qua `internal/capabilities/tools/terminal/terminal_tools.go`, nếu có `description`, Frontend React có thể hiển thị thanh trạng thái thân thiện cho người dùng Vibe Coding thay vì hiển thị câu lệnh console phức tạp.

---

### 3.3. Task & Plan Management (Quản lý Kế hoạch & Nhiệm vụ)

#### A. TaskCreateInput & TaskUpdateInput
```typescript
export interface TaskCreateInput {
  /** Tiêu đề ngắn gọn */
  subject: string;
  /** Mô tả chi tiết việc cần làm */
  description: string;
  /** Dạng hiện tại tiếp diễn hiển thị trên spinner khi in_progress (VD: "Running tests", "Analyzing schema") */
  activeForm?: string;
  metadata?: { [k: string]: unknown };
}

export interface TaskUpdateInput {
  taskId: string;
  status?: "pending" | "in_progress" | "completed" | "deleted";
  activeForm?: string;
  addBlocks?: string[];     // Task này đang chặn task nào
  addBlockedBy?: string[];  // Task này bị chặn bởi task nào
}
```

#### B. EnterPlanModeInput & ExitPlanModeInput
* Khi Agent nhận lệnh lớn, nó sẽ gọi `EnterPlanMode` để chỉ đọc dữ liệu, phân tích và phác thảo kế hoạch.
* Khi đã lập kế hoạch xong, nó gọi `ExitPlanMode` để gửi kế hoạch cho người dùng duyệt trước khi chuyển sang giai đoạn sửa đổi code thực tế.

---

### 3.4. Multi-Agent & Subagents (AgentInput)
```typescript
export interface AgentInput {
  /** Mô tả 3-5 từ về nhiệm vụ */
  description: string;
  /** Prompt chi tiết cho subagent */
  prompt: string;
  /** Loại agent chuyên biệt */
  subagent_type?: string;
  /** Model override (sonnet, opus, haiku...) */
  model?: "sonnet" | "opus" | "haiku" | "fable";
  /** Mặc định chạy background để người dùng tiếp tục giao việc khác */
  run_in_background?: boolean;
  name?: string;
}
```

---

## 4. Bảng Đối Chiếu: Claude CLI vs. TTG IDE

| Khối Chức Năng | Claude CLI (Node/V8) | TTG IDE (Anchuyennganh) |
| :--- | :--- | :--- |
| **Ngôn ngữ Lõi** | TypeScript (Native Binaries ~235MB) | **Go 1.26** (siêu nhẹ, file thực thi ~20MB) |
| **Giao diện** | Terminal CLI / Ink (React Terminal) | **Wails v2 + React 18 + Monaco Editor** |
| **Agent Harness** | Agent Loop nội bộ của Claude Code | `internal/agent/harness.go` (Context -> Plan -> Checkpoint -> Exec -> Verify) |
| **File Editing** | `FileEdit` (thay thế chuỗi old/new) | `internal/capabilities/tools/fs/edit_tool.go` |
| **Quản lý Snapshot** | `.claude/file-history/` & `.claude/backups/` | `internal/checkpoint/manager.go` (SQLite Checkpoint + File Copy) |
| **Model Routing** | Cố định vào Anthropic API (hoặc custom Base URL) | `internal/modelrouter/router.go` (Hỗ trợ Fast, Coding, Reasoning) |