# Case Detail — Chuẩn hoá Operation Events Cards — Implementation Plan

> **Nguồn:** Yêu cầu trực tiếp từ Kyle (2026-07-16), kèm screenshot trang Case Detail hiện tại.
> **File chính bị ảnh hưởng:** `src/app/cases/[...id]/page.tsx` (component `CaseDetailPage`, dòng 506-675 — 4 card: Incident/Task/Fault/e-Diary; dòng 994-1083 — CSS scoped `<style jsx>` của trang).
> **Phạm vi:** Chỉ UI hiển thị (card layout + field mới). Không đổi API, không đổi luồng nghiệp vụ, không đổi quyền (role gating) của bất kỳ action nào trên trang.
> **Quyết định đã chốt với Kyle (2026-07-16)** — xem mục 3.
> **Cập nhật (2026-07-16, sau khi Kyle gửi screenshot bảng e-Diary Log):** e-Diary **không** áp dụng field bắt buộc `Title`/`Priority`/`Status` như 3 loại kia — Kyle chốt e-Diary chỉ cần đúng 4 field: `ID`, `Topic`, `Date & Time`, `Narrative` (khớp 100% với 4 cột đang có sẵn trên bảng e-Diary Log). Đã sửa lại toàn bộ mục 2, 3.2, 4.1, Phase 5 bên dưới cho khớp — xem mục 3.2 (đã viết lại).

---

## 0. TL;DR

| # | Việc cần làm | File | Mức độ |
|---|---|---|---|
| 1 | Xây field-row helper dùng chung (label:value grid + ellipsis + tooltip hover) | `page.tsx` (component nội bộ mới, không tách file) | Nhỏ |
| 2 | Chuẩn hoá lại Incident Card: tách `Type`/`Sub Type` riêng, thêm `Date of Incident` (đang thiếu hẳn) | `page.tsx` dòng 506-545 | Nhỏ |
| 3 | Chuẩn hoá lại Task Card: thêm `Task ID` (đang thiếu hẳn), thêm `Due Date`, gộp field vào layout chuẩn | `page.tsx` dòng 547-586 | Nhỏ-Trung bình |
| 4 | Chuẩn hoá lại Fault Card: thêm `Title` (derive), thêm `Priority` (N/A), tách `Fault Type`/`Fault Sub-type` riêng | `page.tsx` dòng 588-638 | Nhỏ-Trung bình |
| 5 | Chuẩn hoá lại e-Diary Card: hiển thị đúng 4 field `ID` / `Topic` / `Date & Time` (đầy đủ, đang chỉ có giờ) / `Narrative` — **không** có Priority/Status (Kyle chốt qua screenshot bảng e-Diary Log) | `page.tsx` dòng 640-675 | Trung bình |
| 6 | CSS mới cho grid field + ellipsis + `title` attribute tooltip, thêm vào `<style jsx>` cuối file | `page.tsx` dòng 994-1083 | Nhỏ |
| 7 | Verify: `npx tsc --noEmit`, test bằng data có chuỗi dài, test case rỗng/N/A | — | Nhỏ |

**Không có schema change / API change nào trong plan này** (xem quyết định mục 3).

---

## 1. Vấn đề hiện tại (đã verify trực tiếp trong code)

Trang Case Detail (`/cases/[id]`) có 4 "Operation Event" card trong `component-card-grid` (dòng 504-677), mỗi card đang tự bịa layout riêng, không theo chung 1 format:

| Card | Field đang hiển thị hôm nay | Field còn thiếu theo yêu cầu mới |
|---|---|---|
| 🚨 Incident (dòng 507-545) | ID, Title, Priority, Status (badge ở header), Classification (Type+SubType gộp 1 dòng), Location, Assigned Ranger | **Date of Incident** (field `dateTime` có sẵn trong data nhưng chưa render ra UI) |
| 🔧 Tasks (dòng 548-586) | Title, Status (badge), Assignee (avatar), Priority | **Task ID** (hoàn toàn chưa hiển thị), **Due Date** (field `dueDate` có sẵn nhưng chưa render) |
| 🛠 Faults (dòng 589-638) | ID (link), Status (badge), Fault Type + Sub Type (gộp 1 dòng), CMMS ticket (optional) | **Title** — Fault không có field này trong data model, **Priority** — Fault không có khái niệm priority trong data model/FRD |
| 📝 e-Diary (dòng 641-675) | Topic, giờ (chỉ giờ, không có ngày), content (không cắt dòng rõ ràng, không tooltip) | **ID** (hoàn toàn chưa hiển thị, so với bảng e-Diary Log đã có cột "E-Diary ID"), **Date & Time đầy đủ** (hiện chỉ show giờ, bảng Log đã có đủ ngày+giờ) — **không cần** Priority/Status |

Ngoài thiếu field, mỗi card còn dùng layout khác nhau: Incident dùng grid label:value 2 cột (`display:grid; gridTemplateColumns:'1fr 1fr'`, dòng 517), Task dùng 1 dòng flex + 1 dòng meta (dòng 563-570), Fault dùng block xếp dọc không grid (dòng 602-621), e-Diary dùng block xếp dọc kiểu khác nữa (dòng 654-660). Đây chính là gốc rễ của việc "hiển thị không đồng bộ theo 1 format" mà Kyle nói.

---

## 2. Target — Field spec chuẩn cho từng loại Event

**Field bắt buộc (Incident / Task / Fault):** `ID`, `Title`, `Priority`, `Status`.
**Ngoại lệ — e-Diary:** không dùng bộ 4 field bắt buộc ở trên. Kyle chốt riêng (screenshot bảng e-Diary Log, 2026-07-16): e-Diary chỉ cần đúng `ID`, `Topic`, `Date & Time`, `Narrative` — không có Priority, không có Status, và không gộp Topic thành "Title" (giữ tên field đúng là "Topic", khớp tên cột trên bảng e-Diary Log).
**Field riêng theo loại (ngoài field bắt buộc):** theo đúng yêu cầu gốc của Kyle.

| Loại | Field bắt buộc | Nguồn dữ liệu | Field riêng | Nguồn dữ liệu |
|---|---|---|---|---|
| Incident | ID, Title, Priority, Status | `inc.id`, `inc.title`, `inc.priority`, `inc.status` (đã có, chỉ cần format lại) | Type, Sub Type, Date of Incident, Assigned Ranger | `inc.type`, `inc.subType`, `inc.dateTime` (**mới thêm vào UI**), `inc.assignedTo` (đã có) |
| Task | ID, Title, Priority, Status | `t.id` (**mới thêm vào UI**), `t.title`, `t.priority`, `t.status` (đã có) | Due Date, Assignee | `t.dueDate` (**mới thêm vào UI**), `t.assignee` (đã có, giữ nguyên `RespondersAvatars`) |
| Fault | ID, Title, Priority, Status | `f.id` (đã có), **Title = derive** `` `${f.faultType} — ${f.faultSubType}` `` (field mới, xem mục 3.1), **Priority = "—"** (N/A, xem mục 3.1), `f.status` (đã có) | Fault Type, Fault Sub-type | `f.faultType`, `f.faultSubType` (đã có, tách thành 2 dòng riêng thay vì gộp) |
| e-Diary *(4 field riêng, không theo bộ bắt buộc)* | — | — | ID, Topic, Date & Time, Narrative | `log.id` (**mới thêm vào UI**), `log.topic` (đã có, giữ nguyên tên field), `log.dateTime` render đầy đủ ngày+giờ (hiện chỉ có giờ), `log.content` → label lại là "Narrative" |

---

## 3. Quyết định đã chốt với Kyle (2026-07-16) — xử lý data-model gap

Fault và Occurrence (e-Diary) trong `src/lib/db.ts` không có sẵn field `title`/`priority`/`status` như Incident/Task. Đã chốt hướng xử lý **không đổi schema** để giữ plan này gọn — chỉ đổi UI:

### 3.1 Fault — Title & Priority
- **Title**: derive tại UI, không lưu DB: `` `${f.faultType} — ${f.faultSubType}` ``. Không sửa `Fault` interface, không sửa API, không sửa `FaultCreateModal`.
- **Priority**: hiển thị `"—"` (N/A) vì Fault chưa có khái niệm priority trong FRD/data model hiện tại. Không derive từ Incident liên kết (đơn giản hoá — Kyle đã chọn phương án derive-only, không có "Priority theo Incident liên kết").
- **Rủi ro đã biết:** nếu sau này SDC/FRD thật sự cần Priority cho Fault (vd. để CMMS ưu tiên xử lý), sẽ cần quay lại làm schema change riêng — không nằm trong phạm vi plan này.

### 3.2 e-Diary — chỉ 4 field, không theo bộ bắt buộc (đã chốt lại 2026-07-16 qua screenshot)
Kyle gửi screenshot bảng **e-Diary Log** (tab e-Diary, `EDiaryTab.tsx`) — bảng này đã có sẵn đúng 4 cột: **E-Diary ID, Topic, Date & Time, Narrative**, và Kyle xác nhận đây chính là 4 field cần cho card e-Diary trên Case Detail. Điều này ghi đè lại phương án ban đầu ("Title = Topic, Priority/Status = N/A") — thay vì cố nhét e-Diary vào khuôn 4-field-bắt-buộc, **e-Diary là ngoại lệ**, dùng đúng bộ field riêng của bảng Log hiện có:
- **ID** — `log.id`, mono-badge giống Fault/Incident.
- **Topic** — `log.topic`, giữ nguyên tên "Topic" (không đổi thành "Title").
- **Date & Time** — `log.dateTime`, render đầy đủ ngày + giờ (hiện tại card chỉ render giờ qua `toLocaleTimeString`, dòng 657).
- **Narrative** — `log.content`, đổi label hiển thị từ không-có-label thành "Narrative" (khớp tên cột trên bảng Log).
- **Không** hiển thị Priority, không hiển thị Status, kể cả dạng "—" — vì bảng e-Diary Log (nguồn tham chiếu Kyle chỉ định) không có 2 cột này.
- **Lợi ích phụ:** card Case Detail giờ khớp 1-1 với bảng e-Diary Log đã có sẵn → không cần định nghĩa field mới, không cần derive gì cả, rủi ro thấp nhất trong cả 4 card.

---

## 4. Thiết kế UI — layout chuẩn dùng chung

Giữ nguyên vị trí 4 card, kích thước card, header (icon + tên card), scroll behavior, action row (nút "+ Log...", link "Go to...") — **không đổi** phần khung ngoài, chỉ chuẩn hoá phần **nội dung bên trong mỗi item**.

### 4.1 Anatomy chuẩn cho 1 "event item" (áp dụng cho Incident/Task/Fault — item đơn hoặc trong list)

> **e-Diary dùng anatomy riêng, đơn giản hơn** — xem cuối mục 4.1: row `ID` (không kèm Status), row `Topic` (thay Title), grid 2 cột `Date & Time | (trống)`, dòng `Narrative` full-width. Không có row Priority/Status.

```
┌───────────────────────────────────────────┐
│ [ID mono-badge]                 [Status badge] │  ← row 1: ID trái, Status phải
│ Title (bold, 1 dòng, ellipsis + tooltip)        │  ← row 2
│ ┌───────────────┬───────────────┐               │
│ │ Priority: X    │ <Field riêng 1>: Y │           │  ← row 3: grid 2 cột
│ │ <Field riêng 2>: Z │ <Field riêng 3>: W │        │  ← row 4: grid 2 cột (nếu có)
│ └───────────────┴───────────────┘               │
└───────────────────────────────────────────┘
```

Đây thực chất là **tổng quát hoá layout Incident card hiện tại** (dòng 517-523, `display:grid; gridTemplateColumns:'1fr 1fr'`) — vì Incident đã gần đúng chuẩn nhất, chỉ cần áp dụng lại layout này cho Task/Fault/e-Diary.

### 4.2 Field-row helper dùng chung (component nội bộ mới trong `page.tsx`)

Thêm 1 component nhỏ cạnh `InfoRow` (dòng 38-45) để tái sử dụng cho cả 4 card, tránh lặp JSX 4 lần:

```tsx
function OpEventField({ label, value }: { label: string; value: React.ReactNode }) {
  const isString = typeof value === 'string';
  return (
    <div className="oe-field">
      <span className="oe-field-label">{label}:</span>
      <span
        className="oe-field-value"
        title={isString && value ? value : undefined}  // hover → full text
      >
        {value || <span style={{ color: 'var(--text-faint)' }}>—</span>}
      </span>
    </div>
  );
}
```

- Dùng thuộc tính HTML `title` gốc của trình duyệt để show full text khi hover — **không cần build custom tooltip component**, đáp ứng đúng yêu cầu "hover thì show full text" của Kyle với rủi ro/effort thấp nhất.
- `value` rỗng/`undefined` → tự động render `"—"` — dùng chung cho case N/A (Fault Priority, e-Diary Priority/Status).

### 4.3 CSS mới (thêm vào `<style jsx>` cuối file, cạnh `.cd-info-row` dòng 1066-1074)

```css
.oe-id-status-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
.oe-title {
  font-size: 12.5px; font-weight: 600; color: var(--text-main);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 6px; cursor: default;
}
.oe-field-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 4px 12px; font-size: 11px; color: var(--text-muted);
}
.oe-field { display: flex; gap: 4px; overflow: hidden; cursor: default; }
.oe-field-label { flex-shrink: 0; font-weight: 600; color: var(--text-muted); }
.oe-field-value {
  color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
```

Field nào cần full-width (vd. e-Diary `Narrative`, dài hơn 1 dòng lý tưởng) dùng thêm class `.oe-field--full { grid-column: 1 / -1; }`.

---

## 5. Implementation Plan theo Phase

### Phase 1 — Field-row helper & CSS nền tảng
1. Thêm `OpEventField` component (mục 4.2) cạnh `InfoRow`, dòng ~46.
2. Thêm CSS mới (mục 4.3) vào `<style jsx>`, cạnh `.cd-info-row`.
3. Thêm helper format ngày giờ đầy đủ dùng chung (nếu chưa có sẵn helper nào tương tự) — vd. `formatFullDateTime(iso: string)` trả về `"16 Jul 2026, 15:57"` — dùng cho Incident `Date of Incident`, Task `Due Date`, e-Diary `Date & Time`.

### Phase 2 — Incident Card (dòng 506-545)
4. Đổi dòng `<strong>Classification:</strong> {inc.type} • {inc.subType}` → tách 2 dòng riêng `OpEventField label="Type"` và `OpEventField label="Sub Type"`.
5. Thêm `OpEventField label="Date of Incident" value={formatFullDateTime(inc.dateTime)}`.
6. Đổi title (dòng 516, hiện là `<div>{inc.title}</div>` không ellipsis/tooltip) sang dùng class `.oe-title` (ellipsis + `title` attribute).
7. Giữ nguyên `Location` (không nằm trong yêu cầu field mới nhưng đang có sẵn — không xoá, xếp cuối grid).
8. Đổi `<strong>Priority:</strong> {inc.priority}` sang `OpEventField label="Priority" value={inc.priority}` để đồng bộ style với 3 card kia.

### Phase 3 — Task Card (dòng 547-586)
9. Thêm dòng ID mới ở đầu mỗi task item: mono-badge giống Fault (dòng 604), dùng `t.id`, link tới `/tasks/${t.id}` (đã có sẵn onClick cho cả item — giữ nguyên click cả item, thêm ID text hiển thị không cần làm link riêng để tránh nested-link).
10. Đổi bố cục item (dòng 561-571) sang anatomy chuẩn mục 4.1: row ID+Status, row Title (ellipsis+tooltip qua class `.oe-title`), grid `Priority | Due Date`, dòng Assignee riêng (giữ `RespondersAvatars`, đã trực quan hơn text nên không đổi thành `OpEventField`).
11. Thêm `OpEventField label="Due Date" value={formatFullDateTime(t.dueDate)}`.

### Phase 4 — Fault Card (dòng 588-638)
12. Thêm dòng Title derive (mục 3.1) ngay dưới row ID+Status hiện tại (dòng 604-608), dùng class `.oe-title`.
13. Thêm `OpEventField label="Priority" value={undefined}` → tự render `"—"`.
14. Tách dòng `{f.faultType} — {f.faultSubType}` (dòng 609) thành `OpEventField label="Fault Type"` + `OpEventField label="Fault Sub-type"` trong `.oe-field-grid`.
15. Giữ nguyên khối CMMS ticket (dòng 610-620) — không nằm trong yêu cầu, không đổi.

### Phase 5 — e-Diary Card (dòng 640-675)
> Đã chốt lại 2026-07-16 (mục 3.2): e-Diary dùng đúng 4 field `ID / Topic / Date & Time / Narrative`, **không** có Priority/Status.
16. Thêm dòng ID mới (mono-badge, `log.id`) — hiện hoàn toàn chưa có trên card này (chỉ có trong Audit Trail sidebar). Đặt ở row đầu tiên của item, không kèm badge Status bên phải (khác Incident/Task/Fault).
17. Đổi dòng `<span>{log.topic}</span>` (dòng 656) sang class `.oe-title` (ellipsis+tooltip) nhưng **giữ nguyên label/ý nghĩa là Topic**, không đổi copy thành "Title".
18. Đổi field giờ-only (dòng 657, `toLocaleTimeString`) → `OpEventField label="Date & Time" value={formatFullDateTime(log.dateTime)}` (đầy đủ ngày+giờ, dùng lại helper Phase 1).
19. Đổi đoạn preview nội dung (dòng 659, `<p>{log.content}</p>`, hiện đã có `whiteSpace:nowrap; textOverflow:ellipsis` nhưng KHÔNG có `title` tooltip) → `OpEventField label="Narrative" value={log.content}` (full-width, class `.oe-field--full`, thừa hưởng tooltip từ helper).
20. **Không** thêm field Priority/Status cho e-Diary (khác 3 card kia) — bỏ hẳn 2 bước này so với bản draft trước.
21. Vì mỗi e-Diary item hiện đang giới hạn `.slice(-2)` (chỉ 2 log gần nhất) và card cao hơn các card khác 1 chút do nhiều field hơn — kiểm tra lại `maxHeight: 220px` của `.comp-card-body` (dòng 647) có cần scroll sớm hơn không, chỉnh nếu bị tràn.

### Phase 6 — Verification
23. `npx tsc --noEmit` — đảm bảo không lỗi type.
24. Test thủ côn