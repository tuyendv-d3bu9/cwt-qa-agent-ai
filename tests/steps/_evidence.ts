// tests/steps/_evidence.ts
// Ảnh bằng chứng THEO TỪNG BƯỚC (R2.2). Viết tay, được COMMIT và review — khác với
// .qa-run/tests/*.spec.ts là thứ sinh lại mỗi lần.
//
// ── VẤN ĐỀ ĐANG GIẢI ──
// Trước file này, mỗi test case có đúng hai ảnh: một ở trang chủ trước khi làm gì, một sau khi
// test đã kết thúc. Câu hỏi thật của QA — *"áp mã có thành công không?"* — xảy ra ở GIỮA, và
// không có ảnh nào cho nó. Khi test đỏ, người đọc nhìn thấy trang đơn hàng và không biết mã đã
// được áp hay chưa.
//
// ── VÌ SAO BỌC `test.step` ──
// Đo trên báo cáo JSON thật của Playwright: một `expect()` KHÔNG bọc trong `test.step()` thì
// KHÔNG xuất hiện trong `result.steps[]`. Mà `result.steps[]` chính là chỗ duy nhất trả lời
// "hỏng ở bước nào". Không bọc thì `qa-verifier` chỉ biết "test này fail", y như trước.
//
// Cũng đo được: `steps[]` chỉ chứa bước ĐÃ BẮT ĐẦU — bước nằm sau chỗ hỏng vắng mặt hẳn, chứ
// không phải có mặt với `error` rỗng. Nên `findIndex(s => s.error)` là cách đúng để tìm bước
// hỏng, và `steps.length` cho biết luồng đi được tới đâu.
//
// ── VÌ SAO `finally` ──
// Ảnh cần nhất là ảnh của bước VỪA HỎNG. Chụp sau lời gọi mà không có `finally` thì đúng lúc
// bước ném lỗi, ảnh không bao giờ được chụp — mất đúng tấm quan trọng nhất.

import { test, type Page } from '@playwright/test';

/** Tên chung cho ảnh và cho tiêu đề `test.step`. PHẢI khớp `stepShotLabel()` trong
 *  agents/runtime/paths.js — đây là khoá nối giữa test-results.json và thư mục ảnh. */
export function shotLabel(n: number, label: string): string {
  return `${String(n).padStart(2, '0')}-${label}`;
}

/**
 * Chụp một ảnh bằng chứng. KHÔNG BAO GIỜ ném lỗi.
 *
 * Lý do nuốt lỗi ở đây, và chỉ ở đây: hàm này chạy trong `finally`. Nếu nó ném khi thân bước
 * ĐÃ ném, lỗi chụp ảnh sẽ thay thế lỗi test thật — người đọc nhận được "screenshot failed"
 * thay vì "không thấy 'Đang kích hoạt giảm giá'". Một tấm ảnh thiếu là phiền; một lỗi thật bị
 * che mất là hỏng cả cuộc điều tra.
 */
export async function shot(page: Page, tcId: string, n: number, label: string): Promise<void> {
  try {
    await page.screenshot({
      path: `.qa-run/evidence/${tcId}/${shotLabel(n, label)}.jpg`,
      type: 'jpeg',
      quality: 60,
      // Cố ý KHÔNG fullPage: ảnh cần là thứ người dùng đang NHÌN THẤY, và fullPage trên trang
      // dài làm ảnh phình lên nhiều lần trong khi VLM vẫn chỉ đọc được vùng liên quan.
      scale: 'css',
    });
  } catch (err) {
    console.warn(`[evidence] không chụp được ${tcId} ${shotLabel(n, label)}: ${(err as Error).message}`);
  }
}

/**
 * Chạy một bước nghiệp vụ: ghi tên bước vào báo cáo, và LUÔN để lại một tấm ảnh.
 *
 * @param n     số thứ tự bước trong luồng (0 = điểm vào)
 * @param label slug của bước — vào cả tên ảnh lẫn tiêu đề bước trong test-results.json
 */
export async function withShot(
  page: Page,
  tcId: string,
  n: number,
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  await test.step(shotLabel(n, label), async () => {
    try {
      await fn();
    } finally {
      await shot(page, tcId, n, label);
    }
  });
}
