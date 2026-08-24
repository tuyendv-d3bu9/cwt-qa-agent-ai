# Knowledge: Audience Tone

## Type
Convention

## Content

Áp dụng cho mọi report có nhiều audience (hiện tại: Daily QA Summary — Dev/PM; QA Communication — từng template có audience riêng, xem `skills/06_qa_communication_writer.md`).

### Dev
Chi tiết kỹ thuật, nguyên nhân, module/file bị ảnh hưởng. Không cần rút gọn thuật ngữ kỹ thuật.

### PM / Stakeholder / Business
Tập trung vào impact, ETA, workaround. TRÁNH thuật ngữ kỹ thuật (selector, assertion, stack trace, TC_ID nội bộ...). Diễn đạt theo ảnh hưởng nghiệp vụ, không theo chi tiết implementation.

### Rule
- Cùng 1 nguồn dữ liệu (test result, bug list) nhưng viết 2 bản khác nhau theo audience — KHÔNG chỉ đổi vài từ, phải đổi cả mức độ chi tiết và trọng tâm.
- Không được trộn giọng văn (không viết bản PM nhưng vẫn chèn thuật ngữ kỹ thuật, hoặc ngược lại).

## Source
Giáo trình QA Agent Reporter, Mục 2 — Daily QA Summary (do người dùng cung cấp trực tiếp, 2026-08-14).

## Node referenced
qa-reporter
