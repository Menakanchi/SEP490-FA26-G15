# Tab `Regression-Result` (RR) — theo dõi, kết quả và xuất gói regression

Thuộc [kế hoạch integration test](../2026-11-17-integration-test-va-issue-nguoi-5.md). ⭐ = cần run CARLA chạy xong.

> **Cập nhật 20/11/2026 — đọc trước phần thân.** File này là bản nháp 3 viết theo API; bản đã chạy là sheet `docs/Integration-Test_VSOS_TuDM_v6.xlsx` (bước thao tác trên web, mã ca đánh lại theo tab, nên mã trong file này không trùng mã sheet). Kết quả, dữ liệu thật và trạng thái issue ở mục 0, 5, 8 của [kế hoạch](../2026-11-17-integration-test-va-issue-nguoi-5.md). Phần thân đã lỗi thời ở các điểm: P-TEAM có baseline **AEB v4** (TTC 4,0 s, giảm tốc 10 m/s²), không phải v1.0, nên C-GOOD / C-GOOD2 / C-GOOD3 là TTC 3,0 / 2,0 / 1,8 s giữ giảm tốc 10; `<SIM>` là `carla-0.9.16-xosc9` (không còn `-xosc7`); máy test không chạy được CARLA nên các ca cần CARLA để Untested; chỉ tài khoản role MANAGER (MGR1) thêm được thành viên workspace; mã test thật xem bảng 5.3 của kế hoạch.
>
> Đã thấy đủ ba kết quả: RT-035 Đạt, RT-042 Không đạt có ca xấu đi, RT-043 Không đạt chỉ vì trượt tiêu chí (cả hai cùng hiện "Không đạt", #7). Ca trạng thái đang chạy và ca CARLA (RR-11, RR-12, RR-14, RR-15 trên sheet) chờ CARLA; RR-22 Fail (#25).

**Đầu tab (sheet):** Module name = "Kết quả kiểm thử hồi quy — `/validation/regression`, `/validation/regression/[testId]`;
`GET /regression`, `GET /regression/{id}`, `GET /regression/{id}/export.json`, `GET /regression/{id}/export.csv`".

Quy tắc nghiệp vụ được kiểm (`RegressionService.tryFinalize`, `RegressionSummarizer`, `RegressionCodes`, `RegressionReportService`):
- Khi mọi run của test (candidate và baseline ghép cặp) kết thúc: tất cả `COMPLETED` → test `COMPLETED`, tính verdict, lưu từng cặp,
  tạo khuyến nghị (chỉ project thuộc workspace); có run không `COMPLETED` → test `FAILED`, không có khuyến nghị.
- Verdict: mọi tiêu chí đang bật đạt → `PASSED`; không đạt và có ca xấu đi → `REGRESSED`; không đạt, không có ca xấu đi → `FAILED`.
- Trạng thái hiển thị: `COMPLETED` + `PASSED` → `PASSED`; `COMPLETED` + verdict khác → `FAILED`; `execution_status` `FAILED` → `ERROR`.
- Ca xấu đi (`regressed`): kết cục candidate tệ hơn baseline (SAFE < NEAR_MISS < COLLISION) hoặc PASS → FAIL; ca được sửa (`fixed`) ngược lại.
- Chỉ xuất gói kết quả khi test `COMPLETED`.

---

### RR-01 — Danh sách regression và KPI [N]
- **Description:** Kiểm tra danh sách regression của project hiển thị đúng thứ tự và chỉ số tổng hợp.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM; đã có ít nhất T-A, T-B, T-ERR; PRE-LOGIN-ENG1.
- **Test Steps:**
  1. Gửi `GET /regression`.
  2. Đối chiếu `SELECT id, execution_status, verdict FROM regression_tests WHERE project_id=<P-TEAM> ORDER BY id DESC`.
  3. Mở `/validation/regression` trên UI, so với API.
- **Test Data:** không có tham số.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:**
  - HTTP 200; `items` sắp theo `id` giảm dần; mỗi item có `code` dạng `RT-xxx`, `baseline`, `candidate`, `status`, `review_decision`, `scenarios`, `progress {done, total}`, `created_by`, `created_at`.
  - `kpis.total` = số test của project; `kpis.passed` = số item `PASSED`; `kpis.failed` = số item `FAILED`; `kpis.running` = số item `RUNNING`; `kpis.since` = `created_at` của test cũ nhất.
  - `fixed`/`regressed` chỉ có giá trị với test đã `COMPLETED`, còn lại `null`.

### RR-02 — Lọc danh sách theo trạng thái [N]
- **Description:** Kiểm tra bộ lọc trạng thái chỉ trả item đúng trạng thái và KPI vẫn tính trên toàn bộ.
- **Preconditions:** như RR-01.
- **Test Steps:** Gửi lần lượt `GET /regression?status=RUNNING`, `PASSED`, `FAILED`, `ERROR`.
- **Test Data:** `status` ∈ {`RUNNING`, `PASSED`, `FAILED`, `ERROR`}.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Mỗi lần HTTP 200; mọi item có `status` bằng giá trị lọc; `kpis` giống hệt RR-01 ở cả bốn lần; T-ERR chỉ xuất hiện khi lọc `ERROR`.

### RR-03 — Lọc bằng trạng thái không tồn tại [A]
- **Description:** Kiểm tra bộ lọc với giá trị lạ không gây lỗi.
- **Preconditions:** như RR-01.
- **Test Steps:** 1. Gửi `GET /regression?status=abc`.
- **Test Data:** `status = "abc"`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 200; `items = []`; `kpis` như RR-01.

### RR-04 — Cô lập dữ liệu giữa các project [N]
- **Description:** Kiểm tra người dùng project khác không thấy regression của project này.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-EXP; T-E1 đã tạo; PRE-LOGIN-EXP2.
- **Test Steps:** 1. Gửi `GET /regression` bằng token EXP2, header `X-VehicSim-Project: <P-EXP2>`. 2. Gửi `GET /regression` bằng token ENG1.
- **Test Data:** —
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Lần 1: không có item nào của P-TEAM hay P-EXP1. Lần 2: không có `<T-E1>`, `<T-E2>`, `<T-E3>`.

### RR-05 — Theo dõi test đang chạy ⭐ [N]
- **Description:** Kiểm tra trang chi tiết hiển thị tiến độ khi test đang chạy và tự cập nhật.
- **Preconditions:** T-A vừa tạo, CARLA đang chạy run đầu tiên; PRE-LOGIN-ENG1.
- **Test Steps:**
  1. Gửi `GET /regression/<T-A>`.
  2. Mở `/validation/regression/<T-A>` trên UI; để nguyên trang đến khi có thêm một run xong.
- **Test Data:** `testId = <T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:**
  - HTTP 200; `status = "RUNNING"`; `progress.total = 3`; `progress.done` < 3; `summary` không có `counts`, `pairs`.
  - UI hiển thị trạng thái đang chạy và số `done/total` tự tăng mà không cần tải lại trang.

### RR-06 — Tự chốt kết quả khi mọi run xong ⭐ [N]
- **Description:** Kiểm tra hệ thống tự chuyển test sang hoàn tất, lưu từng cặp và tạo khuyến nghị khi mọi run `COMPLETED`.
- **Preconditions:** 3 run REGRESSION của T-A và 3 run baseline ghép cặp đều `COMPLETED`.
- **Test Steps:**
  1. `SELECT execution_status, verdict, total_scenarios, fixed_scenarios, regressed_scenarios, finished_at FROM regression_tests WHERE id=<T-A>`.
  2. `SELECT scenario_version_id, baseline_run_id, candidate_run_id, baseline_outcome, candidate_outcome, change_type, is_regression FROM regression_test_items WHERE regression_test_id=<T-A>`.
  3. `SELECT status, confidence, content, created_by_user_id, candidate_aeb_version_id FROM engineering_recommendations WHERE regression_test_id=<T-A>`.
- **Test Data:** `<T-A>`.
- **Post conditions:** Test chuyển `COMPLETED`; 3 dòng `regression_test_items`; 1 dòng `engineering_recommendations`.
- **Expected Result:**
  - `execution_status = COMPLETED`; `verdict` ∈ {`PASSED`, `REGRESSED`, `FAILED`}; `total_scenarios = 3`; `fixed_scenarios + regressed_scenarios` ≤ 3; `finished_at` khác NULL.
  - 3 dòng item, `change_type` ∈ {`FIXED`, `REGRESSED`, `UNCHANGED`}, `is_regression = 1` đúng với dòng `REGRESSED`.
  - Khuyến nghị: `status = PENDING_REVIEW`; `confidence = MEDIUM` nếu PASSED (dưới 20 kịch bản), `LOW` nếu không; `content = "Candidate IT-C-GOOD vs baseline v1.0: <fixed> fixed, <regressed> regressed of 3 scenarios."`; `created_by_user_id` = ENG1; `candidate_aeb_version_id = <C-GOOD>`.

### RR-07 — Verdict PASSED với candidate tốt ⭐ [N]
- **Description:** Kiểm tra candidate phanh sớm hơn và không làm xấu ca nào đạt mọi tiêu chí.
- **Preconditions:** RR-06 xong.
- **Test Steps:** 1. Gửi `GET /regression/<T-A>`. 2. Mở trang chi tiết trên UI.
- **Test Data:** `<T-A>` (C-GOOD, `TTC_THRESHOLD` 1,5 → 1,8).
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:**
  - `status = "PASSED"`; `summary.counts.regressed = 0`; `summary.counts.new_collisions = 0`.
  - `summary.criteria` có 5 mục, mỗi mục `passed = true`; mục `identical_seeds` có `actual = "enforced"`.
  - `summary.rates.collision_candidate_pct` ≤ `collision_baseline_pct`; `false_activation_candidate_pct − false_activation_baseline_pct` ≤ 5.
  - *Nếu CARLA cho kết quả khác: ghi Actual Result đúng số liệu, Status = Fail, đánh dấu "dữ liệu chưa đạt thiết kế", dựng lại T-A.*

### RR-08 — Verdict REGRESSED với candidate xấu ⭐ [N]
- **Description:** Kiểm tra candidate phanh muộn/yếu làm xấu ca an toàn bị đánh REGRESSED.
- **Preconditions:** T-B `COMPLETED`.
- **Test Steps:** 1. `GET /regression/<T-B>`. 2. `SELECT verdict FROM regression_tests WHERE id=<T-B>`. 3. Mở trang chi tiết.
- **Test Data:** `<T-B>` (C-BAD: `TTC_THRESHOLD = 0.6`, `BRAKE_ACTIVATION_DELAY = 0.5`, `MAX_DECELERATION = 4.0`, `BRAKE_BUILDUP_RATE = 5.0`).
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:**
  - DB `verdict = REGRESSED`; API `status = "FAILED"` (issue #7: hiển thị gộp).
  - `summary.counts.regressed` ≥ 1; ít nhất một `pairs[i].change = "regressed"`; nếu có cặp SAFE/NEAR_MISS → COLLISION thì `new_collisions` ≥ 1 và tiêu chí `no_new_collision.passed = false`.
  - UI hiển thị banner ca xấu đi và danh sách cặp bị xấu đi.

### RR-09 — Verdict FAILED do không đạt tiêu chí, không có ca xấu đi ⭐ [N]
- **Description:** Kiểm tra verdict FAILED khi một tiêu chí không đạt nhưng không có cặp nào xấu đi.
- **Preconditions:** T-F `COMPLETED`.
- **Test Steps:** 1. `GET /regression/<T-F>`. 2. `SELECT verdict, regressed_scenarios FROM regression_tests WHERE id=<T-F>`.
- **Test Data:** `<T-F>`: C-GOOD3, `variant_ids = [<V1>]`, `criteria = {"median_min_ttc_change_min_s": {"value": 5}}`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** DB `verdict = FAILED`, `regressed_scenarios = 0`; tiêu chí `median_min_ttc_change_min_s`: `threshold = 5.0`, `passed = false`; các tiêu chí khác `passed = true`; API `status = "FAILED"`; UI không hiện banner ca xấu đi.

### RR-10 — Test lỗi do mô phỏng hỏng ⭐ [A]
- **Description:** Kiểm tra test chuyển trạng thái lỗi và không sinh khuyến nghị khi có run không hoàn tất.
- **Preconditions:** Tắt server CARLA (đóng cửa sổ CarlaUE4 khi không có run nào đang chạy); PRE-LOGIN-ENG1.
- **Test Steps:**
  1. Tạo T-ERR: `POST /regression` với Test Data.
  2. Chờ run kết thúc (lỗi kết nối).
  3. `SELECT status, error_message FROM simulation_runs WHERE regression_test_id=<T-ERR>`; `SELECT execution_status, verdict FROM regression_tests WHERE id=<T-ERR>`; `SELECT COUNT(*) FROM engineering_recommendations WHERE regression_test_id=<T-ERR>`.
  4. `GET /regression/<T-ERR>`; mở trang chi tiết.
  5. Bật lại CARLA.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `variant_ids = [<V2>]`.
- **Post conditions:** T-ERR `FAILED`; không có khuyến nghị; CARLA đã bật lại.
- **Expected Result:** Run `status = FAILED` có `error_message`; test `execution_status = FAILED`, `verdict = PENDING`; 0 khuyến nghị; API `status = "ERROR"`, `summary.error = "một số lần chạy mô phỏng hỏng — xem simulation_runs"`; UI hiển thị trạng thái lỗi.

### RR-11 — Ma trận chuyển trạng thái [N]
- **Description:** Kiểm tra ma trận chuyển kết cục baseline → candidate cộng đúng bằng số cặp.
- **Preconditions:** T-B `COMPLETED`.
- **Test Steps:** 1. `GET /regression/<T-B>`; cộng mọi ô của `summary.transitions`. 2. Đếm tay từ `summary.pairs`.
- **Test Data:** `<T-B>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `transitions` có đủ 3 × 3 ô (`SAFE`, `NEAR_MISS`, `COLLISION`); tổng = 3; ô `[baseline_outcome][candidate_outcome]` khớp đếm tay từ `pairs`.

### RR-12 — Tỉ lệ va chạm và phanh oan [N]
- **Description:** Kiểm tra tỉ lệ va chạm và phanh oan tính đúng từ kết quả từng run.
- **Preconditions:** T-A, T-B `COMPLETED`.
- **Test Steps:** 1. `GET /regression/<T-B>`. 2. `SELECT id, collision_occurred, is_false_positive FROM simulation_runs WHERE id IN (<các baseline_run_id và candidate_run_id của T-B>)`. 3. Tính tay.
- **Test Data:** `<T-B>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `collision_baseline_pct` = 100 × số cặp baseline `COLLISION` / 3, làm tròn 2 chữ số; tương tự `collision_candidate_pct`, `false_activation_baseline_pct`, `false_activation_candidate_pct`; đều khớp tính tay.

### RR-13 — Ba mục tiêu tối ưu theo từng cặp [N]
- **Description:** Kiểm tra RMS jerk, tốc độ va chạm, quãng phanh theo cặp khớp kết quả run (ba mục tiêu ADR-040).
- **Preconditions:** T-A `COMPLETED`.
- **Test Steps:** 1. `GET /regression/<T-A>`. 2. Với từng cặp, đọc chỉ số của `baseline_run_id` và `candidate_run_id` ở `simulation_runs`.
- **Test Data:** `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Mỗi `pairs[i]` có `baseline_rms_jerk_mps3`, `candidate_rms_jerk_mps3`, `baseline_impact_speed_mps`, `candidate_impact_speed_mps`, `baseline_stopping_distance_m`, `candidate_stopping_distance_m` khớp DB; `min_ttc_delta_s` = TTC nhỏ nhất candidate − baseline (3 chữ số).

### RR-14 — Bảng tham số AEB [N]
- **Description:** Kiểm tra trang chi tiết hiển thị đúng 4 tham số AEB và đánh dấu tham số thay đổi.
- **Preconditions:** T-A `COMPLETED`.
- **Test Steps:** 1. `GET /regression/<T-A>`; đọc `key_parameters` và `parameter_diff`.
- **Test Data:** `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `key_parameters` có đúng 4 phần tử theo thứ tự `TTC_THRESHOLD`, `BRAKE_ACTIVATION_DELAY`, `MAX_DECELERATION`, `BRAKE_BUILDUP_RATE`; `TTC_THRESHOLD`: `baseline = 1.5`, `candidate = 1.8`, `changed = true`; ba tham số còn lại `changed = false`.

### RR-15 — Cảnh báo kết quả CARLA [N]
- **Description:** Kiểm tra test chạy CARLA hiển thị cảnh báo về số liệu CARLA.
- **Preconditions:** T-A `COMPLETED`.
- **Test Steps:** 1. `GET /regression/<T-A>`. 2. Mở trang chi tiết và trang duyệt.
- **Test Data:** `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `simulator = "<SIM>"`; `simulator_caveat = {"carla": true, "calibrated": false}`; UI hiển thị khối cảnh báo CARLA. *(Ghi nhận `calibrated` luôn false dù `-xosc5` trở đi đã hiệu chuẩn — issue #5, kết quả theo chốt Q12.)*

### RR-16 — Xuất gói kết quả JSON ⭐ [N]
- **Description:** Kiểm tra tải gói kết quả JSON của test đã hoàn tất, đủ thông tin truy vết.
- **Preconditions:** T-A `COMPLETED`.
- **Test Steps:** 1. Gửi `GET /regression/<T-A>/export.json`; lưu file. 2. Mở file, kiểm các trường.
- **Test Data:** `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:**
  - HTTP 200; header `Content-Disposition: attachment; filename="RT-<T-A>.json"`.
  - `manifest.schema = "vehicsim.regression-export/v1"`, `manifest.regression_code = "RT-…"`, `manifest.recommendation_code = "REC-…"`, `manifest.simulator_version = "<SIM>"`, `manifest.vehicle.carla_blueprint_id = "vehicle.audi.etron"`, `manifest.baseline.label = "v1.0"`, `manifest.candidate.label = "IT-C-GOOD"`.
  - `parameters` 4 dòng; `criteria` 5 dòng; `pairs` 3 dòng, mỗi dòng có `seed`, `baseline_run_id`, `candidate_run_id`, `baseline_xosc_url`, `candidate_xosc_url`.

### RR-17 — Xuất gói kết quả CSV ⭐ [N]
- **Description:** Kiểm tra tải gói CSV mỗi dòng một cặp baseline–candidate.
- **Preconditions:** T-A `COMPLETED`.
- **Test Steps:** 1. Gửi `GET /regression/<T-A>/export.csv`; lưu file. 2. Mở bằng Excel và trình soạn thảo.
- **Test Data:** `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 200; `Content-Type: text/csv; charset=utf-8`; tên file `RT-<T-A>.csv`; dòng 1 = `variant,baseline_run_id,candidate_run_id,seed,baseline_outcome,candidate_outcome,change,baseline_false_activation,candidate_false_activation,min_ttc_delta_s,baseline_rms_jerk_mps3,candidate_rms_jerk_mps3,baseline_impact_speed_mps,candidate_impact_speed_mps,baseline_stopping_distance_m,candidate_stopping_distance_m`; thêm đúng 3 dòng dữ liệu; xuống dòng `\r\n`. Ghi nhận Excel có hiển thị đúng tiếng Việt không.

### RR-18 — Xuất gói khi test chưa xong hoặc lỗi [A]
- **Description:** Kiểm tra không xuất được gói kết quả khi test chưa hoàn tất.
- **Preconditions:** Một test đang `RUNNING`; T-ERR `FAILED`.
- **Test Steps:** 1. `GET /regression/<test đang chạy>/export.json`. 2. `GET /regression/<T-ERR>/export.csv`.
- **Test Data:** id test đang chạy; `<T-ERR>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả hai HTTP 400; `detail = "regression test chưa chạy xong hoặc bị lỗi nên chưa xuất được gói kết quả"`.

### RR-19 — Test không tồn tại hoặc thuộc project khác [A]
- **Description:** Kiểm tra không xem/xuất được test ngoài project.
- **Preconditions:** T-E1 đã tạo; PRE-LOGIN-ENG1.
- **Test Steps:** 1. `GET /regression/999999`. 2. `GET /regression/<T-E1>`. 3. `GET /regression/<T-E1>/export.json`.
- **Test Data:** `999999`; `<T-E1>` (thuộc P-EXP1).
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả ba HTTP 404; `detail = "Không tìm thấy: regression test"`.

### RR-20 — Test trong project cá nhân không tạo khuyến nghị ⭐ [N]
- **Description:** Kiểm tra project cá nhân (không thuộc workspace) không sinh khuyến nghị cho Reviewer.
- **Preconditions:** T-E1 `COMPLETED`.
- **Test Steps:** 1. `SELECT execution_status, verdict FROM regression_tests WHERE id=<T-E1>`. 2. `SELECT COUNT(*) FROM engineering_recommendations WHERE regression_test_id=<T-E1>`. 3. REV2 gửi `GET /recommendations`.
- **Test Data:** `<T-E1>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `execution_status = COMPLETED`; 0 khuyến nghị; danh sách của REV2 không có `REC-<T-E1>`.

### RR-21 — MANAGER xem kết quả [N]
- **Description:** Kiểm tra MANAGER đọc được danh sách và chi tiết regression.
- **Preconditions:** T-A `COMPLETED`; PRE-LOGIN-MGR1.
- **Test Steps:** 1. `GET /regression`. 2. `GET /regression/<T-A>`.
- **Test Data:** `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả hai HTTP 200, dữ liệu giống khi ENG1 xem.

### RR-22 — Giao diện trang chi tiết [N]
- **Description:** Kiểm tra trang chi tiết hiển thị đúng kết quả cho test đạt và test xấu đi.
- **Preconditions:** T-A, T-B `COMPLETED`; PRE-LOGIN-ENG1 (UI).
- **Test Steps:** 1. Mở `/validation/regression/<T-A>`. 2. Mở `/validation/regression/<T-B>`. 3. Bấm nút xuất JSON, CSV; bấm link phát lại một cặp.
- **Test Data:** `<T-A>`, `<T-B>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** T-A: nhãn đạt, không có banner lỗi, đủ 4 thẻ tham số. T-B: nhãn không đạt, banner ca xấu đi, cặp `regressed` được đánh dấu. Nút xuất tải đúng file; link phát lại mở `/analysis/failures/<run>/playback`. Chụp màn hình.

### RR-23 — Khởi động lại backend khi test đang chạy (tuỳ chọn, theo Q8) [N]
- **Description:** Kiểm tra test vẫn chốt được kết quả sau khi backend khởi động lại giữa chừng.
- **Preconditions:** Một test đang chạy; Q8 = chạy.
- **Test Steps:** 1. Dừng backend đúng cách (không giết runner CARLA). 2. Khởi động lại bằng `dev-carla.ps1 -RestartBackend`. 3. Chờ run kết thúc; xem trạng thái test.
- **Test Data:** id test đang chạy.
- **Post conditions:** Test ở trạng thái cuối.
- **Expected Result:** Backend nhặt lại run PENDING/RUNNING (TD-37); test chuyển `COMPLETED` hoặc `FAILED`, không kẹt `RUNNING`.

---

## Ca bổ sung sau rà soát EP/BVA

Phân lớp và biên tương ứng ở [ep-bva.md](ep-bva.md), mục 2.

### RR-24 — `testId` sai kiểu, bằng 0 hoặc âm [A]
- **Description:** Kiểm tra đường dẫn chi tiết/xuất gói với id không hợp lệ (EP-RR7, EP-RR8).
- **Preconditions:** PRE-LOGIN-ENG1.
- **Test Steps:** 1. `GET /regression/abc`. 2. `GET /regression/0`. 3. `GET /regression/-1/export.json`.
- **Test Data:** `testId` = `abc`, `0`, `-1`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** (1) HTTP 400, `detail = "Yêu cầu không hợp lệ"`; (2), (3) HTTP 404, `detail = "Không tìm thấy: regression test"`.

### RR-25 — Còn đúng 1 run chưa xong thì chưa chốt kết quả [B]
- **Description:** Kiểm tra biên max−1 của số run đã xong: test chưa được chốt khi còn một run chưa kết thúc.
- **Preconditions:** Một test 3 cặp (ví dụ T-B) đang chạy; theo dõi `simulation_runs` của test.
- **Test Steps:** 1. Khi `progress.done = 2` (đúng 2 run REGRESSION `COMPLETED`, run thứ 3 `RUNNING`): `GET /regression/<T-B>`. 2. `SELECT execution_status, verdict FROM regression_tests WHERE id=<T-B>`; đếm khuyến nghị.
- **Test Data:** `<T-B>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `status = "RUNNING"`, `progress = {done: 2, total: 3}`; DB `execution_status = RUNNING`, `verdict = PENDING`; chưa có khuyến nghị; chưa có dòng `regression_test_items`.
