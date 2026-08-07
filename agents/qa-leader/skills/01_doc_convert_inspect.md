# Skill: Document Conversion & Format Inspection

## Purpose
Dùng khi có tài liệu dự án đầu vào được tải lên hoặc cập nhật. Skill này chịu trách nhiệm kiểm tra sự tồn tại của file, kiểm tra định dạng file (DOCX, XLSX, PPTX) và thực thi chuẩn hóa sang định dạng Markdown/CSV bằng công cụ `agents/qa-leader/tools/convert-to-md.js`.

## Prompt Type
Template-based / Tool-assisted

## Variables
- `{{input_directory}}`: Thư mục chứa các file đầu vào của dự án.
- `{{file_list}}`: Danh sách các file cần kiểm tra và chuẩn hóa.

## PROMPT
Quét và kiểm tra toàn bộ danh sách tài liệu đầu vào tại `{{input_directory}}`. Thực hiện các bước sau:

1. **Phát hiện & Kiểm tra sự tồn tại**:
   - Kiểm tra xem từng file trong `{{file_list}}` có tồn tại hay không.
   - Xác định định dạng (đuôi file) của từng file: `.docx`, `.xlsx`, `.pptx`, `.md`, `.csv`,...

2. **Chuẩn hóa tài liệu**:
   - Đối với các file có định dạng `.docx`, `.xlsx`, `.pptx`: Gọi công cụ `agents/qa-leader/tools/convert-to-md.js` để tự động chuyển đổi sang Markdown (`.md`) hoặc CSV (`.csv`).
   - Giữ nguyên các file đã ở định dạng `.md` hoặc `.csv`.

3. **Tổng hợp kết quả**:
   - Báo cáo danh sách file đã chuyển đổi thành công.
   - Báo cáo các file lỗi hoặc không đọc được nếu có.

## Sample Input
```text
Thư mục: ./input_docs/
Danh sách file:
- Requirement_v1.docx
- Data_Schema.xlsx
- System_Architecture.pptx
- User_Story.md
```

## Sample Output
```markdown
### Báo cáo chuẩn hóa tài liệu đầu vào

- [SUCCESS] `Requirement_v1.docx` -> `Requirement_v1.md`
- [SUCCESS] `Data_Schema.xlsx` -> `Data_Schema.csv`
- [SUCCESS] `System_Architecture.pptx` -> `System_Architecture.md`
- [SKIPPED] `User_Story.md` (Đã ở định dạng Markdown)

**Tổng số file đã xử lý:** 4/4 file thành công.
```

## Quality Check
- **Faithful**: Đảm bảo tất cả tài liệu gốc trong `{{file_list}}` được ghi nhận đúng tên và định dạng, không bỏ sót.
- **Accurate**: Kết quả chuyển đổi chính xác tương ứng theo loại file (DOCX -> MD, XLSX -> CSV, PPTX -> MD).
- **Complete**: Báo cáo rõ ràng trạng thái SUCCESS/FAILED/SKIPPED của từng file.
- **Traceable**: Trích dẫn đường dẫn file nguồn và file đích sau khi chuẩn hóa.
