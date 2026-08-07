# Biên bản Sprint Planning — Sprint 24

**Thời gian:** 30/06/2026, 09:00 - 10:45
**Người ghi:** Phạm Thu Trang (QA)
**Tham dự:** Quân (PO), Hà (BA), Dũng (Dev Lead), Sơn (Dev), Trang (QA), Nam (QA)
**Vắng:** Linh (MKT)

---

## 1. Review sprint trước (S23)

- FD checkout flow: done, đã merge.
- Bug BUG-1142 (tổng tiền lệch 1đ) — chưa fix, carry over.
- Nhắc lại: **S22 đã bỏ bắt buộc login ở checkout** (theo yêu cầu KH để giảm tỉ lệ bỏ giỏ). Tài liệu Overview + BRD chưa update. → a.Hà
- Trang: "vậy voucher giới hạn 1 lần/tài khoản thì với guest tính sao?" → chưa có câu trả lời, để lại.

## 2. Scope Sprint 24

| # | Item | Owner | Note |
|---|---|---|---|
| 1 | CR-005 cộng dồn voucher (PA2) | Sơn | theo mail a.Quân 26/06 |
| 2 | Trần giảm tối đa (cap) cho mã % | Sơn | BRD 4.2 |
| 3 | Mã first-order-only | Sơn | mới, chưa có trong BRD |
| 4 | Quota chiến dịch | Dũng | MKT yêu cầu miệng, chưa có CR |
| 5 | Fix BUG-1142 | Sơn | |

## 3. Các điểm trao đổi

- **Quota**: Dũng nói DB đã có sẵn cột `quota_total` / `quota_used` từ lúc thiết kế ban đầu, chỉ chưa dùng. MKT muốn bật lên cho campaign 8/8. Chưa ai viết rule khi hết quota thì hiện gì. Hà: "để tôi hỏi lại Linh."
- **Làm tròn**: Trang hỏi 15% của 333.000 = 49.950 thì hiển thị sao. Sơn nói "hình như đang floor về đơn vị đồng". Dũng nói để check lại code. → chưa kết luận.
- **Đổi giỏ sau khi áp mã**: Nam nêu case: áp mã min order 500k xong bớt hàng còn 400k. Hiện tại code không recheck. Dũng: "cái này là bug hay là feature?" PO không có mặt lúc bàn (ra ngoài nghe điện). → treo.
- **Timezone hết hạn**: Sơn nói backend đang lưu `expired_at` dạng UTC. Trang hỏi "vậy mã hết hạn 23:59 ngày 31/8 là giờ VN hay giờ UTC?" Sơn: "chắc UTC, để em xem." → treo.
- **Wording thông báo lỗi**: Hà nói UI/UX đã gửi file note, nhưng file đó có mấy chỗ khác nhau. Trang sẽ đối chiếu.

## 4. Action items

| # | Việc | Owner | Hạn | Trạng thái |
|---|---|---|---|---|
| A1 | Update BRD theo mail CR-005 | Hà | 03/07 | Open |
| A2 | Update Overview: bỏ login ở checkout | Hà | 03/07 | Open |
| A3 | Hỏi MKT rule khi hết quota | Hà | 02/07 | Open |
| A4 | Check quy tắc làm tròn trong code | Dũng | 02/07 | Open |
| A5 | Chốt case đổi giỏ sau khi áp mã | Quân | 03/07 | Open |
| A6 | Xác nhận timezone `expired_at` | Sơn | 02/07 | Open |
| A7 | Đối chiếu wording lỗi với UI note | Trang | 06/07 | Open |

*(Biên bản chưa được cập nhật lại sau ngày 30/06.)*
