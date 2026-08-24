# Workflow — khung chạy

Nơi **duy nhất** biết toàn cảnh: một luồng có bao nhiêu bước, theo thứ tự nào, chỗ nào cần
người duyệt. `agents/<node>/` không biết gì về node khác; **node không gọi node**.

## 4 file, và mỗi file làm gì

| File | Vai trò |
|---|---|
| `flow-runner.js` | **KHUNG CHẠY CHÍNH.** Đọc file luồng rồi gọi node qua `CONTRACT`. Không biết node nào làm gì → **thêm node mới không sửa file này** |
| `flow-file.js` | Đọc + **kiểm tĩnh** file luồng: tên node lạ, cờ chưa khai, thiếu `confirm_reason`, thiếu `expect_step`… → nổ TRƯỚC khi chạy bước nào |
| `leader-analyst.js` | Nửa đầu pipeline (Leader + Analyst). Là **script**, được gọi bằng một BƯỚC `script:` trong file luồng |
| `README.md` | file này |

**Thứ tự luồng KHÔNG nằm ở đây.** Nó nằm trong `flows/*.flow.yml` — là **dữ liệu**, không phải
code. Trước đây thứ tự viết cứng trong hai script đánh số `flow-2`/`flow-3` (282 + 266 dòng),
nối nhau bằng `import`; thêm một node là **sửa code JS**. Cả hai đã bị bỏ.

## Cách chạy — chỉ cần một lệnh

```bash
node qa.js                       # menu
node qa.js flows                 # liệt kê luồng + lệnh chạy từng luồng
node qa.js run <luồng> "<task>"  # chạy
node qa.js next                  # đang chờ ai
```

## Bốn luồng cấp sẵn

| Luồng | Bước | Dùng khi |
|---|---|---|
| `analyze` | leader-analyst | **chạy thử lần đầu** — không mở trình duyệt, không gọi MCP |
| `design` | + qa-test-designer | tới bảng test case |
| `full` | + automation + verifier + reporter | toàn bài. **Chạy lại được**: bỏ qua bước đã xong |
| `verify` | qa-verifier + qa-reporter | đã có `test-results.json`, chỉ kết luận + báo cáo |

`full` chạy lại được nên không cần luồng riêng cho "nửa sau": chạy lại `full` là nó bỏ qua các
bước đã xong và tiếp đúng chỗ đang dở.

## Hai loại bước

```yaml
steps:
  - node: qa-test-designer        # gọi một node trong agents/
    gate: qa-analyst

  - script: workflow/leader-analyst.js   # chạy một script bằng TIẾN TRÌNH CON
    args:
      - $param.task
    pass_flags:
      - new-run
    expect_step: qa-analyst
```

### Vì sao có bước `script:`

`leader-analyst` không diễn đạt được bằng khai báo:

1. **Hỏi–đáp theo TỪNG CÂU** — `gap-report.md` có ô `**Trả lời:**` cho mỗi `GAP-nnn`; lần chạy
   sau chỉ nhắc câu còn trống, câu đã trả lời thì **xác nhận lại** và ghi vào `decisions-log.md`.
   Đó là trạng thái theo từng câu hỏi, không phải "dừng chờ một file".
2. **Vòng review leader ↔ analyst** tối đa 3 lượt, trong đó `FIX` là **đi lại cùng node** kèm
   feedback. `branch: rework` chỉ biết đánh dấu rồi dừng.

Nhưng nếu nó chỉ là một luồng riêng thì **không có luồng nào chạy hết** từ tài liệu tới báo cáo,
và người dùng phải học 2 lệnh rời. Bước `script:` nối hai nửa mà không phải bẻ script đặc thù
vào khuôn khai báo.

### `expect_step` — ràng buộc quan trọng nhất của bước script

Script thoát **0** cả khi nó **dừng có chủ ý** để chờ bạn điền `gap-report`, y như khi nó chạy
xong. Nên runner **không tin mã thoát**: sau khi script chạy, nó đọc trạng thái bước trong DB.

- Chưa `done` → **dừng luồng dạng chờ-người** (không phải lỗi), và **không đi tiếp**.
- Đã `done` → đi tiếp.
- Lần chạy sau, `done` rồi → **bỏ qua script**, nên `full` chạy lại được nhiều lần.

Thiếu `expect_step` thì luồng sẽ chạy `qa-test-designer` trong khi nửa đầu còn đang chờ người
trả lời — nên `flow-file.js` **từ chối** bước script không khai nó.

## Ba điểm dừng chờ NGƯỜI — đều là CHỦ Ý

| Điểm dừng | Khai bằng | Lý do |
|---|---|---|
| Cửa duyệt trước mỗi node | `gate: <node>` | Human-Final, đúng như cả 6 `role.md` tuyên bố. Bỏ bằng `--no-gate` (chỉ khi demo) |
| Trước QA Automation | `confirm_flag: confirm-mcp` | gọi MCP Playwright **thật**, mở trình duyệt tới `base_url`. Xác nhận **mỗi lần** |
| Sau QA Automation | `wait_for_file: TEST_RESULTS` | agent **không tự chạy test**: `npx playwright test --reporter=json` là việc của người/CI |

Duyệt: `node qa.js approve <node> "<tên bạn>"` · Xem đang chờ ai: `node qa.js next`

## Verdict của QA Verifier

Khai trong `branch:` của file luồng, không viết cứng trong code:

| Verdict | Hành động | Nghĩa |
|---|---|---|
| `PASS` | `continue` | đi tiếp sang QA Reporter |
| `FIX` | `rework: qa-automation` | **spec** lỗi thời so với UI thật, KHÔNG phải lỗi sản phẩm → chạy lại kèm `--confirm-mcp` |
| `ASK` | `stop` | cần người đọc `deliverable-verifier.md` và tự xác định bug thật, rồi chạy lại với `--report-types=bug`. Luồng **không đoán thay** |

Verifier trả về một verdict không nằm trong 3 nhánh trên → runner **dừng và báo**, không đoán.

## Mặc định `report-types` KHÔNG có `bug`

Mặc định `daily,narrative`. Bug report chỉ sinh khi người đã xác nhận đó là bug thật.
