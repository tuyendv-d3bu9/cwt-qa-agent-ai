# Knowledge: Checkpoint Protocol

## Type
Convention / Architecture

## Content

Khi verdict tổng thể là **ASK**, Verifier ghi checkpoint vào `.state/workflow-state.json`, cùng shape đã dùng trong `workflow/flow-2-leader-analyst.js` (`{ phase, round }`), để 1 workflow runner sau này (nếu được nối dây) có thể resume đúng chỗ thay vì chạy lại từ đầu:

```json
{ "phase": "verify", "round": 1 }
```

### Rule
- `phase` luôn là chuỗi `"verify"` khi checkpoint này do QA Verifier ghi (phân biệt với `phase: "review"` mà `qa-leader` đã dùng).
- `round` bắt đầu từ 1, tăng dần nếu có vòng lặp resume (hiện node này single-shot nên `round` mặc định luôn là 1 — trường này chỉ chuẩn bị sẵn cho khi có revision loop).
- **Node này KHÔNG tự xoá `.state/workflow-state.json`** — việc xoá (khi người dùng đã xác nhận xong) là trách nhiệm của workflow runner, giống cách `flow-2-leader-analyst.js` đang tự quản lý file này qua `clearState()`.
- Hiện CHƯA có `workflow/flow-*.js` nào gọi node này — checkpoint này được chuẩn bị sẵn theo đúng convention đã có, không phải đã được nối dây thật. Không tự tạo `workflow/flow-*.js` mới nếu chưa được yêu cầu.

## Source
`workflow/flow-2-leader-analyst.js` (state shape gốc), thiết kế QA Verifier.

## Node referenced
qa-verifier