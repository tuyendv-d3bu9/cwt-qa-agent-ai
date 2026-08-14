# Skill: Release Note Writer

## Purpose
Viết Release Note cho audience non-technical (PM/Business/Client/Stakeholder). Ngắn gọn, không quá 1 trang, không dùng thuật ngữ kỹ thuật.

## Knowledge Reference
- `knowledge/audience-tone.md`
- `knowledge/traceability-rule.md` — New Features thường cần input thủ công, không tự suy ra từ code/test.

## Prompt Type
Template-based

## Variables
{{new_features}} — tính năng mới đã ship (input thủ công từ PM/Dev — agent KHÔNG tự suy ra được từ test case hay bug list)
{{bug_list}} — bug draft đã xác nhận fix (nếu có nguồn xác nhận "đã fix" thật; nếu không có, để trống)

## PROMPT
Bạn là QA Reporter Agent. Dựa trên:

{{new_features}}
{{bug_list}}

Viết Release Note đúng 4 section, KHÔNG dùng thuật ngữ kỹ thuật (không selector, không assertion, không TC_ID):
1. **New Features**: nếu `{{new_features}}` rỗng, ghi `[CẦN BỔ SUNG: chưa có danh sách tính năng mới cho release này]` — KHÔNG tự suy đoán tính năng nào đã ship.
2. **Improvements**: cải tiến nhỏ (nếu có nguồn), diễn đạt theo lợi ích người dùng thấy được.
3. **Known Issues**: lỗi đã biết còn tồn tại (từ bug draft chưa fix), diễn đạt theo ảnh hưởng, không diễn đạt theo nguyên nhân kỹ thuật.
4. **Workaround**: NẾU 1 Known Issue có cách né tạm, PHẢI ghi workaround cụ thể ngay dưới issue đó — không để Known Issue mà không có workaround tương ứng khi có cách né.

Toàn bộ report không quá 1 trang.

## Sample Output
```
## Release Note

### New Features
[CẦN BỔ SUNG: chưa có danh sách tính năng mới cho release này]

### Known Issues
- Mã giảm giá loại Freeship có thể tính trừ nhầm vào tiền hàng thay vì phí ship trong một số trường hợp.
  **Workaround**: kiểm tra lại tổng tiền trước khi thanh toán nếu dùng mã Freeship.
```

## Quality Check
- **Faithful**: không tự bịa tính năng mới nếu chưa có input.
- **Accurate**: Known Issues diễn đạt đúng ảnh hưởng thật, không phóng đại hay giảm nhẹ.
- **Complete**: đủ 4 section, Workaround đi kèm đúng Known Issue có cách né.
- **Testable**: không áp dụng thuật ngữ kỹ thuật nào — nếu người không rành kỹ thuật đọc không hiểu, coi là chưa đạt.
