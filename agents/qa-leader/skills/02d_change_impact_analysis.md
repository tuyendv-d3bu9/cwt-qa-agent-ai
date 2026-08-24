# Skill: Change Impact Analysis

## Purpose
Chạy sau `02b`/`02c`, khi có tài liệu dự án **đổi nội dung hoặc bị xoá**. Diễn giải tác động của thay đổi và đề xuất thứ tự xử lý, để người dùng biết cần chạy lại bước nào chứ không phải tự đoán.

**Ranh giới quan trọng — đọc trước khi làm**: danh sách artifact bị ảnh hưởng **KHÔNG do bạn tìm**. Nó đã được `tools/impact-analysis.js` truy từ graph `derives_from` một cách deterministic và truyền vào đây qua `{{impact_data}}`. Việc của skill này là **giải thích**, không phải phát hiện.

- **KHÔNG thêm** artifact nào ngoài danh sách đã cho, dù bạn nghĩ nó cũng bị ảnh hưởng.
- **KHÔNG bỏ** artifact nào trong danh sách vì cho rằng nó không quan trọng.
- Nếu danh sách rỗng, nói rõ là **graph chưa ghi được quan hệ nào**, KHÔNG kết luận "không có gì bị ảnh hưởng".

Lý do của ranh giới này: một tập phụ thuộc do LLM đoán thì không kiểm chứng được và sẽ bỏ sót âm thầm — cùng nguyên tắc với các tool đếm/kiểm tra deterministic khác trong repo.

## Knowledge Reference
- `../../memory/README.md` — 5 tầng memory + chuỗi truy vết `doc → section → knowledge-file → testcase → spec`.
- `knowledge/task-management-conventions.md` — quy ước ưu tiên và ranh giới trách nhiệm giữa các node.

## Prompt Type
Chain-of-thought

## Variables
{{changed_documents}} — tài liệu đã đổi nội dung / bị xoá, kèm lý do
{{documents_diff_summary}} — nội dung hiện tại của các tài liệu đó (để hiểu thay đổi nói về cái gì)
{{impact_data}} — JSON deterministic từ `tools/impact-analysis.js`: danh sách artifact lỗi thời, loại, do tài liệu nào, ai cần xử lý

## PROMPT
Bạn là QA Leader Agent. Các tài liệu dự án sau vừa thay đổi:

{{changed_documents}}

Nội dung hiện tại của chúng:

{{documents_diff_summary}}

Danh sách artifact đã lỗi thời (đã được truy deterministic từ graph, **không được thêm/bớt**):

{{impact_data}}

Viết phần diễn giải cho báo cáo tác động, gồm đúng 3 mục:

1. **Thay đổi nói về cái gì** — mỗi tài liệu 1–2 câu: nội dung đổi liên quan tới khía cạnh nghiệp vụ nào. Chỉ dựa vào nội dung đã cho, không suy diễn ra ngoài.

2. **Vì sao từng artifact bị ảnh hưởng** — với mỗi artifact trong `{{impact_data}}`, một câu giải thích mối liên hệ. Nếu không giải thích được vì thiếu thông tin, ghi `[CẦN BỔ SUNG]` cho artifact đó — KHÔNG bịa lý do.

3. **Thứ tự xử lý đề xuất** — sắp theo phụ thuộc thật: tri thức trước, test case sau, spec sau nữa (đổi tri thức mà chưa cập nhật test case thì sinh lại spec là vô nghĩa). Nêu rõ bước nào **cần người xác nhận** trước khi chạy lại, và bước nào chạy được ngay.

Nếu `{{impact_data}}` rỗng: chỉ viết mục 1, rồi ghi rõ rằng graph chưa ghi được quan hệ phái sinh nào cho các tài liệu này nên **chưa xác định được** phạm vi ảnh hưởng — không kết luận là không ảnh hưởng.

## Sample Input
changed_documents = [{ "file": "docs/api-spec.md", "reason": "nội dung đã đổi" }]
impact_data = { "total": 3, "affected": [
  { "kind": "section", "ref": "memory/project/domain-facts.md#Ràng buộc mã giảm giá", "causedBy": ["docs/api-spec.md"] },
  { "kind": "testcase", "ref": "TC-D-004", "causedBy": ["docs/api-spec.md"] },
  { "kind": "spec", "ref": ".qa-run/tests/TC-D-004.spec.ts", "causedBy": ["docs/api-spec.md"] }] }

## Sample Output
```markdown
### Thay đổi nói về cái gì
- `docs/api-spec.md`: siết lại ràng buộc của mã giảm giá — thêm điều kiện về giá trị đơn tối thiểu.

### Vì sao từng artifact bị ảnh hưởng
- Mục `Ràng buộc mã giảm giá` (domain-facts): chưng cất trực tiếp từ tài liệu này, ràng buộc đã đổi.
- `TC-D-004`: test case bám vào ràng buộc trên, giá trị biên trong Test Data có thể không còn đúng.
- `.qa-run/tests/TC-D-004.spec.ts`: sinh từ `TC-D-004`, đang assert theo giá trị biên cũ.

### Thứ tự xử lý đề xuất
1. Review mục tri thức đã được ghi lại — **cần người xác nhận** ràng buộc mới đúng như hiểu.
2. Chạy lại node thiết kế test cho `TC-D-004` (chạy được ngay sau bước 1).
3. Sinh lại spec — **cần xác nhận MCP** vì phải mở trình duyệt thật.
```

## Quality Check
- **Faithful**: mọi artifact trong output đều có trong `{{impact_data}}`; không thêm, không bớt.
- **Accurate**: mô tả thay đổi khớp nội dung tài liệu thật, không suy diễn.
- **Complete**: mọi artifact trong `{{impact_data}}` đều được nhắc tới (kể cả khi phải ghi `[CẦN BỔ SUNG]`).
- **Testable**: thứ tự xử lý nêu rõ bước nào cần người xác nhận, để người đọc làm theo được ngay.
