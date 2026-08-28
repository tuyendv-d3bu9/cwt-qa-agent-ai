// Test R6.2/R6.3: kế hoạch tư cách → project Playwright + spec dựng đăng nhập.
//
// Hai hàm được test ở đây là hai hàm THUẦN (không đĩa, không trình duyệt, không LLM) nhưng lại
// là chỗ dễ sai nhất: chúng SINH RA MÃ. Một spec setup sai không làm gì ồn ào — nó lưu ra state
// của khách, rồi mọi test tư cách `customer` đỏ vì "không thấy giỏ hàng", cách nguyên nhân
// một tầng.

import path from "node:path";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const I = await import(abs("agents/qa-automation/tools/identity-plan.js"));
const F = await import(abs("agents/qa-leader/tools/ui-flow-parser.js"));
const P = await import(abs("agents/runtime/paths.js"));

const T = [];
const chk = (n, c, e = "") => T.push([n, c, e]);

const flow = (name, lines) => `## Flow: ${name}\n**Entry:** https://x.io/\n${lines.join("\n")}\n`;
const parse = (md) => F.parseUiFlows(md).flows;

// ─────────── 1. identityPlan ───────────
{
    const plan = I.identityPlan(parse(
        flow("Đăng nhập", ["**Tư cách:** khách", "**Tạo tư cách:** customer", "1. a"]) +
        flow("Mua", ["**Tư cách:** customer", "1. b"])));
    chk("kế hoạch bật khi tài liệu có khai tư cách", plan.enabled === true);
    chk("needed = guest + customer", plan.needed.join(",") === "guest,customer", plan.needed.join(","));
    chk("created chỉ có customer", plan.created.join(",") === "customer", plan.created.join(","));
}
{
    const plan = I.identityPlan(parse(flow("A", ["1. x"])));
    chk(">>> tài liệu không khai tư cách → enabled=false (dự án không có đăng nhập chạy như cũ)",
        plan.enabled === false && plan.needed.length === 0, JSON.stringify(plan));
}

// ─────────── 2. identityTag khớp với grep của playwright.config.ts ───────────
{
    const tag = I.identityTag("customer");
    chk("tag có dạng @identity:<tên>", tag === "@identity:customer", tag);
    // config lọc bằng `new RegExp('@identity:customer\\b')` — kiểm chính biểu thức đó khớp,
    // vì tag và grep nằm ở HAI file: lệch nhau là Playwright báo "0 test" chứ không báo lỗi.
    const grep = new RegExp(`@identity:customer\\b`);
    chk(">>> tiêu đề mang tag khớp grep của config", grep.test(`TC-001 áp mã ${tag}`), tag);
    chk(">>> tag 'customer' KHÔNG khớp grep của tư cách khác",
        !new RegExp(`@identity:guest\\b`).test(`TC-001 ${tag}`));
    // `\b` sau tên: `@identity:customer` không được khớp grep của `@identity:customer-vip`.
    chk("tên tư cách này không nuốt tên tư cách dài hơn",
        !new RegExp(`@identity:customer-vip\\b`).test(`TC-001 ${I.identityTag("customer")}`));
}

// ─────────── 3. emitAuthSetup — từ chối những đầu vào vô nghĩa ───────────
{
    let threw = null;
    try { I.emitAuthSetup({ identity: "guest", flowName: "L", entry: "https://x.io/", stepsImport: "./s", calls: [{ fn: "a" }] }); }
    catch (e) { threw = e.message; }
    chk(">>> từ chối dựng state cho 'guest' (trình duyệt sạch ĐÃ LÀ khách)",
        threw !== null && /guest/.test(threw), String(threw));
}
{
    let threw = null;
    try { I.emitAuthSetup({ identity: "customer", flowName: "Đăng nhập", entry: "https://x.io/", stepsImport: "./s", calls: [] }); }
    catch (e) { threw = e.message; }
    chk(">>> từ chối sinh spec setup RỖNG — nó sẽ lưu ra state của khách và mọi test customer đỏ oan",
        threw !== null && /rỗng|không có bước/.test(threw), String(threw));
}

// ─────────── 4. emitAuthSetup — nội dung sinh ra ───────────
{
    const src = I.emitAuthSetup({
        identity: "customer",
        flowName: "Đăng nhập bằng tài khoản khách hàng",
        entry: "https://cwshopgo.github.io/",
        stepsImport: "../../../tests/steps/dang-nhap.steps",
        calls: [{ fn: "step1_moManHinhDangNhap" }, { fn: "step2_dienEmailVaMatKhau", arg: "email" }],
    });
    chk("import đúng thư viện step, không import trùng lặp",
        (src.match(/^import \{[^}]+\} from '\.\.\/\.\.\/\.\.\/tests\/steps\/dang-nhap\.steps';$/m) ?? []).length === 1, src);
    chk("gọi mọi step theo đúng thứ tự",
        src.indexOf("step1_moManHinhDangNhap") < src.indexOf("step2_dienEmailVaMatKhau"));
    chk("goto đúng entry", src.includes(`page.goto("https://cwshopgo.github.io/")`), src);

    chk(">>> lưu storageState SAU cùng — lưu sớm một bước là lưu ra state của khách",
        src.indexOf("storageState") > src.indexOf("step2_dienEmailVaMatKhau"), "vị trí sai");
    chk("đường dẫn state lấy từ paths.js, không viết tay",
        src.includes(JSON.stringify(P.authStatePath("customer"))), P.authStatePath("customer"));

    chk(">>> KHÔNG có email/mật khẩu nào nằm trong mã sinh ra",
        !/@[a-z0-9-]+\.(vn|com)/i.test(src) && !/password\s*[:=]\s*['\"]/.test(src), src);
    chk("thiếu file thông tin đăng nhập → NÉM lỗi nói rõ tên file, không đăng nhập hỏng rồi đi tiếp",
        src.includes("Thiếu") && src.includes(I.CREDENTIALS_FILE), I.CREDENTIALS_FILE);
    chk("thiếu đúng một trường cũng ném, không truyền undefined vào step",
        /missing\(/.test(src) && /thiếu trường/.test(src), src);
    chk("dùng `test as setup`, không phải `test` thường (đây không phải test nghiệp vụ)",
        src.includes("import { test as setup }") && src.includes("setup('dựng trạng thái đăng nhập: customer'"), src);
}
{
    // Luồng đăng nhập không cần điền gì (ví dụ nút "đăng nhập nhanh 1-click"): KHÔNG được sinh
    // ra phần đọc credentials, vì file đó khi ấy không cần tồn tại.
    const src = I.emitAuthSetup({
        identity: "admin", flowName: "L", entry: "https://x.io/", stepsImport: "./s",
        calls: [{ fn: "step1_bamDangNhapNhanh" }],
    });
    chk(">>> luồng không cần giá trị → KHÔNG đòi file credentials",
        !src.includes(I.CREDENTIALS_FILE) && !src.includes("readFileSync"), src);
    chk("vẫn lưu state", src.includes("storageState"), src);
}

// ─────────── 5. writeIdentityPlan — kế hoạch rỗng phải XOÁ file cũ ───────────
{
    const calls = [];
    const fakeFs = {
        rm: async (p, o) => { calls.push(["rm", p, JSON.stringify(o)]); },
        mkdir: async (p) => { calls.push(["mkdir", p]); },
        writeFile: async (p) => { calls.push(["writeFile", p]); },
    };
    await I.writeIdentityPlan({ enabled: false }, { fs: fakeFs });
    chk(">>> kế hoạch rỗng → XOÁ identities.json, không để file cũ dựng project ma",
        calls.length === 1 && calls[0][0] === "rm" && calls[0][1] === P.IDENTITIES_JSON, JSON.stringify(calls));

    calls.length = 0;
    await I.writeIdentityPlan({ enabled: true, needed: ["guest", "customer"], created: ["customer"], loginFlowFor: {} }, { fs: fakeFs });
    chk("kế hoạch có nội dung → tạo thư mục rồi ghi file",
        calls.map(c => c[0]).join(",") === "mkdir,writeFile", JSON.stringify(calls));
}

// ─────────── 6. Codegen gắn tag vào TIÊU ĐỀ test ───────────
{
    const G = await import(abs("agents/qa-automation/tools/gherkin-codegen.js"));
    const catalogue = { available: [{ name: "step1_them", text: "thêm hàng", kind: "action", needsValue: false }] };
    const scenario = { name: "Áp mã hợp lệ", tcId: "TC-D-001", steps: [{ keyword: "Given", text: "thêm hàng", raw: "thêm hàng", arg: null }] };
    const testCase = { tcId: "TC-D-001", expected: 'thấy "Áp dụng thành công"' };

    const tagged = G.emitSpec({ scenario, catalogue, testCase, identity: "customer" }).content;
    chk(">>> tag nằm trong TIÊU ĐỀ test (config grep tiêu đề, không grep chú thích)",
        /test\('TC-D-001:[^']*@identity:customer'/.test(tagged),
        (tagged.match(/test\('[^']*'/) ?? [""])[0]);
    chk("tiêu đề vẫn giữ tcId và tên scenario",
        /TC-D-001: Áp mã hợp lệ @identity:customer/.test(tagged), (tagged.match(/test\('[^']*'/) ?? [""])[0]);

    const plain = G.emitSpec({ scenario, catalogue, testCase }).content;
    chk(">>> không truyền identity → tiêu đề y như trước R6 (dự án không có đăng nhập)",
        /test\('TC-D-001: Áp mã hợp lệ'/.test(plain), (plain.match(/test\('[^']*'/) ?? [""])[0]);

    // Vòng khép kín: chính regex của config phải khớp chính chuỗi codegen sinh ra.
    chk(">>> KHÉP KÍN: grep của config khớp tiêu đề codegen sinh ra",
        new RegExp(`@identity:customer\\b`).test(tagged));

    // Cửa chặn chế độ hỏng im lặng nhất: spec không tag → không project nào nhận → "0 test".
    const plan = { enabled: true };
    chk(">>> untaggedSpecs bắt được spec quên tag (nếu không: Playwright báo '0 test', exit 0)",
        I.untaggedSpecs([{ tcId: "TC-D-001", content: plain }], plan).join(",") === "TC-D-001",
        JSON.stringify(I.untaggedSpecs([{ tcId: "TC-D-001", content: plain }], plan)));
    chk("spec có tag thì không bị báo", I.untaggedSpecs([{ tcId: "TC-D-001", content: tagged }], plan).length === 0);
    chk("dự án không khai tư cách → untaggedSpecs im lặng, không bắt vạ spec cũ",
        I.untaggedSpecs([{ tcId: "X", content: plain }], { enabled: false }).length === 0);
}

let bad = 0;
for (const [n, c, e] of T) { if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + n + (e && !c ? "   → " + String(e).slice(0, 200) : "")); }
console.log(`\nidentity-plan: ${T.length - bad}/${T.length}`);
process.exit(bad === 0 ? 0 : 1);
