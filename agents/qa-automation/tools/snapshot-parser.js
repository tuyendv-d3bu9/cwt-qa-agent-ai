// agents/qa-automation/tools/snapshot-parser.js
// Deterministic (NO LLM) parser for the accessibility snapshot that Playwright MCP
// returns from browser_snapshot.
//
// WHY THIS EXISTS — cost. Before this, every step of every test case sent the WHOLE
// snapshot into the prompt: N test cases x (M steps + 2) full snapshots, all describing
// the same page. Parsing it in code means the prompt gets only the handful of nodes the
// work at hand actually mentions.
//
// FORMAT: it is NOT HTML. browser_snapshot returns an indented accessibility tree,
// documented in @playwright/mcp as `- {ROLE} "Accessible Name":` with element handles
// like `[ref=e14]`. Example:
//
//   - generic [ref=e1]:
//     - heading "Giỏ hàng" [level=1] [ref=e2]
//     - textbox "Mã giảm giá" [ref=e14]
//     - button "Áp dụng" [ref=e15]
//     - text: Tổng: 840.000
//
// The `01_dom_explore.md` skill used to show raw HTML as its sample input, which taught
// the LLM to expect the wrong shape entirely.
//
// !! NOT YET VERIFIED against a live MCP connection (no live run has happened — that
// needs explicit confirmation each time). The parser is deliberately tolerant: unknown
// bracket attributes are kept as-is, and a line it cannot parse is reported rather than
// dropped, so the first live run surfaces any format drift instead of silently losing
// elements.

/** `ref=eN` is only valid inside the snapshot it came from — never persist it as a key. */
const LINE_RE = /^(\s*)-\s+(.*)$/;
const REF_RE = /\[ref=([^\]]+)\]/;
// The value is OPTIONAL: Playwright emits bare flags too (`[disabled]`, `[checked]`,
// `[expanded]`) alongside `key=value` ones like `[level=1]`. Requiring "=" dropped every
// bare flag — including `disabled`, which decides whether a step can even be performed.
const ATTR_RE = /\[([a-zA-Z_][\w-]*)(?:=([^\]]*))?\]/g;
const HEAD_RE = /^([a-zA-Z][\w-]*)(?:\s+"((?:[^"\\]|\\.)*)")?/;
// Playwright emits some properties as an indented CHILD line prefixed with `/`, not as a
// `[key=value]` bracket on the node's own line:
//
//   - link "Dashboard" [ref=f2e193] [cursor=pointer]:
//     - /url: "#"
//
// `HEAD_RE` starts at `[a-zA-Z]`, so `/url` never matched and every one of these landed in
// `unparsed` — the "7 dòng không parse được" warning was exactly the 7 footer links. They
// are properties of the parent node, so that is where they belong.
const PROP_RE = /^\/([\w-]+):\s*(.*)$/;

/**
 * Node nào "sở hữu" một dòng thuộc tính ở độ sâu `depth`: node gần nhất phía trên nông hơn.
 * Đi từ cuối lên chứ không lấy luôn `nodes.at(-1)` — giữa chúng có thể là một node `text`
 * cùng cấp, và khi đó thuộc tính sẽ bị gán sai chủ.
 */
function findOwner(nodes, depth) {
    for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].depth < depth) return nodes[i];
    }
    return null;
}

/**
 * @returns {{nodes: object[], unparsed: {line: number, text: string}[]}}
 *   nodes: { role, name, ref, attrs, depth, path, text, raw }
 */
export function parseSnapshot(snapshotText) {
    const nodes = [];
    const unparsed = [];
    const stack = []; // [{depth, label}] để dựng path

    const lines = String(snapshotText ?? "").split("\n");
    lines.forEach((rawLine, idx) => {
        if (!rawLine.trim()) return;
        const m = LINE_RE.exec(rawLine);
        if (!m) {
            // Dòng không phải item của cây (có thể là header text của MCP) — ghi lại,
            // không bỏ im lặng.
            unparsed.push({ line: idx + 1, text: rawLine.trim() });
            return;
        }

        const depth = Math.floor(m[1].length / 2);
        const rawBody = m[2];
        let body = rawBody.replace(/:\s*$/, "");

        // `- /url: "..."` là THUỘC TÍNH của node cha, không phải một node riêng.
        // Kiểm trên `rawBody` (chưa cắt dấu `:` cuối) để `- /url:` với giá trị rỗng vẫn khớp.
        const propMatch = PROP_RE.exec(rawBody);
        if (propMatch) {
            const owner = findOwner(nodes, depth);
            if (owner) {
                // Giữ tên có `/` như Playwright phát ra, để không lẫn với thuộc tính dạng
                // `[key=value]` của chính node đó.
                owner.attrs[`/${propMatch[1]}`] = propMatch[2].trim().replace(/^"(.*)"$/, "$1");
            } else {
                unparsed.push({ line: idx + 1, text: rawLine.trim() });
            }
            return;
        }

        // `- text: nội dung` là node văn bản thuần
        const textMatch = /^text:\s*(.*)$/.exec(body);
        if (textMatch) {
            while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
            nodes.push({
                role: "text", name: null, ref: null, attrs: {}, depth,
                path: stack.map(s => s.label).join(" > "),
                text: textMatch[1].trim(), raw: rawLine.trim(),
            });
            return;
        }

        const head = HEAD_RE.exec(body);
        if (!head) {
            unparsed.push({ line: idx + 1, text: rawLine.trim() });
            return;
        }

        const role = head[1];
        const name = head[2] ? head[2].replace(/\\"/g, '"') : null;
        const refMatch = REF_RE.exec(body);
        const attrs = {};
        for (const a of body.matchAll(ATTR_RE)) {
            if (a[1] === "ref") continue;
            attrs[a[1]] = a[2] === undefined ? true : a[2];   // bare flag -> true
        }

        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        const path = stack.map(s => s.label).join(" > ");
        const label = name ? `${role} "${name}"` : role;
        stack.push({ depth, label });

        nodes.push({
            role, name, ref: refMatch ? refMatch[1] : null, attrs, depth, path,
            text: null, raw: rawLine.trim(),
        });
    });

    return { nodes, unparsed };
}

/** Interactive roles worth offering as candidates for a test step. */
const INTERACTIVE = new Set([
    "textbox", "button", "link", "checkbox", "radio", "combobox", "listbox",
    "option", "searchbox", "slider", "spinbutton", "switch", "tab", "menuitem",
]);

export function interactiveNodes(nodes) {
    return nodes.filter(n => INTERACTIVE.has(n.role) && n.ref);
}

/**
 * Keywords from the text of the work at hand. Same idea as knowledge.js's
 * extractKeywords, kept separate because here quoted phrases matter: a step usually
 * names the element in quotes or as an identifier.
 */
export function keywordsFrom(text) {
    const raw = String(text ?? "");
    const quoted = [...raw.matchAll(/["'“”']([^"'“”']{2,})["'“”']/g)].map(m => m[1].toLowerCase());
    const words = (raw.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []);
    return [...new Set([...quoted, ...words])];
}

/**
 * Keep only the nodes whose role/name/text/path mentions one of the keywords, plus all
 * interactive nodes (a step almost always needs one). This is the step that turns a
 * whole-page snapshot into a short candidate list.
 */
export function filterByKeywords(nodes, keywords, { includeInteractive = true } = {}) {
    const kws = keywords.map(k => String(k).toLowerCase()).filter(k => k.length >= 2);
    const hit = (value) => {
        if (!value) return false;
        const v = String(value).toLowerCase();
        return kws.some(k => v.includes(k) || k.includes(v));
    };
    return nodes.filter(n =>
        (includeInteractive && INTERACTIVE.has(n.role) && n.ref) ||
        hit(n.name) || hit(n.text) || hit(n.path)
    );
}

/** Compact one-line-per-node form for a prompt — far smaller than the raw snapshot. */
export function toPromptLines(nodes, { limit = 40 } = {}) {
    const shown = nodes.slice(0, limit);
    const lines = shown.map(n => {
        const parts = [n.role];
        if (n.name) parts.push(`"${n.name}"`);
        if (n.text) parts.push(`text=${JSON.stringify(n.text)}`);
        if (n.ref) parts.push(`ref=${n.ref}`);
        const attrs = Object.entries(n.attrs).map(([k, v]) => `${k}=${v}`).join(" ");
        if (attrs) parts.push(attrs);
        return "- " + parts.join(" ");
    });
    if (nodes.length > limit) {
        // Never truncate silently — the reader must know the list was cut.
        lines.push(`- (còn ${nodes.length - limit} node khớp nhưng bị giới hạn ${limit})`);
    }
    return lines.join("\n");
}

/**
 * Stable fingerprint of the page structure, used to decide whether a previously
 * generated spec is still valid (see incremental authoring). Deliberately ignores
 * `ref` values, which change between snapshots of the very same page.
 */
export function structureFingerprint(nodes) {
    const shape = nodes
        .filter(n => n.role !== "text")
        .map(n => `${n.depth}:${n.role}:${n.name ?? ""}`)
        .join("\n");
    let hash = 0;
    for (let i = 0; i < shape.length; i++) {
        hash = (hash * 31 + shape.charCodeAt(i)) | 0;
    }
    return `fp${(hash >>> 0).toString(16)}:${shape.length}`;
}

/** Extract the snapshot text out of an MCP tool result envelope. */
export function snapshotTextFrom(mcpResult) {
    if (typeof mcpResult === "string") return mcpResult;
    const content = mcpResult?.content;
    if (!Array.isArray(content)) return "";
    return content.filter(c => c?.type === "text").map(c => c.text).join("\n");
}
