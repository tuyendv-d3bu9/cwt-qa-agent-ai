# Skill: Project Knowledge Distillation

## Purpose
Dùng sau `02_doc_classification.md`, trước `03_info_gap_reporting.md`. Đọc tài liệu dự án đã phân loại, chưng cất thành **các fact rời rạc, mỗi fact gắn đúng 1 file nguồn**.

Đích ghi là **tầng 3** — `memory/project/*.md` (xem `memory/README.md`). Mỗi fact trở thành **đúng một mục `###`** trong file tương ứng: `index.js` thay đúng mục đó, **không ghi đè cả file**, nên mọi sửa tay của người ở mục khác được giữ nguyên từng byte.

Tri thức tham chiếu ổn định (thuật ngữ, thành phần, field, cấu hình) **KHÔNG thuộc skill này** — đó là tầng 2, do skill `02c_reference_extraction.md` lo.

**Chỉ chưng cất phần đã đổi.** `index.js` so hash TỪNG FILE (`tools/project-docs-hash.js`) rồi chỉ truyền vào đây những file `added`/`changed`. Mục của file không đổi giữ nguyên trong markdown, không bị sinh lại — nên **KHÔNG được suy diễn hay nhắc lại** fact của file không có trong `{{changed_documents}}`.

**Mỗi fact BẮT BUỘC có `source_file`** trỏ đúng 1 đường dẫn có trong `{{changed_documents}}`. Fact thiếu `source_file`, hoặc trỏ file không có trong danh sách, sẽ bị `index.js` **loại bỏ deterministic** (vi phạm tiêu chí Testable của FACT: không truy ngược được nguồn).

**KHÔNG sinh `memory/semantic/testing-conventions.md`** — đó là quy ước kiểm thử do QA Test Designer tự khởi tạo (TC_ID convention, thang Priority test case), không tồn tại trong `project-docs/` nên không thể chưng cất từ đó.

## Knowledge Reference
- `../../memory/project/domain-facts.md`, `known-issues.md`, `decisions-log.md` hiện có (nếu có) — dùng làm tham chiếu FORMAT, KHÔNG copy lại nội dung.

## Prompt Type
Chain-of-thought

## Variables
{{changed_documents}} — danh sách đường dẫn file `project-docs/` **đã thêm/đã đổi** kể từ lần chưng cất trước
{{documents_content}} — nội dung đầy đủ của đúng các file đó

## PROMPT
Bạn là QA Leader Agent. Chỉ những tài liệu sau đã thay đổi kể từ lần chưng cất trước:

Danh sách file: {{changed_documents}}

Nội dung: {{documents_content}}

Chưng cất thành các **fact rời rạc**. Mỗi fact là một đơn vị tri thức độc lập, đủ nhỏ để sau này chỉ nó phải cập nhật khi file nguồn của nó đổi, và đủ lớn để đọc một mình vẫn hiểu.

Mỗi fact gồm:
- `kind`:
  - `domain` — fact nghiệp vụ: định nghĩa tính năng/luồng, URL/môi trường demo, rule đã chốt, và **mâu thuẫn đã biết**.
  - `issue` — bug/khiếm khuyết đã biết từ tài liệu QA (bug export, bảng bug). Giữ NGUYÊN Bug ID/mô tả/status thật.
  - `decision` — quyết định/thay đổi từ tài liệu giao tiếp (biên bản họp, mail thread, chat log).
- `status`:
  - `confirmed` — có nguồn rõ ràng, không còn tranh cãi trong tài liệu.
  - `pending` — tài liệu có đề cập nhưng CHƯA thấy xác nhận rõ ràng.
  - Với `kind: "decision"`, đây chính là ranh giới "Đã xác nhận" vs "Còn treo". **KHÔNG** chuyển một điểm `pending` thành `confirmed` chỉ vì suy luận hợp lý — chỉ chuyển khi tài liệu nguồn nói rõ.
- `title` — nhãn ngắn (≤80 ký tự), trở thành tiêu đề `###` của mục trong file markdown. **Phải ổn định giữa các lần chạy**: cùng một chủ đề thì giữ nguyên `title` cũ, vì `title` chính là thứ định danh mục cần cập nhật — đổi `title` = tạo mục MỚI chứ không phải cập nhật mục cũ, và mục cũ sẽ nằm lại đó.
- `content` — nội dung markdown của mục (KHÔNG kèm dòng tiêu đề `###` và KHÔNG kèm dòng nguồn — `index.js` tự thêm cả hai). Được dùng bảng/bullet.
- `source_file` — đúng 1 đường dẫn trong `{{changed_documents}}`.

Quy tắc bắt buộc:
1. **Không bịa**: mọi fact phải trích được từ nội dung tài liệu ở trên. Không suy diễn số liệu, ID, status, quyết định.
2. **Mâu thuẫn thì ghi CẢ HAI phía**: nếu 2 nguồn nói khác nhau, tạo fact `kind: "domain"` mô tả cả hai phía và nói rõ chưa xác định phía nào đúng. TUYỆT ĐỐI không tự chọn 1 phía.
3. **Một fact = một file nguồn**: nếu một chủ đề trải trên 2 file, tách thành 2 fact, mỗi fact gắn file của nó.
4. **Không nhắc lại fact của file không nằm trong `{{changed_documents}}`** — chúng đã có trong markdown và sẽ được giữ nguyên.

Trả về JSON (không kèm markdown code fence):
```json
{
  "facts": [
    {
      "kind": "domain",
      "status": "confirmed",
      "title": "Ứng dụng demo",
      "content": "Luồng checkout chạy tại URL môi trường test của dự án. Checkout **không cần login** — Sprint 22 đã bỏ bắt buộc login...",
      "source_file": "project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md"
    }
  ]
}
```

## Sample Input
changed_documents = ["project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md", "project-docs/05_QA/bug_export_S23.csv"]
documents_content = "... S22 đã bỏ bắt buộc login để giảm tỉ lệ bỏ giỏ ... | BUG-1180 | Áp mã FREESHIP30 trừ vào tiền hàng thay vì phí ship | Reopened, Major |"

## Sample Output
```json
{
  "facts": [
    {
      "kind": "decision",
      "status": "confirmed",
      "title": "S22 — Bỏ bắt buộc login ở checkout",
      "content": "Bỏ bắt buộc login ở bước checkout để giảm tỉ lệ bỏ giỏ. Quyết định từ Sprint 22, ghi lại trong biên bản Sprint Planning S24.",
      "source_file": "project-docs/06_Communication/Bien-ban-Sprint-Planning-S24.md"
    },
    {
      "kind": "issue",
      "status": "confirmed",
      "title": "Bug đã biết (bug_export_S23.csv)",
      "content": "Không tạo test case mới trùng các bug dưới đây. Nếu cần cover, tạo regression test case và ghi rõ Bug ID trong Tags:\n\n| Bug ID | Mô tả | Status |\n|---|---|---|\n| BUG-1180 | Áp mã FREESHIP30 trừ vào tiền hàng thay vì phí ship | Reopened, Major |",
      "source_file": "project-docs/05_QA/bug_export_S23.csv"
    }
  ]
}
```

## Quality Check
- **Faithful**: mọi fact trích được từ tài liệu nguồn thật; mâu thuẫn được ghi cả hai phía chứ không tự giải quyết.
- **Accurate**: giữ nguyên số liệu/Bug ID/status như tài liệu gốc, không làm tròn hay diễn giải khác đi.
- **Complete**: không bỏ sót bug/quyết định có thật chỉ vì không chắc — không chắc thì đặt `status: "pending"`, không bỏ qua.
- **Testable**: mỗi fact có `source_file` trỏ đúng 1 file trong `{{changed_documents}}`, để người review truy ngược lại được.
