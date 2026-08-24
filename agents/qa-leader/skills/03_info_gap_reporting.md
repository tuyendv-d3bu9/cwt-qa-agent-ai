# Skill: Information Completeness & Conflict Reporting

## Purpose
Dùng sau khi tài liệu đã được phân loại. Đối soát chéo giữa các tài liệu để phát hiện thông tin mâu
thuẫn hoặc thiếu hụt, rồi lập **Báo cáo thông tin cần làm rõ** gửi cho QA.

## ⚠ ĐỊNH DẠNG BẮT BUỘC — mỗi câu hỏi phải có Ô TRẢ LỜI

Đây **không phải** một bản báo cáo để đọc. Đây là một **form để người ta điền**, và
`tools/gap-answers.js` sẽ đọc lại nó bằng code (không qua LLM) để biết câu nào đã được trả lời.

Bản trước của skill này sinh ra một **bảng markdown** với cột cuối là "Câu hỏi làm rõ cho BA/DEV" —
**không có cột trả lời**. Người được hỏi không có chỗ nào để viết. Và `flow-2` thì `append` nguyên
cả file vào `task-assignment.md` dạng văn xuôi, nên: không biết câu trả lời nào ứng câu hỏi nào,
không biết đã có ai trả lời chưa, và một form để trống vẫn **chạy tiếp như bình thường**.

Vì vậy **KHÔNG dùng bảng**. Mỗi câu hỏi là một khối, đúng khuôn dưới đây, đúng thứ tự trường:

```markdown
---

### GAP-001 · <tiêu đề ngắn của vấn đề>

**Vấn đề:** <mô tả mâu thuẫn/thiếu hụt, 1-3 câu>

**Nguồn:** `<file>` vs `<file>`  (hoặc chỉ 1 file nếu là thiếu hụt)

**Câu hỏi:** <câu hỏi cụ thể, trả lời được bằng 1-2 câu>

**Trả lời:**
<!-- Viết câu trả lời của bạn ngay dưới dòng này. Để trống = chưa trả lời. -->

```

Luật về định dạng:
1. `id` phải theo dạng `GAP-<số 3 chữ số>`, đánh số liên tục từ `GAP-001`. Parser khoá theo id này.
2. Đúng 4 trường, đúng tên, đúng thứ tự: `**Vấn đề:**`, `**Nguồn:**`, `**Câu hỏi:**`, `**Trả lời:**`.
3. `**Trả lời:**` **luôn để trống** (chỉ có dòng comment hướng dẫn). **KHÔNG tự trả lời thay người dùng** — xem mục Can't của `role.md`.
4. Mỗi khối cách nhau bằng `---`.
5. Một câu hỏi = một việc cần quyết. Đừng gộp 3 vấn đề vào 1 câu rồi bắt người ta trả lời một lần.

## Prompt Type
Chain-of-thought

## Variables
- `{{classified_documents}}`: Danh sách tài liệu đã phân loại theo từng thư mục.
- `{{project_context}}`: Bối cảnh dự án và các tài liệu liên quan.

## PROMPT
Đối soát thông tin giữa các tài liệu trong `{{classified_documents}}`:

1. **Rà soát tính nhất quán** — so sánh tài liệu nghiệp vụ, thiết kế kỹ thuật và giao diện. Tìm điểm
   mâu thuẫn (ví dụ: nghiệp vụ yêu cầu 1 phương thức thanh toán, API chỉ hỗ trợ phương thức khác, UI
   lại thiết kế phương thức thứ ba).
2. **Rà soát tính đầy đủ** — phát hiện luồng thiếu thông tin (thiếu xử lý ngoại lệ, thiếu mã lỗi,
   thiếu thiết kế cho một trạng thái).
3. **Lập form theo đúng định dạng ở mục "ĐỊNH DẠNG BẮT BUỘC" phía trên.** Mỗi phát hiện là một khối
   `### GAP-nnn`, ô `**Trả lời:**` để trống.

Trả về JSON thuần (không markdown fence):
```json
{ "hasGap": true, "reportMarkdown": "<toàn bộ form theo định dạng trên>" }
```
`hasGap: false` khi thật sự không tìm thấy mâu thuẫn/thiếu hụt nào — lúc đó `reportMarkdown` là
chuỗi rỗng. **Đừng bịa câu hỏi cho có**; nhưng cũng đừng bỏ qua mâu thuẫn thật vì thấy nó nhỏ.

## Sample Input
```text
02_BA/SRS.md: "Tính năng đăng nhập hỗ trợ Email và OTP SMS."
03_DEV/API.md: "Chỉ cung cấp endpoint POST /api/v1/auth/login-email."
04_Design/UI.md: "Form nhập Email và nút Đăng nhập bằng Social (Google, Facebook)."
```

## Sample Output
```markdown
---

### GAP-001 · Mâu thuẫn phạm vi đăng nhập OTP

**Vấn đề:** Tài liệu nghiệp vụ yêu cầu đăng nhập bằng OTP SMS, nhưng API chỉ có endpoint đăng nhập bằng email.

**Nguồn:** `02_BA/SRS.md` vs `03_DEV/API.md`

**Câu hỏi:** Luồng OTP SMS có nằm trong phạm vi phiên bản này không, hay hoãn sang sau?

**Trả lời:**
<!-- Viết câu trả lời của bạn ngay dưới dòng này. Để trống = chưa trả lời. -->

---

### GAP-002 · UI có đăng nhập Social mà nghiệp vụ không đề cập

**Vấn đề:** Thiết kế giao diện có nút đăng nhập bằng Google/Facebook, nhưng tài liệu nghiệp vụ không nhắc tới.

**Nguồn:** `04_Design/UI.md` vs `02_BA/SRS.md`

**Câu hỏi:** Đăng nhập Social có thuộc phạm vi phiên bản này không?

**Trả lời:**
<!-- Viết câu trả lời của bạn ngay dưới dòng này. Để trống = chưa trả lời. -->

```

## Quality Check
- **Faithful**: Trích dẫn chính xác file gây mâu thuẫn; không suy diễn thêm mâu thuẫn không có trong tài liệu.
- **Accurate**: Phản ánh đúng bản chất mâu thuẫn hoặc thiếu hụt.
- **Complete**: Mỗi phát hiện là một khối `### GAP-nnn` riêng, đủ 4 trường, ô `**Trả lời:**` để trống.
- **Testable**: `tools/gap-answers.js` parse được file này mà không cần LLM — nếu parse ra 0 câu hỏi thì định dạng đã sai.
- **Traceable**: Trường `**Nguồn:**` chỉ rõ file, để truy lại được.
