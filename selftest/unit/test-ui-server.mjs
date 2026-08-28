// Test R5: máy chủ giao diện — LỚP CHẶN và ranh giới "không có logic nghiệp vụ".
//
// VÌ SAO BỘ NÀY QUAN TRỌNG HƠN VẺ NGOÀI CỦA NÓ. Máy chủ này **ghi file trong repo, sinh tiến
// trình con, và mở được trình duyệt thật**. Không xác thực thì BẤT KỲ trang web nào đang mở
// trên máy đó cũng gọi được nó — một tab quảng cáo có thể
// `fetch('http://127.0.0.1:5179/api/run', {method:'POST'})` và chạy pipeline của bạn.
//
// Bộ này gọi HTTP THẬT vào server THẬT. Test lớp bảo mật bằng cách gọi thẳng hàm handler sẽ bỏ
// sót đúng những chỗ chỉ hiện ra khi có header thật đi qua.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const S = await import(abs("ui/server.js"));
const G = await import(abs("ui/guard.js"));

const T = [];
const chk = (n, c, e = "") => T.push([n, c, e]);

const srv = await S.startUiServer({ port: 0 });
const base = `http://127.0.0.1:${srv.port}`;
const TOKEN = srv.token;
const get = (p, init) => fetch(base + p, init);

// ─────────── 1. Token bắt buộc ở MỌI request ───────────
{
    chk(">>> không token → 401 (trang web khác không đoán được URL đầy đủ)",
        (await get("/api/state")).status === 401);
    chk("token sai → 401", (await get("/api/state?token=sai")).status === 401);
    chk("token đúng → 200", (await get(`/api/state?token=${TOKEN}`)).status === 200);
    chk("token qua header cũng được",
        (await get("/api/state", { headers: { "x-qa-token": TOKEN } })).status === 200);
    chk("token dài đúng nhưng lệch một ký tự → 401",
        (await get(`/api/state?token=${TOKEN.slice(0, -1)}X`)).status === 401);
    chk("cả trang HTML cũng đòi token (không để lộ giao diện + cấu trúc API)",
        (await get("/")).status === 401);
}

// ─────────── 2. DNS-rebinding ───────────
//
// Kẻ tấn công trỏ `evil.com` về 127.0.0.1. Trình duyệt gửi `Host: evil.com` và coi request là
// same-origin — nghĩa là GỬI KÈM token nếu token nằm trong URL đã lưu. Chặn ở Host/Origin.
{
    // ⚠ PHẢI dùng `http.request` thô, KHÔNG dùng `fetch`.
    //
    // `fetch` của Node (undici) coi `Host` là header cấm và LẶNG LẼ bỏ nó đi. Bản đầu của ca
    // này viết bằng `fetch` và "đạt" 200 — không phải vì máy chủ cho qua Host lạ, mà vì Host lạ
    // chưa bao giờ rời khỏi máy khách. Một ca test bảo mật kiểm nhầm thứ chính nó gửi đi là ca
    // test tệ hơn không có: nó khai rằng đã kiểm.
    const { request } = await import("node:http");
    const raw = (headers) => new Promise((resolve) => {
        const req = request({ host: "127.0.0.1", port: srv.port, path: `/api/state?token=${TOKEN}`, headers },
            (res) => { res.resume(); resolve(res.statusCode); });
        req.end();
    });
    chk(">>> Host lạ → 403 dù token ĐÚNG (chặn DNS-rebinding)",
        (await raw({ host: "evil.com" })) === 403, String(await raw({ host: "evil.com" })));
    chk("Host loopback → cho qua", (await raw({ host: `127.0.0.1:${srv.port}` })) === 200);

    const r2 = await get(`/api/state?token=${TOKEN}`, { headers: { origin: "http://evil.com" } });
    chk(">>> Origin lạ → 403 dù token ĐÚNG", r2.status === 403, String(r2.status));

    chk("Origin loopback → cho qua",
        (await get(`/api/state?token=${TOKEN}`, { headers: { origin: `http://127.0.0.1:${srv.port}` } })).status === 200);
    // Không có Origin = mở thẳng URL hoặc curl, không phải trang web khác → cho qua.
    chk("không có Origin (mở thẳng URL) → cho qua", (await get(`/api/state?token=${TOKEN}`)).status === 200);
}

// ─────────── 3. Ghi phải là POST ───────────
//
// `<img src="http://127.0.0.1:5179/api/run?token=…">` trên một trang bất kỳ là một GET.
{
    for (const route of G.WRITE_ROUTES) {
        const r = await get(`${route}?token=${TOKEN}`);
        chk(`${route} bằng GET → 405`, r.status === 405, `${route} → ${r.status}`);
    }
    // Endpoint VỪA đọc VỪA ghi phải cho GET đi qua.
    //
    // Bản đầu gộp `/api/gaps` vào WRITE_ROUTES, nên `GET /api/gaps` nhận 405 và màn hình "Câu
    // hỏi" **không bao giờ tải được**. Bộ test vẫn xanh vì nó chỉ kiểm "GET bị chặn" — đúng thứ
    // nó được viết ra để kiểm, và cũng đúng thứ làm hỏng tính năng. Lỗi lộ ra khi chạy thật.
    for (const route of G.READ_WRITE_ROUTES) {
        const r = await get(`${route}?token=${TOKEN}`);
        chk(`>>> ${route} bằng GET phải ĐỌC ĐƯỢC (không phải 405)`, r.status === 200, `${route} → ${r.status}`);
        const bad = await get(`${route}?token=${TOKEN}`, { method: "DELETE" });
        chk(`${route} bằng DELETE → 405`, bad.status === 405, String(bad.status));
    }
    chk("hai danh sách không chồng nhau",
        !G.WRITE_ROUTES.some(r => G.READ_WRITE_ROUTES.includes(r)));
}

// ─────────── 4. Đọc file: token đúng KHÔNG có nghĩa là đọc được mọi thứ ───────────
{
    const bad = ["../.env", "..%2F.env", "/etc/passwd", "C:/Windows/win.ini", ".env", "package.json"];
    for (const p of bad) {
        const r = await get(`/api/file?token=${TOKEN}&path=${encodeURIComponent(p)}`);
        chk(`>>> từ chối đọc "${p}"`, r.status === 400, `${p} → ${r.status}`);
    }
    const ok = await get(`/api/file?token=${TOKEN}&path=${encodeURIComponent("project-docs/03_DEV/UI-flow.md")}`);
    chk("đọc được file TRONG vùng cho phép", ok.status === 200 && (await ok.text()).includes("Flow:"), String(ok.status));
}
{
    // Kiểm thẳng hàm, để lý do từ chối nói được thành lời.
    chk("safeReadPath chặn `..`", G.safeReadPath("../x").ok === false);
    chk("safeReadPath chặn đường dẫn tuyệt đối", G.safeReadPath("/etc/x").ok === false && G.safeReadPath("C:/x").ok === false);
    chk("safeReadPath chỉ cho vùng đã khai",
        G.safeReadPath("node_modules/x").ok === false && G.safeReadPath(".qa-run/x.md").ok === true);
    chk("safeReadPath chuẩn hoá dấu \\ của Windows", G.safeReadPath(".qa-run\\a\\b.md").path === ".qa-run/a/b.md");
}

// ─────────── 5. Ranh giới: UI chỉ DỰNG LỆNH, không tự làm ───────────
//
// Ngày UI viết lại logic là ngày có HAI hệ thống. Nên thứ duy nhất nó được sinh ra là một dòng
// lệnh `qa.js` — và dòng đó phải đúng.
{
    chk("dựng đúng lệnh cơ bản",
        S.runArgsFrom({ flow: "full", task: "Task A" }).join(" ") === "run full Task A",
        S.runArgsFrom({ flow: "full", task: "Task A" }).join(" "));
    chk("cờ lọc test case (R4) đi kèm",
        S.runArgsFrom({ flow: "full", tc: "TC-D-001", suite: "smoke" }).join(" ") === "run full --tc=TC-D-001 --suite=smoke",
        S.runArgsFrom({ flow: "full", tc: "TC-D-001", suite: "smoke" }).join(" "));

    // ⚠ LUẬT SỐ 7 (bản 3): MCP thật phải xác nhận tường minh MỖI LẦN.
    chk(">>> KHÔNG tick --confirm-mcp → cờ đó KHÔNG xuất hiện",
        !S.runArgsFrom({ flow: "full", confirmMcp: false }).includes("--confirm-mcp"));
    chk("giá trị 'truthy' KHÔNG phải true cũng không bật được cờ (chỉ đúng boolean true)",
        !S.runArgsFrom({ flow: "full", confirmMcp: "yes" }).includes("--confirm-mcp") &&
        !S.runArgsFrom({ flow: "full", confirmMcp: 1 }).includes("--confirm-mcp"),
        JSON.stringify(S.runArgsFrom({ flow: "full", confirmMcp: "yes" })));
    chk("tick rồi thì có", S.runArgsFrom({ flow: "full", confirmMcp: true }).includes("--confirm-mcp"));
}

// ─────────── 6. Đọc trạng thái đi qua memory.js, không tự viết SQL ───────────
{
    const r = await (await get(`/api/state?token=${TOKEN}`)).json();
    chk("/api/state trả về danh sách phiên", Array.isArray(r.runs), JSON.stringify(r).slice(0, 120));
    const f = await (await get(`/api/flows?token=${TOKEN}`)).json();
    chk("/api/flows đọc được luồng thật của repo",
        f.flows?.some(x => x.name === "full") && f.flows.some(x => x.name === "analyze"),
        JSON.stringify(f.flows?.map(x => x.name)));
    chk(">>> /api/flows nêu được cờ --confirm-mcp để giao diện cảnh báo đúng chỗ",
        f.flows.find(x => x.name === "full")?.flags?.some(fl => fl.name === "confirm-mcp"),
        JSON.stringify(f.flows.find(x => x.name === "full")?.flags));
}

// ─────────── 7. Endpoint lạ ───────────
{
    chk("endpoint không có → 404 (sau khi đã qua token)",
        (await get(`/api/khong-co?token=${TOKEN}`)).status === 404);
}

// ─────────── 8. Token đổi mỗi lần khởi động ───────────
{
    const s2 = await S.startUiServer({ port: 0 });
    chk(">>> token của lần khởi động sau KHÁC lần trước (URL cũ không dùng lại được)",
        s2.token !== TOKEN, `${TOKEN.slice(0, 6)}… vs ${s2.token.slice(0, 6)}…`);
    chk("token cũ KHÔNG mở được server mới",
        (await fetch(`http://127.0.0.1:${s2.port}/api/state?token=${TOKEN}`)).status === 401);
    s2.close();
}

srv.close();

let bad = 0;
for (const [n, c, e] of T) { if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + n + (e && !c ? "   → " + String(e).slice(0, 200) : "")); }
console.log(`\nui-server: ${T.length - bad}/${T.length}`);
process.exit(bad === 0 ? 0 : 1);
