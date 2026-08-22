// agents/runtime/yaml-lite.js
// Parser cho một TẬP CON của YAML — vừa đủ cho `flows/*.flow.yml`, không hơn.
//
// VÌ SAO KHÔNG DÙNG JSON. File luồng cần **chú thích `#`** giải thích *vì sao* có cửa duyệt ở
// bước đó, vì sao có nhánh FIX. JSON không có comment, và cả repo này viết bằng chú thích —
// một file luồng không giải thích được chính nó là file sẽ bị copy sai.
//
// VÌ SAO KHÔNG `npm i yaml`. `node_modules` hiện KHÔNG có parser YAML nào (đã kiểm). Thêm
// dependency là thêm một chỗ vỡ khi `npm install` lỗi, cho một việc dùng đúng 4 kiểu cú pháp.
//
// VÌ SAO VẪN LÀ YAML HỢP LỆ. Tập con này là YAML thật, không phải định dạng riêng. Nếu sau
// này bạn cài `yaml` thật thì mọi file `flows/*.flow.yml` vẫn parse được, không phải viết lại.
//
// ── TRIẾT LÝ: NỔ TO, KHÔNG ĐOÁN ──────────────────────────────────────────
// Parser này TỪ CHỐI mọi cú pháp ngoài tập con thay vì đoán nghĩa: tab, anchor `&`/alias `*`,
// scalar nhiều dòng `|`/`>`, collection inline `{}`/`[]`, nhiều document.
// Lý do: parse sai một file luồng = **chạy sai thứ tự mà vẫn báo xanh**. Một parser "dễ tính"
// ở đây không tiện lợi, nó nguy hiểm. Thà không chạy còn hơn chạy sai thứ tự.
//
// ── TẬP CON ĐƯỢC HỖ TRỢ ─────────────────────────────────────────────────
//   key: value                 vô hướng: chuỗi, số, true/false, null/~
//   key: "chuỗi: có dấu hai chấm"
//   key: >-                    chuỗi dài GẤP DÒNG: các dòng lùi vào được nối bằng dấu cách
//     câu một
//     câu hai                  → "câu một câu hai"
//   key: |-                    chuỗi dài GIỮ DÒNG: giữ nguyên ký tự xuống dòng
//     dòng một
//     dòng hai                 → "dòng một\ndòng hai"
//   key:                       mapping/sequence lồng, thụt lề bằng DẤU CÁCH
//     con: 1
//   list:
//     - phần tử vô hướng
//     - key: mapping trong list
//       key2: giá trị
//   # chú thích cả dòng, và chú thích cuối dòng sau khoảng trắng

/** Lỗi cú pháp có kèm tên file + số dòng. Không có 2 thứ đó thì người sửa phải đi mò. */
export class YamlLiteError extends Error {
    constructor(message, { file, line }) {
        super(`${file}:${line}: ${message}`);
        this.name = "YamlLiteError";
        this.file = file;
        this.line = line;
    }
}

/** Đầu khối chuỗi dài: `>` gấp dòng thành dấu cách, `|` giữ dòng; `-` bỏ dòng trắng cuối. */
const BLOCK_HEADER = /^([|>])([-]?)$/;

const UNSUPPORTED = [
    [/^[|>].+/, `sau "|" hoặc ">" chỉ được có "-" rồi hết dòng — chỉ số thụt lề ("|2") và "+" không được hỗ trợ`],
    [/^[&*]/, `anchor "&" / alias "*" không được hỗ trợ — viết đầy đủ ra, một file luồng cần đọc thẳng`],
    [/^\{/, `object inline "{...}" không được hỗ trợ — dùng mapping lồng, thụt lề 2 dấu cách`],
    [/^\[/, `list inline "[...]" không được hỗ trợ — dùng "- " mỗi phần tử một dòng`],
];

/**
 * Cắt chú thích cuối dòng. Chỉ cắt khi `#` đứng ĐẦU DÒNG hoặc SAU khoảng trắng và KHÔNG ở
 * trong ngoặc kép — nếu không thì `url: https://a/b#c` bị chặt mất đuôi, và một giá trị
 * `"#1"` biến thành chuỗi rỗng.
 */
function stripComment(s) {
    let quote = null;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quote) {
            if (c === "\\" && quote === '"') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
    }
    return s;
}

/** Vị trí dấu `:` ngăn key với value, bỏ qua dấu trong ngoặc kép. `-1` = dòng này không phải mapping. */
function findKeyColon(s) {
    let quote = null;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quote) {
            if (c === "\\" && quote === '"') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'") { quote = c; continue; }
        // `:` là dấu ngăn khi nó ở cuối dòng hoặc có khoảng trắng ngay sau. `12:30` không phải mapping.
        if (c === ":" && (i === s.length - 1 || /\s/.test(s[i + 1]))) return i;
    }
    return -1;
}

function unquote(s, ctx) {
    const q = s[0];
    if (s.length < 2 || s[s.length - 1] !== q) {
        throw new YamlLiteError(`chuỗi thiếu dấu ${q} đóng: ${s}`, ctx);
    }
    const body = s.slice(1, -1);
    return q === "'"
        ? body.replace(/''/g, "'")
        : body.replace(/\\(["\\ntr])/g, (_, ch) => ({ n: "\n", t: "\t", r: "\r" }[ch] ?? ch));
}

/** Vô hướng → giá trị JS. Từ chối cú pháp ngoài tập con NGAY TẠI ĐÂY, kèm số dòng. */
export function parseScalar(raw, ctx = { file: "(yaml)", line: 0 }) {
    const s = String(raw).trim();
    if (s === "") return null;

    // Kiểm BLOCK_HEADER TRƯỚC danh sách không-hỗ-trợ: `>-` cũng khớp mẫu `/^[|>].+/` ở đó, và
    // nếu để nó nổ trước thì `- >-` báo "chỉ số thụt lề không được hỗ trợ" — một câu chẳng
    // liên quan gì tới cái người viết vừa làm sai.
    if (BLOCK_HEADER.test(s)) {
        throw new YamlLiteError(`"${s}" (khối chuỗi dài) chỉ dùng được ngay sau "key:", không dùng cho phần tử list`, ctx);
    }

    for (const [re, why] of UNSUPPORTED) {
        if (re.test(s)) throw new YamlLiteError(why, ctx);
    }

    if (s[0] === '"' || s[0] === "'") return unquote(s, ctx);
    if (s === "null" || s === "~") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^-?\d+$/.test(s)) return Number(s);
    if (/^-?\d*\.\d+$/.test(s)) return Number(s);
    return s;
}

/**
 * Parse một tài liệu YAML tập-con.
 * @param {string} text
 * @param {{file?: string}} [o]
 * @returns {object|Array|null}
 */
export function parseYamlLite(text, { file = "(yaml)" } = {}) {
    const lines = [];
    let docMarkers = 0;

    // Giữ nguyên văn từng dòng. Bên trong một khối chuỗi dài (`>-` / `|-`) thì dòng trắng có
    // nghĩa và `#` là ký tự thường — nên phần tokenize (bỏ dòng trắng, cắt chú thích) KHÔNG
    // dùng được ở đó. Khối chuỗi dài đọc từ mảng nguyên văn này.
    const rawLines = String(text ?? "").split(/\r?\n/);

    rawLines.forEach((raw, i) => {
        const line = i + 1;

        // Tab trong phần thụt lề: YAML thật cấm, và nếu ta âm thầm coi tab = 1 khoảng trắng
        // thì một file trộn tab/space sẽ parse ra CÂY KHÁC hẳn cái người viết nhìn thấy.
        const indentPart = /^[ \t]*/.exec(raw)[0];
        if (indentPart.includes("\t")) {
            throw new YamlLiteError(`có ký tự TAB ở phần thụt lề — YAML chỉ dùng dấu cách`, { file, line });
        }

        const noComment = stripComment(raw);
        if (!noComment.trim()) return;

        const trimmed = noComment.trim();
        if (trimmed === "---") { docMarkers++; return; }
        if (trimmed === "...") return;

        lines.push({ indent: indentPart.length, content: noComment.slice(indentPart.length).replace(/\s+$/, ""), line });
    });

    if (docMarkers > 1) {
        throw new YamlLiteError(`file có nhiều document ("---" xuất hiện ${docMarkers} lần) — mỗi file một luồng`, { file, line: 1 });
    }
    if (lines.length === 0) return null;

    const ctxOf = (l) => ({ file, line: l.line });

    /**
     * Đọc khối chuỗi dài mở đầu bởi `key: >-` / `key: |-` trên dòng `header`.
     *
     * Thân khối = các dòng lùi vào SÂU HƠN dòng key. Mức thụt lề của khối lấy từ dòng có nội
     * dung ĐẦU TIÊN, nên người viết không phải đếm dấu cách theo một quy tắc riêng.
     *
     * @returns {{value: string, lastRaw: number}} `lastRaw` là chỉ số 0-based của dòng nguyên
     *   văn cuối cùng thuộc khối — hàm gọi dùng nó để nhảy con trỏ token qua hết khối.
     */
    function readBlockScalar(header, style, chomp) {
        const collected = [];
        let blockIndent = null;
        let lastRaw = header.line - 1;

        for (let k = header.line; k < rawLines.length; k++) {
            const raw = rawLines[k];
            if (/^\s*$/.test(raw)) { collected.push({ blank: true, text: "", raw: k }); continue; }

            const indentPart = /^[ \t]*/.exec(raw)[0];
            if (indentPart.includes("\t")) {
                throw new YamlLiteError(`có ký tự TAB ở phần thụt lề`, { file, line: k + 1 });
            }
            if (indentPart.length <= header.indent) break;
            if (blockIndent === null) blockIndent = indentPart.length;
            if (indentPart.length < blockIndent) break;

            collected.push({ blank: false, text: raw.slice(blockIndent).replace(/\s+$/, ""), raw: k });
            lastRaw = k;
        }

        // Dòng trắng ở cuối thuộc về BÊN NGOÀI khối, không phải nội dung của nó.
        while (collected.length && collected[collected.length - 1].blank) collected.pop();
        if (collected.length === 0) {
            throw new YamlLiteError(`khối chuỗi dài "${style}${chomp}" rỗng — phải có ít nhất một dòng lùi vào`, ctxOf(header));
        }

        let value;
        if (style === "|") {
            value = collected.map(c => c.text).join("\n");
        } else {
            // Gấp dòng: các dòng liền nhau nối bằng dấu cách; một dòng trắng = một lần xuống dòng.
            const paragraphs = [[]];
            for (const c of collected) {
                if (c.blank) { paragraphs.push([]); continue; }
                paragraphs[paragraphs.length - 1].push(c.text);
            }
            value = paragraphs.map(p => p.join(" ")).join("\n");
        }
        if (chomp !== "-") value += "\n";

        return { value, lastRaw };
    }

    /**
     * @param {number} i     chỉ số dòng bắt đầu
     * @param {number} indent  mức thụt lề của block này
     * @returns {[any, number]} [giá trị, chỉ số dòng tiếp theo]
     */
    function parseBlock(i, indent) {
        const first = lines[i];
        if (first.content.startsWith("- ") || first.content === "-") return parseSequence(i, indent);
        return parseMapping(i, indent);
    }

    function parseMapping(i, indent) {
        const out = {};
        while (i < lines.length) {
            const l = lines[i];
            if (l.indent < indent) break;
            if (l.indent > indent) {
                throw new YamlLiteError(
                    `thụt lề sai: dòng này lùi vào ${l.indent} dấu cách nhưng block đang ở mức ${indent} — ` +
                    `một mapping con phải đứng sau một key kết thúc bằng ":"`,
                    ctxOf(l)
                );
            }
            if (l.content.startsWith("- ") || l.content === "-") {
                throw new YamlLiteError(`gặp phần tử list "-" trong khi đang đọc mapping ở mức ${indent}`, ctxOf(l));
            }

            const colon = findKeyColon(l.content);
            if (colon === -1) {
                throw new YamlLiteError(
                    `không phải "key: value" và cũng không phải "- phần tử": ${JSON.stringify(l.content)}`,
                    ctxOf(l)
                );
            }

            const rawKey = l.content.slice(0, colon).trim();
            const key = (rawKey[0] === '"' || rawKey[0] === "'") ? unquote(rawKey, ctxOf(l)) : rawKey;
            if (!key) throw new YamlLiteError(`key rỗng`, ctxOf(l));
            if (Object.prototype.hasOwnProperty.call(out, key)) {
                // Key trùng: YAML thật cho phép ghi đè âm thầm. Ở đây thì không — trong file
                // luồng, hai key `gate:` trùng nhau nghĩa là một trong hai điều người viết
                // muốn sẽ KHÔNG xảy ra, và không có gì báo.
                throw new YamlLiteError(`key "${key}" bị khai hai lần trong cùng một mapping`, ctxOf(l));
            }

            const rest = l.content.slice(colon + 1).trim();
            if (rest === "") {
                const next = lines[i + 1];
                // Một list được phép đứng NGANG HÀNG với key mẹ — YAML thật cho phép, và người
                // ta viết thế rất nhiều:
                //     steps:
                //     - node: a
                // Chỉ list mới được thế; mapping con thì bắt buộc lùi vào, nếu không sẽ không
                // phân biệt được "con của key này" với "key kế tiếp cùng cấp".
                const nextIsFlushSeq = next && next.indent === l.indent
                    && (next.content.startsWith("- ") || next.content === "-");
                if (next && (next.indent > l.indent || nextIsFlushSeq)) {
                    const [value, ni] = parseBlock(i + 1, next.indent);
                    out[key] = value;
                    i = ni;
                    continue;
                }
                out[key] = null;
                i++;
                continue;
            }

            const block = BLOCK_HEADER.exec(rest);
            if (block) {
                const { value, lastRaw } = readBlockScalar(l, block[1], block[2]);
                out[key] = value;
                // Nhảy con trỏ token qua hết khối. Các dòng thân khối ĐÃ được tokenize như dòng
                // thường (tokenizer không biết gì về khối), nên nếu không nhảy thì chúng sẽ bị
                // đọc lại thành key/list và nổ ở một chỗ chẳng liên quan.
                i++;
                while (i < lines.length && lines[i].line <= lastRaw + 1) i++;
                continue;
            }

            out[key] = parseScalar(rest, ctxOf(l));
            i++;
        }
        return [out, i];
    }

    function parseSequence(i, indent) {
        const out = [];
        while (i < lines.length) {
            const l = lines[i];
            if (l.indent < indent) break;
            if (l.indent > indent) {
                throw new YamlLiteError(`thụt lề sai trong list: mức ${l.indent} trong khi list đang ở mức ${indent}`, ctxOf(l));
            }
            if (!(l.content.startsWith("- ") || l.content === "-")) break;

            const after = l.content.slice(1);
            const itemText = after.replace(/^\s+/, "");
            // Mức thụt lề "thật" của phần tử = vị trí ký tự đầu sau dấu "-". Các dòng tiếp theo
            // của cùng phần tử nằm ở đúng mức này.
            const itemIndent = l.indent + (after.length - itemText.length) + 1;

            if (itemText === "") {
                const next = lines[i + 1];
                if (!next || next.indent <= l.indent) {
                    throw new YamlLiteError(`phần tử list rỗng — sau "-" phải có giá trị hoặc một block lùi vào`, ctxOf(l));
                }
                const [value, ni] = parseBlock(i + 1, next.indent);
                out.push(value);
                i = ni;
                continue;
            }

            if (findKeyColon(itemText) !== -1) {
                // Phần tử là mapping bắt đầu ngay trên dòng "-". Viết lại dòng này thành một
                // dòng mapping bình thường ở mức `itemIndent` rồi để parseMapping đọc tiếp —
                // nó sẽ tự dừng khi gặp dấu "-" kế tiếp (thụt lề nhỏ hơn).
                lines[i] = { indent: itemIndent, content: itemText, line: l.line };
                const [value, ni] = parseMapping(i, itemIndent);
                out.push(value);
                i = ni;
                continue;
            }

            out.push(parseScalar(itemText, ctxOf(l)));
            i++;
        }
        return [out, i];
    }

    const [value, consumed] = parseBlock(0, lines[0].indent);
    if (consumed < lines.length) {
        const l = lines[consumed];
        throw new YamlLiteError(
            `thụt lề sai: dòng này ở mức ${l.indent} trong khi tài liệu bắt đầu ở mức ${lines[0].indent}`,
            ctxOf(l)
        );
    }
    return value;
}
