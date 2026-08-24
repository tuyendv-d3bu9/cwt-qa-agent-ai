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

### Quy ước nghiệp vụ của app (người dùng xác nhận)
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

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

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

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Sửa giỏ hàng sau khi đã áp mã (hệ thống tự gỡ mã)
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm sản phẩm vào giỏ cho tới khi tổng tiền đủ điều kiện Min Order của mã | action |
| 2 | Mở trang thanh toán / giỏ hàng | action |
| 3 | Nhập mã giảm giá vào ô nhập mã rồi áp dụng | action |
| 4 | Kiểm tra mã đang ở trạng thái đang kích hoạt | check |
| 5 | Bớt hàng trong giỏ cho tới khi tổng tiền xuống dưới Min Order của mã | action |
| 6 | Kiểm tra mã đã không còn ở trạng thái đang kích hoạt | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

## Source
Xem dòng *Nguồn* của từng mục bên trên.

## Consumed by
Node thiết kế test (viết Steps bám luồng thật) và tự động hoá (lái browser theo đúng đường).
