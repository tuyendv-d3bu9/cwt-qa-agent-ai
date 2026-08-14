# Knowledge: Verdict Mapping (PASS / FIX / ASK cho Automation Result)

## Type
Convention / Registry

## Content

QA Verifier KHÔNG định nghĩa lại PASS/FIX/ASK — tái dùng nguyên nghĩa gốc từ `agents/qa-leader/knowledge/task-management-conventions.md` mục 1 (đọc trực tiếp, không copy):
- **PASS**: đạt tiêu chí → chuyển bước tiếp theo.
- **FIX**: lỗi do chính QA Agent (ở đây là artifact `.spec.ts` do QA Automation sinh ra) — gửi lại để tự sửa, KHÔNG phải lỗi sản phẩm thật.
- **ASK**: bế tắc do thiếu/mâu thuẫn thông tin, không tự quyết định thay người dùng được.

### Áp dụng cụ thể cho ngữ cảnh automation result

| Tình huống quan sát được | Verdict | Lý do |
|---|---|---|
| Test PASSED, kết quả khớp `ui-conventions.md` và Expected Result | PASS | Không có vấn đề. |
| Test FAILED vì selector không tìm thấy, nhưng `ui-conventions.md` cho thấy UI đã đổi cấu trúc so với lúc explore | FIX | Lỗi ở spec (đã lỗi thời), không phải lỗi sản phẩm — gửi lại QA Automation để explore lại + sinh spec mới. |
| Test FAILED vì assertion sai giá trị (ví dụ số tiền tính sai), DOM/selector vẫn khớp `ui-conventions.md` bình thường | ASK | Có dấu hiệu hành vi sản phẩm sai khác Expected Result — Verifier KHÔNG được tự kết luận đây là bug thật, phải dừng và để người xác nhận trước khi QA Reporter viết bug report chính thức. |
| Test FAILED nhưng error message không đủ rõ để phân loại SPEC_ISSUE hay BEHAVIOR_MISMATCH | ASK | Thiếu thông tin để tự quyết định — không đoán. |

### Rule
- Một lần chạy có thể có NHIỀU test — nếu ít nhất 1 test rơi vào ASK, verdict TỔNG THỂ của lần chạy là ASK (ưu tiên cao nhất, không bị PASS/FIX của các test khác che lấp).
- Nếu không có ASK nào nhưng có ít nhất 1 FIX, verdict tổng thể là FIX.
- Chỉ khi TẤT CẢ test đều PASS, verdict tổng thể mới là PASS.

## Source
`agents/qa-leader/knowledge/task-management-conventions.md` mục 1.

## Node referenced
qa-verifier (đọc cross-node, không copy, từ qa-leader)