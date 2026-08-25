# Incident Category — Implementation Plan

> **Bám theo:** FSD_V0.5_ENHANCEMENT_PLAN.md (mục A4/B2/Phase 2) + QnA_FSD_v0.5_IncidentCategory.md.
> **Ngày:** 2026-07-07, cập nhật 2026-07-08 sau khi Shin Feng (BA) trả lời QnA — **cả 3 điểm TBC đã được chốt**, xem mục 6.
> **Phạm vi:** Chỉ tính năng Incident Category (FSD §5.1.2). Không đụng tới Duty Manager Elevation, Closure Endorsement separation-of-duties — đã có plan riêng trong FSD_V0.5_ENHANCEMENT_PLAN.md.
> **Trạng thái:** Đã code xong Phase 1-4 theo đúng câu trả lời của BA (xem mục 6). Phase 5 (verification) — Kyle cần tự chạy `npx tsc`/dev server để confirm build sạch, xem lưu ý ở cuối file.

---

## 1. Tình trạng hiện tại (đã verify lại code, không chỉ dựa vào doc cũ)

- `prisma/schema.prisma` — model `Incident` **không có** field `category` (schema này hiện chỉ để doc, datastore thật là MongoDB-style JSON qua `src/lib/db.ts`).
- `src/lib/db.ts` dòng 164 — field `category: string` có tồn tại ở tầng type, comment liệt kê **5 loại cũ của v0.4** (Standard/Proactive/Backdated/Ongoing/Informational).
- `src/app/incidents/new/page.tsx` dòng 36 — `const [category, setCategory] = useState('Standard Incident')`. **Không có `<select>` nào trên UI** để đổi giá trị này — state chết, luôn là `'Standard Incident'`.
- Cùng file, dòng 264/276/359 đã có sẵn logic rẽ nhánh theo `category === 'Backdated Incident'`, nhưng **không bao giờ chạy được** vì user không có cách chọn category khác giá trị mặc định.
- **Bug phát hiện thêm (chưa có trong FSD_V0.5_ENHANCEMENT_PLAN.md):** logic hiện tại ở dòng 264/276 set thẳng `status: 'Closed'` cho Backdated Incident ngay lúc tạo — nhưng chính QnA doc của Kyle (mục 2) lại lập luận Backdated phải qua **Pending Endorsement** (Duty Manager duyệt) trước khi Closed, không được closed tức thì. Hai chỗ này đang mâu thuẫn nhau — cần chốt lại khi implement (xem mục 3.2).
- `src/app/incidents/[...id]/page.tsx` dòng 222/253 — có `editCategory` state đọc từ `incident.category`, nhưng cần kiểm tra thêm có `<select>` thật để sửa hay chỉ hiển thị (chưa audit hết — xem Phase 2 bước 2.4).
- `src/components/tabs/IncidentLogTab.tsx` dòng 747-756 — có 1 dropdown **label là "Category"** trên list/filter, nhưng thực chất nó bind vào `filterType`/taxonomy (tức đang filter theo **Incident Type** như Security/Safety/Transport, không phải Category thật Operational/Backdated/Informational). Đây là **nhầm lẫn đặt tên trong code hiện tại** — cần note để tránh nhầm khi thêm filter Category thật.
- Category cũ (5 loại) vẫn rải trong `src/lib/mockData.ts`, `src/lib/db.json`, `src/lib/seed_scenarios.js` — toàn bộ cần migrate sang 3 loại mới của v0.5.
- API route `src/app/api/incidents/[...id]/route.ts` dòng 157/679 — `PUT`/action handler đã chấp nhận `body.category` để set free-text, không validate theo enum nào cả — cần validate lại theo 3 giá trị mới.
- Status model **đã được refactor tách Incident-level / Responder-level** (xem `Incident_Status_Model_Design_Updated.docx`, `INCIDENT_RESPONDER_STATUS_SPLIT_PLAN.md`) — mới hơn FSD_V0.5_ENHANCEMENT_PLAN.md một bậc:
  - `Incident.status`: `Live → Live (Assigned) → Pending Endorsement → Returned → Closed`.
  - `IncidentResponder.lifecycleStatus` (per-responder, song song): `Assigned → Acknowledged → On-Site → Pending Controller Review → Completed` (hoặc `Live (Incomplete)` nếu bị Controller return).
  - Nghĩa là "Pending Controller Review" của FSD v0.5 **đã tồn tại**, nhưng ở cấp Responder chứ không phải Incident — cần tính lại workflow rẽ nhánh Informational/Exercise dựa trên model này (không phải model cũ trong FSD_V0.5_ENHANCEMENT_PLAN.md).
  - `submit-review`/`submit-endorsement` (route.ts dòng 366-393) **đã có sẵn** cơ chế cảnh báo Responder chưa xong + `force submit`, nhưng **thiếu `overrideRemark` bắt buộc** khi force (chỉ có boolean `body.force`) — gap này thuộc phạm vi FSD 5.10.1, không thuộc phạm vi Category, nhưng liên quan trực tiếp tới nhánh Backdated/Informational nên nhắc ở đây để không bỏ sót khi wiring.
  - `close` action **chưa có** rule separation-of-duties — ngoài phạm vi plan này.

---

## 2. 3 Category theo FSD v0.5 §5.1.2 (rút từ 5 loại cũ)

| Category mới | Gộp từ v0.4 | Ý nghĩa |
|---|---|---|
| **Operational Incident** (default) | Standard + Proactive + Ongoing | Luồng đầy đủ hiện tại: Live → Assigned → ... → Pending Endorsement → Closed |
| **Backdated Incident** | Backdated (giữ nguyên) | Việc đã xảy ra & kết thúc rồi mới ghi nhận — tạo record, điền chi tiết, submit đóng ngay |
| **Informational / Exercise Records** | Informational/Exercise (giữ nguyên) | Không bắt buộc Responder/ground response/broadcast mặc định, nhưng vẫn cho phép gán nếu cần |

---

## 3. Hành vi theo Category — đã chốt với BA (Shin Feng), 2026-07-08

**Kết luận chung của BA — quan trọng nhất, đảo ngược giả định ban đầu của plan:** cả 3 category dùng chung **đúng một luồng lifecycle chuẩn** (giống hệt Operational), không có nhánh riêng nào skip ground-response cycle. Category chỉ là phân loại use-case lúc tạo, không phải workflow riêng biệt. Nguyên văn BA: *"The categories represent different use cases under the same incident lifecycle... Responder assignment should be kept optional and the response milestone tracking only applied when responders are assigned. All incident will still need endorsement by Duty Manager to close."*

Điều này khác với bản draft ban đầu của plan này (mục 3.2/3.3 cũ đã đề xuất chặn hẳn acknowledge/on-site/notify-complete cho Backdated) — bản draft đó SAI, đã bị revert khỏi code sau khi có câu trả lời chính thức.

### 3.1 Operational Incident (default) — không đổi
Giữ nguyên toàn bộ luồng hiện tại (assign → acknowledge → on-site → notify-complete → submit-endorsement → close).

### 3.2 Backdated Incident — đã chốt
- Luồng giống Operational 100%. Responder assignment **optional** (đã optional sẵn cho mọi category trong code, không cần logic riêng).
- Nếu **không cần Responder**: Controller tự điền đầy đủ thông tin đã biết rồi submit thẳng cho Duty Manager endorsement — record ở status `Live` cho tới lúc submit (không auto-`Closed`, đã sửa xong bug cũ).
- Nếu **có gán Responder** (BA: *"there are cases where post-action input is required, and the Controller may still assign a Responder to update the incident log or any operational details"*) — Responder đó chạy **đúng chu trình bình thường** (acknowledge/on-site/notify-complete) như Operational, không bị chặn.
- Mọi incident, kể cả Backdated, **luôn cần Duty Manager endorsement** trước khi Closed — không có đường tắt.

### 3.3 Informational / Exercise Records — đã chốt
- Cũng dùng luồng chuẩn y hệt, luôn qua `Pending Endorsement` trước khi `Closed` — **không có** đường tắt đóng riêng (điểm TBC #2 cũ đã bị loại bỏ theo câu trả lời BA).
- Responder assignment optional; nếu gán thì response milestone tracking mới áp dụng, không gán thì Controller tự submit thẳng.

### Bối cảnh thêm từ BA (không ảnh hưởng code, chỉ để hiểu lý do rút từ 5 → 3 category)
- **Ongoing** (v0.4) gộp vào Operational vì chỉ là incident kéo dài sang ngày hôm sau — giờ xử lý bằng interim broadcast, không cần flag riêng nữa.
- **Proactive** (v0.4) — occurrence chưa đủ nghiêm trọng để thành incident — giờ dùng e-Diary để ghi nhận thay vì tạo Incident.

---

## 4. Implementation Plan theo Phase

### Phase 1 — Data & type foundation
1. `src/lib/db.ts` dòng 164: đổi comment/type thành 3 giá trị mới. Cân nhắc đổi `category: string` → union type `'Operational Incident' | 'Backdated Incident' | 'Informational / Exercise Records'` để TypeScript bắt lỗi giá trị sai ở compile-time.
2. Thêm hằng số dùng chung, ví dụ `src/lib/taxonomy.ts` (hoặc file mới `src/lib/incidentCategory.ts`) export `INCIDENT_CATEGORIES = [...]` — dùng chung cho create form, edit form, filter dropdown, tránh hard-code rải rác.
3. Migrate data cũ: `src/lib/mockData.ts`, `src/lib/db.json`, `src/lib/seed_scenarios.js` — map 5 giá trị cũ → 3 giá trị mới (Standard/Proactive/Ongoing → Operational; Backdated → Backdated; Operational Record → Informational/Exercise — cần xác nhận lại "Operational Record" trong seed data hiện tại thực ra tương ứng loại nào, có vẻ là nhầm tên với category mới, cần rà kỹ khi migrate).
4. `prisma/schema.prisma`: thêm `enum IncidentCategory { OPERATIONAL, BACKDATED, INFORMATIONAL_EXERCISE }` + field `category` trên model `Incident` — để đồng bộ doc, dù chưa wire runtime (theo comment hiện có trong schema, datastore thật là `db.ts`).

### Phase 2 — UI: field chọn Category (đúng ý tưởng của Kyle — thêm ở màn Create Incident)
5. `src/app/incidents/new/page.tsx`:
   - Thêm `<select>` Category vào **Section 1 (General Information)**, ngay cạnh Incident Type — 3 option, default `Operational Incident`, dùng chung constant từ bước 2.
   - Đây là field điều khiển hành vi (theo đúng thay đổi bản chất của v0.5), nên đặt sớm trong form và có thể cân nhắc auto-collapse/hiện các section ground-response (Emergency Services, Responder Assignment) tùy category đã chọn — xem bước 6.
   - Bỏ logic sai ở dòng 264/276 như đã nêu mục 3.2 (Backdated không tự Closed).
6. Wire hiển thị UI theo category đã chọn (progressive disclosure, không bắt buộc ẩn cứng — để Controller vẫn có thể override nếu cần):
   - `Operational` (default): giữ nguyên toàn bộ 12 section như hiện tại.
   - `Backdated`: đánh dấu section Responder Assignment là optional (label phụ "Optional for Backdated Incidents"), không đổi tên hay ẩn.
   - `Informational/Exercise`: tương tự — Responder Assignment optional, thêm ghi chú nhỏ giải thích theo spec text (§5.1.2).
7. `src/app/incidents/[...id]/page.tsx`: đảm bảo Category có `<select>` thật trong Edit Info form (không chỉ đọc), dùng chung constant, validate theo 3 giá trị mới khi save.
8. `src/components/tabs/IncidentLogTab.tsx`: thêm filter dropdown Category **thật** (Operational/Backdated/Informational — dữ liệu từ field `category`), đặt tên khác để không đụng dropdown "Category" hiện có (thực chất đang filter theo Type) — ví dụ đổi label dropdown hiện tại thành "Incident Type" cho đúng bản chất, và thêm dropdown mới tên "Incident Category".
9. Hiển thị badge Category trên list table và trang chi tiết Incident (để Controller/DM nhận diện nhanh loại incident).

### Phase 3 — API validation + wiring hành vi
10. `src/app/api/incidents/[...id]/route.ts`:
    - Validate `body.category` (PUT dòng 157, action dòng 679) khớp đúng 1 trong 3 giá trị — reject nếu sai thay vì lưu free-text.
    - Trong flow tạo mới (`/api/cases` route, vì `submitIncident` post lên đó) — áp dụng logic Backdated theo mục 3.2 (default: Pending Endorsement, không auto-Closed).
    - Với Informational/Exercise không có Responder: theo default mục 3.3, vẫn route qua `Pending Endorsement` như Operational — không cần code path riêng (tái dùng flow sẵn có), miễn Responder không bắt buộc ở validation tạo mới.
11. Bỏ validation "Incident Type/Sub-Type required" cứng nếu Category = Informational/Exercise cần nhẹ nhàng hơn — **cần xác nhận với BA** có áp dụng không hay Type/Sub-Type vẫn luôn bắt buộc bất kể category (spec không nói rõ, giả định vẫn bắt buộc trừ khi BA nói khác).

### Phase 4 — Regression check với các phần đã dùng `category` cũ
12. `src/app/cases/[...id]/page.tsx` dòng 153/383 (`attachCategory`) và `src/app/api/cases/[...id]/route.ts`, `src/app/api/cases/route.ts` (default `'Standard Incident'`) — đổi default fallback về `'Operational Incident'`.
13. Rà lại toàn bộ chỗ so sánh string category cũ (`'Standard Incident'`, `'Proactive Incident'`, `'Ongoing Incident'`) để xoá hoặc migrate.

### Phase 5 — Verification
14. Test tạo mới 1 Incident mỗi category, xác nhận: field hiển thị đúng, lưu đúng giá trị, Backdated không tự Closed (theo default mới), filter/badge hiển thị đúng trên list & detail.
15. Test edit Category trên Incident đã tồn tại — đảm bảo audit log ghi nhận thay đổi category (hiện tại code có pattern ghi log cho most field changes, cần đảm bảo category cũng được log khi đổi).
16. Kiểm tra `check-duplicates` API (dòng 359 create page) đã skip đúng khi Backdated — vẫn giữ hành vi cũ, không đổi.

---

## 5. Việc CHƯA làm trong plan này (out of scope, thuộc plan khác)
- Duty Manager Role Elevation, Closure Endorsement separation-of-duties rule, Events Management matrix — xem FSD_V0.5_ENHANCEMENT_PLAN.md Phase 4/5/6.
- `overrideRemark` bắt buộc khi Force Submit — gap có thật (route.ts dòng 366-393) nhưng thuộc §5.10.1, không phải §5.1.2 Category.

## 6. Trả lời của BA (Shin Feng) — 2026-07-08, đã áp dụng vào code

1. **Backdated Incident: status đích khi submit là Pending Endorsement (không phải Closed ngay)?** → **Đúng, confirmed.** Đã sửa (bỏ auto-Closed lúc tạo).
2. **Backdated Incident: field Responder Assignment — hiện nhưng optional, hay ẩn hẳn?** → **Hiện, optional.** Nếu không cần Responder, Controller tự điền và submit thẳng cho DM endorsement. Nếu CÓ gán Responder (vd: cần cập nhật log/operational details sau đó), Responder đó chạy **đúng chu trình bình thường** (acknowledge/on-site/notify-complete) — **không** bị suppress như bản code nháp đầu tiên từng làm.
3. **Informational/Exercise không gán Responder: bắt buộc qua Pending Endorsement như Operational, hay có đường tắt đóng riêng?** → **Bắt buộc qua Pending Endorsement, không có đường tắt.** Mọi category đều cần DM endorsement mới được Closed.

**Tóm gọn của BA:** cả 3 category dùng chung một lifecycle chuẩn; khác biệt duy nhất là Responder assignment optional (áp dụng như nhau cho cả 3 category) và nếu không gán Responder thì Controller tự submit thẳng. Không có category nào có workflow riêng/rút gọn.

Code đã được cập nhật khớp 100% với 3 câu trả lời trên trong `src/app/api/incidents/[...id]/route.ts` và `src/app/incidents/[...id]/page.tsx` (bỏ hết các đoạn chặn ground-response cycle cho Backdated mà bản nháp đầu tiên đã thêm nhầm).
