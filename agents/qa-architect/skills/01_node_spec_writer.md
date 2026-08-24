# Skill: Viết bản khai cho một node mới

## Purpose
Từ một câu mô tả của người dùng, viết **BẢN KHAI** (JSON) cho một node QA mới: nó tên gì,
đọc gì, ghi gì, prompt của nó ra sao, và **nó còn thiếu tool deterministic nào**.

Bản khai này KHÔNG phải code. `agents/qa-architect/tools/node-emitter.js` sẽ sinh
`index.js`, `CONTRACT`, `role.md`, `skills/` từ nó bằng code deterministic.

## Prompt Type
Template-based, có kiểm tra tự động (bản khai sai sẽ bị trả lại kèm lý do để sửa).

## Variables
- `{{mo_ta}}` — câu mô tả của người dùng
- `{{duong_dan_co_san}}` — TOÀN BỘ đường dẫn được phép đọc (tên export trong `paths.js`)
- `{{node_da_co}}` — các node đang có, kèm nó đọc gì / ghi gì

## PROMPT

Bạn đang thiết kế một node cho một hệ thống multi-agent QA đang chạy. Đọc mô tả rồi trả về
**đúng một object JSON**, không kèm giải thích, không kèm dấu ```.

MÔ TẢ CỦA NGƯỜI DÙNG:
{{mo_ta}}

CÁC NODE ĐANG CÓ (đừng làm lại việc của node đã có — nếu mô tả trùng việc một node đang làm,
hãy nói ra ở trường `overlaps`):
{{node_da_co}}

ĐƯỜNG DẪN ĐƯỢC PHÉP ĐỌC — `reads` CHỈ được chứa tên trong danh sách này. Không có tên nào
phù hợp thì để `reads` rỗng và ghi lý do vào `notes`. **TUYỆT ĐỐI không bịa tên mới**:
{{duong_dan_co_san}}

Trả về JSON đúng hình dạng sau:

```
{
  "name": "qa-<tên-kebab-case>",
  "title": "<Tên đọc được, ví dụ: QA Flaky Scanner>",
  "mission": "<một câu: node này làm gì, cho ai>",
  "responsibilities": ["<việc 1>", "<việc 2>"],
  "can": ["<được phép làm gì>"],
  "cant": ["<KHÔNG được làm gì — nghĩ kỹ chỗ này>"],
  "reads": ["<TÊN_EXPORT_TRONG_PATHS_JS>"],
  "deliverable": "<file .md nó ghi ra chứa cái gì>",
  "skill": {
    "name": "<tên skill>",
    "purpose": "<dùng khi nào, để làm gì>",
    "promptType": "Zero-shot | Few-shot | Chain-of-thought | Template-based",
    "prompt": "<PROMPT THẬT, đầy đủ, ít nhất 200 ký tự: nói rõ đầu vào là gì, làm theo bước nào, ĐỊNH DẠNG ĐẦU RA chính xác ra sao>",
    "qualityCheck": "<kiểm cái gì thì biết đầu ra đạt>"
  },
  "needsDeterministicTools": [
    { "file": "<ten-kebab-case>.js", "what": "<nó tính/kiểm/so khớp cái gì>", "whyCode": "<vì sao việc này KHÔNG được để LLM tự phán>" }
  ],
  "overlaps": "<trùng việc node nào, hoặc chuỗi rỗng>",
  "notes": "<điều người dùng cần biết, hoặc chuỗi rỗng>"
}
```

BỐN LUẬT BẮT BUỘC — vi phạm là bản khai bị trả lại:

1. **`reads` chỉ lấy từ danh sách trên.** Node chỉ đọc đường dẫn đã khai trong `paths.js`.
   Cần một đường dẫn chưa có thì nói trong `notes` để người thêm vào `paths.js` trước.

2. **Việc nào có ĐÚNG/SAI thì phải là tool deterministic, không phải prompt.** Đếm, so khớp,
   chấm điểm, kiểm định dạng, sinh code, tính tỉ lệ — tất cả vào
   `needsDeterministicTools`, KHÔNG nhét vào `prompt` rồi tin LLM tự làm đúng.
   Ví dụ đúng: "đếm số test bị retry ≥2 lần" → tool. "viết nhận xét về nhóm test hay hỏng"
   → prompt.
   Nếu bạn thấy node này chẳng cần tool nào, hãy tự hỏi lại một lần: có con số nào trong đầu
   ra của nó không? Có thì cần tool.

3. **`cant` phải có nội dung thật.** Ít nhất: node không gọi node khác, và không tự quyết
   những gì thuộc quyền người dùng (nghiệp vụ, xác nhận bug, ghi ra hệ thống ngoài).

4. **`prompt` phải nói rõ ĐỊNH DẠNG ĐẦU RA.** Một prompt không quy định định dạng sẽ cho ra
   mỗi lần một kiểu, và không cửa kiểm nào bám vào được.

## Sample Input

```
mo_ta = "node đọc kết quả chạy test, tìm các test hay fail rồi pass lại, viết báo cáo cho Dev"
```

## Sample Output

```
{
  "name": "qa-flaky-scanner",
  "title": "QA Flaky Scanner",
  "mission": "Phát hiện test không ổn định từ kết quả chạy và báo cho Dev biết test nào không đáng tin.",
  "responsibilities": ["Đọc test-results.json", "Chỉ ra test có dấu hiệu flaky", "Xếp mức ưu tiên xử lý"],
  "can": ["Đọc kết quả chạy đã có", "Viết nhận xét về nhóm test hay hỏng"],
  "cant": ["Không tự chạy test", "Không tự sửa spec", "Không kết luận đây là bug sản phẩm", "Không gọi node khác"],
  "reads": ["TEST_RESULTS", "DELIVERABLE_TEST_DESIGNER"],
  "deliverable": "danh sách test flaky kèm số lần retry và mức ưu tiên",
  "skill": { "name": "Flaky report writer", "purpose": "...", "promptType": "Template-based", "prompt": "...", "qualityCheck": "..." },
  "needsDeterministicTools": [
    { "file": "retry-counter.js", "what": "đếm số lần retry của từng test từ test-results.json", "whyCode": "một con số đếm sai thì cả báo cáo sai, và LLM đếm sai rất khó thấy" }
  ],
  "overlaps": "qa-verifier cũng đọc test-results.json, nhưng nó phán PASS/FIX/ASK cho từng test, không xét tính ổn định qua nhiều lần chạy",
  "notes": ""
}
```

## Quality Check

Bản khai được kiểm tự động bởi `validateSpec()` trong
`agents/qa-architect/tools/node-emitter.js`: tên node đúng dạng và chưa tồn tại, mọi tên
trong `reads` là export có thật, `prompt` ≥ 200 ký tự, `can`/`cant`/`responsibilities` không
rỗng. Sai chỗ nào sẽ được trả lại đúng chỗ đó để sửa.
