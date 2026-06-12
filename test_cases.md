# Manual Test Suite - SDC Incident Management & Scenario Playground

This document provides step-by-step manual testing scripts for verifying the Incident Details Refactoring, the Incident Lifecycle Showcase, and the SOP Scenario Playground Library in compliance with SDC Functional Specifications (FSD).

---

## 1. Incident Detail Page Refactoring & UX Test Cases

### TC-01: Core Particulars & Location Visibility
* **FSD Section:** 5.1 & 5.2 General Information & Location Fields
* **Objective:** Ensure core details are always visible on the left information column.
* **Pre-conditions:** Navigate to any active Incident Detail page (e.g. `/incidents/SEN/IR/20260605/0001`).
* **Test Steps:**
  1. Verify the left-hand column displays a card containing "Incident Overview" (ID, Type, Status, Reporter).
  2. Verify the same column displays a card containing "Location Particulars" (Road, Building, Common Name, Lat/Lng).
  3. Ensure there is no expand/collapse toggle for these core cards (always visible).
* **Expected Result:** Core details are visible immediately upon page load without user interaction.

### TC-02: Accordion Badges (Data-at-a-Glance)
* **FSD Section:** 5.3.x Optional Particulars Modules
* **Objective:** Verify accordion headers display counts/summaries of their contents.
* **Pre-conditions:** Incident has populated BWC, Emergency Services, and Injuries records.
* **Test Steps:**
  1. Look at the accordion group on the left information panel.
  2. Confirm the **CCTV & BWC** header displays a badge, e.g., `[1 CAM / 1 BWC]`.
  3. Confirm the **Personal Injuries** header displays a badge, e.g., `[1 Injured]`.
  4. Confirm the **Duplicate Reports** header displays a badge, e.g., `[1 DUP]`.
  5. Confirm empty sections display a `[None]` badge.
* **Expected Result:** Accordion badges accurately reflect child record counts.

### TC-03: Log Entry Image Upload & Preview (Base64)
* **FSD Section:** 5.3.7 Log Attachments
* **Objective:** Verify users can attach image files, preview them, and delete them before saving.
* **Pre-conditions:** User is logged in as an authorized Controller or Ranger.
* **Test Steps:**
  1. Click inside the activity update text area.
  2. Click the **Attach Image** button.
  3. Select one or more `.jpg` or `.png` files.
  4. Confirm that image thumbnails render below the text area.
  5. Hover over a preview thumbnail and click the `✕` delete trigger.
  6. Confirm that the deleted thumbnail disappears.
* **Expected Result:** Files convert to Base64 data URLs, display previews, support deletes, and persist upon submit.

### TC-04: Timeline Thumbnail Rendering & Lightbox Overlay
* **FSD Section:** 5.3.7 Log Attachments
* **Objective:** Verify saved log attachments render in the timeline and open in full-size viewports.
* **Pre-conditions:** Incident Log event has one or more attached images saved.
* **Test Steps:**
  1. Scroll down the center chronological timeline feed.
  2. Locate the timeline bubble containing the image attachments.
  3. Verify the image is rendered as a clean 70px square thumbnail.
  4. Click on the thumbnail.
  5. Verify that a modal lightbox overlay opens, displaying the image at full size.
  6. Click the close button (`✕`) or outside the image to dismiss the lightbox.
* **Expected Result:** Thumbnails render in timeline bubbles and expand to high-res overlays on click.

### TC-05: Media Presence Alert & Comms Notification Prompt
* **FSD Section:** 5.3.5 Media Involvement
* **Objective:** Verify media alerts prompt Controller actions.
* **Pre-conditions:** Navigate to `/incidents/...`.
* **Test Steps:**
  1. Open the **Media & Press** accordion section on the left.
  2. Check the box **Press/Media present at scene**.
  3. Verify that a red warning banner appears at the top: *"Media Alert: Press/media present at scene. SDC Communications notified."*
  4. Verify the checkbox prompt *"SDC Comms Notified"* is displayed with warning text.
* **Expected Result:** Confirming media presence triggers a visible warning banner and action checklist.

### TC-06: Personal Injuries Under-16 Parental Fields Toggle
* **FSD Section:** 5.3.6 Personal Injuries
* **Objective:** Verify minor indicator triggers guardian sub-forms.
* **Pre-conditions:** Open **Personal Injuries** accordion section.
* **Test Steps:**
  1. Enter minor details (e.g. Age = 12).
  2. Check the box **Injured Person is Under-16**.
  3. Confirm that "Parent / Guardian Name" and "Parent / Guardian Contact" fields are conditionally rendered.
  4. Uncheck the box and verify the fields disappear.
* **Expected Result:** Under-16 check dynamically controls guardian metadata forms.

### TC-07: High-Density Related Actions for Closed Incidents
* **FSD Section:** 6.3 Case & Incident Closure Actions
* **Objective:** Verify closed incidents render related operational log shortcuts.
* **Pre-conditions:** Incident status is `Closed` (e.g. `SEN/IR/20260612/9001`).
* **Test Steps:**
  1. Open the detail page.
  2. Verify that the right-side Action Panel displays "Related Operational Records".
  3. Confirm it lists: Related Tasks, Related Faults, Related Broadcasts, and Related e-Diary logs.
  4. Click any related item to trigger its review modal.
* **Expected Result:** Closed incidents render a read-only list of related items for compliance auditing.

---

## 2. Incident Lifecycle Showcase Test Cases

### TC-08: Interactive SVG Flowchart Node Selection
* **FSD Section:** 6.2 Incident Lifecycle Statuses
* **Objective:** Verify status node clicks populate the details inspector.
* **Pre-conditions:** Navigate to `/incidents/lifecycle`.
* **Test Steps:**
  1. Hover over the **Live (On-Site)** status capsule. Confirm hover scale & shadow increase.
  2. Click on the **Live (On-Site)** status node.
  3. Verify that the node is selected and highlighted with a colored border and shadow.
  4. Confirm the right-hand **Status Inspector** card updates, showing "Live (On-Site)" badge, authorized roles, triggers, and CMMS/e-Diary effects.
* **Expected Result:** Nodes are interactive and select states populate the inspector.

### TC-09: Path Filter Isolation & Pulsing Highlights
* **FSD Section:** 6.2 Incident Lifecycle Statuses
* **Objective:** Verify path selector buttons isolate and highlight transition lines.
* **Pre-conditions:** Open `/incidents/lifecycle`.
* **Test Steps:**
  1. Click **Main Happy Path**.
  2. Verify that transition arrows along the main path (Live -> Assigned -> Acknowledged -> On-site -> Completed/Incomplete -> Pending -> Closed) are colored orange/green and animate with a pulsing dash flow.
  3. Verify other transition lines (Returned, Reopened by Admin) fade to `0.2` opacity.
  4. Click **Returned Path** and verify return arrows (Pending Endorsement -> Returned -> Live) light up.
* **Expected Result:** Selecting a path isolates relevant workflow arrows and dims inactive transitions.

---

## 3. SOP Scenario Playground Library Test Cases

### TC-10: Dashboard Playground Selector & Collapsibility
* **FSD Section:** 5.1 Incident Categories
* **Objective:** Verify the scenario library playground renders on the dashboard and is collapsible.
* **Pre-conditions:** Navigate to `/incidents`.
* **Test Steps:**
  1. Confirm the card block labeled **💡 SOP Scenario Playground Library** is rendered at the top of the dashboard.
  2. Verify it displays 6 demo cards: Standard, Proactive, Backdated, Ongoing, Operational, and Returned (Missing Child).
  3. Click **COLLAPSE ▲**. Verify that the playground grid collapses.
  4. Click **EXPAND PLAYGROUND ▼**. Verify that the playground grid expands.
* **Expected Result:** Playground component is fully collapsible and lists the six target scenarios.

### TC-11: Returned Scenario: Missing Child Rework Workflow
* **FSD Section:** 6.2.1 Returned Incident & Supervisor Rework Business Flow
* **Objective:** Verify that launching the Returned demo scenario renders active return comments and allows resubmission.
* **Pre-conditions:** Navigate to `/incidents`.
* **Test Steps:**
  1. Locate the **Missing Child (Returned)** card in the playground.
  2. Click **LAUNCH DEMO →**.
  3. Confirm navigation to `/incidents/SEN/IR/20260612/9006`.
  4. Verify the status reads **Returned** with a red badge.
  5. Check the timeline for the return log event: *"Incident RETURNED by Duty Manager Gan. Reason: Please attach BWC footage bookmark..."*
  6. Verify the right action panel displays a rework console where Controller can edit details and submit.
* **Expected Result:** The Returned incident detail page correctly hydates its historical timeline and enables rework controls.

---

## 4. Category Creation & Full Lifecycle Transition Test Cases (Priority 1)

### TC-12: Create Standard Incident
* **FSD Section:** 5.1 Incident Categories & 5.2 Incident Logging Workflow
* **Objective:** Verify that a standard incident can be logged, generating an active Case with 'Live' incident status.
* **Pre-conditions:** Navigate to `/incidents/new`.
* **Test Steps:**
  1. Open the `/incidents/new` page.
  2. In the **Incident Category** dropdown, select **Standard Incident**.
  3. Select an Incident Type (e.g., **Security**) and Sub-Type (e.g., **Trespassing**).
  4. Fill in the required fields: Incident Title (e.g., "Unauthorised Entry at Siloso Fort"), Description, Location common name, and reporter details.
  5. In the "Incident Age Simulator" widget at the top, ensure **Just Created** is selected.
  6. Scroll to the bottom and click **LOG INCIDENT**.
  7. Verify the success modal appears displaying a generated Case ID (e.g. `SEN/CI/...`) and Incident ID (e.g. `SEN/IR/...`).
  8. Click **View Incident Details** (or confirm redirection to `/incidents/<Incident ID>`).
* **Expected Result:** The details page loads successfully, showing a status of **Live** (default active status) and the created Case status is **Active** (escalated from Pending Triage).

### TC-13: Create Backdated Incident
* **FSD Section:** 5.1 Incident Categories & 6.4 Backdated Incident Logging
* **Objective:** Verify that a backdated incident is automatically closed upon creation as per FSD Section 6.4 rules.
* **Pre-conditions:** Navigate to `/incidents/new`.
* **Test Steps:**
  1. Open the `/incidents/new` page.
  2. Select **Backdated Incident** from the "Incident Category" dropdown.
  3. Verify that the form conditionally renders the "Completion Remarks (Duty Manager approval notes)" field and that "Closed By" displays "System Autoclosure" and "Closed At" displays "Auto-closed on save".
  4. Enter Title (e.g., "Completed Fire Evacuation Log 05/12"), Type, Sub-type, and fill in the required fields.
  5. Under "Completion Remarks", enter "Drill completed successfully under supervisor oversight."
  6. Click **LOG INCIDENT**.
  7. Confirm success modal and click **View Incident Details**.
* **Expected Result:** The details page displays the status as **Closed** (read-only) with a banner stating the incident is locked, "Closed By" as "System Autoclosure", and "Closed At" as "Auto-closed on save".

### TC-14: Create Operational Incident (Operational Record)
* **FSD Section:** 5.1 Incident Categories - Operational Records
* **Objective:** Verify that an Operational Record can be logged without triggering a ground response workflow.
* **Pre-conditions:** Navigate to `/incidents/new`.
* **Test Steps:**
  1. Open the `/incidents/new` page.
  2. Select **Operational Record** from the "Incident Category" dropdown.
  3. Enter Title (e.g., "Planned Maintenance Power Grid B"), Type (Facilities), Sub-Type (Power Trip).
  4. Select **Just Created** in the Age Simulator.
  5. Fill in description and location.
  6. Click **LOG INCIDENT** and navigate to the details page.
* **Expected Result:** The incident details page loads with status **Live** and the category clearly indicated as **Operational Record**. Verify that no ground dispatch buttons (such as "Assign Responder") are displayed in the Workflow Console since operational records do not require active ground response.

### TC-15: Live → Assigned Transition
* **FSD Section:** 6.2 Incident Lifecycle Statuses
* **Objective:** Verify that assigning a responder to a Live incident transitions its status to Live (Assigned).
* **Pre-conditions:** Launch a Live incident (e.g., `/incidents/SEN/IR/20260612/9001` or `/incidents/SEN/IR/20260612/9002`). Ensure you are simulating the **Controller** role.
* **Test Steps:**
  1. Go to the incident details page.
  2. In the right-hand **Workflow Console**, locate the "Assign Ranger" dropdown.
  3. Select a Ranger (e.g., **Ranger John**).
  4. Click the **Assign** button.
  5. Observe the status change and check the timeline feed.
* **Expected Result:** The status transitions to **Live (Assigned)**. A timeline entry is appended: *"Responder assigned: Ranger John (by Controller). Status set to Live (Assigned)."*

### TC-16: Assigned → Acknowledged Transition
* **FSD Section:** 6.2 Incident Lifecycle Statuses
* **Objective:** Verify that the assigned Ranger can acknowledge the dispatch, transitioning status to Live (Acknowledged).
* **Pre-conditions:** Incident status is **Live (Assigned)**. Simulate the **Responder (Ranger)** role using the role selector.
* **Test Steps:**
  1. Go to the incident details page.
  2. In the right-hand **Workflow Console**, verify the **Acknowledge Dispatch** button is visible.
  3. Click **Acknowledge Dispatch**.
  4. Verify the status updates and the timeline log.
* **Expected Result:** The status transitions to **Live (Acknowledged)**. A timeline entry is appended: *"Responder Ranger John acknowledged dispatch. Status changed to Live (Acknowledged)."*

### TC-17: Acknowledged → On-Site Transition
* **FSD Section:** 6.2 Incident Lifecycle Statuses
* **Objective:** Verify that the responder arriving on-site transitions status to Live (On-Site).
* **Pre-conditions:** Incident status is **Live (Acknowledged)**. Simulate the **Responder (Ranger)** role.
* **Test Steps:**
  1. In the right-hand **Workflow Console**, click the **Arrive On-Site** button.
  2. Verify the status updates and the timeline log.
* **Expected Result:** The status transitions to **Live (On-Site)**. A timeline entry is appended: *"Responder Ranger John confirmed arrival on-site. Status changed to Live (On-Site)."*

### TC-18: On-Site → Completed Transition
* **FSD Section:** 6.2 Incident Lifecycle Statuses
* **Objective:** Verify that notifying completion of ground tasks transitions status to Live (Completed).
* **Pre-conditions:** Incident status is **Live (On-Site)**. Simulate the **Responder (Ranger)** role.
* **Test Steps:**
  1. In the right-hand **Workflow Console**, click the **Notify Completion** button.
  2. In the modal popup, enter completion remarks: "Ground cleared of hazards. Safe for public access."
  3. Click **Submit Completion**.
  4. Verify the status updates and the timeline log.
* **Expected Result:** The status transitions to **Live (Completed)**. A timeline entry is appended: *"Responder Ranger John marked ground activities completed. Remarks: Ground cleared of hazards. Safe for public access. Status changed to Live (Completed)."*

### TC-19: Completed → Pending Endorsement Transition
* **FSD Section:** 6.2 Incident Lifecycle Statuses & 6.2.1 Approval Workflow
* **Objective:** Verify that a Controller submitting a completed incident transitions status to Pending Endorsement.
* **Pre-conditions:** Incident status is **Live (Completed)**. Simulate the **Controller** role.
* **Test Steps:**
  1. Verify the right-hand **Workflow Console** displays the **Submit for Endorsement** button.
  2. Click **Submit for Endorsement**.
  3. Verify status updates and timeline logs.
* **Expected Result:** The status transitions to **Pending Endorsement**. A timeline entry is appended: *"Incident submitted for Duty Manager endorsement by Controller."*

### TC-20: Pending Endorsement → Closed Transition
* **FSD Section:** 6.2 & 6.3 Case & Incident Closure Actions
* **Objective:** Verify that a Duty Manager endorsing/approving the incident transitions status to Closed.
* **Pre-conditions:** Incident status is **Pending Endorsement**. Simulate the **Duty Manager** role.
* **Test Steps:**
  1. In the right-hand **Workflow Console**, locate the "Review / Endorsement Remarks" text area.
  2. Enter approval remarks: "Closure approved. Standard operating procedure followed."
  3. Click the **Approve & Close Incident** button.
  4. Verify the status updates and timeline log.
* **Expected Result:** The status transitions to **Closed**. A timeline entry is appended: *"Incident approved and closed by Duty Manager. Closure remarks: Closure approved. Standard operating procedure followed. Record is now read-only."* The parent Case status transitions to **Closed** if no other active tasks are open.

### TC-21: Pending Endorsement → Returned Transition
* **FSD Section:** 6.2.1 Returned Incident & Supervisor Rework Business Flow
* **Objective:** Verify that a Duty Manager returning an incident for rework transitions status to Returned.
* **Pre-conditions:** Incident status is **Pending Endorsement**. Simulate the **Duty Manager** role.
* **Test Steps:**
  1. In the right-hand **Workflow Console**, locate the "Review / Endorsement Remarks" text area.
  2. Enter rework remarks: "Missing BWC footage bookmarks. Please attach and resubmit."
  3. Click the **Return to Controller** button.
  4. Verify the status updates and timeline log.
* **Expected Result:** The status transitions to **Returned**. A timeline entry is appended: *"Incident returned to Controller by Duty Manager. Reason: Missing BWC footage bookmarks. Please attach and resubmit."*

### TC-22: Returned → Live Transition
* **FSD Section:** 6.2.1 Returned Incident & Supervisor Rework Business Flow
* **Objective:** Verify that a Controller reworking and resubmitting a Returned incident initiates the approval loop.
* **Pre-conditions:** Incident status is **Returned**. Simulate the **Controller** role.
* **Test Steps:**
  1. Locate an incident in the **Returned** state (e.g., the preloaded `CASE-DEMO-RETURNED`).
  2. Verify that the record is unlocked for modifications (Rework Console is editable).
  3. Enter rework updates or attach log notes to satisfy the Duty Manager's return comments.
  4. In the Workflow Console, click **Submit for Endorsement**.
* **Expected Result:** The incident undergoes rework and transitions to **Pending Endorsement** for final verification, indicating it has successfully transitioned through the rework lifecycle back into the active review loop.

### TC-23: Closed → Reopened Transition
* **FSD Section:** 6.2 Incident Lifecycle Statuses & 6.2.2 Admin Reopening
* **Objective:** Verify that an administrator can reopen a Closed incident, returning it to Live status.
* **Pre-conditions:** Incident status is **Closed** (e.g. `CASE-DEMO-STANDARD`). Simulate the **System Administrator** role.
* **Test Steps:**
  1. Navigate to the detail page of the Closed incident.
  2. Scroll down to the right-hand **Workflow Console**.
  3. Verify the **Reopen Incident** button is visible (only available under the System Administrator role).
  4. Click the **Reopen Incident** button.
  5. Check the timeline and status badge.
* **Expected Result:** The status transitions back to **Live** and the parent Case status transitions to **Active**. A timeline entry is appended: *"Incident reopened by System Administrator. Status reset to Live."*

---

## 5. FSD SLA & Advanced Operational Rule Test Cases (Priority 2)

### TC-24: 45 Minute Crisis Review
* **FSD Section:** 5.5 Crisis Level Review SLA
* **Objective:** Verify that incidents open for 45 minutes or longer display a Crisis Level Review reminder banner.
* **Pre-conditions:** Navigate to `/incidents/new`.
* **Test Steps:**
  1. In the **Incident Category** dropdown, select **Standard Incident**.
  2. Under the **Incident Age Simulator** section, select the **45 mins ago** simulation button.
  3. Observe that a yellow info banner immediately appears stating: *"Crisis Level Review: This incident has been open for 45 minutes. Please review and confirm the Crisis Level."*
  4. Fill in the required fields and click **LOG INCIDENT**.
  5. Navigate to the details page of the newly logged incident.
  6. Confirm that the top alert banner displays: *"Crisis Review Reminder: Review crisis level (Level 4) as 45 minutes have elapsed since logging..."*
* **Expected Result:** A Crisis Level Review reminder is rendered on both the creation wizard and the incident details page once 45 minutes have elapsed since logging.

### TC-25: 12 Day Ageing
* **FSD Section:** 5.5.2 SLA Ageing Alerts
* **Objective:** Verify that incidents active for 12 to 13 consecutive days display a Day 12 Warning banner.
* **Pre-conditions:** Navigate to `/incidents/new`.
* **Test Steps:**
  1. In the **Incident Category** dropdown, select **Standard Incident**.
  2. Under the **Incident Age Simulator** section, select the **12 days ago** simulation button.
  3. Observe that the orange warning banner immediately appears stating: *"Incident Ageing Alert: This incident has remained active for 12 consecutive days. Please review and update status."*
  4. Fill in the required fields and click **LOG INCIDENT**.
  5. Navigate to the details page of the newly logged incident.
  6. Confirm that the top alert banner displays: *"Day 12 Warning: Incident has been open for 12 days. Please expedite review."*
* **Expected Result:** A Day 12 Warning banner is rendered on both the creation wizard and the incident details page for active incidents that have aged for 12 consecutive days.

### TC-26: 14 Day Escalation
* **FSD Section:** 5.5.2 SLA Ageing Alerts
* **Objective:** Verify that incidents active for 14 or more consecutive days display a Day 14 Escalation critical banner.
* **Pre-conditions:** Navigate to `/incidents/new`.
* **Test Steps:**
  1. In the **Incident Category** dropdown, select **Standard Incident**.
  2. Under the **Incident Age Simulator** section, select the **15 days ago** simulation button.
  3. Fill in the required fields and click **LOG INCIDENT**.
  4. Navigate to the details page of the newly logged incident.
  5. Confirm that the red critical alert banner displays: *"Day 14 Escalation: Critical status. Incident has been open for 15 days. Escalated to Management."*
* **Expected Result:** Active incidents remaining open for 14 or more days trigger a red Day 14 Escalation banner on the details page.

### TC-27: Duplicate Incident Linking & Cascade Closure
* **FSD Section:** 5.7 Duplicate Incident Detection and Handling
* **Objective:** Verify that duplicate incidents can be linked to a Master Incident, and closing the Master Incident automatically cascades closure to all linked duplicates.
* **Pre-conditions:** Navigate to the details page of an active Master Incident (e.g., `/incidents/CASE-DEMO-STANDARD`).
* **Test Steps:**
  1. Expand the **Duplicate Reports** accordion on the left panel.
  2. Verify that it displays linked duplicates, e.g., `[1 DUP]`.
  3. Simulate the **Duty Manager** role.
  4. In the right-hand **Workflow Console**, advance the Master Incident status through to **Pending Endorsement** and click **Approve & Close Incident**.
  5. Navigate to the details page of the linked duplicate incident.
  6. Verify its status is now changed to **Closed** (read-only) with a log entry indicating auto-closure.
* **Expected Result:** Closing the Master Incident automatically cascades closure to all linked duplicate records.

### TC-28: Operational Record No Broadcast
* **FSD Section:** 5.1 & 9.6 Broadcast Matrix
* **Objective:** Verify that logging an Operational Record bypasses all broadcast triggers.
* **Pre-conditions:** Navigate to `/incidents/new`.
* **Test Steps:**
  1. Create an incident with the category **Operational Record**.
  2. Click **LOG INCIDENT** and view details.
  3. Walk the incident through the completion and endorsement flow until it is closed by the Duty Manager.
  4. Verify that the "Broadcasts" accordion badge remains `[None]` and no closure broadcast notifications are triggered.
* **Expected Result:** Operational records are strictly administrative and bypass all broadcast matrix triggers.

### TC-29: Operational Record No Ground Response
* **FSD Section:** 5.1 Incident Categories - Operational Records
* **Objective:** Verify that an Operational Record bypasses the Ranger ground response dispatch and does not generate active dispatch actions.
* **Pre-conditions:** Log an incident with category **Operational Record**. Open the details page.
* **Test Steps:**
  1. Simulate the **Controller** role.
  2. Examine the right-hand **Workflow Console**.
  3. Verify that the "Assign Ranger" dropdown and dispatcher actions are not shown.
  4. Simulate the **Responder (Ranger)** role.
  5. Verify that no dispatch acknowledgment or arrival actions are available.
* **Expected Result:** Operational records bypass active ground response workflows, leaving the incident in a state where it can be directly submitted for endorsement or closed without a ground-dispatched ranger sequence.

