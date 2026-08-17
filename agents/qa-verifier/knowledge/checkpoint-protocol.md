# Knowledge: Checkpoint Protocol

## Type
Convention / Architecture

## Content

Khi verdict tổng thể là **ASK**, Verifier ghi checkpoint bằng cách gọi `markStep("qa-verifier", { status, output })` từ `agents/runtime/memory.js` — đây là cơ chế checkpoint DUY NHẤT dùng chung cho toàn bộ pipeline (không tự viết file JSON riêng như trước). `memory.js` đọc/ghi `memory/working/workflow.json`, shape:

```json
{
  "run_id": "...",
  "feature": "...",
  "created_at": "...",
  "steps": [
    { "agent": "qa-analyst", "status": "done", "output": "memory/working/deliverable-analyst.md", "human_approved": false, "updated_at": "..." },
    { "agent": "qa-verifier", "status": "waiting_ask", "output": "memory/working/deliverable-verifier.md", "human_approved": false, "updated_at": "..." }
  ]
}
```

### Rule
- Mỗi agent trong pipeline (bao gồm `qa-verifier`) có ĐÚNG 1 phần tử trong mảng `steps[]`, khoá theo `agent` (tên node). `markStep()` tự tìm hoặc tạo phần tử này — Verifier không tự quản lý shape JSON, chỉ gọi hàm.
- `status` của `qa-verifier` sau khi chạy: `"waiting_ask"` (verdict ASK, dừng chờ người xác nhận) hoặc `"done"` (verdict PASS/FIX, xong bước này).
- **Node này KHÔNG tự xoá `memory/working/workflow.json`** — không có hàm "clear" trong `memory.js`; trạng thái tiếp theo (agent khác, hoặc lần chạy lại) chỉ ghi đè đúng phần tử `steps[]` của nó, không ảnh hưởng các agent khác.
- Nhân bản đúng pattern mà `workflow/flow-2-leader-analyst.js` đã dùng cho bước `qa-analyst` (cùng gọi `markStep`, cùng 1 file `memory/working/workflow.json`) — không phát minh lại cơ chế riêng cho Verifier.
- Human-approval gate (`requireApproved()` trong `memory.js`) sẵn có nhưng CHƯA được bất kỳ `workflow/flow-*.js` nào gọi thật — chuẩn bị sẵn theo convention, không phải đã nối dây. Không tự tạo `workflow/flow-*.js` mới nếu chưa được yêu cầu.

## Source
`agents/runtime/memory.js` (state shape gốc, dùng chung toàn pipeline — hợp nhất 2026-08-17, trước đó Verifier từng mô phỏng theo shape hẹp riêng của `flow-2-leader-analyst.js`, nay đã bỏ), thiết kế QA Verifier.

## Node referenced
qa-verifier
