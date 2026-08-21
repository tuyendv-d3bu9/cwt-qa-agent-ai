# Skill: Bug Report Writer

## Purpose
Dùng cho mỗi TC_ID nhãn `BEHAVIOR_MISMATCH` hoặc `UNCLEAR` trong `.qa-run/deliverables/deliverable-verifier.md`. Viết bug report DRAFT theo 7 trường chuẩn — đây là draft dựa trên nghi ngờ có căn cứ, chưa phải kết luận cuối cùng đã qua xác nhận con người.

## Knowledge Reference
- `knowledge/bug-report-schema.md` — 7 trường, phân biệt Severity/Priority, rule "luôn review trước khi dùng".
- `knowledge/traceability-rule.md` — dùng `[CẦN BỔ SUNG]` khi thiếu evidence, không bịa.
- `knowledge/output-conventions.md` — sau khi viết xong 1 bug draft, `index.js` gom theo Severity vào đúng `.qa-run/reports/bug-reports/{critical,major,minor}.md` (skill này chỉ viết 1 draft/lần, KHÔNG tự quyết định file đích).

## Prompt Type
Template-based

## Variables
{{tc_id}} — TC_ID đang xử lý
{{verifier_classification}} — nhãn + ghi chú của Verifier cho TC_ID này (từ `deliverable-verifier.md`)
{{test_case}}
{{evidence_image}} — đường dẫn ảnh chụp màn hình sau khi chạy (đã được `index.js` kiểm tra tồn tại thật), hoặc `[không có ảnh evidence]` — Steps/Test Data/Expected Result gốc của TC_ID này (từ `deliverable-test-designer.md`)

## PROMPT
Bạn là QA Reporter Agent. Verifier đã phân loại:

{{verifier_classification}}

Test case gốc:

{{test_case}}

Viết bug report DRAFT cho `{{tc_id}}` theo đúng 7 trường: `Title | Environment | Steps to Reproduce | Actual Result | Expected Result | Severity | Priority`.
- `Steps to Reproduce`: lấy từ Steps của test case gốc, không viết lại khác đi.
- `Actual Result`: lấy từ ghi chú/errorMessage của Verifier — nếu không đủ chi tiết, ghi `[CẦN BỔ SUNG: ...]`.
- `Expected Result`: lấy nguyên văn từ test case gốc.
- `Severity`/`Priority`: chỉ gán khi có căn cứ rõ theo `bug-report-schema.md`; nếu không chắc, ghi `[CẦN BỔ SUNG]`.
- Ghi rõ đây là DRAFT, kèm dòng: "Trạng thái: DRAFT — chờ xác nhận con người trước khi coi là bug chính thức."

## Sample Input
tc_id = "TC-D-004"
verifier_classification = "UNCLEAR — không tìm thấy element nhưng ui-conventions.md ghi nhận vẫn tồn tại."
test_case = "Steps: 1. Vào checkout 2. Nhập mã SALE20 3. Bấm Áp dụng | Expected: Áp mã thành công"

## Sample Output
```
### Bug Draft — TC-D-004
Trạng thái: DRAFT — chờ xác nhận con người trước khi coi là bug chính thức.

| Trường | Nội dung |
|---|---|
| Title | [CẦN BỔ SUNG: chưa đủ căn cứ đặt tên lỗi cụ thể] |
| Environment | <URL môi trường test từ cấu hình tầng 2>, Chromium qua MCP Playwright (headless) |
| Evidence | `evidence/TC-D-004-after.jpg` |
| Steps to Reproduce | 1. Vào checkout 2. Nhập mã SALE20 3. Bấm Áp dụng |
| Actual Result | Không tìm thấy ô nhập mã lúc chạy test, dù ui-conventions.md ghi nhận ô này tồn tại nhất quán — [CẦN BỔ SUNG: cần chạy lại để xác nhận có phải lỗi tạm thời] |
| Expected Result | Áp mã thành công |
| Severity | [CẦN BỔ SUNG] |
| Priority | [CẦN BỔ SUNG] |
```

## Quality Check
- **Faithful**: mọi nội dung lấy từ `verifier_classification`/`test_case` thật, không suy diễn thêm.
- **Accurate**: Steps/Expected Result copy đúng nguyên văn từ test case gốc, không diễn giải lại.
- **Complete**: đủ 7 trường (kể cả khi 1 số trường là `[CẦN BỔ SUNG]`).
- **Traceable**: mỗi trường không rõ ràng phải nêu lý do ngắn trong `[CẦN BỔ SUNG: ...]`, không để trống im lặng.