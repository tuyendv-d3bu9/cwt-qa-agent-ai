// Test flow-walker: MCP giả, AI giả, snapshot giả — nhưng VÒNG LẶP là thật.
// Điểm cốt lõi phải chứng minh: trang ĐỔI sau mỗi hành động, và agent thấy trang mới.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const { walkFlow, renderWalk } = await import(abs("agents/qa-automation/tools/flow-walker.js"));
const { parseUiFlows } = await import(abs("agents/qa-leader/tools/ui-flow-parser.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// ─── App giả 3 màn hình: trang chủ -> giỏ hàng -> đơn hàng ───
const SCREENS = {
    home: [
        { role: "button", name: "Cửa hàng", ref: "e1", attrs: {} },
        { role: "button", name: "Thanh toán", ref: "e2", attrs: {} },
        { role: "button", name: "Thêm vào giỏ", ref: "e3", attrs: {} },
    ],
    cart: [
        { role: "textbox", name: "Mã giảm giá", ref: "e10", attrs: {} },
        { role: "button", name: "Áp dụng", ref: "e11", attrs: {} },
        { role: "button", name: "Thanh toán", ref: "e12", attrs: {} },
    ],
    orders: [
        { role: "heading", name: "Đơn hàng của tôi", ref: "e20", attrs: {} },
        { role: "button", name: "Đơn hàng", ref: "e21", attrs: {} },
    ],
};

function makeApp() {
    let screen = "home";
    const calls = [];
    const seenScreens = [];
    return {
        calls, seenScreens,
        mcp: async (name, args) => {
            calls.push({ name, args });
            // Bấm "Thanh toán" ở trang chủ -> sang giỏ; ở giỏ -> sang đơn hàng
            if (name === "browser_click" && args?.element === "Thanh toán") {
                screen = screen === "home" ? "cart" : "orders";
            }
            return { content: [] };
        },
        snapshot: async () => { seenScreens.push(screen); return { nodes: SCREENS[screen], text: screen }; },
        current: () => screen,
    };
}

const flowDoc = `## Flow: Áp mã
**Entry:** https://app.test/

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở trang thanh toán
3. Nhập mã giảm giá vào ô nhập mã
4. Áp dụng mã
5. Kiểm tra đơn hàng vừa tạo
`;
const flow = parseUiFlows(flowDoc).flows[0];

// AI giả: khớp theo từ khoá trên ĐÚNG danh sách candidates nhận được
const smartAsk = async ({ step, candidates }) => {
    const s = step.toLowerCase();
    const find = (r, n) => candidates.find(c => c.role === r && c.name === n);
    let hit = null, action = "click", value = null;
    if (s.includes("thêm") && s.includes("giỏ")) hit = find("button", "Thêm vào giỏ");
    else if (s.includes("thanh toán")) hit = find("button", "Thanh toán");
    else if (s.includes("nhập mã")) { hit = find("textbox", "Mã giảm giá"); action = "type"; value = "SALE20"; }
    else if (s.includes("áp dụng")) hit = find("button", "Áp dụng");
    if (!hit) return { found: false, why: `không có phần tử phù hợp trên trang này` };
    return { found: true, role: hit.role, name: hit.name, action, value, confidence: "high", why: "khớp tên" };
};

// ─────────── 1. Đi trọn luồng, và THẤY trang mới sau mỗi hành động ───────────
{
    const app = makeApp();
    const r = await walkFlow({ flow, mcp: app.mcp, snapshot: app.snapshot, ask: smartAsk, resolve: async (d) => ({ ref: "r-" + d.name, locator: "loc" }) });

    chk(">>> đi trọn 5 bước, không dừng giữa đường", r.stoppedAt === null && r.findings.length === 0, JSON.stringify({ stopped: r.stoppedAt, findings: r.findings }));
    // home(b1 thêm giỏ) home(b2 bấm Thanh toán -> sang cart) cart(b3 nhập mã) cart(b4 Áp dụng)
    // cart(b5 chỉ QUAN SÁT nên không điều hướng). Đúng: chỉ hành động mới đổi trang.
    chk(">>> trang ĐỔI sau hành động và agent THẤY trang mới (home -> cart)",
        JSON.stringify(app.seenScreens) === JSON.stringify(["home", "home", "cart", "cart", "cart"]),
        JSON.stringify(app.seenScreens));
    chk("mỗi bước chụp lại snapshot MỚI (5 bước = 5 lần chụp, không tái dùng ref cũ)",
        app.seenScreens.length === 5, String(app.seenScreens.length));
    chk(">>> phần tử của MÀN HÌNH SAU được tìm ra — đúng cái trước đây không bao giờ có",
        r.visited.some(v => v.element.includes("Mã giảm giá")) && r.visited.some(v => v.element.includes("Áp dụng")),
        JSON.stringify(r.visited.map(v => v.element)));
    chk("bước nhập dùng browser_type kèm giá trị, không phải click",
        app.calls.some(c => c.name === "browser_type" && c.args.text === "SALE20"),
        JSON.stringify(app.calls.filter(c => c.name === "browser_type")));
    chk("bước 'Kiểm tra …' là quan sát, KHÔNG click", r.visited[4].action === "observe", JSON.stringify(r.visited[4]));
    chk("navigate tới entry đúng 1 lần, ngay đầu",
        app.calls[0].name === "browser_navigate" && app.calls[0].args.url === "https://app.test/" &&
        app.calls.filter(c => c.name === "browser_navigate").length === 1);
}

// ─────────── 2. Không khớp được -> DỪNG + finding, KHÔNG đoán ───────────
{
    const app = makeApp();
    const blindAsk = async () => ({ found: false, why: "trang không có ô nhập mã" });
    const r = await walkFlow({ flow, mcp: app.mcp, snapshot: app.snapshot, ask: blindAsk, resolve: async () => ({ ref: "x" }) });
    chk(">>> AI không khớp được -> DỪNG ngay bước 1, ghi finding, KHÔNG click bừa",
        r.stoppedAt === 1 && r.findings[0].kind === "unmatched" && !app.calls.some(c => c.name === "browser_click"),
        JSON.stringify({ stopped: r.stoppedAt, clicks: app.calls.filter(c => c.name === "browser_click").length }));
    chk("finding có liệt kê ứng viên đã xét (để người review truy được)",
        r.findings[0].candidates?.length > 0, JSON.stringify(r.findings[0]));
}

// ─────────── 3. Dừng giữa luồng -> nói rõ màn sau CHƯA có trong registry ───────────
{
    const app = makeApp();
    let n = 0;
    const failAt3 = async (a) => (++n >= 3 ? { found: false, why: "hết" } : smartAsk(a));
    const r = await walkFlow({ flow, mcp: app.mcp, snapshot: app.snapshot, ask: failAt3, resolve: async (d) => ({ ref: "r", locator: "l" }) });
    chk("dừng đúng bước 3", r.stoppedAt === 3, JSON.stringify(r.stoppedAt));
    const md = renderWalk({ flow, ...r });
    chk(">>> báo cáo NÓI RÕ các bước sau chưa đi nên registry thiếu (không im lặng)",
        md.includes("DỪNG ở bước 3") && md.includes("CHƯA có trong registry"), md.slice(0, 300));
}

// ─────────── 4. type mà không có value -> lỗi rõ ràng, không fill('') ───────────
{
    const app = makeApp();
    const noValue = async ({ step, candidates }) => {
        if (!step.toLowerCase().includes("nhập mã")) return smartAsk({ step, candidates });
        const c = candidates.find(x => x.role === "textbox");
        return { found: true, role: c.role, name: c.name, action: "type", value: null, confidence: "high", why: "" };
    };
    const r = await walkFlow({ flow, mcp: app.mcp, snapshot: app.snapshot, ask: noValue, resolve: async () => ({ ref: "r", locator: "l" }) });
    chk(">>> action=type mà thiếu value -> báo lỗi, KHÔNG gọi browser_type với chuỗi rỗng (bẫy fill(undefined))",
        r.findings.some(f => f.kind === "action_failed" && f.detail.includes("không có giá trị")) &&
        !app.calls.some(c => c.name === "browser_type"),
        JSON.stringify(r.findings));
}

// ─────────── 5. confidence low -> vẫn đi nhưng ghi finding ───────────
{
    const app = makeApp();
    const lowConf = async (a) => { const d = await smartAsk(a); return d.found ? { ...d, confidence: "low", why: "tên khác hẳn" } : d; };
    const r = await walkFlow({ flow, mcp: app.mcp, snapshot: app.snapshot, ask: lowConf, resolve: async () => ({ ref: "r", locator: "l" }) });
    chk("confidence low -> vẫn thực hiện nhưng ghi finding cho người review",
        r.stoppedAt === null && r.findings.every(f => f.kind === "low_confidence") && r.findings.length > 0,
        JSON.stringify(r.findings.map(f => f.kind)));
}

// ─────────── 6. Lọc ứng viên: AI chỉ thấy phần tử CỦA TRANG HIỆN TẠI ───────────
{
    const app = makeApp();
    const seenCandidates = [];
    const spyAsk = async (a) => { seenCandidates.push(a.candidates.map(c => c.name)); return smartAsk(a); };
    await walkFlow({ flow, mcp: app.mcp, snapshot: app.snapshot, ask: spyAsk, resolve: async () => ({ ref: "r", locator: "l" }) });
    chk(">>> bước 3 (nhập mã) chỉ thấy phần tử TRANG GIỎ, không thấy phần tử trang chủ",
        seenCandidates[2].includes("Mã giảm giá") && !seenCandidates[2].includes("Thêm vào giỏ"),
        JSON.stringify(seenCandidates[2]));
}


// ─────────── P3.4: thử lại bước chưa đi được ───────────
{
    const F2 = await import(abs("agents/qa-automation/tools/flow-walker.js"));

    // lần 1: chặn ở bước 3
    const app1 = makeApp();
    let n = 0;
    const failAt3 = async (a) => (++n >= 3 ? { found: false, why: "chưa tìm được" } : smartAsk(a));
    const first = await walkFlow({ flow, mcp: app1.mcp, snapshot: app1.snapshot, ask: failAt3, resolve: async () => ({ ref: "r", locator: "l" }), verbose: false });

    chk("[P3.4] lần 1 dừng ở bước 3", first.stoppedAt === 3 && first.visited.length === 2);
    chk("[P3.4] unreachedSteps liệt kê đúng 3 bước còn lại",
        JSON.stringify(F2.unreachedSteps({ flow, visited: first.visited }).map(s => s.n)) === "[3,4,5]",
        JSON.stringify(F2.unreachedSteps({ flow, visited: first.visited }).map(s => s.n)));

    // lần 2: đã sửa được -> đi trọn
    const app2 = makeApp();
    const logs = [];
    const retried = await F2.retryUnreached({ flow, previous: first, mcp: app2.mcp, snapshot: app2.snapshot, ask: smartAsk, resolve: async () => ({ ref: "r", locator: "l" }), log: (m) => logs.push(m) });
    chk(">>> [P3.4] thử lại đi thêm được các bước còn thiếu",
        retried.progressed === 3 && retried.stoppedAt === null, JSON.stringify({ p: retried.progressed, s: retried.stoppedAt }));

    // lần 3: vẫn chặn y chỗ cũ -> KHÔNG lặp, báo cần người
    const app3 = makeApp();
    let m3 = 0;
    const stillStuck = async (a) => (++m3 >= 3 ? { found: false, why: "vẫn không thấy" } : smartAsk(a));
    const logs3 = [];
    const again = await F2.retryUnreached({ flow, previous: first, mcp: app3.mcp, snapshot: app3.snapshot, ask: stillStuck, resolve: async () => ({ ref: "r", locator: "l" }), log: (m) => logs3.push(m) });
    chk(">>> [P3.4] thử lại KHÔNG tiến thêm -> nói rõ cần NGƯỜI xem, không lặp vô hạn",
        again.progressed <= 0 && again.note.includes("cần người") && logs3.some(l => l.includes("không lặp")),
        JSON.stringify({ p: again.progressed, note: again.note }));

    // không có gì để thử lại.
    // LƯU Ý: phải dùng CÙNG một app cho mcp + snapshot. Bản trước gọi makeApp() hai lần nên
    // hành động đi vào app này còn snapshot đọc app kia — trang không bao giờ đổi, nên walk
    // tưởng là 'trọn luồng' thực ra bị chặn ở bước 3. Fixture sai làm assertion đúng thành fail.
    const appFull = makeApp();
    const full = await walkFlow({ flow, mcp: appFull.mcp, snapshot: appFull.snapshot, ask: smartAsk, resolve: async () => ({ ref: 'r', locator: 'l' }), verbose: false });
    chk('[P3.4] tiền đề: walk này ĐI TRỌN luồng', full.stoppedAt === null && full.visited.length === 5,
        JSON.stringify({ stopped: full.stoppedAt, visited: full.visited.length }));

    const appRetry = makeApp();
    const noop = await F2.retryUnreached({ flow, previous: full, mcp: appRetry.mcp, snapshot: appRetry.snapshot, ask: smartAsk, resolve: async () => ({}) });
    chk('[P3.4] lần trước không bị chặn -> KHÔNG thử lại, KHÔNG gọi MCP lần nào (khỏi tốn tiền vô ích)',
        noop.retried === 0 && appRetry.calls.length === 0,
        JSON.stringify({ retried: noop.retried, mcpCalls: appRetry.calls.length, note: noop.note }));
}

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
