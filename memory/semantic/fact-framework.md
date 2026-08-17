# Knowledge: FACT Framework (Shared)

## Type
Convention / Business Rule

## Content

### FACT Framework - tự kiểm trước khi ghi file

| Tiêu chí | Ý nghĩa |
|---|---|
| **F - Faithful** | Dùng tài liệu gốc, không thêm thắt, không suy diễn ngoài phạm vi nguồn. |
| **A - Accurate** | Số liệu, biên giới, điều kiện chính xác - không làm tròn hay ước lượng tùy tiện. |
| **C - Complete** | Đủ trường theo schema của skill, không bỏ sót mục bắt buộc. |
| **T - Testable** | Mỗi mục có thể kiểm chứng được bằng tài liệu nguồn hoặc test case cụ thể. |

> Agent **phải** tự kiểm theo FACT trước khi ghi output vào file deliverable.
> Không ghi deliverable nếu phát hiện lỗi có thể tự sửa.

---

### Quy tắc phân loại vi phạm

- **Vi phạm Faithful hoặc Accurate** → luôn là **FIX** (lỗi của Agent tạo ra output, không phải lỗi thiếu spec).
- **Vi phạm Complete** vì thiếu tài liệu nguồn (không phải do Agent bỏ sót) → **ASK**.
- **Vi phạm Complete** vì Agent tự bỏ sót dù tài liệu có đủ → **FIX**.
- **Vi phạm Testable** → **FIX**, luôn yêu cầu bổ sung trích dẫn/test case cụ thể trước khi tính PASS.
- Đạt cả 4 tiêu chí → **PASS**.

---

### Source Traceability

Các kết luận quan trọng phải truy nguồn được về:

- File nguồn.
- Section hoặc heading liên quan khi có thể xác định.
- Requirement / acceptance criteria tương ứng.
- Test case hoặc verification method nếu applicable.

Không dùng nguồn ngoài scope nếu task không cho phép.

## Source
Thiết kế QA Leader, thống nhất Session 10. Thiết kế QA Analyst.

## Node referenced
qa-leader, qa-analyst
