Subject: Task Assignment (§7.2) — group assignment model needs clarification

Hi Shin Feng,

Cross-checking §7.2 Task Assignment and Notification against how we've built "Assign to Group" in the Task module, and want to confirm the intent before we adjust anything.

§7.2(c)–(d) says: "Tasks may be assigned to an individual CMS user or a pre-configured group... Task assignment groups may be configured by the System Administrator, to allow for assignment of Tasks to a group of users."

Right now our group picker reuses the same Distribution Groups defined in §9.3 (Broadcast Recipient Group Management) — which include external members (Police Liaison, SCDF Commander, F&B tenants, etc.), since those groups exist to route broadcasts, not to receive ground-level work.

## Questions

1. **Is a "Task assignment group" the same object as a Broadcast Distribution Group (§9.3)?** Or should it be a separate, dedicated group type — configured by the System Admin specifically for Task assignment, scoped to internal CMS/operational staff only (Rangers, Zone Managers, etc.), with no external members?

2. **Does Assignee support multi-select of individual users directly** (picking 2–3 named CMS users on a single Task without going through a saved group), or is multi-recipient assignment only possible via a pre-configured group?

3. **Completion semantics when a Task is assigned to a group** — does the Task close once **any one** member acknowledges/completes it, or must **all** members complete their part before the Task can move to Closed? This affects how we model the status per §7.3.2 (e.g., do we need a per-member completion state, or is status still a single value for the whole Task)?

Let us know and we'll adjust the Assign To field and the underlying group data model accordingly.

Thanks,
Kyle
