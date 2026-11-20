# Tab `Project-Journey` (PJ), `CARLA-Weather` (CW), `E2E`

Thuộc [kế hoạch integration test](../2026-11-17-integration-test-va-issue-nguoi-5.md). ⭐ = cần run CARLA chạy xong.

> **Cập nhật 20/11/2026 — đọc trước phần thân.** File này là bản nháp 3 viết theo API; bản đã chạy là sheet `docs/Integration-Test_VSOS_TuDM_v6.xlsx` (bước thao tác trên web, mã ca đánh lại theo tab, nên mã trong file này không trùng mã sheet). Kết quả, dữ liệu thật và trạng thái issue ở mục 0, 5, 8 của [kế hoạch](../2026-11-17-integration-test-va-issue-nguoi-5.md). Phần thân đã lỗi thời ở các điểm: P-TEAM có baseline **AEB v4** (TTC 4,0 s, giảm tốc 10 m/s²), không phải v1.0, nên C-GOOD / C-GOOD2 / C-GOOD3 là TTC 3,0 / 2,0 / 1,8 s giữ giảm tốc 10; `<SIM>` là `carla-0.9.16-xosc9` (không còn `-xosc7`); máy test không chạy được CARLA nên các ca cần CARLA để Untested; chỉ tài khoản role MANAGER (MGR1) thêm được thành viên workspace; mã test thật xem bảng 5.3 của kế hoạch.
>
> Adopt và vòng 2 chạy ở PJ-14 → PJ-18 của sheet (BASELINE_CHANGED, TEST_NOT_PASSED trả 409). Tab E2E chưa có trong sheet; luồng tương đương đã đi qua: RC-26 → RR → RV-33 (project nhóm) và RC-25 → PJ-15 (project cá nhân). CW-05 xác nhận #24 (`.xosc` màn mô tả ghi mưa 0,7); CW-10, CW-11 và PJ-03, PJ-04, PJ-07 chờ CARLA.

---

## Tab `Project-Journey` (PJ)

**Đầu tab (sheet):** Module name = "Hành trình project và tự chọn baseline — `/projects/[id]`, `/projects/[id]/results`,
`/projects/[id]/improve`, `/projects/[id]/rounds/[testId]`; `GET /projects/{id}/journey`, `POST /projects/{id}/regressions/{testId}/adopt`".

Quy tắc nghiệp vụ được kiểm (`ProjectService.journey/adopt`, ADR-046):
- 5 bước `SCENARIO` → `BASELINE` → `RESULTS` → `IMPROVE` → `VERIFY`, mỗi bước `TODO`/`RUNNING`/`DONE`/`FAILED` theo dữ liệu thật; `next` = bước đầu tiên chưa `DONE`.
  - SCENARIO `DONE` khi có biến thể. BASELINE `RUNNING` khi có run baseline chờ/chạy; `DONE` khi ít nhất một họ chạy đủ baseline; `FAILED` khi chỉ có run hỏng.
  - RESULTS `DONE` khi đã có việc sau baseline (candidate, tối ưu, dataset, regression). IMPROVE `DONE` khi có candidate của baseline hiện hành; VERIFY theo regression.
  - `round` = số AEB version `BASELINE` + `ARCHIVED` (tối thiểu 1).
- Adopt (chủ project, không có Reviewer): bắt buộc lý do và xác nhận; test phải hoàn tất, verdict `PASSED`; candidate còn `CANDIDATE`; baseline lúc chạy vẫn hiện hành; project không lưu trữ.
  Kết quả: baseline cũ `ARCHIVED`, candidate `BASELINE`, ghi chú vào candidate.

Body `adopt`: `{"reason": …, "confirmed": …}`. Dạng lỗi: `{"code": "<MÃ>", "detail": "<thông điệp>"}`.

### PJ-01 — Hành trình của project mới [N]
- **Description:** Kiểm tra project chưa có dữ liệu hiển thị 5 bước "Chưa làm" và gợi ý bước đầu.
- **Preconditions:** Project "IT-EXP1 Hành trình" vừa tạo (chưa có họ); PRE-LOGIN-EXP1.
- **Test Steps:** 1. `GET /projects/<id>/journey`. 2. Mở `/projects/<id>`.
- **Test Data:** project "IT-EXP1 Hành trình".
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 200; `round = 1`; `baseline_label = "v1.0"`; `steps` = 5 phần tử theo thứ tự `SCENARIO, BASELINE, RESULTS, IMPROVE, VERIFY`, tất cả `TODO`; `next = "SCENARIO"`; `counts.families = 0`, `counts.variants = 0`. UI không đánh dấu bước nào đã xong.

### PJ-02 — Sau khi tạo họ kịch bản [N]
- **Description:** Kiểm tra bước kịch bản hoàn tất khi project có biến thể.
- **Preconditions:** PJ-01; tạo họ trong project với `run_baseline = false`.
- **Test Steps:** 1. `POST /families` (header project) với Test Data. 2. `GET /projects/<id>/journey`.
- **Test Data:** `name = "IT-PJ Họ 1"`, `category = "CP_CROSSING"`, `ego_speeds_kmh = [30]`, `trigger_distances_m = [15]`, `pedestrian_speeds_mps = [1.5]`, `stops_at_curb = [false]`, `weathers = ["CLEAR"]`, `times_of_day = ["DAY"]`, `run_baseline = false`.
- **Post conditions:** 1 họ, 1 biến thể.
- **Expected Result:** `SCENARIO = DONE`, `BASELINE = TODO`, `next = "BASELINE"`, `counts.families = 1`, `counts.variants = 1`.

### PJ-03 — Baseline đang chạy ⭐ [N]
- **Description:** Kiểm tra bước baseline ở trạng thái đang chạy.
- **Preconditions:** PJ-02; CARLA chạy.
- **Test Steps:** 1. `POST /families/<họ>/run` (không body). 2. Trong lúc run `PENDING`/`RUNNING`: `GET /projects/<id>/journey`.
- **Test Data:** họ "IT-PJ Họ 1".
- **Post conditions:** 1 run baseline.
- **Expected Result:** HTTP 202 `{"queued_runs": 1}`; journey: `BASELINE = RUNNING`, `counts.baseline_running = 1`.

### PJ-04 — Baseline hoàn tất ⭐ [N]
- **Description:** Kiểm tra bước baseline hoàn tất và số đếm kết cục khớp kết quả run.
- **Preconditions:** P-EXP1 có F3 với 2 run baseline `COMPLETED`.
- **Test Steps:** 1. `GET /projects/<P-EXP1>/journey`. 2. `SELECT collision_occurred, min_ttc_s, min_distance_m, is_false_positive FROM simulation_runs WHERE scenario_id=<F3> AND purpose='BASELINE'`.
- **Test Data:** `<P-EXP1>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `BASELINE = DONE`; `counts.baseline_completed = 2`; `counts.families_baseline_done = 1`; `safe + near_misses + collisions = 2` và khớp phân loại (va chạm → collision; TTC < 1,0 s hoặc khoảng cách < 0,5 m → near miss; còn lại safe); `false_activations` khớp `is_false_positive`.

### PJ-05 — Baseline hỏng hết [N]
- **Description:** Kiểm tra bước baseline báo lỗi khi mọi run baseline hỏng.
- **Preconditions:** Chạy ở pha 5. Project "IT-EXP1 Hành trình" chỉ có họ "IT-PJ Họ 2" mới (1 biến thể); CARLA **đã tắt**.
- **Test Steps:** 1. Tạo "IT-PJ Họ 2" với `run_baseline = true` (CARLA tắt). 2. Chờ run `FAILED`. 3. `GET /projects/<id>/journey`. 4. Bật lại CARLA.
- **Test Data:** như PJ-02 nhưng `name = "IT-PJ Họ 2"`, `ego_speeds_kmh = [40]`, `run_baseline = true`. *(Nếu project đã có họ chạy baseline xong từ PJ-03 thì dùng project mới "IT-EXP1 Baseline lỗi".)*
- **Post conditions:** 1 run `FAILED`.
- **Expected Result:** `BASELINE = FAILED`; `counts.baseline_failed = 1`; `counts.families_baseline_done = 0`.

### PJ-06 — Sau khi tạo candidate [N]
- **Description:** Kiểm tra bước cải tiến và kết quả hoàn tất khi có candidate của baseline hiện hành.
- **Preconditions:** P-EXP1 đã có CE-GOOD, CE-GOOD2, CE-BAD (parent = v1.0 của P-EXP1).
- **Test Steps:** 1. `GET /projects/<P-EXP1>/journey`.
- **Test Data:** `<P-EXP1>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `RESULTS = DONE`, `IMPROVE = DONE`; `counts.candidates = 3`.

### PJ-07 — Bước kiểm chứng đang chạy và hoàn tất ⭐ [N]
- **Description:** Kiểm tra bước kiểm chứng theo trạng thái regression.
- **Preconditions:** T-E1 vừa tạo.
- **Test Steps:** 1. Khi T-E1 đang chạy: `GET /projects/<P-EXP1>/journey`. 2. Khi T-E1, T-E2, T-E3 xong: gọi lại.
- **Test Data:** `<P-EXP1>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Lần 1: `VERIFY = RUNNING`, `counts.regressions_running` ≥ 1. Lần 2: `VERIFY = DONE`, `counts.regressions_completed = 3`, `counts.last_regression_id` = id test mới nhất, `counts.last_verdict` = verdict của test đó; `next = null` nếu cả 5 bước `DONE`.

### PJ-08 — Hành trình project của người khác [A]
- **Description:** Kiểm tra chỉ chủ project xem hành trình.
- **Preconditions:** PRE-LOGIN-EXP2.
- **Test Steps:** 1. `GET /projects/<P-EXP1>/journey`.
- **Test Data:** `<P-EXP1>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 403; `code = "PROJECT_NOT_YOURS"`.

### PJ-09 — Chủ project chọn candidate đạt làm baseline ⭐ [N]
- **Description:** Kiểm tra Adopt hợp lệ: đổi baseline, ghi chú lý do, mở vòng cải tiến tiếp theo.
- **Preconditions:** T-E1 `COMPLETED`, verdict `PASSED`; CE-GOOD `CANDIDATE`; v1.0 của P-EXP1 `BASELINE`; PRE-LOGIN-EXP1 (UI).
- **Test Steps:**
  1. Mở `/projects/<P-EXP1>/rounds/<T-E1>`; bấm "Dùng làm baseline".
  2. Nhập lý do; tick ô xác nhận; bấm "Dùng làm baseline".
  3. `SELECT id, status, notes FROM aeb_versions WHERE project_id=<P-EXP1>`.
  4. `GET /projects/<P-EXP1>/journey`.
- **Test Data:** `reason = "Không có ca xấu đi; ca 50 km/h dừng kịp. Chọn IT-CE-GOOD cho vòng 2."`; `confirmed = true`.
- **Post conditions:** CE-GOOD là baseline; v1.0 lưu trữ.
- **Expected Result:**
  - HTTP 200, body là hành trình: `round = 2`, `baseline_label = "IT-CE-GOOD"`.
  - DB: v1.0 `ARCHIVED`; CE-GOOD `BASELINE`, `notes` kết thúc bằng `"Dùng làm baseline thay v1.0 sau kiểm chứng RT-<T-E1>: Không có ca xấu đi; ca 50 km/h dừng kịp. Chọn IT-CE-GOOD cho vòng 2."`.
  - Log có sự kiện `project.adopt`. UI cập nhật baseline mới.

### PJ-10 — Vòng 2 dùng baseline mới ⭐ [N]
- **Description:** Kiểm tra sau Adopt, lượt chạy baseline và hành trình dùng baseline mới.
- **Preconditions:** PJ-09 xong.
- **Test Steps:** 1. `GET /projects/<P-EXP1>/journey`. 2. `POST /families/<F3>/run`. 3. `SELECT aeb_version_id FROM simulation_runs WHERE scenario_id=<F3> ORDER BY id DESC LIMIT 2`.
- **Test Data:** `<F3>`.
- **Post conditions:** 2 run baseline mới.
- **Expected Result:** Bước 1: `IMPROVE = TODO` (chưa có candidate của baseline mới), `counts.candidates = 0`. Bước 3: `aeb_version_id = <CE-GOOD>` cho cả 2 run.

### PJ-11 — Adopt không có lý do [A]
- **Description:** Kiểm tra bắt buộc lý do khi đổi baseline.
- **Preconditions:** T-E2 `COMPLETED` (chạy trước PJ-09 hoặc dùng bất kỳ test PASSED nào); PRE-LOGIN-EXP1.
- **Test Steps:** 1. Gửi với `reason = ""`. 2. Với `reason = "   "`. 3. Không có `reason`.
- **Test Data:** `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả ba HTTP 400; `code = "REASON_REQUIRED"`, `detail = "Ghi lý do chọn ứng viên này làm baseline."`.

### PJ-12 — Adopt không xác nhận [A]
- **Description:** Kiểm tra bắt buộc xác nhận đã xem kết quả kiểm chứng.
- **Preconditions:** như PJ-11.
- **Test Steps:** 1. Gửi với `confirmed = false`. 2. Không có `confirmed`.
- **Test Data:** `reason = "Kiểm tra xác nhận"`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả hai HTTP 400; `code = "CONFIRM_REQUIRED"`, `detail = "Xác nhận bạn đã xem kết quả kiểm chứng trước khi đổi baseline."`.

### PJ-13 — Lần kiểm chứng không thuộc project [A]
- **Description:** Kiểm tra không Adopt test của project khác hoặc không tồn tại.
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** 1. `POST /projects/<P-EXP1>/regressions/<T-A>/adopt`. 2. Với `testId = 999999`.
- **Test Data:** `reason = "Thử test ngoài project"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả hai HTTP 404; `code = "TEST_NOT_FOUND"`, `detail = "Không tìm thấy lần kiểm chứng #<testId> trong project này."`.

### PJ-14 — Lần kiểm chứng chưa chạy xong ⭐ [A]
- **Description:** Kiểm tra không Adopt khi test đang chạy.
- **Preconditions:** Một test của P-EXP1 đang `RUNNING`.
- **Test Steps:** 1. `POST /projects/<P-EXP1>/regressions/<id đang chạy>/adopt`.
- **Test Data:** `reason = "Thử khi đang chạy"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 409; `code = "TEST_NOT_FINISHED"`, `detail = "Lần kiểm chứng #<id> chưa chạy xong."`.

### PJ-15 — Lần kiểm chứng không đạt [A]
- **Description:** Kiểm tra không dùng candidate chưa đạt kiểm chứng làm baseline.
- **Preconditions:** T-E3 `COMPLETED`, verdict `REGRESSED`.
- **Test Steps:** 1. `POST /projects/<P-EXP1>/regressions/<T-E3>/adopt`. 2. Mở `/projects/<P-EXP1>/rounds/<T-E3>`.
- **Test Data:** `reason = "Thử candidate không đạt"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 409; `code = "TEST_NOT_PASSED"`, `detail = "Ứng viên IT-CE-BAD chưa đạt tiêu chí kiểm chứng nên không dùng làm baseline được."`; UI không cho chọn "Dùng làm baseline".

### PJ-16 — Adopt lần hai cùng một test [A]
- **Description:** Kiểm tra candidate đã được dùng làm baseline không xử lý lại được.
- **Preconditions:** PJ-09 xong.
- **Test Steps:** 1. `POST /projects/<P-EXP1>/regressions/<T-E1>/adopt`.
- **Test Data:** `reason = "Adopt lần hai"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 409; `code = "CANDIDATE_ALREADY_DECIDED"`, `detail = "Ứng viên IT-CE-GOOD đã được xử lý trước đó."`.

### PJ-17 — Baseline đã đổi sau lần kiểm chứng ⭐ [A]
- **Description:** Kiểm tra không Adopt bằng kết quả test chạy với baseline cũ.
- **Preconditions:** T-E2 tạo trước PJ-09 (baseline lúc chạy = v1.0), `COMPLETED`, verdict `PASSED`; PJ-09 đã đổi baseline.
- **Test Steps:** 1. `POST /projects/<P-EXP1>/regressions/<T-E2>/adopt`.
- **Test Data:** `reason = "Thử với baseline cũ"`; `confirmed = true`.
- **Post conditions:** CE-GOOD2 vẫn `CANDIDATE`.
- **Expected Result:** HTTP 409; `code = "BASELINE_CHANGED"`, `detail = "Baseline v1.0 đã được thay sau lần kiểm chứng này. Hãy kiểm chứng lại với baseline hiện hành."`.

### PJ-18 — Adopt trong project lưu trữ [A]
- **Description:** Kiểm tra không đổi baseline trong project đã lưu trữ.
- **Preconditions:** Project "IT-EXP1 Lưu trữ có test" có test PASSED và đã lưu trữ.
- **Test Steps:** 1. `POST /projects/<id>/regressions/<test>/adopt`.
- **Test Data:** `reason = "Thử khi lưu trữ"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 409; `code = "PROJECT_ARCHIVED"`.

### PJ-19 — Adopt trong project của người khác [A]
- **Description:** Kiểm tra chỉ chủ project được đổi baseline.
- **Preconditions:** PRE-LOGIN-EXP2.
- **Test Steps:** 1. `POST /projects/<P-EXP1>/regressions/<T-E2>/adopt` bằng EXP2.
- **Test Data:** `reason = "Người ngoài"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 403; `code = "PROJECT_NOT_YOURS"`.

### PJ-20 — Role khác EXPERIENCER gọi Adopt [A]
- **Description:** Kiểm tra Adopt chỉ dành cho EXPERIENCER.
- **Preconditions:** PRE-LOGIN-ENG1.
- **Test Steps:** 1. `POST /projects/<P-EXP1>/regressions/<T-E2>/adopt` bằng ENG1.
- **Test Data:** `reason = "Engineer thử"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 403; `code = "EXPERIENCER_ONLY"`.

### PJ-21 — Giao diện vòng kiểm chứng [N]
- **Description:** Kiểm tra hộp "Dùng làm baseline" chỉ cho gửi khi có lý do và xác nhận.
- **Preconditions:** Một test PASSED của P-EXP1 chưa Adopt; PRE-LOGIN-EXP1 (UI).
- **Test Steps:** 1. Mở `/projects/<P-EXP1>/rounds/<test>`; mở hộp "Dùng làm baseline". 2. Quan sát nút gửi khi: chưa nhập gì → có lý do → có lý do + tick xác nhận. 3. Bấm "Huỷ".
- **Test Data:** lý do "Kiểm tra giao diện".
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Nút "Dùng làm baseline" chỉ bật khi có lý do và đã tick xác nhận. *(Ghi nhận: frontend gửi cứng `confirmed: true`, không lấy giá trị ô tick — issue #12.)* Chụp màn hình.

### PJ-22 — Lý do Adopt quá dài [B]
- **Description:** Kiểm tra lý do vượt giới hạn lưu trữ bị từ chối rõ ràng và không làm đổi baseline dở dang.
- **Preconditions:** Chạy **trước PJ-09**. T-E2 `COMPLETED`, `PASSED`; v1.0 của P-EXP1 `BASELINE`; PRE-LOGIN-EXP1. *(Nếu request này lại thành công, T-E2 trở thành ca Adopt hợp lệ và T-E1 dùng cho PJ-17.)*
- **Test Steps:** 1. `POST /projects/<P-EXP1>/regressions/<T-E2>/adopt`. 2. `SELECT id, status FROM aeb_versions WHERE project_id=<P-EXP1>`.
- **Test Data:** `reason` = "r" × 70000 (vượt 65 535 byte của cột `notes` TEXT); `confirmed = true`.
- **Post conditions:** Baseline không đổi.
- **Expected Result:** Mong muốn: HTTP 400 nêu giới hạn độ dài lý do. Bắt buộc: v1.0 vẫn `BASELINE`, CE-GOOD2 vẫn `CANDIDATE` (transaction rollback). *(Code hiện tại không giới hạn ở API; dự kiến lỗi DB → 409 "Dữ liệu bị trùng hoặc vi phạm ràng buộc…" sai nghĩa → ghi Fail, issue #23.)*

### PJ-23 — `testId` sai kiểu, bằng 0 hoặc âm khi Adopt [A]
- **Description:** Kiểm tra id lần kiểm chứng không hợp lệ (EP-PJ7, EP-PJ8).
- **Preconditions:** PRE-LOGIN-EXP1.
- **Test Steps:** `POST /projects/<P-EXP1>/regressions/<testId>/adopt` với `testId` = `abc`, `0`, `-1`.
- **Test Data:** `reason = "Id lỗi"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `abc` → HTTP 400 `"Yêu cầu không hợp lệ"`; `0`, `-1` → HTTP 404, `code = "TEST_NOT_FOUND"`.

---

## Tab `CARLA-Weather` (CW)

**Đầu tab (sheet):** Module name = "Thời tiết và ma sát trong kịch bản CARLA — tạo họ kịch bản, tải `.xosc`, chạy CARLA;
`POST /families`, `GET /families/{id}/variants`, `GET /runs/{id}/xosc`, `GET /runs/{id}/carla-data`".

Quy tắc nghiệp vụ được kiểm (`Vs.WEATHER_FRICTION`, `XoscExport`, `CarlaSession.decelAvailable`):
- Ma sát mặt đường lưu vào biến thể khi tạo họ: CLEAR/CLOUDY/FOG = 1,0; RAIN = 0,65; HEAVY_RAIN = 0,55.
- `.xosc` ghi thời tiết theo preset CARLA 0.9.16: mây CLEAR 5, CLOUDY 60, RAIN 60 + mưa 60, HEAVY_RAIN 100 + mưa 100, FOG như CLOUDY;
  `Sun intensity` = 1 − mây/100; độ cao mặt trời DAY 45°, DUSK 15°, NIGHT −90°; `RoadCondition frictionScaleFactor` = ma sát.
- Giảm tốc khả dụng trên CARLA = min(giảm tốc tối đa AEB, giới hạn xe, μ·g, phanh 100% đo được của xe). Số CARLA chỉ để quan sát.

### CW-01 — Ma sát của họ RAIN [N]
- **Description:** Kiểm tra biến thể thời tiết mưa được gán ma sát 0,65.
- **Preconditions:** F-CW đã tạo trong P-TEAM; PRE-LOGIN-ENG1.
- **Test Steps:** 1. `SELECT id, weather, road_friction FROM scenario_versions WHERE scenario_id=<F-CW>`.
- **Test Data:** `<F-CW>` (`weathers = ["CLEAR", "RAIN"]`).
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** 2 biến thể (không tính bản gốc): CLEAR `road_friction = 1.00`; RAIN `road_friction = 0.65`.

### CW-02 — Ma sát của CLOUDY, FOG, HEAVY_RAIN [N]
- **Description:** Kiểm tra bảng ma sát theo thời tiết cho các loại còn lại.
- **Preconditions:** F-CW2 đã tạo.
- **Test Steps:** 1. `SELECT weather, time_of_day, road_friction FROM scenario_versions WHERE scenario_id=<F-CW2>`.
- **Test Data:** `<F-CW2>` (`weathers = ["CLOUDY", "FOG", "HEAVY_RAIN"]`, `times_of_day = ["DAY", "DUSK", "NIGHT"]`).
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** 9 biến thể (bỏ dòng bản gốc của họ nếu có); CLOUDY và FOG `road_friction = 1.00`; HEAVY_RAIN `0.55`; mỗi tổ hợp thời tiết × thời điểm xuất hiện đúng 1 lần.

### CW-03 — Tệp `.xosc` của biến thể RAIN [N]
- **Description:** Kiểm tra tệp OpenSCENARIO ghi thời tiết mưa và ma sát đúng preset.
- **Preconditions:** Run baseline của biến thể RAIN (F-CW) đã tạo.
- **Test Steps:** 1. `GET /runs/<run RAIN>/xosc`; lưu file. 2. Mở file, tìm phần tử `Weather`, `Sun`, `Precipitation`, `RoadCondition`.
- **Test Data:** run baseline biến thể RAIN.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `TimeOfDay dateTime = "2026-10-18T12:00:00"`; `Weather cloudState = "overcast"`; `Sun intensity = 0.4` (mây 60), `elevation` ≈ 0,785 (rad, 45°); `Fog visualRange = 100000`; `Precipitation precipitationType = "rain"`, `intensity = 0.6`; `RoadCondition frictionScaleFactor = 0.65`.

### CW-04 — Tệp `.xosc` của HEAVY_RAIN [N]
- **Description:** Kiểm tra preset mưa to.
- **Preconditions:** F-CW2.
- **Test Steps:** 1. Xuất `.xosc` của biến thể HEAVY_RAIN/DAY (`POST /scenarios/xosc` hoặc run tương ứng nếu có). 2. Đọc phần thời tiết.
- **Test Data:** biến thể HEAVY_RAIN, DAY.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `Sun intensity = 0` (mây 100); `Precipitation intensity = 1.0`; `frictionScaleFactor = 0.55`.

### CW-05 — Tệp `.xosc` của CLEAR và FOG [N]
- **Description:** Kiểm tra preset trời quang và sương mù (CARLA không có preset sương, nhóm dùng mây như CloudyNoon).
- **Preconditions:** F-CW, F-CW2.
- **Test Steps:** 1. Đọc `.xosc` biến thể CLEAR (F-CW). 2. Đọc `.xosc` biến thể FOG/DAY (F-CW2).
- **Test Data:** như bước.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** CLEAR: `cloudState = "free"`, `Sun intensity = 0.95`, `Fog visualRange = 100000`, `precipitationType = "dry"`, `intensity = 0`, `frictionScaleFactor = 1.0`. FOG: `cloudState = "overcast"`, `Sun intensity = 0.4`, `Fog visualRange = 30`, `precipitationType = "dry"`, `frictionScaleFactor = 1.0`.

### CW-06 — Độ cao mặt trời theo thời điểm trong ngày [N]
- **Description:** Kiểm tra góc mặt trời theo DAY/DUSK/NIGHT.
- **Preconditions:** F-CW2.
- **Test Steps:** 1. Đọc `.xosc` của 3 biến thể CLOUDY với DAY, DUSK, NIGHT; ghi `Sun elevation`.
- **Test Data:** 3 biến thể CLOUDY.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `Sun elevation` (rad): DAY ≈ 0,785 (45°); DUSK ≈ 0,262 (15°); NIGHT ≈ −1,571 (−90°). `TimeOfDay dateTime` giờ: DAY `12:00:00`, DUSK `18:00:00`, NIGHT `00:00:00`.

### CW-07 — Chạy CARLA biến thể mưa ⭐ [N]
- **Description:** Kiểm tra run CARLA của biến thể mưa hiển thị mưa và dùng giảm tốc khả dụng theo ma sát.
- **Preconditions:** Run baseline biến thể RAIN của F-CW `COMPLETED` với camera.
- **Test Steps:** 1. Mở ảnh camera của run (`GET /runs/<run>/carla-data`, thư mục `camera/`). 2. Đọc `decel_available_mps2` trong metrics/result của run.
- **Test Data:** run RAIN; xe e-tron; `MAX_DECELERATION = 8.0`; μ = 0,65.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Ảnh có mưa; `decel_available_mps2` = min(8,0; giới hạn xe; 0,65 × 9,81 ≈ 6,377; phanh 100% đo được của e-tron `carla_full_brake_decel_mps2` = 9,13) ≈ **6,377** m/s² (làm tròn 3 chữ số).

### CW-08 — So sánh CLEAR và RAIN cùng tham số ⭐ [N]
- **Description:** Kiểm tra (quan sát) ảnh hưởng của mặt đường ướt lên quãng phanh trong CARLA.
- **Preconditions:** Hai run baseline CLEAR và RAIN của F-CW `COMPLETED`.
- **Test Steps:** 1. Đọc `stopping_distance_m`, `min_ttc_s`, `collision_occurred`, `decel_available_mps2` của hai run.
- **Test Data:** 2 run F-CW.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** CLEAR `decel_available_mps2` = 8,0; RAIN ≈ 6,377; ghi số đo hai run. Quãng phanh RAIN dự kiến dài hơn — đây là quan sát, không dùng làm bằng chứng an toàn (TD-17).

### CW-09 — Thời tiết và thời điểm không hợp lệ [A]
- **Description:** Kiểm tra hệ thống chỉ nhận 5 loại thời tiết và 3 thời điểm trong ngày (EP-CW4, EP-CW5, EP-CW7).
- **Preconditions:** PRE-LOGIN-ENG1.
- **Test Steps:** Gửi `POST /families` 4 lần (body như F-CW, `run_baseline = false`, tên khác nhau) với từng giá trị.
- **Test Data:** (1) `weathers = ["SNOW"]`; (2) `weathers = ["rain"]`; (3) `weathers = []`; (4) `weathers = ["CLEAR"]`, `times_of_day = ["MORNING"]`.
- **Post conditions:** Không tạo họ.
- **Expected Result:** (1), (2) HTTP 400, `detail = "weathers phải thuộc [CLEAR, CLOUDY, RAIN, HEAVY_RAIN, FOG]"`; (3) HTTP 400 thông điệp `@Size` (ghi nguyên văn); (4) HTTP 400, `detail = "times_of_day phải thuộc [DAY, DUSK, NIGHT]"`.

---

## Tab `E2E` — luồng xuyên màn

**Đầu tab (sheet):** Module name = "Luồng 5 màn: Thiết kế kịch bản → Baseline → Phân tích → Tối ưu (candidate thủ công) → Regression/Phê duyệt".

### E2E-01 — Luồng nhóm đến Accept và vòng sau ⭐ [N]
- **Description:** Kiểm tra mỗi màn nhận ID của màn trước, không nhập lại tham số, và baseline mới được dùng ở vòng sau.
- **Preconditions:** PRE-ENV, PRE-ACC; P-TEAM.
- **Test Steps:**
  1. ENG1 mở `/scenarios/new`, mô tả "Người đi bộ băng ngang trước xe 40 km/h", tạo họ (chạy baseline).
  2. Chờ baseline xong; mở kết quả phân tích của họ.
  3. Tạo candidate từ màn `/aeb` (`TTC_THRESHOLD = 1.9`).
  4. Từ màn candidate chuyển sang tạo regression; tạo test với toàn bộ biến thể.
  5. Khi xong, REV2 duyệt Accept với lý do.
  6. ENG1 chạy lại baseline của họ; kiểm `aeb_version_id` của run mới.
- **Test Data:** mô tả như bước 1; `TTC_THRESHOLD = 1.9`; lý do "E2E nhóm".
- **Post conditions:** Baseline P-TEAM đổi sang candidate E2E.
- **Expected Result:** Mỗi bước chuyển màn mang theo id (họ, run, candidate, test) không cần nhập tay; Accept thành công; run mới dùng `aeb_version_id` = candidate E2E. Chụp màn hình từng bước.

### E2E-02 — Luồng project cá nhân đến Adopt và vòng 2 ⭐ [N]
- **Description:** Kiểm tra hành trình EXPERIENCER từ tạo project đến vòng cải tiến thứ hai.
- **Preconditions:** PRE-ENV; tài khoản EXP2.
- **Test Steps:** 1. Tạo project "IT-EXP2 E2E". 2. Tạo họ (1–2 biến thể), chạy baseline. 3. Tạo candidate. 4. Chạy kiểm chứng. 5. Adopt. 6. Xem hành trình.
- **Test Data:** họ như F3; candidate `TTC_THRESHOLD = 1.8`; lý do Adopt `reason = " x "` (biên min của lý do sau khi cắt, BVA ở ep-bva.md mục 5.2); `confirmed = true`.
- **Post conditions:** Project ở vòng 2.
- **Expected Result:** Thanh hành trình chuyển lần lượt các bước; Adopt HTTP 200, `round = 2`, `baseline_label` = candidate; `notes` của candidate kết thúc bằng `": x"`. Chụp màn hình.

### E2E-03 — Truy vết quyết định về dữ liệu gốc [N]
- **Description:** Kiểm tra từ một quyết định Accept truy ngược đủ biến thể, xe, seed, phiên bản AEB và phiên bản simulator.
- **Preconditions:** RV-03 xong.
- **Test Steps:** 1. Từ `/validation/decisions` mở `RT-<T-A>`. 2. Từ một cặp, mở run baseline và run candidate. 3. Đối chiếu `export.json`.
- **Test Data:** `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Tìm được đủ 5 thông tin cho mỗi cặp: biến thể (`variant`), xe (`manifest.vehicle`), seed (`pairs[].seed`), phiên bản AEB (`manifest.baseline`, `manifest.candidate`), simulator (`manifest.simulator_version`).

### E2E-04 — Từ chối rồi làm lại đến Accept ⭐ [N]
- **Description:** Kiểm tra lịch sử giữ cả quyết định Reject và Accept của các vòng.
- **Preconditions:** RV-06 (Reject C-BAD) và RV-03 (Accept C-GOOD) xong.
- **Test Steps:** 1. `GET /decisions`. 2. Mở `/validation/decisions`.
- **Test Data:** —
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Có quyết định REJECT của `REC-<T-B>` và ACCEPT của `REC-<T-A>` (cùng các quyết định khác đã làm), mỗi quyết định có người duyệt, thời điểm, lý do; chuỗi baseline đúng thứ tự.
