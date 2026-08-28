# Bảng phí vận chuyển — ShopGo

**Ban hành:** Phòng Vận hành
**Hiệu lực từ:** 01/05/2026
**Đối tác vận chuyển:** GHN, Viettel Post

---

## 1. Biểu phí theo khu vực

| Mã khu vực | Khu vực giao hàng | Phí vận chuyển | Thời gian dự kiến |
|---|---|---|---|
| Z1 | Nội thành Hà Nội, TP.HCM | 20.000đ | 1 - 2 ngày |
| Z2 | Ngoại thành HN, HCM và các tỉnh lân cận | 30.000đ | 2 - 3 ngày |
| Z3 | Các tỉnh miền Trung | 35.000đ | 3 - 4 ngày |
| Z4 | Các tỉnh còn lại | 45.000đ | 4 - 5 ngày |
| Z5 | Vùng sâu, vùng xa, hải đảo | 65.000đ | 5 - 7 ngày |

## 2. Miễn phí vận chuyển theo chính sách chung

Đơn hàng có **giá trị tiền hàng từ 800.000đ trở lên** được miễn phí vận chuyển toàn quốc (áp dụng Z1 - Z4).

Khu vực Z5 không áp dụng chính sách miễn phí này, khách hàng vẫn thanh toán phí theo bảng trên.

## 3. Phụ phí

| Loại | Mức phụ phí | Ghi chú |
|---|---|---|
| Hàng cồng kềnh (> 20kg hoặc > 60cm) | +15.000đ | Cộng vào phí vận chuyển |
| Giao hàng nhanh trong ngày (Z1) | +25.000đ | Khách chọn thêm khi đặt |
| Thu hộ COD | Miễn phí | |

## 4. Ghi chú

- Phí vận chuyển được tính sau khi khách hàng chọn địa chỉ giao tại bước Thanh toán.
- Phí vận chuyển hiển thị riêng một dòng trong khối Tổng kết đơn hàng.
- Biểu phí có thể thay đổi theo thoả thuận với đối tác vận chuyển; Phòng Vận hành sẽ thông báo trước 15 ngày.

## 5. Phụ lục — áp dụng cho web ShopGo Store v2.0

**Ban hành:** 27/08/2026, theo yêu cầu của QA tại Sprint Planning S25 (mục 3).

Bản web `ShopGo Store v2.0` (https://cwshopgo.github.io/) **chưa nối với biểu phí đối tác** ở mục
1–3. Bản này dùng một quy tắc rút gọn, và **QA test theo quy tắc rút gọn này**:

| | Mục 1 - 3 (chính sách đầy đủ) | **Store v2.0 (đang chạy)** |
|---|---|---|
| Khu vực giao hàng | 5 khu vực Z1 - Z5, phí 20.000đ - 65.000đ | **Không có.** Không có bước chọn địa chỉ. |
| Phí vận chuyển | Theo khu vực | **Phẳng 30.000đ** |
| Ngưỡng miễn phí | Từ **800.000đ** (trừ Z5) | **Từ 200.000đ**, không trừ khu vực nào |
| Phụ phí (cồng kềnh, giao nhanh) | Có | **Không có** |

Hai điểm QA hỏi và đã được Dev Lead xác nhận:

- Ngưỡng là **"từ 200.000đ trở lên"** — đơn đúng 200.000đ **được** miễn phí ship.
- Ngưỡng tính trên **tiền hàng trước khi trừ mã giảm giá**. Áp mã không làm đơn tụt xuống mức
  phải trả phí ship.

> Khoảng cách giữa mục 1–3 và mục 5 là **chênh lệch đã biết giữa app demo và chính sách thật**,
> không phải bug của app. Dự kiến khớp lại ở sprint sau (S24 action B4 trở đi).
>
> Chi tiết hành vi: `project-docs/03_DEV/Spec-ShopGo-Store-v2.md` mục 5.
