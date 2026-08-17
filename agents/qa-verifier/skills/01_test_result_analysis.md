# Skill: Test Result Analysis

## Purpose
Dùng cho mỗi test FAILED trong `test-results.json` (đã parse bằng `tools/parse-test-results.js`, KHÔNG parse JSON thô bằng LLM). Phân loại là `SPEC_ISSUE` (lỗi ở `.spec.ts`, không phải sản phẩm) hay `BEHAVIOR_MISMATCH` (nghi ngờ hành vi sản phẩm sai).

## Knowledge Reference
- `knowledge/ui-conventions-baseline.md` — coi `ui-conventions.md` là ground truth duy nhất.
- `knowledge/verdict-mapping.md` — bảng ánh xạ tình huống → verdict.

## Prompt Type
Chain-of-thought

## Variables
{{failed_test}} — 1 kết quả test FAILED đã parse: `{ tcId, status, errorMessage }`
{{ui_conventions}} — toàn bộ nội dung `memory/working/ui-conventions.md`
{{expected_result}} — Expected Result gốc của TC_ID này từ `deliverable-test-designer.md`

## PROMPT
Bạn là QA Verifier Agent. Test sau đã FAILED:

{{failed_test}}

Expected Result gốc (từ Test Designer):

{{expected_result}}

UI conventions đã freeze (ground truth quan sát thật từ QA Automation):

{{ui_conventions}}

Phân loại lỗi này:
- **SPEC_ISSUE**: nếu error message cho thấy selector không tìm thấy / element đã đổi cấu trúc, VÀ điều đó phù hợp với những gì `ui-conventions.md` ghi nhận là UI có thể đã thay đổi kể từ lúc explore.
- **BEHAVIOR_MISMATCH**: nếu selector vẫn đúng (element tìm thấy được) nhưng giá trị/trạng thái thực tế khác với Expected Result — đây là dấu hiệu hành vi sản phẩm sai, KHÔNG phải lỗi spec.
- Nếu error message không đủ rõ để phân loại chắc chắn: trả về **UNCLEAR** — không đoán.

Giải thích ngắn gọn lý do chọn nhãn, trích dẫn cụ thể phần error message hoặc dòng trong `ui-conventions.md` làm căn cứ.

## Sample Input
failed_test = { tcId: "TC-D-004", status: "failed", errorMessage: "expect(locator).toBeVisible() failed: locator resolved to 0 elements: getByLabel('Mã giảm giá')" }
ui_conventions = "## Form nhập voucher\n<input aria-label=\"Mã giảm giá\" .../> — quan sát nhất quán ở mọi trang checkout đã explore."

## Sample Output
```
Nhãn: UNCLEAR
Lý do: error báo không tìm thấy element, nhưng ui-conventions.md ghi nhận element này vẫn tồn tại nhất quán — không rõ là do UI đổi ĐÚNG lúc chạy test này, hay do lỗi khác (timing, network). Cần chạy lại explore để xác nhận trước khi kết luận SPEC_ISSUE.
```

## Quality Check
- **Faithful**: chỉ dựa trên error message thật và `ui-conventions.md` thật, không suy đoán ngoài 2 nguồn này.
- **Accurate**: phân biệt đúng "element không tìm thấy" (khả năng SPEC_ISSUE) với "element tìm thấy nhưng giá trị sai" (khả năng BEHAVIOR_MISMATCH).
- **Complete**: mọi test FAILED đều được phân loại (kể cả UNCLEAR), không bỏ sót.
- **Testable**: nhãn UNCLEAR phải nêu rõ thiếu thông tin gì để tiếp tục điều tra.