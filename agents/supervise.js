// agents/supervise.js
// Xem tình trạng MỌI luồng QA đang chạy: run nào đang chờ ai, run nào bị bỏ quên.
//
//   node agents/supervise.js [--stale-hours 24] [--limit 20] [--no-write]
//
// Khác `node agents/approve.js` (không tham số) ở chỗ: approve.js in trạng thái của PHIÊN
// HIỆN TẠI, còn lệnh này soi TẤT CẢ run và nói rõ ai phải làm gì tiếp. Đây là phần "QA Leader
// giám sát nhiều luồng" — trước đây không tồn tại vì trạng thái run nằm trong một file JSON
// chỉ chứa được đúng một run.
import "dotenv/config";
import { supervise } from "./qa-leader/index.js";

const args = process.argv.slice(2);
const num = (flag, dflt) => {
    const i = args.indexOf(flag);
    if (i === -1) return dflt;
    const v = Number(args[i + 1]);
    return Number.isFinite(v) ? v : dflt;
};

const out = await supervise({
    limit: num("--limit", 20),
    staleHours: num("--stale-hours", 24),
    write: !args.includes("--no-write"),
});

console.log("");
console.log(out.markdown);
if (out.reportFile) console.log(`(đã ghi ${out.reportFile})`);

// Exit code có ý nghĩa để dùng được trong CI: khác 0 nghĩa là có việc đang chờ NGƯỜI.
// Việc đang chờ agent thì không phải lý do để fail — agent chạy lại được.
process.exit(out.needsHuman.length > 0 ? 2 : 0);
