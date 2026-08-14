# Skill: DOM Explore

## Purpose
Dùng đầu tiên cho mỗi test case. `index.js` điều khiển trực tiếp việc gọi MCP Playwright (navigate + snapshot) — skill này chỉ dùng để chuyển 1 DOM snapshot THẬT thành danh sách selector liên quan tới 1 test case cụ thể. KHÔNG tự đoán selector nếu MCP chưa trả về phần tử đó.

## Knowledge Reference
- `knowledge/generate-once-run-many.md` — chỉ gọi MCP ở bước này, không gọi lại lúc runtime.
- `agents/qa-test-designer/knowledge/shopgo-domain.md` (cross-node) — URL app, fact checkout không cần login.
- `knowledge/playwright-conventions.md` — ưu tiên getByRole/getByLabel/getByTestId.

## Prompt Type
Chain-of-thought (input là DOM snapshot thật do `index.js` lấy qua MCP trước khi gọi skill này, không phải do skill này tự gọi MCP)

## Variables
{{test_case}} — 1 test case (TC_ID, Title, Steps, Test Data, Expected Result) từ `deliverable-test-designer.md`
{{dom_snapshot}} — kết quả snapshot THẬT trả về từ MCP Playwright (accessibility tree / HTML thật của trang checkout)

## PROMPT
Bạn là QA Automation Agent. Dựa trên test case:

{{test_case}}

Và DOM snapshot THẬT vừa lấy được từ trang checkout:

{{dom_snapshot}}

Xác định selector thật (ưu tiên role/label/test-id nếu có) cho từng phần tử được Steps/Expected Result của test case nhắc tới. CHỈ dùng selector có trong snapshot — nếu không tìm thấy phần tử nào đó, ghi rõ "KHÔNG TÌM THẤY trong DOM thật", không tự bịa.

## Sample Input
test_case = "TC-D-001 | ... | Steps: 1. Vào checkout 2. Nhập mã 3. Bấm Áp dụng | ..."
dom_snapshot = "<input aria-label='Mã giảm giá' .../> <button>Áp dụng</button> ..."

## Sample Output
```
| Phần tử | Selector thật |
|---|---|
| Ô nhập mã | getByLabel('Mã giảm giá') |
| Nút Áp dụng | getByRole('button', { name: 'Áp dụng' }) |
```

## Quality Check
- **Faithful**: mọi selector đều lấy từ dom_snapshot thật, không suy đoán.
- **Accurate**: tên/role/label khớp chính xác chuỗi thật trong snapshot (phân biệt hoa/thường, dấu tiếng Việt).
- **Complete**: đủ selector cho mọi phần tử được Steps/Expected Result của test case nhắc tới.
- **Testable**: nếu thiếu selector, ghi rõ "KHÔNG TÌM THẤY" thay vì bỏ qua im lặng.