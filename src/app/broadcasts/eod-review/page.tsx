import { redirect } from 'next/navigation';

// End-of-Day Review was merged into /broadcasts as its "End-of-Day Interim" tab
// (BROADCAST_MODULE_FSD_GAP_AND_UIUX_PLAN.md, decision D1, 2026-07-26). This
// route is kept as a redirect rather than deleted outright — existing
// NotificationRecord rows already stored in Mongo (queued before this change)
// still carry `link: '/broadcasts/eod-review'`, and there's no migration pass
// rewriting historical notification links. New notifications queued going
// forward point straight at `/broadcasts?tab=eod` (see cron/eod-broadcast).
export default function EodReviewRedirect() {
  redirect('/broadcasts?tab=eod');
}
