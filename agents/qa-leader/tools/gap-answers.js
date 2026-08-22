// agents/qa-leader/tools/gap-answers.js
// Deterministic (NO LLM) reader for the clarification report — the file where the pipeline
// asks the QA a question and waits.
//
// WHAT WAS BROKEN. The gap report was a markdown TABLE whose last column was
// "Câu hỏi làm rõ cho BA/DEV". There was no answer column: the person being asked had
// nowhere to write. And flow-2 did this with whatever the file contained:
//
//     const current = await readFile(TASK_FILE);
//     await writeFile(TASK_FILE, current + `\n\n## User Clarification …\n${formAnswers}`);
//
// It appended the WHOLE FILE as prose. Consequences, all silent:
//   - no idea which answer belongs to which question;
//   - no idea whether anything was answered at all — an untouched form sails straight
//     through and the pipeline proceeds as if the conflict were resolved;
//   - the answer lives only in a run-scoped file, so the next run asks again.
//
// This module makes the answer a first-class, per-question, machine-readable thing, so
// flow-2 can (a) stop again naming exactly the unanswered questions, (b) echo back what it
// understood, and (c) persist each answer as durable project knowledge.

/** `### GAP-001 · <title>` — one question block. The id is what everything keys on. */
const HEADING_RE = /^#{2,4}\s*([A-Z][A-Z0-9]*-\d+)\s*(?:[·:\-—]\s*(.*))?$/;
/** Labelled fields inside a block. */
const FIELD_RE = /^\*\*(Vấn đề|Nguồn|Câu hỏi|Trả lời)\s*:?\*\*\s*:?\s*(.*)$/i;

const FIELD_KEY = {
    "vấn đề": "problem",
    "nguồn": "source",
    "câu hỏi": "question",
    "trả lời": "answer",
};

/** HTML comments are guidance for the reader, never content. */
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

/**
 * Is this answer text actually an answer?
 * Blank, or nothing but the placeholder we printed, means unanswered. Being strict here is
 * the whole point: treating an untouched form as answered is exactly the old bug.
 */
function isAnswered(text) {
    const t = stripComments(String(text ?? ""))
        .replace(/^[\s>*_\-–—]+|[\s>*_\-–—]+$/g, "")
        .trim();
    if (t.length === 0) return false;
    if (/^\[.*\]$/.test(t)) return false;                       // "[chưa trả lời]"
    if (/^(chưa|n\/?a|tbd|todo|\?+)$/i.test(t)) return false;
    return true;
}

/**
 * @param {string} markdown contents of the gap report
 * @returns {{questions: Array<{id, title, problem, source, question, answer: string|null}>,
 *            answered: Array, unanswered: Array, total: number}}
 */
export function parseGapReport(markdown) {
    const lines = stripComments(String(markdown ?? "")).split("\n");
    const questions = [];

    let block = null;
    let field = null;
    let inFence = false;

    const flushField = () => {
        if (!block || !field) return;
        block[field.key] = field.lines.join("\n").trim();
        field = null;
    };
    const flushBlock = () => {
        flushField();
        if (block) questions.push(block);
        block = null;
    };

    for (const line of lines) {
        if (/^\s*```/.test(line)) { inFence = !inFence; if (field) field.lines.push(line); continue; }
        if (inFence) { if (field) field.lines.push(line); continue; }

        const heading = HEADING_RE.exec(line.trim());
        if (heading) {
            flushBlock();
            block = { id: heading[1], title: (heading[2] ?? "").trim(), problem: "", source: "", question: "", answer: "" };
            continue;
        }
        if (!block) continue;

        const f = FIELD_RE.exec(line.trim());
        if (f) {
            flushField();
            field = { key: FIELD_KEY[f[1].toLowerCase()], lines: f[2] ? [f[2]] : [] };
            continue;
        }

        // A horizontal rule ends the block; a new `###` is caught above.
        if (/^\s*-{3,}\s*$/.test(line)) { flushBlock(); continue; }

        if (field) field.lines.push(line);
    }
    flushBlock();

    for (const q of questions) {
        q.answer = isAnswered(q.answer) ? q.answer.trim() : null;
    }

    return {
        questions,
        answered: questions.filter(q => q.answer !== null),
        unanswered: questions.filter(q => q.answer === null),
        total: questions.length,
    };
}

/**
 * Render the report again with the answers preserved, so a partially-filled form can be
 * handed back without the person losing what they already typed.
 * Used when some questions are answered and some are not.
 */
export function renderGapReport(questions, { title = "Báo cáo thông tin cần làm rõ" } = {}) {
    const out = [
        `# ${title}`,
        ``,
        `> Trả lời NGAY DƯỚI dòng \`**Trả lời:**\` của từng câu, rồi chạy lại lệnh cũ.`,
        `> Câu nào để trống thì pipeline sẽ dừng lại và chỉ hỏi lại đúng câu đó — không hỏi lại từ đầu.`,
        `> Câu đã trả lời sẽ được ghi vào \`memory/project/decisions-log.md\` thành tri thức bền,`,
        `> nên lần sau **không bị hỏi lại**.`,
        ``,
    ];
    for (const q of questions) {
        out.push(
            `---`,
            ``,
            `### ${q.id}${q.title ? ` · ${q.title}` : ""}`,
            ``,
            `**Vấn đề:** ${q.problem || "(không nêu)"}`,
            ``,
            `**Nguồn:** ${q.source || "(không nêu)"}`,
            ``,
            `**Câu hỏi:** ${q.question || "(không nêu)"}`,
            ``,
            `**Trả lời:**`,
            q.answer ? q.answer : `<!-- Viết câu trả lời của bạn ngay dưới dòng này. Để trống = chưa trả lời. -->`,
            ``,
        );
    }
    return out.join("\n");
}

/**
 * Turn answers into tier-3 knowledge sections (`memory/project/decisions-log.md`).
 *
 * This is what stops the pipeline re-asking forever. An answer appended to a run-scoped
 * file dies with the run; an answer written as a `###` section in decisions-log survives,
 * is hand-editable, and git keeps its history. `sourceRef` carries the GAP id so the
 * decision can be traced back to the question that produced it.
 */
export function answersToDecisions(answered, { stampIso } = {}) {
    return answered.map(q => ({
        title: `${q.id} — ${q.title || q.question.slice(0, 60)}`,
        content: [
            `**Câu hỏi:** ${q.question}`,
            ``,
            `**Trả lời (người dùng xác nhận${stampIso ? ` ${stampIso.slice(0, 10)}` : ""}):** ${q.answer}`,
            q.source ? `` : null,
            q.source ? `*Nguồn của vấn đề: ${q.source}*` : null,
        ].filter(v => v !== null).join("\n"),
        sourceRef: q.id,
    }));
}

/** One line per answer, for the leader to echo back before continuing. */
export function confirmationLines(answered) {
    return answered.map(q => `  ${q.id}: ${q.question.replace(/\s+/g, " ").trim()}\n    → ${q.answer.replace(/\s+/g, " ").trim()}`);
}
