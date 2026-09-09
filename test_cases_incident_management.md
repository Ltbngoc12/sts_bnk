# Bộ Test Case Quản Lý Sự Cố (Incident Management Test Suite) - SDC IIS CMS

**Dự án:** SDC IIS CMS (Sentosa Development Corporation - Integrated Information System)  
**Phân hệ:** Incident Management (Quản lý Sự cố)  
**Phiên bản Template:** v1.0  
**Tài liệu tham chiếu:** `Sentosa_IncidentManagement_TestCases_v1.pdf` & SDC FSD v0.5  

---

## Danh Mục Các Test Suite (Test Suites Overview)

| Mã TS | Tên Test Suite | Số lượng TC | Mô tả ngắn |
| :--- | :--- | :---: | :--- |
| **TS-01** | Creation & Field Validation | 8 | Kiểm thử tạo sự cố, định dạng mã Incident ID, liên kết Case và xác thực trường bắt buộc. |
| **TS-02** | Location Particulars | 5 | Kiểm thử vị trí, tra cứu mã bưu chính (postal code), pin trên bản đồ và Location Tags. |
| **TS-03** | Optional Particulars | 10 | Kiểm thử các trường thông tin phụ (Cảnh sát, Cấp cứu/SCDF, Truyền thông, Thiệt hại tài sản, Xe cộ, Thương vong MSIG, CCTV/BWC, File đính kèm). |
| **TS-04** | Incident Log | 8 | Kiểm thử nhật ký sự cố, phân quyền ghi log (Controller vs Responder), chỉnh sửa/xóa mềm (soft-delete), đính kèm ảnh và sự kiện hệ thống. |
| **TS-05** | Responder Assignment & Milestones | 7 | Kiểm thử gán/hủy Ranger responder, quy trình chuyển trạng thái của Responder (Assigned -> Acknowledged -> On-Site -> Completed). |
| **TS-06** | Controller Responder-Status Override | 4 | Kiểm thử quyền Override trạng thái Responder từ Controller/Super Admin và tự động điền mốc thời gian (backfill timestamps). |
| **TS-07** | Return Loops | 6 | Kiểm thử luồng trả hồ sơ (Duty Manager trả Controller, Controller trả Responder) và lịch sử Endorsement. |
| **TS-08** | Closure & Endorsement | 6 | Kiểm thử trình duyệt, Force Submit, Duty Manager phê duyệt đóng sự cố, đọc chỉ (read-only) và mở lại sự cố (Reopen). |
| **TS-09** | Duplicate Detection | 4 | Kiểm thử phát hiện trùng lặp tự động (Duplicate Warning Modal), gộp/liên kết sự cố và đóng lan truyền (Cascade Closure). |
| **TS-10** | Save, Concurrency, Ageing & Ancillary | 5 | Kiểm thử Auto-save, lưu thủ công, cảnh báo xung đột chỉnh sửa đồng thời và liên kết Fault / e-Diary. |
| **TS-11** | RBAC & Permissions | 16 | Kiểm thử phân quyền chi tiết theo 8 hạt quyền (P1 - P8) trên 5 vai trò (Super Admin, Controller, Responder, Duty Officer, Duty Manager). |

---

## Chi Tiết Các Test Case (Detailed Test Cases)

### TS-01: Creation & Field Validation (Tạo & Xác Thực Trường)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-01-01** | Create an Operational Incident with all mandatory fields | **High** | Logged in as Controller. On `/incidents/new`. No Case context. | Enter Incident Title; select Incident Type and Sub-type; click Log Incident. | Title: 'Guest slip and fall at Palawan Beach'; Type: Accident; Sub-type: Slip / Trip / Fall | - Incident is created and user is redirected to the incident detail page.<br>- Status = 'Live'. Incident ID and Case ID are generated and shown read-only. | Not Run |
| **IR-01-02** | Verify Incident ID format | **High** | Logged in as Controller. An incident has just been created today. | Open the incident detail page and read the Incident ID. | Creation date = today | Incident ID matches the pattern `SEN/IR/YYYYMMDD/NNNN`, where YYYYMMDD is today's date and NNNN is a zero-padded 4-digit running number. | Not Run |
| **IR-01-03** | Case linkage on creation — new vs existing Case | **High** | Logged in as Controller. On `/incidents/new`. | A) Leave 'Create new Case' selected (no Case chosen), fill mandatory fields, submit.<br>B) Use the Case search box to select an existing open Case instead, fill mandatory fields, submit. | A) No Case context.<br>B) Existing Case ID. | A) A new Case is auto-created before the incident is initialised; Case ID is generated read-only.<br>B) The selected Case ID is attached, no new Case created. | Not Run |
| **IR-01-04** | Mandatory field validation — Title, Type, Sub-type | **High** | Logged in as Controller. On `/incidents/new`. | Submit with each of Title, Type and Sub-type left blank in turn, with the others filled. | Title / Type / Sub-type: blank, one at a time | - Submission blocked with alert: 'Incident Title is required.' / 'Incident Type is required.' / 'Incident Sub-Type is required.'<br>- No incident or Case created. | Not Run |
| **IR-01-05** | Type → Sub-type dependency (configured in Taxonomy) | **Medium** | Logged in as Controller. On `/incidents/new`. Incident Type/Sub-type option lists configured in Taxonomy. | A) Observe Sub-type dropdown before/after selecting Type.<br>B) Select Type A, record list, switch to Type B.<br>C) Open Sub-type list and select 'Others'. | Type A vs Type B per Taxonomy; Sub-type: Others | A) Sub-type disabled until Type chosen.<br>B) Sub-type list refreshes dynamically per Taxonomy, clearing prior selection.<br>C) 'Others' fallback available and saves successfully. | Not Run |
| **IR-01-06** | Date/Time of Incident and Priority — defaults and edge dates | **High** | Logged in as Controller. On `/incidents/new`. | A) Observe Date/Time and Priority on fresh form.<br>B) Set Date/Time 30 days in past and submit.<br>C) Set Date/Time 1 day in future and submit. | Backdate: -30 days; Forward date: +1 day | A) Date/Time defaults to system current date/time; Priority defaults to 'Normal'.<br>B) Backdated incident saves correctly.<br>C) No error unless future-date guard is configured. | Not Run |
| **IR-01-07** | System-set fields on creation — Created By, initial Status | **Medium** | Logged in as a named Controller. | Create an incident with no Responder assigned; open detail page and check Created By and Status. | Active session user | - Created By shows authenticated user (read-only).<br>- Initial Status = 'Live' with no Responder rows. | Not Run |
| **IR-01-08** | Reporter's Name and Requested By are optional | **Medium** | Logged in as Controller. On `/incidents/new`. | Leave Reporter's Name and Requested By blank; fill mandatory fields; submit. | Reporter's Name / Requested By: blank | - Incident saves successfully.<br>- Both fields display empty on detail page with no validation error. | Not Run |

---

### TS-02: Location Particulars (Thông Tin Vị Trí)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-02-01** | All location fields are optional | **Medium** | Logged in as Controller. On `/incidents/new`. Location option lists configured in Location Hierarchy. | Leave all location fields blank; fill mandatory General Information fields; submit. | All location fields blank | Incident saves with no validation error on the Location section. | Not Run |
| **IR-02-02** | Postal code search — resolved vs unresolvable | **High** | Logged in as Controller. On `/incidents/new`. | A) Enter a valid Sentosa postal code and trigger address search.<br>B) Enter a postal code that does not resolve. | A) 098269<br>B) 999999 | A) Mini-map renders with pin at resolved address; Lat/Lng populated.<br>B) Clear 'address not found' message shown; form remains submittable. | Not Run |
| **IR-02-03** | Postal Code defaults to 000000 | **High** | Logged in as Controller. On `/incidents/new`. | A) Drop a pin manually on mini-map at location with no standard address, submit.<br>B) Leave Postal Code blank and submit. | A) Pin: Palawan Beach shoreline.<br>B) Postal Code: blank | Both save with Postal Code = '000000'. In (A), lat/lng from dropped pin are stored on record. | Not Run |
| **IR-02-04** | Location Tags are saved and usable as a filter | **Medium** | Logged in as Controller. Location Tags configured in Location Hierarchy. | Select two or more Location Tags on creation, submit, then filter Incident log list by one of those tags. | Tags: 'Beach Zone', 'Siloso' | Both tags persist on record and incident is returned when filtering list view by either tag. | Not Run |
| **IR-02-05** | Location renders on detail page and Island Map | **Medium** | Logged in as Controller. Incident created with full location details and resolved coordinates. | A) Open incident detail page and read Location Particulars card.<br>B) Open 2D Island Map, enable Incidents layer, locate pin. | Resolved location coordinates | A) Road, Building, Common Name, Lat/Lng display in left column.<br>B) Drop-pin renders on map at coordinates; clicking pin links to incident. | Not Run |

---

### TS-03: Optional Particulars (Thông Tin Chi Tiết Phụ)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-03-01** | Police at Scene — fields surface, persist, all optional | **Medium** | Logged in as Controller. Incident detail page, Emergency Services section. | Tick 'Police at Scene', fill Officer Name/Rank, Police Incident No, Classification, Responding Unit, save/reload; repeat leaving sub-fields blank. | Officer: 'Sgt Tan', Police Incident No: 'P/2026/00123' | - Fields surface only after ticking; entered values persist after reload.<br>- Saving with blank sub-fields succeeds without error. | Not Run |
| **IR-03-02** | Ambulance / SCDF entry | **Medium** | Logged in as Controller. Incident detail page, Emergency Services section. | A) Select Type = Ambulance, fill Officer Name, Call Sign, Unit, Arrival Time, Hospital Conveyed To, save.<br>B) Add SCDF entry with Call Sign & Arrival Time. | A) Hospital: 'Singapore General Hospital'<br>B) Type: SCDF | - Dropdown offers 'Ambulance' and 'SCDF'.<br>- Entry (A) persists all values.<br>- Entry (B) saves independently without Hospital field error. | Not Run |
| **IR-03-03** | Media at Scene — SDC Comms prompt | **High** | Logged in as Controller. Incident detail page, Media Involvement section. | A) Tick 'Media at Scene' and observe.<br>B) Confirm SDC Comms notification action, save, check Incident Log.<br>C) Leave unticked. | commsNotified: true | A) Media Name field appears with prompt to notify SDC Comms.<br>B) System log entry appended: 'SDC Communications Team notified regarding media presence.'<br>C) No prompt shown. | Not Run |
| **IR-03-04** | SDC Property Damaged — description and linked Fault | **Medium** | Logged in as Controller. Active incident, Property and Vehicles section. | Tick 'SDC Property Damaged', enter damage description, save/reload; use 'Create Fault' from record. | Description: 'Railing bent at Beach Station walkway' | - Description field optional, persists after reload.<br>- Fault record created, linked to incident, visible in detail view, CMMS workflow initiated. | Not Run |
| **IR-03-05** | SDC Vehicle Involved — full sub-form, multiple vehicles | **Medium** | Logged in as Controller. Incident detail page. | Tick 'SDC Vehicle Involved', fill Model, Number, Driver Name, Contact, Licence, Address, Remarks, save/reload; add second vehicle. | Vehicle No: 'SBA1234X' | - All 7 fields optional and persist.<br>- Second vehicle retained as separate row alongside first. | Not Run |
| **IR-03-06** | Persons Involved — attributes and multiple entries | **Medium** | Logged in as Controller. Persons Involved section. | Add person with Guest/non-Guest, Type, Name, Address, Age, Gender, Contact, Role, save/reload; add two more persons. | Type: Guest, Role: 'Victim', Age: 34; plus witness & bystander | - Every attribute persists.<br>- Dropdown offers Guest, Staff, Island Partner/Contractor, Resident, Others.<br>- Rows persist independently. | Not Run |
| **IR-03-07** | Personal Injuries — MSIG and Under-16 sub-form | **High** | Logged in as Controller. Person Involved row exists. | A) Tick Injury Details.<br>B) Tick 'MSIG Form Issued', enter serial number, save.<br>C) Tick Under-16 indicator.<br>D) Untick Under-16 after entering parent details, save. | Serial: 'MSIG-2026-0087'; Age: 12 | A) Personal Injuries sub-form surfaces.<br>B) Serial Number field appears and persists.<br>C) Parent/Guardian Name & Contact surface.<br>D) Parent fields hidden. | Not Run |
| **IR-03-08** | CCTV and Body Worn Camera — multiple entries | **Medium** | Logged in as Controller. CCTV and BWC section. | Add two CCTV entries (Camera No, VMS Timestamp, Bookmark) and two BWC entries (BWC No, Timestamp), save and reload. | CAM-014/CAM-021; BWC-007/BWC-011 | - Both CCTV and BWC entries persist as separate rows.<br>- Accordion badges reflect counts, e.g. `[2 CAM] / [2 BWC]`; empty sections show `[None]`. | Not Run |
| **IR-03-09** | Attachments — upload and remove | **Medium** | Logged in as Controller. Attachments section. | Upload a .jpg, .mp4 and .pdf, save/reload; delete one attachment before saving and second after save/reload. | 3 mixed-type files (.jpg, .mp4, .pdf) | All three files upload, list by name, remain available after reload. Deleted attachments are removed and do not reappear. | Not Run |
| **IR-03-10** | Summary rich-text field | **Medium** | Logged in as Controller. Incident detail page. | Enter formatted text in Summary field, save/reload, confirm layout positioning. | Multi-paragraph summary text | - Content persists with formatting intact, positioned below Personal Injuries.<br>- Field is optional. | Not Run |

---

### TS-04: Incident Log (Nhật Ký Sự Cố)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-04-01** | Add a log entry — numbering and sort order | **High** | Logged in as Controller. Active incident with 3 existing log entries. | Enter an event description and submit; then add an entry with custom event date/time earlier than existing row. | Description: 'Guest escorted to first aid post'; custom time -30m | New row appended with sequential Event Number. Log renders in chronological order by date/time, not insertion order. | Not Run |
| **IR-04-02** | Log entry attribution — Controller vs Responder | **High** | Active incident. Logged in as named Controller for entry 1, assigned Responder for entry 2. | Add manual log entry as Controller; separately, log activity update as Responder. | Controller: 'Called SDCF'; Responder: '[Ranger Log]' | Controller entry prefixed `[MANUAL]` and suffixed `— by <username>`. Responder entry keeps `[Ranger Log]` verbatim without wrapper. | Not Run |
| **IR-04-03** | Log entry description is mandatory | **High** | Logged in as Controller. Active incident. | Submit a log entry with an empty description. | Description: blank | Request rejected with HTTP 400 'description is required'. No row appended. | Not Run |
| **IR-04-04** | Edit a log entry | **High** | Logged in as Controller. Active incident with existing manual log entry. | Edit entry description and save; call edit-log with non-existent eventNumber. | New description text; eventNumber: 9999 | - Description updates preserving `[MANUAL]` framing.<br>- Entry flagged edited (`editedBy`/`editedAt` displayed).<br>- Non-existent ID returns HTTP 404. | Not Run |
| **IR-04-05** | Deleting a log entry is a soft delete | **High** | Logged in as Controller. Active incident with existing manual log entry. | Delete entry and inspect stored record in database. | Event ID | - Entry flagged deleted (`deletedBy`/`deletedAt` recorded).<br>- Row retained for audit, event numbering not re-sequenced. | Not Run |
| **IR-04-06** | Log editability and visibility by status | **High** | Incidents at 'Live', 'Live (Assigned)', 'Returned', 'Pending Endorsement', 'Closed'. | At each status, attempt to add/edit/delete log entry as Controller and Responder; view as Duty Manager during endorsement. | 5 statuses | - Add/edit/delete succeed at Live, Live (Assigned), Returned.<br>- Controls hidden/disabled (view-only) at Pending Endorsement and Closed.<br>- Duty Manager views all entries. | Not Run |
| **IR-04-07** | Image attachments on a log entry | **Medium** | Logged in as Controller. Active incident. | Attach images to log entry, confirm preview, remove one before submit, submit, click saved thumbnail in timeline. | .jpg and .png files | - Thumbnails preview before submit.<br>- Saved attachments render 70px thumbnails in timeline and open full-size in modal lightbox on click. | Not Run |
| **IR-04-08** | System-generated events are written to log | **High** | Logged in as Controller. Fresh incident. | Assign Responder, acknowledge, arrive on-site, submit endorsement, close as Duty Manager, read Incident Log. | Full lifecycle | Each transition writes an attributed system entry: assigned, acknowledged, on-site, submitted for endorsement, approved, and closed. | Not Run |

---

### TS-05: Responder Assignment & Milestones (Gán & Cột Mốc Responder)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-05-01** | Assign Responder(s) — single, multiple, additional | **High** | Logged in as Controller. Incident at 'Live'. | Assign one Responder; assign second Responder; add third to incident where one is already 'Acknowledged'. | 'Ranger John', 'Ranger Mei' | - Status moves 'Live' -> 'Live (Assigned)' on first assignment.<br>- Each Responder listed Active with independent status.<br>- Adding further Responder does not reset status. | Not Run |
| **IR-05-02** | Assign/remove validation — duplicate and non-assigned | **Medium** | Logged in as Controller. Incident with 'Ranger John' Active and two Active Responders. | Attempt to assign 'Ranger John' again; attempt to remove Responder who was never assigned. | addResponder: 'Ranger John'; removeResponder: 'Ranger Ali' | - Duplicate assignment returns HTTP 409 'Ranger John is already assigned...'<br>- Removing non-assigned returns HTTP 404. | Not Run |
| **IR-05-03** | Remove a Responder — allowed vs last-one blocked | **High** | Logged in as Controller. Incident with two Active Responders, then with exactly one. | Remove Responder B while A remains; attempt to remove sole remaining Responder A. | removeResponder: 'Ranger Mei', then 'Ranger John' | - With two Active, removal succeeds (B becomes 'Removed').<br>- With only one remaining, removal refused with HTTP 409 'At least one Responder must remain...'. | Not Run |
| **IR-05-04** | Bulk reassignment replaces Responder list | **Medium** | Logged in as Controller. Incident with Responders A and B Active. | Submit a bulk assignedTo array containing B and C. | assignedTo: ['Ranger Mei', 'Ranger Ali'] | A becomes 'Removed', B stays Active, C added Active at 'Assigned'. Log entry records updated list. | Not Run |
| **IR-05-05** | Responder acknowledges dispatch | **High** | Incident at 'Live (Assigned)', Responder lifecycle = 'Assigned'. | Acknowledge dispatch; attempt to acknowledge again; attempt once incident leaves active status. | Action: Acknowledge | First acknowledgement: lifecycle becomes 'Acknowledged' with `acknowledgedAt` timestamp. Incident stays 'Live (Assigned)'. | Not Run |
| **IR-05-06** | Responder notifies completion | **High** | Responders at 'Assigned', 'Acknowledged', 'On-Site' and 'Live (Incomplete)'. | Trigger notify completion from each status. | 5 statuses | All 4 active-stage statuses accepted and move Responder to 'Pending Controller Review' with `pendingReviewAt` timestamp. | Not Run |
| **IR-05-07** | Assigned Responder is notified on assignment | **High** | Logged in as Controller. Incident at 'Live'. | Assign a Responder; log in as that Responder and open notification widget. | Assigned Ranger ID | A dispatch notification for the incident is present in the notification widget for the assigned Responder. | Not Run |

---

### TS-06: Controller Responder-Status Override (Ghi Đè Trạng Thái Responder)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-06-01** | Controller forward-skips a Responder's status | **High** | Logged in as Controller. Responder lifecycle = 'Assigned'. | Set status directly to 'On-Site'; on fresh case from 'Assigned', set status directly to 'Pending Controller Review'. | status: 'On-Site', then 'Pending Controller Review' | Both succeed. All intermediate timestamps are backfilled (`acknowledgedAt` + `onSiteAt`) so downstream reporting shows no gaps. Log notes skipped stage(s). | Not Run |
| **IR-06-02** | Backward correction retains prior timestamps | **High** | Logged in as Controller. Responder lifecycle = 'On-Site' with `acknowledgedAt` and `onSiteAt` set. | Set status back to 'Acknowledged'; inspect timestamps. | status: 'Acknowledged' | Lifecycle becomes 'Acknowledged'. `acknowledgedAt` and `onSiteAt` are NOT cleared — correction does not erase history. Logged. | Not Run |
| **IR-06-03** | Who can override Responder status | **High** | Active incident with an assigned Responder. | Attempt set-responder-status as Responder themself, Duty Manager, and Super admin. | roles: Responder / Duty Manager / Super admin | - Responder & Duty Manager: blocked with 'Only a Controller can set Responder status directly'.<br>- Super admin: succeeds with same behavior as Controller. | Not Run |
| **IR-06-04** | Override blocked outside valid states | **High** | Responder lifecycle = 'Live (Incomplete)'; separately, incident at 'Pending Endorsement'. | Attempt to set status via dropdown in each case. | Invalid status target | - Responder at 'Live (Incomplete)' or 'Completed': directs to Return to Responder / Submit for Endorsement.<br>- Incident not active: HTTP 409 error. | Not Run |

---

### TS-07: Return Loops (Vòng Lặp Trả Hồ Sơ & Rework)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-07-01** | Duty Manager returns an incident | **High** | Incident at 'Pending Endorsement'; separately at 'Live (Assigned)'. | Click Return to Controller with remarks and confirm; repeat leaving remarks blank; attempt return from active status. | Remarks: 'Summary missing injury outcome — please amend.' | - With remarks: status becomes 'Returned'. Remarks stored and shown in endorsement history.<br>- Blank remarks: blocked (mandatory on Return). | Not Run |
| **IR-07-02** | Controller amends and resubmits returned incident | **High** | Logged in as Controller. Incident at 'Returned' with all Responders 'Completed'. | Edit General Info, Location, ancillary sections, add log entry, save; click Submit for Endorsement. | Amended data | All edits & new log entry persist. Status moves 'Returned' -> 'Pending Endorsement' with new entry in endorsement history. | Not Run |
| **IR-07-03** | Controller returns Responder(s) for rework | **High** | Incident with Responders A, B and C all at 'Pending Controller Review'. | Return a single Responder with Completion Remarks; separately, multi-select A and C with distinct remarks each. | Remarks per Responder differ | Selected Responder(s) become 'Live (Incomplete)' with own remark, `returnedAt`/`returnedBy` stored. Incident status stays 'Live (Assigned)'. | Not Run |
| **IR-07-04** | Returning a Responder from a Returned incident | **High** | Logged in as Controller. Incident at 'Returned' after force submit; Responder lifecycle = 'Completed'. | Open Return to Responder, select Completed Responder, enter remarks, confirm; read incident status. | Return remarks | - Responder becomes 'Live (Incomplete)'.<br>- Incident status moves 'Returned' -> 'Live (Assigned)' so ground response can resume. | Not Run |
| **IR-07-05** | Returned Responder can resubmit input | **High** | Responder lifecycle = 'Live (Incomplete)', incident 'Live (Assigned)'. | As that Responder, amend log per Completion Remarks and notify completion again. | Updated log entry | Lifecycle returns to 'Pending Controller Review' with `pendingReviewAt` timestamp refreshed. | Not Run |
| **IR-07-06** | Endorsement history captures every submission, return and closure | **High** | Logged in as Controller. Incident submitted, returned, resubmitted and closed. | Open Summary and Closure section and read Endorsement Submission history. | Endorsement log history | Each submission, return (with remarks), and final closure endorsement listed with actor and timestamp in order. Visible to Controller, DO, DM, Super Admin. | Not Run |

---

### TS-08: Closure & Endorsement (Đóng & Phê Duyệt Hồ Sơ)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-08-01** | Submit for Endorsement — standard and direct from-Live | **High** | Incident at 'Live (Assigned)' with Active Responders at 'Pending Controller Review'; zero Responders. | Click Submit for Endorsement in each case. | Action: Submit Endorsement | - Accepted without Force Submit prompt.<br>- Status moves to 'Pending Endorsement'. Responders set to 'Completed' with `completedAt` timestamp. | Not Run |
| **IR-08-02** | Force Submit | **High** | Incident at 'Live (Assigned)' with Responder A at 'Pending Controller Review' and B at 'Assigned'. | Click Submit for Endorsement (expect alert); confirm Force Submit without entering override remark. | force: true, no remark | UI raises confirmation dialog. Confirming Force Submit sets status to 'Pending Endorsement', Responders set to 'Completed', log records 'Incident FORCE-SUBMITTED...'. | Not Run |
| **IR-08-03** | Duty Manager approves closure | **High** | Incident at 'Pending Endorsement'; separately already 'Closed'. | Click Approve & Close, leave closure remarks blank, confirm; attempt to close already-closed incident. | Remarks: blank | - Closure succeeds (remarks optional). Status becomes 'Closed'. `closedBy`/`closedAt` recorded read-only.<br>- Re-closing returns 'Incident is already Closed.' | Not Run |
| **IR-08-04** | Closed record is read-only across all sections | **High** | Logged in as Controller. Incident at 'Closed'. | Attempt to edit General Information, Location, ancillary sections and Incident Log. | View Closed Incident | All edit controls hidden or disabled; only read actions and Related Actions panel remain available. | Not Run |
| **IR-08-05** | Case auto-closure | **High** | Incident at 'Pending Endorsement' with no open Tasks/Faults in Case; separately with 1 open Task. | Approve & Close incident in each case; open parent Case. | Scenario 1: 0 open sub-records.<br>Scenario 2: 1 open Task. | - Scenario 1: Case auto-closes with own closure timestamp.<br>- Scenario 2: Incident closes but Case stays Active, Controller prompted to resolve Task. | Not Run |
| **IR-08-06** | Reopen a closed incident | **High** | Incident at 'Closed' in a Closed Case. | As Super admin, click Reopen Incident; as Controller/Duty Manager, attempt same; as Super admin, attempt to reopen non-closed. | roles: Super admin / Controller / Duty Manager | - Super admin: status resets to 'Live', `closedAt`/`closedBy` cleared, Case returns to Active.<br>- Controller/Duty Manager: blocked. | Not Run |

---

### TS-09: Duplicate Detection (Phát Hiện Trùng Lặp)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-09-01** | Duplicate warning triggers | **High** | Open incident exists with Type = Accident, Sub-type = Slip / Trip / Fall. | Create new incident of same Type/Sub-type 30m later (expect warning); repeat: 3h apart, different Type, matching Closed, backdated. | Same Type+Sub-type at 30 min / 3 hrs; different Type; Closed candidate; backdated -1 day | - Within 2h of same Type/Sub-type open candidate: 'Possible Duplicate Detected' modal lists matching incident(s).<br>- No modal when >2h, different Type, candidate Closed, or backdated. | Not Run |
| **IR-09-02** | Resolving the duplicate prompt | **High** | Logged in as Controller. Duplicate modal displayed with one candidate. | Choose 'Proceed / Create anyway' on one attempt; on another, click 'Link as Duplicate of <IncidentID>'. | Decision selection | - Proceed anyway: new independent incident created at 'Live'.<br>- Link as duplicate: `isDuplicate=true`, `masterIncidentId` set, auto-closes with remark 'Linked as duplicate...', appears under Duplicate Reports. | Not Run |
| **IR-09-03** | Closing master incident cascades closure to all linked duplicates | **High** | Logged in as Duty Manager. Master incident at 'Pending Endorsement' with two linked duplicates. | Approve & Close the master incident; open each linked duplicate record. | 2 linked duplicates | All linked duplicates show status Closed; master's Duplicate Reports section reflects closed state for every slave. | Not Run |
| **IR-09-04** | Duplicate check tolerates API failure without blocking creation | **Low** | Logged in as Controller. Duplicate check endpoint unavailable (simulate 500 error). | Create an incident that would normally match a candidate and submit. | Endpoint 500 error simulation | Creation proceeds normally with no modal and no blocking error surfaced to Controller (graceful degradation). | Not Run |

---

### TS-10: Save, Concurrency, Ageing & Ancillary (Lưu Tự Động, Đồng Thời & Liên Kết)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-10-01** | Auto-save | **High** | Logged in as Controller. Incident detail page in edit mode. Default interval = 60s. | Make an edit, do not save, wait past interval, reload; as Super admin, change interval to 30s in System Settings and repeat. | Interval: 60s, then 30s | Edit persists without manual save at configured interval in both cases. Interval is admin-configurable, logged in audit log. | Not Run |
| **IR-10-02** | Manual save and unsaved-changes indicator | **High** | Logged in as Controller. Incident detail page in edit mode. | Make an edit and click Save immediately; separately, make an edit and observe header/save area without saving. | Manual edit | Manual save persists change immediately. Unsaved-changes indicator visible while unsaved and clears once saved. | Not Run |
| **IR-10-03** | Navigating away with unsaved changes prompts confirmation | **High** | Logged in as Controller. Incident detail page with unsaved edits. | Navigate to another page or close tab. | Unsaved edits present | Confirmation prompt raised; cancelling keeps edits intact, confirming discards them. | Not Run |
| **IR-10-04** | Concurrent editing | **High** | Controller A has incident open in edit mode. | As Controller B, open same incident; A edits/saves Summary, followed by B editing/saving same field. | Conflicting Summary text | B notified record is being edited by A (including identity). B's save does not discard A's input — conflict surfaced to B to resolve. | Not Run |
| **IR-10-05** | Linked Fault and e-Diary references | **High** | Logged in as Controller. Incident with linked Fault and source e-Diary entry open; separately Closed incident. | Close incident through endorsement flow, open Fault; look for Create Fault on closed incident; click Linked Fault & e-Diary refs. | Linked records | Incident closes while Fault stays open. Create Fault unavailable on closed record. Reference fields display and open corresponding detail views. | Not Run |

---

### TS-11: RBAC & Permissions (Phân Quyền Ma Trận P1 - P8)

| TC ID | Objective | Priority | Pre-condition | Test Steps | Test Data | Expected Result | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **IR-11-01** | Access is driven by permission set, not role label | **High** | User holds Controller role but permission set is reduced to P1 only. | Log in, open Incident module, look for Create Incident / Assign Responder / Submit for Endorsement, call APIs directly. | Permission set: P1 only | Incident list is visible but every create/manage/submit control is absent; direct API calls return HTTP 403. Role label alone grants nothing. | Not Run |
| **IR-11-02** | Any of 8 permissions can be granted/revoked from any role | **High** | Logged in as Super admin. Controller role on default preset. | Grant P5 to Controller and save; revoke P3 from Controller and save; verify Create Incident before/after. | Grant P5, revoke P3 on Controller | All 8 permissions configurable for every role. Granting P5 gives execution actions. Revoking P3 hides Create Incident and API returns HTTP 403. | Not Run |
| **IR-11-03** | Only Super admin can access Role & Permission config | **High** | Controller, Responder, DO, DM on default presets; Super admin user. | As each of 4 non-admin roles, look for Admin > Role & Permission in nav, call endpoint directly; check as Super admin. | 4 non-admin roles vs Super admin | For non-admin roles, nav entry absent and API returns HTTP 403. Only Super admin can view/access Role and Permission configuration screen. | Not Run |
| **IR-11-04** | Permission change takes effect without recreating account | **Medium** | User session active while Super admin changes permission set of user's role. | Change user's permissions; in user's live session, refresh and retry affected action. | Permission update | New permission state applies on refresh (page reload vs re-login per confirmed build behavior). | Not Run |
| **IR-11-05** | Permission changes are written to audit log | **Medium** | Super admin about to change permission set. | Grant and then revoke a permission for a role; open Admin audit log. | Grant/Revoke action | Each grant/revoke is recorded with acting Super admin, target role, permission changed, before/after state, and timestamp. | Not Run |
| **IR-11-06** | Default preset per role matches approved baseline matrix | **High** | Fresh environment, no custom configuration. | Open each of 5 roles and record permissions enabled by default; compare to baseline. | Baseline matrix check | Super Admin = P1-P8. Controller = P1,P2,P3,P4,P6. Responder = P1,P5. Duty Officer = P1,P2,P4,P6. Duty Manager = P1,P2,P4,P7. | Not Run |
| **IR-11-07** | Ungranted permission is blocked in UI and API | **High** | Any user missing any one of 8 permissions. | For each permission, take user without it, confirm control absent in UI, call API directly. | All 8 permissions | Every ungranted permission enforced twice — control not rendered AND API returns HTTP 403. | Not Run |
| **IR-11-08** | P1 View Incident module | **High** | User with P1 granted; same check with P1 revoked. | Log in and inspect nav and Incident tab; navigate directly to incident list URL with P1 revoked. | P1 granted / revoked | Granted: Incident tab present and opens list. Revoked: tab absent and direct URL access refused with authorization error. | Not Run |
| **IR-11-09** | P1 default scope | **High** | User holds P1 but not P2, with 2 incidents assigned to them and 5 to others. | Open Incident module and read default list without changing filters; click into assigned incident. | 2 own / 5 others | Only 2 own incidents listed by default (other 5 not returned in API). Assigned incident opens in read mode; execution actions require P5. | Not Run |
| **IR-11-10** | P2 View all Incidents | **High** | User with P2 granted, 7 incidents across mixed assignees; user without P2. | With P2, switch to All tab; without P2, look for All tab and attempt direct URL/API access to non-assigned incident. | 7 incidents, mixed assignees | With P2: all 7 listed regardless of assignment. Without P2: no All tab, direct access returns HTTP 403. | Not Run |
| **IR-11-11** | P3 Log Incident reports | **High** | Default holders: Super admin, Controller. Non-holders: Responder, DO, DM. | With P3, click Create Incident and submit mandatory fields; without P3, look for button and POST directly to endpoint. | Default holders vs non-holders | With P3: incident created at 'Live' with Case. Without P3: button absent, direct POST returns HTTP 403. | Not Run |
| **IR-11-12** | P4 Manage Responder assignments | **High** | User with P4 granted, incident at 'Live'; user without P4 (Responder default preset). | With P4: assign/reassign Responder, mark false alarm, add log entry, return to assignee, edit header. Without P4: attempt all 5. | P4 granted vs revoked | With P4: all 5 actions succeed. Without P4: none of 5 controls render and each API call returns HTTP 403. | Not Run |
| **IR-11-13** | P5 Assignee execution | **High** | Responder holding P5 assigned at 'Live (Assigned)'; DO/DM without P5; Controller with P5 configured. | As Responder, run acknowledge -> on-site -> log entry -> edit -> notify completion. Controller with P5: acknowledge & mark arrival on-behalf. | Config exception: Controller + P5 | Responder with P5: all 5 succeed. Without P5: HTTP 403. Controller with P5: actions succeed and log attributes Controller (on-behalf-of). | Not Run |
| **IR-11-14** | P6 Submit for endorsement | **High** | Controller & DO on default presets (hold P6); DM on default preset (no P6). | As Controller, then as DO, click Submit for Endorsement; as DM, look for button and call submit API directly. | P6 holders vs DM | Controller & DO: action available, incident moves to 'Pending Endorsement'. DM: button absent, API returns HTTP 403 (DM reviews, doesn't raise). | Not Run |
| **IR-11-15** | P7 Review submitted incident | **High** | DM on default preset (holds P7); Controller & DO on default presets (no P7). Incident at 'Pending Endorsement'. | As DM, close incident; separately return with remarks. As Controller/DO, look for Close/Return and call APIs directly. | Remarks: 'Please attach CCTV reference.' | DM: Close sets to Closed; Return sends back to manage-assignments with remarks. Controller/DO: controls not rendered, API returns HTTP 403. | Not Run |
| **IR-11-16** | Duty Manager who edited record then endorses closure | **Medium** | Duty Manager on default preset, holding both P4 and P7. | As DM, edit incident record and add log entry; have Controller submit for endorsement; as same DM, close it. | Same DM edits and endorses | Per baseline preset this succeeds. Flagged for BA decision — DM endorsing content they themselves authored (Open Item #3). | Not Run |

---

## Tóm Tắt Phủ Kiểm Thử (Coverage Matrix)

- **Tổng số Test Cases:** 66 Test Cases (`IR-01-01` đến `IR-11-16`)
- **Phân bổ theo Độ ưu tiên (Priority):**
  - **High Priority:** 47 Test Cases (Bao gồm các luồng chính, xác thực dữ liệu quan trọng, RBAC và vòng lặp chuyển trạng thái).
  - **Medium Priority:** 18 Test Cases (Bao gồm các trường mở rộng optional particulars, UI/UX indicators, auto-save).
  - **Low Priority:** 1 Test Case (`IR-09-04`: Duplicate check API failure tolerance).
- **Hạt quyền RBAC (P1 - P8 Baseline):**
  - **P1:** View Incident module (Scope cá nhân vs Hệ thống)
  - **P2:** View all Incidents (Xem tất cả sự cố)
  - **P3:** Log Incident reports (Tạo báo cáo sự cố)
  - **P4:** Manage Responder assignments (Gán & quản lý Responder)
  - **P5:** Assignee execution (Ranger thực thi các mốc công việc)
  - **P6:** Submit for endorsement (Trình duyệt đóng sự cố)
  - **P7:** Review submitted incident (Duty Manager thẩm định & đóng sự cố)
  - **P8:** Role & Permission Configuration (Cấu hình quyền - Chỉ dành cho Super Admin)
