# Biên bản Sprint Planning — Sprint 25

**Thời gian:** 25/08/2026, 09:00 - 10:30
**Người ghi:** Phạm Thu Trang (QA)
**Tham dự:** Quân (PO), Hà (BA), Dũng (Dev Lead), Sơn (Dev), Trang (QA), Nam (QA), Linh (MKT)

---

## 1. Thông báo: web test đã lên bản Store v2.0

Bản `ShopGo Store v2.0` đã deploy lên https://cwshopgo.github.io/. Đây là bản **thay đổi lớn**,
không phải patch. Toàn bộ test case và script automation viết cho bản trước **phải làm lại**.

Quân (PO) tóm tắt 4 thay đổi có ảnh hưởng tới QA:

1. **Trang chủ nhiều thông tin hơn** — banner khuyến mãi, slider, bộ lọc danh mục, ô tìm kiếm,
   hiển thị tồn kho và giá gốc gạch ngang trên từng thẻ sản phẩm.
2. **Chưa đăng nhập:** xem sản phẩm và **thêm vào giỏ vẫn được**, nhưng **không xem được giỏ
   hàng** và **không mua bán được**. Bấm Thanh toán hoặc Đơn hàng thì hiện modal đăng nhập.
3. **Đã đăng nhập:** xem, thêm giỏ, xem giỏ, áp mã, đặt hàng — đủ luồng.
4. **Phí vận chuyển** được cộng vào đơn. Đơn **từ 200.000đ** thì được miễn phí ship.

## 2. Đảo lại quyết định "bỏ login ở checkout" của S22

Trang nêu: biên bản S24 mục 1 còn ghi *"S22 đã bỏ bắt buộc login ở checkout"*, và action item A2
là "Update Overview: bỏ login ở checkout" — nếu ai đó làm A2 bây giờ thì **sửa Overview thành sai**.

Quân xác nhận: **quyết định của S22 đã bị huỷ.** Guest checkout gây quá nhiều đơn rác không truy
vết được chủ đơn, và câu hỏi treo từ S24 ("voucher giới hạn 1 lần/tài khoản thì với guest tính
sao?") không có lời giải nào chấp nhận được nếu không có tài khoản. Từ v2.0, **bắt buộc đăng nhập
mới vào được giỏ hàng và thanh toán**.

| | |
|---|---|
| **A2 (S24)** — "Update Overview: bỏ login ở checkout" | **HUỶ.** Không thực hiện. |
| `ShopGo-Overview.md` §3, dòng Guest — *"Xem sản phẩm, thêm vào giỏ; phải đăng nhập khi thanh toán"* | **Vẫn đúng**, giữ nguyên. |
| Biên bản S24 mục 1, gạch đầu dòng thứ 3 | **Lỗi thời**, đọc để hiểu lịch sử, đừng dùng làm căn cứ. |

Hà: "vậy mấy chỗ trong BRD nói guest đặt hàng được thì sao?" → Quân: để nguyên, sẽ dọn ở sprint
sau; QA cứ bám theo hành vi thật của v2.0.

## 3. Phí vận chuyển ở v2.0 khác bảng phí của Vận hành

Nam đối chiếu và thấy lệch:

- `01_Business/Bang-phi-van-chuyen.md` quy định 5 khu vực Z1–Z5 và miễn phí từ **800.000đ**.
- App v2.0 **không có bước chọn khu vực**, phí phẳng **30.000đ**, miễn phí từ **200.000đ**.

Dũng: bản web demo cố tình đơn giản hoá, chưa nối với bảng phí thật của đối tác vận chuyển. Quân
chốt: **QA test theo app v2.0**, đồng thời ghi nhận đây là khoảng cách giữa app demo và chính sách
thật. Đã nhờ Vận hành ghi phụ lục vào bảng phí — xem `Bang-phi-van-chuyen.md` mục 5.

Trang hỏi thêm: "miễn phí tính trên tiền hàng trước hay sau khi trừ voucher?" → Dũng check code
tại chỗ: **trước khi trừ voucher**. Nghĩa là áp mã giảm giá không làm đơn tụt xuống mức phải trả
ship. Ghi vào spec.

## 4. Case "đổi giỏ sau khi áp mã" — đã có câu trả lời

Câu hỏi treo từ S24 mục 3 ("bug hay feature?") nay có hành vi rõ ràng ở v2.0: mã **không tự bị
gỡ**, nhưng phần giảm về 0 và **nút Đặt hàng bị chặn** với thông báo yêu cầu gỡ mã hoặc mua thêm.

Quân: đây là feature, chấp nhận. → **A5 của S24 đóng.**

Trang lưu ý: test case TC-D-016 của bộ cũ ghi Expected Result là *"Hệ thống tự gỡ mã"* → **sai so
với v2.0**, phải sửa khi làm lại bộ test case.

## 5. Scope Sprint 25

| # | Item | Owner | Note |
|---|---|---|---|
| 1 | Làm lại toàn bộ test case cho Store v2.0 | Trang, Nam | bộ cũ bỏ |
| 2 | Bổ sung luồng đăng nhập / đăng ký vào bộ test | Trang | mới |
| 3 | Test biên phí ship quanh mốc 200.000đ | Nam | |
| 4 | Test ô số lượng nhập tự do (biên âm, rỗng, chữ) | Nam | v2.0 cố tình để text tự do |
| 5 | Viết spec hiện trạng v2.0 | Dũng | → `03_DEV/Spec-ShopGo-Store-v2.md` |

## 6. Action items

| # | Việc | Owner | Hạn | Trạng thái |
|---|---|---|---|---|
| B1 | Phụ lục bảng phí cho v2.0 | Vận hành | 27/08 | **Done** |
| B2 | Spec hiện trạng v2.0 | Dũng | 28/08 | **Done** |
| B3 | Cập nhật UI-flow theo v2.0 | Trang | 28/08 | **Done** |
| B4 | Dọn BRD chỗ nói guest đặt hàng được | Hà | S26 | Open |
| B5 | Rule khi mã hết quota (treo từ S24 A3) | Hà | S26 | Open — v2.0 chưa có quota |
| B6 | Timezone `expired_at` (treo từ S24 A6) | Sơn | S26 | Open — v2.0 chỉ có cờ hết hạn tĩnh |

## 7. Điểm chưa chốt

- **Đăng nhập không kiểm tra mật khẩu.** Nam thử email bất kỳ + mật khẩu bất kỳ đều vào được.
  Dũng: "bản demo chưa có backend auth." Quân: chưa quyết định coi là bug hay giới hạn đã biết.
  → **chưa ai được kết luận thay.**
- **Tài khoản role `vip`** có trong app (`vip@shopgo.vn`) nhưng không có ưu đãi nào khác customer.
  Linh (MKT) nói "định làm giảm giá riêng cho VIP" nhưng chưa có CR. → treo.
- **Mã nhập chữ thường** (`sale20`) hiện áp được vì UI tự viết hoa, trong khi
  `03_DEV/API-spec-voucher-checkout.md` mục 2 ghi server phân biệt hoa thường. Trang sẽ viết test
  case cho chính điểm lệch này.
