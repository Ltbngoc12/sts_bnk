# Recurrence — Generation Engine + Edit Template — Build Plan

> Phạm vi: build **generation engine** (sinh occurrence thật) **và** **edit recurrence template** trong cùng một đợt.
> Nền tảng: Task Module (Sentosa / sts-bnk), FRD 7.1.2 + các chốt của Shin Feng. Model A đã chọn (1 task = 1 occurrence + trang Series).
> Ngày lập: 2026-07-05.

---

## 1. Decision Log (đã chốt với BA)

| # | Chủ đề | Quyết định |
|---|--------|-----------|
| 1 | Bối cảnh | Build **generation engine + edit template cùng lúc**. |
| 2 | Nguồn dữ liệu & nơi sửa | Template sống ở **`RecurrenceSeries` (source of truth)**. Edit qua shortcut trên card task detail → mở modal/trang Series. Migrate `task.recurrence` inline hiện tại sang Series. |
| 3 | Quyền | **Chỉ Controller+**, và **chỉ khi series còn Active**. Series cancelled/ended → khoá edit. |
| 4 | Reconcile lõi | **Giữ occurrence đã sinh**; config mới **chỉ áp cho occurrence sinh mới**, giới hạn bởi Effective Date. |
| 5 | Thu hẹp (end sớm / giảm count) | Xử lý qua Effective Date: occurrence ngày ≥ Effective Date **và chưa có action** → có thể xoá; đã action → giữ. |
| 6 | Effective Date | **Tự động = ngày mai (today + 1)**. Cố định, không cho user chỉnh. |
| 7 | Định nghĩa "đã có action" (được bảo vệ) | Occurrence ở **bất kỳ status nào khác `Assigned` / `Returned`**. Chỉ Assigned/Returned mới bị xoá & sinh lại. |
| 8 | Occurrence trước Effective Date | **Đóng băng hoàn toàn** — không đụng gì, bất kể config mới. |
| 9 | Field được sửa | **Sửa tất cả, kể cả Frequency.** Đổi frequency → sinh lại từ Effective Date theo pattern mới. |
| 10 | Thông báo | ⏸️ **HOLD — làm sau, không nằm trong đợt build này.** Định hướng: notify assignee bị ảnh hưởng (in-app). Trước mắt chỉ ghi audit trên series. |
| 11 | Luồng lưu | **Lưu trực tiếp, không preview modal.** Save = apply luôn. |

---

## 2. Nguyên tắc reconcile (rút gọn thành 1 luật)

Đặt `E = Effective Date = today + 1` tại thời điểm bấm Save.

Với mỗi occurrence hiện có của series:

```
if occurrence.date < E:
    → GIỮ NGUYÊN, không đụng (đóng băng).           # Decision #8
else:  # occurrence.date >= E
    if occurrence.status in {Assigned, Returned}:
        → SOFT-DELETE, sẽ được sinh lại theo config mới.  # Decision #5, #7
        # notify assignee: HOLD — làm sau (Decision #10).
    else:  # đã có action
        → GIỮ NGUYÊN (chạy hết vòng đời của nó).       # Decision #7
        → đánh dấu detachedFromSeries = true nếu ngày
          không còn khớp pattern mới (để hiển thị trung thực).
```

Sau khi dọn, **generation engine** sinh occurrence mới từ `max(E, startDate)` tới hết lead-window theo config mới, **bỏ qua các ngày đã có occurrence được giữ** (tránh trùng).

Bản chất: Effective Date cắt series thành 2 nửa — **quá khứ + hôm nay = bất khả xâm phạm**, **từ mai trở đi = vùng có thể tái sinh** (trừ những cái đã có người làm).

---

## 3. Data Model

### 3.1 Entity mới: `RecurrenceSeries` (`db.ts`)

```ts
export interface RecurrenceSeries {
  id: string;                       // series-xxxx
  caseId: string;                   // Case chứa series
  config: RecurrenceConfig;         // template hiện hành (tái dùng type sẵn có)
  status: 'Active' | 'Ended' | 'Cancelled';
  createdBy: string;
  createdDate: string;
  lastGeneratedDate?: string;       // mốc generation gần nhất (idempotent)
  audits: TaskAudit[];              // lịch sử sửa template
  // Template gốc — thông tin dùng để đúc mỗi occurrence:
  taskTemplate: {
    title: string;
    description?: string;
    priority: 'High' | 'Normal';
    assignee: string;
    assigneeType?: 'user' | 'group';
    checklist?: TaskChecklistItem[];
  };
}
```

### 3.2 Sửa `Task`
- Giữ `seriesId`, `occurrenceDate`, `isRecurringInstance`, `detachedFromSeries` (đã có).
- **Bỏ dần** `task.recurrence` inline (chỉ để migrate). Occurrence mới chỉ trỏ `seriesId`.
- Task "template cũ" (đang giữ `recurrence` inline) → migrate: tạo `RecurrenceSeries` từ nó, task đó trở thành occurrence đầu tiên hoặc chỉ còn là anchor.

### 3.3 Migration
Script một lần: mọi task có `task.recurrence` → tạo `RecurrenceSeries` tương ứng, set `seriesId`, giữ `recurrence` inline dạng read-only cho tới khi UI cũ gỡ hẳn.

---

## 4. Generation Engine

### 4.1 Vị trí
- Hàm thuần `generateOccurrences(series, fromDate, windowEnd)` trong `src/lib/recurrence.ts` (tái dùng thuật toán `previewOccurrences` đã có trong `RecurrenceScheduleField.tsx` — tách ra lib chung để cả preview lẫn engine dùng một nguồn).
- Trigger sinh: (a) khi tạo series, (b) khi edit series, (c) job định kỳ (cron/route được gọi định kỳ) để đẩy lead-window về phía trước mỗi ngày.

### 4.2 Luật sinh (giữ đúng W3 hiện tại)
- Không backfill: `cursor = max(startDate, today)`.
- Chỉ sinh trong `[fromDate, today + leadTimeDays]`.
- Áp end-condition: `never` / `onDate` / `afterCount`.
- Monthly day 29–31 → fallback ngày cuối tháng ngắn (đã có).
- **Idempotent**: trước khi tạo occurrence cho một ngày, kiểm tra đã tồn tại occurrence (giữ) cho ngày đó chưa → nếu có thì bỏ qua.
- Mỗi occurrence = 1 Task riêng, có Case riêng (theo Model A), status khởi tạo `Assigned`.

---

## 5. Edit Flow

### 5.1 UI
- **Trang Series** (`/series/[id]`) — làm trong đợt này (Model A). Nội dung: header template (config hiện hành + status), form edit template (tái dùng `RecurrenceScheduleField`), và **danh sách occurrence** của series (đã sinh / đã đóng băng / soft-deleted ẩn hoặc mờ), mỗi dòng link sang task detail của occurrence.
- Card **RECURRENCE TEMPLATE** trên task detail: thêm nút **Edit** + link **"Xem series"** (chỉ Controller+ mới thấy Edit; điều kiện series Active). Cả hai điều hướng sang trang Series.
- Bấm **Save** trên trang Series → gọi API, apply ngay (không preview — Decision #11). Toast xác nhận + số occurrence bị ảnh hưởng; danh sách occurrence refresh tại chỗ.

### 5.2 API
Thêm action `edit-series` (hoặc route `PATCH /api/series/[id]`):

```
1. Guard: actor là Controller+; series.status === 'Active'. Nếu không → deny.
2. Validate config mới (weekly ≥1 weekday; endDate ≥ startDate; count ≥1; startDate không lùi về quá khứ).
3. E = today + 1.
4. Reconcile occurrences theo luật ở §2:
     - date < E            → giữ.
     - date >= E, Assigned/Returned → thu thập để xoá, gom assignee để notify.
     - date >= E, đã action → giữ; set detachedFromSeries nếu lệch pattern.
5. Soft-delete batch occurrence Assigned/Returned (đánh dấu deleted, giữ bản ghi + Case để truy vết).
6. Cập nhật series.config = config mới.
7. Gọi generateOccurrences(series, E, today + leadTime) — bỏ qua ngày đã có occurrence giữ.
8. [HOLD — làm sau] Notify từng assignee bị ảnh hưởng (in-app).
9. pushAudit(series, actor, 'Template edited', diff old→new + "N occurrences regenerated, M protected").
10. Nếu config mới khiến series đã hết hạn (onDate < E hoặc đủ count) → series.status = 'Ended'.
```

---

## 6. Notification ⏸️ HOLD — làm sau, KHÔNG nằm trong đợt build này

> Giữ lại làm định hướng cho lần sau. Đợt build hiện tại chỉ ghi audit trên series, không phát notification.

- (Sau) Cần entity/notification store tối thiểu: `{ id, userId, type, message, taskId?, seriesId?, read, createdAt }`.
- (Sau) Sự kiện phát: "Occurrence ngày X của bạn đã bị gỡ do template được cập nhật."
- (Sau) Chuông thông báo trên header (đã có badge số ở góc phải theo screenshot) đọc từ store này.

---

## 7. Edge Cases phải test

| Case | Kỳ vọng |
|------|---------|
| Đổi Daily → Weekly(Tue) | Occurrence Assigned ngày ≥ E bị xoá & sinh lại đúng thứ Ba; occurrence < E giữ; occurrence In Progress ≥ E giữ + detached nếu không phải thứ Ba. |
| Kéo endDate sớm hơn E | Không sinh thêm; occurrence Assigned ngày > endDate mới (và ≥ E) bị xoá; occurrence đã action giữ. |
| Giảm occurrenceCount | Đếm lại từ đầu chuỗi; occurrence Assigned vượt count mới & ≥ E bị xoá. |
| Kéo dài / tăng count / dời endDate ra xa | Sinh thêm occurrence mới trong lead-window. |
| Đổi leadTimeDays lớn hơn | Sinh thêm về phía trước. Nhỏ hơn → không xoá cái đã sinh < E; chỉ giới hạn sinh mới. |
| Occurrence hôm nay (date < E) | Luôn giữ, kể cả Assigned. |
| Toàn bộ occurrence ≥ E đều đã action | Không xoá gì; chỉ đổi config cho lần sinh sau. |
| Series Cancelled/Ended | Nút Edit ẩn/khoá; API trả deny. |
| Weekly bỏ hết weekday khi Save | Validate chặn, không cho lưu. |
| Đổi startDate về quá khứ | Chặn (giữ luật no-backfill). |
| Idempotent generation chạy 2 lần | Không tạo occurrence trùng ngày. |
| Assignee bị xoá occurrence | Occurrence được soft-delete, còn truy vết trong audit. (Notification: hold, làm sau.) |

---

## 8. Files sẽ đụng

| File | Thay đổi |
|------|----------|
| `src/lib/db.ts` | Thêm `RecurrenceSeries`, notification type; điều chỉnh Task; migration. |
| `src/lib/recurrence.ts` (mới) | Tách `previewOccurrences` + `generateOccurrences` + `reconcileOnEdit`. |
| `src/components/RecurrenceScheduleField.tsx` | Import thuật toán từ lib chung (bỏ trùng lặp). |
| `src/app/api/series/[id]/route.ts` (mới) | GET series (config + occurrence list) + `edit-series` (guard + reconcile). |
| `src/app/series/[id]/page.tsx` (mới) | Trang Series: header template, form edit, danh sách occurrence. |
| `src/app/api/tasks/route.ts` | Tạo task recurring → tạo Series + sinh lead-window đầu tiên. |
| `src/app/tasks/[...id]/page.tsx` | Nút Edit trên card template; mở Series editor; toast. |
| `src/app/api/cron/generate/route.ts` (mới) | Job đẩy lead-window mỗi ngày. |
| `globals.css` | Style cho editor + notification. |

---

## 9. Phasing đề xuất

1. **P1 — Data & lib**: `RecurrenceSeries`, migration, tách `recurrence.ts`, `generateOccurrences` idempotent + unit test.
2. **P2 — Generation on create**: tạo task recurring → sinh occurrence thật trong lead-window. Bỏ banner "generation is a later phase".
3. **P3 — Cron/lead-window advance**: job sinh dần theo ngày.
4. **P4a — Edit series + reconcile**: API `edit-series`, luật §2 (soft-delete).
5. **P4b — Trang Series** (`/series/[id]`): header template + form edit + danh sách occurrence; nút Edit / link "Xem series" từ task detail; toast.
6. **P5 — Test toàn bộ edge case §7** (viết test tự động cho `reconcileOnEdit`).
6. ~~P6 — Notification~~ ⏸️ **HOLD — làm sau, ngoài scope đợt này** (store + chuông + phát sự kiện khi reconcile xoá occurrence).

---

## 10. Open items (cần chốt thêm khi vào build)

- ⏸️ **[HOLD] Notification — làm sau, ngoài scope đợt build này.** Đợt này chỉ ghi audit trên series. Khi làm sẽ chốt: chuông header là thật hay mock, làm mới store hay nối cái có sẵn.
- ✅ **[CHỐT] Occurrence bị xoá dùng SOFT-DELETE** (đánh dấu deleted, giữ bản ghi + Case để truy vết audit).
- ✅ **[CHỐT] Làm luôn trang Series trong đợt này** — không chỉ modal. Trang Series là folder liệt kê các occurrence của series + là nơi edit template. Xem §5.1, §8, §9 (P4b).
