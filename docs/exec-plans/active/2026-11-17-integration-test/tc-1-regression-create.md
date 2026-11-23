# Tab `Regression-Create` (RC) — tạo regression test

Thuộc [kế hoạch integration test](../2026-11-17-integration-test-va-issue-nguoi-5.md). Mã dữ liệu (`<F1>`, `C-GOOD`…), tiền điều kiện
(`PRE-…`) và quy ước API xem mục 3–6 của kế hoạch. ⭐ = cần run CARLA chạy xong.

> **Cập nhật 20/11/2026 — đọc trước phần thân.** File này là bản nháp 3 viết theo API; bản đã chạy là sheet `docs/Integration-Test_VSOS_TuDM_v6.xlsx` (bước thao tác trên web, mã ca đánh lại theo tab, nên mã trong file này không trùng mã sheet). Kết quả, dữ liệu thật và trạng thái issue ở mục 0, 5, 8 của [kế hoạch](../2026-11-17-integration-test-va-issue-nguoi-5.md). Phần thân đã lỗi thời ở các điểm: P-TEAM có baseline **AEB v4** (TTC 4,0 s, giảm tốc 10 m/s²), không phải v1.0, nên C-GOOD / C-GOOD2 / C-GOOD3 là TTC 3,0 / 2,0 / 1,8 s giữ giảm tốc 10; `<SIM>` là `carla-0.9.16-xosc9` (không còn `-xosc7`); máy test không chạy được CARLA nên các ca cần CARLA để Untested; chỉ tài khoản role MANAGER (MGR1) thêm được thành viên workspace; mã test thật xem bảng 5.3 của kế hoạch.
>
> Luật phía server (`variant_ids` 300/301, `criteria` null, `enabled` sai kiểu, tên toàn khoảng trắng) đã chạy ở tab `Server-API` (API-01 → API-03, API-09, API-10): xác nhận #1, #21, #22. Chọn tập và tiêu chí chạy qua web ở RC-01 → RC-19; tạo test theo vai trò ở RC-20 → RC-25.

**Đầu tab (sheet):** Module name = "Tạo kiểm thử hồi quy — `/validation/regression/new`; `GET /regression/preview`, `POST /regression`".

Quy tắc nghiệp vụ được kiểm (`RegressionService`, `RegressionCriteria`, `RegressionController`):
- Chỉ AEB version `CANDIDATE` được đem đi regression; project phải có baseline.
- Candidate chạy **đúng seed, biến thể, xe, phiên bản simulator** của run baseline; biến thể chưa có run baseline thì tạo run baseline trước.
- Bộ kịch bản: chọn tay (`variant_ids`, tối đa 300), "ca lỗi cũ", hoặc "toàn bộ biến thể"; phải chọn ít nhất một.
- Tiêu chí mặc định: không va chạm mới (bắt buộc), tỉ lệ va chạm không tăng, phanh oan tăng ≤ 5 điểm %, trung vị TTC nhỏ nhất thay đổi ≥ −0,1 s, cùng seed (bắt buộc).
- Ghi: ADMIN/ENGINEER/EXPERIENCER; REVIEWER được chạy trong project thuộc workspace mình (ADR-049); MANAGER chỉ đọc.

---

### RC-01 — Xem trước bộ kịch bản của họ hợp lệ [N]
- **Description:** Kiểm tra hệ thống trả đúng số liệu tóm tắt (số biến thể, số ca lỗi cũ, số run baseline có sẵn, bộ mô phỏng) khi xem trước regression cho một họ kịch bản thuộc project.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-LOGIN-ENG1.
- **Test Steps:**
  1. Gửi `GET /regression/preview?scenario_id=<F1>`.
  2. Đếm đối chiếu trong DB: `SELECT COUNT(*) FROM simulation_runs WHERE scenario_id=<F1> AND purpose='BASELINE' AND aeb_version_id=<v1.0> AND status<>'FAILED' AND simulator_version='<SIM>'`.
- **Test Data:** `scenario_id = <F1>`; tài khoản = ENG1.
- **Post conditions:** Không tạo/sửa bản ghi nào.
- **Expected Result:**
  - HTTP 200.
  - `scenario_id = <F1>`, `family = "IT-F1 Người đi bộ băng ngang"`, `baseline = "v1.0"`, `simulator = "<SIM>"`.
  - `variant_count = 3`, `baseline_runs_existing = 3`, `old_critical_count` = số biến thể có lỗi ở baseline (kỳ vọng 1 — `<V3>`).
  - Không có các trường `selected_*` và `variants` (không gửi tham số tương ứng).

### RC-02 — Xem trước kèm danh sách biến thể [N]
- **Description:** Kiểm tra hệ thống trả danh sách từng biến thể với kết quả baseline và cờ phân loại khi bật `include_variants`.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `GET /regression/preview?scenario_id=<F1>&include_variants=true`.
- **Test Data:** `scenario_id = <F1>`; `include_variants = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:**
  - HTTP 200; `variants` có 3 phần tử theo thứ tự `version_no`.
  - Mỗi phần tử có: `id`, `label` dạng `<mã họ>-001/002/003`, `summary`, `baseline_outcome` ∈ {`SAFE`, `NEAR_MISS`, `COLLISION`}, `baseline_false_activation`, `has_baseline_run = true`, `safe`, `old_critical`.
  - Biến thể `<V3>`: `old_critical = true`, `safe = false`; `<V1>`, `<V2>`: `safe = true`, `old_critical = false` (theo kết quả baseline thực tế).

### RC-03 — Xem trước với tập biến thể chọn tay [N]
- **Description:** Kiểm tra hệ thống đếm đúng số biến thể đã chọn, số ca lỗi, số ca an toàn và số run baseline có sẵn trong tập chọn tay.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `GET /regression/preview?scenario_id=<F1>&variant_ids=<V2>&variant_ids=<V3>`.
- **Test Data:** `scenario_id = <F1>`; `variant_ids = [<V2>, <V3>]`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 200; `selected_count = 2`; `selected_old_critical_count = 1`; `selected_safe_count = 1`; `selected_baseline_runs_existing = 2`.

### RC-04 — Xem trước vượt giới hạn 300 biến thể [B]
- **Description:** Kiểm tra hệ thống từ chối xem trước khi tập chọn tay vượt 300 biến thể.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `GET /regression/preview?scenario_id=<F1>` kèm 301 tham số `variant_ids` (giá trị 1…301).
- **Test Data:** `variant_ids` = 301 số nguyên từ 1 đến 301.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "variant_ids tối đa 300 biến thể"`.

### RC-05 — Xem trước đúng biên 300 biến thể [B]
- **Description:** Kiểm tra giá trị biên 300 không bị chặn bởi giới hạn số lượng (lỗi trả về là lỗi biến thể không thuộc họ, không phải lỗi 300).
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `GET /regression/preview?scenario_id=<F1>` kèm 300 tham số `variant_ids` là id không tồn tại (900001…900300).
- **Test Data:** `variant_ids` = 300 id từ 900001 đến 900300.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail` bắt đầu bằng `"biến thể không thuộc bộ biến thể hiện tại của họ kịch bản: ["`.

### RC-06 — Xem trước họ của project khác [A]
- **Description:** Kiểm tra hệ thống không cho xem họ kịch bản không thuộc project đang làm việc.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-EXP, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `GET /regression/preview?scenario_id=<F3>` bằng token ENG1 (project nhóm).
- **Test Data:** `scenario_id = <F3>` (họ của P-EXP1).
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 404; `detail = "Không tìm thấy: scenario family"`.

### RC-07 — Tạo regression test với 3 biến thể chọn tay ⭐ [N]
- **Description:** Kiểm tra hệ thống tạo regression test hợp lệ, lưu đúng cấu hình và đưa các run candidate vào hàng đợi.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:**
  1. Gửi `POST /regression` với body ở Test Data.
  2. Lưu `id` trả về làm `<T-A>`.
  3. Truy vấn `SELECT execution_status, verdict, total_scenarios, simulator_version, carla_vehicle_model_id, baseline_aeb_version_id, candidate_aeb_version_id, created_by_user_id, JSON_EXTRACT(pass_criteria_json,'$.scenario_set') FROM regression_tests WHERE id=<T-A>`.
  4. Truy vấn `SELECT COUNT(*) FROM simulation_runs WHERE regression_test_id=<T-A> AND purpose='REGRESSION'`.
- **Test Data:**
  - `candidate_version_id = <C-GOOD>`
  - `scenario_id = <F1>`
  - `variant_ids = [<V1>, <V2>, <V3>]`
  - `name` = không gửi; `criteria` = không gửi; `include_old_critical`, `include_all_variants` = không gửi.
- **Post conditions:** 1 dòng `regression_tests` mới; 3 dòng `simulation_runs` purpose `REGRESSION` trạng thái `PENDING`/`RUNNING`; không tạo run baseline mới (đã có đủ).
- **Expected Result:**
  - HTTP 201; body `{"id": <T-A>, "code": "RT-<T-A 3 chữ số>"}`.
  - DB: `execution_status = RUNNING`, `verdict = PENDING`, `total_scenarios = 3`, `simulator_version = <SIM>`, `carla_vehicle_model_id` = xe của P-TEAM, `baseline_aeb_version_id = <v1.0>`, `candidate_aeb_version_id = <C-GOOD>`, `created_by_user_id` = id ENG1.
  - `scenario_set`: `mode = "custom"`, `include_old_critical = false`, `include_all_variants = false`, `variant_count = 3`, `variant_ids = [<V1>, <V2>, <V3>]`.
  - Đếm run REGRESSION = 3.

### RC-08 — Run candidate ghép đúng seed, biến thể, xe, simulator với run baseline ⭐ [N]
- **Description:** Kiểm tra mỗi run candidate chạy lại đúng biến thể, seed, xe và phiên bản simulator của run baseline được ghép (bất biến 4).
- **Preconditions:** RC-07 đã chạy.
- **Test Steps:** 1. Truy vấn
  `SELECT c.id, c.scenario_version_id, b.scenario_version_id, c.random_seed, b.random_seed, c.carla_vehicle_model_id, b.carla_vehicle_model_id, c.simulator_version, b.simulator_version, c.aeb_version_id, b.aeb_version_id FROM simulation_runs c JOIN simulation_runs b ON b.id=c.baseline_run_id WHERE c.regression_test_id=<T-A>`.
- **Test Data:** `regression_test_id = <T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** 3 dòng; mỗi dòng: `scenario_version_id` hai bên bằng nhau, `random_seed` bằng nhau, `carla_vehicle_model_id` bằng nhau, `simulator_version` bằng nhau và bằng `<SIM>`; `c.aeb_version_id = <C-GOOD>`, `b.aeb_version_id = <v1.0>`.

### RC-09 — Biến thể chưa có run baseline được chạy baseline trước ⭐ [N]
- **Description:** Kiểm tra hệ thống tự tạo run baseline cho biến thể chưa có, rồi ghép run candidate với run baseline mới đó.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-CAND, PRE-LOGIN-ENG1; F2 đã tạo với `run_baseline = false` (0 run).
- **Test Steps:**
  1. Gửi `POST /regression` với body ở Test Data; lưu `<T-F2>`.
  2. Truy vấn `SELECT purpose, aeb_version_id, status, regression_test_id, baseline_run_id FROM simulation_runs WHERE scenario_id=<F2> ORDER BY id`.
  3. Chờ 4 run kết thúc; xem lại `regression_tests` của `<T-F2>`.
- **Test Data:** `candidate_version_id = <C-GOOD>`; `scenario_id = <F2>`; `include_all_variants = true`; `include_old_critical = false`.
- **Post conditions:** 2 run BASELINE và 2 run REGRESSION mới cho F2.
- **Expected Result:**
  - HTTP 201.
  - 2 run `purpose = BASELINE`, `aeb_version_id = <v1.0>`, `regression_test_id = NULL`; 2 run `purpose = REGRESSION`, `aeb_version_id = <C-GOOD>`, `regression_test_id = <T-F2>`, `baseline_run_id` trỏ đúng run BASELINE cùng biến thể.
  - Khi 4 run `COMPLETED`: `<T-F2>` chuyển `execution_status = COMPLETED`.

### RC-10 — Bộ "ca lỗi cũ" [N]
- **Description:** Kiểm tra khi chỉ chọn "Kịch bản nguy hiểm cũ", hệ thống chỉ đưa biến thể baseline có lỗi vào regression.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:**
  1. Trên `/validation/regression/new`: chọn Họ kịch bản = "IT-F1 Người đi bộ băng ngang", Phiên bản ứng viên = "IT-C-GOOD3".
  2. Ở "Bộ kịch bản": bật "Kịch bản nguy hiểm cũ", tắt "Toàn bộ biến thể của họ".
  3. Bấm tạo; ghi lại `id`.
  4. Truy vấn `JSON_EXTRACT(pass_criteria_json,'$.scenario_set')` và số run REGRESSION của test.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `include_old_critical = true`; `include_all_variants = false`.
- **Post conditions:** 1 test mới; số run REGRESSION = số ca lỗi cũ (kỳ vọng 1).
- **Expected Result:** HTTP 201; `scenario_set.mode = "old_critical"`, `include_old_critical = true`, `variant_count` = số ca lỗi; chỉ `<V3>` có run REGRESSION.

### RC-11 — Không gửi cờ bộ kịch bản thì mặc định toàn bộ biến thể [N]
- **Description:** Kiểm tra giá trị mặc định khi body không có `include_old_critical` và `include_all_variants`.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression` chỉ với hai trường bắt buộc. 2. Truy vấn `scenario_set` của test vừa tạo.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`.
- **Post conditions:** 1 test mới, 3 run REGRESSION.
- **Expected Result:** HTTP 201; `scenario_set.mode = "all_variants"`, `include_old_critical = true`, `include_all_variants = true`, `variant_count = 3`.

### RC-12 — Không chọn bộ kịch bản nào [A]
- **Description:** Kiểm tra hệ thống từ chối khi tắt cả hai bộ và không chọn tay biến thể.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression` với body ở Test Data. 2. Đếm `regression_tests` trước và sau.
- **Test Data:** `candidate_version_id = <C-GOOD>`; `scenario_id = <F1>`; `include_old_critical = false`; `include_all_variants = false`; không có `variant_ids`.
- **Post conditions:** Không tạo test, không tạo run.
- **Expected Result:** HTTP 400; `detail = "chọn ít nhất một bộ kịch bản"`; số dòng `regression_tests` không đổi.

### RC-13 — "Ca lỗi cũ" khi baseline không có ca lỗi [A]
- **Description:** Kiểm tra hệ thống báo bộ kịch bản rỗng khi chọn "ca lỗi cũ" cho họ mà baseline an toàn ở mọi biến thể.
- **Preconditions:** RC-09 xong; 2 run baseline của F2 `COMPLETED` và đều không có lỗi (kiểm bằng RC-02 với `<F2>`). Nếu F2 có ca lỗi thì ca này `Blocked`.
- **Test Steps:** 1. Gửi `POST /regression` với body ở Test Data.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F2>`; `include_old_critical = true`; `include_all_variants = false`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail = "bộ kịch bản được chọn đang rỗng (chưa có ca lỗi nào của baseline)"`.

### RC-14 — Tập chọn tay rỗng [A]
- **Description:** Kiểm tra hệ thống từ chối danh sách `variant_ids` rỗng.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** `candidate_version_id = <C-GOOD>`; `scenario_id = <F1>`; `variant_ids = []`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail = "tập biến thể chọn tay đang rỗng"`.

### RC-15 — Biến thể không thuộc họ được chọn [A]
- **Description:** Kiểm tra hệ thống từ chối biến thể thuộc họ khác.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1; F2 đã tạo.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** `candidate_version_id = <C-GOOD>`; `scenario_id = <F1>`; `variant_ids = [<V1>, <V4>]`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail = "biến thể không thuộc bộ biến thể hiện tại của họ kịch bản: [<V4>]"`.

### RC-16 — Tạo test với 301 biến thể [B]
- **Description:** Kiểm tra ràng buộc tối đa 300 phần tử của `variant_ids` ở API tạo test.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** `candidate_version_id = <C-GOOD>`; `scenario_id = <F1>`; `variant_ids` = 301 số từ 1 đến 301.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail` là thông điệp ràng buộc độ dài (ghi nguyên văn; nếu là tiếng Anh "size must be between 0 and 300" thì liên kết issue #9).

### RC-17 — Candidate đang là baseline [A]
- **Description:** Kiểm tra chỉ version ở trạng thái CANDIDATE mới được đem đi regression.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** `candidate_version_id = <v1.0>`; `scenario_id = <F1>`; `variant_ids = [<V1>]`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail = "chỉ version ở trạng thái CANDIDATE mới đem đi regression được"`.

### RC-18 — Candidate đã bị Reject [A]
- **Description:** Kiểm tra version đã REJECTED không được đem đi regression lại.
- **Preconditions:** RV-06 đã chạy (C-BAD `status = REJECTED`).
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** `candidate_version_id = <C-BAD>`; `scenario_id = <F1>`; `variant_ids = [<V1>]`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail = "chỉ version ở trạng thái CANDIDATE mới đem đi regression được"`.

### RC-19 — Candidate không tồn tại hoặc thuộc project khác [A]
- **Description:** Kiểm tra hệ thống không cho dùng AEB version ngoài project.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-EXP, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression` với `candidate_version_id = <CE-GOOD>`. 2. Gửi lại với `candidate_version_id = 999999`.
- **Test Data:** lần 1 `<CE-GOOD>` (thuộc P-EXP1); lần 2 `999999`; `scenario_id = <F1>`; `variant_ids = [<V1>]`.
- **Post conditions:** Không tạo test.
- **Expected Result:** Cả hai lần HTTP 404; `detail = "Không tìm thấy: candidate AEB version"`.

### RC-20 — Thiếu trường bắt buộc [A]
- **Description:** Kiểm tra `candidate_version_id` và `scenario_id` là bắt buộc.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi body thiếu `candidate_version_id`. 2. Gửi body thiếu `scenario_id`.
- **Test Data:** lần 1 `{"scenario_id": <F1>}`; lần 2 `{"candidate_version_id": <C-GOOD>}`.
- **Post conditions:** Không tạo test.
- **Expected Result:** Cả hai HTTP 400; `detail` là thông điệp ràng buộc `@NotNull` (ghi nguyên văn).

### RC-21 — Tên test đúng biên 150 ký tự [B]
- **Description:** Kiểm tra tên test dài đúng 150 ký tự được chấp nhận và lưu nguyên vẹn.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression`. 2. `SELECT name, CHAR_LENGTH(name) FROM regression_tests WHERE id=<id>`.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `variant_ids = [<V1>]`; `name` = "Kiểm thử biên " + "A" × 136 (đủ 150 ký tự).
- **Post conditions:** 1 test mới.
- **Expected Result:** HTTP 201; `CHAR_LENGTH(name) = 150`, tiếng Việt không lỗi.

### RC-22 — Tên test 151 ký tự [B]
- **Description:** Kiểm tra tên test vượt 150 ký tự bị từ chối.
- **Preconditions:** như RC-21.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** như RC-21 nhưng `name` = "A" × 151.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail` là thông điệp `@Size(max=150)` (ghi nguyên văn).

### RC-23 — Không đặt tên thì hệ thống tự sinh tên [N]
- **Description:** Kiểm tra tên mặc định dạng "<baseline> → <candidate>".
- **Preconditions:** RC-07 đã chạy.
- **Test Steps:** 1. `SELECT name FROM regression_tests WHERE id=<T-A>`.
- **Test Data:** test `<T-A>` tạo không có `name`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `name = "v1.0 → IT-C-GOOD"`.

### RC-24 — Không gửi tiêu chí thì lưu tiêu chí mặc định [N]
- **Description:** Kiểm tra bộ tiêu chí mặc định được lưu vào test (ngưỡng phanh oan 5 điểm %, ADR-044).
- **Preconditions:** RC-07 đã chạy.
- **Test Steps:** 1. `SELECT JSON_PRETTY(JSON_EXTRACT(pass_criteria_json,'$.criteria')) FROM regression_tests WHERE id=<T-A>`.
- **Test Data:** test `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:**
  - `no_new_collision`: `enabled = true`, `required = true`.
  - `collision_rate_not_increase`: `enabled = true`, `required = false`.
  - `false_activation_increase_max_pts`: `enabled = true`, `required = false`, `value = 5.0`.
  - `median_min_ttc_change_min_s`: `enabled = true`, `required = false`, `value = -0.1`.
  - `identical_seeds`: `enabled = true`, `required = true`.

### RC-25 — Không tắt được tiêu chí bắt buộc [N]
- **Description:** Kiểm tra tiêu chí bắt buộc vẫn bật khi request cố tắt.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression`. 2. Đọc `criteria` đã lưu.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `variant_ids = [<V1>]`; `criteria = {"no_new_collision": {"enabled": false}, "identical_seeds": {"enabled": false}}`.
- **Post conditions:** 1 test mới.
- **Expected Result:** HTTP 201; `no_new_collision.enabled = true`, `identical_seeds.enabled = true`.

### RC-26 — Tiêu chí không tồn tại [A]
- **Description:** Kiểm tra hệ thống từ chối tên tiêu chí lạ.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** như RC-25 nhưng `criteria = {"abc": {"enabled": true}}`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail = "tiêu chí không tồn tại: abc"`.

### RC-27 — Giá trị tiêu chí không phải số [A]
- **Description:** Kiểm tra `value` của tiêu chí phải là số.
- **Preconditions:** như RC-26.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** `criteria = {"false_activation_increase_max_pts": {"value": "5"}}`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail = "tiêu chí false_activation_increase_max_pts: value phải là một số"`.

### RC-28 — Tiêu chí có giá trị null [A]
- **Description:** Kiểm tra hệ thống xử lý an toàn khi một tiêu chí có giá trị null.
- **Preconditions:** như RC-26.
- **Test Steps:** 1. Gửi `POST /regression`. 2. Đếm `regression_tests` trước và sau.
- **Test Data:** `criteria = {"no_new_collision": null}`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400 với thông điệp lỗi tiêu chí; không tạo test. *(Code hiện tại trả 500 "Lỗi hệ thống. Vui lòng thử lại sau." → ghi Fail, issue #1.)*

### RC-29 — Tiêu chí ngoài miền hợp lý [A]
- **Description:** Kiểm tra hệ thống chặn tiêu chí nới lỏng quá mức khiến candidate nào cũng đạt.
- **Preconditions:** như RC-26.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** `criteria = {"false_activation_increase_max_pts": {"value": 1000}, "median_min_ttc_change_min_s": {"value": -100}}`.
- **Post conditions:** Theo chốt Q12.
- **Expected Result:** Theo chốt Q12 (đề xuất: HTTP 400). *(Code hiện tại trả 201 → ghi theo chốt, issue #2.)*

### RC-30 — MANAGER không được tạo regression [A]
- **Description:** Kiểm tra role MANAGER chỉ đọc, không được tạo regression.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-MGR1.
- **Test Steps:** 1. Gửi `POST /regression` bằng token MGR1.
- **Test Data:** `candidate_version_id = <C-GOOD>`; `scenario_id = <F1>`; `variant_ids = [<V1>]`.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 403; `detail = "Cần quyền ENGINEER, EXPERIENCER hoặc ADMIN để thực hiện thao tác này"`.

### RC-31 — REVIEWER tạo regression trong workspace của mình ⭐ [N]
- **Description:** Kiểm tra Reviewer thuộc workspace được chạy regression để kiểm tra (ADR-049).
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-REV1.
- **Test Steps:** 1. Gửi `POST /regression` với header `X-VehicSim-Project: <P-TEAM>`; lưu `<T-R>`. 2. `SELECT created_by_user_id FROM regression_tests WHERE id=<T-R>`.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `variant_ids = [<V2>]`.
- **Post conditions:** 1 test mới (T-R), 1 run REGRESSION.
- **Expected Result:** HTTP 201; `created_by_user_id` = id REV1.

### RC-32 — REVIEWER không gửi header project [A]
- **Description:** Kiểm tra Reviewer phải chọn project tường minh khi tạo regression.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-REV1.
- **Test Steps:** 1. Gửi `POST /regression` không có header `X-VehicSim-Project`.
- **Test Data:** như RC-31.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail = "Cần chọn project trước khi quyết định; hãy tải lại trang"` *(câu nói "quyết định" trong ngữ cảnh tạo test → issue #8)*.

### RC-33 — REVIEWER gửi header sai định dạng [A]
- **Description:** Kiểm tra hệ thống từ chối mã project không phải số dương.
- **Preconditions:** như RC-32.
- **Test Steps:** 1. Gửi `POST /regression` với `X-VehicSim-Project: abc`. 2. Với `X-VehicSim-Project: 0` (min−1). 3. Với `X-VehicSim-Project: -1`.
- **Test Data:** header lần lượt `abc`, `0`, `-1`; body như RC-31.
- **Post conditions:** Không tạo test.
- **Expected Result:** Cả ba HTTP 400; `detail = "Mã project không hợp lệ"`.

### RC-34 — REVIEWER ngoài workspace [A]
- **Description:** Kiểm tra Reviewer không thuộc workspace không thấy và không tạo được test trong project của workspace đó.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-LOGIN-REV3.
- **Test Steps:** 1. Gửi `POST /regression` bằng token REV3, header `X-VehicSim-Project: <P-TEAM>`.
- **Test Data:** body như RC-31.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 404 (`detail` bắt đầu bằng `"Không tìm thấy:"`).

### RC-35 — EXPERIENCER tạo regression trong project cá nhân ⭐ [N]
- **Description:** Kiểm tra chủ project cá nhân tạo được regression trong project của mình.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-EXP, PRE-LOGIN-EXP1.
- **Test Steps:** 1. Gửi `POST /regression` với header `X-VehicSim-Project: <P-EXP1>`; lưu `<T-E1>`. 2. `SELECT project_id FROM regression_tests WHERE id=<T-E1>`.
- **Test Data:** `candidate_version_id = <CE-GOOD>`; `scenario_id = <F3>`; `variant_ids = [<V6>, <V7>]`.
- **Post conditions:** 1 test mới trong P-EXP1, 2 run REGRESSION.
- **Expected Result:** HTTP 201; `project_id = <P-EXP1>`.

### RC-36 — Vượt hạn mức thao tác ghi [B]
- **Description:** Kiểm tra giới hạn số lần tạo regression của một người trong một cửa sổ thời gian.
- **Preconditions:** `VEHICSIM_WRITES_PER_WINDOW=30`, backend đã khởi động lại; ENG1 chưa có thao tác ghi "regression" trong cửa sổ hiện tại.
- **Test Steps:** 1. Gửi liên tiếp 31 request `POST /regression` với body bị từ chối ở bước nghiệp vụ (không tạo run CARLA). 2. Ghi status từng request.
- **Test Data:** body mỗi lần: `candidate_version_id = <v1.0>`; `scenario_id = <F1>`; `variant_ids = [<V1>]`.
- **Post conditions:** Không tạo test nào.
- **Expected Result:** Request 1–30: HTTP 400 "chỉ version ở trạng thái CANDIDATE…"; request 31: HTTP 429, `detail = "Thao tác quá nhiều lần, thử lại sau ít phút"`.

### RC-37 — Không đăng nhập [A]
- **Description:** Kiểm tra API regression yêu cầu đăng nhập.
- **Preconditions:** PRE-ENV.
- **Test Steps:** 1. Gửi `POST /regression` và `GET /regression/preview?scenario_id=<F1>` không có header `Authorization`.
- **Test Data:** body như RC-07.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả hai HTTP 401.

### RC-38 — Tạo regression trên giao diện [N]
- **Description:** Kiểm tra màn tạo kiểm thử hồi quy hiển thị đúng tóm tắt, mặc định tiêu chí và chuyển sang trang chi tiết sau khi tạo.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1 (UI).
- **Test Steps:**
  1. Mở `http://localhost:3000/validation/regression/new`.
  2. Chọn Họ kịch bản = "IT-F1 Người đi bộ băng ngang"; Phiên bản ứng viên = "IT-C-GOOD3".
  3. Xem khung "Tóm tắt lượt chạy" và "Tiêu chí đạt".
  4. Ở "Chọn biến thể cụ thể" chọn `<V1>`; bấm tạo.
- **Test Data:** họ F1; candidate C-GOOD3; biến thể `<V1>`.
- **Post conditions:** 1 test mới, 1 run REGRESSION.
- **Expected Result:**
  - "Bản cơ sở (cũ)" = v1.0, "Ứng viên (mới)" = IT-C-GOOD3; "Bộ mô phỏng" = `<SIM>`; số "Lượt chạy cơ sở dùng lại" = 1.
  - "Tiêu chí đạt": "Không kịch bản an toàn nào được chuyển thành va chạm" và "Dùng cùng seed…" có nhãn "Bắt buộc"; "Tỉ lệ phanh oan tăng tối đa" = 5 điểm % (đổi từ "phanh nhầm" ngày 23/11/2026 cho khớp màn Phân tích); "Trung vị TTC…" = −0,1 s.
  - Sau khi tạo, trình duyệt chuyển tới `/validation/regression/<id>` với trạng thái đang chạy. Chụp màn hình bước 3 và 4.

---

## Ca bổ sung sau rà soát EP/BVA

Phân lớp và biên tương ứng ở [ep-bva.md](ep-bva.md), mục 1.

### RC-39 — `variant_ids` có id trùng [N]
- **Description:** Kiểm tra hệ thống bỏ id trùng, mỗi biến thể chỉ chạy một lần (EP-RC13).
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression`. 2. `SELECT total_scenarios, JSON_EXTRACT(pass_criteria_json,'$.scenario_set.variant_ids') FROM regression_tests WHERE id=<id>`. 3. Đếm run REGRESSION của test.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `variant_ids = [<V1>, <V1>, <V1>]`.
- **Post conditions:** 1 test, 1 run REGRESSION.
- **Expected Result:** HTTP 201; `total_scenarios = 1`; `scenario_set.variant_ids = [<V1>]`; đúng 1 run REGRESSION.

### RC-40 — Tạo test với đúng 300 id (biên max của độ dài) [B]
- **Description:** Kiểm tra 300 phần tử qua được ràng buộc độ dài, lỗi trả về là lỗi nghiệp vụ "không thuộc họ" (BVA max).
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-TEAM, PRE-CAND, PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /regression`.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `variant_ids` = 300 id từ 900001 đến 900300.
- **Post conditions:** Không tạo test.
- **Expected Result:** HTTP 400; `detail` bắt đầu bằng `"biến thể không thuộc bộ biến thể hiện tại của họ kịch bản: ["` (không phải lỗi độ dài như RC-16).

### RC-41 — Tên test chỉ có khoảng trắng [A]
- **Description:** Kiểm tra tên chỉ gồm khoảng trắng không tạo ra test "không tên" (EP-RC23).
- **Preconditions:** như RC-39.
- **Test Steps:** 1. Gửi `POST /regression`. 2. `SELECT CONCAT('[', name, ']') FROM regression_tests WHERE id=<id>`. 3. Mở `/validation/regression`.
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `variant_ids = [<V1>]`; `name = "   "`.
- **Post conditions:** Theo kết quả.
- **Expected Result:** Mong muốn: tên tự sinh `"v1.0 → IT-C-GOOD3"` (hoặc 400). *(Code hiện tại lưu `"[   ]"`, danh sách hiện dòng không tên → ghi Fail, issue #21.)*

### RC-42 — Tên test 1 ký tự và 149 ký tự [B]
- **Description:** Kiểm tra biên min và max−1 của tên test.
- **Preconditions:** như RC-39.
- **Test Steps:** 1. Gửi `POST /regression` với tên 1 ký tự. 2. Gửi lại với tên 149 ký tự. 3. Đọc `CHAR_LENGTH(name)` hai test.
- **Test Data:** chung: `candidate_version_id = <C-GOOD3>`, `scenario_id = <F1>`, `variant_ids = [<V1>]`; lần 1 `name = "A"`; lần 2 `name` = "B" × 149.
- **Post conditions:** 2 test mới.
- **Expected Result:** Cả hai HTTP 201; `CHAR_LENGTH(name)` = 1 và 149.

### RC-43 — `enabled` của tiêu chí không phải boolean [A]
- **Description:** Kiểm tra hệ thống từ chối `enabled` sai kiểu thay vì hiểu ngầm là tắt tiêu chí (EP-RC29).
- **Preconditions:** như RC-39.
- **Test Steps:** 1. Gửi `POST /regression`. 2. Đọc `criteria.collision_rate_not_increase.enabled` đã lưu (nếu tạo được).
- **Test Data:** `candidate_version_id = <C-GOOD3>`; `scenario_id = <F1>`; `variant_ids = [<V1>]`; `criteria = {"collision_rate_not_increase": {"enabled": "true"}}`.
- **Post conditions:** Theo kết quả.
- **Expected Result:** Mong muốn: HTTP 400 "enabled phải là true/false". *(Code hiện tại: HTTP 201 và lưu `enabled = false` — tiêu chí bị tắt ngược với ý người gửi → ghi Fail, issue #22.)*

### RC-44 — Biên ngưỡng phanh oan gửi lên [B]
- **Description:** Kiểm tra giá trị ngưỡng phanh oan ở các vị trí biên của miền hợp lệ (giả định [0; 5] điểm % theo Q12) được lưu/chặn đúng.
- **Preconditions:** như RC-39; Q12 đã chốt miền.
- **Test Steps:** Gửi 4 request `POST /regression`, mỗi request một giá trị; đọc `criteria.false_activation_increase_max_pts.value` đã lưu.
- **Test Data:** chung: `candidate_version_id = <C-GOOD3>`, `scenario_id = <F1>`, `variant_ids = [<V1>]`; `criteria = {"false_activation_increase_max_pts": {"value": X}}` với X = `-0.01` (min−1), `0` (min), `5` (max), `5.01` (max+1).
- **Post conditions:** Tối đa 4 test mới (chỉ các giá trị hợp lệ).
- **Expected Result:** Theo miền chốt ở Q12: `0` và `5` → 201, lưu `0.0` và `5.0`; `-0.01` và `5.01` → 400. *(Code hiện tại nhận cả 4 → ghi theo chốt, issue #2.)*

### RC-45 — Id sai kiểu, bằng 0 hoặc âm [A]
- **Description:** Kiểm tra id candidate/họ sai kiểu hoặc không hợp lệ (EP-RC7, EP-RC10).
- **Preconditions:** PRE-LOGIN-ENG1.
- **Test Steps:** Gửi `POST /regression` lần lượt với từng bộ Test Data.
- **Test Data:** (1) `candidate_version_id = "abc"`, `scenario_id = <F1>`; (2) `candidate_version_id = <C-GOOD3>`, `scenario_id = 0`; (3) `candidate_version_id = <C-GOOD3>`, `scenario_id = -1`. Mọi lần `variant_ids = [<V1>]`.
- **Post conditions:** Không tạo test.
- **Expected Result:** (1) HTTP 400, `detail = "Dữ liệu gửi lên không đúng định dạng"`; (2), (3) HTTP 404, `detail = "Không tìm thấy: scenario family"`.

### RC-46 — Preview với 1 biến thể (biên min) [B]
- **Description:** Kiểm tra preview ở biên min của tập chọn tay.
- **Preconditions:** PRE-TEAM; PRE-LOGIN-ENG1.
- **Test Steps:** 1. `GET /regression/preview?scenario_id=<F1>&variant_ids=<V1>&include_variants=false`.
- **Test Data:** `variant_ids = [<V1>]`; `include_variants = false`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 200; `selected_count = 1`; `selected_baseline_runs_existing = 1`; không có trường `variants`.
