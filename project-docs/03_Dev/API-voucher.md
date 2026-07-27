# API nội bộ — Checkout Voucher

*(File này do Dev tự viết trong repo, đường dẫn `docs/api/voucher.md`. Không phải tài liệu chính thức, cập nhật lần cuối 08/07/2026 — Sơn.)*

## POST /api/v1/checkout/voucher/apply

Áp mã giảm giá vào đơn hàng đang ở trạng thái checkout.

### Request

```json
{
  "cart_id": "CART-90218",
  "voucher_code": "SALE20CAP",
  "subtotal": 800000,
  "shipping_fee": 30000,
  "customer_email": "user@example.com",
  "customer_tier": "NORMAL"
}
```

| Field | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| cart_id | string | Y | |
| voucher_code | string | Y | không phân biệt hoa thường |
| subtotal | number | Y | tiền hàng, chưa gồm ship |
| shipping_fee | number | Y | |
| customer_email | string | N | dùng cho mã first-order |
| customer_tier | string | N | hiện luôn trả NORMAL, chưa dùng |

### Response — thành công

```json
{
  "success": true,
  "applied": [
    {
      "voucher_code": "SALE20CAP",
      "voucher_type": "PERCENT",
      "discount_amount": 100000,
      "capped": true
    }
  ],
  "subtotal": 800000,
  "discount_total": 100000,
  "shipping_fee": 30000,
  "grand_total": 730000
}
```

> `applied` là mảng để chuẩn bị cho việc áp 2 mã (mã đơn hàng + mã freeship). Hiện tại FE đang chỉ đọc phần tử đầu tiên.

### Response — lỗi

```json
{
  "success": false,
  "error_code": "VOUCHER_INVALID",
  "message": "Voucher không hợp lệ"
}
```

### Bảng error code

| error_code | Khi nào |
|---|---|
| VOUCHER_INVALID | mã không tồn tại hoặc status khác ACTIVE |
| VOUCHER_EXPIRED | quá `expired_at` |
| MIN_ORDER_NOT_MET | subtotal nhỏ hơn min_order_value |

*(TODO: còn mấy case nữa chưa có code riêng, đang trả tạm về VOUCHER_INVALID. Sẽ bổ sung sau.)*

## Ghi chú kỹ thuật

- `expired_at` lưu trong DB dạng `TIMESTAMP` chuẩn UTC.
- `discount_amount` tính bằng `Math.floor()` trước khi trả về.
- Mã freeship trừ vào `shipping_fee`, không trừ vào `subtotal`.
- API **không** kiểm tra lại khi giỏ hàng thay đổi. FE phải tự gọi lại `/apply` nếu cart đổi.
- Chưa implement kiểm tra `quota_total` / `quota_used`.

## DELETE /api/v1/checkout/voucher/{code}

Gỡ mã đã áp. Trả về response giống `/apply`.
