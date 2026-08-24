# Knowledge: Generate Once, Run Many

## Type
Convention / Architecture Principle

## Content

**Định nghĩa**: MCP Playwright (kết nối qua `agents/runtime/mcp-client.js`, hàm `connectPlaywrightMCP()`) CHỈ được gọi trong pha authoring — khi QA Automation đang sinh file `.spec.ts` từ test case. Sau khi `.spec.ts` đã được ghi ra `.qa-run/tests/`, các lần chạy lại spec đó (`npx playwright test`) KHÔNG được gọi lại AI hay MCP — chạy hoàn toàn bằng Playwright test runner thông thường, không phụ thuộc mạng/API key.

**Lý do (WHY, không chỉ WHAT)**:
- **Tốc độ**: gọi LLM/MCP mỗi lần chạy test chậm hơn nhiều so với chạy code tĩnh đã biên dịch sẵn.
- **Determinism**: LLM có thể trả lời khác nhau giữa các lần gọi dù cùng input — test suite cần kết quả lặp lại được (reproducible), không phụ thuộc việc model "đổi ý" giữa các lần chạy CI.
- **Chi phí**: mỗi lần chạy CI không nên tốn thêm token/API call.

**Rule cứng**: Khi `.spec.ts` fail lúc chạy (ví dụ selector không tìm thấy do UI đổi), KHÔNG tự "vá nhanh" bằng cách gọi AI ngay trong lúc test đang chạy. Phải quay lại pha authoring — đi lại luồng (`04_flow_step_matcher.md`) để `browser_generate_locator` sinh locator mới, rồi sinh lại Page Object + step library + spec — không vá tạm lúc runtime.

## Source
Thiết kế QA Automation.

## Node referenced
qa-automation