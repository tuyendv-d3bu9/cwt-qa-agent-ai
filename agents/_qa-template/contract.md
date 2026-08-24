# Contract: `<node-name>`

Mọi node PHẢI export `CONTRACT` từ `index.js`. Đây là thứ duy nhất cho phép
`workflow/flow-runner.js` gọi được node **mà không cần biết trước node đó là gì** —
không có nó thì thứ tự luồng phải viết cứng bằng tay như `flow-2`/`flow-3` bản đầu.

## Các field

| Field | Bắt buộc | Là gì |
|---|---|---|
| `agent` | ✅ | Tên node. **Phải trùng tên thư mục** — `node-registry.js` kiểm và nổ nếu lệch, vì tên này là khoá của bảng `run_steps` (trạng thái + cửa duyệt). |
| `requires` | ✅ | Các đường dẫn PHẢI tồn tại **trước** khi chạy. `handover.js` chặn trước, báo rõ thiếu file nào. Mảng rỗng `[]` là hợp lệ (node đầu luồng). |
| `produces` | ✅ | Các đường dẫn node hứa sẽ ghi. `verifyProduced()` kiểm **sau**: node báo thành công mà không có file = vi phạm hợp đồng, phát hiện tại đây thay vì để node SAU chết. |
| `inputs` | ✅ | Map **tên tham số của `run()`** → **tên export trong `paths.js`**. Ví dụ `{ taskFile: "TASK_ASSIGNMENT" }` → runner gọi `run({ taskFile: P.TASK_ASSIGNMENT })`. |
| `entry` | ❌ | Tên hàm vào, mặc định `"run"`. Chỉ khai khi node có nhiều hàm vào (như `qa-leader`). |

## Vì sao `inputs` là map tên-tham-số, không phải mảng

Sáu node đang chạy có sáu chữ ký khác nhau: `{taskFile}` · `{testCaseFile}` ·
`{testResultsFile, uiConventionsFile, testCaseFile, vlmAll}` … Một mảng thứ tự sẽ buộc
phải **sửa chữ ký cả 6 node** để cho khớp — sửa 6 node đang chạy được để lấy cái tổng quát
là đánh đổi tồi. Map để runner nói đúng thứ tiếng của từng node mà không ai phải đổi giọng.

## Luật kiểm được (node-registry.js tự kiểm, không cần nhớ)

1. `agent` trùng tên thư mục.
2. Mọi giá trị trong `inputs` phải là export **có thật** trong `paths.js`.
3. Mọi đường dẫn trong `inputs` phải **nằm trong `requires`** — node đọc một file mà không
   khai là cần nó thì cửa gác `handover.js` mất tác dụng đúng chỗ nó cần có tác dụng.
4. Hàm `entry` phải tồn tại và là function.

Sai bất cứ điều nào → **nổ lúc dò node**, không phải lúc chạy tới bước đó.

## Giá trị `status` mà runner hiểu

| `status` | Runner làm gì |
|---|---|
| `"success"`, `"ready"` | đánh bước `done`, đi tiếp |
| `"waiting_input"`, `"waiting_ask"` | **dừng luồng**, đánh bước đang chờ NGƯỜI, in ra file cần bạn điền |
| `"error"` | dừng, đánh `failed`, in `error` |
| khác | dừng và báo **vi phạm hợp đồng** — runner không đoán |

## Tham số không phải đường dẫn

`vlmAll`, `reportTypes`, `confirmMcp`, `jira`… **không** khai trong `inputs` (chúng không
phải path). Chúng truyền từ khối `with:` của bước trong file luồng `flows/*.flow.yml`.
