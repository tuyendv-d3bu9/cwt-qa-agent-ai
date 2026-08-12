# Skill: Document Classification

## Purpose
Dùng sau khi các tài liệu đầu vào đã được chuyển đổi sang định dạng `.md` hoặc `.csv`. Skill này đọc nội dung tài liệu và phân loại chúng vào đúng 6 thư mục chức năng tiêu chuẩn của dự án.

## Prompt Type
Few-shot / Classification Rules

## Variables
- `{{document_list}}`: Danh sách các tài liệu Markdown/CSV cần phân loại.
- `{{document_contents}}`: Nội dung chi tiết hoặc tóm tắt của từng tài liệu.

## PROMPT
Phân tích danh sách và nội dung tài liệu trong `{{document_contents}}`. Tiến hành chuyển/xếp từng file vào thư mục phù hợp theo các quy tắc sau:

1. **`01_Business/`**: Các tài liệu về tổng quan nghiệp vụ doanh nghiệp, mục tiêu kinh doanh, quy trình chung, thông tin dự án.
2. **`02_BA/`**: Các tài liệu yêu cầu phần mềm, tài liệu phân tích nghiệp vụ (BRD, SRS, User Story, Use Case).
3. **`03_DEV/`**: Các tài liệu kỹ thuật, kiến trúc hệ thống, spec API, sơ đồ Database, dữ liệu kỹ thuật.
4. **`04_Dessign/`**: Các tài liệu về UI/UX, mô tả giao diện, wireframe, design guideline.
5. **`05_QA/`**: Các tài liệu liên quan đến kiểm thử, Test Plan, Test Strategy, Test Case, Bug Report.
6. **`06_Communication/`**: Các tài liệu trao đổi, log chat, email, biên bản họp (Meeting Minutes), làm rõ yêu cầu.

Hãy đầu ra danh sách tài liệu cùng thư mục đích được phân loại tương ứng.

## Sample Input
```text
Tài liệu cần phân loại:
1. SRS_Payment_Gateway.md (Nội dung: Yêu cầu tính năng thanh toán, luồng User Story)
2. API_Payment_v2.md (Nội dung: Swagger API spec, Endpoints, Headers, Request/Response payload)
3. UI_Checkout_Flow.md (Nội dung: Mô tả màn hình thanh toán, layout nút bấm)
4. Meeting_20260801.md (Nội dung: Biên bản họp chốt tính năng thanh toán)
```

## Sample Output
```markdown
### Kết quả phân loại tài liệu

- `SRS_Payment_Gateway.md` -> `02_BA/SRS_Payment_Gateway.md`
- `API_Payment_v2.md` -> `03_DEV/API_Payment_v2.md`
- `UI_Checkout_Flow.md` -> `04_Dessign/UI_Checkout_Flow.md`
- `Meeting_20260801.md` -> `06_Communication/Meeting_20260801.md`

**Trạng thái phân loại:** Hoàn thành 4/4 file.
```

## Quality Check
- **Faithful**: Phân loại đúng theo bản chất nội dung thực tế của tài liệu, không suy đoán vô căn cứ.
- **Accurate**: Xếp đúng file vào 1 trong 6 thư mục tiêu chuẩn đã quy định.
- **Complete**: Tất cả tài liệu Markdown đầu vào đều được gán thư mục đích.
- **Traceable**: Liệt kê rõ ràng tên file ban đầu và đường dẫn thư mục đích.
