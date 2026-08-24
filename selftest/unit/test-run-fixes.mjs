// Test các fix rút ra từ lần chạy thật (2026-08-17): step-planner "Vào checkout" bị hiểu
// nhầm thành navigate(base_url), và spec-generator hallucinate selector "ref=...".
// KHÔNG gọi LLM/MCP.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const SP = await import(abs("agents/qa-automation/tools/step-planner.js"));
const CHK = await import(abs("agents/qa-automation/tools/spec-assertion-check.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// ─────────── step-planner: "Vào checkout" KHÔNG được tự trở thành navigate(base_url) ───
chk(">>> 'Vào checkout' (không có URL) -> KHÔNG khớp rule navigate (từng gây bug thật: reset về trang chủ)",
    SP.planStep("Vào checkout") === null, JSON.stringify(SP.planStep("Vào checkout")));
chk("'Vào trang giỏ hàng' (không URL) -> cũng miss, để tier-3 LLM quyết định",
    SP.planStep("Vào trang giỏ hàng") === null);
// URL THẬT của dự án, + 1 URL không bắt đầu bằng "s" sau "//".
// Bản test cũ chỉ dùng "https://shop.example.com" nên pass NHỜ TRÙNG HỢP: regex khi đó là
// `https?://S+` (do \S trong template literal thành S) + cờ i, nên chỉ khớp host bắt đầu bằng "s".
for (const url of ["https://cwshopgo.github.io/", "https://example.com/checkout", "http://localhost:3000/"]) {
    const p = SP.planStep(`Mở ${url}`);
    chk(`'Mở ${url}' (CÓ URL thật) -> khớp navigate, url đúng`,
        p?.tool === "browser_navigate" && p?.args.url === url, JSON.stringify(p));
}
chk(">>> động từ tiếng Việt kết thúc bằng chữ CÓ DẤU vẫn khớp rule (lỗi \\b cũ)", (() => {
    // `\b` chỉ nhận [A-Za-z0-9_] là chữ -> `mở`, `gõ`, `hiển thị`, `kết quả` không có word
    // boundary phía sau -> rule KHÔNG BAO GIỜ khớp, âm thầm rơi xuống LLM.
    const cases = [
        ["Mở https://cwshopgo.github.io/", "navigate"],
        ["gõ SALE20 vào ô Mã giảm giá", "type"],
        ["hiển thị tổng tiền", "expectation"],
        ["kết quả là 700.000", "expectation"],
    ];
    return cases.every(([s, rule]) => SP.planStep(s)?.matchedRule === rule);
})(), JSON.stringify(["Mở https://cwshopgo.github.io/", "gõ SALE20 vào ô Mã giảm giá", "hiển thị tổng tiền", "kết quả là 700.000"].map(s => SP.planStep(s)?.matchedRule ?? "MISS")));
chk("'Bấm nút Thanh toán' vẫn khớp click như cũ (không bị ảnh hưởng)",
    SP.planStep("Bấm nút Thanh toán")?.tool === "browser_click");
chk("'Nhấn Enter' vẫn ra press, KHÔNG thành click vào phần tử tên 'Enter'",
    SP.planStep("Nhấn Enter")?.tool === "browser_press_key");

// ─────────── spec-assertion-check: bắt được đúng 2 spec hỏng thật từ run hôm qua ───────
const badTC008 = `
await page.click('button[ref="f15e27"]');
await expect(page.getByText('VOUCHER_MIN_ORDER_NOT_MET')).toBeVisible();
`;
const badTC019 = `
await page.locator('[ref="f10e27"]').click();
await expect(page.getByText('x')).toBeVisible();
`;
const goodSpec = `
await page.getByRole('button', { name: 'Thanh toán' }).click();
await expect(page.getByText('700.000')).toBeVisible();
`;

chk(">>> phát hiện đúng selector 'ref=' kiểu button[ref=\"...\"] (TC-D-008 thật)",
    CHK.hasEphemeralRefSelector(badTC008) === true);
chk(">>> phát hiện đúng selector 'ref=' kiểu [ref=\"...\"] (TC-D-019 thật)",
    CHK.hasEphemeralRefSelector(badTC019) === true);
chk("KHÔNG báo nhầm spec dùng getByRole hợp lệ", CHK.hasEphemeralRefSelector(goodSpec) === false);

const v = CHK.verifySpec({ tcId: "TC-D-008", specContent: badTC008 });
chk("verifySpec() cũng gắn issue rõ ràng nhắc tới mcp-cost-optimization.md",
    !v.ok && v.issues.some(i => i.includes("mcp-cost-optimization.md")), JSON.stringify(v.issues));

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
