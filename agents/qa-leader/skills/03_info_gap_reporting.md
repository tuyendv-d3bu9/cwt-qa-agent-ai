# Skill: Information Completeness & Conflict Reporting

## Purpose
Dùng sau khi tài liệu đã được phân loại vào các thư mục. Skill này thực hiện đối soát chéo giữa các tài liệu (`01_Bussiness`, `02_BA`, `03_DEV`, `04_Dessign`,...) để phát hiện thông tin mâu thuẫn hoặc chưa đầy đủ, sau đó tạo Báo cáo cần bổ sung thông tin gửi cho QA Manuals để xác nhận.

## Prompt Type
Chain-of-thought

## Variables
- `{{classified_documents}}`: Danh sách tài liệu đã phân loại theo từng thư mục.
- `{{project_context}}`: Bối cảnh dự án và các tài liệu liên quan.

## PROMPT
Thực hiện đối soát chéo thông tin giữa các tài liệu được cung cấp trong `{{classified_documents}}` theo các bước sau:

1. **Rà soát tính nhất quán**:
   - So sánh thông tin giữa tài liệu yêu cầu (`02_BA`), thiết kế kỹ thuật (`03_DEV`), và giao diện (`04_Dessign`).
   - Tìm các điểm mâu thuẫn (Ví dụ: BA yêu cầu nút "Thanh toán ZaloPay", nhưng API DEV chỉ hỗ trợ "VNPay", UI lại thiết kế "Momo").

2. **Rà soát tính đầy đủ**:
   - Phát hiện các luồng thiếu thông tin (Ví dụ: Thiếu tài liệu xử lý ngoại lệ, thiếu mã lỗi API, thiếu thiết kế giao diện mobile).

3. **Lập Báo cáo Bổ sung Thông tin (Information Clarification Report)**:
   - Liệt kê chi tiết từng câu hỏi/mâu thuẫn.
   - Ghi rõ nguồn trích dẫn (file nào, dòng nào/mục nào).
   - Đề xuất câu hỏi hoặc hướng làm rõ gửi cho QA Manuals để làm việc lại với BA/DEV/Design.

## Sample Input
```text
Thư mục 02_BA/SRS.md: "Tính năng đăng nhập hỗ trợ Email và OTP SMS."
Thư mục 03_DEV/API.md: "Chỉ cung cấp endpoint POST /api/v1/auth/login-email."
Thư mục 04_Dessign/UI.md: "Giao diện hiển thị form nhập Email và nút Đăng nhập bằng Social (Google, Facebook)."
```

## Sample Output
```markdown
### Báo cáo Thông tin cần Bổ sung & Làm rõ (Clarification Report)

**Người nhận:** QA Manuals  
**Ngày lập:** 2026-08-03  

| STT | Loại vấn đề | Mô tả mâu thuẫn / Thiếu hụt | Nguồn trích dẫn | Câu hỏi làm rõ cho BA/DEV |
|-----|-------------|----------------------------|-----------------|--------------------------|
| 1 | Mâu thuẫn API - BA | BA yêu cầu đăng nhập OTP SMS nhưng DEV API chưa có endpoint OTP. | `02_BA/SRS.md` vs `03_DEV/API.md` | API có bổ sung luồng OTP SMS không, hay tạm hoãn scope này? |
| 2 | Mâu thuẫn UI - BA | UI thiết kế Đăng nhập Social (Google/FB) nhưng SRS của BA không đề cập. | `04_Dessign/UI.md` vs `02_BA/SRS.md` | Đăng nhập Social có nằm trong scope v1 không? |

**Khuyến nghị:** Cần chờ QA Manuals xác nhận lại thông tin từ BA/DEV trước khi tiến hành phân tích chi tiết.
```

## Quality Check
- **Faithful**: Trích dẫn chính xác vị trí và nội dung gây mâu thuẫn từ tài liệu nguồn.
- **Accurate**: Phản ánh đúng bản chất mâu thuẫn hoặc thiếu hụt logic.
- **Complete**: Lập bảng báo cáo chi tiết gồm mô tả, nguồn và câu hỏi khuyến nghị hành động.
- **Traceable**: Trích dẫn file và mục tương ứng cho từng phát hiện.
