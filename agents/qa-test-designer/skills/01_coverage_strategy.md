# Skill: Coverage Strategy

## Purpose
Dùng đầu tiên khi nhận `.qa-run/deliverables/deliverable-analyst.md` mới (hoặc khi có bản cập nhật từ Analyst). Đi qua từng viewpoint/test idea của Analyst, gán mức rủi ro (Likelihood × Impact) và chọn technique phù hợp (EP/BVA/Decision Table/State Transition) — làm nền cho skill `02_boundary_generator.md` và `03_test_case_formatter.md`. KHÔNG tự tạo thêm test idea mới ngoài những gì Analyst đã sinh.

## Knowledge Reference
- `knowledge/boundary-coverage-conventions.md` — bảng field → technique ưu tiên.
- `agents/qa-analyst/knowledge/viewpoint-library.md` (cross-node, đọc trực tiếp) — 8 viewpoint và cách chọn.
- `agents/qa-leader/knowledge/task-management-conventions.md` mục 3 (cross-node, đọc trực tiếp) — ma trận Likelihood × Impact.
- `memory/project/known-issues.md` (cross-node) — bug đã biết, để đánh dấu test idea nào là regression case.

## Prompt Type
Chain-of-thought

## Variables
{{task}} — nội dung `.qa-run/deliverables/task-assignment.md` (scope được Leader giao)
{{deliverable_analyst_content}} — toàn bộ nội dung `.qa-run/deliverables/deliverable-analyst.md` (4 phần: Requirement Summary, Missing Rules, Viewpoints & Test Ideas, Self Count Check)

## PROMPT
Bạn là QA Test Designer Agent. Scope được giao:

{{task}}

Sản phẩm của QA Analyst:

{{deliverable_analyst_content}}

Với MỖI test idea trong mục "Viewpoints & Test Ideas", thực hiện:
1. Gán **Likelihood × Impact** theo ma trận đã dùng cho QA Leader (không tự định nghĩa lại thang đo).
2. Chọn **1 technique** phù hợp nhất (EP/BVA/Decision Table/State Transition) theo bảng field → technique trong `boundary-coverage-conventions.md`; nếu field không có trong bảng, giải thích lý luận tương tự.
3. Nếu test idea trùng với bug đã biết trong `memory/project/known-issues.md`, đánh dấu `[REGRESSION - BUG-xxxx]`.
4. Nếu test idea liên quan đến 1 mục trong OPEN QUESTIONS của Analyst, đánh dấu `[BLOCKED - chờ OPEN QUESTION]` — KHÔNG tự suy luận câu trả lời để tiếp tục xử lý idea đó ở bước sau.

Không bỏ sót test idea nào của Analyst. Không tự thêm test idea mới ở bước này.

## Sample Input
deliverable_analyst_content = "... Viewpoints & Test Ideas: ### Viewpoint: Boundary — Voucher Amount ... 1. Áp mã khi order_total đúng bằng min_order_value ..."

## Sample Output
```
| Test Idea | Viewpoint | Likelihood × Impact | Technique | Note |
|---|---|---|---|---|
| Áp mã khi order_total đúng bằng min_order_value | Boundary | Medium × High | BVA | - |
| Áp mã hết hạn lúc 00:30 sáng | Boundary | Medium × Critical | BVA + State Transition | [REGRESSION - BUG-1170] |
| Xác định "khách mua lần đầu" khi checkout không login | Negative | - | - | [BLOCKED - chờ OPEN QUESTION] |
```

## Quality Check
> Áp dụng FACT self-check từ `memory/semantic/fact-framework.md` trước khi truyền sang skill tiếp theo.

- **Faithful**: chỉ xử lý test idea đã có từ Analyst, không tự thêm idea mới.
- **Accurate**: technique chọn đúng theo bảng trong `boundary-coverage-conventions.md`, không tự suy đoán ngoài 4 loại đã liệt kê nếu không giải thích lý do.
- **Complete**: mọi test idea của Analyst đều xuất hiện trong output (kể cả các mục BLOCKED).
- **Testable**: mỗi dòng phải đủ thông tin để skill `02_boundary_generator.md` xử lý tiếp không cần hỏi lại.
