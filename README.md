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
- [Agents](#agents) — 7 node
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
                                  .qa-run/deliverables/deliverable-analyst.md
```

**Luồng giao tiếp giữa agents:**
- Leader → Analyst: qua file `.qa-run/deliverables/task-assignment.md`
- Analyst → Leader: qua file `.qa-run/deliverables/deliverable-analyst.md`
- Leader → Human: qua file `.qa-run/deliverables/gap-report.md` (khi cần xác nhận)

---

## Cấu trúc thư mục

```
qa-agent-ai/
├── agents/
│   ├── qa-leader/
│   │   ├── index.js                     # Entry point của Leader
│   │   ├── role.md                      # Định nghĩa vai trò & giới hạn
│   │   ├── skills/
│   │   │   ├── 02_doc_classification.md
│   │   │   ├── 03_info_gap_reporting.md
│   │   │   ├── 04_task_assignment.md
│   │   │   ├── 05_deliverable_review.md
│   │   │   └── 06_workflow_progress_tracking.md
│   │   ├── tools/
│   │   │   └── convert-to-md.js         # Chuyển DOCX/XLSX/PPTX → MD/CSV (không dùng LLM)
│   │   └── knowledge/
│   │       ├── fact-framework.md        # Khung FACT (Faithful/Accurate/Complete/Testable)
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
│   │   ├── llm.js                       # Gọi LLM API + cache
│   │   ├── tools.js                     # Registry file op DUY NHẤT — mọi path động phải đi qua đây (safe())
│   │   ├── db.js                        # Module DUY NHẤT được mở SQLite (knowledge.db + runs.db)
│   │   ├── knowledge.js                 # Interface TẦNG 2 — contextFor() tra cứu deterministic, getConfig() bỏ hardcode
│   │   ├── md-sections.js               # Thay đúng 1 mục `###` trong file tầng 3 (giữ nguyên sửa tay của người)
│   │   ├── handover.js                  # Enforce hợp đồng bàn giao — requireInputs()/verifyProduced()
│   │   ├── node-registry.js             # TỰ DÒ node theo quy ước (thư mục có role.md), KHÔNG theo import.
│   │   │                                # Thêm node mới không phải sửa runner. Kiểm CONTRACT lúc dò.
│   │   ├── yaml-lite.js                 # Parser YAML TẬP CON cho flows/*.flow.yml — zero-dep, TỪ CHỐI
│   │   │                                # mọi cú pháp ngoài tập con thay vì đoán (parse sai = chạy sai thứ tự)
│   │   ├── loop.js                      # runRoundLoop (PASS/FIX/ASK) + runStepLoop (step-decision), dùng chung
│   │   ├── memory.js                    # Checkpoint/session state
│   │   ├── cache.js                     # Cache layer (tránh gọi API trùng)
│   │   ├── mcp-client.js                # MCP client (CÓ CHỦ Ý không nằm trong registry của tools.js)
│   │   └── jira-client.js               # Jira REST client (cũng có chủ ý không nằm trong registry)
│   │
│   ├── qa-architect/                    # Node duy nhất mà SẢN PHẨM của nó là một node khác.
│   │   ├── skills/01_node_spec_writer.md  # LLM viết BẢN KHAI (JSON), từ vựng `reads` bị chặn
│   │   │                                  # theo danh sách export thật trong paths.js
│   │   └── tools/
│   │       ├── node-emitter.js          # Bản khai → index.js/role.md/skill/CONTRACT (DETERMINISTIC).
│   │       │                            # LLM không viết index.js, không chọn đường dẫn.
│   │       └── wiring-check.js          # Cửa gác "test xanh ≠ đã nối dây": sinh xong mà không
│   │                                    # luồng nào gọi thì KHÔNG báo là xong
│   ├── _qa-template/                    # Khung node + contract.md (đặc tả CONTRACT). Bỏ qua khi dò node
│   │                                    # vì tên bắt đầu bằng `_` và vì không có role.md thật.
│   ├── approve.js                       # Script xác nhận thủ công
│   ├── supervise.js                     # Bảng giám sát mọi phiên
│   ├── list-models.js                   # Liệt kê model khả dụng
│   └── testing.js                       # Script kiểm tra kết nối
│
├── qa.js                                # UI TERMINAL — một lệnh duy nhất cần nhớ. Zero-dep (readline).
│
├── flows/                               # THỨ TỰ LUỒNG NẰM Ở ĐÂY, không nằm trong code
│   ├── full.flow.yml                    # TOÀN BÀI: tài liệu → báo cáo. Một lệnh, chạy lại được
│   ├── analyze.flow.yml                 # chỉ phân tích — KHÔNG mở trình duyệt (luồng nên chạy đầu tiên)
│   ├── design.flow.yml                  # tới bảng test case
│   └── verify.flow.yml                  # đã có test-results.json → kết luận + báo cáo
│
├── workflow/                            # 4 file: 2 khung chạy + 1 script bước + tài liệu
│   ├── flow-file.js                     # Đọc + KIỂM TĨNH file luồng (tên node lạ → nổ TRƯỚC khi chạy)
│   ├── flow-runner.js                   # KHUNG CHẠY duy nhất cho mọi luồng
│   ├── leader-analyst.js                # Nửa đầu, gọi bằng một BƯỚC `script:` trong file luồng
│   └── README.md
│
├── project-docs/                        # 📂 ĐẶT TÀI LIỆU DỰ ÁN VÀO ĐÂY (nguồn thô, hiếm đổi)
│   ├── 01_Business/
│   ├── 02_BA/
│   ├── 03_Dev/
│   ├── 04_Design/
│   ├── 05_QA/
│   └── 06_Communication/
│
├── memory/                              # TRI THỨC (commit) — 5 tầng, xem memory/README.md
│   ├── README.md                        # ĐỊNH NGHĨA CHUẨN của lớp memory: 5 tầng + hợp đồng handover.
│   │                                    # Mọi role.md trỏ về đây, không tự định nghĩa lại.
│   ├── semantic/                        # TẦNG 1 — phương pháp luận, đúng với MỌI dự án (commit)
│   │   ├── 06W.md
│   │   ├── fact-framework.md            # Định nghĩa GỐC của khung FACT (node nào cũng nạp bản này)
│   │   └── testing-conventions.md       # Định dạng TC_ID `TC-<F>-<nnn>`, thang Priority test case, 8 trường chuẩn
│   ├── project/                         # TẦNG 2 + 3 — tri thức của dự án hiện tại
│   │   ├── knowledge.db                 # TẦNG 2: thuật ngữ/thành phần/field/config — TRUY VẤN, không nạp cả.
│   │   │                                # Tái tạo được từ tài liệu dự án nên KHÔNG commit (.gitignore: *.db)
│   │   ├── domain-facts.md              # TẦNG 3: đổi thường xuyên, BẠN SỬA TAY ĐƯỢC. Agent chỉ thay đúng
│   │   ├── known-issues.md              #         mục `###` phái sinh từ tài liệu vừa đổi, không ghi đè cả file
│   │   ├── decisions-log.md             #         (git giữ lịch sử — không tự dựng versioning riêng)
│   │   ├── ui-flows.md                  # TẦNG 3: luồng nghiệp vụ, chưng cất từ project-docs/03_DEV/UI-flow.md
│   │   └── manifest.json                # {files: {path: hash}} — hash TỪNG FILE, để biết file nào đã đổi
│
├── tests/
│   ├── pages/                           # CODE DÙNG LẠI — Page Object, sinh deterministic từ registry.
│   │                                    # Locator do Playwright sinh — LLM không viết dòng nào. VẪN COMMIT.
│   ├── steps/                           # Thư viện step của từng luồng. Viết 1 lần, 21 test case cùng gọi.
│   ├── run-unit.mjs                     # npm run test:unit — 18 bộ, mỗi bộ MỘT tiến trình riêng
│   └── unit/                            # 411 test. KHÔNG gọi LLM, KHÔNG gọi MCP thật → chạy offline.
│                                        # Trước P8 chúng nằm trong thư mục TẠM và mất theo phiên làm việc.
│
├── .qa-run/                             # TẦNG 4 + 5 — SẢN PHẨM 1 lần chạy, xoá tự do (gitignore: .qa-run/)
│   ├── runs.db                          # TẦNG 5: phiên chạy + cửa duyệt người + lịch sử NHIỀU run
│   │                                    # (thay hẳn workflow.json cũ — file JSON chỉ giữ được 1 run)
│   ├── deliverables/                    # task-assignment, gap-report, deliverable-*, ui-conventions,
│   │                                    # ui-elements.json (registry), test-results.json, supervision.md
│   ├── features/                        # .feature — nguồn sự thật của luồng, do LLM viết
│   ├── tests/                           # .spec.ts SINH RA từ .feature (deterministic) + data/
│   ├── evidence/                        # CHỈ ảnh before/after do spec tự chụp
│   ├── artifacts/                       # artifact của Playwright: trace.zip, error-context.md
│   ├── reports/                         # 7 loại report của qa-reporter
│   ├── mcp/                             # output riêng của @playwright/mcp (--output-dir)
│   └── cache/                           # cache LLM
│
├── .env                                 # API key (không commit)
├── .env.example
└── package.json
```

> **3 ranh giới, không phải 2.** `memory/` = tri thức (commit) · `tests/steps|pages/` = **code dùng
> lại** (commit) · `.qa-run/` = sản phẩm (gitignore). `tests/` được sinh tự động nhưng vẫn commit vì
> đó là thứ viết một lần rồi mọi test case cùng gọi — gitignore nó là bỏ mất đúng nửa dùng lại được.
>
> Mọi đường dẫn trên khai **một chỗ duy nhất**: `agents/runtime/paths.js`. `playwright.config.ts`
> cũng import từ đó, để runner và agent không thể bất đồng về vị trí `test-results.json`.

---

## Cài đặt

**Yêu cầu:** Node.js **>= 22.5** (ES Modules + `node:sqlite` built-in)

> Bản `node:sqlite` dùng cho tầng 2/5 của lớp memory là built-in từ Node 22.5, nên repo **không cần thêm dependency nào** và không cần build native module. Khi chạy sẽ thấy dòng `ExperimentalWarning: SQLite is an experimental feature` — **bình thường**, không tắt có chủ ý: tắt đi là che mất cảnh báo API có thể đổi ở bản Node sau.

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

### Một lệnh duy nhất cần nhớ

```bash
node qa.js
```

Menu terminal, không cần nhớ lệnh nào khác. Các lệnh con dùng được trực tiếp:

| Lệnh | Làm gì |
|---|---|
| `node qa.js flows` | liệt kê luồng đang có + lệnh chạy từng luồng |
| `node qa.js nodes` | liệt kê node, hợp đồng vào/ra của từng node, **và node nào đang hỏng** |
| `node qa.js next` | bước nào đang chờ ai — trả lời câu "giờ tôi làm gì tiếp" |
| `node qa.js run <luồng> [đối số]` | chạy một luồng |
| `node qa.js approve <node> "<tên>"` | duyệt một bước (cửa Human-Final) |
| `node qa.js watch` | bảng giám sát MỌI phiên |
| `node qa.js new "<mô tả>"` | **sinh một node mới từ mô tả** (`--dry-run` để xem trước) |
| `npm run test:unit` | 18 bộ test, không gọi LLM, chạy offline |

`node agents/approve.js` và `node agents/supervise.js` vẫn chạy nguyên — chúng gọi đúng cùng
một đường code với `qa.js`, không có hành vi nào tồn tại hai bản. Hai script điều phối đánh số
`flow-2`/`flow-3` đã bị bỏ: thứ tự luồng giờ nằm trong `flows/*.flow.yml`.

### Luồng nằm ở đâu

Thứ tự các node **không** nằm trong code. Nó nằm trong `flows/*.flow.yml`:

```yaml
steps:
  - node: qa-verifier
    wait_for_file: TEST_RESULTS          # dừng chờ người/CI chạy playwright
    wait_for_hint: npx playwright test --reporter=json
    gate: qa-automation                  # cần người duyệt bước trước
    branch_on: verdict
    branch:
      - value: PASS
        action: continue
      - value: FIX
        action: rework
        rework_node: qa-automation
```

`workflow/flow-runner.js` đọc file đó và gọi node qua `CONTRACT` — **thêm node mới không cần
sửa dòng code nào trong runner**. Luồng nào thật sự đặc thù (như vòng hỏi–đáp của
`leader-analyst`) thì vẫn là script, khai `type: script` để `qa.js` liệt kê được.

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
# Lần đầu nên chạy luồng này: KHÔNG mở trình duyệt, không gọi MCP
node qa.js run analyze "Phân tích Feature X - Voucher Checkout"

# Toàn bài (tài liệu → báo cáo) — một lệnh, chạy lại được
node qa.js run full "Phân tích Feature X - Voucher Checkout" --confirm-mcp
```

### Bước 3 — Xử lý khi cần xác nhận (nếu có gap)

Nếu Leader phát hiện thông tin thiếu/mâu thuẫn, nó sẽ dừng và trả về:

```json
{
  "status": "waiting_input",
  "data": { "formPath": ".qa-run/deliverables/gap-report.md" }
}
```

**Hành động:**
1. Mở file `.qa-run/deliverables/gap-report.md`
2. Điền câu trả lời ngay bên dưới mỗi câu hỏi
3. Lưu file
4. Chạy lại **đúng lệnh trên** — runner tự phát hiện và tiếp tục

### Bước 4 — Xem kết quả

```bash
# Kết quả phân tích của Analyst
cat .qa-run/deliverables/deliverable-analyst.md

# Tiến độ workflow
cat .qa-run/deliverables/progress-report.md
```

---

## Workflow chi tiết

```
[Human] node qa.js run analyze "Task"
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
                         │  (full analysis)     │  → ghi deliverable-analyst.md
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

7 node, mỗi node một thư mục `agents/<tên>/`. Xem hợp đồng vào/ra của từng node bằng
`node qa.js nodes` — đó là **registry thật**, đọc từ `CONTRACT` trong code, nên nó không thể
lệch khỏi thực tế như một bảng trong README.

| Node | Việc | Vào → Ra |
|---|---|---|
| `qa-leader` | Chuẩn hoá + phân loại tài liệu, chưng cất tri thức, hỏi lại chỗ thiếu, giao việc, review theo FACT, giám sát mọi phiên | `project-docs/` → `task-assignment.md` |
| `qa-analyst` | Requirement Summary, missing rule (06W), viewpoint + test idea | `task-assignment.md` → `deliverable-analyst.md` |
| `qa-test-designer` | Test case 8 trường, boundary, coverage — Steps bám luồng thật | `+ deliverable-analyst.md` → `deliverable-test-designer.md` |
| `qa-automation` | Đi luồng bằng MCP, Playwright sinh locator, sinh Page Object + step library + `.feature` → `.spec.ts` | `deliverable-test-designer.md` → `.qa-run/tests/*.spec.ts` |
| `qa-verifier` | Ghép 2 kênh (assertion + ảnh) → nhãn từng test, verdict PASS/FIX/ASK **deterministic** | `test-results.json` → `deliverable-verifier.md` |
| `qa-reporter` | 7 loại report (bug, daily, sprint, release, RCA, communication, narrative) | `deliverable-verifier.md` → `.qa-run/reports/` |
| `qa-architect` | **Sinh một node mới từ mô tả.** LLM viết bản khai; code sinh `index.js`/`CONTRACT`/`role.md` | mô tả → `agents/<tên mới>/` |

Hai node dưới đây được mô tả kỹ vì chúng là phần của bài học; các node còn lại xem `role.md`
trong thư mục của chúng.

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
- Không ghi đè `deliverable-analyst.md` (chỉ Analyst được ghi)

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
| Phiên chạy + cửa duyệt | `.qa-run/runs.db` | Xóa để restart toàn bộ workflow (mất luôn lịch sử các run trước) |
| Task assignment | `.qa-run/deliverables/task-assignment.md` | Xóa để giao task mới |
| Deliverable | `.qa-run/deliverables/deliverable-analyst.md` | Output của Analyst — xóa để chạy lại |
| Gap report | `.qa-run/deliverables/gap-report.md` | Xóa để bỏ qua form cũ, bắt đầu gap check mới |
| Progress | `.qa-run/deliverables/progress-report.md` | Xóa tự do |
| Cache API | `.qa-run/cache/` | Xóa tự do — chỉ tốn quota khi không có cache |

> **Tip:** Xóa `.qa-run/` để reset hoàn toàn (mất cả lịch sử run). Xóa chỉ `.qa-run/cache/` để bắt buộc gọi API thật.

---

## Scripts hữu ích

```bash
# Xem danh sách model Gemini khả dụng
npm run models

# Kiểm tra kết nối API
node agents/testing.js

# Chạy luồng (menu: chỉ cần `node qa.js`)
node qa.js run analyze "Tên task của bạn"

# Xem kết quả phân tích
cat .qa-run/deliverables/deliverable-analyst.md

# Xem tiến độ
cat .qa-run/deliverables/progress-report.md

# Xem gap report (nếu có)
cat .qa-run/deliverables/gap-report.md
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
cat .qa-run/deliverables/gap-report.md

# Điền câu trả lời vào file, sau đó chạy lại ĐÚNG lệnh cũ
node qa.js run analyze "Task name"
```

**Muốn bắt đầu lại từ đầu**
```bash
rm -rf .qa-run/
node qa.js run analyze "Task name" --new-run
```

**Cache cũ cho kết quả sai**
```bash
rm -rf .qa-run/cache/
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
| `@playwright/mcp` | MCP server thật (`agents/runtime/mcp-client.js` gọi qua `npx @playwright/mcp`, resolve từ `node_modules` local, không fetch `@latest` qua mạng mỗi lần) |
| `@playwright/test` | Test runner cho `.spec.ts` do `qa-automation` sinh ra (`npm run test:e2e`, cấu hình tại `playwright.config.ts`) |

---

## Liên quan

- [Google AI Studio](https://aistudio.google.com) — lấy API key
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- [workflow/README.md](./workflow/README.md) — hướng dẫn chi tiết các flow