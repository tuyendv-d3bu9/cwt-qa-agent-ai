# Knowledge: The Oracle Problem

## Type
Testing Theory / Convention

## Content

**Vấn đề Oracle**: Automation test cần 1 "oracle" — 1 cách để biết kết quả ĐÚNG là gì — để so sánh với kết quả thực tế. Với UI test, oracle dễ bị nhầm thành "nhìn ảnh chụp màn hình thấy giống là được" — đây là cách làm SAI, vì ảnh có thể giống nhau về mặt hình ảnh nhưng sai về mặt logic (ví dụ số tiền hiển thị đúng vị trí nhưng sai giá trị bên trong).

**Giải pháp đã chọn: explore-then-freeze (2 lượt)**:
1. **Lượt 1 — Explore** (`01_dom_explore.md`): dùng MCP Playwright để quan sát DOM thật, xác định selector thật và giá trị thật đang hiển thị trên trang.
2. **Lượt 2 — Freeze** (`02_spec_generator.md`): sinh `.spec.ts` tĩnh với `expect()` assertion cụ thể (giá trị số, text message, trạng thái) dựa trên Expected Result mà Test Designer đã viết — không dựa trên "trông giống vậy".

**Rule cứng**: `page.screenshot()` CHỈ được dùng làm evidence đính kèm khi test fail (để người xem debug), KHÔNG BAO GIỜ được dùng làm căn cứ duy nhất để quyết định pass/fail. Mọi verdict pass/fail phải xuất phát từ `expect()` assertion trong code — enforced deterministic bởi `tools/spec-assertion-check.js`, không tin vào lời tự báo cáo của LLM.

## Source
Thiết kế QA Automation.

## Node referenced
qa-automation