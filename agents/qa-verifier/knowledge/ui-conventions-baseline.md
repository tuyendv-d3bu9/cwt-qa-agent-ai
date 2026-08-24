# Knowledge: UI Conventions Baseline

## Type
Convention / Rule

## Content

`.qa-run/deliverables/ui-conventions.md` (do QA Automation ghi sau khi explore DOM thật — xem `agents/qa-automation/skills/03_ui_conventions_writer.md`) là **ground truth duy nhất** để Verifier so sánh khi phân loại 1 test FAILED là do UI thật đã đổi (SPEC_ISSUE) hay do hành vi sản phẩm sai (BEHAVIOR_MISMATCH).

### Rule cứng
- Nếu `.qa-run/deliverables/ui-conventions.md` **chưa tồn tại** khi Verifier chạy: KHÔNG tự generate, KHÔNG tự suy đoán pattern UI để "có gì đó mà so sánh". Trả về `{ status: "error", error: "ui-conventions.md chưa tồn tại — QA Automation phải chạy trước." }`, không tiếp tục ra verdict.
- Không tự chỉnh sửa hoặc "cập nhật" `.qa-run/deliverables/ui-conventions.md` — file này chỉ do QA Automation ghi. Nếu phát hiện `ui-conventions.md` có vẻ lỗi thời so với `test-results.json`, đó chính là dấu hiệu để phân loại SPEC_ISSUE, không phải lý do để Verifier tự sửa file.

## Source
Thiết kế QA Verifier, dựa trên `agents/qa-automation/role.md`.

## Node referenced
qa-verifier