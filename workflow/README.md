# Workflow — Practical AI for Manual Testers

Thư mục này chứa **runner** cho từng luồng (flow) của AI QA Workflow

## Quy ước đặt tên
`flow-N-<mo-ta-ngan>.js` — **Tạo luồng cho 01 quy trình cụ thể**, không xóa khi có flow mới

## Tiến độ các luồng

| Flow | Trạng thái | Agent tham gia | Session |
|---|---|---|---|
| `flow-1-leader-only.js` | ✅ Chạy được | QA Leader (thật) + QA Analyst (**stub tạm** — xem `agents/qa-analyst/index.js`) | 10 |

## Cách chạy flow hiện tại

```bash
node workflow/flow-1-leader-only.js "Phan tich Function D - Voucher Checkout"
```

Nếu Leader trả `status: "waiting_input"`:
1. Mở file được ghi trong `data.formPath` (thường là `.state/gap-report.md`).
2. Điền câu trả lời ngay dưới mỗi câu hỏi, lưu lại.
3. Chạy lại **đúng lệnh trên** — runner tự phát hiện file đã có nội dung và dùng làm `formAnswers`.

## `workflow/` khác `agents/`?
- `agents/<node>/` = logic của 1 agent, không biết gì về agent khác ngoài agent nó trực tiếp gọi.
- `workflow/` = nơi duy nhất biết toàn cảnh: hôm nay luồng có bao nhiêu agent, chạy theo lệnh nào.