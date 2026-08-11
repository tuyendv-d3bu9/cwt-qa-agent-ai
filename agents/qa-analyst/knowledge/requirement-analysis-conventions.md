# Knowledge: Requirement Analysis Conventions

## Type
Convention / Registry

## Content
Tổng hợp lại các thông tin, dùng làm tham chiếu chung cho cả 3 skill phân tích của QA Analyst — tránh mỗi skill tự định nghĩa lại rời rạc.

### 1. Requirement Summary — 7 phần chuẩn
Xem trong `knowledge/requirement-summary.md`

### 2. Missing Business Rule — Framework 06W
Xem trong `knowledge/06W.md`

### 3. Viewpoint Library — 8 viewpoint cốt lõi
Xem trong `knowledge/viewpoint-library.md`

### 4. Nguyên tắc chống hallucination (nhắc lại từ shared/knowledge/fact-framework.md)
- Mọi thông tin không có trong tài liệu gốc nhưng cần giả định để tiếp tục → gắn tag `[GIẢ ĐỊNH]`.
- Phát hiện 2 nguồn mâu thuẫn nhau → KHÔNG tự chọn nguồn nào đúng, đưa cả 2 vào mục 7 (OPEN QUESTIONS) của Requirement Summary.
- Trước khi ghi vào `deliverable.md`, tự chấm lại theo FACT (Faithful/Accurate/Complete/Traceable) — xem skill `04_revise_on_feedback.md` để biết cách xử lý khi Leader trả FIX.

## Source
Module 2 — AI Analyst: Requirement Intelligence

## Node referenced
qa-analyst
