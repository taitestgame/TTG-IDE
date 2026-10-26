# Hệ thống Plugin của TTG IDE

TTG IDE được thiết kế với kiến trúc mở, cho phép mở rộng các tính năng bên ngoài mà không cần can thiệp hay sửa đổi phần lõi (Core Runtime) của AI Agent:

## Cấu trúc thư mục Plugin
```
plugins/
├── docker/       # Quản lý, kiểm tra và điều khiển container Docker
├── firebase/     # Tự động hóa CLI và deploy lên Firebase
├── database/     # Công cụ xem và truy vấn SQLite / Postgres
├── github/       # Tự động tạo Issue, Pull Request trên GitHub
└── custom/       # Các plugin tùy chỉnh do người dùng tự viết
```

Mỗi Plugin có thể cung cấp:
- **Công cụ tùy chỉnh (Custom Tools)**: Được nạp tự động vào Capability Manager.
- **Agent chuyên biệt (Specialist Agents)**: Tích hợp vào hệ thống điều phối Multi-Agent.
- **Kỹ năng mới (Custom Skills)**: Thêm các tệp hướng dẫn vào thư mục `skills/`.
- **Giao diện người dùng (UI Panels)**: Các widget hoặc badge trạng thái trên thanh TitleBar.
- **Kết nối MCP (Model Context Protocol)**: Kết nối với các server MCP ngoại vi.
