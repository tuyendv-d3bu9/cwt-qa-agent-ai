// Test H.3–H.6: chuỗi truy vết doc -> section -> knowledge-file -> testcase -> spec
// và báo cáo tác động. KHÔNG gọi LLM.
import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");

const D = await import(abs("agents/runtime/db.js"));
D.useKnowledgeDb("memory/working/_impact-test.db");

const { storeKnowledgeSection } = await import(abs("agents/qa-leader/tools/project-knowledge-store.js"));
const { computeImpact, renderImpactReport, registerArtifact } = await import(abs("agents/qa-leader/tools/impact-analysis.js"));
const { runTool } = await import(abs("agents/runtime/tools.js"));

const P = [];
const chk = (n, c, e = "") => P.push([n, c, e]);

// ── dựng graph như pipeline thật sẽ dựng ──
const DOC_A = "project-docs/03_DEV/api.md";
const DOC_B = "project-docs/05_QA/bug.csv";

await storeKnowledgeSection({ kind: "domain", status: "confirmed", title: "Ràng buộc mã giảm giá", content: "chỉ chữ hoa", sourceFile: DOC_A, sourceHash: "h1" });
await storeKnowledgeSection({ kind: "issue", status: "confirmed", title: "Bug đã biết", content: "| B-1 | x |", sourceFile: DOC_B, sourceHash: "h2" });

const kfDomain = D.artifactId("knowledge-file", "memory/project/domain-facts.md");
const kfIssues = D.artifactId("knowledge-file", "memory/project/known-issues.md");
for (const tc of ["TC-D-001", "TC-D-002"]) registerArtifact({ kind: "testcase", ref: tc, derivedFrom: [kfDomain, kfIssues] });
for (const tc of ["TC-D-001", "TC-D-002"]) {
    registerArtifact({ kind: "spec", ref: `tests/${tc}.spec.ts`, derivedFrom: [D.artifactId("testcase", tc)] });
}

// ── 1. doc đổi -> truy hết chuỗi ──
const r1 = computeImpact({ added: [], changed: [DOC_A], removed: [] }, { markStale: false });
const refs = r1.affected.map(a => a.ref);
chk("doc đổi -> truy tới section", refs.some(r => r.includes("#Ràng buộc mã giảm giá")));
chk("doc đổi -> truy tới knowledge-file", refs.includes("memory/project/domain-facts.md"));
chk("doc đổi -> truy tới CẢ 2 test case", refs.includes("TC-D-001") && refs.includes("TC-D-002"));
chk("doc đổi -> truy tới CẢ 2 spec", refs.includes("tests/TC-D-001.spec.ts") && refs.includes("tests/TC-D-002.spec.ts"));
chk("KHÔNG lôi mục của tài liệu khác vào", !refs.some(r => r.includes("#Bug đã biết")), JSON.stringify(refs));

// ── 2. mỗi artifact có chủ xử lý ──
chk("mỗi artifact đều có owner", r1.affected.every(a => a.owner && a.owner !== "Chưa xác định"));
chk("spec -> giao node tự động hoá", r1.affected.find(a => a.kind === "spec")?.owner.includes("tự động hoá"));
chk("testcase -> giao node thiết kế test", r1.affected.find(a => a.kind === "testcase")?.owner.includes("thiết kế test"));

// ── 3. file MỚI (added) không làm gì lỗi thời ──
chk("added-only -> 0 artifact lỗi thời", computeImpact({ added: ["project-docs/01_Business/moi.md"], changed: [], removed: [] }, { markStale: false }).total === 0);

// ── 4. tài liệu bị XOÁ cũng lan truyền, và ghi đúng lý do ──
const r2 = computeImpact({ added: [], changed: [], removed: [DOC_B] }, { markStale: false });
chk("doc bị xoá -> vẫn truy được downstream", r2.total > 0);
chk("ghi đúng lý do 'đã bị xoá'", r2.sources[0].reason.includes("xoá"));

// ── 5. markStale thật sự ghi vào DB ──
chk("trước khi mark: chưa có gì stale", D.staleArtifacts().length === 0);
const r3 = computeImpact({ added: [], changed: [DOC_A], removed: [] });
chk("sau khi mark: DB có đúng số artifact stale", D.staleArtifacts().length === r3.total, `${D.staleArtifacts().length} vs ${r3.total}`);

// ── 6. báo cáo deterministic ──
const md = renderImpactReport(r3, "2026-08-17T00:00:00Z");
chk("báo cáo có bảng tài liệu nguồn", md.includes("## 1. Tài liệu nguồn đã thay đổi") && md.includes(DOC_A));
chk("báo cáo liệt kê từng artifact + ai xử lý", md.includes("| Loại | Artifact | Do tài liệu | Ai cần xử lý |") && md.includes("TC-D-001"));
chk("báo cáo NÊU RÕ giới hạn (không im lặng coi là đủ)", md.includes("## 3. Giới hạn đã biết"));

const mdEmpty = renderImpactReport(computeImpact({ added: [], changed: ["project-docs/khong-lien-quan.md"], removed: [] }, { markStale: false }), "t");
chk("0 artifact -> KHÔNG kết luận 'không ảnh hưởng'", mdEmpty.includes("KHÔNG chắc chắn nghĩa là không có gì bị ảnh hưởng"));

// ── 7. dedupe khi 2 tài liệu cùng ảnh hưởng 1 artifact ──
const r4 = computeImpact({ added: [], changed: [DOC_A, DOC_B], removed: [] }, { markStale: false });
const tc1 = r4.affected.filter(a => a.ref === "TC-D-001");
chk("artifact bị nhiều nguồn ảnh hưởng -> 1 dòng, gộp causedBy", tc1.length === 1 && tc1[0].causedBy.length === 2, JSON.stringify(tc1));

D.closeAll();
await runTool("delete_file", { path: "memory/working/_impact-test.db" }).catch(() => {});

let bad = 0;
for (const [n, c, e] of P) { if (!c) bad++; console.log((c ? "  PASS  " : "  >>FAIL ") + n + (e && !c ? "\n         => " + e : "")); }
console.log(bad === 0 ? `\n${P.length}/${P.length} ĐÚNG` : `\n${bad}/${P.length} SAI`);
