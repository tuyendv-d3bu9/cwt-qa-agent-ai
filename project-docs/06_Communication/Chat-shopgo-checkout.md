# [Export] Kênh #shopgo-checkout — trích đoạn

*(Xuất từ công cụ chat nội bộ, khoảng 02/07 - 16/07/2026. Đã lược các đoạn không liên quan.)*

---

**Trang (QA)** — 02/07 10:12
a Dũng ơi cho e hỏi cái làm tròn tiền giảm giá với. Đơn 333.000, mã 15% thì ra 49.950. Hệ thống hiển thị bao nhiêu ạ?

**Dũng (Dev Lead)** — 02/07 10:40
để a xem code

**Dũng (Dev Lead)** — 02/07 11:05
chắc là làm tròn xuống thôi. a thấy có hàm Math.floor ở chỗ tính discount. nhưng chỗ hiển thị lại có format khác, để a check lại rồi báo em

**Trang (QA)** — 02/07 11:06
vâng ạ

**Trang (QA)** — 09/07 14:20
a Dũng ơi vụ làm tròn hôm trước sao rồi ạ 🙏

**Dũng (Dev Lead)** — 09/07 14:55
à a quên mất. tuần này a bận release. em cứ test theo floor đi, sai thì raise bug

---

**Nam (QA)** — 07/07 16:31
mọi người ơi mã QUOTA5 e áp lần thứ 6 nó vẫn ăn bình thường, ko báo hết lượt

**Sơn (Dev)** — 07/07 16:45
quota chưa làm đâu anh, mới có cột trong db thôi. sprint này em mới làm

**Nam (QA)** — 07/07 16:46
ok vậy e chưa test cái đó

---

**Trang (QA)** — 11/07 09:40
a Sơn ơi mã freeship với mã giảm giá áp cùng lúc thì UI hiển thị mấy dòng ạ? trong Figma e chỉ thấy 1 dòng "Giảm giá"

**Sơn (Dev)** — 11/07 10:02
api trả về 2 object riêng. còn UI thì em đang gộp lại 1 dòng cho nhanh, chị hỏi lại chị Hà xem design đúng là mấy dòng

**Trang (QA)** — 11/07 10:03
😅 vậy hiện tại đang là gộp đúng ko a

**Sơn (Dev)** — 11/07 10:03
đúng r

---

**Nam (QA)** — 16/07 15:22
checkout ko cần login mà voucher first-order-only thì lấy gì check tài khoản?

**Sơn (Dev)** — 16/07 15:30
hiện đang check theo email nhập ở form giao hàng

**Nam (QA)** — 16/07 15:31
vậy e nhập email khác là dùng lại được à

**Sơn (Dev)** — 16/07 15:33
😐 ừ. cái này a nêu với chị Hà nhé, em code theo spec thôi

**Nam (QA)** — 16/07 15:34
spec nào cơ, BRD có ghi first-order đâu

**Sơn (Dev)** — 16/07 15:40
trong mail a Quân ấy
