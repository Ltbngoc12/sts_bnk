# System Configuration (§13) — FSD v0.5 Diff & Implementation Plan

> **Nguồn:** `SDC IIS CMS FRD v0.5_SDC.pdf` (85 trang, §13 System Configuration and Administration, trang 74-78) — đọc trực tiếp, đối chiếu với `SDC_IIS_CMS_FRD_v0.4_SDC.txt` (đầy đủ, có trong repo) và code hiện tại của `sts-bnk` (Sentosa).
> **Ngày:** 2026-07-08
> **Phạm vi:** Chỉ phần System Configuration and Administration (§13 trong cả v0.4 và v0.5). Phần Incident Management (category, status lifecycle, closure endorsement) đã có plan riêng ở `FSD_V0.5_ENHANCEMENT_PLAN.md` — không lặp lại ở đây, chỉ tham chiếu khi có điểm giao (Duty Manager Elevation).
> **Trạng thái:** Draft để review trước khi code.

---

## 0. TL;DR

| # | Vấn đề | Thuộc diện | Mức độ ảnh hưởng |
|---|--------|-----------|-------------------|
| 1 | Role **"Current Ops Administrator"** không tồn tại trong Role Management / User Management / AdminGuard, dù được dùng làm điều kiện phân quyền thật ở nhiều nơi trong code | Nợ kỹ thuật có sẵn (v0.4), v0.5 giao thêm quyền cho role này nên càng cấp thiết | **Lớn — chặn toàn bộ tính năng liên quan Current Ops Admin, kể cả tính năng mới của v0.5** |
| 2 | `AdminGuard` chặn cứng toàn bộ 9 trang admin chỉ cho `role === 'System Administrator'`, không theo đúng bảng phân quyền Configure/View-only của FSD | Nợ kỹ thuật có sẵn (v0.4 §13.2-13.5 đã quy định rõ, v0.5 giữ nguyên + mở rộng) | **Lớn — là gốc rễ khiến Current Ops Admin không dùng được bất kỳ trang config nào** |
| 3 | **Duty Manager elevation grace period** — field cấu hình mới của v0.5 (§13.1.g, §13.2) — chưa có ở đâu | Mới ở v0.5 | **Lớn — chưa có gì, cần model + UI mới, giao với Incident Management plan** |
| 4 | §13.1.f — quyền **grant Duty Manager elevation** cho System Admin + Current Ops Admin — chưa có UI/logic | Mới ở v0.5 | **Lớn — giao với Incident Management plan (Phase 5)** |
| 5 | §13.5.e — Audit log phải ghi nhận riêng các event: DM elevation grant/expiry/removal, endorsement submit/resubmit + override reason, DM return reason, closure endorsement | Mới ở v0.5 | **Trung bình — phụ thuộc vào #3, #4 và Incident Management Phase 4 có tồn tại trước** |
| 6 | **Task Priority Levels** — config tồn tại trong Taxonomy nhưng là field chết, không được task creation UI đọc, Prisma enum chỉ có 2/4 giá trị | Nợ kỹ thuật có sẵn (v0.4 §13.2, **v0.5 không đổi** — đã xác nhận đọc trực tiếp PDF) | **Trung bình — bug hiện hữu, không liên quan v0.5** |
| 7 | **Recall Configuration** (5 mục: groups/members, routing rules, message templates, messaging services settings, ack/escalation rules) — không có trang admin nào | Nợ kỹ thuật có sẵn (đã đủ trong v0.4, **v0.5 không đổi**) | **Trung bình — cả module thiếu, nhưng không phải gap mới** |
| 8 | **Task checklist templates** và **Action prompt rules** — 2 mục trong bảng System Reference Data Configuration (§13.2) chưa có UI | Nợ kỹ thuật có sẵn (v0.4, v0.5 không đổi) | **Nhỏ-trung bình** |
| 9 | Naming lệch: Role Management dùng "Responder (Ranger)", User Management dùng "Responder" | Nợ kỹ thuật | **Nhỏ** |
| 10 | Toàn bộ System Configuration (users, roles, settings, taxonomy, groups, matrix) lưu ở `localStorage` trình duyệt, không có model nào trong `prisma/schema.prisma` | Nợ kỹ thuật, sẽ chặn #3/#4 | **Lớn về lâu dài — cần quyết định trước khi build elevation** |

---

## A. Đối chiếu chính xác v0.4 → v0.5 (đọc trực tiếp §13 của cả 2 bản)

### A1. §13.1 User and Role Management

v0.4 có mục a-e (tạo/sửa/deactivate user, role theo Section 3, default role-based access, WOG SSO provisioning, manual role assignment). **v0.5 giữ nguyên a-e, thêm mới:**
- **f.** *"The System Administrator and the Current Ops Administrator shall be able to grant Duty Manager elevation to a named authorised IOH user for a defined shift period, in accordance with Section 3.2 Duty Manager Role Elevation"*
- **g.** *"The System Administrator shall be able to configure the grace period after the defined shift end time before elevated Duty Manager permissions are automatically removed."*

### A2. §13.2 System Reference Data Configuration

v0.4 có 9 dòng: Incident Type/Sub-type taxonomy, Fault Type/Sub-type taxonomy, Location hierarchy, **Task priority levels**, e-Diary Type/Sub-type taxonomy, Auto-save interval, Record lock timeout, Task checklist templates, Action prompt rules. **v0.5 giữ nguyên tất cả 9 dòng y hệt (kể cả Task priority levels — "Configure/Configure", không đổi chữ nào), chỉ thêm 1 dòng mới:**
- **Duty Manager elevation grace period** — *"Defines the grace period after specified shift end time before elevated Duty Manager permissions are automatically removed"* — System Administrator: Configure, Current Ops Administrator: **View-only**.

### A3. §13.3 Broadcast Configuration — không đổi

5 mục (Broadcast Distribution groups, Broadcast routing matrix, Broadcast templates, End-of-day broadcast timing, Broadcast action prompt rules) giống hệt v0.4.

### A4. §13.4 Recall Configuration — không đổi

5 mục (Recall groups and members, Recall routing rules, Recall message templates, Recall messaging services settings, Recall acknowledgement and escalation rules) đã đầy đủ từ v0.4, v0.5 giữ nguyên.

### A5. §13.5 Audit Log

v0.4 có a-d (auto-capture, **truy cập cho cả System Admin và Current Ops Administrator** — đã vậy từ v0.4, không phải mới, filterable, immutable/retention). **v0.5 giữ nguyên a-d, thêm mới:**
- **e.** *"The audit log shall record all role elevation and Incident closure endorsement workflow events, including: (i) Duty Manager elevation grant, expiry and removal, (ii) Endorsement submission and resubmission, override reason, (iii) Duty Manager return incident reason, (iv) Closure endorsement and related status changes."*

**Kết luận A:** Thay đổi thật sự của v0.5 trong §13 chỉ có **đúng 3 điểm**: A1.f, A1.g+A2 (grace period), A5.e — tất cả đều xoay quanh Duty Manager Elevation (khớp changelog chính thức "role and status matrix, closure"). Mọi thứ khác trong §13 **không đổi** so với v0.4.

---

## B. Đối chiếu với code hiện tại

### B1. Role "Current Ops Administrator" — được dùng khắp nơi nhưng không quản lý được

- Định nghĩa hợp lệ trong type `UserRole` (`src/context/RoleContext.tsx` dòng 5-12) và có trong role-switcher dev (`src/components/Sidebar.tsx` dòng 83-86).
- Được dùng làm điều kiện phân quyền thật trong: `src/app/incidents/[...id]/page.tsx` (dòng 783), `src/app/cases/[...id]/page.tsx` (dòng 421), `src/app/faults/[...id]/page.tsx` (dòng 177), `src/app/api/tasks/[...id]/route.ts` (dòng 10), `src/app/api/series/[...id]/route.ts` (dòng 11).
- **Nhưng KHÔNG có trong** `DEFAULT_ROLES` của `src/app/admin/roles/page.tsx` (dòng 17-27) — System Admin không thể xem/sửa permission matrix của role này.
- **Cũng KHÔNG có trong** `ROLES_DETAILS` / dropdown role-assignment của `src/app/admin/users/page.tsx` (dòng 8-18, dropdown dòng 352-358) — không thể tạo user với role này qua UI.

### B2. `AdminGuard` chặn cứng chỉ 1 role

`src/components/AdminGuard.tsx` dòng 22: `if (role !== 'System Administrator')` → chặn hết, dùng chung cho tất cả 9 trang admin (bao gồm Audit Log). Điều này **sai với cả v0.4 lẫn v0.5**: §13.2/13.3/13.4 quy định Current Ops Administrator có quyền Configure/View-only trên hầu hết các mục, và §13.5.b nói rõ Audit Log phải "accessible to the System Admin **and** Current Operations Administrator". Kết hợp với B1 (role không tồn tại), Current Ops Administrator hiện **không dùng được bất kỳ trang System Configuration nào**, kể cả các trang mà FSD cho phép họ Configure toàn quyền (Taxonomy, Location Hierarchy, Distribution Groups, Routing Matrix, Broadcast Config, Recall Config...).

### B3. Duty Manager elevation grace period — chưa có gì

`src/app/admin/system-settings/page.tsx` chỉ có 2 field: `autoSaveInterval`, `recordLockTimeout` (dòng 7-15). Không có field elevation/grace-period nào.

### B4. Grant Duty Manager elevation (§13.1.f) — chưa có UI/logic

Không tìm thấy form/action nào trong `admin/users` hay `admin/roles` để System Admin/Current Ops Admin gán elevation theo ca (shift start/end + grantedBy). Giao trực tiếp với `FSD_V0.5_ENHANCEMENT_PLAN.md` Phase 5 (Duty Manager Role Elevation) — nên làm chung, không tách riêng.

### B5. Audit log — chưa ghi nhận event elevation/endorsement (§13.5.e)

`src/app/api/admin/audit/route.ts` ghi audit chung chung (`module`, `action`, `details`, before/after snapshot) nhưng không có event type chuyên biệt nào cho elevation grant/expiry/removal hay endorsement override reason — vì bản thân các tính năng này (B4, và Closure Endorsement Rules ở Incident Management plan) chưa tồn tại nên chưa có gì để log.

### B6. Task Priority Levels — field chết (đã xác nhận không đổi ở v0.5)

- Admin Taxonomy (`src/app/admin/taxonomy/page.tsx`, tab "Priority") cho cấu hình 4 mức: Low, Normal, High, Critical (`src/lib/taxonomy.ts`, `DEFAULT_REFERENCE_DATA`).
- `src/lib/taxonomy.ts` chỉ export `getFaultTaxonomy()` và `getIncidentTaxonomy()` — không có hàm đọc category `'Priority'`.
- Task creation thực tế (`src/app/cases/new/page.tsx` dòng 451-453) hard-code `<select>` chỉ 2 option: `High`, `Normal` — không đọc taxonomy config, không có Low/Critical.
- `prisma/schema.prisma` dòng 69-72: `enum Priority { NORMAL, HIGH }` — chỉ 2 giá trị.

### B7. Recall Configuration — cả module thiếu trên UI

`src/components/Sidebar.tsx` (`ADMIN_ITEMS`, dòng 48-58) không có mục nào cho Recall. "Recall" chỉ xuất hiện như text demo trong `src/app/broadcasts/page.tsx` và `src/app/api/sms-mock/route.ts`, không phải trang config thật.

### B8. Task checklist templates & Action prompt rules — chưa có UI

`grep -i "checklist"` trong `src/app/admin` không ra kết quả (chỉ có `TaskCheck` per-task trong schema, không có template library). `grep -i "action prompt"` toàn repo không ra kết quả nào.

### B9. Naming lệch "Responder"

`admin/roles/page.tsx` dùng `'Responder (Ranger)'`, `admin/users/page.tsx` (`ROLES_DETAILS`) dùng `'Responder'` — 2 chuỗi khác nhau cho cùng 1 role, có thể gây lệch khi filter/gán.

### B10. Không có model DB thật cho System Configuration

`prisma/schema.prisma` không có model `User`, `Role`, hay `SystemConfig` nào — toàn bộ `admin_roles`, `admin_role_matrix`, `admin_system_settings`, `admin_reference_data`, group data... đang lưu ở `localStorage` trình duyệt (per-browser, không dùng chung được giữa các user/thiết bị). Đây sẽ là vấn đề thật khi build `DutyManagerElevation` (cần trạng thái dùng chung, biết ai đang elevated tại thời điểm bất kỳ) — không thể để ở localStorage.

---

## C. Implementation Plan

### Phase 1 — Role & Access Foundation (chặn mọi thứ khác, làm trước tiên)
1. Thêm `'Current Ops Administrator'` vào `DEFAULT_ROLES` (`admin/roles/page.tsx`) với mô tả/scope đúng theo §13, và vào `DEFAULT_MATRIX` với quyền phù hợp từng module.
2. Thêm `'Current Ops Administrator'` vào `ROLES_DETAILS` + dropdown role-assignment (`admin/users/page.tsx`).
3. Sửa `AdminGuard.tsx`: thay điều kiện cứng `role !== 'System Administrator'` bằng cơ chế phân quyền theo từng trang, phản ánh đúng bảng Configure/View-only của §13.2-13.4 (ví dụ: props `minRole` hoặc `allowedRoles` + `readOnlyRoles` truyền vào từng page). Audit Log: cho phép cả 2 role vào, nhưng chỉ đọc (không có "edit" nào trong Audit Log nên không cần phân biệt).
4. Thống nhất `'Responder'` / `'Responder (Ranger)'` thành 1 tên duy nhất xuyên suốt.

### Phase 2 — Duty Manager Elevation (giao với `FSD_V0.5_ENHANCEMENT_PLAN.md` Phase 1 & 5)
5. Thêm model `DutyManagerElevation` (`id, userId, grantedBy, shiftStart, shiftEnd, gracePeriodMinutes, revokedAt/expiresAt, createdAt`) — **cần bàn persistence thật (xem Phase 5 dưới) trước khi chỉ lưu localStorage.**
6. Thêm section "Duty Manager Elevation" vào `admin/system-settings/page.tsx`: field `elevationGracePeriodMinutes`, chỉ System Administrator sửa (Current Ops Admin: View-only theo đúng §13.2).
7. Thêm UI grant elevation (§13.1.f) — chọn user (Controller hoặc Duty Officer, theo A1 của Incident plan — v0.5 giờ elevate được cả Controller), nhập shift start/end, xác nhận bởi System Admin hoặc Current Ops Admin.
8. Backend job kiểm tra hết hạn elevation dựa trên `shiftEnd + gracePeriodMinutes`, tự động revert quyền — điểm giao trực tiếp với Incident Management Phase 5 (rule separation-of-duties phải nhìn xuyên qua elevation record để lấy identity thật).

### Phase 3 — Audit Log Event Types mới (§13.5.e)
9. Mở rộng `api/admin/audit/route.ts` (hoặc lớp gọi audit) để có event type chuyên biệt: `DM Elevation Granted/Expired/Revoked`, `Endorsement Submitted/Resubmitted (override reason: ...)`, `Incident Returned by DM (reason: ...)`, `Closure Endorsement`. Phụ thuộc Phase 2 và Incident Management Phase 4 (Closure Endorsement Rules) đã tồn tại.

### Phase 4 — Backfill gap có sẵn từ v0.4 (không liên quan v0.5, nhưng cùng module nên làm chung đợt)
10. Fix Task Priority Levels: thêm `getTaskPriorityTaxonomy()` vào `src/lib/taxonomy.ts`, thay `<select>` hard-code ở `cases/new/page.tsx` (và mọi nơi khác tạo/sửa Task) bằng dữ liệu đọc từ taxonomy; mở rộng `enum Priority` trong schema thành 4 giá trị (`LOW, NORMAL, HIGH, CRITICAL`).
11. Trang admin mới "Recall Configuration" (5 mục ở §13.4: groups/members, routing rules, message templates, messaging services settings, ack/escalation rules).
12. UI cấu hình "Action prompt rules" (Incident Ageing / SDC Comms notification triggers).
13. Thư viện "Task checklist templates" trong admin (tạo/sửa/deactivate reusable checklist, gắn vào Task creation).

### Phase 5 — Persistence thật (nền tảng, nên làm sớm nếu muốn Phase 2 chắc chắn)
14. Quyết định: có migrate System Configuration (users, roles, settings, taxonomy, groups) từ `localStorage` sang model Prisma thật không, ít nhất là cho phần mới (`DutyManagerElevation`, elevation grace period config) — vì đây là dữ liệu cần dùng chung giữa nhiều user/phiên, không thể để mỗi người một bản trên trình duyệt riêng.

---

## D. Câu hỏi cần confirm với BA (Wong Shin Feng) trước khi code

1. Bảng phân quyền chi tiết cho `AdminGuard` mới (Phase 1.3): xác nhận đúng cột Configure/View-only cho từng trang admin theo §13.2-13.4 để code guard chính xác, tránh đoán.
2. Grace period elevation mặc định là bao nhiêu? (đã nêu ở `FSD_V0.5_ENHANCEMENT_PLAN.md` mục D4, nhắc lại vì ảnh hưởng trực tiếp Phase 2.6).
3. `DutyManagerElevation` và System Configuration nói chung có bắt buộc phải chuyển sang lưu trữ server-side (Phase 5) trong đợt này, hay tạm chấp nhận localStorage thêm 1 giai đoạn nữa?

---

## Nguồn tham chiếu

- `SDC IIS CMS FRD v0.5_SDC.pdf` — §13 (trang 74-78), đọc trực tiếp qua `pdftotext -layout`.
- `SDC_IIS_CMS_FRD_v0.4_SDC.txt` — dòng 2217-2327 (đối chiếu §13 v0.4 đầy đủ).
- Code: `src/components/AdminGuard.tsx`, `src/components/Sidebar.tsx`, `src/context/RoleContext.tsx`, `src/app/admin/roles/page.tsx`, `src/app/admin/users/page.tsx`, `src/app/admin/system-settings/page.tsx`, `src/app/admin/taxonomy/page.tsx`, `src/lib/taxonomy.ts`, `src/app/cases/new/page.tsx`, `prisma/schema.prisma`, `src/app/api/admin/audit/route.ts`.
- Liên quan: `FSD_V0.5_ENHANCEMENT_PLAN.md` (Incident Management — Duty Manager Elevation Phase 1 & 5, Closure Endorsement Phase 4).
