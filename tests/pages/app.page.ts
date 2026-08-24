// SINH TỰ ĐỘNG bởi agents/qa-automation/tools/page-object-emitter.js — ĐỪNG SỬA TAY.
// Sửa tay sẽ bị ghi đè ở lần explore kế tiếp. Muốn đổi locator thì explore lại.
//
// Mọi locator dưới đây do PLAYWRIGHT sinh (browser_generate_locator) từ phần tử THẬT
// quan sát được trên UI, rồi lưu vào ui-element-registry. KHÔNG có bước nào do LLM viết,
// nên không thể xuất hiện selector bịa (ví dụ 'button[ref="f15e27"]' — ref là mã snapshot
// tạm của MCP, không phải attribute HTML, và không bao giờ khớp gì).
//
// Registry được dựng khi explore: https://cwshopgo.github.io/

import type { Page, Locator } from '@playwright/test';

export class AppPage {
  constructor(readonly page: Page) {}

  // REGISTRY RỖNG — chưa explore được phần tử nào có locator.
  // Không có accessor nào để sinh. Kiểm tra: có đi được luồng không (flow-walker),
  // và tài liệu luồng `project-docs/03_DEV/UI-flow.md` có bước nào đi tới màn hình cần test chưa.

}
