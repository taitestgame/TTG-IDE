# 🚀 HƯỚNG DẪN TOÀN DIỆN VỀ OPENCODE FREE API & ỨNG DỤNG CHO TTG IDE

> **Tài liệu phân tích**: Khảo sát chi tiết hệ thống cầu nối `c:\code\python\Antesst\opencode_free_api`, danh mục 10 AI Model miễn phí siêu mạnh, cơ chế bảo vệ IP bằng Cloudflare WARP, và cách tích hợp trực tiếp vào chế độ **Multi-AI Arena** của TTG IDE.

---

## I. BẢN CHẤT CỦA `opencode_free_api` LÀ GÌ?

`opencode_free_api` là một hệ thống **Multi-Threaded OpenAI-Compatible Proxy Bridge** viết bằng Python thuần túy (0 dependency, dùng Standard Library).

```mermaid
graph LR
    subgraph Client_App [Ứng Dụng Gọi AI]
        TTG["TTG IDE / Harness"]
        Cursor["Cursor / Cline"]
    end

    subgraph Bridge_Layer [Proxy Bridge (Port 5050)]
        BP["bridge.py (ThreadingHTTPServer)"]
        CFG["config.json"]
    end

    subgraph Security_Layer [Bảo Mật IP (Port 2080)]
        SB["Sing-box Cloudflare WARP IPv6<br/><i>(C:\code\python\ip)</i>"]
    end

    subgraph OpenCode_Layer [OpenCode CLI (Port 4096)]
        OC["opencode.exe serve"]
    end

    subgraph AI_Cloud [Zen AI Cloud]
        M1["DeepSeek V4.1 Flash"]
        M2["Big Pickle (Reasoning)"]
        M3["Nemotron 3 Ultra (1M ctx)"]
        M4["GLM 5.3 Flash"]
    end

    TTG -->|OpenAI API: http://127.0.0.1:5050/v1| BP
    Cursor -->|OpenAI API: http://127.0.0.1:5050/v1| BP
    BP -->|Session dispatch| OC
    OC -->|Proxy qua 127.0.0.1:2080| SB
    SB -->|Ẩn danh IP hoàn toàn| AI_Cloud
```

### Điểm Vượt Trội Của Hệ Thống:
1. **Chuẩn hóa OpenAI (`/v1/chat/completions`, `/v1/models`)**: Bất kỳ IDE, extension hoặc thư viện nào hỗ trợ OpenAI (như Go OpenAI client trong TTG IDE, Cline, Cursor, Python) đều có thể kết nối ngay lập tức bằng BaseURL `http://127.0.0.1:5050/v1`.
2. **Ẩn danh IP 100% qua Cloudflare WARP IPv6**: Tự động kích hoạt Sing-box tại `C:\code\python\ip` (cổng `2080`). Toàn bộ lưu lượng gửi lên máy chủ AI đều mang địa chỉ IP sạch của Cloudflare (`2a09:bac1:...`), loại bỏ 100% nguy cơ bị rate-limit hoặc khóa IP mạng gia đình.
3. **Phát hiện Live Models động**: Tự động truy vấn máy chủ OpenCode để cập nhật danh sách model free mới nhất mà không cần sửa code.
4. **Hỗ trợ tách thẻ Reasoning / Thinking**: Trích xuất riêng khối `reasoning_content` (tư duy suy luận) của các mô hình Chain-of-Thought (như Big Pickle) và trả về cho client hiển thị.

---

## II. DANH MỤC 10 AI MODEL MIỄN PHÍ & THẾ MẠNH TỪNG LOẠI

| STT | Model ID | Ngữ Cảnh (Context) | Max Output | Thế Mạnh Chuyên Biệt & Công Dụng |
| :---: | :--- | :---: | :---: | :--- |
| 1 | **`deepseek-v4.1-flash-free`** | **200.000** | 32.000 | **Tốc độ cực nhanh (~8s)**. Phản xạ toán học, logic giải thuật và sửa code sắc bén. Phù hợp làm model chính cho Vibe Loop. |
| 2 | **`big-pickle`** | **200.000** | 32.000 | **Stealth Reasoning (Chain-of-Thought)**: Model tư duy ngầm chuyên sâu, tự phân tích nhiều bước trước khi xuất code, cực kỳ xuất sắc cho bài toán kiến trúc khó. |
| 3 | **`nemotron-3-ultra-free`** | **1.000.000** | 128.000 | **NVIDIA Nemotron bản cao cấp nhất**: Ngữ cảnh 1 Triệu tokens, hiểu sâu cấu trúc dự án lớn và tài liệu kỹ thuật dài. |
| 4 | **`nemotron-3.5-lightning-free`**| **262.144** | 262.144 | Tốc độ xuất code cực cao, khả năng sinh file mã nguồn dài mà không bị đứt đoạn giữa chừng. |
| 5 | **`nemotron-3.5-super-vl-free`** | **1.048.576** | 131.072 | Context khổng lồ hơn 1 Triệu tokens, xử lý đa nhiệm, tổng hợp tài liệu nhiều file cùng lúc. |
| 6 | **`longcat-2.5-preview-free`** | **1.000.000** | 131.072 | Khả năng nhồi nhét toàn bộ kho mã nguồn (Repository Ingestion) vào một lần hỏi duy nhất. |
| 7 | **`minimax-m3.1-flash-free`** | **1.000.000** | 512.000 | Giới hạn Token đầu ra lớn nhất hiện nay (512K tokens), viết nguyên cả module hoàn chỉnh. |
| 8 | **`glm-5.3-flash-free`** | **200.000** | 32.000 | Phản xạ tức thì, ngôn ngữ tự nhiên tiếng Việt mượt mà, viết comment, README và giải thích code rất hay. |
| 9 | **`mimo-v2.6-flash-free`** | **200.000** | 32.000 | Model cân bằng lý tưởng giữa tốc độ xử lý và độ chính xác logic. |
| 10 | **`beam-free`** | **1.048.576** | 131.072 | Model quy mô lớn với context 1 Triệu tokens. |

---

## III. CÁCH KHỞI CHẠY VÀ SỬ DỤNG

### 1. Khởi động 1-Click
Nhấp đúp chuột vào file:
👉 **`c:\code\python\Antesst\opencode_free_api\start.bat`**
Hệ thống tự động:
1. Bật proxy Cloudflare WARP Sing-box ngầm (`127.0.0.1:2080`).
2. Khởi chạy OpenCode Engine (`127.0.0.1:4096`).
3. Khởi chạy OpenAI Bridge Server (`http://127.0.0.1:5050/v1`).

### 2. Tắt hệ thống 1-Click
Khi không dùng, nhấp đúp:
👉 **`c:\code\python\Antesst\opencode_free_api\stop.bat`** (dọn dẹp sạch tiến trình Python, Singbox, OpenCode).

### 3. Thông số cấu hình chung cho mọi Client
* **Base URL:** `http://127.0.0.1:5050/v1`
* **API Key:** `dummy` (hoặc bất kỳ ký tự nào)
* **Model:** Chọn 1 trong 10 model ở bảng trên (ví dụ: `deepseek-v4.1-flash-free` hoặc `big-pickle`).

---

## IV. ỨNG DỤNG CHO TTG IDE: ĐỘNG CƠ CỦA CHẾ ĐỘ "MULTI-AI ARENA"

Thay vì người dùng phải trả phí API đắt đỏ cho OpenAI / Anthropic khi chạy nhiều AI song song, **`opencode_free_api` chính là "mỏ vàng" nhiên liệu miễn phí 100%**:

1. **Chế độ Đối đầu Multi-AI (Arena)**:
   * 1 câu hỏi từ người dùng được gửi đồng thời tới 2 - 4 model:
     * Model A: `deepseek-v4.1-flash-free` (chuyên giải thuật & tốc độ)
     * Model B: `big-pickle` (chuyên tư duy suy luận sâu)
     * Model C: `nemotron-3-ultra-free` (chuyên bao quát kiến trúc lớn)
     * Model D: `glm-5.3-flash-free` (chuyên code sạch & diễn giải chi tiết)
2. **Cách ly Sandbox tuyệt đối**:
   * Mỗi model được cấp một thư mục Sandbox riêng (`.ttgide/sandboxes/sandbox_<model_id>`).
   * Mỗi AI tự phân tích, tự tạo Plan, tự sửa code trong Sandbox của mình mà không chạm vào nhau và không đụng vào code thật của người dùng.
3. **Giao diện so sánh & Chọn phương án tốt nhất (Consensus)**:
   * Người dùng nhìn thấy bảng so sánh Diff trực quan giữa các AI: thời gian chạy, kế hoạch giải quyết, và những dòng code đã được sửa đổi.
   * Người dùng chỉ cần bấm nút **"Chọn AI này"**, Harness sẽ tự động merge mã nguồn từ Sandbox đó vào project chính!
