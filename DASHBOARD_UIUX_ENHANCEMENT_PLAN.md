# Operational Dashboard — UI/UX Enhancement Plan

> **Nguồn:** Client feedback on CMS Operational Dashboard (2026-08-17), đối chiếu `FRD_v0.5_extracted.txt` §2.4 (CMS Dashboard), §2.4.2 (Summary Metrics), §2.4.3–2.4.4 (Events/Map), §2.5.1 (Live Metric Feed to UCS).
> **Code hiện tại:** `src/app/page.tsx` (409 dòng), `src/app/admin/system-settings/page.tsx` (config pattern tham khảo).
> **Trạng thái:** Đã align hướng với Kyle (BA) — sẵn sàng lên kế hoạch code. Không có open item nào chặn.

---

## 0. TL;DR — Decision Log

| # | Feedback | Quyết định | Đối chiếu FSD v0.5 |
|---|---|---|---|
| 1 | Bỏ IIOC / Live Feed / In Process | Bỏ | Không mandate — an toàn |
| 2 | Giữ banner "Operational Dashboard" + "System Monitoring Active" | Giữ, nhưng phải là health-check thật | Không mandate, không conflict |
| 3 | Bỏ Filter by Date Range khỏi Dashboard chính | Bỏ hẳn, **không note deviation gửi Shin Feng** (đã Kyle xác nhận) | Lệch câu chữ literal §2.4.2 ("each filterable by date range") — chấp nhận deviation, không escalate |
| 4 | Admin chỉnh được tile | Ghi nhận, **Phase 2 / backlog**, không làm đợt này | Net-new, ngoài scope FSD |
| 5 | Tile giãn/lãng phí diện tích | Sửa layout, compact grid | UI polish, không conflict |
| 6 | "Active Cases" = số Incident/Fault/Task Controller chưa xử lý | **Tách thành tile mới "Pending Action"**, giữ "Active Cases" đúng nghĩa FSD | Không tái dùng tên đã có nghĩa khác trong FSD — xem mục C |
| 7 | Rename "Unclosed" → "Active" (Incidents/Faults) | Đổi label, giữ nguyên định nghĩa (≠ Closed) | Cosmetic, khớp thuật ngữ "open incidents/faults" ở §2.5.1 |
| 8 | Thứ tự 4 cột theo entity | Áp dụng, **giữ Overdue Tasks là tile riêng** (đã Kyle xác nhận, không gộp) | Overdue Tasks là 1/9 metric bắt buộc §2.4.2 — không được bỏ |
| 9 | Incidents/Faults Reported reset theo giờ cấu hình (tạm 9am) | Áp dụng, **chỉ cho 2 counter Reported** — Events Today & Active NOPs giữ nguyên theo calendar day (đã Kyle xác nhận) | Bổ sung hợp lý, tinh thần shift-based đã có tiền lệ ở FSD v0.5 (Duty Manager Elevation) |

---

## A. Header / Banner

- Bỏ: dòng phụ đề "Island Integrated Operations Centre (IIOC) • Live Feed", badge "IN PROCESS".
- Giữ: tiêu đề "OPERATIONAL DASHBOARD", và cụm "SYSTEM MONITORING ACTIVE".
- **Fix quan trọng:** hiện tại `live-pulse`/`pulse-dot` (dòng 119-123 `page.tsx`) là animation tĩnh, không phản ánh trạng thái thật. Cần đấu vào 1 health-check thực tế (vd. ping `/api/*` hoặc kiểm tra lần fetch dashboard data gần nhất có lỗi không) — nếu không, đèn xanh khi hệ thống down sẽ đánh lừa Controller. Nếu đợt này chưa làm health-check thật được, đề xuất tạm ẩn indicator thay vì hiển thị giả.

## B. Date Range Filter

Bỏ hẳn `metrics-filter-bar` (dòng 138-165) khỏi Dashboard chính. Lý do đã chốt: trong 9 metric FSD, chỉ 2 metric (Incidents Reported, Faults Reported) là period-based, 7 metric còn lại là snapshot theo status hiện tại — filter ngày trên toàn dashboard không có ý nghĩa nghiệp vụ rõ với phần lớn tile. Việc lọc theo kỳ (cho mục đích phân tích/báo cáo) đã có ở module **Operational Statistics** (§2.4.1 nav item) — không trùng lặp chức năng.

Deviation so với câu chữ §2.4.2 — đã confirm **không cần** note escalation riêng cho Shin Feng.

## C. Metric Definitions & Business Rules

### C1. Tile mới: "Pending Action"

Thay cho việc redefine "Active Cases", tạo **1 card riêng biệt, nổi bật** (không nằm trong lưới 9-metric-tile chuẩn), đặt gần khu Active Cases & Incidents list để Controller thấy ngay việc chưa cầm.

**Formula:** `Pending Action = countIncidentPending + countFaultPending + countTaskPending`

| Entity | Rule "chưa handled" | Căn cứ |
|---|---|---|
| Incident | `status === 'Live'` **OR** (`status === 'Live (Assigned)'` AND tất cả `IncidentResponder.lifecycleStatus === 'Assigned'`, chưa ai đạt `'Acknowledged'` trở lên) | `Incident.status` 5 giá trị (`db.ts` dòng 168), `ResponderLifecycleStatus` (dòng 129-135) |
| Fault | `status === 'Pending Submission'` | Fault model hiện chỉ có 2 status (`Pending Submission`→`Closed`, `db.ts` dòng 215, `faults/route.ts` dòng 41-42) — **trùng với Active Faults**, không tách được. Đã Kyle confirm OK dùng chung, không thêm status trung gian đợt này. |
| Task | `status ∈ {'Created', 'Assigned'}` (chưa tới `'Acknowledged'`) | `TaskStatus` (`db.ts` dòng 249-257) |

Mục tiêu nghiệp vụ: số này > 0 nghĩa là có việc Controller chưa động tới; mục tiêu vận hành là giữ ở 0.

**Lưu ý khi hiển thị:** dùng tông màu cảnh báo (đỏ/cam) khi > 0, xanh/neutral khi = 0, để đúng tinh thần "strive to have this at 0".

### C2. "Active Cases" — giữ nguyên định nghĩa FSD

`case.status === 'Active'` — không đổi nghĩa, không đổi công thức hiện tại (`page.tsx` dòng 98). Tile này ở lại lưới 9-metric như cũ.

### C3. "Active Incidents" / "Active Faults" — đổi label, giữ nguyên logic

Đổi tên hiển thị "Unclosed Incidents" → "Active Incidents", "Unclosed Faults" → "Active Faults". Công thức giữ nguyên `status !== 'Closed'` (dòng 100, 102) — chỉ đổi label, khớp thuật ngữ "open incidents/open faults" đã dùng ở FSD §2.5.1 (UCS live feed).

### C4. "Overdue Tasks" — giữ tile riêng

Không gộp vào "Active Tasks" như đã hỏi — giữ nguyên là 1 tile độc lập trong lưới, đúng công thức hiện tại (dòng 104).

## D. Layout đề xuất

**Spotlight card** (hàng riêng, ngay dưới header, trước lưới 9-metric): "Pending Action".

**Lưới 9-metric** (đúng đủ 9 theo FSD §2.4.2, nhóm theo entity như client đề xuất — Overdue Tasks nằm cùng cụm Task):

| Cụm Case/Task | Cụm Incident | Cụm Fault | Cụm NOP/Event |
|---|---|---|---|
| Active Cases | Active Incidents | Active Faults | Active NOPs |
| Active Tasks | Incidents Reported | Faults Reported | Events Today |
| Overdue Tasks | | | |

Responsive grid (`repeat(auto-fit, minmax(220px, 1fr))`), border-left accent màu theo cụm để phân nhóm trực quan, gap/padding giảm so với bản hiện tại (đang lãng phí diện tích).

## E. Reset Time cho "Reported" counters

- Chỉ áp dụng cho **Incidents Reported** và **Faults Reported**. **Events Today** và **Active NOPs** giữ nguyên theo calendar day — đã Kyle xác nhận.
- Thêm setting mới `dashboardReportResetTime` (mặc định `"09:00"`, format `HH:mm`) vào `admin/system-settings`, theo đúng pattern đang có (`autoSaveInterval`, `recordLockTimeout` — `system-settings/page.tsx` dòng 7-14, hiện lưu ở `localStorage`, prototype-level).
- "Reported hôm nay" = record được tạo trong khoảng `[reset time gần nhất đã qua, reset time kế tiếp)` thay vì mốc nửa đêm.
- Giá trị 9:00 AM là **tạm thời** — client có thể đổi sau; do đã làm cấu hình được nên không cần code lại khi đổi giá trị.

## F. Admin tile customization — Phase 2 / Backlog

Không nằm trong scope đợt này. Cần: data model layout-config theo role/user, admin UI riêng. Ghi nhận lại để ưu tiên hoá ở sprint sau, không chặn release lần này.

---

## G. Implementation Plan

**Phase 1 — Business logic**
1. Thêm hàm tính `pendingActionCount` (3 rule ở mục C1) trong `page.tsx` hoặc tách helper riêng nếu logic dùng lại ở nơi khác.
2. Đổi label "Unclosed Incidents/Faults" → "Active Incidents/Faults" (chỉ đổi text, không đổi biến/logic).
3. Thêm field `dashboardReportResetTime` vào `SystemSettings` interface + form UI trong `admin/system-settings/page.tsx`.
4. Viết lại logic "Incidents/Faults Reported" dùng reset-time window thay cho `inRange()` theo date picker hiện tại (dòng 85-95, 99).

**Phase 2 — UI**
5. Bỏ header phụ đề IIOC/Live Feed/In Process; đấu "System Monitoring Active" vào health-check thật (hoặc tạm ẩn nếu chưa làm kịp).
6. Bỏ `metrics-filter-bar` khỏi Dashboard chính.
7. Thêm spotlight card "Pending Action".
8. Re-layout lưới 9-metric theo nhóm cột ở mục D, giảm spacing.

**Phase 3 — Không chặn, làm sau**
9. Admin tile customization (mục F).

---

## H. Out of scope / đã loại trừ khỏi đợt này

- Escalation note gửi Shin Feng cho việc bỏ date-range filter — không cần, đã Kyle chốt trực tiếp.
- Thêm status trung gian cho Fault để tách "Pending Action" khỏi "Active Faults" — không làm đợt này, dùng chung theo model hiện tại.
- Admin-configurable dashboard layout — Phase 2/backlog.
