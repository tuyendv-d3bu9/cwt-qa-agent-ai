// agents/qa-automation/tools/ui-element-registry.js
// Deterministic (NO LLM) registry of UI elements discovered during exploration.
//
// WHY — every test case of a feature usually touches the SAME page. Without a registry,
// each test case re-explores that page from scratch: N test cases means paying N times
// to describe one page. The registry makes exploration happen once and be reused.
//
// !! THE TRAP THIS AVOIDS: `ref=eN` from a snapshot is valid ONLY inside that snapshot.
// It changes between captures of the very same page. Keying the registry by `ref` would
// look fine on the first test case and silently target the wrong element afterwards.
// So the registry stores:
//   - key      = role + accessible name        (stable across snapshots)
//   - locator  = Playwright locator string     (the durable artifact; from
//                browser_generate_locator, i.e. produced by Playwright itself)
//   - ref      = transient, re-resolved per session, NEVER the lookup key
//
// Storage is tier 4 (.qa-run/ — see paths.js) — per-run data. Cross-run reuse would need tier 2;
// not done yet, and the fingerprint used for incremental authoring is kept in the DB
// instead (see agents/runtime/db.js artifacts).

import { runTool } from "../../runtime/tools.js";
import * as P from "../../runtime/paths.js";

export const REGISTRY_PATH = P.UI_ELEMENTS;

/** Stable lookup key. Case/whitespace-insensitive so trivial wording drift still hits. */
export function elementKey(role, name) {
    return `${String(role ?? "").toLowerCase()}|${String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export async function loadRegistry(path = REGISTRY_PATH) {
    const res = await runTool("read_json", { path });
    if (res.error) return { url: null, elements: {}, fingerprint: null, updatedAt: null };
    const data = res.data ?? {};
    return {
        url: data.url ?? null,
        elements: data.elements ?? {},
        fingerprint: data.fingerprint ?? null,
        updatedAt: data.updatedAt ?? null,
    };
}

export async function saveRegistry(registry, path = REGISTRY_PATH) {
    const res = await runTool("write_json", { path, data: registry });
    if (res.error) throw new Error(`Không ghi được ${path}: ${res.error}`);
    return registry;
}

/** Dòng chỉ là trang trí markdown, không bao giờ là locator. */
const MARKDOWN_NOISE = /^(#{1,6}\s|```|\/\/|\/\*|\*\s|>\s|-\s|\d+\.\s)/;

/** Một biểu thức locator của Playwright. Dùng để CHỌN dòng, không dùng để hợp lệ hoá. */
const LOCATOR_EXPR = /^(await\s+)?((page|this\.page|frame)\s*\.\s*)?(getBy[A-Za-z]+|locator|frameLocator|filter|nth|first|last)\s*[(.]/;

/**
 * Bóc một locator dùng được ra khỏi văn bản MCP trả về, hoặc `null` nếu không có.
 *
 * LỖI THẬT ĐÃ XẢY RA — HAI LẦN, HAI KIỂU, CÙNG MỘT Ô DỮ LIỆU:
 *
 * 1. (2026-08-23) MCP thiếu `--caps=testing` nên `browser_generate_locator` không tồn tại và
 *    trả về `"### Error\nTool \"browser_generate_locator\" not found"`. Chuỗi đó **truthy** nên
 *    được đếm là "đã có locator bền" và được giữ lại qua mọi lần refresh. Một thông báo lỗi
 *    được đối xử như một locator, vĩnh viễn.
 * 2. (2026-08-24) Tool đã có, nhưng nó trả về locator ĐÚNG **bọc trong markdown**:
 *
 *        ### Result
 *        getByRole('button', { name: 'Cửa hàng' })
 *
 *    Bộ lọc ở (1) chặn theo dấu hiệu phủ định — có `\n`, bắt đầu bằng `#` — nên nó bỏ sạch
 *    100% locator hợp lệ. Registry còn 0 phần tử → Page Object không có accessor → step
 *    catalogue rỗng → Gherkin scenario không có step nào và bị self-check chặn.
 *
 * Bài học: chỉ phủ định là không đủ, vì cái vỏ (markdown) và cái ruột (biểu thức) nằm chung
 * một chuỗi. Trình tự ở đây:
 *   1. Bỏ vỏ: code fence, heading, comment, bullet.
 *   2. Còn ĐÚNG MỘT dòng là biểu thức locator → đó là nó. Hai dòng biểu thức là NHẬP NHẰNG,
 *      trả `null` — chọn bừa một trong hai là đoán, mà đoán locator là đúng cái phải tránh.
 *   3. Không có dòng nào khớp mẫu mà còn lại đúng một dòng → tạm nhận, TRỪ khi dòng đó mang
 *      dấu hiệu câu báo lỗi. Nhánh này để định dạng Playwright có đổi thì đây không thành chỗ
 *      chặn; và bộ lọc "Error/not found" chỉ áp vào ĐÂY, không áp vào (2) — vì
 *      `getByText('Sản phẩm not found')` là một locator hoàn toàn hợp lệ.
 */
export function cleanLocator(raw) {
    if (typeof raw !== "string") return null;
    const s = raw.replace(/\r\n?/g, "\n").trim();
    if (!s) return null;

    // Ưu tiên nội dung trong code fence nếu MCP bọc kiểu ```js ... ```
    const fenced = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(s);
    const body = fenced ? fenced[1] : s;

    const lines = body.split("\n").map(l => l.trim()).filter(Boolean)
        .filter(l => !MARKDOWN_NOISE.test(l));
    if (lines.length === 0) return null;

    const exprs = lines.filter(l => LOCATOR_EXPR.test(l));
    if (exprs.length === 1) return exprs[0].replace(/;+\s*$/, "").trim() || null;
    if (exprs.length > 1) return null;   // nhập nhằng — không chọn bừa

    if (lines.length !== 1) return null;
    const only = lines[0];
    if (/\berror\b|\bfailed\b|not found|not available|unknown tool|is not a function/i.test(only)) return null;
    return only.replace(/;+\s*$/, "").trim() || null;
}

/**
 * Ô `locator` này có dùng được không? Định nghĩa theo `cleanLocator` để chỗ ĐỌC và chỗ GHI
 * không bao giờ lệch luật nhau — đúng cái lệch đã sinh ra lỗi (2) ở trên.
 */
export function isUsableLocator(value) {
    return cleanLocator(value) !== null;
}

/**
 * Add/refresh one element. `ref` is stored for convenience within the current session
 * but is explicitly marked transient so nothing downstream treats it as durable.
 */
export function putElement(registry, { role, name, locator, ref = null, source = null }) {
    const key = elementKey(role, name);
    const existing = registry.elements[key];

    // Lọc ở CỬA VÀO. Nếu lọc ở chỗ đọc ra thì mỗi chỗ đọc phải tự nhớ mà lọc, và chỗ nào quên
    // là chỗ đó sinh ra `page.locator('### Error...')` — một selector không bao giờ khớp, trong
    // một file spec trông hoàn toàn bình thường.
    // Lưu dạng đã BÓC VỎ, không lưu nguyên văn MCP: mọi chỗ dùng về sau (page object,
    // step emitter, spec) ghép thẳng chuỗi này vào code TypeScript.
    const incoming = cleanLocator(locator);
    if (locator != null && incoming === null) {
        console.warn(`  [registry] BỎ giá trị không phải locator cho "${role}|${name}": ${JSON.stringify(String(locator).slice(0, 80))}`);
    }
    const kept = cleanLocator(existing?.locator);

    registry.elements[key] = {
        role,
        name,
        // Keep a locator we already have if the new call did not bring one — losing a
        // durable locator because one refresh failed to generate it would be a regression.
        locator: incoming ?? kept,
        ref,                    // transient: valid only for the snapshot it came from
        source: source ?? existing?.source ?? null,
        firstSeen: existing?.firstSeen ?? new Date().toISOString(),
    };
    return registry.elements[key];
}

export function getElement(registry, role, name) {
    const e = registry.elements[elementKey(role, name)];
    if (!e) return null;
    // Cùng lý do như `resolvedElements`: một registry cũ trên đĩa có thể còn giữ nguyên văn
    // markdown của MCP. Người đọc nhận về locator đã bóc vỏ, hoặc `null` — không nhận rác.
    return { ...e, locator: cleanLocator(e.locator) };
}

/**
 * Elements that have a durable locator — the ones usable for spec generation.
 *
 * Lọc lại bằng `cleanLocator` chứ không chỉ `e.locator` truthy: `ui-elements.json` trên đĩa
 * có thể là bản CŨ, sinh ra trước khi cửa vào có bộ lọc. Một file registry đã bị nhiễm phải
 * được bỏ qua khi ĐỌC, không phải chỉ được chặn khi GHI.
 *
 * Và trả về locator ĐÃ BÓC VỎ: một file cũ có thể còn giữ nguyên `"### Result\n..."`. Bóc ở đây
 * để file cũ tự lành khi đọc, thay vì bắt mọi chỗ dùng phải tự nhớ bóc.
 */
export function resolvedElements(registry) {
    return Object.values(registry.elements)
        .map(e => ({ ...e, locator: cleanLocator(e.locator) }))
        .filter(e => e.locator !== null);
}

/**
 * Which of the wanted elements the registry cannot answer yet. These — and only these —
 * justify another MCP round trip.
 * @param {Array<{role?: string, name: string}>} wanted
 */
export function missingElements(registry, wanted) {
    // `isUsableLocator` chứ không phải truthy — và đây là chỗ QUAN TRỌNG NHẤT của bộ lọc đó.
    // Với một registry đã nhiễm chuỗi lỗi, phép kiểm truthy kết luận "không thiếu gì", nên
    // KHÔNG BAO GIỜ xin lại locator: registry tự duy trì trạng thái nhiễm của chính nó qua mọi
    // lần chạy sau. Đó là lý do `ui-elements.json` mang locator lỗi từ 2026-08-17 sang tận
    // lần chạy 2026-08-23 mà không lần nào tự chữa.
    return wanted.filter(w => {
        // A name-only request matches any role with that name.
        if (!w.role) {
            return !Object.values(registry.elements).some(
                e => elementKey(e.role, e.name).endsWith("|" + String(w.name).trim().toLowerCase().replace(/\s+/g, " "))
                    && isUsableLocator(e.locator)
            );
        }
        return !isUsableLocator(getElement(registry, w.role, w.name)?.locator);
    });
}

/**
 * A page structure change invalidates the registry: locators generated against the old
 * layout may no longer resolve. Returns true when the caller must re-explore.
 */
export function isStale(registry, { url, fingerprint }) {
    if (!registry.updatedAt) return true;
    if (url && registry.url && registry.url !== url) return true;
    if (fingerprint && registry.fingerprint && registry.fingerprint !== fingerprint) return true;
    return false;
}

export function stamp(registry, { url, fingerprint }) {
    registry.url = url ?? registry.url;
    registry.fingerprint = fingerprint ?? registry.fingerprint;
    registry.updatedAt = new Date().toISOString();
    return registry;
}
