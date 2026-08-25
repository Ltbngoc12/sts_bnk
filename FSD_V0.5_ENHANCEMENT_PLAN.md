# FSD v0.5 — Enhancement Diff & Implementation Plan

> **Nguồn:** `SDC IIS CMS FRD v0.5_SDC.pdf` (85 trang) so với `SDC IIS CMS FRD v0.4_SDC.docx` (đã có trong repo) và code hiện tại của `sts-bnk` (Sentosa).
> **Ngày:** 2026-07-06
> **Changelog chính thức của v0.5 (mục 1.1):** *"Updates to Incident categories, role and status matrix, closure"*
> **Trạng thái:** Draft để review trước khi code.

Tài liệu này gồm 3 phần: (A) liệt kê chính xác những gì v0.5 thay đổi so với v0.4, (B) đối chiếu với code hiện tại để biết cái gì đã có / thiếu / sai, (C) plan triển khai theo phase.

---

## 0. TL;DR

| # | Thay đổi | Mức độ ảnh hưởng code |
|---|----------|------------------------|
| 1 | **Duty Manager Role Elevation** (3.2) viết lại hoàn toàn: giờ áp dụng cho cả Controller lẫn Duty Officer (không chỉ Duty Officer), elevation có **shift start/end time-boxed + grace period auto-expire configurable**, chỉ System Admin / Current Ops Admin mới được cấp | **Lớn — chưa có gì trong code, cần model + logic mới** |
| 2 | **Incident Category** (5.1.2) rút từ 5 loại xuống **3 loại**, và quan trọng nhất: category giờ là field **điều khiển hành vi hệ thống** (response, assignment, closure, broadcast mặc định), không còn "for-info only" như v0.4 | **Trung bình-lớn — field tồn tại trong code nhưng chết (dead state), chưa từng render lên UI** |
| 3 | **Incident Status lifecycle** (5.4.1) đổi tên/cấu trúc: thêm status **"Pending Controller Review"**, bỏ **"Live (Completed)"** khỏi danh sách chính thức | **Trung bình — code đã tự implement "Pending Controller Review" nhưng vẫn giữ thêm bước "Live (Completed)" không có trong v0.5** |
| 4 | **Closure Endorsement Submission Rules** (5.10.1) — **hoàn toàn mới**, gồm: cho phép submit dù responder chưa xong (kèm cảnh báo + remark bắt buộc), khoá không cho Controller thu hồi submission, và **rule tách biệt trách nhiệm (separation-of-duties)**: DM không được tự endorse case mình tạo/submit, kể cả khi đang elevated | **Lớn — chưa có bất kỳ rule nào trong `close`/`submit-endorsement` action** |
| 5 | **Events Management role matrix** (3.3.4) — heading mới trong Role & Status Matrix nhưng **bảng bị để trống trong chính FSD** | **Cần hỏi lại BA — không thể code theo spec rỗng** |
| 6 | Role table: mô tả Duty Manager/Duty Officer/Controller không đổi nhiều, nhưng Incident status-matrix (3.3.1) viết lại toàn bộ theo status mới ở mục 3 | **Trung bình — cần cập nhật theo status mới ở #3** |

---

## A. Enhancement chi tiết v0.4 → v0.5

### A1. Section 3.2 — Duty Officer Role Elevation → **Duty Manager Role Elevation**

**v0.4:** Chỉ Duty Officer được elevate lên Duty Manager. Áp dụng như "long-term role configuration" tĩnh trên user — không có khái niệm ca trực (shift), không có ngày giờ bắt đầu/kết thúc, không tự động thu hồi.

**v0.5 (viết lại toàn bộ):**
- Bất kỳ IOH user có thẩm quyền nào — **kể cả Controller**, không chỉ Duty Officer — đều có thể được elevate lên Duty Manager.
- Chỉ **System Administrator** hoặc **Current Ops Administrator** được cấp quyền elevation.
- Elevation gắn với **1 ca trực cụ thể**: phải ghi nhận shift start date/time, shift end date/time, và người Admin đã cấp quyền.
- Hệ thống **tự động thu hồi quyền elevated** sau một **grace period có thể cấu hình** tính từ giờ kết thúc ca (để bàn giao ca). System Administrator chỉnh grace period này trong System Configuration.
- Hết hạn elevation → user tự động trở về quyền gốc.
- Nếu user đang elevated không thể tự đóng Incident do chính mình tạo/submit → phải chuyển cho Duty Manager ca sau hoặc user có quyền DM khác đóng.

### A2. Section 3.3.1 — Incident Management Role & Status Matrix

Bảng được viết lại theo chiều dọc (status stack từ trên xuống thay vì cột trái-phải như v0.4), và quan trọng hơn là **thay đổi tập status**:

| v0.4 status sequence | v0.5 status sequence |
|---|---|
| Live → Live (Assigned) → Live (Acknowledged) → Live (On-Site)/Live (Incomplete) → **Live (Completed)** → Pending Endorsement → Returned → Closed | Live → Live (Assigned) → Live (Acknowledged) → Live (On-site) → **Pending Controller Review** → Live (Incomplete) → Pending Endorsement → Returned → Closed |

- **"Pending Controller Review"** là status mới, đại diện cho: Responder đã báo hoàn tất, đang chờ Controller review để quyết định submit endorsement hay trả về yêu cầu bổ sung.
- **"Live (Completed)"** không còn xuất hiện trong danh sách status chính thức của v0.5 — tức luồng đơn giản hoá: Controller review xong ở "Pending Controller Review" thì **submit thẳng cho endorsement**, không cần qua bước khoá riêng "Completed".
- "Live (Incomplete)" giờ được mô tả rõ thêm: hiển thị remark của DM khi bị return từ Pending Endorsement.
- Cột "Pending Endorsement" bổ sung rõ: điều kiện "elevated to Duty Manager và không phải người submit" áp dụng **cho cả Controller lẫn Duty Officer** (v0.4 chỉ ghi rõ cho Duty Officer, khớp với thay đổi A1 — Controller giờ cũng elevate được).

### A3. Section 3.3.4 — Events Management (role matrix)

**Hoàn toàn mới** — không tồn tại trong v0.4. Tuy nhiên bảng nội dung bên dưới heading này **bị để trống trong chính file PDF v0.5** (heading "3.3.4 Events Management" xuất hiện ở trang 31 nhưng không có bảng role/action theo sau, nhảy thẳng sang 3.4 Record Data Retention). Cần hỏi lại BA (Wong Shin Feng) để lấy nội dung đầy đủ trước khi code phần permission cho Events module.

### A4. Section 5.1.2 — Incident Categories

**v0.4** (5 loại, ghi rõ "for-info and not noted in the system" — tức chỉ mang tính mô tả, hệ thống không lưu/dùng để quyết định gì):
- Standard Incident
- Proactive Incident
- Backdated Incident
- Ongoing Incident
- Informational / Exercise Records

**v0.5** (rút còn 3 loại, và giờ **là field hệ thống dùng để xác định default response/assignment/closure/broadcast behaviour** — thay đổi bản chất, không còn "for-info" nữa):
- **Operational Incident** — mặc định, gộp chung Standard + Proactive + Ongoing của v0.4.
- **Backdated Incident** — giữ nguyên ý nghĩa (việc đã xảy ra & kết thúc, tạo record rồi submit đóng ngay).
- **Informational / Exercise Records** — giữ nguyên, làm rõ thêm: vẫn có thể gán Responder/tracking milestone nếu cần dù mặc định không bắt buộc.

### A5. Section 5.10 / 5.10.1 — Incident Closure (phần mở rộng lớn nhất)

**v0.4** chỉ có 6 dòng mô tả chung chung về việc submit → DM review → approve/return → closed.

**v0.5** giữ nguyên phần 5.10 (a-f) gần như không đổi, nhưng thêm hẳn **mục con 5.10.1 "Closure Endorsement Submission Rules" (a-i) hoàn toàn mới**:
- Controller được submit/resubmit endorsement từ **bất kỳ active status nào**, kể cả khi một số Responder workflow action còn dang dở.
- Trước khi chấp nhận submit, hệ thống phải **cảnh báo Controller** về các action còn thiếu (chưa acknowledge, chưa on-site, chưa mark complete, hoặc đang ở Live (Incomplete) chờ amend).
- Nếu Controller vẫn muốn submit bất chấp cảnh báo → **bắt buộc phải confirm + nhập override remark**.
- Sau khi đã submit/resubmit thành công, **Controller không được thu hồi/huỷ submission** — chỉ có thể amend sau khi DM return lại.
- Khi DM return → Incident chuyển "Returned", Controller có thể: amend / update / quản lý responder / return cho responder (chuyển Live (Incomplete)) / resubmit.
- **Rule tách biệt trách nhiệm (separation-of-duties):** hệ thống phải **chặn DM endorse closure nếu chính DM đó là người đã tạo/submit/resubmit incident** — áp dụng dựa trên **danh tính user thật**, kể cả khi user đó đang dùng quyền Duty Manager elevated (Duty Officer hoặc Controller elevated).

---

## B. Đối chiếu với code hiện tại (`src/`, `prisma/schema.prisma`)

### B1. Duty Manager Elevation — **chưa implement**
- Grep toàn repo cho `elevat`, `shiftStart`, `shiftEnd`, `grace period`: chỉ tìm thấy **text mô tả tĩnh** trong `src/app/admin/roles/page.tsx` (dòng 20) và `src/app/admin/users/page.tsx` (dòng 11) kiểu *"Eligible to elevate role to Duty Manager during shift changes or DM absence"* — đây chỉ là **copy mô tả**, không có field, không có logic cấp/thu hồi quyền theo ca.
- Không có bảng/entity nào trong `prisma/schema.prisma` lưu trạng thái elevation (ai đang elevated, ai cấp, ca nào, hết hạn khi nào).
- Không có cơ chế Controller được elevate (chỉ Duty Officer được nhắc tới trong text mô tả).

### B2. Incident Category — **field chết, chưa lên UI**
- `prisma/schema.prisma` **không có** field `category` trên model `Incident` — chỉ có ở tầng mock (`src/lib/db.ts` dòng 145, comment liệt kê đúng **5 loại của v0.4**).
- `src/app/incidents/new/page.tsx` dòng 36: `const [category, setCategory] = useState('Standard Incident')` — **state này không bao giờ được set lại**, không có `<select>`/UI nào cho phép người dùng chọn Category. Chỉ dùng để so sánh `category === 'Backdated Incident'` ở dòng 264, 276, 359 nhưng vì UI không cho chọn nên nhánh này **không bao giờ true** trong thực tế.

### B3. Incident Status lifecycle — **đã đi trước một phần, nhưng lệch so với v0.5**
- `prisma/schema.prisma` enum `IncidentStatus` (dòng 17-27) vẫn giữ nguyên tập v0.4: `LIVE, LIVE_ASSIGNED, LIVE_ACKNOWLEDGED, LIVE_ON_SITE, LIVE_INCOMPLETE, LIVE_COMPLETED, PENDING_ENDORSEMENT, RETURNED, CLOSED` — **thiếu `PENDING_CONTROLLER_REVIEW`**.
- Tuy nhiên tầng runtime thực tế (`src/app/api/incidents/[...id]/route.ts`) **đã tự phát triển thêm** status string `'Live (Pending Controller Review)'` (dòng 321) như bước trung gian trước `'Live (Completed)'` (dòng 333) — tức code hiện đã "đi trước" v0.4 nhưng theo hướng khác v0.5: v0.5 bỏ hẳn "Live (Completed)", còn code vẫn giữ nó làm bước khoá riêng trước khi submit endorsement.
- Dòng 344 hiện đã cho phép submit-endorsement từ cả `'Live (Pending Controller Review)'` lẫn `'Live (Completed)'` — nghĩa là về mặt hành vi, code **đã hỗ trợ được luồng rút gọn của v0.5** (bỏ qua Completed), nhưng status "Live (Completed)" vẫn tồn tại song song gây lệch với danh sách 9 status chính thức của v0.5.
- **Đề xuất:** cần quyết định (xem mục D — Open Questions) có nên loại bỏ hẳn `LIVE_COMPLETED`/`'Live (Completed)'` để khớp đúng 9-status của v0.5, hay giữ lại như một tuỳ chọn nghiệp vụ (và note lệch với FSD để BA duyệt).

### B4. Closure Endorsement Submission Rules (5.10.1) — **chưa có rule nào**
Xem `src/app/api/incidents/[...id]/route.ts`:
- `case 'close'` (dòng 353-401): đóng incident **không kiểm tra** actor có phải người đã tạo/submit/resubmit incident hay không → **thiếu hoàn toàn rule tách biệt trách nhiệm (5.10.1.h/i)**. Đây là gap nghiêm trọng nhất vì đây là control nghiệp vụ (separation of duties), không phải chỉ UX.
- `case 'submit-review'/'submit-endorsement'` (dòng 342-350): chỉ kiểm tra status hợp lệ, **không kiểm tra** responder workflow actions còn dang dở, **không có** cơ chế cảnh báo + override remark bắt buộc (5.10.1.c/d).
- Không tìm thấy action `cancel`/`recall` submission trong route — nghĩa là hiện tại Controller vốn **đã không có cách** thu hồi submission (khớp tình cờ với rule 5.10.1.f, nhưng nên xác nhận UI không có nút nào làm việc này).
- `case 'return'` (dòng 404-418) đã có bắt buộc `returnRemarks` — tốt, khớp tinh thần v0.5.

### B5. Events Management role matrix — cả spec lẫn code đều thiếu
- Không có UI page nào cho Events module (`src/app/events/**` không tồn tại), chỉ có type + 1 API route (`src/app/api/events/route.ts`). Vì FSD 3.3.4 cũng đang để trống, mục này cần BA bổ sung trước khi lên plan chi tiết.

### B6. Incident Ageing Alerts (5.4.3) — hiện tại chỉ là mock, chưa có logic thật
- `src/context/NotificationContext.tsx` có sẵn 2 notification mẫu "12 days"/"14 days" (dòng 74-88) nhưng đây là **seed data tĩnh**, không có job/logic tính "incident đã active bao nhiêu ngày" và tự sinh notification + daily summary 30 phút sau ca. Không nằm trong changelog v0.5 nhưng liên quan trực tiếp tới Incident lifecycle đang sửa — nên làm chung 1 đợt.

---

## C. Implementation Plan

### Phase 1 — Data model & migration (nền tảng)
1. `prisma/schema.prisma`:
   - Thêm enum `IncidentCategory { OPERATIONAL, BACKDATED, INFORMATIONAL_EXERCISE }`, thêm field `category IncidentCategory @default(OPERATIONAL)` vào model `Incident`.
   - Sửa enum `IncidentStatus`: thêm `PENDING_CONTROLLER_REVIEW`; quyết định giữ/bỏ `LIVE_COMPLETED` (xem mục D).
   - Thêm model `DutyManagerElevation` mới: `id, userId, grantedBy, shiftStart, shiftEnd, gracePeriodMinutes, revokedAt/expiresAt, createdAt`. Thêm field cấu hình `elevationGracePeriodMinutes` vào bảng system config (hoặc bảng config hiện có).
   - Viết migration + cập nhật `src/lib/db.ts` / mock types tương ứng.

### Phase 2 — Incident Category (UI + behavior)
2. Thêm `<select>` Incident Category vào `src/app/incidents/new/page.tsx` (3 options, default Operational).
3. Wire hành vi theo category:
   - `Backdated Incident`: giữ logic auto-status Closed hiện có (dòng 264/276) — bug hiện tại là chưa bao giờ trigger được vì thiếu UI, fix bằng bước 2.
   - `Informational/Exercise`: mặc định không bắt buộc Responder assignment/broadcast, nhưng vẫn cho phép gán nếu Controller chọn.
   - `Operational` (default): giữ nguyên luồng hiện tại.
4. Review toàn bộ nơi có check `category ===` để đảm bảo dùng đúng 3 giá trị mới, xoá logic tham chiếu 5 giá trị cũ (mockData.ts, seed_scenarios.js, db.json).

### Phase 3 — Incident status lifecycle rename/cleanup
5. Quyết định hướng xử lý `Live (Completed)` (cần BA confirm — mục D), sau đó:
   - Đổi tên hiển thị/status string cho khớp 9-status chính thức của v0.5.
   - Cập nhật toàn bộ nơi so sánh status string cứng (route API, `IncidentLogTab.tsx`, `incidents/lifecycle/page.tsx`, `incidents/[...id]/page.tsx`, `admin/routing-matrix/page.tsx`).
   - Cập nhật comment/type documentation trong `src/lib/db.ts` dòng 146.

### Phase 4 — Closure Endorsement Submission Rules (5.10.1) — ưu tiên cao nhất
6. `case 'submit-review'/'submit-endorsement'`:
   - Thêm kiểm tra responder workflow actions còn dang dở (chưa acknowledge / chưa on-site / chưa mark complete / đang Live (Incomplete)).
   - Trả về cảnh báo (không chặn) kèm danh sách action thiếu; FE hiển thị modal xác nhận.
   - Nếu Controller confirm bất chấp cảnh báo → bắt buộc nhập `overrideRemark`, lưu vào log.
7. `case 'close'` — **quan trọng nhất**: thêm rule separation-of-duties:
   - So sánh `actor` (định danh user thật, không phải role hiển thị) với `createdBy`, `submittedBy`, `resubmittedBy` của incident (cần thêm field lưu người submit/resubmit nếu chưa có — hiện `incident` không track riêng ai đã submit-endorsement).
   - Nếu trùng → chặn với lỗi rõ ràng, kể cả khi actor đang dùng quyền elevated.
   - Áp dụng check này dựa trên identity thật lấy từ session/elevation record (Phase 1), không dựa vào role field hiển thị.
8. Xác nhận UI không có đường nào cho Controller "huỷ/thu hồi" submission sau khi đã Pending Endorsement (rule 5.10.1.f) — nếu có, phải gỡ bỏ.

### Phase 5 — Duty Manager Role Elevation (đổi mô hình hoàn toàn)
9. Admin UI (`admin/users` hoặc `admin/roles`): thêm form cấp elevation — chọn user (Controller hoặc Duty Officer), shift start/end, xác nhận bởi System Admin/Current Ops Admin.
10. Backend: job/logic kiểm tra hết hạn elevation dựa trên `shiftEnd + gracePeriodMinutes`, tự động revert quyền.
11. System Configuration: thêm field cấu hình grace period (chỉ System Administrator sửa được).
12. Toàn bộ chỗ đang check `role === 'Duty Manager'` cho hành động DM-only (đóng case, endorse, broadcast authorise, crisis recall) phải mở rộng để chấp nhận "actor có elevation record còn hiệu lực" — đây là điểm giao với Phase 4 (separation-of-duties phải nhìn xuyên qua elevation để lấy identity thật).

### Phase 6 — Role & Status Matrix UI/doc updates
13. Cập nhật `admin/routing-matrix` (hoặc trang hiển thị role matrix tương ứng) theo bảng 3.3.1 mới (status theo hàng dọc, thêm cột điều kiện elevated áp dụng cho cả Controller).
14. Task Management (3.3.2) và e-Diary (3.3.3) matrix trong v0.5 **không đổi nội dung** so với v0.4 — không cần sửa, chỉ đối chiếu lại format hiển thị nếu trang admin đang copy nguyên văn từ FSD.

### Phase 7 (không chặn, có thể làm song song) — Incident Ageing Alerts thật
15. Thay notification mock 12/14 ngày bằng logic tính từ `createdAt` thật, sinh notification + daily summary 30 phút sau shift start cho Duty Manager.

### Không nằm trong scope đợt này
- **Events Management role matrix (3.3.4)** — chặn bởi thiếu nội dung từ BA, tách thành task riêng sau khi có input.

---

## D. Câu hỏi cần confirm với BA (Wong Shin Feng) trước khi code

1. **"Live (Completed)" có nên bị loại bỏ hẳn không?** FSD v0.5 liệt kê chỉ 9 status và không có "Live (Completed)", nhưng code hiện tại đang dùng nó như bước khoá trung gian hữu ích (Controller "lock" trước khi submit). Giữ lại có làm sai lệch audit/report so với FSD không?
2. **Section 3.3.4 Events Management** — bảng role/action bị trống trong file PDF v0.5 (trang 31, giữa 3.3.3 và 3.4). Cần bản đầy đủ.
3. **Field lưu người submit/resubmit endorsement**: hiện `Incident` chỉ có `createdBy`, chưa có `submittedBy`/`resubmittedBy` riêng — cần xác nhận rule 5.10.1.h chỉ cần so `createdBy` hay phải track cả người submit gần nhất (vì có thể khác creator nếu bị return nhiều vòng).
4. **Grace period elevation mặc định là bao nhiêu?** FSD chỉ nói "configurable", cần giá trị default để seed hệ thống.

---

## Nguồn tham chiếu

- `SDC IIS CMS FRD v0.5_SDC.pdf` — sections 1.1 (Version History), 3.2, 3.3.1, 3.3.4, 5.1.2, 5.4.1, 5.10, 5.10.1.
- `SDC_IIS_CMS_FRD_v0.4_SDC.txt` (đã có trong repo) — dùng để đối chiếu.
- Code: `prisma/schema.prisma`, `src/lib/db.ts`, `src/app/api/incidents/[...id]/route.ts`, `src/app/incidents/new/page.tsx`, `src/app/admin/users/page.tsx`, `src/app/admin/roles/page.tsx`, `src/context/NotificationContext.tsx`.
