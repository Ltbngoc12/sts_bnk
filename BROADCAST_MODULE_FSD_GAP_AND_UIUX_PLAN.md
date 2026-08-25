# §10 Broadcast & Notification Framework — Đối chiếu FSD ↔ Source code + Plan tối ưu UI/UX

**Sentosa CMS (sts-bnk)** · 2026-07-26 · Phân tích cho 2 trang `/broadcasts` và `/broadcasts/eod-review`
**Phạm vi:** FSD §10 (Broadcast and Notification Framework), có tham chiếu §5.1.2, §5.11, §13.3.
**Không code** — đây là tài liệu phân tích + kế hoạch.

### Quyết định đã chốt với Kyle (2026-07-26)

| # | Quyết định |
|---|---|
| D1 | **Gộp `/broadcasts` + `/broadcasts/eod-review`** thành 1 trang, 2 tab. Chia tab theo **công việc**: tab 1 *record-centric* (hồ sơ), tab 2 *day-centric* (duyệt theo đêm) — xem §6.1 |
| D2 | **Bỏ 3 KPI card.** Tín hiệu "có việc" chuyển vào **count pill trên sub-tab trạng thái** (`Chờ xử lý 43 │ Đã gửi 6 │ Tất cả 49`) — xem D10 |
| D3 | Filter **"phân loại"** = **loại broadcast** (Closure / End-of-Day / Weather / Manual). Kênh gửi là filter phụ trong `⚙ Thêm` |
| D4 | **Detail:** bỏ panel hẹp co bảng → **drawer overlay 800px + route `/broadcasts/[id]`**, và **sửa typography** (email preview 70ch thay monospace 11.5px) |
| D5 | **Tab EOD có trục ngày** — nâng từ "filter date" thành **day navigator** |
| D6 | 🗑️ **KHÔNG build tính năng Reject.** `PENDING` + `eodDate` đã qua chính là "không gửi". Xoá luôn bug B2/B3/B7 và vấn đề carry-over — xem §2 (B2/B3/B7) |
| D7 | **Scheduler EOD = Vercel Cron** (`vercel.json` → `crons`), lazy-trigger làm dự phòng |
| D8 | ⏸️ **HOLD:** định nghĩa "sensitive content" §10.4c — Kyle check với khách, chưa đụng vào |
| D9 | **Desktop-first**, breakpoint tablet ghi chú sẵn để làm sau (§6.8 C5) |
| D10 | 🗑️ **Bỏ dải filter-chip có số đếm** (bản mockup v1). Số đếm nằm ở **count pill trên sub-tab trạng thái** — đúng pattern `CaseLogTab.tsx` (`Active Cases (12) │ All Cases (49)`) |
| D11 | 🗑️ **Bỏ view "Theo tháng"** ở tab EOD. Day navigator là đủ |
| D12 | 🎨 **Filter & search bám 100% pattern hệ thống** — `src/components/tabs/CaseLogTab.tsx` + `src/app/globals.css`. Không tự chế control mới. Spec ở §6.7 |

---

## 0. Cảnh báo về nguồn tài liệu (đọc trước)

| Nguồn | Tình trạng trong repo |
|---|---|
| `SDC IIS CMS FRD v0.5_SDC.pdf` | ❌ **KHÔNG còn trong repo** |
| `FRD_v0.5_extracted.txt` | ❌ **KHÔNG còn trong repo** |
| `FRD_CMS.txt` | ✅ Có — nhưng đây là **v0.1**, Broadcast nằm ở **§9**, không phải §10 |
| `BROADCAST_NOTIFICATION_FRAMEWORK_IMPLEMENTATION_PLAN_v0.3.md` | ✅ Có — trích **nguyên văn** nhiều câu §5.11.1a, §5.1.2, §10.1(e), §10.5, §13.3 của v0.5 |

→ Phân tích §10 dưới đây được dựng từ **3 nguồn giao nhau**: (1) `FRD_CMS.txt` §9 (nội dung khung ổn định qua các version), (2) các trích dẫn nguyên văn v0.5 trong plan v0.3, (3) chính các comment `§10.x` mà code đang tự khai báo.

> ⚠️ **Cần Kyle đưa lại `SDC IIS CMS FRD v0.5_SDC.pdf` vào repo** để soát lại 3 điểm mà tôi không verify được câu chữ gốc: §10.4 (định nghĩa "sensitive content"), §10.6 (Broadcast Matrix — FSD ghi TBC), §10.7 (timing + tiêu chí đủ điều kiện EOD — FSD ghi TBC). Các phần còn lại đủ căn cứ.

---

## 1. Bản đồ code hiện tại (§10 đang nằm ở đâu)

```
Domain logic thuần      src/lib/broadcast.ts            (260 dòng)  resolve matrix/template/recipients, C1 gate, EOD predicate
Config types + seed     src/lib/broadcastConfig.ts      (264 dòng)  BroadcastTemplate / MatrixRule / Channel / PromptRule / Config
Persistence             src/lib/broadcastStore.ts       (159 dòng)  Mongo, readOrSeed + replaceAll, notifications mailbox
Record schema           src/lib/db.ts:393-425                       BroadcastRecord
Gateway (mock)          src/lib/emailMock.ts                        Queued→Sent→Delivered→Failed, IN-MEMORY
Permissions             src/lib/permissions.ts                      broadcast.view/compose/dispatch/eod_review/config

Trigger Closure         api/incidents/[...id]/route.ts:498-560       C1 gate + queue PENDING + prompt rule
Dispatch từ Incident    api/incidents/[...id]/route.ts:810-890       action 'dispatch-broadcast'
Trigger EOD             api/cron/eod-broadcast/route.ts             queue PENDING theo incident đang mở
List/Create             api/broadcasts/route.ts                     GET filter + POST manual
Dispatch/Reject         api/broadcasts/[...id]/route.ts             action dispatch | reject  ← reject SẼ GỠ BỎ (D6)

UI list + detail        app/broadcasts/page.tsx          (379 dòng)  ← TRANG 1 cần redesign
UI EOD review           app/broadcasts/eod-review/page.tsx (211 dòng) ← TRANG 2 cần redesign
UI admin config         app/admin/broadcast-config/page.tsx (1222 dòng) 5 tab: Template/Matrix/Channel/EOD/PromptRules
```

**Đánh giá tổng:** phần **backbone đã rất tốt** — logic tách khỏi persistence, config đã lên Mongo (không còn localStorage), matrix multi-select, template chọn theo `templateId` bắt buộc, C1 gate theo Incident Category đã cài. Cái còn thiếu tập trung ở **3 vùng**: (a) mấy nhánh §10 chưa nối dây (Weather Advisory, Push, SDC Comms, scheduler), (b) **vòng đời sau-dispatch** (delivery/ack không bao giờ cập nhật), (c) **UI/UX của 2 trang vận hành** — đúng chỗ anh đang muốn tối ưu.

---

## 2. Gap Analysis chi tiết theo từng mục §10

Ký hiệu: ✅ đủ · ◑ một phần · ❌ thiếu · 🐞 sai/bug

### §10.1 — Broadcast Types

| Loại | Yêu cầu FSD | Code | Đánh giá |
|---|---|---|---|
| Closure Broadcast | System, khi DM duyệt đóng incident — **chỉ khi required theo broadcast rules** | `incidents/[...id]:498` + `isClosureBroadcastRequired()` | ✅ Đúng cả gate C1 |
| End-of-Day Interim | DM, qua batch review queue | `cron/eod-broadcast` + `/broadcasts/eod-review` | ◑ Có luồng, thiếu scheduler (G8) |
| Weather Advisory | (FSD v0.5 liệt kê là 1 trong 3 loại) | Có `BROADCAST_TYPES` + `tpl-weather` | ❌ **G1** |
| Crisis Recall (L4+, SMS) | §10.1/§11 — semi-automated, human confirm | Không có | Ngoài scope §11 — nhưng UI không nói gì |
| Broadcast ID `[CaseID]-BC###` | ✅ | 3 nơi tự sinh riêng | 🐞 **B4** |

**G1 — Weather Advisory Broadcast chưa nối dây.**
`BROADCAST_TYPES` có 3 loại và `DEFAULT_BROADCAST_TEMPLATES` có sẵn `tpl-weather`, nhưng:
- `DEFAULT_BROADCAST_MATRIX` **không có một rule nào** cho `'Weather Advisory Broadcast'` → `resolveMatrixRule()` scope theo `broadcastType` sẽ trả `undefined` → recipients rỗng.
- Không có hàm `resolveWeatherBroadcast()` tương ứng `resolveClosureBroadcast`/`resolveEodBroadcast`.
- Modal "New Broadcast" (`broadcasts/page.tsx:331`) có option `Weather Advisory` nhưng `POST /api/broadcasts` **không đọc config gì cả** — nó lấy nguyên `body.recipients` và `body.content` do user gõ tay, `templateUsed` mặc định `'Manual Broadcast'`.
→ Kết quả: chọn "Weather Advisory" trong modal chỉ tạo ra một bản ghi rỗng dán nhãn Weather Advisory. Template và distribution group đã cấu hình trong Admin **không được dùng**.

**🐞 B4 — Broadcast ID sinh bằng `filter(...).length + 1`.**
3 call site cùng làm `db.broadcasts.filter(b => b.caseId === caseId).length + 1`:
`incidents/[...id]:521`, `cron/eod-broadcast:41`, `api/broadcasts/route.ts:47`.
Nếu một record bị xoá, hoặc 2 request đồng thời (cron chạy trùng lúc DM tạo manual), sẽ sinh **trùng ID**. Không có unique index. Cần một helper `nextBroadcastId(caseId)` duy nhất, tính theo `max(seq)+1` parse từ ID hiện có, không phải `length`.

**🐞 B6 — Manual broadcast bắt buộc `caseId`.**
`api/broadcasts/route.ts:41` chặn nếu không có `caseId`. Nhưng Weather Advisory là thông báo **toàn đảo**, không gắn Case nào. Cần cho phép broadcast không-gắn-case với ID theo pattern khác (vd `SEN/BC/20260726/001`).

---

### §10.2 — Delivery Channels

| Channel | FSD | Code |
|---|---|---|
| Email | Closure + EOD, tới distribution group | ✅ `sendEmailMockBatch()` được gọi ở cả 2 dispatch path |
| Push / System Notification | (v0.5 §10.2) | ❌ **G2** |
| SMS | Crisis recall L4+, **có acknowledgement** | ❌ ngoài scope §11; `sms-mock` có sẵn nhưng broadcast không dùng |

**G2 — Channel "Push Notification" là decoration.**
`DEFAULT_BROADCAST_MATRIX` set `deliveryChannels: ['Email', 'Push Notification']` cho Level 1–3. Giá trị này được snapshot vào `BroadcastRecord.channels` và **hiển thị lên UI EOD** (`eod-review/page.tsx:153` → "Channels: Email, Push Notification"). Nhưng lúc dispatch, cả `api/broadcasts/[...id]:88` và `incidents/[...id]:866` **chỉ kiểm tra Email**:

```
if (!bc.channels || bc.channels.includes('Email')) { sendEmailMockBatch(...) }
```

Không có nhánh nào xử lý `'Push Notification'` → không có `addNotification()` nào bắn cho recipient. **UI đang nói dối end user**: màn hình ghi "Channels: Email, Push Notification" nhưng chỉ email được gửi.

---

### §10.3 — Recipient Group Management

| Yêu cầu | Code | |
|---|---|---|
| a. Group là named collection of emails, admin cấu hình | `distributionGroups` collection + admin UI | ✅ |
| b. Create / edit / **deactivate** | `status === 'Active'` filter trong `resolveGroupEmails()` | ✅ |
| c. Pre-populate default group theo incident type + crisis level | `resolveMatrixRule()` → `resolveGroupEmails()` | ✅ |
| d. DM/Controller thêm/bớt recipient trước dispatch, **không sửa group gốc** | Textarea comma-separated, snapshot vào record | ◑ đúng logic, sai UX (**U5**) |

**G5 — `recipientGroups` bị tính rồi vứt đi.**
`ResolvedBroadcast` có field `recipientGroups: string[]` (`broadcast.ts:122`), nhưng khi tạo `BroadcastRecord` ở cả 2 nơi (`incidents/[...id]:522`, `cron/eod-broadcast:44`) **không ai lưu nó vào record** — nó chỉ được nhét vào một dòng text trong `incident.log`.

Hệ quả trực tiếp lên UI mà anh đang muốn làm:
- Trang Broadcasts / EOD **không thể hiển thị** "Nhóm: SDC Crisis Command (3 người)".
- Reviewer nhìn thấy `silosocafe@food.com.sg, ops@olabeach.com.sg, john.doe@ranger.com.sg` mà **không biết** đây là nhóm nào, đến từ rule nào, và bỏ 1 người ra thì có phải override tạm thời không.
- §10.9b yêu cầu record giữ "recipient list" — đang giữ nhưng mất context, làm giảm giá trị hồ sơ.

Tương tự, `matrixRuleId` và `templateId` cũng không được lưu vào record (chỉ lưu `templateUsed` là **tên** template — nếu admin đổi tên template thì hồ sơ cũ trỏ vào hư vô).

---

### §10.4 — Broadcast Templates

| Yêu cầu | Code | |
|---|---|---|
| a. Template map theo incident type + crisis level | Qua Matrix Rule → `templateId` (Phương án B) | ✅ thiết kế hợp lý |
| b. Template định nghĩa default field set | `body` với `{variable}` | ✅ |
| c. Default template loại trừ nội dung nhạy cảm | Chính sách, không enforce | ◑ chấp nhận được |
| d. Vượt default ⇒ **DM xác nhận tường minh** tại điểm dispatch | Content-diff gate + checkbox | ◑ có, nhưng **G6** |
| e. Admin cấu hình được | ✅ | ✅ |

**G4 — `BroadcastTemplate.subject` chưa bao giờ được dùng.**
Template có field `subject` (vd `'[SDC] Incident Closed: {incident_title}'`), admin chỉnh được nó trong UI. Nhưng lúc gửi, cả 2 dispatch path hardcode:

```
subject: `[SDC] ${bc.type} Broadcast — ${bc.id}`
```

→ Người nhận email nhận được tiêu đề `[SDC] Closure Broadcast — SEN/CI/20260621/002-BC001` thay vì `[SDC] Incident Closed: Siloso Beach Outage`. `subject` cũng không được `renderTemplate()` xử lý biến. Đây là gap thật so với §10.4b, và cũng là lý do preview trong UI review không giống email thật.

**G6 — Không lưu nội dung mặc định gốc ⇒ không audit được deviation.**
Cơ chế diff hiện tại đúng về ý tưởng: so `body.content` với `bc.contentDispatched` **trước khi** ghi đè. Nhưng sau dispatch, `contentDispatched` bị **ghi đè bằng bản đã sửa**, và bản mặc định gốc **biến mất vĩnh viễn**. Chỉ còn cờ `contentEditConfirmed: true`.

Hệ quả:
- Audit log ghi "Content edited from default — confirmed" nhưng **không ai còn xem được sửa cái gì**.
- Reviewer trong UI bấm checkbox xác nhận mà **không có diff view** — họ xác nhận mù. Với một điều khoản có mục đích chặn rò rỉ thông tin nhạy cảm (§10.4c), đây là điểm yếu về kiểm soát, không chỉ về UX.
→ Cần thêm field `contentDefault` (bản render gốc lúc queue) và giữ nguyên khi dispatch.

---

### §10.5 — System Notifications (10 sự kiện)

| Trạng thái | Chi tiết |
|---|---|
| ✅ Server-authoritative | **2/10** — `closure_broadcast_queued`, `eod_broadcast_queued`, qua `BroadcastActionPromptRule` (thiết kế tốt: config-driven, multi-role, không hardcode fallback) |
| ◑ Client-side | ~8/10 còn lại vẫn là `addNotification()` gọi từ trong page component |

**G7 — 8/10 sự kiện §10.5 chỉ bắn khi user đang mở đúng trang.**
Đây là hạn chế kiến trúc đã ghi nhận trong plan v0.3 §2.6 và **vẫn còn nguyên**. `broadcastStore.addNotification()` (server) đã tồn tại và hoạt động — chỉ cần chuyển các call site còn lại từ client sang các action handler tương ứng. Ví dụ rõ nhất: action `notify-complete` (`incidents/[...id]:364`) xử lý đầy đủ nghiệp vụ nhưng **không phát System Notification** cho Controller, dù §10.5 liệt kê sự kiện này.

---

### §10.6 — Broadcast Matrix

✅ **Đây là phần làm tốt nhất module.** Multi-select `crisisLevels` / `incidentTypes` / `incidentSubTypes` / `recipientGroups`, wildcard `'Any'`, `status` Active/Inactive không xoá, `templateId` bắt buộc, và fix scope theo `broadcastType` (2026-07-25) để rule Closure không rò template sang EOD — logic `resolveMatrixRule()` có thứ tự fallback rõ ràng (specific type → any type → first at level).

Chỉ thiếu 2 thứ:
- Không có rule cho `Weather Advisory Broadcast` (đã nêu ở G1).
- **Không có "Rule Simulator"** trong admin: admin cấu hình 10 rule multi-select chồng chéo mà không có cách nào kiểm tra "incident Type=Facilities, Sub=Power Outage, Level=3 thì rule nào thắng, gửi cho ai, dùng template nào". Đây không phải yêu cầu FSD nhưng là rủi ro vận hành thực tế.

---

### §10.7 — End-of-Day Interim Broadcast

| Yêu cầu | Code | |
|---|---|---|
| Surface queue incident đang mở cho DM tại cuối ngày | `cron/eod-broadcast` | ◑ |
| DM chọn template, confirm content, approve dispatch | `/broadcasts/eod-review` | ◑ (**U9–U16**) |
| Timing cấu hình được (§13.3) | `BroadcastConfig.endOfDayTime` | ❌ **G8** |

**G8 — `endOfDayTime` là dead config.**
Grep toàn repo: `endOfDayTime` chỉ xuất hiện ở `broadcastConfig.ts` (khai báo + seed `'20:00'`) và `admin/broadcast-config/page.tsx` (form set/save). **Không một dòng code nào đọc nó để chạy job.** Cách duy nhất để queue EOD chạy là bấm nút "Run End-of-Day Check Now" trên trang review — nghĩa là DM phải nhớ bấm, và nếu quên thì §10.7 không xảy ra ngày hôm đó.
→ Cần: (a) external scheduler gọi `/api/cron/eod-broadcast` (Vercel Cron / Windows Task Scheduler), hoặc (b) tối thiểu — lazy trigger: khi trang EOD load sau `endOfDayTime` mà hôm nay chưa chạy thì tự chạy, + hiển thị rõ "Cutover 20:00 · lần chạy cuối 20:03 hôm nay".

**G9 — Điều kiện vào queue EOD không áp category gate.**
```
const OPEN_STATUSES_EXCLUDED = ['Closed', 'Pending Endorsement'];
export function isEodEligible(incident) { return !OPEN_STATUSES_EXCLUDED.includes(incident.status); }
```
Nghĩa là **mọi** incident không-Closed đều vào queue, kể cả:
- Incident category `Informational` / `Exercise Record` — FSD §5.1.2 nói rõ *"do not require … broadcast handling by default"*. Closure path đã tôn trọng điều này (`isClosureBroadcastRequired`), **EOD path thì không**.
- Incident `Level 5` (occurrences / false alarm) — gửi interim broadcast cho báo động giả cuối ngày là nhiễu.
- Incident vừa tạo 10 phút trước, chưa assign.

→ **Đây chính là lý do màn hình của anh đang có 43 PENDING.** Con số đó không phải "43 sự việc cần thông báo", nó là "43 record rác do predicate quá rộng". Fix G9 sẽ giảm queue xuống mức con người xử lý được, và làm việc redesign UI nhẹ đi một nửa.

**🐞 B1 — EOD idempotency chỉ chặn PENDING → tạo bản trùng.**
```
const alreadyQueued = db.broadcasts.some(b => b.incidentId === incident.id && b.type === 'End-of-Day' && b.status === 'PENDING');
```
Kịch bản: 20:00 cron chạy → tạo BC001 PENDING. 20:10 DM dispatch → BC001 thành SENT. 20:15 ai đó bấm "Run Check Now" → điều kiện `status === 'PENDING'` không còn khớp → **tạo BC002 cho đúng incident đó, đúng ngày đó**. Y hệt với record đã REJECTED — DM từ chối xong nó quay lại ngay lần chạy sau.
→ Cần field `eodDate: 'YYYY-MM-DD'` trên record và guard theo `(incidentId, eodDate)` bất kể status.

**🗑️ B2 / B3 / B7 — QUYẾT ĐỊNH: BỎ HẲN tính năng Reject (Kyle, 2026-07-26).**

Ba bug này đều nằm trên action `reject` (`api/broadcasts/[...id]:47-62`):
- **B2** — `bc.status='REJECTED'` nhưng ghi vào `dispatchedBy`/`dispatchedAt` → UI hiển thị record bị từ chối dưới nhãn **"Dispatched By / Dispatched At"**, sai hoàn toàn. Không có `rejectReason`.
- **B3** — reject một broadcast `type==='Closure'` set `incident.closureBroadcastStatus='not_required'` → mất dấu vết là đã có quyết định con người; badge trên trang Incident đọc như thể hệ thống chưa bao giờ yêu cầu.
- **B7** — action reject đòi `broadcast.eod_review`, nhưng `Controller` chỉ có `view/compose/dispatch` → thấy nút, bấm, nhận 403 qua `alert()`.

**Kyle chốt: không build Reject.** Lập luận: *"nếu không dispatch thì nó vẫn ở đó, reject không có tác dụng gì."* — và lập luận này đúng khi đã có `eodDate` (task 0.5):

> Một EOD record của đêm 26/07 mà DM không gửi thì **cứ để nguyên `PENDING` với `eodDate = 2026-07-26`**. Đêm 27/07 cron tạo record mới (khác `eodDate`), không đụng tới record cũ. Nhìn vào view theo-đêm của 26/07 sẽ thấy đúng *"3 đã gửi · 2 không gửi"* mà **không cần** một status `REJECTED` nào. `PENDING` + `eodDate` đã qua **chính là** "đã quyết định không gửi cho đêm đó".

**Lợi ích phụ:** bỏ Reject là xoá luôn B2, B3, B7 và cả câu hỏi phân quyền `broadcast.reject` — 3 bug và 1 quyết định BA biến mất bằng cách **xoá code**, không phải viết thêm code.

**Đánh đổi cần biết** (chấp nhận, ghi lại để sau này không ai thắc mắc):
1. **Không lưu được LÝ DO không gửi.** Audit biết "không gửi" nhưng không biết vì sao. → Nếu sau này khách hỏi, giải pháp nhẹ nhất là một ô **ghi chú tự do** trên record (không đổi status, không phải action), chứ không dựng lại luồng reject.
2. **Closure broadcast không có ranh giới ngày như EOD** → một record Closure `PENDING` mà không ai gửi sẽ nằm đó vĩnh viễn, `incident.closureBroadcastStatus` kẹt ở `'pending'`. Chấp nhận được (incident đã đóng, record chỉ là hồ sơ "đã queue chưa dispatch"), nhưng UI **cần badge tuổi** (`chờ 12 ngày`) để nó không im lặng trôi đi.
3. Enum `status` vẫn **giữ** `'REJECTED'` cho record lịch sử đã có trong Mongo — chỉ **không tạo mới**. Filter Trạng thái vẫn liệt kê để tra cứu dữ liệu cũ.

**🐞 B5 — RBAC bỏ qua được bằng cách không gửi role.**
```
if (body.role && !hasBroadcastPermission(body.role, ...)) return 403;
```
Không gửi `role` trong body ⇒ **check bị bỏ qua hoàn toàn**. Và `role` do client tự khai. Đây là hệ quả đã biết của việc chưa có auth thật (plan v0.3 §15.7 — Kyle đã chốt dùng tạm `username`), nhưng nên đổi `if (body.role && ...)` thành *bắt buộc có role*, để khi cắm auth thật chỉ phải đổi nguồn của biến chứ không phải đổi logic.

---

### §10.8 — SDC Communications Team Notification

**G10 — Có flag, có log, không có broadcast.**
Code hiện có: checkbox `mediaAtScene` trên form tạo incident, field `mediaInvolvement.commsNotified`, và khi bật cờ thì `incidents/[...id]:193-197` đẩy một dòng vào `incident.log` — *"SDC Communications Team notified regarding media presence."*

Nhưng FSD nói: *"the system shall **prompt the Controller to notify the SDC Communications team by broadcast**"* và *"This broadcast would include details of the incident and the media organisation that is present."*

Đang thiếu: (a) **prompt** (notification tới Controller — có thể mở rộng `BroadcastPromptTrigger` thêm `media_present_confirmed`), (b) **broadcast type + template** riêng có biến `{media_organisation}`, (c) **distribution group** "SDC Communications Team", (d) liên kết giữa `commsNotified = true` với một Broadcast ID thật thay vì chỉ một dòng text log.

---

### §10.9 — Broadcast Record and Export

| Yêu cầu | Code | |
|---|---|---|
| a. Mọi broadcast log theo Case + Broadcast ID | ✅ | ✅ |
| b. Record giữ recipient list, template, content, timestamp, authorising user | ◑ | mất `recipientGroups`/`contentDefault`/`subject` (G5, G6) |
| c. Broadcast là 1 section trong incident report export | ❌ **G12** | |
| d. Delivery counts theo status | 🐞 **G11** | |
| e. Acknowledgement count | ❌ **G11** | |

**G11 — Delivery counts đóng băng, acknowledgement là dead field.**
Lúc dispatch: `bc.deliveryCounts = initialDeliveryCounts(n)` → `{ sent: n, delivered: 0, failed: 0, pending: 0 }`. Sau đó **không có một dòng code nào cập nhật lại**.

Trong khi `emailMock.ts` **có** vòng đời đầy đủ: `Queued → Sent → (800ms) → Delivered`, có `deliveredAt`, và có `getEmailQueue({ broadcastId })` để tra cứu. Nhưng dispatch gọi fire-and-forget `.catch(() => {})` và không bao giờ write-back.

→ End user mở detail một broadcast đã gửi thành công 3 ngày trước và thấy: **"sent 3 · delivered 0 · failed 0 · pending 0"**. Đọc như hệ thống hỏng. Đây là chi tiết nhỏ nhưng **phá niềm tin vào toàn bộ module** — người dùng sẽ không tin bất kỳ con số nào khác trên màn hình đó.

`acknowledgedCount` khai báo ở `db.ts:409` và `broadcasts/page.tsx:22`, **không có nơi nào ghi và không có nơi nào hiển thị**. Nên hoặc nối với SMS ack (§11), hoặc bỏ khỏi type để khỏi gây hiểu nhầm.

Thêm nữa: `emailMock` là **in-memory module-level array** → mọi trạng thái delivery **mất sạch khi server restart / cold start**. Nếu muốn delivery status có ý nghĩa, phải persist per-recipient status vào record.

**G12 — Chưa có incident report export.**
`ls src/app/api` không có endpoint export/report nào. §10.9c ("Broadcast content shall be included as a section within the incident report export") chưa thể thoả vì bản thân export chưa tồn tại. Nằm ở §11 Reporting — ghi nhận là dependency, không phải việc của module này.

**G13 — Export CSV hiện tại quá mỏng.**
`exportCsv()` (`broadcasts/page.tsx:86`) xuất 9 cột và **chỉ xuất các dòng đang hiển thị sau filter** (âm thầm, không báo). Thiếu: `channels`, `deliveryCounts`, `contentDispatched`, `crisisLevel`, `recipientGroups`, `contentEditConfirmed`. Với mục đích record-keeping của §10.9, bản CSV này không đủ để làm hồ sơ.

**G14 — Record không có `createdAt` ⇒ mọi thứ liên quan tới thời gian đều sai với PENDING.** 🔴
`BroadcastRecord` (`db.ts:393-425`) chỉ có `sentAt` / `dispatchedAt`. Record PENDING có `sentAt: null`, `dispatchedAt: undefined` → **không mang bất kỳ dấu thời gian nào**. Hai hệ quả nghiêm trọng:

1. **Filter theo khoảng thời gian sẽ loại bỏ 100% record PENDING.** Chọn "tháng 7" → 43 việc đang chờ biến mất khỏi kết quả. Đây là điều kiện chặn trực tiếp cho yêu cầu filter-by-date.
2. **Sort hiện tại đang chôn việc cần làm xuống đáy.** `api/broadcasts/route.ts:28`:
   ```
   const ta = a.sentAt || a.dispatchedAt || '';   // PENDING ⇒ ''
   return tb.localeCompare(ta);                   // '' sort xuống cuối
   ```
   → Danh sách xếp 6 record **đã xong** lên trên, 43 record **cần xử lý** xuống dưới cùng. Đúng ngược với mức độ ưu tiên. Screenshot xác nhận: dòng PENDING nằm dưới toàn bộ dòng SENT.

→ Bắt buộc thêm `createdAt` (và `queuedBy`) vào record; filter date phải cho chọn mốc **Ngày tạo / Ngày gửi**, mặc định *Ngày tạo*; sort mặc định đưa PENDING lên đầu.

**G15 — Broadcast PENDING với 0 người nhận là record chết, không ai được cảnh báo.** 🟠
Screenshot dòng cuối: `SEN/CI/20260623/003-BC001 · CLOSURE · 0 recipients · PENDING`. Nguyên nhân: `resolveMatrixRule()` không tìm được rule khớp (hoặc rule trỏ vào group đã `Inactive`) → `resolveGroupEmails()` trả `[]`. Nhưng:
- Dispatch validation chặn recipient rỗng (`'Cannot dispatch: recipient list is empty.'`) → **record không bao giờ gửi được** trừ khi có người gõ tay email vào.
- **Không có cảnh báo nào** ở bất kỳ đâu — không notification cho admin, không badge trên UI, không dòng log nói "no matrix rule matched".
- Người dùng nhìn vào chỉ thấy "0" ở cột Recipients, không biết đó là lỗi cấu hình chứ không phải chủ ý.

→ Cần: (a) lúc queue, nếu `recipients.length === 0` thì set cờ `resolutionWarning` + gửi notification cho `System Administrator`; (b) UI hiển thị badge `⚠ Chưa khớp rule nào`; (c) drawer chỉ rõ rule/level/type đã thử để admin sửa Matrix.

---

## 3. Bảng tổng hợp gap (ưu tiên)

| ID | Vấn đề | Ref | Loại | Ưu tiên | Ảnh hưởng UI 2 trang? |
|---|---|---|---|---|---|
| **G9** | EOD queue không lọc category/level → 43 PENDING rác | §5.1.2, §10.7 | Gap | 🔴 P0 | ✅ Gốc rễ của vấn đề UX |
| **G14** | `BroadcastRecord` **không có `createdAt`** → filter theo ngày ẩn sạch PENDING; sort chôn PENDING xuống đáy | §10.9b | Gap | 🔴 P0 | ✅ Chặn filter date |
| **G15** | Record PENDING với 0 recipients = **kẹt vĩnh viễn**, UI không cảnh báo | §10.3c | Bug | 🟠 P1 | ✅ |
| **B1** | EOD tạo record trùng cho cùng incident/ngày | §10.7 | Bug | 🔴 P0 | ✅ |
| **G11** | deliveryCounts đóng băng "delivered 0" | §10.9d-e | Bug | 🔴 P0 | ✅ Hiển thị sai |
| **G5** | `recipientGroups`/`matrixRuleId` không lưu vào record | §10.3, §10.9b | Gap | 🔴 P0 | ✅ Chặn UI mới |
| **G6** | Không lưu `contentDefault` → không diff được | §10.4d | Gap | 🔴 P0 | ✅ Chặn diff view |
| ~~**B2**~~ | ~~REJECTED ghi vào `dispatchedBy/At`~~ → **giải bằng cách bỏ Reject** | §10.9b | Bug | 🟢 Đóng | — |
| ~~**B3**~~ | ~~Reject Closure → `not_required`~~ → **giải bằng cách bỏ Reject** | §5.11.1c | Bug | 🟢 Đóng | — |
| **B4** | Broadcast ID sinh bằng `.length + 1` → risk trùng | §10.1 | Bug | 🟠 P1 | — |
| **G2** | Channel "Push Notification" không làm gì | §10.2 | Gap | 🟠 P1 | ✅ UI nói dối |
| **G4** | `template.subject` không dùng, email subject hardcode | §10.4b | Gap | 🟠 P1 | ✅ Preview sai |
| **G8** | `endOfDayTime` là dead config, không có scheduler | §10.7, §13.3 | Gap | 🟠 P1 | ✅ |
| ~~**B7**~~ | ~~Nút Reject hiện cho role không có quyền~~ → **giải bằng cách bỏ Reject** | §3/§13.1 | Bug | 🟢 Đóng | — |
| **B5** | RBAC bỏ qua khi không gửi `role` | §13.1 | Bug | 🟠 P1 | — |
| **B6** | Manual broadcast bắt buộc `caseId` | §10.1d | Bug | 🟡 P2 | ✅ |
| **G1** | Weather Advisory chưa nối template/matrix/trigger | §10.1 | Gap | 🟡 P2 | ✅ |
| **G7** | 8/10 System Notification vẫn client-side | §10.5 | Gap | 🟡 P2 | — |
| **G10** | §10.8 SDC Comms chưa sinh broadcast | §10.8 | Gap | 🟡 P2 | — |
| **G13** | Export CSV thiếu cột | §10.9 | Gap | 🟡 P2 | ✅ |
| **G3** | `acknowledgedCount` dead field | §10.9e | Gap | ⚪ P3 | — |
| **G12** | Broadcast section trong incident report export | §10.9c | Gap | ⚪ P3 | — |

---

## 4. Góc nhìn End User — họ **kỳ vọng** gì?

### Persona A — Duty Manager, 20:05 tối, đang trực

> *"Tôi có 15 phút trước khi bàn giao ca. Cho tôi biết **sự việc nào còn mở** và **cái nào cần báo cho ai**. Đừng bắt tôi đọc 43 khối text giống hệt nhau."*

| Kỳ vọng | Hiện tại đáp ứng? |
|---|---|
| Nhìn 1 màn hình biết ngay còn bao nhiêu việc, đã xử lý bao nhiêu | ❌ Không có progress, không có tổng |
| Việc nghiêm trọng nổi lên trước (Level 1 trước Level 5) | ❌ Không sắp xếp, không hiện crisis level |
| Nhìn 1 dòng là quyết định được: **sự việc gì, mức nào, mở bao lâu, ai nhận** | ❌ Chỉ có Case ID + Incident ID + tên template |
| Duyệt hàng loạt cái giống nhau (10 incident Level 5 → gửi hết 1 lần) | ❌ Phải cuộn và bấm từng cái |
| Thấy đúng email mà người nhận sẽ thấy (subject + body) | ❌ Thấy plaintext monospace trong textarea, subject sai (G4) |
| Sửa nội dung thì thấy rõ mình sửa gì trước khi ký xác nhận | ❌ Checkbox không kèm diff |
| Từ chối thì ghi được lý do | ❌ Không có ô lý do |
| Biết cutover mấy giờ, lần chạy cuối lúc nào | ❌ Không hiển thị |
| Xong rồi biết chắc là xong (feedback rõ ràng) | ❌ Item biến mất, lỗi thì `alert()` |

### Persona B — Controller / Ops Admin, tra cứu hồ sơ

> *"Tuần trước có gửi thông báo đóng vụ Siloso không? Gửi cho ai? Ai duyệt? Có ai không nhận được không?"*

| Kỳ vọng | Hiện tại đáp ứng? |
|---|---|
| Tìm theo Case ID / Incident ID / email người nhận | ❌ Không có ô search |
| Lọc theo khoảng thời gian | ❌ Không có date range |
| Lọc theo loại / mức khủng hoảng / trạng thái FAILED, REJECTED | ◑ Chỉ có All / Pending / Sent |
| Biết broadcast này gửi cho **nhóm nào** | ❌ Chỉ có danh sách email trần (G5) |
| Biết đã đến nơi chưa | ❌ "delivered 0" mãi mãi (G11) |
| Gửi link cho đồng nghiệp xem đúng record đó | ❌ Detail là state trong React, không có URL |
| Xuất hồ sơ đầy đủ để lưu | ◑ CSV thiếu cột (G13) |
| Danh sách vẫn dùng được khi có 2.000 bản ghi | ❌ Không phân trang, render hết |

### Persona C — Recipient (Beach Operator, F&B tenant)

> *"Tôi nhận email tiêu đề `[SDC] Closure Broadcast — SEN/CI/20260621/002-BC001`. Cái này là gì? Có phải việc của tôi không?"*

→ **G4** là vấn đề của persona này. Subject phải là `[SDC] Incident Closed: Siloso Beach Power Outage` — template đã cấu hình sẵn đúng như vậy, chỉ là code không dùng.

---

## 5. Đánh giá UI/UX hiện tại — chi tiết theo screenshot

### 5.1 Trang `/broadcasts`

| ID | Vấn đề | Lý do |
|---|---|---|
| **U1** | 3 metric card chiếm ~120px chiều dọc cho 3 con số | "Pending 43" là **cảnh báo**, không phải metric. Thiếu thông tin thực sự cần: *cái pending lâu nhất bao nhiêu ngày?* |
| **U2** | Bảng thiếu cột quyết định: Crisis Level, Case, Channels, ai duyệt | Crisis Level là **trục routing chính** của cả §10 mà không xuất hiện ở đâu trên bảng |
| **U3** | Tabs chỉ `All / Pending / Sent` | Không lọc được `REJECTED`/`FAILED` (đang lẫn trong All với badge xám). Không search, không date range, không lọc type, không sort được cột, không phân trang |
| **U4** | Detail panel làm **co bảng** (`gridTemplateColumns: '1.3fr 1fr'`) | Click 1 dòng → toàn bộ bảng reflow, cột nhảy, mất vị trí đang đọc. Nên dùng drawer overlay hoặc route `/broadcasts/[id]` |
| **U5** | Recipients = `<textarea>` chuỗi comma | Không chip, không biết nhóm nguồn, không validate email, không dedupe, không nút "khôi phục mặc định" sau khi lỡ xoá |
| **U6** | Checkbox xác nhận sửa nội dung không kèm diff | Người dùng ký xác nhận mù (xem G6) |
| **U7** | Cả dòng `<tr onClick>` mở detail nhưng không có affordance | `mono-id` trông như link (viền xanh) nhưng không phải link. Không cursor pointer rõ, không hover highlight |
| **U8** | Dữ liệu xấu hiển thị trần | Screenshot: `BC-DEMO-9004` — Type rỗng, Incident `—`, Recipients `0`, Status `SENT`. Một broadcast SENT tới 0 người là vô nghĩa nhưng UI trình bày như bình thường |
| **U9** | Lỗi dùng `alert()` | `alert('Failed: ...')` × 4 chỗ — không hợp design system Warm Resort-Luxury, chặn luồng, không copy được |

### 5.2 Trang `/broadcasts/eod-review`

| ID | Vấn đề | Lý do |
|---|---|---|
| **U10** | **Mỗi card ~450px, textarea 6 dòng luôn mở** | Screenshot: 2 card đã hết 1 màn hình. Với 43 item = **~19 màn hình cuộn**. Không dùng được trong 15 phút bàn giao ca |
| **U11** | **Không có context sự việc** | Card chỉ có Broadcast ID, Incident ID, Case ID, tên template, channels. Thiếu: **tiêu đề sự việc, crisis level, incident type, trạng thái hiện tại, mở bao lâu, cập nhật lần cuối, ai đang xử lý**. DM không đủ dữ liệu để quyết định gửi hay không |
| **U12** | Không có bulk action | Không checkbox, không "Dispatch all Level 5". Với 43 item đây là gap chí mạng |
| **U13** | Không filter / sort / search / nhóm | Không sắp theo crisis level, không lọc theo type |
| **U14** | Không có progress | Không biết "đã xử lý 12/43". Xử lý xong 1 cái thì nó biến mất, mất cảm giác tiến độ |
| **U15** | Header không nói gì về lịch | Nút "Run End-of-Day Check Now" mà không hiển thị **cutover time đã cấu hình (20:00)** và **lần chạy cuối**. `lastRun` chỉ ở React state → refresh là mất |
| **U16** | ~~Reject không hỏi lý do~~ → **bỏ hẳn nút Reject** (Kyle 2026-07-26). Mục không gửi cứ để `PENDING`; view theo-đêm tự phân loại |
| **U17** | Không preview email thật | DM duyệt nội dung dạng monospace trong `<textarea>` — khác hoàn toàn email người nhận thấy. Và subject đang sai (G4) |
| **U18** | Empty state gộp 2 tình huống khác nhau | *"Nothing pending. Every open incident has been reviewed, **or** the End-of-Day check hasn't run yet today."* — hai trạng thái này đòi hai hành động ngược nhau. Nếu lưu `lastEodRunAt` thì phân biệt được |
| **U19** | Không có undo / confirm | Bấm Dispatch là email bay đi ngay, không xác nhận, không hoàn tác. Với broadcast ra ngoài tổ chức, rủi ro cao |

---

## 6. Đề xuất redesign — GỘP thành 1 trang, 2 tab

> **Chốt với Kyle 2026-07-26:** gộp `/broadcasts` + `/broadcasts/eod-review` thành **một trang, hai tab**.
> Tab chia theo **công việc**, không theo loại record. Bỏ KPI card. Filter "phân loại" = **loại broadcast**. Desktop-first, ghi chú breakpoint tablet để làm sau.

### 6.1 Vì sao chia tab theo *công việc* chứ không theo *loại record*

Về dữ liệu, EOD item **chính là** `BroadcastRecord` với `type = 'End-of-Day'`. Nếu tab 1 đã có filter Type + Status thì tab EOD **thừa với tư cách là một danh sách** — lý do duy nhất nó tồn tại là *quy trình duyệt hàng loạt theo đêm*.

Quan trọng hơn: cách chia "Broadcast / End-of-Day" để lộ một lỗ hổng —
**broadcast Closure đang PENDING không có hàng chờ nào cả.** Nó không thuộc tab EOD (sai `type`), và ở tab hồ sơ nó chỉ là một dòng lẫn giữa các dòng khác (lại còn bị sort xuống đáy — G14). Controller **không có "queue của tôi"**.

| Tab | Bản chất | Trục tổ chức | Ai dùng | Quyền |
|---|---|---|---|---|
| **1 · Broadcasts** | Hồ sơ + tra cứu + worklist đơn lẻ | **Record-centric** | Controller, Ops Admin, Analyst | `broadcast.view` (+ `dispatch` để thao tác) |
| **2 · End-of-Day Interim** | Duyệt theo lô cuối ngày + tuân thủ | **Day-centric** | Duty Manager / Duty Officer | `broadcast.eod_review` |

Sự khác nhau giữa 2 tab lúc này mới **có ý nghĩa**: tab 1 xoay quanh *một bản ghi*, tab 2 xoay quanh *một đêm*. Và đó chính là lý do tab 2 cần trục thời gian còn tab 1 thì không bắt buộc.

Worklist của **Closure** = chip `Chờ xử lý (43)` ở tab 1 — dùng lại đúng UI đó, không cần tab thứ ba.

### 6.2 Ba điều kiện kỹ thuật bắt buộc khi gộp

| # | Vấn đề | Xử lý |
|---|---|---|
| M1 | **RBAC theo tab.** `Controller` có `view/compose/dispatch` nhưng **không có `eod_review`** | Tab 2 **ẩn hoàn toàn** với role thiếu quyền — không render rồi báo 403. `Operational Resilience Analyst` (chỉ `view`) → tab 1 read-only, ẩn mọi nút action |
| M2 | **Deep link cũ đã nằm trong Mongo.** `cron/eod-broadcast` ghi `link: '/broadcasts/eod-review'` vào các `NotificationRecord` **đã tồn tại** | Giữ `/broadcasts/eod-review` như **redirect** → `/broadcasts?tab=eod`. Đổi link trong code cron sang URL mới cho record tương lai |
| M3 | **Badge count trên tab** | `End-of-Day Interim (5)` — số mục **chưa xử lý của đêm hiện tại**. Không có số thì phải click mới biết có việc |

### 6.3 State nằm trên URL (áp dụng cả 2 tab)

```
/broadcasts?tab=records&period=2026-07-01..2026-07-26&status=PENDING&type=Closure&level=1,2&q=siloso&id=SEN%2FCI%2F...-BC001
/broadcasts?tab=eod&date=2026-07-26
```

Lợi ích: bookmark được, gửi link cho đồng nghiệp, back-button đúng, mở drawer rồi đóng không mất filter, và refresh không reset. Hiện tại toàn bộ filter + selection là React state → mất sạch khi F5.

---

### 6.4 TAB 1 — "Broadcasts" (hồ sơ, record-centric)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ BROADCASTS                                                        (.page-header-bar) │
│ Hồ sơ broadcast & hàng chờ duyệt — FSD §10.9                                         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 📡 Broadcasts (49)   🌆 End-of-Day Interim (2)      ← page tab, style case-management │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌── .glass · padding 20px · flex column · gap 16px ───────────────────────────────┐  │
│ │ Chờ xử lý ⟨43⟩  Đã gửi ⟨6⟩  Tất cả ⟨49⟩   [⚙] [🔎 Search broadcast ID…] [+ New] │  │ ← frow chính
│ │ ─────────────────────────────────────────────────────────────────────────────── │  │   border-bottom
│ │ LỌC NGÀY THEO   TỪ NGÀY      ĐẾN NGÀY     LOẠI BROADCAST    MỨC KHỦNG HOẢNG      │  │ ← advanced grid
│ │ [Ngày tạo  ▾]   [01/07/2026] [26/07/2026] [All Types    ▾]  [Level 1, 2       ▾] │  │   auto-fill
│ │ NHÓM NGƯỜI NHẬN NGƯỜI GỬI    KÊNH GỬI     KẾT QUẢ GIAO NHẬN NỘI DUNG             │  │   minmax(180px,1fr)
│ │ [All Groups ▾]  [tên…      ] [All      ▾] [All          ▾]  [All            ▾]  │  │   gap 16px
│ │                                                              Clear Filters       │  │
│ └─────────────────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┃  BROADCAST ID           LOẠI       MỨC  SỰ VIỆC / CASE         NGƯỜI NHẬN  KÊNH TT │
│ ┃▌ SEN/CI/…/003-BC001     Closure    ⬤5   Beach Litter Report    ⚠ 0 người   ✉   ○  │
│ ┃  tạo 3 ngày trước · system               SEN/IR/20260623/0002   chưa khớp rule     │
│ ┃                                                                       [Xem xét →] │
│ ┃▌ SEN/CI/…/002-BC001     Closure    ⬤2   Siloso Power Outage     3 · SDC Cr ✉📱 ●  │
│ ┃  gửi 22/07 04:07  ✎đã sửa                SEN/IR/20260621/0001             ✓2/⚠1   │
│                                               ‹ 1 2 3 › · Hiện 1–25 / 49            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

> **Tín hiệu "có việc" nằm ở đâu sau khi bỏ dải chip (D2 + D10)?** → Ở **count pill trên sub-tab trạng thái**: `Chờ xử lý (43) │ Đã gửi (6) │ Tất cả (49)`. Đúng cách `CaseLogTab.tsx` đang làm (`Active Cases (12) │ All Cases (49)`) — vừa giữ tín hiệu, vừa **không thêm control lạ**, vừa bớt 1 hàng so với mockup v1.

**Thay đổi so với hiện tại:**

| # | Việc | Lý do |
|---|---|---|
| T1.1 | **Bỏ 3 KPI card**, không thay bằng control mới. Tín hiệu chuyển vào **count pill trên sub-tab trạng thái** | Đúng pattern `CaseLogTab.tsx`. Tiết kiệm ~120px chiều dọc (D2 + D10) |
| T1.2 | **Sort mặc định: PENDING lên đầu**, rồi tới mới nhất | Hiện đang ngược (G14) — 43 việc cần làm bị chôn dưới 6 việc đã xong |
| T1.3 | **Cột mới: Mức khủng hoảng** (chấm màu + số) | Trục routing chính của cả §10 mà không xuất hiện ở đâu trên UI |
| T1.4 | **Cột Sự việc = tiêu đề thật**, không chỉ ID | Không ai nhớ `SEN/IR/20260623/0002` là vụ gì |
| T1.5 | **Cột Người nhận = số + tên nhóm** (`3 · SDC Crisis Command`) | Cần G5. Hiện chỉ có con số trần, vô nghĩa cho tra cứu |
| T1.6 | **Icon kênh (✉ 📱) + kết quả giao nhận (✓3/3, ⚠1 lỗi)** | Cần G11. Hiện "delivered 0" mãi mãi |
| T1.7 | **Accent bar trái theo loại** — Closure teal · EOD orange · Weather purple · Manual xám | Nhìn màu phân loại được, không phải đọc chữ |
| T1.8 | **Badge `⚠ chưa khớp rule`** cho record 0 người nhận | G15 — hiện chỉ hiện "0", user không biết đó là lỗi cấu hình |
| T1.9 | **Nút `Xem xét →` inline** trên dòng PENDING | Đây là worklist của Closure. Không phải click mò vào dòng |
| T1.10 | **Dòng phụ nhỏ dưới ID**: thời gian tương đối + cờ `✎sửa` nếu `contentEditConfirmed` | Bỏ được cột Dispatched riêng, và cờ sửa nội dung là tín hiệu tuân thủ §10.4d |
| T1.11 | **Phân trang 25 + filter server-side** | 49 record thì client-filter ổn; 2.000 thì chết. Số trên chip lấy từ endpoint aggregate riêng, không đếm từ mảng đã load |
| T1.12 | **Toast thay 4 chỗ `alert()`** | Không hợp design system, chặn luồng, không copy được nội dung lỗi |

**Bộ filter đầy đủ** (⭐ = anh đã nêu, ➕ = bổ sung):

| Filter | Nguồn dữ liệu | Ghi chú |
|---|---|---|
| ⭐ **Khoảng thời gian** + chọn mốc `Ngày tạo` / `Ngày gửi` | `createdAt` (**mới — G14**) / `dispatchedAt` | Mặc định *Ngày tạo* để PENDING không biến mất. Preset: Hôm nay · 7 ngày · 30 ngày · Tháng này · Tuỳ chọn |
| ⭐ **Trạng thái** (multi) | `status` + `eodDate` | `Chờ xử lý` · `Đã gửi` · `Lỗi` · `Không gửi` (= `PENDING` mà `eodDate` đã qua) · `REJECTED` (chỉ để tra dữ liệu cũ). Hiện chỉ có All/Pending/Sent |
| ⭐ **Loại broadcast** (multi) | `type` | Closure · End-of-Day · Weather Advisory · Manual |
| ⭐ **Tìm kiếm** | id, caseId, incidentId, incidentTitle, recipients | 1 ô search chung, không phải 5 ô |
| ➕ **Mức khủng hoảng** | `crisisLevel` (**mới**) | *"Xem mọi broadcast Level 1–2 tháng này"* |
| ➕ **Nhóm người nhận** | `recipientGroups` (**mới — G5**) | *"Vụ nào đã gửi cho Beach Operators?"* |
| ➕ **Người duyệt/gửi** | `dispatchedBy` | Audit + rà separation-of-duties |
| ➕ **⚠ Nội dung đã sửa khác template** | `contentEditConfirmed` | **Filter tuân thủ §10.4d quan trọng nhất** — hầu như không ai nghĩ tới, nhưng auditor sẽ hỏi đúng câu này |
| ➕ **Kết quả giao nhận** | `recipientStatus` (**mới — G11**) | Khác với status: `SENT` nhưng vẫn có thể có recipient `Failed` |
| ➕ **Kênh gửi** | `channels` | Email / Push — để dưới `⚙ Thêm` cho gọn |
| ➕ **Incident Type / Sub-type** | `incidentType` (**mới**) | §10.1(e) ghi rõ là determinant |

> Tổ chức: 4 filter hay dùng nhất nằm ngoài (Ngày · Loại · Trạng thái · Mức), phần còn lại gom vào dropdown `⚙ Thêm` để thanh filter không tràn.

**Export** phải nói rõ phạm vi (sửa G13):
```
[Export ▾]  → Xuất 24 bản ghi đang lọc  (CSV / XLSX)
             Xuất tất cả 2.140 bản ghi
             ─────────────────────────
             ☑ Kèm nội dung dispatch  ☑ Kèm chi tiết giao nhận
```
Hiện `exportCsv()` **âm thầm** chỉ xuất dòng đang lọc — với bộ filter phong phú thì rất nguy hiểm cho hồ sơ.

---

### 6.5 Chi tiết broadcast — bỏ panel hẹp, dùng drawer rộng + full-page

**Chẩn đoán lại vấn đề "khó xem content":** không chỉ do panel hẹp 480px. Nguyên nhân chính là **cách render**:
```
<pre style={{ fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}>
```
Monospace 11.5px trong cột hẹp thì rất mệt mắt. **Nới rộng mà vẫn monospace 11.5px sẽ không cứu được** — chỉ khiến dòng dài hơn, thậm chí tệ hơn. Cộng thêm `gridTemplateColumns: '1.3fr 1fr'` khiến mở detail là **co cả bảng**, cột nhảy, mất chỗ đang đọc.

**Giải pháp 2 tầng:**

| Tầng | Dùng khi | Đặc điểm |
|---|---|---|
| **Drawer overlay 800px** ⭐ mặc định | Xem nhanh khi đang quét danh sách | Overlay, **không co bảng**; ESC đóng; sync `?id=` lên URL; có nút `↗ Mở toàn trang` |
| **Route `/broadcasts/[id]`** | Rà soát kỹ, chia sẻ link, **in ra làm hồ sơ** | Rộng nhất; deep-link; print stylesheet; mở tab mới được |

**Và sửa typography — đây mới là phần quyết định:**
- Content render như **email preview thật**: card nền `--bg-card`, dòng **Subject** ở trên (cần G4), body dùng `Inter 13.5px`, **giới hạn ~70 ký tự/dòng**, `line-height: 1.6`.
- 3 tab nội dung: **`Preview`** (mặc định) ‖ `Nguồn` (monospace, cho ai cần) ‖ `Diff` (so với template mặc định — cần G6).
- Drawer 800px + text giới hạn 70ch → phần dư dùng cho bảng giao nhận đặt cạnh, không để dòng chữ kéo dài vô tận.

```
┌── SEN/CI/20260621/002-BC001 ─────────────────── [↗ Toàn trang] [🖨] [×] ──┐
│ ▌Closure Broadcast · ⬤ Level 2 · ● ĐÃ GỬI · ✎ nội dung đã sửa            │
├───────────────────────────────────────────────────────────────────────────┤
│ ĐỊNH TUYẾN                                              (cần G5)          │
│   Rule khớp    mat-l2 · Level 2 · Any type        Template  Std Closure    │
│   Nhóm nhận    SDC Crisis Command                 Kênh      ✉ Email 📱 Push│
├───────────────────────────────────────────────────────────────────────────┤
│ NGƯỜI NHẬN (3)                          [+ Thêm]   [↺ Khôi phục mặc định] │
│   ⟨silosocafe@food.com.sg ×⟩ ⟨ops@olabeach.com.sg ×⟩ ⟨john.doe@… ×⟩       │  ← chip, không textarea
│   +1 thêm thủ công · 0 đã gỡ khỏi nhóm gốc                                │
├───────────────────────────────────────────────────────────────────────────┤
│ NỘI DUNG              ▸ Preview ◂  │  Nguồn  │  Diff (3 dòng đổi)         │
│ ┌─────────────────────────────────────────────┬───────────────────────────┐│
│ │ [SDC] Incident Closed: Siloso Beach Power   │ GIAO NHẬN         (G11)   ││
│ │ ─────────────────────────────────────────── │ silosocafe@…  ✓ 05:45:12  ││
│ │ INCIDENT CLOSURE NOTICE                     │ ops@olabeach…  ✓ 05:45:13 ││
│ │                                             │ john.doe@…    ⚠ Failed    ││
│ │ Case ID: SEN/CI/20260621/002                │    mailbox full [Gửi lại] ││
│ │ Incident ID: SEN/IR/20260621/0001           │                           ││
│ │ …  (Inter 13.5px · ~70ch · line-height 1.6) │ Tổng: 2/3 thành công      ││
│ └─────────────────────────────────────────────┴───────────────────────────┘│
├───────────────────────────────────────────────────────────────────────────┤
│ HỒ SƠ   Duyệt & gửi: duty.manager.lim · 22/07 04:07 · [Audit Log ↗]       │
└───────────────────────────────────────────────────────────────────────────┘
  [khi PENDING — footer sticky]                          [Duyệt & Gửi →]
  (KHÔNG có nút Từ chối — xem B2/B3/B7)
```

---

### 6.6 TAB 2 — "End-of-Day Interim" (theo đêm, day-centric)

> **Điều kiện tiên quyết:** fix **G9** (gate category + level) và **B1** (`eodDate`) trước. Nếu queue vẫn 43 mục rác thì không layout nào cứu được. Sau khi lọc, con số thực tế nên vào khoảng **5–12 mục/đêm** — vừa với thiết kế dưới.

**Vấn đề gốc mà yêu cầu filter-date của anh đã chạm đúng:** tab EOD hiện tại **không có khái niệm "ngày"**. Nó fetch `?type=End-of-Day&status=PENDING` — một live queue. Dispatch hoặc reject xong là mục **biến mất vĩnh viễn**. Nên tình huống *"3 gửi, 2 không gửi"* hiện có 2 khả năng **không phân biệt được**:

| Trường hợp | Hiện tại |
|---|---|
| DM **quyết định không gửi** | Hiện phải bấm Reject → biến mất khỏi tab EOD, ghi sai field (B2). **Sau khi bỏ Reject: cứ để `PENDING`, hết đêm tự thành "không gửi"** |
| DM **chưa đụng tới** → vẫn `PENDING` | **Trôi sang đêm sau**, trộn với batch mới, **không cách nào biết nó của đêm nào** |

Trường hợp 2 mới nguy hiểm — 43 pending hiện tại gần như chắc chắn chứa tồn đọng nhiều đêm.

→ Vì vậy đề xuất **không dừng ở "filter date"** mà làm hẳn **day navigator**, và hiển thị **đủ mọi kết quả của đêm đó**, không chỉ pending.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────┬──────────────────────────┐                                    │
│ │ Broadcasts     │ End-of-Day Interim  (1)  │                                    │
│ └────────────────┴──────────────────────────┘                                    │
├──────────────────────────────────────────────────────────────────────────────────┤
│  ‹ 25/07        ●  26/07 · Hôm nay        27/07 ›     [📅 26/07/2026]            │
│  Cutover 20:00 · đã chạy 20:03 · 5 sự việc                     [⟳ Chạy lại check] │
│  ████████████████░░░░  3/5 đã gửi  ·  ✓3 đã gửi  ·  ⊙2 chưa gửi (còn trong đêm)  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ☑ 2 đã chọn    [Gửi 2 mục đã chọn]                                Bỏ chọn tất cả │  ← bulk bar
├────────────────────────────────┬─────────────────────────────────────────────────┤
│ Sắp xếp: Mức độ ↓   Lọc: ▾    │  SEN/IR/20260612/9004                            │
│                                │  Demo: Siloso Beach Outage                       │
│ ⚠ ☑ ⬤1  Siloso Beach Outage   │  ⬤ Level 1 · Facilities — Power Outage · Live    │
│      Facilities—Power · Live   │  Mở 2 ngày 4 giờ · cập nhật cuối 14:20           │
│      Mở 2d · 3 người · SDC Cr  │  Controller: nguyen.vh · Responder: 2 active     │
│ ─────────────────────────────  │  ─────────────────────────────────────────────── │
│   ☑ ⬤2  Cable Car Stoppage    │  NGƯỜI NHẬN   SDC Crisis Command · ✉ 📱          │
│      Attraction · Live (Asgn)  │  ⟨silosocafe@… ×⟩ ⟨ops@olabeach… ×⟩ ⟨john… ×⟩    │
│      Mở 1d · 3 người · SDC Cr  │  [+ Thêm]  [↺ Khôi phục mặc định]                │
│ ─────────────────────────────  │  ─────────────────────────────────────────────── │
│ ✓ ⬤4  Beach Litter Report     │  NỘI DUNG    ▸Preview◂ │ Sửa │ Diff              │
│      đã gửi 20:11 · dm.lim     │  ┌────────────────────────────────────────────┐  │
│ ─────────────────────────────  │  │ [SDC] End-of-Day Interim Update: Demo…     │  │
│ ⊙ ⬤5  False Alarm — Gate 3    │  │ ────────────────────────────────────────── │  │
│      chưa gửi                  │  │ END-OF-DAY INTERIM UPDATE                  │  │
│      giả, không ảnh hưởng"     │  │ Case ID: CASE-DEMO-ONGOING …               │  │
│ ─────────────────────────────  │  └────────────────────────────────────────────┘  │
│ ✓ ⬤5  Lost Property           │                                                  │
│      đã gửi 20:11 · dm.lim     │                                 [Duyệt & Gửi →] │  ← sticky
└────────────────────────────────┴─────────────────────────────────────────────────┘
```

| # | Việc | Giải quyết |
|---|---|---|
| T2.1 | **Day navigator** `‹ 25/07 · 26/07 hôm nay · 27/07 ›` + date picker | Yêu cầu filter-date của anh. Cần `eodDate` (task 0.5) |
| T2.2 | **Hiển thị đủ mọi mục của đêm** — `✓ Đã gửi` / `⊙ Chưa gửi` (đêm đang diễn ra, badge cam) / `⊙ Không gửi` (đêm đã qua, làm mờ) | Đúng tình huống "3 gửi, 2 không gửi". **Không cần status `REJECTED`** — `PENDING` + `eodDate` đã qua chính là "không gửi" |
| T2.3 | **Master–detail thay stack card** — dòng compact ~72px, thấy 8–10 mục cùng lúc | Hiện mỗi card ~450px với textarea 6 dòng luôn mở → 43 mục = ~19 màn hình cuộn (U10) |
| T2.4 | **Ngữ cảnh sự việc trên mỗi dòng**: mức, tiêu đề, type, trạng thái, **mở bao lâu**, số người + nhóm | Hiện chỉ có Broadcast ID + Incident ID + tên template — không đủ để quyết định (U11) |
| T2.5 | **Sort mặc định theo mức khủng hoảng ↓** | Level 1 mà nằm cuối danh sách là rủi ro vận hành thật |
| T2.6 | **Bulk select + bulk action** | 8 mục Level 5 giống nhau → một cú bấm (U12) |
| T2.7 | **Progress bar + phân rã kết quả** | "4/5 · gửi 3 · bỏ 1 · **sót 1**" (U14) |
| T2.8 | **Header nói rõ lịch**: cutover từ `endOfDayTime`, lần chạy cuối từ `lastEodRunAt` (persist) | Hiện `lastRun` chỉ ở React state → F5 là mất (U15) |
| T2.9 | **KHÔNG có nút Từ chối / Bỏ qua** (Kyle chốt 2026-07-26) | Mục không gửi cứ để `PENDING`; hết đêm tự thành "không gửi" theo `eodDate`. Bỏ luôn B2/B3/B7 và câu hỏi phân quyền `broadcast.reject` |
| T2.10 | **Xác nhận trước khi gửi hàng loạt** + toast Undo 5 giây khi gửi lẻ | Broadcast ra ngoài tổ chức, không có hoàn tác là rủi ro cao (U19) |
| T2.11 | **Empty state tách 2 tình huống** | *"Chưa chạy kiểm tra cuối ngày — cutover 20:00"* ≠ *"Đã duyệt hết 5 mục lúc 20:14"* (U18) |

**Xử lý tồn đọng (carry-over) — đã giải bằng `eodDate`, KHÔNG cần Reject:** mỗi record **thuộc về đúng một đêm** (`eodDate`) và **ở lại đêm đó vĩnh viễn**. Sang 27/07, cron tạo bộ record mới; record của 26/07 không bị đụng tới, không trôi sang, không trộn lẫn.

Do đó **không còn khái niệm "tồn đọng"** — chỉ có *"đêm 26/07 có 2 mục không gửi"*, một sự kiện lịch sử đã đóng, không phải việc còn treo. Đây chính là điểm mạnh của mô hình Kyle chọn: **bỏ Reject + thêm `eodDate`** giải quyết cùng lúc B1, B2, B3, B7 lẫn carry-over.

> Phân biệt trên UI: `⊙ Chưa gửi` (đêm nay, còn thời gian, badge cam) ≠ `⊙ Không gửi` (đêm đã qua, làm mờ, badge xám). Cùng `status: PENDING`, khác nhau ở chỗ `eodDate` đã qua hay chưa.

---

### 6.7 Chuẩn style Filter & Search — bám 100% pattern hệ thống (D12)

**Reference implementation trong repo:** `src/components/tabs/CaseLogTab.tsx` (dòng 153–392) + token trong `src/app/globals.css`. Không tự chế control mới — copy cấu trúc, chỉ đổi nội dung field.

**Precedent cho trang nhiều tab:** `src/app/case-management/page.tsx` — 5 tab, state qua `?tab=` bằng `useSearchParams()` + `router.replace()`. Trang Broadcasts gộp dùng **đúng** pattern này (`/broadcasts?tab=records|eod`).

#### Cấu trúc filter card (copy nguyên khung)

```
<div className="glass" style={{padding:20, display:'flex', flexDirection:'column', gap:16}}>

  {/* Hàng chính — justify-between, borderBottom 1px, paddingBottom 12 */}
  ├── TRÁI: sub-tab trạng thái (.tab-btn) + count pill
  └── PHẢI: [nút ⚙ toggle filter] [ô search] [+ New Broadcast]

  {/* Advanced filters — chỉ hiện khi showAdvanced */}
  └── grid: repeat(auto-fill, minmax(180px,1fr)), gap 16
      mỗi ô = .form-group > <label> + <select className="form-control select-dark">
      cuối grid: gridColumn '1/-1', justify-end → nút "Clear Filters"
</div>
```

#### Spec từng control

| Control | Class / style hệ thống | Ghi chú |
|---|---|---|
| **Sub-tab trạng thái** | `.tab-btn` · `borderBottom: 2px solid var(--color-primary)` khi active · padding `8px 16px` · 13px/600 | Y hệt `Active Cases / All Cases` của CaseLogTab |
| **Count pill** | 11px/700 · `padding 2px 8px` · `borderRadius 10px` · `minWidth 20px` · bg `--color-primary-bg` khi active, `--bg-inset` khi không | Chỗ chứa số **43** |
| **Nút toggle filter** | `.btn .btn-info` khi mở / `.btn .btn-secondary` khi đóng · `36×36px` · icon phễu SVG | Giữ nguyên icon phễu của CaseLogTab |
| **Ô search** | `.form-control` · `height 36px` · `maxWidth 300px` · `paddingLeft 36px` + SVG kính lúp `position:absolute; left:12px` · **debounce ~400ms** | CaseLogTab đã debounce sẵn — copy |
| **Label filter** | 11px · 700 · `uppercase` · `letterSpacing .04em` · `--text-muted` · `marginBottom 4px` | |
| **Select đơn** | `.form-control.select-dark` (đã có mũi tên SVG nền) · `width 100%` | |
| **Input ngày** | `<input type="date" className="form-control">` · `height 36px` | Cùng lối `.metrics-filter-bar input[type=date]` ở dashboard |
| **Multi-select (Mức khủng hoảng)** | `<button className="form-control">` + dropdown absolute · `zIndex 50` · checkbox `accentColor var(--color-primary)` | Copy y "Linked Records" của CaseLogTab |
| **Clear Filters** | `.btn.btn-secondary` · `background transparent` · `border none` · `textDecoration underline` · `height 34px` · đặt ở `gridColumn '1/-1'` căn phải | Chỉ hiện khi có ít nhất 1 filter đang bật |
| **Focus ring** | `.form-control:focus` → `border-color var(--border-focus)` + `box-shadow 0 0 0 3px rgba(255,130,0,.12)` | Đã có sẵn trong globals.css |

#### Danh sách field trong advanced grid (11 ô)

`Lọc ngày theo` (Ngày tạo / Ngày gửi) · `Từ ngày` · `Đến ngày` · `Loại broadcast` · `Mức khủng hoảng` (multi) · `Nhóm người nhận` · `Người duyệt/gửi` · `Kênh gửi` · `Kết quả giao nhận` · `Nội dung` (đã sửa khác template §10.4d) · `Incident type`

> Grid `auto-fill minmax(180px, 1fr)` tự xuống dòng — không cần thiết kế riêng cho từng breakpoint, và thêm/bớt field sau này không vỡ layout.

#### Quy tắc hành vi (copy CaseLogTab)

1. Mọi thay đổi filter → `setPage(1)`.
2. Search **debounce 400ms** rồi mới gọi API; các filter khác gọi ngay.
3. Filter đẩy vào `URLSearchParams` → gọi server, **không lọc phía client**.
4. Advanced grid **mặc định đóng**; mở/đóng nhớ theo `localStorage`.
5. Toàn bộ filter đồng bộ 2 chiều với URL (`?tab=&status=&type=&level=&from=&to=&q=`).

---

### 6.8 Vấn đề chung của cả 2 tab (dễ sót)

| # | Vấn đề | Xử lý |
|---|---|---|
| C1 | **2 DM cùng duyệt một queue** — A dispatch, màn hình B đã cũ, bấm → 409 hiện qua `alert()` | Refetch định kỳ (30s) + thông báo mềm *"mục này vừa được lim xử lý lúc 20:11"* + tự cập nhật dòng, không văng lỗi |
| C2 | **In hồ sơ** | Route `/broadcasts/[id]` + print stylesheet. Drawer không in được |
| C3 | **Filter/tab state khi back** | Đã giải bằng URL state (§6.3) |
| C4 | **Empty state sau khi lọc** ≠ **empty state vì không có dữ liệu** | *"Không có broadcast nào khớp bộ lọc"* + nút Xoá lọc, khác với *"Chưa có broadcast nào"* |
| C5 | **Tablet** | Chưa chốt — desktop-first. Ghi chú breakpoint: `<1024px` drawer → full-screen; master–detail → 1 cột có nút Back; bulk action → thanh cố định dưới; target chạm ≥44px |

## 7. Thay đổi data model cần có để đỡ UI mới

Nếu không làm phần này thì UI ở §6 **không thể** dựng được (thiếu dữ liệu để hiển thị).

### `BroadcastRecord` (`src/lib/db.ts:393`) — thêm

| Field | Kiểu | Vì sao | Ref |
|---|---|---|---|
| `recipientGroups` | `string[]` | Hiển thị "Nhóm: SDC Crisis Command"; ghi hồ sơ đúng §10.9b | G5 |
| `matrixRuleId` | `string?` | Truy vết rule nào đã fire (debug routing) | G5 |
| `templateId` | `string?` | `templateUsed` là **tên** — đổi tên là mất dấu | G5 |
| `subject` | `string?` | Snapshot subject đã render, dùng cho email + preview | G4 |
| `contentDefault` | `string?` | Bản render mặc định lúc queue — để diff và audit deviation | G6 |
| `crisisLevel` | `string?` | Cột bảng + sort + filter, không phải join incident mỗi lần | U2, U11 |
| `incidentType` / `incidentSubType` | `string?` | Cột bảng + context EOD | U11 |
| `incidentTitle` | `string?` | Dòng danh sách EOD đọc được, không chỉ ID | U11 |
| **`createdAt`** | `string` ISO | 🔴 **Bắt buộc.** Không có nó thì filter theo ngày ẩn sạch PENDING và sort chôn việc cần làm xuống đáy | **G14** |
| `queuedBy` | `string?` | Ai/cái gì đã tạo record (`system` cho cron, username cho manual) | §10.9b |
| **`eodDate`** | `string?` `YYYY-MM-DD` | 🔴 **Bắt buộc.** Vừa là guard idempotency EOD, vừa là trục của view theo-đêm, vừa **thay thế hoàn toàn nhu cầu có status `REJECTED`** | **B1**, T2.2 |
| `resolutionWarning` | `string?` | Ghi lý do resolve hỏng (vd `no_matrix_rule_matched`) để UI badge `⚠ chưa khớp rule` | **G15** |
| ~~`rejectedBy/At/Reason`~~ | — | ❌ **KHÔNG thêm** — Kyle chốt bỏ hẳn tính năng Reject (2026-07-26) | B2 |
| `recipientStatus` | `{email, status, at, error?}[]` | Delivery thật per-recipient, thay `deliveryCounts` đóng băng | G11 |

> `deliveryCounts` giữ lại làm giá trị rollup **tính từ** `recipientStatus`, không lưu tách rời (tránh lệch).
> `acknowledgedCount`: hoặc nối SMS ack (§11), hoặc **bỏ khỏi type** — dead field gây hiểu nhầm.

### `BroadcastConfig` (`src/lib/broadcastConfig.ts:113`) — thêm

| Field | Vì sao |
|---|---|
| `lastEodRunAt: string?` | Header EOD hiển thị lần chạy cuối; phân biệt empty state (U15, U18) |
| `eodExcludedCategories: string[]` | Gate category cho EOD, đối xứng `closureRequiredCategories` (G9) |
| `eodMinCrisisLevel: number?` | vd chỉ queue Level ≤ 4, bỏ Level 5 occurrences (G9) |
| `eodExcludedStatuses: string[]` | Đưa `OPEN_STATUSES_EXCLUDED` hardcode ra config |
| `eodSchedulerEnabled: boolean` | Bật/tắt job tự động (G8) |
| `lastEodRunPerDate: Record<string,string>` | Phân biệt "đêm 24/07 chưa chạy check" vs "đã chạy, 0 mục" khi bấm lùi ngày trên day navigator |

### `Incident.closureBroadcastStatus`

**Giữ nguyên** `'not_required' | 'pending' | 'dispatched'` — không thêm `'rejected'` nữa, vì đã bỏ tính năng Reject. Record Closure không được dispatch sẽ kẹt ở `'pending'`; UI bù bằng **badge tuổi** (`chờ 12 ngày`) để nó không im lặng trôi đi.

---

## 8. Kế hoạch triển khai theo phase

### Phase 0 — Sửa dữ liệu & hành vi (KHÔNG đụng UI) · ~2–3 ngày

Làm trước để UI mới có dữ liệu đúng mà hiển thị.

| # | Task | Ref |
|---|---|---|
| 0.1 | Mở rộng `BroadcastRecord` với các field ở §7; migration script backfill record cũ (`recipientGroups: []`, `contentDefault = contentDispatched`) | G5, G6 |
| 0.2 | Cả 3 call site tạo record lưu đủ `recipientGroups`/`matrixRuleId`/`templateId`/`subject`/`contentDefault`/`crisisLevel`/`incidentType`/`incidentTitle` | G5 |
| 0.3 | `nextBroadcastId(caseId)` dùng chung, tính `max(seq)+1` parse từ ID; unique index trên `broadcasts.id` | B4 |
| 0.4 | Gate category + level cho `isEodEligible()`, đọc từ `BroadcastConfig` | **G9** |
| 0.5 | Thêm `eodDate`; guard idempotency theo `(incidentId, eodDate)` bất kể status | **B1** |
| 0.6 | **Gỡ bỏ action `reject`** khỏi `api/broadcasts/[...id]/route.ts` + gỡ nút Reject khỏi cả 2 trang UI. Giữ `'REJECTED'` trong enum để đọc record lịch sử, không tạo mới | **B2/B3/B7** |
| 0.7 | Thêm `createdAt` + `queuedBy`; backfill record cũ (`createdAt = sentAt ?? dispatchedAt ?? _id timestamp`); đổi sort mặc định → PENDING lên đầu | **G14** |
| 0.8 | Render `template.subject` qua `renderTemplate()`, dùng làm subject email thật | **G4** |
| 0.9 | Write-back delivery: `recipientStatus` cập nhật từ `emailMock`, rollup ra `deliveryCounts`; endpoint `GET /api/broadcasts/:id/delivery` | **G11** |
| 0.10 | Dispatch xử lý channel `Push Notification` → `addNotification()` cho recipient | **G2** |
| 0.11 | RBAC: bắt buộc có `role`, bỏ `if (body.role && …)` | B5 |
| 0.12 | Lúc queue, nếu `recipients.length === 0` → set `resolutionWarning` + notify System Administrator | **G15** |

### Phase 1 — Gộp trang + Tab 1 "Broadcasts" · ~4–5 ngày

| # | Task | Ref |
|---|---|---|
| 1.1 | **Gộp `/broadcasts/eod-review` vào `/broadcasts`** thành 1 trang 2 tab; giữ `/broadcasts/eod-review` làm **redirect** → `?tab=eod` (deep link cũ đã nằm trong Mongo) | M2 |
| 1.2 | Ẩn tab theo quyền: tab EOD chỉ hiện với `broadcast.eod_review`; tab 1 read-only nếu chỉ có `view` | M1 |
| 1.3 | **URL state** cho toàn bộ tab + filter + selection (`?tab=&period=&status=&type=&level=&q=&id=`) | §6.3 |
| 1.4 | Bỏ 3 KPI card; dựng **sub-tab trạng thái có count pill** (`Chờ xử lý / Đã gửi / Tất cả`) theo đúng `CaseLogTab.tsx` | T1.1, D10 |
| 1.5 | Filter card dựng **theo đúng §6.7** (copy khung `CaseLogTab.tsx`): hàng chính = sub-tab + ⚙ + search + New; advanced grid 11 field `auto-fill minmax(180px,1fr)`; Clear Filters ở `gridColumn 1/-1` | **§6.7**, D12 |
| 1.5b | Search **debounce 400ms**; mọi filter `setPage(1)`; đẩy qua `URLSearchParams` sang server — không lọc client | §6.7 |
| 1.6 | Bảng mới: cột Mức, tiêu đề sự việc, nhóm nhận, icon kênh, kết quả giao nhận; accent bar theo loại; badge `⚠ chưa khớp rule`; nút `Xem xét →` inline | T1.3–T1.9 |
| 1.7 | Sort mặc định **PENDING lên đầu** + badge tuổi cho record chờ lâu | T1.2, B2-đánh-đổi-2 |
| 1.8 | Detail = **drawer overlay 800px** (không co bảng) + route `/broadcasts/[id]` + print stylesheet | §6.5 |
| 1.9 | **Sửa typography content**: email preview card (subject + Inter 13.5px + ~70ch + line-height 1.6); 3 tab `Preview‖Nguồn‖Diff` | §6.5 |
| 1.10 | Recipients dạng **chip** + `↺ Khôi phục mặc định`, thay textarea comma | U5 |
| 1.11 | Phân trang 25 + filter server-side + endpoint aggregate cho số đếm trên chip | T1.11 |
| 1.12 | Toast thay 4 chỗ `alert()`; refetch 30s + xử lý xung đột 2 người mềm mại | T1.12, C1 |
| 1.13 | Export có hộp thoại chọn phạm vi (đang lọc / tất cả) + chọn cột | G13 |

### Phase 2 — Tab 2 "End-of-Day Interim" (theo đêm) · ~3–4 ngày

| # | Task | Ref |
|---|---|---|
| 2.1 | **Day navigator** `‹ hôm qua · hôm nay · mai ›` + date picker, chạy trên `eodDate` | T2.1 |
| 2.2 | Hiển thị **đủ mọi mục của đêm**: `✓ Đã gửi` / `⊙ Chưa gửi` (đêm nay) / `⊙ Không gửi` (đêm đã qua, làm mờ) | T2.2 |
| 2.3 | Master–detail: dòng compact ~72px, panel duyệt bên phải, sticky footer | T2.3 |
| 2.4 | Ngữ cảnh sự việc trên mỗi dòng: mức, tiêu đề, type, trạng thái, **mở bao lâu**, số người + nhóm | T2.4 |
| 2.5 | Sort mặc định theo mức khủng hoảng ↓ + filter/search trong đêm | T2.5 |
| 2.6 | **Bulk select + Gửi hàng loạt** (không có bulk reject) + API batch + modal xác nhận liệt kê từng mục | T2.6, T2.10 |
| 2.7 | Progress bar `3/5 đã gửi` + phân rã kết quả | T2.7 |
| 2.8 | Header: cutover từ `endOfDayTime`, lần chạy cuối từ `lastEodRunAt` (persist) | T2.8 |
| 2.9 | Panel nội dung 3 tab `Preview‖Sửa‖Diff`; checkbox xác nhận đặt **ngay dưới diff** | T2.x |
| 2.10 | Toast Undo 5 giây khi gửi lẻ | T2.10 |
| 2.11 | Empty state tách 2 tình huống (chưa chạy check ≠ đã gửi hết) | T2.11 |

### Phase 3 — Bịt các nhánh §10 còn hở · ~3–5 ngày

| # | Task | Ref |
|---|---|---|
| 3.1 | EOD scheduler: **Vercel Cron** gọi `/api/cron/eod-broadcast` theo `endOfDayTime` (`vercel.json` → `crons`) + lazy-trigger dự phòng; persist `lastEodRunAt`/`lastEodRunPerDate` | **G8** |
| 3.2 | Weather Advisory: `resolveWeatherBroadcast()`, seed matrix rule, cho phép broadcast không gắn Case, modal New Broadcast đọc template/nhóm từ config | **G1**, B6 |
| 3.3 | §10.8 SDC Comms: trigger `media_present_confirmed`, template có `{media_organisation}`, nhóm "SDC Communications Team", nối `commsNotified` với Broadcast ID thật | **G10** |
| 3.4 | Chuyển các sự kiện §10.5 còn lại từ client sang server (`notify-complete` → Controller, v.v.) | G7 |
| 3.5 | "Rule Simulator" trong Admin Broadcast Config: nhập type/sub-type/level → hiện rule thắng, nhóm, template, preview | (chất lượng) |

### Phase 4 — Dài hạn

- `acknowledgedCount` + SMS ack, gắn với Crisis Recall §11 (G3)
- Broadcast section trong incident report export (G12), phụ thuộc module Reporting §11
- SMTP thật thay `emailMock` (đã có interface cô lập sẵn)

---

## 9. Kịch bản test cần bổ sung

| Nhóm | Kịch bản | Kỳ vọng |
|---|---|---|
| G9 | Đóng ngày với 1 incident category `Informational` đang mở | **Không** vào queue EOD |
| G9 | Incident Level 5 (false alarm) đang mở tại cutover | Không vào queue (theo config) |
| B1 | Chạy cron 2 lần trong ngày, giữa 2 lần có dispatch 1 mục | Không tạo record trùng cho incident đó |
| B1 | Để 1 mục EOD **không gửi** → chạy lại cron cùng ngày | **Không** tạo record thứ 2 cho incident đó (guard theo `eodDate`) |
| B4 | 2 request đồng thời tạo broadcast cùng `caseId` | 2 ID khác nhau, không lỗi ghi đè |
| G4 | Dispatch closure broadcast | Email subject = `[SDC] Incident Closed: <tiêu đề thật>` |
| G11 | Dispatch tới 3 người → chờ 2s → mở detail | Hiển thị `Delivered 3`, không phải `Delivered 0` |
| G11 | 1 recipient fail | Hiện dòng Failed kèm lý do + nút Gửi lại; rollup `failed: 1` |
| G2 | Rule có channel `Push Notification` → dispatch | Recipient nhận System Notification in-app |
| G6 | Sửa nội dung rồi dispatch → mở lại record | Tab Diff hiện đúng phần đã sửa so với mặc định |
| B2/B7 | Mở bất kỳ broadcast PENDING nào (mọi role) | **Không có nút Từ chối / Reject ở đâu cả**; API `action:'reject'` trả 400/410 |
| B2 | Mở record `REJECTED` cũ trong Mongo | Vẫn đọc & lọc được (dữ liệu lịch sử), không crash |
| G14 | Lọc period "tháng 7" | Record PENDING **vẫn hiện** (lọc theo `createdAt`), không biến mất |
| G14 | Mở tab Broadcasts, không lọc gì | 43 mục PENDING nằm **trên đầu**, không bị chôn dưới 6 mục SENT |
| G15 | Queue 1 closure broadcast không khớp rule nào | Record có `resolutionWarning`; UI badge `⚠ chưa khớp rule`; admin nhận notification |
| T2.2 | Đêm 26/07: gửi 3, để 2 không gửi → sang 27/07 mở lại ngày 26/07 | Thấy đúng `✓3 đã gửi · ⊙2 không gửi`; 2 mục đó **không** trôi sang batch 27/07 |
| M2 | Mở notification cũ có link `/broadcasts/eod-review` | Redirect đúng sang `/broadcasts?tab=eod`, không 404 |
| M1 | Controller đăng nhập vào `/broadcasts` | Tab "End-of-Day Interim" **không render**, không phải hiện rồi báo 403 |
| UX | Queue EOD 12 mục, chọn 5 Level 5, bấm Gửi hàng loạt | 1 modal xác nhận, 5 mục SENT, progress 5/12 |
| UX | Bảng Broadcasts 2.000 bản ghi | Trang tải < 2s, phân trang hoạt động, filter server-side |
| Regression | Luồng Closure hiện tại (queue → Controller dispatch) | Không đổi hành vi |

---

## 10. Câu hỏi cần chốt (BA / Kyle)

| # | Câu hỏi | Đề xuất mặc định |
|---|---|---|
| 1 | **Tiêu chí vào queue EOD** (§10.7, FSD ghi TBC) — loại category nào? Level nào? Incident chưa assign có tính không? | Loại `Informational`/`Exercise`/`Backdated`; chỉ Level 1–4; incident phải đã submit |
| ~~2~~ | ~~Controller có được reject một Closure Broadcast không?~~ | ✅ **ĐÃ CHỐT (Kyle, 26/07): KHÔNG BUILD REJECT.** Câu hỏi tự tiêu — không có action reject thì không cần phân quyền cho nó |
| 3 | **Weather Advisory trigger từ đâu?** Thủ công (DM tạo) hay từ feed thời tiết UCS? | Thủ công ở Phase 3; feed UCS ngoài scope |
| 4 | **Định nghĩa "sensitive content"** (§10.4c) — có danh sách field cụ thể không, hay chỉ là chính sách viết template? | ⏸️ **HOLD — Kyle check với khách.** Tạm giữ nguyên content-diff gate hiện tại, chưa đụng vào |
| 5 | **Bulk dispatch EOD có được phép không**, hay §10.7 yêu cầu DM confirm từng incident một? | Cho phép bulk, nhưng modal xác nhận liệt kê từng mục |
| 6 | **`acknowledgedCount`** — giữ cho SMS §11 hay bỏ khỏi model? | Giữ, đánh dấu rõ "reserved for §11" |
| 7 | **Broadcast không gắn Case** (Weather Advisory toàn đảo) — quy ước ID? | `SEN/BC/YYYYMMDD/###` |
| 8 | **Ai chạy scheduler EOD?** | ✅ **ĐÃ CHỐT: Vercel Cron** gọi `/api/cron/eod-broadcast` theo `endOfDayTime`. Giữ lazy-trigger làm dự phòng khi deploy ngoài Vercel |

---

## 11. Tóm tắt 1 phút

**Backbone §10 làm tốt** — matrix/template/config đã lên Mongo, logic tách sạch, C1 gate đúng FSD. Vấn đề nằm ở **rìa**: (1) mấy nhánh chưa nối dây — Weather Advisory, Push channel, `template.subject`, SDC Comms, scheduler EOD; (2) **vòng đời sau dispatch chết** — delivery counts đóng băng "delivered 0" làm mất niềm tin vào toàn màn hình; (3) **predicate EOD quá rộng** sinh ra 43 PENDING rác — đây là gốc rễ của cảm giác "trang EOD không dùng được", **phải fix trước khi redesign UI**.

Về UI: trang Broadcasts thiếu **crisis level, search, date filter, phân trang, deep link**, và detail panel co bảng gây khó chịu. Trang EOD Review thì mỗi mục cao 450px với textarea luôn mở, **không có ngữ cảnh sự việc, không bulk, không progress** — với 43 mục là không vận hành được trong 15 phút bàn giao ca.

**Hướng đã chốt (26/07):** gộp 2 trang thành **1 trang / 2 tab chia theo công việc** — tab 1 *record-centric* (hồ sơ + worklist Closure qua chip "Chờ xử lý"), tab 2 *day-centric* (duyệt theo đêm, có day navigator). **Bỏ hẳn tính năng Reject** — `PENDING` + `eodDate` đã qua chính là "không gửi", nhờ đó xoá luôn 3 bug (B2/B3/B7) và vấn đề carry-over mà không phải viết thêm code. Detail chuyển sang **drawer 800px + route riêng**, và quan trọng hơn cả chiều rộng là **sửa typography** (bỏ monospace 11.5px → email preview 70ch).

**Thứ tự làm:** Phase 0 (data + G9 + G11) → Phase 1 (Broadcasts) → Phase 2 (EOD) → Phase 3 (nhánh §10 còn hở). Không đảo thứ tự — Phase 1–2 phụ thuộc field mới từ Phase 0.
