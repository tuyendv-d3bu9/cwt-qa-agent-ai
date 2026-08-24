# Project Knowledge: UI Flows

## Type
Fact / Navigation (chưng cất từ tài liệu luồng của dự án)

## Content



### Luồng: Áp mã giảm giá khi checkout
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng | action |
| 2 | Mở trang thanh toán / giỏ hàng | action |
| 3 | Nhập mã giảm giá vào ô nhập mã rồi áp dụng | action |
| 4 | Tiến hành thanh toán | action |
| 5 | Kiểm tra đơn hàng vừa tạo trong mục đơn hàng | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

## Source
Xem dòng *Nguồn* của từng mục bên trên.

## Consumed by
Node thiết kế test (viết Steps bám luồng thật) và tự động hoá (lái browser theo đúng đường).
