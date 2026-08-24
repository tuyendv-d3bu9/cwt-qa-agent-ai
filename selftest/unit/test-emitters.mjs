// Test P4.1 (page-object-emitter) + P3.1 (step-emitter). KHÔNG gọi LLM, KHÔNG MCP.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const PO = await import(abs("agents/qa-automation/tools/page-object-emitter.js"));
const SE = await import(abs("agents/qa-automation/tools/step-emitter.js"));
const F = await import(abs("agents/qa-leader/tools/ui-flow-parser.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// registry giống thật: locator do Playwright sinh, tên tiếng Việt có dấu, có TÊN TRÙNG
const registry = {
    elements: {
        'button|thêm vào giỏ': { role: "button", name: "Thêm vào giỏ", locator: "page.getByRole('button', { name: 'Thêm vào giỏ' })" },
        'button|thêm vào giỏ#2': { role: "button", name: "Thêm vào giỏ", locator: "page.getByRole('button', { name: 'Thêm vào giỏ' }).nth(1)" },
        'button|thanh toán': { role: "button", name: "Thanh toán", locator: "page.getByRole('button', { name: 'Thanh toán' })" },
        'textbox|mã giảm giá': { role: "textbox", name: "Mã giảm giá", locator: "page.getByRole('textbox', { name: 'Mã giảm giá' })" },
        'button|áp dụng': { role: "button", name: "Áp dụng", locator: "page.getByRole('button', { name: 'Áp dụng' })" },
        'button|đơn hàng': { role: "button", name: "Đơn hàng", locator: "page.getByRole('button', { name: 'Đơn hàng' })" },
        'button|khong-co-locator': { role: "button", name: "Chưa resolve", locator: null },
    },
};

// ─────────── P4.1 Page Object ───────────
const po = PO.emitPageObject({ registry, className: "AppPage", baseUrl: "https://app.test/" });

// Bỏ dòng comment trước khi soi: file sinh ra CÓ comment giải thích vì sao ref= là sai,
// nên so khớp cả comment sẽ báo động giả.
const codeOnly = (src) => src.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

chk(">>> KHÔNG có selector 'ref=' nào trong CODE của Page Object (lỗ đã bị đóng từ gốc)",
    !/ref\s*=/.test(codeOnly(po.content)), codeOnly(po.content).match(/.*ref.*/)?.[0] ?? "");
chk("mọi locator đều là this.page.getByRole (do Playwright sinh)",
    (po.content.match(/this\.page\.getByRole/g) ?? []).length === 6, String((po.content.match(/this\.page\.getByRole/g) ?? []).length));
chk("tên tiếng Việt có dấu -> identifier ASCII đọc được",
    po.exported.some(e => e.identifier === "themVaoGioButton") && po.exported.some(e => e.identifier === "maGiamGiaInput"),
    JSON.stringify(po.exported.map(e => e.identifier)));
chk(">>> TÊN TRÙNG không bị bỏ mất — được đánh số (nếu bỏ thì spec lại phải tự bịa selector)",
    po.exported.filter(e => e.name === "Thêm vào giỏ").length === 2 &&
    po.exported.some(e => e.identifier === "themVaoGioButton2"),
    JSON.stringify(po.exported.filter(e => e.name === "Thêm vào giỏ").map(e => e.identifier)));
chk("phần tử chưa có locator -> báo ở skipped, không lặng lẽ mất",
    po.skipped.length === 1 && po.skipped[0].why.includes("chưa resolve"), JSON.stringify(po.skipped));
chk("locator giữ NGUYÊN tên gốc có dấu (browser khớp theo tên thật)",
    po.content.includes("name: 'Mã giảm giá'"));
chk("có cảnh báo ĐỪNG SỬA TAY (vì sẽ bị ghi đè)", po.content.includes("ĐỪNG SỬA TAY"));

// ─────────── LẦN CHẠY THẬT 2026-08-24: locator KHÔNG có tiền tố `page.` ───────────
//
// `browser_generate_locator` trả về locator không tiền tố: `getByRole('button', {...})`,
// `locator('#btn-add-prod-001')`. Bản cũ của asMember() chỉ đổi `page.` → `this.page.`, nên
// dạng không tiền tố đi nguyên vào file .ts:
//     get cuahangButton(): Locator { return getByRole('button', ...); }
// `getByRole` là biến không tồn tại — file không compile, và lỗi chỉ nổ ở tsc/lúc chạy spec,
// cách chỗ sai (registry) vài bước, nên rất khó lần về nguyên nhân.
{
    const raw = PO.emitPageObject({
        registry: {
            elements: {
                'button|cửa hàng': { role: "button", name: "Cửa hàng", locator: "getByRole('button', { name: 'Cửa hàng' })" },
                'button|thêm vào giỏ': { role: "button", name: "Thêm vào giỏ", locator: "locator('#btn-add-prod-001')" },
                'textbox|mã giảm giá': { role: "textbox", name: "Mã giảm giá", locator: "page.getByLabel('Mã giảm giá')" },
                'button|áp dụng': { role: "button", name: "Áp dụng", locator: "this.page.getByRole('button', { name: 'Áp dụng' })" },
                // registry cũ trên đĩa còn nguyên văn markdown của MCP
                'button|thanh toán': { role: "button", name: "Thanh toán", locator: "### Result\ngetByRole('button', { name: 'Thanh toán' })" },
            },
        },
        className: "AppPage",
    });
    const bodies = [...raw.content.matchAll(/return ([^;]+);/g)].map(m => m[1].trim());
    chk(">>> MỌI accessor đều là biểu thức trên this.page (không có `return getByRole(...)` trần)",
        bodies.length === 5 && bodies.every(b => b.startsWith("this.page.")), JSON.stringify(bodies));
    chk("locator không tiền tố -> được thêm this.page.",
        bodies.includes("this.page.getByRole('button', { name: 'Cửa hàng' })") &&
        bodies.includes("this.page.locator('#btn-add-prod-001')"), JSON.stringify(bodies));
    chk("tiền tố page. -> đổi thành this.page. (không thành this.page.page.)",
        bodies.includes("this.page.getByLabel('Mã giảm giá')") && !raw.content.includes("this.page.page."));
    chk("đã là this.page. thì để nguyên, không nhân đôi",
        bodies.filter(b => b === "this.page.getByRole('button', { name: 'Áp dụng' })").length === 1, JSON.stringify(bodies));
    chk(">>> registry cũ còn nguyên văn '### Result' cũng được bóc vỏ, không lọt vào .ts",
        !raw.content.includes("### Result") && bodies.includes("this.page.getByRole('button', { name: 'Thanh toán' })"),
        JSON.stringify(bodies));
}

{
    const empty = PO.emitPageObject({ registry: { elements: {} } });
    chk("registry rỗng -> vẫn sinh file hợp lệ + NÓI RÕ vì sao rỗng và cách sửa",
        empty.exported.length === 0 && empty.content.includes("REGISTRY RỖNG") && empty.content.includes("UI-flow.md"),
        empty.content.slice(0, 200));
}

// ─────────── P3.1 step library ───────────
const flow = F.parseUiFlows(`## Flow: Áp mã
**Entry:** https://app.test/

1. Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng
2. Mở trang thanh toán
3. Nhập mã giảm giá vào ô nhập mã
4. Áp dụng mã
5. Kiểm tra đơn hàng vừa tạo
`).flows[0];

// visited: kết quả đi luồng — bước 5 là check nên không có element
const visited = [
    { step: 1, text: "…", action: "browser_click", element: 'button "Thêm vào giỏ"' },
    { step: 2, text: "…", action: "browser_click", element: 'button "Thanh toán"' },
    { step: 3, text: "…", action: "browser_type", element: 'textbox "Mã giảm giá"' },
    { step: 4, text: "…", action: "browser_click", element: 'button "Áp dụng"' },
];
const se = SE.emitSteps({ flow, visited, exported: po.exported });

chk(">>> step library gọi Page Object, KHÔNG chứa locator nào",
    !se.content.includes("getByRole") && se.content.includes("new AppPage(page)"),
    se.content.match(/getByRole.*/)?.[0] ?? "ok");
chk("bước nhập -> hàm nhận value", se.content.includes("value: string") && se.content.includes(".fill(value)"));
chk(">>> bước nhập CHẶN value rỗng (bẫy fill(undefined) của TC-D-002)",
    se.content.includes("thiếu giá trị để nhập") && se.content.includes("throw new Error"));
chk("bước click -> .click()", (se.content.match(/\.click\(\)/g) ?? []).length === 3, String((se.content.match(/\.click\(\)/g) ?? []).length));
chk("có openEntry() lấy từ **Entry:** của tài liệu", se.content.includes("openEntry") && se.content.includes("https://app.test/"));
chk(">>> bước QUAN SÁT không tự assert (đúng/sai đến từ Expected Result + expect() ở spec)",
    Boolean(se.steps.find(s => s.kind === "check")) && !codeOnly(se.content).includes("expect("),
    JSON.stringify({ check: se.steps.filter(s => s.kind === "check").length, expectTrongCode: codeOnly(se.content).match(/.*expect\(.*/)?.[0] ?? "không có" }));
chk("5 bước -> 5 hàm step", se.steps.length === 5, String(se.steps.length));

// ─────────── đi luồng DỪNG giữa đường -> KHÔNG sinh hàm rỗng ───────────
{
    const partial = SE.emitSteps({ flow, visited: visited.slice(0, 2), exported: po.exported });
    chk(">>> bước chưa đi tới -> KHÔNG sinh hàm rỗng (hàm rỗng = test xanh giả)",
        partial.unimplemented.length === 2 &&
        !partial.steps.some(s => s.n === 3) &&
        partial.content.includes("CHƯA CÓ STEP CHO CÁC BƯỚC SAU"),
        JSON.stringify({ un: partial.unimplemented.map(u => u.n), steps: partial.steps.map(s => s.n) }));
    chk("và ghi rõ lý do + cách sửa", partial.content.includes("chưa tới bước này") && partial.content.includes("explore lại"));
}

// ─────────── catalogue = từ vựng BỊ CHẶN cho Gherkin ───────────
{
    const cat = SE.stepCatalogue(se);
    chk(">>> catalogue liệt kê đúng step CÓ CODE (từ vựng bị chặn cho Gherkin writer)",
        cat.available.length === 5 && cat.available.every(s => s.name && s.text), JSON.stringify(cat.available.map(s => s.name)));
    chk("catalogue đánh dấu step nào cần value", cat.available.filter(s => s.needsValue).length === 1);
    const catPartial = SE.stepCatalogue(SE.emitSteps({ flow, visited: visited.slice(0, 2), exported: po.exported }));
    chk("step thiếu được liệt kê riêng ở missing, không trộn vào available",
        catPartial.missing.length === 2 && catPartial.available.length === 3, JSON.stringify(catPartial));
}

// ─────────── accessorFor ───────────
chk("accessorFor khớp theo role+name", PO.accessorFor(po.exported, "textbox", "Mã giảm giá") === "maGiamGiaInput");
chk("accessorFor không có -> null (không trả bừa)", PO.accessorFor(po.exported, "button", "Không tồn tại") === null);

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
