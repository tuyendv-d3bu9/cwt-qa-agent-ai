# Skill: Flow Step Matcher

## Purpose
Cú phán đoán **duy nhất** trong vòng đi luồng (`tools/flow-walker.js`). Mỗi bước nghiệp vụ, bạn nhận
**trạng thái thật của trang** (đã parse từ snapshot MCP, đã lọc) và trả lời đúng một câu:

> Bước này ứng với phần tử nào trên trang, và làm gì với nó?

## ⚠ PHẠM VI — chỉ khớp 1 bước, KHÔNG viết code, KHÔNG viết selector

Máy đã làm hết phần máy làm được trước khi tới bạn:

| Việc | Ai làm |
|---|---|
| Mở browser, điều hướng | `browser_navigate` |
| Chụp trạng thái trang | `browser_snapshot` → cây a11y yaml |
| Parse yaml → danh sách node | `tools/snapshot-parser.js` (deterministic) |
| Lọc còn vài ứng viên liên quan | `flow-walker.js` (deterministic) |
| **Sinh locator** | `browser_generate_locator` — **Playwright tự sinh** |
| Thực thi hành động | `browser_click` / `browser_type` / `browser_select_option` |
| Nhớ phần tử đã tìm | `tools/ui-element-registry.js` |

Việc của bạn **chỉ** là khớp *ý định nghiệp vụ* ↔ *node thật*. **KHÔNG** viết CSS selector, XPath,
`getByRole(...)`, **KHÔNG** viết code Playwright. Xem `knowledge/mcp-cost-optimization.md`.

## Knowledge Reference
- `knowledge/mcp-cost-optimization.md` — ranh giới 3 tầng, và vì sao không tự viết selector.
- `knowledge/oracle-problem.md` — verdict pass/fail chỉ từ `expect()`, không từ bước đi luồng này.
- `../../memory/project/domain-facts.md` (cross-node) — nghiệp vụ của tính năng đang test.

## Prompt Type
Template-based

## Variables
{{step}} — bước nghiệp vụ, **nguyên văn lời người viết tài liệu** (vd: `thêm một sản phẩm bất kỳ vào giỏ hàng`)
{{kind}} — `action` (phải làm gì đó) hoặc `check` (chỉ quan sát)
{{hints}} — tên phần tử người viết **tình cờ** đặt trong ngoặc kép, có thể rỗng. **GỢI Ý, không phải lệnh** — nếu trang không có phần tử tên đó thì bỏ gợi ý, đừng cố khớp cho bằng được.
{{candidates}} — node THẬT đang có trên trang, mỗi node `{ role, name, text, ref, disabled? }`. Đây là **cây accessibility đã parse — KHÔNG phải HTML**: không tag, không class, không CSS.

## PROMPT
Bạn là QA Automation Agent, đang đi từng bước một luồng nghiệp vụ trên trang thật.

Bước cần làm:

{{step}}

Loại bước: {{kind}}
Gợi ý tên phần tử (nếu có): {{hints}}

Các phần tử ĐANG CÓ trên trang lúc này:

{{candidates}}

Trả về JSON thuần (không markdown, không code fence):
```json
{
  "found": true,
  "role": "<role NGUYÊN VĂN từ candidates>",
  "name": "<name NGUYÊN VĂN từ candidates>",
  "action": "click" | "type" | "select",
  "value": "<giá trị cần nhập, chỉ khi action là type/select; còn lại null>",
  "confidence": "high" | "low",
  "why": "<1 câu: vì sao node này ứng với bước đó>"
}
```

Luật bắt buộc:

1. **`role` và `name` phải copy NGUYÊN VĂN từ `{{candidates}}`** — đúng hoa/thường, đúng dấu tiếng
   Việt, đúng khoảng trắng. Không chuẩn hoá, không dịch, không "sửa cho đẹp". Sai một ký tự là
   locator sinh ra sẽ không khớp gì.
2. **Không khớp được thì trả `{"found": false, "why": "<lý do cụ thể>"}`.** KHÔNG chọn một phần tử
   gần gần đúng. Chọn sai một bước làm **mọi màn hình sau đó** sai theo, và spec sinh ra từ những
   màn hình đó cũng sai — âm thầm, không có lỗi nào để lần ra. Luồng sẽ dừng và ghi finding; đó là
   kết quả ĐÚNG khi trang không có thứ tài liệu nói.
3. **Phần tử đang `disabled` thì không chọn** để thực hiện hành động — trả `found: false` và nêu rõ
   nó bị disabled. Đó là một phát hiện thật (tiền đề của bước chưa được thoả), không phải lỗi.
4. `action: "type"` thì **phải** có `value`. Không biết nhập gì thì trả `found: false` — thà dừng
   còn hơn nhập chuỗi rỗng rồi để test fail vì lý do sai.
5. **`confidence: "low"`** khi phải suy luận để khớp (tên khác hẳn lời tài liệu, hoặc có nhiều ứng
   viên ngang nhau). Bước vẫn được thực hiện, nhưng sẽ được ghi finding để người review. Đừng dùng
   `high` cho một phỏng đoán.
6. Chỉ 3 giá trị `action` ở trên. Cần một hành động khác → `found: false`, nêu trong `why`.

## Sample Input
```
step = thêm một sản phẩm bất kỳ vào giỏ hàng
kind = action
hints = []
candidates =
- button "Cửa hàng" ref=e23
- button "Thanh toán" ref=e27
- button "Đơn hàng" ref=e33
- textbox "Tìm kiếm sản phẩm..." ref=e62
- button "Thêm vào giỏ" ref=e81
- button "Thêm vào giỏ" ref=e99
```

## Sample Output
```json
{
  "found": true,
  "role": "button",
  "name": "Thêm vào giỏ",
  "action": "click",
  "value": null,
  "confidence": "high",
  "why": "Bước cần thêm sản phẩm vào giỏ; trên trang có nút 'Thêm vào giỏ' ở mỗi thẻ sản phẩm, chọn cái đầu tiên vì bước nói 'bất kỳ'."
}
```

## Sample Output (không khớp — cũng là kết quả đúng)
```json
{
  "found": false,
  "why": "Bước cần ô nhập mã giảm giá, nhưng trang hiện tại chỉ có tabbar và danh sách sản phẩm — không có textbox nào liên quan tới mã giảm giá. Có thể chưa vào đúng trang giỏ hàng."
}
```

## Quality Check
- **Faithful**: `role`/`name` xuất hiện nguyên văn trong `{{candidates}}`; không có selector tự viết.
- **Accurate**: giữ đúng hoa/thường và dấu tiếng Việt của accessible name.
- **Complete**: `action: "type"` luôn kèm `value`; `found: false` luôn kèm `why` cụ thể.
- **Testable**: `why` trích được từ input, để người review truy ngược lại quyết định.
