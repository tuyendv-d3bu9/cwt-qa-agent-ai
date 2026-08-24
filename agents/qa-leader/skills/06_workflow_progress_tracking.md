# Skill: QA Workflow Progress Tracking

## Purpose
Dùng định kỳ hoặc sau mỗi mốc quan trọng (Milestone/Stage) trong quy trình QA. Skill này tổng hợp trạng thái làm việc của toàn bộ workflow, cập nhật tiến độ các hạng mục tài liệu, trạng thái phê duyệt và cảnh báo rủi ro/blocker nếu có.

## Prompt Type
Template-based

## Variables
- `{{workflow_stage}}`: Giai đoạn hiện tại của QA Workflow (e.g. Input Processing, Analysis, Review, Test Execution).
- `{{completed_items}}`: Các công việc/tài liệu đã hoàn thành.
- `{{pending_items}}`: Các công việc đang thực hiện hoặc chờ xử lý.
- `{{blockers}}`: Các vấn đề mâu thuẫn/thiếu thông tin đang tắc nghẽn (trạng thái ASK/FIX).

## PROMPT
Cập nhật và lập báo cáo tiến độ QA Workflow dựa trên các thông tin `{{workflow_stage}}`, `{{completed_items}}`, `{{pending_items}}`, và `{{blockers}}` theo cấu trúc:

1. **Tổng quan Tiến độ**:
   - Giai đoạn hiện tại của workflow.
   - Phân trăm (%) hoàn thành chung.

2. **Chi tiết trạng thái tài liệu & Công việc**:
   - Danh sách công việc đã PASS.
   - Danh sách công việc đang FIX (Cần QA điều chỉnh).
   - Danh sách công việc đang ASK (Cần BA/DEV làm rõ).

3. **Cảnh báo Rủi ro & Đề xuất**:
   - Ghi nhận các điểm tắc nghẽn ảnh hưởng đến tiến độ dự án.
   - Đề xuất bước xử lý tiếp theo cho QA Leader và team.

## Sample Input
```text
Stage: Reviewing Deliverables
Completed:
- Standardized & classified 6/6 input docs.
- Test Scenarios Login Module: PASS
Pending:
- Test Scenarios Payment Module: FIX (QA_Analyst_01 đang bổ sung API timeout)
Blockers:
- Module OTP SMS: ASK (Chờ BA/DEV chốt scope)
```

## Sample Output
```markdown
### Báo cáo Tiến độ QA Workflow (Workflow Progress Report)

**Giai đoạn hiện tại:** Reviewing Deliverables  
**Tiến độ tổng thể:** 70%  

#### 1. Trạng thái công việc chi tiết:
- [PASS] Chuẩn hóa & phân loại tài liệu đầu vào (6/6 file)
- [PASS] Test Scenarios - Module Login
- [IN-PROGRESS / FIX] Test Scenarios - Module Payment (Đang yêu cầu QA_Analyst_01 bổ sung kịch bản timeout)
- [BLOCKED / ASK] Module OTP SMS (Đang chờ xác nhận từ BA/DEV về scope API)

#### 2. Rủi ro & Tắc nghẽn:
- **Tắc nghẽn:** Module OTP SMS chưa thể thiết kế test case do thiếu thông tin từ BA/DEV.
- **Hành động tiếp theo:** QA Leader đôn đốc QA Manuals nhận câu phản hồi cho các item dạng ASK trong ngày hôm nay.
```

## Quality Check
- **Faithful**: Phản ánh chính xác trạng thái thực tế của các nhiệm vụ trong workflow mà không thêu dệt.
- **Accurate**: Tính toán đúng phần trăm tiến độ và phân loại chính xác trạng thái (PASS/FIX/ASK/IN-PROGRESS).
- **Complete**: Cung cấp bức tranh toàn cảnh về tiến độ, tồn đọng và hành động khắc phục.
- **Traceable**: Trích dẫn đúng tên module và người chịu trách nhiệm cho từng hạng mục.
