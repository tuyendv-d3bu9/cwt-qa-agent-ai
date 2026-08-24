# Knowledge: Boundary & Coverage Conventions

## Type
Analysis Framework / Registry

## Content

Test Designer KHÔNG định nghĩa lại risk matrix hay viewpoint — tái dùng (đọc trực tiếp, không copy) 2 knowledge đã có sẵn ở node khác:

- **Ma trận Likelihood × Impact** (ưu tiên hoá risk): xem `agents/qa-leader/knowledge/task-management-conventions.md`, mục 3.
- **8-viewpoint library** (Happy Path, Negative, Boundary, Security, UX, Performance, Accessibility, Integration + cách chọn theo Business Impact × Likelihood × Detectability): xem `agents/qa-analyst/knowledge/viewpoint-library.md`.

### Technique selection theo BẢN CHẤT field

Quy ước của framework, đúng với mọi dự án. Chọn theo **bản chất** field, không theo tên field —
tên field là dữ liệu của dự án, đọc từ tầng 2 (`contextFor()`), không viết cứng ở đây.

| Bản chất field | Technique ưu tiên | Vì sao |
|---|---|---|
| Có min/max/threshold rõ ràng (số tiền, số lượng, %) | Boundary Value Analysis (BVA) | Lỗi tập trung ở ngay hai bên mốc, không rải đều trong khoảng |
| Có nhiều nhánh loại trừ nhau, mỗi nhánh một công thức | Equivalence Partitioning (EP) + Decision Table | Cần phủ mỗi nhánh ít nhất 1 lần và phủ tổ hợp điều kiện |
| Chuyển trạng thái theo thời gian hoặc theo hành động | BVA + State Transition | Mốc chuyển trạng thái là biên; và thứ tự hành động tự nó sinh lỗi |
| Ô nhập tự do có ràng buộc định dạng | EP + Negative | Hợp lệ/không hợp lệ chia lớp được; phần lớn lỗi nằm ở lớp không hợp lệ |
| Trạng thái phụ thuộc thay đổi ở nơi khác (một phần đổi làm phần đã tính lại sai) | State Transition | Đây là loại lỗi mà test một màn hình đơn lẻ không bao giờ thấy |

> **VÍ DỤ** (dữ liệu của dự án hiện tại, KHÔNG phải quy ước của framework — để thấy cách áp bảng
> trên): `min_order_value` là *có threshold* → BVA · `discount_type` (PERCENT/FIXED/FREESHIP) là
> *nhiều nhánh loại trừ nhau* → EP + Decision Table · `expire_at` là *chuyển trạng thái theo
> thời gian* → BVA + State Transition · `voucher_code` là *ô nhập có ràng buộc định dạng* →
> EP + Negative · "giỏ hàng đổi sau khi đã áp mã" là *phụ thuộc thay đổi ở nơi khác* →
> State Transition.
>
> Field của dự án khác sẽ khác hẳn — đừng khớp theo TÊN trong ví dụ này, khớp theo **bản chất**.

### Rule
- Không chọn cùng 1 technique cho mọi field — chọn theo bảng trên; field mới không có trong bảng thì lý luận tương tự (dựa trên bản chất field: có threshold rõ → BVA, có nhiều nhánh loại trừ nhau → EP/Decision Table, có chuyển trạng thái theo thời gian/hành động → State Transition).
- Mỗi test case phải ghi rõ technique đã dùng trong Tags (ví dụ `[BVA]`, `[EP]`, `[Decision Table]`, `[State Transition]`) để Verifier/Reporter truy nguồn được.
- Không tự thêm technique ngoài 4 loại đã liệt kê (EP/BVA/Decision Table/State Transition) trừ khi ghi rõ lý do trong test case.
- Không mặc định chọn cùng một nhóm viewpoint cho mọi task — áp dụng đúng nguyên tắc "Không cần sử dụng cả 8 viewpoint" đã ghi trong `viewpoint-library.md`.

## Source
`agents/qa-leader/knowledge/task-management-conventions.md` (mục 3), `agents/qa-analyst/knowledge/viewpoint-library.md`, `project-docs/03_DEV/API-spec-voucher-checkout.md`.

## Node referenced
qa-test-designer (đọc cross-node, không copy, từ qa-leader và qa-analyst)