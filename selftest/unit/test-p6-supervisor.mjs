// Test P6: QA Leader giám sát nhiều luồng. KHÔNG gọi LLM, KHÔNG DB (dữ liệu inject).
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const S = await import(abs("agents/qa-leader/tools/run-supervisor.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const hAgo = (h) => new Date(NOW - h * 36e5).toISOString();
const step = (agent, status, extra = {}) => ({ agent, status, output: `${agent}.md`, human_approved: false, updated_at: hAgo(1), ...extra });

// ─────────── 1. done nhưng CHƯA DUYỆT -> chờ NGƯỜI, chỉ rõ lệnh duyệt ───────────
{
    const r = S.diagnoseRun({
        run: { run_id: "r1", feature: "Function D", created_at: hAgo(3), status: "active" },
        steps: [step("qa-leader", "done", { human_approved: true }), step("qa-analyst", "done")],
        nowMs: NOW,
    });
    chk(">>> node xong mà chưa duyệt -> chờ NGƯỜI, nói đúng node nào",
        r.health === "waiting_human" && r.waitingOn === "qa-analyst", JSON.stringify({ h: r.health, w: r.waitingOn }));
    chk("alert kèm nguyên lệnh duyệt để copy-paste",
        r.alerts.some(a => a.includes("node agents/approve.js qa-analyst")), JSON.stringify(r.alerts));
    chk("tiến độ đếm đúng số node đã done", r.progress.done === 2 && r.progress.total === 6, JSON.stringify(r.progress));
}

// ─────────── 2. chờ người trả lời gap-report ───────────
{
    const r = S.diagnoseRun({
        run: { run_id: "r2", feature: "F E", created_at: hAgo(5), status: "active" },
        steps: [step("qa-leader", "done", { human_approved: true }), step("qa-analyst", "waiting_ask", { round: 2 })],
        nowMs: NOW,
    });
    chk("waiting_ask -> chờ NGƯỜI, owner nói rõ phải trả lời gap-report",
        r.health === "waiting_human" && r.owner.includes("gap-report"), JSON.stringify({ h: r.health, o: r.owner }));
}

// ─────────── 3. needs_rework -> chờ AGENT, không phải người ───────────
{
    const r = S.diagnoseRun({
        run: { run_id: "r3", feature: "F", created_at: hAgo(2), status: "active" },
        steps: [
            step("qa-leader", "done", { human_approved: true }),
            step("qa-analyst", "done", { human_approved: true }),
            step("qa-test-designer", "done", { human_approved: true }),
            step("qa-automation", "needs_rework", { note: "Verifier: SPEC_ISSUE" }),
        ],
        nowMs: NOW,
    });
    chk(">>> needs_rework -> chờ AGENT (không đòi người làm gì)",
        r.health === "rework" && r.owner.includes("agent"), JSON.stringify({ h: r.health, o: r.owner }));
    chk("note của step được đưa lên alert (khỏi phải mở từng deliverable)",
        r.alerts.some(a => a.includes("SPEC_ISSUE")), JSON.stringify(r.alerts));
}

// ─────────── 4. Run BỊ BỎ QUÊN -> phát hiện được (trước đây không ai thấy) ───────────
{
    const r = S.diagnoseRun({
        run: { run_id: "r4", feature: "F", created_at: hAgo(50), status: "active" },
        steps: [step("qa-leader", "done", { human_approved: true, updated_at: hAgo(48) }),
                step("qa-analyst", "waiting_ask", { updated_at: hAgo(48) })],
        nowMs: NOW, staleHours: 24,
    });
    chk(">>> đứng im 48h -> CẢNH BÁO bị bỏ quên", r.alerts.some(a => a.includes("bị bỏ quên")), JSON.stringify(r.alerts));
    chk("đo đúng số giờ đứng im", r.idleHours === 48, String(r.idleHours));
    const fresh = S.diagnoseRun({ run: { run_id: "r5", created_at: hAgo(1), status: "active" }, steps: [step("qa-leader", "done")], nowMs: NOW });
    chk("run mới thì KHÔNG cảnh báo bỏ quên", !fresh.alerts.some(a => a.includes("bỏ quên")));
}

// ─────────── 5. blocked / done ───────────
{
    const b = S.diagnoseRun({ run: { run_id: "b", created_at: hAgo(2), status: "blocked" }, steps: [step("qa-analyst", "blocked")], nowMs: NOW });
    chk("run blocked -> health=blocked + cần người", b.health === "blocked" && b.alerts.some(a => a.includes("BLOCKED")));
    const d = S.diagnoseRun({
        run: { run_id: "d", created_at: hAgo(2), status: "done" },
        steps: S.PIPELINE.map(a => step(a, "done", { human_approved: true })), nowMs: NOW,
    });
    chk("run xong hết -> health=done, không chờ ai", d.health === "done" && d.progress.done === 6);
}

// ─────────── 6. NHIỀU LUỒNG cùng lúc — đúng điều trước đây không làm được ───────────
{
    const runs = [
        { run_id: "d-1", feature: "Function D", created_at: hAgo(3), status: "active" },
        { run_id: "e-1", feature: "Function E", created_at: hAgo(30), status: "active" },
        { run_id: "f-1", feature: "Function F", created_at: hAgo(1), status: "blocked" },
    ];
    const stepsByRun = {
        "d-1": [step("qa-leader", "done", { human_approved: true }), step("qa-analyst", "done")],
        "e-1": [step("qa-leader", "done", { human_approved: true, updated_at: hAgo(29) }), step("qa-analyst", "needs_rework", { updated_at: hAgo(29) })],
        "f-1": [step("qa-analyst", "blocked")],
    };
    const out = await S.superviseRuns({ runs, loadSteps: async (id) => stepsByRun[id], nowMs: NOW, staleHours: 24 });

    chk(">>> soi được 3 run CÙNG LÚC (trước đây file JSON chỉ giữ được 1 run)", out.reports.length === 3);
    chk("phân loại đúng: 1 chờ người duyệt, 1 chờ agent, 1 blocked",
        out.needsHuman.length === 2 && out.needsAgent.length === 1,
        JSON.stringify({ human: out.needsHuman.map(r => r.runId), agent: out.needsAgent.map(r => r.runId) }));
    chk("run e-1 (30h) bị gắn cờ bỏ quên", out.reports.find(r => r.runId === "e-1").alerts.some(a => a.includes("bỏ quên")));

    const md = S.renderDashboard(out);
    chk(">>> dashboard có bảng đủ 3 run + mục 'Cần NGƯỜI xử lý' và 'Cần AGENT chạy lại'",
        md.includes("d-1") && md.includes("e-1") && md.includes("f-1") &&
        md.includes("Cần NGƯỜI xử lý") && md.includes("Cần AGENT chạy lại"), md.slice(0, 200));
    chk("dashboard nói rõ ai phải làm gì, không chỉ liệt kê trạng thái",
        md.includes("Ai phải làm") && md.includes("node agents/approve.js"));
}

// ─────────── 7. không có run nào -> không nổ ───────────
{
    const out = await S.superviseRuns({ runs: [], loadSteps: async () => [], nowMs: NOW });
    chk("0 run -> dashboard vẫn hợp lệ, nói rõ chưa có run", S.renderDashboard(out).includes("Chưa có run nào"));
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
