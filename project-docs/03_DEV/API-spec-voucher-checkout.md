# API Spec — Voucher / Mã giảm giá (Checkout)

**Dự án:** ShopGo — Nhóm tính năng D
**Phiên bản:** 0.9 (Draft)
**Ngày:** 01/07/2026
**Người viết:** Đặng Quốc Huy (Backend Lead)
**Trạng thái:** Draft — chưa review với QA
**Liên quan:** BRD-Promotion, UI-note-checkout-voucher, Epic JIRA SHOPGO-2201 (Sprint 23)

---

## 1. Endpoint tổng quan

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/v1/checkout/voucher/apply` | Áp mã giảm giá vào đơn hàng hiện tại |
| DELETE | `/api/v1/checkout/voucher` | Gỡ mã đang áp |

Hiện chưa có endpoint riêng để re-check voucher khi giỏ hàng thay đổi sau khi đã áp mã — client đang tự gọi lại `apply` mỗi lần render lại trang Checkout.

## 2. Request — POST /apply

```json
{
  "order_id": "string",
  "voucher_code": "string"
}
```

`voucher_code` được so khớp **case-sensitive, chỉ nhận chữ hoa**. Server không tự chuẩn hóa chữ hoa/thường — client (web/mobile) chịu trách nhiệm uppercase trước khi gửi lên. *(Trước Sprint 23 server có nhận cả chữ thường nhưng match sai logic — đã fix theo hướng chỉ nhận uppercase, xem BUG-1163.)*

## 3. Response — thành công

```json
{
  "status": "success",
  "voucher_code": "SALE20",
  "discount_type": "PERCENT",
  "discount_amount": 100000,
  "order_total_before": 800000,
  "order_total_after": 700000
}
```

## 4. Response — lỗi

| Error code | HTTP | Message trả về hiện tại |
|---|---|---|
| VOUCHER_NOT_FOUND | 404 | "Voucher không tồn tại" |
| VOUCHER_EXPIRED | 400 | "Mã giảm giá đã hết hạn sử dụng" |
| VOUCHER_MIN_ORDER_NOT_MET | 400 | "Đơn hàng chưa đạt giá trị tối thiểu" |
| VOUCHER_USAGE_LIMIT_REACHED | — | Chưa implement — hiện trả lỗi generic "Có lỗi xảy ra" |

## 5. Logic tính điều kiện tối thiểu (`min_order_value`)

`min_order_value` được so sánh với **tổng tiền hàng (subtotal sản phẩm)**, chưa cộng phí vận chuyển.

## 6. Trần giảm tối đa

Field `max_discount` (nếu Admin cấu hình > 0) được áp dụng chung cho **cả 2 loại mã** PERCENT và FIXED.

## 7. Hạn sử dụng mã

`expire_at` lưu dạng UTC timestamp trong DB. Điều kiện hết hạn: `now_utc > expire_at`.

## 8. Loại mã FREESHIP

Với `discount_type = "FREESHIP"`, hệ thống hiện trừ trực tiếp `discount_amount` vào `order_total_before` — dùng chung logic tính với các loại mã khác, chưa tách riêng thành khoản giảm phí vận chuyển.

## 9. Làm tròn

Số tiền giảm được làm tròn xuống (floor) tới hàng nghìn trước khi trừ vào tổng đơn.

## 10. Giới hạn theo khách hàng (mã "mua lần đầu")

Chưa có trong scope Sprint 23 — API hiện không kiểm tra số điện thoại khách hàng, mọi khách đủ điều kiện mã đều áp được không giới hạn số lần.

---

## Việc chưa xử lý / Known limitations

- Chưa có endpoint re-validate voucher khi khách sửa giỏ hàng sau khi đã áp mã.
- `VOUCHER_USAGE_LIMIT_REACHED` chưa implement đầy đủ.
- Message lỗi `VOUCHER_NOT_FOUND` chưa cập nhật theo wording mới bên UI, vẫn dùng text cũ.
