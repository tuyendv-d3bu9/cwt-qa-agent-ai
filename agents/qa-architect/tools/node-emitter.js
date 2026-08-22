// agents/qa-architect/tools/node-emitter.js
// Từ một BẢN KHAI node (JSON do LLM viết) → các file của node đó. DETERMINISTIC.
//
// RANH GIỚI (cùng ranh giới đã gỡ được lỗi P4). LLM viết BẢN KHAI: node tên gì, đọc gì, ghi
// gì, prompt của skill nội dung ra sao. LLM KHÔNG viết `index.js`, KHÔNG viết `CONTRACT`,
// KHÔNG chọn đường dẫn. Những thứ đó sinh ở đây bằng code, nên chúng không thể sai kiểu
// "gõ tên export không tồn tại" hay "quên khai requires".
//
// Đây đúng là cách `gherkin-codegen.js` sinh spec: LLM viết `.feature` (nội dung), code sinh
// `.spec.ts` (cấu trúc). Trước đó LLM viết cả file spec và 13/21 file không thực hiện hành
// động nào — chỗ nào để LLM tự dựng cấu trúc thì chỗ đó hỏng âm thầm.

import * as PATHS from "../../runtime/paths.js";

/** Tên node: `qa-` + chữ thường/gạch ngang. Cũng là tên thư mục VÀ khoá bảng `run_steps`. */
export const NODE_NAME_RE = /^qa-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mốc phân định khối export do bộ sinh thêm vào `paths.js`. */
export const PATHS_BEGIN = "// <<< qa-architect: BẮT ĐẦU KHỐI SINH TỰ ĐỘNG — đừng viết tay trong khối này";
export const PATHS_END = "// <<< qa-architect: HẾT KHỐI SINH TỰ ĐỘNG";

/**
 * Kiểm bản khai. Trả mảng vấn đề — rỗng nghĩa là sinh được.
 *
 * Mỗi luật ứng với một cách LLM ĐÃ hoặc SẼ chệch: bịa tên export không có trong paths.js,
 * đặt tên node trùng node đang chạy, viết prompt rỗng rồi để node "tự hiểu".
 *
 * @param {object} spec
 * @param {{existingNodes: Iterable<string>, paths?: object}} ctx
 */
export function validateSpec(spec, { existingNodes = [], paths = PATHS } = {}) {
    const problems = [];
    const has = new Set(existingNodes);

    if (!spec || typeof spec !== "object") return ["Bản khai không phải object JSON."];

    if (typeof spec.name !== "string" || !NODE_NAME_RE.test(spec.name)) {
        problems.push(`\`name\` phải khớp ${NODE_NAME_RE} (ví dụ "qa-flaky-scanner"), nhận: ${JSON.stringify(spec.name)}.`);
    } else if (has.has(spec.name)) {
        problems.push(`Đã có node tên "${spec.name}". Bộ sinh KHÔNG ghi đè node đang chạy — đổi tên hoặc sửa node cũ bằng tay.`);
    }

    for (const field of ["title", "mission", "deliverable"]) {
        if (typeof spec[field] !== "string" || spec[field].trim().length < 10) {
            problems.push(`\`${field}\` phải là câu mô tả thật (≥10 ký tự), nhận: ${JSON.stringify(spec[field])}.`);
        }
    }

    for (const field of ["responsibilities", "can", "cant"]) {
        if (!Array.isArray(spec[field]) || spec[field].length === 0) {
            problems.push(`\`${field}\` phải là mảng không rỗng.`);
        }
    }

    const reads = spec.reads;
    if (!Array.isArray(reads)) {
        problems.push(`\`reads\` phải là mảng TÊN EXPORT trong paths.js (mảng rỗng nếu node không đọc file nào).`);
    } else {
        for (const key of reads) {
            if (typeof paths[key] !== "string") {
                problems.push(
                    `\`reads\` có "${key}" — paths.js KHÔNG có export nào tên đó. ` +
                    `Node chỉ được đọc đường dẫn đã khai ở paths.js; cần đường dẫn mới thì người thêm vào paths.js trước.`
                );
            }
        }
        if (new Set(reads).size !== reads.length) problems.push(`\`reads\` có tên lặp.`);
    }

    const skill = spec.skill;
    if (!skill || typeof skill !== "object") {
        problems.push(`\`skill\` phải là object có \`purpose\` và \`prompt\`.`);
    } else {
        if (typeof skill.purpose !== "string" || skill.purpose.trim().length < 10) problems.push(`\`skill.purpose\` quá ngắn hoặc thiếu.`);
        if (typeof skill.prompt !== "string" || skill.prompt.trim().length < 200) {
            // Một prompt vài dòng là chính xác cái người dùng đã phê: "vài dòng code, vài dòng
            // thông tin, góp lại gọi là Agent". Node sinh ra bằng một prompt rỗng sẽ vô dụng
            // đúng như thế, nên chặn ngay từ bản khai.
            problems.push(`\`skill.prompt\` phải là prompt thật (≥200 ký tự): nói rõ đầu vào, cách làm, ĐỊNH DẠNG ĐẦU RA. Hiện: ${String(skill.prompt ?? "").trim().length} ký tự.`);
        }
    }

    const tools = spec.needsDeterministicTools;
    if (tools !== undefined && !Array.isArray(tools)) {
        problems.push(`\`needsDeterministicTools\` phải là mảng (rỗng nếu node không cần tool nào).`);
    } else {
        for (const t of tools ?? []) {
            if (!t?.file || !/^[a-z0-9-]+\.js$/.test(t.file)) problems.push(`Tool "${t?.file}" — tên file phải dạng kebab-case + .js.`);
            if (!t?.what) problems.push(`Tool "${t?.file}" thiếu \`what\` (nó tính/kiểm cái gì).`);
        }
    }

    return problems;
}

/** `qa-flaky-scanner` → `DELIVERABLE_FLAKY_SCANNER` (tên export thêm vào paths.js). */
export function pathsExportName(nodeName) {
    return "DELIVERABLE_" + nodeName.replace(/^qa-/, "").replace(/-/g, "_").toUpperCase();
}

/** `qa-flaky-scanner` → `deliverable-flaky-scanner.md` */
export function deliverableFileName(nodeName) {
    return `deliverable-${nodeName.replace(/^qa-/, "")}.md`;
}

/**
 * Chèn export đường dẫn cho node mới vào `paths.js`, trong một khối có mốc rõ ràng.
 *
 * VÌ SAO PHẢI SỬA `paths.js` CHỨ KHÔNG ĐẶT ĐƯỜNG DẪN TRONG NODE. Vì đó là toàn bộ lý do
 * `paths.js` tồn tại: trước nó, cùng một đường dẫn nằm rải rác 13 file và sửa một chỗ là
 * sinh ra một node âm thầm đọc file không ai ghi. Node sinh tự động mà tự giữ đường dẫn
 * riêng thì lỗi đó quay lại ngay, chỉ khác là nhanh hơn.
 *
 * Idempotent: gọi lại với cùng node thì trả về nguyên văn cũ.
 *
 * @returns {{content: string, added: boolean, exportName: string, path: string}}
 */
export function insertPathsExport(pathsSource, nodeName) {
    const exportName = pathsExportName(nodeName);
    const relPath = `${PATHS.DELIVERABLES_DIR}/${deliverableFileName(nodeName)}`;
    const line = `export const ${exportName} = \`\${DELIVERABLES_DIR}/${deliverableFileName(nodeName)}\`;`;

    if (new RegExp(`^export const ${exportName}\\b`, "m").test(pathsSource)) {
        return { content: pathsSource, added: false, exportName, path: relPath };
    }

    if (pathsSource.includes(PATHS_BEGIN)) {
        const content = pathsSource.replace(PATHS_END, `${line}\n${PATHS_END}`);
        return { content, added: true, exportName, path: relPath };
    }

    const block = [
        ``,
        `// ── Đường dẫn của node sinh bằng agents/qa-architect ────────────────`,
        `// Sinh tự động. Sửa được bằng tay, nhưng đừng xoá 2 dòng mốc: bộ sinh dùng chúng để`,
        `// chèn thêm mà không đụng phần còn lại của file.`,
        PATHS_BEGIN,
        line,
        PATHS_END,
        ``,
    ].join("\n");

    return { content: pathsSource.replace(/\s*$/, "\n") + block, added: true, exportName, path: relPath };
}

/** `qa-flaky-scanner` → `QA Flaky Scanner` (chỉ dùng cho tiêu đề tài liệu). */
const titleCase = (name) => name.split("-").map(w => w === "qa" ? "QA" : w[0].toUpperCase() + w.slice(1)).join(" ");

/** role.md — hợp đồng vào/ra viết bằng tiếng người, đúng khung của 6 role.md hiện có. */
export function emitRole(spec) {
    const skillFile = "01_" + spec.name.replace(/^qa-/, "").replace(/-/g, "_") + ".md";
    const reads = (spec.reads ?? []).map(k => `- \`${PATHS[k]}\`  (paths.${k})`);
    return [
        `# Role: ${spec.title}`,
        ``,
        `> Node này do \`agents/qa-architect\` sinh từ mô tả. Sửa tay được — nhưng \`CONTRACT\``,
        `> trong \`index.js\` là thứ workflow đọc, nên sửa role.md mà không sửa CONTRACT thì`,
        `> tài liệu và hành vi lệch nhau.`,
        ``,
        `## Mission`,
        `- ${spec.mission}`,
        ``,
        `## Responsibilities`,
        ...spec.responsibilities.map(r => `- ${r}`),
        ``,
        `## Can`,
        ...spec.can.map(r => `- ${r}`),
        ``,
        `## Can't`,
        ...spec.cant.map(r => `- ${r}`),
        `- Không tự gọi node khác. Workflow điều phối; node không gọi node.`,
        ``,
        `## Allowed Skills (agents/${spec.name}/skills/)`,
        `- \`${skillFile}\` — ${spec.skill.purpose}`,
        ``,
        `## Knowledge Referenced`,
        `- **Kiến trúc memory**: xem \`memory/README.md\` — định nghĩa 5 tầng + hợp đồng bàn giao.`,
        `  File này KHÔNG định nghĩa lại tầng memory, chỉ liệt kê node này đọc gì.`,
        `- Shared (memory/semantic/): \`fact-framework.md\``,
        ``,
        `## Input/Output contract`,
        `- Input: workflow gọi \`run()\`; các file dưới đây được đọc và đưa vào prompt:`,
        ...(reads.length ? reads : [`- (không đọc file nào)`]),
        `- Output: \`${PATHS.DELIVERABLES_DIR}/${deliverableFileName(spec.name)}\` — ${spec.deliverable}`,
        ``,
        ...(spec.needsDeterministicTools?.length
            ? [
                `## CHƯA HOÀN CHỈNH — thiếu cửa tự kiểm`,
                ``,
                `Node này còn thiếu ${spec.needsDeterministicTools.length} tool deterministic. Cho tới khi có,`,
                `đầu ra của nó **chưa có gì kiểm** ngoài chính LLM đã viết ra nó:`,
                ``,
                ...spec.needsDeterministicTools.map(t => `- \`tools/${t.file}\` — ${t.what}`),
                ``,
            ]
            : []),
    ].join("\n");
}

/** skills/01_*.md — theo đúng khung skill của repo (Purpose / Prompt Type / Variables / PROMPT / Quality Check). */
export function emitSkill(spec) {
    return [
        `# Skill: ${spec.skill.name ?? spec.title}`,
        ``,
        `## Purpose`,
        spec.skill.purpose,
        ``,
        `## Prompt Type`,
        spec.skill.promptType ?? "Template-based",
        ``,
        `## Variables`,
        ...(spec.reads?.length ? spec.reads.map(k => `- \`{{${varNameFor(k)}}}\` — nội dung \`${PATHS[k]}\``) : [`- (không có)`]),
        ``,
        `## PROMPT`,
        spec.skill.prompt.trim(),
        ``,
        `## Quality Check`,
        spec.skill.qualityCheck ?? `Theo FACT framework (memory/semantic/fact-framework.md).`,
        ``,
    ].join("\n");
}

/** `TEST_RESULTS` → `test_results` (tên biến trong prompt, giữ nguyên quy ước snake_case của các skill hiện có). */
export const varNameFor = (pathKey) => String(pathKey).toLowerCase();

/**
 * index.js của node mới.
 *
 * BA QUYẾT ĐỊNH ĐÃ CHỐT, ĐỀU CÓ LÝ DO ĐO ĐƯỢC:
 *
 * 1. NẠP SẴN NỘI DUNG FILE, KHÔNG CẤP TOOL. Vòng lặp tool gửi lại toàn bộ hội thoại mỗi
 *    lượt: đo được ĐẮT HƠN 16,6 LẦN so với nhét thẳng corpus 8,4k token vào một prompt.
 *    Tool là để "quay lại đọc chỗ khác", không phải để "đọc ít hơn". Node sinh tự động biết
 *    trước mình cần đọc gì (khai trong `reads`) nên nó không cần tool.
 *
 * 2. KHÔNG SINH `selfCheck` GIẢ. Một cửa tự kiểm luôn trả "không có vấn đề" là một hàm rỗng,
 *    và hàm rỗng thì LUÔN XANH. Repo này đã trả giá cho đúng lỗi đó (spec không có assertion
 *    nào vẫn pass). Nên: không có tool deterministic thì KHÔNG có cửa, và node **nói to điều
 *    đó mỗi lần chạy** — không phải chỉ trong một dòng chú thích không ai đọc.
 *
 * 3. GHI FILE Ở CUỐI, MỘT LẦN. Không ghi từng phần: một deliverable ghi nửa vời trông y như
 *    một deliverable hoàn chỉnh với node đứng sau nó.
 */
export function emitIndex(spec) {
    const skillFile = "01_" + spec.name.replace(/^qa-/, "").replace(/-/g, "_") + ".md";
    const exportName = pathsExportName(spec.name);
    const reads = spec.reads ?? [];
    const tools = spec.needsDeterministicTools ?? [];

    const lines = [
        `// agents/${spec.name}/index.js`,
        `// Node: ${spec.title}`,
        `// SINH TỰ ĐỘNG bởi agents/qa-architect. Sửa tay được — nhưng nếu sửa \`CONTRACT\` thì`,
        `// chạy lại \`node qa.js nodes\` để chắc chắn nó còn hợp lệ.`,
        `//`,
        `// ${spec.mission}`,
        ``,
        `import { readFile } from "node:fs/promises";`,
        `import { runTool } from "../runtime/tools.js";`,
        `import { runAgentLoop } from "../runtime/agent-loop.js";`,
        `import { contextFor } from "../runtime/knowledge.js";`,
        `import * as P from "../runtime/paths.js";`,
        ``,
        `const ROLE = await readFile(new URL("./role.md", import.meta.url), "utf8");`,
        `const FACT = await readFile(new URL("../../memory/semantic/fact-framework.md", import.meta.url), "utf8");`,
        `const SKILL = await readFile(new URL("./skills/${skillFile}", import.meta.url), "utf8");`,
        ``,
    ];

    if (tools.length) {
        lines.push(
            `// Tool deterministic còn THIẾU. Danh sách này được in ra MỖI LẦN CHẠY, không phải`,
            `// chỉ nằm trong chú thích: một node chưa có cửa tự kiểm thì đầu ra của nó chưa có`,
            `// gì kiểm ngoài chính LLM vừa viết ra nó, và điều đó phải nhìn thấy được.`,
            `const THIEU_TOOL = [`,
            ...tools.map(t => `    ${JSON.stringify(`tools/${t.file}` + (t.what ? ` — ${t.what}` : ""))},`),
            `];`,
            ``,
        );
    }

    lines.push(
        `export const CONTRACT = {`,
        `    agent: ${JSON.stringify(spec.name)},`,
        `    requires: [${reads.map(k => `P.${k}`).join(", ")}],`,
        `    produces: [P.${exportName}],`,
        `    inputs: {${reads.map(k => `${varNameFor(k)}Path: ${JSON.stringify(k)}`).join(", ")}},`,
        `};`,
        ``,
        `export async function run(input = {}) {`,
    );

    if (tools.length) {
        lines.push(
            `    for (const t of THIEU_TOOL) {`,
            `        console.warn(\`  [${spec.name}] CHƯA CÓ CỬA TỰ KIỂM: \${t}\`);`,
            `    }`,
            ``,
        );
    }

    if (reads.length) {
        lines.push(`    // Nạp sẵn đầu vào (xem quyết định 1 trong node-emitter.js).`, `    const parts = [];`);
        for (const key of reads) {
            const v = varNameFor(key);
            lines.push(
                `    const ${v} = await runTool("read_file", { path: input.${v}Path ?? P.${key} });`,
                `    if (${v}.error) return { status: "error", data: null, error: \`Không đọc được \${input.${v}Path ?? P.${key}}: \${${v}.error}\` };`,
                `    parts.push(\`${v}=\\n\${${v}.content}\`);`,
            );
        }
        lines.push(`    const task = parts.join("\\n\\n");`, ``);
    } else {
        lines.push(`    const task = ${JSON.stringify(spec.mission)};`, ``);
    }

    lines.push(
        `    const res = await runAgentLoop({`,
        `        // Tầng 2 được TRUY VẤN theo nội dung task, không nhét cả vào (memory/README.md).`,
        `        system: [ROLE, FACT, contextFor(task), SKILL].filter(Boolean).join("\\n\\n"),`,
        `        task,`,
        `        label: ${JSON.stringify(spec.name)},`,
        `    });`,
        ``,
        `    if (!res.text?.trim()) {`,
        `        return { status: "error", data: null, error: "LLM không trả về nội dung nào — không ghi file rỗng." };`,
        `    }`,
        ``,
        `    await runTool("write_file", { path: P.${exportName}, content: res.text });`,
        ``,
        `    return {`,
        `        status: "success",`,
        `        data: {`,
        `            deliverableFile: P.${exportName},`,
        `            cost: res.usage,`,
        tools.length ? `            notes: THIEU_TOOL.map(t => \`chưa có cửa tự kiểm: \${t}\`),` : `            notes: [],`,
        `        },`,
        `        error: null,`,
        `    };`,
        `}`,
        ``,
    );

    return lines.join("\n");
}

/** Khung tool deterministic còn thiếu — CỐ Ý nổ khi bị gọi, không trả giá trị giả. */
export function emitToolStub(spec, tool) {
    return [
        `// agents/${spec.name}/tools/${tool.file}`,
        `// KHUNG — chưa có phần thân. Việc của nó: ${tool.what}`,
        `//`,
        `// VÌ SAO ĐÂY LÀ KHUNG CHỨ KHÔNG PHẢI CODE SINH SẴN. Việc này có ĐÚNG/SAI (đếm, so`,
        `// khớp, chấm điểm), nên nó phải là code người đọc và tin được, không phải văn LLM.`,
        `// ${tool.whyCode ?? "Xem bảng \"ai viết cái gì\" trong agents/qa-automation/knowledge/playwright-conventions.md."}`,
        `//`,
        `// NÉM LỖI CHỨ KHÔNG TRẢ GIÁ TRỊ GIẢ: một cửa kiểm trả "không có vấn đề" khi chưa được`,
        `// viết là một hàm rỗng, và hàm rỗng thì luôn xanh. Thà nổ để biết là chưa có.`,
        ``,
        `export function check(/* input */) {`,
        `    throw new Error(`,
        `        "${spec.name}/${tool.file} chưa được viết: ${String(tool.what).replace(/"/g, "'")}. " +`,
        `        "Viết thân hàm rồi nối vào index.js (selfCheck của runAgentLoop)."`,
        `    );`,
        `}`,
        ``,
    ].join("\n");
}

/**
 * Toàn bộ file sẽ ghi cho một bản khai. Trả về map đường dẫn → nội dung, KHÔNG ghi đĩa —
 * để `--dry-run` in ra được đúng thứ sẽ ghi, và để test không cần đĩa.
 */
export function emitNode(spec) {
    const dir = `agents/${spec.name}`;
    const skillFile = "01_" + spec.name.replace(/^qa-/, "").replace(/-/g, "_") + ".md";
    const files = {
        [`${dir}/index.js`]: emitIndex(spec),
        [`${dir}/role.md`]: emitRole(spec),
        [`${dir}/skills/${skillFile}`]: emitSkill(spec),
    };
    for (const t of spec.needsDeterministicTools ?? []) {
        files[`${dir}/tools/${t.file}`] = emitToolStub(spec, t);
    }
    // `knowledge/` để trống nhưng CÓ tồn tại: mọi node khác đều có, và một node thiếu thư mục
    // này sẽ khiến người đọc tưởng nó là loại khác.
    files[`${dir}/knowledge/.gitkeep`] = "";
    if (!(spec.needsDeterministicTools ?? []).length) files[`${dir}/tools/.gitkeep`] = "";
    return files;
}
