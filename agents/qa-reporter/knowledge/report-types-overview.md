# Knowledge: Report Types Overview

## Type
Registry / Index

## Content

QA Reporter có 7 loại report, mỗi loại 1 skill riêng. File này là mục lục — không lặp lại chi tiết PROMPT (xem từng skill), chỉ tổng hợp input/output/audience để đối chiếu nhanh.

| # | Report | Skill | Input chính | Output | Audience |
|---|---|---|---|---|---|
| 1 | Bug Report | `01_bug_report_writer.md` | `deliverable-verifier.md` (nhãn BEHAVIOR_MISMATCH/UNCLEAR), `deliverable-test-designer.md` | `output/bug-reports/{critical,major,minor}.md` | Dev/QA |
| 2 | Daily QA Summary | `02_daily_summary_writer.md` | Test execution data, bug list, Blockers, Next actions | `output/daily-summary-{dev,pm}.md` | Dev, PM (2 bản riêng) |
| 3 | Sprint QA Report | `03_sprint_report_writer.md` | Sprint metrics (tính từ deliverable), bug list, `output/sprint-history.json` (sprint trước) | `output/sprint-report.md` | QA Lead/PM |
| 4 | Release Note | `04_release_note_writer.md` | Features đã ship (thủ công), bug đã fix | `output/release-note.md` | PM/Business/Client (non-technical) |
| 5 | RCA Report | `05_rca_report_writer.md` | Bug description, technical cause (thủ công nếu có), incident timeline, fix info | `output/rca-report.md` | Dev/QA Lead |
| 6 | QA Communication | `06_qa_communication_writer.md` | Bug/risk/sprint data tùy template | `output/communications/*.md` | Tùy template (xem skill) |
| 7 | Log & Evidence Narrative | `07_log_narrative_writer.md` | `deliverable-verifier.md` (đã parse sẵn, KHÔNG tự parse lại `test-results.json`) | `output/qa-narrative.md` (≤300 từ) | Dev/QA |

## Rule
- Không chạy toàn bộ 7 report mỗi lần gọi `run()` — chọn đúng loại cần theo tham số `reportTypes` (xem `role.md`, Input/Output contract).
- Report nào cần input agent không tự có (Blockers, New Features, Technical cause...) → đánh dấu `[CẦN BỔ SUNG]`, không suy diễn (xem `traceability-rule.md`).

## Source
Giáo trình QA Agent Reporter (do người dùng cung cấp trực tiếp, 2026-08-14).

## Node referenced
qa-reporter
