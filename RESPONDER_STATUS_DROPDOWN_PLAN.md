# Responder Assignment — Controller Status Dropdown — Implementation Plan

> **Source:** Kyle, 2026-07-20, from a screenshot of Incident `SEN/IR/20260720/0001` → Responder Assignment card.
> **Two asks:**
> 1. Keep the existing feature that lets the Controller manage/advance a Responder's assignment status.
> 2. Add a dropdown so the Controller can jump a Responder straight to a target status, instead of only clicking one "next step" button at a time.
> **Main file affected:** `src/app/incidents/[...id]/page.tsx` (Responder Assignment card, Controller-facing per-Responder action buttons, lines 2196–2219).
> **Also affected:** `src/app/api/incidents/[...id]/route.ts` (POST action switch, new case).
> **Not affected:** Ranger's own self-service actions ("Acknowledge Dispatch" / "On-Site", lines ~1830–1840), the "Return to Responder" modal (lines 3773–3846), `submit-endorsement`.

---

## 0. TL;DR

| # | Change | File | Size |
|---|---|---|---|
| 1 | New API action `set-responder-status` — Controller-only, jumps a Responder to any state in the *forward* lifecycle (`Assigned → Acknowledged → On-Site → Pending Controller Review`), backfilling skipped timestamps and logging what was skipped | `route.ts`, new `case` in POST switch | Medium |
| 2 | Replace the current single "next-step" button (Acknowledge / On-Site / Notify Completion) in the Controller-facing block with a status `<select>` dropdown | `page.tsx` lines 2198–2219 | Medium |
| 3 | Verify: `npx tsc --noEmit`, manual QA per scenario in §6 | — | Small |

**No schema change.** `ResponderLifecycleStatus` already has all 6 states (`src/lib/db.ts` line 129); this plan only changes *how* the Controller moves a Responder between the states that don't already have a dedicated flow.

---

## 1. Current behavior (verified in code)

Each active Responder has its own `lifecycleStatus`, one of:
`Assigned → Acknowledged → On-Site → Pending Controller Review → Completed`, plus `Live (Incomplete)` as a rework/return state.

Today three separate flows move a Responder through this:

| Flow | Trigger | Where | Constraint |
|---|---|---|---|
| Step-by-step (screenshot's red box) | Controller clicks **Acknowledge** / **On-Site** / **Notify Completion** | `page.tsx` 2198–2219 → `performAction('acknowledge'\|'on-site'\|'notify-complete', ...)` | Each API case hard-requires the *exact* current status (e.g. `acknowledge` 409s unless `lifecycleStatus === 'Assigned'`, `route.ts` line 317) — this is the "only one next step" limitation Kyle is asking about. |
| Return to Responder | Controller opens modal, picks Responder(s), enters mandatory remarks | `page.tsx` 3773–3846 → `performAction('return-to-responder', ...)` | Only from `Pending Controller Review` (or `Completed` while Incident is `Returned`) → `Live (Incomplete)`. Remarks required per Responder (`route.ts` 507–513). |
| Submit for Endorsement | Controller submits whole Incident | `handleSubmitEndorsement` → `submit-endorsement` | Bulk: forces **every** active Responder to `Completed` at once (`route.ts` 402–405), not a per-Responder action. |

Ranger self-service (`myResponderRecord`, lines 1831–1839) is a separate UI block driven by the logged-in Ranger's own `username`, not the Controller — out of scope here.

---

## 2. Decision: dropdown scope (confirmed with Kyle, 2026-07-20)

The dropdown could have meant two different things — Kyle confirmed **A**:

**A — Dropdown covers only the "in-progress" states** (`Assigned`, `Acknowledged`, `On-Site`, `Pending Controller Review`), both forward-skip and backward-correct between them. `Live (Incomplete)` stays behind the existing Return-to-Responder modal (keeps the mandatory-remarks rule intact) and `Completed` stays behind Submit for Endorsement (keeps the bulk-lock semantics intact). This satisfies "advance to other states instead of only next" without silently bypassing the two flows that carry required data or bulk side effects.

**B — Dropdown covers all 6 states** (considered, not chosen), including jumping straight to `Live (Incomplete)` or `Completed` with no remarks/no bulk-submit gate. Would have removed the mandatory-remarks guardrail on returns and let one Responder be marked `Completed` without the Incident being submitted — a new capability that doesn't exist anywhere today.

This plan builds **A**.

---

## 3. Backend — `route.ts`

Add `'set-responder-status'` to `knownActions` (line 216) and a new `case`, modeled on the existing `acknowledge`/`on-site`/`notify-complete` cases:

```ts
case 'set-responder-status': {
  if (body.role !== 'Controller' && body.role !== 'System Administrator') {
    return NextResponse.json({ error: 'Only a Controller can set Responder status directly.' }, { status: 403 });
  }
  if (!['Live', 'Live (Assigned)'].includes(incident.status)) {
    return NextResponse.json({ error: `Cannot change Responder status: current status is "${incident.status}"` }, { status: 409 });
  }
  const ORDER: ResponderLifecycleStatus[] = ['Assigned', 'Acknowledged', 'On-Site', 'Pending Controller Review'];
  const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
  const target = activeResponders.find(r => r.responderId === body.responderId);
  if (!target) {
    return NextResponse.json({ error: 'responderId is required and must be an active Responder.' }, { status: 400 });
  }
  if (!ORDER.includes(target.lifecycleStatus)) {
    return NextResponse.json({ error: `Responder ${target.responderId} is "${target.lifecycleStatus}" — use Return to Responder or Submit for Endorsement instead.` }, { status: 409 });
  }
  if (!ORDER.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${ORDER.join(', ')}` }, { status: 400 });
  }
  const fromIdx = ORDER.indexOf(target.lifecycleStatus);
  const toIdx = ORDER.indexOf(body.status);
  if (toIdx === fromIdx) {
    return NextResponse.json({ error: `Responder ${target.responderId} is already "${body.status}".` }, { status: 400 });
  }
  const now = new Date().toISOString();
  const skipped = ORDER.slice(Math.min(fromIdx, toIdx) + 1, Math.max(fromIdx, toIdx));
  if (toIdx > fromIdx) {
    // moving forward — backfill timestamps for every stage crossed
    if (toIdx >= ORDER.indexOf('Acknowledged') && !target.acknowledgedAt) target.acknowledgedAt = now;
    if (toIdx >= ORDER.indexOf('On-Site') && !target.onSiteAt) target.onSiteAt = now;
    if (toIdx >= ORDER.indexOf('Pending Controller Review')) target.pendingReviewAt = now;
  }
  // moving backward: intentionally leave prior timestamps in place (history of what
  // already happened shouldn't be erased by a correction) — only lifecycleStatus changes.
  target.lifecycleStatus = body.status;
  incident.log.push(makeLogEntry(incident,
    `Controller ${actor} manually set Responder ${target.responderId} status: ${activeResponders.find(r=>r.responderId===target.responderId) ? '' : ''}${ORDER[fromIdx]} → ${body.status}` +
    (skipped.length ? ` (skipped: ${skipped.join(', ')})` : '')
  ));
  break;
}
```

Notes:
- The 403 role check is new rigor — today `acknowledge`/`on-site`/`notify-complete` don't check `body.role` at all (only the frontend hides the buttons via `isCtrl`). Worth adding here since this action is explicitly "Controller does this to someone else," unlike the other three which also serve as Ranger self-service. Flag to Kyle: should the same 403 be retrofitted onto `acknowledge`/`on-site`/`notify-complete` for consistency? Separate, smaller follow-up if wanted — not required for this plan.
- Every status change (forward or backward) writes a distinct log line so the audit trail can tell a manual override apart from the normal step-by-step clicks.

---

## 4. Frontend — `page.tsx`

Replace lines 2198–2219 (the `isCtrl && !isLocked` block with the three conditional buttons) with a single dropdown:

- `<select>` populated from `ORDER` (`Assigned`, `Acknowledged`, `On-Site`, `Pending Controller Review`), current value = `r.lifecycleStatus`, current option not removed (so it visibly reflects state) but selecting a *different* option immediately fires the change.
- `onChange`: since this is a direct jump (not just "next"), add a lightweight confirm for backward moves or multi-step skips (e.g. `Assigned → Pending Controller Review`) — `confirm('Move {responderId} from {from} to {to}? This will skip: {skipped}.')` — to avoid a stray click silently skipping steps. Forward-by-one moves (the common case, equivalent to today's button) can fire without a confirm to keep the fast path fast.
- Calls `performAction('set-responder-status', { responderId: r.responderId, status: newValue })`.
- Disabled while `saving`, same as today.
- Responders at `Live (Incomplete)` keep the existing dedicated **Notify Completion** button (not folded into the dropdown — it's the resubmission path back to `Pending Controller Review`). Responders at `Completed` get no dropdown and no button — that state is terminal until Submit for Endorsement runs. `Pending Controller Review` **is** one of the 4 dropdown states (per §2), so the Controller can still correct it backward from there if needed.

---

## 5. Decisions confirmed

1. ~~Dropdown scope: A vs B~~ — **confirmed A** (§2).
2. ~~Allow backward moves (e.g. `On-Site → Acknowledged`, correcting a misclick)?~~ — **confirmed yes**, both directions are in scope, per §3/§4 above.
3. ~~Is the per-status-change log line wording enough for audit purposes?~~ — **confirmed yes**, the free-text log entry in §3 is sufficient; no structured audit field needed.

No open questions remain — ready to build per §3/§4.

---

## 6. Verification

- `npx tsc --noEmit` — no type errors.
- Manual QA in the Incident Details page as Controller role:
  - Single-step forward (`Assigned → Acknowledged`) — no confirm, matches today's behavior.
  - Multi-step skip (`Assigned → Pending Controller Review`) — confirm shown, lists skipped stages, timestamps backfilled.
  - Backward correction (`On-Site → Acknowledged`) — confirm shown, prior timestamps untouched.
  - Attempt via Ranger role — dropdown not rendered (block still gated by `isCtrl`), and direct API call with `role: 'Responder (Ranger)'` gets a 403.
  - Responder already at `Pending Controller Review` / `Live (Incomplete)` / `Completed` — no dropdown shown in this card; existing Return to Responder / Submit for Endorsement still work unchanged.
  - Incident log tab shows the new "Controller manually set..." entries with correct skipped-stage notes.
