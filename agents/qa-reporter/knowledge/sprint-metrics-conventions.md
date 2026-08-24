# Knowledge: Sprint Metrics Conventions

## Type
Convention

## Content

### Công thức (tính deterministic bằng `tools/sprint-metrics-calculator.js`, KHÔNG để LLM tự tính)
- **Pass rate** = số test PASSED / tổng số test đã chạy × 100%.
- **Fail rate** = số test KHÔNG PASSED (gồm cả SPEC_ISSUE lẫn BEHAVIOR_MISMATCH/UNCLEAR) / tổng số test đã chạy × 100%.
- **Bug density** = số bug draft đã xác nhận (nhãn BEHAVIOR_MISMATCH/UNCLEAR) / tổng số test case đã thiết kế.

### `.qa-run/reports/sprint-history.json` — quy ước append
- File là 1 mảng JSON, mỗi phần tử là kết quả 1 lần chạy Sprint Report:
```json
[
  { "date": "2026-08-14", "totalTests": 12, "passed": 9, "failed": 3, "passRate": 75, "failRate": 25, "bugDensity": 0.17 }
]
```
- Mỗi lần chạy skill 03: đọc file này (nếu có) để lấy phần tử CUỐI CÙNG làm "sprint trước" cho Trend Analysis, sau đó APPEND (không ghi đè) phần tử mới cho lần chạy hiện tại.
- Nếu file chưa tồn tại (lần chạy đầu tiên): Trend Analysis ghi rõ "Chưa có dữ liệu sprint trước để so sánh" — KHÔNG tự bịa số liệu sprint trước.
- `date` do workflow/người gọi truyền vào lúc chạy, KHÔNG để LLM tự tạo (LLM không có đồng hồ thật đáng tin — xem hạn chế `Date.now()`/`new Date()` đã biết trong môi trường workflow).

## Source
Giáo trình QA Agent Reporter, Mục 3 — Sprint QA Report (do người dùng cung cấp trực tiếp, 2026-08-14).

## Node referenced
qa-reporter
