# Events Master List Module — Implementation Plan

> **Nguồn:** `SDC IIS CMS FRD v0.5_SDC.pdf` — §2.4.1 (trang 12), §2.4.2-2.4.3 (trang 13), §3.3.4 (trang 30), §4.1(h) (trang 31), **§8 Events Master List Module** (trang 61-63, phần chính), §9.1.3 (trang 64-65) — so với code hiện tại của `sts-bnk` (Sentosa).
> **Ngày:** 2026-07-09.
> **Phạm vi đã chốt với Kyle (2026-07-09):** build full — module lõi + boundary drawing trên map (leaflet-draw, mới hoàn toàn) + bulk schedule upload (CSV/XLSX) + tích hợp e-Diary "Create or Link Event" + tích hợp Dashboard (Events Today / map layer). Không block chờ Shin Feng trả lời role matrix — build trước với placeholder, xem `QnA_FSD_v0.5_EventsMasterList.md`.
> **Trạng thái:** Cập nhật 2026-07-09: Shin Feng đã confirm mục 2 của QnA (event-case linking chỉ là gián tiếp qua e-Diary); Kyle tự chốt mục 3 (schedule file format = CSV/XLSX) — xem `QnA_FSD_v0.5_EventsMasterList.md`. Chỉ còn mục 1 (role matrix) đang chờ Shin Feng.
> **CODE ĐÃ TRIỂN KHAI (2026-07-09):** Tất cả 7 phase bên dưới đã code xong theo plan này. `npx tsc --noEmit` chạy sạch, 0 lỗi. Kyle cần tự chạy `npm run dev` để test UI thực tế (đặc biệt phần vẽ boundary bằng leaflet-draw — chưa test được bằng trình duyệt thật trong phiên này). Xem mục 7 "Kết quả triển khai" ở cuối file.

---

## 0. TL;DR

| # | Việc cần làm | Mức độ |
|---|---|---|
| 1 | Data model: mở rộng `EventRecord`, thêm `generateEventId`, đồng bộ `prisma/schema.prisma` | Nhỏ — layer DB (`getDb`/`saveDb`) **đã sẵn sàng cho `events`**, chỉ thiếu field và ID generator |
| 2 | Taxonomy: thêm category `Event` vào `src/lib/taxonomy.ts` + tab mới trong Admin Taxonomy | Nhỏ — pattern có sẵn, copy từ Fault/Incident |
| 3 | API: `api/events/route.ts` đang là **mock cứng hoàn toàn** (không đọc/ghi DB) → viết lại thành CRUD thật + route `[...id]` mới | Trung bình |
| 4 | UI list + calendar view, create/edit modal, filter theo date range/event type | Trung bình-lớn — `src/app/events/page.tsx` hiện là "Coming soon" stub, chưa có gì |
| 5 | Boundary/polygon drawing trên 2D map (§8.2) | **Lớn — chưa từng có trong app.** Leaflet mới chỉ vẽ marker (`MapComponent.tsx`, `IncidentMap.tsx`), chưa có `leaflet-draw`. NOP cũng cần y hệt tính năng này nhưng chưa ai xây |
| 6 | Events Schedule File Upload (bulk import CSV/XLSX + validate + review) (§8.3) | Lớn — chưa có cơ chế import file nào trong toàn bộ app để tham khảo |
| 7 | e-Diary → Create/Link Event (§9.1.3) | Nhỏ-trung bình — `EDiaryTab.tsx` mới chỉ có "Escalate to Incident", chưa có Create/Link Event |
| 8 | Dashboard wiring (Events Today, map layer) | Nhỏ — counter đã có sẵn, chỉ cần trỏ về API thật thay vì mock |
| 9 | Role matrix §3.3.4 | **Bảng trống trong chính FRD** — đã gửi QnA cho Shin Feng, build tạm với placeholder |

---

## 1. Tình trạng hiện tại (đã verify trực tiếp trong code, không chỉ dựa vào doc cũ)

### 1.1 UI — chưa có gì thật
- `src/app/events/page.tsx` — toàn bộ nội dung là placeholder "Coming soon — event scheduling and deployment planning." Không có list, không có form, không có calendar.
- `src/components/Sidebar.tsx` dòng 30 — nav item "Events" → `/events` **đã có sẵn** trong group "Planning", không cần thêm route mới.

### 1.2 API — mock cứng, không chạm DB
- `src/app/api/events/route.ts` — chỉ có `GET`, trả về mảng `MOCK_EVENTS` hardcode (4 record giả), **không gọi `getDb()`/`saveDb()`**. Không có `POST`/`PUT`/`DELETE`. Bất kỳ event nào "tạo" hôm nay cũng không lưu được.
- Ngược lại, **layer DB đã sẵn sàng**: `src/lib/db.ts` dòng 775 (`getDb`) và dòng 826 (`saveDb`) **đã có `events` trong danh sách collection Mongo được đọc/ghi song song** cùng cases/incidents/faults/tasks/... — tức phần plumbing đã tồn tại, chỉ route API chưa dùng tới nó. Đây là điểm khác với các module khác (Fault, Task) vốn đã nối đầy đủ `api/*/route.ts` → `getDb()`/`saveDb()`.
- Không có `src/app/api/events/[...id]/route.ts` (route chi tiết/edit/delete từng event) — cần tạo mới, theo pattern của `api/faults/[...id]/route.ts`.
- Không có `generateEventId()` trong `db.ts` (so với `generateFaultId`, `generateIncidentId`, v.v. đã có ở dòng 840-936). ID convention hiện tại trong mock/comment là `EVT-YYYY-NNNN` (`src/lib/db.ts` dòng 351, `MOCK_EVENTS` trong route.ts) — khác format `SEN/XX/YYYYMMDD/NNN` của Case/Fault/Incident. Đề xuất: giữ nguyên `EVT-YYYY-NNNN` vì đã được dùng làm chuẩn tham chiếu sẵn, trừ khi Kyle muốn đồng bộ format.

### 1.3 Data model — field đã có một phần, thiếu một phần
- `src/lib/db.ts` dòng 350-361, `interface EventRecord`: đã có `id, name, startDateTime, endDateTime, location (string), boundaryCoordinates? ({lat,lng}[]), type, description, createdBy, createdAt`.
- **Thiếu so với FRD §8.1.2:**
  - `location` hiện là `string` tự do — FRD §8.2a/b yêu cầu phải là location-hierarchy reference có cấu trúc (không chấp nhận free-text tuỳ ý), giống `Location` interface đã dùng chung cho Incident/Fault/Task (`db.ts` dòng 9-19: `road, building, levelSpace, nearAt, commonName, postalCode, tags, lat, lng`). Cần đổi `EventRecord.location` sang dùng `Location` interface này để nhất quán và để validate được.
  - Không có field lưu **tham chiếu tới e-Diary nguồn** ("Linked e-Diary" trong bảng field §8.1.2, và §8.1.1c/§9.1.3c yêu cầu retain reference). Cần thêm `sourceEDiaryId?: string`.
- `prisma/schema.prisma` dòng 410-423, `model EventRecord`: có `boundaryPolygons String?` (khác tên với `boundaryCoordinates` bên `db.ts`) và **thiếu hẳn field location-hierarchy reference / e-Diary reference**. Theo convention của project (ghi trong `INCIDENT_CATEGORY_IMPLEMENTATION_PLAN.md` mục 1: *"schema này hiện chỉ để doc, datastore thật là MongoDB-style JSON qua `src/lib/db.ts`"*), sẽ đồng bộ Prisma schema cho khớp nhưng không phụ thuộc runtime vào nó.

### 1.4 Taxonomy — chưa có "Event Type"
- `src/lib/taxonomy.ts` dòng 3: `TaxonomyItem.category` chỉ có `'Incident' | 'Fault' | 'Priority' | 'eDiary'` — **không có `'Event'`**.
- `src/app/admin/taxonomy/page.tsx` dòng 10: tabs chỉ gồm `'Incident' | 'Fault' | 'Priority' | 'eDiary'` — không có tab Event Type, dù FRD §8.1.2 yêu cầu Event Type là "Dropdown — Select from configured Event Type taxonomy".
- Không có `getEventTaxonomy()` helper (so với `getFaultTaxonomy()`/`getIncidentTaxonomy()` đã có, dòng 36-84).

### 1.5 Location hierarchy & boundary drawing — chưa có polygon nào trong app
- `src/components/LocationSelector.tsx` — component chọn Road/Building/Level/Space đã hoàn chỉnh, dùng chung cho các module khác, **có thể tái dùng thẳng cho Event Location** (§8.2a).
- **Nhưng không có bất kỳ khả năng vẽ polygon/boundary nào trong toàn app.** Grep `boundary|polygon|map-drawing` trong `src/app/admin/location-hierarchy/page.tsx` → 0 kết quả.
- `package.json` — chỉ có `leaflet` (^1.9.4) + `@types/leaflet`, **không có `leaflet-draw`** hay thư viện vẽ shape nào khác.
- `src/components/MapComponent.tsx` và `src/components/IncidentMap.tsx` — cả hai chỉ dùng Leaflet để render marker (dòng 18-94 của `MapComponent.tsx`), không có `L.FeatureGroup`/`L.Draw`.
- Đáng chú ý: `NOPRecord` (`db.ts` dòng 363-373, `prisma/schema.prisma` dòng 425-436) **có field `boundaryCoordinates`/`boundaryCoordinates` giống hệt yêu cầu của Event**, và `src/app/nops/page.tsx` **cũng đang là "Coming soon" stub** — nghĩa là NOP có cùng gap này, chưa ai xây polygon-drawing UI. Nếu build cho Event trước, nên thiết kế component dùng lại được cho NOP sau này (xem mục 5, Phase 3).

### 1.6 e-Diary integration — chưa có "Create or Link Event"
- `src/components/tabs/EDiaryTab.tsx` — đã có đầy đủ pattern list + filter + create modal + **"🔺 Escalate" → tạo Incident** (dòng 148-157, 592-624). **Không có** hành động tương đương để tạo/link Event hay Task, dù FRD §9.1.3(a) yêu cầu cả ba loại (Incident, Task, Event).
- Phạm vi plan này: chỉ thêm phần Event (Task nằm ngoài phạm vi, theo lựa chọn của Kyle).

### 1.7 Dashboard — counter đã có, chỉ đang trỏ vào mock
- `src/app/page.tsx` dòng 20 (`eventsToday` state), dòng 58 (set từ `data.stats?.today`), dòng 260-263 (render "Events Today" card) — **đã implement sẵn**, đang gọi `/api/events` và đọc `stats.today` — tức là một khi API thật trả đúng shape `{ events, stats: { today } }`, counter này tự động đúng mà không cần sửa UI. Chỉ cần route API thật trả đúng shape (giữ nguyên interface).
- Map layer filterable theo Event (§2.4 "filterable 2D map of island-wide activity") — chưa thấy layer riêng cho Event trên Dashboard map, cần kiểm tra thêm khi vào Phase 6 (map component hiện tại là gì trên trang Dashboard — cần audit lại lúc code, chưa nằm trong phạm vi audit lần này).

### 1.8 Role matrix — bảng trống trong chính FRD
- §3.3.4 "Events Management" chỉ là heading, không có bảng Role/Create/View/Edit/Delete theo sau (nhảy thẳng sang §3.4). Đã xác nhận lại bằng cách đọc trực tiếp text PDF (trang 30), không chỉ dựa vào `FSD_V0.5_ENHANCEMENT_PLAN.md` cũ.
- Đã gửi QnA cho Shin Feng — xem `QnA_FSD_v0.5_EventsMasterList.md`. Theo yêu cầu của Kyle, **build trước không block**, dùng placeholder matrix (mirror e-Diary Management §3.3.3).

---

## 2. FRD Requirements — breakdown đầy đủ (§8 + phần liên quan)

### 2.1 §8.1 Events Creation
- (a) Authorised users tạo/sửa/quản lý event record trong Events Master List.
- (b) Có thể tạo Event từ một e-Diary entry khi entry đó ghi nhận thông tin liên quan tới event.
- (c) Events Master List phải giữ reference tới e-Diary entry nguồn.
- (d) Events **không ảnh hưởng** Case status hay automated Case closure (không phải Case sub-record).

### 2.2 §8.1.2 Event Field Design

| Field | Input Type | Mandatory | Ghi chú |
|---|---|---|---|
| Event ID | System | Yes | Auto-generate |
| Event Name | Text | Yes | Free text |
| Event Date and Time | Date/Time | Yes | Start + end date/time |
| Event Location | Location hierarchy lookup | Yes | Reference location hierarchy, boundary chọn được trên 2D map |
| Event Type | Dropdown | Yes | Từ Event Type taxonomy đã config |
| Description | Text | No | Free text |
| Linked e-Diary | System reference | No | Hiển thị e-Diary entry nguồn/liên kết, mở được detail view |
| Created By | System | Yes | Auto từ account |
| Created At | System | Yes | Auto timestamp |

### 2.3 §8.2 Event Location
- (a) Chọn từ location hierarchy — không cho free-text tuỳ ý.
- (c) Nếu event phủ một khu vực cụ thể, user được đánh dấu boundary trên 2D map **trong phạm vi** location hierarchy đã chọn.
- (d) Hệ thống phải **chặn** boundary vẽ ra ngoài khu vực location hierarchy đã chọn, hoặc vi phạm "map-drawing rules" đã cấu hình (FRD không định nghĩa rules này là gì cụ thể — flag ở mục 6, sẽ implement containment-check cơ bản trước).
- (e) System Administrator maintain location hierarchy, map reference points/boundaries, và map-drawing rules qua System Configuration.

### 2.4 §8.3 Events Schedule File Upload
- (a) Authorised user upload file lịch event để hệ thống xử lý.
- (b) Format file: **FRD để ngỏ, xác nhận lúc technical design** — **đã chốt CSV/XLSX** (Kyle confirm 2026-07-09, xem QnA mục 3).
- (c) Extract Name/Date-time/Location/Details, hiển thị cho user review + amend trước khi confirm.
- (d) Validate Location đã extract theo Location Hierarchy, flag record thiếu/sai/không khớp/trùng lặp.
- (e) **Không cho confirm** vào Events Master List cho tới khi mọi flag đã được sửa.
- (f) Record confirm thành công → load vào Events Master List; record lỗi → report lại cho user.

### 2.5 §8.4 Event Calendar and List View
- (a) Calendar view hiển thị toàn bộ event, upcoming + active, theo ngày.
- (b) List view có filter theo date range và event type.

### 2.6 §2.4.2 / §2.4.3 — Dashboard
- Metric "Events Today" = đếm event đang diễn ra hoặc scheduled trong ngày hiện tại.
- Dashboard surface event qua: Events Today metric, Events map layer, navigation vào module.

### 2.7 §9.1.3 — Create/Link từ e-Diary
- (a) User có quyền được tạo/link Incident, Task, hoặc **Event** từ một e-Diary entry cần follow-up/event registration.
- (c) Event tạo từ e-Diary → được tạo vào Events Master List, giữ reference tới e-Diary entry nguồn.
- (d) Event **không phải Case sub-record**, không ảnh hưởng Case status/closure.
- (e) e-Diary entry giữ nguyên không đổi sau khi Event được tạo/link.

---

## 3. Data Model Changes

### 3.1 `src/lib/db.ts`
```ts
export interface EventRecord {
  id: string; // EVT-YYYY-NNNN — giữ nguyên convention hiện có
  name: string;
  startDateTime: string;
  endDateTime: string;
  location: Location;                       // đổi từ string → dùng chung interface Location (dòng 9-19)
  boundaryCoordinates?: { lat: number; lng: number }[]; // giữ nguyên, đã có sẵn
  type: string;                              // Event Type — từ taxonomy
  description?: string;
  sourceEDiaryId?: string;                   // MỚI — "Linked e-Diary" §8.1.2
  createdBy: string;
  createdAt: string;
}

export function generateEventId(db: DbSchema): string {
  // theo pattern generateFaultId (dòng 919-936), giữ format EVT-YYYY-NNNN
}
```

### 3.2 `src/lib/taxonomy.ts`
- Thêm `'Event'` vào union `TaxonomyItem['category']`.
- Seed `DEFAULT_REFERENCE_DATA` với vài Event Type mẫu (vd: Sports & Recreation, F&B, Works, Internal — khớp `type` đang dùng trong `MOCK_EVENTS` hiện tại để không phá dữ liệu demo).
- Thêm `getEventTaxonomy()` mirror `getFaultTaxonomy()`.

### 3.3 `prisma/schema.prisma`
- Cập nhật `model EventRecord` cho khớp field mới (doc-only, không phải datastore thật — theo đúng convention project đang dùng).

---

## 4. Kiến trúc & quyết định đã chốt (2026-07-09)

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Role matrix §3.3.4 (trống trong FRD) | Build trước với placeholder (mirror e-Diary matrix), gửi QnA song song | Kyle chọn không block |
| Boundary drawing trên map (§8.2) | Build ngay bằng `leaflet-draw` | Kyle chọn build ngay; component sẽ thiết kế tái dùng được cho NOP sau |
| Schedule file upload (§8.3) | Build trong phase này, format CSV/XLSX | Kyle chọn build ngay; format đã tự chốt 2026-07-09 (quyết định kỹ thuật, không cần BA) |
| Phạm vi tích hợp | Bao gồm cả e-Diary Create/Link Event **và** Dashboard wiring trong plan này | Kyle chọn cả hai, không tách plan riêng |

---

## 5. Implementation Plan theo Phase

### Phase 1 — Data foundation & taxonomy
1. `src/lib/db.ts`: mở rộng `EventRecord`, thêm `generateEventId()`.
2. `src/lib/taxonomy.ts`: thêm category `Event`, seed default taxonomy, thêm `getEventTaxonomy()`.
3. `src/app/admin/taxonomy/page.tsx`: thêm tab "Event Type Taxonomy" (copy pattern Incident/Fault, không cần sub-types — FRD không mô tả Event Type có sub-type).
4. `prisma/schema.prisma`: đồng bộ field.

### Phase 2 — API (CRUD thật, thay mock)
5. `src/app/api/events/route.ts`:
   - `GET` — đọc từ `getDb()`, filter theo `dateStart`/`dateEnd`/`eventType` (§8.4b), giữ nguyên response shape `{ events, stats: { today } }` để không phá Dashboard (mục 1.7).
   - `POST` — tạo event, validate `location` theo location hierarchy (§8.2b), validate boundary nằm trong phạm vi hierarchy đã chọn (§8.2d) trước khi lưu.
6. `src/app/api/events/[...id]/route.ts` (mới) — `GET` chi tiết, `PUT` edit, `DELETE` (theo pattern `api/faults/[...id]/route.ts`).
7. Audit log: ghi `module: 'Events'` cho mọi create/edit/delete, theo pattern đã dùng ở Taxonomy (`logAudit` gọi `/api/admin/audit`).

### Phase 3 — Boundary/map-drawing component (mới hoàn toàn)
8. Thêm dependency `leaflet-draw` + `@types/leaflet-draw`.
9. Xây `BoundaryMapDrawer` component dùng chung: vẽ polygon trên nền `MapComponent`, validate polygon nằm trong khu vực location hierarchy đã chọn (§8.2c/d) — containment check cơ bản (không có định nghĩa "map-drawing rules" chi tiết từ FRD, flag ở mục 6).
10. System Configuration (`admin/location-hierarchy` hoặc `admin/system-settings`): thêm chỗ System Admin maintain map reference points/boundaries (§8.2e) — mức tối thiểu để phục vụ containment check ở bước 9.

### Phase 4 — Event Creation & Management UI
11. Viết lại `src/app/events/page.tsx`: bỏ stub, dựng list + calendar view (2 view theo đúng §8.4), filter theo date range + event type.
12. Create/Edit modal: Event Name, Date/Time (start/end), `LocationSelector` + `BoundaryMapDrawer`, Event Type (dropdown taxonomy), Description, hiển thị Linked e-Diary (read-only nếu có).
13. Role gating theo placeholder matrix (mục 1.8) — pattern `ALLOWED_ROLES` giống `EDiaryTab.tsx` dòng 9, 62, 90-98.

### Phase 5 — Events Schedule File Upload (§8.3)
14. UI upload CSV/XLSX.
15. Parser + extract Name/Date-time/Location/Details → bảng review cho user amend trước khi confirm.
16. Validate location theo hierarchy, flag thiếu/sai/không khớp/trùng lặp — chặn confirm cho tới khi hết flag (§8.3d/e).
17. Confirm → ghi vào Events Master List qua API Phase 2; record lỗi → hiển thị lại cho user (§8.3f).

### Phase 6 — Integration
18. `EDiaryTab.tsx`: thêm action "Create or Link Event" cạnh nút Escalate hiện tại (dòng ~340-350), theo đúng §9.1.3 — Event tạo ra set `sourceEDiaryId`, e-Diary entry giữ nguyên không đổi.
19. `src/app/page.tsx` (Dashboard): xác nhận `eventsToday`/map layer đọc đúng từ API thật (đã tự động hoạt động nếu response shape giữ nguyên, xem mục 1.7) — audit thêm map layer filterable theo Event lúc code, hiện chưa rõ implementation map hiện tại trên Dashboard có layer nào chưa.
20. Case detail view: hiển thị Event liên kết gián tiếp qua e-Diary (đọc-only, không có `caseId` trực tiếp trên Event) — **đã confirm với Shin Feng 2026-07-09**: chuỗi Event ↔ e-Diary ↔ Case, trace qua `sourceEDiaryId` → e-Diary's `caseId`, không query Event trực tiếp theo Case.

### Phase 7 — Verification
21. `npx tsc` build sạch.
22. Test thủ công: create/edit event, boundary reject khi vẽ ra ngoài hierarchy, calendar/list filter đúng, CSV import happy-path + flagged-row correction path, e-Diary create/link Event, Dashboard counter đúng theo dữ liệu thật, role-gating theo placeholder matrix.

---

## 6. Open Items / Risks

- **Role matrix §3.3.4** — đang chờ Shin Feng, xem `QnA_FSD_v0.5_EventsMasterList.md`. Nếu câu trả lời khác placeholder, cần sửa lại `ALLOWED_ROLES`/Edit-Delete logic ở Phase 4 bước 13.
- **"Map-drawing rules" (§8.2d)** — FRD không định nghĩa cụ thể rule là gì (diện tích tối đa? khu vực cấm?). Plan này chỉ implement containment-check cơ bản (boundary phải nằm trong location hierarchy đã chọn); nếu SDC có rule cụ thể hơn cần bổ sung sau — nên hỏi thêm khi có dịp, chưa đưa vào QnA lần này vì chưa chắc là điểm BA quan tâm ngay.
- **leaflet-draw là dependency mới, tính năng vẽ polygon đầu tiên trong app** — rủi ro về effort/bug cao hơn các phase còn lại vì không có pattern sẵn để copy. NOP (`src/app/nops/page.tsx`, cũng đang là stub) có yêu cầu y hệt — nên thiết kế `BoundaryMapDrawer` đủ generic để NOP dùng lại, tránh làm 2 lần.
- **ID convention** — giữ `EVT-YYYY-NNNN` (khác `SEN/XX/YYYYMMDD/NNN` của Case/Fault/Incident) để không phá dữ liệu demo hiện có; nếu Kyle muốn đồng bộ format, cần đổi ở bước 1.
- **Schedule file format (CSV/XLSX)** — đã chốt (Kyle, 2026-07-09), không cần chờ BA; nếu sau này SDC đưa ra template cụ thể khác, Phase 5 cần điều chỉnh parser.

---

## 7. Kết quả triển khai (2026-07-09)

Đã code xong toàn bộ 7 phase:

- **Phase 1:** `EventRecord` mở rộng (`location: Location`, `sourceEDiaryId`), `generateEventId()`, taxonomy `Event` category + `getEventTaxonomy()`, tab mới trong Admin Taxonomy, `prisma/schema.prisma` đồng bộ.
- **Phase 2:** `api/events/route.ts` viết lại hoàn toàn (GET/POST thật qua `getDb()/saveDb()`, thay mock cứng), `api/events/[...id]/route.ts` mới (GET/PATCH/DELETE).
- **Phase 3:** `leaflet-draw` + `papaparse` + `xlsx` đã `npm install`. `BoundaryMapDrawer.tsx` — component vẽ polygon dùng chung, containment-check theo bán kính quanh location đã chọn (thay cho "map-drawing rules" chưa được FRD định nghĩa cụ thể — xem mục 6).
- **Phase 4:** `EventsTab.tsx` (list + calendar view tự viết, filter theo date range/type), `EventCreateModal.tsx` (form đầy đủ theo §8.1.2), role-gating theo placeholder matrix trong QnA.
- **Phase 5:** `EventScheduleUploadModal.tsx` — upload CSV/XLSX, review/amend table, validate + flag theo §8.3(d), block confirm cho tới khi hết flag.
- **Phase 6:** `EDiaryTab.tsx` thêm nút "📅 Event" (Create New / Link Existing), Dashboard (`page.tsx`) đã wire `events` thật vào `MapComponent` (layer riêng màu tím) + counter Events Today tự động dùng data thật.
- **Phase 7:** `npx tsc --noEmit` sạch, 0 lỗi.

**Lưu ý quan trọng — sự cố ghi file trong phiên này:** trong lúc code, nhiều lần `Edit`/`Write` (qua tool phía Windows) bị cắt cụt nội dung khi ghi vào ổ `D:\Huy Sentosa` (mount FUSE), làm hỏng `db.ts`, `taxonomy.ts`, `schema.prisma`, `admin/taxonomy/page.tsx`, `layout.tsx`, `EDiaryTab.tsx`, `page.tsx`, `MapComponent.tsx`, `api/events/route.ts`, `events/page.tsx` — toàn bộ đã được phát hiện qua `git diff`/`npx tsc` và khôi phục lại đúng bằng cách ghi trực tiếp qua bash/Python (không dùng `git checkout` được vì ổ mount không cho `unlink`). Đã verify lại toàn bộ bằng `git diff --stat` + `npx tsc --noEmit` sạch. Có 2 file rác không xoá được (`src/lib/_test2.ts`, `src/lib/_test_mount_write.ts`, nay đã vô hại) — **Kyle xoá tay giúp**.

**Còn thiếu / cần Kyle tự làm:**
- Test UI thật qua `npm run dev` — đặc biệt tương tác vẽ polygon (`leaflet-draw`) chưa test được bằng trình duyệt trong phiên này.
- Role matrix §3.3.4 vẫn chờ Shin Feng — sửa `CREATE_EDIT_ROLES`/`DELETE_ROLES` trong `EventsTab.tsx` nếu câu trả lời khác placeholder.
- MongoDB thật của Kyle có thể có dữ liệu `events` cũ từ trước (nếu có) ở format khác — kiểm tra khi chạy thật.
