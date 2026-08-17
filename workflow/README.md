# Workflow — Practical AI for Manual Testers

Thư mục này chứa **runner** cho từng luồng (flow) của AI QA Workflow

## Quy ước đặt tên
`flow-N-<mo-ta-ngan>.js` — **Tạo luồng cho 01 quy trình cụ thể**, không xóa khi có flow mới

## Tiến độ các luồng

| Flow | Trạng thái | Agent tham gia |
|---|---|---|
| `flow-2-leader-analyst.js` | ✅ Chạy được | QA Leader + QA Analyst (cả 2 build đầy đủ, không còn là stub) |
| `flow-3-design-automate-verify-report.js` | ✅ Chạy được (chưa live-test) | QA Test Designer → QA Automation → QA Verifier → QA Reporter. Yêu cầu `flow-2` đã PASS trước. Có 2 điểm dừng bắt buộc chờ người: (a) trước Automation — cần flag `--confirm-mcp` (gọi MCP Playwright thật); (b) sau Automation — cần người/CI tự chạy `npx playwright test --reporter=json` (agent không tự chạy test) |

## Cách chạy flow hiện tại

```bash
node workflow/flow-2-leader-analyst.js "Phan tich Function D - Voucher Checkout"
```

Nếu Leader trả `status: "waiting_input"`:
1. Mở file được ghi trong `data.formPath` (thường là `memory/working/gap-report.md`).
2. Điền câu trả lời ngay dưới mỗi câu hỏi, lưu lại.
3. Chạy lại **đúng lệnh trên** — runner tự phát hiện file đã có nội dung và dùng làm `formAnswers`.

Sau khi `flow-2` PASS, chạy tiếp:

```bash
node workflow/flow-3-design-automate-verify-report.js --confirm-mcp
```

- Nếu chưa có `memory/working/test-results.json`, flow dừng lại và yêu cầu chạy `npx playwright test --reporter=json` trước, rồi chạy lại đúng lệnh trên.
- Verdict `FIX` từ Verifier → chạy lại đúng lệnh trên (kèm `--confirm-mcp`) để Automation sinh spec mới.
- Verdict `ASK` → đọc `memory/working/deliverable-verifier.md`, tự xác nhận bug thật rồi tự gọi `qa-reporter` với `reportTypes` phù hợp (flow không tự đoán thay).
- Verdict `PASS` → tự chạy tiếp QA Reporter với `reportTypes` mặc định `daily,narrative` (truyền tham số thứ 2 để đổi, vd `node workflow/flow-3-design-automate-verify-report.js --confirm-mcp sprint,release`).

## `workflow/` khác `agents/`?
- `agents/<node>/` = logic của 1 agent, không biết gì về agent khác ngoài agent nó trực tiếp gọi.
- `workflow/` = nơi duy nhất biết toàn cảnh: hôm nay luồng có bao nhiêu agent, chạy theo lệnh nào.