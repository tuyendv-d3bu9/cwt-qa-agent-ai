# Project Knowledge: Known Issues — Function D

## Type
Fact / Registry (distilled from `project-docs/`)

## Content

### Bug đã biết (`project-docs/05_QA/bug_export_S23.csv`)
Không tạo test case mới trùng các bug dưới đây. Nếu cần cover, tạo regression test case và ghi rõ Bug ID liên quan trong trường Tags (ví dụ `[BUG-1170]`):

| Bug ID | Mô tả | Status |
|---|---|---|
| BUG-1142 | Tổng tiền lệch 1đ khi áp mã phần trăm | In Progress |
| BUG-1150 | Áp mã xong bấm back rồi vào lại vẫn còn giảm giá | Open |
| BUG-1151 | Thông báo lỗi hiện "Voucher không tồn tại" khác design | Open |
| BUG-1152 | Nút Áp dụng không disable khi ô nhập rỗng trên mobile | Closed (Fixed, S23) |
| BUG-1163 | Nhập mã chữ thường không nhận | Closed (Fixed, S23) |
| BUG-1170 | Mã hết hạn vẫn áp được nếu áp lúc 00:30 sáng | Open, Critical |
| BUG-1171 | Bớt hàng sau khi áp mã vẫn giữ nguyên giảm giá | Open |
| BUG-1174 | Hiển thị sai định dạng tiền tệ ở khối tổng kết | Open, Minor |
| BUG-1180 | Áp mã FREESHIP30 trừ vào tiền hàng thay vì phí ship | Reopened, Major |
| BUG-1181 | Không có thông báo khi mã hết lượt sử dụng | Open, Minor (ghi chú: "Not a bug - chưa implement") |

### Severity taxonomy (mức độ nghiêm trọng KỸ THUẬT — không phụ thuộc lịch làm việc)
Đúng 3 mức quan sát thật trong `bug_export_S23.csv` ở trên — không tự thêm mức khác:

| Severity | Ý nghĩa |
|---|---|
| **Critical** | Chặn/sai lệch nghiêm trọng luồng chính hoặc dữ liệu tiền của khách hàng |
| **Major** | Sai lệch rõ ràng nhưng có workaround hoặc không chặn hoàn toàn luồng chính |
| **Minor** | Ảnh hưởng nhỏ, chủ yếu UI/UX, không sai lệch dữ liệu/tiền |

Severity là trục ĐỘC LẬP với Priority xử lý bug (xem `agents/qa-reporter/knowledge/bug-report-schema.md` để phân biệt 2 trục này) — không suy Priority trực tiếp từ Severity hay ngược lại.

### Bug đã biết (bug_export_S23.csv)
Danh sách các lỗi tồn đọng cần lưu ý khi kiểm thử:

| Bug ID | Mô tả | Status |
|---|---|---|
| BUG-1142 | Tổng tiền lệch 1đ khi áp mã phần trăm | In Progress |
| BUG-1170 | Mã hết hạn vẫn áp được nếu áp lúc 00:30 sáng | Open |
| BUG-1180 | Áp mã FREESHIP30 trừ vào tiền hàng thay vì phí ship | Reopened |
| BUG-1181 | Không có thông báo khi mã hết lượt sử dụng | Open (Not a bug - chưa implement) |

*Nguồn: `project-docs/05_QA/bug_export_S23.csv`*

### Bug đã biết
| B-1 | x |

*Nguồn: `project-docs/05_QA/bug.csv`*

## Source
`project-docs/05_QA/bug_export_S23.csv`.

## Consumed by
qa-test-designer (đánh dấu regression test case), qa-automation (nhận biết hành vi đã là bug đã biết khi author spec), qa-reporter (grounding cho Severity của Bug Report — xem `bug-report-schema.md`).
