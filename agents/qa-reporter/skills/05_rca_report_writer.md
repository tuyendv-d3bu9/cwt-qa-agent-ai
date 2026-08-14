# Skill: RCA Report Writer

## Purpose
Viết Root Cause Analysis cho 1 bug đã xác nhận. AI CHỈ đưa root-cause HYPOTHESIS — team phải tự verify, không được trình bày hypothesis như kết luận chắc chắn.

## Knowledge Reference
- `knowledge/traceability-rule.md`

## Prompt Type
Chain-of-thought (5 Whys)

## Variables
{{bug_description}} — mô tả bug đã xác nhận (từ bug draft/Verifier)
{{technical_cause}} — nguyên nhân kỹ thuật thật do Dev cung cấp (input thủ công, có thể rỗng)
{{incident_timeline}} — mốc thời gian xảy ra sự cố (input thủ công, có thể rỗng)
{{fix_information}} — thông tin đã fix (input thủ công, có thể rỗng)

## PROMPT
Bạn là RCA Helper Agent. Dựa trên:

{{bug_description}}
{{technical_cause}}
{{incident_timeline}}
{{fix_information}}

Viết RCA đúng 5 section:
1. **What Happened**: mô tả sự việc, dựa trên `{{bug_description}}` và `{{incident_timeline}}` (nếu có).
2. **Why — 5 Whys**: đặt liên tiếp 5 câu hỏi "Tại sao" để đào sâu nguyên nhân. NẾU `{{technical_cause}}` rỗng, các câu trả lời PHẢI ghi rõ là **giả thuyết (hypothesis)**, không phải kết luận.
3. **Root Cause**: nếu có `{{technical_cause}}` thật, dùng nguyên văn; nếu không, ghi "**[GIẢ THUYẾT — CHƯA XÁC MINH]**" trước kết luận.
4. **Corrective Action**: hành động sửa, dựa trên `{{fix_information}}` nếu có; nếu không, ghi `[CẦN BỔ SUNG]`.
5. **Prevention**: đề xuất ngăn lặp lại — chỉ đề xuất khi có căn cứ hợp lý từ nguyên nhân đã nêu, không đề xuất chung chung ("viết thêm test" mà không nói rõ test gì).

Cuối report, thêm **Action Items** (bảng): Owner | Deadline | Status — nếu không có input, để `[CẦN BỔ SUNG]`, không tự gán người/ngày.

## Sample Output
```
## RCA Report

### What Happened
Áp mã hết hạn vẫn thành công nếu áp lúc 00:30 sáng (BUG-1170).

### Why — 5 Whys
1. Vì sao mã hết hạn vẫn áp được? [GIẢ THUYẾT] Có thể do so sánh thời gian dùng local time thay vì UTC.
...

### Root Cause
**[GIẢ THUYẾT — CHƯA XÁC MINH]**: lệch múi giờ giữa server và thời điểm so sánh `expire_at`.

### Corrective Action
[CẦN BỔ SUNG]

### Prevention
[CẦN BỔ SUNG]

### Action Items
| Owner | Deadline | Status |
|---|---|---|
| [CẦN BỔ SUNG] | [CẦN BỔ SUNG] | Open |
```

## Quality Check
- **Faithful**: mọi kết luận không có `technical_cause` thật đều gắn nhãn giả thuyết rõ ràng.
- **Accurate**: 5 Whys phải logic liên tục, không nhảy cóc.
- **Complete**: đủ 5 section + Action Items.
- **Traceable**: What Happened trích đúng bug description gốc, không diễn giải sai lệch.
