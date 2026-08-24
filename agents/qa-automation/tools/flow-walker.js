// agents/qa-automation/tools/flow-walker.js
// Walk a business flow through the REAL browser, one step at a time, and let the journey
// itself discover the application.
//
// THE LOOP — this is the thing:
//
//   snapshot (MCP → a11y yaml)
//        │
//        ├─ parse deterministically           tools/snapshot-parser.js
//        ├─ filter to plausible candidates    (no LLM, no cost)
//        │
//        ▼
//   AI: "step says «thêm một sản phẩm vào giỏ»; which of these nodes is that?"
//        │                                     ← the ONLY judgement call
//        ▼
//   browser_generate_locator → registry        Playwright writes the locator, not the LLM
//        │
//        ▼
//   perform the action → PAGE CHANGES → snapshot again → next step
//
// After the walk the registry holds real locators for EVERY screen the flow passes through.
// That is what was missing: the previous run produced 57 snapshots which — once the
// transient `ref=` ids are stripped — were exactly ONE distinct page. The browser never
// left the entry screen, so the registry never learned the cart page, so every generated
// spec had nothing to reference and commented out every action as
// `// TODO: locator chưa xác định`. Twenty-one specs that navigated to the homepage,
// asserted something that could never be there, and screenshotted the failure.
//
// WHAT THIS FILE REFUSES TO DO
//   - guess an element when the AI cannot identify one: the step is recorded as a FINDING
//     and the walk stops. Clicking a nearby-looking button would corrupt every screen after
//     it, and the specs generated from those screens, silently.
//   - invent element names from the flow document. The document states intent; names come
//     from the live snapshot, always.
//
// Everything external is INJECTED (mcp, snapshot, resolve, ask). That keeps the walk
// testable without a browser or an API key, and it is the lesson from runtime/loop.js's
// deleted runAgent(): a loop hard-wired to one tool source fits nothing else.

/**
 * @param {object} o
 * @param {{name: string, entry: string|null, steps: Array}} o.flow  from ui-flow-parser.js
 * @param {(name: string, args?: object) => Promise<any>} o.mcp      call one MCP tool
 * @param {() => Promise<{nodes: Array, text: string}>} o.snapshot   capture + parse current page
 * @param {(desc: {role?: string, name: string}) => Promise<object|null>} o.resolve
 *        resolve one element to a durable locator and record it in the registry
 * @param {(payload: object) => Promise<object|null>} o.ask
 *        the single judgement call: given the step and the candidate nodes, which node is it?
 *        Must resolve to `{ found, role, name, action, value, confidence, why }` or null.
 * @param {(msg: string) => void} [o.log]
 * @returns {Promise<{visited: Array, findings: Array, stoppedAt: number|null, screens: number}>}
 */
export async function walkFlow({ flow, mcp, snapshot, resolve, ask, log = () => { } }) {
    const visited = [];
    const findings = [];
    let stoppedAt = null;
    let screens = 0;

    if (flow?.entry) {
        await mcp("browser_navigate", { url: flow.entry });
        screens++;
    }

    for (const step of flow?.steps ?? []) {
        // Fresh snapshot every step: the page changed because of the PREVIOUS step, and a
        // stale `ref` is worse than no ref (see mcp-cost-optimization.md, "ref transient").
        const snap = await snapshot();
        const candidates = candidateNodes(snap.nodes, step);

        if (candidates.length === 0) {
            findings.push({
                step: step.n, text: step.text, kind: "no_candidates",
                detail: `Trang hiện tại không có phần tử tương tác nào để thực hiện bước này.`,
            });
            stoppedAt = step.n;
            log(`  bước ${step.n}: KHÔNG có phần tử tương tác nào trên trang — dừng.`);
            break;
        }

        const decision = await ask({
            step: step.text,
            kind: step.kind,
            hints: step.hints ?? [],
            candidates,
        });

        // An observation step needs no click. It is still worth a snapshot (done above), so
        // the registry learns whatever screen it lands on.
        if (step.kind === "check") {
            visited.push({ step: step.n, text: step.text, action: "observe", element: null });
            log(`  bước ${step.n}: quan sát (không click).`);
            continue;
        }

        if (!decision?.found || !decision.name) {
            findings.push({
                step: step.n, text: step.text, kind: "unmatched",
                detail: decision?.why || `Không khớp được bước này với phần tử nào trên trang.`,
                candidates: candidates.slice(0, 10).map(c => `${c.role} "${c.name ?? ""}"`),
            });
            stoppedAt = step.n;
            log(`  bước ${step.n}: KHÔNG khớp được phần tử — dừng, ghi finding (KHÔNG đoán).`);
            break;
        }

        const matchedCandidate = candidates.find(c =>
            (!decision.role || c.role === decision.role) &&
            ((c.name && c.name.toLowerCase() === decision.name.toLowerCase()) ||
             (c.name && c.name.toLowerCase().includes(decision.name.toLowerCase())) ||
             (c.text && c.text.toLowerCase().includes(decision.name.toLowerCase())))
        );
        const freshRef = matchedCandidate?.ref ?? null;

        const element = await resolve({ role: decision.role, name: decision.name, ref: freshRef });
        if (!freshRef && !element?.ref && !element?.locator) {
            findings.push({
                step: step.n, text: step.text, kind: "unresolvable",
                detail: `AI chọn ${decision.role} "${decision.name}" nhưng không lấy được locator/ref cho nó.`,
            });
            stoppedAt = step.n;
            log(`  bước ${step.n}: chọn được phần tử nhưng không resolve được locator — dừng.`);
            break;
        }

        const performed = await performAction({ mcp, decision, element: { ...element, ref: freshRef ?? element?.ref }, step });
        if (performed.error) {
            findings.push({
                step: step.n, text: step.text, kind: "action_failed",
                detail: `${performed.tool} lỗi: ${performed.error}`,
            });
            stoppedAt = step.n;
            log(`  bước ${step.n}: ${performed.tool} LỖI — dừng: ${performed.error}`);
            break;
        }

        screens++;
        visited.push({
            step: step.n, text: step.text, action: performed.tool,
            element: `${decision.role ?? "?"} "${decision.name}"`,
            confidence: decision.confidence ?? null,
        });
        log(`  bước ${step.n}: ${performed.tool} → ${decision.role ?? "?"} "${decision.name}"` +
            (decision.confidence === "low" ? "  [confidence THẤP — cần người xem]" : ""));

        if (decision.confidence === "low") {
            findings.push({
                step: step.n, text: step.text, kind: "low_confidence",
                detail: `Khớp với ${decision.role ?? "?"} "${decision.name}" nhưng AI tự đánh confidence thấp: ${decision.why ?? "(không nêu lý do)"}`,
            });
        }
    }

    return { visited, findings, stoppedAt, screens };
}

/**
 * Nodes worth offering for this step. Interactive nodes always, plus text nodes whose
 * content overlaps the step's words (a step may target a label rather than a control).
 * Deterministic and free — the AI should be deciding between a handful of real options, not
 * reading a whole page.
 */
function candidateNodes(nodes, step) {
    const INTERACTIVE = new Set([
        "textbox", "button", "link", "checkbox", "radio", "combobox", "listbox",
        "option", "searchbox", "slider", "spinbutton", "switch", "tab", "menuitem",
    ]);
    const words = new Set(
        `${step.text} ${(step.hints ?? []).join(" ")}`
            .toLowerCase()
            .match(/[\p{L}\p{N}]{3,}/gu) ?? []
    );
    const mentions = (v) => {
        if (!v) return false;
        const s = String(v).toLowerCase();
        for (const w of words) if (s.includes(w)) return true;
        return false;
    };

    return nodes
        .filter(n => (INTERACTIVE.has(n.role) && n.ref) || mentions(n.name) || mentions(n.text))
        .map(n => ({
            role: n.role,
            name: n.name ?? null,
            text: n.text ?? null,
            ref: n.ref ?? null,
            disabled: n.attrs?.disabled === true || n.attrs?.disabled === "true" || undefined,
        }));
}

/** Map the AI's chosen action onto an MCP call. Only these three; anything else is a miss. */
async function performAction({ mcp, decision, element, step }) {
    const action = (decision.action ?? "click").toLowerCase();
    const target = { ref: element.ref, element: decision.name };

    try {
        if (action === "type" || action === "fill") {
            // A type step with no value is not performable — say so rather than filling "".
            // `fill(undefined)` is exactly how TC-D-002 failed in the first real run.
            const value = decision.value ?? step.value ?? null;
            if (value === null || value === undefined || value === "") {
                return { tool: "browser_type", error: `bước yêu cầu nhập nhưng không có giá trị để nhập` };
            }
            const res = await mcp("browser_type", { ...target, text: String(value) });
            const resText = typeof res === "string" ? res : JSON.stringify(res ?? "");
            if (res?.isError || resText.includes("### Error")) {
                return { tool: "browser_type", error: resText };
            }
            return { tool: "browser_type" };
        }
        if (action === "select") {
            const res = await mcp("browser_select_option", { ...target, values: [String(decision.value ?? "")] });
            const resText = typeof res === "string" ? res : JSON.stringify(res ?? "");
            if (res?.isError || resText.includes("### Error")) {
                return { tool: "browser_select_option", error: resText };
            }
            return { tool: "browser_select_option" };
        }
        const res = await mcp("browser_click", target);
        const resText = typeof res === "string" ? res : JSON.stringify(res ?? "");
        if (res?.isError || resText.includes("### Error")) {
            return { tool: "browser_click", error: resText };
        }
        return { tool: "browser_click" };
    } catch (err) {
        return { tool: `browser_${action}`, error: String(err?.message ?? err) };
    }
}

/**
 * Retry the steps a previous walk could not do (P3.4).
 *
 * A step goes unimplemented for two very different reasons, and only one is worth retrying:
 *   - the walk never REACHED it (an earlier step failed, so this one was never attempted) —
 *     retryable: fix the earlier step and the rest of the journey opens up;
 *   - the walk reached it and the element genuinely is not there — not retryable by walking
 *     again, it needs a human to look at the flow document or the app.
 *
 * Blindly re-walking the whole flow would pay for the steps that already succeeded and
 * would hit the same wall at the same place. This restarts from the entry (state has to be
 * rebuilt) but only ASKS about the steps still missing, and stops the moment it fails to
 * make progress — a retry that cannot get further than last time must not loop.
 *
 * @param {{flow, previous, mcp, snapshot, resolve, ask, log?}} o
 *   `previous` is a prior walkFlow() result.
 */
export async function retryUnreached({ flow, previous, mcp, snapshot, resolve, ask, log = () => { } }) {
    const done = new Set((previous?.visited ?? []).map(v => v.step));
    const remaining = (flow?.steps ?? []).filter(s => !done.has(s.n));

    if (remaining.length === 0) {
        return { ...previous, retried: 0, progressed: 0, note: "không còn bước nào chưa đi" };
    }
    if (previous?.stoppedAt === null || previous?.stoppedAt === undefined) {
        // Nothing blocked last time, so there is nothing a retry can unblock.
        return { ...previous, retried: 0, progressed: 0, note: "lần trước không bị chặn ở đâu" };
    }

    log(`  Thử lại ${remaining.length} bước chưa đi được (từ bước ${previous.stoppedAt}).`);
    const out = await walkFlow({ flow, mcp, snapshot, resolve, ask, log });

    const progressed = out.visited.length - (previous.visited?.length ?? 0);
    if (progressed <= 0) {
        log(`  Thử lại KHÔNG tiến thêm bước nào — dừng, không lặp. Cần người xem tài liệu luồng hoặc app.`);
    } else {
        log(`  Thử lại đi thêm được ${progressed} bước.`);
    }

    return {
        ...out,
        retried: remaining.length,
        progressed,
        note: progressed > 0 ? `đi thêm ${progressed} bước` : "không tiến thêm — cần người xem",
    };
}

/**
 * Which flow steps still have no verified element after walking.
 * This is the list the Gherkin writer must be told it CANNOT use, and the list a human has
 * to act on. Returned separately from `findings` because it is a different question:
 * findings say what happened, this says what is still missing.
 */
export function unreachedSteps({ flow, visited }) {
    const done = new Set((visited ?? []).map(v => v.step));
    return (flow?.steps ?? [])
        .filter(s => !done.has(s.n))
        .map(s => ({ n: s.n, text: s.text, kind: s.kind }));
}

/** Human-readable record of the walk, for exploratory-findings.md. */
export function renderWalk({ flow, visited, findings, stoppedAt, screens }) {
    const lines = [
        `## Đi luồng: ${flow?.name ?? "(không tên)"}`,
        ``,
        `Entry: ${flow?.entry ?? "(không có)"} — đi qua ${screens} trạng thái trang.`,
        ``,
    ];

    if (visited.length) {
        lines.push(`| Bước | Việc | Hành động | Phần tử thật (do MCP+AI tìm ra) |`, `|---|---|---|---|`);
        for (const v of visited) {
            lines.push(`| ${v.step} | ${v.text} | ${v.action} | ${v.element ?? "—"}${v.confidence === "low" ? " ⚠ low" : ""} |`);
        }
        lines.push(``);
    }

    if (stoppedAt !== null) {
        lines.push(
            `> **Luồng DỪNG ở bước ${stoppedAt}.** Các bước sau chưa được đi, nên phần tử của những`,
            `> màn hình sau đó CHƯA có trong registry — spec cho các bước đó sẽ không có locator.`,
            `> Đây là dừng có chủ ý: đoán một phần tử gần đúng sẽ làm sai mọi màn hình phía sau.`,
            ``,
        );
    }

    if (findings.length) {
        lines.push(`### Phát hiện`, ``);
        for (const f of findings) {
            lines.push(`- **Bước ${f.step}** (${f.kind}): ${f.detail}`);
            if (f.candidates?.length) lines.push(`  - Ứng viên đã xét: ${f.candidates.join(", ")}`);
        }
        lines.push(``);
    } else {
        lines.push(`*Không có phát hiện nào — luồng đi trọn.*`, ``);
    }

    return lines.join("\n");
}
