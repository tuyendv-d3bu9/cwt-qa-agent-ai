# Skill: Boundary Generator

## Purpose
Dùng ngay sau `01_coverage_strategy.md`. Với mọi dòng được gán technique BVA hoặc State Transition, sinh boundary set cụ thể dựa trên giá trị thật trong API spec (không suy đoán số liệu). KHÔNG xử lý các dòng `[BLOCKED - chờ OPEN QUESTION]`.

## Knowledge Reference
- `memory/project/domain-facts.md` (cross-node) — API spec thật: `min_order_value`, `max_discount`, `expire_at` (UTC), làm tròn xuống (floor) tới hàng nghìn.
- `knowledge/boundary-coverage-conventions.md` — bảng field → technique.

## Prompt Type
Template-based

## Variables
{{coverage_strategy_output}} — output skill 01

## PROMPT
Bạn là QA Test Designer Agent. Dựa trên chiến lược coverage:

{{coverage_strategy_output}}

Với mỗi dòng có technique chứa **BVA** hoặc **State Transition** (bỏ qua dòng `[BLOCKED]`), sinh boundary set cụ thể:
- Số tiền/threshold (`min_order_value`, `max_discount`, `discount_amount`): giá trị dưới min 1 đơn vị, đúng min, trên min 1 đơn vị, 0, âm, giá trị rơi đúng mốc làm tròn xuống hàng nghìn (ví dụ 729.999 → phải hiển thị/tính như 729.000 theo mục 9 API spec).
- Thời gian (`expire_at`): trước hạn 1 giây, đúng lúc `now_utc == expire_at`, sau hạn 1 giây — so sánh theo UTC timestamp, không theo giờ local.
- State Transition (giỏ hàng đổi sau khi áp mã): trạng thái trước khi đổi giỏ, hành động đổi giỏ, trạng thái mong đợi sau khi đổi giỏ (chú ý: hiện chưa có endpoint re-validate — ghi rõ hành vi thực tế theo Known limitations, không viết như đã có re-validate).

Mỗi boundary case phải có Test Data cụ thể (số/thời điểm thật) và Expected Result rõ ràng — không viết "giá trị hợp lệ" hay "giá trị không hợp lệ" mà không có số cụ thể.

## Sample Input
coverage_strategy_output = "| Áp mã khi order_total đúng bằng min_order_value | Boundary | Medium × High | BVA | - |"

## Sample Output
```
### Boundary set — order_total vs min_order_value
| Case | Test Data | Expected Result |
|---|---|---|
| Dưới min 1 đơn vị | order_total = min_order_value - 1.000đ | VOUCHER_MIN_ORDER_NOT_MET |
| Đúng min | order_total = min_order_value | Áp mã thành công |
| Trên min 1 đơn vị | order_total = min_order_value + 1.000đ | Áp mã thành công |
```

## Quality Check
> Áp dụng FACT self-check từ `memory/semantic/fact-framework.md` trước khi truyền sang skill tiếp theo.

- **Faithful**: chỉ sinh boundary cho field có giá trị thật trong `memory/project/domain-facts.md`, không bịa threshold không có trong API spec.
- **Accurate**: đơn vị tiền tệ (đ), UTC timestamp, quy tắc floor-rounding phải đúng như mục 9 API spec.
- **Complete**: mỗi dòng BVA/State Transition từ skill 01 đều có ≥3 boundary case (dưới/đúng/trên hoặc trước/đúng/sau).
- **Testable**: mỗi case có Test Data + Expected Result cụ thể, không mô tả chung.
