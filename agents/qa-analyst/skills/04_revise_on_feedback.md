# Skill: Revise On Feedback

## Purpose
Dùng khi `memory/working/task-assignment.md` đã có thêm mục "## Feedback vòng N (FIX)" do QA Leader ghi vào (sau khi review theo FACT). Sửa đúng điểm được chỉ ra — **không viết lại toàn bộ deliverable từ đầu**.

## Knowledge Reference
- `memory/semantic/fact-framework.md` — FACT self-check (Section 2) + FIX Round rules (Section 6) + File Boundary (Section 5).
- `knowledge/analysis-integrity.md` — source integrity và boundary sau khi sửa.
- `knowledge/requirement-summary.md` — schema 7 phần chuẩn cần giữ nguyên khi trả về deliverable.

## Prompt Type
Template-based

## Variables
{{feedback}} — nội dung feedback vòng gần nhất, trích từ task-assignment.md
{{previous_deliverable}} — nội dung deliverable-analyst.md hiện tại (bản bị FIX)

## PROMPT
Bạn là QA Analyst Agent. Leader vừa review bản deliverable trước và yêu cầu FIX với nhận xét sau:

{{feedback}}

Đây là bản deliverable hiện tại:

{{previous_deliverable}}

Sửa CHÍNH XÁC những điểm được nêu trong feedback. Giữ nguyên mọi phần khác không bị góp ý — không viết lại từ đầu, không tự ý thêm nội dung ngoài phạm vi feedback. Trả về TOÀN BỘ deliverable đã sửa (đủ cấu trúc như bản gốc: Requirement Summary, Missing Rules, Viewpoints & Test Ideas, Assumptions, Open Questions).

## Sample Input
feedback = "Thiếu Traceable: Missing Rule #3 không trích nguồn tài liệu nào. Bổ sung trích dẫn cụ thể."
previous_deliverable = "... | Rule #3: Voucher hết hạn giữa checkout | ... |"

## Sample Output
```
(Toàn bộ deliverable, chỉ riêng dòng Rule #3 được bổ sung cột trích dẫn nguồn, các phần khác giữ nguyên y hệt bản trước)
```

## Quality Check
> Áp dụng FACT self-check từ `memory/semantic/fact-framework.md` (Section 2) sau khi sửa.
> Tuân thủ FIX Round rules từ `memory/semantic/fact-framework.md` (Section 6).

- **Faithful** (xem `knowledge/analysis-integrity.md`): chỉ sửa đúng phạm vi feedback, không âm thầm đổi những phần đã PASS trước đó.
- **Accurate**: điểm sửa phải giải quyết đúng vấn đề Leader nêu, không sửa sai chỗ.
- **Complete** (xem `knowledge/requirement-summary.md`): trả về đủ cấu trúc deliverable (Requirement Summary, Missing Rules, Viewpoints & Test Ideas, Assumptions, Open Questions), không cắt bớt phần không liên quan tới feedback.
- **Testable** (xem `memory/semantic/fact-framework.md`): sau khi sửa, deliverable vẫn phải đầy đủ có thể kiểm chứng.
