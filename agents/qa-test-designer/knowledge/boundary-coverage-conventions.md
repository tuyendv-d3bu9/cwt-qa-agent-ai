# Knowledge: Boundary & Coverage Conventions

## Type
Analysis Framework / Registry

## Content

Test Designer KHÔNG định nghĩa lại risk matrix hay viewpoint — tái dùng (đọc trực tiếp, không copy) 2 knowledge đã có sẵn ở node khác:

- **Ma trận Likelihood × Impact** (ưu tiên hoá risk): xem `agents/qa-leader/knowledge/task-management-conventions.md`, mục 3.
- **8-viewpoint library** (Happy Path, Negative, Boundary, Security, UX, Performance, Accessibility, Integration + cách chọn theo Business Impact × Likelihood × Detectability): xem `agents/qa-analyst/knowledge/viewpoint-library.md`.

### Technique selection theo field type (Function D)

| Field | Technique ưu tiên | Lý do |
|---|---|---|
| `discount_amount`, `min_order_value`, `max_discount` (số tiền) | Boundary Value Analysis (BVA) | Có min/max/threshold rõ ràng (API spec mục 5, 6) |
| `discount_type` (PERCENT / FIXED / FREESHIP) | Equivalence Partitioning (EP) + Decision Table | Mỗi loại có logic tính khác nhau (API spec mục 6, 8) |
| `expire_at` (hạn sử dụng) | Boundary Value Analysis + State Transition | So sánh UTC timestamp, có mốc chuyển trạng thái hết hạn (API spec mục 7, liên quan BUG-1170) |
| `voucher_code` (input) | Equivalence Partitioning + Negative | Case-sensitive, chỉ nhận chữ hoa (API spec mục 2, liên quan BUG-1163) |
| Giỏ hàng thay đổi sau khi đã áp mã | State Transition | Chưa có endpoint re-validate (API spec — Known limitations, liên quan BUG-1171) |

### Rule
- Không chọn cùng 1 technique cho mọi field — chọn theo bảng trên; field mới không có trong bảng thì lý luận tương tự (dựa trên bản chất field: có threshold rõ → BVA, có nhiều nhánh loại trừ nhau → EP/Decision Table, có chuyển trạng thái theo thời gian/hành động → State Transition).
- Mỗi test case phải ghi rõ technique đã dùng trong Tags (ví dụ `[BVA]`, `[EP]`, `[Decision Table]`, `[State Transition]`) để Verifier/Reporter truy nguồn được.
- Không tự thêm technique ngoài 4 loại đã liệt kê (EP/BVA/Decision Table/State Transition) trừ khi ghi rõ lý do trong test case.
- Không mặc định chọn cùng một nhóm viewpoint cho mọi task — áp dụng đúng nguyên tắc "Không cần sử dụng cả 8 viewpoint" đã ghi trong `viewpoint-library.md`.

## Source
`agents/qa-leader/knowledge/task-management-conventions.md` (mục 3), `agents/qa-analyst/knowledge/viewpoint-library.md`, `project-docs/03_DEV/API-spec-voucher-checkout.md`.

## Node referenced
qa-test-designer (đọc cross-node, không copy, từ qa-leader và qa-analyst)