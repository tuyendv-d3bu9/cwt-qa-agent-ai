# [Email export] Chuỗi trao đổi CR-005

---

**From:** Nguyen Thi Ha <ha.nt@cowell-partner.vn>
**To:** Tran Van Dung <dung.tv@cowell-partner.vn>; Le Minh Quan (PO) <quan.lm@shopgo-client.vn>
**Cc:** QA Team
**Date:** Thu, 25/06/2026 09:14
**Subject:** [ShopGo][CR-005] Đề xuất cho phép cộng dồn voucher

Chào anh Quân, anh Dũng,

Bên Marketing của khách hàng vừa gửi yêu cầu: chiến dịch "Back to School" tháng 8 muốn khách vừa được giảm đơn hàng, vừa được freeship.

Hiện BRD v1.2 mục 4.3 đang ghi rõ **1 đơn = 1 mã**. Nếu làm theo yêu cầu này thì phải sửa rule.

Em đề xuất 2 phương án:
- PA1: giữ nguyên 1 mã, Marketing tự tạo mã "combo" đã bao gồm freeship.
- PA2: cho phép 2 mã, 1 mã đơn hàng + 1 mã freeship.

Nhờ anh Dũng đánh giá effort giúp em.

Hà

---

**From:** Tran Van Dung <dung.tv@cowell-partner.vn>
**Date:** Thu, 25/06/2026 15:02
**Subject:** RE: [ShopGo][CR-005] Đề xuất cho phép cộng dồn voucher

Hi Hà,

PA1 gần như không tốn gì, chỉ là Marketing tạo mã khác.

PA2 thì phải sửa cả bảng `order_voucher` (hiện đang là quan hệ 1-1), sửa API, sửa UI hiển thị 2 dòng giảm giá. Ước tính 3-4 ngày dev + test.

Riêng cái freeship: hiện tại phí ship đang tính ở service khác, mã freeship sẽ trừ vào phí ship chứ không trừ vào tiền hàng. Nên nếu làm PA2, thứ tự tính toán cần thống nhất: **giảm giá hàng trước, phí ship tính sau, rồi mới trừ freeship**. Không thì số ra khác nhau.

Còn chuyện min order: nếu cộng dồn thì mã đơn hàng vẫn xét min order theo tiền hàng thôi đúng không? Cái này em thấy BRD đang để TBD.

Dũng

---

**From:** Le Minh Quan <quan.lm@shopgo-client.vn>
**Date:** Fri, 26/06/2026 08:47
**Subject:** RE: RE: [ShopGo][CR-005] Đề xuất cho phép cộng dồn voucher

Hi cả nhà,

Tôi đã trao đổi với chị Linh bên Marketing sáng nay. Chốt như sau, các bạn cập nhật tài liệu giúp:

1. **Đi theo PA2.** Cho phép tối đa 2 mã trên 1 đơn: **01 mã giảm đơn hàng + 01 mã freeship**. Không cho 2 mã cùng loại.
2. Thứ tự tính như anh Dũng nói: giảm tiền hàng → tính phí ship → trừ freeship.
3. Min order của mã giảm đơn hàng xét theo **tiền hàng, chưa gồm phí ship**.
4. Mã freeship chỉ trừ tối đa bằng đúng phí ship thực tế, dư không quy đổi thành tiền.
5. Thêm một ý Marketing yêu cầu: mã dành cho **khách mua lần đầu** thì chỉ dùng được 1 lần duy nhất trên 1 tài khoản. Cái này chưa có trong BRD, các bạn bổ sung.

Vào scope Sprint 24, kịp release 15/08.

Quân

---

*(Hết chuỗi mail. Ghi chú của QA: BRD v1.2 tính đến 20/07/2026 vẫn chưa được cập nhật theo mail này.)*
