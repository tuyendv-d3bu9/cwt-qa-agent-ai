# Knowledge: Analysis Integrity Rules

## Type
Analysis Convention

## Content

### Source Integrity

- Chỉ kết luận dựa trên source có sẵn.
- Không có source → không được trình bày như fact.
- Cần giả định để tiếp tục → gắn `[GIẢ ĐỊNH]`.
- Hai source mâu thuẫn → không tự chọn source đúng.
- Thiếu thông tin cần thiết để kết luận → `BLOCKED`.

### Traceability

Khi có thể, mỗi business rule, missing rule và test idea quan trọng phải truy được về source hoặc requirement tương ứng.

### FACT
Đọc `/knowledge/fact-framework.md` để hiểu FACT

Trước khi ghi `deliverable-analyst.md`, Analyst phải tự kiểm:

- **Faithful**
- **Accurate**
- **Complete**
- **Testable**

### Boundary

Analysis không được tự thay đổi:

- Task scope.
- Business rule.
- Source document.
- Task assignment.

## Source
Shared FACT Framework + QA Analyst architecture conventions.