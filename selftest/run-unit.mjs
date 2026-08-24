// selftest/run-unit.mjs

import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT_DIR = path.join(HERE, "unit");
const only = process.argv.slice(2).filter(a => !a.startsWith("--"));

const files = (await readdir(UNIT_DIR))
    .filter(f => f.endsWith(".mjs"))
    .filter(f => only.length === 0 || only.some(o => f.includes(o)))
    .sort();

if (files.length === 0) {
    console.error(`Không có bộ test nào khớp ${JSON.stringify(only)} trong tests/unit/.`);
    process.exit(1);
}

/** Chạy một bộ, trả về {file, code, passed, total}. Con số lấy từ dòng tổng kết cuối. */
function runOne(file) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(UNIT_DIR, file)], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        child.stdout.on("data", d => { out += d; });
        child.stderr.on("data", d => { out += d; });
        child.on("close", (code) => {
            // Dòng tổng kết cuối của mỗi bộ. BA kiểu, vì các bộ viết ở hai thời điểm khác nhau:
            //   "tên: 26/26"   (bộ mới)  → 26 đạt / 26
            //   "24/24 ĐÚNG"   (bộ cũ)   → 24 đạt / 24
            //   "1/7 SAI"      (bộ cũ)   → 1 HỎNG / 7   ← con số đầu là số HỎNG, không phải đạt
            // Bản đầu của file này đọc "1/7 SAI" thành "1 đạt / 7" rồi vẫn in PASS, vì bộ đó
            // thoát 0. Một bộ đang fail bị báo PASS là đúng loại lỗi cả repo này đang chống.
            const m = [...out.matchAll(/^(?:.*?:\s*)?(\d+)\/(\d+)(?:\s+(\p{Lu}+))?\s*$/gmu)].pop();
            const isFailCount = m?.[3] === "SAI";
            const total = m ? Number(m[2]) : null;
            const failedCount = m ? (isFailCount ? Number(m[1]) : total - Number(m[1])) : null;
            resolve({
                file,
                code: code ?? 0,
                passed: m ? total - failedCount : null,
                total,
                failedCount,
                output: out,
            });
        });
    });
}

const results = [];
for (const file of files) results.push(await runOne(file));

console.log("");
let passed = 0, total = 0, failedSuites = 0;
for (const r of results) {
    const counted = r.passed !== null;
    if (counted) { passed += r.passed; total += r.total; }
    // KHÔNG tin riêng mã thoát: có bộ cũ không gọi process.exit() nên fail vẫn thoát 0.
    // Cũng không tin riêng con số: một bộ nổ giữa đường sẽ không in dòng tổng kết nào.
    const ok = r.code === 0 && (r.failedCount === null ? false : r.failedCount === 0);
    if (!ok) failedSuites++;
    const num = counted ? `${r.passed}/${r.total}` : "(không đọc được số)";
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${r.file.padEnd(30)} ${num}`);
    if (!ok) {
        // In nguyên văn phần hỏng: một bộ fail mà chỉ báo "FAIL" thì phải chạy lại tay mới biết gì.
        for (const line of r.output.split("\n").filter(l => l.includes("FAIL") || /Error|error:/.test(l)).slice(0, 12)) {
            console.log(`          ${line.trim()}`);
        }
    }
}

console.log(`\n${results.length} bộ · ${passed}/${total} test · ${failedSuites === 0 ? "không có bộ nào hỏng" : `${failedSuites} bộ HỎNG`}\n`);
process.exit(failedSuites === 0 ? 0 : 1);
