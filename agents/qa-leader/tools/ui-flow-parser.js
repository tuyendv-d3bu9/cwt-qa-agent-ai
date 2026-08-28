// agents/qa-leader/tools/ui-flow-parser.js
// Deterministic (NO LLM) parser for the UI flow document — the navigation backbone the
// automation node drives the browser along.
//
// WHY DETERMINISTIC: the flow is the ONE thing that must not be guessed. Everything
// downstream (which screen a step happens on, which element to look for, which spec to
// write) hangs off it. An LLM misreading step 2 as step 3 would send the browser to the
// wrong screen and every locator found there would be wrong — silently, and expensively.
//
// GENERIC BY CONSTRUCTION: this file knows nothing about any particular application. It
// knows a document shape — `## Flow: <name>`, `**Entry:** <url>`, then a numbered list —
// and nothing about carts, vouchers or checkouts. Any project describing its flows in that
// shape is readable by the same code.

/** `## Flow: <name>` — the heading that opens one flow. `#`/`###` also accepted. */
const FLOW_RE = /^#{1,3}\s*Flow\s*:\s*(.+?)\s*$/i;
/** `**Entry:** <url>` — where the flow starts. Bold markers optional. */
const ENTRY_RE = /^\**\s*Entry\s*:?\**\s*:?\s*(\S+)\s*$/i;
/** `1. text` / `1) text` / `1 - text` — one step. */
const STEP_RE = /^\s*(\d+)\s*[.)-]\s+(.+?)\s*$/;
/** A heading that is NOT a flow heading ends the current flow. */
const HEADING_RE = /^#{1,6}\s+/;

/**
 * ── TƯ CÁCH NGƯỜI DÙNG (R6) ─────────────────────────────────────────
 *
 *   `**Tư cách:** customer`        luồng này chạy với tư cách nào
 *   `**Tạo tư cách:** customer`    luồng này SINH RA tư cách đó (luồng đăng nhập)
 *
 * VÌ SAO CẦN. Có app cho xem mọi thứ mà không cần đăng nhập; có app khoá gần hết. ShopGo lên
 * bản v2.0 thì chưa đăng nhập **không xem được giỏ hàng** — bấm Thanh toán ra modal đăng nhập.
 * Không khai tư cách thì `flow-walker` explore ở tư cách khách sẽ đâm tường ngay bước 2 và mọi
 * luồng liên quan tới giỏ đều dở dang.
 *
 * ⚠ ĐIỀU NGUY HIỂM HƠN: nó KHÔNG làm test đỏ, nó làm test **xanh sai**. Luồng "khách chưa đăng
 * nhập bị chặn ở giỏ hàng" mà lỡ chạy trên một phiên còn đăng nhập thì thấy giỏ mở ra bình
 * thường — và không assertion nào bắt được, vì assertion chỉ nói về cái nhìn thấy, không nói về
 * tư cách đang dùng. Tư cách phải là thứ ĐƯỢC KHAI và ĐƯỢC KIỂM, không phải thứ suy ra.
 *
 * ⚠ KHÔNG CÓ GIÁ TRỊ MẶC ĐỊNH — CỐ Ý.
 * Mặc định "khách" thì luồng cần đăng nhập chạy sai; mặc định "đã đăng nhập" thì luồng kiểm
 * việc-chặn-khách chạy sai. Cả hai đều là đoán. Nên: tài liệu KHÔNG khai tư cách ở đâu cả →
 * dự án không có khái niệm đăng nhập, mọi thứ như cũ. Nhưng đã khai ở MỘT luồng thì **mọi
 * luồng phải khai**, thiếu là `problems` (người phải sửa). Xem chỗ kiểm bên dưới.
 */
const IDENTITY_CREATES_RE = /^\**\s*(?:Tạo\s*tư\s*cách|Creates?\s*identity)\s*:?\**\s*:?\s*(.+?)\s*$/i;
const IDENTITY_NEEDS_RE = /^\**\s*(?:Tư\s*cách|Identity)\s*:?\**\s*:?\s*(.+?)\s*$/i;

/**
 * Tên tư cách dành riêng cho "KHÔNG đăng nhập". Viết `khách`, `khach` hay `guest` đều được;
 * chuẩn hoá về `guest` để phần còn lại của hệ thống chỉ phải biết một chuỗi.
 */
export const GUEST_IDENTITY = "guest";

/** Chuẩn hoá tên tư cách thành slug dùng được làm tên file (`.qa-run/auth/<slug>.json`). */
export function normIdentity(raw) {
    const s = String(raw ?? "").replace(/\*\*/g, "").trim().toLowerCase();
    if (!s) return null;
    if (/^(khách|khach|guest|vãng\s*lai|vang\s*lai)$/.test(s)) return GUEST_IDENTITY;
    return s
        .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || null;
}

/**
 * Mục "quy ước nghiệp vụ đã xác nhận" — tuỳ chọn, nhiều nhất một mục.
 *
 * VÌ SAO CẦN. Tài liệu luồng còn chứa những điều KHÔNG phải một bước, nhưng đổi hẳn cách viết
 * automation. Ví dụ thật (người dùng trả lời 2026-08-23): *"web test không có DB, vào lại trang
 * là sạch"*. Hệ quả là **không được điều hướng lại giữa luồng** — vào lại trang là mất giỏ hàng
 * vừa dựng. Chính lỗi đó (một rule `navigate` khớp cả câu "Vào checkout" không có URL) là một
 * trong ba nguyên nhân gốc của 9 test lỗi ngày 2026-08-17.
 *
 * Trước khi có phần này, `distillUiFlows()` chỉ mang các khối `## Flow:` vào tầng 3 — nên một
 * quy ước như trên nằm trong tài liệu mà **không tới được prompt của agent nào**. Đúng loại lỗi
 * P9: tài liệu có, không ai nạp.
 */
const CONVENTION_RE = /^#{1,3}\s*Quy\s*ước\b/i;

/**
 * A step is BUSINESS INTENT, in the author's own words. Nothing here tries to work out
 * which element it refers to.
 *
 * THIS IS THE DIVISION OF LABOUR AND IT MATTERS:
 *   this document  →  WHAT to do, in business terms, in order
 *   MCP snapshot   →  what is actually on the screen right now (the a11y yaml)
 *   the AI, at run time, per step  →  which node in that yaml the step means
 *
 * An earlier version of this parser required the exact element name in quotes and reported
 * a PROBLEM when a step had none. That was backwards twice over: it demanded that a human
 * know the real accessible name before any exploration had happened, and it made the flow
 * document carry information that only a live browser can supply. Writing
 * `nhập mã vào ô "Mã giảm giá"` should never be mandatory — `nhập mã giảm giá` is a
 * perfectly clear instruction, and resolving it to a textbox is the agent's job.
 *
 * `hints` therefore holds quoted names when the author happened to use quotes, and it is
 * exactly that: a hint handed to the AI alongside the live snapshot. Never a requirement,
 * never used as a selector.
 *
 * `kind: "check"` marks a step that only observes, so the walker does not try to click it.
 */
const CHECK_VERBS = /^(kiểm tra|xác nhận|quan sát|verify|check|thấy)\b/i;

/**
 * MỘT BƯỚC NGHIỆP VỤ CÓ THỂ LÀ HAI ĐỘNG TÁC (R2.1).
 *
 * Câu thật trong `project-docs/03_DEV/UI-flow.md`, xuất hiện ở 3/4 flow:
 *
 *     3. Nhập mã giảm giá vào ô nhập mã **rồi áp dụng**
 *
 * Tên bước nói HAI việc; cả chuỗi công cụ phía sau chỉ làm MỘT. `planStep()` trả một hành
 * động, `walkFlow()` thực hiện một hành động, `emitSteps()` sinh một thân hàm — nên hàm sinh
 * ra chỉ có `.fill(value)` và KHÔNG có cú click nào vào nút "Áp dụng".
 *
 * Hậu quả đo được trên lần chạy thật: mọi test case của luồng gõ mã vào ô rồi đi thẳng tới
 * thanh toán. Mã giảm giá CHƯA TỪNG được áp. Nhìn từ ngoài thì giống hệt bug sản phẩm
 * "áp mã hỏng mà vẫn thanh toán được" — nhưng không có ai bấm nút áp mã cả.
 *
 * ── VÌ SAO CHỈ TÁCH Ở `rồi` / `sau đó`, KHÔNG TÁCH Ở `và` ──
 * `và` trong tiếng Việt nối DANH TỪ nhiều hơn nối động tác ("thêm sản phẩm A và B"), nên tách
 * ở đó là tự tạo ra một lớp lỗi mới. `rồi` / `sau đó` chỉ thứ tự thời gian — chúng gần như
 * luôn ngăn hai động tác. Trên 4 flow thật hiện có, `rồi` phủ đúng 100% số ca cần tách.
 *
 * Tách nhầm KHÔNG âm thầm: mỗi lần tách đều được ghi vào `notes[]` để người viết tài liệu nhìn
 * thấy, và nếu phần thứ hai không khớp phần tử nào thì `walkFlow` ghi finding rồi dừng — chứ
 * không đoán một nút gần giống. Ngoài ra `walkFlow` còn có cửa kiểm `action_lost`: bước khai
 * N động tác mà chỉ làm được ít hơn N thì bị nêu tên, không biến mất im lặng như trước.
 */
const STEP_CONNECTOR = /\s+(?:rồi|sau\s+đó|then)\s+/i;

/** Tách một bước thành các động tác theo thứ tự. Trả về mảng 1 phần tử nếu không tách được. */
export function splitStepParts(text) {
    const raw = String(text ?? "").trim();
    if (!raw) return [];
    const pieces = raw.split(STEP_CONNECTOR).map(s => s.trim()).filter(Boolean);
    // Một mảnh quá ngắn thì gần như chắc chắn tách sai ("rồi" đứng trong một cụm khác).
    if (pieces.length < 2 || pieces.some(p => p.length < 2)) return [raw];
    return pieces;
}

function describeStep(text) {
    const hints = [...text.matchAll(/["'“”„»«]([^"'“”„»«]{1,80})["'“”„»«]/g)].map(m => m[1].trim()).filter(Boolean);
    // A leading check verb makes the whole step an observation; a check verb after the
    // action (…" — kiểm tra …") does not, the action still has to happen.
    const kind = CHECK_VERBS.test(text.trim()) ? "check" : "action";
    // Bước quan sát KHÔNG tách: "Kiểm tra X rồi Y" vẫn là một việc nhìn, không phải hai cú click.
    const parts = kind === "check" ? [String(text).trim()] : splitStepParts(text);
    return { hints, kind, parts };
}

/**
 * @param {string} markdown  contents of the UI flow document
 * @returns {{flows: Array<{name: string, entry: string|null,
 *              steps: Array<{n: number, text: string, kind: "action"|"check", hints: string[], parts: string[]}>}>,
 *            problems: string[], notes: string[], conventions: string|null}}
 *   `problems` lists what a human needs to fix (a flow with no steps, numbering that skips,
 *   an entry URL that is not a URL). Reported, never silently repaired: a flow document
 *   quietly "corrected" by code is a flow nobody can trust.
 *
 *   `notes` is the OTHER channel: things a human should SEE but does not have to fix — today
 *   that is "bước này được hiểu thành N động tác" (R2.1). Kept separate on purpose. Mixing
 *   information into `problems` teaches the reader to ignore `problems`, and that channel has
 *   to stay worth reading.
 */
export function parseUiFlows(markdown) {
    const lines = String(markdown ?? "").split("\n");
    const flows = [];
    const problems = [];
    /** Thông tin cho người đọc, KHÔNG phải thứ phải sửa. Xem chỗ đẩy `notes` bên dưới. */
    const notes = [];

    let current = null;
    let inFence = false;
    /** Đang thu mục "Quy ước…" — thu NGUYÊN VĂN, kể cả code fence, bảng và heading con. */
    let conventionLines = null;
    let conventions = null;
    /** Cấp heading của mục "Quy ước…" (số dấu #). Chỉ heading cấp BẰNG hoặc CAO HƠN mới đóng nó. */
    let conventionLevel = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Fenced blocks hold EXAMPLES of the format (the document explains itself), so a
        // `## Flow:` in there must not be parsed as a real flow.
        if (/^\s*```/.test(line)) {
            inFence = !inFence;
            if (conventionLines) conventionLines.push(line);
            continue;
        }
        if (inFence) {
            if (conventionLines) conventionLines.push(line);
            continue;
        }

        if (CONVENTION_RE.test(line) && !conventionLines) {
            if (conventions) {
                problems.push(`Có nhiều hơn một mục "Quy ước…" — chỉ mục đầu tiên được dùng.`);
            } else {
                conventionLines = [];
                conventionLevel = (/^(#+)/.exec(line)?.[1] ?? "##").length;
            }
            current = null;
            continue;
        }
        if (conventionLines) {
            // Chỉ heading cấp BẰNG hoặc CAO HƠN mới đóng mục. Heading CON (`###` dưới một `##`)
            // là nội dung của mục — bản đầu đóng ngay ở `###` nên chỉ thu được đoạn mở đầu, mất
            // toàn bộ phần quy ước thật bên dưới.
            const level = (/^(#+)\s+/.exec(line)?.[1] ?? "").length;
            if (level > 0 && level <= conventionLevel) {
                conventions = conventionLines.join("\n").trim() || null;
                conventionLines = null;
                // Chính dòng đóng lại là một mục "Quy ước…" nữa → mục thứ hai. Không báo thì nó
                // bị bỏ qua âm thầm, và người viết tưởng cả hai mục đều được dùng.
                if (CONVENTION_RE.test(line)) {
                    problems.push(`Có nhiều hơn một mục "Quy ước…" — chỉ mục đầu tiên được dùng.`);
                    current = null;
                    continue;
                }
                // KHÔNG `continue` ở đây: dòng này có thể chính là `## Flow:` tiếp theo.
            } else {
                conventionLines.push(line);
                continue;
            }
        }

        const flow = FLOW_RE.exec(line);
        if (flow) {
            current = { name: flow[1].trim(), entry: null, steps: [], identity: null, createsIdentity: null };
            flows.push(current);
            continue;
        }
        if (!current) continue;

        const entry = ENTRY_RE.exec(line);
        if (entry) {
            current.entry = entry[1].replace(/[`<>]/g, "");
            continue;
        }

        // "Tạo tư cách" PHẢI thử trước "Tư cách": tuy `IDENTITY_NEEDS_RE` neo `^` nên
        // "**Tạo tư cách:**" không khớp nó, thứ tự này vẫn viết ra để ai thêm biến thể mới
        // (ví dụ bỏ neo `^`) không vô tình biến luồng-tạo thành luồng-cần.
        const creates = IDENTITY_CREATES_RE.exec(line);
        if (creates) {
            current.createsIdentity = normIdentity(creates[1]);
            continue;
        }
        const needs = IDENTITY_NEEDS_RE.exec(line);
        if (needs) {
            current.identity = normIdentity(needs[1]);
            continue;
        }

        const step = STEP_RE.exec(line);
        if (step) {
            const text = step[2].replace(/\s*\*\*/g, "").trim();
            current.steps.push({ n: Number(step[1]), text, ...describeStep(text) });
            continue;
        }

        // Any other heading closes the flow — otherwise a "## CHƯA RÕ" section full of
        // numbered questions would be swallowed as flow steps.
        if (HEADING_RE.test(line)) current = null;
    }

    for (const f of flows) {
        if (f.steps.length === 0) {
            problems.push(`Flow "${f.name}" không có bước nào (cần danh sách có số: "1. ...").`);
        }
        if (!f.entry) {
            problems.push(`Flow "${f.name}" thiếu "**Entry:** <url>".`);
        } else if (!/^https?:\/\//i.test(f.entry)) {
            problems.push(`Flow "${f.name}": Entry "${f.entry}" không phải URL http(s).`);
        }
        const expected = f.steps.map((_, i) => i + 1).join(",");
        const actual = f.steps.map(s => s.n).join(",");
        if (expected !== actual) {
            problems.push(`Flow "${f.name}": số bước không liên tục (thấy ${actual}, mong ${expected}).`);
        }
        // An unfilled placeholder means a human was asked to supply something. A hint IS
        // allowed to be absent, but a hint that literally reads "[CẦN BỔ SUNG]" is a
        // leftover to-do, not intent — and in this repo it got there because the author of
        // the tooling (me) demanded element names the document should never have carried.
        for (const s of f.steps) {
            for (const h of s.hints) {
                if (/CẦN BỔ SUNG|TODO|\bTBD\b|^<.*>$/i.test(h)) {
                    problems.push(
                        `Flow "${f.name}" bước ${s.n}: còn placeholder "${h}". ` +
                        `Viết bước bằng lời nghiệp vụ bình thường và xoá placeholder — ` +
                        `tên phần tử thật do agent tự tìm bằng MCP, tài liệu KHÔNG cần biết.`
                    );
                }
            }
        }

        // Bước bị tách thành nhiều động tác (R2.1) được BÁO RA, không im lặng — nhưng vào
        // `notes`, KHÔNG vào `problems`.
        //
        // `problems` có một nghĩa đã chốt: "thứ NGƯỜI phải sửa" (xem chú thích của parseUiFlows).
        // Một lần tách THÀNH CÔNG không phải thứ cần sửa. Nhét nó vào `problems` là làm hỏng
        // nghĩa của kênh đó: `qa-leader` sẽ báo tài liệu luồng có vấn đề trong khi không có, và
        // người đọc học cách bỏ qua `problems` — đúng lúc nó có gì thật để nói.
        for (const s of f.steps) {
            if ((s.parts?.length ?? 1) > 1) {
                notes.push(
                    `Flow "${f.name}" bước ${s.n}: hiểu thành ${s.parts.length} động tác — ` +
                    s.parts.map((p, i) => `(${i + 1}) ${p}`).join(" ") + `. ` +
                    `Nếu KHÔNG đúng ý, tách thành các bước có số riêng trong tài liệu luồng.`
                );
            }
        }

        // Deliberately NOT checked: "an action step with no quoted element name".
        // That check used to exist and it was wrong — see describeStep(). A step written in
        // plain business language is the NORMAL case, not a defect.
    }
    if (flows.length === 0) problems.push(`Không tìm thấy flow nào — cần heading dạng "## Flow: <tên>".`);

    // ── Tư cách: khai hết, hoặc không khai gì (R6) ────────────────────────
    //
    // Dự án không có đăng nhập thì không phải khai gì — mọi thứ chạy y như trước.
    // Nhưng đã khai ở MỘT luồng thì tài liệu đang nói "app này có phân biệt tư cách", và một
    // luồng không khai trở thành câu hỏi không ai trả lời được: nó chạy với tư cách nào?
    // Đoán hộ là chỗ sinh ra test XANH SAI (xem chú thích ở IDENTITY_NEEDS_RE). Nên hỏi.
    const declared = flows.filter(f => f.identity || f.createsIdentity);
    if (declared.length) {
        for (const f of flows) {
            if (!f.identity && !f.createsIdentity) {
                problems.push(
                    `Flow "${f.name}" thiếu "**Tư cách:** <tên>". Tài liệu này CÓ khai tư cách ở luồng ` +
                    `khác, nên mọi luồng phải khai — viết "**Tư cách:** khách" nếu luồng chạy khi ` +
                    `chưa đăng nhập. Không khai thì không đoán được, và đoán sai làm test XANH SAI.`
                );
            }
        }
        // Tư cách được CẦN mà không luồng nào TẠO ra → tới lúc chạy sẽ không có state để nạp.
        // Bắt ở đây, lúc đọc tài liệu, thay vì để spec đỏ vì "chưa đăng nhập" ở tận cuối.
        const created = new Set(flows.map(f => f.createsIdentity).filter(Boolean));
        const needed = new Set(flows.map(f => f.identity).filter(i => i && i !== GUEST_IDENTITY));
        for (const want of needed) {
            if (!created.has(want)) {
                problems.push(
                    `Tư cách "${want}" được dùng nhưng KHÔNG luồng nào tạo ra nó. ` +
                    `Cần một luồng đăng nhập có "**Tạo tư cách:** ${want}".`
                );
            }
        }
        for (const f of flows) {
            if (f.createsIdentity === GUEST_IDENTITY) {
                problems.push(
                    `Flow "${f.name}": không thể "**Tạo tư cách:** khách" — khách là trạng thái ` +
                    `CHƯA đăng nhập, có sẵn, không cần luồng nào tạo.`
                );
            }
            if (f.createsIdentity && f.identity && f.identity !== GUEST_IDENTITY) {
                problems.push(
                    `Flow "${f.name}" vừa tạo tư cách "${f.createsIdentity}" vừa cần tư cách ` +
                    `"${f.identity}" — luồng đăng nhập phải bắt đầu từ khách.`
                );
            }
        }
    }

    // Mục quy ước nằm cuối file thì không có heading nào đóng nó — chốt ở đây.
    if (conventionLines && !conventions) conventions = conventionLines.join("\n").trim() || null;

    return { flows, problems, notes, conventions };
}

/** The flow a piece of work belongs to: exact name if given, else the first one. */
export function pickFlow(flows, name = null) {
    if (!flows.length) return null;
    if (!name) return flows[0];
    const lower = String(name).toLowerCase();
    return flows.find(f => f.name.toLowerCase() === lower)
        ?? flows.find(f => f.name.toLowerCase().includes(lower))
        ?? flows[0];
}

/**
 * Element-name hints the author happened to write, in first-appearance order.
 *
 * NOT a shopping list of things to find — the walker discovers elements from the LIVE
 * snapshot at each step, which is the only place the truth exists. This is for logging and
 * for handing the AI a nudge; a flow with zero hints walks exactly the same way.
 */
export function hintsOf(flow) {
    const seen = [];
    for (const s of flow?.steps ?? []) {
        for (const h of s.hints ?? []) if (!seen.includes(h)) seen.push(h);
    }
    return seen;
}

/**
 * Các tư cách của dự án, đọc từ tài liệu luồng (R6).
 *
 * @returns {{ needed: string[], created: string[], loginFlowFor: Record<string, string> }}
 *   needed       — mọi tư cách có luồng dùng tới, KỂ CẢ `guest`
 *   created      — tư cách phải dựng bằng một luồng đăng nhập (không bao giờ có `guest`)
 *   loginFlowFor — tư cách → tên luồng tạo ra nó
 *
 * Dự án không khai tư cách nào thì cả ba đều rỗng, và mọi thứ phía sau giữ nguyên hành vi cũ.
 */
export function identitiesOf(flows) {
    const needed = [], created = [], loginFlowFor = {};
    for (const f of flows ?? []) {
        if (f.identity && !needed.includes(f.identity)) needed.push(f.identity);
        if (f.createsIdentity && f.createsIdentity !== GUEST_IDENTITY) {
            if (!created.includes(f.createsIdentity)) created.push(f.createsIdentity);
            // Hai luồng cùng tạo một tư cách: giữ luồng ĐẦU. `parseUiFlows` không coi đó là lỗi
            // (có thể cố ý: đăng nhập bằng form, và đăng nhập nhanh 1-click), nhưng chỉ một
            // luồng được dùng để dựng state — chọn theo thứ tự tài liệu cho deterministic.
            loginFlowFor[f.createsIdentity] ??= f.name;
        }
    }
    return { needed, created, loginFlowFor };
}

/** Steps that actually do something, in order — what to walk to reach a later screen. */
export function actionSteps(flow) {
    return (flow?.steps ?? []).filter(s => s.kind === "action");
}
