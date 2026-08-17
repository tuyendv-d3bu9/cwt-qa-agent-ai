# Knowledge: Output Conventions

## Type
Convention

## Content

`output/` (thư mục mới ở gốc repo, KHÔNG bị xóa như `memory/working/`) chứa mọi deliverable hoàn chỉnh của qa-reporter — báo cáo thật cần giữ lại, không phải scratch state của pipeline.

### Đường dẫn theo từng loại report
| Loại report | Đường dẫn |
|---|---|
| Bug Report (theo Severity) | `output/bug-reports/critical.md`, `output/bug-reports/major.md`, `output/bug-reports/minor.md` |
| Daily QA Summary | `output/daily-summary-dev.md`, `output/daily-summary-pm.md` |
| Sprint QA Report | `output/sprint-report.md` |
| Release Note | `output/release-note.md` |
| RCA Report | `output/rca-report.md` |
| QA Communication | `output/communications/bug-escalation.md`, `output/communications/risk-flag.md`, `output/communications/signoff-request.md`, `output/communications/regression-alert.md` |
| Log & Evidence Narrative | `output/qa-narrative.md` |
| Sprint history (dữ liệu trend) | `output/sprint-history.json` |

### Rule
- `output/` KHÔNG nằm trong quy ước "xóa để chạy lại" của `memory/working/` (xem README.md) — mỗi lần chạy GHI ĐÈ đúng file tương ứng với loại report vừa chạy; các report khác không bị đụng tới.
- `memory/working/deliverable-reporter.md` vẫn tồn tại song song — đó là bản ghi nội bộ pipeline (Self Count Check) để Leader/pipeline kiểm tra, KHÔNG phải bản báo cáo cho người đọc cuối. Không nhầm lẫn 2 vai trò này.

## Source
Thiết kế QA Reporter, xác nhận cùng người dùng 2026-08-14.

## Node referenced
qa-reporter
