// R2.1 — MỘT bước nghiệp vụ có thể là NHIỀU động tác.
//
// LỖI ĐANG SỬA (đo trên lần chạy thật, xem TODO.Update4.md mục 1.1):
//   UI-flow.md bước 3 = "Nhập mã giảm giá vào ô nhập mã RỒI ÁP DỤNG"
//   tests/steps/*.steps.ts sinh ra:
//       export async function step3_nhapMaGiamGiaVaoO(page, value) {
//         await new AppPage(page).nhapMaGiam50kSale20Input.fill(value);   // ← CHỈ CÓ THẾ
//       }
//   Không có cú click nào vào nút "Áp dụng" → mọi test case gõ mã rồi đi thẳng tới thanh toán
//   → mã giảm giá CHƯA TỪNG được áp → nhìn từ ngoài giống hệt bug sản phẩm
//   "áp mã hỏng mà vẫn thanh toán được".
//
// Bộ này đi hết chuỗi: parser → walker → emitter. MCP giả, AI giả, nhưng VÒNG LẶP là thật.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const { parseUiFlows, splitStepParts } = await import(abs("agents/qa-leader/tools/ui-flow-parser.js"));
const { walkFlow, unreachedSteps } = await import(abs("agents/qa-automation/tools/flow-walker.js"));
const { emitSteps, stepCatalogue } = await import(abs("agents/qa-automation/tools/step-emitter.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ─────────── 1. Parser: tách ở đâu, KHÔNG tách ở đâu ───────────
{
    chk(">>> câu THẬT trong UI-flow.md tách thành 2 động tác",
        eq(splitStepParts("Nhập mã giảm giá vào ô nhập mã rồi áp dụng"),
            ["Nhập mã giảm giá vào ô nhập mã", "áp dụng"]),
        JSON.stringify(splitStepParts("Nhập mã giảm giá vào ô nhập mã rồi áp dụng")));

    chk("tách ở 'sau đó'", eq(splitStepParts("Chọn sản phẩm sau đó thêm vào giỏ"), ["Chọn sản phẩm", "thêm vào giỏ"]));

    chk(">>> KHÔNG tách ở 'và' — 'và' nối danh từ nhiều hơn nối động tác",
        eq(splitStepParts("Thêm sản phẩm A và sản phẩm B vào giỏ"), ["Thêm sản phẩm A và sản phẩm B vào giỏ"]),
        JSON.stringify(splitStepParts("Thêm sản phẩm A và sản phẩm B vào giỏ")));

    chk("bước một động tác giữ nguyên", eq(splitStepParts("Tiến hành thanh toán"), ["Tiến hành thanh toán"]));
    chk("chuỗi rỗng → mảng rỗng", eq(splitStepParts(""), []));

    const doc = `## Flow: F
**Entry:** https://app.test/

1. Mở trang thanh toán
2. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
3. Kiểm tra mã đang kích hoạt rồi chụp lại màn hình
`;
    const r = parseUiFlows(doc);
    chk(">>> bước QUAN SÁT không bị tách (không phải hai cú click)",
        r.flows[0].steps[2].kind === "check" && r.flows[0].steps[2].parts.length === 1,
        JSON.stringify(r.flows[0].steps[2]));
    chk(">>> việc tách vào `notes`, KHÔNG vào `problems`",
        r.problems.length === 0 && r.notes.length === 1 && r.notes[0].includes("2 động tác"),
        `problems=${JSON.stringify(r.problems)} notes=${JSON.stringify(r.notes)}`);
}

// ─────────── 2. Walker: thật sự thực hiện CẢ HAI động tác ───────────
//
// App giả: ô mã và nút "Áp dụng" cùng nằm trên màn hình giỏ hàng. Sau khi bấm "Áp dụng" thì
// xuất hiện badge "Đang kích hoạt giảm giá" — đúng như quy ước nghiệp vụ đã chốt trong
// UI-flow.md mục "Mã giảm giá đang áp — nhìn vào đâu để biết".
function makeApp() {
    let applied = false;
    const calls = [];
    return {
        calls,
        isApplied: () => applied,
        mcp: async (name, args) => {
            calls.push({ name, element: args?.element, text: args?.text });
            if (name === "browser_click" && args?.element === "Áp dụng") applied = true;
            return { content: [] };
        },
        snapshot: async () => ({
            nodes: [
                { role: "textbox", name: "Mã giảm giá", ref: "e10", attrs: {} },
                { role: "button", name: "Áp dụng", ref: "e11", attrs: {} },
                ...(applied ? [{ role: "status", name: "Đang kích hoạt giảm giá", ref: "e12", attrs: {} }] : []),
            ],
            text: applied ? "applied" : "empty",
        }),
    };
}

// AI giả: bước có chữ "nhập" → gõ vào textbox; ngược lại → bấm nút khớp tên.
const fakeAsk = async ({ step, candidates }) => {
    if (/^nhập/i.test(step.trim())) {
        const el = candidates.find(c => c.role === "textbox");
        return el ? { found: true, role: "textbox", name: el.name, action: "type", value: "SALE20", confidence: "high" } : { found: false };
    }
    const el = candidates.find(c => c.role === "button" && /áp dụng/i.test(c.name ?? ""));
    return el ? { found: true, role: "button", name: el.name, action: "click", confidence: "high" } : { found: false };
};
const fakeResolve = async ({ role, name, ref }) => ({ role, name, ref, locator: `getByRole('${role}', { name: '${name}' })` });

const flow = parseUiFlows(`## Flow: Áp mã
**Entry:** https://app.test/

1. Nhập mã giảm giá vào ô nhập mã rồi áp dụng
`).flows[0];

let walked;
{
    const app = makeApp();
    walked = await walkFlow({ flow, mcp: app.mcp, snapshot: app.snapshot, resolve: fakeResolve, ask: fakeAsk });

    chk(">>> NÚT ÁP DỤNG THẬT SỰ ĐƯỢC BẤM (lỗi gốc của cả TODO.Update4)",
        app.isApplied(), JSON.stringify(app.calls));
    chk(">>> đúng 2 động tác: gõ rồi bấm, ĐÚNG thứ tự",
        eq(app.calls.filter(c => c.name !== "browser_navigate").map(c => c.name),
            ["browser_type", "browser_click"]),
        JSON.stringify(app.calls.map(c => c.name)));
    chk("một dòng `visited` cho một BƯỚC (không tách số bước, giữ truy vết về tài liệu)",
        walked.visited.length === 1 && walked.visited[0].step === 1, JSON.stringify(walked.visited));
    chk(">>> `actions[]` giữ cả hai động tác",
        walked.visited[0].actions.length === 2 &&
        walked.visited[0].actions[0].action === "browser_type" &&
        walked.visited[0].actions[1].action === "browser_click",
        JSON.stringify(walked.visited[0].actions));
    chk("trường phẳng `action`/`element` vẫn còn (renderWalk và code cũ không gãy)",
        walked.visited[0].action === "browser_type" && typeof walked.visited[0].element === "string",
        JSON.stringify(walked.visited[0]));
    chk("chụp snapshot LẠI giữa hai động tác (nút Áp dụng chỉ đúng trạng thái sau khi gõ)",
        !walked.findings.some(f => f.kind === "no_candidates"), JSON.stringify(walked.findings));
}

// ─────────── 3. Cửa kiểm: động tác thứ hai KHÔNG khớp → nêu tên, không im lặng ───────────
{
    const app = makeApp();
    // AI giả này chỉ biết gõ, không nhận ra nút nào — động tác 2 phải thành finding.
    const askTypeOnly = async ({ step, candidates }) =>
        /^nhập/i.test(step.trim())
            ? { found: true, role: "textbox", name: candidates.find(c => c.role === "textbox").name, action: "type", value: "X", confidence: "high" }
            : { found: false, why: "không nhận ra nút nào" };

    const out = await walkFlow({ flow, mcp: app.mcp, snapshot: app.snapshot, resolve: fakeResolve, ask: askTypeOnly });
    chk(">>> động tác 2 hỏng → ghi finding, KHÔNG đoán một nút gần giống",
        out.findings.some(f => f.kind === "unmatched"), JSON.stringify(out.findings.map(f => f.kind)));
    chk(">>> cửa kiểm `action_lost`: bước khai 2 động tác mà chỉ làm 1 thì bị NÊU TÊN",
        out.findings.some(f => f.kind === "action_lost" && f.detail.includes("áp dụng")),
        JSON.stringify(out.findings.map(f => f.kind)));
    chk("nút Áp dụng KHÔNG bị bấm bừa", !app.isApplied(), JSON.stringify(app.calls));

    // Phần ĐÃ làm phải được ghi lại (trạng thái trình duyệt là thật), nhưng đánh dấu `partial`.
    chk("động tác 1 đã chạy thật → vẫn có trong `visited`, đánh dấu partial",
        out.visited.length === 1 && out.visited[0].partial === true && out.visited[0].actions.length === 1,
        JSON.stringify(out.visited));

    // ── Và KHÔNG được sinh hàm từ nó ──
    const se = emitSteps({
        flow, visited: out.visited,
        exported: [
            { role: "textbox", name: "Mã giảm giá", identifier: "maGiamGiaInput" },
            { role: "button", name: "Áp dụng", identifier: "apDungButton" },
        ],
    });
    chk(">>> bước nửa vời KHÔNG sinh hàm — nếu sinh thì lại ra đúng `.fill()` không có `.click()`",
        se.steps.length === 0 && se.unimplemented.length === 1 && se.unimplemented[0].why.includes("1/2 động tác"),
        JSON.stringify(se.unimplemented));
    chk("bước nửa vời bị tính là CHƯA đi tới (Gherkin writer không được dùng)",
        unreachedSteps({ flow, visited: out.visited }).some(u => u.n === 1),
        JSON.stringify(unreachedSteps({ flow, visited: out.visited })));
}

// ─────────── 4. Emitter: sinh hàm có CẢ HAI dòng ───────────
{
    const exported = [
        { role: "textbox", name: "Mã giảm giá", identifier: "maGiamGiaInput" },
        { role: "button", name: "Áp dụng", identifier: "apDungButton" },
    ];
    const se = emitSteps({ flow, visited: walked.visited, exported });
    // Lấy đúng thân hàm của BƯỚC, không phải `openEntry` (hàm export đầu tiên trong file).
    const stepName = se.steps[0].name;
    const fn = (se.content.split(`export async function ${stepName}`)[1] ?? "").split("\n}")[0];

    chk(">>> hàm step sinh ra có CẢ .fill VÀ .click (trước đây chỉ có .fill)",
        fn.includes("maGiamGiaInput.fill(value)") && fn.includes("apDungButton.click()"),
        fn.trim().slice(0, 240));
    chk("đúng thứ tự: fill trước, click sau",
        fn.indexOf("maGiamGiaInput.fill") < fn.indexOf("apDungButton.click"), fn.trim().slice(0, 240));
    chk("vẫn nhận `value` và vẫn nổ khi thiếu giá trị",
        fn.includes("value: string") && fn.includes("thiếu giá trị để nhập"), fn.trim().slice(0, 160));
    chk("mỗi động tác có chú thích câu nghiệp vụ của nó",
        fn.includes("// Nhập mã giảm giá vào ô nhập mã") && fn.includes("// áp dụng"), fn.trim().slice(0, 240));
    // Lọc `__checkpoint` (step dựng sẵn của R2.3a) — nó không đến từ việc đi luồng.
    const walkedSteps = stepCatalogue(se).available.filter(s => s.kind !== "assert");
    chk("catalogue vẫn là MỘT mục cho MỘT bước (từ vựng Gherkin không đổi)",
        walkedSteps.length === 1 && walkedSteps[0].needsValue === true,
        JSON.stringify(stepCatalogue(se).available));
    chk("không có bước nào rơi vào unimplemented", se.unimplemented.length === 0, JSON.stringify(se.unimplemented));
}

// ─────────── 5. Từ chối trường hợp chưa hỗ trợ, thay vì đoán ───────────
{
    const twoFills = [{
        step: 1, text: "Nhập A rồi nhập B", action: "browser_type", element: 'textbox "A"',
        actions: [
            { part: "Nhập A", action: "browser_type", element: 'textbox "A"' },
            { part: "nhập B", action: "browser_type", element: 'textbox "B"' },
        ],
    }];
    const se = emitSteps({
        flow: { name: "F", entry: null, steps: [{ n: 1, text: "Nhập A rồi nhập B", kind: "action", parts: ["Nhập A", "nhập B"] }] },
        visited: twoFills,
        exported: [{ role: "textbox", name: "A", identifier: "aInput" }, { role: "textbox", name: "B", identifier: "bInput" }],
    });
    chk(">>> 2 động tác cùng cần giá trị nhập → TỪ CHỐI sinh, nói rõ lý do (không dùng chung 1 value)",
        se.unimplemented.length === 1 && se.unimplemented[0].why.includes("cần giá trị nhập"),
        JSON.stringify(se.unimplemented));
}

// ─────────── 6. Không phá hình dạng cũ ───────────
{
    // `visited` kiểu CŨ (không có `actions`) vẫn sinh được hàm như trước.
    const se = emitSteps({
        flow: { name: "F", entry: null, steps: [{ n: 1, text: "Bấm Thanh toán", kind: "action" }] },
        visited: [{ step: 1, text: "Bấm Thanh toán", action: "browser_click", element: 'button "Thanh toán"' }],
        exported: [{ role: "button", name: "Thanh toán", identifier: "thanhToanButton" }],
    });
    chk("visited kiểu cũ (không có actions[]) vẫn sinh đúng — không phá code đang chạy",
        se.content.includes("thanhToanButton.click()") && se.unimplemented.length === 0,
        JSON.stringify(se.unimplemented));
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
process.exit(bad === 0 ? 0 : 1);
