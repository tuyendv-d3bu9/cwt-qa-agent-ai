# Knowledge: Bug Report Schema

## Type
Convention / Registry

## Content

### 7 trường chuẩn
`Title`, `Environment`, `Steps to Reproduce`, `Actual Result`, `Expected Result`, `Severity`, `Priority`.

### Severity vs Priority — 2 trục ĐỘC LẬP, hay bị nhầm lẫn
- **Severity** (mức độ nghiêm trọng KỸ THUẬT của lỗi với hệ thống — không phụ thuộc lịch làm việc): `Critical` / `Major` / `Minor` — định nghĩa đầy đủ + dữ liệu thật grounding tại `memory/project/known-issues.md` (cross-node, KHÔNG lặp lại thang đo ở đây, tránh 2 nguồn lệch nhau khi cập nhật).
- **Priority** (độ ưu tiên XỬ LÝ theo góc nhìn business — có thể đổi theo lịch sprint, không phụ thuộc mức độ nghiêm trọng kỹ thuật): `High` / `Medium` / `Low`.
- Một lỗi Severity Critical vẫn có thể Priority Low (ví dụ: crash ở tính năng sắp bị gỡ bỏ); ngược lại 1 lỗi Severity Minor vẫn có thể Priority High (ví dụ: sai chính tả trên trang chủ ngay trước sự kiện marketing lớn). KHÔNG suy Priority trực tiếp từ Severity hay ngược lại.
- **KHÔNG nhầm với "Priority" của test case** (`memory/semantic/testing-conventions.md`, thang `Critical/High/Medium/Low`) — đó là độ ưu tiên khi THIẾT KẾ test, khác hoàn toàn với Priority của BUG REPORT ở đây (độ ưu tiên khi XỬ LÝ bug đã tìm thấy). Hai khái niệm dùng chung tên field nhưng thang đo và ý nghĩa khác nhau — phải ghi rõ ngữ cảnh khi nhắc tới, không dùng lẫn.

### Environment (mặc định)
`<URL môi trường test — lấy từ cấu hình tầng 2 `base_url`>, trình duyệt Chromium qua MCP Playwright (headless)` — trừ khi `test-results.json` ghi rõ trình duyệt/thiết bị khác, không tự giả định thiết bị/OS ngoài những gì đã chạy thật.

### Rule bổ sung (từ giáo trình QA Agent Reporter, Mục 1)
- Không bịa thông tin hoặc thêm steps ngoài Steps gốc của test case.
- Expected Result phải cụ thể, kiểm chứng được (không viết chung chung).
- **Luôn review output AI trước khi dùng** — mọi bug report ở đây là DRAFT, không phải kết luận cuối cùng (xem `traceability-rule.md` và trạng thái "DRAFT" bắt buộc trong `skills/01_bug_report_writer.md`).

## Source
`Severity`/`Priority` là schema mới, tự khởi tạo cho QA Reporter (chưa có sẵn trong repo trước đây) — thang Severity + dữ liệu grounding thật nay sống tại `memory/project/known-issues.md` (single-source, tránh 2 nơi định nghĩa lệch nhau); 3 mức Priority tự đề xuất, xác nhận cùng người dùng khi cần.

## Node referenced
qa-reporter