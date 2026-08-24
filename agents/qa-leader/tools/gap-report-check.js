// agents/qa-leader/tools/gap-report-check.js
// Cửa kiểm ĐỊNH DẠNG của gap-report. Deterministic, KHÔNG dùng LLM.
//
// VÌ SAO ĐỊNH DẠNG LÀ CHUYỆN SỐNG CHẾT Ở ĐÂY. Toàn bộ vòng hỏi–đáp theo từng câu (P2) đọc file
// này bằng `parseGapReport()`: nó cần các khối `### GAP-nnn` và mỗi khối phải có ô
// `**Trả lời:**` để người dùng điền. Nếu model viết một đoạn văn xuôi thay vì các khối đó thì
// `parseGapReport` tìm ra **0 câu hỏi** — và hậu quả không giống một lỗi:
//
//   - file gap-report vẫn tồn tại, vẫn đọc được, vẫn có nội dung hợp lý;
//   - nhưng không có câu nào để hỏi, và **không có ô nào để người dùng trả lời**;
//   - lần chạy sau đọc lại, thấy 0 câu chưa trả lời, và kết luận là đã đủ thông tin.
//
// Tức là một lỗi định dạng biến thành "đã xác nhận xong" mà không ai làm gì cả. Trước P11,
// định dạng này chỉ được YÊU CẦU trong prompt của skill 03. Một yêu cầu không phải một cửa gác.

import { parseGapReport, HEADING_RE, FIELD_RE } from "./gap-answers.js";

/**
 * Có ô `**Trả lời:**` hay không — phải đọc ở mức VĂN BẢN THÔ, từng khối.
 *
 * Không đọc được từ kết quả `parseGapReport()`: nó chuẩn hoá cả "có ô nhưng trống" và "không
 * có ô" thành `answer: null`. Với chính nó thì hợp lý (cả hai đều là *chưa trả lời*), nhưng
 * với một cửa kiểm ĐỊNH DẠNG thì hai ca đó khác nhau hoàn toàn: một cái đợi người dùng điền,
 * cái kia thì người dùng không có chỗ nào để điền.
 *
 * Dùng lại đúng `HEADING_RE`/`FIELD_RE` của parser thật — một cửa kiểm dùng regex riêng sẽ
 * dần lệch khỏi cái parser thật đọc, rồi cho qua những file parser không đọc nổi.
 */
function blocksWithoutAnswerField(markdown) {
    const lines = String(markdown ?? "").replace(/<!--[\s\S]*?-->/g, "").split("\n");
    const missing = [];
    let current = null;

    const flush = () => {
        if (current && !current.hasAnswerField) missing.push(current.id);
        current = null;
    };

    for (const line of lines) {
        const heading = HEADING_RE.exec(line.trim());
        if (heading) { flush(); current = { id: heading[1], hasAnswerField: false }; continue; }
        if (!current) continue;
        const field = FIELD_RE.exec(line.trim());
        if (field && /trả lời/i.test(field[1])) current.hasAnswerField = true;
    }
    flush();
    return missing;
}

/**
 * @param {string} reportMarkdown  nội dung gap-report do LLM viết
 * @returns {{ok: boolean, issues: string[], questionCount: number}}
 */
export function checkGapReportFormat(reportMarkdown) {
    const { questions } = parseGapReport(String(reportMarkdown ?? ""));
    const issues = [];

    if (questions.length === 0) {
        issues.push(
            `Không có khối câu hỏi nào đọc được. Mỗi câu hỏi PHẢI là một khối bắt đầu bằng ` +
            `"### GAP-nnn — <tiêu đề>" và PHẢI có dòng "**Trả lời:**" để người dùng điền vào. ` +
            `Viết văn xuôi thì vòng hỏi–đáp không có câu nào để hỏi.`
        );
    }

    const noField = blocksWithoutAnswerField(reportMarkdown);
    if (noField.length) {
        issues.push(
            `${noField.length}/${questions.length} câu thiếu ô "**Trả lời:**" (${noField.join(", ")}) — ` +
            `không có ô đó thì người dùng không có chỗ trả lời và vòng hỏi–đáp đứng lại.`
        );
    }

    const noQuestionText = questions.filter(q => !String(q.question ?? "").trim());
    if (noQuestionText.length) {
        issues.push(
            `${noQuestionText.length} câu không có nội dung câu hỏi (${noQuestionText.map(q => q.id ?? "?").join(", ")}) — ` +
            `người đọc không biết phải trả lời cái gì.`
        );
    }

    return { ok: issues.length === 0, issues, questionCount: questions.length };
}
