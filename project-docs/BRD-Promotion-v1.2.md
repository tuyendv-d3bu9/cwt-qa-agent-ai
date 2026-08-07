# BRD — Nhóm tính năng D: Khuyến mãi & Mã giảm giá
**Dự án:** ShopGo (SME Retail Web)
**Người viết:** Ng. T. Hà (BA)
**Trạng thái:** Draft — đang review
**File gốc:** `\\shared\ShopGo\03_BA\BRD_Promotion_v1.2.docx`

## Version history

| Ver | Ngày | Người sửa | Nội dung thay đổi |
|---|---|---|---|
| 1.0 | 12/03/2026 | Hà (BA) | Bản đầu, mô tả áp voucher tại checkout |
| 1.1 | 28/04/2026 | Hà (BA) | Bổ sung mục 4.3 (cộng dồn), 4.5 (thông báo lỗi) |
| 1.2 | 19/06/2026 | Hà (BA) | Bổ sung trần giảm tối đa theo yêu cầu Marketing |

> Ghi chú của người viết: bản 1.2 chưa được PO ký duyệt. Một số mục còn TBD, sẽ chốt trong Sprint Planning gần nhất.

---

## 1. Mục đích

Cho phép khách hàng nhập mã giảm giá tại bước Thanh toán để được giảm trừ vào giá trị đơn hàng, phục vụ các chiến dịch marketing của khách hàng SME.

## 2. Phạm vi

- Trong phạm vi: ô nhập mã + nút Áp dụng tại trang Thanh toán; tính toán số tiền giảm; hiển thị kết quả.
- Ngoài phạm vi: màn hình tạo/sửa mã ở back-office (Admin tự quản lý).

## 3. Đối tượng sử dụng

Khách hàng đã đăng nhập tại bước Thanh toán.

> *(Xem thêm Overview mục 3: "Khách vãng lai — phải đăng nhập khi thanh toán")*

## 4. Business Rules

### 4.1 Loại mã

Hệ thống hỗ trợ 2 loại mã:

| Loại | Ký hiệu | Cách tính |
|---|---|---|
| Giảm theo phần trăm | PERCENT | Số tiền giảm = giá trị đơn × % |
| Giảm số tiền cố định | FIXED | Số tiền giảm = số tiền quy định của mã |

### 4.2 Trần giảm tối đa (bổ sung v1.2)

Với mã loại PERCENT, có thể cấu hình **trần giảm tối đa**. Nếu số tiền giảm tính ra lớn hơn trần, chỉ giảm bằng trần.

Ví dụ Marketing đưa: mã 20%, trần 100.000đ, đơn 800.000đ → giảm 100.000đ (không phải 160.000đ).

**TBD:** mã loại FIXED có cần trần không? — Marketing nói không cần, nhưng bảng cấu hình bên Admin vẫn có cột này. *@Dev confirm lại giúp.*

### 4.3 Cộng dồn mã

Mỗi đơn hàng chỉ áp dụng được **01 mã giảm giá**. Không cho phép cộng dồn nhiều mã trên cùng một đơn.

> *Ghi chú v1.1: rule này được đưa ra để đơn giản hoá cho release đầu. Marketing có phản hồi nhưng chưa có quyết định chính thức.*

### 4.4 Điều kiện áp dụng

Mã chỉ áp dụng được khi:

- (a) Mã tồn tại trong hệ thống và đang ở trạng thái Active.
- (b) Chưa quá ngày hết hạn. Mã có hiệu lực đến hết **23:59 ngày hết hạn**.
- (c) Giá trị đơn hàng đạt mức tối thiểu quy định của mã.

**TBD:** "giá trị đơn hàng" ở điều kiện (c) được hiểu là tiền hàng, hay tiền hàng + phí vận chuyển? Đang chờ xác nhận từ PO.

### 4.5 Thông báo kết quả

- Áp dụng thành công: hiển thị số tiền được giảm và tổng tiền mới.
- Mã không hợp lệ hoặc hết hạn: hiển thị thông báo lỗi.

**TBD:** Nội dung chính xác của các thông báo lỗi — chờ team UI/UX chốt wording.

### 4.6 Làm tròn

Số tiền giảm hiển thị theo đơn vị VNĐ. Quy ước làm tròn theo chuẩn hiển thị tiền tệ của hệ thống.

> *@Dev: "chuẩn hiển thị tiền tệ của hệ thống" là gì? Có tài liệu riêng không?*

## 5. Luồng chính

1. Khách hàng vào trang Thanh toán.
2. Nhập mã vào ô "Mã giảm giá".
3. Bấm nút "Áp dụng".
4. Hệ thống kiểm tra mã theo các điều kiện mục 4.4.
5. Nếu hợp lệ: cập nhật phần Tổng kết đơn hàng.
6. Nếu không hợp lệ: hiển thị thông báo lỗi, giữ nguyên tổng tiền.

## 6. Chưa mô tả trong bản này

- Xử lý khi khách sửa giỏ hàng sau khi đã áp mã.
- Xử lý khi khách huỷ đơn đã dùng mã.
- Giới hạn số lần sử dụng của một mã.
