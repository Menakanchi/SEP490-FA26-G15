# ADR-014: Giám sát của con người khi sinh hàng loạt — duyệt theo lô, và batch không vào thư viện

**Ngày:** 2026-08-12
**Trạng thái:** Proposed — **cần chốt trước khi viết review API**, dù phần thi hành thuộc Phase 4

## Bối cảnh

`ARCHITECTURE.md` §Hai chế độ sinh mô tả chế độ wholesale: người khoanh một vùng ODD, agent sinh hàng loạt kịch bản, chạy CARLA, đo, rồi tự quyết vòng sau sinh gì (explore lấp chỗ trống + exploit đào sâu chỗ gần-fail). Đó là Phase 4.

Vấn đề: sơ đồ đó vẽ một mũi tên vòng lại, và mũi tên ấy đâm thẳng vào **hai quy tắc đã chốt**, cả hai đều được thiết kế cho luồng retail — một người, một câu, một kịch bản, một cú bấm.

**1. Cổng `BEFORE_SIM` chặn đúng chỗ vòng lặp cần đi qua.** FR-12 bắt *chỉ tạo job sau khi người duyệt đồng ý*, và [ADR-011](ADR-011-persistence-schema-va-state-transitions.md) §3.3 ghi rõ bảng transition là **"không có đường nào khác"** — đường tới một `ScenarioJob` bắt buộc qua `approved_library` → `pending_sim_review` → approve `BEFORE_SIM`. Nhưng exploit **bắt buộc** phải chạy CARLA mới biết một kịch bản hụt 1,5 m hay 40 m. Một lô 200 kịch bản như vậy cần 200 cú bấm chuột. Vòng lặp lúc đó không còn là vòng lặp.

**2. Cổng `BEFORE_LIBRARY` gác thư viện, nhưng nó chỉ gác được rác.** Thư viện tồn tại để làm few-shot cho `generate_draft` — chính vì thế `retrieve` chỉ lấy `status='approved_library'`, và chính vì thế *"rác lọt vào đây là rác nhân lên theo thời gian"*. Đổ 200 kịch bản máy tự sinh vào đó thì: không ai duyệt xuể, và thứ lọt qua không phải rác mà là **hợp lệ-nhưng-trùng lặp** — thứ cổng này không có tín hiệu nào để nhận ra.

**Vì sao chốt bây giờ dù thi hành ở Phase 4.** Review API và `next_status_after_review()` được viết ở **Phase 1**. Nếu bảng `review_decisions` và chữ ký hàm đó được xây với giả định ngầm *"một quyết định ↔ đúng một scenario"*, thì tới Phase 4 muốn duyệt theo lô sẽ phải mổ lại phần đã chạy ổn định. Ghi trước vào schema gần như miễn phí; sửa sau thì không. Đây đúng là lý lẽ [ADR-011](ADR-011-persistence-schema-va-state-transitions.md) đã dùng để tự biện minh cho việc chốt schema trước khi viết API.

ADR này **không** chốt thuật toán explore/exploit, không chốt tỉ lệ chia giữa hai chế độ, không chốt bảng `batch_runs`. Nó chỉ chốt đúng hai chỗ mà Phase 1 cần biết trước.

## Các lựa chọn

### Vấn đề A — cổng `BEFORE_SIM` với luồng batch

**A1. Giữ nguyên: mỗi scenario một cú bấm.**
- Ưu: không đổi gì; ràng buộc *"người phê duyệt trước khi điều khiển thiết bị"* ở dạng rõ ràng nhất.
- Nhược: closed-loop không chạy được. Hoặc người bấm 200 lần liên tiếp mà không thực sự đọc — và **rubber-stamp còn tệ hơn không có cổng**, vì nó tạo cảm giác an toàn giả trong khi vẫn tốn thời gian người.

**A2. Bỏ cổng cho luồng batch.**
- **Loại.** Vi phạm trực tiếp ràng buộc của đề bài. Đây là thứ duy nhất trong ADR này không được đem ra đánh đổi.

**A3. Cổng áp lên *lô*, không lên từng scenario.**
- Ưu: người duyệt nhìn đúng thứ họ có thông tin để quyết — sắp chạy phạm vi ODD nào, bao nhiêu kịch bản, trần chi phí bao nhiêu — rồi đồng ý một lần. Giám sát thật thay vì nghi thức.
- Nhược: một quyết định cấp phép cho nhiều lần chạy thiết bị, nên phạm vi cấp phép phải có biên rõ ràng và biên đó phải nằm trong chính quyết định.

### Vấn đề B — kịch bản sinh hàng loạt có vào thư viện không

**B1. Vào hết, sau khi duyệt từng cái.**
- Nhược: không ai duyệt xuể. Thực tế sẽ thoái hoá thành A1.

**B2. Vào hết, bỏ cổng.**
- **Loại.** Đầu ra của batch quay lại làm few-shot cho batch sau là biến mode collapse thành thuộc tính của hệ thống.

**B3. Không vào theo mặc định; batch là bộ test riêng, chỉ thăng hạng thủ công từng cái.**
- Ưu: giữ nguyên mọi tính chất `BEFORE_LIBRARY` đang bảo vệ; hai mục đích khác nhau được để riêng.
- Nhược: kịch bản hay sinh ra từ batch cần một thao tác thủ công mới vào được kho mẫu.

## Quyết định

**A3 + B3.**

### 14.1 Đơn vị duyệt của luồng batch là **lô**, không phải scenario

- Thêm khái niệm `BatchRun`: phạm vi ODD (`list[ODDCell]` sau khi giao với `SupportPolicy.supported_cells()`) + số kịch bản mỗi ô + **trần chi phí** (USD và thời gian GPU).
- Cổng `BEFORE_SIM` áp lên `BatchRun`. Một quyết định duyệt cấp phép tạo job cho mọi scenario sinh ra trong lô đó — **trong giới hạn trần đã ghi trong chính quyết định**.
- **Trần là một phần của thứ được duyệt, không phải cấu hình bên cạnh.** Chạm trần thì lô dừng và cần một quyết định mới. Không có đường tự nới.
- `ReviewGate` giữ nguyên hai giá trị. Đổi *thứ được trỏ tới*, không đổi ý nghĩa của cổng.

### 14.2 Scenario sinh trong lô không vào thư viện theo mặc định

- Batch scenario nằm lại ở `pending_review` cho tới khi có người bấm thăng hạng từng cái, qua `BEFORE_LIBRARY` y như luồng retail.
- Hệ quả trực tiếp, và là điều đang được bảo vệ: batch scenario **không có embedding**, **không xuất hiện trong `retrieve`**, **không bao giờ làm few-shot** — trừ khi một người đã đọc và chọn nó.
- *"Human review sample"* ở bảng so sánh của §07 từ nay có nghĩa cụ thể: xem mẫu để **đánh giá chất lượng lô** và quyết định chạy tiếp hay dừng — **không** phải để nhập kho.

### 14.3 Không thêm `ScenarioStatus` nào

`pending_review` vốn đã mang đúng ngữ nghĩa cần thiết: chưa vào thư viện, chưa có embedding, không xuất hiện trong retrieval. Bảng bốn trạng thái của [ADR-011](ADR-011-persistence-schema-va-state-transitions.md) §3.3 **giữ nguyên**, không cần errata.

Phân biệt hai luồng bằng một cột `origin` (`retail` | `batch`), không bằng một trạng thái thứ năm.

### 14.4 Quan hệ với ADR-011: mở rộng, không lật

Bảng transition của ADR-011 §3.3 nói *"không có đường nào khác"* để tới một `ScenarioJob`. Điều đó **vẫn đúng nguyên văn cho `origin='retail'`**.

Với `origin='batch'`, quyền tạo job đến từ một quyết định `BEFORE_SIM` đã duyệt trên `BatchRun`, chứ không từ transition của từng scenario. Đây là một **đường thứ hai** mà ADR-011 chưa lường tới — cần nói thẳng ra thay vì để nó lẻn vào lúc implement. ADR-011 không bị supersede: nội dung quyết định của nó không sai đi chỗ nào, chỉ hẹp hơn phạm vi thật.

## Lý do

1. **Rubber-stamp tệ hơn không có cổng.** 200 cú bấm liên tiếp không phải giám sát, đó là nghi thức: tốn đúng thời gian người mà không tạo ra phán đoán nào. Duyệt ở mức lô đặt cổng vào đúng chỗ người thật sự có thông tin — phạm vi và chi phí — thay vì chỗ họ chỉ có thể gật.
2. **Ràng buộc của đề bài được giữ về bản chất.** Người vẫn phê duyệt trước khi máy điều khiển thiết bị. Chỉ đổi độ hạt của vật được duyệt, và vì trần chi phí nằm *trong* quyết định nên phạm vi cấp phép vẫn có biên đo được.
3. **Thư viện và bộ test có mục đích ngược nhau.** Thư viện là kho ví dụ dạy LLM — chất lượng quan trọng hơn số lượng, vài chục cái tinh là đủ. Bộ test là tập kịch bản để đo model lái — số lượng và độ phủ mới là thứ cần. Trộn hai cái là làm hỏng cả hai cùng lúc.
4. **Cổng `BEFORE_LIBRARY` không có khả năng chặn thứ nguy hiểm nhất của batch.** Nó chặn rác. Một kịch bản trùng lặp thì schema pass, geometry pass, reviewer không có tín hiệu nào để nhận ra nó thừa. Cách chắc chắn duy nhất hôm nay là **không đưa vào**, thay vì tin rằng cổng sẽ lọc được.
5. **Rẻ khi quyết bây giờ, đắt khi sửa sau.** Hai cột nullable trong schema Phase 1 so với mổ lại luồng duyệt đang chạy ổn định ở Phase 4.

## Ngưỡng đảo ngược

Viết ADR mới cho 14.2 khi **đo được**: quá **30%** batch scenario được người thăng hạng thủ công vào thư viện. Lúc đó mặc định *"không vào"* đang tạo thao tác thừa chứ không bảo vệ gì, và cơ chế nên đảo thành duyệt-để-loại thay vì duyệt-để-nhận.

Không đảo 14.1 vì cảm giác "duyệt lô rườm rà" — đảo nó nghĩa là quay lại A1 hoặc A2, mà A2 đã bị loại vĩnh viễn.

## Hệ quả

**Ràng buộc lên Phase 1 — làm ngay, dù chưa có batch nào:**

- `review_decisions` thêm cột `batch_id` (nullable). Một quyết định trỏ tới **scenario hoặc lô**, đúng một trong hai khác NULL — ràng buộc ở tầng DB, không ở tầng ứng dụng.
- `scenarios` thêm `origin` (`retail` | `batch`, mặc định `retail`) và `batch_id` (nullable).
- Hàng chờ duyệt **lọc `origin='retail'` theo mặc định**. Không có dòng này thì lô đầu tiên sẽ nhấn chìm hàng chờ của luồng retail.
- `next_status_after_review(current, gate, approved)` **giữ nguyên chữ ký**. Đường cấp job cho batch là một hàm riêng — không nhồi thêm tham số vào hàm đang giữ bất biến của luồng retail.

**Để lại cho Phase 4, ADR này không chốt:** bảng `batch_runs`, thuật toán explore/exploit, tỉ lệ chia giữa hai chế độ, cách sinh câu tiếng Việt từ một `ODDCell`.

**Phụ thuộc phải nói rõ:** 14.1 chỉ có ích khi `ExecutionResult.metrics` đã có `min_distance_m` / `ttc_min_s` (thêm lúc dựng worker, Phase 2). Không có hai số đó thì exploit không có gradient để leo, và một lô chạy CARLA chỉ phục vụ đo validity chứ không đóng được vòng lặp.

**Tài liệu cập nhật cùng lúc với ADR này:** `ARCHITECTURE.md` (§Lộ trình bốn phase, §Hai chế độ sinh, bảng trạng thái — lộ trình và mô hình wholesale trước đó chỉ tồn tại trong `docs/overview.html`, một file nằm ngoài git), `docs/adr/README.md` (thêm dòng ADR-014; đánh dấu ADR-011 được mở rộng cho luồng batch), `docs/overview.html` §07 (bản trình bày, trỏ về ADR này).

**Rủi ro chấp nhận:** nếu người chấm đọc *"human-in-the-loop"* theo nghĩa từng-tạo-tác-một, cách duyệt theo lô cần được giải thích khi demo. ADR này là phần giải thích đó.
