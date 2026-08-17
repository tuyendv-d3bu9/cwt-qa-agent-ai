# Skill: Project Knowledge Distillation

## Purpose
Dùng sau `02_doc_classification.md`, trước `03_info_gap_reporting.md`. Đọc toàn bộ `project-docs/` đã phân loại, chưng cất thành tri thức dự án dùng chung cho cả 6 agent, ghi vào `memory/project/domain-facts.md`, `memory/project/known-issues.md`, `memory/project/decisions-log.md`.

**Chỉ chạy khi `project-docs/` đã đổi** so với lần chưng cất trước (so sánh hash nội dung — `index.js` tự quyết định trước khi gọi skill này qua `tools/project-docs-hash.js`, KHÔNG dùng LLM để phát hiện thay đổi). Skill này chỉ lo phần sinh nội dung.

**KHÔNG regenerate `memory/project/glossary.md`** — file đó là quy ước kiểm thử do QA Test Designer tự khởi tạo (TC_ID convention, thang Priority test case), không tồn tại trong `project-docs/` nên không thể chưng cất từ đó (xem lưu ý đầu file `glossary.md`).

## Knowledge Reference
- `../../memory/project/domain-facts.md`, `known-issues.md`, `decisions-log.md` hiện có (nếu có) — dùng làm tham chiếu format, KHÔNG copy nguyên văn nội dung cũ nếu project-docs/ đã có thông tin mới hơn.

## Prompt Type
Chain-of-thought

## Variables
{{classified_documents}} — danh sách đường dẫn file đã phân loại trong `project-docs/` (từ `list_files`)
{{project_docs_content}} — nội dung đầy đủ (hoặc phần liên quan) của các file đã phân loại

## PROMPT
Bạn là QA Leader Agent. Đọc toàn bộ tài liệu dự án đã phân loại:

Danh sách file: {{classified_documents}}

Nội dung: {{project_docs_content}}

Chưng cất thành 3 phần tri thức dự án, mỗi phần chỉ ghi thông tin CÓ THẬT trong tài liệu nguồn — không suy diễn, không bịa số liệu/quyết định:

1. **domainFacts** — Fact nghiệp vụ đã xác nhận: định nghĩa tính năng/luồng chính, URL/môi trường demo (nếu có), các rule đã chốt (vd: thay đổi luồng đã approve). Nếu tài liệu có mâu thuẫn (2 nguồn nói khác nhau), ghi lại CẢ HAI vào mục "Contradiction đã biết", KHÔNG tự chọn 1 phía đúng.
2. **knownIssues** — Danh sách bug/khiếm khuyết đã biết từ tài liệu QA (bug export, nếu có file CSV/bảng bug trong `05_QA/`) — giữ nguyên Bug ID/mô tả/status thật, không tự đổi. Nếu tài liệu QA có dữ liệu Severity thật (các mức đã quan sát), liệt kê đúng các mức đó, không tự thêm mức khác.
3. **decisionsLog** — Quyết định/thay đổi đã XÁC NHẬN từ tài liệu giao tiếp (`06_Communication/`, biên bản họp, mail thread) — tách riêng mục "Đã xác nhận" (có nguồn rõ ràng, không còn tranh cãi) và mục "Còn treo" (đề cập nhưng chưa thấy xác nhận rõ ràng trong tài liệu). KHÔNG tự quyết định 1 điểm "Còn treo" thành "Đã xác nhận" chỉ vì suy luận hợp lý — chỉ chuyển khi tài liệu nguồn nói rõ.

Trả về JSON (không kèm markdown code fence):
```json
{
  "domainFacts": "<nội dung markdown đầy đủ cho mục ## Content của domain-facts.md>",
  "knownIssues": "<nội dung markdown đầy đủ cho mục ## Content của known-issues.md>",
  "decisionsLog": "<nội dung markdown đầy đủ cho mục ## Content của decisions-log.md>"
}
```

## Sample Input
classified_documents = ["project-docs/01_Business/ShopGo-Overview.md", "project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md", ...]
project_docs_content = "... S22 đã bỏ bắt buộc login để giảm tỉ lệ bỏ giỏ ..."

## Sample Output
```json
{
  "domainFacts": "### Ứng dụng demo\nShopGo checkout chạy tại `https://cwshopgo.github.io`. Checkout không cần login — S22 đã bỏ bắt buộc login...",
  "knownIssues": "### Bug đã biết\n| Bug ID | Mô tả | Status |\n|---|---|---|\n| BUG-1142 | ... | In Progress |",
  "decisionsLog": "### Đã xác nhận\n| Ngày/Sprint | Quyết định | Nguồn |\n|---|---|---|\n| S22 | Bỏ bắt buộc login... | Bien-ban-Sprint-Planning-S24.md |\n\n### Còn treo\n- Phiên bản BRD chính thức..."
}
```

## Quality Check
- **Faithful**: mọi fact/bug/quyết định đều trích được từ tài liệu nguồn thật, không bịa.
- **Accurate**: giữ nguyên số liệu/ID/status như tài liệu gốc, không làm tròn hay diễn giải khác đi.
- **Complete**: không bỏ sót bug/quyết định có thật trong tài liệu chỉ vì không chắc chắn — nếu không chắc, đưa vào "Còn treo" thay vì bỏ qua.
- **Testable**: mỗi fact/quyết định trong `domainFacts`/`decisionsLog` phải trích được nguồn (tên file), để người review truy ngược lại được.
