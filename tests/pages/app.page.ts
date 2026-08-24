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

  /** button "Cửa hàng" */
  get cuaHangButton(): Locator { return this.page.getByRole('button', { name: 'Cửa hàng' }); }

  /** button "Thanh toán" */
  get thanhToanButton(): Locator { return this.page.getByRole('button', { name: 'Thanh toán' }); }

  /** button "Đơn hàng" */
  get donHangButton(): Locator { return this.page.getByRole('button', { name: 'Đơn hàng' }); }

  /** button "Test nhanh GIAM50K" */
  get testNhanhGiam50kButton(): Locator { return this.page.getByRole('button', { name: 'Test nhanh GIAM50K' }); }

  /** button "Test nhanh SALE20" */
  get testNhanhSale20Button(): Locator { return this.page.getByRole('button', { name: 'Test nhanh SALE20' }); }

  /** button "Tất cả" */
  get tatCaButton(): Locator { return this.page.getByRole('button', { name: 'Tất cả' }); }

  /** button "Thời trang" */
  get thoiTrangButton(): Locator { return this.page.getByRole('button', { name: 'Thời trang' }); }

  /** button "Công nghệ" */
  get congNgheButton(): Locator { return this.page.getByRole('button', { name: 'Công nghệ' }); }

  /** button "Gia dụng" */
  get giaDungButton(): Locator { return this.page.getByRole('button', { name: 'Gia dụng' }); }

  /** textbox "Tìm kiếm sản phẩm..." */
  get timKiemSanPhamInput(): Locator { return this.page.getByRole('textbox', { name: 'Tìm kiếm sản phẩm...' }); }

  /** button "Thêm vào giỏ" */
  get themVaoGioButton(): Locator { return this.page.locator('#btn-add-prod-001'); }

  /** link "Dashboard" */
  get dashboardLink(): Locator { return this.page.getByRole('link', { name: 'Dashboard' }); }

  /** link "Test Cases" */
  get testCasesLink(): Locator { return this.page.getByRole('link', { name: 'Test Cases' }); }

  /** link "Bug Reports" */
  get bugReportsLink(): Locator { return this.page.getByRole('link', { name: 'Bug Reports' }); }

  /** link "Documentation" */
  get documentationLink(): Locator { return this.page.getByRole('link', { name: 'Documentation' }); }

  /** button "Thanh toán 1" */
  get thanhToan1Button(): Locator { return this.page.getByRole('button', { name: 'Thanh toán' }); }

  /** button "Đã thêm (x1)" */
  get daThemX1Button(): Locator { return this.page.getByRole('button', { name: 'Đã thêm (x1)' }); }

  /** button "Quay lại Cửa hàng" */
  get quayLaiCuaHangButton(): Locator { return this.page.getByRole('button', { name: 'Quay lại Cửa hàng' }); }

  /** button "Xóa khỏi giỏ hàng" */
  get xoaKhoiGioHangButton(): Locator { return this.page.getByRole('button', { name: 'Xóa khỏi giỏ hàng' }); }

  /** textbox "Nhập số lượng tự do để thử nghiệm kiểm thử hộp đen (biên âm, rỗng, chữ...)" */
  get nhapSoLuongTuDoDeThuNghiemKiemThuHopDenBienAmRongChuInput(): Locator { return this.page.getByRole('textbox', { name: 'Nhập số lượng tự do để thử' }); }

  /** textbox "Nhập mã (GIAM50K, SALE20...)" */
  get nhapMaGiam50kSale20Input(): Locator { return this.page.getByRole('textbox', { name: 'Nhập mã (GIAM50K, SALE20...)' }); }

  /** button "Áp dụng" */
  get apDungButton(): Locator { return this.page.getByRole('button', { name: 'Áp dụng' }); }

  /** button "GIAM50K Giảm ngay 50.000 ₫ cho đơn hàng tối thiểu từ 200.000 ₫. Nạp mã →" */
  get giam50kGiamNgay50000ChoDonHangToiThieuTu200000NapMaButton(): Locator { return this.page.getByRole('button', { name: 'GIAM50K Giảm ngay 50.000 ₫' }); }

  /** button "SALE20 Giảm 20% giá trị đơn hàng cho đơn từ 300.000 ₫ (Giảm tối đa 100.000 ₫). Nạp mã →" */
  get sale20Giam20GiaTriDonHangChoDonTu300000GiamToiDa100000NapMaButton(): Locator { return this.page.getByRole('button', { name: 'SALE20 Giảm 20% giá trị đơn h' }); }

  /** button "HETHAN Mã giảm giá đã hết hạn sử dụng. Nạp mã →" */
  get hethanMaGiamGiaDaHetHanSuDungNapMaButton(): Locator { return this.page.getByRole('button', { name: 'HETHAN Mã giảm giá đã hết hạn' }); }

  /** button "Thanh toán (180.000 ₫)" */
  get thanhToan180000Button(): Locator { return this.page.getByRole('button', { name: 'Thanh toán (180.000 ₫)' }); }

}
