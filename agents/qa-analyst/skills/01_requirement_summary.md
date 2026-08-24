# Skill: Requirement Summary

## Purpose
Dùng đầu tiên khi QA Analyst nhận task từ Leader (qua `.qa-run/deliverables/task-assignment.md`). Đọc tài liệu liên quan trong `project-docs/` và tóm tắt theo 7 phần chuẩn — làm nền cho 2 skill tiếp theo (missing rule, viewpoint).

## ⚠ PHẠM VI OUTPUT — chỉ mục 1, KHÔNG phải cả deliverable

Output của skill này là **nội dung của ĐÚNG MỘT mục**: `## 1. Requirement Summary` trong
`deliverable-analyst.md`. **`agents/qa-analyst/index.js` lắp file, không phải bạn.**

**KHÔNG viết** Missing Business Rules, Viewpoints & Test Ideas, hay Self Count Check — đó là
skill `02`, skill `03` và tool `count-check.js`. Viết thêm chúng vào đây thì file sẽ có **2 bản**
mỗi phần.

Vì sao nói rõ đến vậy: `knowledge/delivery-rules.md` mục "Chỉ ghi `deliverable-analyst.md`" mô tả
**quyền ghi file của node**, nhưng nếu đọc thành "phải sinh ra cả nội dung file" thì skill này sẽ
làm luôn việc của 2 skill sau. Đã xảy ra thật: deliverable phồng từ 13.5KB lên 44KB, mỗi mục lặp
3 lần, và mọi cửa kiểm vẫn PASS vì bản nhân đôi dư số dòng để thoả phép đếm.

**Dùng `###` cho 7 phần, KHÔNG dùng `##`.** Nội dung này nằm *bên trong* `## 1. Requirement
Summary`; nếu bạn cũng dùng `## 1.`, `## 2.`… thì chúng đụng với các mục `## 1.`–`## 4.` của
deliverable, và `updateCountCheck()` cắt sai mục ở nhánh revision.

## Knowledge Reference
- `knowledge/requirement-summary.md` — schema 7 phần chuẩn và rule tổng hợp requirement.
- `knowledge/analysis-integrity.md` — source integrity rules, traceability và boundary.
- `memory/semantic/fact-framework.md` — FACT self-check trước khi ghi deliverable.

## Prompt Type
Chain-of-thought

## Variables
{{task}} — nội dung task-assignment.md nhận từ Leader (gồm task_scope + danh sách validated_documents)
{{doc_contents}} — nội dung các file liên quan đã đọc được từ project-docs/

## PROMPT
Bạn là QA Analyst Agent. Dựa trên task được giao:

{{task}}

Và nội dung tài liệu liên quan:

{{doc_contents}}

Tóm tắt theo đúng 7 bước: (1) FEATURE OVERVIEW, (2) ACTOR & USER ROLE, (3) BUSINESS RULES (đánh số), (4) HAPPY PATH, (5) ALTERNATE FLOWS, (6) OUT OF SCOPE, (7) OPEN QUESTIONS (câu hỏi cần hỏi BA, bao gồm mọi trường hợp 2 nguồn tài liệu mâu thuẫn nhau — KHÔNG tự chọn nguồn nào đúng). Gắn tag `[GIẢ ĐỊNH]` cho mọi thông tin không có trong tài liệu gốc nhưng cần giả định để viết tiếp.

Định dạng bắt buộc:
- Mỗi phần là một heading **`### <số>. <TÊN>`** — dùng `###`, KHÔNG dùng `##`.
- Trả về **CHỈ 7 phần trên**. Không thêm Missing Business Rules, không thêm Viewpoints & Test Ideas, không thêm Self Count Check, không thêm heading `# Requirement Summary` bao ngoài.
- Không chép lại nội dung `{{doc_contents}}` vào câu trả lời — chỉ tóm tắt.

## Sample Input
task = "Phân tích Function D - Voucher Checkout"
doc_contents = { "02_BA/BRD-voucher-v1.2.md": "...", "01_Business/promo-policy.md": "..." }

## Sample Output
```
### 1. FEATURE OVERVIEW
Cho phép user áp mã voucher tại bước checkout để giảm giá đơn hàng.

### 3. BUSINESS RULES
1. Mỗi đơn hàng áp tối đa 1 voucher. [GIẢ ĐỊNH: BRD không nói rõ, suy từ UI mockup chỉ có 1 ô nhập mã]
...

### 7. OPEN QUESTIONS
1. BRD v1.2 (draft) và promo-policy.md công khai mâu thuẫn về mức giảm tối đa — bản nào áp dụng?
...
```

## Quality Check
> Áp dụng FACT self-check từ `memory/semantic/fact-framework.md` trước khi ghi deliverable.

- **Faithful** (xem `knowledge/analysis-integrity.md`): không suy diễn ngoài những gì tài liệu có, mọi giả định đều gắn `[GIẢ ĐỊNH]`.
- **Accurate**: điều kiện và business rule phải chính xác theo nguồn, không tự chọn khi 2 nguồn mâu thuẫn.
- **Complete** (xem `knowledge/requirement-summary.md`): đủ 7 phần; phần 7 (Open Questions) không được bỏ trống nếu phát hiện mâu thuẫn.
- **Testable** (xem `memory/semantic/fact-framework.md`): mỗi business rule phải có thể kiểm chứng bằng source hoặc test case cụ thể.
- **Traceable** (xem `knowledge/analysis-integrity.md`): mỗi business rule nên chỉ rõ trích từ file nào khi có thể.
