# Knowledge: Playwright Conventions

## Type
Convention

## Content

### Ai viết cái gì — bảng này là gốc của mọi quy ước dưới

| Thứ | Ai tạo | Ghi ở đâu |
|---|---|---|
| Locator | **Playwright** (`browser_generate_locator`) | `tools/ui-element-registry.js` → registry |
| Page Object | **code** (`tools/page-object-emitter.js`), deterministic | `tests/pages/*.page.ts` — commit |
| Thư viện step | **code** (`tools/step-emitter.js`), deterministic | `tests/steps/*.steps.ts` — commit |
| `.feature` | **LLM** (skill `04_gherkin_writer.md` của test-designer) | `.qa-run/features/*.feature` |
| `.spec.ts` | **code** (`tools/gherkin-codegen.js`), deterministic | `.qa-run/tests/*.spec.ts` — sinh ra |

**LLM không viết file `.spec.ts`, và không viết locator.** Trước đây nó viết cả spec, nên nó cũng
bịa luôn selector: đã sinh ra `page.click('button[ref="f15e27"]')` — `ref=eN` là mã tham chiếu tạm
của **một** snapshot MCP, không phải attribute HTML, nên selector đó không bao giờ khớp và test chỉ
timeout 30 giây. Đo trên lần chạy thật 2026-08-17: **13/21 spec không thực hiện hành động nào**
(mọi bước bị comment `// TODO: locator chưa xác định`), 3 spec chứa selector `ref=`.

### Đặt tên file

| Loại | Đường dẫn | Commit? |
|---|---|---|
| Spec sinh ra | `.qa-run/tests/<TC_ID>.spec.ts` | không (sản phẩm 1 lần chạy) |
| Data | `.qa-run/tests/data/test-cases.json` | không |
| Feature | `.qa-run/features/<tên-luồng>.feature` | không |
| Page Object | `tests/pages/<tên>.page.ts` | **có** |
| Thư viện step | `tests/steps/<tên-luồng>.steps.ts` | **có** |

Giữ nguyên `TC_ID` từ `deliverable-test-designer.md` trong cả tên file và tên `test(...)`, để truy
nguồn 2 chiều (spec ↔ test case).

`tests/pages/` và `tests/steps/` được commit vì đó là **tài sản dùng lại** — viết một lần, người
review một lần, mọi test case cùng gọi. Spec từng test case thì sinh lại được nên không commit.
Mọi đường dẫn lấy từ `agents/runtime/paths.js`, không hardcode.

### Ảnh evidence — chụp LUÔN, không phải chỉ khi fail

```ts
await page.screenshot({ path: `.qa-run/evidence/${tc.tcId}-before.jpg`, type: 'jpeg', quality: 60, scale: 'css' });
// … các bước + assert …
await page.screenshot({ path: `.qa-run/evidence/${tc.tcId}-after.jpg`,  type: 'jpeg', quality: 60, scale: 'css' });
```

- Chụp **cả 2 ảnh mọi lần chạy**, kể cả khi pass. `qa-verifier` cần ảnh `after` để bắt **false-green**
  (assert xanh nhưng màn hình sai) — không có ảnh khi pass thì không bao giờ bắt được ca đó.
- Nén ngay lúc chụp (`type: 'jpeg'`), không thêm dependency nén ảnh.
- **Ảnh KHÔNG phải căn cứ pass/fail** (`oracle-problem.md`). Ảnh chỉ được **hạ cấp** kết luận.

> Mục này trước đây ghi `evidence/fail_<TC_ID>.png` "chỉ chụp khi test fail" — sai so với thiết kế
> 2 kênh của verifier, và là một tài liệu **dạy LLM làm sai**.

### Artifact của Playwright ≠ evidence của mình

- `.qa-run/evidence/` — **chỉ** ảnh `before/after` do spec tự chụp.
- `.qa-run/artifacts/` — `trace.zip`, `error-context.md`, `test-failed-*.png` do **Playwright** tự tạo
  (`outputDir` trong `playwright.config.ts`).

Tách riêng có chủ ý: trước đây `outputDir` trỏ vào `evidence/`, nên Playwright tạo thư mục con cho
mỗi test fail **lẫn vào giữa** ảnh evidence, và câu "trong evidence/ có gì" có hai đáp án.

### Selector

**Không tự viết selector.** Trong spec không có selector nào — mọi hành động đi qua thư viện step,
và locator nằm ở Page Object do Playwright sinh.

Nếu buộc phải viết locator bằng tay (ngoại lệ, phải ghi rõ lý do trong comment): ưu tiên
`getByRole` / `getByLabel` / `getByTestId`. **Tuyệt đối không** dùng `ref=` — đó là mã snapshot tạm.

### So sánh tiền

Assert **theo SỐ, bỏ đơn vị** — xem `memory/semantic/money-comparison.md`. `150.000 ₫`, `150000đ`,
`150.000 VNĐ` là **cùng một giá trị**. Assert nguyên chuỗi hiển thị là bắt test biết chuyện trình bày
của một dự án cụ thể, và đã từng làm TC-D-012 fail trong khi sản phẩm không sai.

## Source
Thiết kế QA Automation; các con số (13/21 spec không hành động, selector `ref=`, TC-D-012) đo từ lần
chạy thật 2026-08-17.

## Node referenced
qa-automation
