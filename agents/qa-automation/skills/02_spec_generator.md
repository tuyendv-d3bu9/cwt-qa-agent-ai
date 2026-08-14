# Skill: Spec Generator

## Purpose
Dùng ngay sau `01_dom_explore.md`. Sinh Playwright `.spec.ts` tĩnh từ test case + selector thật đã explore — đây là bước "freeze" trong nguyên tắc explore-then-freeze (`oracle-problem.md`).

## Knowledge Reference
- `knowledge/oracle-problem.md` — verdict phải từ `expect()`, không từ screenshot.
- `knowledge/playwright-conventions.md` — naming convention file/test/selector.

## Prompt Type
Template-based

## Variables
{{test_case}} — test case gốc
{{selectors}} — output skill 01

## PROMPT
Bạn là QA Automation Agent. Dựa trên test case:

{{test_case}}

Và selector thật:

{{selectors}}

Sinh 1 file Playwright test (`@playwright/test`) hoàn chỉnh:
- Map từng Steps → hành động Playwright (`page.goto`, `.fill`, `.click`) dùng ĐÚNG selector đã cho.
- Map Test Data → giá trị literal truyền vào `.fill()`.
- Map Expected Result → ít nhất 1 `expect()` cụ thể (giá trị số/text/trạng thái) — KHÔNG chỉ `page.screenshot()`.
- Đặt tên test chứa TC_ID (`test('TC-D-001: ...', async ({ page }) => { ... })`).
- Nếu Expected Result nhắc tới định dạng tiền tệ/số, assert đúng chuỗi hiển thị thật, không tự làm tròn khác đi.
- Nếu selector nào bị đánh dấu "KHÔNG TÌM THẤY" ở skill 01, KHÔNG viết action cho phần tử đó — ghi comment `// TODO: selector chưa xác định, cần explore lại` thay vì tự bịa.

## Sample Input
test_case = "TC-D-001 | Áp mã khi order_total đúng bằng min_order_value | ... | Expected: Áp mã thành công, order_total_after giảm đúng"
selectors = "| Ô nhập mã | getByLabel('Mã giảm giá') | ..."

## Sample Output
```ts
import { test, expect } from '@playwright/test';

test('TC-D-001: Ap ma khi order_total dung bang min_order_value', async ({ page }) => {
  await page.goto('https://cwshopgo.github.io');
  await page.getByLabel('Mã giảm giá').fill('SALE20');
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.getByText('700.000')).toBeVisible();
});
```

## Quality Check
- **Faithful**: chỉ dùng selector từ skill 01, không tự thêm selector mới.
- **Accurate**: giá trị assert khớp đúng Expected Result của test case, không tự làm tròn/đổi khác.
- **Complete**: mọi Step trong test case đều có hành động Playwright tương ứng (hoặc TODO rõ ràng nếu thiếu selector).
- **Testable**: có ít nhất 1 `expect()` không tầm thường — không chỉ `page.screenshot()` hay `expect(true).toBe(true)`.