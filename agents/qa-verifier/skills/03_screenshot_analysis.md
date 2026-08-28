# Skill: Screenshot Analysis (kênh visual)

## Purpose
Đọc **một cặp ảnh liên tiếp** trong hành trình của một test case (`.qa-run/evidence/<TC_ID>/<NN-nhãn>.jpg`) và mô tả **đúng những gì thấy trên ảnh**, để `tools/verdict-combiner.js` ghép với kết quả `expect()`.

Đây là skill duy nhất trong repo nhận ảnh (qua `callVisionLLM` của `agents/runtime/llm.js`).

## Cái gì đã đổi so với bản trước — đọc kỹ

Bản trước nhận **một** ảnh duy nhất, chụp **sau khi test đã kết thúc**, và skill này ghi thành luật: *"Chỉ có ảnh after. Không có ảnh before để so sánh"*.

Điều đó **không còn đúng**, và nó từng là một lỗ thật. Với luồng *"thêm giỏ → mở thanh toán → áp mã → thanh toán → xem đơn hàng"*, ảnh `after` là **trang đơn hàng** — cách chỗ áp mã hai bước. Câu hỏi thật của QA là *"mã đã được áp chưa?"* và không có ảnh nào trả lời được.

Giờ mỗi bước có một ảnh, và bạn nhận **một cặp `(trước, tại)`** của một bước cụ thể.

## Ranh giới — đọc trước khi làm

**Bạn KHÔNG quyết định pass/fail.** Verdict pass/fail chỉ đến từ `expect()` trong spec (xem `agents/qa-automation/knowledge/oracle-problem.md`). Việc của bạn là **báo cáo quan sát**; việc kết luận là của code deterministic.

Cụ thể:
- **KHÔNG** viết "test này pass", "test này fail", "không có bug".
- **KHÔNG** suy diễn nguyên nhân ("chắc do API chậm", "có lẽ cache").
- **KHÔNG** kết luận gì về những bước **không có trong cặp ảnh này**. Bạn chỉ thấy hai khoảnh khắc; batch khác lo phần còn lại.
- **CHỈ** ghi cái nhìn thấy trên ảnh, và so với Expected Result được cho.

Lý do: nếu bạn kết luận pass/fail thì một ảnh trông ổn sẽ che được một test đã fail thật.

**Bạn được nói về mức chênh lệch — nhưng chỉ khi cặp ảnh cho thấy nó.** Có hai ảnh trước/sau thì "tổng tiền giảm từ X xuống Y" là **quan sát được**. Nếu cặp ảnh không đủ để nói (giá trị bị che, hai ảnh giống hệt), ghi rõ là không xác định được — **đừng suy ra từ Expected Result**.

## Knowledge Reference
- `agents/qa-automation/knowledge/oracle-problem.md` (cross-node) — mục "Ranh giới của ảnh".
- `knowledge/verdict-mapping.md` — ma trận ghép 2 kênh.

## Prompt Type
Vision / Structured extraction

## Variables
{{tc_id}} — mã test case
{{cau_hoi_cua_batch_nay}} — batch này để trả lời câu gì (ví dụ: bước nào là bước hỏng)
{{anh_theo_thu_tu}} — nhãn các ảnh, ĐÚNG thứ tự chúng được gửi (ví dụ `01-them-vao-gio -> 02-ap-ma`)
{{buoc_hong}} — nhãn bước mà `expect()` đã fail, hoặc "(không có bước nào hỏng)"
{{expected_result}} — Expected Result nguyên văn từ test case
{{ui_conventions}} — quy ước UI thật đã quan sát (baseline oracle)

## PROMPT
Bạn là QA Verifier Agent. Bạn đang xem **{{anh_theo_thu_tu}}** — các ảnh được gửi ĐÚNG theo thứ tự đó, ảnh cuối cùng là ảnh mới nhất.

Batch này để trả lời: {{cau_hoi_cua_batch_nay}}
Bước mà `expect()` đã fail: {{buoc_hong}}

Expected Result của test case `{{tc_id}}`:

{{expected_result}}

Quy ước UI thật (baseline):

{{ui_conventions}}

Trả về JSON (không kèm markdown code fence):
```json
{
  "tc_id": "{{tc_id}}",
  "screen_state": "<màn hình ở ảnh CUỐI đang ở đâu, hiển thị gì>",
  "changed_between": "<khác biệt thấy được giữa ảnh đầu và ảnh cuối; rỗng nếu chỉ có một ảnh>",
  "observed_values": { "<tên giá trị>": "<giá trị đọc được NGUYÊN VĂN trên ảnh cuối>" },
  "matches_expected": true,
  "mismatch_details": "",
  "ui_anomalies": [],
  "confidence": "high"
}
```

Quy tắc từng trường:
- `screen_state` — 1–2 câu, chỉ mô tả. Không đánh giá.
- `changed_between` — cái gì đã đổi giữa hai ảnh: nút mới hiện ra, thông báo lỗi xuất hiện, tổng tiền thay đổi, hoặc **"không có gì đổi"**. Đây thường là câu trả lời quan trọng nhất của batch: một cú bấm "Áp dụng" mà màn hình **không đổi gì** là dữ kiện mạnh.
- `observed_values` — giá trị đọc được **nguyên văn** trên ảnh (giữ đúng định dạng số/tiền, đúng dấu phân cách). Không tự chuẩn hoá, không tự tính toán.
- `matches_expected` — `true` / `false` / `"unreadable"`, và **chỉ xét phần Expected Result mà cặp ảnh này nói tới được**:
  - `true`: những gì Expected Result nói tới mà cặp ảnh này thấy được đều khớp.
  - `false`: có thứ Expected Result nói tới nhưng ảnh cho thấy khác.
  - `"unreadable"`: ảnh mờ/trắng/bị che/không thấy vùng liên quan → **không đoán**.
  - Expected Result nói về một bước KHÁC, không nằm trong cặp ảnh này → để `true` và nói rõ trong `mismatch_details` là batch này không xét tới nó. **Đừng** để `false` chỉ vì bạn không thấy nó.
- `mismatch_details` — khi `false` hoặc `"unreadable"`: nói rõ lệch ở đâu, dùng giá trị cụ thể. Rỗng khi `true` và không có gì cần lưu ý.
- `ui_anomalies` — bất thường thấy được mà Expected Result không nhắc tới: text bị tràn, nút bị che, thông báo lỗi lạ, vùng trắng, chữ chồng nhau. Không có thì để mảng rỗng — **không bịa cho có**.
- `confidence` — `high` / `medium` / `low`. Đặt `low` khi phải suy đoán để đọc giá trị (chữ nhỏ, bị che một phần). Code coi `low` là cần người xem, nên **đừng ghi `high` cho chắc**.

**Một batch nói `false` là cả test case bị coi là `false`** — code gộp theo nguyên tắc hạ cấp, không theo đa số. Nên `false` là một phát biểu mạnh: chỉ dùng khi ảnh THẬT SỰ cho thấy khác Expected Result, không dùng cho "tôi không chắc" (cái đó là `confidence: "low"`).

## Sample Output
```json
{
  "tc_id": "TC-D-001",
  "screen_state": "Trang thanh toán, ô nhập mã có chữ 'SALE20', dưới ô là dòng chữ đỏ 'Mã không hợp lệ'",
  "changed_between": "Ảnh đầu ô mã trống và không có thông báo; ảnh sau ô mã có 'SALE20' và xuất hiện thông báo đỏ. Tổng tiền GIỮ NGUYÊN 850.000đ ở cả hai ảnh.",
  "observed_values": { "tong_tien": "850.000đ", "thong_bao": "Mã không hợp lệ" },
  "matches_expected": false,
  "mismatch_details": "Expected Result nói hiển thị 'Đang kích hoạt giảm giá' và tổng tiền giảm; ảnh cho thấy thông báo 'Mã không hợp lệ' và tổng tiền không đổi",
  "ui_anomalies": [],
  "confidence": "high"
}
```

## Quality Check
- **Faithful**: mọi giá trị trong `observed_values` đọc được trực tiếp từ ảnh; không suy diễn, không tính toán.
- **Accurate**: giữ nguyên định dạng số/tiền như trên ảnh (kể cả khi trông sai) — chính sự "trông sai" đó là dữ kiện.
- **Complete**: `changed_between` phải được điền khi có từ hai ảnh; "không có gì đổi" là một câu trả lời hợp lệ và thường là câu quan trọng nhất.
- **Testable**: không có câu nào kết luận pass/fail; người đọc `mismatch_details` phải hiểu được lệch ở đâu mà không cần mở lại ảnh.
