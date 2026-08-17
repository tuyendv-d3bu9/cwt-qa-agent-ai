# Skill: UI Conventions Writer

## Purpose
Dùng sau khi explore xong lượt authoring hiện tại. Ghi lại **quy ước UI THẬT đã quan sát được** thành `memory/working/ui-conventions.md` — baseline oracle mà `qa-verifier` dùng để phân biệt "spec lỗi thời" với "sản phẩm sai".

Input **không còn là snapshot thô**. Trước đây skill này nhận toàn bộ N snapshot nối lại — payload lớn nhất trong cả node, và mô tả cùng một trang N lần. Giờ nó nhận **registry phần tử đã giải quyết** (`role` + accessible name + locator do Playwright sinh), xem `knowledge/mcp-cost-optimization.md`.

## Knowledge Reference
- `knowledge/playwright-conventions.md` — ưu tiên locator theo role/label/test-id.
- `knowledge/mcp-cost-optimization.md` — vì sao input là registry chứ không phải snapshot thô.

## Prompt Type
Chain-of-thought

## Variables
{{base_url}} — URL môi trường test (lấy từ cấu hình tầng 2, KHÔNG viết cứng)
{{page_fingerprint}} — fingerprint cấu trúc trang lúc explore; ghi vào file để lần sau biết UI đã đổi hay chưa
{{resolved_elements}} — phần tử đã explore được, mỗi dòng `- role "accessible name" -> locator`

## PROMPT
Bạn là QA Automation Agent. Đây là các phần tử UI **thật** đã explore được ở `{{base_url}}` (fingerprint `{{page_fingerprint}}`):

{{resolved_elements}}

Viết `ui-conventions.md` — tài liệu quy ước UI thật, gồm:

1. **Bảng phần tử** — `role`, accessible name, locator. Giữ **nguyên văn** accessible name kể cả hoa/thường và dấu tiếng Việt.
2. **Quy ước rút ra được** — chỉ những gì suy được từ chính danh sách trên, ví dụ: phần tử nhập liệu có accessible name rõ ràng nên định vị được bằng role+name (không cần CSS selector); nút hành động đặt tên theo động từ; v.v.
3. **Fingerprint + URL** — ghi lại để lần explore sau so được UI có đổi hay không.

Luật bắt buộc:
- **KHÔNG suy đoán** phần tử không có trong `{{resolved_elements}}`. Không lấy từ tài liệu thiết kế, không "chắc là có".
- **KHÔNG viết HTML tag/class**. Input là cây accessibility, không phải HTML — không có tag, không có class để mà ghi.
- Một quy ước chỉ dựa trên **1 phần tử duy nhất** thì ghi rõ `[QUAN SÁT 1 LẦN — chưa đủ để khẳng định convention]`.
- Phần tử nào **chưa có locator** thì ghi rõ là chưa giải quyết được, KHÔNG bỏ qua im lặng — `qa-verifier` cần biết vùng nào chưa có oracle.

## Sample Input
```
base_url = https://example.test
page_fingerprint = fp1a2b3c:412
resolved_elements =
- textbox "Mã giảm giá" -> getByRole('textbox', { name: 'Mã giảm giá' })
- button "Áp dụng" -> getByRole('button', { name: 'Áp dụng' })
- text "Tổng: 840.000" -> getByText('Tổng: 840.000')
```

## Sample Output
```markdown
# UI Conventions (quan sát thật)

- Môi trường: `https://example.test`
- Fingerprint cấu trúc trang: `fp1a2b3c:412`

## Phần tử đã explore
| Role | Accessible name | Locator |
|---|---|---|
| textbox | Mã giảm giá | `getByRole('textbox', { name: 'Mã giảm giá' })` |
| button | Áp dụng | `getByRole('button', { name: 'Áp dụng' })` |
| text | Tổng: 840.000 | `getByText('Tổng: 840.000')` |

## Quy ước rút ra
- Phần tử nhập liệu và nút hành động đều có accessible name rõ ràng → định vị được bằng `getByRole` + name, không cần CSS selector.
- Số tiền hiển thị dạng có dấu phân cách nghìn bằng dấu chấm (`840.000`) — assert phải khớp đúng chuỗi này, không tự đổi định dạng. [QUAN SÁT 1 LẦN — chưa đủ để khẳng định convention]

## Chưa giải quyết
*(không có phần tử nào thiếu locator trong lượt explore này)*
```

## Quality Check
- **Faithful**: mọi phần tử/locator đều có trong `{{resolved_elements}}`; không thêm phần tử nào.
- **Accurate**: accessible name giữ nguyên văn, đúng hoa/thường và dấu.
- **Complete**: có bảng phần tử, quy ước, fingerprint/URL, và mục "chưa giải quyết" (kể cả khi rỗng).
- **Testable**: `qa-verifier` đọc file này phải quyết định được một sai lệch là do spec lỗi thời hay do sản phẩm sai.
