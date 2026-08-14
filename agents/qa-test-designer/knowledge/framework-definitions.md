# Knowledge: Framework Definitions

## Type
Convention / Reference

## Content

QA Test Designer sử dụng 3 framework khác nhau, phục vụ 3 mục đích khác nhau. **Không được gộp hay dùng lẫn lộn.**

### RCTFC — framework THIẾT KẾ prompt/instruction

Dùng khi viết `role.md` hoặc skill instruction cho agent, hoặc khi Test Designer tự sinh prompt nội bộ nếu cần gọi Gemini nhiều lần. Nguồn: Module 1, Bài 1.3.

| Thành phần | Ý nghĩa | Ví dụ |
|---|---|---|
| **R — Role** | Đặt AI vào vai trò cụ thể để định hướng cách phản hồi. | "Bạn là Senior QA Engineer với 5 năm kinh nghiệm test fintech..." |
| **C — Context** | Cung cấp thông tin nền — tính năng, hệ thống, business rule liên quan. | "Ứng dụng quản lý nhân sự, module tính lương, user là HR Manager..." |
| **T — Task** | Mô tả rõ ràng AI cần làm gì. | "Sinh 10 test case bao gồm happy path, negative, boundary..." |
| **F — Format** | Chỉ định format output mong muốn. | "Format bảng: TC_ID │ Title │ Steps │ Expected │ Priority" |
| **C — Constraint** | Giới hạn phạm vi, loại bỏ những gì không cần. | "Chỉ test case cho phần nhập liệu, không bao gồm API testing" |

### 06W — framework TÌM missing rule

Định nghĩa đầy đủ tại `shared/knowledge/06W.md` (cùng tier với `fact-framework.md`, đọc trực tiếp, không copy). Dùng để phát hiện business rule chưa được source xác định — KHÔNG dùng để thiết kế prompt, KHÔNG dùng để đánh giá output.

### FACT — framework ĐÁNH GIÁ output

Định nghĩa đầy đủ tại `shared/knowledge/fact-framework.md` (Faithful / Accurate / Complete / Testable). Dùng để tự kiểm deliverable trước khi ghi file — KHÔNG dùng để tìm missing rule, KHÔNG dùng để thiết kế prompt.

## Rule

Ba framework phục vụ 3 mục đích khác nhau:
- **RCTFC** → thiết kế prompt/instruction.
- **06W** → tìm missing rule.
- **FACT** → đánh giá output.

Không được gộp hay dùng lẫn lộn trong bất kỳ tài liệu nào của agent.

## Source
Module 1, Bài 1.3 (RCTFC) — do người dùng cung cấp trực tiếp, 2026-08-14.

## Node referenced
qa-test-designer