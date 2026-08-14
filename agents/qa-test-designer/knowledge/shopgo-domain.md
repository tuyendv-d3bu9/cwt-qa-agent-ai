# Knowledge: ShopGo Domain — Function D (Voucher/Discount Checkout)

## Type
Fact / Business Context

## Content

### Function D
Function D = áp/gỡ mã giảm giá tại bước checkout — `POST /api/v1/checkout/voucher/apply` và `DELETE /api/v1/checkout/voucher` (xem `project-docs/03_DEV/API-spec-voucher-checkout.md`).

### Ứng dụng demo
ShopGo checkout chạy tại `https://cwshopgo.github.io`. Checkout **không cần login** — S22 đã bỏ bắt buộc login để giảm tỉ lệ bỏ giỏ (xem `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`), dù `ShopGo-Overview.md` và BRD chưa được cập nhật theo. Không tự thêm bước login vào test case checkout chỉ vì Overview/BRD còn ghi vậy.

### Bug đã biết (project-docs/05_QA/bug_export_S23.csv)
Không tạo test case mới trùng các bug dưới đây. Nếu cần cover, tạo regression test case và ghi rõ Bug ID liên quan trong trường Tags (ví dụ `[BUG-1170]`):

| Bug ID | Mô tả | Status |
|---|---|---|
| BUG-1142 | Tổng tiền lệch 1đ khi áp mã phần trăm | In Progress |
| BUG-1150 | Áp mã xong bấm back rồi vào lại vẫn còn giảm giá | Open |
| BUG-1151 | Thông báo lỗi hiện "Voucher không tồn tại" khác design | Open |
| BUG-1152 | Nút Áp dụng không disable khi ô nhập rỗng trên mobile | Closed (Fixed, S23) |
| BUG-1163 | Nhập mã chữ thường không nhận | Closed (Fixed, S23) |
| BUG-1170 | Mã hết hạn vẫn áp được nếu áp lúc 00:30 sáng | Open, Critical |
| BUG-1171 | Bớt hàng sau khi áp mã vẫn giữ nguyên giảm giá | Open |
| BUG-1174 | Hiển thị sai định dạng tiền tệ ở khối tổng kết | Open, Minor |
| BUG-1180 | Áp mã FREESHIP30 trừ vào tiền hàng thay vì phí ship | Reopened, Major |
| BUG-1181 | Không có thông báo khi mã hết lượt sử dụng | Open, Minor (ghi chú: "Not a bug - chưa implement") |

### Contradiction đã biết trong `03_DEV/API-spec-voucher-checkout.md`
Ghi lại ở đây để Test Designer KHÔNG tự coi các điểm này là lỗi của chính mình khi gặp phải — đây là input nhiễu có thật trong tài liệu nguồn, mục tiêu là sinh test case bắt được chính các mâu thuẫn này, không phải bỏ qua hay tự chọn 1 phía:

- **Login vs first-order voucher**: checkout không cần login (S22) nhưng mã "mua lần đầu" (first-order-only) cần định danh khách hàng để check — API spec mục 10 ghi rõ "Chưa có trong scope Sprint 23". Đây đã là OPEN QUESTION trong `deliverable-analyst.md`; không tự suy luận cách xác định "khách mua lần đầu" khi không có login.
- **`voucher_code` case-sensitive**: chỉ nhận chữ hoa, server không tự chuẩn hoá (mục 2) — cần đối chiếu UI-note/BRD xem có đồng nhất thông báo lỗi khi user nhập chữ thường không (liên quan BUG-1163, đã Fixed S23 — test case nên là regression, không phải bug mới).
- **`VOUCHER_USAGE_LIMIT_REACHED` chưa implement đầy đủ** (mục 4, trả lỗi generic "Có lỗi xảy ra") — test case cho case này ghi Expected Result đúng theo hiện trạng (lỗi generic), không viết như đã implement đầy đủ; gắn Priority phù hợp với việc đây là gap đã biết (liên quan BUG-1181).
- **FREESHIP dùng chung logic trừ tiền với PERCENT/FIXED** (mục 8) — chưa tách riêng thành khoản giảm phí vận chuyển, liên quan trực tiếp BUG-1180.

## Source
`project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/05_QA/bug_export_S23.csv`, `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`.

## Node referenced
qa-test-designer