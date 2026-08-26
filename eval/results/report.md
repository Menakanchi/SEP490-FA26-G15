# Evaluation Report — Scenario Forge

> Snapshot: 24/08/2026, lấy trực tiếp từ database phát triển qua
> `GET /api/v1/metrics/quality`. Không tính 10 scenario `seed-data` vào M1/M2.
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

Artifact: [`fewshot_on_cold_2026-08-26.json`](fewshot_on_cold_2026-08-26.json),
[`fewshot_off_warm_2026-08-26.json`](fewshot_off_warm_2026-08-26.json),
[`fewshot_on_warm_2026-08-26.json`](fewshot_on_warm_2026-08-26.json).

## 10. Giới hạn và việc tiếp theo

1. Mở rộng nhãn người trên từng maneuver, không chỉ các case lỗi đã biết.
2. Backend cần enforce token/role cho review và `WORKER_TOKEN`, không chỉ phân
   vai trên frontend.
3. Closed-loop MVP dừng ở cặp baseline/BehaviorAgent do người vận hành khởi
   động theo ADR-022; không tuyên bố có vòng tự sinh nhiều thế hệ.
4. Chỉ mở thêm maneuver/road type khi đã đo hình học và chạy thật trên anchor
   tương ứng; hiện anchor đô thị chỉ cam kết cho `run_red_light`.
5. Benchmark mới có 20 request tuần tự trên một máy/mạng; chưa phải load test
   nhiều người dùng đồng thời hay SLA production.
6. Chưa có metric retrieval (Recall@k / MRR / nDCG) trên golden set như `ADR-004`
   cam kết. §9.2 mới chỉ đo *đóng góp của few-shot vào kết quả sinh*, không đo
   *chất lượng xếp hạng của retriever*; và đo trên một thư viện 18 hàng, quá mỏng
   để kết luận về few-shot nói chung.

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
