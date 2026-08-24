// agents/qa-automation/index.js
// Node: QA Automation — explores the real UI once, then freezes static Playwright specs.
// MCP Playwright is used ONLY here, at authoring time, never at spec run-time
// (knowledge/generate-once-run-many.md).
//
// COST MODEL — read knowledge/mcp-cost-optimization.md before changing anything here.
// The previous version cost N×(M+2)+1 LLM calls for N test cases of M steps, and sent a
// FULL page snapshot plus all 60+ MCP tool descriptions on most of them — all describing
// the same page. Three layers now stand between the page and the LLM:
//   1. MCP already has it   -> browser_find / browser_generate_locator /
//                              browser_snapshot({filename,depth}) / browser_verify_*
//   2. MCP does not         -> tools/snapshot-parser.js, ui-element-registry.js,
//                              step-planner.js, testcase-exporter.js  (deterministic)
//   3. neither can          -> the LLM, on what is genuinely judgement

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM } from "../runtime/llm.js";
import { runAgentLoop } from "../runtime/agent-loop.js";
import { contextFor, getConfig, putConfig } from "../runtime/knowledge.js";
import { registerArtifact } from "../qa-leader/tools/impact-analysis.js";
import { artifactId, getArtifact, upsertArtifact } from "../runtime/db.js";
import { connectPlaywrightMCP } from "../runtime/mcp-client.js";
import { verifyAllSpecs, verifySpec, hasEphemeralRefSelector } from "./tools/spec-assertion-check.js";
import {
    parseSnapshot, snapshotTextFrom, filterByKeywords, keywordsFrom,
    toPromptLines, structureFingerprint, interactiveNodes,
} from "./tools/snapshot-parser.js";
import {
    loadRegistry, saveRegistry, putElement, getElement, isStale, stamp,
    cleanLocator, resolvedElements, REGISTRY_PATH,
} from "./tools/ui-element-registry.js";
import { planSteps, WHITELIST } from "./tools/step-planner.js";
import { exportTestCases, buildDataset, DATA_PATH } from "./tools/testcase-exporter.js";
import { walkFlow, renderWalk, unreachedSteps, retryUnreached } from "./tools/flow-walker.js";
import { parseUiFlows, pickFlow } from "../qa-leader/tools/ui-flow-parser.js";
import { emitPageObject } from "./tools/page-object-emitter.js";
import { emitSteps, stepCatalogue } from "./tools/step-emitter.js";
import { parseFeature, emitSpec, renderFeature } from "./tools/gherkin-codegen.js";
import * as P from "../runtime/paths.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const GEN_ONCE = await readFile(new URL("./knowledge/generate-once-run-many.md", import.meta.url), "utf8");
const ORACLE = await readFile(new URL("./knowledge/oracle-problem.md", import.meta.url), "utf8");
const CONVENTIONS = await readFile(new URL("./knowledge/playwright-conventions.md", import.meta.url), "utf8");
const COST = await readFile(new URL("./knowledge/mcp-cost-optimization.md", import.meta.url), "utf8");
const DOMAIN = await readFile(new URL("../../memory/project/domain-facts.md", import.meta.url), "utf8");
const KNOWN_ISSUES = await readFile(new URL("../../memory/project/known-issues.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

const SNAPSHOT_FILE = P.SNAPSHOT_LATEST;
const UI_FLOW_DOC = P.UI_FLOW_DOC;
const FINDINGS_FILE = P.EXPLORATORY_FINDINGS;
const UI_CONVENTIONS_FILE = P.UI_CONVENTIONS;
const DELIVERABLE_FILE = P.DELIVERABLE_AUTOMATION;

// ── Reusable test code (committed, human-reviewed — see memory/README.md) ──────
const PAGE_CLASS = "AppPage";
const PAGE_OBJECT_FILE = `${P.PAGES_DIR}/app.page.ts`;
/** One step library per flow, so two flows cannot collide in one file. */
const stepsFileFor = (flow) => `${P.STEPS_DIR}/${slugForFile(flow?.name)}.steps.ts`;

/** Import paths are RELATIVE and depend on where each file sits, so they are derived here
 *  rather than hardcoded in the emitters — the emitters must not need to know the layout. */
const STEPS_TO_PAGES_IMPORT = "../pages/app.page";                       // tests/steps/ -> tests/pages/
const SPEC_TO_STEPS_IMPORT = (flow) => `../../tests/steps/${slugForFile(flow?.name)}.steps`;  // .qa-run/tests/ -> tests/steps/
const SPEC_TO_DATA_IMPORT = "./data/test-cases.json";                    // .qa-run/tests/ -> .qa-run/tests/data/

/** Flow name -> a safe, ASCII filename component. */
function slugForFile(name) {
    const s = String(name ?? "flow")
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "flow";
}

// Counters, printed at the end. The point of this node's redesign is cost, so the cost
// has to be visible rather than asserted.
const stats = { llmCalls: 0, mcpCalls: 0, stepsByRule: 0, stepsByLLM: 0, specsSkipped: 0, specsAuthored: 0 };

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

// Tier 2 is QUERIED, not injected — see memory/README.md and knowledge.js.
const systemFor = (skillText, userText) =>
    [ROLE, FACT, GEN_ONCE, ORACLE, CONVENTIONS, COST, DOMAIN, KNOWN_ISSUES, contextFor(userText), skillText]
        .filter(Boolean).join("\n\n");

async function askLLM(skillText, userText) {
    stats.llmCalls++;
    const res = await callLLM({ system: systemFor(skillText, userText), contents: [{ role: "user", parts: [{ text: userText }] }] });
    return res.text;
}

function parseJSON(raw) {
    const cleaned = String(raw ?? "").replace(/^```[\w]*\n?/m, "").replace(/```\s*$/m, "").trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

async function mcp(client, name, args = {}) {
    stats.mcpCalls++;
    return client.callTool({ name, arguments: args });
}

/**
 * Capture a snapshot. The MCP RESPONSE is the source of truth; the file is only a copy
 * kept on disk for debugging.
 *
 * LỖI THẬT ĐÃ XẢY RA (2026-08-24) — luồng dừng ở bước 3. Bản cũ gọi
 * `browser_snapshot({ filename })` rồi ĐỌC LẠI FILE. Khi MCP không ghi file (hoặc ghi chậm,
 * hoặc tham số `filename` không được hỗ trợ), `read_file` vẫn thành công — nó đọc file CỦA
 * BƯỚC TRƯỚC còn nằm trên đĩa. Không có lỗi nào được báo. Kết quả: bước 1 click "Thêm vào
 * giỏ" OK, bước 2 click "Thanh toán" OK, bước 3 cần ô "Mã giảm giá" thì snapshot đưa vào
 * matcher VẪN LÀ TRANG CHỦ — nên matcher (đúng luật "không đoán bừa") trả `found: false` và
 * cả luồng dừng. Một cache cũ đội lốt trạng thái hiện tại.
 *
 * Đọc từ response KHÔNG làm tăng token: đây là lời gọi MCP ở tầng CODE, snapshot chỉ vào
 * prompt qua phần đã lọc mà hàm này trả về (xem `filterByKeywords`).
 */
async function captureSnapshot(client) {
    let text = "";
    try {
        // Gọi KHÔNG có `filename`: có `filename` thì một số bản MCP trả về câu "đã lưu vào
        // ..." thay vì chính cây a11y, và mình cần cây a11y trong response.
        const res = await mcp(client, "browser_snapshot", {});
        text = snapshotTextFrom(res).trim();
    } catch (err) {
        console.error(`  [snapshot] browser_snapshot lỗi: ${err.message}`);
    }

    if (text) {
        // Ghi đè bản trên đĩa NGAY, để file luôn là snapshot mới nhất chứ không phải bẫy
        // cho lần đọc sau.
        const w = await runTool("write_file", { path: SNAPSHOT_FILE, content: text });
        if (w.error) console.warn(`  [snapshot] không ghi được ${SNAPSHOT_FILE}: ${w.error}`);
    } else {
        console.warn(`  [snapshot] MCP không trả về cây a11y — KHÔNG dùng file cũ trên đĩa làm thay (file cũ là trạng thái của bước trước).`);
    }

    const parsed = parseSnapshot(text);
    if (parsed.unparsed.length) {
        console.warn(`  [snapshot] ${parsed.unparsed.length} dòng không parse được — kiểm tra lại format a11y tree (snapshot-parser.js).`);
    }
    return { text, ...parsed };
}

/**
 * Resolve one element description to a durable Playwright locator.
 * Registry first (free), then browser_find (cheap — its own docs say it beats a full
 * snapshot when you only need one element and its ref), then browser_generate_locator so
 * PLAYWRIGHT writes the locator instead of the LLM guessing it from the tree.
 */
function synthesizeLocator(role, name) {
    if (!name) return null;
    const escaped = name.replace(/'/g, "\\'");
    if (role === "button") return `page.getByRole('button', { name: '${escaped}' })`;
    if (role === "textbox") return `page.getByRole('textbox', { name: '${escaped}' })`;
    if (role === "heading") return `page.getByRole('heading', { name: '${escaped}' })`;
    if (role === "link") return `page.getByRole('link', { name: '${escaped}' })`;
    if (role) return `page.getByRole('${role}', { name: '${escaped}' })`;
    return `page.getByText('${escaped}')`;
}

async function resolveElement(client, registry, { role, name, ref: freshRef = null }) {
    if (!name) return null;
    const cached = getElement(registry, role, name) ?? (
        role ? null : resolvedElements(registry).find(e => e.name === name)
    );
    if (cached?.locator) {
        if (freshRef) cached.ref = freshRef;
        return { ...cached, ref: freshRef ?? cached.ref, from: "registry" };
    }

    let ref = freshRef;
    let foundRole = role ?? null;
    if (!ref) {
        try {
            const found = await mcp(client, "browser_find", { text: name });
            const nodes = parseSnapshot(snapshotTextFrom(found)).nodes;
            const targetNorm = name.trim().toLowerCase();
            const hit = nodes.find(n => n.ref && (!role || n.role === role) && (
                (n.name && n.name.trim().toLowerCase() === targetNorm) ||
                (n.text && n.text.trim().toLowerCase() === targetNorm)
            )) ?? nodes.find(n => n.ref && (!role || n.role === role) && (
                (n.name && n.name.toLowerCase().includes(targetNorm)) ||
                (n.text && n.text.toLowerCase().includes(targetNorm))
            )) ?? nodes.find(n => n.ref && (
                (n.name && n.name.toLowerCase().includes(targetNorm)) ||
                (n.text && n.text.toLowerCase().includes(targetNorm))
            ));
            if (hit) {
                ref = hit.ref;
                foundRole = hit.role ?? foundRole;
            }
        } catch (err) {
            console.error(`  [find] "${name}": ${err.message}`);
        }
    }
    if (!ref) {
        // Even if ref not found yet, produce synthetic locator as baseline if name exists
        const fallbackLoc = synthesizeLocator(foundRole, name);
        const stored = putElement(registry, { role: foundRole, name, locator: fallbackLoc, ref: null, source: "synthetic" });
        return fallbackLoc ? { ...stored, from: "synthetic" } : null;
    }

    let locator = null;
    let source = "browser_generate_locator";
    try {
        const gen = await mcp(client, "browser_generate_locator", { target: ref, element: name });
        // `cleanLocator` chứ không phải `.trim()`: MCP bọc locator trong markdown
        // ("### Result\ngetByRole(...)"), và chuỗi thô đó bị registry loại sạch.
        locator = cleanLocator(snapshotTextFrom(gen));
        if (!locator) {
            locator = synthesizeLocator(foundRole, name);
            source = "synthetic";
            console.warn(`  [locator] "${name}": MCP không trả về locator dùng được — dùng locator suy từ role+name.`);
        }
    } catch (err) {
        // Fallback: build standard Playwright locator from role and name
        locator = synthesizeLocator(foundRole, name);
        source = "synthetic";
    }

    const stored = putElement(registry, { role: foundRole, name, locator, ref, source });
    return stored.locator ? { ...stored, from: source === "synthetic" ? "synthetic" : "mcp" } : null;
}

/**
 * Take the whole application journey once, so the registry learns EVERY screen.
 *
 * This is the fix for the defect that made the entire first real run worthless: after
 * stripping transient `ref=` ids, all 57 MCP snapshots from that run were ONE distinct page.
 * The browser never left the entry screen, so the registry only ever held landing-page
 * elements, so `known_locators` was empty for the cart screen, so the spec generator
 * (correctly, per its own rule) commented out every action as
 * `// TODO: locator chưa xác định`. Twenty-one specs that navigated to the homepage and
 * asserted something that could not be there.
 *
 * The division of labour, which is the whole point:
 *   `UI-flow.md`  says WHAT to do, in business language     (project data, human-written)
 *   MCP snapshot  says what is on screen right now          (the a11y yaml)
 *   the AI        says which node in that yaml the step is  (skill 04, one call per step)
 *   Playwright    writes the locator                        (browser_generate_locator)
 * No part of that chain guesses on another's behalf.
 */
async function walkTheFlow({ client, registry, flow }) {
    const matcherSkill = await loadSkill("04_flow_step_matcher.md");

    // Every snapshot taken during the walk harvests its screen into the registry. That is
    // how one walk yields locators for all screens rather than just the first.
    const snapshot = async () => {
        const snap = await captureSnapshot(client);
        for (const node of interactiveNodes(snap.nodes)) {
            if (!node.name) continue;
            if (getElement(registry, node.role, node.name)?.locator) continue;
            await resolveElement(client, registry, { role: node.role, name: node.name });
        }
        return snap;
    };

    const wiring = {
        flow,
        mcp: (name, args) => mcp(client, name, args),
        snapshot,
        resolve: (desc) => resolveElement(client, registry, desc),
        ask: async ({ step, kind, hints, candidates }) => parseJSON(await askLLM(matcherSkill,
            `step=${step}\nkind=${kind}\nhints=${JSON.stringify(hints)}\n` +
            `candidates=\n${candidates.map(c =>
                `- ${c.role} ${c.name ? `"${c.name}"` : ""}${c.text ? ` text=${JSON.stringify(c.text)}` : ""}` +
                `${c.ref ? ` ref=${c.ref}` : ""}${c.disabled ? " disabled=true" : ""}`).join("\n")}`)),
        log: (m) => console.log(m),
    };

    let out = await walkFlow(wiring);

    // P3.4. One retry when the walk was blocked part-way. Worth exactly one attempt because
    // the common cause is transient (a slow render, a state the previous step left behind),
    // and the alternative is that every later screen stays unknown — which means no step
    // functions for those steps and therefore no specs for the test cases that need them.
    // retryUnreached() itself stops if it gets no further, so this cannot loop.
    if (out.stoppedAt !== null) {
        const retry = await retryUnreached({ ...wiring, previous: out });
        if ((retry.progressed ?? 0) > 0) out = retry;
    }

    await saveRegistry(registry);
    return out;
}

/**
 * Walk the test case's real steps so the page is in the right state before authoring.
 * Rule-planned steps cost no LLM call; only steps no rule recognises fall through to the
 * step-navigator skill, and that prompt gets the FILTERED node list plus an 8-tool
 * whitelist rather than the whole page and all 60+ tools.
 */
async function executeSteps(testCase, client, registry) {
    const stepSkill = await loadSkill("00_step_navigator.md");
    const steps = testCase.steps ?? [];
    const groups = planSteps(steps);

    for (const group of groups) {
        // Several consecutive "type" steps -> ONE browser_fill_form call.
        if (group.kind === "form") {
            const fields = [];
            for (const plan of group.plans) {
                const el = await resolveElement(client, registry, { name: plan.target });
                if (!el?.ref) continue;
                fields.push({ ref: el.ref, value: plan.value, name: plan.target });
            }
            if (fields.length) {
                stats.stepsByRule += group.plans.length;
                try {
                    await mcp(client, "browser_fill_form", { fields });
                } catch (err) {
                    console.error(`  [${testCase.tcId}] fill_form lỗi: ${err.message}`);
                }
                continue;
            }
        }

        const plan = group.plan ?? null;

        if (plan && plan.action === "expectation") {
            stats.stepsByRule++;
            continue; // mô tả kỳ vọng, không phải hành động
        }

        if (plan?.tool) {
            stats.stepsByRule++;
            const args = { ...plan.args };
            if (plan.target && plan.tool !== "browser_navigate") {
                const el = await resolveElement(client, registry, { name: plan.target });
                if (!el?.ref) {
                    console.error(`  [${testCase.tcId}] không tìm được phần tử "${plan.target}" cho bước: ${group.steps[0]}`);
                    continue;
                }
                args.ref = el.ref;
                args.element = plan.target;
            }
            if (plan.tool === "browser_navigate" && !args.url) args.url = getConfig("base_url", null);
            try {
                await mcp(client, plan.tool, args);
            } catch (err) {
                console.error(`  [${testCase.tcId}] bước lỗi "${group.steps[0]}": ${err.message}`);
            }
            continue;
        }

        // Tier 3: no rule matched — the LLM decides, but as a LOOP, not a single shot.
        //
        // P1.4b. What this was: one prompt, one JSON `{tool, args}` back, one MCP call, move
        // on. The model never saw what its action did, so a step that failed — or that
        // landed somewhere unexpected — carried on silently and every later step was decided
        // against a page state nobody had looked at. That is the same blindness that let the
        // whole first real run explore the homepage 57 times without noticing.
        //
        // Now: act, RE-SNAPSHOT, and let it decide again against the page as it actually is,
        // with a small budget. `done: true` is how the model says the step is finished, so a
        // step needing two actions (open a dropdown, then pick an option) is expressible
        // instead of being cut off after the first.
        stats.stepsByLLM++;
        const MAX_TRIES = 3;
        let history = "";

        for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
            const snap = await captureSnapshot(client);
            const candidates = filterByKeywords(snap.nodes, keywordsFrom(group.steps[0]));

            const decisionRaw = await askLLM(stepSkill,
                `step=${group.steps[0]}\n` +
                `attempt=${attempt}/${MAX_TRIES}\n` +
                (history ? `da_lam_roi=\n${history}\n` : "") +
                `page_elements=\n${toPromptLines(candidates)}\n` +
                `available_tools=${JSON.stringify(WHITELIST)}\n` +
                `Trả về {"tool":..., "args":{...}, "done": false} nếu còn cần hành động nữa cho bước này,\n` +
                `hoặc {"done": true, "tool": null} khi bước đã hoàn tất/không cần hành động. Luôn có "reason".`);

            const decision = parseJSON(decisionRaw);
            if (!decision) { console.error(`  [${testCase.tcId}] không parse được quyết định — dừng bước này.`); break; }
            if (decision.done || !decision.tool) {
                if (decision.reason) console.warn(`  [${testCase.tcId}] bước "${group.steps[0]}": ${decision.reason}`);
                break;
            }
            if (!WHITELIST.includes(decision.tool)) {
                console.error(`  [${testCase.tcId}] LLM chọn tool ngoài whitelist (${decision.tool}) — bỏ qua.`);
                break;
            }

            let outcome;
            try {
                await mcp(client, decision.tool, decision.args || {});
                outcome = "ok";
            } catch (err) {
                outcome = `LỖI: ${err.message}`;
                console.error(`  [${testCase.tcId}] bước lỗi "${group.steps[0]}": ${err.message}`);
            }
            // Feeding the outcome back is the entire point: without this line the next
            // attempt would repeat the same call against a page it has not re-read.
            history += `- lần ${attempt}: ${decision.tool}(${JSON.stringify(decision.args ?? {})}) -> ${outcome}\n`;

            if (attempt === MAX_TRIES) {
                console.warn(`  [${testCase.tcId}] hết ${MAX_TRIES} lượt cho bước "${group.steps[0]}" — đi tiếp, KHÔNG coi là xong.`);
            }
        }
    }
}

/**
 * Exploratory check: does the Expected Result actually hold on the real UI?
 *
 * This is the part that makes this an EXPLORATORY step rather than plain code
 * generation. Playwright's own browser_verify_* tools do the checking. A mismatch is a
 * FINDING (spec says one thing, the UI does another) — recorded, not silently coded
 * around.
 *
 * It does NOT replace the real run: pass/fail still comes only from expect() when the
 * test runner executes the spec (knowledge/oracle-problem.md).
 */
async function exploreExpectation(client, testCase) {
    const expected = String(testCase.expected ?? "").trim();
    if (!expected) return null;

    // Values worth verifying on screen: quoted strings and money/number-looking tokens.
    const targets = [
        ...new Set([
            ...(expected.match(/["'“”']([^"'“”']{2,})["'“”']/g) ?? []).map(s => s.replace(/["'“”']/g, "")),
            ...(expected.match(/\d[\d.,]{2,}/g) ?? []),
        ]),
    ].slice(0, 4);
    if (!targets.length) return null;

    const checks = [];
    for (const text of targets) {
        try {
            await mcp(client, "browser_verify_text_visible", { text });
            checks.push({ text, visible: true });
        } catch (err) {
            checks.push({ text, visible: false, error: err.message });
        }
    }

    const missing = checks.filter(c => !c.visible);
    return missing.length ? { tcId: testCase.tcId, expected, checks, missing } : null;
}

/**
 * Emit the reusable test code from what the walk learned: Page Object, then step library,
 * then the bounded step catalogue the Gherkin writer is allowed to use.
 *
 * All three are DETERMINISTIC. This is the chain that takes selector-invention away from
 * the LLM entirely:
 *   registry.locator ← browser_generate_locator ← Playwright
 *        → tests/pages/*.page.ts   (accessor, no hand-written selector)
 *        → tests/steps/*.steps.ts  (business step → accessor → action)
 *        → catalogue               (the only step phrasings Gherkin may use)
 */
async function emitReusableCode({ flow, walk, registry }) {
    const po = emitPageObject({
        registry,
        className: PAGE_CLASS,
        baseUrl: flow?.entry ?? null,
    });
    await runTool("write_file", { path: PAGE_OBJECT_FILE, content: po.content });
    for (const s of po.skipped) {
        console.warn(`  [page-object] bỏ qua ${s.role} "${s.name}": ${s.why}`);
    }

    const se = emitSteps({
        flow,
        visited: walk?.visited ?? [],
        exported: po.exported,
        pageClass: PAGE_CLASS,
        pageImport: STEPS_TO_PAGES_IMPORT,
    });
    await runTool("write_file", { path: stepsFileFor(flow), content: se.content });

    const catalogue = stepCatalogue(se);
    console.log(`  Sinh code dùng lại: ${po.exported.length} accessor → ${PAGE_OBJECT_FILE}; ` +
        `${catalogue.available.length} step → ${stepsFileFor(flow)}` +
        (catalogue.missing.length ? `; ${catalogue.missing.length} bước CHƯA có step` : ""));
    for (const m of catalogue.missing) console.warn(`  [step] chưa có: "${m.text}" — ${m.why}`);

    return { pageObject: po, steps: se, catalogue };
}

/**
 * Author the spec for ONE test case — via a `.feature`, not by asking for a whole file.
 *
 * The LLM's contribution is now a list of steps drawn from `catalogue`; the spec itself is
 * compiled deterministically. Replaces the old path where the LLM wrote the entire
 * `.spec.ts`, which is where every invented selector came from:
 *   - `page.click('button[ref="f15e27"]')` — a transient MCP snapshot handle, never a real
 *     attribute, so the test just timed out for 30 seconds;
 *   - 13 of 21 generated files had ZERO actions, every step commented out as
 *     `// TODO: locator chưa xác định`.
 *
 * `content: null` from emitSpec means a Gherkin step matched nothing in the catalogue. No
 * spec is written in that case — a spec silently missing its middle still reports green.
 */
/**
 * Compile the LLM's `.feature` in memory, exactly as the real emitter will.
 *
 * Used BOTH as the loop's gate and for the final compile, so what the gate accepted and what
 * gets written are produced by the same code — a gate that checks something subtly different
 * from what ships is worse than no gate.
 */
function compileFeature(parsed, { flow, catalogue, testCase }) {
    if (!parsed) return { issues: [`Không parse được JSON. Trả về ĐÚNG một object JSON, không kèm giải thích.`] };
    if (!parsed.steps?.length) return { issues: [`Trường "steps" rỗng — scenario phải có ít nhất một step.`] };

    // Round-trip through the .feature TEXT on purpose: that file is the artefact a human
    // reviews and the flow's source of truth, so the spec must be compiled from exactly what
    // goes to disk — not from a JSON object that only ever existed in memory.
    const featureText = renderFeature({
        feature: parsed.feature ?? flow?.name ?? "Feature",
        scenarios: [{
            name: parsed.scenario ?? testCase.title ?? testCase.tcId,
            tags: parsed.tags?.length ? parsed.tags : [`@${testCase.tcId}`],
            steps: (parsed.steps ?? []).map(s => ({
                keyword: s.keyword ?? "And",
                raw: s.arg ? `${s.text} "${s.arg}"` : s.text,
            })),
        }],
    });

    const { scenarios, problems } = parseFeature(featureText);
    if (!scenarios.length) return { featureText, issues: [`.feature không có Scenario nào.`, ...problems] };

    const out = emitSpec({
        scenario: scenarios[0],
        catalogue,
        testCase,
        stepsImport: SPEC_TO_STEPS_IMPORT(flow),
        dataImport: SPEC_TO_DATA_IMPORT,
    });

    // A step outside the catalogue is the ONE failure worth spending a revision on: the
    // vocabulary is bounded and printed in the prompt, so "not in the catalogue" is always
    // fixable by rewording — unlike a missing Expected Result, which needs a human.
    const issues = out.unmatched.map(u =>
        `Step ${u.step} — ${u.why}. Chỉ được dùng ĐÚNG các câu trong step_catalogue; ` +
        `viết lại bằng câu gần nhất trong đó, hoặc bỏ step này nếu luồng không đi được tới đó.`);

    return { featureText, scenario: scenarios[0], out, problems, issues };
}

/**
 * Author the spec for ONE test case via a `.feature`.
 *
 * AGENT, not a single prompt (P11). Before this, a step the model worded slightly differently
 * from the catalogue produced `specContent: null` and NO spec at all — a hard stop the model
 * was never told about, for a mistake it could have fixed in one turn given the catalogue it
 * already had in its prompt. The gate now hands the mismatch back and asks for a rewrite.
 */
async function authorSpecViaFeature(testCase, { flow, catalogue }) {
    const skill = await loadSkill("05_gherkin_writer.md");
    const userText =
        `test_case=${JSON.stringify(testCase)}\n` +
        `flow_name=${flow?.name ?? "(không tên)"}\n` +
        `step_catalogue=\n${catalogue.available.map(s =>
            `- ${s.name} | "${s.text}" | kind=${s.kind} | needsValue=${s.needsValue}`).join("\n") || "(rỗng)"}\n` +
        `missing_steps=\n${catalogue.missing.map(m => `- "${m.text}" (${m.why})`).join("\n") || "(không có)"}`;

    const res = await runAgentLoop({
        system: systemFor(skill, userText),
        task: userText,
        label: `gherkin:${testCase.tcId}`,
        maxRevisions: 2,
        selfCheck: (text) => {
            const { issues } = compileFeature(parseJSON(text), { flow, catalogue, testCase });
            return { ok: issues.length === 0, issues };
        },
    });
    stats.llmCalls += res.usage.llmCalls;

    const parsed = parseJSON(res.text);
    const compiled = compileFeature(parsed, { flow, catalogue, testCase });
    const newSteps = parsed?.new_steps ?? [];

    if (!compiled.featureText) {
        return { specContent: null, why: compiled.issues.join(" "), newSteps };
    }

    // The .feature is written even when it does not compile: it is the evidence of WHAT the
    // model asked for, and the fastest way for a human to see which step is missing from the
    // library. A silent absence would leave nothing to look at.
    const featurePath = `${P.FEATURES_DIR}/${testCase.tcId}.feature`;
    await runTool("write_file", { path: featurePath, content: compiled.featureText });
    for (const p of compiled.problems ?? []) console.warn(`  [${testCase.tcId}] .feature: ${p}`);

    if (!compiled.out) {
        return { specContent: null, featurePath, why: compiled.issues.join(" "), newSteps };
    }
    if (compiled.out.unmatched.length) {
        console.warn(`  [${testCase.tcId}] vẫn còn step ngoài catalogue sau ${res.revisions} lần sửa — KHÔNG sinh spec.`);
    }

    return {
        specContent: compiled.out.content,
        featurePath,
        unmatched: compiled.out.unmatched,
        assertionNote: compiled.out.assertionNote,
        newSteps,
        why: compiled.out.content ? null : `có step không khớp catalogue: ${compiled.out.unmatched.map(u => u.step).join("; ")}`,
    };
}

/** Author (or re-author) the spec for ONE test case — LEGACY path, LLM writes the whole file.
 *  Kept only for the case where there is no usable catalogue (no flow document, or the walk
 *  reached nothing): then there are no step functions to call and a .feature would compile to
 *  nothing. Its weaknesses are the reason authorSpecViaFeature exists.
 *  `correction`, when set, is appended after a first attempt failed
 *  spec-assertion-check.js's deterministic gate — e.g. it wrote a `ref=` selector. */
async function authorSpecFor(testCase, client, registry, { correction } = {}) {
    await executeSteps(testCase, client, registry);

    const snap = await captureSnapshot(client);
    const fingerprint = structureFingerprint(snap.nodes);

    // Make sure every element the test case names has a durable locator before the spec
    // is generated. This is what the LLM used to be asked to invent from the raw tree.
    const wanted = keywordsFrom(`${testCase.steps.join(" ")} ${testCase.expected ?? ""}`);
    const candidates = filterByKeywords(snap.nodes, wanted);
    for (const node of interactiveNodes(candidates)) {
        if (!node.name) continue;
        if (getElement(registry, node.role, node.name)?.locator) continue;
        await resolveElement(client, registry, { role: node.role, name: node.name });
    }

    const finding = await exploreExpectation(client, testCase);

    // Tier 3 — the one genuinely judgement-y call: which of the resolved elements maps to
    // which step, and how Expected Result becomes an assertion.
    // `resolvedElements` chứ không phải filter truthy: nó bóc vỏ markdown của MCP, nên chuỗi
    // đi vào prompt là locator thật. Trước đây một registry cũ có thể đưa "### Result\n..."
    // vào `known_locators` và LLM sẽ copy nguyên văn vào file spec.
    const knownLocators = resolvedElements(registry)
        .map(e => `- ${e.role} "${e.name}" -> ${e.locator}`)
        .join("\n");

    const rawSpec = await askLLM(await loadSkill("02_spec_generator.md"),
        `test_case=${JSON.stringify(testCase)}\n` +
        `known_locators=\n${knownLocators}\n` +
        `page_elements=\n${toPromptLines(candidates, { limit: 25 })}\n` +
        `data_file=${DATA_PATH}\n` +
        (finding ? `exploratory_finding=${JSON.stringify(finding)}\n` : "") +
        (correction ? `\nLẦN TRƯỚC BẠN VIẾT SPEC SAI: ${correction}\nSửa lại: phần tử không có trong known_locators -> ghi TODO và bỏ hành động đó, KHÔNG được tự chế selector từ ref/số trong page_elements.\n` : ""));

    const match = rawSpec.match(/```(?:ts|typescript|javascript|js)?\s*([\s\S]*?)```/i);
    const specContent = match ? match[1].trim() + "\n" : rawSpec.trim() + "\n";

    return { specContent, fingerprint, finding, snapshotNodes: snap.nodes.length };
}

/**
 * Decide whether a test case needs (re-)authoring. "Có code rồi + không đổi -> không làm
 * lại" from the requirements: skip when the spec file exists AND the test case content is
 * unchanged AND the recorded artifact is not marked stale by impact analysis.
 */
async function needsAuthoring(testCase, specPath) {
    const exists = await runTool("file_exists", { path: specPath });
    if (!exists.exists) return { needed: true, why: "chưa có spec" };

    const art = getArtifact("spec", specPath);
    if (!art) return { needed: true, why: "spec chưa được ghi vào graph truy vết" };
    if (art.status === "stale") return { needed: true, why: "impact analysis đánh dấu stale" };

    const tcHash = testCaseHash(testCase);
    if (art.hash !== tcHash) return { needed: true, why: "nội dung test case đã đổi" };

    return { needed: false, why: "spec đã có và không có gì đổi" };
}

/** Content hash of a test case — cheap, deterministic, no crypto import needed here. */
function testCaseHash(testCase) {
    const s = JSON.stringify([testCase.tcId, testCase.steps, testCase.data, testCase.expected, testCase.priority]);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `tc${(h >>> 0).toString(16)}`;
}

function assembleDeliverable({ authored, skipped, check, findings, cost }) {
    const manifest = [
        ...authored.map(a => `- ${a.tcId}: \`tests/${a.tcId}.spec.ts\` — sinh lại (${a.why})`),
        ...skipped.map(s => `- ${s.tcId}: \`tests/${s.tcId}.spec.ts\` — **bỏ qua** (${s.why})`),
    ].join("\n") || "*(không có test case nào)*";

    const checkSection = check.ok
        ? `Đạt — tất cả ${check.results.length} spec đều có assertion hợp lệ.`
        : `**CHƯA ĐẠT** — ${check.issues.join(" ")}`;

    const findingSection = findings.length
        ? findings.map(f => `- **${f.tcId}**: Expected Result nhắc tới ${f.missing.map(m => `\`${m.text}\``).join(", ")} nhưng KHÔNG thấy trên UI thật.`).join("\n")
        : "*Không phát hiện lệch nào giữa Expected Result và UI thật.*";

    return (
        `# Deliverable — QA Automation\n\n` +
        `## 1. Spec Manifest\n${manifest}\n\n` +
        `## 2. Self Count Check (deterministic, tool spec-assertion-check.js)\n${checkSection}\n\n` +
        `## 3. Phát hiện Exploratory (UI thật vs Expected Result)\n${findingSection}\n\n` +
        `Chi tiết: \`${FINDINGS_FILE}\`\n\n` +
        `## 4. Chi phí lần chạy này\n` +
        `| Chỉ số | Số lần |\n|---|---|\n` +
        `| Gọi LLM | ${cost.llmCalls} |\n` +
        `| Gọi MCP | ${cost.mcpCalls} |\n` +
        `| Bước xử lý bằng rule (0 token) | ${cost.stepsByRule} |\n` +
        `| Bước phải nhờ LLM | ${cost.stepsByLLM} |\n` +
        `| Spec sinh lại | ${cost.specsAuthored} |\n` +
        `| Spec bỏ qua vì không đổi | ${cost.specsSkipped} |\n`
    );
}

function renderFindings(findings, stampIso, walk = null, flow = null) {
    const lines = [
        `# Exploratory Findings`,
        ``,
        `*Sinh lúc ${stampIso}.*`,
        ``,
        `> Đây **không phải** kết luận pass/fail. Verdict pass/fail chỉ đến từ \`expect()\` khi test runner`,
        `> chạy spec thật (\`knowledge/oracle-problem.md\`). Mục này nói: agent thấy gì khi đi trên UI thật.`,
        ``,
    ];

    // The walk goes FIRST. It is the report that explains everything else: if the journey
    // stopped at step 2, then every "missing element" below is a consequence of that, not an
    // independent problem — and reading them in the other order sends you chasing symptoms.
    if (walk) {
        lines.push(renderWalk({ flow, ...walk }));
    } else {
        lines.push(
            `## Đi luồng`, ``,
            `**KHÔNG đi được luồng nào** trong lần chạy này — không có tài liệu luồng dùng được.`,
            `Nghĩa là chỉ trang entry được explore, nên phần tử của các màn hình sau KHÔNG có trong`,
            `registry, và spec cho những bước đó sẽ không có locator để dùng.`, ``,
        );
    }

    lines.push(`---`, ``, `## Lệch giữa Expected Result và UI thật`, ``);
    if (!findings.length) {
        lines.push(`*Không phát hiện lệch nào trong lần explore này.*`, ``);
    } else {
        for (const f of findings) {
            lines.push(`### ${f.tcId}`, ``, `**Expected Result**: ${f.expected}`, ``, `| Giá trị kỳ vọng | Thấy trên UI? |`, `|---|---|`);
            for (const c of f.checks) lines.push(`| \`${c.text}\` | ${c.visible ? "có" : "**KHÔNG**"} |`);
            lines.push(``);
        }
    }
    return lines.join("\n");
}

// Handover contract — see memory/README.md rule 3.
export const CONTRACT = {
    agent: "qa-automation",
    requires: [P.DELIVERABLE_TEST_DESIGNER],
    produces: [DELIVERABLE_FILE, UI_CONVENTIONS_FILE, DATA_PATH],
    inputs: { testCaseFile: "DELIVERABLE_TEST_DESIGNER" },
};

export async function run({ testCaseFile }) {
    const deliverable = await runTool("read_file", { path: testCaseFile });
    if (deliverable.error) return { status: "error", data: null, error: `Không đọc được ${testCaseFile}: ${deliverable.error}` };

    // Data lives in its own file so changing test data does not require regenerating
    // (and re-exploring for) the specs.
    const exported = await exportTestCases(deliverable.content);
    if (exported.malformed.length) {
        console.error(`  [testcase] ${exported.malformed.length} hàng bảng sai số cột, KHÔNG được dùng: ` +
            exported.malformed.map(m => `${m.id ?? "?"}(hàng ${m.row} của bảng, ${m.cellCount}/${m.expected} cột)`).join(", "));
    }
    const testCases = exported.cases;
    if (!testCases.length) {
        return { status: "error", data: null, error: "Không parse được test case nào từ bảng 8 trường." };
    }

    // Which test cases actually need work — decided BEFORE opening a browser.
    const plan = [];
    for (const tc of testCases) {
        const specPath = P.specFor(tc.tcId);
        plan.push({ tc, specPath, ...(await needsAuthoring(tc, specPath)) });
    }
    const todo = plan.filter(p => p.needed);
    const skipped = plan.filter(p => !p.needed).map(p => ({ tcId: p.tc.tcId, why: p.why }));
    stats.specsSkipped = skipped.length;

    if (!todo.length) {
        // No MCP connection at all — the browser is never opened when there is nothing
        // to explore. This is the "0 LLM call, 0 MCP call" second run.
        console.log(`  Tất cả ${skipped.length} spec đã có và không có gì đổi — bỏ qua explore, không mở trình duyệt.`);
        const existing = [];
        for (const s of skipped) {
            const r = await runTool("read_file", { path: P.specFor(s.tcId) });
            if (!r.error) existing.push({ tcId: s.tcId, specContent: r.content });
        }
        const check = verifyAllSpecs(existing);
        await runTool("write_file", {
            path: DELIVERABLE_FILE,
            content: assembleDeliverable({ authored: [], skipped, check, findings: [], cost: stats }),
        });
        return {
            status: "success",
            data: { deliverableFile: DELIVERABLE_FILE, specDir: P.SPEC_DIR + "/", uiConventionsFile: UI_CONVENTIONS_FILE, dataFile: DATA_PATH, cost: stats },
            error: null,
        };
    }

    let baseUrl = getConfig("base_url", null);
    if (!baseUrl && process.env.BASE_URL) {
        baseUrl = process.env.BASE_URL;
        putConfig({ key: "base_url", value: baseUrl, description: "Set from process.env.BASE_URL" });
    }
    if (!baseUrl) {
        return {
            status: "error", data: null,
            error: [
                'Thiếu cấu hình "base_url" ở tầng 2 (memory/project/knowledge.db) hoặc biến môi trường BASE_URL trong .env.',
                "  Bước phân tích tài liệu (qa-leader) phải trích được URL môi trường test,",
                "  hoặc đặt qua BASE_URL trong .env, hoặc qua putConfig({ key: 'base_url', value: '<url>' }).",
            ].join("\n"),
        };
    }

    // The flow document is PROJECT DATA, read fresh each run. A missing or unusable one is
    // not fatal — the run degrades to "entry page only" and says so — because a project may
    // legitimately not have written it yet. It is never substituted for or guessed at.
    let flow = null;
    const flowDoc = await runTool("read_file", { path: UI_FLOW_DOC });
    if (flowDoc.error) {
        console.warn(`  [luồng] Không đọc được ${UI_FLOW_DOC}: ${flowDoc.error}`);
    } else {
        const parsed = parseUiFlows(flowDoc.content);
        for (const p of parsed.problems) console.warn(`  [luồng] ${p}`);
        flow = pickFlow(parsed.flows);
    }

    const client = await connectPlaywrightMCP({ headless: true });
    const registry = await loadRegistry();
    const authored = [];
    const findings = [];
    let walk = null;

    try {
        await mcp(client, "browser_navigate", { url: baseUrl });

        // Explore the landing state ONCE to seed the registry. Every test case afterwards
        // looks up the registry first and only calls MCP for elements it does not know —
        // this is what removes the "pay to describe the same page N times" cost.
        const seed = await captureSnapshot(client);
        const seedFingerprint = structureFingerprint(seed.nodes);
        if (isStale(registry, { url: baseUrl, fingerprint: seedFingerprint })) {
            console.log("  Registry rỗng hoặc cấu trúc trang đã đổi — explore lại từ đầu.");
            registry.elements = {};
        }
        for (const node of interactiveNodes(seed.nodes)) {
            if (node.name) await resolveElement(client, registry, { role: node.role, name: node.name });
        }
        stamp(registry, { url: baseUrl, fingerprint: seedFingerprint });
        await saveRegistry(registry);

        // ── Take the journey ONCE, before authoring any spec ─────────────
        // Without this, everything below only ever sees the landing page.
        if (flow) {
            console.log(`  Đi luồng "${flow.name}" (${flow.steps.length} bước) để nạp phần tử của MỌI màn hình…`);
            walk = await walkTheFlow({ client, registry, flow });
            const learned = resolvedElements(registry).length;
            console.log(`  Đi được ${walk.visited.length}/${flow.steps.length} bước, qua ${walk.screens} trạng thái trang; registry có ${learned} phần tử có locator.`);
            if (walk.stoppedAt !== null) {
                // Loud, because every spec for a later step will now be missing its locators
                // and the failure would otherwise look like a spec-generation problem.
                console.warn(
                    `  [luồng] DỪNG ở bước ${walk.stoppedAt} — các màn hình sau chưa được đi, nên spec ` +
                    `cho những bước đó sẽ KHÔNG có locator. Xem ${FINDINGS_FILE}.`
                );
            }
        } else {
            console.warn(
                `  [luồng] Không có tài liệu luồng dùng được → chỉ explore được trang entry. ` +
                `Spec cho các màn hình sau sẽ thiếu locator. Viết ${UI_FLOW_DOC} (xem P0 trong TODO).`
            );
        }

        // ── Emit the reusable code, then compile specs from it ───────────
        // This is the step that takes selector-invention away from the LLM. Without it the
        // node falls back to the legacy path (LLM writes the whole spec file) — which is
        // exactly what produced 13/21 specs with no actions, so the fallback says so loudly.
        let reusable = null;
        if (flow && walk) {
            reusable = await emitReusableCode({ flow, walk, registry });
            const unreached = unreachedSteps({ flow, visited: walk.visited });
            if (unreached.length) {
                console.warn(`  [luồng] ${unreached.length} bước chưa đi được → không có step function: ` +
                    unreached.map(s => `#${s.n}`).join(", "));
            }
        }
        const useFeaturePath = Boolean(reusable?.catalogue?.available?.length);
        if (!useFeaturePath) {
            console.warn(
                `  [spec] KHÔNG có step catalogue dùng được → quay về đường CŨ: LLM tự viết cả file spec.\n` +
                `         Đó là đường đã sinh ra 13/21 spec không thực hiện hành động nào. Nguyên nhân gốc\n` +
                `         thường là chưa đi được luồng — xem ${FINDINGS_FILE}.`
            );
        }

        for (const item of todo) {
            // Every test case starts from the same known state.
            await mcp(client, "browser_navigate", { url: baseUrl });

            let out;
            if (useFeaturePath) {
                const viaFeature = await authorSpecViaFeature(item.tc, { flow, catalogue: reusable.catalogue });
                for (const ns of viaFeature.newSteps ?? []) {
                    console.warn(`  [${item.tc.tcId}] cần step MỚI: "${ns.text}" — ${ns.why ?? ""}`);
                }
                if (viaFeature.specContent) {
                    out = { specContent: viaFeature.specContent, fingerprint: null, finding: null };
                } else {
                    // No spec at all, on purpose. Falling back to "LLM writes the file" here
                    // would hide the real problem (a step the flow cannot do) behind a spec
                    // full of commented-out actions that still reports green.
                    console.error(`  [${item.tc.tcId}] KHÔNG sinh spec: ${viaFeature.why}`);
                    upsertArtifact({ kind: "spec", ref: item.specPath, hash: testCaseHash(item.tc), status: "stale" });
                    skipped.push({ tcId: item.tc.tcId, why: `không sinh được spec — ${viaFeature.why}` });
                    continue;
                }
            } else {
                out = await authorSpecFor(item.tc, client, registry);
            }

            let check = verifySpec({ tcId: item.tc.tcId, specContent: out.specContent });

            // A spec that bakes in a transient MCP `ref=` as a selector will never match
            // anything real and just times out at run time — worth ONE retry with the
            // concrete violation quoted back, rather than writing it straight to disk.
            // Only meaningful on the LEGACY path. A spec compiled from a .feature cannot
            // contain a `ref=` selector at all — it contains no selectors, just step calls —
            // so retrying there would re-run the generator for a violation that is
            // structurally impossible, and `authorSpecFor` would drag the run back onto the
            // very path we just replaced.
            if (!useFeaturePath && !check.ok && hasEphemeralRefSelector(out.specContent)) {
                console.warn(`  [${item.tc.tcId}] spec dùng selector "ref=" — thử sinh lại 1 lần với phản hồi lỗi.`);
                out = await authorSpecFor(item.tc, client, registry, { correction: check.issues.join(" ") });
                check = verifySpec({ tcId: item.tc.tcId, specContent: out.specContent });
            }

            await runTool("write_file", { path: item.specPath, content: out.specContent });
            // Close the traceability chain: spec <- testcase (<- knowledge-file <- section
            // <- doc), and record the content hash so an unchanged test case can be skipped
            // next run.
            registerArtifact({ kind: "spec", ref: item.specPath, derivedFrom: [artifactId("testcase", item.tc.tcId)] });
            // Still broken after the retry -> marked "stale", NOT "fresh". A "fresh" spec
            // here would make needsAuthoring() skip it forever on later runs (same test
            // case content -> same hash -> "không có gì đổi"), permanently hiding a spec
            // that cannot pass its own self-check.
            upsertArtifact({ kind: "spec", ref: item.specPath, hash: testCaseHash(item.tc), status: check.ok ? "fresh" : "stale" });
            if (!check.ok) console.error(`  [${item.tc.tcId}] spec vẫn CHƯA ĐẠT self-check sau khi thử lại: ${check.issues.join(" ")}`);

            if (out.finding) findings.push(out.finding);
            authored.push({ tcId: item.tc.tcId, why: item.why, specContent: out.specContent, fingerprint: out.fingerprint });
        }
        stats.specsAuthored = authored.length;

        await saveRegistry(registry);

        // The oracle for qa-verifier: written from the registry (durable locators), not
        // from a pile of raw snapshots.
        const uiConventions = await askLLM(await loadSkill("03_ui_conventions_writer.md"),
            `base_url=${baseUrl}\n` +
            `page_fingerprint=${seedFingerprint}\n` +
            `resolved_elements=\n${resolvedElements(registry).map(e => `- ${e.role} "${e.name}" -> ${e.locator}`).join("\n")}`);
        await runTool("write_file", { path: UI_CONVENTIONS_FILE, content: uiConventions });
    } finally {
        try {
            await client.close?.();
        } catch { /* đóng được thì tốt, không được cũng không làm sập lượt chạy */ }
    }

    const stampIso = new Date().toISOString();
    await runTool("write_file", { path: FINDINGS_FILE, content: renderFindings(findings, stampIso, walk, flow) });

    const check = verifyAllSpecs(authored.map(a => ({ tcId: a.tcId, specContent: a.specContent })));
    await runTool("write_file", {
        path: DELIVERABLE_FILE,
        content: assembleDeliverable({ authored, skipped, check, findings, cost: stats }),
    });

    console.log(`  Chi phí: ${stats.llmCalls} LLM call, ${stats.mcpCalls} MCP call; ` +
        `bước xử lý bằng rule ${stats.stepsByRule}, phải nhờ LLM ${stats.stepsByLLM}; ` +
        `spec sinh lại ${stats.specsAuthored}, bỏ qua ${stats.specsSkipped}.`);

    return {
        status: "success",
        data: {
            deliverableFile: DELIVERABLE_FILE,
            specDir: P.SPEC_DIR + "/",
            uiConventionsFile: UI_CONVENTIONS_FILE,
            dataFile: DATA_PATH,
            findingsFile: FINDINGS_FILE,
            registryFile: REGISTRY_PATH,
            cost: { ...stats },
        },
        error: null,
    };
}

export { buildDataset, testCaseHash };
