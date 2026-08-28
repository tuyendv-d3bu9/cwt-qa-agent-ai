// agents/runtime/tc-filter.js
// R4 — MỘT biểu thức chọn test case, parse một lần, dùng ở BA tầng.
//
//   tầng 1  qa-automation   chỉ explore + sinh spec cho TC được chọn  ← chỗ tiết kiệm THẬT
//   tầng 2  playwright      lọc bằng tag trên tiêu đề test
//   tầng 3  qa-verifier     TC ngoài lượt chạy ghi `N/A`, verdict nói rõ phạm vi
//
// VÌ SAO PHẢI LÀ MỘT CHỖ. Hôm nay cách duy nhất là gõ tay `npx playwright test --grep TC-D-001`,
// và nó **chỉ lọc ở tầng 2**: 20 spec vẫn được sinh, MCP vẫn mở trình duyệt 20 lần, tiền LLM vẫn
// trả đủ. Ba tầng mà mỗi tầng tự hiểu "chạy cái nào" theo cách riêng thì sớm muộn chúng bất đồng,
// và bất đồng ở đây có nghĩa là báo cáo kết luận về những test case chưa từng chạy.
//
// ⚠ LUẬT KHÔNG THƯƠNG LƯỢNG: bộ lọc không khớp TC nào thì **DỪNG và liệt kê** thứ đang có.
// Im lặng chạy 0 test rồi báo PASS là kiểu false-green tệ nhất hệ thống này có thể phát ra —
// nó không sai ở một test case, nó sai ở toàn bộ kết luận.

/** Nơi khai các bộ đặt tên sẵn. Người QA sửa file này mà không phải sửa code. */
export const SUITES_FILE = "flows/suites.yml";

/**
 * Nạp `flows/suites.yml`. Không có file → `null` (dự án chưa dùng bộ đặt tên sẵn), KHÔNG ném:
 * chỉ khi ai đó thật sự gõ `--suite=<tên>` mà thiếu file thì `parseFilter` mới báo.
 *
 * File CÓ mà hỏng cú pháp thì để `yaml-lite` ném — nó nêu đúng số dòng. Nuốt lỗi ở đây sẽ biến
 * một file sai cú pháp thành "không có bộ nào", và người dùng gõ `--suite=smoke` sẽ nhận thông
 * báo "không có bộ smoke" trong khi bộ đó đang nằm ngay trong file.
 */
export async function loadSuites({ file = SUITES_FILE } = {}) {
    const { readFile } = await import("node:fs/promises");
    const { parseYamlLite } = await import("./yaml-lite.js");
    let text;
    try { text = await readFile(file, "utf8"); }
    catch { return null; }
    return parseYamlLite(text, { file });
}

/** Một test case, ở dạng tối thiểu mà bộ lọc cần. */
/** @typedef {{tcId: string, tags?: string, priority?: string}} TcLike */

export class FilterError extends Error {
    constructor(message, { available = null } = {}) {
        super(message);
        this.name = "FilterError";
        this.available = available;
    }
}

/** Tách "a, b , c" → ["a","b","c"]. Bỏ phần tử rỗng do dấu phẩy thừa. */
function splitList(raw) {
    return String(raw ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

/** Tách phần số đuôi của một TC_ID: "TC-D-012" → {stem: "TC-D-", n: 12, width: 3}. */
function idParts(id) {
    const m = /^(.*?)(\d+)$/.exec(String(id ?? "").trim());
    if (!m) return null;
    return { stem: m[1], n: Number(m[2]), width: m[2].length };
}

/**
 * Khai triển "TC-D-001..TC-D-005" thành 5 id.
 *
 * Hai đầu khoảng phải cùng phần gốc — "TC-D-001..TC-E-003" là câu hỏi không có nghĩa, và đoán
 * bừa (ví dụ lấy tất cả TC ở giữa theo thứ tự bảng) sẽ chạy đúng một lần rồi sai mãi về sau khi
 * ai đó chèn thêm test case.
 */
export function expandRange(expr) {
    const [from, to] = String(expr).split("..").map(s => s.trim());
    const a = idParts(from), b = idParts(to);
    if (!a || !b) throw new FilterError(`Khoảng "${expr}" không hợp lệ: hai đầu phải kết thúc bằng số.`);
    if (a.stem !== b.stem) {
        throw new FilterError(
            `Khoảng "${expr}" có hai phần gốc khác nhau ("${a.stem}" và "${b.stem}") — không suy ra được ` +
            `khoảng ở giữa. Liệt kê thẳng bằng dấu phẩy.`);
    }
    if (b.n < a.n) throw new FilterError(`Khoảng "${expr}" đi ngược: ${b.n} < ${a.n}.`);
    const width = Math.max(a.width, b.width);
    const out = [];
    for (let n = a.n; n <= b.n; n++) out.push(a.stem + String(n).padStart(width, "0"));
    return out;
}

/**
 * Đọc các cờ dòng lệnh thành một bộ lọc.
 *
 * @param {object} o
 * @param {string} [o.tc]        "TC-D-001,TC-D-002" hoặc "TC-D-001..TC-D-005"
 * @param {string} [o.tags]      "@Happy Path,@REGRESSION"
 * @param {string} [o.priority]  "Critical,High"
 * @param {string} [o.suite]     tên bộ trong flows/suites.yml
 * @param {object} [o.suites]    nội dung suites.yml đã parse
 * @returns {{empty: boolean, ids: string[]|null, tags: string[]|null, priorities: string[]|null, source: string[]}}
 *   `empty: true` = không có cờ nào → chạy TẤT CẢ, giữ nguyên hành vi cũ.
 */
export function parseFilter({ tc = "", tags = "", priority = "", suite = "", suites = null } = {}) {
    const source = [];
    let ids = null, tagList = null, prios = null;

    const addIds = (list) => { ids = [...new Set([...(ids ?? []), ...list])]; };

    if (String(suite ?? "").trim()) {
        const name = String(suite).trim();
        if (!suites || typeof suites !== "object") {
            throw new FilterError(`--suite=${name} nhưng không đọc được flows/suites.yml.`);
        }
        const def = suites[name];
        if (!def) {
            throw new FilterError(
                `Không có bộ "${name}" trong flows/suites.yml.`,
                { available: Object.keys(suites) });
        }
        // `yaml-lite` trả list dạng mảng; một phần tử đơn có thể là chuỗi.
        const asList = (v) => v == null ? [] : (Array.isArray(v) ? v : [v]).map(x => String(x).trim()).filter(Boolean);
        if (asList(def.tc).length) addIds(asList(def.tc).flatMap(x => x.includes("..") ? expandRange(x) : [x]));
        if (asList(def.tags).length) tagList = [...(tagList ?? []), ...asList(def.tags)];
        if (asList(def.priority).length) prios = [...(prios ?? []), ...asList(def.priority)];
        if (!asList(def.tc).length && !asList(def.tags).length && !asList(def.priority).length) {
            throw new FilterError(`Bộ "${name}" trong flows/suites.yml không khai tc/tags/priority nào.`);
        }
        source.push(`--suite=${name}`);
    }

    if (String(tc ?? "").trim()) {
        addIds(splitList(tc).flatMap(x => x.includes("..") ? expandRange(x) : [x]));
        source.push(`--tc=${tc}`);
    }
    if (String(tags ?? "").trim()) {
        tagList = [...(tagList ?? []), ...splitList(tags)];
        source.push(`--tags=${tags}`);
    }
    if (String(priority ?? "").trim()) {
        prios = [...(prios ?? []), ...splitList(priority)];
        source.push(`--priority=${priority}`);
    }

    return {
        empty: ids === null && tagList === null && prios === null,
        ids, tags: tagList, priorities: prios, source,
    };
}

/** Cột `Tags` của bảng test case là chuỗi tự do — tách theo dấu phẩy, giữ nguyên khoảng trắng trong tag. */
function tagsOf(tc) {
    return String(tc?.tags ?? "").split(",").map(s => s.trim().replace(/^\[|\]$/g, "").trim()).filter(Boolean);
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Một test case có khớp bộ lọc không. Nhiều tiêu chí = GIAO (AND). */
export function matches(tc, filter) {
    if (!filter || filter.empty) return true;
    if (filter.ids && !filter.ids.some(id => norm(id) === norm(tc.tcId))) return false;
    if (filter.priorities && !filter.priorities.some(p => norm(p) === norm(tc.priority))) return false;
    if (filter.tags) {
        const mine = tagsOf(tc).map(norm);
        // Tag khớp KHÔNG phân biệt dấu @ ở đầu: người gõ `--tags=Happy Path` và bảng ghi
        // `@Happy Path` là cùng một ý định.
        const want = filter.tags.map(t => norm(t).replace(/^@/, ""));
        if (!want.some(w => mine.some(m => m.replace(/^@/, "") === w))) return false;
    }
    return true;
}

/**
 * Áp bộ lọc lên cả bộ test case.
 *
 * @param {TcLike[]} all
 * @param {ReturnType<parseFilter>} filter
 * @returns {{selected: TcLike[], skipped: TcLike[], scope: string}}
 * @throws {FilterError} khi bộ lọc không khớp TC nào — KHÔNG trả về mảng rỗng.
 */
export function applyFilter(all, filter) {
    const list = all ?? [];
    if (!filter || filter.empty) {
        return { selected: [...list], skipped: [], scope: `${list.length}/${list.length} test case` };
    }
    const selected = list.filter(tc => matches(tc, filter));
    const skipped = list.filter(tc => !matches(tc, filter));

    if (selected.length === 0) {
        // Liệt kê thứ ĐANG CÓ, không chỉ nói "không khớp": người gõ sai một ký tự cần thấy ngay
        // danh sách đúng, chứ không phải đi mở file bảng test case ra dò.
        throw new FilterError(
            `Bộ lọc (${filter.source.join(" ")}) không khớp test case nào trong ${list.length} test case.`,
            {
                available: {
                    tcId: list.map(t => t.tcId),
                    tags: [...new Set(list.flatMap(tagsOf))],
                    priority: [...new Set(list.map(t => t.priority).filter(Boolean))],
                },
            });
    }
    return { selected, skipped, scope: `${selected.length}/${list.length} test case` };
}

/**
 * Câu mô tả phạm vi, gắn vào verdict.
 *
 * VÌ SAO BẮT BUỘC: một verdict `PASS` tính trên 3 test case mà đọc như PASS trên cả bộ 20 là
 * câu nói dối nguy hiểm nhất hệ thống này có thể phát ra. Người đọc báo cáo không có cách nào
 * biết 17 test case kia chưa từng chạy.
 */
export function scopedVerdict(verdict, { selected, total }) {
    if (selected === total) return String(verdict);
    return `${verdict} (${selected}/${total} test case)`;
}

/**
 * Biểu thức `--grep` cho Playwright, dựng từ cùng một bộ lọc.
 *
 * Trả `null` khi không lọc gì — gọi `playwright test` không kèm `--grep`.
 * Chỉ dựng từ `ids`: tag Playwright do codegen gắn từ tag Gherkin, và ID là thứ chắc chắn có ở
 * mọi test case. Lọc theo tag/priority đã xảy ra ở tầng 1 (chỉ những spec được chọn mới tồn tại).
 */
export function grepFor(filter, selectedIds = null) {
    if (!filter || filter.empty) return null;
    const ids = selectedIds ?? filter.ids;
    if (!ids || ids.length === 0) return null;
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `(${ids.map(esc).join("|")})`;
}
