// ui/server.js
// R5 — máy chủ web local cho qa-agent. `node qa.js ui`.
//
// ⚠ ĐIỀU KIỆN SỐNG CÒN: file này KHÔNG chứa một dòng logic nghiệp vụ nào.
//
//   trình duyệt ──HTTP/SSE──▶  ui/server.js  ──spawn──▶  node qa.js run full --tc=… --confirm-mcp
//                              (lớp vỏ)                  (ĐÚNG tiến trình mà terminal chạy)
//
// Nó `spawn` đúng các lệnh `qa.js` đang có, đọc `runs.db` qua `memory.js`, đọc file qua
// `paths.js`. Không endpoint nào tự viết SQL, tự ghi deliverable, tự gọi LLM.
//
// Ngày UI viết lại logic là ngày có HAI hệ thống — bản chạy từ terminal và bản chạy từ UI —
// khác nhau ở những chỗ không ai kiểm. Đúng lỗi "0-BUG" của bản 3.

import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { checkRequest, newToken, safeReadPath } from "./guard.js";
import * as P from "../agents/runtime/paths.js";

const HTML = new URL("./app.html", import.meta.url);

const MIME = {
    ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
};

/** Tiến trình con đang chạy. Một lúc MỘT — pipeline không hỗ trợ chạy song song (node:sqlite đồng bộ). */
const jobs = new Map();
let jobSeq = 0;

const json = (res, code, obj) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(obj));
};
const text = (res, code, s) => {
    res.writeHead(code, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(s);
};

async function readBody(req, limit = 1_000_000) {
    let raw = "";
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > limit) throw new Error("body quá lớn");
    }
    return raw ? JSON.parse(raw) : {};
}

/**
 * Chạy một lệnh `qa.js` và stream ra SSE.
 *
 * KHÔNG dùng shell: đối số đi thẳng vào `spawn`, nên `--grep (a|b)` hay tên task có dấu cách
 * không bị cmd.exe diễn giải — đúng bẫy đã gặp ở R4 (`'TC-D-002)' is not recognized`).
 */
function startJob(args) {
    const id = String(++jobSeq);
    const child = spawn(process.execPath, ["qa.js", ...args], {
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: "0" },
    });
    const job = { id, args, child, lines: [], done: false, code: null, listeners: new Set() };
    jobs.set(id, job);

    const push = (chunk) => {
        const s = String(chunk);
        job.lines.push(s);
        for (const l of job.listeners) l(s);
    };
    child.stdout.on("data", push);
    child.stderr.on("data", push);
    child.on("close", (code) => {
        job.done = true;
        job.code = code;
        for (const l of job.listeners) l(`\n[kết thúc: mã thoát ${code}]\n`);
    });
    return job;
}

/** Đối số của `qa.js run` dựng từ form — chỉ những cờ luồng THẬT SỰ khai. */
export function runArgsFrom(body) {
    const args = ["run", String(body.flow ?? "").trim()];
    if (body.task) args.push(String(body.task));
    for (const k of ["tc", "tags", "priority", "suite", "report-types"]) {
        if (body[k]) args.push(`--${k}=${String(body[k])}`);
    }
    // ⚠ `--confirm-mcp` và Jira write PHẢI được tick lại MỖI LẦN. UI không được nhớ hộ —
    // đó là luật số 7 (bản 3), và cũng là lý do không có checkbox "ghi nhớ lựa chọn" nào ở đây.
    if (body.confirmMcp === true) args.push("--confirm-mcp");
    if (body.newRun === true) args.push("--new-run");
    if (body.noGate === true) args.push("--no-gate");
    if (body.vlmAll === true) args.push("--vlm-all");
    return args;
}

async function handle(req, res, { token }) {
    const u = new URL(req.url, "http://127.0.0.1");
    const q = u.searchParams;

    // ── trang ──
    if (u.pathname === "/" || u.pathname === "/index.html") {
        const html = await readFile(HTML, "utf8");
        res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
        return res.end(html);
    }

    // ── đọc trạng thái ──
    if (u.pathname === "/api/state") {
        const M = await import("../agents/runtime/memory.js");
        const runs = await M.listRuns(50);
        const out = [];
        for (const r of runs) out.push({ ...r, steps: await M.stepsOfRun(r.run_id) });
        return json(res, 200, { runs: out });
    }

    if (u.pathname === "/api/flows") {
        const FF = await import("../workflow/flow-file.js");
        // `loadFlows()` trả MẢNG các `{flow, problems}` — mỗi phần tử là kết quả parse MỘT file,
        // không phải bản thân flow. Bản đầu ở đây đọc `.name` ngay trên phần tử đó và nhận
        // `undefined` cho mọi luồng: giao diện hiện một <select> gồm 4 dòng "undefined", không
        // lỗi nào được báo. Bộ test bắt được vì nó đòi thấy đúng tên "full"/"analyze".
        const loaded = await FF.loadFlows();
        const problems = loaded.flatMap(x => x.problems ?? []);
        if (problems.length) console.warn(`  [ui] flows có vấn đề khai báo: ${problems.join(" | ")}`);
        return json(res, 200, {
            problems,
            flows: loaded.map(x => x.flow).filter(Boolean).map(f => ({
                name: f.name, title: f.title, description: f.description,
                params: f.params?.map(p => ({ name: p.name, kind: p.kind, note: p.note })) ?? [],
                flags: f.flags?.map(x => ({ name: x.name, note: x.note })) ?? [],
            })),
        });
    }

    if (u.pathname === "/api/file") {
        const s = safeReadPath(q.get("path"));
        if (!s.ok) return text(res, 400, s.why);
        try {
            return text(res, 200, await readFile(s.path, "utf8"));
        } catch (err) {
            return text(res, 404, `không đọc được ${s.path}: ${err.message}`);
        }
    }

    if (u.pathname === "/api/image") {
        const s = safeReadPath(q.get("path"));
        if (!s.ok) return text(res, 400, s.why);
        const mime = MIME[extname(s.path).toLowerCase()];
        if (!mime) return text(res, 400, "không phải ảnh");
        try {
            const bytes = await readFile(s.path);
            res.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
            return res.end(bytes);
        } catch { return text(res, 404, "không có ảnh"); }
    }

    // ── bảng test case + Kết quả (R1) ──
    if (u.pathname === "/api/testcases") {
        const D = await import("../agents/runtime/testcase-doc.js");
        try {
            const md = await readFile(P.TESTCASES_RESULT, "utf8");
            const parsed = D.parseTestCaseResults(md);
            return json(res, 200, { source: P.TESTCASES_RESULT, ...parsed });
        } catch {
            // Chưa chạy verify thì vẫn cho xem ĐẶC TẢ — nói rõ là chưa có kết quả, thay vì
            // hiện một bảng trống mà người đọc tưởng là "không có test case nào".
            try {
                const md = await readFile(P.TESTCASES, "utf8");
                const spec = D.extractTestCases(md);
                return json(res, 200, {
                    source: P.TESTCASES, specOnly: true,
                    rows: spec.rows.map(r => Object.fromEntries(D.TESTCASE_FIELDS.map((f, i) => [f, r[i] ?? ""]))),
                    problems: spec.problems,
                });
            } catch {
                return json(res, 200, { rows: [], problems: ["Chưa có bảng test case nào — chạy qa-test-designer trước."] });
            }
        }
    }

    // ── ảnh theo bước (R2) ──
    if (u.pathname === "/api/evidence") {
        const tcId = String(q.get("tc") ?? "");
        if (!/^[A-Za-z0-9._-]+$/.test(tcId)) return text(res, 400, "tc không hợp lệ");
        const { readdir } = await import("node:fs/promises");
        const dir = P.evidenceDir(tcId);
        try {
            const files = (await readdir(dir))
                .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
                .map(f => ({ file: f, path: `${dir}/${f}`, label: f.replace(/\.[^.]+$/, "") }))
                .sort((a, b) => a.file.localeCompare(b.file, "en"));
            return json(res, 200, { tcId, dir, images: files });
        } catch {
            return json(res, 200, { tcId, dir, images: [] });
        }
    }

    // ── gap report (R5.2e) ──
    if (u.pathname === "/api/gaps" && req.method === "GET") {
        try {
            const md = await readFile(P.GAP_REPORT, "utf8");
            const G = await import("../agents/qa-leader/tools/gap-answers.js").catch(() => null);
            return json(res, 200, { markdown: md, parsed: G?.parseGapReport ? G.parseGapReport(md) : null });
        } catch { return json(res, 200, { markdown: null }); }
    }

    // ── SSE ──
    if (u.pathname === "/api/stream") {
        const job = jobs.get(String(q.get("id")));
        if (!job) return text(res, 404, "không có job");
        res.writeHead(200, {
            "content-type": "text/event-stream", "cache-control": "no-cache",
            "connection": "keep-alive", "x-accel-buffering": "no",
        });
        const send = (s) => { for (const line of s.split("\n")) res.write(`data: ${line}\n`); res.write("\n"); };
        send(job.lines.join(""));
        if (job.done) { res.write("event: end\ndata: \n\n"); return res.end(); }
        const listener = (s) => {
            send(s);
            if (job.done) { res.write("event: end\ndata: \n\n"); res.end(); }
        };
        job.listeners.add(listener);
        req.on("close", () => job.listeners.delete(listener));
        return;
    }

    // ── GHI: chỉ POST (guard đã ép), và chỉ bằng cách spawn qa.js ──
    if (u.pathname === "/api/run") {
        const body = await readBody(req);
        const running = [...jobs.values()].find(j => !j.done);
        if (running) return json(res, 409, { error: `Đang có lệnh chạy dở (job ${running.id}). Dừng nó trước.` });
        const args = runArgsFrom(body);
        if (!args[1]) return json(res, 400, { error: "thiếu tên luồng" });
        const job = startJob(args);
        return json(res, 200, { id: job.id, command: `node qa.js ${args.join(" ")}` });
    }

    if (u.pathname === "/api/stop") {
        const body = await readBody(req);
        const job = jobs.get(String(body.id));
        if (!job) return json(res, 404, { error: "không có job" });
        job.child.kill();
        return json(res, 200, { stopped: true });
    }

    if (u.pathname === "/api/approve") {
        const body = await readBody(req);
        const node = String(body.node ?? "").trim();
        const by = String(body.by ?? "").trim();
        // Cửa Human-Final phải ghi được AI đã duyệt. Không có tên thì không phải là duyệt.
        if (!node || !by) return json(res, 400, { error: "cần cả `node` và tên người duyệt `by`" });
        const job = startJob(["approve", node, by]);
        return json(res, 200, { id: job.id, command: `node qa.js approve ${node} "${by}"` });
    }

    if (u.pathname === "/api/gaps") {
        const body = await readBody(req);
        const md = String(body.markdown ?? "");
        if (!md.trim()) return json(res, 400, { error: "nội dung rỗng" });
        await writeFile(P.GAP_REPORT, md, "utf8");
        // GHI XONG PHẢI ĐỌC LẠI. Đây là màn hình dễ làm hỏng file nhất: người dùng gõ tự do vào
        // một định dạng mà `gap-answers.js` parse theo cấu trúc. Ghi rồi báo "đã lưu" mà không
        // kiểm là để pipeline phát hiện hộ — ở một bước cách đây rất xa.
        const G = await import("../agents/qa-leader/tools/gap-answers.js").catch(() => null);
        const parsed = G?.parseGapReport ? G.parseGapReport(md) : null;
        return json(res, 200, { saved: true, parsed });
    }

    return text(res, 404, "không có endpoint này");
}

/**
 * @param {{port?: number, host?: string, token?: string, open?: boolean}} o
 * @returns {Promise<{url: string, token: string, close: () => void, port: number}>}
 */
export async function startUiServer({ port = 5179, host = "127.0.0.1", token = newToken(), allowHosts = null } = {}) {
    const server = http.createServer(async (req, res) => {
        try {
            const blocked = checkRequest({ method: req.method, url: req.url, headers: req.headers, token, allowHosts });
            if (blocked) return text(res, blocked.status, blocked.body);
            await handle(req, res, { token });
        } catch (err) {
            if (!res.headersSent) text(res, 500, `lỗi máy chủ: ${err.message}`);
            else res.end();
        }
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
    });
    const actual = server.address().port;
    return {
        port: actual,
        token,
        url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${actual}/?token=${token}`,
        close: () => { for (const j of jobs.values()) if (!j.done) j.child.kill(); server.close(); },
    };
}
