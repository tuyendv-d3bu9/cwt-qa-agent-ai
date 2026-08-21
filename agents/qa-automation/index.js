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
    loadRegistry, saveRegistry, putElement, getElement, isStale, stamp, REGISTRY_PATH,
} from "./tools/ui-element-registry.js";
import { planSteps, WHITELIST } from "./tools/step-planner.js";
import { exportTestCases, buildDataset, DATA_PATH } from "./tools/testcase-exporter.js";
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
const FINDINGS_FILE = P.EXPLORATORY_FINDINGS;
const UI_CONVENTIONS_FILE = P.UI_CONVENTIONS;
const DELIVERABLE_FILE = P.DELIVERABLE_AUTOMATION;

// Counters, printed at the end. The point of this node's redesign is cost, so the cost
// has to be visible rather than asserted.
const stats = { llmCalls: 0, mcpCalls: 0, stepsByRule: 0, stepsByLLM: 0, specsSkipped: 0, specsAuthored: 0 };

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

async function askLLM(skillText, userText) {
    stats.llmCalls++;
    const system = [ROLE, FACT, GEN_ONCE, ORACLE, CONVENTIONS, COST, DOMAIN, KNOWN_ISSUES, contextFor(userText), skillText]
        .filter(Boolean).join("\n\n");
    const res = await callLLM({ system, contents: [{ role: "user", parts: [{ text: userText }] }] });
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
 * Capture a snapshot WITHOUT routing it through the prompt: browser_snapshot writes it
 * to a file (a documented parameter we were not using), our parser reads the file, and
 * only the filtered subset ever reaches the LLM.
 * Falls back to the in-response snapshot if the filename form returns nothing — the
 * filename behaviour has not been verified against a live MCP yet.
 */
async function captureSnapshot(client) {
    let text = "";
    try {
        const res = await mcp(client, "browser_snapshot", { filename: SNAPSHOT_FILE });
        const read = await runTool("read_file", { path: SNAPSHOT_FILE });
        text = read.error ? snapshotTextFrom(res) : read.content;
    } catch {
        const res = await mcp(client, "browser_snapshot", {});
        text = snapshotTextFrom(res);
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

async function resolveElement(client, registry, { role, name }) {
    if (!name) return null;
    const cached = getElement(registry, role, name) ?? (
        role ? null : Object.values(registry.elements).find(e => e.name === name && e.locator)
    );
    if (cached?.locator) return { ...cached, from: "registry" };

    let ref = null;
    let foundRole = role ?? null;
    try {
        const found = await mcp(client, "browser_find", { text: name });
        const nodes = parseSnapshot(snapshotTextFrom(found)).nodes;
        const hit = nodes.find(n => n.ref && (!role || n.role === role) && n.name) ?? nodes.find(n => n.ref);
        if (hit) {
            ref = hit.ref;
            foundRole = hit.role ?? foundRole;
        }
    } catch (err) {
        console.error(`  [find] "${name}": ${err.message}`);
    }
    if (!ref) {
        // Even if ref not found yet, produce synthetic locator as baseline if name exists
        const fallbackLoc = synthesizeLocator(foundRole, name);
        const stored = putElement(registry, { role: foundRole, name, locator: fallbackLoc, ref: null, source: "synthetic" });
        return fallbackLoc ? { ...stored, from: "synthetic" } : null;
    }

    let locator = null;
    try {
        const gen = await mcp(client, "browser_generate_locator", { target: ref, element: name });
        locator = snapshotTextFrom(gen).trim() || null;
    } catch (err) {
        // Fallback: build standard Playwright locator from role and name
        locator = synthesizeLocator(foundRole, name);
    }

    const stored = putElement(registry, { role: foundRole, name, locator, ref, source: "browser_find" });
    return locator ? { ...stored, from: "mcp" } : null;
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

        // Tier 3: no rule matched — ask the LLM, with a filtered view of the page.
        stats.stepsByLLM++;
        const snap = await captureSnapshot(client);
        const candidates = filterByKeywords(snap.nodes, keywordsFrom(group.steps[0]));
        const decisionRaw = await askLLM(stepSkill,
            `step=${group.steps[0]}\n` +
            `page_elements=\n${toPromptLines(candidates)}\n` +
            `available_tools=${JSON.stringify(WHITELIST)}`);
        const decision = parseJSON(decisionRaw);
        if (!decision?.tool) continue;
        if (!WHITELIST.includes(decision.tool)) {
            console.error(`  [${testCase.tcId}] LLM chọn tool ngoài whitelist (${decision.tool}) — bỏ qua.`);
            continue;
        }
        try {
            await mcp(client, decision.tool, decision.args || {});
        } catch (err) {
            console.error(`  [${testCase.tcId}] bước lỗi "${group.steps[0]}": ${err.message}`);
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

/** Author (or re-author) the spec for ONE test case.
 *  `correction`, when set, is appended to the prompt after a first attempt failed
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
    const knownLocators = Object.values(registry.elements)
        .filter(e => e.locator)
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

function renderFindings(findings, stampIso) {
    if (!findings.length) {
        return `# Exploratory Findings\n\n*Sinh lúc ${stampIso}.*\n\nKhông phát hiện lệch nào giữa Expected Result và UI thật trong lần explore này.\n`;
    }
    const lines = [
        `# Exploratory Findings`,
        ``,
        `*Sinh lúc ${stampIso}. Phát hiện lúc EXPLORE (authoring), bằng \`browser_verify_*\` của Playwright.*`,
        ``,
        `> Đây **không phải** kết luận pass/fail. Verdict pass/fail chỉ đến từ \`expect()\` khi test runner`,
        `> chạy spec thật (\`knowledge/oracle-problem.md\`). Mục này nói: spec kỳ vọng một thứ mà UI thật`,
        `> hiện không cho thấy — cần người xem lại xem spec sai, UI sai, hay chỉ là trạng thái trang chưa tới.`,
        ``,
    ];
    for (const f of findings) {
        lines.push(`## ${f.tcId}`, ``, `**Expected Result**: ${f.expected}`, ``, `| Giá trị kỳ vọng | Thấy trên UI? |`, `|---|---|`);
        for (const c of f.checks) lines.push(`| \`${c.text}\` | ${c.visible ? "có" : "**KHÔNG**"} |`);
        lines.push(``);
    }
    return lines.join("\n");
}

// Handover contract — see memory/README.md rule 3.
export const CONTRACT = {
    agent: "qa-automation",
    requires: [P.DELIVERABLE_TEST_DESIGNER],
    produces: [DELIVERABLE_FILE, UI_CONVENTIONS_FILE, DATA_PATH],
};

export async function run({ testCaseFile }) {
    const deliverable = await runTool("read_file", { path: testCaseFile });
    if (deliverable.error) return { status: "error", data: null, error: `Không đọc được ${testCaseFile}: ${deliverable.error}` };

    // Data lives in its own file so changing test data does not require regenerating
    // (and re-exploring for) the specs.
    const exported = await exportTestCases(deliverable.content);
    if (exported.malformed.length) {
        console.error(`  [testcase] ${exported.malformed.length} hàng bảng sai số cột, KHÔNG được dùng: ` +
            exported.malformed.map(m => `${m.id ?? "?"}(dòng ${m.line}, ${m.cellCount}/${m.expected} cột)`).join(", "));
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

    const client = await connectPlaywrightMCP({ headless: true });
    const registry = await loadRegistry();
    const authored = [];
    const findings = [];

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

        for (const item of todo) {
            // Every test case starts from the same known state.
            await mcp(client, "browser_navigate", { url: baseUrl });
            let out = await authorSpecFor(item.tc, client, registry);
            let check = verifySpec({ tcId: item.tc.tcId, specContent: out.specContent });

            // A spec that bakes in a transient MCP `ref=` as a selector will never match
            // anything real and just times out at run time — worth ONE retry with the
            // concrete violation quoted back, rather than writing it straight to disk.
            if (!check.ok && hasEphemeralRefSelector(out.specContent)) {
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
            `resolved_elements=\n${Object.values(registry.elements).filter(e => e.locator).map(e => `- ${e.role} "${e.name}" -> ${e.locator}`).join("\n")}`);
        await runTool("write_file", { path: UI_CONVENTIONS_FILE, content: uiConventions });
    } finally {
        try {
            await client.close?.();
        } catch { /* đóng được thì tốt, không được cũng không làm sập lượt chạy */ }
    }

    const stampIso = new Date().toISOString();
    await runTool("write_file", { path: FINDINGS_FILE, content: renderFindings(findings, stampIso) });

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
