# Workflow — Practical AI for Manual Testers

Nơi **duy nhất** biết toàn cảnh: một luồng có bao nhiêu node, chạy theo thứ tự nào, chỗ nào
cần người duyệt. `agents/<node>/` không biết gì về node khác; node **không gọi node**.

## Thứ tự luồng không nằm ở đây nữa — nó nằm ở `flows/`

Trước P7, thứ tự luồng viết cứng trong hai script (282 + 266 dòng) nối nhau bằng `import`.
Thêm một node = sửa code JS. Giờ:

| File | Vai trò |
|---|---|
| `flows/*.flow.yml` | **thứ tự · cửa duyệt · điều kiện dừng · tham số** |
| `flow-file.js` | đọc + **kiểm tĩnh** file luồng (tên node lạ → nổ TRƯỚC khi chạy bước nào) |
| `flow-runner.js` | bộ điều phối **duy nhất** cho luồng khai báo |
| `flow-2-leader-analyst.js` | luồng script (vòng hỏi–đáp đặc thù, xem dưới) |
| `flow-3-…js` | **shim** gọi `flow-runner` — giữ đúng lệnh cũ, nhưng chỉ còn một đường code |

`flow-runner.js` gọi node qua `CONTRACT` + `agents/runtime/node-registry.js`, nên **thêm node
mới không cần sửa một dòng nào trong `workflow/`**.

## Cách chạy

```bash
node qa.js                       # menu, không cần nhớ lệnh nào khác
node qa.js flows                 # liệt kê luồng + lệnh chạy từng luồng
node qa.js run <tên-luồng> ...   # chạy
```

Lệnh cũ vẫn nguyên:

```bash
node workflow/flow-2-leader-analyst.js "Phan tich Function D - Voucher Checkout"
node workflow/flow-3-design-automate-verify-report.js --confirm-mcp [--vlm-all] [--no-gate]
```

## Hai luồng hiện có

| Luồng | Kiểu | Node |
|---|---|---|
| `leader-analyst` | **script** | QA Leader + QA Analyst, có vòng hỏi–đáp gap-report + vòng review PASS/FIX/ASK |
| `design-to-report` | **khai báo** | QA Test Designer → QA Automation → QA Verifier → QA Reporter |

### Vì sao `leader-analyst` vẫn là script

Nó không diễn đạt được bằng các nguyên thuỷ khai báo, và nhồi vào là làm hỏng cả hai:

1. **Hỏi–đáp theo TỪNG CÂU**: sinh `gap-report.md` có ô `**Trả lời:**` cho từng `GAP-nnn`; lần
   chạy sau chỉ báo đúng câu còn trống, câu đã trả lời thì **xác nhận lại** và ghi vào
   `decisions-log.md`. Đây là trạng thái theo từng câu hỏi, không phải "dừng chờ một file".
2. **Vòng review leader ↔ analyst** tối đa 3 lượt, trong đó `FIX` là **đi lại cùng node** kèm
   feedback. `branch: rework` chỉ biết đánh dấu rồi dừng.
3. Quyết định mở phiên mới hay tiếp phiên cũ (`--new-run`).

Nó vẫn được khai trong `flows/leader-analyst.flow.yml` với `type: script` để `qa.js` liệt kê
và chạy được — người dùng không phải nhớ luồng nào là script.

## Ba điểm dừng chờ NGƯỜI trong `design-to-report` — đều là CHỦ Ý

| Điểm dừng | Khai bằng | Lý do |
|---|---|---|
| Cửa duyệt trước mỗi node | `gate: <node>` | Human-Final, đúng như cả 6 `role.md` tuyên bố. Bỏ bằng `--no-gate` (chỉ khi demo) |
| Trước QA Automation | `confirm_flag: confirm-mcp` | gọi MCP Playwright **thật**, mở trình duyệt tới `base_url`. Cần xác nhận **mỗi lần** |
| Sau QA Automation | `wait_for_file: TEST_RESULTS` | agent **không tự chạy test**: `npx playwright test --reporter=json` là việc của người/CI |

Duyệt: `node qa.js approve <node> "<tên bạn>"` · Xem đang chờ ai: `node qa.js next`

## Verdict của QA Verifier

Khai trong `branch:` của file luồng, không viết cứng trong code:

| Verdict | Hành động | Nghĩa |
|---|---|---|
| `PASS` | `continue` | đi tiếp sang QA Reporter |
| `FIX` | `rework: qa-automation` | **spec** lỗi thời so với UI thật, không phải lỗi sản phẩm → chạy lại kèm `--confirm-mcp` |
| `ASK` | `stop` | cần người đọc `deliverable-verifier.md` và tự xác định bug thật, rồi tự chạy `qa-reporter --report-types=bug`. Luồng **không đoán thay** |

Verifier trả về một verdict không nằm trong 3 nhánh trên → runner **dừng và báo**, không đoán.

## Mặc định `report-types` KHÔNG có `bug`

Mặc định là `daily,narrative`. Bug report chỉ sinh khi người đã xác nhận đó là bug thật —
`--report-types=bug`.
