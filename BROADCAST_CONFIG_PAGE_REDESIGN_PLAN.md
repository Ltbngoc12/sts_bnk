# Broadcast System Config — Redesign Plan (Template / Routing Matrix / EOD Timing / Action Prompt Rules)

**Sentosa (sts-bnk)** | **Draft v1.0** | 2026-07-25
**Phạm vi:** Redesign `src/app/admin/broadcast-config/page.tsx` thành 4 tab theo yêu cầu của Kyle: (1) Template, (2) Routing Matrix, (3) End-of-day broadcast timing, (4) Action prompt rules.
**Đối chiếu code (đọc trực tiếp hôm nay):** `src/app/admin/broadcast-config/page.tsx`, `src/lib/broadcastConfig.ts`, `src/lib/broadcast.ts`, `src/lib/broadcastStore.ts`, `src/app/api/admin/broadcast-templates|broadcast-matrix|broadcast-channels|broadcast-config|distribution-groups/route.ts`, `src/app/api/cron/eod-broadcast/route.ts`, `src/app/api/incidents/[...id]/route.ts` (action `close`), `src/lib/taxonomy.ts`, `src/lib/incidentCategory.ts`, `src/lib/groups.ts`, `src/lib/permissions.ts`, `src/lib/users.ts`, `src/context/RoleContext.tsx`, `src/components/AdminGuard.tsx`, `src/app/admin/roles/page.tsx`, `src/app/api/admin/audit/route.ts`, `src/app/broadcasts/eod-review/page.tsx`, `src/app/broadcasts/page.tsx`, `src/lib/db.ts` (model `BroadcastRecord`).
**Đối chiếu tài liệu:** `BROADCAST_NOTIFICATION_FRAMEWORK_IMPLEMENTATION_PLAN_v0.3.md` (plan trước, đã triển khai phần lớn backend), `FRD_CMS.txt` §9 "Broadcast and Notification Framework" (dòng 1338–1428) và §"System Configuration and Administration → Broadcast Configuration" (dòng 1450–1488).
**Lưu ý nguồn FSD:** Bản FSD v0.5 gốc (`SDC IIS CMS FRD v0.5_SDC.pdf`) mà plan v0.3 đã đọc trực tiếp **không còn nằm trong repo** (không tìm thấy file PDF/`*_extracted.txt` nào). Plan này đối chiếu lại bằng `FRD_CMS.txt` (bản v0.1, vẫn còn nguyên trong repo) cho phần khung câu chữ ổn định, và thừa hưởng các câu quote v0.5 mà plan v0.3 đã trích dẫn nguyên văn (không tự suy diễn thêm câu chữ v0.5 mới nào ở đây). Nếu có bản v0.5 mới, nên đưa lại vào repo để soát cho chắc trước khi build.

---

## 0. Phát hiện quan trọng nhất — trang admin CHƯA THEO KỊP backend đã redesign

Đây là điều cần biết trước khi đọc phần còn lại: giữa lúc viết plan v0.3 (2026-07-22) và hôm nay, đã có 1 commit (`15dc818 feat(broadcasts): add broadcast notification framework, EOD review, and redesign Broadcasts UI`) triển khai **phần lớn backend** đúng theo plan v0.3 — nhưng **không đụng vào `admin/broadcast-config/page.tsx`**. Cụ thể đã có rồi (REUSE được, không cần viết lại):

- `src/lib/broadcastConfig.ts` — type + seed đã chuẩn theo FSD: `BROADCAST_TYPES` = Closure/End-of-Day Interim/Weather Advisory (đúng 3 loại Kyle liệt kê); `BroadcastTemplate` đã có field `incidentType`, `incidentSubType`, `crisisLevel`, `sensitiveFields`; `BroadcastMatrixRule` đã có `incidentType`, `incidentSubType`, `crisisLevel`, `recipientGroup`, `deliveryChannels`; `BroadcastConfig` singleton đã có `endOfDayTime` + `closureRequiredCategories`.
- `src/lib/broadcastStore.ts` — Mongo thật (`sentosa-cms` DB), có sẵn `getBroadcastTemplates/saveBroadcastTemplates`, `getBroadcastMatrix/saveBroadcastMatrix`, `getBroadcastChannels/saveBroadcastChannels`, `getBroadcastConfig/saveBroadcastConfig`, `getDistributionGroups/saveDistributionGroups`.
- `src/lib/broadcast.ts` — logic thuần: gate C1 (`isClosureBroadcastRequired`), resolve rule theo type+subtype+level (`resolveMatrixRule`), resolve template, resolve EOD, `isEodEligible`.
- API: `GET/POST /api/admin/broadcast-templates`, `/broadcast-matrix`, `/broadcast-channels`, `/broadcast-config`, `/distribution-groups` — đều đã nối `broadcastStore` (Mongo thật), không còn `localStorage`.
- `/api/cron/eod-broadcast` — job EOD idempotent, dùng đúng resolver.
- Action `close` trong `incidents/[...id]/route.ts` (dòng 496–541) — **gate C1 đã cài đúng**, tạo `BroadcastRecord` PENDING kèm recipient/template/channel đã resolve, hoặc set `not_required` theo category.

**Nhưng `admin/broadcast-config/page.tsx` (543 dòng) vẫn y nguyên bản CŨ trước cả plan v0.2/v0.3:**
- Lưu 100% `localStorage` (`admin_bc_templates`, `admin_bc_matrix`, `admin_bc_channels`) — **không gọi bất kỳ API nào ở trên**. Sửa gì trên trang này hiện tại **không ảnh hưởng gì đến broadcast thật** được tạo bởi action `close`/EOD cron — chúng đọc từ Mongo qua `broadcastStore`, còn trang admin ghi vào trình duyệt.
- Taxonomy loại broadcast sai: `'Incident Broadcast' | 'Crisis Broadcast' | 'End-of-Day Interim Broadcast'` — không khớp `BROADCAST_TYPES` chuẩn (`Closure Broadcast` / `End-of-Day Interim Broadcast` / `Weather Advisory Broadcast`) mà chính `broadcastConfig.ts` đã định nghĩa.
- Matrix Rule modal: "Recipient Group" và "Delivery Channels" là **ô nhập text tự do** (dòng 510–530) — đúng như Kyle mô tả là khó dùng/dễ sai chính tả. Không có field Incident Type/Sub-type dù interface `BroadcastMatrixRule` đã hỗ trợ.
- Không có field `status` (Active/Inactive) trên Template lẫn Matrix Rule — nghĩa là **chưa thể** làm đúng yêu cầu "Matrix chỉ active/inactive, không xóa" hay "Template có thể active/inactive" — đây là **thay đổi schema**, không chỉ đổi UI.
- Không có tab End-of-Day timing, không có tab Action Prompt Rules — 2 tab này **hoàn toàn chưa tồn tại** ở bất kỳ đâu (kể cả backend).
- Không có cơ chế "kéo thả / chọn field" để chèn `{variable}` — chỉ có 1 `<textarea>` để admin tự gõ tay token, dựa vào trí nhớ.

→ Bản redesign lần này vừa phải **bắt kịp backend đã có** (đổi localStorage → API thật, nắn taxonomy), vừa **build mới 2 tab và 1 phần schema** hoàn toàn chưa có. Không phải chỉ "redesign UI".

---

## 1. Đối chiếu từng tab đề xuất của Kyle

### 1.1 Tab Template

| Yêu cầu Kyle | FSD (FRD_CMS.txt §9 dòng 1372–1378, §Broadcast Config dòng 1483) | Hiện trạng code | Gap |
|---|---|---|---|
| 3 loại: Closure / End-of-Day Interim / Weather Advisory | "configurable broadcast templates mapped to incident type and crisis level" | `BROADCAST_TYPES` (broadcastConfig.ts:15-19) đã đúng 3 loại | ✅ Đã có ở model, **chưa có ở UI** (UI đang dùng 3 loại sai) |
| Nhiều template / loại, active/inactive | Không nói rõ multi-per-type, nhưng "Templates shall be configurable" | `BroadcastTemplate[]` là mảng, `resolveTemplate()` đã có logic chọn template khớp nhất theo `incidentType` trong nhiều template cùng `category` (broadcast.ts:59-69) → multi-per-type **đã hoạt động được về mặt logic** | ❌ Thiếu field `status` trên `BroadcastTemplate`; `resolveTemplate()` chưa lọc theo status (sẽ resolve nhầm cả template Inactive) |
| Chọn field từ danh sách BE định nghĩa (kéo thả) thay vì gõ tay `{incident_id}` | "Templates shall define the default set of incident fields included in the broadcast" | Không có field catalog nào được export riêng. `MOCK_VARS` trong page.tsx cũ (dòng 65-78) chỉ để preview, **không phải danh sách field hợp lệ**, và đã **lệch** với field thật mà `broadcast.ts` resolve (ví dụ thiếu `case_id`, `closed_at`, `closed_by`, `incident_subtype`; ngược lại `total_incidents/open_incidents/...` trong MOCK_VARS không hề được `resolveClosureBroadcast`/`resolveEodBroadcast` điền) | ❌ Cần 1 catalog field chính thức, dùng chung giữa UI picker và resolver (xem §3) — hiện đang là 2 nguồn dữ liệu tự phát lệch nhau |
| Preview | "Note: Broadcast template content per incident type and crisis level to be confirmed" (TBC) | Preview đã có (`renderVarsPreview`, dòng 233-239) nhưng dùng `MOCK_VARS` lệch chuẩn nói trên | ◑ Reuse cơ chế substitution, thay nguồn field |
| Audit log | "Audit Log ... shall be accessible to System Admin" (chung toàn hệ thống) | Trang cũ đã gọi `/api/admin/audit` POST khi save (dòng 127-145) — pattern đúng, chỉ cần giữ & mở rộng cho status toggle | ✅ REUSE pattern, chỉ cần thêm log point cho: create, update nội dung, toggle status |
| Loại trừ field nhạy cảm | "Default templates shall be configured to exclude sensitive content ... Inclusion beyond default requires explicit confirmation by the Duty Manager at dispatch" | `sensitiveFields?: string[]` đã có trên `BroadcastTemplate` (broadcastConfig.ts:40) và đã seed cho `tpl-closure`/`tpl-eod` | ◑ Model có, **UI chưa có cách xem/sửa danh sách field nhạy cảm** của 1 template |

### 1.2 Tab Routing Matrix

| Yêu cầu Kyle | FSD (FRD_CMS.txt dòng 1481, §Crisis Level Classification dòng 1379-1398) | Hiện trạng code | Gap |
|---|---|---|---|
| Map: Incident Type (từ Taxonomy) × Crisis Level → Template + Distribution Group | "Broadcast routing matrix: Map incident type and crisis level to distribution groups and delivery channels" | `BroadcastMatrixRule` đã có `incidentType`, `incidentSubType`, `crisisLevel`, `recipientGroup`, `deliveryChannels` (broadcastConfig.ts:45-53); `resolveMatrixRule()` đã resolve đúng thứ tự ưu tiên type+subtype+level → type+level → level | ⚠️ **Rule hiện KHÔNG trỏ tới Template** — nó chỉ chọn recipient group + channel. Việc chọn Template lại là 1 hàm resolve riêng (`resolveTemplate`, theo category+incidentType), **độc lập với Matrix**. Yêu cầu của Kyle ("rule này dùng Template gì") **chưa khớp kiến trúc hiện tại** — cần quyết định thiết kế (xem §3.2) |
| Incident Type lấy từ Taxonomy | "Incident Type and Sub-type taxonomy" là 1 mục cấu hình riêng (dòng 1462) | `src/lib/taxonomy.ts` **100% localStorage** (`admin_reference_data`), **không có API, không có DB collection nào** | ❌ Về nguyên tắc là gap (2 admin ở 2 máy có thể thấy taxonomy khác nhau; server không validate `incident.type` so với taxonomy hiện hành). **Đã chốt với Kyle: chấp nhận rủi ro này, dùng snapshot taxonomy hiện tại (`admin_reference_data`/`DEFAULT_REFERENCE_DATA`) làm dropdown tĩnh cho đợt redesign này — không xây API taxonomy mới (xem §8.3)** |
| Distribution Group dạng dropdown | "system shall pre-populate the recipient field with the default distribution group mapped to incident type and crisis level" | `/api/admin/distribution-groups` đã có, đọc Mongo thật (`getDistributionGroups`) | ✅ Sẵn sàng — chỉ cần Routing Matrix UI fetch từ đây thay vì gõ tay |
| Chỉ active/inactive, không xóa | Không nói rõ, nhưng khớp pattern Distribution Group ("creation, editing, and deactivation") và Broadcast Channel hiện tại | `BroadcastMatrixRule` **chưa có field `status`** | ❌ Cần thêm schema; UI cũ hiện KHÔNG có nút xóa (chỉ Add/Edit) nên hành vi "không xóa" thực ra **đã đúng mặc định** — chỉ thiếu cơ chế Active/Inactive tường minh |
| Audit log từng thay đổi | — | Pattern `logAudit()` đã có ở trang cũ cho matrix (dòng 170-202) | ✅ REUSE, mở rộng thêm cho action toggle status |
| Dropdown thay vì "prompt SQL" | — | Hiện `formGroup` (Recipient Group) và `formChannels` (comma-separated) đều là input text tự do (dòng 509-531) — đây chính là phần "khó dùng như viết SQL" mà Kyle nhắc tới | ❌ Đổi sang `<select>` (Distribution Group) + multi-select checkbox (Delivery Channel, từ `/api/admin/broadcast-channels`) |

### 1.3 Tab End-of-day broadcast timing

FSD (dòng 1487-1488): *"End-of-day broadcast timing: Define the time at which open Incidents are surfaced in the Duty Manager's end-of-day interim broadcast queue."*

Backend **đã có sẵn 100%**: `BroadcastConfig.endOfDayTime` (broadcastConfig.ts:68, default `'20:00'`), `GET/POST /api/admin/broadcast-config` đã đọc/ghi Mongo, `isEodEligible`/`buildEodCandidates` trong `broadcast.ts` là logic tiêu thụ giá trị này (dù thực chất cron `eod-broadcast/route.ts` hiện **chưa thật sự lọc theo giờ `endOfDayTime`** — nó chạy bất cứ khi nào bị gọi, không so sánh với đồng hồ hệ thống; đây là gap thuộc phạm vi cron, không thuộc phạm vi UI, ghi nhận ở §3.4). **Chỉ thiếu duy nhất: 1 tab UI** để admin xem/sửa giờ này qua `<input type="time">` + nút Save + audit log. Đây là tab **rẻ nhất** để build (không cần schema mới, API đã sẵn).

### 1.4 Tab Action prompt rules

FSD **không có mục nào tên "Action Prompt Rules"** trong `FRD_CMS.txt` (bản v0.1) — mục "Broadcast Configuration" ở đây chỉ liệt kê 5 dòng: Distribution groups / Broadcast routing matrix / Broadcast templates / SMS gateway settings / End-of-day broadcast timing (dòng 1477-1488). Plan v0.3 (đã đọc bản v0.5 PDF, nay không còn trong repo) có ghi nhận bản v0.5 **có bổ sung** mục "Broadcast action prompt rules" ở §13.3 (xem `BROADCAST_NOTIFICATION_FRAMEWORK_IMPLEMENTATION_PLAN_v0.3.md` §0.4 điểm 5) — khớp đúng với 2 ví dụ Kyle vừa đưa. Vì bản v0.5 gốc không còn trong repo để tôi tự soát lại câu chữ, mục này được ghi nhận là **có căn cứ gián tiếp** (qua plan v0.3 đã verify trực tiếp trước đó), không phải suy diễn từ đầu.

Đối chiếu 2 ví dụ Kyle đưa với code hiện tại:

| Ví dụ Kyle | Trigger point trong code | Hiện trạng |
|---|---|---|
| Closure Broadcast Prompt — điều kiện: DM duyệt & chuyển Incident sang "Đóng"; nhận: Controller | `incidents/[...id]/route.ts` action `close`, dòng 496-541 (gate C1) | ❌ **Hoàn toàn chưa có notify.** Khi `isClosureBroadcastRequired()` = true, code tạo `BroadcastRecord` PENDING và set `closureBroadcastStatus='pending'`, nhưng **không có bất kỳ lệnh gọi notify/addNotification nào** để báo Controller. Đây là gap plan v0.3 đã flag ("Phase 1c") nhưng **vẫn chưa được code** dù backend khác đã lên. Recipient role "Controller" hiện **không nằm ở đâu cả** — không hardcode, không config, vì chưa có code gọi. |
| End-of-Day Interim Broadcast Prompt — điều kiện: đến giờ cấu hình sẵn; nhận: Duty Manager | `/api/cron/eod-broadcast/route.ts` dòng ~66-73 | ⚠️ **Có notify, nhưng recipientRole hardcode thẳng trong code**: `recipientRole: 'Duty Manager'` (chuỗi literal). Không đọc từ config nào — nếu mai đổi ý muốn gửi cho "Duty Officer" thay vì "Duty Manager", phải sửa code, không sửa được qua UI admin. |

→ Tab này **build từ số 0**: cần model mới (`BroadcastActionPromptRule`), API mới, UI mới, và **sửa 2 điểm code trên** để đọc rule thay vì hardcode/thiếu hẳn. Đây là phần có tác động sâu nhất tới business logic trong 4 tab.

---

## 2. Các "logic hole" phát hiện thêm (không riêng 1 tab, ảnh hưởng thiết kế chung)

1. **RBAC trang này đang chặn nhầm 1 role mà FSD muốn cho vào.** `AdminGuard.tsx` dòng 23 hardcode `role !== 'System Administrator'`. Nhưng `RoleContext.tsx` (dòng 5-11) đã định nghĩa `'Current Ops Administrator'` là 1 role switch được thật, và `src/lib/permissions.ts` (dòng 21) **đã seed sẵn** `'Current Ops Administrator': [... 'broadcast.config']` — tức là permission model bên dưới đã đúng theo FSD ("Cả System Administrator lẫn Current Ops Administrator đều Configure"), nhưng `AdminGuard` chưa từng đọc `hasBroadcastPermission()` — nó so sánh role trực tiếp. Kết quả: Current Ops Administrator hiện **bị chặn truy cập** trang Broadcast Config dù model permission nói được phép. Đây là bug có sẵn, không phải do redesign gây ra, nhưng nên sửa cùng đợt vì ảnh hưởng trực tiếp "ai được vào trang mà mình sắp build lại".
2. **Không có cơ chế lọc "chỉ dùng rule/template đang Active"** ở tầng resolve. Ngay cả sau khi thêm field `status`, phải sửa `resolveMatrixRule()` và `resolveTemplate()` (broadcast.ts) để loại bỏ item Inactive trước khi chọn — nếu không, tắt 1 rule trên UI sẽ không có tác dụng thật khi có Incident đóng.
3. **Field catalog cho template bị phân mảnh 2 nguồn không khớp nhau** (đã nêu ở §1.1) — cần hợp nhất thành 1 nguồn duy nhất, dùng chung giữa: (a) danh sách field cho picker kéo-thả, (b) dữ liệu mock cho Preview, (c) `vars` object thật trong `resolveClosureBroadcast`/`resolveEodBroadcast`. Nếu không hợp nhất, sẽ tái diễn tình trạng picker cho chọn field mà lúc dispatch thật lại ra rỗng (hoặc ngược lại, thiếu field admin cần).
4. **Weather Advisory Broadcast chưa có resolver nào** (`broadcast.ts` chỉ có `resolveClosureBroadcast` và `resolveEodBroadcast`) — Template/Matrix cho loại này **cấu hình được nhưng không có trigger nào dùng tới** (phụ thuộc feed thời tiết UCS, đã ghi nhận ngoài phạm vi ở plan v0.3 §15.10 tương đương). Tab Template/Matrix vẫn nên cho phép tạo entry loại Weather Advisory (để sẵn sàng), nhưng cần ghi rõ trong UI đây là "cấu hình trước, chưa có dispatch tự động" để Kyle/BA không hiểu nhầm là đã chạy được end-to-end.
5. **Audit log không hỗ trợ filter server-side theo module** — `GET /api/admin/audit` (route.ts dòng 67-84) trả về toàn bộ log, sort theo thời gian, không nhận query param. Nếu muốn hiển thị "audit log riêng cho tab Template" (Kyle yêu cầu rõ ở tab Template), FE phải tự filter client-side theo `module === 'Broadcast Templates'` (hoặc tên module chuẩn hoá — xem điểm 6). Chấp nhận được ở quy mô dữ liệu hiện tại, không cần sửa API.
6. **Tên module chưa chu�ẩn hoá (gap C3 từ plan v0.3, vẫn còn nguyên)** — `admin/roles/page.tsx` dòng 24: role "Broadcast Recipient" khai `modules: ['Broadcast Notifications']`, trong khi mọi role khác dùng `'Broadcast & Notification'` (dòng 19-21, 36). Khi viết audit log cho trang redesign lần này, cần chốt 1 tên module dùng nhất quán (đề xuất giữ `'Broadcast Configuration'` như trang cũ đã dùng, dòng 134) và tiện thể sửa luôn dòng 24 cho khớp — việc nhỏ, không nên bỏ qua vì sẽ tiếp tục gây lệch báo cáo audit sau này.
7. **Distribution Groups đang ở trạng thái "hybrid"** — `admin/distribution-groups/page.tsx` đọc từ API thật khi có mạng nhưng vẫn ghi cả vào `localStorage` (để Task module đọc đồng bộ). Routing Matrix tab nên **fetch trực tiếp từ `/api/admin/distribution-groups`** (không qua `groups.ts`'s localStorage helper) để tránh phụ thuộc vào việc trang Distribution Groups đã từng được mở trong trình duyệt đó hay chưa.

---

## 3. Thiết kế đề xuất

### 3.1 Thay đổi schema (`src/lib/broadcastConfig.ts`)

```ts
export interface BroadcastTemplate {
  // ...existing fields
  status: 'Active' | 'Inactive';         // MỚI
}

export interface BroadcastMatrixRule {
  // ...existing fields
  status: 'Active' | 'Inactive';         // MỚI — không có API/UI xoá, chỉ toggle
  templateId?: string;                    // MỚI — xem §3.2 (nếu chốt phương án B)
}

// MỚI — Tab 4
export interface BroadcastActionPromptRule {
  id: string;
  name: string;                           // vd. "Closure Broadcast Prompt"
  triggerEvent: BroadcastPromptTrigger;    // enum cố định, không cho gõ tay
  recipientRole: string;                  // lấy từ danh sách role (roles/page.tsx hoặc RoleContext)
  description?: string;
  status: 'Active' | 'Inactive';
}

// Enum cố định — mỗi giá trị ứng với 1 điểm gọi thật trong code, KHÔNG tự thêm được
// qua UI (thêm event mới = việc của dev, không phải admin) vì mỗi trigger cần code
// đọc field này tại đúng vị trí xảy ra sự kiện.
export type BroadcastPromptTrigger =
  | 'closure_broadcast_queued'   // incidents/[...id] action `close`, khi gate C1 = true
  | 'eod_broadcast_queued';      // cron/eod-broadcast, khi có >=1 incident được queue
```

Migrate dữ liệu cũ (Phase 0): seed tất cả `BroadcastTemplate`/`BroadcastMatrixRule` hiện có với `status: 'Active'` (giữ đúng hành vi hiện tại, không đổi behavior ngầm).

### 3.2 Routing Matrix có trỏ Template hay không — ĐÃ CHỐT: Phương án B

Kyle mô tả: *"Nếu incident type = Security và Crisis Level = level 4 thì sẽ sử dụng template A ... để gửi đến group Ground Ranger Team"* — tức là **1 rule = (điều kiện) → (template + group)**. Nhưng kiến trúc hiện tại (`broadcast.ts`) tách 2 việc: Matrix chỉ resolve **recipient + channel**; Template được resolve **riêng** bằng `resolveTemplate()` (khớp theo `category` + `incidentType`, không đọc Matrix).

Đã cân nhắc 2 phương án và **chốt Phương án B** (khớp đúng mental model của Kyle, loại bỏ tình trạng "2 nguồn quyết định template"):

- ~~Phương án A (ít đổi code nhất): giữ tách biệt như hiện tại, cột "Template" trên UI chỉ hiển thị derived từ `resolveTemplate()`, không lưu tham chiếu cứng.~~ Không chọn — admin không tự chỉ đích danh template được nếu 2 template cùng khớp 1 điều kiện.
- **Phương án B (đã chọn):** Thêm `templateId` vào `BroadcastMatrixRule` (đã đưa vào schema ở §3.1). Rule giờ chọn thẳng: recipient group + channel + **template cụ thể**. Sửa `resolveClosureBroadcast`/`resolveEodBroadcast` (broadcast.ts) để **ưu tiên `rule.templateId`** nếu có, fallback về `resolveTemplate()` theo category+type nếu rule không set. Đây là thay đổi logic thật (không chỉ UI, đụng `broadcast.ts` — logic đã chạy production cho Closure Broadcast thật), cần test lại toàn bộ luồng `close`/EOD (xem §6 Phase 2, §7).

### 3.3 Field catalog hợp nhất (cho Template picker)

Tạo 1 nguồn duy nhất, ví dụ `src/lib/broadcastFields.ts`, export theo từng Broadcast Type (vì field khả dụng khác nhau giữa Closure/EOD/Weather):

```ts
export interface BroadcastFieldDef {
  key: string;          // "incident_id" — token thật sự chèn vào {key}
  label: string;        // "Incident ID" — hiển thị trong picker
  sampleValue: string;  // dùng cho Preview
}

export const CLOSURE_BROADCAST_FIELDS: BroadcastFieldDef[] = [
  { key: 'case_id', label: 'Case ID', sampleValue: '2002/01/0004' },
  { key: 'incident_id', label: 'Incident ID', sampleValue: 'SEN/IR/20260613/0014' },
  { key: 'incident_title', label: 'Incident Title', sampleValue: 'Water Pipe Burst near Beach Station' },
  { key: 'incident_type', label: 'Incident Type', sampleValue: 'Security' },
  { key: 'incident_subtype', label: 'Incident Sub-type', sampleValue: 'Trespassing' },
  { key: 'location', label: 'Location', sampleValue: 'Siloso Beach Walk' },
  { key: 'crisis_level', label: 'Crisis Level', sampleValue: 'Level 4' },
  { key: 'status', label: 'Status', sampleValue: 'Live (Assigned)' },
  { key: 'closed_at', label: 'Closed At', sampleValue: '2026-07-25T20:00:00Z' },
  { key: 'closed_by', label: 'Closed By', sampleValue: 'DM Gan' },
  { key: 'summary', label: 'Summary', sampleValue: 'Major water leakage detected...' },
];
// EOD_BROADCAST_FIELDS: giống Closure nhưng bỏ closed_at/closed_by (chưa đóng)
// WEATHER_ADVISORY_FIELDS: chỉ summary/location/time (không có case/incident)
```

Đồng thời sửa `broadcast.ts`'s `vars` object trong `resolveClosureBroadcast`/`resolveEodBroadcast` để **import key list từ chính file này** (hoặc ít nhất bổ sung comment chéo tham chiếu) — tránh lệch lần nữa như `MOCK_VARS` hiện tại.

### 3.4 Ghi chú riêng cho tab EOD timing (ngoài phạm vi UI nhưng nên biết)

`isEodEligible()`/cron hiện chạy ngay khi bị gọi (thủ công qua nút "Run End-of-Day Check Now" ở `/broadcasts/eod-review`, hoặc external scheduler), **không tự so sánh với `endOfDayTime` đã cấu hình** — nghĩa là dù tab mới cho sửa giờ EOD, giờ đó hiện **chỉ mang tính tài liệu/tương lai** cho tới khi có 1 scheduler thật gọi đúng giờ đó (ngoài phạm vi trang admin — thuộc hạ tầng deploy, đã ghi nhận ở plan v0.3 rủi ro #2). Nên hiển thị rõ trong UI: "Giờ này áp dụng khi hệ thống lịch (cron) được cấu hình gọi đúng giờ — hiện tại job có thể chạy thủ công qua nút Run Check Now."

### 3.5 API mới cần thêm

| Endpoint | Việc |
|---|---|
| ~~`GET/POST /api/admin/taxonomy`~~ | **Hoãn — đã chốt với Kyle (§8.3): dùng snapshot taxonomy hiện tại** (`admin_reference_data`/`DEFAULT_REFERENCE_DATA`, `src/lib/taxonomy.ts`) làm dropdown tĩnh, không xây API này trong đợt redesign này. Ghi nhận lại để làm sau nếu cần độ chính xác cao hơn (server-validated, đồng bộ nhiều trình duyệt). |
| `GET/POST /api/admin/broadcast-prompt-rules` | Mới — CRUD cho `BroadcastActionPromptRule`, theo đúng pattern các route broadcast-* hiện có (thin wrapper qua `broadcastStore`). |
| Không cần sửa `/api/admin/broadcast-templates`, `/broadcast-matrix`, `/broadcast-config` — giữ nguyên, chỉ payload có thêm field mới. |

### 3.6 Sửa 2 điểm gọi trigger để đọc Action Prompt Rules thay vì hardcode/thiếu

- `incidents/[...id]/route.ts`, trong nhánh `isClosureBroadcastRequired(...) === true` (dòng ~504-533): sau khi tạo `BroadcastRecord`, thêm đọc `BroadcastActionPromptRule` có `triggerEvent === 'closure_broadcast_queued' && status === 'Active'`, rồi gọi `addNotification({ recipientRole: rule.recipientRole, ... })` (hàm `addNotification` đã có sẵn trong `broadcastStore.ts`, chỉ cần import). Nếu không tìm thấy rule Active nào → không gửi gì (an toàn, không hardcode fallback).
- `/api/cron/eod-broadcast/route.ts` dòng ~66-73: thay `recipientRole: 'Duty Manager'` (hardcode) bằng cùng cơ chế đọc rule `triggerEvent === 'eod_broadcast_queued'`.

Đây là 2 chỗ duy nhất đụng vào business logic ngoài tầng UI admin — cần test kỹ vì đụng đúng luồng Closure Broadcast/EOD đã chạy thật.

---

## 4. RBAC cho trang này

Sửa `AdminGuard` theo hướng **không phá vỡ các trang admin khác**: thêm prop tuỳ chọn, ví dụ `permissionCheck?: (role: UserRole) => boolean`; nếu có, dùng thay cho so sánh `role !== 'System Administrator'` mặc định. Trang `broadcast-config/page.tsx` truyền vào `permissionCheck={(role) => hasBroadcastPermission(role, 'broadcast.config')}` (hàm đã có sẵn ở `permissions.ts`, đã seed đúng cho cả System Administrator lẫn Current Ops Administrator). Các trang admin khác không truyền prop này → giữ nguyên hành vi cũ, không rủi ro regression.

---

## 5. Audit log

Giữ nguyên pattern `logAudit()` của trang cũ (gọi `POST /api/admin/audit` với `module`, `action`, `beforeSnapshot`, `afterSnapshot`, `correlationId`) cho **mọi** thao tác ở cả 4 tab: tạo/sửa Template, toggle status Template, tạo/sửa Matrix Rule, toggle status Matrix Rule, sửa EOD timing, tạo/sửa/toggle Action Prompt Rule. Chuẩn hoá `module: 'Broadcast Configuration'` cho tất cả (đồng thời sửa dòng 24 `admin/roles/page.tsx` từ `'Broadcast Notifications'` → `'Broadcast & Notification'` cho khớp — gap C3). Mỗi tab nên có 1 nút/khu vực "Xem lịch sử thay đổi" filter client-side từ `GET /api/admin/audit` theo `module`.

---

## 6. Kế hoạch triển khai (Phases)

**Phase 0 — Nền tảng (chặn đường các phase sau).**
- Thêm field `status` vào `BroadcastTemplate`, `BroadcastMatrixRule` (schema + seed data, backfill `'Active'`); thêm `templateId` vào `BroadcastMatrixRule` (Phương án B, §3.2).
- Sửa `AdminGuard` thêm prop `permissionCheck` (§4).
- Chuẩn hoá tên module `'Broadcast & Notification'` ở `admin/roles/page.tsx` dòng 24 (C3).
- *Rủi ro: thấp. Phụ thuộc: không.* (Taxonomy API đã bỏ khỏi phase này — dùng snapshot, §8.3.)

**Phase 1 — Tab Template.**
- Build `src/lib/broadcastFields.ts` (field catalog theo từng Broadcast Type).
- Redesign UI: list Template có filter theo status; form có: chọn Broadcast Type (dropdown chuẩn `BROADCAST_TYPES`), Incident Type/Sub-type (dropdown từ snapshot Taxonomy hiện tại — `getIncidentTaxonomy()` trong `src/lib/taxonomy.ts`, optional = "Any"), Crisis Level (dropdown, optional = "Any"), khung soạn Subject/Body kèm panel "Chèn field" (click để insert `{key}` vào vị trí con trỏ), danh sách checkbox "Sensitive fields" (từ field catalog), toggle Active/Inactive, nút Preview (dùng `sampleValue`), nút Save → gọi `POST /api/admin/broadcast-templates` + `logAudit`.
- Sửa `resolveTemplate()` lọc `status === 'Active'` trước khi chọn.
- *Rủi ro: thấp. Phụ thuộc: Phase 0.*

**Phase 2 — Tab Routing Matrix.**
- Áp dụng Phương án B (đã chốt, §3.2): rule chọn thẳng Template cụ thể.
- Redesign UI: table + modal, mọi field là dropdown (Incident Type/Sub-type từ snapshot Taxonomy hiện tại — như Phase 1, Crisis Level cố định 5 mức, Recipient Group từ `/api/admin/distribution-groups`, Delivery Channel multi-select checkbox từ `/api/admin/broadcast-channels`, Template dropdown từ `/api/admin/broadcast-templates` lọc theo Broadcast Type tương ứng). Không có nút Xoá — chỉ Toggle Active/Inactive.
- Sửa `resolveClosureBroadcast`/`resolveEodBroadcast` ưu tiên `rule.templateId`, fallback `resolveTemplate()` nếu rule không set.
- Sửa `resolveMatrixRule()` lọc `status === 'Active'`.
- *Rủi ro: trung bình-cao (đụng logic dispatch thật qua `templateId`). Phụ thuộc: Phase 0, Phase 1 (cần Template đã có `status`/list để chọn trong dropdown).*

**Phase 3 — Tab End-of-Day broadcast timing.**
- UI đơn giản nhất: `<input type="time">` bind `endOfDayTime`, Save → `POST /api/admin/broadcast-config`, hiển thị ghi chú về giới hạn scheduler (§3.4), audit log.
- *Rủi ro: thấp. Phụ thuộc: không — có thể làm song song Phase 1/2.*

**Phase 4 — Tab Action Prompt Rules.**
- Model + API mới (`BroadcastActionPromptRule`, §3.1/§3.5).
- UI: table đơn giản (Name, Trigger Event [dropdown cố định 2 giá trị hiện có], Recipient Role [dropdown từ role registry], Status, Description), Add/Edit modal, không xoá — chỉ toggle. Seed mặc định 2 rule khớp đúng 2 ví dụ Kyle đưa (Closure→Controller, EOD→Duty Manager) để giữ hành vi hiện tại làm baseline.
- Sửa 2 điểm trigger trong code (§3.6): thêm notify Controller còn thiếu ở action `close`; đổi hardcode `'Duty Manager'` trong cron EOD sang đọc rule.
- *Rủi ro: trung bình (đụng luồng `close` production). Phụ thuộc: Phase 0.*

**Phase 5 (dọn dẹp) — Xoá localStorage cũ, đồng bộ toàn trang.**
- Xoá hoàn toàn `localStorage.getItem('admin_bc_*')` khỏi trang; toàn bộ 4 tab đọc/ghi qua API thật.
- Regression test luồng `close` (Closure Broadcast) và `/api/cron/eod-broadcast` end-to-end với dữ liệu Template/Matrix mới.

---

## 7. Kịch bản test bổ sung (so với plan v0.3 đã có)

| Nhóm | Kịch bản | Kỳ vọng |
|---|---|---|
| Template | Tạo 2 Template cùng loại Closure, 1 Active 1 Inactive, cùng khớp Incident Type | Chỉ Template Active được `resolveTemplate()` chọn |
| Template | Chèn field không tồn tại trong catalog (gõ tay ngoài picker) | Preview để trống đúng như `renderTemplate()` hiện xử lý token lạ (không lỗi, nhưng nên cảnh báo UI) |
| Matrix | Toggle 1 rule đang Active dùng cho Incident sắp đóng sang Inactive | Sau khi Inactive, `resolveMatrixRule()` fallback về rule khác/level chung, không dùng rule đã tắt |
| Matrix | Không có nút xoá ở UI | Xác nhận đúng yêu cầu Kyle — chỉ có Add/Edit/Toggle |
| EOD timing | Đổi giờ EOD, gọi `/api/cron/eod-broadcast` | Config được lưu đúng; ghi chú rõ cron hiện chưa tự so giờ (biết trước, không phải bug mới) |
| Action Prompt | Tắt rule "Closure Broadcast Prompt" | Khi đóng Incident cần broadcast, Controller **không** nhận notify (trước đó vốn cũng không nhận — nên hành vi baseline không đổi, nhưng giờ tắt/bật được) |
| Action Prompt | Đổi recipientRole của rule EOD từ Duty Manager → Duty Officer | Khi cron EOD chạy, notify đúng role mới, không cần sửa code |
| RBAC | Current Ops Administrator mở `/admin/broadcast-config` | Vào được (trước đây bị chặn) |
| RBAC | Controller mở `/admin/broadcast-config` | Vẫn bị chặn (không đổi) |
| Regression | Toàn bộ luồng `close` với category không cần broadcast | Không đổi hành vi (vẫn `not_required`, không tạo record, không notify) |

---

## 8. Các quyết định đã chốt với Kyle (2026-07-25)

1. **Routing Matrix ↔ Template — ĐÃ CHỐT: Phương án B** (§3.2) — Matrix Rule trỏ thẳng tới 1 `templateId` cụ thể. Đây là thay đổi logic dispatch thật (không chỉ UI) — cần test lại kỹ toàn bộ luồng `close`/EOD ở Phase 2 (xem §3.2, §6 Phase 2).
2. **`BroadcastActionPromptRule.triggerEvent` — ĐÃ CHỐT: chỉ 2 giá trị cho v1** (`closure_broadcast_queued`, `eod_broadcast_queued`), đúng 2 ví dụ Kyle đưa. Không thêm "Weather Advisory issued"/"Crisis Recall Level 4+" đợt này vì cả hai chưa có code hook point thật để gắn vào (Weather Advisory chưa có resolver — §2.4; Crisis Recall §11 là module riêng, ngoài phạm vi framework này — kế thừa quyết định từ plan v0.3). Enum vẫn thiết kế mở để thêm giá trị mới sau này khi có trigger point thật (luôn cần code, không tự thêm qua UI).
3. **Taxonomy API — ĐÃ CHỐT:** dùng snapshot taxonomy hiện tại (`admin_reference_data`/`DEFAULT_REFERENCE_DATA` trong `src/lib/taxonomy.ts`) làm dropdown tĩnh cho Routing Matrix Phase 2, không xây `/api/admin/taxonomy` trong đợt này. Chấp nhận rủi ro dropdown có thể lệch nếu taxonomy được sửa ở trình duyệt khác; bổ sung API thật khi cần sau này.
4. **Weather Advisory Broadcast — ĐÃ CHỐT (ok):** chỉ cấu hình trước (Template/Matrix), chưa cần trigger tự động trong đợt này (đúng như phạm vi các plan trước đã thống nhất, phụ thuộc feed UCS).
