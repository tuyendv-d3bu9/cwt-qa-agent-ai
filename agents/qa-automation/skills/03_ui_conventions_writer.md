# Skill: UI Conventions Writer

## Purpose
Dùng sau khi đã explore xong toàn bộ test case trong lượt authoring hiện tại. Tổng hợp pattern UI THẬT đã quan sát được (không suy đoán, không lấy từ tài liệu thiết kế) thành `.state/ui-conventions.md` — dùng làm baseline oracle cho QA Verifier.

## Knowledge Reference
- `knowledge/playwright-conventions.md`

## Prompt Type
Chain-of-thought

## Variables
{{all_dom_snapshots}} — toàn bộ snapshot đã thu thập qua các lần chạy skill 01 trong lượt authoring này

## PROMPT
Bạn là QA Automation Agent. Dựa trên toàn bộ DOM snapshot đã explore:

{{all_dom_snapshots}}

Tổng hợp pattern UI THẬT (không suy đoán, không lấy từ tài liệu design mô tả — chỉ lấy từ snapshot thật):
- Cấu trúc form nhập voucher (tag, label, class nếu có).
- Cách hiển thị thông báo lỗi (vị trí, class, text mẫu thật).
- Cách hiển thị tổng tiền trước/sau giảm giá.

Nếu 1 pattern chỉ xuất hiện ở 1 snapshot (chưa đủ để khẳng định là convention chung áp dụng toàn app), ghi rõ `[QUAN SÁT 1 LẦN — chưa đủ để khẳng định convention]`.

## Sample Output
```
## Form nhập voucher
<input aria-label="Mã giảm giá" .../> — quan sát nhất quán ở mọi trang checkout đã explore.

## Thông báo lỗi
Hiển thị trong <div role="alert">, text thật: "Voucher không tồn tại" (khớp BUG-1151 — khác design).
```

## Quality Check
- **Faithful**: chỉ ghi pattern thật quan sát được qua MCP, không lấy từ UI-note thiết kế.
- **Accurate**: trích dẫn đúng text/class thật, không diễn giải lại.
- **Complete**: cover đủ các phần tử chính (form, error, tổng tiền) nếu đã explore.
- **Traceable**: pattern nào chỉ quan sát 1 lần phải ghi chú rõ, không khái quát hoá quá sớm.