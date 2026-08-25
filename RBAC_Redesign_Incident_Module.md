# Thiết kế lại RBAC – Module Incident (Permission-Based Access Control)

**Sentosa (sts-bnk)** | Draft v0.2 | 2026-07-14 — cập nhật theo phản hồi: Admin chỉ thao tác 1 ma trận Role × Permission
**Phạm vi:** Incident Management module. Không bao gồm code — đây là tài liệu thiết kế/kiến trúc để BA/Dev thống nhất trước khi build.

---

## 1. Nhận xét đề xuất của Kyle

Hướng đi **đúng** — chuyển từ hardcode theo *role name* sang hardcode theo *permission name* chính là mô hình chuẩn "Permission-Based Access Control" (role chỉ là một tập hợp permission được gán sẵn, code chỉ check permission chứ không bao giờ check role string). Đây là cách duy nhất để role trở thành dữ liệu động (Admin tự thêm/sửa/xoá) mà không đụng code.

Hai chỗ cần bổ sung để đề xuất hoàn chỉnh và đúng với thực tế FSD hiện tại:

1. **Permission trong ví dụ (hình 2) đang gộp quá thô (coarse-grained).** VD "Manage Responder assignments" gộp chung 4 hành động khác nhau (Assign to Assignee, Mark as false alarm, Log incident, Return to Assignee). Nếu Admin chỉ có 1 công tắc cho cả cụm này thì không thể bật "cho phép Log incident" mà tắt "Mark false alarm" — mất đúng cái lợi ích "System Admin chủ động set up" mà đề xuất đang hướng tới. Permission nên tách **atomic theo từng nút bấm**.
2. **Thiếu 1 chiều: mối quan hệ permission ↔ status.** Ma trận trong FSD (hình 1) không chỉ là Role × Action, mà là Role × Status × Action — "Controller chỉ Assign Responder được khi Live/Live(Assigned)…, không được nữa khi Pending Endorsement". *(Cập nhật theo phản hồi của Kyle: không đưa cái này thành 1 ma trận cấu hình riêng cho Admin — quá phức tạp cho end user. Đã điều chỉnh thành rule cố định gắn kèm permission, Admin không thấy/không cần đụng — xem mục 3.)* Admin **chỉ thao tác đúng 1 ma trận duy nhất**: Role × Permission, giống hệt bảng đã gửi.

---

## 2. Hiện trạng code (đối chiếu để thấy đúng vấn đề đang nằm ở đâu)

| File | Vấn đề |
|---|---|
| `src/context/RoleContext.tsx` | `UserRole` là **literal union type** cố định 7 giá trị. Thêm role mới = sửa type + rebuild + redeploy. |
| `src/app/admin/roles/page.tsx` | Đã có sẵn UI "Centralized Permission Matrix", nhưng **chỉ 5 quyền chung** (`view/create/edit/approve/close`) theo từng module, key theo **role name string** (`Record<string, {...}>`). Không đủ chi tiết để thay được logic thật của Incident (không có khái niệm Assign Responder, Mark False Alarm, Submit for Endorsement, Return to Responder…). Nói cách khác: màn hình Admin *trông* như đang cấu hình được, nhưng **không hề điều khiển hành vi thật** của module Incident. |
| `src/app/incidents/[...id]/page.tsx` (3921 dòng) | Quyền được quyết định bằng 4 biến `isCtrl / isMgr / isRanger / isAdmin` — so sánh **trực tiếp chuỗi role** (`role === 'Controller'`) — rồi **đan xen tay** với điều kiện status ở ~20 vị trí rải rác khắp file (`isCtrl && !isClosed`, `isMgr && incident.status === 'Pending Endorsement'`, `isMgr && !isCtrl && incident.status === 'Returned' && ...`, v.v). Đây chính là phần m mô tả là "hardcode theo role". |
| `src/app/incidents/[...id]/page.tsx` (dòng 790) | Phát hiện thêm: check "Responder có đang được assign hay không" (`myResponderRecord`) đang match bằng `r.responderId === username`, tức là **so chuỗi tên hiển thị**, không phải một `userId` ổn định. `Audit_Log_Types_Definition.md` (mục 5.3) đã ghi nhận đúng rủi ro này: identity/permission matching hiện dùng display-name string, sẽ vỡ khi đổi tên hoặc đổi role. → Redesign RBAC lần này nên **sửa luôn gốc rễ này**, không chỉ riêng permission mà cả identity phải neo vào `userId` ổn định. |

**Phát hiện quan trọng ảnh hưởng trực tiếp tới thiết kế:** hệ thống hiện có **2 tầng trạng thái độc lập chạy song song**:

- **Incident-level status:** Live → Live (Assigned) → Pending Endorsement → Returned → Closed (theo `Incident_Status_Model_Design_Updated.docx`, đã thay thế bản 8-status cũ trong FSD gốc).
- **Responder-level status** (theo từng Responder được assign, độc lập với nhau): Assigned → Acknowledged → On-Site → Pending Controller Review → (Live (Incomplete) / Completed).

→ Permission phải khai báo rõ **áp dụng cho entity nào** (Incident record hay Responder-assignment record), nếu không sẽ lặp lại đúng lỗi gộp chung đang tồn tại trong code hiện tại.

---

## 3. Nguyên tắc thiết kế: Admin chỉ thao tác 1 ma trận (Role × Permission)

**Chốt theo phản hồi của Kyle: bỏ ý tưởng làm thêm 1 ma trận Status riêng cho Admin cấu hình — quá phức tạp cho end user.** Admin/System Admin từ đầu đến cuối chỉ nhìn thấy và thao tác **đúng 1 màn hình, 1 ma trận**: Role × Permission (bảng đã gửi ở tin nhắn trước là chuẩn).

Vấn đề "action nào hợp lệ ở status nào" (VD Assign Responder chỉ làm được khi Live, không làm được khi Closed) **vẫn phải tồn tại trong hệ thống** — nếu bỏ hẳn thì nút Assign Responder sẽ hiện cả lúc Incident đã Closed, sai nghiệp vụ. Nhưng thay vì biến nó thành **1 ma trận thứ 2** để Admin phải học và cấu hình, ta gắn nó làm **thuộc tính cố định của chính permission đó** — do Dev/BA định nghĩa 1 lần khi build (giống như định nghĩa 1 field trong form), không lộ ra UI, không phải thứ Admin bật/tắt:

| Thành phần | Trả lời câu hỏi | Ai sở hữu / chỉnh sửa | Admin có thấy không? |
|---|---|---|---|
| **Permission Registry** (bao gồm cả rule "hợp lệ ở status nào") | Hệ thống có hành động nào, áp dụng entity nào, hợp lệ ở status nào? | Dev/BA định nghĩa khi build feature — đây là *quy tắc nghiệp vụ cố định*, không phải dữ liệu cấu hình | Không — ẩn, chạy ngầm |
| **Role–Permission Assignment** | **Role nào** được làm hành động nào? | System Admin, qua UI, hoàn toàn động | **Có — đây là màn hình duy nhất Admin thao tác** |
| **Scope/Ownership rule** | Áp dụng lên **bản ghi nào** (của tôi / được ủy quyền / toàn bộ)? | Quy tắc cố định theo nghiệp vụ, gắn kèm permission, tương tự Permission Registry | Không — ẩn, chạy ngầm |

Nói đơn giản: chỉ có **1 lớp Admin cấu hình** (Role–Permission). Hai phần còn lại (status hợp lệ, scope dữ liệu) là quy tắc cố định đi kèm theo mỗi permission — Dev đọc từ Permission Registry để biết khi nào ẩn/hiện nút, Admin không cần biết tới sự tồn tại của nó, chỉ cần biết "role X có được bật permission Y hay không".

**Công thức tổng hợp** (bên trong code — không phải thứ Admin nhìn thấy):

```
show/allow(action X, record R, user U) =
    hasPermission(U.role, X)          // duy nhất phần này Admin cấu hình được
    AND statusAllows(R.status, X)     // cố định, gắn theo permission X, Dev/BA định nghĩa 1 lần
    AND scopeAllows(U, R)             // cố định, gắn theo permission X
```

Lợi ích so với gộp chung 1 ma trận Role × Status × Action như FSD hình 1:
- Thêm role mới (VD "Assistant Controller") = thêm 1 record Role + tick permission trên đúng 1 màn hình → phần status/scope **không đụng vào, cũng không cần Admin hiểu**.
- Đổi quy trình (VD thêm status mới, hoặc cho phép Return ở status khác) = Dev sửa rule cố định trong Permission Registry (1 chỗ, có thể chỉ là code/config, không cần building UI riêng) — **không ảnh hưởng ma trận Role–Permission Admin đang dùng**.
- Giảm bớt việc phải xây UI cho ma trận thứ 2 — vừa đơn giản cho end user, vừa đỡ effort dev so với thiết kế 3 lớp ban đầu.

### Case đặc biệt trong FSD, xử lý bằng scope rule cố định thay vì tạo thêm permission riêng

| Case (theo FSD) | Cách xử lý đề xuất |
|---|---|
| Responder: *"No access until assigned"* | Không phải permission — là **ownership check**: user chỉ thấy/thao tác được khi `userId` nằm trong danh sách Responder được assign của chính Incident đó. |
| SDC Stakeholder: *"View-only for **authorised** Incident Records"* | Cần thêm khái niệm **data scope** (theo category/zone/department) gắn vào user hoặc role, không chỉ đơn thuần bật `incident.view`. |
| Duty Officer *"elevated to DM"* | Không tạo permission riêng cho "trạng thái elevated" (sẽ làm phình Permission Registry và tạo tổ hợp vô hạn). Xử lý bằng **effective role**: khi cờ elevation bật trên user, hệ thống tạm thời tính permission theo role Duty Manager thay vì Duty Officer, có ghi log mốc thời gian elevation (phục vụ đúng yêu cầu ở `Audit_Log_Types_Definition.md` mục 5.2 — action "đứng" trên authority tại thời điểm thực hiện, không phải role hiện tại). |
| Current Ops Administrator: *"Same as Duty Manager"* | Không cần rule riêng — set permission của role này **giống hệt** Duty Manager trên ma trận Role–Permission khi seed dữ liệu. Nếu sau này lệch nhau, Admin tự tách. |

---

## 4. Danh sách permission atomic đề xuất (thay thế / hoàn thiện ví dụ ở hình 2)

Naming convention: `<entity>.<action>` — entity là `incident` hoặc `responder` (responder = Responder-assignment record), action là snake_case, ổn định vĩnh viễn kể cả khi đổi label hiển thị.

### Permission Registry — Incident Management

| Permission code | Label hiển thị cho Admin | Entity | Status hợp lệ (rule cố định, ẩn — Admin không thấy cột này) |
|---|---|---|---|
| `incident.view` | Xem chi tiết Incident | Incident | Tất cả status |
| `incident.view_all` | Xem toàn bộ danh sách/report Incident (không giới hạn theo assignment) | Incident (scope) | N/A — đây là scope permission, không theo status |
| `incident.log_create` | Log Incident report (tạo mới) | Incident | Trước khi có status (creation) |
| `incident.edit` | Sửa nội dung/log của Incident | Incident | Live, Live (Assigned) |
| `incident.responder.assign` | Assign Responder | Incident | Live, Live (Assigned) |
| `incident.responder.reassign` | Reassign / đổi Responder | Incident | Live (Assigned) |
| `incident.mark_false_alarm` | Mark False Alarm (VMS alert) | Incident | Live |
| `incident.submit_endorsement` | Submit for Endorsement | Incident | Live (Assigned) — khi toàn bộ Responder đã Completed |
| `incident.force_submit` | Force Submit (bỏ qua chờ Responder hoàn tất) | Incident | Live (Assigned) |
| `incident.endorsement.approve_close` | Endorse / Close | Incident | Pending Endorsement |
| `incident.endorsement.return` | Return to Controller | Incident | Pending Endorsement |
| `incident.return_to_responder` | Return to Responder (mở lại 1 hoặc nhiều Responder cụ thể) | Incident | Returned |
| `incident.reopen` | Reopen sau khi Closed *(hiện FSD chưa có — cần BA xác nhận có support hay không)* | Incident | Closed |
| `responder.view` | Xem Incident mình được assign | Responder-assignment | Assigned trở đi (ownership guard) |
| `responder.acknowledge` | Acknowledge dispatch | Responder-assignment | Assigned |
| `responder.notify_arrival` | Notify Arrival On-Site | Responder-assignment | Acknowledged |
| `responder.log_edit` | Ghi/sửa log tại hiện trường | Responder-assignment | On-Site |
| `responder.notify_completion` | Notify Completion (nộp cho Controller review) | Responder-assignment | On-Site, Live (Incomplete) — trường hợp nộp lại |

> Ghi chú: `"View all Incidents reports"` trong ví dụ gốc của Kyle thực chất là 1 **scope permission** (toàn bộ vs chỉ của mình), không phải action theo status — đã tách riêng thành `incident.view_all` thay vì nằm chung nhóm với các action workflow. Vẫn hiện trên **cùng 1 ma trận Role × Permission**, chỉ là 1 dòng permission như mọi dòng khác — Admin không cần biết nó "khác loại" so với các permission còn lại.

### Role–Permission Assignment mặc định (seed = đúng hành vi hiện tại, để cutover không phá vỡ gì)

| Permission | Controller | Duty Officer | Duty Manager | Current Ops Admin | Responder | SDC Stakeholder |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `incident.view` | ✅ | ✅ | ✅ | ✅ | ✅ (own only) | ✅ (authorised only) |
| `incident.view_all` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `incident.log_create` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `incident.edit` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `incident.responder.assign` / `reassign` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `incident.mark_false_alarm` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `incident.submit_endorsement` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `incident.force_submit` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `incident.endorsement.approve_close` | ❌ | ❌ (chỉ khi elevated → xem mục 3) | ✅ | ✅ | ❌ | ❌ |
| `incident.endorsement.return` | ❌ | ❌ (elevated) | ✅ | ✅ | ❌ | ❌ |
| `incident.return_to_responder` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `responder.acknowledge` / `notify_arrival` / `log_edit` / `notify_completion` | ❌ | ❌ | ❌ | ❌ | ✅ (own assignment only) | ❌ |

Bảng này chính là dữ liệu seed ban đầu — sau khi lên production, System Admin chỉnh trực tiếp trên UI, không cần Dev.

---

## 5. Data model (mô tả khái niệm — không phải schema code)

| Entity | Vai trò | Field chính (mô tả) |
|---|---|---|
| **Role** | Đơn vị động, Admin tạo/sửa/xoá tự do | id, name, description, isSystem (role hệ thống mặc định không cho xoá) |
| **Permission** | Đơn vị cố định, Dev/BA định nghĩa theo Permission Registry ở mục 4 — **bao gồm luôn** rule status hợp lệ + scope rule (không tách bảng riêng, không có UI riêng) | code (unique, vĩnh viễn), label, entityType (`incident` \| `responder`), module, allowedStatuses (cố định, gắn kèm), scopeRule (cố định, gắn kèm) |
| **RolePermission** | Bảng nối N–N — **đây là bảng duy nhất Admin UI đọc/ghi** | roleId, permissionCode, isEnabled |
| **UserRoleAssignment** | Gán role cho user (nên cho phép 1 user nhiều role trong tương lai, ví dụ vừa Controller vừa được cấp thêm quyền khác) | userId, roleId, effectiveFrom/To (phục vụ elevation tạm thời của Duty Officer) |
| **PermissionChangeLog** | Ghi lại mọi thay đổi Admin thực hiện trên RolePermission | actorId, action (role created/permission toggled/...), before/after, timestamp — nên nối vào cùng cơ chế Audit Trail đã có ở `Audit_Log_Types_Definition.md`, bổ sung nhóm event mới (VD nhóm "Access Control") vì hiện tài liệu đó mới chỉ cover audit log **trong 1 Incident**, chưa có audit cho thay đổi cấu hình quyền toàn hệ thống. |

> Đơn giản hoá so với bản trước: bỏ hẳn bảng `StatusPermissionRule` riêng. Rule "status nào hợp lệ" giờ là 1 field cố định nằm ngay trong định nghĩa `Permission` (giống như 1 constant trong code), không phải bảng dữ liệu thứ 2 song song với `RolePermission` — vừa ít bảng hơn, vừa đúng tinh thần "chỉ 1 ma trận cho Admin".

Khuyến nghị quan trọng gắn với phát hiện ở mục 2: `UserRoleAssignment.userId` và mọi bảng ownership (VD Responder-assignment) phải neo vào **id ổn định**, không dùng display-name string như `responderId === username` hiện tại — nếu không, permission mới xây đúng nhưng identity check vẫn vỡ khi đổi tên/đổi role.

---

## 6. Admin UI — khuyến nghị điều chỉnh màn hình đang có (`admin/roles/page.tsx`)

Màn hình "Centralized Permission Matrix" hiện tại (5 quyền chung view/create/edit/approve/close theo module) **nên giữ lại cho các module đơn giản** (VD e-Diary, Broadcast) nhưng **không đủ cho Incident** vì Incident là module có workflow nhiều bước. Đề xuất thêm 1 tab riêng dạng **"Incident Workflow Permissions"** — đúng layout bảng Kyle đã duyệt (permission theo hàng, role theo cột, checkbox):

- Cột: Permission (theo danh sách mục 4), có nhóm theo entity (Incident actions / Responder actions).
- Hàng: Role (động, load từ bảng Role).
- Mỗi ô: on/off — **đây là toàn bộ những gì Admin thấy và chỉnh, không có tab/ma trận thứ 2 nào khác cho status.**
- Optional, không bắt buộc: hover vào tên permission hiện tooltip mô tả ngắn "áp dụng khi Incident đang ở trạng thái nào" — chỉ để Admin hiểu context khi đọc, không phải ô để chỉnh.
- Có nút "Preview as [Role]" để QA thử nhanh 1 role sẽ thấy những nút gì trên Incident Detail, tương tự cách `RoleContext` hiện đang cho phép switch role để test.

### 6.1 Có nên gộp lại các permission (VD `incident.edit` + `incident.submit_endorsement`) thành nhóm kiểu "Manage Responder assignments" cho dễ nhìn?

Trả lời: **gộp ở tầng hiển thị (UI), không gộp ở tầng dữ liệu (permission code).** Lý do — nếu gộp lại thành 1 permission code chung như hình 2 ban đầu, ta quay lại đúng vấn đề đã nêu ở mục 1: Admin không bật/tắt độc lập được từng hành động nữa (VD muốn cho phép Edit nhưng không cho Submit for Endorsement sẽ không làm được). Thay vào đó xử lý bài toán "quá nhiều dòng, khó nhìn" bằng **group header có thể expand/collapse + checkbox "chọn tất cả trong nhóm"** — dữ liệu bên dưới (`RolePermission`) vẫn atomic, nhóm chỉ là cách trình bày.

Riêng 2 permission Kyle khoanh đỏ (`incident.edit`, `incident.submit_endorsement`) — về mặt nghiệp vụ chúng **không thuộc cùng nhóm với "Manage Responder assignments"** (đó là nhóm gán/điều phối Responder). Đề xuất nhóm lại theo đúng giai đoạn workflow, để tên nhóm phản ánh đúng ý nghĩa nghiệp vụ thay vì gộp tuỳ ý:

| Nhóm hiển thị (collapsible) | Permission bên trong |
|---|---|
| **Xem & Ghi nhận** | `incident.view`, `incident.view_all`, `incident.log_create` |
| **Xử lý nội dung Incident** | `incident.edit`, `incident.mark_false_alarm` |
| **Manage Responder Assignments** | `incident.responder.assign`, `incident.responder.reassign`, `incident.return_to_responder` |
| **Endorsement / Duyệt đóng** | `incident.submit_endorsement`, `incident.force_submit`, `incident.endorsement.approve_close`, `incident.endorsement.return` |
| **Responder Execution** (chỉ áp dụng role Responder) | `responder.view`, `responder.acknowledge`, `responder.notify_arrival`, `responder.log_edit`, `responder.notify_completion` |

Với cách này, Admin nhìn vào chỉ thấy 5 nhóm gọn (đúng độ đơn giản như hình 2 gốc), bấm expand mới thấy chi tiết từng permission atomic bên trong nếu cần chỉnh tay — vẫn giữ được lợi ích "tự cấu hình chi tiết" mà không làm màn hình rối.

---

## 7. Kế hoạch chuyển đổi (migration) — không phá vỡ hành vi hiện tại

1. Xây Permission Registry đúng theo danh sách mục 4 (gồm cả rule status/scope cố định gắn kèm mỗi permission), đối chiếu FSD 3.3.1 — chốt với BA trước khi build. Rule status/scope viết cố định trong code/config, **không thiết kế bảng hay UI riêng cho nó**.
2. Seed bảng `RolePermission` đúng bảng ở mục 4 = y hệt hành vi hiện tại của `isCtrl/isMgr/isRanger/isAdmin`.
3. Thay các điều kiện `role === 'Controller'`, `isCtrl && incident.status === X` trong `incidents/[...id]/page.tsx` bằng `hasPermission(user, 'incident.xxx', incident)` — làm dần từng khối, có thể giữ `isCtrl/isMgr/...` như alias tạm thời map sang permission set trong giai đoạn chuyển tiếp để giảm rủi ro regression.
4. Sửa `responderId === username` sang match theo `userId` ổn định (dọn theo đúng khuyến nghị đã có sẵn trong `Audit_Log_Types_Definition.md` mục 5.3) — nên làm cùng đợt vì đụng chung logic ownership.
5. Sau khi ổn định, mở UI ma trận Role × Permission cho System Admin tự chỉnh (mục 6) — đây là bước duy nhất bàn giao quyền cấu hình cho Admin, không có bước mở thêm ma trận status nào khác.

---

## 8. Câu hỏi cần chốt với BA/PO trước khi build

1. `incident.reopen` sau Closed — có nghiệp vụ này không, hay Closed luôn là trạng thái cuối tuyệt đối?
2. Data scope của SDC Stakeholder ("authorised Incident Records") — "authorised" nghĩa là theo category, theo zone, hay theo danh sách incident được share thủ công? Ảnh hưởng trực tiếp thiết kế scope rule cố định.
3. Một user có được gán nhiều role cùng lúc không (ngoài case elevation tạm thời của Duty Officer), hay v1 chỉ cần 1 role/user là đủ?

*(Đã chốt: rule status hợp lệ không expose cho Admin cấu hình — cố định trong Permission Registry, chỉ Dev/BA sửa qua release, đúng theo phản hồi của Kyle.)*
