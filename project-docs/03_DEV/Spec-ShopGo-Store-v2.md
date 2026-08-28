# Spec — ShopGo Store v2.0 (ứng dụng web đang được test)

**Entry:** https://cwshopgo.github.io/
**Phiên bản hiển thị trên header:** `ShopGo Store v2.0`
**Ngày đối chiếu:** 2026-08-28

> **Nguồn của tài liệu này.** Toàn bộ số liệu và chuỗi thông báo dưới đây được **đọc trực tiếp
> từ bundle production** (`/assets/index-*.js`) của chính site đang test, không phải suy đoán và
> không phải mô tả mong muốn. Khi tài liệu này mâu thuẫn với BRD / API-spec / biên bản cũ, **cái
> đang chạy thật thắng** — nhưng mâu thuẫn đó vẫn phải được ghi thành test case, xem mục 10.
>
> **Đây KHÔNG phải danh sách locator.** Tên nút và id ghi ở mục 9 là để người đọc đối chiếu, còn
> automation vẫn phải tự tìm phần tử bằng MCP lúc chạy (xem `UI-flow.md`).

---

## 1. Kiến trúc và điều hướng

SPA một trang, không đổi URL. Ba tab, chuyển bằng nút trên header:

| Tab | Nhãn nút | Guest vào được? |
|---|---|---|
| `shop` | Cửa hàng | Có |
| `checkout` | Thanh toán | **Không** — mở modal đăng nhập |
| `orders` | Đơn hàng | **Không** — mở modal đăng nhập |

Vì URL không đổi theo tab, **không có cách nào deep-link thẳng vào giỏ hàng**. Muốn tới màn
thanh toán thì phải bấm qua header, và phải đăng nhập trước.

## 2. Xác thực (mục A trong Feature Map)

### 2.1 Chỗ nào bị chặn

| Hành vi | Chưa đăng nhập | Đã đăng nhập |
|---|---|---|
| Xem danh sách sản phẩm, tìm kiếm, lọc danh mục | Được | Được |
| **Thêm vào giỏ** | **Được** | Được |
| Thấy số lượng trên badge giỏ hàng | Được | Được |
| **Xem giỏ hàng / màn Thanh toán** | **Bị chặn** → modal đăng nhập | Được |
| Áp mã giảm giá | Bị chặn (nằm trong màn Thanh toán) | Được |
| Đặt hàng | Bị chặn | Được |
| Xem Đơn hàng | Bị chặn | Được |

Đây là điểm khác lớn nhất so với bản trước: giỏ hàng **dựng được nhưng không xem được**. Một test
case guest chỉ "thêm vào giỏ rồi kiểm tra tổng tiền" là **không chạy được** — không có màn nào để
đọc tổng tiền.

Câu nhắc trong modal khi bị chặn ở bước thanh toán:
`Vui lòng đăng nhập để tiến hành thanh toán đơn hàng.`

Modal cũng khẳng định giỏ không bị mất: *"Giỏ hàng và mã giảm giá của bạn sẽ được lưu nguyên vẹn
để tiếp tục thanh toán ngay sau khi đăng nhập."* Sau khi đăng nhập, app **tự chuyển sang tab mà
người dùng đang định vào**.

### 2.2 Đăng nhập

Modal có 2 tab: **Đăng nhập** / **Đăng ký**, thêm liên kết quên mật khẩu.

**Quy tắc kiểm tra khi đăng nhập** (theo đúng thứ tự trong code):

1. Email hoặc mật khẩu để trống → `Vui lòng nhập đầy đủ Email và Mật khẩu.`
2. Email không chứa `@` → `Định dạng email không hợp lệ (cần có ký tự @).`
3. Còn lại → **thành công**.

> **Mật khẩu KHÔNG được kiểm tra.** Đây là app demo: bất kỳ mật khẩu khác rỗng nào cũng đăng nhập
> được, với bất kỳ email nào có `@`. Đừng viết test case "sai mật khẩu → báo lỗi" — hiện trạng là
> đăng nhập thành công. Nếu muốn bắt lỗi này thì viết test case với Expected Result **theo yêu cầu**
> rồi để nó fail có chủ đích, và ghi rõ đó là bug, chứ không phải viết Expected Result theo hiện
> trạng rồi báo xanh.

Email nằm trong danh sách tài khoản mẫu → lấy đúng hồ sơ đó. Email khác → app **tự tạo** một hồ sơ
mới tại chỗ, tên lấy từ phần trước dấu `@`. Email có chứa chuỗi `vip` → `role = "vip"`.

### 2.3 Tài khoản mẫu (đăng nhập nhanh 1-Click)

| Email | Tên hiển thị | Role |
|---|---|---|
| `khachhang@shopgo.vn` | Nguyễn Văn An | customer |
| `vip@shopgo.vn` | Trần Thị Mai (VIP) | vip |

Modal có sẵn 2 nút bấm-một-phát cho hai tài khoản này (không cần gõ mật khẩu).

**Chưa có tài liệu nào nói role `vip` được ưu đãi gì.** Code hiện không dùng `role` để tính tiền.
→ mục 10.

### 2.4 Đăng ký

1. Thiếu họ tên / email / mật khẩu → `Vui lòng điền đầy đủ họ tên, email và mật khẩu.`
2. Email không chứa `@` → `Email không đúng định dạng.`
3. Mật khẩu < 6 ký tự → `Mật khẩu cần tối thiểu 6 ký tự.`
4. Xác nhận mật khẩu không khớp → `Mật khẩu xác nhận không khớp.`
5. Còn lại → `Đăng ký tài khoản thành công! Đang chuyển hướng...`

Lưu ý bất đối xứng đáng ghi test case: **đăng ký bắt mật khẩu ≥ 6 ký tự, nhưng đăng nhập không
kiểm tra mật khẩu.**

## 3. Danh mục sản phẩm

6 sản phẩm cố định, không phân trang. Danh mục lọc: Tất cả / Thời trang / Công nghệ / Gia dụng.
Ô tìm kiếm khớp theo **tên hoặc danh mục**, không phân biệt hoa thường.

| id | Tên | Giá | Giá gốc | Danh mục | Tồn kho |
|---|---|---:|---:|---|---:|
| prod-001 | Áo thun Trendy Unisex | 150.000 | 199.000 | Thời trang | 50 |
| prod-002 | Tai nghe Bluetooth Không Dây | 350.000 | 500.000 | Công nghệ | 12 |
| prod-003 | Bình nước giữ nhiệt Kim Loại | 200.000 | 280.000 | Gia dụng | 25 |
| prod-004 | Balo Chống Nước Oxford | 280.000 | 399.000 | Thời trang | 18 |
| prod-005 | Sạc dự phòng Siêu Nhanh 20W | 190.000 | 250.000 | Công nghệ | 30 |
| prod-006 | Đèn để bàn LED Chống Cận | 120.000 | 180.000 | Gia dụng | 8 |

Không tìm thấy sản phẩm nào → hiện `Không tìm thấy sản phẩm`.

Nút thêm vào giỏ đổi nhãn sau khi thêm: `Thêm vào giỏ` → `Đã thêm (x<N>)`.
Bấm thêm lần nữa thì tăng số lượng, nhưng **không vượt quá tồn kho** (bấm tiếp không có tác dụng).

## 4. Giỏ hàng và kiểm tra số lượng

Ô số lượng là **text tự do**, cố tình để test hộp đen. Thứ tự kiểm tra:

| Nhập vào | Thông báo |
|---|---|
| rỗng / toàn khoảng trắng | `Số lượng không được để trống` |
| không phải toàn chữ số (`abc`, `-5`, `1.5`, `2 `) | `Số lượng phải là chữ số nguyên` |
| `0` | `Số lượng phải lớn hơn 0` |
| lớn hơn tồn kho | `Vượt quá tồn kho (<tồn kho>)` |

> `-5` rơi vào **`Số lượng phải là chữ số nguyên`**, không phải "phải lớn hơn 0", vì dấu trừ làm
> hỏng dạng chữ số trước khi tới bước so sánh. Đây đúng là loại biên mà test case hay ghi nhầm.

**Dòng hàng đang lỗi bị loại khỏi Tạm tính.** Giỏ có 1 món hợp lệ 150.000 và 1 món nhập `abc` thì
Tạm tính = 150.000, không phải lỗi toàn giỏ. Nhưng nút Đặt hàng **bị disable** khi còn bất kỳ dòng
nào lỗi.

## 5. Phí vận chuyển

```
phí ship = 0                       nếu giỏ rỗng, hoặc Tạm tính = 0, hoặc Tạm tính >= 200.000
phí ship = 30.000                  nếu ngược lại
```

Ba điều dễ ghi sai:

1. **Là `>=`, không phải `>`.** Tạm tính đúng 200.000 → **được** miễn phí. Banner trên site ghi
   "đơn từ 200.000 ₫", khớp với `>=`.
2. **Tính trên Tạm tính TRƯỚC khi trừ voucher.** Giỏ 200.000 + mã GIAM50K (-50.000) → phí ship
   vẫn = 0, tổng = 150.000. Voucher **không** kéo đơn tụt xuống hạng phải trả ship.
3. **Không có chọn khu vực, không có Z1–Z5** trong v2.0. Bảng phí theo vùng trong
   `01_Business/Bang-phi-van-chuyen.md` **chưa được cài** ở app này.

Hiển thị khi bằng 0: `Miễn phí (Freeship)` ở màn Thanh toán, `Miễn phí` ở biên lai.

## 6. Mã giảm giá

Chỉ có **3 mã**, nằm cứng trong code:

| Mã | Loại | Giá trị | Đơn tối thiểu | Trần giảm | Ghi chú |
|---|---|---:|---:|---:|---|
| `GIAM50K` | fixed | 50.000 | 200.000 | — | |
| `SALE20` | percentage | 20% | 300.000 | 100.000 | |
| `HETHAN` | fixed | 30.000 | 100.000 | — | **đã đánh dấu hết hạn** |

- **Mã được tự động viết hoa** (`trim().toUpperCase()`) → `sale20`, `Sale20`, ` SALE20 ` đều áp
  được. App **không** phân biệt hoa thường.
- Mỗi lần chỉ **một mã**. Không có cộng dồn.
- Đơn tối thiểu so với **Tạm tính**, không tính phí ship.

**Thông báo khi bấm Áp dụng** (đúng thứ tự kiểm tra):

| Trường hợp | Thông báo |
|---|---|
| Ô mã để trống | `Vui lòng nhập mã khuyến mãi.` |
| Mã không có trong danh sách | `Mã giảm giá "<MÃ>" không tồn tại trên hệ thống.` |
| Mã hết hạn (`HETHAN`) | `Mã giảm giá "<MÃ>" đã hết hạn sử dụng.` |
| Chưa đạt đơn tối thiểu | `Đơn hàng chưa đạt mức tối thiểu <tối thiểu> (Hiện có <tạm tính>).` |
| Thành công, mã fixed | `Áp dụng thành công mã "<MÃ>": Giảm <số tiền>.` |
| Thành công, mã % | `Áp dụng thành công mã "<MÃ>": Giảm 20% (Tối đa 100.000 ₫).` |

Số tiền trong thông báo định dạng tiền VND (`Intl.NumberFormat('vi-VN')`), ví dụ `50.000 ₫`.

### 6.1 Đổi giỏ sau khi đã áp mã — hành vi thật

Đây là câu hỏi bị treo ở biên bản S24 ("bug hay feature?"). Bản v2.0 trả lời bằng code:

- Mã **không tự bị gỡ** khi giỏ tụt xuống dưới đơn tối thiểu. Ô mã vẫn giữ mã đó.
- Nhưng phần giảm giá **về 0** và app hiện cảnh báo `Đơn tối thiểu <X> (hiện có <Y>).`
- Và khi bấm Đặt hàng, app **chặn lại**:
  `Vui lòng gỡ hoặc bổ sung giỏ hàng để đạt điều kiện voucher.`

> **Đây chính là kịch bản "áp mã hỏng nhưng vẫn thanh toán thành công" mà chúng ta đi tìm.**
> Ở v2.0 nó **đã được chặn**. Test case cho luồng này phải kỳ vọng **bị chặn ở nút Đặt hàng**,
> không phải "đặt hàng thành công với giá chưa giảm".
>
> Test case cũ TC-D-016 ghi Expected Result là *"Hệ thống tự gỡ mã"* — **sai so với hiện trạng**:
> mã vẫn nằm đó, chỉ là không có tác dụng và bị chặn ở bước cuối.

## 7. Đặt hàng

Nút Đặt hàng **disable** khi: giỏ rỗng, **hoặc** còn dòng hàng lỗi.

Khi bấm, kiểm tra theo thứ tự:

1. Chưa đăng nhập → mở modal đăng nhập, dừng.
2. Giỏ rỗng → dừng (chỉ có tiếng bíp, **không có thông báo trên màn hình**).
3. Còn dòng lỗi → dừng (cũng **không có thông báo**).
4. Có mã đang nhập nhưng mã không hợp lệ → `Vui lòng gỡ hoặc bổ sung giỏ hàng để đạt điều kiện voucher.`
5. Qua hết → chạy hoạt cảnh thanh toán.

> Bước 2 và 3 **không hiện chữ gì cả**. Một assertion kiểu "thấy thông báo lỗi" sẽ đỏ oan;
> điều quan sát được là **nút bị disable** và **màn hình không đổi**.

**Hoạt cảnh thanh toán mất khoảng 3,2 giây** (4 chặng ở mốc 0 / 0,8 / 1,6 / 2,4 giây), rồi mới
hiện biên lai. Automation phải chờ tới biên lai, đừng chụp ảnh ngay sau khi bấm.

Đơn tạo ra: mã đơn dạng `SG-` + 6 chữ số ngẫu nhiên (ví dụ `SG-483920`), lưu kèm Tạm tính, phí
ship, giảm giá, tổng, và mã đã áp.

## 8. Công thức tiền

```
Tạm tính  = Σ (giá × số lượng)   — bỏ qua các dòng đang lỗi
Phí ship  = 0 nếu Tạm tính >= 200.000, ngược lại 30.000  (giỏ rỗng → 0)
Giảm giá  = min(giá trị mã, Tạm tính)      — mã %: min(Tạm tính × %, trần giảm)
Tổng      = max(0, Tạm tính + Phí ship − Giảm giá)
```

Ví dụ để đối chiếu (dùng làm test data được):

| Giỏ | Tạm tính | Mã | Phí ship | Giảm | Tổng |
|---|---:|---|---:|---:|---:|
| 1 × prod-001 | 150.000 | — | 30.000 | 0 | **180.000** |
| 1 × prod-003 | 200.000 | — | 0 | 0 | **200.000** |
| 1 × prod-003 | 200.000 | GIAM50K | 0 | 50.000 | **150.000** |
| 1 × prod-001 | 150.000 | GIAM50K | 30.000 | 0 (chưa đủ 200.000) | **180.000** + cảnh báo |
| 1 × prod-002 | 350.000 | SALE20 | 0 | 70.000 | **280.000** |
| 2 × prod-002 | 700.000 | SALE20 | 0 | 100.000 (chạm trần) | **600.000** |

## 9. Trạng thái lưu lại giữa các lần tải trang

| Thứ | Lưu ở đâu | Reload trang có mất không? |
|---|---|---|
| Phiên đăng nhập | `localStorage["shopgo_user"]` | **KHÔNG mất** |
| Lịch sử đơn hàng | `localStorage["shopgo_orders"]` | **KHÔNG mất** |
| Giỏ hàng | chỉ trong bộ nhớ React | **Mất** |
| Mã đang áp | chỉ trong bộ nhớ React | **Mất** |

> **Quy ước "vào lại trang là sạch" của bản trước GIỜ ĐÃ SAI MỘT NỬA.** Reload xoá giỏ và mã,
> nhưng **giữ nguyên đăng nhập và lịch sử đơn**. Test case nào cần trạng thái "chưa đăng nhập"
> thì phải xoá `localStorage`, không thể chỉ mở lại trang.
>
> Mặt tốt: cũng chính vì phiên nằm trong `localStorage`, Playwright có thể **nạp sẵn trạng thái
> đăng nhập bằng `storageState`** thay vì đi qua modal ở mọi test case.

Ngoài ra app có phát **âm thanh** (Web Audio) ở mỗi thao tác. Không ảnh hưởng automation.

## 10. Những chỗ v2.0 lệch với tài liệu cũ

Ghi lại để các node **không tự coi đây là lỗi của chính mình**, và để test case bắt được đúng
những mâu thuẫn này thay vì lặng lẽ chọn một phía:

| # | Tài liệu cũ nói | v2.0 chạy thật | Xử lý |
|---|---|---|---|
| 1 | S22/S24: checkout **không cần login** | Bắt buộc login mới xem được giỏ | Tài liệu cũ đã lỗi thời — xem `Bien-ban-Sprint-Planning-S25.md`. `ShopGo-Overview.md` §3 vốn ghi đúng. |
| 2 | Freeship từ **800.000đ**, có Z1–Z5 | Freeship từ **200.000đ**, phí phẳng 30.000đ, không có khu vực | Xem `Bang-phi-van-chuyen.md` §5 |
| 3 | API-spec: `voucher_code` **case-sensitive**, server không chuẩn hoá | UI **tự viết hoa** trước khi so | Mâu thuẫn thật giữa tầng UI và tầng API → nên có test case |
| 4 | TC-D-016: đổi giỏ sau khi áp mã → **hệ thống tự gỡ mã** | Mã **không** bị gỡ; bị chặn ở nút Đặt hàng | Sửa Expected Result, xem mục 6.1 |
| 5 | BRD/CR-005: **cộng dồn** 1 mã đơn hàng + 1 mã freeship | Chỉ **một** mã mỗi đơn, không có mã freeship | Chưa cài — là gap, không phải bug của test |
| 6 | Có mã `FREESHIP`, quota chiến dịch, mã first-order-only | Không tồn tại trong v2.0 | Chưa cài |
| 7 | Overview: Ví ShopGo, chọn địa chỉ, COD/thẻ | Không có bước chọn địa chỉ hay phương thức thanh toán | Ngoài phạm vi app demo |
| 8 | — | Đăng nhập **không kiểm tra mật khẩu**; role `vip` không có ưu đãi nào | Chưa có tài liệu nào định nghĩa → câu hỏi mở |
| 9 | UI-note v3: thông báo là `Áp dụng mã thành công` / `Mã không hợp lệ` / `Đơn hàng chưa đạt giá trị tối thiểu` | Chuỗi thật dài hơn và có kèm số — xem mục 6 | **Wording thật thắng** khi viết assertion. Chính UI-note đã lường trước ("code đang trả về message từ API nên có thể vẫn ra text cũ"). Lệch wording là finding của QA, không phải lý do để test đỏ hàng loạt. |
| 10 | `03_DEV/Spec.md`: hover dòng mã → nút **Nạp mã** | Bảng gợi ý mã **đã bị tắt** | Chỉ còn một đường áp mã: gõ vào ô rồi bấm Áp dụng |

## 11. Id ổn định có sẵn trên DOM

App có gắn sẵn `id` cho các phần tử chính. **Không dùng danh sách này để viết locator bằng tay** —
automation vẫn phải sinh locator qua MCP. Ghi ở đây để người review đối chiếu khi có nghi ngờ:

`btn-nav-shop`, `btn-nav-checkout`, `btn-nav-orders`, `btn-header-login`, `btn-user-profile`,
`btn-logout`, `btn-add-prod-001` … `btn-add-prod-006`, `input-voucher-code`, `btn-apply-voucher`,
`btn-remove-voucher`, `label-total-payable`, `btn-submit-checkout`, `btn-close-receipt`,
`btn-trigger-clear-orders`, `btn-confirm-clear-orders`, `btn-cancel-clear-orders`.

Bảng điều khiển QA (`btn-toggle-qa-panel`) và các nút "Test nhanh GIAM50K / SALE20" **đã bị tắt**
trong bản build hiện tại. Test case nào dựa vào chúng sẽ không tìm thấy phần tử.
