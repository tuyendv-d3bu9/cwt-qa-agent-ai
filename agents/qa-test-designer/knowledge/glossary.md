# Knowledge: Glossary

## Type
Convention / Registry

## Content

### TC_ID convention
Format: `TC-D-<nnn>` — `D` = Function D (voucher/discount checkout), `<nnn>` = số thứ tự 3 chữ số, tăng dần theo thứ tự sinh ra, không tái sử dụng số đã xoá. Ví dụ: `TC-D-001`, `TC-D-002`.

### Priority levels
| Priority | Định nghĩa |
|---|---|
| **Critical** | Chặn hoặc gây sai lệch luồng chính (happy path), hoặc gây sai lệch tiền/dữ liệu khách hàng nếu fail. |
| **High** | Ảnh hưởng business rule quan trọng (điều kiện áp mã, cách tính giảm giá) nhưng không chặn hoàn toàn luồng chính. |
| **Medium** | Alternate flow hoặc edge case có khả năng xảy ra thật nhưng ít ảnh hưởng tiền/dữ liệu. |
| **Low** | UI/UX nhỏ, nội dung thông báo, không ảnh hưởng logic nghiệp vụ. |

### 8 trường chuẩn của test case
`TC_ID`, `Title`, `Precondition`, `Steps`, `Test Data`, `Expected Result`, `Priority`, `Tags`.

### `role.md` vs field `role:` — KHÔNG được nhầm lẫn
- **`role.md`**: file định nghĩa vai trò của 1 node agent, đăng ký cố định tại `agents/<node>/role.md`. Đọc bởi con người, và bởi agent khi nạp `ROLE` vào `system` của `callLLM()`.
- **`role:`** (field trong `contents` array khi gọi Gemini API — xem `agents/runtime/llm.js`): field kỹ thuật đánh dấu ai đang nói trong lịch sử hội thoại, giá trị chỉ là `"user"` hoặc `"model"`. Không liên quan đến vai trò nghiệp vụ của agent.

Hai khái niệm này không được gộp hay dùng lẫn lộn trong bất kỳ tài liệu nào của agent.

## Source
Quy ước Test Designer — TC_ID convention và Priority levels do agent này khởi tạo lần đầu (chưa có source trước đó trong repo để tham chiếu), xác nhận cùng người dùng 2026-08-14. Mục "8 trường chuẩn" và phân biệt `role.md` vs `role:` lấy từ nội dung đã thống nhất trong buổi thiết kế.

## Node referenced
qa-test-designer