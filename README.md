# QA Agent AI — Practical AI for Manual Testers

> Hệ thống AI agent hỗ trợ QA Manual phân tích tài liệu requirement, phát hiện thiếu sót và sinh test idea — **không thay thế tester, chỉ tăng tốc công việc**.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Kiến trúc](#kiến-trúc)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Cách chạy](#cách-chạy)
- [Workflow chi tiết](#workflow-chi-tiết)
- [Agents](#agents)
  - [QA Leader](#qa-leader)
  - [QA Analyst](#qa-analyst)
- [State & Memory](#state--memory)
- [Scripts hữu ích](#scripts-hữu-ích)
- [Flags tùy chọn](#flags-tùy-chọn)
- [Giới hạn hệ thống](#giới-hạn-hệ-thống)
- [Troubleshooting](#troubleshooting)
- [Công nghệ](#công-nghệ)

---

## Tổng quan

**QA Agent AI** là một hệ thống multi-agent chạy trên Node.js, sử dụng **Google Gemini API** để tự động hóa một phần quy trình QA:

| Làm trong bài hiện tại                           | Các bài tiếp theo                    |
| ------------------------------------------------ | --------------------------------------------- |
| ✅ Chuẩn hóa tài liệu (DOCX, XLSX, PPTX → MD/CSV) | ⏭️ Sinh test case (`.spec.ts`, `.feature`)    |
| ✅ Phân loại tài liệu vào 6 thư mục chuẩn         | ⏭️ Chạy Playwright tự động                    |
| ✅ Phát hiện gap / mâu thuẫn thông tin            | ⏭️ Ghi kết quả vào thư mục `outputs/`         |
| ✅ Sinh Requirement Summary (7 phần)              | ⏭️ Xử lý / quyết định khi thông tin mâu thuẫn |
| ✅ Tìm Missing Business Rules (6W)                | ⏭️ Xây dựng AI Reporter                       |
| ✅ Sinh Viewpoints & ≥ 20 Test Ideas              |                                               |
| ✅ Review deliverable theo khung FACT             |                                               |

---

## Kiến trúc

```
                         ┌──────────────────────┐
                         │   workflow/flow-*.js │  ← entry point
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │    QA Leader Agent   │  ← coordinator
                         │  agents/qa-leader/   │
                         └──┬──────────────┬────┘
                            │              │
               ┌────────────▼──┐    ┌──────▼─────────────┐
               │  6 Skills     │    │  QA Analyst Agent  │
               │ (01→06)       │    │ agents/qa-analyst/ │
               └───────────────┘    └──────┬─────────────┘
                                           │
                                    ┌──────▼─────────────┐
                                    │  4 Skills (01→04)  │
                                    └────────────────────┘
                                           │
                                  .state/deliverable.md
```

**Luồng giao tiếp giữa agents:**
- Leader → Analyst: qua file `.state/task-assignment.md`
- Analyst → Leader: qua file `.state/deliverable.md`
- Leader → Human: qua file `.state/gap-report.md` (khi cần xác nhận)

---

## Cấu trúc thư mục

```
qa-agent-ai/
├── agents/
│   ├── qa-leader/
│   │   ├── index.js                     # Entry point của Leader
│   │   ├── role.md                      # Định nghĩa vai trò & giới hạn
│   │   ├── skills/
│   │   │   ├── 01_doc_convert_inspect.md
│   │   │   ├── 02_doc_classification.md
│   │   │   ├── 03_info_gap_reporting.md
│   │   │   ├── 04_task_assignment.md
│   │   │   ├── 05_deliverable_review.md
│   │   │   └── 06_workflow_progress_tracking.md
│   │   ├── tools/
│   │   │   └── convert-to-md.js         # Chuyển DOCX/XLSX/PPTX → MD/CSV (không dùng LLM)
│   │   └── knowledge/
│   │       ├── fact-framework.md        # Khung FACT (Faithful/Accurate/Complete/Traceable)
│   │       └── task-management-conventions.md
│   │
│   ├── qa-analyst/
│   │   ├── index.js                     # Entry point của Analyst
│   │   ├── role.md                      # Định nghĩa vai trò & giới hạn
│   │   ├── skill/
│   │   │   ├── 01_requirement_summary.md
│   │   │   ├── 02_missing_rule_finder.md
│   │   │   ├── 03_viewpoint_and_testidea.md
│   │   │   └── 04_revise_on_feedback.md
│   │   ├── tools/
│   │   │   └── count-check.js           # Đếm deterministic output (không dùng LLM)
│   │   └── knowledge/
│   │       ├── fact-framework.md
│   │       └── requirement-analysis-conventions.md
│   │
│   ├── runtime/                         # Core runtime dùng chung
│   │   ├── llm.js                       # Gọi Gemini API + cache
│   │   ├── tools.js                     # Tool dispatcher (read/write file, list files)
│   │   ├── loop.js                      # Agent loop
│   │   ├── memory.js                    # Working memory
│   │   ├── cache.js                     # Cache layer (tránh gọi API trùng)
│   │   └── mcp-client.js               # MCP client
│   │
│   ├── approve.js                       # Script xác nhận thủ công
│   ├── list-models.js                   # Liệt kê model khả dụng
│   └── testing.js                       # Script kiểm tra kết nối
│
├── workflow/
│   ├── flow-2-leader-analyst.js         # Luồng chính: Leader + Analyst
│   ├── flow_qa-leader.js                # Luồng Leader đơn độc
│   └── README.md
│
├── project-docs/                        # 📂 ĐẶT TÀI LIỆU DỰ ÁN VÀO ĐÂY
│   ├── 01_Business/
│   ├── 02_BA/
│   ├── 03_Dev/
│   ├── 04_Design/
│   ├── 05_QA/
│   └── 06_Communication/
│
├── shared/                              # Kiến thức dùng chung giữa các agent
│
├── .state/                              # Trạng thái workflow (tự sinh, có thể xóa)
│   ├── workflow.json
│   ├── task-assignment.md
│   ├── deliverable.md
│   ├── gap-report.md
│   ├── progress-report.md
│   └── cache/
│
├── .env                                 # API key (không commit)
├── .env.example
└── package.json
```

---

## Cài đặt

**Yêu cầu:** Node.js >= 18 (ES Modules)

```bash
# 1. Clone repo
git clone <repo-url>
cd qa-agent-ai

# 2. Cài dependencies
npm install

# 3. Tạo file .env từ template
cp .env.example .env
```

---

## Cấu hình

Mở file `.env` và điền thông tin:

```env
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash
```

> **Lấy API key:** Truy cập https://aistudio.google.com/apikey

**Kiểm tra kết nối:**

```bash
# Xem các model khả dụng
npm run models

# Kiểm tra kết nối API
node agents/testing.js
```

---

## Cách chạy

### Bước 1 — Đặt tài liệu vào `project-docs/`

```
project-docs/
├── BRD-Feature-X.docx
├── Sprint-Planning.xlsx
├── UI-mockup.pptx
└── ...
```

Hỗ trợ định dạng: `.docx`, `.xlsx`, `.pptx`, `.md`, `.csv`

### Bước 2 — Chạy workflow

```bash
node workflow/flow-2-leader-analyst.js "Phân tích Feature X - Voucher Checkout"
```

### Bước 3 — Xử lý khi cần xác nhận (nếu có gap)

Nếu Leader phát hiện thông tin thiếu/mâu thuẫn, nó sẽ dừng và trả về:

```json
{
  "status": "waiting_input",
  "data": { "formPath": ".state/gap-report.md" }
}
```

**Hành động:**
1. Mở file `.state/gap-report.md`
2. Điền câu trả lời ngay bên dưới mỗi câu hỏi
3. Lưu file
4. Chạy lại **đúng lệnh trên** — runner tự phát hiện và tiếp tục

### Bước 4 — Xem kết quả

```bash
# Kết quả phân tích của Analyst
cat .state/deliverable.md

# Tiến độ workflow
cat .state/progress-report.md
```

---

## Workflow chi tiết

```
[Human] node workflow/flow-2-leader-analyst.js "Task"
                         │
                         ▼
              ┌──────────────────────┐
              │  QA Leader — Step 1  │  Skill 01: Chuyển DOCX/XLSX/PPTX → MD/CSV
              │  (convert_inspect)   │  (deterministic, không dùng LLM)
              └──────────┬───────────┘
                         │
              ┌──────────▼───────────┐
              │  QA Leader — Step 2  │  Skill 02: Phân loại file vào 6 thư mục
              │  (classify)          │
              └──────────┬───────────┘
                         │
              ┌──────────▼───────────┐
              │  QA Leader — Step 3  │  Skill 03: Kiểm tra gap / mâu thuẫn
              │  (gap check)         │
              └──────────┬───────────┘
                         │
               ┌─────────┴──────────┐
          hasGap?                 noGap
               │                    │
               ▼                    ▼
     ⏸ waiting_input    ┌──────────────────────┐
    [Human fills form]   │  QA Leader — Step 4  │  Skill 04: Sinh task-assignment.md
                         │  (assign task)       │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   QA Analyst Run     │  Skill 01→03 (hoặc 04 nếu FIX)
                         │  (full analysis)     │  → ghi deliverable.md
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │  QA Leader — Step 5  │  Skill 05: Review theo FACT
                         │  (review)            │  → Verdict: PASS / FIX / ASK
                         └──────────┬───────────┘
                                    │
                  ┌─────────────────┼──────────────────┐
                PASS               FIX                ASK
                  │                 │                  │
                  ▼                 ▼                  ▼
              ✅ Done       Append feedback    ⏸ waiting_input
                           to task-assignment  [Human clarifies]
                           → Analyst re-runs
                           (max 3 rounds)
```

---

## Agents

### QA Leader

**File:** `agents/qa-leader/index.js`

Agent điều phối toàn bộ workflow. Có 6 skill tuần tự:

| # | Skill | Mô tả |
|---|---|---|
| 01 | `doc_convert_inspect` | Chuyển DOCX/XLSX/PPTX → MD/CSV bằng thư viện, không dùng LLM |
| 02 | `doc_classification` | Phân loại file vào đúng 1 trong 6 thư mục chuẩn |
| 03 | `info_gap_reporting` | Đối soát chéo tài liệu, phát hiện gap/mâu thuẫn |
| 04 | `task_assignment` | Sinh file `task-assignment.md` cho Analyst |
| 05 | `deliverable_review` | Review deliverable theo khung FACT → PASS/FIX/ASK |
| 06 | `workflow_progress_tracking` | Cập nhật tiến độ sau mỗi milestone |

**Tool riêng:** `convert-to-md.js` — dùng `mammoth` (DOCX), `xlsx` (Excel), `officeparser` (PPTX)

**Giới hạn:**
- Không tự sửa/thêm nội dung tài liệu
- Không tự quyết khi thông tin mâu thuẫn → luôn tạo gap report hỏi người dùng
- Không ghi đè `deliverable.md` (chỉ Analyst được ghi)

---

### QA Analyst

**File:** `agents/qa-analyst/index.js`

Agent phân tích tài liệu, nhận task qua `task-assignment.md`. Có 4 skill:

| # | Skill | Mô tả | Dùng khi |
|---|---|---|---|
| 01 | `requirement_summary` | Tóm tắt requirement theo 7 phần | Lần chạy đầu tiên |
| 02 | `missing_rule_finder` | Tìm missing business rule bằng 6W | Sau skill 01 |
| 03 | `viewpoint_and_testidea` | Sinh 4 viewpoint + >=20 test idea | Sau skill 02 |
| 04 | `revise_on_feedback` | Chỉ sửa đúng điểm Leader chỉ ra | Khi có feedback FIX |

**Tool riêng:** `count-check.js` — đếm số missing rule / viewpoint / test idea (deterministic, không dùng LLM)

**Tag `[GIẢ ĐỊNH]`:** Mọi thông tin không có trong tài liệu nhưng cần giả định để tiếp tục phải được gắn tag này.

**Giới hạn:**
- Không tự quyết nguồn tài liệu nào "đúng hơn" → đưa vào OPEN QUESTIONS
- Không bịa business rule (no hallucination)
- Không ghi đè `task-assignment.md`

---

## State & Memory

| Layer | Vị trí | Có thể xóa? |
|---|---|---|
| Working memory | RAM, `contents` array | Tự mất khi run kết thúc |
| Workflow state | `.state/workflow.json` | Xóa để restart toàn bộ workflow |
| Task assignment | `.state/task-assignment.md` | Xóa để giao task mới |
| Deliverable | `.state/deliverable.md` | Output của Analyst — xóa để chạy lại |
| Gap report | `.state/gap-report.md` | Xóa để bỏ qua form cũ, bắt đầu gap check mới |
| Progress | `.state/progress-report.md` | Xóa tự do |
| Cache API | `.state/cache/` | Xóa tự do — chỉ tốn quota khi không có cache |

> **Tip:** Xóa `.state/` để reset hoàn toàn. Xóa chỉ `.state/cache/` để bắt buộc gọi API thật.

---

## Scripts hữu ích

```bash
# Xem danh sách model Gemini khả dụng
npm run models

# Kiểm tra kết nối API
node agents/testing.js

# Chạy luồng chính (Leader + Analyst)
node workflow/flow-2-leader-analyst.js "Tên task của bạn"

# Chạy luồng Leader đơn độc
node workflow/flow_qa-leader.js "Tên task"

# Xem kết quả phân tích
cat .state/deliverable.md

# Xem tiến độ
cat .state/progress-report.md

# Xem gap report (nếu có)
cat .state/gap-report.md
```

---

## Flags tùy chọn

| Flag | Mô tả |
|---|---|
| `--no-cache` | Bỏ qua cache, gọi API thật (tốn quota) |
| `--show` | Mở browser khi dùng explorer |

---

## Giới hạn hệ thống

- **MAX_ROUNDS = 3**: Nếu sau 3 vòng FIX mà Analyst vẫn chưa PASS, hệ thống dừng và yêu cầu human review.
- **Không sinh test case**: Hệ thống chỉ sinh **test idea** (ý tưởng kiểm thử), không sinh file spec Playwright/Cucumber.
- **Không chạy Playwright**: Không tự động hóa test execution.
- **Tài liệu phải có trước**: `project-docs/` phải có ít nhất 1 file trước khi chạy.

---

## Troubleshooting

**`GEMINI_API_KEY is missing`**
```bash
cp .env.example .env
# Paste API key vào .env
```

**`project-docs/ is empty`**
```
Đặt ít nhất 1 tài liệu vào thư mục project-docs/ trước khi chạy.
```

**Workflow bị stuck ở `waiting_input`**
```bash
# Kiểm tra file gap report
cat .state/gap-report.md

# Điền câu trả lời vào file, sau đó chạy lại
node workflow/flow-2-leader-analyst.js "Task name"
```

**Muốn bắt đầu lại từ đầu**
```bash
rm -rf .state/
node workflow/flow-2-leader-analyst.js "Task name"
```

**Cache cũ cho kết quả sai**
```bash
rm -rf .state/cache/
# Chạy lại — sẽ gọi API thật
```

---

## Công nghệ

| Thư viện | Mục đích |
|---|---|
| `@google/genai` | Gọi Google Gemini API |
| `mammoth` | Chuyển DOCX → Markdown |
| `xlsx` | Đọc/chuyển file Excel |
| `officeparser` | Chuyển PPTX → text |
| `dotenv` | Đọc biến môi trường từ `.env` |
| `playwright` | (Dự phòng) tự động hóa browser |
| `@modelcontextprotocol/sdk` | MCP client cho tools |

---

## Liên quan

- [Google AI Studio](https://aistudio.google.com) — lấy API key
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- [workflow/README.md](./workflow/README.md) — hướng dẫn chi tiết các flow