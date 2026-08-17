# Semantic Knowledge: Testing Conventions

## Type
Convention / Registry — **tầng 1** (xem `memory/README.md`)

Đây là quy ước của **nghề kiểm thử**, đúng với mọi dự án. Trước đây file này nằm ở `memory/project/glossary.md` (đường dẫn đó nay không còn) — sai tầng, vì nội dung không phải tri thức của một dự án cụ thể và không chưng cất được từ tài liệu dự án nào.

**Không** đặt thuật ngữ nghiệp vụ của dự án vào đây. Thuật ngữ dự án thuộc **tầng 2** (`knowledge.db`, tra cứu qua `agents/runtime/knowledge.js`).

## Content

### TC_ID convention
Format: `TC-<F>-<nnn>`

- `<F>` — mã tính năng đang test, lấy từ cấu hình dự án (`feature_code` ở tầng 2). **Không viết cứng trong skill hay code.**
- `<nnn>` — số thứ tự 3 chữ số, tăng dần theo thứ tự sinh ra, **không tái sử dụng** số của test case đã xoá.

Ví dụ với `feature_code = D`: `TC-D-001`, `TC-D-002`.

### Priority levels (của TEST CASE)
Khác với Priority của BUG REPORT — hai trục độc lập, không suy từ nhau.

| Priority | Định nghĩa |
|---|---|
| **Critical** | Chặn hoặc gây sai lệch luồng chính (happy path), hoặc gây sai lệch tiền/dữ liệu khách hàng nếu fail. |
| **High** | Ảnh hưởng business rule quan trọng nhưng không chặn hoàn toàn luồng chính. |
| **Medium** | Alternate flow hoặc edge case có khả năng xảy ra thật nhưng ít ảnh hưởng tiền/dữ liệu. |
| **Low** | UI/UX nhỏ, nội dung thông báo, không ảnh hưởng logic nghiệp vụ. |

### 8 trường chuẩn của test case
`TC_ID`, `Title`, `Precondition`, `Steps`, `Test Data`, `Expected Result`, `Priority`, `Tags`.

### `role.md` vs field `role:` — KHÔNG được nhầm lẫn
- **`role.md`**: file định nghĩa vai trò của 1 node agent, đăng ký cố định tại `agents/<node>/role.md`. Đọc bởi con người, và bởi agent khi nạp `ROLE` vào `system` của `callLLM()`.
- **`role:`** (field trong `contents` array khi gọi LLM — xem `agents/runtime/llm.js`): field kỹ thuật đánh dấu ai đang nói trong lịch sử hội thoại, giá trị chỉ là `"user"` hoặc `"model"`. Không liên quan tới vai trò nghiệp vụ của agent.

Hai khái niệm này không được gộp hay dùng lẫn lộn trong bất kỳ tài liệu nào của agent.

## Source
Quy ước do node thiết kế test khởi tạo, xác nhận cùng người dùng 2026-08-14. Chuyển từ `memory/project/glossary.md` (đường dẫn cũ, nay không còn) sang tầng 1 và bỏ phần dính tên tính năng cụ thể vào 2026-08-17.

## Consumed by
Node thiết kế test (chính), node báo cáo (cross-reference để phân biệt 2 trục Priority).
