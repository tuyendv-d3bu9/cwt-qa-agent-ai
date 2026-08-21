// agents/qa-leader/tools/ui-flow-parser.js
// Deterministic (NO LLM) parser for the UI flow document — the navigation backbone the
// automation node drives the browser along.
//
// WHY DETERMINISTIC: the flow is the ONE thing that must not be guessed. Everything
// downstream (which screen a step happens on, which element to look for, which spec to
// write) hangs off it. An LLM misreading step 2 as step 3 would send the browser to the
// wrong screen and every locator found there would be wrong — silently, and expensively.
//
// GENERIC BY CONSTRUCTION: this file knows nothing about any particular application. It
// knows a document shape — `## Flow: <name>`, `**Entry:** <url>`, then a numbered list —
// and nothing about carts, vouchers or checkouts. Any project describing its flows in that
// shape is readable by the same code.

/** `## Flow: <name>` — the heading that opens one flow. `#`/`###` also accepted. */
const FLOW_RE = /^#{1,3}\s*Flow\s*:\s*(.+?)\s*$/i;
/** `**Entry:** <url>` — where the flow starts. Bold markers optional. */
const ENTRY_RE = /^\**\s*Entry\s*:?\**\s*:?\s*(\S+)\s*$/i;
/** `1. text` / `1) text` / `1 - text` — one step. */
const STEP_RE = /^\s*(\d+)\s*[.)-]\s+(.+?)\s*$/;
/** A heading that is NOT a flow heading ends the current flow. */
const HEADING_RE = /^#{1,6}\s+/;

/**
 * A step is BUSINESS INTENT, in the author's own words. Nothing here tries to work out
 * which element it refers to.
 *
 * THIS IS THE DIVISION OF LABOUR AND IT MATTERS:
 *   this document  →  WHAT to do, in business terms, in order
 *   MCP snapshot   →  what is actually on the screen right now (the a11y yaml)
 *   the AI, at run time, per step  →  which node in that yaml the step means
 *
 * An earlier version of this parser required the exact element name in quotes and reported
 * a PROBLEM when a step had none. That was backwards twice over: it demanded that a human
 * know the real accessible name before any exploration had happened, and it made the flow
 * document carry information that only a live browser can supply. Writing
 * `nhập mã vào ô "Mã giảm giá"` should never be mandatory — `nhập mã giảm giá` is a
 * perfectly clear instruction, and resolving it to a textbox is the agent's job.
 *
 * `hints` therefore holds quoted names when the author happened to use quotes, and it is
 * exactly that: a hint handed to the AI alongside the live snapshot. Never a requirement,
 * never used as a selector.
 *
 * `kind: "check"` marks a step that only observes, so the walker does not try to click it.
 */
const CHECK_VERBS = /^(kiểm tra|xác nhận|quan sát|verify|check|thấy)\b/i;

function describeStep(text) {
    const hints = [...text.matchAll(/["'“”„»«]([^"'“”„»«]{1,80})["'“”„»«]/g)].map(m => m[1].trim()).filter(Boolean);
    // A leading check verb makes the whole step an observation; a check verb after the
    // action (…" — kiểm tra …") does not, the action still has to happen.
    const kind = CHECK_VERBS.test(text.trim()) ? "check" : "action";
    return { hints, kind };
}

/**
 * @param {string} markdown  contents of the UI flow document
 * @returns {{flows: Array<{name: string, entry: string|null, steps: Array<{n: number, text: string, screen: string|null, action: string}>}>,
 *            problems: string[]}}
 *   `problems` lists what a human needs to fix (a flow with no steps, numbering that skips,
 *   an entry URL that is not a URL). Reported, never silently repaired: a flow document
 *   quietly "corrected" by code is a flow nobody can trust.
 */
export function parseUiFlows(markdown) {
    const lines = String(markdown ?? "").split("\n");
    const flows = [];
    const problems = [];

    let current = null;
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Fenced blocks hold EXAMPLES of the format (the document explains itself), so a
        // `## Flow:` in there must not be parsed as a real flow.
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;

        const flow = FLOW_RE.exec(line);
        if (flow) {
            current = { name: flow[1].trim(), entry: null, steps: [] };
            flows.push(current);
            continue;
        }
        if (!current) continue;

        const entry = ENTRY_RE.exec(line);
        if (entry) {
            current.entry = entry[1].replace(/[`<>]/g, "");
            continue;
        }

        const step = STEP_RE.exec(line);
        if (step) {
            const text = step[2].replace(/\s*\*\*/g, "").trim();
            current.steps.push({ n: Number(step[1]), text, ...describeStep(text) });
            continue;
        }

        // Any other heading closes the flow — otherwise a "## CHƯA RÕ" section full of
        // numbered questions would be swallowed as flow steps.
        if (HEADING_RE.test(line)) current = null;
    }

    for (const f of flows) {
        if (f.steps.length === 0) {
            problems.push(`Flow "${f.name}" không có bước nào (cần danh sách có số: "1. ...").`);
        }
        if (!f.entry) {
            problems.push(`Flow "${f.name}" thiếu "**Entry:** <url>".`);
        } else if (!/^https?:\/\//i.test(f.entry)) {
            problems.push(`Flow "${f.name}": Entry "${f.entry}" không phải URL http(s).`);
        }
        const expected = f.steps.map((_, i) => i + 1).join(",");
        const actual = f.steps.map(s => s.n).join(",");
        if (expected !== actual) {
            problems.push(`Flow "${f.name}": số bước không liên tục (thấy ${actual}, mong ${expected}).`);
        }
        // An unfilled placeholder means a human was asked to supply something. A hint IS
        // allowed to be absent, but a hint that literally reads "[CẦN BỔ SUNG]" is a
        // leftover to-do, not intent — and in this repo it got there because the author of
        // the tooling (me) demanded element names the document should never have carried.
        for (const s of f.steps) {
            for (const h of s.hints) {
                if (/CẦN BỔ SUNG|TODO|\bTBD\b|^<.*>$/i.test(h)) {
                    problems.push(
                        `Flow "${f.name}" bước ${s.n}: còn placeholder "${h}". ` +
                        `Viết bước bằng lời nghiệp vụ bình thường và xoá placeholder — ` +
                        `tên phần tử thật do agent tự tìm bằng MCP, tài liệu KHÔNG cần biết.`
                    );
                }
            }
        }

        // Deliberately NOT checked: "an action step with no quoted element name".
        // That check used to exist and it was wrong — see describeStep(). A step written in
        // plain business language is the NORMAL case, not a defect.
    }
    if (flows.length === 0) problems.push(`Không tìm thấy flow nào — cần heading dạng "## Flow: <tên>".`);

    return { flows, problems };
}

/** The flow a piece of work belongs to: exact name if given, else the first one. */
export function pickFlow(flows, name = null) {
    if (!flows.length) return null;
    if (!name) return flows[0];
    const lower = String(name).toLowerCase();
    return flows.find(f => f.name.toLowerCase() === lower)
        ?? flows.find(f => f.name.toLowerCase().includes(lower))
        ?? flows[0];
}

/**
 * Element-name hints the author happened to write, in first-appearance order.
 *
 * NOT a shopping list of things to find — the walker discovers elements from the LIVE
 * snapshot at each step, which is the only place the truth exists. This is for logging and
 * for handing the AI a nudge; a flow with zero hints walks exactly the same way.
 */
export function hintsOf(flow) {
    const seen = [];
    for (const s of flow?.steps ?? []) {
        for (const h of s.hints ?? []) if (!seen.includes(h)) seen.push(h);
    }
    return seen;
}

/** Steps that actually do something, in order — what to walk to reach a later screen. */
export function actionSteps(flow) {
    return (flow?.steps ?? []).filter(s => s.kind === "action");
}
