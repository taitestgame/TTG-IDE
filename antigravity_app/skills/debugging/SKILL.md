---
name: debugging
description: Quy trình phân tích nguyên nhân gốc rễ và khắc phục lỗi có hệ thống
---

# Kỹ năng Gỡ lỗi TTG IDE (Debugging Skill)

1. **Tái hiện & Cô lập lỗi**: Chạy lệnh hoặc bộ test đang thất bại để thu thập chính xác stack trace và thông điệp lỗi.
2. **Kiểm tra ngữ cảnh**: Đọc các file mã nguồn liên quan và kiểm tra các thay đổi hoặc commit gần nhất.
3. **Đưa ra giả thuyết**: Xác định nguyên nhân gốc rễ (ví dụ: con trỏ null/nil, sai cú pháp, thiếu thư viện, sai luồng trạng thái).
4. **Áp dụng bản vá tối giản**: Thực hiện sửa đổi chính xác vào vị trí gây lỗi mà không làm ảnh hưởng đến các chức năng đang chạy đúng.
5. **Xác minh lại**: Chạy lại lệnh build/test kiểm tra để đảm bảo lỗi đã được giải quyết hoàn toàn và không phát sinh lỗi mới.
