// agents/qa-automation/tools/step-emitter.js
// Emit the reusable step library from (flow steps × walk result × Page Object).
// DETERMINISTIC — no LLM writes a line.
//
// THIS IS THE "TÍNH DÙNG LẠI" PIECE. Before: the LLM wrote 21 whole spec files, each from
// scratch, each inventing its own way to reach the checkout screen — 21 independent chances
// to hallucinate, and measurably 13 of the 21 ended up with ZERO actions (just `goto('/')`
// plus two screenshots). After: the journey is ONE set of step functions, written once from
// what the browser actually reported, and every test case calls them.
//
// WHO WRITES WHAT, which is the point the whole design turns on:
//   UI-flow.md   (human)          business intent, in order
//   MCP          (runtime)        what is on screen — the a11y yaml
//   AI           (runtime, /step) which node in that yaml the step means   ← judgement
//   Playwright   (browser_generate_locator)  the locator string            ← not the LLM
//   THIS FILE    (deterministic)  the step function that wires them together
// The LLM's remaining job shrinks to mapping a test case onto these steps + its data.
//
// Generated into tests/steps/, which IS committed and reviewed: it is the durable asset,
// unlike .qa-run/tests/*.spec.ts which is output. Regenerated on each successful explore.

import { accessorFor } from "./page-object-emitter.js";

/** Business step text -> a JS function name. Same ASCII-folding rule as the Page Object. */
export function toStepName(text, n) {
    const base = String(text ?? "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .replace(/[^A-Za-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .slice(0, 6)                                  // long sentences make unreadable names
        .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join("");
    return base ? `step${n}_${base}` : `step${n}`;
}

/**
 * @param {object} o
 * @param {{name: string, entry: string|null, steps: Array}} o.flow
 * @param {Array} o.visited         flow-walker's `visited` — which element each step used
 * @param {Array} o.exported        emitPageObject()'s `exported`
 * @param {string} [o.pageClass]
 * @param {string} [o.pageImport]   import path from tests/steps/ to tests/pages/
 * @returns {{content: string, steps: Array<{n, name, text, kind, accessor, action, needsValue}>, unimplemented: Array}}
 */
export function emitSteps({ flow, visited = [], exported = [], pageClass = "AppPage", pageImport = "../pages/app.page" }) {
    const byStep = new Map(visited.map(v => [v.step, v]));
    const steps = [];
    const unimplemented = [];

    for (const s of flow?.steps ?? []) {
        const v = byStep.get(s.n);
        const name = toStepName(s.text, s.n);

        if (s.kind === "check") {
            // An observation step gets a step function that takes the assertion from the
            // CALLER. It must not invent one: what counts as correct comes from the test
            // case's Expected Result, and pass/fail may only come from expect()
            // (knowledge/oracle-problem.md).
            steps.push({ n: s.n, name, text: s.text, kind: "check", accessor: null, action: null, needsValue: false });
            continue;
        }

        // `visited` only contains steps the walk actually performed. A step the walk never
        // reached has no verified element, so no step function is emitted for it — the
        // alternative is emitting one built on a guess, which is how a whole downstream
        // spec ends up wrong.
        if (!v || !v.element) {
            unimplemented.push({
                n: s.n, text: s.text,
                why: v ? "đi luồng không xác định được phần tử" : "đi luồng chưa tới bước này",
            });
            continue;
        }

        // BƯỚC LÀM ĐƯỢC MỘT NỬA THÌ KHÔNG SINH HÀM.
        //
        // `walkFlow` giờ ghi lại cả phần đã làm khi bước dừng giữa chừng (trạng thái trình duyệt
        // là thật, bỏ đi là nói dối). Nhưng sinh hàm từ nó thì ra đúng con quái vật đang sửa:
        // một `step3_...` chỉ có `.fill(value)` và không có cú click nào — bug gốc của cả
        // TODO.Update4, quay lại bằng cửa sau và lần này KHÔNG ai nghi ngờ vì "code đã sửa rồi".
        if (v.partial) {
            unimplemented.push({
                n: s.n, text: s.text,
                why: `đi luồng mới làm được ${v.actions?.length ?? 0}/${s.parts?.length ?? "?"} động tác — ` +
                    `sinh hàm nửa vời là dựng lại đúng lỗi "gõ mã nhưng không bấm áp dụng"`,
            });
            continue;
        }

        // MỘT bước = MỘT hoặc NHIỀU động tác (R2.1). `visited[i].actions` là nguồn sự thật;
        // hình dạng cũ (`action`/`element` phẳng) vẫn đọc được, để flow dựng tay trong bộ test
        // và mọi thứ chưa cập nhật không gãy.
        const rawActions = v.actions?.length
            ? v.actions
            : [{ action: v.action, element: v.element, part: s.text }];

        const ops = [];
        let broken = null;
        for (const a of rawActions) {
            const m = /^(\S+)\s+"(.*)"$/.exec(a.element ?? "");
            const role = m ? m[1] : "";
            const elName = m ? m[2] : a.element;
            const accessor = accessorFor(exported, role, elName);
            if (!accessor) {
                broken = `Page Object không có accessor cho ${role} "${elName}"`;
                break;
            }
            ops.push({
                accessor,
                action: a.action === "browser_type" ? "fill" : a.action === "browser_select_option" ? "select" : "click",
                part: a.part ?? s.text,
            });
        }
        if (broken) { unimplemented.push({ n: s.n, text: s.text, why: broken }); continue; }

        // Hai động tác cùng cần một giá trị nhập thì hàm phải nhận HAI tham số — chưa hỗ trợ, và
        // đoán rằng chúng dùng chung một giá trị là sai âm thầm. Từ chối, nói rõ lý do.
        const valueOps = ops.filter(o => o.action !== "click");
        if (valueOps.length > 1) {
            unimplemented.push({
                n: s.n, text: s.text,
                why: `bước có ${valueOps.length} động tác cần giá trị nhập (${valueOps.map(o => `"${o.part}"`).join(", ")}) — ` +
                    `tách thành các bước có số riêng trong tài liệu luồng`,
            });
            continue;
        }

        steps.push({
            n: s.n, name, text: s.text, kind: "action",
            ops,
            // Giữ cho tương thích: nhiều chỗ (và bộ test) đọc `accessor`/`action` của động tác đầu.
            accessor: ops[0].accessor,
            action: ops[0].action,
            needsValue: valueOps.length > 0,
        });
    }

    const lines = [
        `// SINH TỰ ĐỘNG bởi agents/qa-automation/tools/step-emitter.js.`,
        `//`,
        `// Đây là THƯ VIỆN STEP DÙNG LẠI của luồng "${flow?.name ?? "(không tên)"}".`,
        `// Mọi test case của luồng này gọi các hàm dưới đây thay vì mỗi test tự viết lại đường đi.`,
        `//`,
        `// Locator không nằm ở đây — chúng ở Page Object, do Playwright sinh từ phần tử thật.`,
        `// File này chỉ nối: bước nghiệp vụ -> accessor -> hành động.`,
        `//`,
        `// Được COMMIT và cần người review: đây là tài sản dùng lại, khác với`,
        `// .qa-run/tests/*.spec.ts là thứ sinh ra mỗi lần.`,
        ``,
        `import type { Page } from '@playwright/test';`,
        `import { ${pageClass} } from '${pageImport}';`,
        ``,
    ];

    if (flow?.entry) {
        lines.push(
            `/** Mở điểm bắt đầu của luồng. Lấy từ **Entry:** trong tài liệu luồng. */`,
            `export async function openEntry(page: Page) {`,
            `  await page.goto('${flow.entry.replace(/'/g, "\\'")}');`,
            `}`,
            ``,
        );
    }

    for (const s of steps) {
        lines.push(`/** Bước ${s.n} của luồng: ${s.text.replace(/\*\//g, "*\\/")} */`);
        if (s.kind === "check") {
            lines.push(
                `// Bước quan sát — KHÔNG có assertion sẵn ở đây có chủ ý: điều gì là "đúng" đến từ`,
                `// Expected Result của test case, và pass/fail chỉ được đến từ expect() ở spec.`,
                `export async function ${s.name}(page: Page) {`,
                `  // không hành động; spec tự assert theo Expected Result của nó`,
                `}`,
                ``,
            );
            continue;
        }
        const ops = s.ops ?? [{ accessor: s.accessor, action: s.action, part: s.text }];
        const body = [];

        if (s.needsValue) {
            body.push(
                `  if (value === undefined || value === null || value === '') {`,
                `    // Thà nổ rõ ràng còn hơn fill('') rồi để test fail vì lý do sai.`,
                `    // Đúng bẫy đã làm TC-D-002 fail: fill(tc.data.fields.voucher_code) với field không tồn tại.`,
                `    throw new Error('${s.name}: thiếu giá trị để nhập (bước "${s.text.replace(/'/g, "\\'")}")');`,
                `  }`,
            );
        }

        for (const op of ops) {
            // Bước nhiều động tác: chú thích từng động tác, để đọc file biết ngay câu nghiệp vụ
            // nào ứng với dòng nào. Bước một động tác giữ nguyên như cũ, không thêm nhiễu.
            if (ops.length > 1) body.push(`  // ${op.part}`);
            if (op.action === "fill") body.push(`  await new ${pageClass}(page).${op.accessor}.fill(value);`);
            else if (op.action === "select") body.push(`  await new ${pageClass}(page).${op.accessor}.selectOption(value);`);
            else body.push(`  await new ${pageClass}(page).${op.accessor}.click();`);
        }

        lines.push(
            `export async function ${s.name}(page: Page${s.needsValue ? ", value: string" : ""}) {`,
            ...body,
            `}`,
            ``,
        );
    }

    if (unimplemented.length) {
        lines.push(
            `// ── CHƯA CÓ STEP CHO CÁC BƯỚC SAU ──────────────────────────────`,
            `// Không sinh hàm rỗng cho chúng: một hàm rỗng sẽ được spec gọi và "thành công" mà`,
            `// không làm gì, biến một bước bị bỏ qua thành một test xanh giả.`,
        );
        for (const u of unimplemented) lines.push(`//   bước ${u.n}: ${u.text}  →  ${u.why}`);
        lines.push(`// Cách sửa: explore lại để đi được tới các bước đó (xem .qa-run/deliverables/exploratory-findings.md).`, ``);
    }

    return { content: lines.join("\n"), steps, unimplemented };
}

/**
 * The bounded vocabulary handed to the Gherkin writer.
 *
 * Bounded is the whole idea: given this list, the LLM must REUSE a phrasing instead of
 * inventing a new one per test case. Twenty-one test cases inventing twenty-one phrasings
 * is how twenty-one incompatible specs happened.
 */
export function stepCatalogue({ steps, unimplemented = [] }) {
    return {
        available: [
            ...steps.map(s => ({ name: s.name, text: s.text, kind: s.kind, needsValue: s.needsValue })),
            // ── CHECKPOINT GIỮA LUỒNG (R2.3a) ────────────────────────────────
            //
            // Không đến từ việc đi luồng, mà là một step DỰNG SẴN luôn có mặt. Nó tồn tại để
            // trả lời vế thứ hai của câu hỏi mở ra cả TODO.Update4:
            //   "chỗ áp mã chưa thành công thì ... đánh giá bằng cái gì?"
            //
            // Ảnh nói CÁI GÌ đang hiện. `expect()` nói ĐÚNG HAY SAI. Ranh giới đó là luật
            // (oracle-problem.md) và không đổi. Nhưng trước đây `expect()` chỉ có ở CUỐI spec,
            // nên một luồng hỏng ngay ở bước 3 vẫn chạy tiếp tới bước 5 rồi mới đỏ — hoặc tệ
            // hơn, vẫn xanh. Step này cho phép `.feature` đặt một `expect()` NGAY TẠI bước đó.
            //
            // Từ vựng vẫn BỊ CHẶN: LLM không viết được assertion tuỳ ý, nó chỉ chọn được step
            // này và điền chuỗi cần thấy. Mọi thứ khác `compileFeature()` từ chối.
            CHECKPOINT_STEP,
        ],
        missing: unimplemented.map(u => ({ text: u.text, why: u.why })),
    };
}

/**
 * Step checkpoint dựng sẵn. `kind: "assert"` — `gherkin-codegen.emitSpec()` biên dịch nó
 * thành `expect(getByText(...)).toBeVisible()` tại đúng vị trí của nó trong luồng.
 */
export const CHECKPOINT_STEP = Object.freeze({
    name: "__checkpoint",
    text: "thấy trên màn hình",
    kind: "assert",
    needsValue: true,
});
