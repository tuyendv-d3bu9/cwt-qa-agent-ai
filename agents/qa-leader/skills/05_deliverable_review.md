# Skill: QA Deliverable Review & Decision

## Purpose
Dùng khi QA Analyst hoặc các QA Agent hoàn thành sản phẩm (như Test Scenarios, Test Cases, Bug Reports, Traceability Matrix). Skill này thực hiện đánh giá chất lượng sản phẩm và đưa ra quyết định phê duyệt chính thức với một trong ba trạng thái: **PASS**, **FIX**, hoặc **ASK**.

## Prompt Type
Chain-of-thought / Decision-matrix

## Variables
- `{{deliverable_content}}`: Nội dung sản phẩm do QA Analyst / QA Agent tạo ra.
- `{{reference_docs}}`: Tài liệu gốc đối chiếu (`02_BA`, `03_DEV`, `04_Design`).
- `{{review_checklist}}`: Tiêu chí kiểm tra chất lượng.

## PROMPT
Đánh giá sản phẩm trong `{{deliverable_content}}` bằng cách đối chiếu với tài liệu gốc `{{reference_docs}}` theo ma trận quyết định sau:

1. **Phân tích & Kiểm tra**:
   - Kiểm tra độ bao phủ yêu cầu (Requirement Coverage).
   - Kiểm tra tính chính xác của các kịch bản test (Test Logic, Boundary Values, Negative Cases).
   - Kiểm tra xem sản phẩm có bị thừa/thiếu chi tiết so với tài liệu gốc hay không.

2. **Ra Quyết định Trạng thái**:
   - **`PASS`**: Sản phẩm đã đầy đủ thông tin, chính xác, đạt chất lượng và được phê duyệt để chuyển sang bước tiếp theo.
   - **`FIX`**: Sản phẩm chưa đạt do lỗi của QA Agent/Analyst (phân tích thiếu luồng, phân tích dư thừa, hoặc hiểu sai spec). Yêu cầu QA Agent/Analyst chỉnh sửa bổ sung.
   - **`ASK`**: Sản phẩm bị tắc nghẽn do thiếu/chưa rõ thông tin từ phía BA hoặc DEV (không phải lỗi của QA Agent/Analyst). Cần gửi yêu cầu làm rõ cho BA/DEV.

3. **Tổng hợp Kết quả Review**:
   - Trả về quyết định trạng thái rõ ràng (PASS / FIX / ASK).
   - Liệt kê nhận xét chi tiết và các hành động cần thực hiện tiếp theo.

## Sample Input
```text
Sản phẩm review: Test_Scenarios_Payment.md do QA_Analyst_01 tạo.
Tài liệu tham chiếu: 02_BA/SRS_Payment.md, 03_DEV/API_Payment.md

Nội dung sản phẩm:
- Scenario 1: Thanh toán thành công qua VNPay.
- Scenario 2: Thanh toán thất bại do tài khoản không đủ tiền.
(Thiếu Scenario về timeout kết nối API thanh toán).
```

## Sample Output
```markdown
### Kết quả Phê duyệt Sản phẩm (Deliverable Review)

**Sản phẩm:** `Test_Scenarios_Payment.md`  
**Người thực hiện:** QA_Analyst_01  
**Quyết định phê duyệt:** **FIX**  

#### Lý do & Nhận xét chi tiết:
1. **Thiếu kịch bản ngoại lệ API**: Chưa cover kịch bản Timeout / Network Error khi gọi API VNPay (thiếu so với `03_DEV/API_Payment.md` mục 4.2).
2. **Kịch bản hiện tại**: Kịch bản thành công và tài khoản không đủ tiền phân tích tốt và chính xác.

#### Hành động yêu cầu:
- **Phân công lại cho:** QA_Analyst_01
- **Hành động:** Bổ sung kịch bản xử lý Timeout/Lỗi mạng cho API VNPay và nộp lại bản review v2.
```

## Quality Check
- **Faithful**: Đánh giá dựa trên bằng chứng thực tế đối chiếu từ tài liệu gốc, không phán xét cảm tính.
- **Accurate**: Phân loại chính xác giữa FIX (lỗi QA) và ASK (lỗi thiếu spec từ BA/DEV) hoặc PASS.
- **Complete**: Đưa ra quyết định rõ ràng kèm lý do và danh sách việc cần khắc phục.
- **Traceable**: Trích dẫn vị trí dòng/mục cụ thể trong sản phẩm và tài liệu tham chiếu.
