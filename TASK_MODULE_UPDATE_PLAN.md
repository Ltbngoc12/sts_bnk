# Task Management Module — Update Plan

> Mục tiêu: đồng bộ Task Management với FSD (SDC IIS CMS FRD v0.4, Section 7 + Role Matrix 3.4.2) và chuẩn hoá theo style của Incident Report module.

---

## 1. Bối cảnh & khoảng cách hiện tại (Gap Analysis)

Hiện tại Task chỉ có **1 trang Kanban board** (`app/tasks/page.tsx`, 412 dòng) + 1 popup nhỏ. So với Incident (list + detail route + new + lifecycle, có timeline/audit, role-gating chuẩn), Task đang thiếu rất nhiều và **sai workflow/role**.

| # | Vấn đề hiện tại | FSD yêu cầu |
|---|----------------|-------------|
| 1 | Status sai: dùng `Re-Assigned`, tách `Pending` / `Further Action` thành 2 | 6 status chuẩn: **Created → Assigned → Acknowledged → In Progress → Pending Further Action → Closed** |
| 2 | Reassign set status = `Re-Assigned` | Reassign phải đưa status **về `Assigned`** + gửi notification |
| 3 | Ranger có thể Acknowledge/Start/Close từ bất kỳ trạng thái nào | Action theo **đúng ma trận role × status** (mục 3 bên dưới) |
| 4 | Bất kỳ Ranger nào cũng thấy action | Chỉ **Assignee được gán** (cá nhân/thành viên group) mới thao tác |
| 5 | Không có Detail view | Cần trang chi tiết riêng (giống Incident `[...id]`) |
| 6 | Không có Checklist / Comments / Attachments / Audit timeline | Type đã có (`checklist`, `comments`, `audits`) nhưng **UI/API chưa dùng** |
| 7 | Không có Close Reason | **Bắt buộc** khi đóng task chưa hoàn thành |
| 8 | Không có Recurrence, không có Group assignment | FSD yêu cầu recurring task + assign cho group |
| 9 | Assignee hardcode 4 Ranger | Lấy từ **user directory** (Section 3) + **group** do System Admin cấu hình |
| 10 | Không enforce checklist trước khi Mark Complete | Phải tick hết checklist mới được Mark Complete |
| 11 | Không có notification khi assign/reassign | Phải dispatch notification (đã có `NotificationContext`) |
| 12 | Không ghi audit log | Mọi hành động phải ghi vào `audits[]` |

---

## 2. Workflow chuẩn (Task Status Lifecycle)

```
                ┌─────────────────── Reassign (về Assigned) ───────────────────┐
                │                                                              │
  [Created] ──assign──> [Assigned] ──acknowledge──> [Acknowledged] ──begin──> [In Progress]
     │                      │                            │                        │
     │                      │                            │              ┌─────────┴─────────┐
     │                      │                            │         mark complete      flag cannot complete
     │                      │                            │              │                  │
     └──────── close (Controller, mọi trạng thái, cần close reason nếu chưa complete) ──────┤
                                                                        │                  ▼
                                                                        │        [Pending Further Action]
                                                                        ▼                  │
                                                                    [Closed] <── close ────┘
                                                                        │
                                                                    reopen (Controller) → Created
```

Quy tắc:
- **Reassign** ở bất kỳ status nào → quay về **`Assigned`** + notify assignee mới.
- **Mark Complete** chỉ cho phép khi mọi checklist item đã tick (nếu không có checklist → complete tự do) → `Closed`.
- **Flag cannot complete** → `Pending Further Action` (chốt — chờ Controller xử lý).
- **Close** bởi Controller: nếu task **chưa** hoàn thành → **bắt buộc Close Reason**; nếu đã complete → không bắt buộc.
- Case **không auto-close** khi còn task mở (đã có `lib/autoclose.ts` — giữ nguyên, chỉ cần đảm bảo status mới khớp).

---

## 3. Ma trận Role × Status × Action (theo FSD 3.4.2)

**Controller / Duty Officer / Duty Manager / System Administrator** (nhóm "Controller+"):

| Status | Actions |
|--------|---------|
| Created | View, Edit, **Assign** assignee/group, Close (Drop) |
| Assigned | View, Edit, **Assign/Reassign**, Close |
| Acknowledged | View, Edit, **Assign/Reassign**, Close |
| In Progress | View, Edit, **Assign/Reassign**, Close |
| Pending Further Action | View, Edit, **Assign/Reassign**, Close |
| Closed | View, **Reopen** |

**Assignee (Responder / Ranger)** — *chỉ user được gán*:

| Status | Actions |
|--------|---------|
| Created | **No access** (không thấy task) |
| Assigned | View, **Acknowledge** |
| Acknowledged | View, **Begin Task** (Start) |
| In Progress | View, **Log activity**, **Update checklist**, **Mark Complete**, **Flag cannot complete** |
| Pending Further Action | View only |
| Closed | View only |

**Stakeholder**: không có quyền trên Task (không hiển thị trong nav cho task, hoặc view-only nếu cần).

> Lưu ý: phân biệt **role "Controller+"** vs **Assignee cụ thể**. Một Ranger KHÔNG phải assignee thì không được thao tác (kể cả View tuỳ chính sách — tối thiểu không có action).

---

## 4. Các phần cần update (chia theo file)

### 4.1 Data model — `src/lib/db.ts`
- Chuẩn hoá enum `status` của `Task`: `Created | Assigned | Acknowledged | In Progress | Pending Further Action | Closed` (bỏ `Re-Assigned`, gộp `Pending Further Action`).
- Bổ sung field còn thiếu vào `Task`: `assigneeType?: 'user' | 'group'`, `linkedIncidentId?: string` (optional), `closedAt?`, `closedBy?`, `acknowledgedAt?`, `startedAt?`.
- (Type `TaskChecklistItem`, `TaskComment`, `TaskAudit` đã có — giữ.)
- Cân nhắc thêm `TaskGroup` (assignment group) hoặc đọc từ admin config.

### 4.2 API — `src/app/api/tasks/route.ts` (list + create)
- Create: nhận thêm `checklist`, `recurrenceSchedule`, `assigneeType`, `priority (Normal|High)`, `dueDate`, `attachments`.
- Ghi audit "Task created" vào `audits[]`.
- Giữ logic auto-create Case (đã đúng FSD: task luôn link Case).

### 4.3 API — `src/app/api/tasks/[id]/route.ts` → chuyển sang **action-oriented** (giống Incident)
Thêm `POST .../[id]/[action]` hoặc field `action` trong body, xử lý:
- `assign` / `reassign` → set `Assigned`, notify, audit.
- `acknowledge` → `Acknowledged` (chỉ assignee).
- `begin` → `In Progress` (chỉ assignee).
- `mark-complete` → validate checklist hết tick → `Closed`, audit.
- `flag-cannot-complete` → `Pending Further Action`, audit.
- `close` → `Closed`, **validate close reason** nếu chưa complete, gọi `tryAutoCloseCase`.
- `reopen` → `Created` (Controller+).
- `update-checklist`, `add-comment`, `edit-fields`, `add-attachment`.
- Mỗi action: kiểm tra quyền theo role × status (server-side guard), ghi `audits[]`.

### 4.4 UI — Board list `src/app/tasks/page.tsx`
- **Tab view: `All Tasks` / `My Tasks`** (chốt):
  - `All Tasks`: toàn bộ task (cho Controller+).
  - `My Tasks`: chỉ các record được assign cho user hiện tại (cá nhân hoặc thuộc group được gán). Với Ranger, task không phải của mình **ẩn hoàn toàn** — Ranger thực tế chỉ thấy `My Tasks`.
- Sửa cột Kanban map đúng 6 status (gợi ý: Created | Assigned/Acknowledged | In Progress | Pending Further Action | Closed).
- Bỏ logic role/action sai trong popup (chuyển hết về Detail view).
- Card click → điều hướng sang **Detail route** thay vì popup.
- Create modal: thêm Checklist builder, Recurrence, Group/User toggle, Priority (Normal/High), Attachments.

### 4.5 UI — **Detail view mới** `src/app/tasks/[id]/page.tsx` (theo style Incident `[...id]`)
- Header: Task ID, status badge, link Parent Case (+ Incident nếu có).
- Khối thông tin: title, description, assignee, priority, due date, created by/date.
- **Checklist** interactive (assignee tick; gate Mark Complete).
- **Comments** section (Controller + assignee).
- **Attachments** upload/list.
- **Audit / Activity timeline** (tái dùng pattern timeline của Incident).
- **Action bar role-gated** đúng ma trận mục 3 (phân biệt Controller+ vs Assignee, lock theo status).
- Close modal có ô **Close Reason** (bắt buộc nếu chưa complete).

### 4.6 Assignee directory & Groups
- Thay 4 Ranger hardcode bằng nguồn user directory (Section 3 / `admin/users`).
- **Group assignment lấy từ Broadcast Recipient Groups** (`/admin/distribution-groups`) — chốt. Cấu trúc `DistributionGroup { id, name, description, members[], status }`.
  - Khi assign cho group → notify mọi thành viên; chỉ group `status = 'Active'` mới chọn được.
  - **Lưu ý kỹ thuật**: module này hiện lưu ở **localStorage** (client-side), chưa có API/db. Cần một trong hai: (a) đọc cùng localStorage ở phía client khi tạo task, hoặc (b) nâng groups lên `db.ts`/API dùng chung. Đề xuất (b) để dữ liệu task assignment bền vững phía server.
  - Members có cả `Internal`/`External`; với Task chỉ nên gán/notify thành viên **Internal** (CMS user) làm assignee, External chỉ để tham chiếu.

### 4.7 Notifications — `src/context/NotificationContext.tsx`
- Dispatch notification khi: assign, reassign, (tuỳ chọn) khi task due/overdue.

### 4.8 Style đồng bộ
- Tái dùng CSS pattern của Incident (timeline, badge, glass card, status colors) để Task nhất quán toàn hệ thống.

---

## 5. Thứ tự thực hiện đề xuất (phased)

1. **Phase 1 — Nền tảng**: chuẩn hoá status enum + Task type (`db.ts`); sửa API `[id]` sang action-oriented + audit + reassign→Assigned. *(Sửa workflow lõi, ít rủi ro UI.)*
2. **Phase 2 — Detail view**: tạo `tasks/[id]/page.tsx` với role-gating đúng ma trận, checklist gate, close reason, timeline.
3. **Phase 3 — Board + Create**: map lại cột theo 6 status, card → detail, bổ sung field create (checklist, recurrence, group, attachments).
4. **Phase 4 — Directory/Groups + Notifications**: assignee từ user directory + group, notify on assign/reassign.
5. **Phase 5 — Verify**: test theo từng role (Controller+, Ranger assignee, Ranger không phải assignee), từng transition, checklist gate, close reason, auto-close Case. Đối chiếu lại FSD 7.x + 3.4.2.

---

## 6. Điểm cần xác nhận trước khi code
- ✅ **Đã chốt**: "Flag cannot complete" → `Pending Further Action`.
- ✅ **Đã chốt**: Ranger không phải assignee → **ẩn hoàn toàn**. Màn list thêm 2 tab `All Tasks` / `My Tasks`; `My Tasks` chỉ hiện record được assign cho user.
- ✅ **Đã chốt**: Group assignment lấy từ **Broadcast Recipient Groups** (`/admin/distribution-groups`). Cần quyết: đọc localStorage phía client hay nâng groups lên db/API (đề xuất nâng lên API).
- ✅ **Đã chốt**: Recurrence giai đoạn này **chỉ lưu template** (chưa làm scheduler sinh task con).
