# Skill: Step Navigator

## Purpose
Dùng cho **những bước mà `tools/step-planner.js` KHÔNG map được bằng rule**. Các bước formulaic ("Nhập X vào ô Y", "Bấm nút Z", "Vào trang W", "Nhấn Enter", bước chỉ mô tả kỳ vọng) đã được xử lý bằng code, 0 token — xem `knowledge/mcp-cost-optimization.md`. Skill này chỉ nhận phần còn lại. Quyết định hành động MCP Playwright cần thực hiện (nếu có) để đưa trang về đúng trạng thái mà bước đó mô tả — trước khi có thể chụp snapshot đáng tin cậy cho selector extraction. Đây là phần sửa lỗi đã biết: trước đây agent chỉ `navigate` tới URL gốc rồi chụp 1 lần, không thực thi Steps thật (ví dụ "thêm hàng vào giỏ trước khi vào checkout"), dẫn tới explore sai trạng thái trang cho test case nhiều bước.

## Knowledge Reference
- `knowledge/generate-once-run-many.md`
- `memory/project/domain-facts.md` (cross-node) — URL app, fact không cần login.

## Prompt Type
Chain-of-thought

## ⚠ ĐÂY LÀ MỘT VÒNG LẶP, KHÔNG PHẢI HỎI MỘT LẦN

`index.js` gọi skill này **nhiều lượt cho cùng một bước** (tối đa 3): sau mỗi hành động nó
**chụp lại trang** rồi hỏi bạn tiếp, với trang **đã thay đổi**.

Trước đây chỉ hỏi đúng một lần: bạn chọn 1 tool, `index.js` gọi 1 lần rồi đi sang bước sau —
bạn **không bao giờ thấy hành động của mình gây ra chuyện gì**. Một bước thất bại vẫn được coi
như xong, và mọi bước sau đó được quyết định dựa trên một trạng thái trang không ai xem lại.

Hệ quả cho bạn:
- Bước cần **2 hành động** (mở dropdown rồi chọn) thì trả `done: false` ở lượt đầu, lượt sau
  chọn hành động tiếp — đừng cố nhồi cả hai vào một lượt.
- Đọc `{{da_lam_roi}}` trước khi quyết: **đừng lặp lại một hành động vừa lỗi**. Nếu lỗi rồi thì
  đổi cách, hoặc kết luận `done: true` + `reason` nói rõ không làm được.
- Hết `{{attempt}}` mà chưa xong thì `index.js` **đi tiếp và ghi cảnh báo**, KHÔNG coi là xong.

## Variables
{{step}} — 1 bước trong Steps của test case (ví dụ: "Nhập mã SALE20 vào ô mã giảm giá")
{{attempt}} — lượt thứ mấy / tối đa mấy lượt cho bước NÀY (ví dụ `2/3`)
{{da_lam_roi}} — (chỉ có từ lượt 2) các hành động đã thực hiện cho bước này và kết quả `ok`/`LỖI: ...`
{{page_elements}} — **node đã được lọc** theo nội dung bước đang xử lý, mỗi node 1 dòng: `- textbox "Mã giảm giá" ref=e14`. Đây là cây **accessibility đã parse**, KHÔNG phải HTML — không có tag, không có class. Snapshot đầy đủ đã được ghi ra file và lọc bằng `tools/snapshot-parser.js`, không đưa vào prompt.
{{available_tools}} — **whitelist 8 tool** liên quan tới điều hướng/tương tác (`WHITELIST` trong `tools/step-planner.js`). `@playwright/mcp` có 60+ tool; nhồi hết vào prompt mỗi bước mỗi test case là chi phí thuần. KHÔNG được chọn tool ngoài danh sách này — `index.js` sẽ **loại bỏ** quyết định dùng tool ngoài whitelist.

## PROMPT
Bạn là QA Automation Agent. Cho bước sau của 1 test case:

{{step}}

Node liên quan trên trang hiện tại:

{{page_elements}}

Danh sách tool MCP THẬT đang có (chỉ được chọn trong danh sách này, không tự bịa tên tool khác):

{{available_tools}}

Trả về JSON (không kèm markdown code fence):
```json
{ "done": true|false, "tool": "<tên tool đúng như trong available_tools, hoặc null>", "args": { ... }, "reason": "..." }
```
- `done: true, tool: null`: nếu bước này KHÔNG cần hành động (trang đã ở đúng trạng thái, hoặc bước chỉ là mô tả kỳ vọng chứ không phải hành động).
- `done: false, tool: "<tên tool>"`: nếu cần 1 hành động cụ thể (click, điền form, v.v.) — `args` phải khớp đúng schema của tool đó trong `available_tools`.
- Nếu không tìm được phần tử phù hợp trong `page_elements` để thực hiện bước này: `done: true, tool: null`, ghi rõ lý do trong `reason` (KHÔNG tự bịa hành động khi không chắc).

## Sample Input
step = "Nhập mã SALE20 vào ô mã giảm giá"
page_elements =
- textbox "Mã giảm giá" ref=e14
- button "Áp dụng" ref=e15
available_tools = ["browser_navigate","browser_click","browser_type","browser_fill_form","browser_select_option","browser_press_key","browser_find","browser_snapshot"]

## Sample Output
```json
{ "done": false, "tool": "browser_type", "args": { "ref": "e14", "text": "SALE20" }, "reason": "Tìm thấy ô nhập mã giảm giá trong snapshot, điền giá trị theo bước." }
```

## Quality Check
- **Faithful**: chỉ chọn tool có thật trong `available_tools`, không bịa tên tool hay tham số ngoài schema.
- **Accurate**: `args.ref` phải là `ref` thật thấy trong `page_elements`, không đoán. Nhớ `ref` chỉ có giá trị trong đúng snapshot này.
- **Complete**: mọi bước trong Steps đều phải được xử lý (kể cả khi kết luận là `done: true, tool: null`).
- **Testable**: `reason` phải đủ cụ thể để người review hiểu vì sao chọn hành động đó hoặc vì sao bỏ qua.
