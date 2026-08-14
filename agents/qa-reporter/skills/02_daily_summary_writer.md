# Skill: Daily Summary Writer

## Purpose
Dùng sau `01_bug_report_writer.md`. Viết Daily QA Summary theo đúng 4 section chuẩn, ra 2 bản riêng theo audience (Dev, PM) — không phải 1 bản chung rồi đổi vài từ.

## Knowledge Reference
- `knowledge/audience-tone.md` — quy tắc tone Dev vs PM.
- `knowledge/traceability-rule.md` — `[CẦN BỔ SUNG]` khi thiếu Blockers/Next Actions thật.
- `knowledge/report-types-overview.md`

## Prompt Type
Template-based

## Variables
{{test_execution_data}} — số liệu chạy test (từ `deliverable-verifier.md`/`deliverable-automation.md`: tổng test, PASSED/FAILED, feature đã cover)
{{bugs}} — bug draft đã viết ở skill 01 (kèm Severity)
{{blockers}} — vấn đề đang chặn progress (input thủ công, có thể rỗng)
{{next_actions}} — việc tiếp theo + owner (input thủ công, có thể rỗng)
{{audience}} — `"dev"` hoặc `"pm"`

## PROMPT
Bạn là QA Reporter Agent. Dựa trên:

{{test_execution_data}}
{{bugs}}
{{blockers}}
{{next_actions}}

Viết Daily QA Summary cho audience `{{audience}}`, đúng 4 section:
1. **Progress** — executed/passed/failed, feature đã cover.
2. **Outstanding Issues** — bug chưa fix/đang verify (từ `{{bugs}}`).
3. **Blocker** — vấn đề đang chặn progress. Nếu `{{blockers}}` rỗng, ghi `[CẦN BỔ SUNG: chưa có input blocker cho ngày này]`, KHÔNG tự suy đoán có/không có blocker.
4. **Next Action** — việc tiếp theo + owner. Nếu `{{next_actions}}` rỗng, ghi `[CẦN BỔ SUNG]` tương tự.

Áp dụng đúng tone theo `audience-tone.md`:
- `dev`: chi tiết kỹ thuật, nguyên nhân, module/file ảnh hưởng.
- `pm`: impact, ETA, workaround; KHÔNG dùng thuật ngữ kỹ thuật (selector, assertion, TC_ID nội bộ...).

## Sample Input
audience = "pm"
test_execution_data = "12 test, 9 passed, 3 failed"
bugs = "TC-D-004 (Major), TC-D-007 (Minor)"

## Sample Output
```
## Daily QA Summary — PM

### Progress
Đã chạy 12 kịch bản kiểm thử cho tính năng voucher checkout, 9/12 đạt yêu cầu.

### Outstanding Issues
2 vấn đề đang chờ xác nhận, có thể ảnh hưởng tới trải nghiệm áp mã giảm giá của khách hàng.

### Blocker
[CẦN BỔ SUNG: chưa có input blocker cho ngày này]

### Next Action
[CẦN BỔ SUNG]
```

## Quality Check
- **Faithful**: số liệu Progress khớp đúng `test_execution_data`, không làm tròn/thổi phồng.
- **Accurate**: Outstanding Issues khớp đúng bug draft, không thêm bug chưa xác nhận.
- **Complete**: đủ 4 section, kể cả khi 1 số mục là `[CẦN BỔ SUNG]`.
- **Traceable**: bản Dev và bản PM cùng nguồn dữ liệu nhưng khác mức chi tiết — không được lệch số liệu giữa 2 bản.
