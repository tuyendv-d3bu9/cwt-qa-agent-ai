// SINH TỰ ĐỘNG bởi agents/qa-automation/tools/step-emitter.js.
//
// Đây là THƯ VIỆN STEP DÙNG LẠI của luồng "Áp mã giảm giá khi checkout".
// Mọi test case của luồng này gọi các hàm dưới đây thay vì mỗi test tự viết lại đường đi.
//
// Locator không nằm ở đây — chúng ở Page Object, do Playwright sinh từ phần tử thật.
// File này chỉ nối: bước nghiệp vụ -> accessor -> hành động.
//
// Được COMMIT và cần người review: đây là tài sản dùng lại, khác với
// .qa-run/tests/*.spec.ts là thứ sinh ra mỗi lần.

import type { Page } from '@playwright/test';
import { AppPage } from '../pages/app.page';

/** Mở điểm bắt đầu của luồng. Lấy từ **Entry:** trong tài liệu luồng. */
export async function openEntry(page: Page) {
  await page.goto('https://cwshopgo.github.io/');
}

/** Bước 1 của luồng: Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng */
export async function step1_oTrangChuThemMotSan(page: Page) {
  await new AppPage(page).themVaoGioButton.click();
}

/** Bước 2 của luồng: Mở trang thanh toán / giỏ hàng */
export async function step2_moTrangThanhToanGioHang(page: Page) {
  await new AppPage(page).thanhToan1Button.click();
}

/** Bước 3 của luồng: Nhập mã giảm giá vào ô nhập mã rồi áp dụng */
export async function step3_nhapMaGiamGiaVaoO(page: Page, value: string) {
  if (value === undefined || value === null || value === '') {
    // Thà nổ rõ ràng còn hơn fill('') rồi để test fail vì lý do sai.
    // Đúng bẫy đã làm TC-D-002 fail: fill(tc.data.fields.voucher_code) với field không tồn tại.
    throw new Error('step3_nhapMaGiamGiaVaoO: thiếu giá trị để nhập (bước "Nhập mã giảm giá vào ô nhập mã rồi áp dụng")');
  }
  await new AppPage(page).nhapMaGiam50kSale20Input.fill(value);
}

/** Bước 4 của luồng: Tiến hành thanh toán */
export async function step4_tienHanhThanhToan(page: Page) {
  await new AppPage(page).thanhToan180000Button.click();
}

/** Bước 5 của luồng: Kiểm tra đơn hàng vừa tạo trong mục đơn hàng */
// Bước quan sát — KHÔNG có assertion sẵn ở đây có chủ ý: điều gì là "đúng" đến từ
// Expected Result của test case, và pass/fail chỉ được đến từ expect() ở spec.
export async function step5_kiemTraDonHangVuaTao(page: Page) {
  // không hành động; spec tự assert theo Expected Result của nó
}
