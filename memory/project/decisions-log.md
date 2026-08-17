# Project Knowledge: Decisions Log — Function D

## Type
Fact / Change History (distilled from `project-docs/06_Communication/`)

## Content

Chỉ ghi quyết định ĐÃ XÁC NHẬN. Không suy đoán hay tự chọn 1 phía khi còn mâu thuẫn/chưa trả lời — mục "Còn treo" bên dưới liệt kê đúng các điểm này thay vì tự quyết định.

### Đã xác nhận

| Ngày/Sprint | Quyết định | Nguồn |
|---|---|---|
| S22 | Bỏ bắt buộc login ở bước checkout để giảm tỉ lệ bỏ giỏ | `project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md` |

### Còn treo (KHÔNG tự quyết định thay — chờ người dùng trả lời `memory/working/gap-report.md`)
- **Phiên bản BRD chính thức**: tồn tại `BRD-Promotion-v1.0.md` và `BRD-Promotion-v1.2.md`, chưa xác nhận bản nào là Source of Truth.
- **Chat log vs API spec**: `06_Communication/Chat-shopgo-checkout.md` thảo luận thay đổi logic checkout, chưa xác nhận đã cập nhật vào `03_DEV/API-spec-voucher-checkout.md` hay chưa.
- **CR-005**: `06_Communication/CR-005-Mail-thread.md` đề cập thay đổi yêu cầu, chưa có tài liệu BA tương ứng xác nhận đã approve.

Khi người dùng trả lời 3 điểm trên trong `gap-report.md`, lần chưng cất tiếp theo (`qa-leader` skill `02b_project_knowledge_distillation.md`) sẽ cập nhật bảng "Đã xác nhận" — không phải việc của node nào khác tự làm.

## Source
`project-docs/06_Communication/` (toàn bộ), đối chiếu với `memory/working/gap-report.md` (nếu có câu trả lời).

## Consumed by
Chưa có node nào load file này qua `index.js` ở thời điểm 2026-08-17 (bảng "Đã xác nhận" còn quá ngắn để đáng inject vào mọi prompt) — giữ làm nguồn tham chiếu con người + tương lai khi `qa-analyst`/`qa-leader` cần tra cứu quyết định đã chốt.
