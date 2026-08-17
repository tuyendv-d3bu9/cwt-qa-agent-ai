# Skill: Screenshot Analysis (kênh visual)

## Purpose
Đọc ảnh chụp **sau khi** spec chạy xong (`evidence/<TC_ID>-after.jpg`) và mô tả **đúng những gì thấy trên ảnh**, để `tools/verdict-combiner.js` ghép với kết quả `expect()`.

Đây là skill duy nhất trong repo nhận ảnh (qua `callVisionLLM` của `agents/runtime/llm.js`).

## Ranh giới — đọc trước khi làm

**Bạn KHÔNG quyết định pass/fail.** Verdict pass/fail chỉ đến từ `expect()` trong spec (xem `agents/qa-automation/knowledge/oracle-problem.md`). Việc của bạn là **báo cáo quan sát**; việc kết luận là của code deterministic.

Cụ thể:
- **KHÔNG** viết "test này pass", "test này fail", "không có bug".
- **KHÔNG** suy diễn nguyên nhân ("chắc do API chậm", "có lẽ cache").
- **CHỈ** ghi cái nhìn thấy trên ảnh, và so với Expected Result được cho.

Lý do: nếu bạn kết luận pass/fail thì một ảnh trông ổn sẽ che được một test đã fail thật.

**Chỉ có ảnh `after`.** Không có ảnh `before` để so sánh (quyết định đã chốt: `expect()` lo phần hiệu số/delta, ảnh lo phần giá trị hiển thị + lỗi UI). Nên **KHÔNG tự kết luận về mức chênh lệch** ("giảm đúng 140.000") khi ảnh chỉ cho thấy giá trị cuối — trường hợp đó ghi vào `mismatch_details` là không xác định được từ một ảnh.

## Knowledge Reference
- `agents/qa-automation/knowledge/oracle-problem.md` (cross-node) — mục "Ranh giới của ảnh": 3 việc ảnh được làm, 1 việc không.
- `knowledge/verdict-mapping.md` — ma trận ghép 2 kênh.

## Prompt Type
Vision / Structured extraction

## Variables
{{tc_id}} — mã test case
{{expected_result}} — Expected Result nguyên văn từ test case
{{ui_conventions}} — quy ước UI thật đã quan sát (baseline oracle), để biết định dạng hiển thị bình thường là gì
(ảnh `after` được gửi kèm dưới dạng image part, không phải biến text)

## PROMPT
Bạn là QA Verifier Agent, đang xem ảnh chụp màn hình **sau khi** test case `{{tc_id}}` chạy xong.

Expected Result của test case:

{{expected_result}}

Quy ước UI thật (baseline):

{{ui_conventions}}

Xem ảnh và trả về JSON (không kèm markdown code fence):
```json
{
  "tc_id": "{{tc_id}}",
  "screen_state": "<mô tả ngắn: màn hình đang ở đâu, hiển thị gì>",
  "observed_values": { "<tên giá trị>": "<giá trị đọc được NGUYÊN VĂN trên ảnh>" },
  "matches_expected": true,
  "mismatch_details": "",
  "ui_anomalies": [],
  "confidence": "high"
}
```

Quy tắc từng trường:
- `screen_state` — 1–2 câu, chỉ mô tả. Không đánh giá.
- `observed_values` — giá trị đọc được **nguyên văn** trên ảnh (giữ đúng định dạng số/tiền, đúng dấu phân cách). Không tự chuẩn hoá, không tự tính toán.
- `matches_expected` — `true` / `false` / `"unreadable"`:
  - `true`: mọi thứ Expected Result nói tới đều thấy trên ảnh và khớp.
  - `false`: có thứ Expected Result nói tới nhưng ảnh cho thấy khác.
  - `"unreadable"`: ảnh mờ/trắng/bị che/không thấy vùng liên quan → **không đoán**, để `"unreadable"`.
- `mismatch_details` — khi `false` hoặc `"unreadable"`: nói rõ lệch ở đâu, dùng giá trị cụ thể. Rỗng khi `true`.
- `ui_anomalies` — bất thường thấy được mà Expected Result không nhắc tới: text bị tràn, nút bị che, thông báo lỗi lạ, vùng trắng, chữ chồng nhau. Không có thì để mảng rỗng — **không bịa cho có**.
- `confidence` — `high` / `medium` / `low`. Đặt `low` khi phải suy đoán để đọc giá trị (chữ nhỏ, bị che một phần). Code sẽ coi `low` là cần người xem, nên **đừng ghi `high` cho chắc**.

Nếu Expected Result nói về **mức chênh lệch** (giảm bao nhiêu, tăng bao nhiêu) mà ảnh chỉ cho thấy giá trị cuối: KHÔNG kết luận `false`. Ghi giá trị cuối vào `observed_values`, đặt `matches_expected` theo đúng phần kiểm chứng được, và nói rõ trong `mismatch_details` rằng phần chênh lệch không xác định được từ một ảnh.

## Sample Output
```json
{
  "tc_id": "TC-D-001",
  "screen_state": "Trang thanh toán, đã nhập mã giảm giá, có badge 'Áp dụng thành công' màu xanh",
  "observed_values": { "tong_sau_giam": "700.0000", "giam_gia": "140.000" },
  "matches_expected": false,
  "mismatch_details": "Expected Result nói tổng sau giảm là 700.000 nhưng ảnh hiển thị 700.0000 (thừa một số 0)",
  "ui_anomalies": ["Chuỗi tổng tiền dài hơn khung, bị tràn sang lề phải"],
  "confidence": "high"
}
```

## Quality Check
- **Faithful**: mọi giá trị trong `observed_values` đọc được trực tiếp từ ảnh; không suy diễn, không tính toán.
- **Accurate**: giữ nguyên định dạng số/tiền như trên ảnh (kể cả khi trông sai) — chính sự "trông sai" đó là dữ kiện.
- **Complete**: mọi thứ Expected Result nhắc tới đều được đối chiếu, hoặc nêu rõ vì sao không đối chiếu được.
- **Testable**: không có câu nào kết luận pass/fail; người đọc `mismatch_details` phải hiểu được lệch ở đâu mà không cần mở lại ảnh.
