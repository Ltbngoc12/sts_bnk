# QnA — FSD v0.5 §5.1.2 Incident Categories

**To:** Shin Feng (BA)
**From:** Kyle
**Re:** Confirming Incident Category behavior before Phase 2 build (response/assignment/closure/broadcast defaults per category)

Context: §5.1.2 states each incident category is used by the system to determine default **response, assignment, closure and broadcast** behavior. Below is my understanding of each of the 3 categories, split out for you to confirm one by one.

---

## 1. Operational Incident

**My understanding:** Default category for active incidents. Goes through the full existing flow — Live → Live (Assigned) → Live (Acknowledged) → Live (On-site) → Pending Controller Review → Pending Endorsement → Closed — with Responder assignment, ground response, and broadcast all applicable where relevant.

**Confirm:**
- No open question here — just flagging as baseline so you can correct me if this isn't the intended default behavior.

---

## 2. Backdated Incident

**Spec text:** "The record is created, populated with the known details, and submitted for closure endorsement soon after."

**My understanding:** Since the event already happened and ended, a Backdated Incident does not go through the live ground-response steps (Live (Assigned) → Acknowledged → On-site) — there's nothing left to respond to. Instead, once the Controller fills in the known details and submits, the record moves straight to **Pending Endorsement**, where the Duty Manager still needs to review and approve it before it becomes Closed. So it's not closed the instant it's submitted — Duty Manager sign-off is still required first.

**Confirm:**
1. When a Backdated Incident is submitted, does its status become "Pending Endorsement" (waiting for Duty Manager approval), rather than jumping straight to "Closed"?
2. Can a Responder be assigned to a Backdated Incident at all? §5.1.2 mentions Responder assignment for Informational/Exercise Records but says nothing about it for Backdated. Should the Responder assignment field even be shown for this category, or does it not apply since the incident is already over?

---

## 3. Informational / Exercise Records

**Spec text:** "These records do not require a Responder assignment, ground response or broadcast handling by default... Exercise records may still include Responder assignment and response milestone tracking where required."

**My understanding:** If no Responder is assigned (the default case), the record skips Live (Assigned) and the rest of the response chain, since there's nothing to track. If a Responder IS assigned, it goes through the normal response workflow like an Operational Incident.

**Confirm:**
1. When no Responder is assigned, does the record still need to go through **Pending Endorsement / Duty Manager review** before Closed (same governance as Operational, just without the ground-response steps in between)? Or is there a simplified/direct closure path specific to this category when no Responder is involved?

---

Let me know if the above reads are correct, especially the two open points under Backdated and Informational/Exercise — want to lock this down before starting the Phase 2 build.

---

## Shin Feng's reply — 2026-07-08

**1. Operational Incident**
> Yup, this would be the typical default incident

**2. Backdated Incident**
> Understanding is correct.
> Same standard workflow, but Responder assigning should be optional. Where no Responder input is required, the Controller fills it up himself and submits the Incident for Duty Manager endorsement.
> But there are cases where post-action input is required, and the Controller may still assign a Responder to update the incident log or any operational details

**3. Informational / Exercise Records**
> Also uses the standard flow and will need go to through Pending Endorsement, and Responder assignment is optional as usual, and be submitted for endorsement straight
> The categories represent different use cases under the same incident lifecycle. Responder assignment should be kept optional and the response milestone tracking only applied when responders are assigned.
> All incident will still need endorsement by Duty Manager to close.
> Sorry might have confused you that each of these might have needed individual special workflows, but it was just to capture the current use cases when creating incidents

**Additional context (why 5 → 3 categories):**
> Previously there was the Ongoing and Proactive also that was removed recently.
> The ongoing one kind of just fell under the same as the default, except that it has been ongoing into the next day. This use case would have been handled by the interim broadcast and didn't really need flag out anymore so it was removed.
> The proactive one was for 'incidents/occurrences' that were not yet serious enough to be considered an incident, but needed to be logged. This use case would be covered by e-Diary instead now

**Takeaway:** all 3 categories share the exact same standard lifecycle — there is no category-specific workflow branch. Responder assignment is optional everywhere; when no Responder is assigned the Controller submits straight for Duty Manager endorsement, and when one is assigned the normal ground-response cycle applies regardless of category. Every incident always requires Duty Manager endorsement before Closed. Implemented in `src/app/api/incidents/[...id]/route.ts` and `src/app/incidents/[...id]/page.tsx` — see INCIDENT_CATEGORY_IMPLEMENTATION_PLAN.md §3/§6 for the full before/after.
