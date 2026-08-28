# Project Knowledge: UI Flows — ShopGo

## Type
Fact / Navigation (chưng cất từ tài liệu luồng của dự án)

## Content



### Quy ước nghiệp vụ của app (người dùng xác nhận)
Những điều dưới đây **người dùng / PO đã trả lời**, không phải agent suy ra. Chúng đổi cách
automation được viết, nên ghi lại ở đây thay vì để trong đầu ai đó.

### Đưa app về trạng thái sạch — ĐÃ ĐỔI Ở v2.0

Bản trước ghi *"chỉ cần vào lại trang là sạch"*. **Ở v2.0 câu đó chỉ còn đúng một nửa.**

| Thứ | Vào lại trang có sạch không? |
|---|---|
| Giỏ hàng | **Sạch** — giỏ chỉ nằm trong bộ nhớ trang |
| Mã đang áp | **Sạch** |
| **Phiên đăng nhập** | **KHÔNG sạch** — vẫn còn đăng nhập |
| **Lịch sử đơn hàng** | **KHÔNG sạch** — đơn cũ vẫn nằm đó |

Hệ quả cho automation:

- Test case cần trạng thái **chưa đăng nhập** thì **không thể** chỉ mở lại trang. Phải xoá dữ liệu
  lưu của trình duyệt cho site này.
- Test case cần trạng thái **đã đăng nhập** thì không bắt buộc đi qua màn đăng nhập mỗi lần — có
  thể nạp sẵn phiên. Đây là việc của tầng automation, không phải bước nghiệp vụ.
- Test case đếm số đơn trong mục Đơn hàng phải tính tới **đơn của các test case chạy trước**.
  Đừng viết "kiểm tra có đúng 1 đơn".

### GIỮA CÁC BƯỚC trong cùng một luồng: TUYỆT ĐỐI không điều hướng lại

Vào lại trang giữa luồng = **mất giỏ hàng vừa dựng**, và những bước sau chạy trên một giỏ trống.

Không phải lo xa: đúng lỗi đó đã xảy ra thật ngày 2026-08-17. Một rule trong `step-planner` khớp
cả bước "Vào checkout" (câu không có URL nào) rồi gọi `browser_navigate` về trang chủ **giữa
luồng** — một trong ba nguyên nhân gốc của 9 test lỗi và 5 ca timeout.

Ở v2.0 hậu quả còn khó thấy hơn: điều hướng lại **không** làm mất đăng nhập, nên màn hình trông
vẫn "đúng", chỉ có giỏ là trống. Test đi tiếp và đỏ ở một chỗ chẳng liên quan.

### Mã giảm giá đang áp — nhìn vào đâu để biết

Ngay tại chỗ nhập mã: áp thành công thì có dòng thông báo **áp dụng thành công** kèm mức giảm, và
có nút **gỡ mã**. Áp hỏng thì có dòng cảnh báo nêu lý do (không tồn tại / hết hạn / chưa đạt tối
thiểu).

Nên "mã còn đang áp hay không" là quan sát được trực tiếp — dùng cho cả gỡ mã bằng tay lẫn kiểm
chứng hành vi khi giỏ tụt xuống dưới mức tối thiểu.

*(Các tên trong ngoặc kép chỉ là **gợi ý** cho AI, không phải selector — xem bảng đầu file.)*

### Đăng nhập bằng tài khoản nào

App có sẵn tài khoản mẫu và **không kiểm tra mật khẩu** (xem `Spec-ShopGo-Store-v2.md` mục 2.2–2.3).
Bước "Đăng nhập bằng tài khoản khách hàng" trong các luồng trên là **một bước nghiệp vụ**; agent tự
tìm cách thực hiện trên UI thật.

---

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Khách chưa đăng nhập bị chặn ở giỏ hàng
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng | action |
| 2 | Mở giỏ hàng / trang thanh toán | action |
| 3 | Kiểm tra màn hình yêu cầu đăng nhập thay vì mở giỏ hàng | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Đăng nhập rồi áp mã giảm giá và đặt hàng
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng | action |
| 2 | Đăng nhập bằng tài khoản khách hàng | action |
| 3 | Mở giỏ hàng / trang thanh toán | action |
| 4 | Nhập mã giảm giá vào ô nhập mã rồi áp dụng | action |
| 5 | Kiểm tra mã đang ở trạng thái áp dụng thành công | check |
| 6 | Đặt hàng | action |
| 7 | Kiểm tra đơn hàng vừa tạo trong mục đơn hàng | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Áp mã khi đơn chưa đạt giá trị tối thiểu
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm một sản phẩm có giá thấp hơn mức tối thiểu của mã vào giỏ hàng | action |
| 2 | Đăng nhập bằng tài khoản khách hàng | action |
| 3 | Mở giỏ hàng / trang thanh toán | action |
| 4 | Nhập mã giảm giá vào ô nhập mã rồi áp dụng | action |
| 5 | Kiểm tra màn hình báo đơn hàng chưa đạt mức tối thiểu | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Đổi giỏ sau khi đã áp mã (đặt hàng bị chặn)
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm sản phẩm vào giỏ cho tới khi tổng tiền đủ điều kiện tối thiểu của mã | action |
| 2 | Đăng nhập bằng tài khoản khách hàng | action |
| 3 | Mở giỏ hàng / trang thanh toán | action |
| 4 | Nhập mã giảm giá vào ô nhập mã rồi áp dụng | action |
| 5 | Kiểm tra mã đang ở trạng thái áp dụng thành công | check |
| 6 | Giảm số lượng trong giỏ cho tới khi tổng tiền xuống dưới mức tối thiểu của mã | action |
| 7 | Đặt hàng | action |
| 8 | Kiểm tra màn hình chặn lại và yêu cầu gỡ mã hoặc mua thêm | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Gỡ mã giảm giá đã áp dụng
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng | action |
| 2 | Đăng nhập bằng tài khoản khách hàng | action |
| 3 | Mở giỏ hàng / trang thanh toán | action |
| 4 | Nhập mã giảm giá vào ô nhập mã rồi áp dụng | action |
| 5 | Kiểm tra mã đang ở trạng thái áp dụng thành công | check |
| 6 | Gỡ mã giảm giá | action |
| 7 | Kiểm tra tổng tiền quay lại mức chưa giảm | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Miễn phí vận chuyển theo giá trị đơn hàng
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm sản phẩm vào giỏ sao cho tiền hàng dưới ngưỡng miễn phí vận chuyển | action |
| 2 | Đăng nhập bằng tài khoản khách hàng | action |
| 3 | Mở giỏ hàng / trang thanh toán | action |
| 4 | Kiểm tra đơn hàng đang bị tính phí vận chuyển | check |
| 5 | Tăng số lượng trong giỏ cho tới khi tiền hàng đạt ngưỡng miễn phí vận chuyển | action |
| 6 | Kiểm tra đơn hàng được miễn phí vận chuyển | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Nhập số lượng không hợp lệ trong giỏ hàng
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng | action |
| 2 | Đăng nhập bằng tài khoản khách hàng | action |
| 3 | Mở giỏ hàng / trang thanh toán | action |
| 4 | Nhập một số lượng không hợp lệ cho sản phẩm trong giỏ | action |
| 5 | Kiểm tra màn hình báo lỗi số lượng | check |
| 6 | Kiểm tra không đặt hàng được khi giỏ còn dòng lỗi | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

### Luồng: Đăng ký tài khoản mới
**Điểm bắt đầu:** https://cwshopgo.github.io/

| # | Bước | Loại |
|---|---|---|
| 1 | Mở màn hình đăng nhập | action |
| 2 | Chuyển sang mục đăng ký tài khoản | action |
| 3 | Điền thông tin đăng ký rồi gửi đi | action |
| 4 | Kiểm tra đăng ký thành công và đã ở trạng thái đăng nhập | check |

> Đây là **ý định nghiệp vụ**, không phải locator. Tên/role/locator thật của phần tử do
> `qa-automation` tìm bằng MCP lúc chạy (`tools/flow-walker.js`) và lưu ở registry.

*Nguồn: `project-docs/03_DEV/UI-flow.md`*

## Source
Xem dòng *Nguồn* của từng mục bên trên.

## Consumed by
Node thiết kế test (viết Steps bám luồng thật) và tự động hoá (lái browser theo đúng đường).
