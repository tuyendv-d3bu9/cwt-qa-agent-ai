// Kiểm tra logic phân loại tài liệu sau khi bỏ hardcode taxonomy.
import path from "node:path";
const { runTool } = await import(
    "file:///" + path.resolve(process.cwd(), "agents/runtime/tools.js").split(path.sep).join("/")
);

const SEP = String.fromCharCode(92); // backslash, tránh escape lộn xộn trong test
const segments = (p) => String(p).split(/[\\/]+/).filter(Boolean);
const isClassified = (fp, dir) => {
    const p = segments(fp);
    return p[0] === dir && p.length > 2;
};
const existingFolders = (files, dir) => {
    const s = new Set();
    for (const f of files) {
        const p = segments(f.path);
        if (p[0] === dir && p.length > 2) s.add(p[1]);
    }
    return [...s].sort();
};

const listing = await runTool("list_files", { dir: "project-docs" });
const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

const unclassified = listing.files.filter((f) => !isClassified(f.path, "project-docs"));
chk(
    "LOGIC MỚI: tài liệu đã nằm trong thư mục -> 0 file bị coi là chưa phân loại",
    listing.files.length > 0 && unclassified.length === 0,
    `${listing.files.length} file, ${unclassified.length} bị coi là chưa phân loại`
);

// Đối chiếu với thư mục THẬT trên đĩa, không với một danh sách gõ cứng.
//
// Bản trước gõ cứng ["01_Business", ..., "04_Dessign", ...] — kể cả lỗi chính tả có thật lúc
// đó. Thư mục sau này được đổi tên thành `04_Design`, và bài test bắt đầu fail vì DANH SÁCH
// GÕ CỨNG sai, không phải vì code sai. Đúng cái mà chính nó đang kiểm: "bỏ hardcode taxonomy".
// Tệ hơn: bộ test này không gọi process.exit() nên nó fail mà vẫn thoát 0, và không ai thấy.
const { readdir } = await import("node:fs/promises");
const onDisk = (await readdir("project-docs", { withFileTypes: true }))
    .filter(e => e.isDirectory() && !e.name.startsWith("."))
    .map(e => e.name).sort();

const folders = existingFolders(listing.files, "project-docs");
chk(
    "đọc đúng tên thư mục THẬT trên đĩa (không so với danh sách gõ cứng)",
    folders.length > 0 && JSON.stringify(folders) === JSON.stringify(onDisk.filter(d => folders.includes(d))),
    `đọc được ${JSON.stringify(folders)} · trên đĩa ${JSON.stringify(onDisk)}`
);

chk(
    "file ở GỐC thư mục nguồn -> đúng là chưa phân loại",
    !isClassified("project-docs" + SEP + "FileMoi.md", "project-docs") && !isClassified("project-docs/FileMoi.md", "project-docs")
);

chk(
    "hoạt động với CẢ HAI loại separator (đây chính là lỗi cũ)",
    isClassified("project-docs" + SEP + "05_QA" + SEP + "a.md", "project-docs") && isClassified("project-docs/05_QA/a.md", "project-docs")
);

chk("thư mục lồng sâu vẫn tính là đã phân loại", isClassified("project-docs/05_QA/sub/a.md", "project-docs"));

chk(
    "generic: đổi tên thư mục nguồn vẫn hoạt động",
    !isClassified("docs/a.md", "docs") && isClassified("docs/X/a.md", "docs")
);

chk(
    "regex bỏ prefix trùng: xử lý cả 2 separator",
    (() => {
        const dupPrefix = new RegExp("^(project-docs[" + SEP + SEP + "/])+");
        return "project-docs/project-docs/x.md".replace(dupPrefix, "") === "x.md";
    })()
);

let bad = 0;
for (const [n, c, e] of P) {
    if (!c) bad++;
    console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : ""));
}
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
// Thoát khác 0 khi có test hỏng. Thiếu dòng này, bộ test fail vẫn thoát 0 và mọi bộ chạy
// tự động sẽ báo PASS cho nó — đúng chuyện vừa xảy ra.
process.exit(bad === 0 ? 0 : 1);
