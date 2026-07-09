# QnA — FSD v0.5 §8 Events Master List Module

**To:** Shin Feng (BA)
**From:** Kyle
**Re:** Confirming Events Master List behavior before build (role matrix is blank in the FRD; one nav-description line contradicts the module's own no-Case-linkage rule; schedule-upload file format not specified)

Context: building the Events Master List module per §2.4.3 / §3.3.4 / §8 / §9.1.3. Starting the build now per your call to not block on this, but flagging three points below so we can correct course quickly if my assumptions are wrong.

---

## 1. Events Management Role & Status Matrix (§3.3.4) — table is blank in the FRD

**Spec text:** The FRD has the heading "3.3.4 Events Management" on page 30, but no table follows it — the document jumps straight to "3.4 Record Data Retention". Every other module (Incident §3.3.1, Fault §3.3.2, e-Diary §3.3.3) has a filled Role/Create/View/Edit/Delete matrix; Events does not.

**What I'm building against in the meantime:** since the FRD lists Events Master List navigation as accessible to "Controllers, Duty Officers, and Duty Managers" (§2.4, CMS Dashboard scope) and e-Diary can create/link Events (§9.1.3), I'm using the same shape as the e-Diary Management matrix (§3.3.3) as a placeholder:

| Role | Create | View | Edit | Delete |
|---|---|---|---|---|
| System Administrator | Yes | All | Yes | Yes |
| Current Ops Administrator | Yes | All | Yes | No |
| Duty Manager | Yes | All | Yes | No |
| Duty Officer | Yes | All | Yes | No |
| Controller | Yes | All | Yes | No |
| Responder / Stakeholder | No | — | No | No |

**Confirm:**
1. Is this placeholder matrix correct, or does Shin Feng have the actual intended matrix for this section?
2. Specifically: should Edit be Duty-Manager-and-above only (like e-Diary, which has Edit = No for everyone), or should any Create-authorized role also Edit their own events? The FRD's field design (§8.1.2) doesn't say entries are immutable like e-Diary, so I've assumed Edit = Yes for all Create-authorized roles above — please confirm.
3. Who can Delete an event record? I've defaulted to System Administrator only (mirrors every other module's Delete column).

---

## 2. "Event-case linking" (§2.4.1 nav description) contradicts §4.1(h) / §8.1.1(d)

**Spec text, §2.4.1 Navigation Item table (page 12):**
> "Events Master List — Events list and calendar view, event creation and management, and **event-case linking**"

**Spec text, §4.1(h) (page 31):**
> "Events are managed as Events Master List records. They may be created from or linked to e-Diary entries for traceability, but they are **not Case sub-records** and do not affect status or automated Case closure."

**Spec text, §8.1.1(d) (page 61):**
> "Events are managed as Events Master List records and shall **not affect Case status** or automated Case closure."

**My reading:** "event-case linking" in the nav table doesn't mean a direct Event↔Case relationship. It means the *indirect* link that already exists via the e-Diary entry: an Event can retain a reference to the e-Diary entry it was created from (§8.1.1c, §9.1.3c), and that e-Diary entry itself belongs to a Case. So from a Case detail view, a user could trace Case → e-Diary entry → linked Event, without the Event ever being a structural child of the Case (no `caseId` field on the Event record, no effect on Case status).

**Confirm:** Is that the correct read, or is there meant to be an actual direct Event → Case reference field I'm missing (separate from the e-Diary chain)?

---

## 3. Events Schedule File Upload — format (§8.3b)

**Spec text:** "Support file formats shall be confirmed during the technical design." — the FRD explicitly leaves this open.

**My assumption for the build:** CSV and XLSX (columns: Event Name, Start Date/Time, End Date/Time, Location, Event Type, Description — matching the §8.1.2 field table), parsed and presented for review before confirm, per §8.3c-f.

**Confirm:** Does SDC have a required/preferred format already (e.g. a template they use today), or is CSV/XLSX fine to lock in as the technical-design decision?

---

Let me know if any of the above needs correcting — starting the build on these assumptions now, will adjust quickly once you weigh in.

---

## Shin Feng's reply — 2026-07-09

**2. "Event-case linking" — confirmed correct, indirect link only**

> Đúng như bạn hiểu, e-Diary chính là "cầu nối" giữa Event và Case:
> - e-Diary là một sub-record của Case: Khi bạn tạo một mục nhập e-Diary, hệ thống sẽ tự động tạo một Case (nếu chưa có).
> - Tạo/Liên kết Event từ e-Diary: Nếu một mục nhật ký điện tử ghi lại thông tin liên quan đến sự kiện, người dùng có quyền tạo hoặc liên kết một Event trực tiếp từ đó.
> - Kết quả: Bản ghi Event sẽ lưu giữ tham chiếu (reference) đến mục e-Diary nguồn. Vì e-Diary thuộc về một Case nhất định, một sợi dây liên kết logic được hình thành: **Event ↔ e-Diary ↔ Case**.

**Takeaway:** no direct `caseId` field on `EventRecord`. The only link is `EventRecord.sourceEDiaryId` → e-Diary entry → e-Diary's own `caseId`. Case detail view traces to a linked Event by following this chain, not by querying Events directly for a case reference. Confirmed — no change needed to the data model in EVENTS_MASTER_LIST_MODULE_PLAN.md §3.1.

**3. Schedule file format — Kyle confirmed CSV/XLSX (technical-design call, no BA sign-off needed)**

> t đồng ý

**Takeaway:** locking in CSV and XLSX as the supported formats for §8.3 bulk import, per the column layout proposed above (Event Name, Start/End Date-Time, Location, Event Type, Description). If SDC later surfaces a required template, revisit the parser in Phase 5.

**Still open:** #1 (role matrix) — pending Shin Feng's reply.
