// Test P11: cửa kiểm bản diễn giải của qa-verifier. KHÔNG gọi LLM.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const N = await import(abs("agents/qa-verifier/tools/narrative-check.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const tc = (tcId, label) => ({ tcId, label });
const CLEAN = [tc("TC-D-001", "PASSED"), tc("TC-D-002", "PASSED")];
const DIRTY = [tc("TC-D-001", "PASSED"), tc("TC-D-002", "BEHAVIOR_MISMATCH"), tc("TC-D-003", "UNCLEAR")];

// ─────────── 1. Bản diễn giải đạt ───────────
{
    const r = N.checkNarrative(
        "Verdict ASK. TC-D-002 lệch hành vi: số tiền giảm không đúng. TC-D-003 chưa rõ do thiếu ảnh.",
        { verdict: "ASK", analysed: DIRTY });
    chk(">>> nêu đúng verdict + nhắc đủ mọi test case cần người xem → đạt", r.ok, JSON.stringify(r.issues));
}
{
    const r = N.checkNarrative("Verdict PASS. Toàn bộ test case đều đạt.", { verdict: "PASS", analysed: CLEAN });
    chk("mọi test case PASSED thì được phép nói 'toàn bộ đều đạt'", r.ok, JSON.stringify(r.issues));
}

// ─────────── 2. Bỏ sót test case cần người xem — lỗi KHÔNG thấy được khi đọc ───────────
{
    const r = N.checkNarrative("Verdict ASK. TC-D-002 lệch hành vi.", { verdict: "ASK", analysed: DIRTY });
    chk(">>> bỏ sót TC-D-003 bị bắt (bỏ sót = test case đó không ai xử lý, mà verdict tổng vẫn đúng nên không có dấu hiệu gì)",
        !r.ok && r.missingTcIds.length === 1 && r.missingTcIds[0] === "TC-D-003", JSON.stringify(r));
    chk("thông báo nói rõ thiếu mấy trên mấy", r.issues.some(i => i.includes("1/2")), JSON.stringify(r.issues));
}
{
    const r = N.checkNarrative("Verdict ASK. Có vài vấn đề cần xem lại.", { verdict: "ASK", analysed: DIRTY });
    chk("bỏ sót cả hai thì báo cả hai", r.missingTcIds.length === 2, JSON.stringify(r.missingTcIds));
}
{
    const r = N.checkNarrative("Verdict PASS. Không có gì bất thường.", { verdict: "PASS", analysed: CLEAN });
    chk("test case PASSED thì KHÔNG bắt buộc phải nhắc TC_ID", r.ok, JSON.stringify(r.issues));
}

// ─────────── 3. Không được đổi verdict ───────────
{
    const r = N.checkNarrative("TC-D-002 và TC-D-003 có vấn đề, nên verdict là FIX.", { verdict: "ASK", analysed: DIRTY });
    chk(">>> khẳng định verdict khác bị bắt (role.md tuyên bố luật này từ đầu, nhưng trước P11 không có gì kiểm)",
        !r.ok && r.issues.some(i => i.includes("FIX") && i.includes("ASK")), JSON.stringify(r.issues));
}
{
    const r = N.checkNarrative("TC-D-002 lệch hành vi, TC-D-003 chưa rõ. Đây KHÔNG phải FIX vì spec vẫn đúng; verdict ASK.",
        { verdict: "ASK", analysed: DIRTY });
    chk(">>> KHÔNG báo oan câu 'đây không phải FIX vì…' — đó là diễn giải hợp lệ",
        r.ok, JSON.stringify(r.issues));
}
{
    const r = N.checkNarrative("Mọi test case đều ổn.", { verdict: "PASS", analysed: CLEAN });
    chk("không nêu verdict thì bị bắt", !r.ok && r.issues.some(i => i.includes("PASS")), JSON.stringify(r.issues));
}

// ─────────── 4. 'PASS' không được khớp bên trong 'PASSED' ───────────
{
    const r = N.checkNarrative("Cả hai test case đều mang nhãn PASSED.", { verdict: "PASS", analysed: CLEAN });
    chk(">>> nêu 'PASSED' KHÔNG tính là đã nêu verdict 'PASS' (hai khái niệm khác nhau: nhãn từng test vs verdict tổng)",
        !r.ok, JSON.stringify(r.issues));
}

// ─────────── 5. Nói 'tất cả đều pass' khi không phải vậy ───────────
{
    const r = N.checkNarrative("Verdict ASK. TC-D-002 và TC-D-003 cần xem. Nhưng tất cả test case đều pass.",
        { verdict: "ASK", analysed: DIRTY });
    chk("câu 'tất cả đều pass' khi có nhãn khác PASSED thì bị bắt",
        !r.ok && r.issues.some(i => i.includes("tất cả đều pass")), JSON.stringify(r.issues));
}

// ─────────── 6. Rỗng ───────────
{
    const r = N.checkNarrative("", { verdict: "PASS", analysed: CLEAN });
    chk("bản diễn giải rỗng bị bắt", !r.ok && r.issues[0].includes("rỗng"), JSON.stringify(r.issues));
    const r2 = N.checkNarrative("   \n  ", { verdict: "PASS", analysed: CLEAN });
    chk("chỉ khoảng trắng cũng là rỗng", !r2.ok, JSON.stringify(r2.issues));
}

// ─────────── 7. Không có test case nào ───────────
{
    const r = N.checkNarrative("Verdict PASS. Không có test case nào được chạy.", { verdict: "PASS", analysed: [] });
    chk("danh sách rỗng thì không có gì để bỏ sót", r.ok, JSON.stringify(r.issues));
}

const fail = P.filter(([, c]) => !c);
P.forEach(([n, c, e]) => console.log(`${c ? "  ok  " : "  FAIL"} ${n}${c ? "" : "   → " + e}`));
console.log(`\nnarrative-check: ${P.length - fail.length}/${P.length}`);
process.exit(fail.length ? 1 : 0);
