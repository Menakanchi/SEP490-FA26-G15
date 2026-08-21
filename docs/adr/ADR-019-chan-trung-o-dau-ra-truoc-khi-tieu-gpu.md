# ADR-019: Chặn kịch bản trùng ở đầu ra bằng so khớp động học tất định, đặt trước cổng GPU

**Ngày:** 2026-08-21
**Trạng thái:** Proposed — Phase 2, chốt cùng review API cổng 1
**Liên quan:** mở rộng [ADR-015](ADR-015-chan-trung-o-loi-vao-bang-so-khop-chuoi.md) §Ngoài phạm vi; lấy bối cảnh mới từ [ADR-018](ADR-018-dao-thu-tu-hai-cong-duyet.md)

## Bối cảnh

[ADR-015](ADR-015-chan-trung-o-loi-vao-bang-so-khop-chuoi.md) chặn **câu hỏi** trùng ở lối vào bằng so khớp chuỗi đã chuẩn hoá, và ghi thẳng hai thứ nó không giải:

- §Rủi ro chấp nhận: *"Xe máy tạt đầu ô tô"* và *"Ô tô bị xe máy tạt đầu"* là hai chuỗi khác nhau tả cùng một tình huống — MVP không bắt được.
- §Ngoài phạm vi: *"trùng lặp ở phía **đầu ra** — hai câu vào khác nhau nhưng sinh ra hai kịch bản có cùng cấu hình động học… Không giải ở đây."*

ADR này giải phần thứ hai. Ba thứ đã đổi kể từ 12/8.

### Giá của một bản trùng đã tăng, và ADR-015 chưa biết điều đó

ADR-015 cân nhắc trên giả định một bản trùng tốn *hai lượt gọi LLM cộng một chỗ trong hàng chờ duyệt*. Với cái giá đó, kết luận "chưa đủ dữ liệu thì đừng chốt ngưỡng" là đúng.

[ADR-018](ADR-018-dao-thu-tu-hai-cong-duyet.md) (19/8) chèn một lượt chạy CARLA vào giữa hai cổng duyệt:

```text
sinh spec + .xosc -> pending_sim_review -> BEFORE_SIM
  -> simulation_queued -> CARLA -> pending_library_review -> BEFORE_LIBRARY
```

Một kịch bản trùng bây giờ tiêu: 2 lượt LLM + **một lượt GPU** + **hai lần người duyệt ngồi xem**. Lượt GPU là tài nguyên khan hiếm nhất trong dự án — một server CARLA, chạy trên máy Windows của một người.

### Miền bài toán hẹp nên va chạm là tất yếu

[ADR-016](ADR-016-pham-vi-converter-mot-anchor-da-kiem-chung.md) chốt `DEFAULT_SUPPORT_POLICY` ở **76 ô**. Cùng một đội, cùng một miền, 76 ô: hai người làm cùng ô là chuyện thường ngày, không phải trường hợp biên. ADR-015 §Bối cảnh đã dự đoán đúng chuyện này — chỉ chưa lường được nó đắt tới đâu sau ADR-018.

### "Anh em họ" là dạng trùng mà đầu vào không bao giờ bắt được

ADR-015 §Bối cảnh mô tả chính xác triệu chứng: LLM không tất định, chạy lại cùng một câu cho ra *"78 km/h thay vì 80, giây thứ 6 thay vì 7 — khác đủ để không nhận ra, không khác đủ để có thêm giá trị"*.

Không phép so nào ở **đầu vào** bắt được ca này, kể cả có tầng cosine: hai chuỗi vào có thể giống hệt nhau (đã bị §15 chặn) hoặc khác hẳn nhau, nhưng thứ trùng nằm ở **đầu ra**. Muốn thấy nó thì phải nhìn vào spec.

### Vị trí sai làm hỏng mọi thiết kế đặt sau `parse_intent`

Đề xuất tự nhiên nhất — và đã có người trong đội đề xuất — là chèn phép kiểm **sau `parse_intent`, trước `generate_draft`**, so ô ODD rồi so thêm vài trường như `speed`, `time_of_day`.

Chỗ đó không làm được, vì lý do cấu trúc chứ không phải lý do hiệu năng: **thứ cần so chưa tồn tại.** `initial_speed_kmh`, `trigger.value`, `actors` đều nằm trong `ScenarioDraft`, mà draft chưa sinh. Ở điểm đó chỉ có ô ODD cộng với đúng những chữ người dùng tình cờ gõ ra.

Triệu chứng của việc đặt sai chỗ này nhận ra được: danh sách trường phải so cứ dài thêm mỗi lần gặp một ví dụ mới (thêm `speed`, rồi khoảng cách trigger, rồi số actor), và các trường được chọn không phải trục ODD — `time_of_day` thì `ODDCell` đã **cố ý** loại khỏi trục thứ tư. Đó là dấu hiệu đang dựng một taxonomy thứ hai, ngầm, để bù cho dữ liệu chưa có.

## Các lựa chọn

### 1. Không làm gì, dựa vào ADR-015

- **Ưu:** không viết dòng nào; ca gõ lại y hệt đã được chặn.
- **Nhược:** để lọt đúng hai ca đắt nhất — diễn đạt khác cùng ý, và "anh em họ" do LLM không tất định. Cả hai đều đi tới cổng GPU.

### 2. Thêm tầng ngưỡng cosine ở lối vào

- **Ưu:** bắt được câu diễn đạt khác nhưng cùng ý, trước khi tiêu bất kỳ lượt LLM nào.
- **Loại.** Đây đúng là Lựa chọn 2 mà ADR-015 đã cân nhắc và loại, và §Ngưỡng đảo ngược đặt điều kiện mở lại: ≥300 câu người dùng thật **và** >20% request rơi vào nhóm gần giống. Đo trên `data/app.db` hôm nay: **27 scenarios, 22 generation_requests**. Chưa tới 10% của điều kiện thứ nhất. Không mở.
- Ngoài ra nó vẫn không bắt được "anh em họ": hai câu vào giống hệt nhau thì cosine bằng 1, nhưng ADR-015 đã chặn ca đó rồi bằng phép so rẻ hơn.

### 3. So khớp động học tất định, đặt ở cổng 1 (`BEFORE_SIM`)

- **Ưu:** so được thứ thật sự trùng (spec, không phải chữ); tất định, không ngưỡng bịa; bắt luôn cả hai ca mà lối vào bỏ sót; chặn đúng trước khoản chi đắt nhất.
- **Nhược:** đã tiêu 2 lượt LLM trước khi biết là trùng.

### 4. So khớp động học nhưng đặt ở cổng 2 (`BEFORE_LIBRARY`)

- **Loại.** Cổng 2 nằm **sau** lượt chạy CARLA. Chặn ở đó là đã tiêu đúng thứ đắt nhất rồi mới phát hiện ra không cần tiêu.

## Quyết định

**Lựa chọn 3.**

### 19.1 Vị trí: cổng 1, trong handler `POST /review` khi `gate=BEFORE_SIM` và `approved=true`

Chạy ngay trước khi tạo `ScenarioJob` (`src/api/routes.py:329`). Không thêm node, không đụng `graph.py`, không đổi contract của bảy node — cùng nguyên tắc như [ADR-015](ADR-015-chan-trung-o-loi-vao-bang-so-khop-chuoi.md) §15.1.

Kịch bản trùng vẫn được **sinh** và vẫn nằm ở `pending_sim_review`. Thứ bị chặn là **lượt GPU**, không phải lượt sinh.

### 19.2 Khoá so sánh: ô ODD + động học, tất định

Hai kịch bản là *gần trùng* khi thoả **tất cả**:

| Điều kiện | Nguồn |
|---|---|
| `ODDCell.key` bằng nhau | `spec.odd.key` |
| Cùng `trigger.type`, và `abs(Δ trigger.value) <= 5.0` | `spec.maneuvers[i].trigger` |
| `abs(Δ initial_speed_kmh) <= 5.0` cho từng actor khớp vai | `spec.actors[i].initial_speed_kmh` |
| Cùng đa tập `(category, is_ego)` của `actors` | `spec.actors` |
| Cùng đa tập `maneuver` của `maneuvers` | `spec.maneuvers[i].maneuver` |

Đơn vị của `trigger.value` phụ thuộc `trigger.type` (mét nếu `distance_to_ego`, giây nếu `simulation_time`), nên **bắt buộc so `type` trước** rồi mới so `value`. So `value` khi `type` khác nhau là so mét với giây.

**`time_of_day` không nằm trong khoá.** Nó không phải trục ODD (`ODDCell` nói rõ), và đưa nó vào là dựng trục đo phủ thứ hai — đúng lỗi mà `ODDCell` docstring cảnh báo.

**`title` và `description_vi` không nằm trong khoá.** Trùng ở đây là trùng **động học**, không phải trùng chữ. Chữ đã có ADR-015 lo.

### 19.3 Ngưỡng lấy từ miền bài toán, không phải từ thống kê corpus

`5.0 km/h` và `5.0 m` biện hộ được mà không cần một dòng dữ liệu nào: dưới mức đó, hai kịch bản cho ra cùng một tình huống nguy hiểm với cùng một quỹ đạo tránh — khác biệt nằm dưới sai số của chính `RelativeLanePosition` mà [ADR-012](ADR-012-converter-dung-relativelaneposition.md) dùng.

Đây là điểm phân biệt ADR này với Lựa chọn 2 của ADR-015. Lý do ADR-015 loại tầng cosine là *"ngưỡng là số bịa cho tới khi có dữ liệu đo"* — đúng, vì `0.95` trong không gian cosine không có nghĩa vật lý nào. `5 km/h` thì có.

Ngưỡng đặt trong `src/config.py`, không hard-code tại chỗ dùng — để hiệu chỉnh được khi có dữ liệu thật mà không phải sửa logic.

### 19.4 Phạm vi tra cứu: mọi trạng thái trừ `rejected` và `failed`

| Trạng thái | Có tra không | Vì sao |
|---|---|---|
| `approved_library` | ✅ | Việc đã làm xong |
| `pending_library_review`, `simulation_queued` | ✅ | Đã tiêu GPU hoặc đang tiêu |
| `pending_sim_review` | ✅ | Hai bản trùng cùng chờ ở cổng 1 |
| `rejected` | ❌ | Người đã loại nó; sinh lại bản gần giống là hợp lệ |
| `failed` | ❌ | Cùng lý do [ADR-015](ADR-015-chan-trung-o-loi-vao-bang-so-khop-chuoi.md) §Ghi chú: hỏng hạ tầng thì chạy lại là đúng |

Khác với ADR-015 ở chỗ `rejected`: lối vào **có** tra `rejected` vì mục đích là cho người dùng xem *lý do từ chối*. Cổng 1 thì không — reviewer đứng ở đó chính là người đã từ chối, và ngăn họ thử một biến thể sau khi loại bản đầu là chặn nhầm việc hợp lệ.

### 19.5 Hành vi: báo cho reviewer, không chặn cứng

Trùng thì trả về cảnh báo kèm `scenario_id` của bản gần nhất và **danh sách chênh lệch cụ thể** — *"gần trùng `sc_012`: lệch 2 km/h ở `adversary_1`, lệch 1.5 m ở trigger"* — rồi để reviewer quyết.

Không dùng `4xx`. Đây không phải lỗi, và trùng đôi khi là cố ý (kiểm tra tính lặp lại của chính pipeline). Cùng tinh thần [ADR-015](ADR-015-chan-trung-o-loi-vao-bang-so-khop-chuoi.md) §15.4.

Có cờ `force_simulate` để bỏ qua, ghi lại lý do vào `review_decisions`.

## Lý do

1. **Chặn đúng trước khoản chi đắt nhất.** Sau ADR-018, thứ khan hiếm là lượt GPU và thời gian reviewer, không phải lượt gọi LLM. Đặt phép kiểm ở cổng 1 tiêu 2 lượt LLM để cứu 1 lượt GPU cộng 2 lần người ngồi xem. Đổi vài xu lấy vài phút GPU là đúng chiều.
2. **So thứ thật sự trùng.** Hai kịch bản trùng nhau ở chỗ chúng dựng cùng một tình huống nguy hiểm, không ở chỗ chúng được tả bằng chữ giống nhau. Spec là nơi thông tin đó tồn tại; mọi phép so trước `generate_draft` đều đang đoán.
3. **Bắt được cả hai ca mà ADR-015 bỏ sót, mà không cần embedding.** Diễn đạt khác cùng ý → cùng ô ODD → động học gần nhau → bắt được. "Anh em họ" 78-vs-80 km/h → rơi thẳng vào ngưỡng 5 km/h. **Không tầng cosine nào cần thiết cho việc này.**
4. **Ngưỡng có nghĩa vật lý nên không vướng lý do ADR-015 đưa ra.** §Ngưỡng đảo ngược của ADR-015 gác *tầng cosine ở đầu vào*; nó không gác một phép so tất định ở đầu ra, vốn được §Ngoài phạm vi liệt kê là "cần ADR riêng", không phải "bị cấm".
5. **Sai sót là bỏ sót, không phải chặn nhầm.** §19.5 chỉ cảnh báo. Trường hợp xấu nhất là reviewer bấm qua một dòng chữ — rẻ hơn nhiều so với việc chặn nhầm một kịch bản hợp lệ.

## Ngưỡng đảo ngược

Xem lại ADR này khi **một trong hai** điều xảy ra:

- Số kịch bản `approved_library` vượt **500**, khiến quét tuyến tính trong cùng ô ODD không còn rẻ. Lúc đó thêm index tổng hợp hoặc khoá băm trên động học đã làm tròn, chứ **không** phải chuyển sang embedding.
- Đo được **>15%** cảnh báo bị reviewer bỏ qua bằng `force_simulate`. Tỉ lệ đó nghĩa là ngưỡng quá rộng: siết `5.0` xuống, **bằng số đo được**, không bằng cảm giác.

Ngược lại, nếu sau ADR này mà tỉ lệ "gần giống lọt chặn chuỗi" ở lối vào vẫn cao, thì đó mới là dữ liệu để mở lại §Ngưỡng đảo ngược của ADR-015 — chứ không phải cảm giác rằng embedding thông minh hơn.

## Hệ quả

**Đo trước đã.** Trước khi viết logic chặn, log `spec.odd.key` cộng động học đã làm tròn cho mọi kịch bản đi qua cổng 1. Hai tuần dữ liệu trả lời được câu *"bao nhiêu % kịch bản tới cổng GPU là gần trùng"* — và nếu con số đó dưới 5% thì ADR này nên bị hoãn, không phải triển khai. **Không tự cho phép bỏ qua bước này.**

**Code:**
- Hàm `is_near_duplicate(spec_a, spec_b) -> DuplicateDiff | None` đặt cạnh `schemas.py`, thuần, không I/O, không LLM. Kèm test khoá hành vi — cùng loại như `test_odd_key_is_stable` và `test_normalize_prompt`, vì đây cũng là một khoá hỏng im lặng được.
- Truy vấn ứng viên lọc trước bằng bốn cột `road_type/weather/actor_type/maneuver` đã có index, rồi mới so động học trong Python. Cùng hình dạng "pre-filter SQL rồi tính trong bộ nhớ" như [ADR-013](ADR-013-sqlite-blob-thay-qdrant.md).
- Ngưỡng vào `src/config.py`: `near_duplicate_speed_kmh = 5.0`, `near_duplicate_distance_m = 5.0`.

**API:** `POST /review` thêm `force_simulate: bool = False`, và một dạng phản hồi cảnh báo khi `gate=BEFORE_SIM`, `approved=true` mà phát hiện gần trùng.

**Không đụng:** `graph.py`, contract bảy node, `Retriever`, `SQLiteRetriever.retrieve`, bộ lọc `status='approved_library'` của retrieve, và toàn bộ cơ chế chuỗi chuẩn hoá của ADR-015. ADR này **cộng thêm** một tầng ở vị trí khác, không thay thế gì.

**Rủi ro chấp nhận, nói rõ để không ai tưởng đã xong:**

- Hai kịch bản cùng ô ODD, cùng động học, nhưng **khác `time_of_day`** sẽ bị báo trùng. Có chủ đích: `time_of_day` không phải trục đo phủ, và ban ngày với ban đêm ở cùng một tình huống cắt đầu là cùng một phép thử với ADS. Reviewer bỏ qua được bằng `force_simulate` nếu không đồng ý.
- Phép so là **cặp đôi**, không phải gom cụm. Ba kịch bản A-B-C mà A gần B, B gần C, còn A xa C thì cả ba vẫn qua được, chỉ có cảnh báo lẻ. Gom cụm cần dữ liệu chưa có; không giải ở đây.
