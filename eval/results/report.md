# Evaluation Report — Scenario Forge

> Snapshot §1–§8: 24/08/2026, lấy trực tiếp từ database phát triển qua
> `GET /api/v1/metrics/quality`. §9.3–§9.5 và §10 cập nhật tới 03/09/2026; bảng
> chỉ số mới nhất ở cuối §9.5. Không tính 10 scenario `seed-data` vào M1/M2.
> Mỗi scenario chỉ dùng lần chạy CARLA mới nhất để không tự bỏ phiếu nhiều lần.

## 1. Phạm vi đo

- Simulator: CARLA 0.9.15 + ScenarioRunner 0.9.15, Town04.
- Phạm vi converter: 5 maneuver xe trên anchor `highway` và
  `run_red_light` trên anchor `urban_straight`, cùng 3 loại xe
  (`car`, `motorcycle`, `truck`) × 4 thời tiết = **72 ô hỗ trợ**.
- `jaywalk` không nằm trong phạm vi highway: tình huống không hợp lý trên anchor
  này và `AcquirePositionAction` định tuyến dọc làn thay vì băng ngang.
- Một execution `success=true` chỉ có nghĩa ScenarioRunner chạy hết. L4 mới trả
  lời hành vi có đúng ý định hay không.

## 2. Kết quả M1 — tính hợp lệ

| Mức | Định nghĩa | Kết quả |
|---|---|---:|
| L1 | Request sinh được draft qua schema và validate | **25/34 = 73,53%** |
| L2 | Scenario trong scope biên dịch được `.xosc` | **31/31 = 100%** |
| L3 | ScenarioRunner chạy hết, không crash/timeout | **30/32 = 93,75%** |
| L4 | Quỹ đạo CARLA tái hiện đúng maneuver | **16/30 = 53,33%** |

Hai lượt L3 chưa chấm được ở L4 được báo riêng, không tính thành sai. L4 hiện có
oracle cho đủ 6 maneuver trong phạm vi: `cut_in`, `lane_drift`, `sudden_brake`,
`stop_in_lane`, `wrong_way` và `run_red_light`.

## 3. Kết quả M2 — độ phủ ODD

| Cách đo | Kết quả |
|---|---:|
| Phủ toàn phần trong phạm vi converter | **12/72 = 16,67%** |
| Phủ theo cặp trục khả thi | **50/74 = 67,57%** |
| Ô có dữ liệu ở mọi scope | 15/560 |

Phủ toàn phần trả lời đã thử bao nhiêu tổ hợp hoàn chỉnh. Phủ theo cặp trả lời đã
thử bao nhiêu tương tác hai yếu tố; hai số không thay thế nhau.

### 3.1. Mật độ lặp — vì sao 31 kịch bản chỉ phủ 12 ô

**31 kịch bản trong phạm vi nằm trên 12 ô, tức trung bình ~2,6 kịch bản mỗi ô.**
Con số này nên đọc cùng M2, vì thiếu nó thì "31 kịch bản" nghe như 31 tình huống
khác nhau — không phải.

Phần lớn kịch bản lặp lại là **lần thử đi thử lại cùng một tình huống cho tới khi
nó chạy đúng**, hoặc **biến thể dò tham số**, chứ không phải đa dạng mới:

- `sc_024` cộng bốn biến thể `sc_024_t1..t4` — một kịch bản `lane_drift` với bốn
  bước dò thời điểm trigger (§9 của `docs/adr/`, phép dò 4 bước quanh mốc neo).
- Chuỗi `wrong_way` trên `car`: `sc_016` → `sc_020` → `sc_036` → `sc_038` →
  `sc_040` → `sc_042`, sáu lượt cho tới khi bản cuối bám đúng làn (§6). Chỉ
  `sc_042` được duyệt vào thư viện.
- `sc_044`/`sc_046` và `sc_045`/`sc_047`: bản hiệu chuẩn bị từ chối, rồi bản dùng
  đúng giao cắt (§7).

Hệ quả khi đọc M1: **L2 = 31/31 = 100% không mạnh như trông**. Nó nói "mọi thứ
trong phạm vi đều biên dịch được", không nói "31 tình huống độc lập đều biên dịch
được". Con số phản ánh đa dạng tình huống đúng nhất vẫn là M2 = 12/72.

Đây cũng là câu trả lời cho *"đã sinh 31 bản mà sao phủ có 16,67%"*: công sức của
đợt 22–24/08 đổ vào **làm cho một số ít ô chạy đúng**, không đổ vào phủ thêm ô
mới. Chiến dịch ODD tồn tại để đảo hướng đó.

## 4. Kết quả M3 — kích hoạt nguy hiểm

| Kết quả lần chạy mới nhất | Số lượng |
|---|---:|
| Có va chạm | 12 |
| Suýt va chạm, khe hở < 1 m | 7 |
| Không dựng được nguy hiểm | 11 |
| Tổng lượt chạy được | 30 |

Tỷ lệ kích hoạt nguy hiểm: **19/30 = 63,33%**. Collision riêng là
**12/30 = 40,00%**. `lane_drift` chủ đích dựng near-miss nên không thể chỉ dùng
`CollisionTest` làm M3.

## 5. Bằng chứng sửa `cut_in`

Trigger thời gian từng làm adversary nhập làn sau ego rồi tông đuôi. Converter
hiện dùng `lead_distance` + `ReachPositionCondition`, chỉ kích hoạt khi actor đã
dẫn trước ít nhất 7 m. Bốn lượt chạy lại đều được người xem trực tiếp xác nhận:

| Scenario | Vị trí dọc lúc vào làn | Vị trí dọc lúc chạm | Kết luận |
|---|---:|---:|---|
| `sc_011` | +11,767 m | +3,066 m | đúng |
| `sc_012` | +14,287 m | +3,472 m | đúng |
| `sc_021` | +9,707 m | +4,979 m | đúng |
| `sc_022` | +10,341 m | +3,440 m | đúng |

Số dương nghĩa là adversary ở trước ego. Cả bốn trường hợp là adversary vượt
lên, nhập làn rồi giảm tốc; ego chạm vào đuôi adversary.

## 6. Bằng chứng sửa `wrong_way`

Hai bản lịch sử `sc_020` và `sc_025` đặt actor ở +120 m, ngoài tầm +40 m của
anchor nên đã bị từ chối. Các lượt thay thế sau đó tìm ra **hai lỗi độc lập**:

1. Teleport xoay xe ở Event sau khi đã cấp tốc độ làm CARLA giữ vector quán
   tính cũ. Sửa bằng cách đặt Orientation 180° ngay trong `Init`.
2. Chỉ xoay đầu và cấp tốc độ vẫn không đủ trên đường cong: khi không có route,
   `NpcVehicleControl` chạy theo tiếp tuyến, cắt ngang nhiều làn rồi đâm hộ lan.
   Người xem trực tiếp phát hiện lỗi này ở `sc_038`–`sc_041`; độ lệch tim làn
   trước va chạm là **1,754–3,006 m**.

Converter hiện phát đồng thời SpeedAction và một `AssignRouteAction` gồm các
`RelativeLanePosition` giảm dần, `routeStrategy="shortest"`. Route đi đúng thứ
tự waypoint ngược tuyến, không qua GlobalRoutePlanner một chiều; mốc `ds=0`
được bỏ vì ScenarioRunner gọi `waypoint.next(0)` và CARLA từ chối. Kết quả cuối:

| Scenario | Actor | Heading delta | Lệch tim làn lớn nhất | Khe hở nhỏ nhất | Va chạm | Người xem |
|---|---|---:|---:|---:|---|---|
| `sc_042` | car | 180,0° | 0,188 m | 0,000 m | có | đúng |
| `sc_043` | truck | 180,0° | 0,194 m | 0,000 m | có | đúng |

Cả hai đã được duyệt vào thư viện. Oracle `wrong_way` cũng được siết lại: ngoài
heading ≥150° và khe hở <1 m, actor phải lệch tim làn không quá 1 m. Vì vậy bốn
lượt cũ lao vào hộ lan không còn bị chấm nhầm là đúng ý định.

## 7. Bằng chứng `run_red_light` cắt ngang đường ego

Anchor highway không có đèn trong tầm dùng được: đèn gần nhất cách 211,8 m,
trong khi đoạn tiến chỉ tới +40 m. Vì vậy `run_red_light` được chuyển sang anchor
`urban_straight` đã đo trên Town04: ego đi theo đèn xanh `id=118`, adversary từ
approach vuông góc vượt đèn đỏ `id=122`, hai quỹ đạo cắt nhau quanh
CARLA `(258, -169)`.

Hai bản hiệu chuẩn cùng làn `sc_044`/`sc_045` bị từ chối vì có vượt đèn đỏ nhưng
không tạo xung đột với ego. Hai bản cuối dùng đúng giao cắt:

| Scenario | Actor | Qua đèn đỏ | Chạm ego | Khe hở nhỏ nhất | Người xem |
|---|---|---:|---:|---:|---|
| `sc_046` | car | 3,983 s | 5,361 s | 0,000 m | đúng |
| `sc_047` | truck | 4,140 s | 5,451 s | 0,000 m | đúng |

Worker theo dõi trạng thái đèn của adversary và chỉ ghi
`adversary_ran_red_light=true` khi xe qua vạch lúc đèn vẫn đỏ; chờ tới xanh rồi
đi không được chấm là vượt đèn đỏ. Không dùng `RunningRedLightTest` mặc định của
ScenarioRunner vì criterion đó gắn vào ego, trong khi maneuver thuộc adversary.
Cả hai bản cuối đã được người xem xác nhận và duyệt vào thư viện.

## 8. Đối chiếu nhãn người

Sau khi ghi thêm xác nhận cho hai `run_red_light`, behavior checker khớp người
chấm **10/13 = 76,92%**. Ba bất đồng còn lại là dữ liệu cần điều tra, không bị che:

- `sc_018`: người đúng, máy sai.
- `sc_023`: người đúng, máy sai sau khi sửa biểu diễn thời tiết.
- `sc_024`: người sai, máy đúng; người thấy xe mới gần vạch, chưa lấn đủ.

Nhãn `unsure` không vào mẫu số. Phán quyết máy không được gửi trước cho người
chấm để tránh bias.

## 9. Benchmark cost/request và p50/p95 latency

Ngày 24/08/2026, benchmark online chạy **20 mô tả** trên bản sao nhất quán của
database thật: đủ 6 maneuver trong phạm vi, bốn kiểu thời tiết và ba loại xe.
Mỗi request chạy graph 7 node tới `BEFORE_SIM`; không tính HTTP polling và không
chạy CARLA. Ba request `wrong_way` bị validator từ chối vì model đặt actor ngoài
tầm anchor vẫn nằm trong mẫu số — không lọc request thất bại để làm đẹp p95.

| Chỉ số trên 20 request | Mean | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| Latency toàn workflow | 3,139 s | **2,766 s** | **4,152 s** | 5,090 s |
| Cost/request | $0,002720 | **$0,002304** | **$0,004582** | $0,006915 |
| Input token/request | 8.274 | 7.184 | 11.952 | 11.998 |
| Output token/request | 367 | 341 | 510 | 692 |
| Provider call/request | 2,30 | 2 | 3 | 3 |

- **17/20 = 85%** request hoàn tất; cả 20 đều được tính latency và cost.
- Tổng chi phí đo: **$0,054408**. Trong đó 26 LLM call là $0,054400; 20
  embedding call là $0,000008.
- Provider báo **151.808/165.079 = 91,96%** input token LLM được đọc từ cache.
  Nếu cùng token đó đều tính giá input thường, chi phí LLM sẽ là $0,156871 thay
  vì $0,054400: cached-input pricing giảm **65,32%** trên chính tập đo này.
- Rule parser xử lý trọn 16/20 mô tả; chỉ 4 request cần LLM fallback ở
  `parse_intent`. Cả 20 vẫn cần `generate_draft`; 2 request dùng thêm một lượt
  `repair_draft`; không request nào phải escalation sang `gpt-5.4`.
- Chat token lấy trực tiếp từ `usage_metadata` của provider. LangChain chỉ trả
  vector embedding nên 402 embedding token được ước lượng bằng `chars/4` và gắn
  nhãn riêng; phần này chỉ chiếm 0,015% tổng cost.
- Giá Standard tại thời điểm đo: `gpt-5.4-mini` $0,75 input / $0,075 cached /
  $4,50 output; `gpt-5.4` $2,50 / $0,25 / $15; embedding
  `text-embedding-3-small` $0,02, đều theo một triệu token. Nguồn:
  [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
  [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4),
  [text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small).
- p50/p95 dùng linear interpolation tại `(n-1)×q`. Đây là snapshot một đường
  mạng và một thời điểm; phải chạy lại khi đổi model, prompt, giá hoặc khu vực.

Artifact đầy đủ từng request và từng node:
[`cost_latency_2026-08-24.json`](cost_latency_2026-08-24.json).

### 9.1. A/B GPT-5.4 mini và GPT-5.6 Luna

Cùng ngày, 20 mô tả và snapshot database trên được phát lại bằng
`gpt-5.6-luna`. Cả hai nhánh đều dùng `reasoning_effort=none`; primary và
escalated model cùng trỏ vào model đang đo để fallback không che kết quả.

| Chỉ số | GPT-5.4 mini | GPT-5.6 Luna | Thay đổi của Luna |
|---|---:|---:|---:|
| Request hoàn tất | 17/20 | 17/20 | không đổi |
| Lượt `repair_draft` | 2 | 1 | -1 lượt |
| Latency p50 | 2,766 s | 3,950 s | +42,8% |
| Latency p95 | 4,152 s | 6,730 s | +62,1% |
| Cost/request p50 | $0,002304 | $0,000626 | -72,8% |
| Tổng cost 20 request | $0,054408 | $0,015392 | -71,7% |

Luna vẫn trượt đúng ba mô tả `wrong_way` do đặt actor ngoài tầm anchor. Một
lượt repair ít hơn chưa đủ chứng minh chất lượng tốt hơn trên 20 mẫu, trong khi
hai percentile latency đều xấu đi rõ rệt. Vì không tăng tỷ lệ hoàn tất hay sửa
được failure mode đã biết, dự án **giữ `gpt-5.4-mini` làm primary**; Luna chỉ
được ghi nhận là phương án rẻ hơn, không được đổi thành mặc định.

Artifact Luna đầy đủ từng request và từng node:
[`cost_latency_gpt56luna_2026-08-24.json`](cost_latency_gpt56luna_2026-08-24.json).

### 9.2. A/B few-shot: retrieval đóng góp được gì cho chất lượng sinh

Ngày 26/08/2026. `ADR-004` cam kết tự implement metric retrieval để chứng minh
`improved > baseline` (PLO3); cam kết đó chưa hoàn thành, và §"Trạng thái hiện
tại" của `ARCHITECTURE.md` cũng ghi nhận *"retrieval baseline bằng số thật thì
chưa"*. Phép đo dưới đây trả lời một câu hẹp hơn nhưng trả lời được ngay: **ví dụ
few-shot có làm kết quả sinh tốt hơn không, và giá bao nhiêu.**

Thiết kế: cùng 20 mô tả, cùng snapshot database, nhánh `off` **vẫn chạy node
`retrieve`** (vẫn gọi embedding, vẫn lọc `WHERE` bốn trục) mà chỉ không đưa ví dụ
vào prompt `generate_draft`. Hai nhánh vì vậy lệch đúng **một** biến. Cả hai nhánh
đều tìm được 41 ví dụ trên 20 request, xác nhận chúng chạy trên cùng một thư viện.

| Lượt | done | lượt `repair_draft` | tổng cost | cached input | output token | p50 latency |
|---|---:|---:|---:|---:|---:|---:|
| ON, cache nguội | 18/20 | 1 | $0,081482 | 65,0% | 7.094 | 2,93 s |
| **OFF** | **17/20** | **3** | **$0,043344** | 94,0% | 5.662 | 2,59 s |
| **ON, cache ấm** | **17/20** | **2** | **$0,051810** | 94,7% | 7.500 | 3,19 s |

**Vì sao có lượt thứ ba.** Lượt ON đầu tiên chạy khi cache còn nguội nên chỉ 65%
input token đọc từ cache, trong khi lượt OFF chạy sau được hưởng cache đã ấm. So
thẳng hai lượt đó cho ra "few-shot đắt gần gấp đôi", mà phần lớn chênh lệch thuộc
về **thứ tự chạy**. Chạy lại ON sau OFF (cache 94,7%, ngang OFF) mới có cặp so
được. Ghi lại cả ba lượt vì lượt nguội chính là bằng chứng của cái bẫy đó.

**Đọc trên cặp cùng điều kiện cache (OFF và ON ấm):**

- **Tỷ lệ hoàn tất không khác:** 17/20 cả hai. Ba request hỏng của hai nhánh là
  **cùng ba request** (16, 17, 18) và cùng một nguyên nhân
  `actor_beyond_anchor_reach` — model đặt actor ở `s_offset_m` 60–120 m, ngoài
  tầm anchor `(-120, +40)`. Lượt ON nguội tránh được request 16 còn lượt ON ấm
  thì không, nên chênh lệch đó là nhiễu.
- **Few-shot giảm số vòng repair:** 1–2 lượt so với 3. Nhất quán về hướng nhưng
  chênh 1–2 trên n=20 thì chưa kết luận được.
- **Few-shot đắt hơn 19,5%:** $0,051810 so với $0,043344. Nguyên nhân chính không
  phải input token (165.480 so với 157.152, chênh 5%) mà là **output token:
  7.500 so với 5.662, +32%** — có ví dụ mẫu thì model viết draft dài hơn.
- **Chậm hơn:** p50 3,19 s so với 2,59 s.

**Kết luận.** Ở quy mô thư viện hiện tại, few-shot **không mua được chất lượng đo
được**: tốn thêm ~20% chi phí và ~0,6 s để đổi lấy ít hơn 1–2 lượt repair, trong
khi tỷ lệ hoàn tất y hệt.

Đây **không** phải kết luận về few-shot nói chung mà về few-shot với thư viện hiện
tại: 18 hàng `approved_library` có embedding, trong đó 10 là `seed-data` do người
gõ tay và 3 mang `verification = ran_no_hazard` (bị `PROVEN_BAD_FOR_FEW_SHOT` loại
khỏi prompt). Tín hiệu thật còn rất mỏng.

**Việc rút ra, đáng giá hơn cả con số:** cả ba request hỏng đều hỏng vì cùng một
lý do, và few-shot không sửa được nó. Muốn L1 lên thì thứ cần sửa là prompt và
suggestion quanh `s_offset_m`, không phải retrieval. Phép đo này nên chạy lại khi
thư viện có ~50 kịch bản `adversarial` thật; nếu lúc đó vẫn hoà thì mới có căn cứ
bàn chuyện bỏ ví dụ khỏi prompt mà vẫn giữ retrieval cho thư viện.

> **Đính chính diễn giải (29/08/2026).** Số liệu ở trên đúng, nhưng "không mua
> được chất lượng đo được" là đọc quá hẹp: nó chỉ đếm pass/fail. Trên trục liên
> tục thì few-shot **có** tác dụng đo được và nhất quán — `s_offset_m` mà model
> sinh cho ba mô tả `wrong_way` là **80/120/80** khi zero-shot và **45/60/60**
> khi có ví dụ. Cả sáu đều vượt tầm anchor (+40) nên cả sáu đều hỏng, và pass
> rate che mất chuyển động đó.
>
> Đọc lại theo hướng này thì kết luận đổi hẳn: model **đi đúng hướng nhưng không
> biết dừng ở đâu**, vì chưa chỗ nào nêu con số. Thứ nó thiếu là **biên**, không
> phải **ví dụ** — và đó là đường dẫn thẳng tới §9.3.

Artifact: [`fewshot_on_cold_2026-08-26.json`](fewshot_on_cold_2026-08-26.json),
[`fewshot_off_warm_2026-08-26.json`](fewshot_off_warm_2026-08-26.json),
[`fewshot_on_warm_2026-08-26.json`](fewshot_on_warm_2026-08-26.json).

### 9.3. Tầm với anchor: dạy model một con số nó chưa từng được cho biết

Ngày 29/08/2026. §9.2 kết lại rằng ba request hỏng đều hỏng vì `s_offset_m` vượt
tầm anchor. Truy lại thì con số ấy **chưa bao giờ tới được model**, và cũng
**chưa bao giờ sửa được**:

- prompt ghi biên là *"âm đến +200 mét"* — đó là biên của kiểu dữ liệu
  (`Position.s_offset_m`), không phải của anchor. Biên thật là `(-120, +40)` trên
  `highway` và `(-60, +25)` trên `urban_straight`;
- biên thật chỉ được kiểm ở `convert_spec_to_xosc`, mà node `convert_xosc` chạy
  **sau** `promote` và không có cạnh nào quay lại `repair_draft`. Một lỗi model
  sửa được bằng đúng một con số vì thế thành lỗi chết, kèm một `scenario_id` bị
  tiêu.

Bản sửa gồm bốn phần: `validate_node` phát `GEOM_ACTOR_BEYOND_ANCHOR_REACH`
repair được (cùng khuôn mẫu với ba vị từ `cut_in`: repair được ở validate, khẳng
định lại cứng ở converter); `_build_user_content` bơm tầm với thật của anchor vào
INPUT, tra theo `road_type` nên biết trước khi gọi LLM; prompt bỏ con số ±200; và
bảng geometry có thêm dòng `wrong_way`.

| Lượt (cùng 20 mô tả, cùng snapshot) | done | lỗi vượt tầm | repair | tổng cost | p50 | cached | output token |
|---|---:|---:|---:|---:|---:|---:|---:|
| base (`HEAD~1`), chạy cùng ngày | 17/20 | **2** | 4 | $0,083696 | 2,68 s | 71,9% | 8.260 |
| **fix, cache nguội** | **19/20** | **0** | 4 | $0,079364 | 2,48 s | 75,3% | 7.869 |
| **fix, cache ấm** | **19/20** | **0** | 5 | $0,062909 | 2,56 s | 90,3% | 8.166 |

Lỗi vượt tầm anchor biến mất hoàn toàn ở cả hai lượt sau. Khối bơm vào INPUT chỉ
~41 token và nằm ở user message, nên **output token không tăng** (7.869 và 8.166
so với 8.260) và latency không xấu đi.

**Vì sao phải chạy lượt `base` thay vì so với artifact 26/08.** Lượt fix đầu tiên
làm hỏng sample 4 — một lỗi không có trong artifact cũ, trông y hệt regression.
Chạy lại `HEAD~1` trong **cùng ngày** thì sample 4 hỏng y hệt: đó là model drift
trong ba ngày, không phải bản sửa. §9.2 đã phải chạy lượt thứ ba vì biến *thứ tự
cache*; đây là biến *thời điểm*. Cùng một luật: **so hai lượt khác ngày là so hai
biến cùng lúc.**

**Sample 4 hỏng ở cả ba lượt**, vì một lỗi khác và có thật: với câu *"xe máy từ
phía sau tạt đầu xe ego đang chạy 45 km/h"*, rule parser gán 45 km/h cho **cả**
`adversary_speed_kmh` lẫn `ego_speed_kmh`, dù câu chỉ nói tốc độ của ego. Từ đó
`INTENT_SPEED_MISMATCH` đòi adversary = ego, còn hình học `cut_in` từ phía sau
đòi adversary nhanh hơn ego (`GEOM_NO_CATCHUP`). Hai ràng buộc loại trừ nhau nên
ba vòng repair dao động 60 → 55 rồi chết — đúng họ "vòng repair bất khả thi",
lần này ở `parse_intent`.

Con số 17/20 → 19/20 **không** phải L1 ở §2: mẫu số ở đây là 20 mô tả benchmark
không ghi vào database thật, còn L1 đo trên các request thật qua
`GET /api/v1/metrics/quality`. Bản sửa không hồi tố L1; nó chỉ làm request mới ít
hỏng hơn, và L1 sẽ tự đi lên khi có request mới chạy qua.

Artifact: [`anchor_reach_base_2026-08-29.json`](anchor_reach_base_2026-08-29.json),
[`anchor_reach_fix_cold_2026-08-29.json`](anchor_reach_fix_cold_2026-08-29.json),
[`anchor_reach_fix_warm_2026-08-29.json`](anchor_reach_fix_warm_2026-08-29.json).

### 9.4. Tốc độ gán nhầm chủ thể: 20/20 và không còn vòng repair nào

Cùng ngày, sau khi sửa nốt lỗi §9.3 để lại. Marker vai trò ego không phải
`ActorType` nên taxonomy không tạo span cho nó, mà segment tính hint chỉ cắt ở
span kế tiếp — nên tốc độ đứng sau *"xe ego"* bị gán cho cả chủ thể liền trước.
*"Ô tô ego"* không dính vì "ô tô" khớp taxonomy nên có span chặn sẵn; chỉ marker
trần mới lọt. Quét cả 20 mô tả: đúng hai câu bị (sample 4 và 9), và chỉ sample 4
biểu hiện thành lỗi vì `cut_in` đòi chênh tốc độ còn `lane_drift` thì không.

| Lượt (cùng 20 mô tả, cùng snapshot) | done | repair | tổng cost | p50 | cached | output token |
|---|---:|---:|---:|---:|---:|---:|
| base (trước cả hai bản sửa) | 17/20 | 4 | $0,083696 | 2,68 s | 71,9% | 8.260 |
| sau §9.3 | 19/20 | 5 | $0,062909 | 2,56 s | 90,3% | 8.166 |
| **sau §9.4** | **20/20** | **0** | $0,064336 | 3,51 s | 78,8% | **6.538** |

**Không còn vòng repair nào trên cả 20 request** — từ 4-5 vòng xuống 0. Đó là
con số đáng chú ý hơn cả pass rate: mỗi vòng repair là một lượt LLM thêm, nên
output token giảm 20% (6.538 so với 8.166) dù sinh nhiều kịch bản hơn.

Hai bản sửa cùng một hình dạng: **ràng buộc có thật của hệ thống không tới được
model, và chỗ phát hiện ra nó lại nằm ngoài tầm sửa.** §9.3 là biên hình học chỉ
kiểm ở converter sau `promote`; §9.4 là một hint sai sinh ra cặp ràng buộc loại
trừ nhau mà repair không thể thoả. Cả hai đều biểu hiện thành *"model cứ sai
mãi"*, và cả hai đều không sửa được bằng cách thêm ví dụ.

Artifact: [`intent_speed_fix_2026-08-29.json`](intent_speed_fix_2026-08-29.json).

### 9.5. Bộ dò `run_red_light`, và hai bug chỉ lộ ra khi chạy thật

Ngày 02–03/09/2026. §10.7 (bản 29/08) ghi bộ dò biến thể **từ chối thẳng** mọi
kịch bản `run_red_light`: nó neo vào giây hai xe đi ngang nhau, tính bằng
`khoảng cách dọc ÷ chênh tốc độ`, mà maneuver này bắt buộc actor có
`s_offset_m = 0` — nó nằm trên nhánh đường vuông góc. Khoảng cách dọc bằng 0 nên
không có mốc nào để neo. Ảnh hưởng 12 ô ODD.

**Bộ dò mới vặn tốc độ thay vì thời điểm.** Nó tính giao điểm hai quỹ đạo từ toạ
độ và hướng trong template — suy ra, không ghi cứng — rồi chọn tốc độ actor sao
cho hai *thời gian tới điểm xung đột* trùng nhau. Trên anchor đô thị: ego 41,27 m,
actor 38,56 m.

Mốc lấy từ đo, không đoán. Với `delta = t_actor − t_ego`, hai kịch bản
`run_red_light` duy nhất từng ra va chạm (`sc_046`, `sc_047`) có `delta = −0,33 s`,
còn 9 bản do chiến dịch ODD sinh nằm ở **−1,24 đến −2,33 s** — actor qua nút giao
xong từ lâu rồi ego mới tới.

| gốc | ego / actor | delta | khe hở gốc | actor sau dò | khe hở mới | kết quả |
|---|---|---:|---:|---:|---:|---|
| `sc_108` | 26 / 34 | −1,63 | 4,39 m | 24,1 | **0,59 m** | va chạm |
| `sc_110` | 27 / 38 | −1,85 | 4,88 m | 25,0 | **1,12 m** | va chạm |
| `sc_111` | 25 / 33 | −1,74 | 4,78 m | 23,2 | **0,62 m** | va chạm |
| `sc_113` | 24 / 36 | −2,33 | 6,32 m | 22,2 | **1,10 m** | va chạm |
| `sc_114` | 26 / 34 | −1,63 | 4,38 m | 24,1 | **0,53 m** | va chạm |
| `sc_115` | 22 / 31 | −2,28 | 3,68 m | 20,4 | 0,73 m | suýt va chạm |
| `sc_116` | 36 / 48 | −1,24 | 1,89 m | 33,3 | 0,84 m | suýt va chạm |
| `sc_109` | 22 / 31 | −2,28 | 3,58 m | 20,4 | 1,46 m | chưa tới hạn |
| **`sc_112`** | 23 / 29 | −1,67 | **0,37 m** | 21,3 | **1,40 m** | **tệ đi** |
| `sc_107` | 24 / 36 | −2,33 | 6,46 m | 22,2 | **0,71 m** | va chạm |

Tám trên chín thu hẹp khe hở, năm thành va chạm thật.

**`sc_112` là ca đáng đọc nhất, và nó nói giới hạn của mô hình.** Bản gốc đã ở
0,37 m — tới hạn nhất cả lô — mà phép dò kéo nó lên 1,40 m. Vì bộ dò nhắm
`delta = 0`, còn `delta = 0` **không phải lúc nào cũng là cực trị**: kích thước
xe và góc cắt cũng tham gia. Hệ thống báo `improved = false` cho ca này thay vì
giấu. Lời giải là dò hai chiều — bước đầu tệ hơn bản gốc thì đổi hướng thay vì đi
tiếp — chưa làm.

#### Hai bug chỉ lộ ra khi chạy thật

**1. Title chứa `/` làm hỏng lượt chạy SAU khi đã chạy xong.** ScenarioRunner lấy
`FileHeader/@description` — tức `spec.title` — làm **tên file** báo cáo JSON. Dấu
`/` trong `km/h` biến nó thành đường dẫn thư mục con không tồn tại, và bước ghi
file chết bằng `FileNotFoundError`.

Triệu chứng rất dễ đọc nhầm: kịch bản chạy đủ 12,6 giây, cả bốn criteria đều có
kết quả, nhưng `success = false` vì worker không đọc được file. Một lượt GPU tốt
bị ghi thành lượt hỏng và **kéo L3 xuống**. Đây là lỗi có sẵn — title là chữ tự do
do LLM sinh, và `km/h` là cụm hoàn toàn tự nhiên khi mô tả tốc độ.

**2. Lệnh đặt đèn nằm trong `Init` nên CHƯA BAO GIỜ có hiệu lực.** Bảng hỗ trợ
của ScenarioRunner ghi `TrafficSignalStateAction` là ❌ ở cột *Init support*, ✅ ở
cột *Story support*; code khớp với bảng — `_create_init_behavior` chỉ duyệt các
khối `Private`, `_initialize_parameters` chỉ xử lý `ParameterAction`.

Hệ quả: **cả 12 ô `run_red_light` chạy với chu kỳ đèn tự nhiên của CARLA**, ai đỏ
ai xanh là ngẫu nhiên theo thời điểm. Xem trực tiếp trên CARLA thì thấy chính
**ego** vượt đèn đỏ. Nhãn ODD nói adversary vượt đèn đỏ, mô phỏng không tái hiện
điều đó.

Ba giả thuyết đã loại trước khi kết luận: đèn tự đổi chu kỳ đè lên lệnh (sai —
`set_state` giữ ổn định 9 s); sai id đèn (sai — `get_traffic_lights_from_waypoint`
cho ego→118, actor→122, đúng như template); parser không đọc `id=` trên CARLA town
(sai — `get_traffic_light_from_osc_name` hỗ trợ, và ném lỗi nếu không tìm thấy).

Xác minh sau khi chuyển lệnh sang Story: đặt sẵn hai đèn **ngược hẳn** (122 xanh,
118 đỏ) rồi chạy; sau lượt chạy chúng lật thành 118 xanh, 122 đỏ.

> **Đính chính §2 và §4.** Mọi số L4 và M3 trên nhóm ô `run_red_light` trước
> 03/09/2026 đo trên một tình huống **khác** với nhãn: hai xe cắt nhau ở giao lộ
> với đèn ngẫu nhiên, không phải một xe vượt đèn đỏ. Không dùng lại được. 13 kịch
> bản `run_red_light` đã chạy lại toàn bộ; `sc_046` và `sc_047` vẫn ra va chạm nên
> giữ nhãn `adversarial`, lần này với bằng chứng đúng điều kiện.

#### Chỉ số sau đợt chạy lại

| | snapshot 24/08 | 29/08 | **03/09** |
|---|---:|---:|---:|
| L1 hiểu câu, qua pipeline | 73,53% | 71,21% | 71,21% |
| L2 biên dịch `.xosc` | 100% | 100% | 100% (110/110) |
| L3 CARLA chạy hết | 93,75% | 94,59% | **96,55%** (56 lượt) |
| L4 quỹ đạo đúng ý định | 53,33% | 60,00% | **75,00%** |
| M3 kích hoạt nguy hiểm | 63,33% | 60,00% | **75,00%** (42/56) |
| — riêng va chạm | 12 | 17 | **24** |
| M2 phủ toàn phần | 16,67% | 100% | 100% (72/72) |

L1 không đổi vì đợt này không sinh request mới — chỉ chạy lại và dò biến thể từ
kịch bản đã có.

## 10. Giới hạn và việc tiếp theo

1. Mở rộng nhãn người trên từng maneuver, không chỉ các case lỗi đã biết.
2. Backend cần enforce token/role cho review và `WORKER_TOKEN`, không chỉ phân
   vai trên frontend.
3. Closed-loop MVP dừng ở cặp baseline/BehaviorAgent do người vận hành khởi
   động theo ADR-022; không tuyên bố có vòng tự sinh nhiều thế hệ.

   Bổ sung 03/09: bộ dò biến thể đi **một hướng** — nhắm `delta = 0` với
   `run_red_light`, lùi dần từ mốc "hai xe đi ngang nhau" với các maneuver khác.
   `sc_112` cho thấy giới hạn: bản gốc đã ở 0,37 m mà phép dò kéo lên 1,40 m, vì
   `delta = 0` không phải lúc nào cũng là cực trị. Cần **dò hai chiều thích nghi**
   — bước đầu tệ hơn bản gốc thì đổi hướng, và giảm bước khi hai điểm liền kề hoà
   (`sc_024`: `t3` và `t4` cùng 0,38 m, tiêu một lượt GPU để khẳng định lại đáy).
4. Chỉ mở thêm maneuver/road type khi đã đo hình học và chạy thật trên anchor
   tương ứng; hiện anchor đô thị chỉ cam kết cho `run_red_light`.

   Bài học 03/09, đắt hơn cả bốn dòng trên: **hai bug nặng nhất của đợt này đều
   vô hình với test.** Title chứa `/` và lệnh đèn đặt sai chỗ đều cho ra file
   `.xosc` hợp lệ theo XSD, qua sạch 547 test, và chỉ lộ ra khi có người **ngồi
   nhìn CARLA chạy**. Không phép kiểm tĩnh nào bắt được "ScenarioRunner lấy title
   làm tên file" hay "InfrastructureAction ở Init bị bỏ qua". Với lớp lỗi này thì
   một lượt chạy thật đáng giá hơn một trăm test.

5. Kịch bản không va chạm chạy hết `duration_s` dù không còn gì để xảy ra. Với
   `run_red_light`, ego qua giao lộ ở giây ~5-6 và hai quỹ đạo chỉ cắt nhau ở một
   điểm, nhưng kịch bản vẫn chạy nốt ~24 giây. Cần điều kiện đóng Act khi ego đã
   qua điểm xung đột, cùng hình dạng với stop-on-collision — nhưng chỉ cho
   maneuver có điểm cắt rõ ràng, vì `lane_drift` có khe hở nhỏ nhất **sau** lúc
   hai xe đi ngang nhau.
6. Benchmark mới có 20 request tuần tự trên một máy/mạng; chưa phải load test
   nhiều người dùng đồng thời hay SLA production.
7. Chưa có metric retrieval (Recall@k / MRR / nDCG) trên golden set như `ADR-004`
   cam kết. §9.2 mới chỉ đo *đóng góp của few-shot vào kết quả sinh*, không đo
   *chất lượng xếp hạng của retriever*; và đo trên một thư viện 18 hàng, quá mỏng
   để kết luận về few-shot nói chung.

   Kiểm lại ngày 29/08: ở quy mô hiện tại thì metric ấy **chưa đo được gì**, chứ
   không chỉ là chưa làm. Cổng của retriever loại luôn `created_by='seed-data'`,
   nên pool tham gia xếp hạng là **9 hàng** chứ không phải 18, trải trên 8 ô ODD
   với ô đông nhất chỉ 2 hàng. Mà `WHERE` lọc đủ bốn trục trước khi tính cosine,
   còn `k = 3`: trên nhánh lọc trúng ô, số ứng viên luôn ≤ 2 < k, nên cosine
   không loại bỏ gì — nó chỉ đảo thứ tự của tối đa hai phần tử. `Recall@5` khi ấy
   bằng 1,0 theo định nghĩa, không theo chất lượng. Điều kiện để phép đo có
   nghĩa: vài ô đạt **≥ 4 hàng** approved non-seed (pool > k).

8. Seed data: 6/10 hàng nằm **ngoài phạm vi converter có chủ đích** (ADR-016 mới
   có anchor cao tốc và một giao cắt đô thị) — chúng vẫn hữu ích cho retrieval
   theo văn bản và nhãn ODD. Nhưng kiểm ngày 29/08 thì **8/10 không biên dịch
   được**, tức có hai hàng nằm *trong* phạm vi mà vẫn hỏng: `sc_908` đặt actor ở
   45 m sau khi tầm với anchor được đo lại còn `+40`, và `sc_909` dùng trigger
   `simulation_time` sau khi `cut_in` chuyển sang đòi `lead_distance`.

   Cả hai còn mang trường `carla` khai đã chạy thật trên CARLA — điều không thể
   đúng với một spec mà converter từ chối biên dịch. Nguyên nhân chung: luật
   converter siết lại sau khi seed được viết, và `_xosc_for` nuốt cả hai loại
   thất bại bằng một `except Exception` ghi log mức INFO, nên không ai thấy.

   Đã sửa: hai hàng đó đi qua converter được, `_xosc_for` phân biệt *ngoài phạm
   vi* (im lặng bỏ qua) với *trong phạm vi mà hỏng* (dừng hẳn), và
   `tests/test_seed_data.py` canh cả hai bất biến. Nhãn xuất xứ được chỉnh theo
   hướng **bảo thủ**: `sc_908` giữ `ran_no_hazard` (nhãn đang loại nó khỏi
   few-shot, hạ xuống `unverified` là nới một guard đang có tác dụng), còn
   `sc_909` hạ từ `adversarial` xuống `unverified` vì spec đã đổi thì không được
   giữ nhãn của một lần chạy khác.

## 11. Cách tái tạo snapshot

```bash
curl http://127.0.0.1:8000/api/v1/metrics/quality
curl http://127.0.0.1:8000/api/v1/metrics/intent-agreement
curl http://127.0.0.1:8000/api/v1/library/audit
OPENAI_API_KEY=... uv run python eval/benchmarks/generation_cost_latency.py \
  --source-db data/app.db --samples 20 \
  --output eval/results/cost_latency_$(date +%F).json

# §9.2 — A/B few-shot. Chạy ON trước rồi OFF thì cache nguội/ấm sẽ trộn vào
# chênh lệch cost; muốn so cost thì phải có một lượt ON chạy SAU lượt OFF.
OPENAI_API_KEY=... uv run python eval/benchmarks/generation_cost_latency.py \
  --source-db data/app.db --few-shot off \
  --output eval/results/fewshot_off_warm_$(date +%F).json
bash scripts/pre_push_check.sh
```
