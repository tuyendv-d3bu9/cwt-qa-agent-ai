# Knowledge: The Oracle Problem

## Type
Testing Theory / Convention

## Content

**Vấn đề Oracle**: Automation test cần 1 "oracle" — 1 cách để biết kết quả ĐÚNG là gì — để so sánh với kết quả thực tế. Với UI test, oracle dễ bị nhầm thành "nhìn ảnh chụp màn hình thấy giống là được" — đây là cách làm SAI, vì ảnh có thể giống nhau về mặt hình ảnh nhưng sai về mặt logic (ví dụ số tiền hiển thị đúng vị trí nhưng sai giá trị bên trong).

**Giải pháp đã chọn: explore-then-freeze (2 lượt)**:
1. **Lượt 1 — Explore** (`01_exploratory_ui_discovery.md`): dùng MCP Playwright để quan sát DOM thật, xác định selector thật và giá trị thật đang hiển thị trên trang.
2. **Lượt 2 — Freeze** (`02_spec_generator.md`): sinh `.spec.ts` tĩnh với `expect()` assertion cụ thể (giá trị số, text message, trạng thái) dựa trên Expected Result mà Test Designer đã viết — không dựa trên "trông giống vậy".

**Rule cứng**: `page.screenshot()` KHÔNG BAO GIỜ được dùng làm căn cứ quyết định pass/fail. Mọi verdict pass/fail phải xuất phát từ `expect()` assertion trong code — enforced deterministic bởi `tools/spec-assertion-check.js`, không tin vào lời tự báo cáo của LLM.

### Ranh giới của ảnh — 3 việc ảnh ĐƯỢC làm, 1 việc KHÔNG

Rule trên vẫn nguyên. Phần dưới chỉ nói rõ ảnh được dùng tới đâu, vì hiện mỗi spec chủ động chụp `.qa-run/evidence/<TC_ID>-before.jpg` và `-after.jpg` (không chỉ chụp khi fail nữa).

| Ảnh ĐƯỢC dùng để | Ai dùng |
|---|---|
| Làm evidence cho người xem/bug report | người, `qa-reporter` |
| **Phân loại NGUYÊN NHÂN** một test đã fail: spec sai (`SPEC_ISSUE`) hay sản phẩm sai (`BEHAVIOR_MISMATCH`) | `qa-verifier` |
| **Phát hiện false-green**: `expect()` xanh nhưng màn hình sai → nâng cờ `UNCLEAR`/ASK cho người xem | `qa-verifier` |

| Ảnh KHÔNG được dùng để |
|---|
| **Quyết định pass/fail.** Ảnh không bao giờ biến một test fail thành pass, và không bao giờ tự kết luận pass. |

Nói cách khác: `expect()` trả lời **"đúng hay sai"**; ảnh trả lời **"vì sao"** và **"có gì `expect()` không nhìn tới"**. Ảnh chỉ được **hạ cấp** kết luận (pass → cần người xem), không được nâng cấp.

Vì vậy `spec-assertion-check.js` **không cần nới lỏng**: spec có cả ảnh lẫn `expect()` vẫn hợp lệ, chỉ spec **chỉ có ảnh mà 0 assertion** mới bị chặn.

Ngoài ra, `browser_verify_*` của MCP gọi lúc **authoring** (xem `01_exploratory_ui_discovery.md`) cũng không phải verdict — lệch phát hiện ở đó là **phát hiện exploratory**, ghi vào `.qa-run/deliverables/exploratory-findings.md` để người xem, KHÔNG thay cho lần chạy spec thật.

## Source
Thiết kế QA Automation.

## Node referenced
qa-automation