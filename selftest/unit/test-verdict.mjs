// Test J: ma trận ghép expect() × ảnh, verdict deterministic, cost guard.
// KHÔNG gọi LLM, KHÔNG gọi VLM.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const V = await import(abs("agents/qa-verifier/tools/verdict-combiner.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const pass = { status: "passed" };
const fail = { status: "failed" };
const vis = (o) => ({ matches_expected: true, mismatch_details: "", ui_anomalies: [], confidence: "high", ...o });

// ─────────── 5 ô của ma trận ───────────
chk("pass + ảnh khớp -> PASSED",
    V.combine(pass, vis({})).label === V.LABELS.PASSED);

const falseGreen = V.combine(pass, vis({ matches_expected: false, mismatch_details: "hiển thị 700.0000 thừa 1 số 0" }));
chk(">>> pass + ảnh KHÔNG khớp -> UNCLEAR (bắt false-green)", falseGreen.label === V.LABELS.UNCLEAR, JSON.stringify(falseGreen));
chk("false-green có nêu rõ nghĩa là gì trong lý do", /FALSE-GREEN/.test(falseGreen.reason) && falseGreen.reason.includes("700.0000"));

chk("fail + ảnh cho thấy app ĐÚNG -> SPEC_ISSUE (không phải bug sản phẩm)",
    V.combine(fail, vis({ matches_expected: true })).label === V.LABELS.SPEC_ISSUE);

chk("fail + ảnh cho thấy app SAI -> BEHAVIOR_MISMATCH",
    V.combine(fail, vis({ matches_expected: false, mismatch_details: "không thấy badge áp mã" })).label === V.LABELS.BEHAVIOR_MISMATCH);

chk("ảnh unreadable -> UNCLEAR, KHÔNG coi là đồng ý",
    V.combine(pass, vis({ matches_expected: "unreadable" })).label === V.LABELS.UNCLEAR);
chk("matches_expected null/undefined -> UNCLEAR",
    V.combine(pass, vis({ matches_expected: null })).label === V.LABELS.UNCLEAR &&
    V.combine(pass, { confidence: "high" }).label === V.LABELS.UNCLEAR);

chk("confidence low -> UNCLEAR dù ảnh nói khớp (VLM tự nhận không chắc)",
    V.combine(pass, vis({ confidence: "low" })).label === V.LABELS.UNCLEAR);

// ─────────── luật cốt lõi: ảnh KHÔNG được nâng cấp kết luận ───────────
const allVisualStates = [vis({}), vis({ matches_expected: false }), vis({ matches_expected: "unreadable" }), vis({ confidence: "low" }), null];
chk(">>> KHÔNG có tổ hợp nào biến test FAIL thành PASSED",
    allVisualStates.every(v => V.combine(fail, v).label !== V.LABELS.PASSED),
    JSON.stringify(allVisualStates.map(v => V.combine(fail, v).label)));

// ─────────── không có kênh visual -> quay về hành vi cũ ───────────
chk("không có ảnh + pass -> PASSED, kênh functional", (() => {
    const r = V.combine(pass, null); return r.label === V.LABELS.PASSED && r.channel === "functional";
})());
chk("không có ảnh + fail -> UNCLEAR (không đủ căn cứ phân loại)", V.combine(fail, null).label === V.LABELS.UNCLEAR);

// ─────────── verdict deterministic ───────────
chk("toàn PASSED -> PASS", V.deriveVerdict(["PASSED", "PASSED"]) === "PASS");
chk("có SPEC_ISSUE -> FIX", V.deriveVerdict(["PASSED", "SPEC_ISSUE"]) === "FIX");
chk("có BEHAVIOR_MISMATCH -> ASK", V.deriveVerdict(["PASSED", "BEHAVIOR_MISMATCH"]) === "ASK");
chk("có UNCLEAR -> ASK", V.deriveVerdict(["PASSED", "UNCLEAR"]) === "ASK");
chk("ASK thắng FIX khi có cả hai", V.deriveVerdict(["SPEC_ISSUE", "UNCLEAR"]) === "ASK");
chk("mảng rỗng -> PASS (không có gì fail)", V.deriveVerdict([]) === "PASS");

// ─────────── cost guard (J.6) ───────────
const results = [
    { tcId: "T1", status: "failed", priority: "Low" },
    { tcId: "T2", status: "passed", priority: "Critical" },
    { tcId: "T3", status: "passed", priority: "High" },
    { tcId: "T4", status: "passed", priority: "Medium" },
    { tcId: "T5", status: "passed", priority: "Low" },
];
const sel = V.selectForVision(results);
chk("soi ảnh: mọi TC fail + TC pass High/Critical",
    JSON.stringify(sel.wanted.map(r => r.tcId)) === JSON.stringify(["T1", "T2", "T3"]), JSON.stringify(sel.wanted.map(r => r.tcId)));
chk("TC pass Medium/Low bị bỏ qua nhưng ĐƯỢC GHI LẠI, không im lặng",
    sel.skipped.length === 2 && sel.skipped[0].why.includes("Medium"), JSON.stringify(sel.skipped));
chk("--vlm-all -> soi hết", V.selectForVision(results, { all: true }).wanted.length === 5 && V.selectForVision(results, { all: true }).skipped.length === 0);
chk("priority thiếu (null) + pass -> bỏ qua, ghi rõ '?'",
    V.selectForVision([{ tcId: "T9", status: "passed", priority: null }]).skipped[0].why.includes("?"));

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
