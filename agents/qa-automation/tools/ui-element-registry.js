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

/**
 * Is this string an actual Playwright locator, or is it an MCP error text that happened to
 * arrive in the locator slot?
 *
 * LỖI THẬT ĐÃ XẢY RA (lần chạy 2026-08-23). MCP server được khởi động THIẾU `--caps=testing`
 * nên `browser_generate_locator` không tồn tại. Mỗi lời gọi trả về chuỗi:
 *
 *     "### Error\nTool \"browser_generate_locator\" not found"
 *
 * Chuỗi đó được lưu vào ô `locator`. Nó **truthy**, nên `resolvedElements()` đếm phần tử đó là
 * "đã có locator bền", và `putElement` còn CỐ Ý giữ nó lại ở lần refresh sau ("đừng mất một
 * locator đã có"). Kết quả: một thông báo lỗi được đối xử như một locator, vĩnh viễn.
 *
 * Kiểm bằng dấu hiệu PHỦ ĐỊNH, không phải khớp mẫu locator hợp lệ: một locator do Playwright
 * sinh là MỘT biểu thức trên MỘT dòng. Bắt buộc phải khớp `getBy...`/`locator(...)` là tự dựng
 * một luật đoán về định dạng của công cụ khác — nó đúng hôm nay và sai khi công cụ đổi.
 */
export function isUsableLocator(value) {
    if (typeof value !== "string") return false;
    const s = value.trim();
    if (!s) return false;
    if (s.includes("\n")) return false;          // locator là một biểu thức một dòng
    if (s.startsWith("#")) return false;         // "### Error ..."
    if (/\bError\b/.test(s)) return false;
    if (/not found|not available|unknown tool/i.test(s)) return false;
    return true;
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
    const incoming = isUsableLocator(locator) ? locator.trim() : null;
    if (locator != null && incoming === null) {
        console.warn(`  [registry] BỎ giá trị không phải locator cho "${role}|${name}": ${JSON.stringify(String(locator).slice(0, 80))}`);
    }
    const kept = isUsableLocator(existing?.locator) ? existing.locator : null;

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
    return registry.elements[elementKey(role, name)] ?? null;
}

/**
 * Elements that have a durable locator — the ones usable for spec generation.
 *
 * Lọc lại bằng `isUsableLocator` chứ không chỉ `e.locator` truthy: `ui-elements.json` trên đĩa
 * có thể là bản CŨ, sinh ra trước khi cửa vào có bộ lọc. Một file registry đã bị nhiễm phải
 * được bỏ qua khi ĐỌC, không phải chỉ được chặn khi GHI.
 */
export function resolvedElements(registry) {
    return Object.values(registry.elements).filter(e => isUsableLocator(e.locator));
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
