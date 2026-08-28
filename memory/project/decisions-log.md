# Project Knowledge: Decisions Log

## Type
Fact / Change History (chưng cất từ tài liệu giao tiếp của dự án)

## Content



### Biên bản Sprint Planning S24
**Trạng thái**: Đã xác nhận

Sprint 24 lên scope: CR-005 cộng dồn voucher (PA2), trần giảm tối đa cho mã %, mã first-order-only, quota chiến dịch, fix BUG-1142. Các vấn đề treo: quota chưa rõ thông báo hết quota, quy tắc làm tròn (đang xem xét Math.floor), case đổi giỏ sau áp mã (treo chờ PO), timezone expired_at (treo chờ dev). Nhắc lại S22 từng bỏ bắt buộc login ở checkout (nhưng sau đó đã bị đảo lại ở S25).

*Nguồn: `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md`*

### Biên bản Sprint Planning S25
**Trạng thái**: Đã xác nhận

Bản web test đã lên `ShopGo Store v2.0` (thay đổi lớn, test case cũ làm lại). Các quyết định quan trọng:
1. **Đảo lại quyết định S22:** Huỷ bỏ việc bỏ login ở checkout. Từ v2.0 bắt buộc đăng nhập mới vào được giỏ hàng và thanh toán (action A2 của S24 bị huỷ).
2. Phí vận chuyển v2.0 là phẳng 30.000đ, miễn phí từ 200.000đ (tính trước khi trừ voucher), khác biểu phí 5 khu vực.
3. Case "đổi giỏ sau khi áp mã": xác nhận feature là mã không tự gỡ, phần giảm về 0 và chặn ở nút Đặt hàng (A5 của S24 đóng).
4. Điểm chưa chốt: Đăng nhập không kiểm tra mật khẩu (chưa rõ bug hay giới hạn demo); tài khoản role `vip` chưa có ưu đãi riêng; mã nhập chữ thường áp được do UI tự uppercase nhưng API phân biệt hoa thường.

*Nguồn: `project-docs/06_Communication/Bien-ban-Sprint-Planning-S25.md`*

### Chuỗi email trao đổi CR-005 (Cộng dồn voucher)
**Trạng thái**: Đã xác nhận

PO chốt chọn **PA2** cho chiến dịch Back to School:
1. Cho phép tối đa 2 mã trên 1 đơn: **01 mã giảm đơn hàng + 01 mã freeship**. Không cho 2 mã cùng loại.
2. Thứ tự tính: giảm tiền hàng → tính phí ship → trừ freeship.
3. Min order của mã giảm đơn hàng xét theo tiền hàng, chưa gồm phí ship.
4. Mã freeship chỉ trừ tối đa bằng đúng phí ship thực tế, dư không quy đổi tiền mặt.
5. Mã dành cho khách mua lần đầu dùng 1 lần duy nhất trên 1 tài khoản.

*Nguồn: `project-docs/06_Communication/CR-005-Mail-thread.md`*

### GAP-001 — Mâu thuẫn phiên bản BRD Khuyến mại
**Trạng thái**: Đã xác nhận

**Câu hỏi:** Phiên bản BRD-Promotion-v1.2.md hoàn toàn thay thế v1.0.md hay cần tham chiếu song song cả hai phiên bản?

**Trả lời (người dùng xác nhận 2026-08-28):** Dùng phiên bản v1.2

*Nguồn của vấn đề: `02_BA/BRD-Promotion-v1.0.md` vs `02_BA/BRD-Promotion-v1.2.md`*

*Nguồn: `.qa-run/deliverables/gap-report.md`*

### GAP-002 — Thiếu thông tin đặc tả kỹ thuật chi tiết cho luồng Checkout và Voucher
**Trạng thái**: Đã xác nhận

**Câu hỏi:** Tài liệu `03_DEV/Spec.md` có cần được cập nhật theo các API spec mới nhất về voucher checkout hay không?

**Trả lời (người dùng xác nhận 2026-08-28):** Cần cập nhật lại

*Nguồn của vấn đề: `03_DEV/Spec.md` vs `03_DEV/API-spec-voucher-checkout.md`*

*Nguồn: `.qa-run/deliverables/gap-report.md`*

## Source
Xem dòng *Nguồn* của từng mục bên trên.

## Consumed by
Tham chiếu cho người + node phân tích/điều phối khi cần tra quyết định đã chốt.
