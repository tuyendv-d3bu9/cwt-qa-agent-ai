# Skill: Revise On Feedback

## Purpose
Dùng khi `.state/task-assignment.md` đã có thêm mục "## Feedback vòng N (FIX)" do QA Leader ghi vào (sau khi review theo FACT). Sửa đúng điểm được chỉ ra — **không viết lại toàn bộ deliverable từ đầu**.

## Prompt Type
Template-based

## Variables
{{feedback}} — nội dung feedback vòng gần nhất, trích từ task-assignment.md
{{previous_deliverable}} — nội dung deliverable.md hiện tại (bản bị FIX)

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
- Faithful: chỉ sửa đúng phạm vi feedback, không âm thầm đổi những phần đã PASS trước đó.
- Accurate: điểm sửa phải giải quyết đúng vấn đề Leader nêu, không sửa sai chỗ.
- Complete: trả về đủ cấu trúc deliverable, không cắt bớt phần không liên quan tới feedback.
