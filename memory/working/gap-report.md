### Báo cáo Thông tin cần Bổ sung & Làm rõ (Clarification Report)

**Người nhận:** QA Manuals  
**Ngày lập:** 2024-05-22  

| STT | Loại vấn đề | Mô tả mâu thuẫn / Thiếu hụt | Nguồn trích dẫn | Câu hỏi làm rõ cho BA/DEV |
|-----|-------------|----------------------------|-----------------|--------------------------|
| 1 | Mâu thuẫn phiên bản | Tồn tại 2 phiên bản BRD (v1.0 và v1.2) với nội dung có thể khác biệt. | `02_BA/BRD-Promotion-v1.0.md` vs `02_BA/BRD-Promotion-v1.2.md` | Phiên bản nào là bản chính thức để QA thực hiện test case? |
| 2 | Mâu thuẫn logic | Chat log thảo luận về thay đổi logic checkout nhưng chưa thấy cập nhật trong tài liệu kỹ thuật. | `06_Communication/Chat-shopgo-checkout.md` vs `03_DEV/API-spec-voucher-checkout.md` | Các thay đổi trong chat đã được chốt để cập nhật vào API spec chưa? |
| 3 | Thiếu hụt thông tin | CR-005 đề cập đến thay đổi yêu cầu nhưng chưa có tài liệu BA tương ứng cập nhật. | `06_Communication/CR-005-Mail-thread.md` | CR-005 đã được phê duyệt và cập nhật vào tài liệu nghiệp vụ chưa? |

**Khuyến nghị:** Cần QA Manuals xác nhận phiên bản tài liệu chuẩn (Source of Truth) trước khi phân công QA Analyst thực hiện phân tích.