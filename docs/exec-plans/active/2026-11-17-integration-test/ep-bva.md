# Phân tích phân lớp tương đương (EP) và giá trị biên (BVA)

Thuộc [kế hoạch integration test](../2026-11-17-integration-test-va-issue-nguoi-5.md). Cách trình bày theo tab EP-BVA của báo cáo unit test
Report5.1: mỗi đầu vào chia lớp tương đương (V = hợp lệ, I = không hợp lệ), mỗi biên kiểm các vị trí min−1, min, min+1, max−1, max, max+1;
mỗi dòng trỏ tới mã test case.

> **Cập nhật 20/11/2026 — đọc trước phần thân.** File này là bản nháp 3 viết theo API; bản đã chạy là sheet `docs/Integration-Test_VSOS_TuDM_v6.xlsx` (bước thao tác trên web, mã ca đánh lại theo tab, nên mã trong file này không trùng mã sheet). Kết quả, dữ liệu thật và trạng thái issue ở mục 0, 5, 8 của [kế hoạch](../2026-11-17-integration-test-va-issue-nguoi-5.md). Phần thân đã lỗi thời ở các điểm: P-TEAM có baseline **AEB v4** (TTC 4,0 s, giảm tốc 10 m/s²), không phải v1.0, nên C-GOOD / C-GOOD2 / C-GOOD3 là TTC 3,0 / 2,0 / 1,8 s giữ giảm tốc 10; `<SIM>` là `carla-0.9.16-xosc9` (không còn `-xosc7`); máy test không chạy được CARLA nên các ca cần CARLA để Untested; chỉ tài khoản role MANAGER (MGR1) thêm được thành viên workspace; mã test thật xem bảng 5.3 của kế hoạch.
>
> Cột "Ca (sheet v6)" đã đổi sang mã của sheet (cập nhật 20/11/2026): mọi lớp EP, biên BVA và luật trong hai bảng quyết định đều có ca đã chạy, trừ EP-RR16, EP-RV19 và biên tiến độ 0 / total−1, luật R1, A5, `running_work = 1` (cần test đang chạy hoặc lỗi — chờ CARLA) và biên ngưỡng phanh oan (chờ Q12). Giá trị web không gửi được chạy ở tab `Server-API` (API-01 → API-52). Ghi chú "(web: …)" = giao diện chặn trước, đã kiểm trên web.

**Phạm vi so với unit test:**
- Biên ký tự điều khiển của tên project (C0 U+0000–U+001F, C1 U+007F–U+009F) và biên ngưỡng verdict
  (phanh oan ≤ 5 điểm %, trung vị TTC ≥ −0,1 s) đã kiểm đủ ở unit test (`ProjectServiceCreateBvaTest`, `RegressionSummarizerBvaTest`).
  Integration test không lặp lại các biên này.
- Biên ngưỡng verdict không kiểm lại ở integration vì CARLA không tất định, không dựng được tỉ lệ đúng bằng 5,00 điểm %.
  Integration chỉ kiểm ngưỡng mặc định được dùng (RC-18, RC-19) và một test trượt tiêu chí (RR-08, RT-043).
- Với điều kiện theo trạng thái (Accept, Adopt), dùng **bảng quyết định** thay cho BVA.


---

## 1. `POST /regression` và `GET /regression/preview` (tab RC)

### 1.1 Phân lớp tương đương

| Đầu vào | Mã | Lớp tương đương | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| `candidate_version_id` | EP-RC1 | Version `CANDIDATE` của project đang làm việc | V | Tạo test | RC-09, RC-20 |
| | EP-RC2 | Version `BASELINE` | I | 400 "chỉ version ở trạng thái CANDIDATE…" | RC-10 (web: không có trong danh sách) |
| | EP-RC3 | Version `REJECTED` | I | 400 như EP-RC2 | RC-11 (web) |
| | EP-RC4 | Version của project khác | I | 404 "candidate AEB version" | RC-12 (web) |
| | EP-RC5 | Id không tồn tại | I | 404 như EP-RC4 | API-30 |
| | EP-RC6 | Thiếu (null) | I | 400 `@NotNull` | API-31 |
| | EP-RC7 | Sai kiểu (`"abc"`) | I | 400 "Dữ liệu gửi lên không đúng định dạng" | API-32 |
| `scenario_id` | EP-RC8 | Họ thuộc project | V | Tạo test / preview | RC-01, RC-13 |
| | EP-RC9 | Họ của project khác | I | 404 "scenario family" | RC-14 (web) |
| | EP-RC10 | Id không tồn tại, `0`, `-1` | I | 404 "scenario family" | API-33 |
| | EP-RC11 | Thiếu | I | 400 `@NotNull` | API-34 |
| Bộ kịch bản (`variant_ids`, `include_old_critical`, `include_all_variants`) | EP-RC12 | Có `variant_ids` không rỗng, mọi id thuộc họ | V | mode `custom` | RC-05, RC-06 |
| | EP-RC13 | `variant_ids` có id trùng | V | Bỏ trùng, mỗi biến thể chạy 1 lần | API-35 |
| | EP-RC14 | `variant_ids = []` | I | 400 "tập biến thể chọn tay đang rỗng" | RC-04 (web: nút khoá) |
| | EP-RC15 | `variant_ids` có id không thuộc họ | I | 400 "biến thể không thuộc…" | API-10 |
| | EP-RC16 | Không `variant_ids`, cờ (`true`, `false`) | V | mode `old_critical` | API-36 |
| | EP-RC17 | Không `variant_ids`, cờ (`false`, `true`) hoặc (`true`, `true`) | V | mode `all_variants` | RC-01, RC-02 |
| | EP-RC18 | Không `variant_ids`, không gửi cờ | V | Mặc định (`true`, `true`) → `all_variants` | API-37 |
| | EP-RC19 | Không `variant_ids`, cờ (`false`, `false`) | I | 400 "chọn ít nhất một bộ kịch bản" | RC-03 (web: nút khoá) |
| | EP-RC20 | "Ca lỗi cũ" khi baseline không có ca lỗi | I | 400 "bộ kịch bản được chọn đang rỗng…" | API-38 |
| `name` | EP-RC21 | Không gửi hoặc `""` | V | Tên tự sinh "<baseline> → <candidate>" | RC-26 |
| | EP-RC22 | 1–150 ký tự có nội dung | V | Lưu nguyên | API-12 → API-14 |
| | EP-RC23 | Chỉ khoảng trắng `"   "` | I (mong muốn) | Mong muốn: tự sinh tên hoặc 400. Hiện tại: lưu tên toàn khoảng trắng (issue #21) | API-02 (Fail, #21) |
| | EP-RC24 | > 150 ký tự | I | 400 `@Size` | API-15 |
| `criteria` — khoá | EP-RC25 | Khoá thuộc 5 tiêu chí | V | Gộp với mặc định | RC-15 → RC-19 |
| | EP-RC26 | Khoá lạ | I | 400 "tiêu chí không tồn tại" | API-39 |
| | EP-RC27 | Giá trị của khoá là `null` | I | Mong muốn 400; hiện tại 500 (issue #1) | API-01 (Fail, #1) |
| `criteria` — `enabled` | EP-RC28 | `true` / `false` (boolean) | V | Lưu đúng (trừ tiêu chí bắt buộc luôn `true`) | RC-17 → RC-19 |
| | EP-RC29 | Không phải boolean (`"true"`, `1`) | I (mong muốn) | Mong muốn 400; hiện tại bị hiểu là `false`, tắt tiêu chí không báo (issue #22) | API-03 (Fail, #22) |
| `criteria` — `value` | EP-RC30 | Số trong miền hợp lệ | V | Lưu dạng số thực | RC-18, RC-19 |
| | EP-RC31 | Chuỗi (`"5"`) | I | 400 "value phải là một số" | API-40 |
| | EP-RC32 | Số ngoài miền hợp lệ (âm, quá lớn) | I (theo Q12) | Theo chốt Q12; hiện tại nhận (issue #2) | Chờ Q12 (quan sát: 1000 được nhận) |
| Vai trò | EP-RC33 | ADMIN / ENGINEER / EXPERIENCER | V | Tạo được | RC-20, RC-21, RC-25 |
| | EP-RC34 | REVIEWER thuộc workspace, có header | V | Tạo được (ADR-049) | RC-22 |
| | EP-RC35 | MANAGER | I | 403 | RC-23 (web: nút khoá) |
| | EP-RC36 | Chưa đăng nhập | I | 401 | RC-30 |
| Header `X-VehicSim-Project` (REVIEWER) | EP-RC37 | Id project thuộc workspace mình, ACTIVE | V | Dùng project đó | RC-22 |
| | EP-RC38 | Thiếu header | I | 400 "Cần chọn project…" | API-04 (Fail, #8) |
| | EP-RC39 | Không phải số dương (`abc`, `0`, `-1`) | I | 400 "Mã project không hợp lệ" | API-21 |
| | EP-RC40 | Project ngoài workspace | I | 404 | RC-24 |
| | EP-RC41 | Project/workspace lưu trữ | I | 400 "…đã lưu trữ, chỉ được xem lịch sử" | RV-28 (phía quyết định) |

### 1.2 Giá trị biên

| Đầu vào | Biên | Giá trị (vị trí) | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| Số phần tử `variant_ids` (tạo test) | min = 1 | 0 (min−1) | I | 400 "tập biến thể chọn tay đang rỗng" | RC-04 (web: nút khoá) |
| | | 1 (min) | V | Tạo test 1 biến thể | RC-05, RC-20 |
| | | 2 (min+1) | V | Tạo test 2 biến thể | RC-06, RC-25 |
| | max = 300 | 300 (max) | V về độ dài | Qua kiểm `@Size`, bị chặn ở bước nghiệp vụ vì id không thuộc họ | API-29 |
| | | 301 (max+1) | I | 400 `@Size(max=300)` | API-16 |
| Số phần tử `variant_ids` (preview) | max = 300 | 300 (max) | V về độ dài | Lỗi "không thuộc họ", không phải lỗi 300 | API-10 |
| | | 301 (max+1) | I | 400 "variant_ids tối đa 300 biến thể" | API-09 |
| | min = 1 | 1 (min) | V | `selected_count = 1` | RC-05 |
| Độ dài `name` | min = 1 | 0 (`""`, min−1) | V (tên tự sinh) | Tên tự sinh | RC-26 |
| | | 1 (min) | V | Lưu 1 ký tự | API-12 |
| | max = 150 | 149 (max−1) | V | Lưu | API-13 |
| | | 150 (max) | V | Lưu đủ 150 ký tự tiếng Việt | API-14 |
| | | 151 (max+1) | I | 400 | API-15 |
| `false_activation_increase_max_pts` (giả định miền [0; 5] theo Q12) | min = 0 | −0,01 (min−1) | I | Theo Q12 | Chờ Q12 |
| | | 0 (min) | V | Lưu `0.0` | Chờ Q12 |
| | max = 5 | 5 (max) | V | Lưu `5.0` (mặc định ADR-044) | RC-18 (mặc định 5) |
| | | 5,01 (max+1) | I | Theo Q12 | Chờ Q12 |
| Header REVIEWER | min = 1 | 0 (min−1), −1 | I | 400 "Mã project không hợp lệ" | API-21 |
| Hạn mức ghi (30/cửa sổ) | max = 30 | lần 30 (max) | V về hạn mức | Không bị 429 | API-28 (đo trên tạo project) |
| | | lần 31 (max+1) | I | 429 | API-28 |

---

## 2. Kết quả regression (tab RR)

### 2.1 Phân lớp tương đương

| Đầu vào | Mã | Lớp tương đương | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| `status` (lọc) | EP-RR1 | `RUNNING`, `PASSED`, `FAILED`, `ERROR` | V | Lọc đúng | RR-06 → RR-09 |
| | EP-RR2 | Không gửi | V | Toàn bộ | RR-01, RR-10 |
| | EP-RR3 | Giá trị lạ (`abc`) | V (không lỗi) | `items = []` | API-41 |
| `testId` | EP-RR4 | Test thuộc project | V | 200 | RR-01 |
| | EP-RR5 | Test của project khác | I | 404 | RR-24 |
| | EP-RR6 | Id không tồn tại | I | 404 | RR-23 |
| | EP-RR7 | `0`, `-1` | I | 404 | RR-26 |
| | EP-RR8 | Sai kiểu (`abc`) | I | 400 "Yêu cầu không hợp lệ" | RR-25 |
| Trạng thái run của test | EP-RR9 | Còn run chờ/chạy | V | Test `RUNNING` | RR-11, RR-12 (Untested, cần CARLA) |
| | EP-RR10 | Mọi run `COMPLETED` | V | Test `COMPLETED`, có verdict | RR-13 |
| | EP-RR11 | Có run `FAILED`/`STOPPED` | V | Test `FAILED` (ERROR), không khuyến nghị | RR-14 (Untested, cần CARLA) |
| Verdict | EP-RR12 | Mọi tiêu chí đạt | V | `PASSED` | RR-01 (RT-035) |
| | EP-RR13 | Không đạt, có ca xấu đi | V | `REGRESSED` | RR-13 (RT-042) |
| | EP-RR14 | Không đạt, không có ca xấu đi | V | `FAILED` | RR-08 (RT-043) |
| Xuất gói | EP-RR15 | Test `COMPLETED` | V | Tải được JSON/CSV | RR-19, RR-20 |
| | EP-RR16 | Test `RUNNING` hoặc lỗi | I | 400 "…chưa xuất được gói kết quả" | Chưa chạy (cần test đang chạy hoặc lỗi, CARLA) |
| Loại project | EP-RR17 | Project thuộc workspace | V | Có khuyến nghị | RV-15 |
| | EP-RR18 | Project cá nhân | V | Không có khuyến nghị | RR-27 |

### 2.2 Giá trị biên

| Đầu vào | Biên | Giá trị (vị trí) | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| Số run đã xong / tổng (test 3 cặp) | chốt khi done = total | 0 (min) | V | `RUNNING`, `progress.done = 0` | RR-11 (Untested, cần CARLA) |
| | | total − 1 (max−1) | V | Vẫn `RUNNING`, chưa có verdict | RR-12 (Untested, cần CARLA) |
| | | total (max) | V | `COMPLETED`, có verdict và khuyến nghị | RR-13 |
| Số cặp trong test | min = 1 | 1 (min) | V | Tính tỉ lệ trên 1 cặp (0 % hoặc 100 %) | RR-20 (RT-036 / RT-043, 1 cặp) |
| Ngưỡng verdict | — | Đã kiểm ở unit test `RegressionSummarizerBvaTest` | — | — | — |

---

## 3. Quyết định của Reviewer (tab RV)

### 3.1 Phân lớp tương đương

| Đầu vào | Mã | Lớp tương đương | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| `decision` | EP-RV1 | `ACCEPT` | V | Đổi baseline | RV-33 |
| | EP-RV2 | `REJECT` | V | Candidate `REJECTED` | RV-32, RV-37 |
| | EP-RV3 | `REQUEST_MORE_TESTS` | V | `MORE_TESTS_REQUESTED`, chưa đóng | RV-07 |
| | EP-RV4 | Giá trị lạ (`APPROVE`) | I | 400 "decision phải thuộc…" | API-42 |
| | EP-RV5 | Sai hoa thường (`accept`) | I | 400 như EP-RV4 | API-43 |
| | EP-RV6 | Rỗng, chỉ khoảng trắng, null | I | 400 `@NotBlank` | RV-03 (web: nút khoá) |
| | EP-RV7 | Có khoảng trắng hai đầu (`" ACCEPT "`) | I | 400 "decision phải thuộc…" | API-44 |
| `reason` | EP-RV8 | 1–4000 ký tự có nội dung | V | Lưu đã cắt khoảng trắng hai đầu | RV-08 → RV-10 |
| | EP-RV9 | Rỗng, chỉ khoảng trắng, null | I | 400 `@NotBlank` | RV-04, RV-05, API-05 |
| | EP-RV10 | > 4000 ký tự | I | 400 `@Size` | RV-11, API-06 |
| `conditions` | EP-RV11 | null, rỗng, chỉ khoảng trắng | V | Lưu NULL | RV-12 |
| | EP-RV12 | 1–4000 ký tự | V | Lưu đã cắt | RV-13 |
| | EP-RV13 | > 4000 ký tự | I | 400 `@Size` | RV-14, API-11 |
| `confirmed` | EP-RV14 | `true` | V | Cho quyết định | RV-07 |
| | EP-RV15 | `false` | I | 400 "phải xác nhận…" | RV-06, API-07 |
| | EP-RV16 | Thiếu | I | 400 `@NotNull` | API-45 |
| `testId` | EP-RV17 | Test có khuyến nghị trong project | V | Xử lý | RV-15 |
| | EP-RV18 | Không tồn tại | I | 404 "regression test" | RV-27 |
| | EP-RV19 | Test lỗi mô phỏng (không có khuyến nghị) | I | 400 "…không có khuyến nghị để duyệt" | Chưa chạy (cần test lỗi, CARLA) |
| Vai trò | EP-RV20 | REVIEWER thuộc workspace, không phải người tạo | V | Quyết định được | RV-07 |
| | EP-RV21 | REVIEWER là người tạo test | I | 400 "người tạo khuyến nghị không tự duyệt được" | RV-26 |
| | EP-RV22 | REVIEWER ngoài workspace | I | 404 | RV-19 |
| | EP-RV23 | ENGINEER / ADMIN / MANAGER / EXPERIENCER | I | 403 | RV-16 → RV-18, RV-20 |
| | EP-RV24 | Chưa đăng nhập | I | 401 | RV-29, RV-30 |

### 3.2 Giá trị biên

| Đầu vào | Biên | Giá trị (vị trí) | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| Độ dài `reason` (sau khi cắt) | min = 1 | 0 (`"   "`, min−1) | I | 400 | RV-05 |
| | | 1 (min, gửi `"  x  "`) | V | Lưu `"x"` | RV-08 |
| | max = 4000 | 3999 (max−1) | V | Lưu | RV-09 |
| | | 4000 (max) | V | Lưu đủ 4000 | RV-10 |
| | | 4001 (max+1) | I | 400 | RV-11, API-06 |
| Độ dài `conditions` | max = 4000 | 4000 (max) | V | Lưu | RV-13 |
| | | 4001 (max+1) | I | 400 | RV-14, API-11 |

### 3.3 Bảng quyết định cho Accept / Reject

Điều kiện kiểm theo thứ tự trong `ReviewDecisionService`. "—" = không xét.

| Luật | Test xong | Có khuyến nghị | Khuyến nghị chưa đóng | Không phải người tạo | Verdict PASSED | Candidate còn CANDIDATE | Baseline lúc chạy còn hiện hành | Quyết định | Kết quả | Ca (sheet v6) |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Không | — | — | — | — | — | — | Bất kỳ | 400 chưa chạy xong | RV-25 (Untested, cần CARLA) |
| R2 | Có | Không | — | — | — | — | — | Bất kỳ | 400 không có khuyến nghị | RR-27 |
| R3 | Có | Có | Không | — | — | — | — | Bất kỳ | 400 đã có quyết định cuối | RV-36 |
| R4 | Có | Có | Có | Không | — | — | — | Bất kỳ | 400 không tự duyệt | RV-26 |
| R5 | Có | Có | Có | Có | Không | — | — | ACCEPT | 400 chưa qua regression | RV-31 |
| R6 | Có | Có | Có | Có | Không | Có | — | REJECT | 200, candidate REJECTED | RV-32 |
| R7 | Có | Có | Có | Có | Có | Không | — | ACCEPT/REJECT | 400 candidate đã quyết định ở test khác | RV-35 |
| R8 | Có | Có | Có | Có | Có | Có | Không | ACCEPT | 400 baseline đã đổi | RV-34 |
| R9 | Có | Có | Có | Có | Có | Có | Không | REJECT | 200 (Reject vẫn hợp lệ) | RV-37 |
| R10 | Có | Có | Có | Có | Có | Có | Có | ACCEPT | 200, đổi baseline | RV-33 |
| R11 | Có | Có | Có | Có | — | — | — | REQUEST_MORE_TESTS | 200, chưa đóng | RV-07 → RV-13 |
| R12 | Có | Có | Có (đang MORE_TESTS_REQUESTED) | Có | — | Có | — | REJECT | 200 | RV-37 |

---

## 4. Project cá nhân (tab PM)

### 4.1 Phân lớp tương đương

| Đầu vào | Mã | Lớp tương đương | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| `name` | EP-PM1 | null, `""`, chỉ khoảng trắng | I | 400 `NAME_REQUIRED` | PM-02, PM-03 |
| | EP-PM2 | 1–150 ký tự, không ký tự điều khiển, chưa dùng | V | Tạo | PM-04 → PM-07, PM-10 |
| | EP-PM3 | Khoảng trắng ở hai đầu | V | Lưu tên đã cắt | PM-09, API-25 |
| | EP-PM4 | > 150 ký tự | I | 400 `NAME_TOO_LONG` | PM-08 (web: ô dừng ở 150) |
| | EP-PM5 | Có ký tự điều khiển C0/C1 | I | 400 `NAME_INVALID` | Unit test `ProjectServiceCreateBvaTest` |
| | EP-PM6 | Trùng tên project của chính mình | I | 409 `NAME_DUPLICATE` | PM-12, PM-13, PM-46 |
| | EP-PM7 | Trùng tên khác hoa thường | Ghi nhận | Theo collation | Chờ Q12 |
| | EP-PM8 | Trùng tên project của người khác | V | Tạo | PM-14 |
| `description` | EP-PM9 | null, rỗng, chỉ khoảng trắng | V | Lưu NULL | PM-19, PM-20 |
| | EP-PM10 | 1–2000 ký tự | V | Lưu | PM-21 → PM-23 |
| | EP-PM11 | > 2000 ký tự | I | 400 `DESCRIPTION_TOO_LONG` | PM-24, PM-25 |
| `carla_vehicle_model_id` | EP-PM12 | null | V | Xe mặc định e-tron | PM-26 (web chọn sẵn e-tron) |
| | EP-PM13 | Xe có `is_supported = TRUE` | V | Dùng xe đó | PM-27 → PM-29 |
| | EP-PM14 | Xe có trong danh mục nhưng `is_supported = FALSE` (`vehicle.carlamotors.european_hgv`) | I | 400 `VEHICLE_NOT_FOUND` | PM-30 (web: không hiện xe tải), API-46 |
| | EP-PM15 | Id không tồn tại, `0`, `-1` | I | 400 `VEHICLE_NOT_FOUND` | API-46 |
| | EP-PM16 | Sai kiểu (`"abc"`) | I | 400 "Dữ liệu gửi lên không đúng định dạng" | API-47 |
| PATCH — trường không gửi | EP-PM17 | `name`/`description`/xe = null | V | Giữ giá trị cũ | PM-47, PM-48 |
| | EP-PM18 | `description = ""` | V | Xoá mô tả (NULL) | PM-48 |
| `status` (danh sách) | EP-PM19 | `ACTIVE`, `ARCHIVED` | V | Lọc | PM-41, PM-52 |
| | EP-PM20 | Giá trị khác, chữ thường | I | 400 | API-48 |
| `q` | EP-PM21 | Rỗng | V | Toàn bộ | PM-40 |
| | EP-PM22 | Một phần tên | V | Lọc | PM-34 |
| | EP-PM23 | Có `%`, `_`, `\` | V | Hiểu theo nghĩa đen | PM-37, PM-38 |
| | EP-PM24 | Khoảng trắng hai đầu | V | Cắt rồi tìm | PM-36 |
| | EP-PM25 | Không khớp | V | `items = []` | PM-39 |
| `page` | EP-PM26 | ≥ 1, trong số trang | V | Trả trang | PM-42, PM-43 |
| | EP-PM27 | ≥ 1, vượt trang cuối | V | `items = []` | API-49 |
| | EP-PM28 | ≤ 0 | I | 400 | API-17 |
| | EP-PM29 | Sai kiểu (`abc`) | I | 400 "Yêu cầu không hợp lệ" | API-50 |
| `confirm_name` (xoá) | EP-PM30 | Đúng tên | V | Xoá | PM-60 |
| | EP-PM31 | Đúng tên kèm khoảng trắng hai đầu | V | Xoá (được cắt) | PM-59 |
| | EP-PM32 | Sai tên, khác hoa thường, rỗng | I | 400 `CONFIRM_NAME_MISMATCH` | PM-56 → PM-58 |
| | EP-PM33 | Thiếu body | I | 400 "Dữ liệu gửi lên không đúng định dạng" | API-51 |
| Header `X-VehicSim-Project` (EXPERIENCER) | EP-PM34 | Project của mình, ACTIVE | V | Dùng project đó | PM-01, PM-44 |
| | EP-PM35 | Thiếu | Theo Q12 | Hiện tại: project ACTIVE mới nhất | Chờ Q12 |
| | EP-PM36 | Project của mình, ARCHIVED | I | 409 `PROJECT_ARCHIVED` | PM-54 (web) |
| | EP-PM37 | Project người khác hoặc project nhóm | I | 403 `PROJECT_NOT_YOURS` | PM-62, PM-64 |
| | EP-PM38 | Không phải số, `0`, `-1`, không tồn tại | I | 404 `PROJECT_NOT_FOUND` | PM-63 |
| Vai trò | EP-PM39 | EXPERIENCER chủ project | V | Ghi được | PM-65 |
| | EP-PM40 | Role khác | I | 403 `EXPERIENCER_ONLY` | PM-66 → PM-69 |
| | EP-PM41 | Chủ project đã đổi role | V xem / I ghi | Xem 200, ghi 403 | PM-70 |

### 4.2 Giá trị biên

| Đầu vào | Biên | Giá trị (vị trí) | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| Độ dài `name` (sau khi cắt, đếm code point) | min = 1 | 0 (`"   "`, min−1) | I | `NAME_REQUIRED` | PM-03 |
| | | 1 (min) | V | Tạo | PM-04 |
| | | 2 (min+1) | V | Tạo | PM-05 |
| | max = 150 | 149 (max−1) | V | Tạo | PM-06 |
| | | 150 (max, tiếng Việt) | V | Tạo, DB lưu đủ | PM-07 |
| | | 150 (max, emoji) | V | Tạo, DB lưu đủ | PM-11 (Fail, #27) |
| | | 151 (max+1) | I | `NAME_TOO_LONG` | PM-08 |
| | cắt trước khi đếm | 154 ký tự thô = 150 sau khi cắt | V | Tạo 150 ký tự | API-25 |
| Ký tự điều khiển | C0 max = U+001F | U+001F | I | `NAME_INVALID` | Unit test |
| | | U+0020 (max+1) | V | Tạo | Unit test |
| | C1 min = U+007F | U+007E (min−1) | V | Tạo | Unit test |
| | | U+007F (min) | I | `NAME_INVALID` | Unit test |
| Độ dài `description` | min lưu = 1 | 0 (`"   "`) | V | Lưu NULL | PM-20 |
| | | 1 (min) | V | Lưu | PM-21 |
| | max = 2000 | 1999 (max−1) | V | Lưu | PM-22 |
| | | 2000 (max) | V | Lưu | PM-23 |
| | | 2001 (max+1) | I | `DESCRIPTION_TOO_LONG` | PM-24 |
| `page` | min = 1 | 0 (min−1), −1 | I | 400 | API-17 |
| | | 1 (min) | V | Trang 1 | PM-43 |
| | | 2 (min+1) | V | Trang 2 | PM-43 |
| `page_size` | min = 1 | 0 (min−1) | I | 400 | API-18 |
| | | 1 (min) | V | 1 mục | API-19 |
| | | 2 (min+1) | V | 2 mục | API-19 |
| | max = 50 | 49 (max−1) | V | Tối đa 49 mục | API-19 |
| | | 50 (max) | V | Tối đa 50 mục | API-19 |
| | | 51 (max+1) | I | 400 | API-20 |
| `run_count` khi đổi xe | khoá khi ≥ 1 | 0 | V | Đổi được | PM-49 |
| | | 1 | I | 409 `VEHICLE_LOCKED` "đã có 1 lượt chạy" | PM-50 |
| `running_work` khi lưu trữ/xoá | chặn khi ≥ 1 | 0 | V | Lưu trữ được | PM-52 |
| | | 1 | I | 409 `PROJECT_BUSY` "còn 1 việc" | PM-53 (Untested, cần CARLA) |
| Hạn mức ghi | max = 30 | lần 30 / lần 31 | V / I | 400 nghiệp vụ / 429 | API-28 |

---

## 5. Hành trình và Adopt (tab PJ)

### 5.1 Phân lớp tương đương

| Đầu vào | Mã | Lớp tương đương | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| `reason` | EP-PJ1 | Có nội dung | V | Ghi chú "…: <lý do đã cắt>" | PJ-15, PJ-20 |
| | EP-PJ2 | null, rỗng, chỉ khoảng trắng | I | 400 `REASON_REQUIRED` | PJ-14 (web: nút khoá) |
| | EP-PJ3 | Quá dài so với cột `notes` (TEXT) | I (mong muốn) | Mong muốn 400 có giới hạn; hiện tại không giới hạn ở API (issue #23) | PJ-21 (Fail, #23) |
| `confirmed` | EP-PJ4 | `true` | V | Cho Adopt | PJ-15 |
| | EP-PJ5 | `false`, thiếu | I | 400 `CONFIRM_REQUIRED` | PJ-14 (web: nút khoá; server luôn nhận `true`, #12) |
| `testId` | EP-PJ6 | Test của project | V | Xét tiếp | PJ-15 |
| | EP-PJ7 | Test project khác, không tồn tại, `0`, `-1` | I | 404 `TEST_NOT_FOUND` | PJ-13 (`0`), API-52 (test của project khác) |
| | EP-PJ8 | Sai kiểu (`abc`) | I | 400 "Yêu cầu không hợp lệ" | PJ-12 |
| Vai trò / chủ | EP-PJ9 | Chủ project EXPERIENCER | V | Adopt | PJ-15 |
| | EP-PJ10 | EXPERIENCER khác | I | 403 `PROJECT_NOT_YOURS` | PJ-11 |
| | EP-PJ11 | Role khác | I | 403 `EXPERIENCER_ONLY` | PM-70 |

### 5.2 Giá trị biên

| Đầu vào | Biên | Giá trị (vị trí) | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| Độ dài `reason` sau khi cắt | min = 1 | 0 (`"   "`) | I | `REASON_REQUIRED` | PJ-14 (web: nút khoá) |
| | | 1 (`" x "`) | V | Ghi chú kết thúc bằng ": x" | PJ-20 |
| | max = giới hạn cột TEXT (65 535 byte) | 70 000 ký tự ASCII (vượt) | I | Mong muốn 400; ghi nhận thực tế | PJ-21 (Fail, #23) |
| `round` | — | 1 → 2 sau Adopt | V | `round` tăng 1 | PJ-15 |

### 5.3 Bảng quyết định cho Adopt

| Luật | Project ACTIVE | Có lý do | Đã xác nhận | Test thuộc project | Test xong | Verdict PASSED | Candidate còn CANDIDATE | Baseline còn hiện hành | Kết quả | Ca (sheet v6) |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Không | — | — | — | — | — | — | — | 409 `PROJECT_ARCHIVED` | PJ-19, API-26 |
| A2 | Có | Không | — | — | — | — | — | — | 400 `REASON_REQUIRED` | PJ-14 (web) |
| A3 | Có | Có | Không | — | — | — | — | — | 400 `CONFIRM_REQUIRED` | PJ-14 (web) |
| A4 | Có | Có | Có | Không | — | — | — | — | 404 `TEST_NOT_FOUND` | PJ-12, PJ-13 |
| A5 | Có | Có | Có | Có | Không | — | — | — | 409 `TEST_NOT_FINISHED` | Untested (cần run đang chạy) |
| A6 | Có | Có | Có | Có | Có | Không | — | — | 409 `TEST_NOT_PASSED` | PJ-17 |
| A7 | Có | Có | Có | Có | Có | Có | Không | — | 409 `CANDIDATE_ALREADY_DECIDED` | API-27 |
| A8 | Có | Có | Có | Có | Có | Có | Có | Không | 409 `BASELINE_CHANGED` | PJ-16 |
| A9 | Có | Có | Có | Có | Có | Có | Có | Có | 200, đổi baseline | PJ-15, PJ-20 |

---

## 6. Thời tiết và ma sát (tab CW)

| Đầu vào | Mã | Lớp tương đương | Loại | Kết quả mong đợi | Ca (sheet v6) |
|---|---|---|---|---|---|
| `weathers` | EP-CW1 | `CLEAR`, `CLOUDY`, `FOG` | V | μ = 1,0 | CW-01 → CW-04, CW-07 |
| | EP-CW2 | `RAIN` | V | μ = 0,65 | CW-01, CW-05 (Fail, #24) |
| | EP-CW3 | `HEAVY_RAIN` | V | μ = 0,55 | CW-02, CW-06 |
| | EP-CW4 | Giá trị lạ (`SNOW`), chữ thường (`rain`) | I | 400 "weathers phải thuộc [CLEAR, CLOUDY, RAIN, HEAVY_RAIN, FOG]" | API-22 |
| | EP-CW5 | Danh sách rỗng | I | 400 `@Size(min=1)` | CW-12, API-23 |
| `times_of_day` | EP-CW6 | `DAY`, `DUSK`, `NIGHT` | V | Mặt trời 45° / 15° / −90° | CW-03, CW-08, CW-09 |
| | EP-CW7 | Giá trị lạ (`MORNING`) | I | 400 "times_of_day phải thuộc [DAY, DUSK, NIGHT]" | API-24 |

---

## 7. Kết quả rà soát

| Hạng mục | Trước khi rà | Sau khi rà |
|---|---|---|
| Bảng EP | Chưa có; lớp chỉ ngầm trong từng ca | Có bảng cho 6 nhóm đầu vào, mỗi lớp trỏ tới ca |
| BVA | Chủ yếu max và max+1 (tên 150/151, mô tả 2000/2001, lý do 4000/4001, 300/301 biến thể, `page_size` 0/50/51) | Đủ min−1, min, min+1, max−1, max, max+1 cho tên, mô tả, lý do, điều kiện, `variant_ids`, `page`, `page_size`; thêm biên `run_count` và `running_work` |
| Điều kiện theo trạng thái | Rải rác trong các ca | Bảng quyết định cho Accept/Reject (12 luật) và Adopt (9 luật) |
| Ca thêm mới | — | RC-39 → RC-46, RR-24 → RR-25, RV-31 → RV-34, PM-41 → PM-52, PJ-22 → PJ-23, CW-09 (29 ca) |
| Áp vào sheet v6 (20/11/2026) | — | Cột "Ca" đổi sang mã sheet; thêm RV-37, PJ-19 → PJ-21, CW-12 và API-11 → API-52 để phủ các lớp/biên còn thiếu; còn 2 lớp EP, 4 biên/luật chờ CARLA và biên ngưỡng chờ Q12 |
| Lỗi mới phát hiện | — | #21 tên regression chỉ khoảng trắng được lưu; #22 `enabled` không phải boolean bị hiểu là tắt tiêu chí; #23 lý do Adopt không giới hạn độ dài (đã xác nhận ở PJ-21) |
