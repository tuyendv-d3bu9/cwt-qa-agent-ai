# Project Knowledge: Known Issues

## Type
Fact / Registry (chưng cất từ tài liệu QA của dự án)

## Content



### Bug đã biết
| B-1 | x |

*Nguồn: `project-docs/05_QA/bug.csv`*

### Danh sách Bug export S23
Danh sách bug ghi nhận từ QA (Bug ID, Summary, Status, Priority):
| Bug ID | Summary | Status | Priority |
|---|---|---|---|
| BUG-1142 | Tổng tiền lệch 1đ khi áp mã phần trăm | In Progress | Major |
| BUG-1150 | Áp mã xong bấm back rồi vào lại vẫn còn giảm gia | Open | Major |
| BUG-1151 | Thông báo lỗi hiện "Voucher khong ton tai" khác design | Open | Minor |
| BUG-1152 | Nút Áp dụng không disable khi ô nhập rỗng trên mobile | Closed (Fixed) | Minor |
| BUG-1163 | Nhập mã chữ thường không nhận | Closed (Fixed) | Major |
| BUG-1170 | Mã hết hạn vẫn áp được nếu áp lúc 00:30 sáng | Open | Critical |
| BUG-1171 | Bớt hàng sau khi áp mã vẫn giữ nguyên giảm giá | Open | - |
| BUG-1174 | Hiển thị sai định dạng tiền te ở khối tổng kết (730.000 VND thay vì 730.000d) | Open | Minor |
| BUG-1180 | Áp mã FREESHIP30 trừ vào tiền hàng thay vì phí ship | Reopened | Major |
| BUG-1181 | Không có thông báo khi mã hết lượt sử dụng | Open (Not a bug - chua implement) | Minor |

*Nguồn: `project-docs/05_QA/bug_export_S23.csv`*

## Source
Xem dòng *Nguồn* của từng mục bên trên.

## Consumed by
Node thiết kế test (đánh dấu regression), tự động hoá (nhận biết bug đã biết), báo cáo (grounding Severity).
