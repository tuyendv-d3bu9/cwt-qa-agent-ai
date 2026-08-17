# Knowledge: Viewpoint Library

## Type
QA Risk Analysis Framework

## Content

QA Analyst có 8 viewpoint:

| Viewpoint | Focus |
|---|---|
| **Happy Path** | Luồng chính và expected result |
| **Negative** | Invalid input/action và rejection |
| **Boundary** | Limit, threshold, min/max, state transition |
| **Security** | Authentication, authorization, data exposure, tampering |
| **UX / Usability** | Validation, message, state, recovery |
| **Performance** | Load, volume, concurrency, timeout |
| **Accessibility** | Keyboard, focus, label, semantic behavior |
| **Integration** | API, service, DB, module dependency, failure propagation |

## Viewpoint Selection

Viewpoint được ưu tiên theo:

**Business Impact × Likelihood × Detectability**

### Business Impact
Lỗi có thể ảnh hưởng đến:

1. Tiền / giá / thanh toán.
2. Đơn hàng / transaction.
3. Dữ liệu.
4. Quyền lợi khách hàng.
5. Security / quyền truy cập.
6. Core business flow.

### Likelihood
Xem xét:

- Complexity.
- Nhiều business rule.
- Dependency.
- Thay đổi gần đây.
- Requirement ambiguity.
- Missing documentation.

### Detectability
Ưu tiên các risk:

- Không phát hiện được bằng happy path.
- Có khả năng lọt production.
- Chỉ xảy ra ở edge case.
- Phụ thuộc integration hoặc timing.

## Rule

Không mặc định chọn cùng một nhóm viewpoint cho mọi task.

Không cần sử dụng cả 8 viewpoint.
