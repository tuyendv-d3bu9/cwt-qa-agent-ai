# Knowledge: Một node gồm những gì

## Type
Convention

## Content

### Cấu trúc thư mục — dò theo quy ước, không theo `import`

```
agents/<ten-node>/
  role.md        ← BẮT BUỘC. Chính file này khiến thư mục được coi là node
  index.js       ← BẮT BUỘC. export CONTRACT + hàm vào (mặc định `run`)
  skills/        prompt của node, mỗi việc một file
  knowledge/     tri thức riêng của node (có thể rỗng)
  tools/         code deterministic của node
```

`agents/runtime/node-registry.js` quét `agents/*/`, bỏ thư mục bắt đầu bằng `_` và thư mục
**không có `role.md`**. Đó là toàn bộ cơ chế: không có danh sách node nào phải bảo trì, và
`agents/runtime/` (thư viện, không có `role.md`) không bị nhận nhầm là node.

### `CONTRACT` — thứ duy nhất cho phép runner gọi node

```js
export const CONTRACT = {
    agent: "qa-x",                        // PHẢI trùng tên thư mục (khoá bảng run_steps)
    requires: [P.TASK_ASSIGNMENT],        // kiểm TRƯỚC khi chạy
    produces: [P.DELIVERABLE_X],          // kiểm SAU khi chạy
    inputs: { taskFile: "TASK_ASSIGNMENT" }, // tên tham số run() → tên export paths.js
    // entry: "runSetup",                 // chỉ khi hàm vào không tên "run"
};
```

Chi tiết từng field + các luật được kiểm tự động: `agents/_qa-template/contract.md`.

### Từ vựng `status` node được trả về

`success`/`ready` = xong · `waiting_input`/`waiting_ask` = chờ NGƯỜI · `error` = lỗi ·
`not_started` = không có gì để làm. Trả chuỗi khác thì `flow-runner.js` **dừng và báo vi phạm
hợp đồng** thay vì đoán.

## Phần nào sinh tự động được, phần nào không

| Sinh được | Vì sao được |
|---|---|
| `role.md` | tài liệu; sai thì người đọc thấy ngay |
| prompt trong `skills/` | đúng là việc của LLM: diễn đạt |
| `CONTRACT` | sinh bằng code từ bản khai → không thể gõ sai tên export |
| `index.js` của node kiểu-LLM | luôn cùng một hình dạng: nạp đầu vào → `runAgentLoop` → ghi file |

| KHÔNG sinh được | Vì sao không |
|---|---|
| tool deterministic | việc có ĐÚNG/SAI. LLM viết ra một hàm *trông* như đang đếm là kiểu lỗi khó thấy nhất |
| cửa tự kiểm (`selfCheck`) | một cửa luôn trả "không có vấn đề" là hàm rỗng, và hàm rỗng thì LUÔN XANH |
| vị trí node trong luồng | quyết định về thứ tự công việc và về việc ai phải duyệt cái gì — của người |

## Hai quyết định trong `index.js` sinh ra, và số đo đằng sau

**1. Nạp sẵn nội dung file, không cấp tool.** Vòng lặp tool gửi lại toàn bộ hội thoại mỗi
lượt; đo được **đắt hơn 16,6 lần** so với nhét thẳng corpus 8,4k token vào một prompt. Tool
là để *quay lại đọc chỗ khác*, không phải để *đọc ít hơn*. Node sinh tự động đã khai trước
mình đọc gì (`reads`), nên nó không cần tool.

**2. Không sinh `selfCheck` giả.** Repo này đã trả giá: spec không có `expect()` nào vẫn
pass, hàm step rỗng vẫn xanh. Nên node thiếu tool deterministic sẽ **in cảnh báo mỗi lần
chạy**, không phải chỉ có một dòng chú thích.

## Source
Rút ra từ 6 node đang chạy + `agents/_qa-template/`, và từ hai lỗi đã ghi trong
`TODO.update2.md`: mục **0-BUG** (code có test xanh mà không ai gọi) và **P4** (LLM viết cả
file spec, 13/21 file không thực hiện hành động nào).

## Node referenced
`qa-architect`
