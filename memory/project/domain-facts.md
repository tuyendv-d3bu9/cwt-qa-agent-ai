# Project Knowledge: Domain Facts

## Type
Fact / Business Context (chưng cất từ tài liệu dự án)

## Content



### Ràng buộc mã giảm giá
chỉ chữ hoa

*Nguồn: `project-docs/03_DEV/api.md`*

### Bảng phí vận chuyển theo chính sách chung (01/05/2026)
Biểu phí vận chuyển chính thức áp dụng 5 khu vực (Z1: 20k, Z2: 30k, Z3: 35k, Z4: 45k, Z5: 65k). Miễn phí vận chuyển toàn quốc cho đơn hàng từ **800.000đ** trở lên (áp dụng Z1 - Z4, không áp dụng Z5). Phụ phí hàng cồng kềnh (>20kg hoặc >60cm) là +15.000đ, giao hàng nhanh trong ngày (Z1) là +25.000đ, thu hộ COD miễn phí.

*Lưu ý:* Bản web `ShopGo Store v2.0` hiện không dùng biểu phí này mà dùng quy tắc rút gọn (xem fact riêng về Store v2.0).

*Nguồn: `project-docs/01_Business/Bang-phi-van-chuyen.md`*

### Phụ lục phí vận chuyển trên ShopGo Store v2.0
Bản web `ShopGo Store v2.0` (https://cwshopgo.github.io/) áp dụng quy tắc rút gọn: không có 5 khu vực và không có bước chọn địa chỉ. Phí vận chuyển cố định **phẳng 30.000đ**. Ngưỡng miễn phí vận chuyển là **từ 200.000đ trở lên** (đơn đúng 200.000đ được miễn phí, không trừ khu vực nào). Ngưỡng này tính trên **tiền hàng trước khi trừ mã giảm giá** (áp mã không làm đơn tụt xuống mức phải trả phí ship). Không có phụ phí cồng kềnh hay giao nhanh.

Đây là chênh lệch đã biết giữa app demo và chính sách thật, QA test theo app v2.0.

*Nguồn: `project-docs/01_Business/Bang-phi-van-chuyen.md`*

### Điều kiện sử dụng mã giảm giá chung
Mã giảm giá áp dụng tại bước Thanh toán, trước khi xác nhận đặt hàng. Mỗi mã có giá trị đơn hàng tối thiểu tính trên tổng tiền hàng sau khi đã trừ khuyến mãi trực tiếp trên sản phẩm, chưa bao gồm phí vận chuyển. Theo chính sách công khai chung, mỗi đơn hàng chỉ được sử dụng 01 mã giảm giá, không cộng dồn. Mã có hiệu lực đến hết 23:59 ngày hết hạn theo giờ Việt Nam (GMT+7). Mã khách hàng mua lần đầu dùng 01 lần duy nhất, xác định qua số điện thoại đăng ký. Thay đổi giỏ hàng khiến không đủ điều kiện thì mã tự động gỡ bỏ. Huỷ đơn đã dùng mã thì mã không được hoàn lại.

*Nguồn: `project-docs/01_Business/Chinh-sach-Khuyen-mai-ShopGo.md`*

### Tổng quan dự án ShopGo & Feature Map
ShopGo là web bán lẻ trực tuyến (general retail) của khách hàng SME, CO-WELL đảm nhận QA. Vai trò người dùng gồm Khách vãng lai (Guest) và Khách hàng (Customer), cùng Nhân viên CSKH / Admin (back-office). 

Feature Map gồm 8 nhóm tính năng:
- A: Tài khoản & Xác thực
- B: Danh mục & Tìm kiếm
- C: Giỏ hàng
- D: Khuyến mãi & Mã giảm giá
- E: Thanh toán
- F: Ví ShopGo (E-Wallet)
- G: Quản lý đơn hàng
- H: Thông báo & Đánh giá

Hệ thống hỗ trợ Chrome, Edge, Safari, mobile web responsive. Tiền tệ VND.

*Nguồn: `project-docs/01_Business/ShopGo-Overview.md`*

### BRD Nhóm tính năng D (Khuyến mãi & Mã giảm giá) — v1.0
BRD phiên bản 1.0 (Approved bởi PO 15/03/2026) quy định cho phép khách hàng nhập mã giảm giá tại bước Thanh toán (yêu cầu khách đã đăng nhập). Hỗ trợ giảm theo phần trăm và số tiền cố định. Tổng giá trị đơn hàng (đã bao gồm phí vận chuyển) phải đạt mức tối thiểu. Mỗi đơn hàng áp dụng 01 mã duy nhất.

*Nguồn: `project-docs/02_BA/BRD-Promotion-v1.0.md`*

### BRD Nhóm tính năng D (Khuyến mãi & Mã giảm giá) — v1.2 (Draft)
**Trạng thái**: Còn treo — CHƯA có xác nhận trong tài liệu nguồn, không node nào được coi là đã chốt

BRD v1.2 bổ sung trần giảm tối đa (cap) cho mã PERCENT (ví dụ 20%, trần 100k, đơn 800k giảm 100k). Còn nhiều điểm TBD chờ chốt:
- Mã FIXED có cần trần không?
- Điều kiện min order tính trên tiền hàng hay tiền hàng + phí ship?
- Nội dung chính xác các thông báo lỗi (chờ UI/UX chốt wording).
- "Chuẩn hiển thị tiền tệ của hệ thống" là gì?

Chưa mô tả xử lý khi khách sửa giỏ hàng sau khi áp mã, huỷ đơn dùng mã, hoặc giới hạn số lần sử dụng.

*Nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`*

### API Spec — Voucher / Mã giảm giá (Checkout) v0.9 (Draft)
Cung cấp endpoint POST `/api/v1/checkout/voucher/apply` và DELETE `/api/v1/checkout/voucher`. Trường `voucher_code` là case-sensitive, chỉ nhận chữ hoa (client phải uppercase trước khi gửi). `min_order_value` so sánh với tổng tiền hàng (subtotal), chưa cộng phí ship. Trần giảm `max_discount` áp dụng chung cho cả PERCENT và FIXED. Hết hạn dựa trên UTC timestamp (`now_utc > expire_at`). Loại FREESHIP trừ trực tiếp vào `order_total_before`. Làm tròn xuống (floor) tới hàng nghìn trước khi trừ. Giới hạn khách hàng mua lần đầu chưa có trong scope Sprint 23.

*Nguồn: `project-docs/03_DEV/API-spec-voucher-checkout.md`*

### Spec — ShopGo Store v2.0 (App đang test thực tế)
Bản web SPA ShopGo Store v2.0 (https://cwshopgo.github.io/) có các đặc tả thực tế:
- Kiến trúc 3 tab: Cửa hàng (shop), Thanh toán (checkout), Đơn hàng (orders). Guest không xem được giỏ hàng/thanh toán/đơn hàng mà bị chặn mở modal đăng nhập.
- Đăng nhập: Không kiểm tra mật khẩu (bất kỳ pass nào khác rỗng đều vào được với email có `@`). Email mẫu: `khachhang@shopgo.vn` (customer), `vip@shopgo.vn` (vip). Email lạ tự tạo hồ sơ mới, chứa `vip` thành role vip.
- Đăng ký: Bắt buộc họ tên, email có `@`, mật khẩu ≥ 6 ký tự, xác nhận khớp.
- Danh mục: 6 sản phẩm cố định, lọc theo danh mục, tìm kiếm theo tên/danh mục.
- Giỏ hàng: Ô số lượng là text tự do (kiểm tra rỗng, chữ số nguyên, >0, không vượt tồn kho). Dòng lỗi loại khỏi tạm tính, nút Đặt hàng bị disable.
- Phí vận chuyển: Phẳng 30.000đ, miễn phí nếu tạm tính >= 200.000đ (tính trước khi trừ voucher).
- Mã giảm giá: 3 mã cứng (`GIAM50K`, `SALE20`, `HETHAN`). App tự uppercase mã khi nhập. Đổi giỏ sau khi áp mã không tự gỡ mã nhưng phần giảm về 0 và chặn ở nút Đặt hàng.
- Đặt hàng: Tạo mã đơn SG- + 6 số ngẫu nhiên, có hoạt cảnh thanh toán ~3.2 giây.
- Lưu trữ: Phiên đăng nhập và lịch sử đơn lưu `localStorage`, giỏ hàng và mã đang áp mất khi reload.

*Nguồn: `project-docs/03_DEV/Spec-ShopGo-Store-v2.md`*

### Mã voucher cố định và cập nhật Store v2.0
Các mã voucher cố định gồm GIAM50K (50k cho đơn từ 200k), SALE20 (20% cho đơn từ 300k, tối đa 100k), HETHAN (hết hạn). Cập nhật theo Store v2.0: tính năng hover dòng mã hiện nút Nạp mã đã bị tắt, chỉ còn cách gõ tay vào ô nhập mã rồi bấm Áp dụng.

*Nguồn: `project-docs/03_DEV/Spec.md`*

### UI Flow — Luồng nghiệp vụ ShopGo Store v2.0
Tài liệu UI Flow chuẩn hóa các luồng nghiệp vụ để automation thực thi trên ShopGo Store v2.0:
- Khách chưa đăng nhập bị chặn ở giỏ hàng.
- Đăng nhập rồi áp mã giảm giá và đặt hàng.
- Áp mã khi đơn chưa đạt giá trị tối thiểu.
- Đổi giỏ sau khi đã áp mã (đặt hàng bị chặn, mã không tự gỡ).
- Gỡ mã giảm giá đã áp dụng.
- Miễn phí vận chuyển theo giá trị đơn hàng (ngưỡng >= 200.000đ).
- Nhập số lượng không hợp lệ trong giỏ hàng.
- Đăng ký tài khoản mới.

Lưu ý quy tắc giữa các bước: tuyệt đối không điều hướng lại giữa luồng vì sẽ mất giỏ hàng; reload trang giữ lại phiên đăng nhập và lịch sử đơn nhưng mất giỏ hàng.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### UI Note — Khối Mã giảm giá tại trang Thanh toán
Mô tả vị trí, thành phần và wording thông báo:
- Thành công: "Áp dụng mã thành công" (màu xanh), khối tổng kết thêm dòng "Giảm giá" ... `-100.000đ`.
- Mã sai: "Mã không hợp lệ" (màu đỏ).
- Mã hết hạn: "Mã giảm giá đã hết hạn sử dụng".
- Chưa đủ điều kiện: "Đơn hàng chưa đạt giá trị tối thiểu".
Format tiền dùng dấu chấm phân cách nghìn, hậu tố `đ` (ví dụ `730.000đ`).

*Nguồn: `project-docs/04_Design/UI-note-checkout-voucher.md`*

### Trích đoạn chat kênh #shopgo-checkout
Ghi nhận trao đổi kỹ thuật:
- Làm tròn tiền giảm: dùng Math.floor.
- Quota: cột trong DB đã có nhưng code chưa implement, test áp lần thứ 6 vẫn ăn bình thường.
- Gộp mã freeship và mã giảm giá: API trả 2 object nhưng UI gộp chung 1 dòng "Giảm giá".
- Khách mua lần đầu (first-order-only): backend check theo email nhập ở form giao hàng (nhập email khác là dùng lại được).

*Nguồn: `project-docs/06_Communication/Chat-shopgo-checkout.md`*

## Source
Xem dòng *Nguồn* của từng mục bên trên.

## Consumed by
Các node thiết kế test và tự động hoá (đọc trực tiếp — xem role.md từng node).
