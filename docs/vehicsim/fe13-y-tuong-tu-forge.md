# FE-13 — Ý tưởng giữ lại từ Scenario Forge

Scenario Forge đã gỡ ngày 04/10/2026 ([ADR-032](../adr/ADR-032-go-scenario-forge-giu-bo-sinh-openscenario.md)).
Code dò tham số và chiến dịch của nó **không** tái dùng được (gắn với `ScenarioSpec`, ScenarioRunner và
hàng đợi duyệt đã bỏ), nhưng **ý tưởng và bài học đo được** áp thẳng vào FE-13 — tối ưu tham số AEB,
dò ranh giới lỗi, active learning, robustness. Tài liệu này giữ lại các ý đó để người làm FE-13 không
phải học lại từ đầu.

Nguồn: `src/services/tuning.py` (dò tham số kịch bản tới hạn), `src/services/campaign.py` (sinh hàng
loạt có trần), ADR-017, [ADR-019](../adr/ADR-019-chan-trung-o-dau-ra-truoc-khi-tieu-gpu.md),
[ADR-021](../adr/ADR-021-danh-gia-controller-tach-khoi-xac-minh-kich-ban.md),
[ADR-022](../adr/ADR-022-closed-loop-dung-o-cap-ab-co-nguoi-khoi-dong.md). Code gốc xem ở cuối trang.

## Bài toán chung

Forge gọi đây là *concretization*: từ một kịch bản logic (tham số có khoảng) chọn ra bộ giá trị cụ thể
**thật sự nguy hiểm**. Đo ngày 22/08/2026: 5/8 kịch bản chạy trót lọt nhưng vô hại — sinh ra file hợp lệ
mới là nửa việc. Trong VSOS đây chính là "failure boundary search (critical distance, speed, TTC) để
dựng operating envelope" và "active learning trên vùng rủi ro cao" của FE-13.

## 1. Dò quanh mốc vật lý, không quét lưới đều

**Forge:** quét đều toàn khoảng vừa đắt vừa hay bỏ sót đúng vùng nguy hiểm. Thay vào đó tính một **mốc
neo hình học** rồi dò vài bước quanh nó:

| Tình huống | Mốc neo | Núm dò |
|---|---|---|
| Lệch làn, phanh gấp, dừng trong làn | Thời điểm hai xe đi ngang nhau (khoảng cách dọc ÷ chênh tốc độ) | Thời điểm kích hoạt **trước** mốc, 4 bước × 1 s |
| Cắt làn | Khoảng dẫn trước tối thiểu một thân xe | Khoảng dẫn, 4 bước × 1 m |
| Vượt đèn đỏ (giao vuông góc) | Chênh thời gian tới điểm xung đột Δ = t_actor − t_ego | Tốc độ actor sao cho Δ ∈ {0; −0,3; +0,3; −0,6} s — dò **hai phía** vì tới sớm hay muộn đều trượt |

Bằng chứng: cùng kịch bản `sc_906`, dời kích hoạt từ 8,0 s (sau mốc) về 5,5 s (trước mốc) kéo khe hở nhỏ
nhất từ 1,05 m xuống 0,36 m. Hai bản vượt đèn đỏ duy nhất ra va chạm đều có Δ = −0,33 s; 11 bản sinh tự
động nằm ở −1,2 đến −2,3 s — actor qua nút giao xong từ lâu.

**Áp vào VehicSim (người đi bộ băng ngang — phác thảo, kiểm lại với `simulator.py`):** đây đúng là bài
"giao vuông góc", nên dùng mốc Δ và dò hai phía. Từ hằng số hiện có: người xuất phát ở
`PEDESTRIAN_START_Y_M = −3,6`, bán kính 0,3 m; xe rộng 1,93 m, dài 4,75 m; người bắt đầu đi khi mũi xe
còn cách vạch `trigger_distance_m`. Nếu xe không phanh và người đi đều:

- người **chạm** dải xe chiếm khi đi được ≈ 3,6 − (0,965 + 0,3) = 2,34 m → t_vào ≈ 2,34 / v_người;
- người **rời** dải xe khi đi được ≈ 3,6 + 0,965 + 0,3 = 4,87 m → t_ra ≈ 4,87 / v_người;
- mũi xe tới vạch sau t_mũi = `trigger_distance_m` / v_xe, đuôi xe qua vạch sau t_đuôi = t_mũi + 4,75 / v_xe.

Hai khoảng [t_vào, t_ra] và [t_mũi, t_đuôi] **chồng nhau** ⇒ vùng va chạm khi AEB không làm gì. Ranh
giới lỗi nằm quanh chỗ hai khoảng vừa chạm nhau — đặt mẫu dày ở đó (cả hai phía) thay vì rải đều lưới
`ego_speeds × trigger_distances × pedestrian_speeds`. Trường hợp người bước vào **hông** xe
(t_mũi < t_vào < t_đuôi) là vùng `SIDE_ENTRY_NOT_PREDICTED` (TD-18) — nên dò riêng.

Với `stops_at_curb = true` người không bao giờ vào dải xe: ranh giới ở đây là ranh giới **phanh oan**
(false activation), không phải va chạm — hai mục tiêu của bài toán đa mục tiêu.

## 2. Kiểm khả thi trước khi tốn lượt chạy

**Forge:** nếu hai xe gặp nhau trước khi hành vi kịp thành hình (`MANEUVER_RAMP_S = 2,6 s`, tính từ biên
độ lấn làn và gia tốc ngang) thì **không giá trị kích hoạt nào cứu được** — trả rỗng ngay, không chạy.
Trả rỗng là **kết luận** ("vấn đề nằm ở vị trí/tốc độ ban đầu"), không phải lỗi.

**Áp vào:** với mỗi điểm lấy mẫu, tính trước bằng công thức ở mục 1 xem có thể va chạm không; điểm chắc
chắn an toàn (người qua trước hoặc sau xe quá xa) không cần mô phỏng để biết — chỉ cần một lượt xác nhận
mỗi vùng.

## 3. Mỗi lần đổi đúng một tham số

**Forge:** biến thể chỉ khác nhau ở **một** đại lượng; đổi nhiều thứ cùng lúc thì kết quả tốt lên cũng
không biết nhờ cái nào. Trùng với luật mềm của repo: *tham số kịch bản và tham số AEB không đổi cùng lúc
trong một lần so sánh*. Với FE-13: dò ranh giới (tham số kịch bản) và tối ưu AEB (tham số AEB) là **hai
pha tách biệt**; phân tích độ nhạy (`sensitivity_*`) cho biết nên dò núm nào trước.

## 4. Dò từng bước, dừng sớm — ba kết luận

**Forge:** mỗi lần chỉ dựng **một** biến thể tiếp theo (mỗi lượt CARLA ~35 s GPU; phép dò hay trúng sớm),
và dừng ở một trong ba trạng thái, cả ba đều là kết luận hiển thị cho người đọc:

| Trạng thái | Nghĩa |
|---|---|
| `reached_critical` | Đã có biến thể dưới ngưỡng tới hạn — dò tiếp không tìm thêm được gì đáng giá |
| `waiting` | Có biến thể đang chạy — dựng thêm lúc này là xếp hàng cho một lượt có thể thành thừa |
| `exhausted` | Thử hết mà không tới hạn — núm này **không phải** nguyên nhân; nhìn sang tham số khác |

**Áp vào:** vòng Bayesian Optimization / active learning cần đúng ba điều kiện dừng này, cộng trần ngân
sách (`optimization_runs.max_trials`). "Không cải thiện" (`improved = false`) là **kết quả hợp lệ**, hiện ra
như vậy — cùng tinh thần luật "không vẽ tick xanh giả".

## 5. Mục tiêu liên tục, không đếm va chạm

**Forge:** xếp hạng theo **khe hở nhỏ nhất** rồi TTC nhỏ nhất, không theo "có va chạm hay không": khe 0,36 m
không va chạm vẫn tới hạn hơn hẳn khe 1,7 m, mà đếm va chạm thì hai cái bằng nhau (và lệch làn không
bao giờ có va chạm để đếm). Biến thể không đo được xếp cuối, không bị loại.

**Áp vào:** mô hình thay thế (Gaussian Process) của BO học tốt trên **mục tiêu liên tục** — dùng
`min_distance_m`, `min_ttc_s`, `impact_speed_mps` (đã có trong `aeb_results`), đừng tối ưu thẳng tỉ lệ va
chạm 0/1. Tỉ lệ va chạm / phanh oan để báo cáo và làm ràng buộc, không làm tín hiệu học.

## 6. Ngân sách là điều kiện dừng; chỉ lấy mẫu trong vùng chạy được

**Forge (campaign):** trần số kịch bản là điều kiện dừng, không phải tuỳ chọn — "một vòng lặp tự động
không có trần là một hoá đơn không có trần"; chỉ sinh trong ô mà bộ chuyển đổi dựng được (sinh ngoài đó là
đốt tiền để tạo thứ chắc chắn chết); chạy tuần tự khi chỉ có một worker để còn dừng đúng lúc chạm trần.

**Áp vào:** `max_trials` bắt buộc (`ck_or_trials > 0`); không gian tìm kiếm của tham số AEB lấy từ
`aeb_parameters.min_value / max_value`, của kịch bản lấy từ `IR_BOUNDS` (`bundle.py`); nhiều worker Celery
thì có thể đề xuất theo lô, nhưng kiểm trần **trước** khi xếp hàng lô mới.

## 7. Không chạy lại thứ đã biết kết quả

**Forge (ADR-019):** chặn kịch bản trùng động học **trước** cổng tốn GPU bằng khoá so sánh tất định.

**Áp vào:** VehicSim tất định (luật cứng 4: cùng biến thể + cùng seed ⇒ cùng kết quả). Một điểm đánh giá
được xác định hoàn toàn bởi (biến thể, seed, 10 giá trị tham số AEB, bộ mô phỏng) — BO đề xuất lại một
điểm đã chạy thì **lấy kết quả cũ**, không chạy lại. Làm tròn tham số theo bước có nghĩa vật lý trước khi so.

## 8. Đo hiệu quả trên nền đo lại, cùng phiên bản bộ mô phỏng

**Forge:** từng ghi "78,26 m → 0,63 m nhờ phép dò"; đo lại sau khi sửa converter thì chính bản gốc đã
xuống 0,68 m — phần lớn "cải thiện" là nhờ sửa lỗi, không nhờ phép dò. Bằng chứng còn đứng vững chỉ là
`sc_906` (1,05 → 0,36 m).

**Áp vào:** so candidate với baseline **chạy lại cùng phiên bản bộ mô phỏng** (`carla_version`,
`KINEMATIC_SIMULATOR`) — đúng điều regression đã ép; mọi con số "tối ưu cải thiện X%" trong báo cáo phải
đo theo cách này.

## 9. Đánh giá candidate không được sửa bằng chứng của baseline

**Forge (ADR-021):** lượt đánh giá bộ điều khiển không được cập nhật nhãn "kịch bản nguy hiểm", nếu không
một bộ điều khiển giỏi sẽ **xoá chính bằng chứng làm baseline**.

**Áp vào:** tập "kịch bản tới hạn" (vùng rủi ro, ranh giới lỗi) phải **gắn với baseline** và đóng băng
trong một lần tối ưu; candidate tốt làm vùng đó an toàn hơn không được làm nó biến khỏi tập kiểm — giống
`old_critical` trong `regression_tests.pass_criteria`.

## 10. Vòng khép kín dừng ở con người

**Forge (ADR-022):** vòng khép kín dừng ở **một cặp A/B có người khởi động**, không tự chạy nhiều thế hệ.
**VehicSim (ADR-025):** không bao giờ tự Accept. Với FE-13: người bấm chạy mỗi chiến dịch tối ưu; candidate
tốt nhất (`optimization_trials.is_recommended`) phải qua regression + robustness rồi **kỹ sư quyết định** —
bộ tối ưu không bao giờ tự đổi baseline.

## Không mang sang

- **Con số ngưỡng:** Forge coi tới hạn là khe hở < 1,0 m (xe với xe). VehicSim dùng
  `NEAR_MISS_DISTANCE_M = 0,5` + `NEAR_MISS_TTC_S = 1,0` cho người đi bộ (người đứng trên vỉa hè cách xe
  ~1 m không phải suýt va chạm). Giữ ngưỡng của từng motif.
- **Chi phí một lượt chạy:** Forge ~35 s GPU/lượt nên tiết kiệm từng lượt; bộ động học VehicSim chỉ vài
  mili giây/lượt. Gợi ý **hai tầng**: dò và tối ưu trên bộ động học, chỉ xác nhận vài điểm ranh giới trên
  CARLA (nhớ TD-17 — phanh CARLA chưa hiệu chuẩn).
- **Duyệt từng biến thể:** Forge đẩy mỗi biến thể qua hàng đợi duyệt; VehicSim không duyệt biến thể
  (quyết định 29/09) — cổng của VehicSim là regression cho **candidate AEB**.

## Gắn vào schema đã có

Bảng đã dựng sẵn cho FE-13 ([ADR-031](../adr/ADR-031-database-phu-du-chuc-nang.md),
[từ điển dữ liệu](database-schema.md)):

| Ý tưởng | Chỗ lưu |
|---|---|
| Trần ngân sách, mục tiêu, ràng buộc (mục 5, 6) | `optimization_runs.max_trials`, `objective_config` |
| Điểm từ đâu ra, hàm thu nhận chấm bao nhiêu (mục 1, 4) | `optimization_trials.sampling_source` (`INITIAL_DESIGN` / `ACQUISITION` / `ACTIVE_LEARNING`), `acquisition_value` |
| Pareto, khuyến nghị (mục 10) | `optimization_trials.is_pareto_optimal`, `is_recommended` |
| Kiểm dưới nhiễu | `robustness_tests` + run `purpose = ROBUSTNESS` |
| Núm nào nên dò trước (mục 3) | `sensitivity_analyses`, `sensitivity_results` |
| Kết quả từng điểm, mục tiêu liên tục (mục 5, 7) | `simulation_runs` + `aeb_results` |

## Xem code gốc

Code Forge còn nguyên ở commit `24a6346` (commit cuối trước khi gỡ):

```bash
git show 24a6346:src/services/tuning.py                  # mốc neo, điều kiện khả thi, ba trạng thái dừng, xếp hạng
git show 24a6346:tests/test_services/test_tuning.py      # đặc tả hành vi bằng test
git show 24a6346:src/services/campaign.py                # trần ngân sách, chỉ sinh trong vùng hỗ trợ
git show 24a6346:src/services/scenario/geometry.py       # time_until_alongside, MIN_CUT_IN_LEAD_M
```

`src/services/openscenario/geometry.py` hiện vẫn giữ các hàm hình học đó cùng bộ sinh `.xosc`.
