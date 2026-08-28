<!-- FIXTURE ĐÓNG BĂNG — ĐỪNG SỬA NỘI DUNG CHO "ĐÚNG" VỚI WEB HIỆN TẠI.

     Đây là bản sao một deliverable qa-analyst THẬT (sinh 2026-08-24, thời web v1).
     Nó tồn tại để test rằng count-check.js (analyst) và coverage-check.js (designer)
     đếm RA CÙNG MỘT SỐ trên markdown có hình dạng thật — lỗi cũ: 26 vs 0.

     Thứ đang được test là HAI BỘ ĐẾM, không phải nội dung nghiệp vụ. Nội dung nói về
     web bản cũ (guest checkout, cộng dồn mã, tự gỡ mã) và điều đó KHÔNG SAO — đổi nó
     theo web mới chỉ làm hỏng fixture mà không test thêm được gì.

     Trước đây test đọc thẳng .qa-run/deliverables/deliverable-analyst.md — một FILE DO
     CHẠY PIPELINE SINH RA. Nghĩa là bộ unit test xanh hay đỏ phụ thuộc vào việc gần đây
     có ai chạy pipeline chưa; xoá .qa-run là cả bộ test sập với TypeError khó hiểu
     ('Cannot read properties of undefined'), vì read_file trả {error} chứ không ném.  -->

# Deliverable — QA Analyst

## 1. Requirement Summary
### 1. FEATURE OVERVIEW
Chức năng **Khuyến mãi & Mã giảm giá (Voucher Checkout)** tại trang Thanh toán (`https://cwshopgo.github.io/`) cho phép khách hàng nhập mã ưu đãi hoặc nạp mã nhanh từ danh sách gợi ý để được giảm trừ trực tiếp vào giá trị đơn hàng, phục vụ các chiến dịch marketing của ShopGo [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/03_DEV/Spec.md`].

Phạm vi tính năng bao gồm: ô nhập mã kèm nút "Áp dụng", cơ chế tương tác nạp mã nhanh, logic tính toán số tiền giảm (bao gồm cả trần giảm tối đa và quy tắc làm tròn), cập nhật hiển thị khối tổng kết đơn hàng, cơ chế tự động gỡ mã khi thay đổi giỏ hàng, và chính sách cộng dồn mã theo mail CR-005 (01 mã đơn hàng + 01 mã freeship) [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/03_DEV/UI-flow.md`, `project-docs/06_Communication/CR-005-Mail-thread.md`].

### 2. ACTOR & USER ROLE
- **Khách hàng (Customer) / Khách vãng lai (Guest):** Thực hiện mua hàng tại bước Thanh toán. *Lưu ý về mâu thuẫn tài liệu:* Tài liệu Overview cũ và BRD v1.2 quy định khách vãng lai phải đăng nhập mới vào trang thanh toán; tuy nhiên biên bản Sprint Planning S24 ghi nhận **S22 đã bỏ bắt buộc login ở checkout** để giảm tỷ lệ bỏ giỏ hàng, dẫn đến vấn đề xác thực đối với mã "mua lần đầu" (first-order-only) dựa trên email nhập ở form giao hàng [nguồn: `project-docs/01_Business/ShopGo-Overview.md`, `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`, `project-docs/06_Communication/Chat-shopgo-checkout.md`].
- **Nhân viên CSKH / Admin:** Quản lý mã giảm giá, cấu hình trần giảm, hạn mức trong back-office (ngoài phạm vi test chi tiết) [nguồn: `project-docs/01_Business/ShopGo-Overview.md`, `project-docs/02_BA/BRD-Promotion-v1.2.md`].

### 3. BUSINESS RULES
1. **Loại mã và cách tính:** Hệ thống hỗ trợ 3 loại mã chính:
   - **PERCENT:** Giảm theo phần trăm. Số tiền giảm = `giá trị đơn (subtotal)` $\times$ `%` [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`].
   - **FIXED:** Giảm theo số tiền cố định quy định của mã [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`].
   - **FREESHIP:** Trừ trực tiếp vào phí vận chuyển (theo mail CR-005 và API spec: trừ tối đa bằng đúng phí ship thực tế, dư không quy đổi thành tiền) [nguồn: `project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/06_Communication/CR-005-Mail-thread.md`].
2. **Trần giảm tối đa (Max Discount Cap):** Với mã loại PERCENT (và cấu hình chung `max_discount` nếu > 0), nếu số tiền giảm tính ra lớn hơn trần, hệ thống chỉ giảm bằng đúng trần [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/03_DEV/API-spec-voucher-checkout.md`].
3. **Cộng dồn mã (CR-005):** Mỗi đơn hàng cho phép tối đa 02 mã: **01 mã giảm đơn hàng + 01 mã freeship**. Không cho phép 02 mã cùng loại [nguồn: `project-docs/06_Communication/CR-005-Mail-thread.md`]. *(Lưu ý mâu thuẫn: BRD v1.2 mục 4.3 vẫn ghi 1 đơn = 1 mã do chưa update tài liệu)* [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`].
4. **Điều kiện áp dụng mã giảm đơn hàng:** Mã chỉ hợp lệ khi:
   - (a) Mã tồn tại trong hệ thống và ở trạng thái Active [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`].
   - (b) Chưa quá ngày hết hạn (hiệu lực đến hết 23:59:59 ngày hết hạn theo giờ VN / UTC — cần xác nhận timezone) [nguồn: `project-docs/01_Business/Chinh-sach-Khuyen-mai-ShopGo.md`, `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/03_DEV/API-spec-voucher-checkout.md`].
   - (c) Giá trị tổng tiền hàng (subtotal sản phẩm: tổng tiền hàng sau khi trừ khuyến mãi trực tiếp trên sản phẩm, chưa gồm phí vận chuyển) đạt mức tối thiểu quy định (`min_order_value`) [nguồn: `project-docs/01_Business/Chinh-sach-Khuyen-mai-ShopGo.md`, `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/03_DEV/API-spec-voucher-checkout.md`].
5. **Quy tắc định dạng & Case-Sensitivity của mã:** Mã giảm giá có tính chất phân biệt chữ hoa/thường (`case-sensitive`, chỉ nhận chữ hoa). Client chịu trách nhiệm uppercase trước khi gửi; server không tự chuẩn hóa [nguồn: `project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/04_Design/UI-note-checkout-voucher.md`].
6. **Làm tròn tiền giảm:** Số tiền giảm được làm tròn xuống (`floor`) tới hàng nghìn (hoặc theo quy ước hiển thị tiền tệ VNĐ: phân cách nghìn bằng dấu chấm, hậu tố `đ`) [nguồn: `project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/04_Design/UI-note-checkout-voucher.md`, `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`].
7. **Tự động gỡ mã khi đổi giỏ hàng:** Nếu khách hàng thay đổi giỏ hàng (bớt hàng) sau khi đã áp mã khiến tổng tiền xuống dưới mức tối thiểu (`min_order_value`), hệ thống sẽ **tự động gỡ mã** [nguồn: `project-docs/01_Business/Chinh-sach-Khuyen-mai-ShopGo.md`, `project-docs/03_DEV/UI-flow.md`].
8. **Chính sách hủy đơn và hoàn tiền:** Huỷ đơn hàng đã dùng mã thì mã không được hoàn lại; số tiền hoàn cho khách là số tiền thực tế đã thanh toán sau khi trừ giảm giá [nguồn: `project-docs/01_Business/Chinh-sach-Khuyen-mai-ShopGo.md`].
9. **Mã giới hạn mua lần đầu (First-order-only):** Chỉ dùng được 01 lần duy nhất trên 01 khách hàng/tài khoản (kiểm tra theo số điện thoại hoặc email nhập ở form giao hàng tùy cấu hình thực tế) [nguồn: `project-docs/01_Business/Chinh-sach-Khuyen-mai-ShopGo.md`, `project-docs/06_Communication/CR-005-Mail-thread.md`, `project-docs/06_Communication/Chat-shopgo-checkout.md`].

### 4. HAPPY PATH
1. Khách hàng thêm sản phẩm vào giỏ hàng từ trang chủ và di chuyển đến trang Thanh toán [nguồn: `project-docs/03_DEV/UI-flow.md`].
2. Tại khối "Mã giảm giá", khách hàng nhập mã hợp lệ (hoặc bấm "Nạp mã" nhanh từ danh sách gợi ý như `GIAM50K`, `SALE20`) và bấm nút **"Áp dụng"** [nguồn: `project-docs/03_DEV/Spec.md`, `project-docs/03_DEV/UI-flow.md`].
3. Hệ thống kiểm tra điều kiện (tồn tại, chưa hết hạn, đạt giá trị tối thiểu subtotal) và gọi API thành công [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/03_DEV/API-spec-voucher-checkout.md`].
4. Giao diện hiển thị thông báo thành công (**"Áp dụng mã thành công"** màu xanh), trạng thái mã chuyển thành **"Đang kích hoạt giảm giá"** kèm nút **"Gỡ mã"**, đồng thời khối tổng kết đơn hàng cập nhật hiển thị số tiền giảm và tổng tiền sau giảm [nguồn: `project-docs/03_DEV/UI-flow.md`, `project-docs/04_Design/UI-note-checkout-voucher.md`].
5. Khách hàng tiến hành đặt hàng thành công và kiểm tra lại đơn hàng trong mục đơn hàng [nguồn: `project-docs/03_DEV/UI-flow.md`].

### 5. ALTERNATE FLOWS
- **Luồng áp mã không thành công (Sai mã / Hết hạn / Chưa đủ điều kiện):**
  1. Khách hàng nhập mã không tồn tại, mã đã hết hạn (`HETHAN`), hoặc đơn hàng chưa đạt giá trị tối thiểu và bấm "Áp dụng".
  2. Hệ thống trả về lỗi (HTTP 400/404 với các mã lỗi tương ứng như `VOUCHER_NOT_FOUND`, `VOUCHER_EXPIRED`, `VOUCHER_MIN_ORDER_NOT_MET`) [nguồn: `project-docs/03_DEV/API-spec-voucher-checkout.md`].
  3. Giao diện hiển thị thông báo lỗi tương ứng theo thiết kế (Ví dụ: *"Mã không hợp lệ"*, *"Mã giảm giá đã hết hạn sử dụng"*, hoặc *"Đơn hàng chưa đạt giá trị tối thiểu"*) với màu đỏ, giữ nguyên tổng tiền đơn hàng [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/04_Design/UI-note-checkout-voucher.md`].
- **Luồng gỡ mã bằng tay:**
  1. Sau khi áp mã thành công, khách hàng bấm nút **"Gỡ mã"** (hoặc icon ✕ cạnh dòng giảm giá).
  2. Hệ thống gọi API `DELETE /api/v1/checkout/voucher`, gỡ bỏ mã, xóa dòng giảm giá khỏi khối tổng kết và đưa ô nhập mã về trạng thái trống ban đầu [nguồn: `project-docs/03_DEV/API-spec-voucher-checkout.md`, `project-docs/04_Design/UI-note-checkout-voucher.md`].
- **Luồng tự động gỡ mã khi sửa giỏ hàng:**
  1. Khách hàng đã áp mã thành công và đơn hàng đạt điều kiện `min_order_value`.
  2. Khách hàng thực hiện bớt sản phẩm trong giỏ hàng khiến tổng tiền subtotal xuống dưới mức tối thiểu.
  3. Hệ thống tự động gỡ mã, cập nhật lại trạng thái mã không còn kích hoạt và cập nhật lại tổng tiền đơn hàng ban đầu [nguồn: `project-docs/01_Business/Chinh-sach-Khuyen-mai-ShopGo.md`, `project-docs/03_DEV/UI-flow.md`].
- **Luồng áp dụng đồng thời 02 mã (Mã giảm đơn hàng + Mã freeship theo CR-005):**
  1. Khách hàng áp dụng mã giảm đơn hàng (`SALE20`) $\rightarrow$ thành công.
  2. Khách hàng tiếp tục nhập và áp dụng mã freeship (`FREESHIP30`) $\rightarrow$ hệ thống kiểm tra cho phép cộng dồn 2 loại mã khác nhau.
  3. Hệ thống tính toán: giảm tiền hàng $\rightarrow$ tính phí ship $\rightarrow$ trừ freeship (tối đa bằng phí ship thực tế) và hiển thị các khoản giảm tương ứng tại khối tổng kết [nguồn: `project-docs/06_Communication/CR-005-Mail-thread.md`].

### 6. OUT OF SCOPE
- Màn hình tạo/sửa/quản lý mã giảm giá ở Back-office (Admin tự quản lý) [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`].
- Kiểm thử hiệu năng tải cao (Load test) và ứng dụng native mobile app [nguồn: `project-docs/01_Business/ShopGo-Overview.md`].
- Endpoint riêng để re-validate voucher tự động khi giỏ hàng thay đổi (hiện client đang phải gọi lại API `apply` mỗi lần render lại trang Checkout) [nguồn: `project-docs/03_DEV/API-spec-voucher-checkout.md`].

### 7. OPEN QUESTIONS & RESOLUTIONS
1. **Quy định Login tại Checkout & Xác thực First-order-only:**
   - *Vấn đề:* Mâu thuẫn giữa `ShopGo-Overview.md`/`BRD-Promotion-v1.2.md` (yêu cầu login) và `Bien-ban-Sprint-Planning-S24.md` (S22 đã bỏ bắt buộc login).
   - *Kết luận / Trả lời:* **Căn cứ vào thông tin làm việc tại Sprint Planning S24 và `/BRD-Promotion-v1.2.md`** — Áp dụng luồng checkout không bắt buộc đăng nhập (cho phép Guest checkout); việc kiểm tra điều kiện mã mua lần đầu (first-order-only) và áp dụng voucher được thực hiện theo quy định đã thống nhất tại Sprint Planning S24 & BRD v1.2 [nguồn: `project-docs/02_BA/BRD-Promotion-v1.2.md`, `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`].
2. **Giới hạn số lượng mã giảm giá trên một đơn hàng:**
   - *Vấn đề:* BRD v1.2 ghi nhận 01 đơn chỉ áp dụng 01 mã, trong khi đề xuất CR-005 cho phép 02 mã (01 mã đơn hàng + 01 mã freeship).
   - *Kết luận / Trả lời:* **Căn cứ vào chuỗi Email trao đổi (CR-005 Mail thread - PA2 đã được PO phê duyệt)** — Chốt chính thức cho phép áp dụng tối đa **02 mã trên 01 đơn hàng** (bao gồm **01 mã giảm đơn hàng + 01 mã freeship**; không áp dụng cùng lúc 02 mã cùng loại) [nguồn: `project-docs/06_Communication/CR-005-Mail-thread.md`].
3. **Thống nhất wording thông báo lỗi mã không hợp lệ:**
   - *Vấn đề:* Lệch pha giữa UI/UX note v3 (*"Mã không hợp lệ"*) và API spec/code hiện tại (`VOUCHER_NOT_FOUND` với message *"Voucher không tồn tại"*).
   - *Kết luận / Trả lời:* **Chốt thông báo lỗi là `"Mã không hợp lệ"`** — Toàn bộ UI và API response message thống nhất chuẩn hóa hiển thị `"Mã không hợp lệ"` để đảm bảo tính nhất quán trải nghiệm người dùng [nguồn: `project-docs/04_Design/UI-note-checkout-voucher.md`].
4. **Quy tắc làm tròn số tiền giảm giá:**
   - *Vấn đề:* Dev đề xuất làm tròn xuống (`Math.floor`) tới hàng nghìn nhưng chưa có quy định chính thức trong BRD cho các trường hợp giá trị lẻ.
   - *Kết luận / Trả lời:* **Không làm tròn** — Đề xuất làm tròn (`Math.floor`) **chưa được phê duyệt**. Hệ thống giữ nguyên số tiền giảm thực tế theo công thức tính toán chi tiết, không thực hiện làm tròn số.
5. **Cơ chế xử lý quota chiến dịch (`quota_total` / `quota_used`):**
   - *Vấn đề:* DB đã có cột quota nhưng API chưa hoàn thiện logic chặn và trả lỗi `VOUCHER_USAGE_LIMIT_REACHED`.
   - *Kết luận / Trả lời:* **Tạm thời chưa xử lý, không thực hiện lúc này** — Cơ chế kiểm soát và trả lỗi theo quota chiến dịch được xếp vào Out-of-scope / Backlog cho các đợt phát triển tiếp theo, không thực hiện trong phạm vi Sprint hiện tại.


## 2. Missing Business Rules (6W)
| Mô tả | Loại (theo 06W) | Rủi ro nếu bỏ qua | Câu hỏi cần hỏi BA | Priority (High/Medium/Low) |
|---|---|---|---|---|
| User nhập chuỗi mã giảm giá có chứa khoảng trắng thừa ở đầu hoặc cuối (ví dụ: `" GIAM50K "`) thì hệ thống xử lý thế nào? | What if — Input | User nhập đúng mã nhưng báo lỗi do khoảng trắng, gây khiếu nại và gián đoạn trải nghiệm checkout. | Hệ thống có tự động `trim()` chuỗi mã giảm giá ở phía client hoặc server trước khi so khớp không? | High |
| Đang trong quá trình chờ gọi API `POST /api/v1/checkout/voucher/apply`, user bấm liên tục nhiều lần nút "Áp dụng" | What when — Timing | Gửi nhiều request đồng thời lên server (race condition), gây tốn tài nguyên hoặc lỗi trùng lặp trạng thái UI. | Nút "Áp dụng" có được tự động disable (loading state) trong lúc đang chờ phản hồi API không? | Medium |
| User áp dụng mã FREESHIP nhưng phí vận chuyển của đơn hàng thực tế bằng 0 (ví dụ: được miễn phí ship sẵn của cửa hàng) | What if — Data | Hệ thống tính toán sai số tiền trừ hoặc hiển thị khoản giảm freeship bằng 0đ gây khó hiểu cho người dùng. | Khi phí ship thực tế bằng 0, mã freeship có được phép áp dụng không hay sẽ trả về lỗi / thông báo phí ship đã bằng 0? | Medium |
| Sau khi áp dụng mã giảm giá thành công, khách hàng mở một tab trình duyệt khác hoặc nhấn nút Reload trang | What if — State | Trạng thái mã giảm giá vừa áp dụng có thể bị mất nếu client không lưu cache/session hoặc không gọi lại API validate. | Khi reload lại trang Checkout, trạng thái các mã đã áp dụng có được giữ nguyên (khôi phục từ session/API) hay user phải nhập lại? | High |
| Hệ thống bên thứ 3 hoặc mạng bị gián đoạn (timeout) đúng lúc user bấm nút "Áp dụng" mã | What when — Timing | Giao diện treo trạng thái loading vô thời hạn, user không biết thao tác có thành công hay không. | Timeout của API áp mã được quy định là bao lâu, và UI hiển thị thông báo lỗi retry như thế nào khi timeout? | Medium |

## 3. Viewpoints & Test Ideas
### Viewpoint 1: Happy Path — Áp dụng mã đơn hàng và mã freeship hợp lệ
1. Khách hàng nhập mã giảm giá loại PERCENT hợp lệ (`SALE20`) tại trang Thanh toán, bấm "Áp dụng" $\rightarrow$ kiểm tra số tiền giảm được tính đúng theo subtotal và cập nhật trạng thái "Đang kích hoạt giảm giá" kèm nút "Gỡ mã".
2. Khách hàng sử dụng tính năng "Nạp mã" nhanh từ danh sách gợi ý cho mã FIXED (`GIAM50K`) $\rightarrow$ kiểm tra mã được điền tự động vào ô input và áp dụng thành công.
3. Khách hàng áp dụng đồng thời 02 mã hợp lệ trên một đơn hàng gồm 01 mã giảm đơn hàng (`SALE20`) và 01 mã freeship (`FREESHIP30`) $\rightarrow$ kiểm tra hệ thống cho phép cộng dồn và hiển thị tách biệt 2 khoản giảm trừ tại khối tổng kết.
4. Khách hàng bấm nút "Gỡ mã" sau khi đã áp dụng mã thành công $\rightarrow$ kiểm tra API `DELETE` được gọi, dòng giảm giá bị xóa khỏi khối tổng kết và ô nhập mã trở về trạng thái trống.
5. Khách hàng kiểm tra mục đơn hàng sau khi đặt hàng thành công với mã giảm giá $\rightarrow$ xác nhận thông tin giảm giá được ghi nhận chính xác vào cơ sở dữ liệu và hiển thị đúng trên hóa đơn điện tử.

### Viewpoint 2: Negative — Xác thực và xử lý lỗi mã không hợp lệ
1. Khách hàng nhập mã giảm giá không tồn tại trong hệ thống (ví dụ: `SAIMATOT`) $\rightarrow$ kiểm tra hệ thống trả về lỗi (HTTP 400/404) với mã lỗi `VOUCHER_NOT_FOUND` và hiển thị thông báo lỗi tương ứng.
2. Khách hàng nhập mã đã quá hạn sử dụng (`HETHAN`) $\rightarrow$ kiểm tra hệ thống từ chối áp dụng và hiển thị thông báo mã đã hết hạn sử dụng.
3. Khách hàng nhập mã giảm giá có tính phân biệt chữ hoa/thường bằng chữ thường (ví dụ: `giam50k`) $\rightarrow$ kiểm tra hệ thống không tự chuẩn hóa và báo lỗi nếu client không tự uppercase trước khi gửi.
4. Khách hàng áp dụng mã khi tổng tiền hàng (subtotal) chưa đạt giá trị tối thiểu quy định (`min_order_value`) $\rightarrow$ kiểm tra hệ thống từ chối áp dụng và thông báo đơn hàng chưa đạt giá trị tối thiểu.
5. Khách hàng cố gắng áp dụng đồng thời 02 mã cùng loại (ví dụ: 02 mã giảm đơn hàng `SALE20` và `GIAM50K`) $\rightarrow$ kiểm tra hệ thống chặn và báo lỗi không cho phép cộng dồn 2 mã cùng loại.
6. Khách hàng cố gắng sử dụng mã giới hạn mua lần đầu (first-order-only) lần thứ hai bằng cùng số điện thoại/email đã đặt hàng trước đó $\rightarrow$ kiểm tra hệ thống chặn và trả về lỗi không đủ điều kiện áp dụng.

### Viewpoint 3: Boundary — Giới hạn giá trị, trần giảm và điều kiện biên
1. Áp dụng mã PERCENT có thiết lập trần giảm tối đa (`max_discount`) với đơn hàng có giá trị rất lớn sao cho số tiền tính ra vượt trần $\rightarrow$ kiểm tra số tiền được giảm thực tế bị chặn lại đúng bằng giá trị `max_discount`.
2. Áp dụng mã giảm giá cho đơn hàng có tổng tiền subtotal sát nút điều kiện tối thiểu (ví dụ: `min_order_value` là 200.000đ, kiểm tra với đơn hàng đúng 200.000đ và đơn hàng 199.999đ) $\rightarrow$ kiểm tra biên hợp lệ và không hợp lệ.
3. Kiểm tra cơ chế làm tròn xuống (`Math.floor`) tới hàng nghìn đối với số tiền giảm ra số lẻ (ví dụ: 15% của 333.000đ = 49.950đ) $\rightarrow$ kiểm tra hệ thống làm tròn chính xác về mức 49.000đ.
4. Áp dụng mã freeship cho đơn hàng có phí vận chuyển thực tế thấp hơn mệnh giá tối đa của mã freeship $\rightarrow$ kiểm tra hệ thống chỉ trừ đúng bằng phí ship thực tế, phần dư không được quy đổi thành tiền mặt hay trừ vào tiền hàng.
5. Kiểm tra thời điểm biên hết hiệu lực của mã giảm giá vào lúc 23:59:59 ngày hết hạn theo múi giờ quy định $\rightarrow$ áp dụng thành công ngay trước mốc thời gian và từ chối áp dụng ngay sau mốc 00:00:00 ngày tiếp theo.

### Viewpoint 4: UX / Usability & State Management — Tương tác giao diện và tự động gỡ mã khi đổi giỏ hàng
1. Khách hàng đã áp dụng mã thành công, sau đó quay lại giỏ hàng bớt sản phẩm khiến subtotal xuống dưới mức `min_order_value` $\rightarrow$ kiểm tra hệ thống tự động gỡ mã, cập nhật lại trạng thái giao diện và đưa tổng tiền về ban đầu.
2. Khách hàng nhập chuỗi mã giảm giá có chứa khoảng trắng thừa ở đầu hoặc cuối (ví dụ: `" GIAM50K "`) và bấm áp dụng $\rightarrow$ kiểm tra xem hệ thống có tự động cắt khoảng trắng (`trim()`) hay báo lỗi.
3. Khi người dùng bấm liên tục nhiều lần vào nút "Áp dụng" trong lúc đang chờ phản hồi từ API $\rightarrow$ kiểm tra trạng thái loading (disable button) để tránh gửi nhiều request trùng lặp (race condition).
4. Sau khi áp dụng mã thành công, khách hàng thực hiện tải lại trang (Reload/F5) $\rightarrow$ kiểm tra trạng thái mã giảm giá có được giữ nguyên trên giao diện hoặc được khôi phục chính xác từ phiên làm việc/API hay không.
5. Kiểm tra trường hợp kết nối mạng bị gián đoạn hoặc timeout khi gọi API áp mã $\rightarrow$ giao diện hiển thị thông báo lỗi thân thiện và cho phép người dùng bấm thử lại (retry) mà không làm treo trang.

## 4. Self Count Check (deterministic, tool count-check.js)
Đạt đủ ngưỡng tối thiểu (missing rules: 5, viewpoint: 4, test idea: 21).
