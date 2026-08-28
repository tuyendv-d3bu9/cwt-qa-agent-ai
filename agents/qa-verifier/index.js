// agents/qa-verifier/index.js
// Node: QA Verifier — decides PASS/FIX/ASK from TWO channels:
//
//   functional  expect() results in test-results.json  -> the ONLY source of pass/fail
//               kèm `result.steps[]`: HỎNG Ở BƯỚC NÀO, không chỉ "test này hỏng"
//   visual      evidence/<TC_ID>/<NN-nhãn>.jpg — MỘT ẢNH MỖI BƯỚC, đọc theo BATCH từng cặp
//               (trước, tại) -> WHY it failed, and whether a green assertion is hiding a
//               broken screen (false-green)
//
// Nhãn bước trong test-results.json và tên file ảnh là CÙNG MỘT CHUỖI (`stepShotLabel` trong
// runtime/paths.js). Đó là khoá nối cho phép trả lời câu hỏi mở ra cả TODO.Update4:
// *"áp mã chưa thành công thì xem ở đâu?"* -> đúng một tấm ảnh, không phải ảnh màn hình cuối.
//
// The combination is deterministic (tools/verdict-combiner.js), not an LLM judgement:
// see agents/qa-automation/knowledge/oracle-problem.md — an image may only downgrade a
// conclusion, never upgrade one. Never runs the tests itself, never invents the oracle.

import { readFile } from "node:fs/promises";
import { runTool } from "../runtime/tools.js";
import { callLLM, callVisionLLM } from "../runtime/llm.js";
import { runAgentLoop } from "../runtime/agent-loop.js";
import { markStep } from "../runtime/memory.js";
import { parseTestResults, groupByTcId } from "./tools/parse-test-results.js";
import { combine, deriveVerdict, selectForVision, planVisionBatches, mergeVisualBatches, resultOf, LABELS } from "./tools/verdict-combiner.js";
import { checkNarrative } from "./tools/narrative-check.js";
import { extractTestCases, renderTestCaseResults } from "../runtime/testcase-doc.js";
import { scopedVerdict } from "../runtime/tc-filter.js";
import * as P from "../runtime/paths.js";

const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");
const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");
const VERDICT_MAPPING = await readFile(new URL("./knowledge/verdict-mapping.md", import.meta.url), "utf8");
const UI_BASELINE_RULE = await readFile(new URL("./knowledge/ui-conventions-baseline.md", import.meta.url), "utf8");
const CHECKPOINT = await readFile(new URL("./knowledge/checkpoint-protocol.md", import.meta.url), "utf8");
// Cross-node knowledge — read directly, not copied (see role.md "Cross-node").
const RISK_TAXONOMY = await readFile(new URL("../qa-leader/knowledge/task-management-conventions.md", import.meta.url), "utf8");
const ORACLE_BOUNDARY = await readFile(new URL("../qa-automation/knowledge/oracle-problem.md", import.meta.url), "utf8");
const SKILLS_DIR = new URL("./skills/", import.meta.url);

const DELIVERABLE_FILE = P.DELIVERABLE_VERIFIER;

async function loadSkill(fileName) {
    return readFile(new URL(fileName, SKILLS_DIR), "utf8");
}

const systemFor = (skillText) =>
    [ROLE, FACT, VERDICT_MAPPING, UI_BASELINE_RULE, ORACLE_BOUNDARY, CHECKPOINT, RISK_TAXONOMY, skillText].join("\n\n");

async function askLLM(skillText, userText) {
    const res = await callLLM({ system: systemFor(skillText), contents: [{ role: "user", parts: [{ text: userText }] }] });
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

/** Look up one column of a TC row in the 8-field test case table. */
function findCell(testCaseMarkdown, tcId, index) {
    const row = String(testCaseMarkdown ?? "").split("\n").find(l => l.trim().startsWith("|") && l.includes(tcId));
    if (!row) return null;
    const cells = row.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    return cells[index] ?? null;
}

// TC_ID, Title, Precondition, Steps, Test Data, Expected Result, Priority, Tags
const findExpectedResult = (md, tcId) => findCell(md, tcId, 5);
const findPriority = (md, tcId) => findCell(md, tcId, 6);

/**
 * Ảnh bằng chứng của một test case, đã sắp theo thứ tự bước.
 *
 * Đọc thư mục `.qa-run/evidence/<TC>/` (bố cục R2.2 — mỗi bước một ảnh). Nếu thư mục đó không
 * có thì rơi về bố cục CŨ (`<TC>-after.jpg`) để vẫn kết luận được trên evidence của một lần
 * chạy trước — chứ không im lặng coi như "không có ảnh", vì `combine()` sẽ dịch điều đó thành
 * UNCLEAR và cả bộ verdict thành ASK.
 */
async function evidenceImages(tcId) {
    const dir = P.evidenceDir(tcId);
    const listed = await runTool("list_files", { dir });
    if (!listed.error && Array.isArray(listed.files) && listed.files.length) {
        const images = listed.files
            // `list_files` trả về OBJECT `{path, size_bytes}`, và trên Windows `path` dùng dấu
            // `\`. Cả hai điều đó đều không hiển nhiên từ tên tool — đã kiểm bằng cách gọi thật.
            // Chuẩn hoá về `/` vì đó là quy ước của `paths.js` và của `safe()` trong tools.js.
            .map(f => String(f?.path ?? f).split("\\").join("/"))
            .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
            .map(f => {
                const base = f.split("/").pop();
                const m = /^(\d+)-(.+)\.(?:jpe?g|png|webp)$/i.exec(base);
                return m ? { path: f, label: `${m[1]}-${m[2]}`, n: Number(m[1]) } : null;
            })
            .filter(Boolean);
        if (images.length) return { images, layout: "per-step" };
    }

    const legacy = P.screenshotAfter(tcId);
    const exists = await runTool("file_exists", { path: legacy });
    if (exists.exists) return { images: [{ path: legacy, label: "after", n: 99 }], layout: "legacy" };
    return { images: [], layout: "none" };
}

/**
 * Run the visual channel for one test case — THEO BATCH, không dồn hết ảnh vào một lời gọi.
 *
 * Lý do chia batch nằm ở `planVisionBatches()`; tóm tắt: khoá cache của `callVisionLLM` gộp
 * sha256 của MỌI ảnh, nên một ảnh lệch một pixel là miss cả lời gọi; và nhiều ảnh trong một
 * lời gọi làm VLM nhầm ảnh nào là bước nào, mà nhầm là cả test case rơi về UNCLEAR.
 *
 * Returns visual=null when there is no usable image — which the combiner maps to UNCLEAR,
 * never to agreement. A missing screenshot must not look like confirmation.
 */
async function analyseJourney({ tcId, expectedResult, uiConventions, skill, failedStepLabel }) {
    const { images, layout } = await evidenceImages(tcId);
    if (!images.length) return { visual: null, note: `không có ảnh nào trong ${P.evidenceDir(tcId)}` };

    const { batches, dropped } = planVisionBatches({ images, failedStepLabel, max: 3 });
    const parts = [];
    const notes = [];

    for (const batch of batches) {
        try {
            const res = await callVisionLLM({
                system: [ROLE, ORACLE_BOUNDARY, VERDICT_MAPPING, skill].join("\n\n"),
                text:
                    `tc_id=${tcId}\n` +
                    `cau_hoi_cua_batch_nay=${batch.question}\n` +
                    `anh_theo_thu_tu=${batch.labels.join(" -> ")}\n` +
                    `buoc_hong=${failedStepLabel ?? "(không có bước nào hỏng)"}\n` +
                    `expected_result=${expectedResult ?? "[không tìm thấy trong bảng test case]"}\n` +
                    `ui_conventions=${uiConventions}`,
                images: batch.images,
            });
            const parsed = parseJSON(res.text);
            if (!parsed) notes.push(`batch ${batch.labels.join("+")}: VLM trả về JSON không parse được`);
            // `null` được ĐẨY VÀO, không bỏ qua: mergeVisualBatches coi nó là `unreadable`.
            // Bỏ qua một batch hỏng là để hai batch tốt che nó — đúng kiểu false-green đang diệt.
            parts.push(parsed);
        } catch (err) {
            notes.push(`batch ${batch.labels.join("+")}: lỗi khi phân tích ảnh — ${err.message}`);
            parts.push(null);
        }
    }

    if (dropped.length) {
        notes.push(`không soi ${dropped.length} ảnh (trần ${batches.length} batch): ${dropped.join(", ")}`);
    }
    if (layout === "legacy") {
        notes.push(`dùng ảnh bố cục CŨ (chỉ có ${P.screenshotAfter(tcId)}) — chạy lại spec để có ảnh theo từng bước`);
    }

    return {
        visual: mergeVisualBatches(parts),
        note: notes.length ? notes.join(" · ") : null,
        // Ảnh nêu trong báo cáo là ảnh của BƯỚC HỎNG khi có, không phải ảnh cuối.
        imagePath: (failedStepLabel && images.find(i => i.label === failedStepLabel)?.path) || images[images.length - 1]?.path || null,
        batches: batches.length,
    };
}

function assembleDeliverable({ verdict, verdictScope = null, analysed, visionSkipped, notes, narrative }) {
    // ⚠ ĐỔI SỐ CỘT LÀ ĐỔI HỢP ĐỒNG NGẦM. `qa-reporter/index.js parseVerifierTable()` destructure
    // bảng này THEO VỊ TRÍ (`const [TC_ID, Status, Label, ...] = cells`), nên chèn cột vào GIỮA
    // sẽ làm mọi cột sau đó lệch một ô — và cột `Ảnh evidence` sẽ nhận một câu văn, `file_exists`
    // trả false, rồi MỌI bug report ra đời không có ảnh. Không lỗi, không cảnh báo.
    // Nên hai cột mới được đặt Ở CUỐI, và `parseVerifierTable` được cập nhật cùng lượt.
    const rows = analysed.map(a =>
        `| ${a.tcId} | ${a.status} | ${a.label} | ${a.channel} | ${String(a.reason).replace(/\|/g, "\\|")} | ` +
        `${a.imagePath ? `\`${a.imagePath}\`` : "—"} | ${a.ketQua} | ${a.failedStepLabel ? `\`${a.failedStepLabel}\`` : "—"} |`
    ).join("\n");

    const counts = {};
    for (const a of analysed) counts[a.label] = (counts[a.label] ?? 0) + 1;

    const skippedSection = visionSkipped.length
        ? visionSkipped.map(s => `- ${s.tcId}: ${s.why}`).join("\n")
        : "*Mọi test case đều đã được soi ảnh.*";

    const notesSection = notes.length ? notes.map(n => `- ${n}`).join("\n") : "*Không có.*";

    return (
        `# Deliverable — QA Verifier\n\n` +
        `## Verdict: ${verdictScope ?? verdict}\n\n` +
        // Phạm vi phải đứng ngay dưới verdict, không nằm ở mục 5 nào đó cuối file. Người đọc
        // dừng lại ở dòng Verdict; nếu phần "3/20" nằm chỗ khác thì họ đã kết luận xong rồi.
        (verdictScope && verdictScope !== verdict
            ? `> ⚠ **Lượt chạy này KHÔNG phủ hết bộ test case.** ${verdictScope} — số còn lại ghi ` +
              `\`N/A\` trong \`testcases-result.md\`, KHÔNG phải đã chạy và đạt.\n\n`
            : "") +
        `Verdict này do \`tools/verdict-combiner.js\` suy ra **deterministic** từ nhãn của từng test case ` +
        `(KHÔNG phải do LLM tự kết luận). Quy tắc: có \`UNCLEAR\` hoặc \`BEHAVIOR_MISMATCH\` → ASK; ` +
        `chỉ có \`SPEC_ISSUE\` → FIX; còn lại → PASS.\n\n` +
        `## 1. Phân loại từng test case\n\n` +
        `| TC_ID | expect() | Nhãn | Kênh dùng | Lý do | Ảnh evidence | Kết quả | Bước hỏng |\n` +
        `|---|---|---|---|---|---|---|---|\n` +
        `${rows || "| — | — | — | — | *không có kết quả nào* | — | — | — |"}\n\n` +
        `> Cột **Kết quả** là OK/NG cho bảng test case, suy ra deterministic từ Nhãn ` +
        `(\`RESULT_OF\` trong verdict-combiner.js). NĂM giá trị chứ không phải hai: \`RETEST\` là ` +
        `**test hỏng**, không phải sản phẩm hỏng — gọi nó là NG là báo nhầm bug cho dev. ` +
        `\`CẦN XÁC NHẬN\` là chưa đủ căn cứ — gọi nó là OK là false-green.\n\n` +
        `> Cột **Bước hỏng** là nhãn bước lấy từ \`result.steps[]\` của Playwright, và nó CŨNG là ` +
        `tên file ảnh trong \`.qa-run/evidence/<TC>/\`. Có nó thì câu hỏi *"áp mã chưa thành công ` +
        `thì xem ở đâu"* có câu trả lời chỉ được đúng một tấm ảnh.\n\n` +
        `Tổng: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ") || "0"}\n\n` +
        `## 2. Test case KHÔNG được soi ảnh (tiết kiệm chi phí VLM)\n\n${skippedSection}\n\n` +
        `> Những test case này chỉ được kết luận bằng kênh \`expect()\`. Cần soi hết thì chạy lại với \`--vlm-all\`.\n\n` +
        `## 3. Ghi chú kỹ thuật (ảnh thiếu / VLM lỗi)\n\n${notesSection}\n\n` +
        `## 4. Diễn giải\n\n${narrative}\n`
    );
}

// Handover contract — see memory/README.md rule 3.
/**
 * Ghi `testcases-result.md` (R1.2d).
 *
 * ĐƯỜNG LÙI: `testcases.md` chưa tồn tại (phiên mở dở từ trước R1, hoặc designer chưa trích
 * được bảng) thì đọc `deliverable-test-designer.md` như cũ và IN CẢNH BÁO. Một phiên đang chạy
 * dở không được chết chỉ vì đổi tên file — nhưng cũng không được im lặng dùng đường cũ mãi.
 */
/**
 * Số test case ĐÃ THIẾT KẾ (không phải số đã chạy). `null` khi không đọc được — khi ấy không
 * gắn phạm vi, vì một phạm vi đoán mò còn tệ hơn không có phạm vi.
 */
async function countDesignedTestCases() {
    for (const p of [P.TESTCASES, P.DELIVERABLE_TEST_DESIGNER]) {
        const r = await runTool("read_file", { path: p });
        if (r.error) continue;
        const t = extractTestCases(r.content);
        if (t.found) return t.rows.length;
    }
    return null;
}

async function writeTestCaseResults(analysed) {
    let src = await runTool("read_file", { path: P.TESTCASES });
    if (src.error) {
        console.warn(`  [qa-verifier] ${P.TESTCASES} chưa có → lùi về ${P.DELIVERABLE_TEST_DESIGNER}. ` +
            `Chạy lại qa-test-designer để có file đặc tả riêng.`);
        src = await runTool("read_file", { path: P.DELIVERABLE_TEST_DESIGNER });
    }
    if (src.error) {
        console.warn(`  [qa-verifier] không đọc được bảng test case → BỎ QUA ${P.TESTCASES_RESULT}.`);
        return null;
    }

    const spec = extractTestCases(src.content);
    if (!spec.found) {
        console.warn(`  [qa-verifier] không trích được bảng test case → BỎ QUA ${P.TESTCASES_RESULT}. ` +
            spec.problems.join(" "));
        return null;
    }

    const byTcId = {};
    for (const a of analysed) {
        byTcId[a.tcId] = {
            ketQua: a.ketQua,
            nhan: a.label,
            lyDo: a.reason,
            anh: a.imagePath ?? "",
            chayLuc: new Date().toISOString(),
        };
    }
    // Một test case CÓ kết quả nhưng KHÔNG có trong đặc tả nghĩa là spec đang chạy không khớp
    // bảng test case — nó sẽ không xuất hiện ở bất kỳ dòng nào của file kết quả. Im lặng ở đây
    // là mất hẳn một kết quả đo được.
    const specIds = new Set(spec.rows.map(r => r[0]));
    for (const id of Object.keys(byTcId)) {
        if (!specIds.has(id)) {
            console.warn(`  [qa-verifier] ${id} có kết quả nhưng KHÔNG có trong bảng test case — ` +
                `không lên được ${P.TESTCASES_RESULT}.`);
        }
    }

    const content = renderTestCaseResults({ rows: spec.rows, byTcId, generatedAt: new Date().toISOString() });
    await runTool("write_file", { path: P.TESTCASES_RESULT, content });
    return content;
}

export const CONTRACT = {
    agent: "qa-verifier",
    requires: [
        P.TEST_RESULTS,
        P.UI_CONVENTIONS,
        P.DELIVERABLE_TEST_DESIGNER,
    ],
    produces: [DELIVERABLE_FILE, P.TESTCASES_RESULT],
    inputs: {
        testResultsFile: "TEST_RESULTS",
        uiConventionsFile: "UI_CONVENTIONS",
        testCaseFile: "DELIVERABLE_TEST_DESIGNER",
    },
    // `vlmAll` is NOT here — it is not a path. Non-path arguments come from the `with:`
    // block of the step in flows/*.flow.yml.
};

/**
 * @param {{testResultsFile: string, uiConventionsFile: string, testCaseFile: string, vlmAll?: boolean}} opts
 *   vlmAll — analyse the screenshot of EVERY test case, not just failures and
 *   High/Critical passes (decision J.6).
 */
export async function run({ testResultsFile, uiConventionsFile, testCaseFile, vlmAll = false }) {
    const uiConventions = await runTool("read_file", { path: uiConventionsFile });
    if (uiConventions.error) {
        return { status: "error", data: null, error: `ui-conventions.md chưa tồn tại — QA Automation phải chạy trước. (${uiConventions.error})` };
    }

    const testResultsRaw = await runTool("read_file", { path: testResultsFile });
    if (testResultsRaw.error) {
        return { status: "error", data: null, error: `test-results.json chưa tồn tại — cần chạy 'npx playwright test --reporter=json' trước. (${testResultsRaw.error})` };
    }

    const testCaseDeliverable = await runTool("read_file", { path: testCaseFile });
    let parsed;
    try {
        parsed = parseTestResults(JSON.parse(testResultsRaw.content));
    } catch (err) {
        return { status: "error", data: null, error: `test-results.json không parse được: ${err.message}` };
    }
    const grouped = groupByTcId(parsed);

    // Flatten, attaching Priority so the vision-cost guard can use it.
    const flat = [];
    for (const [tcId, results] of Object.entries(grouped)) {
        for (const result of results) {
            flat.push({
                ...result,
                tcId,
                priority: findPriority(testCaseDeliverable.content, tcId),
                expectedResult: findExpectedResult(testCaseDeliverable.content, tcId),
            });
        }
    }

    const { wanted, skipped: visionSkipped } = selectForVision(flat, { all: vlmAll });
    const wantedKeys = new Set(wanted.map(r => `${r.tcId}::${r.title ?? ""}`));

    const visionSkill = await loadSkill("03_screenshot_analysis.md");
    const analysed = [];
    const notes = [];

    for (const result of flat) {
        let visual = null;
        let imagePath = null;

        if (wantedKeys.has(`${result.tcId}::${result.title ?? ""}`)) {
            const out = await analyseJourney({
                tcId: result.tcId,
                expectedResult: result.expectedResult,
                uiConventions: uiConventions.content,
                skill: visionSkill,
                // Bước nào hỏng — quyết định batch ảnh nào được soi TRƯỚC, và ảnh nào được nêu
                // trong báo cáo. Đến từ `result.steps[]` của Playwright (parse-test-results.js).
                failedStepLabel: result.failedStepLabel ?? null,
            });
            visual = out.visual;
            imagePath = out.imagePath ?? null;
            if (out.note) notes.push(`${result.tcId}: ${out.note}`);
        }

        // Deterministic — the image cannot turn a failure into a pass.
        const { label, reason, channel } = combine(result, visual);
        analysed.push({
            tcId: result.tcId, status: result.status, label, reason, channel, imagePath, visual,
            priority: result.priority,
            failedStepLabel: result.failedStepLabel ?? null,
            ketQua: resultOf(label),
        });
    }

    const verdict = deriveVerdict(analysed.map(a => a.label));

    // ── R4 TẦNG 3: verdict phải nói rõ PHẠM VI ─────────────────────────
    //
    // `verdict` ở trên là thứ workflow rẽ nhánh theo (`branch_on`) — nó PHẢI giữ nguyên một
    // trong các giá trị đã biết, nên phạm vi KHÔNG được nhét vào chuỗi đó.
    //
    // Nhưng người đọc báo cáo thì cần biết: một `PASS` tính trên 3 test case mà đọc như PASS
    // trên cả bộ 20 là câu nói dối nguy hiểm nhất hệ thống này phát ra được — 17 test case kia
    // chưa từng chạy và không có gì trên báo cáo nói điều đó. Nên phạm vi đi kèm ở một trường
    // RIÊNG, và hiện trong tiêu đề deliverable.
    const totalDesigned = await countDesignedTestCases();
    const verdictScope = totalDesigned && totalDesigned > analysed.length
        ? scopedVerdict(verdict, { selected: analysed.length, total: totalDesigned })
        : verdict;
    if (verdictScope !== verdict) {
        console.log(`  Phạm vi: ${verdictScope} — ${totalDesigned - analysed.length} test case không nằm trong lượt chạy này.`);
    }

    // The LLM writes the explanation only. The verdict is already fixed above, so a
    // differently-worded report cannot change what the workflow does next.
    //
    // AND THAT RULE IS NOW ENFORCED (P11). role.md has always declared "skill 02 chỉ diễn
    // giải verdict đã tính, KHÔNG được đổi" — but nothing checked it, so the rule lived only
    // in a prompt asking politely. `checkNarrative()` is deterministic and its failure is fed
    // back, so the model revises instead of shipping a report that contradicts the verdict or
    // quietly omits a test a person has to look at.
    const narrativeUser =
        `verdict_deterministic=${verdict}\n` +
        `labelled_results=${JSON.stringify(analysed.map(({ visual, ...rest }) => ({
            ...rest,
            visual_summary: visual
                ? { matches_expected: visual.matches_expected, mismatch_details: visual.mismatch_details, ui_anomalies: visual.ui_anomalies, confidence: visual.confidence }
                : null,
        })))}\n` +
        `KHÔNG được đổi verdict — chỉ diễn giải verdict đã cho.`;

    const narrativeOut = await runAgentLoop({
        system: systemFor(await loadSkill("02_verdict_writer.md")),
        task: narrativeUser,
        label: "verdict-writer",
        maxRevisions: 2,
        selfCheck: (text) => {
            const c = checkNarrative(text, { verdict, analysed });
            return { ok: c.ok, issues: c.issues };
        },
    });
    if (!narrativeOut.ok) {
        console.warn(`  [qa-verifier/verdict-writer] CHƯA ĐẠT (${narrativeOut.exhausted}) — ${narrativeOut.issues.join(" ")}`);
    }
    const narrative = narrativeOut.text;

    await runTool("write_file", {
        path: DELIVERABLE_FILE,
        content: assembleDeliverable({ verdict, verdictScope, analysed, visionSkipped, notes, narrative }),
    });

    // ── R1.2d: bảng KẾT QUẢ đứng riêng, có cột OK/NG ───────────────────
    //
    // `deliverable-verifier.md` là báo cáo có diễn giải (do LLM viết phần narrative).
    // `testcases-result.md` là BẢNG SỐ ĐO: mỗi test case một dòng, cột `Kết quả` ánh xạ
    // deterministic từ nhãn bằng `resultOf()` — không đi qua LLM ở bất kỳ đoạn nào.
    //
    // Nguồn của các dòng là ĐẶC TẢ (`testcases.md`), không phải danh sách test đã chạy. Nhờ vậy
    // test case KHÔNG nằm trong lượt chạy vẫn có mặt với ô `N/A`, thay vì lặng lẽ biến mất —
    // một bảng kết quả 12 dòng cho một bộ 20 test case đọc như "cả bộ có 12 case".
    await writeTestCaseResults(analysed);

    if (verdict === "ASK") {
        await markStep("qa-verifier", { status: "waiting_ask", output: DELIVERABLE_FILE });
    } else {
        await markStep("qa-verifier", { status: "done", output: DELIVERABLE_FILE });
    }

    return {
        status: "success",
        data: {
            deliverableFile: DELIVERABLE_FILE,
            verdict,
            labels: analysed.map(a => ({ tcId: a.tcId, label: a.label, imagePath: a.imagePath })),
            visionAnalysed: analysed.filter(a => a.visual).length,
            visionSkipped: visionSkipped.length,
            notes,
        },
        error: null,
    };
}

export { LABELS };
