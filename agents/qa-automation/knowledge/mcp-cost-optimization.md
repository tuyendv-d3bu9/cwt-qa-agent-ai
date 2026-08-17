# Knowledge: MCP Cost Optimization

## Type
Convention / Design Rationale

Đọc file này **trước khi** sửa `index.js` của node này. Nhiều thứ trông như phức tạp không cần thiết ở đó thực ra là để cắt chi phí — "đơn giản hoá" lại sẽ đưa chi phí về như cũ.

## Content

### Vấn đề: bản đầu trả tiền để mô tả cùng một trang N lần

Với **N** test case và **M** bước mỗi test case, bản đầu gọi LLM:

| Chỗ gọi | Số lần | Payload mỗi lần |
|---|---|---|
| Quyết định từng bước | N × M | **full snapshot** + **toàn bộ 60+ tool MCP** kèm description |
| Trích selector | N | **full snapshot** |
| Sinh spec | N | selector |
| Viết ui-conventions | 1 | **toàn bộ N snapshot nối lại** |

→ **N×(M+2)+1 lần gọi LLM**. Với 12 test case × 4 bước là **73 lần**, kèm ~72 lần gửi full snapshot — mà tất cả đều là **cùng một trang**.

### Nguyên tắc 3 tầng

| Tầng | Luật | Dùng gì |
|---|---|---|
| 1 | **MCP đã có → dùng ngay** | `browser_find`, `browser_generate_locator`, `browser_snapshot({filename, depth, target})`, `browser_fill_form`, `browser_verify_*` |
| 2 | **MCP không có → viết code deterministic** | `tools/snapshot-parser.js`, `ui-element-registry.js`, `step-planner.js`, `testcase-exporter.js` |
| 3 | **Cả 2 tầng trên không làm được → mới gọi LLM** | phần tử tên mơ hồ, map bước ↔ locator, biến Expected Result thành assertion |

### Bảy cơ chế cắt chi phí đang áp dụng

1. **Snapshot không đi qua prompt.** `browser_snapshot({ filename })` cho MCP ghi ra file; `snapshot-parser.js` đọc file. Chỉ phần đã lọc mới vào prompt.
2. **`browser_find` thay full snapshot** khi chỉ cần định vị 1 phần tử. Tài liệu của chính tool ghi: *"cheaper than capturing the whole snapshot when you only need to locate an element and its ref"*.
3. **`browser_generate_locator` thay LLM viết selector.** Playwright tự sinh locator — đúng chuẩn hơn và gần như miễn phí token. LLM không phải suy `getByLabel('...')` từ cây YAML (nơi dễ sai hoa/thường và dấu tiếng Việt nhất).
4. **Registry: explore một lần, dùng cho mọi test case.** Đây là cơ chế **giết hệ số N**. Test case sau tra registry trước, chỉ gọi MCP cho phần tử chưa biết.
5. **Rule xử lý bước formulaic.** `step-planner.js` map "Nhập X vào ô Y" / "Bấm nút Z" / "Vào trang W" bằng rule — 0 token. Chỉ bước không rule nào khớp mới nhờ LLM.
6. **Whitelist 8 tool** thay vì nhồi cả 60+ tool kèm description vào prompt mỗi bước mỗi test case.
7. **Gộp bước nhập liền nhau** thành **1 lần** `browser_fill_form` thay vì mỗi field một vòng.

Cộng thêm 2 cơ chế tránh làm lại:

8. **Bỏ qua spec không đổi.** Có file spec + hash test case không đổi + không bị impact analysis đánh `stale` → không explore, không sinh lại. Nếu **không có gì** cần làm thì **không mở trình duyệt**.
9. **Data tách khỏi spec** (`tests/data/test-cases.json`). Đổi test data không cần sinh lại spec, tức không cần explore lại.

### Đo, không tuyên bố

`index.js` đếm `llmCalls`, `mcpCalls`, `stepsByRule`, `stepsByLLM`, `specsAuthored`, `specsSkipped` và ghi thành bảng trong `deliverable-automation.md`. Con số thật của trang thật **chưa đo được** (chưa có lần chạy live nào — cần xác nhận tường minh mỗi lần). Đo xong thì cập nhật lại file này bằng số thật.

### Điều KHÔNG làm, và vì sao

**KHÔNG dùng `npx playwright run-test-mcp-server`** (`generator_*` / `planner_*`). Nó ghi lại code Playwright chuẩn giúp mình, nghe rất hấp dẫn — nhưng là **hidden command** (`playwright/lib/program.js`, `{ hidden: true }`), tức API nội bộ không có bảo đảm ổn định giữa các version, và cần seed file + config đúng chuẩn. Đang mượn `browser_generate_locator` vì đó là tool **công khai, có tài liệu trong README**.

### Bẫy đã gặp — đừng lặp lại

- **`ref=eN` KHÔNG bền.** Nó chỉ đúng trong đúng snapshot sinh ra nó, đổi giữa 2 lần chụp cùng một trang. Registry lưu **`locator`** làm giá trị chính, `role`+`name` làm khoá; `ref` chỉ là giá trị tạm. Lấy `ref` làm khoá thì test case đầu chạy đúng, các test case sau nhắm sai phần tử mà không báo lỗi.
- **Snapshot KHÔNG phải HTML.** Nó là cây accessibility dạng thụt lề (`- textbox "Mã giảm giá" [ref=e14]`). Skill từng đưa Sample Input là HTML thô, dạy LLM kỳ vọng sai đầu vào.
- **Thuộc tính có thể là bare flag.** `[disabled]`, `[checked]`, `[expanded]` không có dấu `=`. Regex bắt buộc `=` sẽ bỏ mất chúng — mà `disabled` quyết định một bước có thực hiện được hay không.

## Source
Đọc trực tiếp từ `node_modules/@playwright/mcp/README.md` (v0.0.79) và `node_modules/playwright/lib/` — không phải suy đoán. Số lần gọi LLM tính từ code bản trước.

## Consumed by
`qa-automation` (nạp vào system prompt để chính LLM cũng biết ranh giới 3 tầng), và người sửa `index.js` của node này về sau.
