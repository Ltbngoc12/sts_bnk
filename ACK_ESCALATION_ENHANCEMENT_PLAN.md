# Acknowledgement & Escalation — Enhancement Plan

**Module:** Crisis Management & Emergency Recall (FSD §11.5)
**Màn hình:** System Configuration → Crisis Configuration → tab *Acknowledgement & Escalation*
**Ngày:** 2026-08-02 · **Tác giả:** Kyle (BA)
**Tài liệu gốc:** `Crisis-Management-Emergency-Recall-Build-Plan.md` (v1.1), Epic 1 story 8
**Prototype tham chiếu:** `prototype-ack-escalation.html` *(chỉ dùng để review; các block bị loại bỏ ở §2 sẽ không được build)*

---

## 1. Requirement và khoảng cách hiện tại

> **Requirement:** *Configure acknowledgement requirements where applicable, reminder rules, escalation rules and related audit events.*

| Thành phần | Hiện trạng | Kết luận |
| :--- | :--- | :--- |
| Acknowledgement requirements | Có ack window, keywords, methods, capture ETA | Đủ — chỉ cần làm rõ phạm vi áp dụng |
| Reminder rules | **Không tồn tại.** Bị nhét vào escalation ladder dưới dạng action `Resend SMS` | **Thiếu — hạng mục lớn nhất của plan này** |
| Escalation rules | Có ladder, nhưng 2/4 action không có code chạy | Sửa + thu gọn |
| Related audit events | Thiếu 2 event, 1 event đang ghi sai sự thật | Sửa |

Kèm theo là 3 lỗi runtime được phát hiện khi self-test — xem §6.

---

## 2. Quyết định phạm vi (chốt ngày 2026-08-02)

| # | Quyết định | Ảnh hưởng |
| :--- | :--- | :--- |
| 1 | **Không phân biệt theo crisis level.** Một bộ rule áp dụng cho mọi level. | Giữ nguyên `AckEscalationRule` dạng singleton. **Không** đổi data model. Bỏ hạng mục "profile theo level" khỏi kế hoạch. |
| 2 | **Acknowledgement chỉ bắt buộc với tin recall.** Không cho admin chọn. | Trở thành **luật cứng trong code**, không phải field cấu hình. Bỏ ý tưởng thêm `requiresAck` vào Message Template. |
| 3 | **Bỏ quorum khỏi reminder rules.** | Bỏ điều kiện dừng nhắc "khi quorum đã đạt". |
| 4 | **Bỏ action `Escalate to next tier` và `Voice call`.** | Ladder chỉ còn `Resend SMS` và `Notify Duty Manager`. Đóng Q4 = *voice ngoài scope release này*. |
| 5 | **Bỏ hoàn toàn tính năng Quorum.** | Gỡ khỏi config, API, dashboard và build plan. |

### 2.1 Hệ quả cần biết trước khi build

Ba điểm dưới đây là hệ quả trực tiếp của quyết định 4 và 5. Không phải phản đối — nhưng phải xử lý dứt điểm, nếu không sẽ để lại rác trong hệ thống.

**(a) Trường `tier` trở thành dữ liệu chết.**
Sau khi bỏ `Escalate to next tier` (dùng tier để leo thang) và bỏ quorum (`quorumTierScope` dùng tier để đếm), trường `tier` trên `RecallGroupMember` và `CrisisRecallMember` **không còn điều khiển bất kỳ hành vi nào**.

Ghi nhận thêm: mô hình dispatch hiện tại vốn **đã không phân tầng** — `evaluateCrisisTrigger()` snapshot toàn bộ member của group khớp routing, mọi tier đều nhận SMS ở đợt đầu (`crisisRuntime.ts:122-131`). Nghĩa là `Escalate to next tier` chưa từng nhất quán với luồng thực tế: Tier 2 đã nhận tin từ phút 0, không có gì để "leo thang" sang. **Quyết định 4 là đúng**, không phải cắt bớt tính năng.

→ **Hướng xử lý:** giữ `tier` như thông tin hiển thị (giúp DM biết ai là primary khi gọi điện tay), nhưng gắn comment `INFORMATIONAL ONLY — không điều khiển logic nào` ngay tại type definition. Không xoá field, vì dữ liệu đã có và vẫn có giá trị vận hành.

**(b) Build plan có 2 đoạn mô tả quorum sẽ thành sai.**

| Vị trí | Nội dung hiện tại | Xử lý |
| :--- | :--- | :--- |
| §195 — Live Crisis Dashboard | "…quorum indicator, recipient table…" | Xoá cụm quorum indicator |
| §204 — nguyên tắc dashboard | "…và **liệu đã đủ người phản hồi hay chưa**" (1 trong 3 câu hỏi phải trả lời trong 5 giây) | Xoá vế thứ ba, còn 2 câu hỏi |
| §81 — data dictionary `AckEscalationRule` | "…quorum definition" | Thay bằng "reminder rules" |
| §313 (Q3) | Câu hỏi mở về giá trị quorum | Đóng — *quorum ngoài scope* |

Không sửa build plan thì sẽ tồn tại requirement có văn bản mà không có implementation — đúng loại lỗi mà UAT hoặc audit compliance sẽ bắt.

**(c) DM mất tín hiệu tổng hợp "đã đủ người chưa".**
Thay thế: dashboard **đã có sẵn** bộ đếm Acknowledged / Declined / No response / Failed (`computeCounters()`, `crisis.ts:251-256`). DM tự đọc con số thay vì hệ thống phán "MET / NOT MET". Chấp nhận được, vì ngưỡng "đủ" chưa ai định nghĩa được — đó chính là lý do quorum bị bỏ. **Không cần build gì thêm cho mục này.**

---

## 3. Thiết kế tab sau khi sửa

Tab còn **3 block** (giảm từ 4, do bỏ Quorum):

```
ACKNOWLEDGEMENT & ESCALATION
│
├── 1 · ACKNOWLEDGEMENT REQUIREMENTS
│     Áp dụng cho mọi crisis level (Level 1 và Level 2) — dòng chữ read-only
│     Ack bắt buộc với mọi tin recall; tin stand-down không yêu cầu ack — read-only
│     ├─ Acknowledgement window (phút)
│     ├─ Capture ETA khi acknowledge          [checkbox]
│     ├─ Phương thức: Tokenised link          [checkbox, mặc định bật]
│     ├─ Phương thức: SMS reply keyword       [checkbox, mặc định tắt — Q7]
│     └─ Ack / Decline keywords               [khoá khi SMS reply keyword tắt]
│
├── 2 · REMINDER RULES                                            ★ MỚI
│     ├─ Bật nhắc tự động                     [checkbox]
│     ├─ Nhắc lần đầu sau (phút)
│     ├─ Khoảng cách giữa các lần nhắc (phút)
│     ├─ Số lần nhắc tối đa
│     ├─ Template dùng cho tin nhắc           [dropdown]
│     └─ Dừng nhắc khi: đã acknowledge (luôn đúng, khoá) / đã decline / delivery FAILED
│
└── 3 · ESCALATION LADDER
      ├─ Mốc gốc tính thời gian: từ thời điểm dispatch (cố định)  — read-only
      └─ Bảng bước: Sau (phút) | Hành động | Ghi chú
            Hành động: Resend SMS · Notify Duty Manager
```

**Hai dòng read-only ở block 1** là cách hiện thực hoá quyết định 1 và 2. Đây là luật cứng, không phải lựa chọn — nhưng phải hiển thị, nếu không admin sẽ không biết phạm vi áp dụng và sẽ hỏi lại.

### 3.1 Ranh giới Reminder ↔ Escalation

Đây là điểm dễ hiểu sai nhất của plan này, cần viết vào code comment:

| | Reminder | Escalation |
| :--- | :--- | :--- |
| Gửi cho ai | Chính người chưa phản hồi | Duty Manager (con người khác) |
| Nội dung | Cùng nội dung recall, có tiền tố nhắc | Notification nội bộ, không phải SMS recall |
| Tần suất | Lặp theo chu kỳ, có giới hạn số lần | Chạy một lần tại mốc cấu hình |
| Điều kiện dừng | Người đó phản hồi / hết số lần | Không lặp nên không cần dừng |
| Mục đích | Kéo thêm phản hồi từ chính người đó | Chuyển sang xử lý thủ công vì tự động đã thất bại |

---

## 4. Thay đổi data model

### 4.1 `AckEscalationRule` — `src/lib/crisisConfig.ts:248`

```ts
export interface AckEscalationRule {
  id: 'singleton';

  // ── Acknowledgement ──
  // Áp dụng cho MỌI crisis level. Chỉ có hiệu lực với dispatch tin recall
  // (sequence: initial | re-send | escalation). Tin stand_down không yêu cầu ack.
  ackWindowMinutes: number;
  ackKeywords: string;
  declineKeywords: string;
  ackMethodLink: boolean;
  ackMethodKeyword: boolean;
  captureEta: boolean;

  // ── Reminder (MỚI) ──
  remindersEnabled: boolean;
  reminderFirstAfterMinutes: number;   // tính từ firstSentAt của recipient
  reminderIntervalMinutes: number;
  reminderMaxCount: number;
  reminderTemplateId?: string;         // rỗng = dùng lại nội dung tin gốc
  reminderStopOnDecline: boolean;
  reminderStopOnDeliveryFailed: boolean;

  // ── Escalation ──
  ladder: EscalationStep[];

  // ── ĐÃ GỠ ──
  // quorumEnabled / quorumType / quorumValue / quorumTierScope
}
```

### 4.2 `EscalationStep` — `crisisConfig.ts:241`

```ts
// Chỉ còn hai action. 'Escalate to next tier' bị gỡ vì mô hình dispatch không
// phân tầng (mọi tier nhận tin từ đợt đầu). 'Voice call' bị gỡ vì voice nằm
// ngoài scope release này (Q4 — đóng 2026-08-02).
action: 'Resend SMS' | 'Notify Duty Manager';
```

### 4.3 `DispatchRecipient` — `src/lib/crisis.ts:173`

```ts
firstSentAt?: string;    // MỚI — set MỘT LẦN ở đợt gửi đầu, không bao giờ ghi đè.
                         // Mọi tính toán reminder/escalation/ack-window dùng mốc này.
remindersSent: number;   // MỚI — mặc định 0
lastReminderAt?: string; // MỚI
```

`sentAt` giữ nguyên nhưng **chỉ để hiển thị "lần gửi gần nhất"**, không dùng để tính thời gian nữa. Đây là gốc rễ của lỗi trôi mốc ở §6.1.

### 4.4 Migration dữ liệu

Document `ackEscalationRule` hiện có trong Mongo vẫn mang 4 field quorum. Vì `saveAckEscalationRule()` dùng `replaceOne`, lần lưu đầu tiên sau khi deploy sẽ tự loại bỏ chúng. **Không cần script migration**, nhưng cần đọc phòng thủ: field mới thiếu thì fallback về default seed.

Recipient đang chạy dở (`firstSentAt` undefined): fallback `firstSentAt ?? sentAt ?? crisis.dispatchedAt`.

---

## 5. Thay đổi runtime — `src/lib/crisisRuntime.ts`

### 5.1 Tách hàm

Hiện `evaluateEscalation()` (dòng 637) làm 3 việc lẫn lộn: đánh dấu NO_RESPONSE, gửi lại tin, chạy ladder. Tách thành:

| Hàm | Trách nhiệm |
| :--- | :--- |
| `markAckWindowElapsed()` | AWAITING → NO_RESPONSE khi hết window. Ghi audit. |
| `evaluateReminders()` | Gửi tin nhắc theo chu kỳ, tăng `remindersSent`, kiểm tra điều kiện dừng. |
| `evaluateEscalation()` | Chỉ chạy ladder. Không còn tự gửi SMS ngoài action `Resend SMS`. |
| `evaluateCrisisRules()` | Wrapper gọi lần lượt 3 hàm trên. Dashboard poll gọi hàm này. |

Cả 3 chỉ chạy khi `crisis.status === 'ACTIVE'` (đã đúng ở bản hiện tại — giữ nguyên).

### 5.2 Luật ack chỉ áp dụng cho tin recall (quyết định 2)

Kiểm tra lại code hiện tại: `standDownCrisis()` (dòng 690+) gửi SMS stand-down nhưng **không tạo recipient row mới**, và `evaluateEscalation()` đã chặn theo `status === 'ACTIVE'` nên sau khi STOOD_DOWN không còn nhắc/escalate. **Phần lớn hành vi đã đúng sẵn.**

Việc cần làm vì vậy nhỏ hơn dự kiến ban đầu:

1. Ghi luật thành comment tại `Dispatch.sequence` và tại `AckEscalationRule` — để dev sau không vô tình thêm ack tracking cho stand-down.
2. Thêm validation ở tab **Message Templates**: template có `sequence`/tên stand-down **không được chứa** `{{ack_link}}`. Hiện `rt-3` đã đúng, nhưng không có gì ngăn admin thêm token vào.
3. Hiển thị dòng read-only ở block 1 (§3).

**Không thêm field cấu hình nào.** Đây là điểm cần nói rõ để tránh over-build.

### 5.3 Nội dung tin nhắc

`resendToRecipient()` (dòng 606) hiện gửi lại nguyên văn `dispatches[0].renderedMessage` — người nhận không phân biệt được tin nhắc với tin gửi trùng.

Sửa: nếu `reminderTemplateId` được cấu hình thì render template đó; nếu không, thêm tiền tố `[NHẮC LẦN n]` vào tin gốc. Placeholder mới cần bổ sung vào `RECALL_PLACEHOLDERS`:

| Token | Ý nghĩa |
| :--- | :--- |
| `{{reminder_no}}` | Nhắc lần thứ mấy |
| `{{minutes_remaining}}` | Còn bao nhiêu phút trước khi hết ack window |

Lưu ý: mỗi placeholder thêm vào sẽ làm tin dài ra — phải kiểm tra lại `smsSegmentInfo()` trên tab Message Templates để không vô tình đẩy tin nhắc sang 2 segment.

---

## 6. Ba lỗi runtime phải sửa

Ba lỗi này **độc lập với mọi quyết định scope ở §2** — nên sửa trước, không cần chờ Ops workshop.

### 6.1 Đồng hồ escalation bị reset sau mỗi lần gửi lại 🔴

- **Vị trí:** `crisisRuntime.ts:616` ghi `sentAt = now`; dòng 652 tính `elapsedMin` từ chính `sentAt`.
- **Hệ quả:** mốc Ops chốt sẽ không bao giờ đúng. Ví dụ nhắc 2 lần cách 3 phút, bước escalation cấu hình ở phút 12 → thực tế chạy ở **phút 18**, trễ 6 phút. Càng nhắc nhiều, lệch càng lớn.
- **Sửa:** mọi phép tính dùng `firstSentAt` (§4.3), không dùng `sentAt`.

### 6.2 Chuyển NO_RESPONSE không ghi audit 🔴

- **Vị trí:** `crisisRuntime.ts:655-657` — update DB nhưng không gọi `auditCrisis()`.
- **Vi phạm:** Build plan §302 — *mọi state change phải được ghi kèm actor và timestamp*.
- **Hệ quả:** after-action report không trả lời được "ai im lặng, từ lúc mấy giờ" — câu hỏi chắc chắn xuất hiện trong review sau sự cố.

### 6.3 Audit ghi "executed" cho hành động không thực thi 🟠

- **Vị trí:** `crisisRuntime.ts:666-678`.
- Sau khi bỏ 2 action (quyết định 4), phần này thu hẹp lại nhưng **vẫn còn**: `Resend SMS` bị bỏ qua âm thầm khi member không có số mobile (`&& r.mobile`), audit vẫn ghi *"Escalation step executed"*.
- **Sửa:** tách thành `Escalation step executed` và `Escalation step skipped` + lý do (`không có số mobile` / `đã acknowledge` / `delivery FAILED`).

### 6.4 API không validate

`src/app/api/admin/crisis-config/ack-escalation/route.ts` chỉ sort ladder. Hiện có thể lưu `ackWindowMinutes = 0` hoặc số âm, hai bước ladder trùng mốc phút.

Bổ sung:

| Field | Luật |
| :--- | :--- |
| `ackWindowMinutes` | số nguyên ≥ 1 |
| `reminderFirstAfterMinutes` | ≥ 1 **và** < `ackWindowMinutes` (nhắc sau khi đã hết window là vô nghĩa) |
| `reminderIntervalMinutes` | ≥ 1 |
| `reminderMaxCount` | 0–10 |
| `ladder[].afterMinutes` | ≥ 1, không trùng nhau, sort tăng dần (đã có sort) |
| Ít nhất 1 ack method | Nếu tắt cả hai → chặn lưu, không chỉ cảnh báo như hiện tại |

---

## 7. Audit events sau khi sửa

### 7.1 Cấu hình (Admin Audit Log)

| Event | Trạng thái |
| :--- | :--- |
| `Edit Acknowledgement & Escalation Rules` | Đã có — cần bổ sung `details` liệt kê field nào đổi, thay vì chuỗi cố định |
| `Edit Reminder Rules` | **Mới** |
| `Acknowledgement method changed` | **Mới** — tách riêng vì bật reply-keyword khi chưa có two-way number là thay đổi rủi ro cao |

### 7.2 Runtime (`crisisAuditLog`)

| Event | Trạng thái |
| :--- | :--- |
| `Acknowledged` / `Declined` | Đã có |
| `Marked contacted` | Đã có |
| `Manual re-send` | Đã có |
| `Ack window elapsed — NO_RESPONSE` | **Thiếu → thêm** (§6.2) |
| `Reminder sent` | **Mới** — kèm số lần thứ mấy. Phải tách khỏi `Manual re-send` để report phân biệt được hệ thống nhắc mấy lần và người nhận phản hồi ở lần nào |
| `Reminder skipped` | **Mới** — kèm lý do |
| `Escalation step executed` | Đã có — thu hẹp lại đúng nghĩa (§6.3) |
| `Escalation step skipped` | **Mới** — kèm lý do |
| ~~`Quorum met` / `Quorum lost`~~ | **Không làm** — quorum đã bị gỡ |

---

## 8. Danh sách file phải sửa

### 8.1 Gỡ Quorum

| File | Vị trí | Việc |
| :--- | :--- | :--- |
| `src/lib/crisisConfig.ts` | 261-266, 411-414 | Gỡ 4 field khỏi interface + default seed |
| `src/lib/crisis.ts` | 282, 290-305 | Gỡ `QuorumState`, `evaluateQuorum()` |
| `src/app/api/crises/[id]/route.ts` | 22, 70 | Gỡ import và field `quorum` khỏi payload |
| `src/app/crisis/[id]/page.tsx` | 31, 41, 175, 420-431 | Gỡ type, destructure, banner QUORUM MET |
| `src/app/admin/crisis-config/page.tsx` | 1288-1325 | Gỡ nguyên block QUORUM |
| `Crisis-Management-Emergency-Recall-Build-Plan.md` | §81, §195, §204, Q3 | Cập nhật văn bản (§2.1b) |

### 8.2 Gỡ 2 escalation action

| File | Vị trí | Việc |
| :--- | :--- | :--- |
| `src/lib/crisisConfig.ts` | 243 | Thu hẹp union `action` |
| `src/app/admin/crisis-config/page.tsx` | 1255-1260 | Bỏ 2 `<option>` |
| `src/app/admin/crisis-config/page.tsx` | 1274-1279 | Bỏ cảnh báo Voice call (không còn cần) |
| `src/lib/crisisRuntime.ts` | 666-678 | Dọn nhánh, thêm audit `skipped` |
| Build plan | Q4 | Đóng — voice ngoài scope |
| `src/lib/crisisConfig.ts` | 157-170 | Gắn comment `tier` = informational only (§2.1a) |

### 8.3 Thêm Reminder Rules

| File | Việc |
| :--- | :--- |
| `src/lib/crisisConfig.ts` | 7 field mới + default seed (để rỗng/0, chờ Ops) |
| `src/lib/crisis.ts` | 3 field mới trên `DispatchRecipient` |
| `src/lib/crisisRuntime.ts` | `evaluateReminders()` + tách hàm (§5.1) |
| `src/app/admin/crisis-config/page.tsx` | Block 2 · REMINDER RULES |
| `src/app/api/admin/crisis-config/ack-escalation/route.ts` | Validation (§6.4) |
| `src/app/crisis/[id]/page.tsx` | Thêm cột "Đã nhắc (n lần)" vào bảng recipient |

---

## 9. Phân đợt triển khai

| Đợt | Nội dung | Phụ thuộc | Ước lượng |
| :--- | :--- | :--- | :--- |
| **A — Sửa lỗi** | §6.1 mốc thời gian · §6.2 audit NO_RESPONSE · §6.3 audit skipped · §6.4 validation | Không. Làm ngay được. | 0.5 ngày |
| **B — Dọn scope** | Gỡ Quorum (§8.1) · Gỡ 2 action (§8.2) · Cập nhật build plan | Sau A | 0.5 ngày |
| **C — Reminder Rules** | §8.3 toàn bộ | Sau B | 1.5 ngày |
| **D — Nhập số thật** | Ops điền timing vào 3 block | **Chờ Ops workshop (Build plan §9)** | — |

**Đợt A, B, C không phụ thuộc Ops** — build được ngay với field để rỗng. Đợt D chỉ là nhập dữ liệu, không phải code.

Thứ tự A → B → C là có chủ ý: sửa lỗi trên nền code cũ trước, dọn bớt code, rồi mới thêm tính năng lên nền đã sạch. Làm ngược lại sẽ phải sửa lỗi ở 2 chỗ.

---

## 10. Kịch bản kiểm thử

| # | Kịch bản | Kết quả mong đợi |
| :--- | :--- | :--- |
| 1 | Recipient không phản hồi, nhắc tối đa 2 lần | Đúng 2 tin nhắc, mốc tính từ `firstSentAt`, không trôi |
| 2 | Recipient acknowledge giữa 2 lần nhắc | Ngừng nhắc ngay, `remindersSent` giữ nguyên |
| 3 | Recipient decline, `reminderStopOnDecline = true` | Không nhắc nữa, ghi `Reminder skipped — declined` |
| 4 | Recipient không có số mobile | Không gửi, ghi `Reminder skipped — no mobile`, **không** ghi `executed` |
| 5 | Hết ack window | `NO_RESPONSE` + **có** audit entry |
| 6 | Ladder có bước ở phút 12, đã nhắc 2 lần trước đó | Bước chạy đúng phút 12 (không phải 18) — regression test của §6.1 |
| 7 | Stand-down crisis đang ACTIVE | Không sinh ack token, không nhắc, không escalate sau khi STOOD_DOWN |
| 8 | Lưu `ackWindowMinutes = 0` | API trả 400, có thông báo lỗi rõ ràng |
| 9 | Lưu `reminderFirstAfterMinutes` ≥ `ackWindowMinutes` | API trả 400 |
| 10 | Tắt cả 2 ack method rồi lưu | API trả 400 (hiện chỉ cảnh báo trên UI) |
| 11 | Mở lại config sau khi deploy | 4 field quorum cũ trong Mongo không gây lỗi đọc |

---

## 11. Câu hỏi mang vào Ops workshop

Sau các quyết định ở §2, danh sách rút xuống còn 5 câu. Mọi câu đều chỉ ảnh hưởng **giá trị số**, không ảnh hưởng thiết kế — nên không chặn đợt A/B/C.

| # | Câu hỏi | Vì sao cần |
| :--- | :--- | :--- |
| 1 | Ack window bao nhiêu phút? | Ngưỡng chuyển `NO_RESPONSE` — mốc DM bắt đầu gọi điện tay |
| 2 | Nhắc lần đầu sau bao lâu, cách nhau bao lâu, tối đa mấy lần? | 3 số điều khiển toàn bộ Reminder Rules |
| 3 | Tổng bao nhiêu SMS tới một người là chấp nhận được? | Vừa là chi phí, vừa là trải nghiệm của người đang lái xe tới hiện trường. Dùng màn mô phỏng trong prototype để Ops thấy trước |
| 4 | Notify Duty Manager ở phút thứ mấy? | Mốc chuyển từ tự động sang xử lý thủ công |
| 5 | Khi delivery FAILED, có tiếp tục nhắc không? | Nhắc vào số đã lỗi thì vô ích, nhưng lỗi tạm thời thì thử lại có giá trị. Ops chốt |

Câu hỏi đã đóng, **không đưa vào workshop nữa:** Q3 quorum (bỏ tính năng), Q4 voice call (ngoài scope).

---

## 12. Ngoài phạm vi plan này

- Reply-keyword acknowledgement — chờ two-way number (Q7). Field keyword vẫn tồn tại nhưng khoá lại khi phương thức tắt.
- Chuyển escalation từ lazy-trigger (chạy khi có người mở dashboard) sang scheduler thật. Đây là hạn chế đã được ghi nhận tại `crisisRuntime.ts:629-636` và phải xử lý trước khi module chạy không người trực — nhưng là hạng mục hạ tầng riêng, không thuộc plan này.
- Rule riêng theo crisis level — đã loại bỏ theo quyết định 1.
