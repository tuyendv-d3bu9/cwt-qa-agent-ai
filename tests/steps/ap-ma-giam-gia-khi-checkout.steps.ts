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

/** Bước 5 của luồng: Kiểm tra đơn hàng vừa tạo trong mục đơn hàng */
// Bước quan sát — KHÔNG có assertion sẵn ở đây có chủ ý: điều gì là "đúng" đến từ
// Expected Result của test case, và pass/fail chỉ được đến từ expect() ở spec.
export async function step5_kiemTraDonHangVuaTao(page: Page) {
  // không hành động; spec tự assert theo Expected Result của nó
}

// ── CHƯA CÓ STEP CHO CÁC BƯỚC SAU ──────────────────────────────
// Không sinh hàm rỗng cho chúng: một hàm rỗng sẽ được spec gọi và "thành công" mà
// không làm gì, biến một bước bị bỏ qua thành một test xanh giả.
//   bước 1: Ở trang chủ, thêm một sản phẩm bất kỳ vào giỏ hàng  →  Page Object không có accessor cho button "Thêm vào giỏ"
//   bước 2: Mở trang thanh toán / giỏ hàng  →  Page Object không có accessor cho button "Thanh toán"
//   bước 3: Nhập mã giảm giá vào ô nhập mã rồi áp dụng  →  đi luồng chưa tới bước này
//   bước 4: Tiến hành thanh toán  →  đi luồng chưa tới bước này
// Cách sửa: explore lại để đi được tới các bước đó (xem .qa-run/deliverables/exploratory-findings.md).
