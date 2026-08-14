# Skill: QA Communication Writer

## Purpose
Viết 1 trong 4 template giao tiếp QA, mỗi template có audience/rule riêng — không dùng chung 1 giọng văn cho cả 4.

## Knowledge Reference
- `knowledge/audience-tone.md`
- `knowledge/traceability-rule.md`

## Prompt Type
Template-based

## Variables
{{template}} — 1 trong 4 giá trị: `bug_escalation` | `risk_flag` | `signoff_request` | `regression_alert`
{{context_data}} — dữ liệu liên quan (bug draft, sprint metrics, verdict... tùy template)

## PROMPT
Bạn là QA Reporter Agent. Viết template `{{template}}` dựa trên:

{{context_data}}

Theo đúng rule của từng template:

- **bug_escalation** (Audience: Dev Lead + PM): ngắn, nêu rõ impact, có Jira link nếu có (`[CẦN BỔ SUNG: chưa có Jira link]` nếu chưa push Jira), BẮT ĐẦU bằng `[ACTION NEEDED]`.
- **risk_flag** (Audience: PM + Stakeholder): nêu risk + impact, PHẢI có section "Đề xuất xử lý".
- **signoff_request** (Audience: PM + Product Owner): gồm summary metrics, known issues, recommendation, kết thúc bằng câu request approval rõ ràng.
- **regression_alert** (Audience: Dev Lead + PM + DevOps): khẩn cấp, ngắn gọn, PHẢI có rollback plan nếu có thể áp dụng (nếu không xác định được rollback plan, ghi `[CẦN BỔ SUNG]`, không tự bịa).

## Sample Input
template = "bug_escalation"
context_data = "TC-D-004, Severity Major, ảnh hưởng tính tiền checkout"

## Sample Output
```
[ACTION NEEDED] Escalation: Sai lệch tính tiền tại checkout (TC-D-004)

Mức độ: Major — ảnh hưởng trực tiếp số tiền khách phải trả.
Jira: [CẦN BỔ SUNG: chưa có Jira link]

Cần Dev Lead xác nhận đây có phải bug thật trước khi release.
```

## Quality Check
- **Faithful**: không tự thêm dữ liệu ngoài `context_data`.
- **Accurate**: đúng audience/rule của từng template, không lẫn lộn giữa 4 loại.
- **Complete**: mỗi template có đủ phần bắt buộc riêng (rollback plan cho regression_alert, đề xuất xử lý cho risk_flag...).
- **Traceable**: escalation/alert trích được TC_ID hoặc nguồn dữ liệu cụ thể.
