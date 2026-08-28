// agents/qa-automation/tools/identity-plan.js
// R6 — biến `**Tư cách:**` trong tài liệu luồng thành thứ Playwright chạy được.
//
// BA MẢNH, ĐỪNG TRỘN:
//   1. `identityPlan()`      — đọc flows → kế hoạch. Thuần, không I/O.
//   2. `emitAuthSetup()`     — kế hoạch → mã nguồn spec dựng đăng nhập. Thuần, không I/O.
//   3. `writeIdentityPlan()` — ghi `identities.json` cho `playwright.config.ts` đọc.
//
// VÌ SAO TÁCH: hai hàm đầu test được mà không cần trình duyệt, không cần LLM, không cần đĩa.
// Đúng chỗ dễ sai nhất (sinh mã) lại là chỗ rẻ nhất để kiểm.
//
// ⚠ RANH GIỚI KHÔNG ĐƯỢC PHÁ: `storageState` là HẠ TẦNG AUTOMATION, không phải bước nghiệp vụ.
// Nó không bao giờ được xuất hiện như một step trong `.feature`, và tên tài khoản/mật khẩu
// không bao giờ được nằm trong mã sinh ra — xem `CREDENTIALS_FILE` bên dưới.

import * as P from "../../runtime/paths.js";
import { identitiesOf, GUEST_IDENTITY } from "../../qa-leader/tools/ui-flow-parser.js";

/**
 * File thông tin đăng nhập do NGƯỜI cung cấp, mỗi dự án một lần.
 *
 * VÌ SAO KHÔNG SINH TỰ ĐỘNG. Email/mật khẩu là **dữ liệu của dự án**, không suy ra được từ tài
 * liệu luồng và cũng không được phép bịa. App demo ShopGo nhận mọi mật khẩu, nhưng viết sẵn một
 * cặp bừa vào mã sinh ra là gieo một "business rule" không ai duyệt — đúng thứ repo này cấm.
 *
 * VÌ SAO KHÔNG COMMIT: nó là thông tin đăng nhập. Nằm trong `.qa-run/` nên đã bị gitignore.
 */
export const CREDENTIALS_FILE = `${P.AUTH_DIR}/credentials.json`;

/**
 * Kế hoạch tư cách của dự án.
 *
 * @param {Array} flows  kết quả `parseUiFlows().flows`
 * @returns {{needed: string[], created: string[], loginFlowFor: Record<string,string>, enabled: boolean}}
 *   `enabled: false` = tài liệu không khai tư cách nào → mọi thứ phía sau giữ nguyên hành vi cũ.
 */
export function identityPlan(flows) {
    const { needed, created, loginFlowFor } = identitiesOf(flows);
    return { needed, created, loginFlowFor, enabled: needed.length > 0 };
}

/** Tag gắn vào tiêu đề test để `playwright.config.ts` lọc test về đúng project. */
export function identityTag(identity) {
    return `@identity:${identity}`;
}

/**
 * Mã nguồn spec dựng trạng thái đăng nhập cho MỘT tư cách.
 *
 * @param {object} o
 * @param {string} o.identity     tên tư cách, ví dụ "customer"
 * @param {string} o.flowName     tên luồng đăng nhập (chỉ để ghi vào chú thích/tiêu đề)
 * @param {string} o.entry        URL bắt đầu
 * @param {string} o.stepsImport  đường dẫn import thư viện step của luồng đăng nhập
 * @param {Array<{fn: string, arg?: string|null}>} o.calls  các step phải gọi, theo thứ tự
 * @returns {string} nội dung file `.setup.ts`
 */
export function emitAuthSetup({ identity, flowName, entry, stepsImport, calls = [] }) {
    if (!identity || identity === GUEST_IDENTITY) {
        throw new Error(
            `emitAuthSetup: không dựng state cho "${identity ?? "(rỗng)"}". ` +
            `"${GUEST_IDENTITY}" là trạng thái CHƯA đăng nhập — trình duyệt sạch đã là nó rồi.`);
    }
    if (!calls.length) {
        // Một spec setup không làm gì sẽ lưu ra state của khách, rồi mọi test `customer` chạy
        // như khách và đỏ ở một chỗ chẳng liên quan. Thà không sinh file.
        throw new Error(
            `emitAuthSetup: luồng "${flowName}" không có bước nào để đăng nhập. ` +
            `Không sinh spec setup rỗng — nó sẽ lưu ra state của khách và mọi test "${identity}" đỏ oan.`);
    }

    const used = [...new Set(calls.map(c => c.fn))];
    const needsCreds = calls.some(c => c.arg != null);
    const L = [];

    L.push(`// SINH TỰ ĐỘNG bởi agents/qa-automation/tools/identity-plan.js — ĐỪNG SỬA TAY.`);
    L.push(`//`);
    L.push(`// Dựng trạng thái đăng nhập cho tư cách "${identity}", từ luồng "${flowName}".`);
    L.push(`// Chạy MỘT LẦN trước mọi test khai ${identityTag(identity)} (Playwright project dependency).`);
    L.push(`//`);
    L.push(`// Đây KHÔNG phải test: nó không assert gì về nghiệp vụ. Việc duy nhất của nó là để lại`);
    L.push(`// ${P.authStatePath(identity)} cho các spec khác nạp.`);
    L.push(`import { test as setup } from '@playwright/test';`);
    L.push(`import { ${used.join(", ")} } from '${stepsImport}';`);
    if (needsCreds) {
        L.push(`import { readFileSync } from 'node:fs';`);
    }
    L.push(``);
    L.push(`const STATE = ${JSON.stringify(P.authStatePath(identity))};`);
    if (needsCreds) {
        L.push(``);
        L.push(`// Thông tin đăng nhập là DỮ LIỆU DỰ ÁN — không sinh ra được từ tài liệu luồng và`);
        L.push(`// không được bịa. Thiếu thì dừng ngay với thông báo nói đúng phải làm gì, thay vì`);
        L.push(`// đăng nhập hỏng rồi để 20 test case đỏ vì "không thấy giỏ hàng".`);
        L.push(`function creds(): Record<string, string> {`);
        L.push(`  const file = ${JSON.stringify(CREDENTIALS_FILE)};`);
        L.push(`  let raw: string;`);
        L.push(`  try { raw = readFileSync(file, 'utf8'); }`);
        L.push(`  catch { throw new Error(`);
        L.push(`    \`Thiếu \${file}. Tạo file đó với nội dung: {"${identity}": {"<tên trường>": "<giá trị>"}}\`); }`);
        L.push(`  const all = JSON.parse(raw);`);
        L.push(`  const mine = all?.[${JSON.stringify(identity)}];`);
        L.push(`  if (!mine) throw new Error(\`\${file} không có khoá "${identity}".\`);`);
        L.push(`  return mine;`);
        L.push(`}`);
    }
    L.push(``);
    L.push(`setup('dựng trạng thái đăng nhập: ${identity}', async ({ page }) => {`);
    if (needsCreds) L.push(`  const data = creds();`);
    L.push(`  await page.goto(${JSON.stringify(entry)});`);
    let credIndex = 0;
    for (const c of calls) {
        if (c.arg == null) {
            L.push(`  await ${c.fn}(page);`);
        } else {
            const key = c.arg;
            L.push(`  await ${c.fn}(page, data[${JSON.stringify(key)}] ?? missing(${JSON.stringify(key)}));`);
            credIndex++;
        }
    }
    L.push(``);
    L.push(`  // Lưu state SAU khi đã đăng nhập xong. Lưu sớm một bước là lưu ra state của khách.`);
    L.push(`  await page.context().storageState({ path: STATE });`);
    L.push(`});`);
    if (credIndex > 0) {
        L.push(``);
        L.push(`function missing(key: string): never {`);
        L.push(`  throw new Error(\`\${${JSON.stringify(CREDENTIALS_FILE)}} thiếu trường "\${key}" cho tư cách "${identity}".\`);`);
        L.push(`}`);
    }
    return L.join("\n") + "\n";
}

/**
 * Spec nào bị QUÊN gắn tag tư cách — cửa chặn cho chế độ hỏng im lặng nhất của R6.
 *
 * `playwright.config.ts` lọc test về project bằng `grep` trên tag. Một spec không có tag thì
 * **không thuộc project nào**: Playwright chạy xong báo "0 test", exit 0, và cả pipeline coi
 * như mọi thứ ổn. Không có lỗi nào để mà đọc.
 *
 * @param {Array<{tcId: string, content: string}>} specs
 * @param {{enabled: boolean}} plan
 * @returns {string[]} tcId của các spec thiếu tag (rỗng khi dự án không khai tư cách)
 */
export function untaggedSpecs(specs, plan) {
    if (!plan?.enabled) return [];
    return (specs ?? [])
        .filter(s => !/@identity:[a-z0-9-]+/.test(String(s?.content ?? "")))
        .map(s => s.tcId);
}

/**
 * Ghi `identities.json` — hợp đồng giữa pipeline và `playwright.config.ts`.
 *
 * Kế hoạch rỗng (`enabled: false`) thì **xoá** file thay vì ghi file rỗng: một `identities.json`
 * còn sót lại từ lần chạy trước sẽ dựng project cho những tư cách tài liệu không còn khai, và
 * mọi test rơi ra ngoài mọi `grep` → Playwright báo "0 test" mà không ai hiểu vì sao.
 */
export async function writeIdentityPlan(plan, { fs = null } = {}) {
    const nodeFs = fs ?? await import("node:fs/promises");
    if (!plan?.enabled) {
        await nodeFs.rm(P.IDENTITIES_JSON, { force: true });
        return { written: false, path: P.IDENTITIES_JSON };
    }
    await nodeFs.mkdir(P.AUTH_DIR, { recursive: true });
    await nodeFs.writeFile(
        P.IDENTITIES_JSON,
        JSON.stringify({ needed: plan.needed, created: plan.created, loginFlowFor: plan.loginFlowFor }, null, 2) + "\n",
        "utf8");
    return { written: true, path: P.IDENTITIES_JSON };
}
