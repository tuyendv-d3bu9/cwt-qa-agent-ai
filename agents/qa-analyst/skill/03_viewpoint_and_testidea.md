# Skill: Viewpoint & Test Idea Generator

## Purpose
Dùng sau `02_missing_rule_finder.md` — chọn viewpoint phù hợp nhất (từ 8 viewpoint trong `knowledge/viewpoint-library.md`) theo tiêu chí Business Impact × Likelihood × Detectability, sau đó sinh test idea cho mỗi viewpoint.

## Knowledge Reference
- `knowledge/viewpoint-library.md` — 8 viewpoint của QA và tiêu chí selection (Business Impact × Likelihood × Detectability).
- `knowledge/analysis-integrity.md` — source integrity và boundary khi viết test idea.
- `knowledge/fact-framework.md` — FACT self-check trước khi ghi deliverable.

## Prompt Type
Template-based

## Variables
{{requirement_summary}} — output skill 01
{{missing_rules}} — output skill 02

## PROMPT
Bạn là QA Analyst Agent. Dựa trên:

{{requirement_summary}}
{{missing_rules}}

Chọn viewpoint phù hợp nhất (ưu tiên theo Business Impact × Likelihood × Detectability). Với mỗi viewpoint, viết theo format:
| Tên viewpoint │ Mục tiêu │ Phạm vi (in/out scope) │ Test idea | 
Không trùng lặp giữa các viewpoint.

## Sample Input
requirement_summary = "..."
missing_rules = "..."

## Sample Output
```
### Viewpoint: Negative — Voucher Validation
Mục tiêu: xác nhận hệ thống xử lý đúng khi mã voucher không hợp lệ.
Test ideas:
1. Nhập mã voucher không tồn tại
2. Nhập mã voucher đã hết hạn
3. Nhập mã voucher đã dùng hết lượt
4. Nhập mã voucher sai định dạng (ký tự đặc biệt)
5. Nhập mã voucher của user khác (nếu voucher gắn theo tài khoản)
```

## Quality Check
> Áp dụng FACT self-check từ `knowledge/fact-framework.md` trước khi ghi deliverable.
> Lựa chọn viewpoint theo `knowledge/viewpoint-library.md` — Business Impact × Likelihood × Detectability.

- **Faithful** (xem `knowledge/analysis-integrity.md`): test idea bám sát requirement, không tự mở rộng scope.
- **Accurate** (xem `knowledge/viewpoint-library.md`): giải thích được lý do chọn viewpoint dựa trên risk và business impact.
- **Complete** (xem `knowledge/viewpoint-library.md`): đủ số viewpoint × idea theo prompt; không viewpoint nào thiếu.
- **Testable** (xem `knowledge/fact-framework.md`): mỗi idea đủ cụ thể để expand thành test case (không viết chung chung).
- **Traceable**: viewpoint chọn phải giải thích được lý do ưu tiên (bám vào rủi ro đã nêu ở missing_rules khi có thể).
