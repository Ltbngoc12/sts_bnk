Subject: Occurrence Log (e-Diary) — FRD gaps + open items

Hi Shin Feng,

Client feedback on the e-Diary prototype surfaced a few points that need your input — some are real gaps, some turned out to be us cross-checking against an older FRD section. Flagging both before we build.

**Note:** we noticed the e-Diary section reads differently across FRD versions (older §8 "Occurrence Log" vs the v0.5 e-Diary section + §9.1.3). Could you confirm v0.5 is the authoritative one to build against?

## Gaps

1. **Case linkage** — the module overview line says e-Diary is "not linked to the Case structure," but the Requirements right below it say e-Diary auto-creates its own Case, and an escalated Incident/Task shares that Case. Client feedback matches the Requirements text (own dedicated Case per entry) — just flagging the contradiction so the overview line gets cleaned up.
2. **New field: Ref No** — not in any FRD version's field list. Client wants a lightweight pointer from a follow-up entry back to a prior entry's Serial No.
3. **Field naming** — client's Serial No/Subject/Occurrence = FRD's Occurrence ID/Topic/Content, just relabeled.
4. **Create/Link Record scope** — §9.1.3(a) already allows creating/linking Incident, Task, or Event from an e-Diary entry. Task is spec'd but not yet built (we'd deferred it during the Events work). **Fault isn't in §9.1.3 at all**, but the client wants Incident/Fault/Task buttons together — real gap to close.
5. **Mutable vs immutable** — this one's a genuine FRD self-contradiction: the scope overview says entries "cannot be amended or deleted," but the role matrix and the e-Diary detail section both say entries are mutable and Controllers can amend (tracked/timestamped). We'd already built toward immutable (removed the Amend feature) based on the first reading — need to confirm which is correct before we lock that in.
6. **UCS vs CMS quick entry** — FRD puts fast logging in a separate UCS surface, CMS as the management view. Client's "feels like a dashboard" feedback suggests they want fast entry inside CMS itself.

## Open items to confirm

- Which FRD version/section is authoritative for e-Diary going forward?
- Mutable or immutable — can entries be amended after submission?
- Add Fault to the create/link list in §9.1.3? Should Task be built now given the client's push?
- Attachments are spec'd (file/image, optional) — keep in the simplified quick-log flow, or defer for speed?
- Ref No: free text or lookup?
- Are the client's 5 logbook types the confirmed Topic categories (still TBC in FRD)?
- Is UCS quick-entry still planned, or does CMS take over that role?

## Proposed UX fix (dashboard feedback)

Inline quick-add bar above the list — Subject + narrative + one click to log, rest auto-generated. Collapsible "More" for Ref No/backdating. Can share a mockup.

Thanks,
Kyle
