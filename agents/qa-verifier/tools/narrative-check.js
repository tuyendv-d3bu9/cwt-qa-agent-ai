// agents/qa-verifier/tools/narrative-check.js
// Cửa kiểm DETERMINISTIC cho phần LLM viết trong deliverable của qa-verifier. KHÔNG dùng LLM.
//
// VÌ SAO CẦN. `role.md` của node này tuyên bố từ đầu: *"Skill `02_verdict_writer.md` chỉ diễn
// giải verdict đã tính deterministic, KHÔNG được đổi — verdict quyết định workflow làm gì tiếp
// nên không thể phụ thuộc cách LLM diễn đạt."* Nhưng **không có gì kiểm điều đó**. Luật chỉ
// tồn tại dưới dạng một câu nhờ vả trong prompt, và một câu nhờ vả không phải một cửa gác.
//
// HAI THỨ CÓ THỂ SAI, VÀ CHỈ MỘT TRONG HAI LÀ HIỂN NHIÊN:
//   1. Bản diễn giải nói verdict khác với verdict đã tính. Dễ thấy khi đọc.
//   2. Bản diễn giải **bỏ sót** một test case cần người xem. KHÔNG thấy được khi đọc, vì
//      không ai đọc một báo cáo rồi đi đếm xem nó thiếu gì. Đây là lỗi nguy hiểm hơn: test
//      case bị bỏ sót là test case không ai xử lý, và verdict tổng vẫn đúng nên không có
//      dấu hiệu gì.
//
// THIẾT KẾ CÓ CHỦ Ý: luật hẹp, ít báo oan. Một cửa gác báo oan bên trong vòng lặp agent sẽ
// **đốt hết ngân sách sửa** cho một lỗi không tồn tại — đúng chuyện đã xảy ra với
// `countRealAssertions` (báo "không có expect()" cho 20/21 spec thật). Nên ở đây chỉ kiểm
// những thứ máy đếm được chắc chắn, không kiểm "văn có hay không".

/** Nhãn nghĩa là "không cần người xem". Mọi nhãn khác đều phải xuất hiện trong bản diễn giải. */
export const CLEAN_LABEL = "PASSED";

const VERDICTS = ["PASS", "FIX", "ASK"];

/** `PASS` đứng riêng, KHÔNG khớp `PASSED`. */
const standalone = (token) => new RegExp(`\\b${token}\\b`);

/**
 * @param {string} narrative  phần văn bản LLM vừa viết
 * @param {{verdict: string, analysed: Array<{tcId: string, label: string}>}} ctx
 * @returns {{ok: boolean, issues: string[], missingTcIds: string[]}}
 */
export function checkNarrative(narrative, { verdict, analysed = [] } = {}) {
    const text = String(narrative ?? "");
    const issues = [];

    if (!text.trim()) {
        return { ok: false, issues: ["Bản diễn giải rỗng — không có gì để ghi vào deliverable."], missingTcIds: [] };
    }

    // ── 1. Phải nêu đúng verdict đã tính ───────────────────────────────
    if (verdict && !standalone(verdict).test(text)) {
        issues.push(`Không nêu verdict đã tính (${verdict}). Bản diễn giải phải nói rõ verdict là ${verdict}.`);
    }

    // ── 2. Không được khẳng định một verdict KHÁC ──────────────────────
    // Mẫu hẹp: chỉ bắt khi chữ "verdict" đứng ngay trước một verdict khác. Câu như
    // "đây không phải FIX vì…" là diễn giải hợp lệ và KHÔNG bị bắt — cố bắt cả những câu đó
    // là báo oan, và báo oan thì đốt ngân sách sửa.
    for (const other of VERDICTS.filter(v => v !== verdict)) {
        const claim = new RegExp(`verdict[^.\\n]{0,24}\\b${other}\\b`, "i");
        if (claim.test(text)) {
            issues.push(
                `Có chỗ khẳng định verdict là ${other}, nhưng verdict đã tính deterministic là ${verdict}. ` +
                `Chỉ được DIỄN GIẢI verdict đã cho, không được đổi.`
            );
        }
    }

    // ── 3. Không được bỏ sót test case cần người xem ───────────────────
    const needsAttention = analysed.filter(a => a.label && a.label !== CLEAN_LABEL);
    const missingTcIds = needsAttention
        .map(a => a.tcId)
        .filter(id => id && !text.includes(id));

    if (missingTcIds.length) {
        issues.push(
            `Thiếu ${missingTcIds.length}/${needsAttention.length} test case cần người xem: ${missingTcIds.join(", ")}. ` +
            `Mỗi test case có nhãn khác ${CLEAN_LABEL} phải được nhắc kèm TC_ID — bỏ sót là test case đó không ai xử lý.`
        );
    }

    // ── 4. Không được nói "tất cả đều pass" khi không phải vậy ─────────
    if (needsAttention.length && /(tất cả|toàn bộ|mọi)[^.\n]{0,24}(pass|đạt|thành công)/i.test(text)) {
        issues.push(
            `Có câu nói tất cả đều pass, nhưng có ${needsAttention.length} test case mang nhãn khác ${CLEAN_LABEL}.`
        );
    }

    return { ok: issues.length === 0, issues, missingTcIds };
}
