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

### Flow: Áp mã giảm giá khi checkout
**Trạng thái**: Còn treo — CHƯA có xác nhận trong tài liệu nguồn, không node nào được coi là đã chốt

Luồng nghiệp vụ áp mã giảm giá tại trang thanh toán:
- **Entry:** `https://cwshopgo.github.io/`
- Các bước: 1. Thêm sản phẩm bất kỳ vào giỏ hàng ở trang chủ; 2. Mở trang thanh toán / giỏ hàng; 3. Nhập mã giảm giá vào ô nhập mã rồi áp dụng; 4. Tiến hành thanh toán; 5. Kiểm tra đơn hàng vừa tạo trong mục đơn hàng.
- *Nguồn:* người dùng (QA) mô tả trực tiếp 2026-08-19.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Câu hỏi cần làm rõ về UI Flow và trạng thái hệ thống
**Trạng thái**: Còn treo — CHƯA có xác nhận trong tài liệu nguồn, không node nào được coi là đã chốt

Các vấn đề chưa rõ cần giải quyết từ tài liệu UI-flow.md:

| # | Câu hỏi | Vì sao cần |
|---|---|---|
| A1 | Đưa app về trạng thái sạch (giỏ trống) trước mỗi test bằng cách nào — có chức năng xoá giỏ, hay clear localStorage, hay reload là sạch? | Chạy lại test trên cùng máy không được thấy giỏ hàng của lần trước. Agent soi UI có thể thấy nút xoá, nhưng "cách nào ĐÚNG để reset" là quyết định của bạn. |
| A2 | TC-D-016 "Hệ thống tự gỡ mã" — sửa giỏ **sau khi** đã áp mã. Luồng đó đi thế nào? | Không nằm trong các bước chính → cần bổ sung mục `## Flow:` riêng. |

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### API Spec — Voucher / Mã giảm giá (Checkout)
API spec cho tính năng voucher checkout (Sprint 23, ShopGo Nhóm tính năng D):
- **Endpoint:** `POST /api/v1/checkout/voucher/apply`, `DELETE /api/v1/checkout/voucher`. Chưa có endpoint riêng re-check voucher.
- **Định dạng mã:** `voucher_code` so khớp case-sensitive, **chỉ nhận chữ hoa**. Client tự uppercase trước khi gửi (fix BUG-1163).
- **Điều kiện tối thiểu (`min_order_value`):** So sánh với tổng tiền hàng (subtotal sản phẩm), chưa cộng phí ship.
- **Trần giảm tối đa:** `max_discount` áp dụng chung cho cả `PERCENT` và `FIXED`.
- **Hạn sử dụng:** `expire_at` lưu UTC, điều kiện hết hạn là `now_utc > expire_at`.
- **Loại mã FREESHIP:** Trừ trực tiếp `discount_amount` vào `order_total_before` dùng chung logic.
- **Làm tròn:** Làm tròn xuống (floor) tới hàng nghìn trước khi trừ vào tổng đơn.
- **Giới hạn khách hàng:** Chưa có trong scope Sprint 23 (không giới hạn số lần).
- **Known limitations:** Chưa có endpoint re-validate, `VOUCHER_USAGE_LIMIT_REACHED` chưa implement đầy đủ, message lỗi `VOUCHER_NOT_FOUND` chưa cập nhật wording UI.

*Nguồn: `project-docs/03_DEV/API-spec-voucher-checkout.md`*

### UI Flow — Luồng nghiệp vụ và quy ước checkout voucher
UI flow và quy ước nghiệp vụ cho automation và kiểm thử:
- **Flow 1:** Áp mã giảm giá khi checkout (Thêm sản phẩm -> Mở giỏ/thanh toán -> Nhập mã áp dụng -> Thanh toán -> Kiểm tra đơn hàng).
- **Flow 2:** Sửa giỏ hàng sau khi đã áp mã (Thêm đủ min order -> Nhập mã -> Kiểm tra kích hoạt -> Bớt hàng xuống dưới min order -> Kiểm tra mã không còn kích hoạt).
- **Đưa app về trạng thái sạch:** Mở lại Entry URL là đủ (không cần bấm reset hay clear localStorage). **Giữa các bước trong luồng: TUYỆT ĐỐI không điều hướng lại** vì sẽ làm mất giỏ hàng.
- **Nhận diện mã đang áp:** Quan sát trạng thái "Đang kích hoạt giảm giá" và nút "Gỡ mã" ngay dưới ô nhập mã.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Danh sách mã voucher cố định
Hệ thống hỗ trợ các mã voucher cố định sau:
- `GIAM50K`: Giảm ngay 50.000 VNĐ cho đơn hàng tối thiểu từ 200.000 VNĐ.
- `SALE20`: Giảm 20% giá trị đơn hàng cho đơn từ 300.000 VNĐ (Mức giảm tối đa là 100.000 VNĐ).
- `HETHAN`: Mã giảm giá đã hết hạn sử dụng.

*Nguồn: `project-docs/03_DEV/Spec.md`*

## Source
`project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`. Bảng bug đã biết tách riêng sang `known-issues.md` (không lặp lại ở đây).

## Consumed by
qa-test-designer, qa-automation (cross-node, đọc trực tiếp — xem role.md mỗi node).
