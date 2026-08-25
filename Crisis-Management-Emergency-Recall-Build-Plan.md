# Crisis Management & Emergency Recall — Build Plan

**Project:** Sentosa (sts-bnk)
**Prepared by:** Kyle (BA)
**Version:** v1.1 — 2026-08-01 (revised after internal review; see Appendix B for changes)
**Status:** Draft — pending stakeholder confirmation on open items (Section 11)
**Source:** FSD Section 11.5 — Recall Groups

---

## 1. Scope decisions (locked for Phase 1)

| # | Decision | Rationale |
|---|---|---|
| D1 | Crisis dispatch requires **explicit DM review and approval**. No auto-dispatch, no timeout, no backup approver. | Deliberately deferred to a later phase. |
| D2 | Crisis record remains in `PENDING_REVIEW` indefinitely until a DM acts. | Consequence of D1. |
| D3 | Recall Groups are a **separate entity** from Broadcast distribution groups (FSD 11.5.d). UI pattern may be reused; data model must not be shared. | Explicit in FSD. |
| D4 | Member changes during an active crisis operate on a **snapshot**, not the master recall group. | Prevents permanent corruption of master data. Confirmation pending (Q2). |

### Accepted risk — to be recorded in the project risk log

> If no Duty Manager is online, crisis notification will not be dispatched. There is no compensating mechanism in the system. Mitigation is operational — Ops must guarantee an on-duty DM at all times. **Ops to confirm this matches their actual shift coverage.**

Two low-cost mitigations included in Phase 1 despite D1:

- The pending crisis record is visible to **all users holding the DM role**, not a single named DM.
- The crisis queue displays a **live pending duration** per record.

Neither introduces escalation logic; both are visibility only.

---

## 2. Feature decomposition — 5 modules

| # | Module | Purpose | Primary user |
|---|---|---|---|
| M1 | Crisis Configuration | Master data and rules, set up before any crisis occurs | System Administrator |
| M2 | Crisis Trigger & Record | Incident at level 4+ automatically creates a Crisis record | System (automatic) |
| M3 | Crisis Review & Dispatch | DM reviews, adjusts recipients, dispatches | Duty Manager |
| M4 | Dispatch Execution & Tracking | Send, track delivery, capture acknowledgement, escalate | System + DM monitoring |
| M5 | Crisis Closure & Audit | Stand down, after-action report, retention | DM / OR Analyst / Compliance |

Build order: M1 → M2 → M3 → M4 → M5.

**Exception:** the messaging-provider integration in M4 must be spiked from day 1 in parallel. It is the only component with an external dependency and the longest lead time.

---

## 3. Roles and permissions matrix

| Action | Sys Admin | Duty Manager | OR Analyst (assigned) | Other |
|---|---|---|---|---|
| Create / edit / deactivate master Recall Group | Yes | No | No | No |
| Configure templates, routing, escalation, provider | Yes | No | No | No |
| View Crisis queue | Yes | Yes | Yes | No |
| Review and dispatch crisis recall | No | Yes | No | No |
| Add / remove / update members on **active crisis** (FSD 11.5.e) | **Yes** (v1.1) | TBC | Yes | No |
| Manually re-send or mark-contacted a non-responder | No | Yes | Yes | No |
| Close / stand down crisis | No | Yes | No | No |
| View after-action report | Yes | Yes | Yes | Compliance (read-only) |

**Open item:** FSD 11.5.e names the *OR Analyst assigned to recall group operations*, not the Duty Manager. Whether DM also holds this permission is unconfirmed (Q1).

**Changed 2026-08-02 (Kyle):** the System Administrator and Current Ops Administrator now also hold the active-crisis member-edit permission. Rationale — the administrator is frequently the only person able to correct a contact record out of hours, and a recall that cannot add the one reachable person is a worse outcome than a broader permission. To be raised with Shin Feng alongside Q1, since it widens the set of roles that can alter a live recipient list and every such edit is audit-logged.

**Design instruction:** implement as a **permission flag**, not hardcoded role logic, so the answer to Q1 does not force rework.

---

## 4. Data model

### 4.1 Master data (M1)

| Entity | Key attributes |
|---|---|
| `RecallGroup` | id, name, description, status (Active / Inactive), audit fields |
| `RecallGroupMember` | group_id, person_ref, role_in_group, mobile, email, membership_status, priority/tier |
| `RecallMessageTemplate` | id, name, channel (SMS / Email / Voice), body with placeholders, applicable crisis level |
| `RecallRoutingRule` | condition set (crisis level, incident type, location/zone, time of day) → target recall group(s) + template, rule priority |
| `MessagingServiceConfig` | provider, credentials reference, sender ID, failover provider, retry policy, rate limit, quiet-hours override flag |
| `AckEscalationRule` | ack window, accepted keywords, decline handling, escalation ladder steps, reminder rules |

### 4.2 Transactional data (M2–M5)

| Entity | Key attributes |
|---|---|
| `Crisis` | id, source_incident_id, crisis_level, status, created_at, reviewed_by, reviewed_at, dispatched_at, closed_at |
| `CrisisRecallGroup` | **Snapshot copy** of the resolved recall group, scoped to a single crisis |
| `CrisisRecallMember` | Snapshot member rows. This is the entity edited under FSD 11.5.e — **never the master** |
| `Dispatch` | crisis_id, template used, channel(s), triggered_by, triggered_at, sequence (initial / re-send / escalation / **stand_down**) |
| `DispatchRecipient` | dispatch_id, member_id, channel, delivery_status, delivered_at, ack_status, ack_at, ack_method, eta, escalation_level |
| `MessageEvent` | Raw provider callbacks and inbound replies. Append-only. |
| `CrisisAuditLog` | Every state change and every member edit, with actor and timestamp |

### 4.3 Critical design rule — copy on trigger

When a Crisis record is created, the routing rules resolve the applicable recall group(s) and the system **snapshots** the member list into `CrisisRecallMember`.

Every action taken by the DM or OR Analyst during the crisis operates on the snapshot only. The master `RecallGroup` and `RecallGroupMember` records are never modified by crisis operations.

This is the single most expensive design decision to retrofit later. It must be communicated to the development team before Epic 2 begins.

### 4.4 Independence of delivery and acknowledgement

`delivery_status` and `ack_status` are **two independent fields**. They must not be collapsed into a single status column.

- Delivery is reported automatically by the SMS gateway and confirms the message reached the handset.
- Acknowledgement requires a deliberate action from the recipient and confirms they will respond.

Delivered does not imply acknowledged. Without acknowledgement, the Duty Manager cannot know how many responders are actually mobilising, which is the core purpose of a recall.

### 4.5 Routing resolution and recipient de-duplication

A single crisis may match more than one routing rule, and two recall groups may contain the same person. Both behaviours must be specified before Epic 2, or the development team will invent an answer.

| Rule | Specification |
|---|---|
| **Rule matching** | **Accumulate-all.** Every active rule whose conditions match contributes its target group(s). This is not first-match-wins — a level 5 fire in Tower B should reach both the fire response group and the executive group. |
| **Rule priority** | `rule_priority` does **not** select a winner. It resolves *template* conflicts only: where two matched rules specify different templates for the same channel, the lowest-numbered priority wins. |
| **Member de-duplication** | The snapshot is de-duplicated by `person_ref`. **One person receives exactly one message per channel per dispatch**, regardless of how many groups placed them there. |
| **Retained provenance** | The snapshot member row records every source group it was resolved from, so the After-Action Report can show why a person was contacted. |
| **Tier conflict** | Where a de-duplicated member carries different `priority/tier` values across source groups, the **highest** tier applies. |
| **Zero-match** | If no routing rule matches, the Crisis record is still created in `PENDING_REVIEW` with an empty recipient list and a visible "no routing rule matched" warning on Crisis Review. It is never silently dropped. |

---

## 5. State machines

### 5.1 Crisis

```
DRAFT (auto-created)
   → PENDING_REVIEW
        → DISPATCHED → ACTIVE → STOOD_DOWN → CLOSED
        → CANCELLED   (DM rejects — false alarm, pre-dispatch)
        → SUPERSEDED  (source incident downgraded below L4 before review)
```

**Post-dispatch false alarm.** There is no `CANCELLED` path after `DISPATCHED`. Once messages are out, the crisis must be stood down, not cancelled — recipients who were mobilised have to be told to stand down. `STOOD_DOWN` carries a `stand_down_reason` (Resolved / False alarm / Duplicate) so the after-action report can distinguish them.

**Linkage to the source incident.** The crisis and its source incident have independent lifecycles after creation:

| Event on source incident | Effect on crisis |
|---|---|
| Downgraded below level 4 while `PENDING_REVIEW` | Crisis moves to `SUPERSEDED`, removed from the active queue, retained for audit. |
| Downgraded below level 4 while `DISPATCHED` / `ACTIVE` | **No automatic effect.** Responders are already mobilising; only a DM may stand the crisis down. A banner is shown on the Live Dashboard. |
| Escalated 4 → 5 while `PENDING_REVIEW` | Routing re-resolves and the snapshot is rebuilt. Records the reason in the audit log. |
| Escalated 4 → 5 while `DISPATCHED` / `ACTIVE` | **No automatic re-dispatch.** The DM is prompted that additional groups now match and may dispatch a supplementary wave. |
| Incident closed while crisis `ACTIVE` | Incident closure is **blocked** until the crisis is stood down. A live recall with an unacknowledged responder cannot outlive its incident silently. |

### 5.2 DispatchRecipient — two independent tracks

Delivery and acknowledgement are modelled as **two parallel state machines on the same row**, not one chain. Collapsing them into a single sequence is the mistake §4.4 warns against.

**Delivery track** (driven by the provider):

```
PENDING → SENT → DELIVERED
                → FAILED → (retry per policy) → EXHAUSTED
```

**Acknowledgement track** (driven by the recipient):

```
AWAITING → ACKNOWLEDGED
         → DECLINED
         → NO_RESPONSE   (ack window elapsed)
              → ESCALATED → (ladder steps) → EXHAUSTED
```

**Rule:** an acknowledgement is accepted from any delivery state at or after `SENT`, including `FAILED`. A DLR is not a precondition for an ack.

*Rationale — do not remove:* link-based acks routinely arrive before the delivery receipt, and many providers never return a DLR at all. Gating `ACKNOWLEDGED` on `DELIVERED` would cause the system to discard valid acknowledgements from responders who are already mobilising. Escalation is driven by the **acknowledgement** track; `FAILED` delivery only accelerates entry into it.

---

## 6. Screens

### 6.1 Configuration (M1) — System Configuration → Crisis

| Screen | Content | Notes |
|---|---|---|
| Recall Groups | List and CRUD, member management, bulk import | Reuse Broadcast group UI pattern; separate data |
| Message Templates | Template list, editor with placeholder picker, SMS character counter and segment count, preview | Character counter matters — SMS splits at 160 / 70 chars |
| Recall Routing Rules | Rule list, condition builder (level / type / zone / time), target group and template, priority ordering | Requires a "test rule" function |
| Messaging Service Settings | Provider, sender ID, failover, retry, rate limit, quiet-hours override, send test message | Admin / IT only. Credentials masked. |
| Acknowledgement and Escalation Rules | Ack window, accepted keywords, decline handling, escalation ladder builder, reminder rules | Business rules to be sourced from an Ops workshop |

### 6.2 Operational (M2–M5)

| Screen | Content |
|---|---|
| **Crisis Queue** | All crises with status, level, source incident, and a live pending-duration timer. Sorted by urgency. Visible to all DMs. |
| **Crisis Review** | Incident summary, resolved recall group(s), recipient list with contact-validity flags, fully rendered message preview, add / remove / edit member, Dispatch and Cancel actions. Target: two clicks to dispatch. |
| **Live Crisis Dashboard** | Auto-refreshing. Counters (Acknowledged / Declined / No response / Failed), recipient table with per-row delivery status, ack status, escalation level, and inline actions. |
| **Crisis Closure** | Stand-down confirmation, optional stand-down message to all recipients, closure notes |
| **After-Action Report** | Full timeline, response rate, median acknowledgement time, list of non-responders, all member changes. Exportable. |

### 6.3 Screen design principles

- **Crisis Review must be fast.** Two clicks to dispatch. Everything else is pre-configured in System Configuration. A long form with many required fields will make the feature unusable under real crisis conditions.
- **Message preview shows the fully rendered message**, not the template with unresolved placeholders. The DM must see exactly what the recipient will read.
- **Contact data problems are surfaced at review time**, not discovered after dispatch. Members without a valid mobile number are visibly flagged on the Crisis Review screen.
- **The Live Dashboard must answer two main questions in five seconds:** how many have acknowledged, and who is silent and what the system is doing about them.
- **Delivery and acknowledgement are displayed as separate columns.**
- **Row-level actions appear only on rows that need action** (Awaiting → Call; Failed → Resend).
- **SMS content must be readable in three seconds.** Recommended format: `[CRISIS L4] Fire — Tower B. Report to Command Centre L1. Reply YES/NO. <link>`. No prose.

---

## 7. Epic and story breakdown

### Epic 1 — Crisis Configuration Foundation

1. Manage Recall Groups (CRUD)
2. Manage Recall Group Members (add / edit / deactivate, contact validation)
3. Bulk import members
4. Manage Crisis Message Templates
5. Manage Recall Routing Rules
6. Configure Messaging Service Settings
7. Send test message
8. Configure Acknowledgement and Escalation Rules

### Epic 2 — Crisis Trigger

9. Auto-create Crisis record when an incident is submitted at level 4+
10. Resolve routing rules and snapshot recall group members
11. Notify eligible DMs that a crisis awaits review

### Epic 3 — Review and Dispatch

12. View Crisis Queue with pending duration
13. View Crisis Review screen with rendered message preview
14. Add / remove / update members on an active crisis (FSD 11.5.e) — *source of an added member defined by Q9*
15. Dispatch crisis recall
16. Cancel crisis (false alarm, pre-dispatch)

### Epic 4 — Execution and Tracking

17. Send SMS via provider with retry and failover
18. Receive and record delivery status callbacks
19. Capture acknowledgement — *mechanism dependent on Q7*
20. Capture decline
21. Live Crisis Dashboard with auto-refresh
22. Automatic escalation per configured ladder
23. Quorum evaluation and alert
24. Manual re-send / mark-contacted by DM

### Epic 5 — Closure and Audit

25. Stand down crisis, with optional message to all recipients
26. After-action report
27. Full audit trail of crisis actions and member changes
28. Retention and purge of crisis records and message logs — *period defined by Q5*

---

## 8. Phasing

| Phase | Stories | Outcome |
|---|---|---|
| **1a — Foundation** | 1, 2, 4, 5, 6, 7, 9, 10, **11**, 12, 13, 15, **16**, 17, 18 | Crisis is detected, eligible DMs are notified, DM dispatches or cancels, delivery status visible. No acknowledgement capture. |
| **1b — Acknowledgement and visibility** | 8, 14, 19, 20, 21, **23**, 24, 27 | Full recall loop works. DM can see who is responding and whether there are enough of them. |
| **1c — Escalation and closure** | 3, 22, 25, 26, 28 | Automated chasing of non-responders, closure and compliance reporting. |

**Changes from v1.0 — two stories moved into 1a:**

- **Story 11 (notify eligible DMs)** moved from 1b. Under D1/D2 a DM acting is the *only* way a crisis progresses. Without notification the DM must sit watching the queue, which makes 1a untestable in any realistic operational rehearsal.
- **Story 16 (cancel)** moved from 1b. 1a can dispatch but not cancel, so a false alarm would sit in `PENDING_REVIEW` permanently with no exit. Near-zero build cost.

**Story 23 (quorum evaluation)** moved from 1c to 1b, to sit with story 21 — the v1.0 Live Dashboard (story 21, phase 1b) already specifies a quorum indicator, which cannot be built before quorum is evaluated. If Ops cannot supply quorum values in time (Q3), drop the indicator from story 21 as well and move both to 1c together. The two must stay in the same phase.

**Important:** Phase 1a is releasable but **not operationally useful** — it dispatches messages without telling the DM who responded. This must be flagged to stakeholders so nobody expects to go live at the end of 1a.

---

## 9. Dependencies and risks

| Item | Type | Action | Owner |
|---|---|---|---|
| Two-way SMS number from provider | Hard blocker for reply-keyword acknowledgement | Confirmation requested | Shin Feng |
| SMS provider selection, credentials, sandbox access | Blocks Epic 4 entirely | Raise immediately — lead time measured in weeks | Shin Feng / IT |
| Incident module exposes crisis level and submit event | Integration | Confirm what hook or event is available | Incident team |
| Ops workshop for timeout, escalation ladder, quorum values | Blocks Epic 4 configuration | Schedule before Phase 1b | BA / Ops |
| Staff master data — do all members have valid mobile numbers? | Data quality | Run data profiling early. Invalid numbers cause silent failure. | BA |
| DM unavailability | Accepted risk, out of scope | Documented in risk log (Section 1) | — |
| Regulatory retention period for crisis records | Compliance | Confirm before designing purge logic | Compliance |

---

## 10. Cross-cutting requirements

| Requirement | Detail |
|---|---|
| **Performance** | Dispatch to N recipients must complete within a defined SLA. Proposed: 500 recipients within 60 seconds. Implement as an asynchronous queue, not a synchronous loop. |
| **Idempotency** | Double-clicking Dispatch must not send twice. Hard requirement. |
| **Webhook security** | Provider callbacks must be signature-verified. |
| **Timezone** | All crisis timestamps stored in UTC, displayed in site local time. Acknowledgement windows computed in UTC. |
| **Concurrency** | Two levels are required. **(a) Dispatch:** first dispatch wins; the second DM sees a locked state. **(b) Pre-dispatch editing:** because the pending crisis is visible to all DMs (§1), two DMs can edit the same recipient snapshot simultaneously and silently overwrite one another. Crisis Review takes a **soft claim on open** — the second DM sees "Under review by <name> since <time>" and enters read-only, with an explicit Take Over action that is audit-logged. A soft claim, not a hard lock: a DM who walks away must never be able to block a crisis dispatch. Claim expires after a short idle period. |
| **Contact validity** | A mobile number is valid if it matches Singapore mobile format (`+65` followed by 8 digits beginning 8 or 9). Invalid or missing numbers **warn, never block** (Q6) and are flagged on Crisis Review before dispatch. This definition belongs in the spec, not in developer discretion. |
| **Testability** | A simulation mode that runs the full flow against test numbers only. Crisis features are otherwise untestable outside a real incident. |
| **Audit** | Every state change and member edit recorded with actor and timestamp, retained per compliance requirement. |

---

## 11. Open items requiring confirmation

| # | Question | Blocks | Owner |
|---|---|---|---|
| Q1 | FSD 11.5.e — is the permission held by the Duty Manager, the OR Analyst, or both? | Epic 3, story 14 | Shin Feng |
| Q2 | Confirm crisis member edits operate on a snapshot and never modify the master recall group. **Recommendation: yes.** | Data model — must resolve before Epic 2 | Shin Feng |
| Q3 | CLOSED (2026-08-02): Quorum removed from scope. | Epic 4, story 23 | Ops |
| Q4 | CLOSED (2026-08-02): Voice call out of scope for this release. | Epic 4, escalation ladder | Shin Feng |
| Q5 | Retention period for crisis records and message logs. | Epic 5, purge logic | Compliance |
| Q6 | If a member has no valid mobile number, should the system block the add or warn only? **Recommendation: warn, and flag at dispatch review.** | Epic 1, story 2 | Shin Feng |
| Q7 | Acknowledgement mechanism — reply keyword, tokenised link, or both. **Downgraded from blocker to notification: we proceed with the tokenised link (Appendix A method 2) and add reply-keyword when the two-way number lands.** | No longer blocks Epic 4 | Shin Feng — sent, FYI |
| Q8 | Do incident levels 4 and 5 behave differently in any respect? | Epic 2, routing rules | Shin Feng |
| Q9 | Story 14 — when a member is added to an active crisis, may the DM add (a) members of other master recall groups only, (b) any CMS user, or (c) a free-text ad-hoc contact? These are three different builds. **Recommendation: (b) plus (c), both flagged as ad-hoc in the after-action report.** | Epic 3, story 14 | Shin Feng |
| Q10 | If the source incident is downgraded below level 4 after dispatch, is the DM the only party who can stand down? **Recommendation: yes — see §5.1.** | Epic 5, story 25 | Shin Feng / Ops |
| Q11 | Confirm accumulate-all routing with per-person de-duplication (§4.5), rather than first-match-wins. **Recommendation: accumulate-all.** | Epic 2, story 10 | Shin Feng |

**Do not wait on Q7 to start Epic 4.** The two-way SMS number has a lead time measured in weeks and blocks only the reply-keyword path. The tokenised link has no telco dependency, gives a more precise timestamp, and is extensible to ETA capture. Building it first de-risks the entire acknowledgement loop; reply-keyword becomes an additive change to the same acknowledgement record.

---

## 12. Not yet designed

The following screens are identified but not yet mocked up:

- Add member modal (crisis-scoped member search and add)
- Message template editor
- Escalation ladder builder
- After-action report layout

---

## Appendix A — Acknowledgement approach (recommended, pending Q7)

Two methods supported in parallel on the same dispatch. Both write to the same acknowledgement record; whichever arrives first wins.

| # | Method | How it works | Why include it |
|---|---|---|---|
| 1 | **SMS reply keyword** | Message states "Reply YES to acknowledge / NO if unavailable". System receives the inbound SMS, matches the sender's number to the recall group member, records acknowledgement. | Works on any handset, no internet required. Reliable fallback. |
| 2 | **Acknowledgement link** | SMS includes a short tokenised link. Recipient taps it and confirms on a lightweight web page. | Precise timestamp, optional ETA capture, no keyword-parsing ambiguity. |

### Notes

- Method 1 requires a long or short code capable of **receiving** inbound SMS. An alphanumeric sender ID cannot receive replies. This is a hard infrastructure dependency, not a business decision, and typically has a long lead time.
- If only one method is implemented, **method 2 is the safer default** — no telco capability dependency, precise timestamps, extensible.
- **Decline (reply NO) should be supported.** Without it, the DM must wait out the full timeout before learning a recipient is not coming, losing 10–15 minutes in a crisis. If declined by stakeholders, record in the risk log.

---

## Appendix B — Change log

### v1.1 — 2026-08-01 (internal review)

| # | Section | Change |
|---|---|---|
| 1 | §5.2 | Rewritten as two parallel state machines. v1.0 allowed `ACKNOWLEDGED` only from `DELIVERED`, which contradicted §4.4 and would have discarded valid acknowledgements arriving before or without a delivery receipt. |
| 2 | §5.1 | Added `SUPERSEDED`; documented post-dispatch false alarm as stand-down-with-reason rather than cancel; added the crisis ↔ incident lifecycle table (downgrade, escalation, incident closure blocked while a crisis is active). |
| 3 | §4.5 (new) | Routing resolution specified: accumulate-all matching, priority resolves template conflicts only, per-person de-duplication, provenance retained, highest tier wins, zero-match handling. |
| 4 | §4.2 | `Dispatch.sequence` gained `stand_down`, required by the §6.2 closure screen. |
| 5 | §8 | Stories 11 and 16 moved to phase 1a; story 23 moved to 1b to align with the story 21 quorum indicator. |
| 6 | §7 | Added story 28 (retention and purge) — Q5 previously blocked logic that had no story. |
| 7 | §10 | Concurrency extended to cover pre-dispatch snapshot editing via a soft claim; contact-validity rule defined explicitly. |
| 8 | §11 | Q7 downgraded from blocker to notification with a stated default; added Q9 (source of ad-hoc members), Q10 (post-dispatch downgrade authority), Q11 (confirm accumulate-all routing). |
| 9 | §3 | System Administrator and Current Ops Administrator granted the active-crisis member-edit permission (was "No"). Widens who can alter a live recipient list — to be raised with Shin Feng alongside Q1. |
| 10 | §5.1 / crisis.ts | **Q12 added during build:** the plan's "level 4+" trigger contradicts FSD §5.2, where Level 1 is most severe and `Incident.crisisLevel` defaults to 4. Implemented per the FSD (triggers at Level 1–2). Taken literally, the plan's wording would recall responders for the least severe incidents and stay silent for the most severe — and would look correct in any demo, because the default level is 4. Needs confirmation before this is treated as settled. |
