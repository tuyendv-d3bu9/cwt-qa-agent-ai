// Cửa gác locator — rút ra từ LẦN CHẠY THẬT 2026-08-23. KHÔNG gọi LLM, KHÔNG gọi MCP.
//
// CHUYỆN ĐÃ XẢY RA. MCP server khởi động thiếu `--caps=testing`, nên
// `browser_generate_locator` không tồn tại và mỗi lời gọi trả về:
//     "### Error\nTool \"browser_generate_locator\" not found"
// Chuỗi đó được lưu vào ô `locator` của registry. Nó truthy, nên:
//   - `resolvedElements()` đếm phần tử đó là "đã có locator bền"
//   - `missingElements()` kết luận "không thiếu gì" → KHÔNG BAO GIỜ xin lại locator
//   - `putElement()` còn cố ý giữ nó ở lần refresh sau ("đừng mất locator đã có")
// → registry tự duy trì trạng thái nhiễm qua mọi lần chạy. Locator lỗi sinh ngày 2026-08-17
//   còn nguyên trong `ui-elements.json` ngày 2026-08-23.
//
// Đo được trên lần chạy đó: 0 file `tests/pages/`, 0 file `.feature`, 21/21 spec đi đường dự
// phòng "LLM viết cả file", 9 spec chứa selector `ref=`.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const R = await import(abs("agents/qa-automation/tools/ui-element-registry.js"));
const M = await import(abs("agents/runtime/mcp-client.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);
const reg = () => ({ url: null, elements: {}, fingerprint: null, updatedAt: null });

// Tắt console.warn: putElement cố ý cảnh báo mỗi lần bỏ một giá trị rác.
const warn = console.warn; console.warn = () => { };

// ─────────── 1. isUsableLocator ───────────
{
    const bad = [
        ['### Error\nTool "browser_generate_locator" not found', "nguyên văn chuỗi đã gây lỗi thật"],
        ["", "chuỗi rỗng"],
        ["   ", "chỉ khoảng trắng"],
        ["Error: something", "bắt đầu bằng Error"],
        ["tool not found", "not found"],
        ["Tool NOT AVAILABLE", "not available"],
        ["getByRole('button')\ngetByRole('link')", "hai dòng — locator là MỘT biểu thức"],
        [null, "null"],
        [undefined, "undefined"],
        [42, "không phải chuỗi"],
    ];
    for (const [v, why] of bad) {
        chk(`từ chối: ${why}`, R.isUsableLocator(v) === false, JSON.stringify(String(v).slice(0, 40)));
    }
}
{
    const good = [
        "getByRole('button', { name: 'Thanh toán' })",
        `locator("#ma-giam-gia")`,
        "getByTestId('apply-voucher')",
        "getByLabel('Mã giảm giá')",
    ];
    for (const v of good) chk(`chấp nhận locator thật: ${v.slice(0, 30)}`, R.isUsableLocator(v) === true, v);
}

// ─────────── 2. Cửa VÀO: không lưu chuỗi rác ───────────
{
    const r = reg();
    R.putElement(r, { role: "button", name: "Thanh toán", locator: '### Error\nTool "x" not found' });
    chk(">>> nạp chuỗi lỗi → ô locator thành null, KHÔNG lưu nguyên văn",
        r.elements["button|thanh toán"].locator === null, JSON.stringify(r.elements["button|thanh toán"]));
    chk("phần tử vẫn được ghi lại (biết là đã thấy nó, chỉ chưa có locator)",
        r.elements["button|thanh toán"].role === "button");
}

// ─────────── 3. Không đếm rác là "đã giải quyết" ───────────
{
    const r = reg();
    R.putElement(r, { role: "button", name: "A", locator: "### Error\nnot found" });
    R.putElement(r, { role: "button", name: "B", locator: "getByRole('button', { name: 'B' })" });
    chk(">>> resolvedElements chỉ đếm locator THẬT", R.resolvedElements(r).length === 1, String(R.resolvedElements(r).length));
    chk("phần tử được đếm là đúng cái có locator thật", R.resolvedElements(r)[0].name === "B");
}

// ─────────── 4. Chỗ QUAN TRỌNG NHẤT: registry nhiễm phải TỰ CHỮA được ───────────
{
    // Mô phỏng `ui-elements.json` cũ trên đĩa: locator là chuỗi lỗi, sinh từ lần chạy trước.
    const r = reg();
    r.elements["button|thanh toán"] = {
        role: "button", name: "Thanh toán",
        locator: '### Error\nTool "browser_generate_locator" not found',
        ref: "e23", source: "browser_find", firstSeen: "2026-08-17T11:15:38.717Z",
    };
    chk(">>> registry NHIỄM vẫn báo là còn thiếu → lần chạy sau xin lại locator (tự chữa)",
        R.missingElements(r, [{ role: "button", name: "Thanh toán" }]).length === 1,
        JSON.stringify(R.missingElements(r, [{ role: "button", name: "Thanh toán" }])));
    chk("tra theo TÊN (không có role) cũng báo còn thiếu",
        R.missingElements(r, [{ name: "Thanh toán" }]).length === 1);

    // Rồi khi locator thật về, nó ghi đè được chuỗi rác.
    R.putElement(r, { role: "button", name: "Thanh toán", locator: "getByRole('button', { name: 'Thanh toán' })" });
    chk("locator thật GHI ĐÈ được chuỗi rác cũ",
        R.missingElements(r, [{ role: "button", name: "Thanh toán" }]).length === 0
        && R.resolvedElements(r).length === 1,
        JSON.stringify(r.elements["button|thanh toán"].locator));
}

// ─────────── 5. Vẫn giữ locator thật khi lần refresh sau không mang về gì ───────────
{
    const r = reg();
    R.putElement(r, { role: "button", name: "A", locator: "getByRole('button', { name: 'A' })" });
    R.putElement(r, { role: "button", name: "A", locator: null, ref: "e99" });
    chk("refresh không có locator thì GIỮ locator cũ (không tự làm mất thứ đã có)",
        r.elements["button|a"].locator === "getByRole('button', { name: 'A' })", JSON.stringify(r.elements["button|a"]));
}
{
    const r = reg();
    R.putElement(r, { role: "button", name: "A", locator: "getByRole('button', { name: 'A' })" });
    R.putElement(r, { role: "button", name: "A", locator: "### Error\nnot found" });
    chk(">>> nhưng một chuỗi RÁC KHÔNG được ghi đè locator thật đang có",
        r.elements["button|a"].locator === "getByRole('button', { name: 'A' })", JSON.stringify(r.elements["button|a"].locator));
}

// ─────────── 6. LẦN CHẠY THẬT 2026-08-24: locator ĐÚNG nhưng bọc trong markdown ───────────
//
// Lần này `browser_generate_locator` đã tồn tại và trả về locator ĐÚNG — chỉ là bọc markdown:
//     "### Result\ngetByRole('button', { name: 'Cửa hàng' })"
// Bộ lọc phủ định của mục 1 (có `\n`, bắt đầu bằng `#`) loại sạch 100% locator hợp lệ:
//     [registry] BỎ giá trị không phải locator cho "button|Cửa hàng": "### Result\n..."
// → registry 0 phần tử → app.page.ts 0 accessor → catalogue.available 0 step → Gherkin
//   scenario rỗng và bị self-check chặn ("Trường \"steps\" rỗng").
// Hai mục 1 và 6 kéo ngược nhau, và đó chính là bài test: PHẢI bỏ vỏ mà vẫn chặn chuỗi lỗi.
{
    const wrapped = [
        ['### Result\ngetByRole(\'button\', { name: \'Cửa hàng\' })', "getByRole('button', { name: 'Cửa hàng' })", "### Result + getByRole"],
        ["### Result\nlocator('#btn-add-prod-001')", "locator('#btn-add-prod-001')", "### Result + locator(#id)"],
        ["## Locator\n\npage.getByLabel('Mã giảm giá')", "page.getByLabel('Mã giảm giá')", "heading khác + tiền tố page."],
        ["```js\ngetByTestId('apply-voucher')\n```", "getByTestId('apply-voucher')", "code fence"],
        ["### Result\ngetByRole('button', { name: 'X' });", "getByRole('button', { name: 'X' })", "dấu ; cuối bị cắt"],
    ];
    for (const [raw, want, why] of wrapped) {
        chk(`>>> bóc vỏ markdown: ${why}`, R.cleanLocator(raw) === want, JSON.stringify(R.cleanLocator(raw)));
    }
    chk(">>> locator bọc markdown ĐƯỢC LƯU (đây là lỗi làm registry rỗng sạch)",
        R.isUsableLocator("### Result\ngetByRole('button', { name: 'Cửa hàng' })") === true);

    const r = reg();
    R.putElement(r, { role: "button", name: "Cửa hàng", locator: "### Result\ngetByRole('button', { name: 'Cửa hàng' })" });
    chk(">>> registry lưu dạng ĐÃ BÓC VỎ, không lưu nguyên văn MCP (chuỗi này ghép thẳng vào .ts)",
        r.elements["button|cửa hàng"].locator === "getByRole('button', { name: 'Cửa hàng' })",
        JSON.stringify(r.elements["button|cửa hàng"].locator));

    // Vỏ markdown bị bóc, nhưng RUỘT là câu báo lỗi thì vẫn phải ra null.
    chk("### Error + 'not found' vẫn bị từ chối sau khi bóc vỏ",
        R.cleanLocator('### Error\nTool "browser_generate_locator" not found') === null);
    // Và "not found"/"error" NẰM TRONG một locator thật thì không được coi là báo lỗi:
    // getByText('... not found') là locator hợp lệ cho thông báo lỗi trên UI — thứ QA hay test nhất.
    chk(">>> 'not found' bên trong locator THẬT không bị hiểu là báo lỗi",
        R.cleanLocator("getByText('Sản phẩm not found')") === "getByText('Sản phẩm not found')",
        JSON.stringify(R.cleanLocator("getByText('Sản phẩm not found')")));
    chk(">>> locator cho thông báo lỗi trên UI vẫn dùng được",
        R.isUsableLocator("getByRole('alert', { name: 'Error' })") === true);

    // Một registry cũ trên đĩa còn giữ nguyên văn markdown thì chỗ ĐỌC phải bóc, không phải
    // bắt mọi chỗ dùng tự nhớ bóc.
    const old = reg();
    old.elements["button|cửa hàng"] = {
        role: "button", name: "Cửa hàng",
        locator: "### Result\ngetByRole('button', { name: 'Cửa hàng' })",
        ref: "e7", source: "browser_find", firstSeen: "2026-08-24T02:00:00.000Z",
    };
    chk("resolvedElements bóc vỏ cho file cũ trên đĩa",
        R.resolvedElements(old)[0]?.locator === "getByRole('button', { name: 'Cửa hàng' })",
        JSON.stringify(R.resolvedElements(old)[0]?.locator));
    chk("getElement cũng bóc vỏ (không phát rác cho chỗ gọi)",
        R.getElement(old, "button", "Cửa hàng").locator === "getByRole('button', { name: 'Cửa hàng' })");
    chk("registry đã có locator thật (dù bọc vỏ) thì KHÔNG bị coi là còn thiếu",
        R.missingElements(old, [{ role: "button", name: "Cửa hàng" }]).length === 0);
}

// ─────────── 7. Danh sách tool bắt buộc của MCP ───────────
{
    chk(">>> browser_generate_locator nằm trong REQUIRED_TOOLS (thiếu nó là mất cả P4)",
        M.REQUIRED_TOOLS.includes("browser_generate_locator"), JSON.stringify(M.REQUIRED_TOOLS));
    chk("REQUIRED_TOOLS đủ bộ đi luồng tối thiểu",
        ["browser_snapshot", "browser_navigate", "browser_click", "browser_type", "browser_find"]
            .every(t => M.REQUIRED_TOOLS.includes(t)), JSON.stringify(M.REQUIRED_TOOLS));
}

console.warn = warn;
const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nlocator-guard: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
