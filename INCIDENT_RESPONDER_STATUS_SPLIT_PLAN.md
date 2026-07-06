
# Incident/Responder Status Split — Implementation Plan

> **Nguồn quyết định:** `Incident_Status_Model_Design_Updated.docx` (bản đã cập nhật theo feedback Shin Feng, 2026-07-06).
> **Đối chiếu với:** `src/`, `prisma/schema.prisma` của `sts-bnk` (Sentosa) tại thời điểm 2026-07-06.
> **Trạng thái:** Draft để review trước khi code.
> **Lưu ý liên quan:** Repo đã có `FSD_V0.5_ENHANCEMENT_PLAN.md` (cùng ngày) bàn về việc bỏ `Live (Completed)` và thêm `Pending Controller Review` ở **Incident-level, single-status**. Plan này đi xa hơn: tách hẳn thành **hai trục status song song** (Incident-level + Responder-level). Hai plan **cùng đụng** vào `IncidentStatus` enum và cùng file `route.ts` — xem mục 5 (Rủi ro & phụ thuộc) trước khi bắt tay code cả hai.

---

## 0. TL;DR

| # | Thay đổi | Mức độ ảnh hưởng code |
|---|----------|------------------------|
| 1 | Tách **Incident-level status** (Controller-driven, 5 giá trị: Live → Live (Assigned) → Pending Endorsement → Returned/Closed) khỏi **Responder-level status** (per-assignment, chạy song song) | **Rất lớn** — hiện tại toàn bộ hệ thống chỉ có 1 field `Incident.status` dùng chung cho mọi Responder |
| 2 | Thêm status `Completed` ở Responder-level, set khi Controller submit/resubmit endorsement, áp dụng cho **mọi** Responder bất kể đang ở stage nào (kể cả Force Submit khoá dở) | **Lớn** — cần enum mới + logic set hàng loạt |
| 3 | Return (Live (Incomplete)) chuyển từ áp dụng toàn bộ Responder sang **per-Responder, multi-select**, mỗi Responder có **Completion Remarks riêng** | **Lớn** — modal "Return to Responder" hiện tại là 1 textarea dùng chung, không có chọn Responder |
| 4 | Force Submit: Controller submit lên Pending Endorsement bất kỳ lúc nào, không cần chờ đủ Responder, chỉ cần confirm popup (không cần justification) | **Trung bình** — action `submit-endorsement` hiện đã gate theo status nhưng chưa có khái niệm "force" |
| 5 | Responder Progress indicator (`2/3 On-Site`) — display-only, không tham gia workflow/permission | **Nhỏ** — thuần derive từ mảng `responders[]` có sẵn, không cần field mới |
| 6 | Role/Permission Matrix (3.3.1) | **Chưa làm** — Kyle đã chốt defer, không nằm trong scope plan này |

---

## 1. Hiện trạng code (điểm mấu chốt trước khi code)

### 1.1 Datastore thật sự là MongoDB, không phải Prisma
`src/lib/db.ts` + `src/lib/mongodb.ts` là nơi đọc/ghi dữ liệu thật (`getDb`/`saveDb`). Grep toàn `src/` không có bất kỳ `PrismaClient`/`prisma.` nào được gọi — `prisma/schema.prisma` hiện **không được dùng ở runtime**. Nghĩa là: sửa `schema.prisma` là việc "nên làm cho đồng bộ tài liệu/tương lai", nhưng **toàn bộ logic thật phải sửa trong `db.ts` + API route**, không phải Prisma migration.

### 1.2 `IncidentResponder` chỉ track assignment, chưa track lifecycle
`src/lib/db.ts` dòng 125-130:
```ts
export interface IncidentResponder {
  responderId: string;
  assignedBy: string;
  assignedAt: string;
  status: 'Active' | 'Removed'; // chỉ là trạng thái ASSIGNMENT, không phải lifecycle
}
```
`status` ở đây trả lời câu hỏi "Responder này còn được assign hay đã bị gỡ", hoàn toàn khác với "Responder này đang Acknowledged/On-Site/...". **Chưa có field nào lưu lifecycle status theo từng Responder** — đây là gap lớn nhất, đúng như mô tả "vấn đề gốc" trong tài liệu.

### 1.3 `Incident.status` là single field dùng chung cho mọi Responder
`src/app/api/incidents/[...id]/route.ts`: các action `acknowledge` (dòng 295-303), `on-site` (306-314), `notify-complete` (317-326), `complete` (329-339) đều đọc/ghi thẳng `incident.status` — không có tham số `responderId` nào cả. Nếu Incident có 2 Responder, Responder B bấm "Acknowledge" sẽ đổi `incident.status` chung, ghi đè tiến độ Responder A — đúng bug đã nêu trong tài liệu.

### 1.4 Danh tính Responder đang thao tác **có thể xác định được**
`src/context/RoleContext.tsx`: mỗi phiên có `username` (vd `"Ranger John"`) trùng định dạng với `responderId` trong `incident.responders[]`. Đây là điểm thuận lợi — không cần xây mới cơ chế định danh, chỉ cần match `username === responderId` để biết Ranger nào đang thao tác trên Incident có nhiều Responder.

### 1.5 "Return to Responder" hiện tại: 1 textarea dùng chung, không chọn Responder
`src/app/incidents/[...id]/page.tsx` dòng 3495-3528 — modal chỉ có 1 field `returnToResponderRemarks`, gọi `performAction('return-to-responder', { returnRemarks })`, và route dòng 421-430 set thẳng `incident.status = 'Live (Incomplete)'` cho toàn bộ Incident. Không có multi-select Responder, không có remarks riêng từng người.

### 1.6 Chưa có khái niệm Force Submit
`submit-endorsement` (route dòng 342-350) chỉ check Incident đang ở `Live (Pending Controller Review)` / `Live (Completed)` / `Returned` — tức đã **gián tiếp cho phép submit sớm** nếu status hiện tại đã ở 1 trong 3 giá trị đó, nhưng **không có cơ chế bỏ qua** khi còn Responder chưa tới `Pending Controller Review` (vì hiện tại status là field chung, "chưa tới" không thể xảy ra song song với "đã tới"). Khi tách Responder-level, Force Submit cần logic thật: submit bất chấp một số Responder còn ở Assigned/Acknowledged/On-Site.

### 1.7 Migration/normalization đã có sẵn chỗ để mở rộng
`src/lib/db.ts` hàm `hydrateDb()` (dòng 428-467) là nơi chuẩn hoá dữ liệu cũ mỗi lần load DB (map status cũ, đảm bảo `responders[]` tồn tại...). Đây chính là chỗ thêm logic backfill lifecycle status cho dữ liệu Incident hiện có khi migrate sang model mới.

---

## 2. Data model changes

### 2.1 `src/lib/db.ts` — mở rộng `IncidentResponder`
```ts
export type ResponderLifecycleStatus =
  | 'Assigned'
  | 'Acknowledged'
  | 'On-Site'
  | 'Pending Controller Review'
  | 'Live (Incomplete)'
  | 'Completed';

export interface IncidentResponder {
  responderId: string;
  assignedBy: string;
  assignedAt: string;
  status: 'Active' | 'Removed';           // giữ nguyên — assignment status
  lifecycleStatus: ResponderLifecycleStatus; // MỚI — per-Responder workflow status
  acknowledgedAt?: string;
  onSiteAt?: string;
  pendingReviewAt?: string;
  completedAt?: string;
  completionRemarks?: string;             // MỚI — remark riêng khi bị return (per-Responder)
  returnedAt?: string;
  returnedBy?: string;
}
```

### 2.2 `Incident.status` — rút gọn còn 5 giá trị
```ts
// status: "Live" | "Live (Assigned)" | "Pending Endorsement" | "Returned" | "Closed"
```
Bỏ hẳn `Live (Acknowledged)`, `Live (On-Site)`, `Live (Incomplete)`, `Live (Completed)` khỏi `Incident.status` — các giá trị này chuyển xuống `IncidentResponder.lifecycleStatus`. Field `completionRemarks` hiện có trên `Incident` **giữ nguyên** (dùng cho DM return / closure remarks ở Incident-level) — không nhầm với `completionRemarks` mới ở per-Responder.

### 2.3 Migration trong `hydrateDb()`
Thêm bước backfill ngay sau đoạn map `finalResponders` (dòng 440-446 hiện tại): với mỗi Incident cũ, suy ra `lifecycleStatus` cho từng Active Responder dựa trên `inc.status` cũ (vì dữ liệu cũ không phân biệt responder), ví dụ:
- `Live`, `Live (Assigned)` → `Assigned`
- `Live (Acknowledged)` → `Acknowledged`
- `Live (On-Site)` → `On-Site`
- `Live (Pending Controller Review)` → `Pending Controller Review`
- `Live (Incomplete)` → `Live (Incomplete)`
- `Live (Completed)`, `Pending Endorsement`, `Returned`, `Closed` → `Completed`

Đồng thời map lại `inc.status` cũ về 1 trong 5 giá trị mới (`Live (Acknowledged)/On-Site/Incomplete` → `Live (Assigned)`; `Live (Completed)` → `Pending Endorsement` nếu đã từng submit, giữ nguyên nếu chưa — cần confirm với dữ liệu thật, xem mục Open Questions).

### 2.4 `prisma/schema.prisma` — đồng bộ cho tương lai (không ảnh hưởng runtime)
- Sửa `enum IncidentStatus` còn `LIVE, LIVE_ASSIGNED, PENDING_ENDORSEMENT, RETURNED, CLOSED`.
- Thêm `enum ResponderStatus { ASSIGNED ACKNOWLEDGED ON_SITE PENDING_CONTROLLER_REVIEW LIVE_INCOMPLETE COMPLETED }`.
- Thêm model `IncidentResponder` thật (hiện `Incident.assignedTo` chỉ là `String[]`, chưa có model riêng trong Prisma dù đã có ở tầng mock) với các field tương ứng mục 2.1.
- Lưu ý rõ trong PR: đây là *đồng bộ tài liệu*, không phải thay đổi hành vi (vì runtime dùng Mongo).

---

## 3. API route changes (`src/app/api/incidents/[...id]/route.ts`)

| Action | Hiện tại | Thay đổi cần làm |
|---|---|---|
| `assign`/`assignedTo` update | Set `status: 'Active'` khi thêm | Thêm `lifecycleStatus: 'Assigned'` khi tạo mới entry Responder |
| `acknowledge` | Set `incident.status` chung (dòng 295-303) | Nhận `responderId` (mặc định = `actor`/`username`), chỉ update `lifecycleStatus` của đúng Responder đó thành `Acknowledged`. Validate Responder hiện đang `Assigned`. Không đụng `incident.status` (đã là `Live (Assigned)` sẵn) |
| `on-site` | Tương tự, set `incident.status` chung (306-314) | Tương tự `acknowledge`, set `lifecycleStatus = 'On-Site'` cho đúng Responder |
| `notify-complete` | Set `incident.status = 'Live (Pending Controller Review)'` chung (317-326) | Set `lifecycleStatus = 'Pending Controller Review'` cho đúng Responder |
| `complete` (Controller lock, dòng 329-339) | Set `incident.status = 'Live (Completed)'` | **Bỏ action này** — vai trò "lock" nay do `submit-endorsement`/Force Submit đảm nhiệm (set toàn bộ Responder `Completed` khi submit) |
| `return-to-responder` | 1 remark chung, set `incident.status = 'Live (Incomplete)'` toàn Incident (420-430) | Đổi payload thành `{ responderIds: string[], remarksByResponder: Record<string, string> }`. Với từng `responderId` được chọn: set `lifecycleStatus = 'Live (Incomplete)'`, `completionRemarks = remarksByResponder[id]`, `returnedBy = actor`, `returnedAt = now`. Responder không được chọn giữ nguyên status. Validate mỗi Responder được chọn phải có remark không rỗng (mỗi người 1 remark, theo đúng quyết định của Kyle) |
| `submit-endorsement` | Chỉ check `incident.status` (342-350) | Thêm 2 nhánh: **(a) Standard submit** — chỉ cho phép nếu **mọi** Active Responder đã ở `Pending Controller Review`/`Live (Incomplete)` (không còn ai dở dang ở Assigned/Acknowledged/On-Site); **(b) Force Submit** (`body.force === true`) — bỏ qua check trên, cho submit bất kỳ lúc nào Incident đang `Live (Assigned)`. Cả 2 nhánh: set **mọi** Active Responder → `lifecycleStatus = 'Completed'`, `completedAt = now` (kể cả người đang Acknowledged/On-Site khi bị Force Submit khoá dở — đúng quyết định đã confirm), rồi set `incident.status = 'Pending Endorsement'`. Log rõ có phải Force Submit hay không |
| `return` (DM return to Controller, 404-418) | Không đổi | Giữ nguyên — đây là Incident-level, không liên quan Responder split |
| `close` | Không đổi | Giữ nguyên |

**Endpoint mới cần cân nhắc:** tách `acknowledge`/`on-site`/`notify-complete` để nhận `responderId` trong body thay vì suy luận ngầm từ `username`, để Controller cũng có thể thao tác thay cho Responder cụ thể (đúng như UI hiện tại đã cho phép Controller bấm hộ, ví dụ "Update to On-site" dòng 1669-1673 của `page.tsx`) — nếu không có `responderId` rõ ràng thì mặc định lấy Responder duy nhất đang `Active` (trường hợp 1-Responder, hành vi không đổi so với hiện tại).

---

## 4. UI changes

### 4.1 `src/app/incidents/[...id]/page.tsx`
- **Return to Responder modal** (dòng 3495-3528): đổi từ 1 textarea thành danh sách multi-select các Responder đang Active + ô remark riêng cho từng Responder được tick. Nút submit disable nếu có Responder được chọn nhưng remark rỗng.
- **Action buttons theo role** (dòng 1636-1716): logic hiện tại gate hoàn toàn theo `incident.status` (field chung) — cần đổi sang gate theo `lifecycleStatus` của Responder tương ứng với `username` đang đăng nhập (cho Ranger) hoặc theo tổng hợp trạng thái các Responder (cho Controller, ví dụ nút "Submit for Endorsement" luôn hiển thị khi `incident.status === 'Live (Assigned)'`, còn việc có phải Force hay không do hệ thống tự xác định dựa trên còn Responder chưa `Pending Controller Review` hay không, để hiện popup confirm phù hợp).
- **Khu vực "Assigned Responders"** (~dòng 1931 trở đi): hiện chỉ hiển thị tên + avatar; cần thêm badge `lifecycleStatus` riêng cho từng Responder, và nếu nhiều Responder, action button (Acknowledge/On-site/Notify Completion) chỉ hiện cho đúng dòng Responder trùng `username` đang đăng nhập.
- **Bỏ "Controller Confirm Completion" modal** (dòng 3530-3546, gắn với action `complete` sắp bị bỏ).
- **Thêm Force Submit confirmation popup**: khi Controller bấm "Submit for Endorsement" mà còn Responder chưa `Pending Controller Review`, hiện popup xác nhận (không cần ô nhập lý do) trước khi gọi API với `force: true`.
- **Responder Progress indicator**: thêm 1 dòng nhỏ cạnh badge status chính, derive từ `incident.responders` (vd đếm bao nhiêu Responder đang ở `On-Site` / tổng số Active), thuần hiển thị — không gate hành vi nào.

### 4.2 `src/components/tabs/IncidentLogTab.tsx` (List view)
- Thêm cột/badge "Responder Progress" cạnh `RespondersAvatars` (dòng 61-142) — cùng logic derive như trên.

### 4.3 `src/app/incidents/lifecycle/page.tsx` (trang showcase lifecycle)
- Hiện là 1 sơ đồ SVG single-lane theo model cũ (9 status 1 field). Cần build lại thành **2-lane** (Incident-status vs Responder-status) khớp với diagram trong `Incident_Status_Model_Design_Updated.docx` mục 2. Đây là trang minh hoạ/đào tạo, không chặn được các phase code chính — có thể làm ở phase cuối.

---

## 5. Rủi ro & phụ thuộc cần chốt trước khi code

1. **Trùng phạm vi với `FSD_V0.5_ENHANCEMENT_PLAN.md`**: cả hai plan cùng sửa `IncidentStatus` enum và cùng các dòng trong `route.ts` (`submit-endorsement`, status list). Cần xác nhận với Kyle: làm plan nào trước, hay merge làm 1 đợt để tránh 2 người/2 PR đá nhau trên cùng file.
2. **Xác định "Responder đang thao tác" khi Controller thao tác hộ**: hiện tại route chưa nhận `responderId` tường minh ở các action `acknowledge`/`on-site`/`notify-complete` — cần Kyle xác nhận UI có cho Controller chọn "thao tác hộ Responder nào" hay chỉ Ranger tự thao tác cho chính mình.
3. **Dữ liệu cũ khi migrate**: incident đã `Closed`/`Pending Endorsement` từ trước — set toàn bộ Responder thành `Completed` khi backfill có hợp lý không, hay cần giữ nguyên lịch sử (không có dữ liệu gốc để biết chính xác responder nào đã ở đâu tại thời điểm đó). Đề xuất: chấp nhận backfill xấp xỉ, ghi log rõ "status suy diễn từ dữ liệu cũ" để tránh hiểu nhầm là dữ liệu chính xác tuyệt đối.
4. **Role/Permission Matrix (3.3.1)**: đã chốt defer — không đưa vào phase nào dưới đây, chỉ note để Kyle nhớ quay lại sau.

---

## 6. Phased implementation plan

**Phase 1 — Data model & migration**
1. `src/lib/db.ts`: thêm `ResponderLifecycleStatus`, mở rộng `IncidentResponder`, rút gọn `Incident.status` còn 5 giá trị.
2. `hydrateDb()`: thêm backfill `lifecycleStatus` cho dữ liệu cũ (mục 2.3).
3. `prisma/schema.prisma`: đồng bộ enum + model mới (không ảnh hưởng runtime, làm cho nhất quán tài liệu).

**Phase 2 — API logic**
4. Sửa `acknowledge`, `on-site`, `notify-complete` để nhận `responderId` và chỉ update đúng Responder.
5. Bỏ action `complete`; gộp logic "lock toàn bộ Responder → Completed" vào `submit-endorsement`.
6. Thêm nhánh Force Submit (`body.force`) + validation "còn Responder dở dang" cho standard submit.
7. Đổi `return-to-responder` sang multi-select + remark riêng từng Responder.

**Phase 3 — UI**
8. `page.tsx`: Return to Responder modal (multi-select + remarks), action buttons theo `lifecycleStatus` + `username`, bỏ Confirm Completion modal, thêm Force Submit confirm popup, thêm Responder Progress indicator.
9. `IncidentLogTab.tsx`: thêm Responder Progress ở List view.

**Phase 4 — Tài liệu/showcase (không chặn go-live)**
10. Rebuild `incidents/lifecycle/page.tsx` thành 2-lane diagram khớp tài liệu đã gửi Shin Feng.

**Phase 5 — Sau này (đã defer)**
11. Role/Permission Matrix (3.3.1) — làm khi có yêu cầu, không nằm trong scope hiện tại.
