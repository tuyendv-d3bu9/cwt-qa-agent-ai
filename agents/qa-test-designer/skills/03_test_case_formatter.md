# Skill: Test Case Formatter

## Purpose
Dùng cuối cùng, sau `01_coverage_strategy.md` và `02_boundary_generator.md`. Gộp kết quả 2 skill trước thành test case hoàn chỉnh theo 8 trường chuẩn, sẵn sàng ghi vào `.qa-run/deliverables/deliverable-test-designer.md`.

## Knowledge Reference
- `memory/semantic/testing-conventions.md` (cross-node) — TC_ID convention (`TC-D-<nnn>`), 4 mức Priority, 8 trường chuẩn.
- `memory/project/known-issues.md` (cross-node) — Bug ID để gắn Tags cho regression case.

## Prompt Type
Template-based

## Variables
{{coverage_strategy_output}} — output skill 01
{{boundary_sets}} — output skill 02

## PROMPT
Bạn là QA Test Designer Agent. Dựa trên:

{{coverage_strategy_output}}
{{boundary_sets}}

Với mỗi test idea/boundary case, viết thành 1 test case đủ 8 trường:
`TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags`

- `TC_ID`: theo format `TC-D-<nnn>`, tăng dần, không trùng.
- `Priority`: theo 4 mức đã định nghĩa trong `memory/semantic/testing-conventions.md` (Critical/High/Medium/Low) — dựa trên Likelihood × Impact đã gán ở skill 01.
- `Tags`: ghi technique đã dùng (`[BVA]`, `[EP]`, `[Decision Table]`, `[State Transition]`) và Bug ID nếu là regression case (`[BUG-1170]`).
- Dòng `[BLOCKED - chờ OPEN QUESTION]` từ skill 01: KHÔNG viết thành test case — liệt kê riêng vào mục "Chưa thể tạo test case (chờ OPEN QUESTION)" ở cuối, giữ nguyên lý do.

## Sample Input
coverage_strategy_output = "..."
boundary_sets = "### Boundary set — order_total vs min_order_value ..."

## Sample Output
```
| TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags |
|---|---|---|---|---|---|---|---|
| TC-D-001 | Áp mã khi order_total đúng bằng min_order_value | Giỏ hàng có sản phẩm, chưa áp mã | 1. Vào checkout 2. Nhập mã 3. Bấm Áp dụng | order_total = min_order_value, voucher_code hợp lệ | Áp mã thành công, order_total_after giảm đúng | High | [BVA] |

### Chưa thể tạo test case (chờ OPEN QUESTION)
- Xác định "khách mua lần đầu" khi checkout không login — chờ Analyst/BA xác nhận cách check (xem OPEN QUESTIONS trong deliverable-analyst.md).
```

## Quality Check
> Áp dụng FACT self-check từ `memory/semantic/fact-framework.md` trước khi ghi deliverable.

- **Faithful**: không tự trả lời OPEN QUESTIONS bằng cách viết test case giả định.
- **Accurate**: Priority phải khớp với Likelihood × Impact đã gán ở skill 01, không tự đổi.
- **Complete**: đủ 8 trường cho mọi test case, không trường nào để trống.
- **Testable**: Expected Result phải cụ thể (số liệu, message, trạng thái), không viết mơ hồ như "hệ thống xử lý đúng".
