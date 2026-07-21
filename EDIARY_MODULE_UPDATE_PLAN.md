# E-Diary (Occurrence Log) Module — Update Plan

> Mục tiêu: kích hoạt module e-Diary (hiện đang bị ẩn sau placeholder "Upcoming") và đồng bộ với FRD (SDC IIS CMS FRD v0.4, Section 8 — Occurrence Log).

---

## 1. Mục đích tính năng (vì sao e-Diary tồn tại)

E-Diary số hoá cuốn sổ nhật ký (occurrence logbook) giấy mà team IOH đang duy trì. Đây là nơi ghi lại các sự việc/tương tác **không đủ ngưỡng** để mở thành Incident, Fault, hay Task chính thức — ví dụ: tương tác với khách tham quan, thông báo VIP/dignitary viếng thăm, drill/exercise, phổ biến thông tin nội bộ.

Đặc điểm quan trọng theo FRD:
- Occurrence entry **không** kích hoạt ground response, work order, hay broadcast.
- Bất kỳ user có tài khoản CMS đều tạo được entry, **không** cần workflow duyệt/assign.
- Sau khi submit, entry được ghi nhận và **immutable**.
- Hệ thống hỗ trợ tra cứu/lọc theo ngày và theo user.
- e-Diary sẽ hiển thị như một module riêng trong UCS (để Controller/Duty Officer log nhanh không cần vào CMS) — phần UCS nằm ở tài liệu FRD khác, ngoài phạm vi repo này.

Nói cách khác: e-Diary = **sổ nhật ký nhanh, không quy trình, không thể sửa**, khác hẳn Incident/Task (có workflow, có role×status matrix).

---

## 2. Khoảng cách hiện tại (Gap Analysis)

Module thực ra đã được code khá đầy đủ (filter, create, list, escalate...) nhưng đang **ẩn hoàn toàn** sau placeholder, và có vài điểm lệch so với FRD:

| # | Hiện tại (code) | FRD yêu cầu | Kết luận |
|---|---|---|---|
| 1 | `SHOW_UPCOMING = true` → toàn bộ tab chỉ hiện "Upcoming, coming soon" | Module phải hoạt động | **Cần sửa** — bật module |
| 2 | Có tính năng **Amend** (sửa nội dung, giữ lịch sử bản gốc + badge "✏ N amendment(s)") | "Once submitted, the entry is recorded and immutable" | **Cần sửa** — ✅ đã chốt: bỏ hẳn Amend |
| 3 | Comment code ghi "Roles allowed... per FRD §8.3" — mục 8.3 **không tồn tại** trong FRD (chỉ có 8.1 Occurrence Record Structure, 8.2 Occurrence Creation) | — | **Cần sửa** — trích dẫn sai, gây hiểu lầm cho dev sau |
| 4 | Comment "Auto-create a Case if no caseId provided (FRD §8.2)" | §8.2 thực chất nói về *ai được tạo entry* + *immutable*, không nói gì về Case; FRD còn ghi rõ "Occurrence records... are not linked to the Case structure" (standalone) | ✅ đã chốt: **giữ hành vi auto-create Case như hiện tại** (deliberate deviation), nhưng **sửa lại comment** cho đúng sự thật |
| 5 | `ALLOWED_ROLES` loại **Responder (Ranger)** và **Stakeholder** | FRD: "Any authorised user with a CMS account may create an occurrence entry" | ✅ đã chốt: **giữ nguyên** 5 role hiện tại. *Lưu ý*: seed data (`seed_scenarios.js`) có "Ranger John", "Ranger Dave" là người tạo occurrence — mâu thuẫn ngầm với việc Ranger bị chặn quyền tạo entry trong UI thật. Ghi nhận làm điểm theo dõi, không sửa lần này. |
| 6 | Topic là list hardcode 10 giá trị trong component | FRD liệt "Occurrence topic categories" là 1 item cấu hình được bởi System Admin ("if structured topic field is confirmed") | Không chặn, để **Phase sau** (backlog) |
| 7 | Type `Occurrence.attachments?: string[]` tồn tại nhưng chưa có UI upload | Bảng field FRD (Occurrence ID, User, Date/Time, Topic, Content) **không** có attachments | Không cần làm — giữ field cho tương lai, không phải phạm vi lần này |
| 8 | Tính năng "Escalate to Incident" (tạo Incident mới trong cùng Case của entry) | Không có trong FRD Section 8 | Mở rộng hợp lý ngoài FRD, không mâu thuẫn (Case đã tồn tại sẵn nhờ mục #4) → **giữ lại**, chỉ rà soát lại copy/label cho khớp văn phong sau khi bỏ Amend |
| 9 | Filter: Search text + Date From/To + Logged By | FRD yêu cầu tối thiểu: filter theo date + theo user | Đạt yêu cầu, search text là bổ sung hợp lý — **không đổi** |

---

## 3. Quyết định đã chốt (đã xác nhận với Kyle)

- ✅ **Bỏ hoàn toàn Amend** — entry immutable ngay sau khi submit. Muốn đính chính → tạo entry mới, tham chiếu Occurrence ID cũ trong nội dung.
- ✅ **Giữ nguyên** hành vi auto-create Case cho mỗi entry (không đổi theo hướng "standalone" của FRD).
- ✅ **Giữ nguyên** danh sách 5 role được truy cập e-Diary: Controller, Duty Officer, Duty Manager, System Administrator, Current Ops Administrator (Ranger & Stakeholder vẫn không có quyền).

---

## 4. UX sau khi đơn giản hoá

Bỏ Amend giúp luồng UX gọn hơn đáng kể — ít trạng thái, ít modal, ít khả năng gây nhầm lẫn "entry này đã bị sửa hay chưa":

**Luồng chính (end-to-end):**
1. User (1 trong 5 role được phép) mở tab **e-Diary**.
2. (Tuỳ chọn) Lọc theo khoảng ngày / người ghi / từ khoá ở panel bên trái.
3. Bấm **NEW ENTRY** → chọn Topic (hoặc "Others" + nhập tay), nhập Narrative, tuỳ chọn gắn Case ID có sẵn, tuỳ chọn chỉnh lại ngày giờ (backdating được phép).
4. Submit → entry xuất hiện ngay trên timeline, **không thể sửa lại**.
5. Nếu sự việc leo thang thành nghiêm trọng hơn → bấm **Escalate to Incident** trên entry → tạo Incident mới trong Case liên kết, entry gốc vẫn được giữ nguyên làm nhật ký.

**Thay đổi UI cụ thể:**
- Card mỗi entry: bỏ nút "✏ Amend" và badge "✏ N amendment(s)" — chỉ còn nút **🔺 Escalate to Incident** (nếu `canEdit`).
- Bỏ 2 modal: "Amend Entry" và "Amendment History".
- Text ghi chú trong filter pane đổi từ *"Entries may be amended after submission..."* → **"Once submitted, an entry cannot be edited. To correct a mistake, log a new entry referencing this Occurrence ID."**
- Create modal, Escalate modal: giữ nguyên như hiện tại (đã hợp lý, không cần đổi).

---

## 5. Các phần cần update (chia theo file)

### 5.1 `src/components/tabs/EDiaryTab.tsx`
- Xoá `SHOW_UPCOMING` + `UpcomingPlaceholder` (xoá code chết, không chỉ set `false`) → kích hoạt UI thật cho 5 role được phép; role khác vẫn thấy "Access Restricted" như hiện tại (giữ nguyên đoạn guard này).
- Xoá toàn bộ state/logic Amend: `editingEntry`, `editContent`, `saving`, `handleAmend`, JSX modal "Amend Entry".
- Xoá toàn bộ state/logic Amendment History: `viewingAmendments`, JSX modal "Amendment History", badge amendment trên card.
- Xoá nút "✏ Amend" trong card footer.
- Sửa text ghi chú FRD trong filter pane (mục 4 trên).
- Giữ nguyên: filters (search/date/user), Create modal, Escalate to Incident modal, logic fetch/list.

### 5.2 `src/app/api/occurrences/route.ts`
- Xoá hẳn `export async function PATCH` (không còn endpoint amend nào).
- Sửa comment sai `// Auto-create a Case if no caseId provided (FRD §8.2)` → thay bằng ghi chú trung thực, ví dụ: `// NOTE: FRD Section 8 states occurrences are standalone and not linked to Case; auto-linking a Case here is a confirmed, deliberate deviation (see EDIARY_MODULE_UPDATE_PLAN.md §3).`

### 5.3 `src/lib/db.ts`
- Xoá field `amendments?: { timestamp; amendedBy; originalText }[]` khỏi `interface Occurrence` (không còn concept amendment trong FRD, giữ model sạch).
- Giữ nguyên `attachments?: string[]` (ngoài phạm vi lần update này).

### 5.4 `src/app/globals.css`
- Rà soát class CSS chỉ dùng cho amendment badge (nếu có định nghĩa riêng ngoài inline style) và dọn dead code — cần grep kỹ trước khi xoá để không ảnh hưởng module khác dùng chung class.

### 5.5 `src/lib/seed_scenarios.js`
- Không cần sửa — demo data hiện tại không có `amendments`, không bị ảnh hưởng khi xoá field.

---

## 6. Thứ tự thực hiện (phased)

1. **Phase 1 — Activate**: xoá `SHOW_UPCOMING`/placeholder, verify UI hiện đúng cho 5 role được phép; role bị chặn thấy "Access Restricted" như cũ.
2. **Phase 2 — Enforce immutability**: xoá Amend + Amendment History (UI, API, type), cập nhật text ghi chú.
3. **Phase 3 — Cleanup**: sửa comment FRD sai trong API route, dọn CSS chết.
4. **Phase 4 — Verify**: test tạo entry ở mọi role được phép; test filter (date/user/search); test Escalate to Incident; test role bị chặn (Ranger/Stakeholder) thấy Access Restricted; xác nhận không còn cách nào sửa/xoá entry qua UI hay API (PATCH đã gỡ, DELETE vốn chưa từng có).

---

## 7. Điểm mở — theo dõi, chưa cần làm ngay

- **Topic categories**: nên chuyển từ hardcode sang cấu hình System Admin (giống Incident Type/Fault Type) khi màn `/admin` có khung reference-data chung — để sau.
- **Ranger bị chặn tạo entry** dù seed data có Ranger tạo occurrence và FRD ghi "any authorised user": đã chốt giữ nguyên lần này, nhưng nên revisit nếu SDC review yêu cầu khớp FRD 100%.
- **Case auto-create mỗi entry** dù FRD ghi occurrence là "standalone": đã chốt giữ nguyên, ghi nhận là sai lệch có chủ đích để tránh nhầm là bug trong review sau.

---

## 8. List Page Redesign — Round 2 client feedback (2026-07-21)

> Bối cảnh: sau khi present prototype, client feedback thêm về màn List của e-Diary (xem thêm `EDiary_FSD_Feedback_Note_to_ShinFeng.md` cho phần gap FRD liên quan). Mục này ghi nhận yêu cầu **đã thảo luận và Kyle confirm**, chưa code — chờ chốt nốt mục còn mở rồi mới bắt tay implement.

### 8.1 Yêu cầu đã chốt

| # | Yêu cầu | Trạng thái |
|---|---|---|
| 1 | Bỏ modal "New Entry" pop-up, thay bằng **inline quick-add bar** ngay trên đầu list: chọn Type + nhập nội dung + nút "+ Log". Có nút "More" mở rộng để nhập Ref No (optional) và Time (mặc định = now). | ✅ Confirmed — khớp Option C đã chọn trước đó |
| 2 | Đổi layout khu filter/search cho phù hợp với thanh quick-add mới (không còn tách rời "New Entry" button ở góc). | ✅ Confirmed |
| 3 | Click vào 1 row: **không** navigate thẳng sang Case detail nữa → mở **popup view** gồm đủ Date Time, SN, e-Diary ID, Case ID, Topic, Narrative, Logged by, Actions. Topic + Narrative là 2 trường hiển thị chính. Case ID trong popup **click được** → mới navigate sang trang Case detail. | ✅ Confirmed |
| 4 | Thêm cột **Serial No** (SN01, SN02...) — field **tách riêng**, song song với e-Diary ID hiện có (`SEN/ED/YYYYMMDD/NNN`), đánh số **liên tục toàn hệ thống** (không reset theo ngày). | ✅ Confirmed |
| 5 | Cột Actions: gộp thành **1 nút** mở tooltip/dropdown cho chọn **Create Incident / Fault / Task / Event**. Task: Kyle xác nhận **build luôn**, không chờ thêm. | ✅ Confirmed |
| 6 | (chưa có nội dung — bạn để trống, vẫn đang chờ bạn bổ sung) | ⏳ Open |

### 8.2 Việc cần làm mới (gap so với hạ tầng hiện tại)

Rà lại code (`EDiaryTab.tsx`, `db.ts`, `FaultCreateModal.tsx`, `TaskBoardTab.tsx`, `EventCreateModal`), phần #5 kéo theo vài việc nền chưa có sẵn:

- **Incident** — dùng lại luồng Escalate hiện tại, không cần sửa nhiều.
- **Event** — đã có `EventCreateModal` dùng chung, có sẵn `sourceEDiaryId` để giữ liên kết. Gắn vào nút gộp là đủ.
- **Fault** — đã có `FaultCreateModal.tsx` dùng lại được (nhận `linkedCaseId`, `username`, prefill location), **nhưng chưa có field liên kết ngược về e-Diary**. Cần: thêm `sourceEDiaryId?: string` vào `interface Fault` (`db.ts`) và prop tương ứng trong `FaultCreateModal`, theo đúng pattern đã làm với Event.
- **Task** — hiện **không có modal dùng chung**, form tạo Task chỉ nằm inline trong `TaskBoardTab.tsx` (state/handler riêng, không export). Cần tách thành `TaskCreateModal` (tương tự `EventCreateModal`/`FaultCreateModal`) để gọi được từ e-Diary lẫn từ Task Board. Đồng thời thêm `sourceEDiaryId?: string` vào `interface Task`.
- **Serial No (mục #4)** — cần: (a) thêm field `serialNo: string` vào `interface Occurrence`; (b) cơ chế sinh số tăng dần toàn cục (global counter, không theo ngày) ở API route tạo occurrence; (c) backfill SN cho data seed hiện có để tránh record cũ bị thiếu field.
- **Popup view (mục #3)** — modal mới thay cho hành vi `window.location.href` hiện tại ở dòng click row; cần quyết định thêm: nút Actions gộp (#5) có lặp lại y hệt bên trong popup này không, hay popup chỉ có nút "View full Case"? (giả định: có, vì #3 liệt Actions là 1 trong các trường hiển thị trong popup — sẽ làm theo hướng này trừ khi bạn nói khác).
- **Quick-add bar (mục #1)** — Type dropdown trong ảnh mockup dùng 5 loại sổ client yêu cầu (Carpark barrier, v.v.), tức là thay hẳn `TOPICS` hiện tại (10 giá trị generic). Đây là gap #đã nêu trong note gửi Shin Feng ("5 loại sổ có phải Topic categories chính thức?") — vẫn **chưa có xác nhận từ Shin Feng**, nhưng vì client đã nói rõ trực tiếp, đề xuất cứ theo hướng 5 loại sổ, chỉ điều chỉnh lại nếu Shin Feng phản hồi khác.

### 8.3 Phụ thuộc còn mở

- Mục #6 (bạn chưa điền).
- Xác nhận cách hiển thị Actions trong popup (nêu ở 8.2).
- Ref No: free text hay lookup chọn từ SN có sẵn? (đã hỏi Shin Feng trong note, chưa có trả lời — nhưng đây là quyết định UI, có thể chốt độc lập với Shin Feng nếu bạn muốn quyết trước).

Sau khi mục #6 + 2 điểm trên được chốt, sẽ viết plan file-by-file + phased execution (giống mục 5–6 ở trên) trước khi đụng code.
