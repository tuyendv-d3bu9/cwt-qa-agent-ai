# Knowledge: Task Management Conventions

## Type
Convention / Business Rule

## Content

### 1. Verdict PASS / FIX / ASK
- **PASS**: đạt cả 4 tiêu chí FACT (xem `fact-framework.md`) → chuyển bước tiếp theo.
- **FIX**: lỗi do chính QA Agent (phân tích thiếu/thừa/sai) → gửi lại kèm nhận xét cụ thể, KHÔNG lặp lại nguyên câu hỏi cũ, phải chỉ rõ điểm cần sửa.
- **ASK**: bế tắc do thiếu/mâu thuẫn thông tin từ nguồn (BA/DEV/Design), không phải lỗi Agent → dừng, tạo report hỏi người dùng thật, KHÔNG tự đoán thay.

### 2. Giới hạn vòng lặp
- `MAX_ROUNDS = 3` cho vòng FIX giữa Leader và 1 Agent, cho cùng 1 deliverable.
- Vượt quá 3 vòng vẫn chưa PASS → tự động chuyển thành **ASK** (không lặp vô hạn) — báo người dùng cần can thiệp trực tiếp, không giao tiếp qua Agent nữa.

### 3. Ưu tiên hóa gap khi có nhiều gap cùng lúc (skill 03)
Tái dùng ma trận **Likelihood × Impact** đã học Module 3 Bài 3.1 để xếp hạng câu hỏi cần hỏi người dùng trước:
- Gap liên quan luồng chính (happy path), ảnh hưởng tiền/dữ liệu khách hàng → hỏi trước tiên.
- Gap liên quan chi tiết UI nhỏ, ít ảnh hưởng nghiệp vụ → có thể để cuối form, hoặc gộp thành 1 câu hỏi chung.
- Không hỏi quá 5 câu 1 lần trong 1 report — nếu nhiều hơn, nhóm theo module/nhóm tài liệu để người dùng trả lời theo đợt, tránh form quá dài không ai trả lời hết.

### 4. Quy ước file trao đổi với QA Analyst
- Leader **chỉ ghi** `.state/task-assignment.md`, **chỉ đọc** `.state/deliverable.md`.
- Analyst **chỉ đọc** `.state/task-assignment.md`, **chỉ ghi** `.state/deliverable.md`.
- Không agent nào được ghi đè file thuộc quyền ghi của agent kia — vi phạm ranh giới này là lỗi kiến trúc, không phải lỗi nghiệp vụ.
- Vòng FIX không tạo file mới (`deliverable_v2.md`...) — ghi đè lại đúng 1 file, lịch sử từng round do skill 06 (`workflow_progress_tracking`) ghi log riêng.

## Source
Thiết kế QA Leader, thống nhất Session 10.

## Node referenced
qa-leader