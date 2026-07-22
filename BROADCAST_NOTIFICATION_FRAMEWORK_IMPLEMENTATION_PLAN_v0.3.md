# Broadcast and Notification Framework — Kế hoạch triển khai

**Sentosa (sts-bnk)** | **Draft v0.3** | 2026-07-22 — cập nhật sau khi đối chiếu lại toàn bộ với source code hiện tại và **bản FSD v0.5 gốc** (Kyle đã cung cấp; đã đọc trực tiếp, không còn suy luận từ v0.3).
**Nguồn FSD:** `SDC IIS CMS FRD v0.5_SDC.pdf` (85 trang, bản 3 July 2026 — nay đã có trong repo cùng `FRD_v0.5_extracted.txt`) §10 (Broadcast and Notification Framework), §3 (Roles), §5.1.2 (Incident Categories), §5.2 (Crisis Level), §5.11 (Broadcasting Triggers), §11 (Crisis Recall), §13.3 (Broadcast Config), §13.4 (Recall Config). *Đã verify từng câu chữ §5.11 / §10 / §13.3 trực tiếp trên PDF v0.5.*
**Đối chiếu code:** `src/lib/db.ts`, `src/app/api/incidents/[...id]/route.ts`, `src/app/api/cron/generate/route.ts`, `src/app/api/sms-mock/route.ts`, `src/app/admin/*`, `src/context/NotificationContext.tsx`, `src/components/NotificationWidget.tsx`, `src/lib/groups.ts`, `src/lib/incidentCategory.ts`, `prisma/schema.prisma` — đã đọc và verify từng claim (2026-07-22).
**Đối chiếu tài liệu:** `RBAC_Redesign_Incident_Module.md`, `FSD_V0.5_ENHANCEMENT_PLAN.md`, `Audit_Log_Types_Definition.md`.

---

## 0. Kết luận verify & Changelog so với Draft v0.2

### 0.1 Verdict: Plan v0.2 vẫn ĐÚNG — chỉ cần tinh chỉnh, không cần viết lại

Toàn bộ các claim về code trong Draft v0.2 đã được kiểm lại trực tiếp trên source hôm nay và **tất cả đều còn chính xác**:

- `BroadcastRecord` (db.ts dòng 393–406) đúng y mô tả: `id, caseId, incidentId, type, recipients[], templateUsed, contentDispatched, sentAt, sentBy, status, deliveryAttempts, lastErrorMessage`. **Chưa có** `deliveryCounts`/`acknowledgedCount` → đúng là gap.
- Action `close` (incidents/[...id]/route.ts dòng 466–513) tự tạo `BroadcastRecord` `status:'PENDING'`, set `incident.closureBroadcastStatus='pending'` + `closureBroadcastId`, Broadcast ID theo đúng convention `[CaseID]-BC{seq}`. ✅
- `src/app/broadcasts/page.tsx` đúng là placeholder 9 dòng "Coming soon". ✅
- `NotificationContext.tsx`, `broadcast-config/page.tsx` (3 tab Templates/Matrix/Channels), `distribution-groups/page.tsx`, `groups.ts`, `roles/page.tsx` — **tất cả đều lưu `localStorage`**. ✅
- `roles/page.tsx` permissionMatrix **thực sự có dòng `'Broadcast & Notification'` (dòng 36) và `'Crisis Management'` (dòng 37)** — và xác nhận **không có bất kỳ enforcement nào** đọc ma trận này (`hasPermission`/`can()` không tồn tại trong repo; `AdminGuard` chỉ hardcode `role === 'System Administrator'`). ✅
- `sms-mock` có vòng đời `Queued→Sent→Delivered→Failed`. ✅
- `prisma/schema.prisma` có model `BroadcastLog` (dòng 454) + field `closureBroadcastStatus/closureBroadcastId` trên Incident. ✅
- `cron/generate` là endpoint GET+POST idempotent gọi `advanceAllSeries` — pattern job đúng như plan mô tả. ✅

→ **Hướng tiếp cận cốt lõi của v0.2 giữ nguyên:** đây là mở rộng (extension), tái sử dụng `BroadcastRecord` + trigger đóng-case + khung UI admin + khung Notification, chuyển lưu trữ từ `localStorage`/in-memory sang `getDb()`/`saveDb()`, bổ sung soạn/dispatch phía Controller, thêm job EOD, và enforce RBAC theo model `broadcast.*`.

### 0.2 Nguồn FSD — ✅ ĐÃ có bản v0.5 gốc, đã đọc trực tiếp

Kyle đã cung cấp `SDC IIS CMS FRD v0.5_SDC.pdf` (bản 3 July 2026, 85 trang). File đã được **đưa vào repo** kèm `FRD_v0.5_extracted.txt`, và **hai artifact v0.3 cũ (`FRD_v0.3_extracted.txt`, `SDC IIS CMS FRD v0.3_SDC.docx.bak`) đã được xoá/thay thế** theo yêu cầu. (v0.1 `FRD_CMS.txt` giữ nguyên vì không thuộc phạm vi thay.)

Đã đọc trực tiếp §5.11, §10, §13.3 trên bản v0.5. Xác nhận: đánh số v0.5 khớp đúng plan (Broadcast=§10, Crisis=§11, Broadcast Config=§13.3). Framework Broadcast v0.5 về cơ bản kế thừa v0.3 nhưng **có vài bổ sung câu chữ quan trọng** (xem §0.4) — trong đó có phần **xác nhận thẳng gate C1**.

### 0.3 Những điểm ĐƯỢC BỔ SUNG/SỬA trong v0.3 (so với v0.2)

| # | Bổ sung/Sửa | Loại |
|---|---|---|
| C1 | **Gate "required vs not_required" cho Closure Broadcast đang THIẾU trong code** — action `close` hiện *luôn* tạo broadcast `PENDING`; không có nhánh nào set `not_required`. Phải thêm quyết định dựa trên **Incident Category** (v0.5 §5.1.2). | Task mới, Phase 1 |
| C2 | **Seed `DEFAULT_MATRIX` ở `broadcast-config` dùng taxonomy KHÔNG khớp FSD** — hiện dùng "Crisis Broadcast"/"Incident Broadcast" + gộp level lạ; FSD định nghĩa broadcast type là Closure / End-of-Day Interim / Weather Advisory và crisis level 1–5. Khi migrate (Phase 0) phải nắn seed về đúng taxonomy FSD. | Sửa Phase 0 |
| C3 | **Bất nhất chuỗi module** — permissionMatrix dùng `'Broadcast & Notification'`, còn role Broadcast Recipient khai `modules:['Broadcast Notifications']`. Chuẩn hoá 1 tên khi wiring RBAC. | Sửa Phase 2 |
| C4 | **Liên kết với v0.5 Elevation** — Elevation nay áp dụng cho **cả Controller lẫn Duty Officer**, time-boxed theo ca; check separation-of-duties của "broadcast authorise" phải đọc identity thật xuyên qua elevation record. Ghi rõ thứ tự phụ thuộc. | Rõ hơn §15 |
| C5 | **`incidentCategory.ts` đã ghi chú "drives default broadcast behaviour"** nhưng phần default-broadcast chưa nối logic nào — chính là chỗ để cài C1. | Ghi chú §2.5 |

Ngoài 5 điểm trên, **toàn bộ Phase 0–5, gap analysis, và thiết kế của v0.2 giữ nguyên hiệu lực.**

### 0.4 Điều bản FSD v0.5 gốc bổ sung/xác nhận (đọc trực tiếp trên PDF)

Sau khi đọc bản v0.5 thật, plan không đổi hướng nhưng được **củng cố và chi tiết hoá** ở các điểm sau:

1. **§5.11.1a xác nhận thẳng gate C1.** Nguyên văn: *"Where a closure broadcast is **required under the configured broadcast rules**, the system shall automatically trigger a closure broadcast notification to the Controller when the Duty Manager … endorses incident closure."* → FSD nói rõ closure broadcast là **có điều kiện** (theo broadcast rules), không phải luôn-luôn. Code hiện tạo vô điều kiện ⇒ đúng là sai lệch cần sửa (C1). §5.11.1b: *"One closure broadcast shall be issued per incident **where closure broadcast is required**."*

2. **§5.1.2 cho mapping category → broadcast cụ thể** (giải quyết open item §15.6 bằng chính câu chữ FSD):
   - **Operational Incident** (mặc định): *"…and broadcast handling"* → **required** (where applicable, theo rules).
   - **Informational / Exercise Records**: *"These records **do not require** a Responder assignment, ground response **or broadcast handling by default**."* → **not_required**.
   - **Backdated Incident**: mô tả là incident đã kết thúc, tạo rồi submit đóng ngay — **không nhắc broadcast** ⇒ mặc định **not_required**, nhưng cần BA xác nhận dứt điểm.

3. **§10.1(e) — determinant MỚI (v0.5 thêm so với v0.3):** *"Broadcast prompts, templates and default recipient groups shall be determined by **Broadcast Type, Incident Type, Incident Sub-type** and configured broadcast rules where applicable."* → Resolve template/recipient phải key theo **type + sub-type** (không chỉ type + crisis level). Cập nhật `src/lib/broadcast.ts` và schema `BroadcastTemplate`/`BroadcastMatrixRule` để có `incidentSubType`.

4. **§10.5 — thực tế là 10 sự kiện, không phải 8.** Bản v0.5 liệt kê đủ, gồm cả 2 sự kiện plan v0.2 đánh dấu thiếu: *"Responder marks Incident input complete → Controller"* và *"Incident closed where closure broadcast is required → Controller"*, cộng *"Controller returns Responder input for amendment → Assigned Responder"*. → Sửa mọi chỗ ghi "8 sự kiện" thành **10**; wiring còn thiếu vẫn đúng 2 sự kiện đó.

5. **§13.3 — config item chi tiết hơn plan v0.2 giả định:**
   - Broadcast routing matrix: map **incident type, sub-type, crisis level** → distribution groups + delivery channels.
   - Broadcast templates: default field sets per **incident type, sub-type, crisis level**.
   - **End-of-day broadcast timing**: cấu hình được (đúng như predicate plan dựng).
   - **Broadcast action prompt rules**: cấu hình trigger conditions + recipient roles cho các prompt liên quan broadcast → cần thêm 1 collection/config item (chưa có trong plan v0.2; bổ sung ở §6/§7).
   - **Cả System Administrator lẫn Current Ops Administrator đều "Configure"** — khớp kịch bản test §14.

6. **§5.2 xác nhận:** Crisis Level mặc định = **Level 4** khi tạo; có reminder 45 phút cho Controller review level (không tự escalate). Khớp mock notification hiện có; khi lên server-side (Phase 2/7) giữ đúng ngữ nghĩa này.

---

## 1. Tóm tắt tổng quan (Executive Summary)

Codebase **đã có sẵn phần triển khai đáng kể và về cơ bản đúng** — đây là **mở rộng**, không phải xây từ đầu hay redesign.

Đã chạy đúng hôm nay: (1) Trigger Closure Broadcast tự động queue khi Duty Manager đóng Incident (server-side, §5.11.1/§10.1). (2) Schema `BroadcastRecord`/`BroadcastLog` phủ gần hết field §10.9. (3) UI admin CRUD đầy đủ cho Distribution Groups (§10.3), trình chỉnh Broadcast Matrix + Templates (§10.4/§10.6), và ma trận Role/Permission đã có dòng "Broadcast & Notification". (4) Khung Notification in-app (`NotificationContext` + `NotificationWidget`) render đúng dạng "System Notifications" §10.5, đã đấu nối cho phần lớn sự kiện trigger.

**Đang thiếu (connective tissue):** chưa có gì đọc config admin để thực sự điền/dispatch broadcast; chưa có UI/API để Controller thực hiện Closure Broadcast đã queue; notification lưu theo từng trình duyệt (`localStorage`) thay vì bền vững/dùng chung; chưa có job End-of-Day; **chưa có nhánh quyết định broadcast-required theo category**; và không màn config admin nào lưu vào nơi backend đọc được.

**Hướng tiếp cận:** tái sử dụng `BroadcastRecord` + logic close + khung UI admin + khung Notification; chuyển lưu trữ sang `getDb()`/`saveDb()` (MongoDB); bổ sung soạn/dispatch phía Controller; thêm job EOD theo tiền lệ `/api/cron/generate`; enforce quyền bằng model Permission-Based Access Control đã chốt trong `RBAC_Redesign_Incident_Module.md` (mở rộng bộ `broadcast.*`).

Kế hoạch **không đụng** Crisis Management/Emergency Recall (§11) — FSD nói rõ Crisis Recall "distinct from the broadcasts", và code phần đó chưa có gì. Đưa vào §15 như câu hỏi phạm vi (dùng chung pattern recipient-group + SMS gateway mà plan này dựng).

---

## 2. Phân tích hệ thống hiện tại

### 2.1 Kiến trúc
Next.js 16 App Router, monolith. API dưới `src/app/api/**/route.ts` (REST handler, chưa có service layer). Datastore thật là **MongoDB**, truy cập duy nhất qua `getDb()`/`saveDb()` trong `src/lib/db.ts` (đọc/hydrate & dehydrate/ghi nguyên collection, không CRUD từng document). `prisma/schema.prisma` chỉ mang tính **tài liệu** — không nối Prisma client thật; tiếp tục cập nhật song song làm tài liệu.

**Chưa có auth/session** (không NextAuth/middleware/JWT). "Ai đang đăng nhập" hiện giả lập ở client bởi `RoleContext` (bộ chuyển-role lưu `localStorage`). Ảnh hưởng trực tiếp: hộp thư Notification theo-từng-user và RBAC đều cần định danh user ổn định server biết được — hiện chưa có. `RBAC_Redesign_Incident_Module.md` đã ghi nhận vấn đề gốc này và khuyến nghị neo vào `userId` ổn định. **Kyle đã chốt: dùng tạm username của RoleContext làm định danh, không chờ auth thật** (xem §15.6).

### 2.2 Database / Entities hiện có
- `Case → Incident (1:1) → Fault[]/Task[]`, `Occurrence[]` (độc lập §9), `EventRecord[]`, `NOPRecord[]`.
- `BroadcastRecord` (db.ts 393): đủ phần lớn field §10.9. Verify: **chưa có** breakdown `deliveryCounts`/`acknowledgedCount`.
- `AuditLog` dùng chung; mọi màn config admin (kể cả Broadcast Configuration) đã gọi `/api/admin/audit` thật.
- `Incident.closureBroadcastStatus` (`'not_required' | 'pending' | 'dispatched'`) + `closureBroadcastId` — đã có, đã badge ở trang chi tiết Incident.

`prisma/schema.prisma` có `BroadcastLog` (454) — giữ đồng bộ khi DB đổi.

**Chưa model hoá ở backend:** distribution groups, templates, matrix rules, channel config — tất cả là shape **chỉ tồn tại client** (`src/lib/groups.ts`, interface inline trong `broadcast-config/page.tsx`) lưu `localStorage`.

### 2.3 API hiện có
- CRUD: `/api/cases`, `/api/incidents`, `/api/faults`, `/api/tasks`, `/api/events`, `/api/nops`, `/api/occurrences`.
- `/api/incidents/[...id]` (route.ts): toàn bộ vòng đời Incident dạng POST switch theo action (assign, acknowledge, on-site, notify-complete, submit-endorsement, close, return, reopen, mark-false-alarm, log, …). **Case close (dòng 466) là nơi tạo Closure Broadcast.**
- `/api/admin/audit` — GET/POST audit dùng chung (tái sử dụng cho mọi action broadcast mới).
- `/api/sms-mock` — mock cổng SMS in-memory (Queued→Sent→Delivered→Failed). Chưa dùng cho broadcast; **tiền lệ gần nhất cho email-mock** tương lai.
- `/api/cron/generate` — GET/POST idempotent, gọi được từ scheduler ngoài, advance Task series (`advanceAllSeries`). **Pattern background-job đã có** → tái dùng cho queue EOD.

**Chưa có** `/api/broadcasts` — không có cách list/soạn/dispatch broadcast qua API.

### 2.4 UI / Màn hình hiện có
- `broadcasts/page.tsx` — nav "Broadcasts" (nhóm "Communications" của Sidebar) chỉ là placeholder "Coming soon".
- `admin/broadcast-config/page.tsx` — 3 tab đầy đủ: Templates (theo loại broadcast, preview `{variable}`), Matrix (crisis level → loại → recipient group → kênh), Channels (Email/SMS/System Notification, Active/Inactive). **State chỉ ở `localStorage`; audit gọi API thật.** ⚠️ Seed `DEFAULT_MATRIX` dùng taxonomy không khớp FSD (xem C2).
- `admin/distribution-groups/page.tsx` + `lib/groups.ts` — CRUD nhóm nhận có tên, member Internal/External (name/email/phone), khớp §10.3. Chỉ `localStorage`.
- `admin/routing-matrix/page.tsx` — rule điều phối generic (Incident/Fault/Escalation); không riêng Broadcast, không được dispatch tái dùng.
- `admin/roles/page.tsx` — CRUD "System Roles" + "Centralized Permission Matrix". **Verify: matrix có dòng `Broadcast & Notification` (line 36) và `Crisis Management` (line 37)**, cờ theo role khớp §3. Chỉ `localStorage`, và **không có code enforcement đọc ma trận**.
- `context/NotificationContext.tsx` + `components/NotificationWidget.tsx` — chuông nổi/drawer đầy đủ: add/markRead/markAllRead/clear, lọc theo role active (`useRole()`), lưu `localStorage`, seed mock lần đầu.
- `incidents/[...id]/page.tsx` — đã render badge "Closure Broadcast" read-only (Pending Dispatch / Dispatched / Not required / —) và timeline mỗi BroadcastRecord. **Chưa có nút để Controller thao tác broadcast pending.**

### 2.5 Business logic hiện có
Vòng đời Incident (Live → Live (Assigned) → Pending Endorsement → Returned/Closed) đầy đủ server-side, gồm separation-of-duties và auto-queue Closure Broadcast. `src/lib/incidentCategory.ts` **ghi chú field này "drives default response/assignment/closure/broadcast behaviour" (§5.1.2)** — nhưng **phần default-broadcast chưa nối vào bất kỳ logic broadcast nào** (đây chính là chỗ cài gate C1). ⚠️ Xác nhận trong code: action `close` **luôn** tạo broadcast `PENDING` bất kể category → nhánh `not_required` hiện **không bao giờ được set bởi backend**.

### 2.6 Notification hiện có
`addNotification()` được gọi từ 3 trang chi tiết (`cases/[...id]`, `incidents/[...id]`, `tasks/[...id]`, tổng 14 call site) cho: Task assigned/reassigned, Incident returned for revision, NOP status change, CMMS Fault ID received, và (mock client) ageing 12/14 ngày + nhắc crisis-level 45 phút.

Hai giới hạn kiến trúc: **(1)** Trigger chỉ bắn khi user đang mở đúng trang chi tiết (client `setInterval` + `useRef` chặn lặp) — không có scheduler server. `FSD_V0.5_ENHANCEMENT_PLAN.md` Phase 7 đã scope "Ageing Alerts thật" — tầng lưu trữ của plan này là nền để Phase 7 xây tiếp. **(2)** Chưa có notification cho §10.5 "Incident closed where closure broadcast required → Controller" dù `BroadcastRecord` đã tạo đúng lúc; và "Responder marks complete → Controller" cũng chưa bắn qua notification (action `notify-complete` có tồn tại nhưng không phát System Notification). → 2 sự kiện §10.5 còn thiếu.

### 2.7 Permissions / RBAC hiện có
**Chưa enforce RBAC.** `AdminGuard.tsx` chặn `/admin/*` bằng đúng `role === 'System Administrator'`. Nơi khác quyết định bằng so chuỗi role (`role === 'Controller'`). Permission Matrix UI chỉ là bề mặt config, **không engine enforcement**. `RBAC_Redesign_Incident_Module.md` đã chốt: chuyển sang permission-code atomic + 1 ma trận Role×Permission, có lộ trình migrate (seed = hành vi hiện tại → thay dần `role === X` bằng `hasPermission(...)`). Plan này **mở rộng model đó** bằng bộ `broadcast.*`, không dựng cơ chế song song.

### 2.8 Background Job / Scheduler
Đúng 1 tiền lệ: `/api/cron/generate` (GET/POST, idempotent, trigger ngoài). Chưa có tiến trình scheduled nào khác.

### 2.9 Component tái sử dụng được
`AdminGuard`, pattern gọi `/api/admin/audit`, `getDb()`/`saveDb()`, khung `NotificationContext`/`NotificationWidget`, pattern `/api/cron/generate`, shape `DistributionGroup`/`GroupMember` (`groups.ts`), schema `BroadcastRecord`/`BroadcastLog`, và (cho email-mock) interface `sms-mock`.

---

## 3. Phân tích khoảng trống (Gap Analysis)

| Yêu cầu FSD | Ref | Trạng thái | Hướng | Ghi chú |
|---|---|---|---|---|
| Closure Broadcast tự động queue khi DM đóng incident | §5.11.1a, §10.1 | ✅ Có sẵn | REUSE | `close` tạo BroadcastRecord PENDING |
| **Quyết định broadcast required vs not_required theo category** | §5.1.2, §10.1 | ❌ Thiếu | **CREATE (C1)** | `close` luôn tạo PENDING; chưa đọc category |
| Menu soạn của Controller — xác nhận field/recipient, dispatch | §5.11.1b, §10.1 | ❌ Thiếu | CREATE | Chưa có action PENDING→SENT; chưa có menu |
| Notification nhắc closure broadcast → Controller | §10.5 | ❌ Thiếu | CREATE (nhỏ) | Pattern có; chưa gọi tại sự kiện này |
| Incident hiển thị trạng thái closure broadcast + ID | §5.11.1c | ✅ Có sẵn | REUSE | Đã render badge |
| Field bản ghi Broadcast (recipients/template/nội dung/timestamp/status) | §10.9a-c | ✅ Có sẵn | REUSE | `BroadcastRecord` |
| Số liệu gửi theo trạng thái + số ack | §10.9d-e | ❌ Thiếu | MODIFY schema | Thêm `deliveryCounts{sent,delivered,failed,pending}`, `acknowledgedCount?` |
| UI module Broadcasts (list/detail/export) | §10.9c + nav | ❌ Thiếu | CREATE | `broadcasts/page.tsx` là placeholder |
| Kênh Email | §10.1a, §10.2 | ❌ Thiếu | CREATE | Chưa có gateway; tab Channels chỉ config |
| Kênh Push/System Notification | §10.2 | ◑ Một phần | MODIFY | Widget có nhưng per-browser (`localStorage`) |
| Distribution Groups: CRUD/deactivate/named | §10.3a-b | ◑ Một phần | MODIFY | UI/shape xong; chỉ client |
| Tự điền recipient theo incident type + crisis level | §10.3c | ❌ Thiếu | CREATE | UI Matrix có; runtime chưa đọc |
| Thêm/bớt recipient trước dispatch (không đổi group gốc) | §10.3d | ❌ Thiếu | CREATE | Trong UI soạn |
| Template map theo incident type + crisis level | §10.4a-b | ◑ Một phần | MODIFY | Tab Templates key theo loại broadcast; cần thêm type×level (FSD đánh dấu TBC §15.3) |
| Template loại trừ field nhạy cảm; DM override tường minh | §10.4c-d | ❌ Thiếu | CREATE | Chưa model hoá |
| Bộ **10** sự kiện System Notification | §10.5 | ◑ Một phần | MODIFY | v0.5 liệt kê 10 event; ~8/10 đã đấu nối client; thiếu "Responder marks complete → Controller" + "closure broadcast prompt → Controller"; cơ chế gửi cần lên server |
| Broadcast Matrix (level × loại × recipient × kênh) | §10.6 (TBC) | ◑ Một phần | MODIFY | Tab Matrix có shape; chỉ client; **seed sai taxonomy (C2)**; chưa đọc lúc dispatch |
| Queue End-of-Day Interim Broadcast + DM review | §10.7, §5.11.2 | ❌ Thiếu | CREATE | Chưa có job + UI; rule timing TBC (§15.3) |
| Weather Advisory Broadcast | §10.1 | ❌ Thiếu | Ngoài phạm vi | Phụ thuộc feed thời tiết UCS |
| Notification SDC Communications Team (media tại hiện trường) | §10.8 | ◑ Một phần | MODIFY | `MediaInvolvement.mediaAtScene` có; chưa có workflow |
| Admin config Broadcast (groups/matrix/templates/EOD timing/prompt rule) | §13.3 | ◑ Một phần | MODIFY | 3/5 có UI; thiếu EOD timing + prompt rule; chưa lưu backend |
| Phân quyền role cho module Broadcast | §3.1/§3.3, §13.1 | ◑ Một phần | MODIFY | Matrix có dòng; **chưa enforce** (mở rộng `hasPermission()`), chuẩn hoá tên module (C3) |
| Audit log thao tác broadcast/config | §13.5 | ✅ Có sẵn | REUSE | `/api/admin/audit` |
| UCS hiển thị draft/dispatch broadcast | §2.5.7 | ❌ Thiếu | Ngoài phạm vi | Chưa tích hợp UCS |

---

## 4. Thiết kế Broadcast & Notification Framework

- **Tạo/quản lý Broadcast** — REUSE `BroadcastRecord` + logic auto-tạo trong `close` làm đường chuẩn cho Closure; **thêm gate required/not_required theo category (C1)**; CREATE cơ chế auto-tạo tương tự cho mục EOD; CREATE điểm vào thủ công "initiate a Broadcast" cho §10.1(d).
- **Audience targeting** — REUSE shape `DistributionGroup`/`GroupMember`, MODIFY lưu server; CREATE resolve incident-type/crisis-level → group mặc định từ Matrix config; **snapshot recipient đã resolve vào record, không tham chiếu sống**.
- **Kênh** — Email: CREATE (mirror `sms-mock` thành `email-mock`, khớp mô tả SMTP on-prem trong seed tab Channels). In-app/Push: MODIFY `NotificationContext` thành hộp thư server, theo user.
- **Scheduling** — CREATE job EOD theo tiền lệ `/api/cron/generate` (idempotent, GET+POST, trigger ngoài).
- **Read/unread** — REUSE `read:boolean` + `markAsRead`/`markAllAsRead`; MODIFY nguồn lên server.
- **Lịch sử notification** — MODIFY: mảng `notifications` localStorage → collection `NotificationRecord`, query theo user.
- **Template** — REUSE cơ chế `{variable}`; MODIFY key từ loại-broadcast sang **incident-type + crisis-level**; CREATE loại trừ mặc định field nhạy cảm + override cấp DM.
- **Permissions** — MODIFY/mở rộng `hasPermission()` bằng bộ `broadcast.*`.
- **Audit** — REUSE `/api/admin/audit` cho mọi action mới.
- **Background** — REUSE cron-endpoint cho queue EOD (+ tuỳ chọn quét ageing/crisis-reminder, phối hợp Phase 7 của Enhancement Plan).
- **Event-driven** — MODIFY: giữ điểm gọi ở route/trang vòng đời nhưng gọi qua helper `notify()` server thay `addNotification()` client.

---

## 5. Ảnh hưởng kiến trúc
Không redesign. Bổ sung:
- `src/lib/broadcast.ts` (mirror cách `seriesEngine.ts` tách logic thuần khỏi lưu trữ): resolve recipient/template mặc định theo incident type + crisis level; **quyết định broadcast-required theo category (C1)**; dựng danh sách ứng viên queue EOD; tính rollup số liệu gửi.
- `src/lib/notify.ts` (`notify(userIds | role, payload)`) gọi từ action handler server, thay các `addNotification()` rải rác client tại các sự kiện backend thật; `NotificationContext` giữ vai trò tầng đọc/subscribe client.
- Mở rộng `hasPermission(user, code, record?)` (từ RBAC redesign) thêm mã `broadcast.*` — không dựng engine mới.
- Tuỳ chọn (sau): lớp email-gateway cùng interface `sms-mock` để thay SMTP thật không đụng call site.

---

## 6. Ảnh hưởng Database

| Thay đổi | Loại | Ghi chú |
|---|---|---|
| `BroadcastRecord`: thêm `deliveryCounts:{sent,delivered,failed,pending}`, `acknowledgedCount?` | Mở rộng | Cần cho §10.9d-e |
| `BroadcastRecord.recipients`: giữ `string[]`, resolve qua group **tại thời điểm tạo** (snapshot) | Đổi hành vi | Không đổi schema |
| Collection mới `DistributionGroup`/`GroupMember` | Mới | Migrate shape `groups.ts` sang Mongo |
| Collection mới `BroadcastTemplate` | Mới | Migrate tab Templates; key theo **`incidentType` + `incidentSubType` + `crisisLevel`** (§10.4/§13.3), `sensitiveFields:string[]` |
| Collection mới `BroadcastMatrixRule` | Mới | Migrate dòng tab Matrix; key theo **`incidentType` + `incidentSubType` + `crisisLevel`** → group + channels (§13.3); **nắn seed về taxonomy FSD (C2)** |
| Collection mới `BroadcastChannelConfig` | Mới | Migrate dòng tab Channels |
| Collection mới `NotificationRecord` | Mới | Bản server của `NotificationItem`; thêm `userId`/`recipientRole`, giữ `read`, `type`, `link` |
| Config EOD timing (`BroadcastConfig` / system config) | Mới | §13.3 "End-of-day broadcast timing"; predicate/thời điểm cấu hình được |
| Config **Broadcast action prompt rules** | Mới | §13.3 — trigger conditions + recipient roles cho prompt broadcast (không có trong plan v0.2) |
| Incident: không thêm field | — | `closureBroadcastStatus`/`closureBroadcastId` đủ dùng |
| `prisma/schema.prisma` | Cập nhật tài liệu | Thêm model tương ứng (chỉ tài liệu) |

---

## 7. Ảnh hưởng API

| Endpoint | Thay đổi |
|---|---|
| `POST /api/incidents/[...id]` action `close` | **MODIFY** — thêm gate: đọc Incident Category để set `closureBroadcastStatus='pending'` **hoặc** `'not_required'` (C1); giữ hành vi tạo record khi required |
| `POST /api/incidents/[...id]` action mới `dispatch-broadcast` | CREATE — Controller xác nhận recipient/field, PENDING→SENT, set `closureBroadcastStatus='dispatched'` |
| `GET/POST /api/broadcasts` | CREATE — list/detail/tạo thủ công cho module Broadcasts |
| `GET/POST /api/cron/eod-broadcast` | CREATE — mirror `/api/cron/generate`; dựng queue EOD gồm incident đang mở |
| `POST /api/broadcasts/[id]/eod-decision` | CREATE — DM confirm/reject 1 EOD broadcast theo incident |
| `GET/POST /api/admin/distribution-groups`, `/broadcast-templates`, `/broadcast-matrix`, `/broadcast-channels` | CREATE — backend cho màn admin đã có, thay localStorage |
| `GET/POST /api/notifications` | CREATE — hộp thư server backend cho `NotificationContext` |
| `POST /api/admin/audit` | Không đổi — tái dùng |

---

## 8. Ảnh hưởng UI

| Màn hình | Thay đổi |
|---|---|
| `broadcasts/page.tsx` | Thay placeholder — list/lịch sử + detail (§10.9) + export |
| `incidents/[...id]/page.tsx` | Thêm action/modal "Perform Closure Broadcast" khi `closureBroadcastStatus==='pending'` và user có `broadcast.dispatch` |
| `admin/broadcast-config/page.tsx` | localStorage → API admin mới; mở rộng Templates key incident-type/crisis-level + toggle field nhạy cảm; thêm EOD timing; **nắn seed Matrix về taxonomy FSD (C2)** |
| `admin/distribution-groups/page.tsx` | localStorage → `/api/admin/distribution-groups` |
| **Mới:** trang End-of-Day Review (Duty Manager) | CREATE — §10.7/§5.11.2 |
| `NotificationWidget.tsx` / `NotificationContext.tsx` | localStorage → `/api/notifications`; poll/refetch theo interval; **giữ nguyên signature `useNotifications()`** |
| `admin/roles/page.tsx` | Mở rộng Matrix với mã `broadcast.*` (§9); **chuẩn hoá tên module (C3)** |

---

## 9. Ảnh hưởng Business Logic

- **Gate required/not_required (C1, MỚI — FSD §5.11.1a + §5.1.2):** trong `close`, đọc Incident Category. Mapping theo FSD v0.5: **Operational → required** (theo configured broadcast rules) ⇒ `closureBroadcastStatus='pending'` + tạo record + prompt Controller; **Informational/Exercise → not_required** (FSD nói rõ "do not require … broadcast handling by default") ⇒ `'not_required'`, không tạo record, không prompt; **Backdated → not_required** (đề xuất, chờ BA). Predicate đặt trong `src/lib/broadcast.ts` để chỉnh mapping mà không đổi route. *Migrate an toàn:* bước đầu có thể seed "Operational = required, còn lại = not_required" (khớp §5.1.2) thay vì "mọi close đều required".
- **Validation dispatch:** PENDING→SENT chỉ khi recipient **không rỗng** và (nếu có field nhạy cảm) đã bật cờ xác nhận tường minh (§10.4d).
- **Resolve recipient:** khi tạo, điền sẵn từ `BroadcastMatrixRule` theo key incident type + crisis level; cho thêm/bớt tuỳ ý không sửa group gốc (§10.3d); **snapshot** danh sách đã resolve vào record.
- **Chặn field nhạy cảm:** template mặc định loại trừ field gắn nhãn nhạy cảm; thêm vào cần xác nhận cấp Duty Manager, ghi audit.
- **Điều kiện vào queue EOD:** incident đủ điều kiện nếu đang mở (không Closed/Pending Endorsement) tại cutover EOD cấu hình; tiêu chí chính xác là open item FSD (§15.3) → cài sau 1 predicate cấu hình được.
- **Access control:** mở rộng `hasPermission()` thêm `broadcast.view`, `broadcast.compose`, `broadcast.dispatch`, `broadcast.eod_review`, `broadcast.config` — seed khớp hành vi hiện tại (Controller: compose; Duty Manager/Officer: compose+dispatch+eod_review; Broadcast Recipient: không quyền trong app; System/Current Ops Admin: config).
- **Separation of duties:** không cần rule riêng cho Broadcast; kế thừa rule của việc đóng Incident. **(C4)** Khi Elevation (Enhancement Plan Phase 5) lên, check "broadcast authorise" phải lấy identity thật xuyên qua elevation record, không dựa role hiển thị.

---

## 10. Ảnh hưởng tích hợp (Integration Impact)

| Module | Sự kiện | Trigger | Người nhận | Kênh | Thay đổi |
|---|---|---|---|---|---|
| Incident | Task assigned/reassigned | `assign` | Assignee | In-app | Đã đấu nối — REUSE |
| Incident | Incident assigned (Responder Activity) | `assign` | Responder | In-app | Đã đấu nối — REUSE |
| Incident | Responder báo đã hoàn tất input | `notify-complete` | Controller | In-app | **Thiếu** — thêm `notify()` |
| Incident | Controller trả input về Responder | `return-to-responder` | Responder được assign | In-app | Kiểm lại; nếu chưa thì bổ sung |
| Incident | Incident log bị DM trả về sửa | `return` | Controller | In-app | Đã đấu nối — REUSE |
| NOP | NOP đổi trạng thái | Chuyển trạng thái | Applicant + approver | In-app | Đã đấu nối — REUSE |
| Fault | Nhận CMMS Fault ID | Gắn liên kết Fault | Controller của Case | In-app | Đã đấu nối — REUSE |
| Incident | Ageing 12/14 ngày | Kiểm theo lịch | Duty Team | In-app | MODIFY sang scheduler server (Phase 7 Enhancement Plan) |
| Incident | Đóng case cần broadcast | `close` | Controller của incident | In-app | **Thiếu** — thêm `notify()` song song tạo record |
| Incident | Dispatch Closure Broadcast | `dispatch-broadcast` (mới) | Recipient group cấu hình | Email | Module mới |
| Incident (lô) | Incident còn mở cuối ngày | Job theo lịch (mới) | Duty Manager | Queue in-app | Module mới |
| Incident | Xác nhận media tại hiện trường | Cờ trên `MediaInvolvement` | DM → gán Controller | In-app | Workflow mới — §10.8 |

---

## 11. Kế hoạch triển khai (Phases)

**Phase 0 — Nền tảng lưu trữ.** Chuyển Distribution Groups, Templates, Matrix, Channel Config từ localStorage sang collection Mongo sau các endpoint `/api/admin/*` mới; **nắn seed Matrix/Channels về taxonomy FSD (C2)**; chưa đổi hành vi runtime, chỉ migrate tương đương. *Rủi ro: thấp. Phụ thuộc: không.*

**Phase 1 — Hoàn thiện vòng Closure Broadcast.** (a) Thêm **gate required/not_required theo category trong `close` (C1)**. (b) Thêm action `dispatch-broadcast` + modal soạn Controller. (c) Thêm notification "nhắc closure broadcast" đang thiếu. Đây là gap chức năng lớn nhất, chỉ bổ sung vào logic đã đúng. *Rủi ro: thấp. Phụ thuộc: Phase 0 (tra recipient/template).*

**Phase 2 — Lưu trữ Notification + enforce RBAC.** `NotificationRecord` + `/api/notifications`; đổi `NotificationContext` sang fetch server (**giữ signature `useNotifications()`**). Mở rộng `hasPermission()` với `broadcast.*`; **chuẩn hoá tên module (C3)**; nối `AdminGuard`/nút action. *Rủi ro: trung bình — đụng mọi call site notification; làm kiểu thay-tương-đương. Phụ thuộc: Phase 0.*

**Phase 3 — Module Broadcasts.** Build `broadcasts/page.tsx` (list/lịch sử/export) trên `/api/broadcasts`. *Rủi ro: thấp. Phụ thuộc: Phase 0–1.*

**Phase 4 — End-of-Day Interim Broadcast.** Cron endpoint + UI queue review DM + API quyết định theo incident. Timing/tiêu chí là open item → predicate cấu hình được, chờ BA. *Rủi ro: trung bình. Phụ thuộc: Phase 0–3.*

**Phase 5 (stretch, sau khi BA/Kyle chốt).** Email gateway (mock mirror `sms-mock` — **Kyle đã chốt mock cho giai đoạn này**, §15.7), chặn field nhạy cảm, workflow SDC Communications Team, Weather Advisory (phụ thuộc feed UCS → ngoài phạm vi tới khi xác nhận). *Rủi ro: trung bình-cao.*

---

## 12. Chia nhỏ task phát triển

1. Migrate Distribution Groups → `/api/admin/distribution-groups` (P0)
2. Migrate Templates → `/api/admin/broadcast-templates`, thêm key incident-type/crisis-level + cờ field nhạy cảm (P0)
3. Migrate Matrix + Channel Config sang API; **nắn seed về taxonomy FSD (C2)** (P0)
4. Mở rộng schema `BroadcastRecord`: breakdown số liệu gửi, số ack (P1)
5. Build `src/lib/broadcast.ts`: resolve recipient/template theo type+level; **predicate broadcast-required theo category (C1)** (P1)
6. **MODIFY action `close`: gọi predicate C1 → set pending/not_required** (P1)
7. Thêm action `dispatch-broadcast` vào `/api/incidents/[...id]` (P1)
8. Build modal "Perform Closure Broadcast" trên trang chi tiết Incident (P1)
9. Thêm `notify()` cho sự kiện nhắc closure-broadcast + "Responder marks complete"; audit qua `/api/admin/audit` (P1)
10. Build collection `NotificationRecord` + `/api/notifications` (P2)
11. Đổi ruột `NotificationContext` sang fetch/mutate server, giữ signature hook (P2)
12. Mở rộng permission registry với `broadcast.*`; seed hành vi hiện tại; **chuẩn hoá tên module (C3)** (P2)
13. Nối `AdminGuard`/nút action vào `hasPermission()` cho action Broadcast (P2)
14. Build `/api/broadcasts` (list/detail/tạo thủ công) (P3)
15. Thay placeholder `broadcasts/page.tsx` bằng UI list/lịch sử/export (P3)
16. Build `/api/cron/eod-broadcast` theo pattern `/api/cron/generate` (P4)
17. Build UI End-of-Day Review (DM) + API quyết định theo incident (P4)
18. (Stretch) Email gateway mock mirror `sms-mock`; nối `dispatch` vào đó (P5)
19. (Stretch) Workflow SDC Communications Team dựa `MediaInvolvement.mediaAtScene` (P5)

---

## 13. Rủi ro kỹ thuật

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Chưa có auth/session thật — notification per-user + RBAC cần định danh ổn định | Cao | **Kyle đã chốt**: dùng tạm `username` của RoleContext làm key; xem lại khi có auth thật |
| Rule timing/điều kiện EOD là open item (§15.3) | Trung bình | Dựng job/queue phía sau predicate cấu hình; không hardcode cutover |
| Broadcast Matrix (§10.6) FSD đánh dấu TBC | Trung bình | Tái dùng shape tab Matrix làm bản nháp; **nắn seed về taxonomy FSD (C2)**; coi là config sửa được |
| Gate broadcast-required phụ thuộc Incident Category (v0.5 mới thành field điều-khiển) | Trung bình | Predicate cô lập trong `broadcast.ts`; seed mapping mặc định = "mọi close đều required" để không đổi hành vi hiện tại, rồi siết theo category khi UI Category lên |
| Đổi `NotificationContext` localStorage→server có thể vỡ mọi call site | Trung bình | Giữ signature `useNotifications()`; migrate ruột; kiểm lại từng call site |
| Trùng phạm vi với Phase 5 (Elevation) & Phase 7 (Ageing) của Enhancement Plan | Trung bình | Phối hợp trình tự; không dựng cơ chế song song |
| Gửi Email hoàn toàn mới | Thấp-Trung bình | Bắt đầu email-mock mirror `sms-mock` để cô lập việc thay SMTP thật |

---

## 14. Kịch bản test tổng quan

| Nhóm | Kịch bản | Kỳ vọng |
|---|---|---|
| Happy | DM đóng Incident cần broadcast → Controller soạn, xác nhận recipient, dispatch | PENDING→SENT; `closureBroadcastStatus→dispatched`; có audit |
| Happy | Job EOD chạy → incident mở vào queue DM → DM duyệt 1, từ chối 1 | Cái duyệt có record; cái từ chối không; cả 2 được log |
| Validation | Controller dispatch với recipient rỗng | Bị chặn kèm lỗi |
| Validation | Template có field nhạy cảm chưa xác nhận | Bị chặn tới khi có cờ xác nhận cấp DM |
| Permission | Controller (không có `broadcast.dispatch`) cố dispatch | 403 / nút ẩn |
| Permission | Broadcast Recipient truy cập `/broadcasts` | Bị chặn view theo matrix |
| Permission | System Admin vs Current Ops Admin trên Broadcast Config | Cả hai config được (§13.3) |
| Integration | Action dispatch ghi `/api/admin/audit` | Có entry kèm before/after |
| Integration | Resolve recipient từ `BroadcastMatrixRule` theo type+level | Điền sẵn khớp mapping |
| **Category (C1)** | Đóng Incident category **không** yêu cầu broadcast | `closureBroadcastStatus='not_required'`; **không** tạo record; **không** prompt; badge "Not required" |
| **Category (C1)** | Đóng Incident category yêu cầu broadcast | Tạo PENDING; prompt Controller; badge "Pending Dispatch" |
| Regression | Call site notification Task/Case/NOP sau đổi Context | Vẫn đúng theo role, giữ read/unread |
| Regression | Luồng đóng Incident hiện có (field không liên quan) | Không đổi hành vi `close` |
| Edge | 2 user cùng dispatch 1 broadcast pending | Lượt 2 báo lỗi gọn (đã dispatched) |
| Edge | DM từ chối toàn bộ incident trong queue EOD | Không tạo broadcast; queue sạch; không lỗi |

---

## 15. Các điểm cần làm rõ

1. **Bản FSD v0.5 gốc** — repo chỉ có v0.3 + enhancement plan + handover checklist. Plan này verify §10 dựa trên v0.3 (nội dung ổn định) + changelog v0.5 (không đổi Broadcast). *Nếu Kyle có PDF v0.5, gửi vào repo để soát câu chữ §10 lần cuối.*
2. **Nội dung Broadcast Matrix (§10.6, §15.3)** — FSD đánh dấu TBC. Tái dùng shape tab Matrix; **cần BA xác nhận shape final + taxonomy broadcast type**.
3. **Nội dung template theo incident type × crisis level (§10.4, §15.3)** — TBC; cần trước khi chốt logic resolve template.
4. **Timing + tiêu chí đủ điều kiện EOD (§10.7, §15.3)** — TBC; dựng predicate cấu hình; rule thật cần BA.
5. **Định nghĩa "nội dung nhạy cảm" (§10.4c)** — chưa có định nghĩa theo field; cần để cài logic loại trừ/override.
6. **Mapping category → broadcast-required (C1, §5.1.2)** — ✅ **Phần lớn đã có câu trả lời trong FSD v0.5**: Operational = required (where applicable); Informational/Exercise = **not_required by default**; Backdated = FSD không nhắc broadcast ⇒ đề xuất not_required. **Chỉ còn 1 câu hỏi cho BA:** Backdated Incident có bao giờ cần closure broadcast không? (Đề xuất mặc định: không.) Cài predicate theo mapping này trong `src/lib/broadcast.ts`.
7. **Auth/định danh multi-user** — ✅ **Kyle đã chốt**: mock/tạm bằng `username` RoleContext, không chờ auth thật. Thay bằng auth thật ở phase sau.
8. **Email gateway** — ✅ **Kyle đã chốt**: dùng mock (mirror `sms-mock`) cho Phase 5; SMTP thật để phase sau.
9. **Phụ thuộc Duty Manager Role Elevation (Enhancement Plan Phase 5)** — Elevation v0.5 áp dụng cả Controller lẫn Duty Officer, time-boxed; check separation-of-duties "broadcast authorise" nên đọc identity đã elevate. Cần xác nhận trình tự (làm broadcast trước, chừa hook cho elevation).
10. **Phạm vi Crisis Management & Emergency Recall (§11)** — FSD nói rõ tách biệt khỏi Broadcast; code chưa có gì. Xác nhận có đưa vào phase gần không (dùng chung pattern recipient-group + gateway-mock plan này dựng).
