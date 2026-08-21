# UI Flow — luồng nghiệp vụ để automation lái được app

> **Viết bằng LỜI NGHIỆP VỤ bình thường. KHÔNG cần biết tên phần tử thật.**
>
> | | Cho biết | KHÔNG cho biết |
> |---|---|---|
> | File này | làm gì, theo thứ tự nào | accessible name / role / locator |
> | MCP snapshot (lúc chạy) | trên màn hình đang có những gì (cây a11y yaml) | luồng nghiệp vụ |
> | AI (lúc chạy, từng bước) | bước này ứng với node nào trong yaml đó | — |
>
> Nên **đừng** viết `bấm "Thêm vào giỏ"` với kỳ vọng đó là tên chính xác. Cứ viết
> `thêm một sản phẩm vào giỏ`. Việc tìm ra nút đó thật ra tên gì, là `button` hay `link`,
> locator thế nào — **là việc của agent**, và nó chỉ biết được khi mở browser thật.
>
> Đặt tên trong `"…"` vẫn được, nhưng đó chỉ là **gợi ý** cho AI, không phải selector.
>
> **Định dạng** (`ui-flow-parser.js` đọc deterministic): `## Flow: <tên>` → `**Entry:** <url>`
> → danh sách bước **có số**. Bước mở đầu bằng "Kiểm tra/Xác nhận…" được hiểu là bước quan sát,
> agent sẽ không đi click nó.

---

## Flow: Áp mã giảm giá khi checkout

**Entry:** https://cwshopgo.github.io/

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở trang thanh toán / giỏ hàng
3. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
4. Tiến hành thanh toán
5. Kiểm tra đơn hàng vừa tạo trong mục đơn hàng

*Nguồn: người dùng (QA) mô tả trực tiếp 2026-08-19.*

---

*(Có luồng thứ 2 thì thêm một mục `## Flow: <tên>` mới ở đây, cùng định dạng. Đừng để lại
khối mẫu rỗng — parser đọc mọi heading `## Flow:` ngoài code block là flow thật.)*

---

## CHƯA RÕ — chỉ những câu MCP soi UI cũng không trả lời được

Tên phần tử, chỗ hiển thị tổng tiền, thông báo lỗi hiện ở đâu — **không ghi ở đây**, agent tự
tìm. Chỉ những câu thuộc **nghiệp vụ** mới cần người trả lời:

| # | Câu hỏi | Vì sao cần |
|---|---|---|
| A1 | Đưa app về trạng thái sạch (giỏ trống) trước mỗi test bằng cách nào — có chức năng xoá giỏ, hay clear localStorage, hay reload là sạch? | Chạy lại test trên cùng máy không được thấy giỏ hàng của lần trước. Agent soi UI có thể thấy nút xoá, nhưng "cách nào ĐÚNG để reset" là quyết định của bạn. |
| A2 | TC-D-016 "Hệ thống tự gỡ mã" — sửa giỏ **sau khi** đã áp mã. Luồng đó đi thế nào? | Không nằm trong 5 bước trên → cần một mục `## Flow:` riêng. |
