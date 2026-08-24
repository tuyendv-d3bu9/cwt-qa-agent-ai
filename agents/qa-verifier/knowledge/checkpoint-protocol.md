# Knowledge: Checkpoint Protocol

## Type
Convention / Architecture

## Content

Khi verdict tổng thể là **ASK**, Verifier ghi checkpoint bằng cách gọi `markStep("qa-verifier", { status, output })` từ `agents/runtime/memory.js` — đây là cơ chế checkpoint DUY NHẤT dùng chung cho toàn bộ pipeline (không tự viết file JSON riêng như trước).

`memory.js` lưu trạng thái vào **`.qa-run/runs.db`** (tầng 5, xem `memory/README.md`), 3 bảng:

| Bảng | Giữ gì |
|---|---|
| `runs` | 1 dòng / lần chạy: `run_id`, `feature`, `created_at`, `status` (`active`/`done`/`blocked`) |
| `run_steps` | 1 dòng / (run, agent): `status`, `output`, `round`, `note`, `human_approved`, `approved_by`, `updated_at` |
| `session` | ĐÚNG 1 dòng, trỏ tới `run_id` của **phiên hiện tại** |

`loadState()` trả về đúng shape mà pipeline vẫn dùng (chỉ của **phiên hiện tại**, không phải mọi run):

```json
{
  "run_id": "function-d-voucher-checkout-2026-08-17",
  "feature": "Function D - Voucher Checkout",
  "created_at": "...",
  "status": "active",
  "steps": [
    { "agent": "qa-analyst", "status": "done", "output": ".qa-run/deliverables/deliverable-analyst.md", "human_approved": true, "approved_by": "...", "updated_at": "..." },
    { "agent": "qa-verifier", "status": "waiting_ask", "output": ".qa-run/deliverables/deliverable-verifier.md", "human_approved": false, "updated_at": "..." }
  ]
}
```

### Rule
- Mỗi agent trong pipeline (bao gồm `qa-verifier`) có ĐÚNG 1 dòng `run_steps` **trong phiên hiện tại**, khoá theo `(run_id, agent)`. `markStep()` tự upsert dòng này — Verifier không tự quản lý shape, chỉ gọi hàm.
- `status` của `qa-verifier` sau khi chạy: `"waiting_ask"` (verdict ASK, dừng chờ người xác nhận) hoặc `"done"` (verdict PASS/FIX, xong bước này).
- **`markStep()` chỉ nhận đúng 6 trường** (`status`, `output`, `round`, `note`, `human_approved`, `approved_by`); khoá khác → **throw**. Backend JSON cũ nhận mọi khoá rồi bỏ qua âm thầm, nên một lỗi đánh máy (`statuss`) từng để bước ở `pending` mà không báo gì.
- **Node này KHÔNG tự xoá trạng thái** — không có hàm "clear" trong `memory.js`; agent khác hoặc lần chạy lại chỉ ghi đè đúng dòng của nó, không ảnh hưởng agent khác, và **không ảnh hưởng các run trước** (DB giữ được nhiều run, khác hẳn file JSON cũ chỉ giữ được 1).
- Nhân bản đúng pattern mà `workflow/leader-analyst.js` đã dùng cho bước `qa-analyst` (cùng gọi `markStep`, cùng 1 backend) — không phát minh lại cơ chế riêng cho Verifier.
- **Human-approval gate đã được nối dây thật** (mục K.4, 2026-08-17): `workflow/flow-runner.js` gọi `requireApproved()` trước mỗi node, nên bước sau **bị chặn** cho tới khi có người chạy `node agents/approve.js <agent> "<tên>"`. Cờ `--no-gate` bỏ cửa khi demo nhanh. Trước đó `requireApproved()` là code chết — convention có khai nhưng không enforce.
- **Duyệt gắn với một output cụ thể**: nếu `status` hoặc `output` của một bước đổi sau khi đã duyệt, `human_approved` bị **xoá tự động**. Verifier ra FIX → automation sinh spec mới → phải duyệt lại; dấu duyệt cũ không dùng cho file mới.
- Không tự tạo `workflow/flow-*.js` mới nếu chưa được yêu cầu.

## Source
`agents/runtime/memory.js` (state shape gốc, dùng chung toàn pipeline — hợp nhất 2026-08-17, trước đó Verifier từng mô phỏng theo shape hẹp riêng của `leader-analyst.js`, nay đã bỏ; backend đổi từ file JSON `workflow.json` sang SQLite `.qa-run/runs.db` cùng ngày, mục K + P5), thiết kế QA Verifier.

## Node referenced
qa-verifier
