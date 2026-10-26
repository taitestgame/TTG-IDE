---
name: go
description: Hướng dẫn lập trình Go chuẩn chỉ, an toàn và tối ưu cho TTG IDE
---

# Kỹ năng Lập trình Go (Go Skill)

1. **Xử lý lỗi (Error Handling)**: Luôn kiểm tra và bọc lỗi bằng `fmt.Errorf("...: %w", err)`. Tuyệt đối không nuốt lỗi âm thầm.
2. **Đồng thời (Concurrency)**: Sử dụng Goroutines thận trọng kết hợp với `sync.WaitGroup`, channel hoặc `context.Context` để kiểm soát hủy bỏ tác vụ an toàn.
3. **Không để thư viện thừa**: Trình biên dịch Go cấm các import không dùng; luôn dọn dẹp sạch sẽ trước khi lưu code.
4. **Kiểm thử (Testing)**: Viết unit tests sử dụng package chuẩn `testing` với mô hình Table-Driven Tests.
