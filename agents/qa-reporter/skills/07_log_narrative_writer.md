# Skill: Log & Evidence Narrative Writer

## Purpose
Tổng hợp kết quả chạy test thành 1 narrative ngắn (≤300 từ). TÁI DÙNG dữ liệu đã parse sẵn trong `memory/working/deliverable-verifier.md` (do `qa-verifier` tạo ra) — KHÔNG tự parse lại `test-results.json` thô, tránh trùng logic với `agents/qa-verifier/tools/parse-test-results.js`.

## Knowledge Reference
- `knowledge/traceability-rule.md`

## Prompt Type
Chain-of-thought

## Variables
{{verifier_deliverable}} — toàn bộ `memory/working/deliverable-verifier.md` (đã có bảng TC_ID/status/nhãn)

## PROMPT
Bạn là Log Summarizer Agent. Dựa trên kết quả đã phân loại sẵn:

{{verifier_deliverable}}

Viết QA Narrative, đúng 6 phần, TỔNG CỘNG KHÔNG QUÁ 300 TỪ:
1. Total tests: Passed / Failed / Skipped.
2. Failed tests + lý do (ngắn gọn, lấy nguyên từ nhãn/ghi chú của Verifier).
3. Error patterns: nếu nhiều lỗi cùng nguyên nhân (ví dụ nhiều SPEC_ISSUE do cùng 1 selector), gộp lại nêu pattern — không liệt kê riêng lẻ nếu thấy lặp lại rõ.
4. Recommendation: ngắn gọn, actionable.
5. Evidence index: liệt kê đường dẫn evidence liên quan (nếu `verifier_deliverable` có nhắc tới).
6. Top issues: 1-3 vấn đề đáng chú ý nhất, ưu tiên theo Severity/Impact nếu xác định được.

## Sample Output
```
## QA Narrative

Tổng 12 test: 9 passed, 3 failed, 0 skipped. TC-D-004 và TC-D-007 thất bại do nghi ngờ sai lệch hành vi (BEHAVIOR_MISMATCH/UNCLEAR), TC-D-009 thất bại do spec lỗi thời (SPEC_ISSUE). Không phát hiện pattern lặp lại giữa các lỗi. Đề xuất: ưu tiên xác nhận TC-D-004 trước (liên quan tính tiền). Evidence: chưa có screenshot đính kèm trong lần chạy này. Top issue: TC-D-004 (nghi ngờ ảnh hưởng số tiền checkout).
```

## Quality Check
- **Faithful**: không tự đọc lại `test-results.json` — chỉ dùng dữ liệu đã có trong `deliverable-verifier.md`.
- **Accurate**: số liệu Total/Failed khớp đúng bảng nguồn.
- **Complete**: đủ 6 phần dù ngắn gọn.
- **Testable**: dưới 300 từ — nếu vượt, phải cắt bớt chi tiết ở phần 3/5, không cắt phần 1/2/6.
