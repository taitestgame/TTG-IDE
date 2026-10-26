# Taitestgame IDE – AI-Powered Development Environment
> **Tên sản phẩm**: Taitestgame IDE (TTG IDE)  
> **Nền tảng**: Desktop App (Wails v2 + Go + React + TypeScript + Monaco Editor + SQLite)  
> **Tích hợp AI**: OpenCode Free API Bridge (10 Model AI Miễn Phí qua Local Port 5050)

---

## 1. Giới thiệu tổng quan

**Taitestgame IDE** là một môi trường phát triển phần mềm thế hệ mới tích hợp sâu AI Agent và Multi-AI Orchestrator. Ứng dụng hỗ trợ chuyển đổi linh hoạt giữa 3 khu vực làm việc (Workspaces) dùng chung trạng thái:

1. **Mode A — IDE Workspace (VS Code Style)**:
   - Trình duyệt tệp tin phân cấp (Explorer Tree) hỗ trợ kéo thả, tạo tệp/thư mục, đổi tên, xóa tệp có xác nhận.
   - **Monaco Editor** chuẩn VS Code hỗ trợ nhiều tab, dirty indicator, save / save all (`Ctrl+S`), diff viewer.
   - **Terminal Panel**: Terminal shell tương tác thực tế, Problems, Git Changes, Agent Events.
   - **AI Agent Sidebar**: Khung chat và thực thi lệnh tích hợp trực tiếp bên cạnh trình soạn thảo.

2. **Mode B — AI Workspace (Antigravity Conversation Style)**:
   - Giao diện lấy cảm hứng từ Antigravity với thanh điều hướng bên trái (Logo, New Conversation, Conversation History, Automations, Customizations, Projects, Settings).
   - Ô nhập prompt nổi bật ở giữa với bộ chọn Model (10 model Free), chế độ Ask/Plan/Agent, nút chọn quyền thực thi, trích xuất suy luận `<think>...</think>`, thẻ tool calls và nút Rollback 1-click.

3. **Multi-AI Workspace (Multi-AI Orchestrator — Trọng tâm sản phẩm)**:
   - **Layout danh sách thẻ xếp theo HÀNG DỌC (Vertical Pipeline)** từ trên xuống dưới với mũi tên kết nối trực quan (`↓`).
   - Hỗ trợ các chiến lược thực thi linh hoạt:
     - **Sequential**: Chạy tuần tự, truyền ngữ cảnh từ node trước sang node sau.
     - **Parallel**: Chạy song song nhiều model độc lập với concurrency limit.
     - **Pipeline / DAG**: Rẽ nhánh và giải quyết phụ thuộc (Dependency Resolution).
     - **Consensus / Review**: Cùng đánh giá 1 bài toán, chỉ ra điểm đồng thuận và mâu thuẫn.
     - **Implement → Review → Fix**: Quy trình lập kế hoạch → viết code → kiểm tra → sửa lỗi.
   - **Result Comparison Modal**: So sánh side-by-side kết quả từ các model, tạo bản tổng hợp **Final Synthesis** và 1-click đưa giải pháp tối ưu vào Editor.

4. **Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)**:
   - Tìm kiếm nhanh toàn bộ các lệnh IDE, chuyển workspace, chạy test, mở settings, git status.

---

## 2. Kết nối OpenCode Free API Bridge (10 Model Free)

Taitestgame IDE được cấu hình mặc định kết nối trực tiếp với **OpenCode Free API Bridge** chạy tại local port `5050` (`http://127.0.0.1:5050/v1`):

| Model ID | Tên hiển thị | Đặc điểm |
| :--- | :--- | :--- |
| `nemotron-3.5-lightning-free` | **Nemotron 3.5 Lightning** | Siêu tốc, phù hợp làm Agent Planner và phản hồi tức thì |
| `glm-5.3-flash-free` | **GLM-5.3 Flash** | Đa năng, logic cấu trúc rõ ràng, tổng hợp mạnh |
| `deepseek-v4.1-flash-free` | **DeepSeek V4.1 Flash** | Chuyên sâu coding, refactor và unit testing |
| `big-pickle` | **Big Pickle (Reasoning)** | Suy luận nhiều bước, trích xuất thẻ `<think>` |
| `beam-free` | **Beam Free** | Gọn nhẹ, tóm tắt và kiểm tra cú pháp nhanh |
| `longcat-2.5-preview-free` | **LongCat 2.5 Preview** | Hỗ trợ cửa sổ ngữ cảnh mở rộng |
| `mimo-v2.6-flash-free` | **MiMo-v2.6 Flash** | Cân bằng giữa tốc độ và độ chuẩn xác |
| `nemotron-3.5-super-vl-free`| **Nemotron 3.5 Super VL** | Đa phương thức NVIDIA |
| `nemotron-3-ultra-free` | **Nemotron 3 Ultra** | Tham số lớn, kiến thức tổng quát |
| `minimax-m3.1-flash-free` | **MiniMax M3.1 Flash** | Văn phong tự nhiên, tiếng Việt mượt mà |

### Khởi động OpenCode Free API Bridge:
```powershell
# Chạy bridge tại thư mục opencode_free_api:
cd C:\code\python\Antesst\opencode_free_api
.\start.bat
```
Khi Bridge hoạt động, thanh tiêu đề của Taitestgame IDE sẽ hiển thị nút xanh:  
`🟢 Free AI Bridge (XX ms)`

---

## 3. Hướng dẫn cài đặt & Khởi chạy

### 3.1. Chạy Desktop Binary đã build sẵn:
```powershell
# Khởi chạy trực tiếp file thực thi desktop:
.\ttgide.exe
```

### 3.2. Chạy môi trường phát triển (Dev Mode):
```powershell
# Terminal 1: Chạy Vite dev server cho Frontend
cd frontend
npm run dev

# Terminal 2: Chạy Wails dev server (kết nối Go Backend)
wails dev
```

### 3.3. Build ứng dụng từ mã nguồn:
```powershell
# 1. Build frontend bundle:
cd frontend
npm run build

# 2. Compile Go Desktop Binary:
cd ..
go build -o ttgide.exe main.go app.go
```

### 3.4. Chạy kiểm thử tự động (Unit Tests):
```powershell
go test -v ./internal/agent/...
```

---

## 4. Bảng phím tắt bàn phím (Shortcuts)

| Phím tắt | Chức năng |
| :--- | :--- |
| `Ctrl + M` | Chuyển đổi qua lại giữa IDE ↔ AI Workspace ↔ Multi-AI |
| `Ctrl + Shift + P` | Mở Command Palette tìm kiếm lệnh nhanh |
| `Ctrl + ,` | Mở hộp thoại Cài đặt (Settings & AI Providers) |
| `Ctrl + O` | Mở thư mục dự án (Open Folder Dialog) |
| `Ctrl + S` | Lưu tệp tin đang mở |
| `Ctrl + N` | Tạo tệp tin mới |
| `Ctrl + B` | Đóng/mở Primary Sidebar trong IDE Mode |
| `Ctrl + \`` | Đóng/mở Terminal Panel bên dưới |
| `F11` | Phóng to toàn màn hình / Thu nhỏ cửa sổ |
