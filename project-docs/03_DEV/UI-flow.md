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

## Flow: Sửa giỏ hàng sau khi đã áp mã (hệ thống tự gỡ mã)

**Entry:** https://cwshopgo.github.io/

1. Ở trang chủ, thêm sản phẩm vào giỏ cho tới khi tổng tiền đủ điều kiện Min Order của mã
2. Mở trang thanh toán / giỏ hàng
3. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
4. Kiểm tra mã đang ở trạng thái đang kích hoạt
5. Bớt hàng trong giỏ cho tới khi tổng tiền xuống dưới Min Order của mã
6. Kiểm tra mã đã không còn ở trạng thái đang kích hoạt

*Nguồn: người dùng (QA) trả lời 2026-08-23, khớp với test case TC-D-016 ("Thay đổi giỏ hàng
sau khi áp mã" → Expected: "Hệ thống tự gỡ mã").*

---

## Flow: Nạp mã nhanh từ danh sách gợi ý

**Entry:** https://cwshopgo.github.io/

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở trang thanh toán / giỏ hàng
3. Bấm Nạp mã trên thẻ voucher gợi ý GIAM50K
4. Tiến hành thanh toán
5. Kiểm tra đơn hàng vừa tạo trong mục đơn hàng

---

## Flow: Gỡ mã giảm giá đã áp dụng

**Entry:** https://cwshopgo.github.io/

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở trang thanh toán / giỏ hàng
3. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
4. Bấm Gỡ mã
5. Kiểm tra trạng thái mã giảm giá đã được gỡ

---

## Quy ước nghiệp vụ đã xác nhận

Những điều dưới đây **người dùng đã trả lời**, không phải agent suy ra. Chúng đổi cách
automation được viết, nên ghi lại ở đây thay vì để trong đầu ai đó.

### Đưa app về trạng thái sạch

**Chỉ cần vào lại trang là sạch. Không có chức năng reset nào phải bấm.**
Web test **không có database** — mọi thứ (giỏ hàng, mã đang áp) chỉ nằm trong phiên trình duyệt.

Hai hệ quả trái ngược nhau, và **cả hai đều quan trọng**:

| | |
|---|---|
| **Giữa các test case** | Mở lại Entry là đủ để có giỏ trống. Không cần tìm nút "xoá giỏ", không cần clear localStorage. |
| **GIỮA CÁC BƯỚC trong cùng một luồng** | **TUYỆT ĐỐI không điều hướng lại.** Vào lại trang giữa luồng = **mất giỏ hàng vừa tạo**, và những bước sau chạy trên một giỏ trống. |

Chỗ thứ hai không phải lo xa: đúng lỗi đó đã xảy ra thật ngày 2026-08-17. Một rule trong
`step-planner` khớp cả bước "Vào checkout" (câu không có URL nào) rồi gọi `browser_navigate`
về trang chủ **giữa luồng** — đó là một trong ba nguyên nhân gốc của 9 test lỗi và 5 ca timeout.
Với app không có DB thì một lần điều hướng sai là mất toàn bộ trạng thái đã dựng.

### Mã giảm giá đang áp — nhìn vào đâu để biết

Ngay tại chỗ nhập mã: khi mã được kích hoạt thì có trạng thái **"Đang kích hoạt giảm giá"** và
ngay dưới đó là nút **"Gỡ mã"**.

Nên "mã còn đang áp hay không" là quan sát được trực tiếp — dùng cho cả gỡ mã bằng tay lẫn kiểm
chứng việc hệ thống **tự** gỡ mã (bước 6 của luồng thứ 2).

*(Hai tên trong ngoặc kép chỉ là **gợi ý** cho AI, không phải selector — xem bảng đầu file.)*

---

## CHƯA RÕ — chỉ những câu MCP soi UI cũng không trả lời được

Tên phần tử, chỗ hiển thị tổng tiền, thông báo lỗi hiện ở đâu — **không ghi ở đây**, agent tự
tìm. Chỉ những câu thuộc **nghiệp vụ** mới cần người trả lời.

**Hiện không còn câu nào chờ trả lời.** (A1 và A2 đã được trả lời 2026-08-23 — xem mục "Quy ước
nghiệp vụ đã xác nhận" và luồng thứ 2 ở trên.)
