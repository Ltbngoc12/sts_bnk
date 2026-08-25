# Operational Dashboard — Enhancement Plan v2 (Mockup-driven)

> **Nguồn:** Mockup do Kyle (BA) vẽ, 2026-08-17 (bản thứ 2 trong ngày).
> **Thay thế:** `DASHBOARD_UIUX_ENHANCEMENT_PLAN.md` (v1, cùng ngày) — v1 đã build xong nhưng client đổi hướng layout. Xem §0.1 để biết phần nào của v1 bị revert.
> **Code liên quan:** `src/app/page.tsx` (428 dòng), `src/app/globals.css` (dòng 280–470 metric styles), `src/components/EventTimelineView.tsx`, `src/components/EventCreateModal.tsx`, `src/components/MapComponent.tsx`, `src/app/admin/system-settings/page.tsx`.
> **Đối chiếu FSD:** `FRD_v0.5_extracted.txt` §2.4 (Dashboard), §2.4.2 (9 Summary Metrics), §2.4.3 (2D Map), §2.4.4 (Events).
> **Trạng thái:** Đã chốt 4 decision với Kyle. Còn 3 open item ở §7 — không chặn Phase 1.

---

## 0. Decision Log

| # | Vấn đề | Quyết định (Kyle, 2026-08-17) |
|---|---|---|
| 1 | Card "Pending Action" (v1) | **Bỏ hẳn** theo mockup |
| 2 | Định nghĩa "Today" trong period dropdown | **Calendar day 00:00–23:59** |
| 3 | Nửa dưới dashboard (3 list) | **Bỏ hết** — dashboard chỉ còn KPI + calendar + map |
| 4 | Clickthrough trên KPI card | **Có** — navigate tới trang list tương ứng (không cần pre-filter) |
| 5 | Active NOPs | **TBD** — module NOP chưa build |

### 0.1 Phần của v1 bị revert

| v1 đã build | v2 |
|---|---|
| Spotlight card "Pending Action" + 3 helper (`isIncidentPending`, `pendingFaults`, `pendingTasks`) | Xoá khỏi UI. **Giữ lại helper trong code** (comment `// retained for future use`) — logic đã review kỹ, có thể dùng lại cho Statistics/alerting. |
| 2 tier "Current Load" / "Today's Tally" + `.metrics-tier-label` | Xoá — thay bằng 5 grouped card |
| `isWithinReportWindow()` + `dashboardReportResetTime` (09:00) | Bỏ khỏi Dashboard (decision #2). Setting trong System Settings: xem open item §7.1 |
| 3 list nửa dưới | Xoá |

> **Ghi nhận rủi ro (đã raise, Kyle chốt bỏ):** sau khi bỏ Pending Action, cả 9 metric còn lại đều là *đếm tồn kho theo status*. Dashboard không còn metric nào trả lời "việc gì đang chờ Controller xử lý". Nếu sau release client hỏi lại đúng câu này thì đây là chỗ để quay lại — logic đã có sẵn trong code.

---

## 1. Layout mục tiêu

```
┌──────────────────────────────────────────────────────────────────┐
│ OPERATIONAL DASHBOARD        ● SYSTEM MONITORING ACTIVE   <date> │  ← §2
├──────────────────────────────────────────────────────────────────┤
│ ┌────────┐┌──────────────┐┌──────────────┐┌────────┐┌────────┐  │
│ │ Active ││Total INCIDENT││ Total FAULT  ││ Active ││ Active │  │  ← §3
│ │ Cases  ││ [Today ▾]    ││ [Today ▾]    ││ Tasks  ││  NOPs  │  │
│ │        ││ Unclosed│Rep ││ Unclosed│Rep ││Ovd│Act ││  TBD   │  │
│ └────────┘└──────────────┘└──────────────┘└────────┘└────────┘  │
├────────────────────────┬─────────────────────────────────────────┤
│  TODAY EVENT      (7)  │  2D ISLAND MAP (SENTOSA)                │  ← §4, §5
│  ┌──────────────────┐  │  ┌───────────────────────────────────┐  │
│  │ day timeline     │  │  │ leaflet map + layer pills         │  │
│  │ 07:00 → 23:00    │  │  │ (giữ nguyên theo FSD v0.5)        │  │
│  └──────────────────┘  │  └───────────────────────────────────┘  │
└────────────────────────┴─────────────────────────────────────────┘
```

Grid: `grid-template-columns: minmax(320px, 0.9fr) 2fr` ở ≥1280px; stack 1 cột ở <1024px. Bỏ hoàn toàn `.dashboard-layout-grid` và `.bottom-split-grid` hiện có.

---

## 2. Header — status pill phải là health-check thật

**Vấn đề hiện tại:** `systemHealthy` chỉ set `false` khi `Promise.all` của lần fetch **đầu tiên** throw (`page.tsx` dòng 108-111). Sau đó không bao giờ update. Backend chết 30 phút sau → pill vẫn xanh. Đúng như Kyle nói pill này để "know if connection with the CMS is down" — hiện tại nó không làm được việc đó.

**Đề xuất:**
- Thêm `GET /api/health` trả `{ ok: true, ts }` (đọc DB 1 lần để chứng minh DB reachable, không chỉ ping Next.js).
- Poll mỗi 30s từ dashboard. 3 state:

| State | Điều kiện | Hiển thị |
|---|---|---|
| Healthy | health-check gần nhất OK | 🟢 `SYSTEM MONITORING ACTIVE` |
| Degraded | 1 lần fail, chưa quá 90s | 🟡 `RECONNECTING…` |
| Down | ≥3 lần fail liên tiếp / >90s | 🔴 `CONNECTION LOST — data as of HH:mm` |

- Khi Down: hiện timestamp của lần fetch thành công cuối cùng cạnh mọi KPI number (staleness indicator). Con số cũ hiển thị như số live là điều nguy hiểm nhất trên trang này.
- Auto-refresh KPI data: cùng nhịp poll (30s) hay giữ fetch-once? → open item §7.2.

---

## 3. KPI Cards — 5 nhóm

### 3.1 Anatomy chuẩn (áp cho cả 5 card, cao bằng nhau)

```
┌─────────────────────────────────┐
│ CARD TITLE          [Period ▾]  │  ← period chỉ hiện ở Incident/Fault
│                                 │
│   ┌──────────┐   ┌──────────┐   │  ← 1–2 metric slot
│   │  9       │   │   20     │   │
│   │ Unclosed │   │ Reported │   │
│   │ as of now│   │ (Today)  │   │
│   └──────────┘   └──────────┘   │
└─────────────────────────────────┘
```

**Fix so với mockup:**
- Font KPI giảm từ ~48px xuống 32px, card height cố định ~140px (mockup ~200px, chiếm gần hết viewport đầu — lặp lại đúng lỗi "giãn/lãng phí diện tích" của bản v1).
- Active Cases và Active NOPs chỉ có 1 metric slot → slot đó chiếm full width card, **không** để ô trống lệch chiều cao như mockup.
- Sub-label bắt buộc dưới mỗi số. `as of now` cho metric snapshot, `(Today)` / `(This Week)`… cho metric period-based. Đây là fix cho vấn đề #2 tôi raise: nếu không có label, user đổi period thấy số Unclosed không nhảy sẽ tưởng bug.
- Metric cảnh báo (Unclosed, Overdue) tô nền warning khi > 0, neutral khi = 0.

### 3.2 Định nghĩa metric & mapping code

| Card | Metric | Formula | Period-based? | Code hiện tại |
|---|---|---|---|---|
| **Active Cases** | Active Cases | `case.status === 'Active'` | Không | `page.tsx:118` ✔ giữ |
| **Total Incident** | Unclosed Incidents | `case.incident.status !== 'Closed'` | Không | `:120` ✔ giữ (label "Unclosed" — revert việc v1 đổi thành "Active") |
| | Incidents Reported | `case.incident.dateTime` ∈ period | **Có** | `:119` — **viết lại**, bỏ `isWithinReportWindow`, dùng `getPeriodRange()` |
| **Total Fault** | Unclosed Faults | `fault.status !== 'Closed'` | Không | `:122` ✔ giữ |
| | Faults Reported | `fault.createdAt` ∈ period | **Có** | `:121` — viết lại như trên |
| **Active Tasks** | Active Tasks | `task.status !== 'Closed'` | Không | `:123` ✔ giữ |
| | Overdue Tasks | `status !== 'Closed' && dueDate < today` | Không | `:124` ✔ giữ |
| **Active NOPs** | Active NOPs | `status ∈ {Approved, Active}` ∧ hôm nay ∈ [start, end] | Không | `:104` — **đổi thành TBD**, xem §3.4 |

FSD §2.4.2 traceability — 9/9 metric vẫn có mặt: 7 metric ở bảng trên + **Events Today** (badge `(7)` trên header mini calendar §4) + **Active NOPs** (TBD placeholder). Không metric nào bị mất → không cần deviation note gửi Shin Feng.

### 3.3 Period selector

Options: `Today` (default) · `This Week` · `Last Week` · `This Month` · `Last Month` · `This Year` · `Last Year`.

- **Today = calendar day 00:00–23:59** (decision #2). Bỏ shift-window 09:00.
- Week boundary: **Monday–Sunday** (SG convention) → cần confirm, open item §7.3.
- 2 dropdown (Incident / Fault) **độc lập**, mỗi card giữ state riêng — đúng theo mockup.
- Persist lựa chọn vào `localStorage` (`dashboard_incident_period`, `dashboard_fault_period`) để reload không mất. Rẻ, tránh việc Controller phải set lại mỗi shift.
- Helper mới `getPeriodRange(period: DashboardPeriod, now: Date): { start: Date; end: Date }` — tách ra `src/lib/dashboardPeriod.ts` để Statistics module dùng lại được.

### 3.4 Active NOPs — TBD state

Module NOP chưa build; `/api/nops` hiện là `MOCK_NOPS` hard-code (`api/nops/route.ts`) trả về số nhìn như thật (20 / 1). **Đây là misleading — phải xử lý.**

Đề xuất: card render dạng disabled — nền muted, chỗ số hiển thị `TBD`, sub-label `Pending NOP module`, không click được, có tooltip "NOP module not yet implemented". Giữ card trong lưới để FSD traceability không bị hụt và layout không phải sửa lại khi NOP xong.

Không xoá `/api/nops` (Events map đang dùng NOP boundary), chỉ ngưng bind vào KPI card.

### 3.5 Clickthrough (decision #4)

Toàn bộ card/metric clickable → navigate (không pre-filter):

| Metric | Đích |
|---|---|
| Active Cases | `/case-management?tab=cases` |
| Unclosed / Reported Incidents | `/case-management?tab=incidents` |
| Unclosed / Reported Faults | `/case-management?tab=faults` |
| Active / Overdue Tasks | `/case-management?tab=tasks` |
| Active NOPs | — (disabled) |

Cần verify tab key thật trong `case-management/page.tsx` (`TabKey` union) trước khi hard-code query string.

---

## 4. Mini Calendar — Today Event

**Reuse có sẵn, không viết mới:**
- `EventTimelineView` (`src/components/EventTimelineView.tsx`) — đã nhận `events`, `currentDate`, `onEventClick`. Đúng cái mockup vẽ (day timeline có time rail + event block màu theo type).
- `EventCreateModal` với prop `editingEvent` + `canEdit=false` — chính là popup mà `EventsTab.openEvent()` đang dùng. Click event trên dashboard mở đúng popup này → thoả yêu cầu "giống như tính năng của trang Event Management".

**Việc cần làm:**
1. Container hẹp (~320–400px) — `EventTimelineView` hiện render trong panel rộng của EventsTab. Cần prop `compact?: boolean` giảm slot height, ẩn cột phụ, cho phép event block wrap text 2 dòng. **Phải verify component có hard-code width/slot-height không** trước khi estimate.
2. Auto-scroll tới giờ hiện tại khi mount + "now line" (mockup có vạch cam ngang — hiện `EventTimelineView` có sẵn hay không cần check).
3. Header: `TODAY EVENT` + badge số = **Events Today** metric (FSD §2.4.2). Định nghĩa lấy từ `/api/events` `stats.today` hiện có: event đang chạy (`start <= now <= end`).
   ⚠️ **Lệch với mockup:** mockup ghi "các Event có trong today" (7 event) — tức *mọi* event overlap ngày hôm nay, kể cả 08:30 đã xong và 20:00 chưa bắt đầu. Nhưng `/api/events` `stats.today` đang tính **event đang diễn ra ngay lúc này** (`start <= now <= end`). Hai định nghĩa khác nhau → badge sẽ không khớp số block trên timeline. **Đề xuất: đổi `stats.today` sang "overlap calendar day"** để badge = số block hiển thị. Cần Kyle confirm (open item §7.4).
4. `role` guard: `EventCreateModal` mở từ dashboard nên là read-only bất kể role — dashboard không phải chỗ edit event.
5. Empty state: "No events scheduled today."

---

## 5. 2D Island Map

Giữ nguyên `MapComponent`, không đổi behaviour — vẫn theo FSD v0.5 §2.4.3 như hiện tại. Chỉ thay đổi container: từ `.dashboard-layout-grid` (map + list cạnh nhau) sang `.dashboard-main-grid` (calendar + map). Map chiếm cột rộng hơn hiện tại → là cải thiện, vì map hiện đang bị bó.

Mockup có layer pill `Alerts: 17 / Incidents: 17 / Tasks: 6 / Faults: 10,123 / Events: 4` ở góc trên map — **cái này cần check** `MapComponent` đã có chưa, và `Faults: 10,123` trong mockup rõ ràng là số seed data vô lý (chỉ có 15 active fault). Nếu là feature mới thì tách ra khỏi đợt này, đừng gộp vào — không nằm trong 10 điểm Kyle liệt kê.

---

## 6. Implementation Plan

### Phase 1 — Data & logic (không đụng UI)
1. `src/lib/dashboardPeriod.ts`: type `DashboardPeriod`, `getPeriodRange()`, `PERIOD_LABELS`. Unit test 7 option quanh biên (đầu/cuối tuần, đầu/cuối năm, `Last Week` vắt qua năm mới).
2. `page.tsx`: thay `isWithinReportWindow` bằng `getPeriodRange`; thêm 2 state period + localStorage persist.
3. `GET /api/health`.
4. Health-check polling hook + 3-state logic + staleness timestamp.
5. Comment-out (không xoá) 3 helper Pending Action.

### Phase 2 — Card UI
6. Component `<MetricCard>` dùng chung: props `title`, `period?`, `onPeriodChange?`, `metrics: {value, label, tone, href}[]`, `disabled?`. Bỏ 9 block JSX lặp hiện tại (`page.tsx:186–310`).
7. Dựng 5 grouped card theo §3.1.
8. Active NOPs disabled state.
9. CSS: viết lại `.metrics-grid` (globals.css:280–470), xoá `.metrics-tier-label*`, `.metrics-grid-secondary`, `.pending-action-*`.

### Phase 3 — Calendar + layout
10. `compact` mode cho `EventTimelineView` + now-line + auto-scroll.
11. Panel Today Event + wire `EventCreateModal` read-only.
12. `.dashboard-main-grid` 2 cột; xoá `.dashboard-layout-grid`, `.bottom-split-grid` và 3 list JSX (`page.tsx:315–424`).
13. Responsive check 1440 / 1280 / 1024 / 768.

### Phase 4 — Cleanup & verify
14. Quyết định số phận `dashboardReportResetTime` (§7.1).
15. Regression: mọi API call cũ còn dùng? `occurrences` fetch giờ thành dead code sau khi bỏ e-Diary list → xoá khỏi `Promise.all` (bớt 1 request).
16. Verify: 9/9 FSD metric hiện đúng; đổi period 7 option số nhảy đúng; kill backend → pill đổi đỏ trong ≤90s; click từng metric ra đúng trang; click event mở đúng popup.

**Thứ tự merge:** Phase 1 → 2 độc lập được. Phase 3 phụ thuộc Phase 2 (layout). Nếu cần release sớm, Phase 1+2 đã là phần lớn giá trị.

---

## 6.1 Implementation status — BUILT (2026-08-17)

Toàn bộ Phase 1–4 đã code. `npx tsc --noEmit` pass sạch. `next build` chưa chạy được ở môi trường verify (SWC binary là bản Windows) — cần Kyle chạy `npm run dev` trên máy để smoke test.

| File | Thay đổi |
|---|---|
| `src/lib/dashboardPeriod.ts` | **MỚI** — `DashboardPeriod`, `getPeriodRange()`, `isWithinPeriod()`, `periodSubLabel()`, `PERIOD_LABELS/OPTIONS`. `WEEK_STARTS_ON = 1` (Mon). |
| `src/app/api/health/route.ts` | **MỚI** — ping Mongo (`{ping:1}`), không dùng `getDb()` vì `getDb()` load cả 10 collection, quá nặng cho poll 30s. |
| `src/hooks/useSystemHealth.ts` | **MỚI** — poll 30s, timeout 8s/request, escalate `healthy → degraded → down` sau 3 lần fail; re-check ngay khi tab visible lại. |
| `src/components/MetricCard.tsx` | **MỚI** — card dùng chung: 1–2 metric slot, period selector optional, disabled state, clickthrough. |
| `src/app/page.tsx` | Viết lại (428 → ~330 dòng). 5 grouped card + Today Event + map. Auto-refresh 30s. Pending Action helpers giữ dạng comment block. |
| `src/components/EventTimelineView.tsx` | Thêm `compact` + `showNowLine`. Geometry (`HOUR_H`/`RAIL_W`/`MIN_BLOCK_H`) tham số hoá — trước đây hard-code 60px trong cả CSS và layout math nên không resize được. |
| `src/app/api/events/route.ts` | `stats.today` → overlap calendar day (§7.4). |
| `src/app/globals.css` | Xoá `.metrics-grid`, `.metric-card*`, `.metrics-tier-label*`, `.metrics-grid-secondary`, `.pending-action-*`, `.dashboard-layout-grid`, `.active-cases-card/-list`, `.bottom-split-grid`, `.split-*`, `.item-*`, `.live-pulse-down`. Thêm `.metrics-grid-v2`, `.metric-card-v2`, `.metric-slot*`, `.dashboard-main-grid`, `.today-event-*`, `.health-*`, `.header-stale-stamp`, 4 breakpoint. Giữ `.empty-state`, `.view-all-link`, `.active-case-*`, `.case-*` (còn dùng ở case detail + các tab). |
| `src/app/admin/system-settings/page.tsx` | Xoá `dashboardReportResetTime` (§7.1). |

**Verify đã chạy:** `getPeriodRange()` test qua 4 mốc biên (Mon 17/08, Sun 16/08 cuối tuần, Fri 01/01/2027 giao năm, Tue 03/03 lastMonth=Feb) — tuần Mon–Sun đúng, cuối tháng 28/31 đúng, `lastWeek` vắt qua năm mới đúng. Boundary `isWithinPeriod`: 00:00:00.000 và 23:59:59.999 nằm trong, 00:00 hôm sau nằm ngoài, date rác/undefined trả false.

**Còn phải làm bằng tay:** smoke test trên browser (responsive 1440/1280/1024/768, kill backend xem pill đổi đỏ trong ≤90s, click 7 metric ra đúng tab, click event mở popup read-only).

---

## 7. Open items — đã quyết theo default khi Kyle nói proceed

Kyle chọn "proceed" mà chưa trả lời §7.1–7.5, nên đã áp dụng recommendation đã ghi ở dưới. Cần review lại nếu không đồng ý:

| # | Đã chọn |
|---|---|
| 7.1 | **Xoá** `dashboardReportResetTime` khỏi System Settings |
| 7.2 | **Auto-refresh 30s**, cùng nhịp health poll |
| 7.3 | **Mon–Sun** (`WEEK_STARTS_ON = 1` trong `dashboardPeriod.ts`, đổi 1 dòng nếu cần Sun-first) |
| 7.4 | **Overlap calendar day** cho Events Today |
| 7.5 | Map layer pills — **out of scope**, không làm đợt này |

### Chi tiết lý do (giữ nguyên để tham chiếu)

**7.1 — `dashboardReportResetTime` xử lý thế nào?**
Setting này vừa build trong `admin/system-settings` (default 09:00), sau decision #2 thì Dashboard không dùng nữa. 3 lựa chọn: (a) xoá luôn field khỏi System Settings; (b) giữ, đổi nhãn thành "Operational day start" và để Statistics module dùng; (c) giữ nguyên, orphan. Tôi nghiêng (a) — setting không có consumer là nợ kỹ thuật, và nếu Statistics cần thì thêm lại lúc đó rõ ràng hơn.

**7.2 — Auto-refresh KPI:** poll data 30s cùng nhịp health-check, hay giữ fetch-once + nút Refresh tay? Dashboard vận hành thì tôi nghiêng auto-refresh 30s, nhưng cần biết backend chịu được không.

**7.3 — Week boundary:** `This Week` / `Last Week` tính Mon–Sun hay Sun–Sat?

**7.4 — Định nghĩa "Events Today":** overlap calendar day (khớp mockup, khớp số block timeline) hay đang-diễn-ra-lúc-này (logic `/api/events` hiện tại)? Xem §4.3.

**7.5 — Map layer pills** trong mockup: đã có trong `MapComponent` chưa, có nằm trong scope đợt này không? (§5)

---

## 8. Out of scope

- Admin tile customization (đã defer từ v1).
- Pre-filtered clickthrough (decision #4 chỉ yêu cầu navigate).
- Active NOPs số thật — chờ NOP module.
- Map behaviour changes — giữ đúng FSD v0.5.
- Statistics module.
