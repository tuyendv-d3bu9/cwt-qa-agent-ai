# Knowledge: FACT Framework — QA Leader

## Type
Convention / Business Rule

## Content

### 1. FACT Self-Check — tự kiểm trước khi ghi file

> Xem định nghĩa đầy đủ tại: `memory/semantic/fact-framework.md`

Agent **phải** tự kiểm theo 4 tiêu chí FACT (Faithful, Accurate, Complete, Testable) và quy tắc phân loại vi phạm trước khi ghi output vào file deliverable.

---

### 2. Verdict PASS / FIX / ASK

| Verdict | Điều kiện | Hành động |
|---|---|---|
| **PASS** | Đạt cả 4 tiêu chí FACT | Chuyển sang bước tiếp theo. |
| **FIX** | Vi phạm bất kỳ tiêu chí nào do lỗi của Agent | Gửi lại kèm nhận xét cụ thể, chỉ rõ điểm cần sửa. KHÔNG lặp nguyên câu hỏi cũ. |
| **ASK** | Bế tắc do thiếu/mâu thuẫn thông tin từ nguồn (BA/DEV/Design), không phải lỗi Agent | Dừng, tạo report hỏi người dùng thật. KHÔNG tự đoán thay. |

---

### 3. Giới hạn vòng lặp FIX

- `MAX_ROUNDS = 3` cho vòng FIX giữa Leader và 1 Agent, cho cùng 1 deliverable.
- Vượt quá 3 vòng vẫn chưa PASS → tự động chuyển thành **ASK** (không lặp vô hạn) — báo người dùng cần can thiệp trực tiếp, không giao tiếp qua Agent nữa.

---

### 4. Ưu tiên hóa gap khi có nhiều gap cùng lúc (skill 03)

Tái dùng ma trận **Likelihood × Impact** để xếp hạng câu hỏi cần hỏi người dùng trước:
- Gap liên quan luồng chính (happy path), ảnh hưởng tiền/dữ liệu khách hàng → hỏi trước tiên.
- Gap liên quan chi tiết UI nhỏ, ít ảnh hưởng nghiệp vụ → có thể để cuối form, hoặc gộp thành 1 câu hỏi chung.
- Không hỏi quá 5 câu 1 lần trong 1 report — nếu nhiều hơn, nhóm theo module/nhóm tài liệu để người dùng trả lời theo đợt, tránh form quá dài không ai trả lời hết.

---

### 5. Quy ước file trao đổi với QA Analyst

- Leader **chỉ ghi** `memory/working/task-assignment.md`, **chỉ đọc** `memory/working/deliverable-analyst.md`.
- Analyst **chỉ đọc** `memory/working/task-assignment.md`, **chỉ ghi** `memory/working/deliverable-analyst.md`.
- Không agent nào được ghi đè file thuộc quyền ghi của agent kia — vi phạm ranh giới này là lỗi kiến trúc, không phải lỗi nghiệp vụ.
- Vòng FIX không tạo file mới (`deliverable_v2.md`...) — ghi đè lại đúng 1 file, lịch sử từng round do skill 06 (`workflow_progress_tracking`) ghi log riêng.

## Source
Thiết kế QA Leader, thống nhất Session 10.

## Node referenced
qa-leader