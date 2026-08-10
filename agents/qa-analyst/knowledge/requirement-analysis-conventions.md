# Knowledge: Requirement Analysis Conventions

## Type
Convention / Registry

## Content
Tổng hợp lại các khung đã dạy ở Module 2, dùng làm tham chiếu chung cho cả 3 skill phân tích của QA Analyst — tránh mỗi skill tự định nghĩa lại rời rạc.

### 1. Requirement Summary — 7 phần chuẩn (Module 2, Bài 2.1)
1. FEATURE OVERVIEW — 1-2 câu tóm tắt mục đích tính năng.
2. ACTOR & USER ROLE — ai dùng tính năng này.
3. BUSINESS RULES — toàn bộ rule được đề cập (numbered list).
4. HAPPY PATH — luồng chính, step-by-step.
5. ALTERNATE FLOWS — luồng phụ, exception.
6. OUT OF SCOPE — những gì tài liệu không đề cập.
7. OPEN QUESTIONS — điểm mơ hồ cần hỏi BA/PO, **bao gồm cả trường hợp 2 nguồn tài liệu mâu thuẫn nhau**.

### 2. Missing Business Rule — Framework 06W (Module 2, Bài 2.2)
| Câu hỏi | Tìm loại missing rule gì |
| --- | --- |
| What if... (input lạ) | Input bất thường chưa được xử lý |
| What if... (state lạ) | System state chưa được xử lý |
| What if... (data lạ) | Edge case dữ liệu (0, âm, null, trùng lặp) |
| What when... (timing) | Vấn đề thời gian/đồng thời |
| Who else... (actor) | Actor khác ngoài user chính (admin, hệ thống ngoài, scheduled job) |
| What happens after... (post-condition) | State hệ thống thay đổi sau action |

### 3. Viewpoint Library — 8 viewpoint cốt lõi (Module 2, Bài 2.3)
Happy Path · Negative · Boundary · Security · UX/Usability · Performance · Accessibility · Integration.
QA Analyst chỉ cần chọn **4 viewpoint phù hợp nhất** với task được giao (không bắt buộc dùng đủ cả 8) — ưu tiên theo Business Impact × Likelihood × Detectability đã học.

### 4. Nguyên tắc chống hallucination (nhắc lại từ shared/knowledge/fact-framework.md)
- Mọi thông tin không có trong tài liệu gốc nhưng cần giả định để tiếp tục → gắn tag `[GIẢ ĐỊNH]`.
- Phát hiện 2 nguồn mâu thuẫn nhau → KHÔNG tự chọn nguồn nào đúng, đưa cả 2 vào mục 7 (OPEN QUESTIONS) của Requirement Summary.
- Trước khi ghi vào `deliverable.md`, tự chấm lại theo FACT (Faithful/Accurate/Complete/Traceable) — xem skill `04_revise_on_feedback.md` để biết cách xử lý khi Leader trả FIX.

## Source
Module 2 — AI Analyst: Requirement Intelligence (Bài 2.1, 2.2, 2.3).

## Node referenced
qa-analyst
