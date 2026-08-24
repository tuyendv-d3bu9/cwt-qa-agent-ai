# Skill: Missing Rule Finder

## Purpose
Dùng sau `01_requirement_summary.md` — dùng framework 06W từ `memory/semantic/06W.md` để chủ động tìm business rule chưa được đề cập, thay vì chỉ tóm tắt lại những gì đã có.

## ⚠ PHẠM VI OUTPUT — chỉ mục 2

Output là nội dung của ĐÚNG MỘT mục: `## 2. Missing Business Rules (6W)`.
**`agents/qa-analyst/index.js` lắp file, không phải bạn.**

KHÔNG viết lại Requirement Summary (đã có sẵn trong input), KHÔNG viết Viewpoints & Test Ideas
(đó là skill `03`), KHÔNG viết Self Count Check (đó là tool `count-check.js`).
Dùng `###` nếu cần heading con, KHÔNG dùng `##`.

Bộ đếm `count-check.js` đếm **số dòng dữ liệu của bảng** — giữ đúng dạng bảng markdown, đừng
chuyển sang danh sách gạch đầu dòng.

## Knowledge Reference
- `memory/semantic/06W.md` — framework 06W (6 dimension tìm missing rule).
- `knowledge/analysis-integrity.md` — rule chỉ tạo missing rule khi source chưa xác định, không suy diễn tùy tiện.
- `memory/semantic/fact-framework.md` — FACT self-check trước khi ghi deliverable.

## Prompt Type
Chain-of-thought + 06W

## Variables
{{requirement_summary}} — output của skill 01

## PROMPT
Bạn là QA Analyst Agent. Dựa trên bản tóm tắt requirement sau:

{{requirement_summary}}

Dùng framework 06W để tìm tối thiểu 5 missing rule. Với mỗi rule, viết theo format:
| Mô tả │ Loại (theo 06W) │ Rủi ro nếu bỏ qua │ Câu hỏi cần hỏi BA │ Priority (High/Medium/Low) |
Chỉ liệt kê rule THỰC SỰ chưa có trong requirement_summary — không lặp lại rule đã có ở phần BUSINESS RULES.

## Sample Input
requirement_summary = "... BUSINESS RULES: 1. Mỗi đơn áp tối đa 1 voucher ..."

## Sample Output
```
| Mô tả | Loại | Rủi ro | Câu hỏi hỏi BA | Priority |
|---|---|---|---|---|
| Voucher hết hạn giữa lúc user đang checkout thì sao? | What when (timing) | User bị tính giá sai, khiếu nại | Có cần re-validate voucher ngay trước khi submit order không? | High |
```

## Quality Check
> Áp dụng FACT self-check từ `memory/semantic/fact-framework.md` trước khi ghi deliverable.
> Áp dụng rule missing rule từ `memory/semantic/06W.md` và `knowledge/analysis-integrity.md`.

- **Faithful** (xem `knowledge/analysis-integrity.md`): chỉ nêu rule thực sự thiếu, không suy diễn quá xa khỏi domain.
- **Accurate** (xem `memory/semantic/06W.md`): phân loại đúng theo 6 dimension của 06W, không lần lộn loại.
- **Complete** (xem `memory/semantic/06W.md`): bao phủ ít nhất 3/6 câu hỏi 06W khác nhau, không dồn hết vào 1 loại.
- **Traceable**: mỗi rule có câu hỏi cụ thể để hỏi BA, không viết chung chung.
