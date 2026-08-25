# Broadcast and Notification Framework — Kế hoạch triển khai

**Sentosa (sts-bnk)** | Draft v0.2 | 2026-07-16 — bản dịch tiếng Việt, đã chốt mục Email gateway (mục 15.7) theo phản hồi của Kyle
**Nguồn:** `SDC IIS CMS FRD v0.5_SDC.pdf` §10 (Broadcast and Notification Framework), đối chiếu thêm §3 (Roles), §5.10–5.11 (Closure/Broadcasting Triggers), §11 (Crisis Recall), §13.1/13.3/13.4 (Admin Config), §15.3 (Open Items).
**Phương pháp:** Đọc toàn bộ FSD (85 trang) + đọc toàn bộ phần source liên quan (`src/lib/db.ts`, `src/app/api/incidents/[...id]/route.ts`, `src/app/admin/*`, `src/context/*`, `src/components/NotificationWidget.tsx`, `prisma/schema.prisma`) trước khi đưa ra bất kỳ khuyến nghị nào dưới đây. Đã đối chiếu với các tài liệu kế hoạch sẵn có trong repo: `RBAC_Redesign_Incident_Module.md`, `FSD_V0.5_ENHANCEMENT_PLAN.md`, `Audit_Log_Types_Definition.md`.

---

## 1. Tóm tắt tổng quan (Executive Summary)

Codebase hiện tại **đã có sẵn một phần triển khai đáng kể và về cơ bản đúng** cho framework này — đây là việc **mở rộng (extension)**, không phải xây từ đầu, cũng không phải redesign.

Cụ thể những gì đã chạy đúng ngay hôm nay:
- Trigger **Closure Broadcast** đúng y theo FSD §5.11.1/§10.1 đã được cài đặt ở server: khi Duty Manager đóng một Incident, `src/app/api/incidents/[...id]/route.ts` (action `close`) tự động tạo một `BroadcastRecord` với `status: 'PENDING'` và set `incident.closureBroadcastStatus`/`closureBroadcastId`.
- Schema `BroadcastRecord`/`BroadcastLog` đã bao phủ gần hết các field §10.9 yêu cầu (recipients, template dùng, nội dung, thời điểm/người gửi, status, số lần gửi, lỗi gần nhất).
- Đã có sẵn 1 màn hình admin CRUD đầy đủ cho Distribution Groups (§10.3), 1 trình chỉnh Broadcast Matrix và Templates (§10.4/§10.6), và 1 ma trận Role/Permission đã có sẵn dòng "Broadcast & Notification" khớp với mô tả role ở §3.
- Hệ thống notification trong app (`NotificationContext` + `NotificationWidget`) đã render đúng dạng "System Notifications" mà §10.5 mô tả, và đã đấu nối sẵn cho 5/8 sự kiện trigger được yêu cầu.

Cái đang thiếu là **phần kết nối (connective tissue)**: chưa có gì đọc config admin để thực sự điền/dispatch một broadcast, chưa có UI/API để Controller thực hiện Closure Broadcast mà hệ thống đã queue sẵn, notification đang lưu theo từng trình duyệt (`localStorage`) thay vì dùng chung/bền vững, chưa có job cho End-of-Day Interim Broadcast, và không màn hình config admin nào lưu vào nơi backend đọc được (tất cả đều `localStorage`).

**Hướng tiếp cận khuyến nghị:** tái sử dụng model `BroadcastRecord` hiện có, logic trigger đóng-case hiện có, khung UI admin hiện có, và khung UI Notification hiện có. Chuyển phần lưu trữ của chúng từ `localStorage`/in-memory sang đúng pattern `getDb()`/`saveDb()` chạy trên MongoDB đang dùng ở khắp nơi khác, bổ sung action soạn/dispatch phía Controller đang thiếu, thêm job End-of-Day theo đúng tiền lệ `/api/cron/generate` đã có, và enforce quyền truy cập bằng mô hình Permission-Based Access Control đã chốt trong `RBAC_Redesign_Incident_Module.md` (mở rộng thêm bộ permission `broadcast.*`) thay vì dựng một cơ chế phân quyền song song.

Kế hoạch này **không đụng tới** Crisis Management/Emergency Recall (FSD §11) — chính FSD nói rõ Crisis Recall "distinct from the broadcasts described in the previous section" (tách biệt khỏi broadcast), và code cho phần đó hiện chưa có gì. Mục này được đưa vào phần Cần làm rõ (§15) như một câu hỏi về phạm vi, vì nó dùng chung pattern recipient-group và SMS-gateway mà kế hoạch này sẽ dựng.

---

## 2. Phân tích hệ thống hiện tại

### 2.1 Kiến trúc
Next.js 16 App Router, dạng monolith. API route nằm dưới `src/app/api/**/route.ts` (handler kiểu REST, chưa có tầng service riêng). **Datastore chạy thật là MongoDB**, truy cập duy nhất qua `getDb()`/`saveDb()` trong `src/lib/db.ts` — theo kiểu đọc/hydrate và dehydrate/ghi nguyên cả collection, không phải CRUD theo từng document. `prisma/schema.prisma` có tồn tại nhưng chỉ mang tính tài liệu (comment ngay đầu file đã ghi rõ) — không nối vào Prisma client thật ở bất kỳ đâu; nên tiếp tục cập nhật file này song song để làm tài liệu, không coi nó là nguồn dữ liệu thật.

**Chưa có tầng authentication/session** (không NextAuth, không middleware, không JWT). "Ai đang đăng nhập" hiện chỉ được giả lập ở client bởi `RoleContext` (một bộ chuyển-role lưu trong `localStorage` trình duyệt), không phải hệ thống định danh nhiều-user thật. Điều này ảnh hưởng trực tiếp tới tính năng này: một hộp thư Notification theo-từng-user thật cần một định danh user ổn định mà server biết được — hiện chưa có. `RBAC_Redesign_Incident_Module.md` đã ghi nhận đúng vấn đề gốc này ở việc match ownership của Incident (`responderId === username`) và khuyến nghị neo vào `userId` ổn định.

### 2.2 Database / Entities hiện có
Các collection liên quan trong `src/lib/db.ts` (`DbSchema`/`NormalizedDbSchema`):
- `Case` → `Incident` (1:1) → `Fault[]` / `Task[]` (thuộc về 1 Case), `Occurrence[]` (đứng độc lập, theo FSD §9), `EventRecord[]`, `NOPRecord[]`.
- **`BroadcastRecord`** (`db.ts` dòng ~390): `id`, `caseId`, `incidentId`, `type`, `recipients: string[]`, `templateUsed`, `contentDispatched`, `sentAt`, `sentBy`, `status`, `deliveryAttempts`, `lastErrorMessage`. Đã khớp phần lớn field Broadcast record mà §10.9 yêu cầu.
- **`AuditLog`**: dùng chung, gắn tag theo module, đã được mọi màn hình config admin dùng, kể cả trang Broadcast Configuration hiện tại.
- `Incident.closureBroadcastStatus` (`'not_required' | 'pending' | 'dispatched'`) và `Incident.closureBroadcastId` — đã có sẵn, đã được badge ở trang chi tiết Incident đọc.

`prisma/schema.prisma` có model tương đương `BroadcastLog` (dòng 454) — nên giữ đồng bộ 2 bản mô tả này khi các thay đổi DB của kế hoạch này lên, đúng theo convention đã có của repo (file schema ghi lại ý định thiết kế; Mongo mới là dữ liệu thật).

Chưa được model hoá ở đâu cả: distribution groups, broadcast templates, broadcast matrix rules, và config kênh gửi hiện đều là các shape **chỉ tồn tại phía client** (`src/lib/groups.ts`, interface khai inline trong `src/app/admin/broadcast-config/page.tsx`) lưu vào `localStorage` — chưa có collection backend nào đứng sau.

### 2.3 API hiện có
- CRUD: `/api/cases`, `/api/incidents`, `/api/faults`, `/api/tasks`, `/api/events`, `/api/nops`, `/api/occurrences`.
- `/api/incidents/[...id]` (`route.ts`) cài đặt toàn bộ vòng đời Incident dưới dạng 1 POST handler switch theo `action` (`assign`, `acknowledge`, `on-site`, `notify-complete`, `submit-endorsement`, `close`, `return`, `reopen`, `mark-false-alarm`, `log`, …). Case `close` (dòng ~416) là nơi bản ghi Closure Broadcast được tạo hiện tại.
- `/api/admin/audit` — GET/POST audit log dùng chung, chính là mục tiêu tái sử dụng cho audit trail của bất kỳ action broadcast mới nào.
- `/api/sms-mock` — bộ giả lập cổng SMS lưu in-memory (queue, vòng đời Queued→Sent→Delivered). Hiện chưa được dùng ở đâu liên quan tới broadcast (chỉ được các trang liên quan tới Fault tham chiếu) — đây là tiền lệ gần nhất cho 1 mock cổng email trong tương lai, và hiện cũng chưa nối với Crisis Recall.
- `/api/cron/generate` — endpoint GET/POST, gọi được từ 1 scheduler bên ngoài, chạy idempotent để advance các Task series định kỳ (`advanceAllSeries`). Đây là **pattern background-job** đã được thiết lập, nên tái sử dụng cho bộ dựng queue End-of-Day Interim Broadcast.

Hiện **chưa có endpoint `/api/broadcasts` nào cả** — chưa có cách nào để list, soạn hay dispatch 1 broadcast qua API.

### 2.4 UI / Màn hình hiện có
- **`src/app/broadcasts/page.tsx`** — điểm đến nav cấp cao nhất "Broadcasts" (đã có trong nhóm "Communications" của `Sidebar.tsx`) hiện chỉ là màn hình placeholder "Coming soon".
- **`src/app/admin/broadcast-config/page.tsx`** — UI admin 3 tab đã xây đầy đủ: Broadcast Templates (theo từng loại broadcast, có preview `{variable}` với dữ liệu mock), Broadcast Matrix (crisis level → loại broadcast → recipient group → kênh gửi), Delivery Channels (Email/SMS/System Notification, bật/tắt Active/Inactive). Toàn bộ state chỉ nằm ở `localStorage`; các lệnh gọi audit đi vào `/api/admin/audit` thật.
- **`src/app/admin/distribution-groups/page.tsx`** + **`src/lib/groups.ts`** — CRUD đầy đủ cho các nhóm nhận có tên, gồm thành viên Internal/External (name/email/phone), khớp gần như chính xác shape ở §10.3. Chỉ lưu `localStorage`.
- **`src/app/admin/routing-matrix/page.tsx`** — bộ dựng rule điều phối điều kiện dạng generic (tab Incident/Fault/Escalation); không riêng cho Broadcast và không được broadcast-dispatch tái sử dụng.
- **`src/app/admin/roles/page.tsx`** — CRUD "System Roles" + "Centralized Permission Matrix" (view/create/edit/approve/close theo từng module) đã có sẵn dòng **"Broadcast & Notification"** với cờ theo từng role khá khớp mô tả role ở §3 (Controller: chỉ create; Duty Manager/Officer: create+approve; Broadcast Recipient: chỉ view). Chỉ lưu `localStorage`, và — quan trọng nhất — **không có bất kỳ đoạn code enforcement nào đọc ma trận này**.
- **`src/context/NotificationContext.tsx`** + **`src/components/NotificationWidget.tsx`** — UI notification dạng chuông nổi/drawer đã xây đầy đủ: add/markRead/markAllRead/clear, lọc theo role đang active, lưu `localStorage`, seed dữ liệu mock lần đầu load.
- **`src/app/incidents/[...id]/page.tsx`** — đã render sẵn badge trạng thái "Closure Broadcast" dạng read-only (Pending Dispatch / Dispatched / Not required) và 1 dòng timeline cho mỗi `BroadcastRecord` liên quan. **Chưa có nút/menu nào để Controller thực sự thao tác lên 1 broadcast đang pending.**

### 2.5 Business logic hiện có
Vòng đời Incident (Live → Live (Assigned) → Pending Endorsement → Returned/Closed) đã cài đặt đầy đủ ở server, gồm cả rule tách biệt trách nhiệm (separation-of-duties) và đúng hành vi tự động queue Closure Broadcast đã nói ở trên. Incident Category (`src/lib/incidentCategory.ts`) đã ghi chú rằng field này "drives default response/assignment/closure/broadcast behaviour" theo FSD §5.1.2, dù phần default-broadcast trong đó chưa được nối vào bất kỳ logic broadcast cụ thể nào.

### 2.6 Chức năng liên quan Notification hiện có
`NotificationContext`/`NotificationWidget` đã đấu nối cho: Task assigned/reassigned, Incident returned for revision, NOP status change, CMMS Fault ID received, và (giả lập ở client) cảnh báo ageing 12/14 ngày cùng nhắc lại crisis-level 45 phút — tất cả bắn qua lệnh gọi `addNotification()` bên trong `src/app/incidents/[...id]/page.tsx` / `src/app/cases/[...id]/page.tsx` / `src/app/tasks/[...id]/page.tsx`.

Hai giới hạn về mặt kiến trúc ảnh hưởng trực tiếp tới tính năng này:
1. **Các trigger này chỉ bắn khi user đang mở đúng trang chi tiết của bản ghi liên quan** (kiểm tra ở client bằng `setInterval` cùng cờ chặn lặp `useRef`) — không có scheduler nào ở phía server đứng sau. `FSD_V0.5_ENHANCEMENT_PLAN.md` mục Phase 7 đã scope sẵn "Incident Ageing Alerts thật" như một hạng mục riêng, chưa bắt đầu — tầng lưu trữ của kế hoạch này (§6 dưới đây) chính là nền để Phase 7 đó xây tiếp, không phải dựng thêm 1 cơ chế song song thứ hai.
2. **Chưa có notification nào bắn cho sự kiện §10.5 yêu cầu "Incident closed where closure broadcast is required: closure broadcast prompt → Controller"**, dù bản thân `BroadcastRecord` đã được tạo đúng ngay tại thời điểm đó. Đây là gap nhỏ, đã hiểu rõ nguyên nhân.

### 2.7 Permissions / RBAC hiện có
Chưa có RBAC được enforce. `AdminGuard.tsx` chặn mọi trang `/admin/*` bằng đúng 1 điều kiện hardcode (`role === 'System Administrator'`). Ở mọi nơi khác, quyền truy cập được quyết định bằng so sánh chuỗi `role` trực tiếp (VD `role === 'Controller'`). UI Role & Permission Matrix (mục 2.4 ở trên) chỉ là bề mặt cấu hình, chưa có engine enforcement nào đứng sau.

`RBAC_Redesign_Incident_Module.md` đã chốt quyết định kiến trúc rõ ràng cho module Incident: chuyển sang access control theo permission-code atomic (`incident.edit`, `incident.submit_endorsement`, …) với đúng 1 ma trận Role×Permission để Admin thao tác, rule status/scope cố định trong code, và có sẵn lộ trình migrate (seed `RolePermission` = đúng hành vi hiện tại → thay dần các điều kiện `role === X` bằng `hasPermission(user, 'x.y', record)`). **Kế hoạch này nên mở rộng đúng model đó bằng bộ permission `broadcast.*`, thay vì dựng thêm 1 cơ chế phân quyền riêng cho Broadcast** — dòng "Broadcast & Notification" đang có trong ma trận thô hiện tại chính là loại module mà tài liệu đó nói có thể giữ nguyên ma trận 5-verb đơn giản nếu không cần độ chi tiết như Incident (xem `RBAC_Redesign_Incident_Module.md` mục 6).

### 2.8 Background Job / Scheduler hiện có
Đúng 1 tiền lệ: `/api/cron/generate` (GET/POST, idempotent, trigger từ bên ngoài). Chưa có tiến trình scheduled/background nào khác trong codebase hiện tại.

### 2.9 Component tái sử dụng được (mang vào kế hoạch bên dưới)
`AdminGuard`, pattern gọi `/api/admin/audit` sau mỗi thao tác thay đổi, `getDb()`/`saveDb()`, khung UI `NotificationContext`/`NotificationWidget`, pattern job `/api/cron/generate`, shape `DistributionGroup`/`GroupMember` trong `groups.ts`, và schema `BroadcastRecord`/`BroadcastLog`.

---

## 3. Phân tích khoảng trống (Gap Analysis)

| Yêu cầu FSD | Ref | Trạng thái | Hướng xử lý | Ghi chú |
|---|---|---|---|---|
| Closure Broadcast tự động queue khi DM đóng incident | §5.11.1a, §10.1 | **Đã có sẵn** | REUSE | Action `close` trong `incidents/[...id]/route.ts` đã tạo `BroadcastRecord` (PENDING) |
| Menu soạn của Controller — xác nhận field/recipient, dispatch | §5.11.1b, §10.1 | **Thiếu** | CREATE NEW | Chưa có action API chuyển PENDING→SENT; chưa có menu UI |
| Notification hệ thống: nhắc closure broadcast → Controller | §10.5 | **Thiếu** | CREATE NEW (nhỏ) | Pattern `addNotification()` đã có; chỉ đơn giản là chưa gọi tại sự kiện này |
| Incident hiển thị trạng thái closure broadcast + ID liên kết | §5.11.1c | **Đã có sẵn** | REUSE | Đã render trong `incidents/[...id]/page.tsx` |
| Field bản ghi Broadcast (recipients, template, nội dung, timestamp, status) | §10.9a-c | **Đã có sẵn** | REUSE | Schema `BroadcastRecord` |
| Số liệu gửi theo trạng thái (sent/delivered/failed/pending) + số ack | §10.9d-e | **Thiếu** | MODIFY (mở rộng schema) | Hiện chỉ có 1 `status` + `deliveryAttempts`; chưa có breakdown theo từng recipient |
| UI module Broadcasts (list/detail/export) | §10.9c + nav | **Thiếu** | CREATE NEW | `src/app/broadcasts/page.tsx` chỉ là placeholder |
| Kênh gửi Email | §10.1a, §10.2 | **Thiếu** | CREATE NEW | Chưa có email gateway/mock nào; tab Channels chỉ là config, chưa nối |
| Kênh Push/System Notification | §10.2 | **Hỗ trợ một phần** | MODIFY | Widget in-app đã có nhưng theo từng trình duyệt (`localStorage`), chưa phải hộp thư dùng chung theo-user |
| Distribution Groups: CRUD, deactivate, nhóm recipient có tên | §10.3a-b | **Hỗ trợ một phần** | MODIFY | UI/shape đã hoàn chỉnh (`groups.ts`); chỉ lưu client, chưa có collection backend |
| Tự động điền sẵn recipient theo incident type + crisis level | §10.3c | **Thiếu** | CREATE NEW | UI config Matrix đã có nhưng chưa có gì ở runtime đọc nó |
| Thêm/bớt recipient riêng lẻ trước khi dispatch (không đổi group gốc) | §10.3d | **Thiếu** | CREATE NEW | Nằm trong UI soạn broadcast (mục trên) |
| Broadcast template map theo incident type + crisis level | §10.4a-b | **Hỗ trợ một phần** | MODIFY | Tab Templates đã có, nhưng chỉ key theo *loại* broadcast, chưa theo incident-type×crisis-level (chính FSD cũng đánh dấu mapping này là TBC — xem §15.3) |
| Template mặc định loại trừ field nhạy cảm; DM override tường minh để thêm | §10.4c-d | **Thiếu** | CREATE NEW | Chưa được model hoá |
| Bộ sự kiện System Notification (8 sự kiện) | §10.5 | **Hỗ trợ một phần** | MODIFY | 6/8 đã đấu nối ở client (tái dùng pattern); còn thiếu "Responder marks complete → Controller" và "closure broadcast prompt → Controller"; bản thân cơ chế gửi cần chuyển lên server (xem mục 2.6) |
| Broadcast Matrix (crisis level × loại × recipient × kênh) | §10.6 (FSD đánh dấu TBC) | **Hỗ trợ một phần** | MODIFY | Tab Matrix admin đã cài đúng shape này; chỉ lưu client; chưa được đọc lúc dispatch |
| Queue End-of-Day Interim Broadcast + DM review | §10.7, §5.11.2 | **Thiếu** | CREATE NEW | Chưa có scheduled job, chưa có UI review queue; chính FSD đánh dấu rule thời điểm là TBC (§15.3) |
| Weather Advisory Broadcast | §10.1 | **Thiếu** | CREATE NEW / ngoài phạm vi | Phụ thuộc feed thời tiết từ UCS, chưa có trong codebase này |
| Notification cho SDC Communications Team (có media tại hiện trường) | §10.8 | **Hỗ trợ một phần** | MODIFY | `MediaInvolvement.mediaAtScene` đã được ghi nhận trên Incident; chưa có workflow nhắc/gán/xác nhận xoay quanh nó |
| Admin cấu hình Broadcast (groups/matrix/templates/thời điểm EOD/prompt rule) | §13.3 | **Hỗ trợ một phần** | MODIFY | 3/5 mục đã có UI; thiếu config thời điểm EOD + prompt rule; chưa lưu ở backend |
| Phân quyền theo role cho module Broadcast | §3.1/§3.3, §13.1 | **Hỗ trợ một phần** | MODIFY | UI Permission Matrix đã model sẵn dòng này; chưa enforce ở đâu — nên mở rộng model permission của `RBAC_Redesign_Incident_Module.md` thay vì dựng riêng |
| Audit log cho các thao tác broadcast/config | §13.5 | **Đã có sẵn** | REUSE | `AuditLog` dùng chung + `/api/admin/audit`, đã được gọi từ các màn Broadcast Configuration |
| UCS hiển thị draft/dispatch broadcast | §2.5.7 | **Thiếu** | Ngoài phạm vi (hệ thống ngoài) | Codebase này chưa tích hợp UCS ở bất kỳ đâu |

---

## 4. Thiết kế Broadcast & Notification Framework

- **Tạo và quản lý Broadcast** — REUSE `BroadcastRecord` + logic tự tạo trong action `close` làm đường tạo chuẩn cho Closure Broadcast; CREATE cơ chế tự tạo tương tự cho các mục trong queue End-of-Day; CREATE 1 điểm vào thủ công "bắt đầu 1 broadcast" cho case §10.1(d) "authorised user separately initiates a Broadcast".
- **Nhắm đối tượng nhận (audience targeting)** — REUSE shape `DistributionGroup`/`GroupMember` từ `groups.ts`, MODIFY để lưu ở server; CREATE cơ chế resolve incident-type/crisis-level → group mặc định dựa trên shape Matrix config đã có.
- **Kênh notification** — Email: CREATE NEW (mirror pattern `sms-mock` thành 1 gateway `email-mock` ban đầu, khớp mô tả SMTP on-prem mà chính FSD ghi trong dữ liệu mặc định của tab Channels). In-app/Push: MODIFY `NotificationContext` hiện có thành 1 hộp thư lưu ở server, theo từng user.
- **Lập lịch (scheduling)** — CREATE NEW job End-of-Day theo đúng tiền lệ `/api/cron/generate` (idempotent, GET+POST, trigger được từ bên ngoài).
- **Theo dõi đã đọc/chưa đọc** — REUSE field `read: boolean` và cơ chế `markAsRead`/`markAllAsRead` sẵn có của `NotificationContext`; MODIFY để chuyển nguồn dữ liệu thật lên server.
- **Lịch sử notification** — MODIFY: mảng `notifications` trong `localStorage` hôm nay trở thành 1 collection `NotificationRecord` thật, query theo user.
- **Template** — REUSE cơ chế thay thế `{variable}` của tab Templates; MODIFY cách key từ chỉ-theo-loại-broadcast sang incident-type + crisis-level, và CREATE hành vi loại trừ mặc định field nhạy cảm.
- **Permissions** — MODIFY/mở rộng model permission của `RBAC_Redesign_Incident_Module.md` bằng bộ `broadcast.*` (xem mục 9).
- **Audit log** — REUSE `/api/admin/audit` cho mọi action thay đổi mới (soạn, dispatch, quyết định review EOD, thay đổi config).
- **Xử lý nền (background processing)** — REUSE pattern cron-endpoint cho cả bộ dựng queue EOD lẫn (tuỳ chọn) 1 lượt quét định kỳ ageing/crisis-reminder, phối hợp với Phase 7 của `FSD_V0.5_ENHANCEMENT_PLAN.md` thay vì làm trùng.
- **Notification theo sự kiện (event-driven)** — MODIFY: giữ nguyên các điểm gọi đã đấu nối sẵn trong route handler/trang thuộc vòng đời, nhưng gọi qua 1 helper `notify()` chạy ở server thay vì `addNotification()` chỉ chạy ở client.

---

## 5. Ảnh hưởng kiến trúc

Không đề xuất redesign kiến trúc Next.js/App Router/MongoDB. Các phần bổ sung:
- 1 module service mỏng **`src/lib/broadcast.ts`** (mirror cách `seriesEngine.ts` tách logic thuần khỏi phần lưu trữ trong `db.ts`) để: resolve recipient/template mặc định theo incident type + crisis level, dựng danh sách ứng viên cho queue EOD, và tính rollup số liệu gửi.
- 1 helper mỏng **`src/lib/notify.ts`** (`notify(userIds | role, payload)`) được các action handler hiện có gọi ở phía server, thay cho các lệnh gọi `addNotification()` rải rác ở client tại những điểm đại diện cho sự kiện backend thật (nhắc closure broadcast, cảnh báo ageing, …), trong khi `NotificationContext` vẫn giữ vai trò tầng đọc/subscribe ở client.
- Mở rộng helper kiểm tra quyền mà `RBAC_Redesign_Incident_Module.md` đang giới thiệu (`hasPermission(user, code, record?)`) thêm các mã `broadcast.*` — không dựng engine phân quyền mới.
- Tuỳ chọn, làm sau: 1 lớp trừu tượng email-gateway theo cùng interface với `sms-mock`, để sau này thay bằng 1 nhà cung cấp SMTP thật mà không phải đụng vào các điểm gọi.

---

## 6. Ảnh hưởng Database

| Thay đổi | Loại | Ghi chú |
|---|---|---|
| `BroadcastRecord`: thêm `deliveryCounts: { sent, delivered, failed, pending }`, `acknowledgedCount?` | Mở rộng field có sẵn | Cần cho §10.9d-e |
| `BroadcastRecord.recipients`: vẫn giữ `string[]` email, nhưng resolve qua group tại thời điểm tạo | Không đổi schema | Chỉ đổi hành vi |
| Collection mới `DistributionGroup` / `GroupMember` | Mới | Migrate nguyên shape `groups.ts` từ `localStorage` sang Mongo qua `getDb()`/`saveDb()` |
| Collection mới `BroadcastTemplate` | Mới | Migrate shape tab Templates ở `admin/broadcast-config`; thêm key `incidentType`/`crisisLevel`, `sensitiveFields: string[]` |
| Collection mới `BroadcastMatrixRule` | Mới | Migrate nguyên các dòng đang có ở tab Matrix |
| Collection mới `BroadcastChannelConfig` | Mới | Migrate nguyên các dòng đang có ở tab Channels |
| Collection mới `NotificationRecord` | Mới | Bản tương đương phía server của `NotificationItem` hiện tại; thêm `userId`/`recipientRole`, giữ `read`, `type`, `link` |
| `Incident`: không thêm field mới | — | `closureBroadcastStatus`/`closureBroadcastId` đã đủ dùng |
| `prisma/schema.prisma` | Cập nhật tài liệu | Thêm model tương ứng theo convention của repo (chỉ mang tính tài liệu, không nối client thật) |

---

## 7. Ảnh hưởng API

| Endpoint | Thay đổi |
|---|---|
| `POST /api/incidents/[...id]` action `close` | Không đổi — giữ nguyên hành vi tự-queue hiện tại |
| **`POST /api/incidents/[...id]` action mới `dispatch-broadcast`** | CREATE — Controller xác nhận recipient/field, chuyển `BroadcastRecord` PENDING→SENT, set `closureBroadcastStatus='dispatched'` |
| **`GET/POST /api/broadcasts`** | CREATE — list/detail/tạo thủ công cho trang module Broadcasts |
| **`GET/POST /api/cron/eod-broadcast`** | CREATE — mirror `/api/cron/generate`; dựng queue End-of-Day gồm các incident đang mở |
| **`POST /api/broadcasts/[id]/eod-decision`** | CREATE — Duty Manager xác nhận/từ chối 1 EOD broadcast đang queue theo từng incident |
| `GET/POST /api/admin/distribution-groups`, `/api/admin/broadcast-templates`, `/api/admin/broadcast-matrix`, `/api/admin/broadcast-channels` | CREATE — backend cho các màn admin đã có, thay thế `localStorage` |
| **`GET/POST /api/notifications`** | CREATE — hộp thư phía server làm backend cho `NotificationContext` |
| `POST /api/admin/audit` | Không đổi — tái sử dụng cho toàn bộ các mục trên |

---

## 8. Ảnh hưởng UI

| Màn hình | Thay đổi |
|---|---|
| `src/app/broadcasts/page.tsx` | Thay placeholder — list/lịch sử Broadcast + view chi tiết (§10.9), export |
| `src/app/incidents/[...id]/page.tsx` | Thêm action/modal "Perform Closure Broadcast" khi `closureBroadcastStatus==='pending'` và user có `broadcast.dispatch` |
| `src/app/admin/broadcast-config/page.tsx` | Đổi `localStorage` sang các API admin mới; mở rộng tab Templates với key incident-type/crisis-level + toggle field nhạy cảm; thêm field thời điểm EOD |
| `src/app/admin/distribution-groups/page.tsx` | Đổi `localStorage` sang `/api/admin/distribution-groups` |
| Mới: trang queue End-of-Day Review (Duty Manager) | CREATE — theo §10.7/§5.11.2 |
| `src/components/NotificationWidget.tsx` / `NotificationContext.tsx` | Đổi `localStorage` sang `/api/notifications`; poll hoặc refetch theo interval |
| `src/app/admin/roles/page.tsx` | Mở rộng Permission Matrix với mã `broadcast.*` theo mục 9 (bổ sung thêm vào phần đang làm của `RBAC_Redesign_Incident_Module.md`) |

---

## 9. Ảnh hưởng Business Logic

- **Validation khi dispatch**: 1 broadcast chỉ được chuyển PENDING→SENT khi recipient không rỗng và (nếu có thêm field nhạy cảm) đã bật cờ xác nhận tường minh (§10.4d).
- **Resolve recipient**: khi tạo broadcast, điền sẵn từ `BroadcastMatrixRule` theo key incident type + crisis level; cho phép thêm/bớt tuỳ ý mà không sửa group gốc (§10.3d) — lưu bản snapshot đã resolve vào `BroadcastRecord`, không bao giờ tham chiếu sống tới group.
- **Chặn field nhạy cảm**: template mặc định loại trừ các field được gắn nhãn nhạy cảm; muốn thêm vào cần xác nhận ở cấp Duty Manager, ghi lại trong audit entry.
- **Điều kiện vào queue EOD**: 1 incident đủ điều kiện vào queue nếu đang mở (không phải Closed/Pending Endorsement) tại thời điểm cutover EOD đã cấu hình; tiêu chí chính xác là 1 open item của FSD (§15.3) — cài đặt phía sau đúng 1 predicate có thể cấu hình để sau này siết lại rule mà không cần đổi schema.
- **Access control**: mở rộng `hasPermission()` của `RBAC_Redesign_Incident_Module.md` thêm `broadcast.view`, `broadcast.compose`, `broadcast.dispatch`, `broadcast.eod_review`, `broadcast.config` — seed khớp đúng hành vi mặc nhiên hiện tại (Controller: compose; Duty Manager/Officer: compose+dispatch+eod_review; Broadcast Recipient: không có quyền trong app; System/Current Ops Admin: config).
- **Tách biệt trách nhiệm (separation of duties)**: không cần thêm rule riêng cho Broadcast; kế thừa rule separation-of-duties của việc đóng Incident đã enforce ở tầng trên.

---

## 10. Ảnh hưởng tích hợp (Integration Impact)

| Module | Sự kiện nghiệp vụ | Trigger | Người nhận | Kênh | Thay đổi cần làm |
|---|---|---|---|---|---|
| Incident | Task assigned/reassigned | Action assign | Assignee | In-app | Đã đấu nối — tái dùng |
| Incident | Incident assigned (Responder Activity) | Action assign | Responder | In-app | Đã đấu nối — tái dùng |
| Incident | Responder báo đã hoàn tất input | Action `notify-complete` | Controller | In-app | **Thiếu — thêm lệnh gọi `notify()`** |
| Incident | Controller trả input về cho Responder | Action return-to-responder | Responder được assign | In-app | Kiểm tra lại đã đấu nối chưa; nếu chưa thì bổ sung |
| Incident | Incident log bị DM trả về để sửa | Action `return` | Controller của incident | In-app | Đã đấu nối — tái dùng |
| NOP | NOP đổi trạng thái | Chuyển trạng thái | Applicant + approver | In-app | Đã đấu nối — tái dùng |
| Fault | Nhận CMMS Fault ID | Gắn liên kết Fault | Controller của Case liên quan | In-app | Đã đấu nối — tái dùng |
| Incident | Ageing 12 ngày / 14 ngày | Kiểm tra theo lịch | Duty Team | In-app | MODIFY sang scheduler phía server (phối hợp với Phase 7 của `FSD_V0.5_ENHANCEMENT_PLAN.md`) |
| Incident | Đóng case cần broadcast | Action `close` | Controller của incident vừa đóng | In-app | **Thiếu — thêm lệnh gọi `notify()`** song song với việc tạo `BroadcastRecord` hiện có |
| Incident | Dispatch Closure Broadcast | Action `dispatch-broadcast` (mới) | Recipient group đã cấu hình | Email | **Module mới — build theo mục 7/8** |
| Incident (theo lô) | Các incident còn mở cuối ngày | Job theo lịch (mới) | Duty Manager | Queue in-app | **Module mới — build theo mục 7/8** |
| Incident | Xác nhận có media tại hiện trường | Cờ thủ công trên `MediaInvolvement` | Duty Manager → gán Controller | In-app | **Workflow mới — §10.8, hiện chỉ là 1 field dữ liệu** |

---

## 11. Kế hoạch triển khai

**Phase 0 — Nền tảng lưu trữ.** Chuyển Distribution Groups, Broadcast Templates, Broadcast Matrix, Channel Config từ `localStorage` sang collection Mongo đứng sau các endpoint `/api/admin/*` mới; chưa đổi hành vi, chỉ migrate cho tương đương. *Rủi ro: thấp. Phụ thuộc: không.*

**Phase 1 — Hoàn thiện vòng Closure Broadcast.** Thêm action `dispatch-broadcast`, modal soạn của Controller, và notification "nhắc closure broadcast" đang thiếu. Đây là gap chức năng lớn nhất và hoàn toàn chỉ bổ sung thêm vào logic đã đúng sẵn. *Rủi ro: thấp. Phụ thuộc: Phase 0 (để tra recipient/template).*

**Phase 2 — Lưu trữ Notification + enforce RBAC.** Đưa vào `NotificationRecord` + `/api/notifications`; đổi `NotificationContext` sang fetch từ server. Mở rộng model permission của `RBAC_Redesign_Incident_Module.md` với mã `broadcast.*` và nối `AdminGuard`/nút action vào đó. *Rủi ro: trung bình — đụng tới mọi điểm gọi notification hiện có; nên làm kiểu thay-tương-đương giữ nguyên signature hook `useNotifications()` để tránh regression UI. Phụ thuộc: Phase 0.*

**Phase 3 — Module Broadcasts (list/lịch sử/export).** Build `src/app/broadcasts/page.tsx` dựa trên `/api/broadcasts` mới. *Rủi ro: thấp. Phụ thuộc: Phase 0–1.*

**Phase 4 — End-of-Day Interim Broadcast.** Cron endpoint mới + UI queue review của Duty Manager + API quyết định theo từng incident. Thời điểm cutover EOD và tiêu chí đủ điều kiện là open item của FSD — cài đặt phía sau 1 predicate/thời điểm có thể cấu hình (mục 9), chờ BA xác nhận. *Rủi ro: trung bình (tiêu chí còn TBC — dựng cơ chế trước, tinh chỉnh rule sau). Phụ thuộc: Phase 0–3.*

**Phase 5 (stretch, làm sau khi BA xác nhận phạm vi) — Email gateway, chặn field nhạy cảm trong template, workflow notification SDC Communications Team, Weather Advisory Broadcast.** *Rủi ro: trung bình-cao — Weather Advisory phụ thuộc feed UCS không có trong codebase này; coi là phụ thuộc ngoài/ngoài phạm vi cho tới khi được xác nhận.*

---

## 12. Chia nhỏ task phát triển

1. Migrate Distribution Groups sang `/api/admin/distribution-groups` (Phase 0)
2. Migrate Broadcast Templates sang `/api/admin/broadcast-templates`, thêm key incident-type/crisis-level + cờ field nhạy cảm (Phase 0)
3. Migrate Broadcast Matrix + Channel Config sang API có lưu trữ (Phase 0)
4. Mở rộng schema `BroadcastRecord`: breakdown số liệu gửi, số ack (Phase 1)
5. Build `src/lib/broadcast.ts`: resolve recipient/template theo incident type + crisis level (Phase 1)
6. Thêm action `dispatch-broadcast` vào `/api/incidents/[...id]` (Phase 1)
7. Build modal "Perform Closure Broadcast" của Controller trên trang chi tiết Incident (Phase 1)
8. Bổ sung lệnh gọi `notify()` còn thiếu cho sự kiện nhắc closure-broadcast; audit qua `/api/admin/audit` (Phase 1)
9. Build collection `NotificationRecord` + `/api/notifications` (Phase 2)
10. Đổi phần bên trong `NotificationContext` sang fetch/mutate ở server, giữ nguyên signature hook (Phase 2)
11. Mở rộng permission registry RBAC với mã `broadcast.*`; seed đúng hành vi mặc nhiên hiện tại (Phase 2)
12. Nối `AdminGuard`/nút action vào `hasPermission()` cho các action Broadcast (Phase 2)
13. Build `/api/broadcasts` (list/detail/tạo thủ công) (Phase 3)
14. Thay placeholder `src/app/broadcasts/page.tsx` bằng UI list/lịch sử/export (Phase 3)
15. Build `/api/cron/eod-broadcast` theo pattern `/api/cron/generate` (Phase 4)
16. Build UI queue End-of-Day Review của Duty Manager + API quyết định theo từng incident (Phase 4)
17. (Stretch) Email gateway mock mirror `sms-mock`; nối action dispatch vào đó (Phase 5)
18. (Stretch) Workflow notification SDC Communications Team dựa trên `MediaInvolvement.mediaAtScene` (Phase 5)

---

## 13. Rủi ro kỹ thuật

| Rủi ro | Ảnh hưởng | Cách giảm thiểu |
|---|---|---|
| Chưa có tầng auth/session thật — notification "theo từng user" và RBAC đều giả định 1 định danh ổn định mà hiện chưa tồn tại | Cao | Scope Phase 2 chạy tạm trên username hiện tại của `RoleContext` làm key định danh tạm thời, khớp với hướng tạm chấp nhận đã có trong `RBAC_Redesign_Incident_Module.md`; xem lại khi có auth thật |
| Rule thời điểm/điều kiện EOD là open item của FSD (§15.3) | Trung bình | Dựng cơ chế job/queue ngay bây giờ phía sau 1 predicate có thể cấu hình; không hardcode 1 thời điểm cutover cụ thể |
| Bản thân Broadcast Matrix (§10.6) được FSD đánh dấu TBC | Trung bình | Tái dùng shape tab Matrix admin hiện có làm bản nháp làm việc; coi là config có thể sửa, không phải business logic cố định |
| Đổi `NotificationContext` từ `localStorage` sang lưu ở server có nguy cơ làm hỏng mọi điểm gọi hiện có (notification của Task/Incident/Case/NOP) | Trung bình | Giữ nguyên signature bên ngoài của hook `useNotifications()`; chỉ migrate phần bên trong, kiểm tra lại từng điểm gọi sau khi đổi |
| Trùng phạm vi với Phase 7 (ageing alert thật) và Phase 5 (Duty Manager elevation, ảnh hưởng tới separation-of-duties của broadcast-authorise) của `FSD_V0.5_ENHANCEMENT_PLAN.md` | Trung bình | Phối hợp trình tự với các kế hoạch đó thay vì dựng thêm 1 cơ chế song song thứ hai |
| Gửi Email là phần hoàn toàn mới — chưa có tích hợp gateway nào để tái dùng ngoài pattern `sms-mock` | Thấp-Trung bình | Bắt đầu bằng 1 `email-mock` mirror interface của `sms-mock` để sau này cô lập việc thay bằng SMTP thật |

---

## 14. Kịch bản test tổng quan

| Nhóm | Kịch bản | Kết quả kỳ vọng |
|---|---|---|
| Happy path | DM đóng 1 Incident cần broadcast → Controller mở modal soạn, xác nhận recipient, dispatch | `BroadcastRecord` chuyển PENDING→SENT; `closureBroadcastStatus`→`dispatched`; có ghi audit |
| Happy path | Job end-of-day chạy → các incident đang mở xuất hiện trong queue review của DM → DM duyệt 1 cái, từ chối 1 cái | Incident được duyệt có `BroadcastRecord`; cái bị từ chối thì không; cả 2 đều được log |
| Validation | Controller thử dispatch với danh sách recipient rỗng | Bị chặn kèm lỗi validation |
| Validation | Template có field nhạy cảm mà chưa xác nhận tường minh | Bị chặn tới khi có cờ xác nhận cấp DM |
| Permission | Controller (không có `broadcast.dispatch`) cố dispatch | Trả 403 / nút hành động bị ẩn trên UI |
| Permission | Role Broadcast Recipient truy cập `/broadcasts` | Bị chặn view theo ma trận role |
| Permission | System Administrator so với Current Ops Administrator trên Broadcast Configuration | Cả hai đều cấu hình được theo §13.3 (ngang nhau, không chỉ riêng DM) |
| Integration | Action dispatch cũng ghi vào `/api/admin/audit` | Có entry audit kèm snapshot before/after |
| Integration | Resolve recipient lấy đúng từ `BroadcastMatrixRule` theo type + crisis level của incident | Recipient điền sẵn khớp đúng mapping đã cấu hình |
| Regression | Các điểm gọi notification hiện có của Task/Case/NOP sau khi đổi `NotificationContext` | Vẫn hiển thị đúng theo từng role, giữ đúng trạng thái đã đọc/chưa đọc |
| Regression | Luồng đóng Incident hiện có (các field không liên quan broadcast) không bị ảnh hưởng khi thêm `dispatch-broadcast` | Hành vi hiện có của action `close` không đổi |
| Edge case | Incident đóng mà `closureBroadcastStatus` phải là `not_required` (category/type không yêu cầu broadcast) | Không sinh prompt/notification; badge hiển thị "Not required" |
| Edge case | Duty Manager từ chối toàn bộ incident trong queue EOD | Không tạo broadcast nào; queue dọn sạch cho ngày đó, không lỗi |
| Edge case | 2 user cùng lúc cố dispatch 1 broadcast đang pending | Lượt thứ 2 báo lỗi gọn gàng (trạng thái đã dispatched rồi) |

---

## 15. Các điểm cần làm rõ

1. **Nội dung Broadcast Matrix (§10.6, §15.3)** — FSD đánh dấu toàn bộ ma trận crisis-level/loại/recipient/kênh là TBC. Kế hoạch này tái dùng shape tab Matrix admin hiện có làm bản nháp làm việc — cần xác nhận với BA xem shape này đã final chưa.
2. **Nội dung template broadcast theo từng incident type và crisis level (§10.4, §15.3)** — FSD đánh dấu TBC. Cần có trước khi chốt logic resolve template (mục 9).
3. **Thời điểm và tiêu chí đủ điều kiện của End-of-Day broadcast (§10.7, §15.3)** — FSD đánh dấu TBC. Kế hoạch này dựng cơ chế phía sau 1 predicate có thể cấu hình; rule thật cần BA duyệt.
4. **Định nghĩa "nội dung nhạy cảm" để loại trừ mặc định khỏi template (§10.4c)** — chưa có định nghĩa theo từng field; cần để cài đặt logic loại trừ/override.
5. **Phạm vi của Crisis Management & Emergency Recall (FSD §11)** — chính FSD nói rõ đây là framework tách biệt khỏi Broadcast, và hiện chưa xây gì cả (chưa có recall group, chưa có SMS recall workflow, chưa có Duty Manager elevation). Cần xác nhận có đưa vào 1 phase gần hay không, vì nó dùng chung pattern recipient-group và gateway-mock mà kế hoạch này dựng.
6. **Authentication/định danh nhiều-user thật** — ✅ *Đã chốt theo phản hồi của Kyle:* cũng cứ mock/tạm trước, không chờ hệ thống login/session thật. Cả việc gửi Notification theo-từng-user lẫn enforce RBAC trong kế hoạch này sẽ dùng tạm username của `RoleContext` làm định danh (đúng hướng tạm đã chấp nhận trong `RBAC_Redesign_Incident_Module.md`) — không phải điểm chặn (blocker) của kế hoạch này. Sẽ thay bằng authentication thật ở 1 phase sau, khi hệ thống đó sẵn sàng.
7. **Cổng gửi Email (Email gateway)** — ✅ *Đã chốt theo phản hồi của Kyle:* dùng **mock** (mirror đúng pattern `sms-mock` hiện tại) cho Phase 5, chưa tích hợp SMTP/gateway thật ở giai đoạn này. Việc tích hợp gateway email thật để dành cho 1 phase sau, khi có nhu cầu thực tế.
8. **Phụ thuộc vào Duty Manager Role Elevation** — Phase 5 (elevation) của `FSD_V0.5_ENHANCEMENT_PLAN.md` chưa được build; các check separation-of-duties của broadcast-authorise nên tính tới identity đã elevate khi phần đó lên — cần xác nhận trình tự.
