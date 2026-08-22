// workflow/flow-3-design-automate-verify-report.js
// SHIM — giữ đúng lệnh cũ, nhưng phần điều phối giờ nằm ở:
//   flows/design-to-report.flow.yml     (thứ tự · cửa duyệt · điều kiện dừng)
//   workflow/flow-runner.js             (bộ chạy chung cho mọi luồng)
//
// VÌ SAO KHÔNG GIỮ BẢN CŨ SONG SONG. Bản cũ 266 dòng tự điều phối. Để nó lại cạnh runner mới
// là tạo hai đường code cho cùng một việc — đúng tội "0-BUG" trong TODO.update2.md: bản mới
// có test xanh, bản chạy thật vẫn là bản cũ, và không ai biết mình đang chạy đường nào. Sửa
// một cửa duyệt ở file yml mà lệnh cũ không đổi hành vi là kiểu lỗi mất cả ngày để tin.
//
// Lệnh vẫn như trước:
//   node workflow/flow-3-design-automate-verify-report.js --confirm-mcp [--vlm-all] [--no-gate] [daily,narrative]
//
// Hoặc dùng UI terminal cho mọi luồng:  node qa.js

import "dotenv/config";
import { runFlowByName } from "./flow-runner.js";

const argv = process.argv.slice(2);

// Tương thích ngược: bản cũ nhận reportTypes ở dạng đối số VỊ TRÍ ("daily,narrative").
// File luồng khai nó là tham số có tên (`--report-types=`), nên dịch tại đây thay vì bắt
// runner hiểu đối số vị trí — một khái niệm chỉ tồn tại vì lệnh cũ từng như vậy.
const translated = argv.map(a => (a.startsWith("--") ? a : `--report-types=${a}`));

const res = await runFlowByName("design-to-report", { argv: translated });

if (res.reason) console.log(`\n>> ${res.reason.split("\n").join("\n   ")}\n`);
// Dừng có chủ ý (chờ người duyệt / chờ chạy playwright) KHÔNG phải lỗi → mã thoát 0.
process.exit(res.ok ? 0 : 1);
