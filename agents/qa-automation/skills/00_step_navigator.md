# Skill: Step Navigator

## Purpose
Dùng TRƯỚC `01_dom_explore.md`, cho MỖI bước trong Steps của 1 test case. Quyết định hành động MCP Playwright cần thực hiện (nếu có) để đưa trang về đúng trạng thái mà bước đó mô tả — trước khi có thể chụp snapshot đáng tin cậy cho selector extraction. Đây là phần sửa lỗi đã biết: trước đây agent chỉ `navigate` tới URL gốc rồi chụp 1 lần, không thực thi Steps thật (ví dụ "thêm hàng vào giỏ trước khi vào checkout"), dẫn tới explore sai trạng thái trang cho test case nhiều bước.

## Knowledge Reference
- `knowledge/generate-once-run-many.md`
- `memory/project/domain-facts.md` (cross-node) — URL app, fact không cần login.

## Prompt Type
Chain-of-thought

## Variables
{{step}} — 1 bước trong Steps của test case (ví dụ: "Nhập mã SALE20 vào ô mã giảm giá")
{{dom_snapshot}} — snapshot DOM thật hiện tại (từ MCP `browser_snapshot`, TRƯỚC khi thực hiện bước này)
{{available_tools}} — danh sách tool MCP THẬT đang có (tên + mô tả), lấy từ `mcpClient.listTools()` lúc kết nối — KHÔNG được chọn tool nào ngoài danh sách này.

## PROMPT
Bạn là QA Automation Agent. Cho bước sau của 1 test case:

{{step}}

DOM snapshot hiện tại:

{{dom_snapshot}}

Danh sách tool MCP THẬT đang có (chỉ được chọn trong danh sách này, không tự bịa tên tool khác):

{{available_tools}}

Trả về JSON (không kèm markdown code fence):
```json
{ "done": true|false, "tool": "<tên tool đúng như trong available_tools, hoặc null>", "args": { ... }, "reason": "..." }
```
- `done: true, tool: null`: nếu bước này KHÔNG cần hành động (trang đã ở đúng trạng thái, hoặc bước chỉ là mô tả kỳ vọng chứ không phải hành động).
- `done: false, tool: "<tên tool>"`: nếu cần 1 hành động cụ thể (click, điền form, v.v.) — `args` phải khớp đúng schema của tool đó trong `available_tools`.
- Nếu không tìm được phần tử phù hợp trong `dom_snapshot` để thực hiện bước này: `done: true, tool: null`, ghi rõ lý do trong `reason` (KHÔNG tự bịa hành động khi không chắc).

## Sample Input
step = "Nhập mã SALE20 vào ô mã giảm giá"
dom_snapshot = "... input aria-label=\"Mã giảm giá\" ref=\"e14\" ..."
available_tools = [{"name": "browser_click", ...}, {"name": "browser_type", ...}, {"name": "browser_navigate", ...}, {"name": "browser_snapshot", ...}]

## Sample Output
```json
{ "done": false, "tool": "browser_type", "args": { "ref": "e14", "text": "SALE20" }, "reason": "Tìm thấy ô nhập mã giảm giá trong snapshot, điền giá trị theo bước." }
```

## Quality Check
- **Faithful**: chỉ chọn tool có thật trong `available_tools`, không bịa tên tool hay tham số ngoài schema.
- **Accurate**: `args` phải khớp đúng phần tử/`ref` thật thấy trong `dom_snapshot`, không đoán.
- **Complete**: mọi bước trong Steps đều phải được xử lý (kể cả khi kết luận là `done: true, tool: null`).
- **Testable**: `reason` phải đủ cụ thể để người review hiểu vì sao chọn hành động đó hoặc vì sao bỏ qua.
