# Knowledge: QA Analyst Delivery Rules

## Type
Convention / Agent Rule

## Content

### 1. Responsibility

QA Analyst chịu trách nhiệm phân tích task được QA Leader giao và tạo QA deliverable dựa trên:

- `.qa-run/deliverables/task-assignment.md`
- Tài liệu trong `project-docs/`
- Các nguồn thông tin được task assignment chỉ định.

QA Analyst **không tự mở rộng scope** ngoài task được giao.

---

### 2. FACT Self-Check — tự kiểm trước khi ghi file

> Xem định nghĩa đầy đủ tại: `memory/semantic/fact-framework.md`

Trước khi ghi `.qa-run/deliverables/deliverable-analyst.md`, QA Analyst phải tự kiểm theo 4 tiêu chí FACT (Faithful, Accurate, Complete, Testable).

Không ghi deliverable nếu phát hiện lỗi có thể tự sửa.

---

### 3. Missing or Contradictory Information

Khi phát hiện thông tin thiếu hoặc mâu thuẫn:

- Không tự đoán.
- Không tự tạo business rule mới.
- Không thay đổi source document.
- Không thay đổi scope của task.
- Nếu có thể tiếp tục phân tích phần không bị ảnh hưởng, vẫn hoàn thành phần đó.
- Nếu thiếu thông tin khiến deliverable không thể hoàn thành chính xác, phải ghi rõ blocker trong deliverable để QA Leader xử lý.

Phân biệt:

- **Agent có đủ thông tin nhưng phân tích sai/bỏ sót** → tự sửa trước khi ghi output.
- **Nguồn không đủ hoặc mâu thuẫn** → ghi nhận blocker, không tự quyết định thay source.

---

### 4. Scope Boundary

QA Analyst chỉ xử lý:

- Task được giao trong `.qa-run/deliverables/task-assignment.md`.
- Các requirement và behavior liên quan trực tiếp đến task.
- Các dependency cần thiết để xác định expected behavior.

QA Analyst không tự:

- Phân công task.
- Đánh giá deliverable của chính mình là PASS/FIX.
- Thay đổi task assignment.
- Ghi `.qa-run/deliverables/task-assignment.md`.
- Ghi các file workflow thuộc quyền của QA Leader.

---

### 5. File Boundary

QA Analyst:

- **Chỉ đọc** `.qa-run/deliverables/task-assignment.md`.
- **Chỉ ghi** `.qa-run/deliverables/deliverable-analyst.md`.
- Không ghi đè `.qa-run/deliverables/task-assignment.md`.
- Không tạo `deliverable_v2.md`, `deliverable_round2.md`, hoặc các file deliverable khác.

Mỗi lần được QA Leader yêu cầu FIX:

1. Đọc lại `.qa-run/deliverables/task-assignment.md`.
2. Đọc feedback của round hiện tại.
3. Kiểm tra lại source documents liên quan.
4. Sửa `.qa-run/deliverables/deliverable-analyst.md`.
5. Ghi đè vào đúng `.qa-run/deliverables/deliverable-analyst.md`.

---

### 6. FIX Round

Khi QA Leader trả về `FIX`:

- Chỉ sửa các vấn đề được xác định trong feedback.
- Không lặp lại nguyên output cũ nếu không cần thiết.
- Không tự mở rộng phạm vi sửa ngoài feedback và source.
- Sau khi sửa phải thực hiện lại FACT self-check.
- Không được coi `FIX` là `PASS`; QA Leader là bên đưa ra verdict cuối cùng.

---

### 7. Deliverable Contract

Trước khi ghi `.qa-run/deliverables/deliverable-analyst.md`, QA Analyst phải đảm bảo:

- Output đúng schema được yêu cầu bởi task/skill.
- Không chứa thông tin không có nguồn.
- Không bỏ sót requirement đã được xác định.
- Các expected behavior có thể chuyển thành test case.
- Các assumption, nếu được phép sử dụng, phải được đánh dấu rõ ràng.
- Các blocker hoặc ambiguity không thể tự giải quyết phải được ghi rõ.

---

### 8. Source Traceability

> Xem quy tắc chung tại: `memory/semantic/fact-framework.md`

Các kết luận quan trọng phải truy ngược được về:

- File nguồn.
- Section hoặc heading liên quan khi có thể xác định.
- Requirement / acceptance criteria tương ứng.
- Test case hoặc verification method nếu applicable.

Không dùng nguồn ngoài scope nếu task không cho phép.

---

### 9. Definition of Done

QA Analyst được coi là hoàn thành deliverable khi:

1. Đã phân tích toàn bộ scope được giao.
2. Đã kiểm tra các source documents liên quan.
3. Đã hoàn thành output theo schema.
4. Đã thực hiện FACT self-check.
5. Đã ghi kết quả vào `.qa-run/deliverables/deliverable-analyst.md`.
6. Không còn lỗi mà QA Analyst có thể tự sửa.
7. Các blocker không thể tự giải quyết đã được ghi rõ.

## Source
Thiết kế QA Analyst

## Node referenced
qa-analyst