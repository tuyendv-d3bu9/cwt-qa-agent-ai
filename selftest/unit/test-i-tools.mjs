// Test 4 tool deterministic của mục I. KHÔNG gọi LLM, KHÔNG gọi MCP.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");

const SP = await import(abs("agents/qa-automation/tools/snapshot-parser.js"));
const REG = await import(abs("agents/qa-automation/tools/ui-element-registry.js"));
const SPL = await import(abs("agents/qa-automation/tools/step-planner.js"));
const EXP = await import(abs("agents/qa-automation/tools/testcase-exporter.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// ─────────── fixture: snapshot a11y YAML như @playwright/mcp trả về ───────────
const SNAPSHOT = `- generic [ref=e1]:
  - heading "Giỏ hàng" [level=1] [ref=e2]
  - list [ref=e3]:
    - listitem [ref=e4]:
      - text: Áo thun x2
      - text: 400.000
  - textbox "Mã giảm giá" [ref=e14]
  - button "Áp dụng" [ref=e15]
  - button "Xoá mã" [disabled] [ref=e16]
  - combobox "Tỉnh/Thành" [ref=e20]
  - text: Tổng: 840.000
  - link "Điều khoản" [ref=e30]`;

const { nodes, unparsed } = SP.parseSnapshot(SNAPSHOT);
chk("parse được cây a11y YAML (không phải HTML)", nodes.length === 12, `${nodes.length} node`);
chk("không có dòng nào parse lỗi", unparsed.length === 0, JSON.stringify(unparsed));

const textbox = nodes.find(n => n.role === "textbox");
chk("lấy đúng role + accessible name + ref", textbox?.name === "Mã giảm giá" && textbox?.ref === "e14", JSON.stringify(textbox));
chk("lấy được attribute trong ngoặc vuông", nodes.find(n => n.name === "Xoá mã")?.attrs.disabled === true, JSON.stringify(nodes.find(n => n.name === "Xoá mã")));
chk("lấy được node text thuần", nodes.some(n => n.role === "text" && n.text === "Tổng: 840.000"));
chk("dựng được path cha-con", nodes.find(n => n.text === "Áo thun x2")?.path.includes("listitem"), nodes.find(n => n.text === "Áo thun x2")?.path);

const inter = SP.interactiveNodes(nodes);
chk("nhận đúng node tương tác được", inter.length === 5 && inter.every(n => n.ref), `${inter.length}`);

const kws = SP.keywordsFrom('Nhập "SALE20" vào ô Mã giảm giá');
chk("keywordsFrom bắt được chuỗi trong ngoặc kép", kws.includes("sale20"));
const filtered = SP.filterByKeywords(nodes, kws);
chk("lọc bỏ node không liên quan", filtered.length < nodes.length && filtered.some(n => n.name === "Mã giảm giá"), `${filtered.length}/${nodes.length}`);

const promptLines = SP.toPromptLines(filtered);
chk("dạng prompt NHỎ HƠN snapshot thô", promptLines.length < SNAPSHOT.length, `${promptLines.length} vs ${SNAPSHOT.length}`);
chk("vượt limit -> nói rõ đã cắt", SP.toPromptLines(nodes, { limit: 3 }).includes("bị giới hạn 3"));

// fingerprint bỏ qua ref (ref đổi giữa 2 lần chụp cùng trang)
const shifted = SNAPSHOT.replace(/ref=e(\d+)/g, (_, d) => `ref=e${Number(d) + 100}`);
chk("fingerprint KHÔNG đổi khi chỉ ref đổi", SP.structureFingerprint(nodes) === SP.structureFingerprint(SP.parseSnapshot(shifted).nodes));
const changed = SNAPSHOT.replace('button "Áp dụng"', 'button "Xác nhận mã"');
chk("fingerprint ĐỔI khi cấu trúc/nhãn đổi", SP.structureFingerprint(nodes) !== SP.structureFingerprint(SP.parseSnapshot(changed).nodes));

chk("bóc được text từ envelope MCP", SP.snapshotTextFrom({ content: [{ type: "text", text: "abc" }] }) === "abc");

// ─────────── LẦN CHẠY THẬT 2026-08-24: thuộc tính dạng `- /url:` ───────────
//
// Playwright phát một số thuộc tính thành dòng CON có tiền tố `/`, không phải `[key=value]`
// trên chính dòng của node. `HEAD_RE` bắt đầu ở `[a-zA-Z]` nên `/url` không khớp và mọi dòng
// như thế rơi vào `unparsed` — đúng là "7 dòng không parse được" trong log (7 link ở footer).
// Cảnh báo giả kiểu này nguy hiểm vì nó dạy người đọc bỏ qua cảnh báo parse.
{
    const withProps = `- navigation [ref=f1]:
  - link "Dashboard" [ref=f2e193] [cursor=pointer]:
    - /url: "#"
  - link "Trang chủ" [ref=f3]:
    - /url: "https://app.test/home"
  - textbox "Mã giảm giá" [ref=f4]:
    - /placeholder: "Nhập mã"
  - link "Trống" [ref=f5]:
    - /url:`;
    const r = SP.parseSnapshot(withProps);
    chk(">>> dòng `- /url:` KHÔNG còn bị báo là không parse được", r.unparsed.length === 0, JSON.stringify(r.unparsed));
    chk("thuộc tính `/` gán vào node CHA, không sinh node rác",
        r.nodes.length === 5 && r.nodes.filter(n => n.role === "link").length === 3, JSON.stringify(r.nodes.map(n => n.role)));
    chk("giá trị `/url` được gỡ ngoặc kép và gán đúng chủ",
        r.nodes.find(n => n.name === "Trang chủ")?.attrs["/url"] === "https://app.test/home",
        JSON.stringify(r.nodes.find(n => n.name === "Trang chủ")?.attrs));
    chk("thuộc tính `/` không lẫn với thuộc tính [key=value] của cùng node",
        r.nodes.find(n => n.name === "Dashboard")?.attrs.cursor === "pointer" &&
        r.nodes.find(n => n.name === "Dashboard")?.attrs["/url"] === "#",
        JSON.stringify(r.nodes.find(n => n.name === "Dashboard")?.attrs));
    chk("`/placeholder` cũng vào đúng textbox",
        r.nodes.find(n => n.role === "textbox")?.attrs["/placeholder"] === "Nhập mã");
    chk("`- /url:` giá trị rỗng vẫn khớp (không rơi vào unparsed)",
        r.nodes.find(n => n.name === "Trống")?.attrs["/url"] === "");
    chk("thuộc tính không phá cấu trúc: link vẫn là node tương tác được",
        SP.interactiveNodes(r.nodes).length === 4, String(SP.interactiveNodes(r.nodes).length));
}

// ─────────── registry ───────────
let reg = { url: null, elements: {}, fingerprint: null, updatedAt: null };
REG.putElement(reg, { role: "textbox", name: "Mã giảm giá", locator: "getByLabel('Mã giảm giá')", ref: "e14" });
chk("tra được theo role+name", REG.getElement(reg, "textbox", "Mã giảm giá")?.locator === "getByLabel('Mã giảm giá')");
chk("key chịu được khác hoa/thường + khoảng trắng", REG.getElement(reg, "TEXTBOX", "  mã  giảm  giá ")?.ref === "e14");

// ref đổi giữa 2 snapshot -> locator PHẢI giữ nguyên
REG.putElement(reg, { role: "textbox", name: "Mã giảm giá", locator: null, ref: "e114" });
const after = REG.getElement(reg, "textbox", "Mã giảm giá");
chk(">>> refresh không có locator -> KHÔNG mất locator cũ", after.locator === "getByLabel('Mã giảm giá')" && after.ref === "e114", JSON.stringify(after));

REG.putElement(reg, { role: "button", name: "Áp dụng", locator: null, ref: "e15" });
chk("chỉ tính là 'đã giải quyết' khi CÓ locator", REG.resolvedElements(reg).length === 1);
chk("missingElements chỉ ra đúng phần tử chưa có locator",
    JSON.stringify(REG.missingElements(reg, [{ role: "textbox", name: "Mã giảm giá" }, { role: "button", name: "Áp dụng" }]).map(w => w.name)) === JSON.stringify(["Áp dụng"]));

chk("registry chưa stamp -> coi là stale", REG.isStale(reg, { url: "u", fingerprint: "f" }));
REG.stamp(reg, { url: "https://x.test", fingerprint: "fp1" });
chk("stamp rồi + khớp -> không stale", !REG.isStale(reg, { url: "https://x.test", fingerprint: "fp1" }));
chk("cấu trúc trang đổi -> stale (locator có thể không còn đúng)", REG.isStale(reg, { url: "https://x.test", fingerprint: "fp2" }));
chk("đổi URL -> stale", REG.isStale(reg, { url: "https://y.test", fingerprint: "fp1" }));

// ─────────── step planner ───────────
const cases = [
    ['Nhập "SALE20" vào ô Mã giảm giá', "type", "browser_type"],
    ["Bấm nút Áp dụng", "click", "browser_click"],
    ["Vào trang https://x.test/checkout", "navigate", "browser_navigate"],
    ["Chọn Hà Nội trong dropdown Tỉnh/Thành", "select", "browser_select_option"],
    ["Nhấn Enter", "press", "browser_press_key"],
    ["Kiểm tra tổng tiền giảm còn 700.000", "expectation", null],
];
for (const [step, action, tool] of cases) {
    const p = SPL.planStep(step);
    chk(`rule bắt được: "${step.slice(0, 34)}…" -> ${action}`, p?.action === action && p?.tool === tool, JSON.stringify(p));
}
chk("bước lạ -> trả null để nhường cho LLM (không đoán)", SPL.planStep("Xoay điện thoại rồi lắc 3 lần") === null);
chk('rule "nhập" nhưng thiếu đích -> null, không bắn call nửa vời', SPL.planStep("Nhập gì đó") === null);

const grouped = SPL.planSteps(['Nhập "A" vào ô Tên', 'Nhập "B" vào ô Email', "Bấm nút Gửi"]);
chk("gộp 2 bước nhập liền nhau thành 1 lần fill_form", grouped[0].kind === "form" && grouped[0].plans.length === 2 && grouped[1].kind === "single", JSON.stringify(grouped.map(g => g.kind)));

const cov = SPL.coverage(cases.map(c => c[0]).concat(["Xoay điện thoại"]));
chk("coverage báo đúng số bước cần LLM", cov.total === 7 && cov.byRule === 6 && cov.needLLM === 1, JSON.stringify(cov));
chk("whitelist gọn (không phải 60+ tool)", SPL.WHITELIST.length === 8);

// ─────────── testcase exporter ───────────
const TABLE = `| TC_ID | Title | Precondition | Steps | Test Data | Expected Result | Priority | Tags |
|---|---|---|---|---|---|---|---|
| TC-D-001 | Áp mã đúng ngưỡng | Có hàng trong giỏ | 1. Vào checkout 2. Nhập mã 3. Bấm Áp dụng | voucher_code=SALE20, order_total=840000 | Giảm 140.000, còn 700.000 | High | boundary |
| TC-D-002 | Mã chữ thường | Có hàng | 1. Nhập mã | voucher_code=sale20 | Báo lỗi không hợp lệ | Medium | [BUG-1163] |
| TC-D-003 | Thiếu cột |
`;
const ds = EXP.buildDataset(TABLE);
chk("export đúng số test case hợp lệ", ds.cases.length === 2, `${ds.cases.length}`);
chk(">>> hàng thiếu cột bị GIỮ LẠI trong malformed, không nhận âm thầm", ds.malformed.length === 1 && ds.malformed[0].id === "TC-D-003", JSON.stringify(ds.malformed));
chk("tách Steps thành mảng", ds.cases[0].steps.length === 3 && ds.cases[0].steps[1] === "Nhập mã");
chk("parse Test Data thành field key=value", ds.cases[0].data.fields.voucher_code === "SALE20" && ds.cases[0].data.fields.order_total === "840000", JSON.stringify(ds.cases[0].data));
chk("Expected Result giữ nguyên text (expect() lo phần số học)", ds.cases[0].expected.includes("700.000"));
chk("giữ Priority + Tags", ds.cases[1].priority === "Medium" && ds.cases[1].tags === "[BUG-1163]");
chk("Test Data không phải key=value -> vào _raw, không mất", EXP.parseTestData("giỏ có 2 áo thun")._raw === "giỏ có 2 áo thun");

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
