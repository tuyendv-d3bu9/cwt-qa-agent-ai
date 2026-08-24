// agents/qa-leader/tools/run-supervisor.js
// QA Leader as a SUPERVISOR of other agents' runs. Deterministic — no LLM.
//
// WHAT THE LEADER WAS. Three exported functions (`runSetup`, `runReview`, `trackProgress`)
// that workflow/flow-2 called in sequence. It supervised nothing: once a node was running
// there was no notion of watching it, no notion of more than one piece of work in flight,
// and no way to notice that a run had been sitting waiting for a human for two days.
//
// WHAT MADE THIS POSSIBLE. The session work (K) moved run state out of a single JSON file
// that could hold exactly ONE run into `.qa-run/runs.db`, which holds many. Only now is
// there anything to supervise.
//
// WHY DETERMINISTIC. Every judgement here — "is this run stuck?", "who has to act?" — is a
// rule over recorded facts (status, timestamps, approval flags). Sending run state to a
// language model to be told what a `waiting_ask` step means would add cost, latency and
// the chance of a different answer each time, for a decision that has one right answer.
// The LLM's place is explaining the resulting dashboard, not computing it.

/** Who has to move next, per step status. The mapping IS the supervision policy. */
const OWNER = {
    waiting_ask: "người dùng (trả lời câu hỏi trong gap-report)",
    blocked: "người dùng (vượt số vòng FIX, cần xem lại)",
    needs_rework: "agent (sinh lại sau feedback)",
    pending: "agent (chưa chạy)",
    done: "người dùng (duyệt để node sau chạy được)",
};

/** Pipeline order — used to say which node a run is actually waiting on. */
export const PIPELINE = [
    "qa-leader", "qa-analyst", "qa-test-designer", "qa-automation", "qa-verifier", "qa-reporter",
];

const hours = (fromIso, nowMs) => {
    const t = Date.parse(fromIso ?? "");
    if (Number.isNaN(t)) return null;
    return Math.max(0, (nowMs - t) / 36e5);
};

/**
 * Diagnose ONE run.
 *
 * `nowMs` is injected rather than read from the clock so the same input always gives the
 * same output — a function whose answer depends on when you call it cannot be tested, and
 * "stuck for 30 hours" is exactly the kind of claim that has to be reproducible.
 *
 * @param {{run: object, steps: Array, nowMs: number, staleHours?: number}} o
 * @returns {{runId, feature, status, health, waitingOn, owner, ageHours, alerts: string[], progress: {done, total}}}
 */
export function diagnoseRun({ run, steps, nowMs, staleHours = 24 }) {
    const byAgent = new Map((steps ?? []).map(s => [s.agent, s]));
    const alerts = [];

    const doneCount = PIPELINE.filter(a => byAgent.get(a)?.status === "done").length;

    // The run is waiting on the FIRST pipeline node that is not finished-and-approved.
    let waitingOn = null;
    let reason = null;
    for (const agent of PIPELINE) {
        const st = byAgent.get(agent);
        if (!st) { waitingOn = agent; reason = "pending"; break; }
        if (st.status !== "done") { waitingOn = agent; reason = st.status; break; }
        if (!st.human_approved) { waitingOn = agent; reason = "done"; break; }   // done but unapproved
    }

    const ageHours = hours(run?.created_at, nowMs);
    const lastTouch = (steps ?? [])
        .map(s => Date.parse(s.updated_at ?? ""))
        .filter(t => !Number.isNaN(t))
        .sort((a, b) => b - a)[0];
    const idleHours = lastTouch ? Math.max(0, (nowMs - lastTouch) / 36e5) : ageHours;

    let health = "ok";
    if (run?.status === "blocked") { health = "blocked"; alerts.push(`Run bị BLOCKED — cần người xem lại.`); }
    else if (run?.status === "done") health = "done";
    else if (reason === "waiting_ask") { health = "waiting_human"; alerts.push(`Đang chờ người dùng trả lời (${waitingOn}).`); }
    else if (reason === "done") { health = "waiting_human"; alerts.push(`"${waitingOn}" đã xong nhưng CHƯA DUYỆT — node sau bị chặn. Duyệt: node agents/approve.js ${waitingOn} "<tên>"`); }
    else if (reason === "needs_rework") { health = "rework"; alerts.push(`"${waitingOn}" cần sinh lại (needs_rework).`); }

    // Idle is reported separately from health: a run legitimately waiting for a human is
    // not unhealthy, but one that has been waiting a day probably needs a nudge, and that
    // is precisely what nobody could see before.
    if (run?.status === "active" && idleHours !== null && idleHours >= staleHours) {
        alerts.push(`Không có tiến triển ${Math.floor(idleHours)} giờ — có thể đã bị bỏ quên.`);
    }

    // A step recording a note is a step that had something to say; surfacing it here saves
    // opening every deliverable to find out why a run stalled.
    for (const s of steps ?? []) {
        if (s.note) alerts.push(`[${s.agent}] ${s.note}`);
    }

    return {
        runId: run?.run_id ?? null,
        feature: run?.feature ?? null,
        status: run?.status ?? "unknown",
        health,
        waitingOn,
        owner: reason ? (OWNER[reason] ?? reason) : null,
        ageHours: ageHours === null ? null : Math.floor(ageHours),
        idleHours: idleHours === null ? null : Math.floor(idleHours),
        alerts,
        progress: { done: doneCount, total: PIPELINE.length },
    };
}

/**
 * Diagnose EVERY run — the multi-flow view.
 *
 * `loadSteps` is injected (rather than importing memory.js here) because memory.js only
 * ever exposes the CURRENT session's steps. Supervision needs steps for runs that are not
 * the current one, and the caller is the right place to decide how to get them.
 *
 * @param {{runs: Array, loadSteps: (runId: string) => Promise<Array>, nowMs: number, staleHours?: number}} o
 */
export async function superviseRuns({ runs, loadSteps, nowMs, staleHours = 24 }) {
    const reports = [];
    for (const run of runs ?? []) {
        reports.push(diagnoseRun({ run, steps: await loadSteps(run.run_id), nowMs, staleHours }));
    }

    const counts = reports.reduce((acc, r) => { acc[r.health] = (acc[r.health] ?? 0) + 1; return acc; }, {});
    return {
        reports,
        counts,
        needsHuman: reports.filter(r => r.health === "waiting_human" || r.health === "blocked"),
        needsAgent: reports.filter(r => r.health === "rework"),
    };
}

/** The dashboard. Deterministic text — an LLM may explain it, never compute it. */
export function renderDashboard({ reports, counts, needsHuman, needsAgent }) {
    if (!reports.length) return `# Giám sát các luồng QA\n\n*Chưa có run nào.*\n`;

    const lines = [
        `# Giám sát các luồng QA`,
        ``,
        `${reports.length} run: ` + (Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ") || "—"),
        ``,
        `| Run | Feature | Tiến độ | Tình trạng | Đang chờ | Ai phải làm | Tuổi (h) | Đứng im (h) |`,
        `|---|---|---|---|---|---|---|---|`,
    ];
    for (const r of reports) {
        lines.push(
            `| \`${r.runId}\` | ${r.feature ?? "—"} | ${r.progress.done}/${r.progress.total} | ${r.health} | ` +
            `${r.waitingOn ?? "—"} | ${r.owner ?? "—"} | ${r.ageHours ?? "?"} | ${r.idleHours ?? "?"} |`
        );
    }
    lines.push(``);

    if (needsHuman.length) {
        lines.push(`## Cần NGƯỜI xử lý (${needsHuman.length})`, ``);
        for (const r of needsHuman) {
            lines.push(`- \`${r.runId}\` (${r.feature ?? "—"}):`);
            for (const a of r.alerts) lines.push(`  - ${a}`);
        }
        lines.push(``);
    }
    if (needsAgent.length) {
        lines.push(`## Cần AGENT chạy lại (${needsAgent.length})`, ``);
        for (const r of needsAgent) lines.push(`- \`${r.runId}\`: ${r.alerts.join(" ")}`);
        lines.push(``);
    }
    if (!needsHuman.length && !needsAgent.length) {
        lines.push(`*Không run nào đang chờ ai — tất cả đã xong hoặc đang chạy.*`, ``);
    }
    return lines.join("\n");
}
