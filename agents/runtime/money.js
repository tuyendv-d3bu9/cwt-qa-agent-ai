// agents/runtime/money.js
// Compare money by VALUE, never by how it happens to be printed.
// Rule and rationale: memory/semantic/money-comparison.md (tier 1 — every project).
//
// The bug this exists to kill: test data said `10.000đ`, the UI rendered `10.000 ₫`
// (space + ₫), and the generated spec asserted `getByText('10.000đ')` — a string that can
// never match. The test failed while the product was correct.
//
// GENERIC ON PURPOSE. No currency is privileged: anything that is not a digit or a
// decimal separator is treated as decoration. A project using $, €, ¥ or a bare number
// goes through the same code.

/**
 * Thousands separators differ by locale (`1.234.567` vs `1,234,567` vs `1 234 567`) and the
 * SAME character can mean either separator depending on locale — so `1.234` is ambiguous in
 * isolation. Resolution rule, applied in order:
 *   1. if both `.` and `,` appear, the LAST one is the decimal point (it is closer to the
 *      minor units) and the other is a thousands separator;
 *   2. if only one appears and it groups digits in threes (`1.234`, `12,345,678`), it is a
 *      thousands separator;
 *   3. otherwise it is a decimal point (`1.5`, `0,75`).
 * Vietnamese money is whole-dong in practice, so rule 2 carries the common case here; the
 * others exist so the helper does not quietly corrupt a decimal amount.
 */
function toNumber(digitsAndSeparators) {
    let s = digitsAndSeparators;
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");

    if (lastDot !== -1 && lastComma !== -1) {
        const decimalAt = Math.max(lastDot, lastComma);
        const thousands = decimalAt === lastDot ? "," : ".";
        s = s.split(thousands).join("");
        s = s.slice(0, s.lastIndexOf(decimalAt === lastDot ? "." : ",")) + "." +
            s.slice(s.lastIndexOf(decimalAt === lastDot ? "." : ",") + 1);
        return Number(s);
    }

    const sep = lastDot !== -1 ? "." : lastComma !== -1 ? "," : null;
    if (sep === null) return Number(s);

    const parts = s.split(sep);
    // Groups of exactly 3 after every separator, and more than one group => thousands.
    const grouped = parts.length > 1 && parts.slice(1).every(p => p.length === 3);
    if (grouped) return Number(parts.join(""));
    return Number(parts.join("."));
}

/**
 * Parse one money value out of a string.
 * @returns {number|null} null when there is no number at all — the caller decides what
 *   that means. Returning 0 would silently turn "không có" into a real amount.
 */
export function parseMoney(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const raw = String(value ?? "")
        //   non-breaking space,   narrow no-break space — both common in rendered
        // money and invisible in a diff, which makes them a nasty source of "identical"
        // strings that are not equal.
        .replace(/[  \s]/g, "");
    const m = /-?\d[\d.,]*/.exec(raw);
    if (!m) return null;
    const n = toNumber(m[0].replace(/[.,]+$/, ""));
    return Number.isFinite(n) ? n : null;
}

/** Every money value appearing in a block of text, in order. */
export function moneyIn(text) {
    const cleaned = String(text ?? "").replace(/[  ]/g, " ");
    return [...cleaned.matchAll(/-?\d[\d.,]*/g)]
        .map(m => toNumber(m[0].replace(/[.,]+$/, "")))
        .filter(Number.isFinite);
}

/**
 * Do two money values mean the same amount, whatever their formatting?
 * `false` when either side has no number — "unparseable" is not "equal", and treating it as
 * equal would make an assertion pass on garbage.
 */
export function sameMoney(a, b) {
    const x = parseMoney(a);
    const y = parseMoney(b);
    if (x === null || y === null) return false;
    return x === y;
}

/** Does `text` contain this amount anywhere, in any format? */
export function containsMoney(text, amount) {
    const target = parseMoney(amount);
    if (target === null) return false;
    return moneyIn(text).includes(target);
}
