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

### Chính sách phí vận chuyển và miễn phí vận chuyển
Phí vận chuyển áp dụng theo 5 khu vực (Z1-Z5). Miễn phí vận chuyển áp dụng cho đơn hàng có giá trị tiền hàng từ 800.000đ trở lên (trừ khu vực Z5). Phí vận chuyển được tính sau khi chọn địa chỉ tại bước Thanh toán.

*Nguồn: `project-docs/01_Business/Bang-phi-van-chuyen.md`*

### Quy tắc áp dụng mã giảm giá
Mỗi đơn hàng chỉ được sử dụng 01 mã giảm giá (trừ trường hợp áp dụng CR-005 cho phép cộng dồn 01 mã giảm đơn hàng + 01 mã freeship). Giá trị đơn hàng tối thiểu được tính trên tổng tiền hàng sau khi trừ khuyến mãi sản phẩm, chưa bao gồm phí vận chuyển.

*Nguồn: `project-docs/01_Business/Chinh-sach-Khuyen-mai-ShopGo.md`*

### Bỏ bắt buộc đăng nhập tại Checkout
Theo yêu cầu từ Sprint 22, khách vãng lai (Guest) không bắt buộc phải đăng nhập khi thực hiện thanh toán để giảm tỉ lệ bỏ giỏ hàng.

*Nguồn: `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`*

### Xử lý mã 'First-order-only' cho Guest
**Trạng thái**: Còn treo — CHƯA có xác nhận trong tài liệu nguồn, không node nào được coi là đã chốt

Hệ thống xác định khách hàng mua lần đầu dựa trên email nhập tại form giao hàng. Hiện tại khách hàng có thể lách luật bằng cách nhập email khác. Cần xác nhận lại quy trình kiểm soát với BA/PO.

*Nguồn: `project-docs/06_Communication/Chat-shopgo-checkout.md`*

### Quy tắc làm tròn tiền giảm giá
**Trạng thái**: Còn treo — CHƯA có xác nhận trong tài liệu nguồn, không node nào được coi là đã chốt

Hiện tại code đang sử dụng hàm `Math.floor` để làm tròn xuống đơn vị đồng. Tuy nhiên, chưa có tài liệu chính thức xác nhận quy tắc làm tròn này là đúng yêu cầu nghiệp vụ.

*Nguồn: `project-docs/06_Communication/Chat-shopgo-checkout.md`*

### Xử lý thay đổi giỏ hàng sau khi áp mã
**Trạng thái**: Còn treo — CHƯA có xác nhận trong tài liệu nguồn, không node nào được coi là đã chốt

Hiện tại hệ thống không tự động re-check điều kiện mã giảm giá khi khách hàng thay đổi giỏ hàng sau khi đã áp mã. Vấn đề này đang được treo (chưa chốt là bug hay feature).

*Nguồn: `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`*

### Ràng buộc mã giảm giá
chỉ chữ hoa

*Nguồn: `project-docs/03_DEV/api.md`*

## Source
`project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`. Bảng bug đã biết tách riêng sang `known-issues.md` (không lặp lại ở đây).

## Consumed by
qa-test-designer, qa-automation (cross-node, đọc trực tiếp — xem role.md mỗi node).
