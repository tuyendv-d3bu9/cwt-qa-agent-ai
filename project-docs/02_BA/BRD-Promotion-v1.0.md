# BRD — Nhóm tính năng D: Khuyến mãi & Mã giảm giá

**Dự án:** ShopGo (SME Retail Web)
**Phiên bản:** 1.0
**Ngày:** 12/03/2026
**Người viết:** Ng. T. Hà (BA)
**Trạng thái:** Approved — PO ký duyệt 15/03/2026
**File gốc:** `\\shared\ShopGo\03_BA\BRD_Promotion_v1.0.docx`

---

## 1. Mục đích

Cho phép khách hàng nhập mã giảm giá tại bước Thanh toán để được giảm trừ vào giá trị đơn hàng.

## 2. Đối tượng sử dụng

Khách hàng **đã đăng nhập** tại bước Thanh toán. Khách vãng lai phải đăng nhập trước khi vào trang Thanh toán.

## 3. Business Rules

### 3.1 Loại mã

| Loại | Cách tính |
|---|---|
| Giảm theo phần trăm | Số tiền giảm = giá trị đơn × % |
| Giảm số tiền cố định | Số tiền giảm = số tiền quy định của mã |

### 3.2 Điều kiện áp dụng

- Mã phải tồn tại và đang hiệu lực.
- Chưa quá ngày hết hạn của mã.
- **Tổng giá trị đơn hàng (đã bao gồm phí vận chuyển)** phải đạt mức tối thiểu quy định của mã.

### 3.3 Số lượng mã

Mỗi đơn hàng áp dụng **01 mã duy nhất**.

### 3.4 Hiển thị kết quả

- Thành công: hiển thị số tiền được giảm và tổng tiền mới.
- Thất bại: hiển thị thông báo lỗi tương ứng.

## 4. Luồng chính

1. Khách hàng đăng nhập và vào trang Thanh toán.
2. Nhập mã vào ô "Mã giảm giá", bấm "Áp dụng".
3. Hệ thống kiểm tra và cập nhật tổng tiền.

## 5. Ghi chú

Bản này áp dụng cho release đầu tiên (Sprint 18). Các yêu cầu mở rộng sẽ được xử lý qua Change Request.
