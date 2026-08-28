// Test: dùng một hàm của runtime mà QUÊN import → phải bị bắt ở đây.
//
// VÌ SAO CÓ BỘ NÀY. Khi nối `runAgentLoop` vào `qa-verifier`, tôi sửa dòng import không khớp
// (file dùng `import { callLLM, callVisionLLM }`, không phải `import { callLLM }`), nên import
// KHÔNG được thêm. `node --check` vẫn xanh, `import()` node vẫn xanh — vì `runAgentLoop` chỉ
// được gọi bên trong `run()`, tức là nó chỉ nổ khi CHẠY THẬT, giữa một lần chạy có gọi LLM.
//
// Đây là loại lỗi đắt nhất trong repo này: không test tĩnh nào thấy, và nó chỉ lộ ra sau khi
// đã tốn tiền gọi API. Nên nó phải có một cửa gác chạy offline.
//
// CÁCH KIỂM: lấy danh sách export THẬT của mọi module trong agents/runtime/ (import động, không
// gõ tay danh sách), rồi với mỗi file nguồn: tên nào được gọi như hàm, thuộc danh sách đó, mà
// KHÔNG được import và cũng KHÔNG khai tại chỗ → báo.
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// ── Danh sách export thật của runtime ───────────────────────────────────
const runtimeFiles = (await readdir("agents/runtime")).filter(f => f.endsWith(".js"));
/** tên export → module khai nó */
const runtimeExports = new Map();
for (const f of runtimeFiles) {
    let mod;
    try { mod = await import(abs(`agents/runtime/${f}`)); } catch { continue; }
    for (const name of Object.keys(mod)) {
        if (typeof mod[name] === "function" && !runtimeExports.has(name)) {
            runtimeExports.set(name, `agents/runtime/${f}`);
        }
    }
}
chk("đọc được danh sách export của runtime", runtimeExports.size > 10, String(runtimeExports.size));

// ── Các file nguồn cần soi ─────────────────────────────────────────────
async function sourceFiles() {
    const out = [];
    for (const agent of (await readdir("agents", { withFileTypes: true })).filter(e => e.isDirectory() && e.name.startsWith("qa-"))) {
        const dir = `agents/${agent.name}`;
        out.push(`${dir}/index.js`);
        try {
            for (const t of (await readdir(`${dir}/tools`)).filter(f => f.endsWith(".js"))) out.push(`${dir}/tools/${t}`);
        } catch { /* node chưa có tools/ */ }
    }
    for (const w of (await readdir("workflow")).filter(f => f.endsWith(".js"))) out.push(`workflow/${w}`);
    out.push("qa.js");
    return out;
}

/**
 * Bỏ chú thích. `//` chỉ được coi là chú thích khi KHÔNG đứng sau dấu `:` — nếu không thì
 * `https://…` bị cắt và mọi tên sau nó trên cùng dòng biến mất (báo THIẾU thay vì báo oan).
 */
function stripComments(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:\w])\/\/.*$/gm, "$1");
}

/** Tên được import trong file: `import { a, b as c }`, `import d`, `import * as e`. */
function importedNames(src) {
    const names = new Set();
    for (const m of src.matchAll(/import\s+([^;]+?)\s+from\s+["'][^"']+["']/g)) {
        const clause = m[1];
        for (const g of clause.matchAll(/\{([^}]*)\}/g)) {
            for (const part of g[1].split(",")) {
                const bit = part.trim();
                if (!bit) continue;
                names.add((bit.split(/\s+as\s+/).pop() ?? bit).trim());
            }
        }
        for (const g of clause.matchAll(/\*\s+as\s+([A-Za-z_$][\w$]*)/g)) names.add(g[1]);
        const dflt = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.replace(/\{[^}]*\}/g, ""));
        if (dflt) names.add(dflt[1]);
    }

    // IMPORT ĐỘNG CÓ DESTRUCTURE — `const { a, b } = await import("…")`.
    //
    // Bản trước chỉ đọc `import … from "…"`, nên mọi file nạp module theo kiểu động đều bị báo
    // OAN là "quên import". Gặp thật khi `qa.js` thêm lệnh `test`: nó nạp `tc-filter.js` bên
    // trong hàm (CLI không nên nạp cả cây module chỉ để in `--help`), và guard báo 5 lỗi giả.
    //
    // Báo oan nguy hiểm không kém báo sót: người ta học cách bỏ qua bộ test này.
    for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s+)?import\s*\(/g)) {
        for (const part of m[1].split(",")) {
            const bit = part.trim();
            if (!bit) continue;
            // `{ a: b }` và `{ a as b }` — tên dùng được là vế PHẢI.
            names.add((bit.split(/\s*:\s*|\s+as\s+/).pop() ?? bit).trim());
        }
    }
    return names;
}

/** Tên được khai NGAY TRONG file — trùng tên với export của runtime là hợp lệ (vd `parseJSON`). */
function localNames(src) {
    const names = new Set();
    for (const m of src.matchAll(/(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
    for (const m of src.matchAll(/(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    return names;
}

const files = await sourceFiles();
const problems = [];
let calls = 0;

for (const file of files) {
    let src;
    try { src = await readFile(file, "utf8"); } catch { continue; }

    const imported = importedNames(src);
    const local = localNames(src);
    // Bỏ phần import ra khỏi phần thân, để `import { x }` không bị đếm là một lời gọi `x(`.
    // VÀ bỏ chú thích: bản đầu của bộ kiểm này báo oan `verifyProduced()` trong qa-architect,
    // vì tên đó nằm trong một câu GIẢI THÍCH ("nên verifyProduced() không kiểm được nó").
    // Báo oan ở một cửa gác còn tệ hơn không có cửa: nó dạy người ta bỏ qua kết quả.
    const body = stripComments(src).replace(/import\s+[^;]+?\s+from\s+["'][^"']+["'];?/g, "");

    const used = new Set();
    for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) used.add(m[1]);

    for (const name of used) {
        if (!runtimeExports.has(name)) continue;
        calls++;
        if (imported.has(name) || local.has(name)) continue;
        // Gọi qua namespace (`P.specFor(...)`) đã bị regex trên loại vì có dấu `.` phía trước?
        // Không — regex `\b(name)\s*\(` vẫn khớp `P.specFor(`. Nên kiểm thêm ở đây.
        if (new RegExp(`\\.\\s*${name}\\s*\\(`).test(body) && !new RegExp(`(^|[^.\\w])${name}\\s*\\(`, "m").test(body)) continue;
        problems.push(`${file}: gọi \`${name}()\` (export của ${runtimeExports.get(name)}) mà KHÔNG import và cũng không khai tại chỗ`);
    }
}

chk(`soi ${files.length} file, ${calls} lời gọi tới hàm của runtime`, files.length > 10 && calls > 20, `${files.length} file / ${calls} lời gọi`);
chk(">>> KHÔNG file nào dùng hàm runtime mà quên import (node --check KHÔNG bắt được lỗi này)",
    problems.length === 0, problems.join(" | "));

// ── Kiểm chính bộ kiểm: nó có thật sự bắt được không? ───────────────────
{
    // Nếu logic trên sai, mọi thứ sẽ luôn xanh và bộ test này vô dụng. Dựng một ca hỏng giả để
    // chắc chắn nó bắt được — cùng lý do như khung tool của qa-architect cố ý nổ.
    const fake = `import { runTool } from "../runtime/tools.js";\nasync function x() { return runAgentLoop({}); }`;
    const imported = importedNames(fake);
    const local = localNames(fake);
    const body = fake.replace(/import\s+[^;]+?\s+from\s+["'][^"']+["'];?/g, "");
    const used = [...body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
    const caught = used.includes("runAgentLoop") && !imported.has("runAgentLoop") && !local.has("runAgentLoop")
        && runtimeExports.has("runAgentLoop");
    chk(">>> bộ kiểm này TỰ bắt được ca hỏng giả (nếu không thì nó luôn xanh và vô dụng)", caught,
        JSON.stringify({ used, imported: [...imported], biet: runtimeExports.has("runAgentLoop") }));
    chk("và KHÔNG báo oan khi có import đúng",
        importedNames(`import { runAgentLoop } from "../runtime/agent-loop.js";`).has("runAgentLoop"));
    // Import động có destructure cũng là import — không báo oan.
    chk(">>> KHÔNG báo oan với `const { x } = await import(...)` (qa.js nạp module trong hàm)",
        importedNames(`const { parseFilter, applyFilter } = await import("./agents/runtime/tc-filter.js");`).has("parseFilter"));
    chk("import động có đổi tên: lấy vế phải",
        importedNames(`const { a: b } = await import("./m.js");`).has("b"));
}

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nimports: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
