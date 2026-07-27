# UI Note — Khối "Mã giảm giá" tại trang Thanh toán

**Người gửi:** Vũ Đức Anh (UI/UX)
**Ngày:** 24/06/2026
**Kèm theo:** `checkout_voucher_v3.fig`, 4 ảnh chụp màn hình (không đính kèm trong bản export này)

---

## Vị trí

Khối "Mã giảm giá" nằm trong cột phải, ngay phía trên khối "Tổng kết đơn hàng", dưới khối "Phương thức thanh toán".

Trên mobile web, khối này nằm dưới danh sách sản phẩm, phía trên nút Đặt hàng.

## Thành phần

| Thành phần | Mô tả |
|---|---|
| Label | "Mã giảm giá" |
| Input | placeholder "Nhập mã giảm giá", chữ tự động in hoa khi nhập |
| Nút | "Áp dụng" — disable khi input rỗng |
| Vùng thông báo | dưới input, ẩn khi chưa có thao tác |
| Dòng giảm giá | trong khối Tổng kết, chỉ hiện khi áp thành công |

## Wording

Ảnh 1 (màn hình thành công):

- Vùng thông báo: **"Áp dụng mã thành công"** — màu xanh
- Khối tổng kết hiện thêm dòng: **"Giảm giá"** ... `-100.000đ`

Ảnh 2 (mã sai):

- Vùng thông báo: **"Mã không hợp lệ"** — màu đỏ

Ảnh 3 (mã hết hạn):

- Vùng thông báo: **"Mã giảm giá đã hết hạn sử dụng"**

Ảnh 4 (chưa đủ điều kiện):

- Vùng thông báo: **"Đơn hàng chưa đạt giá trị tối thiểu"**

## Ghi chú thêm của Đức Anh

- Bản v2 trước đây dùng "Voucher không tồn tại", bản v3 đổi thành "Mã không hợp lệ" cho ngắn. Anh Dũng nói code đang trả về message từ API nên có thể vẫn ra text cũ, nhờ dev sửa.
- Format tiền: dùng dấu chấm phân cách nghìn, hậu tố `đ` (ví dụ `730.000đ`). Không dùng "VNĐ" trong khối tổng kết.
- Trường hợp áp 2 mã cùng lúc: **chưa có design**. Đề nghị BA làm rõ trước khi tôi vẽ.
- Trạng thái loading khi bấm Áp dụng: chưa vẽ, dev tự xử lý.
- Nút gỡ mã đã áp: có trong Figma (icon ✕ cạnh dòng Giảm giá) nhưng chưa có wording xác nhận.
