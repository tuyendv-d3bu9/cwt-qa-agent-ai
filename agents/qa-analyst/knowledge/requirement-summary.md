# Knowledge: Requirement Summary

## Type
Analysis Convention

## Content

Requirement Summary gồm 7 phần chuẩn:

1. **FEATURE OVERVIEW**
   Mục đích và phạm vi chính của feature.

2. **ACTOR & USER ROLE**
   Các actor/user role liên quan.

3. **BUSINESS RULES**
   Các business rule được xác định từ source, đánh số rõ ràng.

4. **HAPPY PATH**
   Luồng chính từ đầu đến cuối.

5. **ALTERNATE FLOWS**
   Luồng phụ, exception và các nhánh khác happy path.

6. **OUT OF SCOPE**
   Những nội dung không thuộc scope hoặc source không cung cấp đủ thông tin để kết luận.

7. **OPEN QUESTIONS**
   Các điểm mơ hồ, thiếu thông tin hoặc mâu thuẫn giữa các source cần BA/PO xác nhận.

## Rule

- Không tự biến assumption thành business rule.
- Nếu hai source mâu thuẫn, giữ nguyên thông tin từ cả hai source và đưa vào `OPEN QUESTIONS`.
- Không tạo câu hỏi chỉ để đạt một số lượng tối thiểu.

## Source
Module 2 — AI Analyst: Requirement Intelligence