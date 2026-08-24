# Kiến trúc lớp Memory

Đây là **định nghĩa chuẩn duy nhất** về lớp memory của hệ multi-agent này. Mọi `role.md` phải **trỏ về file này**, không tự định nghĩa lại tầng memory của riêng mình.

File này **không dành riêng cho bất kỳ dự án nào**. Nó định nghĩa cấu trúc + hợp đồng bàn giao cho nhiệm vụ chung "sinh test case từ tài liệu dự án". Muốn dùng cho dự án khác chỉ cần thay dữ liệu, **không sửa code agent** — xem mục [Đưa dự án mới vào](#đưa-dự-án-mới-vào) ở cuối.

## Nguyên tắc phân tầng

Một mẩu thông tin thuộc tầng nào được quyết định bởi **3 trục**, không phải bởi nội dung của nó:

| Trục | Câu hỏi |
|---|---|
**Tần suất đổi** | Gần như không đổi / ít đổi / đổi thường xuyên / đổi mỗi lần chạy |
**Cách truy cập** | Nạp cả vào prompt, hay **truy vấn lấy đúng phần cần**? |
**Ai sở hữu** | Người viết tay, agent ghi, hay cả hai? |

Hệ quả quan trọng: **thứ ít đổi + tra cứu theo nhu cầu thì vào DB; thứ đổi thường xuyên + cần đọc cả thì để markdown.** Không phải "quan trọng thì vào DB".

## 5 tầng

| Tầng | Vị trí | Chứa gì | Đổi | Truy cập | Ai ghi |
|---|---|---|---|---|---|
**1. Semantic** | `memory/semantic/` | Phương pháp luận dùng cho **mọi** dự án: FACT, 06W, quy ước kiểm thử | Gần như không đổi | Nạp cả vào prompt | Người |
**2. Reference** | `memory/project/knowledge.db` | Tri thức tham chiếu **ổn định** của dự án: thuật ngữ, thành phần, field + ràng buộc, cấu hình | Ít đổi | **Truy vấn** — chỉ lấy phần liên quan | `qa-leader` (sau khi phân tích) |
**3. Working knowledge** | `memory/project/*.md` | Tri thức dự án theo mục đích, **đổi thường xuyên**: domain facts, known issues, decisions, **ui-flows** | Thường xuyên | Nạp cả vào prompt | `qa-leader` ghi + **người sửa tay** |
**4. Run data** | `.qa-run/*` | Dữ liệu của **1 lần chạy**: deliverable từng node, gap report, oracle, spec sinh ra, feature, evidence, report | Mỗi lần chạy | Đọc/ghi qua `agents/runtime/paths.js` | Agent |
**5. Session state** | `.qa-run/runs.db` | Trạng thái phiên, cửa duyệt người, lịch sử **nhiều** run | Mỗi bước | Qua `agents/runtime/memory.js` | Workflow |

Tầng 4 và 5 là dữ liệu tạm, không đi theo git. Tầng 1 và 3 đi theo git. Tầng 2 tái tạo được từ tầng nguồn (`project-docs/`).

### Ranh giới thứ 3: sản phẩm vs CODE DÙNG LẠI

Ngoài "tri thức vs sản phẩm", còn một ranh giới nữa dễ bị bỏ qua:

```
memory/                     TRI THỨC     — commit, người sửa tay được
tests/steps/  tests/pages/  CODE DÙNG LẠI — commit, người review
.qa-run/                    SẢN PHẨM      — gitignore, xoá tự do, sinh lại được
```

`tests/steps/` và `tests/pages/` **được sinh tự động** (từ luồng đã đi qua × registry) nhưng
**vẫn commit**: chúng là thứ viết một lần rồi 21 test case cùng gọi. Còn `.qa-run/tests/*.spec.ts`
là output từng test case. Gitignore cả hai — như kế hoạch ban đầu — sẽ bỏ mất đúng nửa dùng lại được.

### Chỗ khai đường dẫn: `agents/runtime/paths.js`

Mọi đường dẫn ở trên khai **một chỗ duy nhất**. Trước đó chúng rải trong 13 file `.js`
(riêng `deliverable-test-designer.md` xuất hiện 9 lần) + hơn chục file `.md`, nên đổi thư mục là
chắc chắn sót một chỗ, và chỗ sót thành một node đọc file không ai còn ghi.
`playwright.config.ts` cũng import từ đây — nếu không thì runner và agent có thể bất đồng về vị trí
`test-results.json`, và verifier sẽ đọc một file không ai tạo.

---

## Tầng 1 — Semantic

Tri thức **không phụ thuộc dự án**: framework đánh giá chất lượng, quy ước đặt tên/định dạng của nghề kiểm thử.

Ví dụ thuộc tầng này: framework FACT, framework 06W, quy ước ID test case, thang Priority của test case, taxonomy verdict.

**Không** thuộc tầng này: bất cứ thứ gì chỉ đúng với một dự án cụ thể.

## Tầng 2 — Reference (DB, truy vấn)

Tri thức tham chiếu **ổn định**, đã chốt sau bước phân tích tài liệu. Đặc trưng: nhiều mục nhưng mỗi lần chỉ cần vài mục.

Vì sao là DB chứ không phải markdown: một dự án thật có thể có hàng trăm thuật ngữ/field. Nạp hết vào mọi prompt là trả tiền cho phần không dùng. Nên **tra cứu theo nhu cầu**.

4 loại (generic, dự án nào cũng có):

| Loại | Chứa gì | Ví dụ (bất kỳ dự án) |
|---|---|---|
`terms` | Thuật ngữ + định nghĩa + tên gọi khác | một khái niệm nghiệp vụ và nghĩa chính xác của nó |
`components` | Thành phần hệ thống: trang, API, module, màn hình | một endpoint, một trang giao diện |
`fields` | Field dữ liệu + kiểu + ràng buộc | kiểu, min/max, có phân biệt hoa thường, bắt buộc hay không |
`config` | Cấu hình/môi trường của dự án | URL môi trường test, tên môi trường, thư mục tài liệu |

**Truy cập qua `agents/runtime/knowledge.js`, không truy vấn SQL trực tiếp.** Cách dùng chuẩn: đưa văn bản của việc đang làm (task, test case) vào `contextFor(text)`, nó trích từ khoá **deterministic** rồi trả về đúng các mục liên quan dưới dạng markdown ngắn để chèn vào prompt. Không dùng LLM để chọn — cùng triết lý với các tool đếm/kiểm tra deterministic khác trong repo.

`config` là cơ chế **bỏ hardcode**: URL môi trường, tên dự án... phải đọc từ đây, **không được viết cứng trong code agent**. Đây là điều kiện để cùng bộ code chạy được dự án khác.

## Tầng 3 — Working knowledge (markdown, sửa tay)

Tri thức dự án **đổi thường xuyên**, cần đọc trọn vẹn để hiểu ngữ cảnh nên để markdown.

| File | Chứa gì |
|---|---|
`domain-facts.md` | Fact nghiệp vụ đã xác nhận + **mâu thuẫn đã biết** trong tài liệu nguồn |
`known-issues.md` | Bug/khiếm khuyết đã biết (đổi mỗi sprint) |
`decisions-log.md` | Quyết định: tách rõ **đã xác nhận** vs **còn treo** |

Ba luật bắt buộc:

1. **Người sửa tay là hợp lệ và phải được tôn trọng.** Agent **không được ghi đè cả file**. Khi tài liệu nguồn đổi, agent chỉ được thay **đúng mục `###` phái sinh từ tài liệu đó**; mọi mục khác giữ nguyên từng byte.
2. **Mỗi mục `###` phải ghi được nguồn** — file tài liệu nó phái sinh từ đó. Không ghi được nguồn thì không được vào đây.
3. **Mâu thuẫn giữa 2 tài liệu thì ghi cả hai phía**, không tự chọn phía đúng. Điểm chưa xác nhận nằm ở mục "còn treo", không được nâng thành "đã xác nhận" bằng suy luận.

Lịch sử thay đổi của tầng này do **git** đảm nhiệm — không tự dựng cơ chế versioning riêng.

## Tầng 4 — Run data

Sản phẩm của một lần chạy. Đây cũng chính là **kênh bàn giao** giữa các node (xem mục dưới). Bị xoá/ghi đè tự do giữa các lần chạy.

## Tầng 5 — Session state

Một run = một `run_id`. Mỗi bước có trạng thái + cờ đã-được-người-duyệt. Node sau **không được chạy** nếu bước trước chưa `done` và chưa được duyệt (khi cửa duyệt đang bật).

---

## Hợp đồng bàn giao (Handover)

Bốn luật, áp cho mọi node:

1. **Không node nào đọc knowledge riêng của node khác.** Muốn dùng chung thì đưa lên tầng 1/2/3.
2. **Bàn giao chỉ qua tầng 4 + tầng 5.** Không truyền dữ liệu bằng biến trong bộ nhớ, không gọi trực tiếp node khác. Workflow là nơi điều phối duy nhất.
3. **Mỗi node khai rõ input bắt buộc.** Workflow kiểm tra input tồn tại **trước khi** gọi node, thay vì để node chết lúc runtime.
4. **Mỗi node ghi đúng output đã khai**, đường dẫn cố định — node sau dựa vào đó, không đi tìm.

Chuỗi bàn giao (tên vai trò, không phụ thuộc dự án):

| Node | Input bắt buộc | Output | Node sau được đảm bảo thấy |
|---|---|---|---|
Điều phối / Leader | Tài liệu dự án thô | Task assignment; gap report (nếu thiếu thông tin); **cập nhật tầng 2 + 3** | Task đã gán + tri thức dự án đã cập nhật |
Phân tích / Analyst | Task assignment | Deliverable phân tích | Yêu cầu đã phân tích + open question |
Thiết kế test / Test Designer | Deliverable phân tích | Bộ test case + file data | Test case + data tương ứng |
Tự động hoá / Automation | Bộ test case | Code test + oracle UI + phát hiện exploratory + evidence | Code chạy được + ảnh trước/sau |
Kiểm chứng / Verifier | Kết quả chạy test + oracle + evidence | Verdict + nhãn từng test case | Kết luận đã phân loại nguyên nhân |
Báo cáo / Reporter | Verdict + bộ test case | Báo cáo | — |

**Điểm dừng chờ người** là phần của hợp đồng, không phải thiếu sót: khi thiếu thông tin nghiệp vụ (gap report), trước hành động ra hệ thống thật, và trước khi kết luận bug thật.

---

## Đưa dự án mới vào

Đây là phép thử tính generic. Để chạy hệ này cho một dự án khác:

**Phải làm:**
1. Đặt tài liệu dự án mới vào thư mục tài liệu nguồn (`project-docs/` theo mặc định, đổi được qua `config`).
2. Xoá tầng 4 (dữ liệu run cũ) và tầng 2 (`knowledge.db` — tái tạo được).
3. Thay nội dung tầng 3 (hoặc để trống cho bước phân tích tự sinh).
4. Đặt `config` của dự án mới: URL môi trường test, tên dự án.

**Không được phải làm:** sửa bất kỳ file `.js` nào trong `agents/`, sửa `role.md`, sửa skill. Nếu phải sửa thì nghĩa là có giá trị của dự án đang bị hardcode trong code — đó là bug, phải chuyển giá trị đó xuống `config` (tầng 2).

Tầng 1 giữ nguyên không đổi giữa các dự án.
