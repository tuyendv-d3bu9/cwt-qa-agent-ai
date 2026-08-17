# Knowledge: Playwright Conventions

## Type
Convention

## Content

### Đặt tên file spec
`tests/<TC_ID>.spec.ts` — ví dụ `tests/TC-D-001.spec.ts`. Giữ nguyên TC_ID từ `deliverable-test-designer.md` trong cả tên file và tên `test(...)` bên trong, để truy nguồn được 2 chiều (spec ↔ test case).

### Đặt tên screenshot (evidence khi fail)
`evidence/fail_<TC_ID>.png` — chỉ chụp khi test fail, dùng để debug. KHÔNG dùng làm căn cứ pass/fail (xem `oracle-problem.md`).

### Cấu trúc thư mục
- `tests/` — chứa `.spec.ts` tĩnh, tự tạo bởi `write_file` khi cần.
- `evidence/` — chứa screenshot khi fail (tạo khi có test fail thật, không tạo trước).

### Selector
Chỉ dùng selector đã quan sát thật qua MCP Playwright snapshot (skill `01_exploratory_ui_discovery.md`). Ưu tiên `getByRole` / `getByLabel` / `getByTestId` nếu DOM thật có hỗ trợ; chỉ dùng CSS selector thô khi không có lựa chọn nào khác — và phải ghi rõ lý do trong comment ngắn gọn khi dùng CSS selector thô.

## Source
Thiết kế QA Automation.

## Node referenced
qa-automation