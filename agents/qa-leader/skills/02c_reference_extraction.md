# Skill: Reference Extraction (tầng 2)

## Purpose
Chạy cùng lượt với `02b_project_knowledge_distillation.md`, trên đúng các tài liệu đã đổi. Trích ra **tri thức tham chiếu ỔN ĐỊNH** của dự án để lưu vào tầng 2 (`memory/project/knowledge.db`) — xem `memory/README.md`.

Khác biệt với skill `02b`:

| | `02b` (tầng 3, markdown) | Skill này (tầng 2, DB) |
|---|---|---|
Nội dung | Fact nghiệp vụ, bug đã biết, quyết định | **Định nghĩa** thuật ngữ, thành phần, field, cấu hình |
Đổi | Thường xuyên | **Ít đổi** |
Dùng | Nạp cả vào prompt | **Tra cứu** khi cần |

Nguyên tắc phân biệt: nếu nội dung trả lời câu hỏi **"X là gì / X có ràng buộc gì"** → skill này. Nếu trả lời **"hiện trạng thế nào / đã quyết gì / đang lỗi gì"** → skill `02b`.

## Knowledge Reference
- `../../memory/README.md` — định nghĩa 5 tầng memory và vì sao tầng 2 là DB truy vấn.

## Prompt Type
Chain-of-thought

## Variables
{{changed_documents}} — danh sách đường dẫn tài liệu đã thêm/đã đổi
{{documents_content}} — nội dung đầy đủ của đúng các tài liệu đó

## PROMPT
Bạn là QA Leader Agent. Các tài liệu sau vừa thay đổi:

Danh sách file: {{changed_documents}}

Nội dung: {{documents_content}}

Trích ra tri thức tham chiếu ổn định, chia đúng 4 loại:

1. **terms** — thuật ngữ nghiệp vụ/kỹ thuật và **định nghĩa chính xác** của nó. `aliases` là các tên gọi khác của cùng khái niệm (kể cả tên tiếng Việt/tiếng Anh song song) để sau này tra cứu bắt được.
2. **components** — thành phần của hệ thống. `kind` chọn đúng 1 trong: `page`, `api`, `module`, `screen`, `service`. `ref` là đường dẫn thật (endpoint, route, tên file) nếu tài liệu có nói.
3. **fields** — field dữ liệu và **ràng buộc** của nó: kiểu dữ liệu, bắt buộc/không, min/max, có phân biệt hoa thường, định dạng. `component` là tên thành phần chứa field đó (nếu xác định được).
4. **config** — cấu hình/môi trường của dự án. Chỉ lấy khi tài liệu nói rõ. Các key nên dùng khi có: `base_url` (URL môi trường test), `project_name` (tên dự án), `environment` (tên môi trường).

Quy tắc bắt buộc:
- **Chỉ trích cái tài liệu nói rõ.** Không suy diễn ràng buộc, không đoán kiểu dữ liệu, không tự bịa endpoint.
- **Không đưa thứ hay đổi vào đây**: hiện trạng bug, quyết định sprint, tình trạng "chưa implement" → thuộc skill `02b`, KHÔNG thuộc skill này.
- **Định nghĩa phải tự đứng một mình đọc hiểu được**, vì nó sẽ được tra ra lẻ chứ không đọc cùng cả tài liệu.
- Mỗi mục có `source_ref` trỏ đúng 1 file trong `{{changed_documents}}`.
- Không tìm thấy loại nào thì trả mảng rỗng cho loại đó. KHÔNG bịa cho đủ.

Trả về JSON (không kèm markdown code fence):
```json
{
  "terms":      [{ "term": "...", "definition": "...", "aliases": ["..."], "source_ref": "..." }],
  "components": [{ "name": "...", "kind": "api", "ref": "...", "description": "...", "source_ref": "..." }],
  "fields":     [{ "name": "...", "component": "...", "data_type": "...", "constraints": "...", "notes": "...", "source_ref": "..." }],
  "config":     [{ "key": "base_url", "value": "...", "description": "...", "source_ref": "..." }]
}
```

## Sample Input
changed_documents = ["docs/api-spec.md"]
documents_content = "POST /api/v1/orders/discount — áp mã giảm giá. Field `discount_code`: string, chỉ nhận chữ hoa, server không tự chuẩn hoá. `order_total` là tổng tiền đơn trước giảm giá. Môi trường test: https://staging.example.test"

## Sample Output
```json
{
  "terms": [
    { "term": "order_total", "definition": "Tổng tiền đơn hàng trước khi áp giảm giá.", "aliases": ["tổng đơn"], "source_ref": "docs/api-spec.md" }
  ],
  "components": [
    { "name": "Apply discount API", "kind": "api", "ref": "POST /api/v1/orders/discount", "description": "Áp mã giảm giá cho đơn hàng.", "source_ref": "docs/api-spec.md" }
  ],
  "fields": [
    { "name": "discount_code", "component": "Apply discount API", "data_type": "string", "constraints": "chỉ nhận chữ hoa, phân biệt hoa thường, server không tự chuẩn hoá", "notes": null, "source_ref": "docs/api-spec.md" }
  ],
  "config": [
    { "key": "base_url", "value": "https://staging.example.test", "description": "URL môi trường test", "source_ref": "docs/api-spec.md" }
  ]
}
```

## Quality Check
- **Faithful**: mọi định nghĩa/ràng buộc đều có câu tương ứng trong tài liệu nguồn, không suy diễn.
- **Accurate**: `kind` của component đúng 1 trong 5 giá trị cho phép; `ref` đúng nguyên văn endpoint/route trong tài liệu.
- **Complete**: không bỏ sót field có ràng buộc rõ ràng; nhưng cũng không bịa thêm cho đủ số.
- **Testable**: mỗi mục có `source_ref` trỏ đúng 1 file trong `{{changed_documents}}`.
