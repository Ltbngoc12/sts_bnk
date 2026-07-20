# Kế hoạch: Cảnh báo mất dữ liệu & ẩn menu khi đang điền form

**Nguồn gốc:** Feedback khách hàng về form tạo Incident — mở rộng áp dụng cho toàn bộ form tạo/sửa trong hệ thống (Incident, Event, Fault...) theo quyết định phạm vi.

**Ngày lập:** 2026-07-20

## 1. Bối cảnh kỹ thuật hiện tại

Đã khảo sát codebase (`sts-bnk`, Next.js **App Router**, không dùng react-hook-form/Formik, không có state management library như Redux/Zustand):

- Form tạo Incident: `src/app/incidents/new/page.tsx` — toàn bộ state là `useState` rời rạc (~50 field), nút Cancel là `<Link href="/case-management?tab=incidents">` (điều hướng ngay, không chặn), nút Save là `type="submit"` gọi `handleFormSubmit`.
- Form sửa Incident: `src/app/incidents/[...id]/page.tsx`.
- Menu trái: `src/components/Sidebar.tsx`, render cố định trong `src/app/layout.tsx`, không có logic ẩn/hiện theo route hay theo trạng thái form.
- Các form khác (Event, Fault...) hiện là **modal**, không phải route riêng: `EventCreateModal.tsx`, `EventScheduleUploadModal.tsx`, `FaultCreateModal.tsx` — tự vẽ bằng CSS thuần (`.modal-backdrop`, `.modal-header`...), không dùng thư viện Dialog/shadcn nào.
- Không có `beforeunload`, không có cơ chế chặn back/forward, không có pattern "unsaved changes" nào đang tồn tại (chỉ có 1 chỗ dùng `window.confirm()` cho hành động xoá, không liên quan điều hướng).
- Next.js App Router **không có API chính thức** để chặn nút Back/Forward trình duyệt (khác Pages Router có `router.events`). Đây là điểm rủi ro kỹ thuật cần spike riêng.

**Ghi chú quan trọng:** khảo sát mới tập trung vào Incident + 3 modal kể trên. Cần audit đầy đủ (Phase 0) để liệt kê hết các form tạo/sửa khác trong hệ thống trước khi rollout diện rộng.

## 2. Yêu cầu

1. Cảnh báo xác nhận khi người dùng rời trang/đóng form mà có thay đổi chưa lưu (điều hướng nội bộ, đóng tab, refresh, nút Back trình duyệt).
2. Ẩn menu điều hướng bên trái khi người dùng đang điền form, để chỉ còn 2 lối ra: "Hủy" (có cảnh báo xác nhận) hoặc "Lưu".

## 3. Kiến trúc đề xuất (dùng chung cho mọi form)

Vì áp dụng cho nhiều form, xây 1 lần các phần dùng chung thay vì lặp code ở từng form:

- **`UnsavedChangesContext`** (Context mới, đặt cạnh `RoleContext`/`NotificationContext` trong `src/app/layout.tsx`) — expose:
  - `isDirty`, `setDirty(boolean)`
  - `hideNav`, `setHideNav(boolean)` — cờ riêng cho việc ẩn menu, độc lập với `isDirty` (yêu cầu 2 là ẩn *trong lúc điền*, không phụ thuộc đã sửa hay chưa)
  - `confirmLeave(onConfirm: () => void)` — helper mở modal xác nhận dùng chung
- **`useUnsavedChangesGuard(isDirty)`** hook — gắn vào form cần bảo vệ, tự động:
  - đăng ký `beforeunload` khi `isDirty === true` (đóng tab/refresh)
  - đăng ký chặn `popstate` (nút Back/Forward) khi `isDirty === true` — dùng kỹ thuật `history.pushState` chặn tạm rồi hỏi xác nhận (xem rủi ro ở mục 5)
- **`ConfirmLeaveModal.tsx`** (component mới, dùng chung) — theo đúng pattern hand-rolled hiện có (`.modal-backdrop`, `.modal-header`), nội dung "Các thay đổi chưa lưu sẽ bị mất. Bạn có chắc muốn rời trang?", 2 nút [Ở lại] / [Rời trang].
- **`Sidebar.tsx`** — đọc `hideNav` từ context, ẩn hoàn toàn khi `true`.

Với kiến trúc này, mỗi form chỉ cần "khai báo" `isDirty`/`hideNav` theo đúng thời điểm của nó, không cần tự viết lại logic chặn điều hướng.

## 4. Áp dụng theo từng loại form

**Form dạng trang riêng (Incident new/edit):**
- Set `hideNav(true)` khi mount, `hideNav(false)` khi unmount → menu trái biến mất suốt thời gian ở trang.
- Track `isDirty`: đánh dấu `true` ngay khi field đầu tiên thay đổi so với giá trị mặc định; reset `false` sau khi `handleFormSubmit` thành công.
- Nút Cancel: đổi từ `<Link>` sang `<button onClick>` — nếu `isDirty` → `confirmLeave(() => router.push(...))`; nếu không → điều hướng thẳng.
- `useUnsavedChangesGuard(isDirty)` lo phần đóng tab/refresh/back.

**Form dạng modal (Event, Fault...):**
- Không cần `hideNav` — modal đã có backdrop chặn tương tác với menu phía sau (cần kiểm tra lại z-index/backdrop hiện tại có thực sự chặn click xuyên qua không, nếu có lỗ hổng thì vá luôn).
- Track `isDirty` trong modal; áp dụng `confirmLeave` cho: nút Cancel, nút đóng (X), và click ra ngoài backdrop.
- `useUnsavedChangesGuard(isDirty)` vẫn cần, để chặn đóng tab/refresh/back trong lúc modal đang mở và có dữ liệu chưa lưu.

## 5. Rủi ro kỹ thuật cần lưu ý

- **Chặn nút Back/Forward:** Next.js App Router không hỗ trợ sẵn. Kỹ thuật `history.pushState` + lắng nghe `popstate` là workaround phổ biến nhưng không hoàn hảo — cần test kỹ với thao tác bấm Back nhanh nhiều lần, và đặc biệt **Safari/iOS có cơ chế bfcache** khiến `popstate`/`beforeunload` đôi khi không chạy như mong đợi. Đề xuất Phase 0 làm spike prototype + test trên Chrome, Safari, iOS Safari, Edge trước khi cam kết rollout toàn diện.
- **`beforeunload`:** nội dung dialog do trình duyệt kiểm soát, không tùy biến được text tiếng Việt.
- **Audit chưa đầy đủ:** cần rà soát hết các form tạo/sửa trong hệ thống (không chỉ Incident/Event/Fault) trước khi coi là "hoàn tất toàn hệ thống".

## 6. Các phase triển khai

| Phase | Nội dung | Ghi chú |
|---|---|---|
| 0 | Spike: prototype chặn Back button (pushState/popstate) + audit đầy đủ danh sách form tạo/sửa trong hệ thống | Bắt buộc làm trước, quyết định độ khả thi của yêu cầu chặn Back |
| 1 | Xây `UnsavedChangesContext` + `useUnsavedChangesGuard` + `ConfirmLeaveModal` dùng chung | Nền tảng cho mọi form |
| 2 | Áp dụng cho Incident — trang tạo mới (`incidents/new/page.tsx`) | Đúng scope feedback gốc của khách, làm trước để validate pattern |
| 3 | Áp dụng cho Incident — trang sửa (`incidents/[...id]/page.tsx`) | |
| 4 | Áp dụng cho các form dạng modal: Event, Fault (và các form khác phát hiện ở Phase 0) | |
| 5 | QA cross-browser cho phần chặn Back + beforeunload | Chrome, Safari, iOS Safari, Edge, Android Chrome |

## 7. Checklist test (thủ công, chưa thấy test tự động sẵn có trong repo)

- Nhập 1 trường trong form → bấm Cancel → hiện dialog xác nhận.
- Bấm "Ở lại" → vẫn ở form, dữ liệu còn nguyên.
- Bấm "Rời trang" → điều hướng đi, dữ liệu mất (đúng như xác nhận).
- Không nhập gì → bấm Cancel → điều hướng ngay, **không** hiện dialog.
- Có dữ liệu chưa lưu → đóng tab/refresh → browser hiện cảnh báo native.
- Có dữ liệu chưa lưu → bấm Back trình duyệt → hiện dialog xác nhận (thay vì rời trang ngay).
- Lưu (Log) thành công → điều hướng đi không còn bị hỏi lại.
- Ở trang tạo/sửa Incident → menu trái ẩn hoàn toàn; rời trang → menu hiện lại bình thường.
- Modal Event/Fault: có dữ liệu chưa lưu → bấm X hoặc click ra ngoài backdrop → hiện dialog xác nhận.

## 8. Câu hỏi còn mở (cần chốt trước khi code)

1. Text chính xác (tiếng Việt) cho nội dung `ConfirmLeaveModal` là gì?
2. Nếu Phase 0 xác nhận không thể chặn Back button đáng tin cậy trên mọi trình duyệt, có chấp nhận fallback (chỉ ẩn menu + beforeunload) không, hay cần tìm giải pháp khác (ví dụ chuyển 1 phần sang Pages Router cho riêng các form này — không khuyến nghị)?
3. Danh sách đầy đủ form tạo/sửa cần áp dụng (kết quả audit Phase 0) — xác nhận lại phạm vi cuối cùng.
