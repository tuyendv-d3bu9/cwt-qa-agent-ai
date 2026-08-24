// agents/qa-automation/tools/page-object-emitter.js
// Emit a Page Object from the element registry. DETERMINISTIC — no LLM writes a line of it.
//
// WHY THIS CLOSES THE HOLE RATHER THAN GUARDING IT. Until now the LLM wrote each spec whole,
// which meant it also invented the selectors. It produced things like
// `page.click('button[ref="f15e27"]')` — `ref=eN` is the transient handle MCP hands out for
// ONE snapshot, not a DOM attribute, so that selector matches nothing ever and the test
// times out after 30s. spec-assertion-check.js now detects that string, but detection is a
// guard on a hole; this file removes the hole. Locators here come only from:
//   registry.elements[*].locator  ←  browser_generate_locator  ←  Playwright itself
// so there is no step at which a language model could invent one.
//
// GENERIC: nothing about any application. Names come from the accessible names the browser
// reported, so a different project yields a different Page Object from the same code.

/** Reserved words + anything that cannot start a JS identifier. */
const RESERVED = new Set([
    "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do",
    "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "import",
    "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw", "true",
    "try", "typeof", "var", "void", "while", "with", "yield", "let", "static", "await", "page",
]);

/**
 * Accessible name -> JS property name. Vietnamese diacritics are stripped so the identifier
 * is plain ASCII, while the LOCATOR keeps the original name untouched — the browser matches
 * on the real name, the identifier only has to be readable and unique.
 */
export function toIdentifier(role, name) {
    const base = String(name ?? "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .replace(/[^A-Za-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join("");

    const roleSuffix = { button: "Button", textbox: "Input", searchbox: "Input", link: "Link", checkbox: "Checkbox", combobox: "Select" }[role] ?? "";
    let id = base ? base + roleSuffix : (role || "el");
    if (!/^[A-Za-z_$]/.test(id)) id = "el" + id.charAt(0).toUpperCase() + id.slice(1);
    if (RESERVED.has(id)) id = id + "_";
    return id;
}

/** `page.getByRole('button', { name: 'X' })` -> `this.page.getByRole(...)` for class use. */
function asMember(locator) {
    return String(locator ?? "").replace(/^page\./, "this.page.");
}

/**
 * @param {object} o
 * @param {object} o.registry       loaded ui-element-registry
 * @param {string} [o.className]
 * @param {string} [o.baseUrl]      used only for the doc comment, never hardcoded into code
 * @returns {{ content: string, exported: Array<{identifier: string, role: string, name: string}>, skipped: Array }}
 */
export function emitPageObject({ registry, className = "AppPage", baseUrl = null }) {
    const all = Object.values(registry?.elements ?? {});
    const usable = all.filter(e => e.locator && e.name);
    const skipped = all
        .filter(e => !e.locator || !e.name)
        .map(e => ({ role: e.role ?? "?", name: e.name ?? "(không tên)", why: !e.name ? "không có accessible name" : "chưa resolve được locator" }));

    // Two elements can share an accessible name (every product card has "Thêm vào giỏ").
    // Suffix duplicates rather than dropping them: a silently missing accessor sends the
    // spec generator back to inventing a selector, which is the whole thing being fixed.
    const used = new Map();
    const exported = [];
    for (const e of usable) {
        const wanted = toIdentifier(e.role, e.name);
        const seen = used.get(wanted) ?? 0;
        used.set(wanted, seen + 1);
        exported.push({
            identifier: seen === 0 ? wanted : `${wanted}${seen + 1}`,
            role: e.role ?? "",
            name: e.name,
            locator: e.locator,
            duplicateOf: seen === 0 ? null : wanted,
        });
    }

    const lines = [
        `// SINH TỰ ĐỘNG bởi agents/qa-automation/tools/page-object-emitter.js — ĐỪNG SỬA TAY.`,
        `// Sửa tay sẽ bị ghi đè ở lần explore kế tiếp. Muốn đổi locator thì explore lại.`,
        `//`,
        `// Mọi locator dưới đây do PLAYWRIGHT sinh (browser_generate_locator) từ phần tử THẬT`,
        `// quan sát được trên UI, rồi lưu vào ui-element-registry. KHÔNG có bước nào do LLM viết,`,
        `// nên không thể xuất hiện selector bịa (ví dụ 'button[ref="f15e27"]' — ref là mã snapshot`,
        `// tạm của MCP, không phải attribute HTML, và không bao giờ khớp gì).`,
        baseUrl ? `//` : null,
        baseUrl ? `// Registry được dựng khi explore: ${baseUrl}` : null,
        ``,
        `import type { Page, Locator } from '@playwright/test';`,
        ``,
        `export class ${className} {`,
        `  constructor(readonly page: Page) {}`,
        ``,
    ].filter(v => v !== null);

    for (const e of exported) {
        lines.push(`  /** ${e.role}${e.name ? ` "${e.name.replace(/\*\//g, "*\\/")}"` : ""}${e.duplicateOf ? ` (cùng tên với ${e.duplicateOf})` : ""} */`);
        lines.push(`  get ${e.identifier}(): Locator { return ${asMember(e.locator)}; }`);
        lines.push(``);
    }

    if (exported.length === 0) {
        lines.push(
            `  // REGISTRY RỖNG — chưa explore được phần tử nào có locator.`,
            `  // Không có accessor nào để sinh. Kiểm tra: có đi được luồng không (flow-walker),`,
            `  // và tài liệu luồng ${"`project-docs/03_DEV/UI-flow.md`"} có bước nào đi tới màn hình cần test chưa.`,
            ``,
        );
    }

    lines.push(`}`, ``);

    return { content: lines.join("\n"), exported, skipped };
}

/** Look up the accessor for an element by role+name — used by the step/spec emitters. */
export function accessorFor(exported, role, name) {
    const exact = exported.find(e => e.role === role && e.name === name);
    if (exact) return exact.identifier;
    const byName = exported.find(e => e.name === name);
    return byName ? byName.identifier : null;
}
