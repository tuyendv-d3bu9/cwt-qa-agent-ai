# Knowledge: Traceability Rule

## Type
Convention / Rule

## Content

Mọi field trong bug report và QA Summary Report phải trace được về 1 trong các nguồn thật sau:
- TC_ID + nhãn (BEHAVIOR_MISMATCH/UNCLEAR) trong `.qa-run/deliverables/deliverable-verifier.md`.
- Steps/Test Data/Expected Result gốc trong `.qa-run/deliverables/deliverable-test-designer.md`.
- `errorMessage` thật từ `test-results.json` (đã đi qua Verifier).
- File evidence thật trong `evidence/` (chỉ trích dẫn đường dẫn).

### Rule cứng
- KHÔNG suy diễn hay điền placeholder "cho có nội dung" khi thiếu thông tin.
- Khi thiếu: ghi rõ `[CẦN BỔ SUNG]` kèm lý do ngắn (ví dụ: `[CẦN BỔ SUNG: deliverable-verifier.md không có errorMessage cho TC-D-004]`), KHÔNG để trống im lặng và KHÔNG bịa giá trị nghe hợp lý.
- Severity/Priority chỉ được gán khi có căn cứ rõ (ví dụ: sai lệch liên quan trực tiếp tới tiền/đơn hàng → có thể suy Severity Major/Critical theo bản chất field, tham chiếu cách lập luận rủi ro đã dùng ở `agents/qa-test-designer/knowledge/boundary-coverage-conventions.md`). Nếu không đủ căn cứ, dùng `[CẦN BỔ SUNG]` thay vì đoán.

## Source
Thiết kế QA Reporter.

## Node referenced
qa-reporter