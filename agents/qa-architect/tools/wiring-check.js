// agents/qa-architect/tools/wiring-check.js
// Cửa gác cho bài học "0-BUG": **test xanh ≠ đã nối dây**.
//
// CHUYỆN ĐÃ XẢY RA THẬT (ghi trong TODO.update2.md). Ba module được viết, có test 22/22 xanh,
// được tick 🟢 hoàn thành: `step-emitter.js`, `gherkin-codegen.js`, `money.js`. Soát bằng
// `grep -rlE "^import .*<module>"` mới thấy **không ai import cả ba**. Đường chạy thật vẫn
// dùng code cũ. Một skill mới cũng không ai gọi.
//
// Với node sinh tự động, lỗi đó chắc chắn tái diễn và tệ hơn: sinh xong thì có thư mục, có
// role.md, có test — đủ mọi dấu hiệu của "đã xong" — trong khi không luồng nào gọi nó. Nên:
// bộ sinh KHÔNG BAO GIỜ báo node là xong khi chưa có luồng nào gọi.
//
// Đây là kiểm DETERMINISTIC, không LLM: đọc file luồng, tìm tên node.

/**
 * @param {object} o
 * @param {string} o.name              tên node vừa sinh
 * @param {Array} o.flows              [{flow, problems}] từ workflow/flow-file.js
 * @param {Array<string>} [o.scriptSources]  nội dung các file script (luồng `type: script`)
 * @returns {{wired: boolean, usedBy: string[], report: string}}
 */
export function checkWiring({ name, flows = [], scriptSources = [] }) {
    const usedBy = [];

    for (const { flow } of flows) {
        if (!flow) continue;
        if (flow.type === "script") continue;
        if (flow.steps?.some(s => s.node === name)) usedBy.push(flow.file ?? flow.name);
    }

    // Luồng kiểu script gọi node bằng `import`, không bằng khai báo — nên tìm trong mã nguồn.
    // Không có thì thôi; hàm gọi truyền được bao nhiêu thì kiểm bấy nhiêu, và nói rõ trong
    // báo cáo là đã soi những gì (một kiểm tra âm thầm bỏ sót còn tệ hơn không kiểm).
    for (const src of scriptSources) {
        if (typeof src === "string" && src.includes(`agents/${name}/`)) usedBy.push("(luồng script)");
    }

    const wired = usedBy.length > 0;
    const report = wired
        ? `ĐÃ NỐI DÂY — được gọi trong: ${[...new Set(usedBy)].join(", ")}.`
        : [
            `CHƯA NỐI DÂY — không luồng nào gọi "${name}".`,
            ``,
            `   Node có đủ thư mục, role.md, skill và CONTRACT hợp lệ, nhưng KHÔNG BAO GIỜ chạy.`,
            `   Đây đúng là lỗi 0-BUG trong TODO.update2.md: đủ mọi dấu hiệu "đã xong" mà đường`,
            `   chạy thật không đi qua nó.`,
            ``,
            `   Nối bằng cách thêm vào một file trong flows/:`,
            `     steps:`,
            `       - node: ${name}`,
            `         gate: <node-trước-đó>      # bỏ dòng này nếu không cần người duyệt`,
            ``,
            `   Rồi kiểm lại:  node qa.js flows`,
        ].join("\n");

    return { wired, usedBy: [...new Set(usedBy)], report };
}
