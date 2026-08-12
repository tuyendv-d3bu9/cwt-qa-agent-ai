# Skill: Task Assignment to QA Analyst

## Purpose
Dùng sau khi tài liệu đầu vào đã đầy đủ, không còn mâu thuẫn (hoặc thông tin đã được confirm bởi QA Manuals). Skill này tạo lệnh/phiếu phân công nhiệm vụ cho QA Analyst để tiến hành phân tích chi tiết tài liệu và thiết kế test artifacts.

## Prompt Type
Template-based

## Variables
- `{{validated_documents}}`: Danh sách tài liệu đã kiểm tra và chuẩn hóa.
- `{{qa_analyst_name}}`: Tên hoặc định danh của QA Analyst được phân công.
- `{{task_scope}}`: Phạm vi công việc và mục tiêu phân tích.

## PROMPT
Tạo lệnh phân công công việc phân tích tài liệu cho `{{qa_analyst_name}}` dựa trên danh sách tài liệu `{{validated_documents}}` theo các nội dung sau:

1. **Thông tin phân công**:
   - Người thực hiện: `{{qa_analyst_name}}`
   - Phạm vi phân tích: `{{task_scope}}`

2. **Danh sách tài liệu bàn giao**:
   - Liệt kê các đường dẫn tài liệu theo từng thư mục đã chuẩn hóa (`01_Business`, `02_BA`, `03_DEV`, `04_Dessign`).

3. **Yêu cầu đầu ra (Deliverables)**:
   - Danh sách các sản phẩm QA Analyst cần tạo (Ví dụ: Mindmap yêu cầu, Matrix bao phủ, Danh sách Test Scenario, Test Case draft).

4. **Hạn chót & Ghi chú**:
   - Quy định tiêu chí hoàn thành và kênh phản hồi khi gặp blocker.

## Sample Input
```text
QA Analyst: QA_Analyst_01
Scope: Phân tích module Thanh toán (Payment Gateway)
Tài liệu:
- 02_BA/SRS_Payment.md
- 03_DEV/API_Payment.md
- 04_Dessign/UI_Payment.md
```

## Sample Output
```markdown
### Lệnh Phân công Công việc (Task Assignment)

**Người nhận:** QA_Analyst_01  
**Module:** Phân tích Yêu cầu & Kỹ thuật - Thanh toán (Payment Gateway)  
**Trạng thái đầu vào:** Đã đủ thông tin & Đã xác nhận (CONFIRMED)  

#### 1. Tài liệu bàn giao:
- `02_BA/SRS_Payment.md`
- `03_DEV/API_Payment.md`
- `04_Dessign/UI_Payment.md`

#### 2. Nhiệm vụ cần thực hiện:
- [ ] Phân tích các luồng nghiệp vụ thanh toán (thành công, thất bại, timeout).
- [ ] Xây dựng Matrix bao phủ yêu cầu (Traceability Matrix).
- [ ] Liệt kê danh sách kịch bản kiểm thử (Test Scenarios) cho API và UI.

#### 3. Đầu ra yêu cầu:
- File `05_QA/Test_Scenarios_Payment.md`
- Trạng thái sẵn sàng cho bước Review.
```

## Quality Check
- **Faithful**: Đảm bảo phân công đúng tài liệu đã qua xác thực (CONFIRMED).
- **Accurate**: Định nghĩa rõ ràng phạm vi công việc và sản phẩm đầu ra mong đợi.
- **Complete**: Cung cấp đầy đủ thông tin tài liệu nguồn, nhiệm vụ và tiêu chí hoàn thành.
- **Traceable**: Gắn kết chặt chẽ tài liệu phân công với sản phẩm đầu ra của QA Analyst.
