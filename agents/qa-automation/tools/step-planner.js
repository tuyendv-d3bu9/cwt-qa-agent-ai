// agents/qa-automation/tools/step-planner.js
// Deterministic (NO LLM) mapping from a test-case step to an MCP Playwright tool call.
//
// WHY — the step loop used to ask the LLM what to do for EVERY step of EVERY test case,
// sending the whole page snapshot and the whole MCP tool list each time. Most steps are
// formulaic ("Nhập X vào ô Y", "Bấm nút Z"): a rule handles them for free, and the LLM
// is left with only the steps no rule matches.
//
// This is tier 2 of the approach-C principle (memory/README.md / TODO): use what MCP
// already gives, write code for what it does not, call the LLM only for what neither can
// do. A step that no rule matches returns null — the caller then falls back to the
// step-navigator skill. Guessing here would be worse than admitting the miss.

/** Only these MCP tools may be produced by a rule. Kept in sync with WHITELIST below. */
export const STEP_TOOLS = {
    navigate: "browser_navigate",
    type: "browser_type",
    click: "browser_click",
    select: "browser_select_option",
    press: "browser_press_key",
    fillForm: "browser_fill_form",
};

/**
 * MCP tools offered to the LLM when a rule misses. `@playwright/mcp` exposes 60+ tools;
 * sending all of them with descriptions, once per step per test case, was pure overhead.
 */
export const WHITELIST = [
    "browser_navigate",
    "browser_click",
    "browser_type",
    "browser_fill_form",
    "browser_select_option",
    "browser_press_key",
    "browser_find",
    "browser_snapshot",
];

/** Strip a leading ordinal ("1. ", "Bước 2:") and surrounding noise. */
function clean(step) {
    return String(step ?? "").trim().replace(/^(bước\s*)?\d+[.):]\s*/i, "").trim();
}

function quoted(text) {
    const m = /["'“”']([^"'“”']+)["'“”']/.exec(text);
    return m ? m[1].trim() : null;
}

// Each rule: try to recognise the step shape and say what to do about it.
// `target` is a human-readable element description; resolving it to a real locator/ref
// is the caller's job (registry lookup, then browser_find).
const RULES = [
    {
        name: "navigate",
        // "Vào trang checkout", "Mở URL ...", "Truy cập trang giỏ hàng"
        test: (s) => /^(vào|mở|truy cập|điều hướng|đi (tới|đến))\b/i.test(s),
        build: (s) => {
            const url = /(https?:\/\/\S+)/.exec(s)?.[1] ?? null;
            return { action: "navigate", tool: STEP_TOOLS.navigate, url, target: url ? null : stripVerb(s), args: url ? { url } : {} };
        },
    },
    {
        name: "type",
        // "Nhập SALE20 vào ô Mã giảm giá", "Điền 100000 vào trường order_total"
        test: (s) => /^(nhập|điền|gõ|type|fill)\b/i.test(s),
        build: (s) => {
            const m = /^(?:nhập|điền|gõ|type|fill)\s+(.+?)\s+(?:vào|into)\s+(?:ô|trường|field|input|box)?\s*(.+)$/i.exec(s);
            const value = m ? unquote(m[1]) : quoted(s);
            const target = m ? unquote(m[2]) : null;
            return { action: "type", tool: STEP_TOOLS.type, value, target, args: { text: value } };
        },
    },
    // ĐẶT TRƯỚC "click" CÓ CHỦ Ý: "Nhấn Enter" khớp cả 2 rule, và rule đứng trước
    // thắng. Nếu "click" đứng trước thì bước bấm phím bị hiểu thành click vào một
    // phần tử tên "Enter" — sai âm thầm, không có lỗi nào để lần ra.
    {
        name: "press",
        // "Nhấn Enter", "Bấm phím Tab"
        test: (s) => /\b(enter|tab|escape|esc|space|backspace)\b/i.test(s) && /^(nhấn|bấm|press)\b/i.test(s),
        build: (s) => {
            const key = /\b(enter|tab|escape|esc|space|backspace)\b/i.exec(s)[1].toLowerCase();
            const normalized = { esc: "Escape", escape: "Escape", enter: "Enter", tab: "Tab", space: " ", backspace: "Backspace" }[key];
            return { action: "press", tool: STEP_TOOLS.press, target: null, args: { key: normalized } };
        },
    },
    {
        name: "click",
        // "Bấm nút Áp dụng", "Click vào Thanh toán", "Nhấn Xoá mã"
        test: (s) => /^(bấm|nhấn|click|chọn nút|tap)\b/i.test(s),
        build: (s) => ({ action: "click", tool: STEP_TOOLS.click, target: stripVerb(s), args: {} }),
    },
    {
        name: "select",
        // "Chọn Hà Nội trong dropdown Tỉnh/Thành"
        test: (s) => /^chọn\b/i.test(s) && /(trong|từ|ở)\s+(dropdown|combobox|danh sách|select)/i.test(s),
        build: (s) => {
            const m = /^chọn\s+(.+?)\s+(?:trong|từ|ở)\s+(?:dropdown|combobox|danh sách|select)?\s*(.*)$/i.exec(s);
            return { action: "select", tool: STEP_TOOLS.select, value: m ? unquote(m[1]) : null, target: m ? unquote(m[2]) : null, args: {} };
        },
    },
    {
        name: "expectation",
        // "Kiểm tra tổng tiền giảm còn 700.000" — mô tả kỳ vọng, KHÔNG phải hành động.
        // Nhận diện để không tốn 1 lượt LLM chỉ để kết luận "không cần làm gì".
        test: (s) => /^(kiểm tra|verify|xác nhận|quan sát|thấy|hiển thị|kết quả)\b/i.test(s),
        build: (s) => ({ action: "expectation", tool: null, target: null, args: {}, note: "Bước mô tả kỳ vọng, không phải hành động" }),
    },
];

function stripVerb(s) {
    return unquote(
        s.replace(/^(bấm|nhấn|click|tap|chọn nút|vào|mở|truy cập|điều hướng|đi tới|đi đến)\s*/i, "")
            .replace(/^(vào|nút|button|link|trang|page)\s+/i, "")
            .trim()
    );
}

function unquote(s) {
    return String(s ?? "").trim().replace(/^["'“”']|["'“”']$/g, "").replace(/\.$/, "").trim();
}

/**
 * @returns {object|null} plan when a rule matched, null when the LLM must decide.
 *   { action, tool, target, value?, args, matchedRule }
 */
export function planStep(step) {
    const s = clean(step);
    if (!s) return { action: "skip", tool: null, target: null, args: {}, matchedRule: "empty" };
    for (const rule of RULES) {
        if (!rule.test(s)) continue;
        const plan = rule.build(s);
        // A rule that recognised the shape but could not pull out what it needs is a
        // miss, not a plan — fall through to the LLM rather than fire a half-built call.
        if (plan.tool && plan.action !== "expectation" && !plan.target && !plan.args?.url && !plan.args?.key) return null;
        return { ...plan, matchedRule: rule.name };
    }
    return null;
}

/**
 * Group consecutive "type" steps so they can go out as ONE browser_fill_form call
 * instead of one round trip per field.
 * @returns {Array<{kind: "single"|"form", plan?: object, plans?: object[], steps: string[]}>}
 */
export function planSteps(steps) {
    const out = [];
    let formBuffer = [];

    const flush = () => {
        if (!formBuffer.length) return;
        if (formBuffer.length === 1) {
            out.push({ kind: "single", plan: formBuffer[0].plan, steps: [formBuffer[0].step] });
        } else {
            out.push({
                kind: "form",
                tool: STEP_TOOLS.fillForm,
                plans: formBuffer.map(b => b.plan),
                steps: formBuffer.map(b => b.step),
            });
        }
        formBuffer = [];
    };

    for (const step of steps) {
        const plan = planStep(step);
        if (plan?.action === "type" && plan.target) {
            formBuffer.push({ step, plan });
            continue;
        }
        flush();
        out.push({ kind: "single", plan, steps: [step] });
    }
    flush();
    return out;
}

/** How many steps a rule handled — used to report the saving honestly. */
export function coverage(steps) {
    const total = steps.length;
    const byRule = steps.filter(s => planStep(s) !== null).length;
    return { total, byRule, needLLM: total - byRule };
}
