# Knowledge: Verdict Mapping (PASS / FIX / ASK cho Automation Result)

## Type
Convention / Registry

## Content

QA Verifier KHÔNG định nghĩa lại PASS/FIX/ASK — tái dùng nguyên nghĩa gốc từ `agents/qa-leader/knowledge/task-management-conventions.md` mục 1 (đọc trực tiếp, không copy):
- **PASS**: đạt tiêu chí → chuyển bước tiếp theo.
- **FIX**: lỗi do chính QA Agent (ở đây là artifact `.spec.ts` do QA Automation sinh ra) — gửi lại để tự sửa, KHÔNG phải lỗi sản phẩm thật.
- **ASK**: bế tắc do thiếu/mâu thuẫn thông tin, không tự quyết định thay người dùng được.

### Áp dụng cụ thể cho ngữ cảnh automation result

| Tình huống quan sát được | Verdict | Lý do |
|---|---|---|
| Test PASSED, kết quả khớp `ui-conventions.md` và Expected Result | PASS | Không có vấn đề. |
| Test FAILED vì selector không tìm thấy, nhưng `ui-conventions.md` cho thấy UI đã đổi cấu trúc so với lúc explore | FIX | Lỗi ở spec (đã lỗi thời), không phải lỗi sản phẩm — gửi lại QA Automation để explore lại + sinh spec mới. |
| Test FAILED vì assertion sai giá trị (ví dụ số tiền tính sai), DOM/selector vẫn khớp `ui-conventions.md` bình thường | ASK | Có dấu hiệu hành vi sản phẩm sai khác Expected Result — Verifier KHÔNG được tự kết luận đây là bug thật, phải dừng và để người xác nhận trước khi QA Reporter viết bug report chính thức. |
| Test FAILED nhưng error message không đủ rõ để phân loại SPEC_ISSUE hay BEHAVIOR_MISMATCH | ASK | Thiếu thông tin để tự quyết định — không đoán. |

### Hai kênh, và ai được quyết định gì

| Kênh | Nguồn | Quyết định |
|---|---|---|
| **Functional** | `expect()` trong spec → `test-results.json` | **pass / fail** — nguồn DUY NHẤT |
| **Visual** | `.qa-run/evidence/<TC_ID>-after.jpg` → VLM (skill `03_screenshot_analysis.md`) | **vì sao** fail, và **có gì `expect()` không nhìn tới** |

Ảnh chỉ được **hạ cấp** kết luận (pass → cần người xem). Ảnh **không bao giờ** biến test fail thành pass, và không bao giờ tự kết luận pass. Xem `agents/qa-automation/knowledge/oracle-problem.md` mục "Ranh giới của ảnh".

### Ma trận ghép 2 kênh → nhãn từng test case

Ghép bằng **code deterministic** (`tools/verdict-combiner.js`), KHÔNG để LLM ghép — cùng lý do với `count-check.js`/`coverage-check.js`: một LLM được hỏi "ghép 2 kênh này" sẽ có lúc thấy ảnh trông ổn rồi gọi một test đã fail là pass.

| `expect()` | Ảnh nói | Nhãn | Ý nghĩa |
|---|---|---|---|
| pass | khớp | `PASSED` | ổn thật |
| pass | **không khớp** | `UNCLEAR` | **FALSE-GREEN** — assert xanh nhưng màn hình sai: assert quá lỏng, hoặc UI hỏng ở chỗ assert không nhìn tới. **Trước khi có kênh visual, hệ thống mù hoàn toàn với ca này.** |
| fail | ảnh cho thấy app **đúng** | `SPEC_ISSUE` | spec/selector lỗi thời → QA Automation sửa, KHÔNG báo bug |
| fail | ảnh cho thấy app **sai** | `BEHAVIOR_MISMATCH` | nghi vấn bug thật, **có ảnh làm evidence** |
| bất kỳ | ảnh `unreadable`, hoặc `confidence: low`, hoặc VLM lỗi | `UNCLEAR` | ảnh không đọc được thì không quyết định được gì — người xem |
| pass | *(không soi ảnh)* | `PASSED` | chỉ có kênh functional (xem mục chi phí VLM bên dưới) |
| fail | *(không soi ảnh)* | `UNCLEAR` | không đủ căn cứ phân loại nguyên nhân |

### Verdict tổng thể — cũng deterministic

`deriveVerdict()`: có `UNCLEAR` hoặc `BEHAVIOR_MISMATCH` → **ASK**; chỉ có `SPEC_ISSUE` → **FIX**; còn lại → **PASS**. ASK thắng FIX vì việc cần người quyết định quan trọng hơn việc sửa spec cơ học.

LLM (skill `02_verdict_writer.md`) chỉ **diễn giải** verdict đã được tính, KHÔNG được đổi nó — verdict quyết định workflow làm gì tiếp, nên không thể phụ thuộc vào cách LLM diễn đạt.

### Chi phí VLM

Không soi ảnh mọi test case. Mặc định: **mọi test `fail`** + **test `pass` có Priority `High`/`Critical`** (false-green đáng tiền nhất ở chỗ liên quan luồng chính/tiền). Cờ `--vlm-all` để soi hết. Test case bị bỏ qua **được liệt kê rõ** trong deliverable — không để người đọc tưởng mọi test đều đã soi ảnh.

### Rule
- Một lần chạy có thể có NHIỀU test — nếu ít nhất 1 test rơi vào ASK, verdict TỔNG THỂ của lần chạy là ASK (ưu tiên cao nhất, không bị PASS/FIX của các test khác che lấp).
- Nếu không có ASK nào nhưng có ít nhất 1 FIX, verdict tổng thể là FIX.
- Chỉ khi TẤT CẢ test đều PASS, verdict tổng thể mới là PASS.

## Source
`agents/qa-leader/knowledge/task-management-conventions.md` mục 1.

## Node referenced
qa-verifier (đọc cross-node, không copy, từ qa-leader)