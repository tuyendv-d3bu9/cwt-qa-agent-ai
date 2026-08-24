# Skill: Spec Generator

## Purpose
ĐƯỜNG DỰ PHÒNG, chỉ dùng khi không có catalogue step để đi đường `.feature`. Sinh 1 file Playwright `.spec.ts` tĩnh — bước "freeze" của nguyên tắc explore-then-freeze (`oracle-problem.md`).

> **Cảnh báo:** đây là đường CŨ, nơi LLM viết cả file spec. Nó đã sinh ra 13/21 spec không thực hiện hành động nào và 3 spec chứa selector `ref=` không bao giờ khớp. Đường chính là `05_gherkin_writer.md` → `tools/gherkin-codegen.js`, nơi LLM chỉ viết `.feature` và code sinh spec.

Hai thay đổi quan trọng so với bản trước:

1. **Không nhúng test data vào spec.** Data nằm ở `.qa-run/tests/data/test-cases.json` (sinh deterministic bởi `tools/testcase-exporter.js`). Spec **load** data theo `tcId`. Lý do: đổi data không phải sinh lại spec, tức không phải explore lại UI — xem `knowledge/mcp-cost-optimization.md`.
2. **Chụp ảnh before/after.** Mỗi spec chụp 1 ảnh trước khi thực hiện các bước chính và 1 ảnh sau khi assert, để `qa-verifier` có evidence đối chiếu.

## Knowledge Reference
- `knowledge/oracle-problem.md` — **verdict pass/fail CHỈ từ `expect()`**, không bao giờ từ ảnh.
- `knowledge/playwright-conventions.md` — naming file spec/evidence.
- `knowledge/mcp-cost-optimization.md` — vì sao data tách khỏi spec.

## Prompt Type
Template-based

## Variables
{{test_case}} — test case dạng object: `{ tcId, title, precondition, steps[], data: { fields }, expected, priority, tags }`
{{known_locators}} — locator **do Playwright sinh** (`browser_generate_locator`), dạng `- role "name" -> locator`
{{page_elements}} — node đã lọc trên trang (tham chiếu, KHÔNG dùng để tự viết selector)
{{data_file}} — đường dẫn file data (`.qa-run/tests/data/test-cases.json`)
{{exploratory_finding}} — (nếu có) lệch phát hiện được giữa Expected Result và UI thật

## PROMPT
Bạn là QA Automation Agent. Sinh 1 file Playwright test hoàn chỉnh cho test case:

{{test_case}}

Locator có sẵn (do Playwright sinh — **dùng đúng, không viết lại**):

{{known_locators}}

Node trên trang (chỉ để tham chiếu):

{{page_elements}}

Phát hiện exploratory (nếu có):

{{exploratory_finding}}

Yêu cầu:

1. **Load data từ file, KHÔNG nhúng literal.** Đầu file:
   ```ts
   import { test, expect } from '@playwright/test';
   import dataset from './data/test-cases.json' with { type: 'json' };

   const tc = dataset.cases.find(c => c.tcId === '<TC_ID>')!;
   ```
   Giá trị nhập lấy từ `tc.data.fields.<tên_field>`, không viết `'SALE20'` trực tiếp.
2. **Dùng đúng locator đã cho.** Phần tử nào không có locator trong `{{known_locators}}` → ghi `// TODO: locator chưa xác định, cần explore lại` và **KHÔNG viết action cho nó**.
3. **Map mỗi Step → 1 hành động Playwright**, kèm comment là nguyên văn Step ở trên nó.
4. **Ảnh before/after** — đúng 2 lệnh, đặt đúng chỗ:
   ```ts
   await page.screenshot({ path: `.qa-run/evidence/${tc.tcId}-before.jpg`, type: 'jpeg', quality: 60, scale: 'css' });
   // ... các bước chính + assert ...
   await page.screenshot({ path: `.qa-run/evidence/${tc.tcId}-after.jpg`, type: 'jpeg', quality: 60, scale: 'css' });
   ```
   Ảnh là **evidence**, KHÔNG phải căn cứ pass/fail.
5. **Expected Result → ít nhất 1 `expect()` cụ thể.** Nếu Expected Result là hiệu số ("giảm đúng 140.000") thì assert bằng phép tính trên giá trị thật, không chỉ assert giá trị cuối. Đây là chỗ **duy nhất** quyết định pass/fail.
6. Tên test chứa `tcId`: `test('TC-D-001: ...', async ({ page }) => { ... })`.
7. Expected Result nhắc tới định dạng tiền/số → assert đúng chuỗi hiển thị thật, không tự làm tròn khác đi.
8. Có `{{exploratory_finding}}` → thêm comment `// EXPLORATORY: <nội dung>` ngay trên assert liên quan. **KHÔNG** vì thế mà nới lỏng assert cho test dễ pass.

## Sample Input
```
test_case = { "tcId": "TC-D-001", "steps": ["Nhập mã giảm giá", "Bấm Áp dụng"],
              "data": { "fields": { "voucher_code": "SALE20", "order_total": "840000" } },
              "expected": "Áp mã thành công, tổng còn 700.000" }
known_locators =
- textbox "Mã giảm giá" -> getByRole('textbox', { name: 'Mã giảm giá' })
- button "Áp dụng" -> getByRole('button', { name: 'Áp dụng' })
```

## Sample Output
```ts
import { test, expect } from '@playwright/test';
import dataset from './data/test-cases.json' with { type: 'json' };

const tc = dataset.cases.find(c => c.tcId === 'TC-D-001')!;

test('TC-D-001: Ap ma giam gia thanh cong', async ({ page }) => {
  await page.goto('/');   // baseURL do playwright.config.ts lấy từ cấu hình tầng 2
  await page.screenshot({ path: `.qa-run/evidence/${tc.tcId}-before.jpg`, type: 'jpeg', quality: 60, scale: 'css' });

  // Nhập mã giảm giá
  await page.getByRole('textbox', { name: 'Mã giảm giá' }).fill(tc.data.fields.voucher_code);

  // Bấm Áp dụng
  await page.getByRole('button', { name: 'Áp dụng' }).click();

  await expect(page.getByText('700.000')).toBeVisible();

  await page.screenshot({ path: `.qa-run/evidence/${tc.tcId}-after.jpg`, type: 'jpeg', quality: 60, scale: 'css' });
});
```

## Quality Check
- **Faithful**: chỉ dùng locator từ `{{known_locators}}`; không tự viết selector mới; không nhúng data literal.
- **Accurate**: giá trị assert khớp đúng Expected Result, không tự làm tròn hay đổi khác.
- **Complete**: mọi Step đều có hành động tương ứng (hoặc TODO rõ ràng nếu thiếu locator); có đủ 2 ảnh before/after.
- **Testable**: có ít nhất 1 `expect()` không tầm thường — không chỉ `page.screenshot()` hay `expect(true).toBe(true)`.
