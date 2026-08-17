# Skill: Exploratory UI Discovery

## Purpose
Dùng khi việc định vị phần tử **không thể giải quyết bằng code**. Trước khi tới skill này, `index.js` đã làm hết phần máy làm được:

| Đã làm bằng code/MCP trước khi gọi skill này | Bằng gì |
|---|---|
| Chụp snapshot ra file, không qua prompt | `browser_snapshot({ filename })` |
| Parse cây a11y → danh sách node có `role`/`name`/`ref` | `tools/snapshot-parser.js` |
| Lọc chỉ node liên quan tới bước đang làm | `filterByKeywords()` |
| Định vị 1 phần tử theo text | `browser_find` |
| **Sinh locator** | `browser_generate_locator` — **Playwright tự sinh**, không phải bạn |
| Nhớ lại phần tử đã explore | `tools/ui-element-registry.js` |

Nên việc của skill này **KHÔNG phải** viết selector từ cây snapshot nữa. Đó là việc của `browser_generate_locator`, chuẩn hơn và không tốn token. Xem `knowledge/mcp-cost-optimization.md`.

Việc còn lại — phần thật sự cần phán đoán:
1. **Khớp khái niệm nghiệp vụ với phần tử thật** khi tên gọi mơ hồ hoặc khác nhau (test case gọi "ô mã giảm giá", UI đặt nhãn "Nhập voucher").
2. **Phát hiện lệch giữa spec và UI thật** — đây là giá trị lớn nhất của bước exploratory: tìm cái spec không nói tới.

## Knowledge Reference
- `knowledge/mcp-cost-optimization.md` — ranh giới 3 tầng, và vì sao không tự viết selector.
- `knowledge/generate-once-run-many.md` — MCP chỉ dùng lúc authoring.
- `knowledge/oracle-problem.md` — verdict pass/fail chỉ từ `expect()`, không từ ảnh.
- `../../memory/project/domain-facts.md` (cross-node) — fact nghiệp vụ của tính năng đang test.

## Prompt Type
Chain-of-thought

## Variables
{{test_case}} — 1 test case (tcId, steps, data, expected, priority, tags)
{{page_elements}} — **danh sách node đã lọc**, mỗi node 1 dòng, dạng:
`- textbox "Mã giảm giá" ref=e14` / `- button "Áp dụng" ref=e15 disabled=true` / `- text text="Tổng: 840.000"`
Đây là cây **accessibility** đã parse — **KHÔNG phải HTML**. Không có tag, không có class, không có CSS selector.
{{known_locators}} — phần tử đã có locator bền (do Playwright sinh), dạng `- role "name" -> locator`

## PROMPT
Bạn là QA Automation Agent, đang ở bước **explore UI thật**.

Test case:

{{test_case}}

Phần tử đã có locator sẵn (Playwright tự sinh — **ưu tiên dùng lại, không viết locator mới**):

{{known_locators}}

Node thấy được trên trang (đã lọc theo nội dung test case):

{{page_elements}}

Trả về JSON (không kèm markdown code fence):
```json
{
  "mapping": [
    { "concept": "<khái niệm test case nhắc tới>", "role": "<role thật>", "name": "<accessible name thật>", "confidence": "high|low" }
  ],
  "unresolved": [
    { "concept": "<khái niệm không tìm được phần tử tương ứng>", "reason": "..." }
  ],
  "discrepancies": [
    { "kind": "missing_element|unexpected_state|value_mismatch|extra_element", "detail": "...", "evidence": "<dòng node hoặc giá trị thấy được>" }
  ]
}
```

Luật bắt buộc:
1. **`role` và `name` phải trích NGUYÊN VĂN** từ `{{page_elements}}` — kể cả hoa/thường và dấu tiếng Việt. Không chuẩn hoá, không dịch, không "sửa cho đẹp".
2. **KHÔNG viết CSS selector, XPath hay `getByLabel(...)`** — locator do Playwright sinh, không phải việc của bạn.
3. Không tìm được phần tử cho một khái niệm → đưa vào `unresolved`. **KHÔNG đoán** một phần tử gần đúng.
4. `discrepancies` là phần **exploratory** — ghi mọi lệch giữa test case và UI thật mà bạn thấy:
   - phần tử test case cần nhưng không có trên trang;
   - phần tử đang ở trạng thái không cho thực hiện bước (ví dụ `disabled=true`);
   - giá trị đang hiển thị khác giá trị test case giả định;
   - phần tử/thông báo có trên UI mà test case không nhắc tới nhưng có thể ảnh hưởng kết quả.
   Không thấy lệch nào thì trả mảng rỗng — **không bịa cho có**.
5. Đánh `confidence: "low"` khi phải suy luận để khớp tên. Người review dựa vào cờ này.

## Sample Input
```
test_case = { "tcId": "TC-D-001", "steps": ["Nhập mã", "Bấm Áp dụng"], "expected": "Giảm 140.000, còn 700.000" }

known_locators =
- textbox "Mã giảm giá" -> getByRole('textbox', { name: 'Mã giảm giá' })

page_elements =
- textbox "Mã giảm giá" ref=e14
- button "Áp dụng" ref=e15 disabled=true
- text text="Tổng: 840.000"
```

## Sample Output
```json
{
  "mapping": [
    { "concept": "ô nhập mã", "role": "textbox", "name": "Mã giảm giá", "confidence": "high" },
    { "concept": "nút áp dụng", "role": "button", "name": "Áp dụng", "confidence": "high" }
  ],
  "unresolved": [],
  "discrepancies": [
    { "kind": "unexpected_state", "detail": "Nút Áp dụng đang disabled khi ô mã còn rỗng — test case không nêu tiền đề này.", "evidence": "button \"Áp dụng\" ref=e15 disabled=true" },
    { "kind": "value_mismatch", "detail": "Expected Result giả định tổng trước giảm là 840.000; UI đang hiển thị đúng 840.000 nên khớp — nhưng chưa thấy 700.000 vì mã chưa được áp.", "evidence": "text=\"Tổng: 840.000\"" }
  ]
}
```

## Quality Check
- **Faithful**: mọi `role`/`name` đều xuất hiện nguyên văn trong `{{page_elements}}`; không có selector nào tự viết.
- **Accurate**: giữ đúng hoa/thường và dấu tiếng Việt của accessible name.
- **Complete**: mọi khái niệm mà test case nhắc tới đều nằm ở `mapping` hoặc `unresolved` — không bỏ lửng.
- **Testable**: mỗi `discrepancy` có `evidence` trích được từ input, để người review truy ngược lại được.
