# Skill: Sprint Report Writer

## Purpose
Viết Sprint QA Report hoàn chỉnh, 5 section chuẩn. Số liệu (pass rate/fail rate/bug density) PHẢI lấy từ `tools/sprint-metrics-calculator.js` (deterministic) — KHÔNG để LLM tự tính toán số.

## Knowledge Reference
- `knowledge/sprint-metrics-conventions.md` — công thức + quy ước `.qa-run/reports/sprint-history.json`.
- `knowledge/traceability-rule.md`

## Prompt Type
Chain-of-thought

## Variables
{{sprint_metrics}} — output đã tính sẵn từ `sprint-metrics-calculator.js` (totalTests, passed, failed, passRate, failRate, bugDensity)
{{previous_sprint_metrics}} — phần tử cuối cùng trong `.qa-run/reports/sprint-history.json`, hoặc `null` nếu chưa có
{{bug_list}} — bug draft đã viết ở skill 01

## PROMPT
Bạn là QA Reporter Agent. Dựa trên số liệu ĐÃ TÍNH SẴN (không tự tính lại):

{{sprint_metrics}}
{{previous_sprint_metrics}}
{{bug_list}}

Viết Sprint QA Report đúng 5 section:
1. **Sprint Metrics**: liệt kê nguyên số liệu từ `{{sprint_metrics}}` — Total test cases, Passed/Failed/Blocked, Pass rate/Fail rate, Bug density. KHÔNG tự tính lại hay làm tròn khác đi.
2. **Trend Analysis**: so sánh với `{{previous_sprint_metrics}}`. Nếu là `null`, ghi rõ "Chưa có dữ liệu sprint trước để so sánh — đây là lần đo đầu tiên", KHÔNG tự bịa số liệu sprint trước.
3. **Risk Assessment**: liệt kê open bug/critical issue từ `{{bug_list}}`, gán mức Risk (High/Medium/Low) kèm LÝ DO cụ thể (không gán mà không giải thích).
4. **Recommendation**: cụ thể, actionable, chỉ rõ module/feature/action — không viết chung chung kiểu "cần cải thiện chất lượng".
5. **Evidence / Appendix**: liệt kê bug list đầy đủ (link tới `.qa-run/reports/bug-reports/*.md`), category, evidence liên quan.

## Sample Output
```
## Sprint QA Report

### 1. Sprint Metrics
Total: 12 | Passed: 9 | Failed: 3 | Pass rate: 75% | Fail rate: 25% | Bug density: 0.17

### 2. Trend Analysis
Chưa có dữ liệu sprint trước để so sánh — đây là lần đo đầu tiên.

### 3. Risk Assessment
- TC-D-004 (Major, BEHAVIOR_MISMATCH): Risk High — ảnh hưởng trực tiếp tới tính đúng của số tiền giảm giá.

### 4. Recommendation
Ưu tiên xác nhận TC-D-004 trước khi release, vì liên quan tính toán tiền tại checkout.

### 5. Evidence / Appendix
Xem `.qa-run/reports/bug-reports/major.md` — TC-D-004.
```

## Quality Check
- **Faithful**: số liệu Sprint Metrics copy nguyên từ `sprint_metrics`, không tự sửa.
- **Accurate**: Trend Analysis chỉ so sánh khi có `previous_sprint_metrics` thật.
- **Complete**: đủ 5 section.
- **Traceable**: Risk Assessment + Evidence trỏ đúng về bug draft/TC_ID nguồn.
