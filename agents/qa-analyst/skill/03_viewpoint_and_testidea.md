# Skill: Viewpoint & Test Idea Generator

## Purpose
Dùng sau `02_missing_rule_finder.md` — chọn 4 viewpoint phù hợp nhất (từ 8 viewpoint trong `knowledge/requirement-analysis-conventions.md`) và sinh test idea cho mỗi viewpoint.

## Prompt Type
Template-based

## Variables
{{requirement_summary}} — output skill 01
{{missing_rules}} — output skill 02

## PROMPT
Bạn là QA Analyst Agent. Dựa trên:

{{requirement_summary}}
{{missing_rules}}

Chọn 4 viewpoint phù hợp nhất (ưu tiên theo Business Impact × Likelihood × Detectability). Với mỗi viewpoint, viết: Tên viewpoint │ Mục tiêu │ Phạm vi (in/out scope) │ 5 test idea (mỗi idea 1 câu ngắn gọn). Tổng cộng ≥20 test idea. Không trùng lặp giữa các viewpoint.

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
- Complete: đủ 4 viewpoint × 5 idea = 20 idea, không viewpoint nào thiếu.
- Testable: mỗi idea đủ cụ thể để expand thành test case sau này (không viết chung chung kiểu "test voucher").
- Traceable: viewpoint chọn phải giải thích được lý do ưu tiên (bám vào rủi ro đã nêu ở missing_rules khi có thể).
