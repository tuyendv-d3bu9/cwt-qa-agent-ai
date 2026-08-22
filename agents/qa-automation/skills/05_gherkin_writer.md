# Skill: Gherkin Writer

## Purpose
Biến một test case (bảng 8 trường của qa-test-designer) thành một `Scenario` Gherkin, **chỉ dùng những step đã có code
thật**. File `.feature` là nguồn sự thật của luồng; `tools/gherkin-codegen.js` biên dịch nó thành
`.spec.ts` một cách deterministic.

## ⚠ TỪ VỰNG BỊ CHẶN — chỉ được dùng step có trong catalogue

`{{step_catalogue}}` là danh sách step **đã có hàm TypeScript chạy được** trong `tests/steps/`.
Chúng được sinh ra từ luồng thật mà agent đã đi qua bằng MCP, với locator do Playwright sinh.

**Bạn PHẢI dùng lại nguyên văn `text` của step trong catalogue.** Không viết step mới, không diễn
đạt lại cho hay hơn, không dịch.

Vì sao chặt đến vậy: bản trước không có catalogue, nên **mỗi test case tự phát minh cách diễn đạt
riêng**. 21 test case → 21 kiểu → 21 file spec không dùng lại được gì của nhau, và **13/21 file
cuối cùng không thực hiện hành động nào** (mọi bước bị comment `// TODO: locator chưa xác định`).
Catalogue tồn tại để một bước được viết một lần, người review một lần, rồi 21 test case cùng gọi.

Step **không có** trong catalogue → **KHÔNG được viết vào Scenario**. Đưa nó vào mục `new_steps` của
JSON trả về, để người ta bổ sung. Viết bừa vào Scenario thì `gherkin-codegen.js` sẽ không khớp được
và **không sinh spec nào cả** cho test case đó.

## Knowledge Reference
- `knowledge/oracle-problem.md` — pass/fail CHỈ từ `expect()`; Scenario không quyết định pass/fail.
- `../../memory/semantic/testing-conventions.md` — định dạng `TC_ID`.
- `../../memory/semantic/money-comparison.md` — tiền so bằng SỐ, đừng đưa đơn vị vào step.

## Prompt Type
Template-based

## Variables
{{test_case}} — 1 test case: `{ tcId, title, precondition, steps[], data: { fields }, expected, priority, tags }`
{{step_catalogue}} — step **đã có code**: mỗi dòng `- <name> | "<text>" | kind=action|check | needsValue=true|false`
{{missing_steps}} — bước của luồng **chưa có code** (agent chưa đi tới được), kèm lý do. Đây là thứ bạn KHÔNG được dùng.
{{flow_name}} — tên luồng nghiệp vụ

## PROMPT
Bạn là QA Test Designer. Viết Gherkin Scenario cho test case sau:

{{test_case}}

Luồng nghiệp vụ: {{flow_name}}

Step ĐƯỢC PHÉP dùng (đã có code thật, dùng nguyên văn phần trong ngoặc kép):

{{step_catalogue}}

Step CHƯA có code — KHÔNG được dùng:

{{missing_steps}}

Trả về JSON thuần (không markdown fence):
```json
{
  "feature": "<tên feature, thường là tên luồng>",
  "scenario": "<tên scenario = Title của test case>",
  "tags": ["@<TC_ID>", "@<Priority>"],
  "steps": [
    { "keyword": "Given|When|Then|And", "text": "<NGUYÊN VĂN text của một step trong catalogue>", "arg": "<giá trị cần nhập, hoặc null>" }
  ],
  "new_steps": [
    { "text": "<bước cần mà catalogue không có>", "why": "<vì sao test case này cần nó>" }
  ]
}
```

Luật bắt buộc:

1. **`text` phải trùng nguyên văn với một `text` trong `{{step_catalogue}}`.** Đây là điều kiện để
   codegen khớp được. Sai một chữ là không sinh được spec.
2. **Tag đầu tiên phải là `@<TC_ID>`** đúng như trong test case. Đây là sợi dây truy vết
   `.feature ↔ test case ↔ spec`; thiếu nó là mất truy vết.
3. **`arg`** chỉ điền khi step đó có `needsValue=true`. Lấy giá trị từ `data.fields` của test case.
   Step `needsValue=false` thì `arg` phải là `null`.
4. **KHÔNG viết step `Then` để tự kết luận đúng/sai.** Assertion do codegen sinh từ Expected Result
   của test case — đó là chỗ DUY NHẤT quyết định pass/fail (`oracle-problem.md`). Step `kind=check`
   chỉ là "đi tới chỗ quan sát", không phải phán xét.
5. **Thiếu step thì khai ở `new_steps`, không bịa vào `steps`.** Thà một test case chưa sinh được
   spec còn hơn một spec bỏ lửng giữa luồng mà vẫn báo xanh.
6. **KHÔNG đưa đơn vị tiền vào `text` hay `arg`** nếu step không yêu cầu. Tiền được so bằng số.

## Sample Input
```
test_case = { "tcId": "TC-D-001", "title": "Áp mã PERCENT hợp lệ",
              "data": { "fields": { "voucher_code": "SALE20" } },
              "expected": "Áp mã thành công, tổng tiền giảm đúng", "priority": "Critical" }
flow_name = Áp mã giảm giá khi checkout
step_catalogue =
- step1_themSanPhamVaoGio | "Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng" | kind=action | needsValue=false
- step2_moTrangThanhToan  | "Mở trang thanh toán / giỏ hàng" | kind=action | needsValue=false
- step3_nhapMaGiamGia     | "Nhập mã giảm giá vào ô nhập mã rồi áp dụng" | kind=action | needsValue=true
missing_steps = (không có)
```

## Sample Output
```json
{
  "feature": "Áp mã giảm giá khi checkout",
  "scenario": "Áp mã PERCENT hợp lệ",
  "tags": ["@TC-D-001", "@Critical"],
  "steps": [
    { "keyword": "Given", "text": "Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng", "arg": null },
    { "keyword": "And", "text": "Mở trang thanh toán / giỏ hàng", "arg": null },
    { "keyword": "When", "text": "Nhập mã giảm giá vào ô nhập mã rồi áp dụng", "arg": "SALE20" }
  ],
  "new_steps": []
}
```

## Sample Output (thiếu step — cũng là kết quả đúng)
```json
{
  "feature": "Áp mã giảm giá khi checkout",
  "scenario": "Thay đổi giỏ hàng sau khi áp mã",
  "tags": ["@TC-D-016", "@High"],
  "steps": [
    { "keyword": "Given", "text": "Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng", "arg": null }
  ],
  "new_steps": [
    { "text": "Bớt một sản phẩm khỏi giỏ hàng sau khi đã áp mã", "why": "TC-D-016 kiểm tra hệ thống tự gỡ mã khi giỏ tụt dưới giá trị tối thiểu; luồng hiện tại không có bước sửa giỏ." }
  ]
}
```

## Quality Check
- **Faithful**: mọi `text` xuất hiện nguyên văn trong `{{step_catalogue}}`; không có step tự nghĩ ra.
- **Accurate**: `arg` lấy đúng từ `data.fields`, không tự đổi giá trị.
- **Complete**: bước nào test case cần mà catalogue không có đều nằm ở `new_steps`, không bỏ lửng.
- **Testable**: `gherkin-codegen.js` khớp được 100% step trong `steps` → sinh ra spec chạy được.
- **Traceable**: tag `@<TC_ID>` khớp đúng `tcId` của test case.
