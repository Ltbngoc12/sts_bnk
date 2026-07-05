# Task Management Module — Revamp Plan (v1.0)

> **Tác giả:** BA / UX / Dev (senior)
> **Nguồn chuẩn:** SDC IIS CMS FRD v0.4 — Section 7 (Task Management), Section 3.4.2 (Role & Permission Matrix), Section 6 (Case) + Shin Feng clarifications về Recurrence.
> **Ngày:** 2026-07-05
> **Trạng thái:** Draft để review trước khi code.

Tài liệu này thay thế phần Recurrence còn mở trong `TASK_MODULE_UPDATE_PLAN.md` và mở rộng thành plan revamp toàn diện: **data model → workflow (happy + edge) → role matrix → UX → BE rationale**. Với mỗi quyết định logic phía BE đều có mục **`WHY`** giải thích lý do để đảm bảo trải nghiệm người dùng.

---

## 0. TL;DR — 6 quyết định kiến trúc lớn

| # | Quyết định | Tại sao |
|---|-----------|---------|
| 1 | Tách **`RecurrenceSeries`** thành entity riêng, Task instance link ngược (`seriesId`) | Câu trả lời #5 của Shin Feng (edit "this + future") không thể làm được nếu recurrence chỉ là 1 field string trên Task. Cần 1 "template" sống độc lập. |
| 2 | Occurrence đã generate là **Task độc lập** (own Case, own lifecycle) | Đúng FSD dòng 1733 + Shin Feng #4. Sửa 1 occurrence không đụng các occurrence khác. |
| 3 | Scheduler generate trước hạn, **lead time mặc định 14 ngày**, configurable | Shin Feng #3. Tránh sinh vô hạn task tương lai làm loạn board. |
| 4 | Edit/Delete occurrence luôn hỏi **scope**: *"this only"* vs *"this + all future"* | Shin Feng #5 — pattern Outlook/Google Calendar mà user đã quen. |
| 5 | Status enum chuẩn hoá **6 status** (bỏ `Re-Assigned`) | FSD 7.3.2. Reassign là **action** đưa status về `Assigned`, không phải 1 status. |
| 6 | Mọi action đều **server-side role guard + audit log** | FSD 3.4.2. Không tin client. Audit để truy vết và để Controller "retain visibility". |

---

## 1. Mục tiêu & phạm vi

**Mục tiêu:** Nâng Task Module từ 1 Kanban board + popup đơn giản lên module đầy đủ theo FSD, đồng bộ style Incident, và **giải quyết trọn vẹn bài toán Recurrence** mà Shin Feng đã chốt.

**Trong phạm vi (in-scope):**
- Task lifecycle 6 status + role-gating theo 3.4.2.
- Create / Edit / Assign / Reassign / Acknowledge / Begin / Checklist / Mark complete / Flag cannot complete / Close (+ close reason) / Reopen.
- **Recurrence Series**: config sub-form, weekday picker, 3 loại end-condition, lead time, scheduler generate, edit/cancel theo scope.
- Detail view + Audit timeline + Comments + Attachments.
- Notification on assign/reassign (+ optional overdue).
- Group assignment (Broadcast Recipient Groups).
- Case auto-close interaction.

**Ngoài phạm vi (out-of-scope) giai đoạn này:**
- CMMS ticket integration (module riêng).
- SLA/escalation tự động ngoài overdue notification.
- Mobile-specific UI (dùng responsive của web).

---

## 2. Nguồn chuẩn & Shin Feng clarifications

### 2.1 FSD nói gì về Recurrence (nguyên văn rút gọn)
- **7.1 (dòng 1732–1733):** *"Tasks can be set as a recurring event and may be assigned to one Assignee or a group. For recurring Tasks, the recurrence schedule remains the **template** for creating future Task occurrences. **Each generated Task is linked to its own Case and managed independently.**"*
- **7.1.2 field "Recurrence Schedule":** type `Date/Time`, note *"Set repeat creation of commonly scheduled tasks, and assigned to same Assignees or group of Assignees"* → **mơ hồ**, đây chính là gap ban đầu.

### 2.2 Shin Feng chốt (5 câu trả lời)

| # | Câu hỏi | Trả lời chốt | Ảnh hưởng thiết kế |
|---|--------|--------------|--------------------|
| 1 | Recurrence pattern? | **Daily / Weekly (chọn weekday cụ thể Mon/Wed/Fri) / Monthly** | Cần `frequency` + `weekdays[]` (khi Weekly) |
| 2 | End condition? | **Cả 3**: end date, occurrence count, indefinite | `endType: date \| count \| never` |
| 3 | Timing generate? | Generate **trước hạn**, mặc định **2 tuần** lead time | `leadTimeDays` (default 14), scheduler |
| 4 | Mid-series changes? | Sửa chỉ áp dụng occurrence **tương lai chưa generate**; occurrence đã tạo **độc lập**, sửa riêng lẻ | Template edit ≠ instance edit |
| 5 | Edit/Delete 1 occurrence? | Hệ thống **hỏi scope**: *"this only"* vs *"this + all future"* | Cần prompt modal + logic split series |

---

## 3. Kiến trúc dữ liệu (Data Model Revamp)

### 3.1 Entity mới: `RecurrenceSeries` (template)

```ts
export type RecurrenceFrequency = 'Daily' | 'Weekly' | 'Monthly';
export type RecurrenceEndType   = 'never' | 'onDate' | 'afterCount';
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface RecurrenceSeries {
  id: string;                       // SERIES-XXX
  // ── Template payload (dùng để clone ra mỗi occurrence) ──
  title: string;
  description: string;
  assignee: string;
  assigneeType: 'user' | 'group';
  priority: 'Normal' | 'High';
  checklistTemplate: TaskChecklistItem[];  // clone (chưa tick) cho mỗi occurrence
  // ── Recurrence rule ──
  frequency: RecurrenceFrequency;
  weekdays?: Weekday[];             // bắt buộc khi frequency = 'Weekly'
  monthlyDay?: number;             // ngày trong tháng khi 'Monthly' (1..31, xử lý tháng thiếu ngày)
  startDate: string;               // ngày bắt đầu chuỗi (anchor)
  dueTime: string;                 // giờ due áp cho mỗi occurrence (HH:mm)
  endType: RecurrenceEndType;
  endDate?: string;                // khi endType = 'onDate'
  occurrenceCount?: number;        // khi endType = 'afterCount'
  leadTimeDays: number;            // default 14 — generate trước hạn bao nhiêu ngày
  // ── State ──
  status: 'Active' | 'Ended' | 'Cancelled';
  generatedUntil?: string;         // mốc đã generate tới đâu (idempotent scheduler)
  occurrencesGenerated: number;    // đếm để enforce endType = afterCount
  supersededBySeriesId?: string;   // khi "this + future" split ra series mới
  createdBy: string;
  createdDate: string;
}
```

### 3.2 Task entity — bổ sung liên kết series

```ts
export interface Task {
  // ... field hiện có ...
  seriesId?: string;               // link ngược về RecurrenceSeries (nếu là occurrence)
  occurrenceDate?: string;         // ngày occurrence này thuộc về (để dedupe + hiển thị)
  isRecurringInstance?: boolean;   // true nếu sinh từ series
  detachedFromSeries?: boolean;    // true nếu user đã "edit this only" → không còn theo template
  // recurrenceSchedule?: string   // ⚠️ DEPRECATED — thay bằng seriesId
}
```

> **`WHY` — tách series khỏi Task:** Nếu để recurrence là 1 field string trên Task (`recurrenceSchedule`), thì "sửa this + all future" là bất khả thi — không có nơi nào lưu "tất cả future" cả. Tách `RecurrenceSeries` cho phép: (a) sửa template → mọi occurrence **chưa generate** tự đổi theo; (b) mỗi occurrence đã sinh là 1 Task thật, có Case riêng, đúng FSD dòng 1733; (c) đếm được `occurrencesGenerated` để tôn trọng `afterCount`. **Người dùng hài lòng vì** hành vi khớp Outlook/Google Calendar họ đã quen — không có bất ngờ.

### 3.3 Sơ đồ quan hệ

```
RecurrenceSeries (1) ──generates──> (N) Task occurrences
        │                                    │
        │ template payload                   │ each has:
        │ (title, assignee, checklist...)    ├─ own Case (auto-created)
        │                                    ├─ own lifecycle (6 status)
        └─ rule (freq, weekdays, end...)     └─ seriesId (link back)
```

---

## 4. Task Lifecycle — State Machine (6 status)

```
                 ┌──────────── Reassign (bất kỳ status mở → Assigned) ───────────┐
                 │                                                               │
   [Created] ──assign──> [Assigned] ──acknowledge──> [Acknowledged] ──begin──> [In Progress]
      │                     │                            │                          │
      │                     │                            │             ┌────────────┴───────────┐
      │                     │                            │        mark complete        flag cannot complete
      │                     │                            │             │                        │
      │                     │                            │             ▼                        ▼
      └───────── Close/Drop (Controller+, mọi status mở, cần close reason ─────────┐   [Pending Further Action]
                            nếu chưa complete) ────────────────────────────────────┤            │
                                                                                    ▼            │
                                                                                [Closed] <──close┘
                                                                                    │
                                                                            reopen (Controller+) → Created
```

**Quy tắc lõi (invariants):**
1. **Reassign** ở bất kỳ status mở nào (`Assigned/Acknowledged/In Progress/Pending Further Action`) → status **về `Assigned`** + notify assignee mới. *(FSD 7.2)*
2. **Mark Complete** chỉ khi **mọi checklist item đã tick** (không có checklist → complete tự do) → `Closed` + `completed = true`.
3. **Flag cannot complete** → `Pending Further Action` (chờ Controller).
4. **Close/Drop** bởi Controller+: chưa complete → **bắt buộc Close Reason**; đã complete → không bắt buộc.
5. **Reopen** chỉ Controller+, từ `Closed` → `Created` (mất assignee, phải assign lại).
6. Case **không auto-close** khi còn Task mở. *(FSD 7.3)*

> **`WHY` — Reassign về `Assigned` chứ không giữ status cũ:** Khi đổi người, người mới **chưa** acknowledge/chưa bắt đầu — giữ status "In Progress" sẽ nói dối về thực trạng. Đưa về `Assigned` buộc người mới phải Acknowledge lại → **chuỗi trách nhiệm rõ ràng**, không ai "thừa hưởng" tiến độ của người trước. User (Controller) hài lòng vì board phản ánh đúng sự thật.

---

## 5. Workflows chi tiết (Happy + Edge)

> Mỗi workflow gồm: **Actor**, **Happy path**, **Edge cases**, và **`WHY` (BE rationale)**.

### W1 — Tạo Task một lần (one-off)
**Actor:** Controller+.
**Happy:** Mở Create modal → nhập Title (bắt buộc) → chọn Case (auto nếu đang trong Case) → Assignee (user/group) → Priority → Due date → Checklist (optional) → Attachments → **Dispatch**. Hệ thống tạo Task status `Created` → nếu đã chọn assignee thì auto chuyển `Assigned` + notify.

**Edge cases:**
- **E1.1** Không có Case active → hệ thống **auto-create Case** trước (FSD dòng 852), rồi gắn Task.
- **E1.2** Title trống → block submit, inline error.
- **E1.3** Due date ở quá khứ → warning (không block — có thể là task tồn đọng cần log).
- **E1.4** Chọn group `status ≠ Active` → ẩn khỏi list, không chọn được.
- **E1.5** Group không có member Internal nào → block với message "Group has no internal members to assign".

> **`WHY` — auto-create Case:** FSD cấm mọi child record tồn tại không có Case. Nếu bắt user tạo Case thủ công trước sẽ thêm 1 bước thừa → user bỏ cuộc. Auto-create giữ traceability mà **không tăng ma sát**.

---

### W2 — Tạo Task định kỳ (Recurrence Series)
**Actor:** Controller+.
**Happy:** Trong Create modal, bật toggle **"Repeat / Recurring"** → hiện **Recurrence sub-form** (chi tiết UX ở §7.2):
1. **Frequency:** Daily / Weekly / Monthly.
2. Nếu **Weekly** → **weekday picker** (chọn ≥1: Mon…Sun).
3. Nếu **Monthly** → chọn ngày trong tháng.
4. **Start date** + **Due time**.
5. **End condition:** Never / On date / After N occurrences.
6. **Lead time** (default 14 ngày, configurable).
7. **Preview** danh sách occurrence sắp sinh ("Sẽ tạo Task vào Mon/Wed/Fri, 2 tuần tới: 06/07, 08/07, 10/07…").
→ **Save series** → tạo `RecurrenceSeries` (status `Active`) → scheduler sinh ngay các occurrence trong cửa sổ lead time.

**Edge cases:**
- **E2.1** Weekly nhưng **không chọn weekday nào** → block ("Select at least one day").
- **E2.2** Monthly chọn ngày 31 → tháng thiếu ngày (Feb) → **áp dụng ngày cuối tháng** (rule cố định, ghi rõ trong tooltip).
- **E2.3** End date < Start date → block.
- **E2.4** `afterCount = 0` hoặc âm → block (min 1).
- **E2.5** `Never` + Daily → cảnh báo "This will generate tasks indefinitely" nhưng cho phép (lead time chặn sinh vô hạn).
- **E2.6** Start date quá khứ → chỉ sinh occurrence **từ hôm nay trở đi** (không backfill quá khứ).
- **E2.7** Lead time = 0 → chỉ sinh occurrence đúng ngày due (edge của "just in time").

> **`WHY` — lead time + scheduler thay vì sinh hết một lần:** Nếu sinh toàn bộ occurrence tương lai (vô hạn với "Never"), board sẽ ngập hàng nghìn task rác, và mỗi lần sửa template phải đi sửa hàng nghìn record. Lead time 14 ngày = **chỉ vật chất hoá phần "sắp tới"**, phần xa vẫn là template ảo. **User hài lòng vì** board sạch, chỉ thấy việc trong tầm 2 tuần — đúng nhịp vận hành ground team.

> **`WHY` — không backfill quá khứ (E2.6):** Sinh task cho ngày đã qua là vô nghĩa (không ai làm được) và gây "overdue giả". Bắt đầu từ hôm nay giữ dữ liệu **actionable**.

---

### W3 — Recurrence Generation Engine (Scheduler)
**Actor:** Hệ thống (cron/scheduled job, chạy ví dụ mỗi ngày 00:05).
**Logic (idempotent):**
```
FOR each series WHERE status = 'Active':
    window_end = today + leadTimeDays
    FOR each due_date computed by rule BETWEEN (generatedUntil ?? startDate) AND window_end:
        IF due_date < today: skip                      // E2.6
        IF endType='onDate'   AND due_date > endDate: mark series 'Ended'; break
        IF endType='afterCount' AND occurrencesGenerated >= count: mark 'Ended'; break
        IF NOT exists Task(seriesId, occurrenceDate=due_date):   // dedupe
            create Task (clone template) → auto-create Case → status Created→Assigned → notify
            occurrencesGenerated++
    series.generatedUntil = window_end
```

**Edge cases:**
- **E3.1** Scheduler chạy lỗi/miss 1 ngày → lần sau **catch-up** nhờ `generatedUntil` (không mất occurrence).
- **E3.2** Scheduler chạy 2 lần cùng ngày → **dedupe** bằng unique `(seriesId, occurrenceDate)` → không tạo trùng.
- **E3.3** Series `Cancelled` giữa chừng → dừng sinh, occurrence đã sinh **giữ nguyên** (không xoá ngược, xem W12).
- **E3.4** `afterCount` đạt đúng giữa cửa sổ lead time → sinh đủ N rồi `Ended`.

> **`WHY` — idempotent + dedupe key `(seriesId, occurrenceDate)`:** Scheduler là job nền, sẽ có lúc chạy trùng/miss (deploy, downtime). Không idempotent → user thấy **task nhân đôi** hoặc **thiếu task** → mất niềm tin vào hệ thống. Dedupe key đảm bảo "đúng 1 task cho đúng 1 ngày", dù job chạy bao nhiêu lần.

---

### W4 — Assign / Reassign
**Actor:** Controller+.
**Happy:** Chọn assignee (user hoặc group) → confirm → status → `Assigned` → notify. Reassign giống hệt nhưng từ status mở bất kỳ → **về `Assigned`**, notify người mới; audit ghi "Reassigned from X to Y".

**Edge cases:**
- **E4.1** Reassign về **chính assignee cũ** → no-op, không notify (tránh spam), audit vẫn ghi.
- **E4.2** Assign cho group → notify **mọi member Internal**; bất kỳ member nào Acknowledge trước thì "claim" task (optional: hiển thị "Acknowledged by X").
- **E4.3** Assignee cũ đang `In Progress` khi bị reassign → checklist tick của họ **reset hay giữ?** → **Giữ** tick (công việc thật đã làm) nhưng status về `Assigned`; audit ghi rõ. *(cần confirm — xem §11)*
- **E4.4** Reassign task đã `Closed` → **không cho phép** (phải Reopen trước).

> **`WHY` — reassign về chính mình là no-op không notify (E4.1):** Notification spam là lý do #1 khiến user tắt thông báo. Chỉ notify khi thực sự đổi người → thông báo **luôn có nghĩa**.

---

### W5 — Acknowledge / W6 — Begin
**Actor:** Assignee (chỉ user được gán, hoặc member của group được gán).
**Happy:** `Assigned` → **Acknowledge** → `Acknowledged`; `Acknowledged` → **Begin Task** → `In Progress`.

**Edge cases:**
- **E5.1** Non-assignee Ranger cố gọi API acknowledge → **403** (server guard), không chỉ ẩn nút.
- **E5.2** Group task: member A acknowledge → task chuyển `Acknowledged`, member B mở ra thấy đã ack (real-time hoặc on-refresh).
- **E5.3** Controller acknowledge thay assignee → **không cho phép** (Acknowledge là hành vi của người thực thi). Controller chỉ assign/reassign/close.

> **`WHY` — chặn server-side, không chỉ ẩn nút (E5.1):** Ẩn nút chỉ là UX; kẻ xấu/bug client vẫn gọi API được. FSD phân quyền chặt (3.4.2) → **guard ở BE** là ranh giới an toàn thật. User (và auditor) hài lòng vì quyền được thực thi đúng, không "lách".

---

### W7 — Checklist & Mark Complete
**Actor:** Assignee.
**Happy:** Ở `In Progress`, tick từng checklist item → khi **đủ 100%** nút "Mark Complete" mới enable → click → `Closed` + `completed=true` + `closedBy=assignee`.

**Edge cases:**
- **E7.1** Không có checklist → "Mark Complete" enable ngay (FSD: complete tự do).
- **E7.2** Còn ≥1 item chưa tick → nút disabled + tooltip "Tick all items first". Server cũng **re-validate** (chống bypass).
- **E7.3** Controller thêm checklist item **sau khi** assignee đã tick hết → nút Mark Complete tự disable lại (item mới chưa tick). Notify assignee "Checklist updated".
- **E7.4** Mark complete task thuộc series → **không ảnh hưởng** occurrence khác (độc lập).

> **`WHY` — gate Mark Complete + server re-validate (E7.2):** Checklist là "definition of done" do Controller đặt. Cho complete khi chưa xong = **đóng task dối**. Server re-validate vì client có thể bị thao túng. **User hài lòng** vì chất lượng công việc được đảm bảo, Controller tin tưởng con số "completed".

---

### W8 — Flag Cannot Complete
**Actor:** Assignee (ở `In Progress`).
**Happy:** Click "Cannot complete" → nhập lý do (nên bắt buộc) → `Pending Further Action` → notify Controller.

**Edge cases:**
- **E8.1** Lý do trống → block (khác close reason của Controller, nhưng cùng tinh thần: phải giải thích tại sao dừng).
- **E8.2** Từ `Pending Further Action`, Controller có thể **Reassign** (về `Assigned`, thử người khác) hoặc **Close** (kèm close reason).

> **`WHY` — Pending Further Action là trạng thái "chốt chờ Controller", assignee không tự thoát:** Khi người thực thi bó tay, quyết định tiếp theo (đổi người / đóng / leo thang) là **của Controller**, không phải Ranger. Tách trạng thái riêng giúp Controller **lọc nhanh** các task cần can thiệp. User (Controller) hài lòng vì có "hàng đợi cần tôi xử lý" rõ ràng.

---

### W9 — Close / Drop Task
**Actor:** Controller+.
**Happy:** Click Close → nếu task **chưa** `completed` → **bắt buộc Close Reason** → `Closed`. Nếu đã completed → close không cần reason.

**Edge cases:**
- **E9.1** Close reason trống khi chưa complete → block + server re-validate.
- **E9.2** Close task cuối cùng của Case → trigger check **auto-close Case** (W13).
- **E9.3** Close occurrence của series → series vẫn `Active`, các occurrence tương lai vẫn sinh.
- **E9.4** Close hàng loạt (bulk) từ board → mỗi task vẫn enforce reason riêng nếu chưa complete.

> **`WHY` — bắt buộc close reason khi chưa complete (E9.1):** "Drop" 1 task chưa xong mà không giải thích → mất dấu vết vận hành, sau này audit không biết vì sao. Bắt reason biến mỗi lần đóng non-complete thành **quyết định có trách nhiệm & truy vết được**. FSD 7.3 yêu cầu điều này.

---

### W10 — Reopen
**Actor:** Controller+ (từ `Closed`).
**Happy:** Reopen → `Created` (mất assignee) → phải Assign lại.

**Edge cases:**
- **E10.1** Reopen task khiến Case đã auto-closed phải **mở lại** → Case về `Active` (nếu policy cho phép) — *cần confirm §11*.
- **E10.2** Reopen occurrence của series `Ended` → occurrence sống lại độc lập, không hồi sinh series.

> **`WHY` — Reopen về `Created` chứ không về status cũ:** Task đã đóng, context (assignee/tiến độ) không còn đáng tin. Về `Created` buộc **đánh giá lại từ đầu** ai làm → tránh giao lại cho người đã rời ca/không còn liên quan.

---

### W11 — Edit Occurrence: "This only" vs "This + future" ⭐
**Actor:** Controller+.
**Trigger:** Edit 1 Task **là occurrence của series** (`seriesId` != null) và sửa field thuộc template (title, assignee, checklist, priority, due time…).
**Happy:** Hiện **scope prompt modal** (§7.4):
- **"Only this occurrence"** → set `detachedFromSeries=true` trên task đó, sửa in-place. Template **không đổi**. Các occurrence khác không đổi.
- **"This and all future occurrences"** → **split series**:
  1. Kết thúc series cũ ngay trước `occurrenceDate` này (set `endDate` = ngày hôm trước, hoặc cắt count).
  2. Tạo **series mới** với template đã sửa, `startDate = occurrenceDate` này, `supersededBySeriesId` liên kết.
  3. Occurrence **đã generate từ ngày này trở đi & chưa bị chỉnh tay** → cập nhật theo template mới; occurrence **quá khứ** giữ nguyên.

**Edge cases:**
- **E11.1** Sửa occurrence **đã `In Progress`/`Closed`** với scope "this+future" → occurrence đang chạy đó **giữ nguyên trạng thái** (không reset), chỉ template & future đổi.
- **E11.2** Occurrence đã "edit this only" (detached) rồi, sau đó "this+future" từ occurrence khác → occurrence detached **không bị đè** (đã tách khỏi template).
- **E11.3** Sửa field **không thuộc template** (vd: comment, log riêng của occurrence) → **không hỏi scope**, chỉ sửa task đó.
- **E11.4** Sửa **rule** (frequency/weekday/end) → mặc định là hành vi "this+future" (đổi rule không thể áp cho quá khứ).

> **`WHY` — split series thay vì sửa toàn bộ occurrence đã tồn tại:** Occurrence quá khứ là **lịch sử vận hành đã xảy ra** — sửa ngược = làm giả lịch sử/audit. Split giữ "trước đây làm theo template A, từ ngày X làm theo template B", đúng như Google Calendar. **User hài lòng** vì (a) hành vi khớp công cụ họ quen, (b) lịch sử bất biến để audit, (c) đổi lịch tương lai không phá vỡ việc đang chạy.

---

### W12 — Cancel / Delete Series (hoặc 1 occurrence)
**Actor:** Controller+.
**Happy:** Trên occurrence hoặc trên series → chọn Delete → **scope prompt** (giống edit):
- **"This occurrence only"** → chỉ đóng/huỷ occurrence này (thực chất là Close/Drop với reason "cancelled").
- **"This + all future"** → set series `status='Cancelled'`, **dừng scheduler**, và huỷ các occurrence tương lai **chưa bắt đầu** (`Created`/`Assigned`). Occurrence **đang `In Progress`** → hỏi Controller giữ hay đóng.

**Edge cases:**
- **E12.1** Occurrence đã `Closed` → không "delete" được (chỉ ẩn/lưu trữ), giữ audit.
- **E12.2** Cancel series không xoá occurrence quá khứ (lịch sử).
- **E12.3** Occurrence `In Progress` khi cancel "this+future" → **không auto-kill**, cảnh báo "1 occurrence đang chạy, giữ lại?".

> **`WHY` — cancel không xoá cứng, chỉ dừng sinh + close future (E12.2):** Xoá cứng task đã có hoạt động = mất dữ liệu và phá audit trail. "Cancel" = dừng tương lai, bảo toàn quá khứ. **Controller hài lòng** vì không sợ "lỡ tay xoá mất lịch sử".

---

### W13 — Case Auto-Close Interaction
**Actor:** Hệ thống.
**Logic:** Khi 1 sub-record (Task/Incident) đóng → check Case: nếu **còn ≥1 Task mở** → **không** auto-close, **prompt Controller** "Case còn N task mở, resolve trước khi đóng". Khi tất cả đóng → auto-close Case.

**Edge cases:**
- **E13.1** Task recurring occurrence mới sinh vào Case đã đóng → *không nên xảy ra* vì mỗi occurrence có **own Case** (FSD dòng 1733). Đảm bảo generation luôn tạo Case mới, không tái dùng Case đã đóng.
- **E13.2** Reopen task trong Case đã closed → W10.1.

> **`WHY` — mỗi occurrence own Case (không gom vào 1 Case):** Nếu gom, Case sẽ **không bao giờ đóng được** (task mới sinh mãi) → kẹt vòng đời Case. Own-Case cho từng occurrence giữ mỗi lần lặp là 1 đơn vị công việc đóng-mở độc lập. Đúng FSD, và **user không bị Case "treo" vĩnh viễn**.

---

### W14 — Notifications
**Dispatch khi:** assign, reassign (người mới), flag-cannot-complete (→ Controller), (optional) overdue.
**Edge:** batch/gộp khi assign group; không notify no-op reassign (E4.1); overdue notify 1 lần/ngày, không spam.

---

## 6. Role × Status × Action Matrix (chuẩn hoá theo 3.4.2)

**Controller+ = {Controller, Duty Officer, Duty Manager, System Administrator, Current Ops Admin}**

| Status | Controller+ | Assignee (chỉ user được gán) |
|--------|-------------|------------------------------|
| **Created** | View, Edit, Assign (user/group), Close/Drop | **No access** (không thấy) |
| **Assigned** | View, Edit, Assign/Reassign, Close | View, **Acknowledge** |
| **Acknowledged** | View, Edit, Assign/Reassign, Close | View, **Begin Task** |
| **In Progress** | View, Edit, Assign/Reassign, Close | View, Log activity, Update checklist, **Mark Complete**, **Flag cannot complete** |
| **Pending Further Action** | View, Edit, Assign/Reassign, Close | View only |
| **Closed** | View, **Reopen** | View only |

**SDC Stakeholder:** không có quyền trên Task (không hiện trong nav task, hoặc view-only nếu chính sách cho).

> **`WHY` — phân biệt "role Controller+" vs "Assignee cụ thể":** Một Ranger KHÔNG phải assignee thì không thao tác được (kể cả View task không phải của mình). Điều này chống nhiễu: Ranger chỉ thấy **việc của mình** (tab My Tasks), Controller thấy toàn cảnh. **Cả hai nhóm hài lòng** vì mỗi người thấy đúng cái họ cần.

---

## 7. UX / UI Design

### 7.1 Board list (`/tasks`)
- **2 tab:** `All Tasks` (Controller+) / `My Tasks` (record assign cho user hoặc group của user). Ranger mặc định `My Tasks`, task không phải của mình **ẩn hoàn toàn**.
- **Kanban 5 cột** (gộp cho gọn): `Created` | `Assigned + Acknowledged` | `In Progress` | `Pending Further Action` | `Closed`.
- Card: Task ID, title, priority chip, due date (đỏ nếu overdue), assignee avatar/name, **🔁 badge nếu là recurring instance**, link Case.
- Search + filter (status, priority, assignee, case, date range) + pagination.
- Card click → **Detail route** `/tasks/[id]` (không popup).

### 7.2 Create modal + **Recurrence sub-form** ⭐
Layout tiến trình (progressive disclosure — chỉ hiện cái cần):

```
┌─ New Task ─────────────────────────────────────────────┐
│ Title*            [___________________________]        │
│ Description       [___________________________]        │
│ Case              [Auto: CASE-012 ▾]                   │
│ Assign to    (•) User  ( ) Group   [Select ▾]          │
│ Priority     [Normal ▾]      Due   [📅 date+time]      │
│ Checklist    [+ add item]                              │
│                                                        │
│ ☑ Repeat this task            ← toggle bật recurrence  │
│ ┌───────── Recurrence ─────────────────────────────┐   │
│ │ Frequency  (•)Daily ( )Weekly ( )Monthly         │   │
│ │ ── nếu Weekly: ──                                │   │
│ │ Repeat on  [Mo][Tu][We][Th][Fr][Sa][Su] ← chips  │   │
│ │ ── nếu Monthly: ──                               │   │
│ │ Day of month [15 ▾]  (31→ last day of month)     │   │
│ │ Start date [📅]      Time [🕘 09:00]             │   │
│ │ Ends  (•)Never                                   │   │
│ │       ( )On date  [📅]                           │   │
│ │       ( )After   [__] occurrences                │   │
│ │ Generate ahead  [14] days  (lead time)           │   │
│ │ ▸ Preview: sẽ tạo 06/07, 08/07, 10/07, 13/07…    │   │
│ └──────────────────────────────────────────────────┘   │
│                       [Cancel]  [Dispatch Task]        │
└────────────────────────────────────────────────────────┘
```
**Component states:** weekday chip toggle (active = orange `--color-primary`); end-condition radio ẩn/hiện input tương ứng; preview list cập nhật real-time khi đổi rule.

### 7.3 Detail view (`/tasks/[id]`) — style Incident
- Header: Task ID + status badge + link Case (+ Incident nếu có) + **series banner** nếu recurring ("Part of recurring series SERIES-003 · [View series]").
- Info block: title, desc, assignee, priority, due, created by/date.
- **Checklist** interactive (gate Mark Complete).
- **Comments**, **Attachments**.
- **Audit / Activity timeline** (tái dùng pattern Incident).
- **Action bar role-gated** theo §6, lock theo status.

### 7.4 **Scope Prompt Modal** (edit/delete occurrence) ⭐
```
┌─ Edit recurring task ──────────────────────┐
│ This task repeats. Apply changes to:       │
│  (•) This occurrence only                  │
│  ( ) This and all following occurrences    │
│                                            │
│              [Cancel]   [Continue]         │
└────────────────────────────────────────────┘
```
Dùng chung cho cả Edit (W11) và Delete/Cancel (W12). Copy khớp Outlook/Google để leverage muscle memory.

### 7.5 Close modal
Ô **Close Reason** (bắt buộc nếu chưa complete, ẩn/optional nếu đã complete). Server re-validate.

---

## 8. Edge Case Catalog (tổng hợp)

| ID | Tình huống | Xử lý |
|----|-----------|-------|
| E1.1 | Tạo task khi chưa có Case | Auto-create Case |
| E2.2 | Monthly ngày 31, tháng thiếu | Dùng ngày cuối tháng |
| E2.6 | Series start ở quá khứ | Không backfill, sinh từ hôm nay |
| E3.1 | Scheduler miss 1 ngày | Catch-up qua `generatedUntil` |
| E3.2 | Scheduler chạy trùng | Dedupe `(seriesId, occurrenceDate)` |
| E4.1 | Reassign chính mình | No-op, no notify, vẫn audit |
| E4.3 | Reassign khi đang In Progress | Status→Assigned, checklist tick giữ (confirm) |
| E7.3 | Thêm checklist sau khi tick hết | Mark Complete disable lại + notify |
| E9.2 | Close task cuối của Case | Trigger auto-close check |
| E11.1 | "This+future" khi occurrence đang chạy | Occurrence chạy giữ nguyên |
| E11.2 | Occurrence detached bị "this+future" | Không đè lên detached |
| E12.3 | Cancel future khi 1 occurrence In Progress | Cảnh báo, hỏi giữ/đóng |
| E13.1 | Occurrence sinh vào Case đã đóng | Luôn tạo Case mới cho occurrence |

---

## 9. BE Logic Rationale — tổng hợp "tại sao" (để User hài lòng)

| Quyết định BE | Rủi ro nếu làm khác | Giá trị cho user |
|---------------|---------------------|------------------|
| `RecurrenceSeries` là entity riêng | Không thể "edit this+future" | Hành vi khớp Outlook/GCal, không bất ngờ |
| Occurrence = Task độc lập, own Case | Case treo vĩnh viễn, sửa 1 đụng tất cả | Mỗi lần lặp đóng-mở độc lập, board không kẹt |
| Lead time + scheduler idempotent | Board ngập task rác / task nhân đôi/thiếu | Board sạch, đúng 1 task/ngày, tin cậy |
| Reassign → `Assigned` | Status nói dối tiến độ | Chuỗi trách nhiệm rõ ràng |
| Gate Mark Complete + server re-validate | "Đóng task dối", bypass client | Chất lượng công việc đảm bảo |
| Close reason bắt buộc khi chưa complete | Mất dấu vết vận hành | Audit truy vết được mọi lần drop |
| Server-side role guard (không chỉ ẩn nút) | Lách quyền qua API | Phân quyền thực thi đúng, an toàn |
| Split series (không sửa quá khứ) | Làm giả lịch sử/audit | Lịch sử bất biến, đổi tương lai an toàn |
| Cancel = dừng future, giữ quá khứ | Xoá cứng mất dữ liệu | Không sợ lỡ tay mất lịch sử |
| No-op reassign không notify | Notification spam | Mọi thông báo đều có nghĩa |

---

## 10. Phased Rollout

1. **Phase 1 — Nền tảng:** chuẩn hoá `TaskStatus` enum (bỏ `Re-Assigned`) + Task type (`db.ts`); API `[id]` action-oriented + audit + reassign→Assigned. *(Ít rủi ro UI.)*
2. **Phase 2 — Detail view:** `/tasks/[id]` role-gated, checklist gate, close reason, timeline.
3. **Phase 3 — Board + Create:** map 5 cột, card→detail, Create modal đầy đủ field.
4. **Phase 4 — Recurrence core:** entity `RecurrenceSeries`, sub-form UI, scheduler generation, preview.
5. **Phase 5 — Recurrence advanced:** scope prompt (edit/delete this-only vs this+future), split series, cancel.
6. **Phase 6 — Directory/Groups + Notifications:** assignee từ user directory + Broadcast Groups; notify.
7. **Phase 7 — Verify:** test từng role × status × transition, checklist gate, close reason, recurrence generation (miss/trùng/afterCount/endDate), edit-scope, cancel-scope, auto-close Case. Đối chiếu FSD 7.x + 3.4.2.

---

## 11. Open decisions — cần chốt trước khi code

1. **E4.3 / E11.1** — Khi reassign hoặc "this+future" mà occurrence đang `In Progress`: **giữ checklist tick** hay reset? (Đề xuất: **giữ** — công việc thật đã làm.)
2. **E10.1** — Reopen task trong Case đã auto-closed → Case tự mở lại `Active` hay cần Controller mở tay? (Đề xuất: **auto về Active**, audit ghi.)
3. **Monthly rule** — ngoài "day of month", có cần "ngày thứ N của tuần trong tháng" (vd "Thứ Hai đầu tiên")? (Đề xuất: **giai đoạn 1 chỉ day-of-month**, đủ 90% nhu cầu.)
4. **Group claim** — task group: cho member đầu tiên "claim" (khoá người khác) hay ai cũng thao tác được đến khi 1 người acknowledge? (Đề xuất: **acknowledge = claim**, hiện "Acknowledged by X".)
5. **Lead time configurable ở đâu** — per-series (user chỉnh mỗi lần) hay System Config global default + override? (Đề xuất: **global default 14 + override per series**.)
6. **Time zone** — SGT fix cứng hay theo user? (Đề xuất: **SGT** — Sentosa là 1 địa điểm.)

---

*Hết. Sẵn sàng đi vào Phase 1 hoặc dựng prototype UI cho Recurrence sub-form + Scope prompt (§7.2, §7.4) để demo trước khi chốt.*
