# Skill: Document Classification

## Purpose
Dùng sau khi các tài liệu đầu vào đã được chuyển đổi sang định dạng `.md` hoặc `.csv`. Skill này đọc nội dung tài liệu và phân loại chúng vào đúng 6 thư mục chức năng tiêu chuẩn của dự án.

## Prompt Type
Few-shot / Classification Rules

## Variables
- `{{document_list}}`: Danh sách các tài liệu Markdown/CSV cần phân loại (chỉ những file đang nằm ở GỐC thư mục nguồn — file đã nằm trong thư mục con thì coi là đã phân loại, không đưa vào đây).
- `{{document_contents}}`: Nội dung chi tiết hoặc tóm tắt của từng tài liệu.
- `{{available_folders}}`: **Danh sách thư mục THẬT đang có trong dự án**, do `index.js` đọc trực tiếp từ cây thư mục. Tên thư mục là **dữ liệu của dự án**, không phải hằng số trong code — dự án khác có thể đặt tên khác (xem `memory/README.md`).

## PROMPT
Phân tích danh sách và nội dung tài liệu trong `{{document_contents}}`. Xếp từng file vào thư mục phù hợp **chọn từ `{{available_folders}}`**.

**Luật cứng**:
- Chỉ được chọn thư mục đích **có trong `{{available_folders}}`**. KHÔNG tự tạo tên thư mục mới.
- **KHÔNG tự sửa chính tả tên thư mục** — nếu dự án đang dùng một tên viết sai chính tả thì vẫn phải dùng đúng tên đó, vì đây là đường dẫn thật trên đĩa. Sửa "cho đẹp" sẽ tạo thư mục thứ hai và làm tài liệu bị phân tán.
- Mỗi file vào đúng **một** thư mục.

Ý nghĩa thông thường của các nhóm (dùng để khớp ngữ nghĩa với tên trong `{{available_folders}}`, không phải danh sách bắt buộc):

| Nhóm | Loại tài liệu |
|---|---|
| Business | Tổng quan nghiệp vụ, mục tiêu kinh doanh, quy trình chung, thông tin dự án |
| BA | Yêu cầu phần mềm, phân tích nghiệp vụ (BRD, SRS, User Story, Use Case) |
| DEV | Tài liệu kỹ thuật, kiến trúc hệ thống, spec API, sơ đồ database |
| Design | UI/UX, mô tả giao diện, wireframe, design guideline |
| QA | Test Plan, Test Strategy, Test Case, Bug Report |
| Communication | Log chat, email, biên bản họp, làm rõ yêu cầu |

Hãy đầu ra danh sách tài liệu cùng thư mục đích được phân loại tương ứng.

## Sample Input
```text
available_folders = ["01_Business", "02_BA", "03_DEV", "04_Design", "05_QA", "06_Communication"]
(lưu ý: "04_Design" viết sai chính tả nhưng đó là tên thư mục THẬT của dự án này — phải dùng đúng, không tự sửa)

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
- `UI_Checkout_Flow.md` -> `04_Design/UI_Checkout_Flow.md`
- `Meeting_20260801.md` -> `06_Communication/Meeting_20260801.md`

**Trạng thái phân loại:** Hoàn thành 4/4 file.
```

## Quality Check
- **Faithful**: Phân loại đúng theo bản chất nội dung thực tế của tài liệu, không suy đoán vô căn cứ.
- **Accurate**: Xếp đúng file vào 1 trong 6 thư mục tiêu chuẩn đã quy định.
- **Complete**: Tất cả tài liệu Markdown đầu vào đều được gán thư mục đích.
- **Traceable**: Liệt kê rõ ràng tên file ban đầu và đường dẫn thư mục đích.
