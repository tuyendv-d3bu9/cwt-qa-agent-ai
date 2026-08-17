# Knowledge: Jira Integration

## Type
Convention / Architecture

## Content

### Vị trí kiến trúc
- **Client Jira chung** (`agents/runtime/jira-client.js`): kết nối + gọi Jira Cloud REST API v3 (Basic Auth: email + API token). Đặt ở `runtime/` (không phải riêng trong `qa-reporter/`) vì đây là hạ tầng dùng chung — bất kỳ agent nào sau này cũng import lại được, giống cách `mcp-client.js` dùng chung cho `qa-automation`.
- **Credentials**: `.env` — `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` (xem `.env.example`). KHÔNG hardcode, KHÔNG đặt trong `agents/qa-reporter/`.
- **Logic quyết định khi nào gọi, map field nào, bắt buộc xác nhận**: nằm trong `qa-reporter/` — vì đây là node DUY NHẤT được phép gọi Jira (đã chốt với người dùng: mở rộng bên trong `qa-reporter`, không tách agent riêng).
- **Field mapping** (`tools/jira-mapper.js`): deterministic, KHÔNG dùng LLM — chỉ trích field đã có sẵn trong bug draft/test case (cùng triết lý với `traceability-check.js`, `sprint-metrics-calculator.js`).
- **Nghiên cứu package MCP Jira** (2026-08-17): không tìm thấy package `@modelcontextprotocol` Jira nào đủ tin cậy/đã verify trong môi trường build này — dùng thẳng Jira Cloud REST API v3 qua `fetch` có sẵn (Node ≥18, không thêm dependency mới), tránh phụ thuộc 1 package chưa kiểm chứng.

### Nguyên tắc bắt buộc (đã chốt với người dùng trước khi build)
- **Xác nhận tường minh MỖI LẦN gọi** — nghiêm ngặt hơn tier MCP Playwright. Tham số `jira.confirm` phải là `true` được truyền TỪNG LẦN gọi `run()`; KHÔNG có biến môi trường hay flag persistent nào bật sẵn "luôn cho phép ghi Jira".
- **Không phải mở rộng luôn bật** — mặc định `jira` là `undefined`/`null`, `run()` hoạt động y hệt như trước khi có Jira nếu không truyền tham số này (100% tương thích ngược).
- **Lưu cả 2 loại**: bug report (issue type `Bug`) VÀ test case + kết quả chạy thật (issue type `Task`) — không chỉ bug, theo đúng quyết định đã chốt.
- Mọi issue tạo ra đều gắn label `ai-draft` (bug) hoặc `qa-test-case` (test case) + TC_ID tương ứng — để phân biệt issue do AI tạo với issue con người tự tạo, và truy nguồn ngược lại 2 chiều.
- **KHÔNG tự động ghi đè/update issue đã tồn tại** — v1 chỉ tạo issue mới (`createIssue`), không tìm-và-cập-nhật issue trùng. Nếu chạy `jira` nhiều lần cho cùng 1 TC_ID, sẽ tạo issue MỚI mỗi lần (trùng lặp) — người dùng tự quản lý tần suất gọi cho tới khi có cơ chế "tìm issue đã tồn tại theo label" (chưa build).

### Chưa verify (rủi ro đã biết)
- **Chưa từng gọi thật tới 1 Jira instance thật** — không có credentials trong repo này khi build. Payload dựa trên schema Jira Cloud REST API v3 đã biết (issue fields, ADF cho description), nhưng field bắt buộc/tuỳ chỉnh (custom field) khác nhau giữa các Jira project thật — lần gọi thật đầu tiên cần kiểm tra kỹ lỗi trả về (thường là 400 nếu thiếu field bắt buộc theo project scheme).
- Issue type tên `"Bug"`/`"Task"` giả định là tên mặc định của Jira — nếu project thật dùng tên khác (vd tiếng Việt, hoặc scheme tùy chỉnh), phải sửa lại 2 hằng số này trong `jira-mapper.js`.

## Source
Quyết định thiết kế chốt cùng người dùng (2026-08-14: mở rộng bên trong `qa-reporter`, flag/param mỗi lần gọi, lưu cả test case + kết quả; 2026-08-17: build code, chọn vị trí runtime/qa-reporter, xác nhận không có package MCP Jira dùng được).

## Node referenced
qa-reporter (duy nhất được phép gọi `agents/runtime/jira-client.js`)
