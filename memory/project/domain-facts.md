# Project Knowledge: Domain Facts — Function D (Voucher/Discount Checkout)

## Type
Fact / Business Context (distilled from `project-docs/`)

## Content

### Function D
Function D = áp/gỡ mã giảm giá tại bước checkout — `POST /api/v1/checkout/voucher/apply` và `DELETE /api/v1/checkout/voucher` (xem `project-docs/03_DEV/API-spec-voucher-checkout.md`).

### Ứng dụng demo
ShopGo checkout chạy tại `https://cwshopgo.github.io`. Checkout **không cần login** — S22 đã bỏ bắt buộc login để giảm tỉ lệ bỏ giỏ (xem `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`), dù `ShopGo-Overview.md` và BRD chưa được cập nhật theo. Không tự thêm bước login vào test case checkout chỉ vì Overview/BRD còn ghi vậy.

### Contradiction đã biết trong `03_DEV/API-spec-voucher-checkout.md`
Ghi lại ở đây để các node KHÔNG tự coi các điểm này là lỗi của chính mình khi gặp phải — đây là input nhiễu có thật trong tài liệu nguồn, mục tiêu là sinh test case bắt được chính các mâu thuẫn này, không phải bỏ qua hay tự chọn 1 phía:

- **Login vs first-order voucher**: checkout không cần login (S22) nhưng mã "mua lần đầu" (first-order-only) cần định danh khách hàng để check — API spec mục 10 ghi rõ "Chưa có trong scope Sprint 23". Đây đã là OPEN QUESTION trong `deliverable-analyst.md`; không tự suy luận cách xác định "khách mua lần đầu" khi không có login.
- **`voucher_code` case-sensitive**: chỉ nhận chữ hoa, server không tự chuẩn hoá (mục 2) — cần đối chiếu UI-note/BRD xem có đồng nhất thông báo lỗi khi user nhập chữ thường không (liên quan BUG-1163 — xem `known-issues.md`, đã Fixed S23 — test case nên là regression, không phải bug mới).
- **`VOUCHER_USAGE_LIMIT_REACHED` chưa implement đầy đủ** (mục 4, trả lỗi generic "Có lỗi xảy ra") — test case cho case này ghi Expected Result đúng theo hiện trạng (lỗi generic), không viết như đã implement đầy đủ; gắn Priority phù hợp với việc đây là gap đã biết (liên quan BUG-1181 — xem `known-issues.md`).
- **FREESHIP dùng chung logic trừ tiền với PERCENT/FIXED** (mục 8) — chưa tách riêng thành khoản giảm phí vận chuyển, liên quan trực tiếp BUG-1180 (xem `known-issues.md`).

## Source
`project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`. Bảng bug đã biết tách riêng sang `known-issues.md` (không lặp lại ở đây).

## Consumed by
qa-test-designer, qa-automation (cross-node, đọc trực tiếp — xem role.md mỗi node).
