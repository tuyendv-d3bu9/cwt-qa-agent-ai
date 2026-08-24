# Semantic: So sánh giá trị tiền trong assertion

## Type
Convention (tầng 1 — đúng với MỌI dự án, không riêng dự án nào)

## Content

### Luật: assert SỐ, không assert ĐƠN VỊ

Một giá trị tiền có thể hiển thị bằng rất nhiều cách cho **cùng một số**:

```
150.000 ₫      150.000đ      150.000 VNĐ      150,000       150000      150.000 VND
```

Assert nguyên chuỗi hiển thị là **buộc test biết chuyện trình bày của một dự án cụ thể** — sai
hướng, và vỡ ngay khi UI đổi ký hiệu mà nghiệp vụ không đổi. Đơn vị **không phải** thứ cần kiểm ở
test case nghiệp vụ; con số mới là.

**Đã xảy ra thật** (2026-08-17): test data ghi `10.000đ`, UI hiển thị `10.000 ₫` (dấu cách + `₫`).
Spec assert `getByText('10.000đ')` → **không bao giờ khớp nổi**. Test fail, nhưng sản phẩm **không
sai** — sai ở chỗ assert vào định dạng thay vì vào giá trị. Verifier lại gắn nhãn `UNCLEAR` vì
không có ảnh để phân loại, nên lỗi này còn tiêu tốn thêm một lượt VLM.

### Cách làm

Dùng `agents/runtime/money.js`:

- `parseMoney("150.000 ₫")` → `150000`. Bỏ mọi ký hiệu tiền, mọi dấu phân cách nghìn, mọi khoảng
  trắng (kể cả non-breaking space ` ` mà web hay dùng).
- `sameMoney(a, b)` → so sánh **số**. `sameMoney("150.000 ₫", "150000đ")` là `true`.
- `moneyIn(text)` → mọi số tiền tìm được trong một đoạn text, để tìm giá trị mong đợi trên màn hình
  mà không phụ thuộc cách viết.

Trong `.spec.ts`, assert theo **số**, không theo chuỗi:

```ts
// ĐỪNG: buộc test biết dự án hiển thị đơn vị thế nào
await expect(page.getByText('10.000đ')).toBeVisible();

// NÊN: lấy text thật rồi so số
const total = await page.getByTestId('total').innerText();
expect(parseMoney(total)).toBe(710000);
```

### Ranh giới — khi nào ĐƯỢC assert định dạng

Chỉ khi **chính định dạng là yêu cầu nghiệp vụ đang test** (ví dụ test case "kiểm tra hiển thị tiền
đúng quy ước hiển thị của hệ thống"). Lúc đó định dạng là đối tượng kiểm thử, không phải phương tiện
— và test case phải nói rõ điều đó. Mọi test case khác: so số.

### Không tự chuẩn hoá đơn vị trong tài liệu/test data

Tool chỉ chuẩn hoá lúc **so sánh**. Nó **không** đi sửa `domain-facts.md` hay bảng test case cho
"thống nhất đơn vị" — đó là nội dung của người viết, và việc sửa dữ liệu nguồn để test dễ pass là
đúng thứ `oracle-problem.md` cấm.

## Source
Rút ra từ lần chạy thật 2026-08-17 (TC-D-012 fail vì `10.000đ` vs `10.000 ₫`), và quyết định của
người dùng 2026-08-19: *"tiền VN thì là VNĐ, đừng dùng lung tung nữa. cái đơn vị kệ nó đi"*.

## Node referenced
qa-test-designer, qa-automation, qa-verifier
