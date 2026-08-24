# Knowledge: Output Conventions

## Type
Convention

## Content

`.qa-run/reports/` chứa mọi deliverable hoàn chỉnh của qa-reporter — báo cáo thật cần giữ lại, không phải scratch state của pipeline. Mọi đường dẫn lấy từ `agents/runtime/paths.js`, không viết cứng ở đây.

### Đường dẫn theo từng loại report
| Loại report | Đường dẫn |
|---|---|
| Bug Report (theo Severity) | `.qa-run/reports/bug-reports/critical.md`, `.qa-run/reports/bug-reports/major.md`, `.qa-run/reports/bug-reports/minor.md` |
| Daily QA Summary | `.qa-run/reports/daily-summary-dev.md`, `.qa-run/reports/daily-summary-pm.md` |
| Sprint QA Report | `.qa-run/reports/sprint-report.md` |
| Release Note | `.qa-run/reports/release-note.md` |
| RCA Report | `.qa-run/reports/rca-report.md` |
| QA Communication | `.qa-run/reports/communications/bug-escalation.md`, `.qa-run/reports/communications/risk-flag.md`, `.qa-run/reports/communications/signoff-request.md`, `.qa-run/reports/communications/regression-alert.md` |
| Log & Evidence Narrative | `.qa-run/reports/qa-narrative.md` |
| Sprint history (dữ liệu trend) | `.qa-run/reports/sprint-history.json` |

### Rule
- `.qa-run/` là **sản phẩm của một lần chạy** và xoá được tự do (xem README.md, mục 3 ranh giới). Trong đó `reports/` mỗi lần chạy GHI ĐÈ đúng file tương ứng với loại report vừa chạy; các report khác không bị đụng tới.
- `.qa-run/deliverables/deliverable-reporter.md` vẫn tồn tại song song — đó là bản ghi nội bộ pipeline (Self Count Check) để Leader/pipeline kiểm tra, KHÔNG phải bản báo cáo cho người đọc cuối. Không nhầm lẫn 2 vai trò này.

## Source
Thiết kế QA Reporter, xác nhận cùng người dùng 2026-08-14.

## Node referenced
qa-reporter
