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
>
> Một bước có **hai hành động** thì nối bằng `rồi` / `sau đó` (ví dụ *"nhập mã … **rồi** áp dụng"*).
> Parser tách ra và agent làm **cả hai**. Bỏ chữ nối là bỏ luôn hành động thứ hai — đúng lỗi đã
> làm cả bộ test "áp mã" chạy mà chưa từng bấm nút áp mã.

> **Phiên bản app:** các luồng dưới đây viết cho **ShopGo Store v2.0** (đối chiếu 2026-08-28).
> Hành vi chi tiết, công thức tiền và chuỗi thông báo: `Spec-ShopGo-Store-v2.md`.
> Bộ luồng của bản trước đã bỏ — v2.0 bắt buộc đăng nhập mới vào được giỏ hàng, nên **mọi luồng
> có liên quan tới giỏ đều phải đi qua bước đăng nhập.**

---

## Flow: Khách chưa đăng nhập bị chặn ở giỏ hàng

**Entry:** https://cwshopgo.github.io/
**Tư cách:** khách

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở giỏ hàng / trang thanh toán
3. Kiểm tra màn hình yêu cầu đăng nhập thay vì mở giỏ hàng

*Nguồn: PO xác nhận tại Sprint Planning S25 mục 1.*

> Đây là luồng **kỳ vọng bị chặn**. Bước 2 sẽ **không** đưa tới màn thanh toán, và đó mới là
> kết quả đúng. Đừng viết tiếp bước "áp mã" ở đây — không có ô nhập mã nào để mà tìm.

---

## Flow: Đăng nhập bằng tài khoản khách hàng

**Entry:** https://cwshopgo.github.io/
**Tư cách:** khách
**Tạo tư cách:** customer

1. Mở màn hình đăng nhập
2. Điền email và mật khẩu rồi gửi đi
3. Kiểm tra đã ở trạng thái đăng nhập

*Nguồn: PO xác nhận tại Sprint Planning S25 mục 1 gạch 3.*

> **Luồng này chạy MỘT LẦN cho cả bộ test**, không phải mỗi test case một lần. Kết quả của nó là
> trạng thái đăng nhập được lưu lại và nạp sẵn cho mọi luồng khai `**Tư cách:** customer`.
>
> Vì thế các luồng đó **không còn bước "đăng nhập"** nữa — nếu để lại, mỗi test case phải chép
> lại cùng một đoạn, và catalogue step phình ra một bước mà ai cũng phải nhớ gọi.

---

## Flow: Áp mã giảm giá và đặt hàng

**Entry:** https://cwshopgo.github.io/
**Tư cách:** customer

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở giỏ hàng / trang thanh toán
3. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
4. Kiểm tra mã đang ở trạng thái áp dụng thành công
5. Đặt hàng
6. Kiểm tra đơn hàng vừa tạo trong mục đơn hàng

*Nguồn: PO mô tả luồng đầy đủ của người đã đăng nhập, S25 mục 1 gạch 3.*

> Bước 5 là **checkpoint giữa luồng**, không phải trang trí. Không có nó thì một lần áp mã hỏng
> vẫn chạy tiếp tới bước 6 và kết luận trên màn hình đơn hàng — đúng vấn đề đã gặp ở bản trước.
>
> Bước 6 chạy hoạt cảnh thanh toán khoảng **3,2 giây** mới hiện biên lai. Phải chờ tới biên lai.

---

## Flow: Áp mã khi đơn chưa đạt giá trị tối thiểu

**Entry:** https://cwshopgo.github.io/
**Tư cách:** customer

1. Ở trang chủ, thêm một sản phẩm có giá thấp hơn mức tối thiểu của mã vào giỏ hàng
2. Mở giỏ hàng / trang thanh toán
3. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
4. Kiểm tra màn hình báo đơn hàng chưa đạt mức tối thiểu

---

## Flow: Đổi giỏ sau khi đã áp mã (đặt hàng bị chặn)

**Entry:** https://cwshopgo.github.io/
**Tư cách:** customer

1. Ở trang chủ, thêm sản phẩm vào giỏ cho tới khi tổng tiền đủ điều kiện tối thiểu của mã
2. Mở giỏ hàng / trang thanh toán
3. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
4. Kiểm tra mã đang ở trạng thái áp dụng thành công
5. Giảm số lượng trong giỏ cho tới khi tổng tiền xuống dưới mức tối thiểu của mã
6. Đặt hàng
7. Kiểm tra màn hình chặn lại và yêu cầu gỡ mã hoặc mua thêm

*Nguồn: PO chốt tại S25 mục 4 — đây là **feature**, không phải bug.*

> **Đổi so với bản trước.** Luồng cũ kỳ vọng *"hệ thống tự gỡ mã"*. v2.0 **không gỡ** mã: mã vẫn
> nằm trong ô, chỉ là phần giảm về 0 và **nút Đặt hàng chặn lại**. Test case nào còn ghi Expected
> Result "tự gỡ mã" là đang mô tả bản cũ.

---

## Flow: Gỡ mã giảm giá đã áp dụng

**Entry:** https://cwshopgo.github.io/
**Tư cách:** customer

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở giỏ hàng / trang thanh toán
3. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
4. Kiểm tra mã đang ở trạng thái áp dụng thành công
5. Gỡ mã giảm giá
6. Kiểm tra tổng tiền quay lại mức chưa giảm

---

## Flow: Miễn phí vận chuyển theo giá trị đơn hàng

**Entry:** https://cwshopgo.github.io/
**Tư cách:** customer

1. Ở trang chủ, thêm sản phẩm vào giỏ sao cho tiền hàng dưới ngưỡng miễn phí vận chuyển
2. Mở giỏ hàng / trang thanh toán
3. Kiểm tra đơn hàng đang bị tính phí vận chuyển
4. Tăng số lượng trong giỏ cho tới khi tiền hàng đạt ngưỡng miễn phí vận chuyển
5. Kiểm tra đơn hàng được miễn phí vận chuyển

*Nguồn: Bảng phí vận chuyển mục 5 (phụ lục Store v2.0).*

> Ngưỡng là **"từ 200.000đ trở lên"** — đơn đúng 200.000đ được miễn phí. Biên `>=`, không phải `>`.

---

## Flow: Nhập số lượng không hợp lệ trong giỏ hàng

**Entry:** https://cwshopgo.github.io/
**Tư cách:** customer

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở giỏ hàng / trang thanh toán
3. Nhập một số lượng không hợp lệ cho sản phẩm trong giỏ
4. Kiểm tra màn hình báo lỗi số lượng
5. Kiểm tra không đặt hàng được khi giỏ còn dòng lỗi

*Nguồn: S25 scope mục 4 — ô số lượng ở v2.0 là text tự do, cố ý để test hộp đen.*

---

## Flow: Đăng ký tài khoản mới

**Entry:** https://cwshopgo.github.io/
**Tư cách:** khách

1. Mở màn hình đăng nhập
2. Chuyển sang mục đăng ký tài khoản
3. Điền thông tin đăng ký rồi gửi đi
4. Kiểm tra đăng ký thành công và đã ở trạng thái đăng nhập

---

## Quy ước nghiệp vụ đã xác nhận

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

### Tư cách người dùng — khai ở đầu mỗi luồng

Mỗi luồng khai `**Tư cách:**` để nói nó chạy khi **chưa đăng nhập** (`khách`) hay khi **đã đăng
nhập** (`customer`). Đây không phải chi tiết kỹ thuật: ở v2.0 nó đổi hẳn kết quả mong đợi. Cùng
một thao tác "mở giỏ hàng" cho ra **màn giỏ hàng** hay **modal đăng nhập** tuỳ tư cách.

Luồng `Đăng nhập bằng tài khoản khách hàng` khai thêm `**Tạo tư cách:** customer` — nó là luồng
**dựng ra** trạng thái đó, chạy một lần rồi dùng lại. Các luồng khác **không lặp lại bước đăng
nhập**; trạng thái được nạp sẵn trước khi luồng bắt đầu.

App có sẵn tài khoản mẫu và **không kiểm tra mật khẩu** (xem `Spec-ShopGo-Store-v2.md` mục 2.2–2.3).
Dùng tài khoản nào là dữ liệu test, không phải bước nghiệp vụ.

---

## CHƯA RÕ — chỉ những câu MCP soi UI cũng không trả lời được

Tên phần tử, chỗ hiển thị tổng tiền, thông báo lỗi hiện ở đâu — **không ghi ở đây**, agent tự tìm.
Chỉ những câu thuộc **nghiệp vụ** mới cần người trả lời.

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| C1 | Đăng nhập không kiểm tra mật khẩu — coi là **bug** hay **giới hạn đã biết của bản demo**? | Quyết định này đổi hẳn Expected Result của test case "sai mật khẩu". Không node nào được tự chọn. (S25 mục 7) |
| C2 | Tài khoản role **vip** có ưu đãi gì khác customer không? | v2.0 không dùng `role` để tính tiền. Nếu MKT có ý định giảm giá riêng cho VIP thì cần CR. (S25 mục 7) |
