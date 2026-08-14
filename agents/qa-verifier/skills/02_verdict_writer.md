# Skill: Verdict Writer

## Purpose
Dùng sau `01_test_result_analysis.md`. Tổng hợp verdict cuối cùng (PASS/FIX/ASK) cho toàn bộ lần chạy, theo `knowledge/verdict-mapping.md`.

## Knowledge Reference
- `knowledge/verdict-mapping.md` — quy tắc ưu tiên ASK > FIX > PASS.
- `agents/qa-leader/knowledge/task-management-conventions.md` mục 1 (cross-node) — định nghĩa gốc PASS/FIX/ASK.

## Prompt Type
Decision-matrix

## Variables
{{all_results}} — danh sách toàn bộ test đã parse (PASSED + FAILED đã phân loại ở skill 01)

## PROMPT
Bạn là QA Verifier Agent. Dựa trên toàn bộ kết quả:

{{all_results}}

Áp dụng quy tắc từ `verdict-mapping.md`:
- Có ≥1 test nhãn `BEHAVIOR_MISMATCH` hoặc `UNCLEAR` → verdict tổng thể **ASK**.
- Không có ASK nào, nhưng có ≥1 test nhãn `SPEC_ISSUE` → verdict tổng thể **FIX**.
- Tất cả test đều PASSED → verdict tổng thể **PASS**.

Viết báo cáo theo format:
```
## Verdict: <PASS|FIX|ASK>

### Chi tiết theo TC_ID
| TC_ID | Status | Nhãn (nếu failed) | Ghi chú |
|---|---|---|---|

### Hành động đề xuất
```
Với verdict FIX: nêu rõ TC_ID nào cần QA Automation explore lại. Với verdict ASK: liệt kê câu hỏi cụ thể cần người xác nhận cho từng BEHAVIOR_MISMATCH/UNCLEAR, KHÔNG tự kết luận thay.

## Sample Output
```
## Verdict: ASK

### Chi tiết theo TC_ID
| TC_ID | Status | Nhãn | Ghi chú |
|---|---|---|---|
| TC-D-001 | passed | - | Khớp Expected Result. |
| TC-D-004 | failed | UNCLEAR | Không tìm thấy element nhưng ui-conventions.md ghi nhận vẫn tồn tại — cần điều tra thêm. |

### Hành động đề xuất
- TC-D-004: cần người xác nhận đây là lỗi tạm thời (timing/network) hay UI đã đổi thật — chưa đủ căn cứ để tự phân loại SPEC_ISSUE hay BEHAVIOR_MISMATCH.
```

## Quality Check
- **Faithful**: verdict tổng thể tính đúng theo quy tắc ưu tiên ASK > FIX > PASS, không tự nới lỏng.
- **Accurate**: bảng chi tiết khớp chính xác với kết quả đã parse, không bỏ sót TC_ID nào.
- **Complete**: có đủ Hành động đề xuất cho mọi TC_ID không PASS.
- **Traceable**: mỗi dòng ASK/FIX trích dẫn được lý do từ skill 01.