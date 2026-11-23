# Kế hoạch integration test và danh sách issue — phần Người 5 và code của TuDM

**Trạng thái (20/11/2026):** đã chạy đợt 1 trên app thật, kết quả ghi ở `docs/Integration-Test_VSOS_TuDM_v6.xlsx`
(249 ca: 225 Pass, 12 Fail, 12 Untested). Máy test không chạy được CARLA nên 12 ca Untested chờ máy chạy được CARLA (mục 0.3). Chưa tạo GitHub issue (Q10). Người làm, deadline theo GitHub Issues/Project.

Phạm vi chỉ gồm module của Người 5 (Regression, Duyệt khuyến nghị) và code của TuDM (Project cá nhân, Hành trình/Adopt, thời tiết trong `.xosc`).

## 0. Kết quả đợt 1 (20/11/2026)

### 0.1 Theo tab

| Tab sheet | Module | Tổng | Pass | Fail | Untested |
|---|---|---|---|---|---|
| `Regression-Create` (RC) | Người 5 | 30 | 30 | 0 | 0 |
| `Regression-Result` (RR) | Người 5 | 27 | 22 | 1 | 4 |
| `Review-Decision` (RV) | Người 5 | 37 | 36 | 0 | 1 |
| `Project-Manage` (PM) | TuDM | 70 | 65 | 3 | 2 |
| `Project-Journey` (PJ) | TuDM | 21 | 17 | 1 | 3 |
| `CARLA-Weather` (CW) | TuDM | 12 | 9 | 1 | 2 |
| `Server-API` (API) | Người 5 + TuDM | 52 | 46 | 6 | 0 |
| **Tổng** | | **249** | **225** | **12** | **12** |

Ca mới thêm trong đợt này (từ tab `Pending` của v5): RV-31 → RV-36 (chặn Chấp nhận khi test không đạt, Từ chối, Chấp nhận, baseline đã đổi,
ứng viên đã được quyết định, khuyến nghị đã chốt), PJ-14 → PJ-18 (hộp thoại "Dùng làm baseline", vòng 2, BASELINE_CHANGED, TEST_NOT_PASSED)
và tab `Server-API` (integration mức API, mục 0.4).
Để phủ đủ bảng EP/BVA và bảng quyết định trong [ep-bva.md](2026-11-17-integration-test/ep-bva.md) thêm RV-37 (luật R9, R12), PJ-19 → PJ-21
(A1, lý do Adopt `" x "` và 70 000 ký tự), CW-12 (bỏ hết thời tiết) và API-11 → API-52; cột "Ca" của `ep-bva.md` đã đổi sang mã sheet.

### 0.2 Ca Fail

| Ca | Quan sát | Issue |
|---|---|---|
| RR-22 | Màn chi tiết regression của project nhóm (RT-035) không có câu "Kết quả mô phỏng, không phải chứng nhận an toàn."; cần kiểm lại khi chạy CARLA | #25 |
| PM-11 | Dán 150 emoji 🚗 vào "Tên project": ô dừng ở 75 emoji, bộ đếm "75 / 150" | #27 |
| PM-59, PM-60 | Xoá từ "Cài đặt project" xoá được (GET trả 404) nhưng không hiện "Đã xoá “…”." | #26 |
| CW-05 | `.xosc` tải ở màn mô tả ghi ma sát mưa 0,7; họ kịch bản và run dùng 0,65 | #24 |
| PJ-21 | Dán lý do Adopt 70 000 ký tự: nhận "Dữ liệu bị trùng hoặc vi phạm ràng buộc. Hãy tải lại trang rồi thử lại." (sai nghĩa) | #23 |
| API-01 | `criteria` có mục `null` → HTTP 500 | #1 |
| API-02 | Tên regression `"   "` được lưu nguyên | #21 |
| API-03 | `"enabled": "true"` (chuỗi) tắt tiêu chí, không báo lỗi | #22 |
| API-04 | Reviewer tạo test thiếu header nhận câu "…trước khi quyết định…" | #8 |
| API-05, API-06 | Lỗi validation lý do quyết định bằng tiếng Anh | #9 |

### 0.3 Ca Untested và lý do

| Ca | Lý do |
|---|---|
| RR-11, RR-12, RV-25, PM-53, PM-61, PJ-03, PJ-07 | Cần test/run **đang chạy**; trên máy test không giữ được run ở trạng thái này, chờ chạy CARLA |
| RR-14, RR-15, PJ-04, CW-10, CW-11 | Ca riêng của CARLA (tắt CARLA giữa chừng, ảnh camera, cảnh báo CARLA) |

Ca có bước "trạng thái tạm thời" nhưng điều kiện chính vẫn kiểm được (RC-20, RC-25, RC-26, RR-13, PJ-10) ghi **Pass** kèm câu
"không quan sát được trạng thái đang chạy" trong Actual Result; khi chạy lại bằng CARLA cần xem lại phần này.

### 0.4 Tab `Server-API` — integration mức API

Cùng app, backend và DB thật như các tab khác, nhưng gửi request thẳng vào API (Swagger/curl, token của tài khoản test) với những giá trị
giao diện chặn trước khi gửi. Mục đích: kiểm backend tự bảo vệ dữ liệu khi request không đến từ web (client khác, người cố tình gửi).

| Ca | Gửi lên | Kết quả | Status |
|---|---|---|---|
| API-01 | `POST /regression` với `criteria = {"no_new_collision": null}` | HTTP 500 "Lỗi hệ thống. Vui lòng thử lại sau." (#1) | Fail |
| API-02 | `POST /regression` với `name = "   "` | 201, tên lưu nguyên `"   "` (RT-048, #21) | Fail |
| API-03 | `POST /regression` với `{"collision_rate_not_increase": {"enabled": "true"}}` | 201, tiêu chí bị tắt (RT-049, #22) | Fail |
| API-04 | REV1 `POST /regression` thiếu `X-VehicSim-Project` | 400 "Cần chọn project trước khi quyết định; hãy tải lại trang" (#8) | Fail |
| API-05, API-06 | Quyết định với lý do rỗng / 4001 ký tự | 400 "must not be blank" / "size must be between 0 and 4000" (#9) | Fail |
| API-07 | Quyết định với `confirmed = false` | 400 "phải xác nhận quyết định dựa trên bằng chứng mô phỏng" | Pass |
| API-08 | REV2 quyết định thiếu `X-VehicSim-Project` | 400 "Cần chọn project trước khi quyết định; hãy tải lại trang" (ADR-049) | Pass |
| API-09, API-10 | `GET /regression/preview` với 301 / 300 `variant_ids` | 400 "variant_ids tối đa 300 biến thể" / lỗi "không thuộc bộ biến thể…" | Pass |

| API-11 | Quyết định với điều kiện 4001 ký tự | 400 "size must be between 0 and 4000" (tiếng Anh, #9) | Pass |
| API-12 → API-15 | Tên regression 1 / 149 / 150 / 151 ký tự | 201 lưu đúng / 400 với 151 | Pass |
| API-16, API-29 | Tạo test với 301 / 300 biến thể | 400 `@Size` / qua giới hạn, dừng ở luật "không thuộc họ" | Pass |
| API-17 → API-20 | `page` 0, −1; `page_size` 0, 1, 2, 49, 50, 51 | 400 ngoài miền, 200 trong miền | Pass |
| API-21 | Header Reviewer 0 / −1 | 400 "Mã project không hợp lệ" | Pass |
| API-22 → API-24 | Thời tiết `SNOW`, `rain`, danh sách rỗng; thời điểm `MORNING` | 400 | Pass |
| API-25 | Tên project 154 ký tự thô (2 khoảng trắng mỗi đầu) | 201, lưu 150 ký tự | Pass |
| API-26, API-27 | Adopt trong project lưu trữ / ứng viên đã xử lý | 409 `PROJECT_ARCHIVED` / `CANDIDATE_ALREADY_DECIDED` | Pass |
| API-28 | 31 lần tạo project liên tiếp với hạn mức mặc định 30 | 1–30: 201; lần 31: 429 "Thao tác quá nhiều lần, thử lại sau ít phút" | Pass |
| API-30 → API-40 | Các lớp EP của `POST /regression`: id không tồn tại, null, sai kiểu, id trùng, chế độ bộ kịch bản, khoá/giá trị tiêu chí lạ | Đúng như bảng EP | Pass |
| API-41 → API-52 | Lọc trạng thái lạ, quyết định sai giá trị / thiếu xác nhận, xe không hỗ trợ / sai kiểu, `status`/`page` sai, xoá thiếu body, Adopt test của project khác | Đúng như bảng EP | Pass |

Một số ca Pass trả thông điệp mặc định tiếng Anh ("must not be null", "size must be between …"), ghi chú thuộc #9.
Quan sát ngoài sheet (chờ Q12, chưa có Expected): `false_activation_increase_max_pts = 1000` được nhận (RT-050, #2).

## 1. Phạm vi

Integration test kiểm cả chuỗi **giao diện → Controller → Service → MySQL/Redis → bộ mô phỏng** trên app chạy thật, không mock.
Unit test đã có cho `ProjectService.create` và `RegressionSummarizer.summarize` (Report5.1), nên phần này tập trung vào điểm nối,
phân quyền, trạng thái DB và luồng xuyên màn.

| Nhóm | Code (tác giả chính theo git) | Màn hình | API (tiền tố `/api/v1/vehicsim`) |
|---|---|---|---|
| A. Regression (Người 5) | `RegressionController`, `RegressionService`, `RegressionSummarizer`, `RegressionCriteria`, `RegressionReportService`, `RegressionViewService`, `RegressionRepository` | `/validation/regression`, `/regression/new`, `/regression/[testId]` | `GET /regression`, `GET /regression/preview`, `POST /regression`, `GET /regression/{id}`, `GET /regression/{id}/export.json`, `GET /regression/{id}/export.csv` |
| B. Phê duyệt (Người 5) | `ReviewDecisionService` và phần recommendation của controller | `/validation/recommendations`, `/[testId]`, `/[testId]/review`, `/validation/decisions` | `GET /recommendations`, `GET /recommendations/{id}`, `POST /recommendations/{id}/decision`, `GET /decisions` |
| C. Project cá nhân (TuDM) | `ProjectController`, `ProjectService`, `ProjectRepository`, `ProjectScope`, `ProjectError` | `/projects`, `/projects/new`, `/projects/[id]/settings` | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`, `POST /projects/{id}/archive`, `/unarchive`, `GET /projects/vehicle-options` |
| D. Hành trình và tự chọn baseline (TuDM, [ADR-046](../../adr/ADR-046-experiencer-tu-chon-baseline-trong-project-ca-nhan.md)) | `ProjectService.journey/adopt` | `/projects/[id]`, `/start`, `/rounds/[testId]` | `GET /projects/{id}/journey`, `POST /projects/{id}/regressions/{testId}/adopt` |
| E. Thời tiết trong `.xosc` (TuDM) | `XoscExport` (thời tiết theo preset), `Vs.WEATHER_FRICTION` | Tạo họ, tải `.xosc` ở màn mô tả | `POST /families`, `POST /scenarios/xosc`, `GET /runs/{id}/xosc` |

Không kiểm như đối tượng chính: entity/enum, `ReviewerScope`, `ProjectAccess` (trungdam viết); chúng chỉ là điều kiện tiền đề.
Phạm vi Người 5 theo [phân chia 5 thành viên](../../vehicsim/phan-chia-cong-viec-5-thanh-vien.md), mục 7.

**Nguồn test case:** sheet `Integration-Test_VSOS_TuDM_v6.xlsx` là bản đã chạy (bước thao tác trên web, mã RC/RR/RV/PM/PJ/CW/API theo sheet).
Các file trong [2026-11-17-integration-test](2026-11-17-integration-test/) là bản nháp 3 viết theo API, mã ca khác sheet; vẫn dùng để tra
quy tắc nghiệp vụ, EP/BVA và thông điệp nguyên văn (đầu mỗi file có khối "Cập nhật 20/11/2026" ghi chỗ đã lỗi thời). Bản v5 giữ nguyên làm mẫu trắng.

## 2. Tình trạng nhánh (kiểm 20/11/2026)

`TuDM` ở `b592dd7` = `origin/main` (đã gộp PR #3 của nhánh `trungdam`) + code TuDM. Hệ quả:
- Sửa đổi của `trungdam` trên code Người 5 (DEF-RV-01, lọc `aeb_mode = 'ON'`, ADR-044 Accepted) đã có trên main → issue #16 xong.
- Xung đột số ADR-052 / nhãn `-xosc6` đã giải quyết: radar perception thành ADR-055, `.xosc` v9 / `-xosc9` → issue #15 xong.
- Định danh CARLA hiện hành: `carla-0.9.16-xosc9` (gọi là `<SIM>`).

## 3. Quy ước ghi sheet

### 3.1 Ánh xạ cột

| Cột sheet | Cách ghi |
|---|---|
| Test Case ID | Mã theo tab: `RC-01`, `RR-01`, `RV-01`, `PM-01`, `PJ-01`, `CW-01`, `API-01` |
| Test Case Description | Một câu "Verify …", nêu quy tắc nghiệp vụ được kiểm |
| Test Steps | Bước đánh số, thao tác trên web; tab `Server-API` ghi phương thức, đường dẫn, header, body |
| Preconditions | Tài khoản đăng nhập và dữ liệu phải có trước |
| Test Data | Mỗi trường một dòng `tên - giá trị`; ghi rõ biên |
| Post conditions | Bản ghi nào được tạo/đổi/không đổi |
| Expected Result | Thông điệp nguyên văn, trạng thái hiển thị; ca API thêm HTTP status |
| Actual Result | Điều thấy được khi chạy; ca Fail ghi kèm mã issue; ca không quan sát được một phần thì ghi rõ phần đó |
| Test Date | Ngày chạy (dd/mm/yyyy); để trống với ca Untested |
| Status | `Pass` / `Fail` / `Blocked` / `Untested` |

Tab `Statistics` đếm theo tab bằng công thức (đã thêm dòng `Server-API`); tab `Test Data` ghi dữ liệu và môi trường thực tế của đợt chạy;
tab `Pending` ghi phần chưa chạy và lý do.

### 3.2 Quy ước gọi API

- Base URL: `http://localhost:8001/api/v1/vehicsim`. Đăng nhập `POST http://localhost:8001/api/v1/auth/login`, lấy `access_token`.
- Header: `Authorization: Bearer <access_token>`, `Content-Type: application/json`; `X-VehicSim-Project: <project_id>` bắt buộc với
  REVIEWER khi tạo test và khi quyết định, dùng để chọn project cá nhân với EXPERIENCER.
- Dạng body lỗi: `{"detail": "<thông điệp>"}`; không tìm thấy: `{"detail": "Không tìm thấy: <đối tượng>"}`;
  lỗi project: `{"code": "<MÃ_LỖI>", "detail": "<thông điệp>"}`; lỗi bean validation: thông điệp mặc định của Hibernate Validator (tiếng Anh, issue #9).
- Mã regression test `RT-%03d`; mã khuyến nghị `REC-%03d` cùng số.

### 3.3 Kiểm DB

`docker compose exec mysql mysql -u<user> -p<pass> vehicsim -e "<SQL>"`. Chỉ sửa DB bằng tay khi tiền điều kiện ghi rõ
(RV-28 lưu trữ workspace vì chưa có API, đã khôi phục ngay trong cùng ca).

## 4. Môi trường đợt 1 (20/11/2026)

- Code: `TuDM` `b592dd7`. Docker MySQL/Redis, backend `:8001`, frontend `:3000` (`npm run dev`).
- **CARLA:** đã thử `dev-carla.ps1 -NoHud` với CARLA 0.9.16 ở `D:\CARLA_0.9.16`; server tự tắt sau vài phút (máy chỉ có GPU tích hợp)
  nên 8 run đầu FAILED với "CARLA Dev Runner … Profile -xosc9 cần điểm radar mỗi tick" (giữ nguyên trong DB làm bằng chứng). Các ca riêng của CARLA để Untested.
- Chỉ trong đợt test: `VEHICSIM_WRITES_PER_WINDOW=1000`, `LOGIN_ATTEMPTS_PER_IP=1000` (bước web đăng nhập nhiều lần từ một IP).
- **DB local lệch schema:** thiếu migration 009 (`BASELINE_DATASET`), 010 (`workspace_members.granted_role`, làm `POST /workspaces/{id}/members`
  trả 500), 011 (4 mẫu xe) và 015 (`aeb_mode`). Đã sao lưu (`backup-it-2026-11-20-truoc-test.sql`, ngoài repo) rồi chạy 009, 010, 011, 015
  theo thứ tự; so với DB dựng tạm từ `01_schema.sql` thì cột, kiểu, index, CHECK đều khớp (issue #29).
- Bước web chạy bằng Playwright (bản pin trong `frontend/package.json`) với Microsoft Edge headless; không lưu ảnh bằng chứng.

Chạy lại bằng CARLA trên máy đủ mạnh: `.\scripts\dev-carla.ps1 -RestartBackend`, kiểm `run_xosc.py --status`, rồi chạy các ca ở mục 0.3
và các ca đọc run (RC, RR, RV, PJ); chọn lại giá trị candidate theo kết quả baseline CARLA để vẫn có đủ các nhánh Đạt / Xấu đi / Trượt tiêu chí.

## 5. Dữ liệu test thực tế

### 5.1 Tài khoản (miền `@vsos.test`, mật khẩu chung không ghi vào repo/sheet)

| Mã | Role | Cách tạo | Workspace "AEB Pedestrian" |
|---|---|---|---|
| ADMIN1 | ADMIN | Tự đăng ký → SQL đổi role (như `CreateAdmin.java`) | Không; dùng trang Admin đổi Quản lý workspace sang MGR1 |
| MGR1 | MANAGER | Như trên | **Quản lý** (chỉ role MANAGER thêm được thành viên — `VehicSimAccess.requireMemberManager`) |
| ENG1, REV1, REV2 | ENGINEER / REVIEWER | Tự đăng ký → MGR1 thêm vào workspace với role tương ứng | Có |
| REV3 | REVIEWER | Tự đăng ký → SQL đổi role, không thêm vào workspace | Không |
| EXP1, EXP2 | EXPERIENCER | Tự đăng ký | Không |
| EXP3 | EXPERIENCER → ENGINEER | Tự đăng ký, tạo "IT-EXP3 Dự án", rồi MGR1 thêm vào workspace (PM-70) | Có sau khi đổi role |

### 5.2 Project, họ kịch bản, candidate

| Mã | Định nghĩa | Ghi chú |
|---|---|---|
| P-TEAM | Project #1 "VF8 AEB MVP", xe Audi e-tron | **Baseline lúc bắt đầu là AEB v4** (TTC 4,0 s, trễ 0,15 s, giảm tốc 10 m/s², tăng lực 20 m/s³), không phải v1.0 như bản nháp; sau RV-33 là IT-C-GOOD |
| F1 | Họ #6 `PX3` "IT-F1 Người đi bộ băng ngang": 30/40/50 km/h, kích hoạt 15 m, 1,5 m/s, băng qua, trời quang, ban ngày | V1 = #86 (30), V2 = #87 (40), V3 = #88 (50). Baseline AEB v4: 30 an toàn, **40 va chạm** (người đi vào sườn xe), 50 suýt va chạm |
| F2 | Họ #7 `PX4` "IT-F2 Chưa chạy baseline": 30/40 km/h, 20 m, không chạy baseline | V4 = #90, V5 = #91 |
| C-GOOD / C-GOOD2 / C-GOOD3 | #54 / #55 / #56, tạo từ AEB v4, chỉ đổi TTC thành 3,0 / 2,0 / 1,8 s (giữ giảm tốc 10) | Kết quả giống hệt baseline → Đạt. Thử offline: giảm tốc 8 làm trung vị min TTC giảm ~5 s → không đạt tiêu chí, nên không dùng giá trị bản nháp |
| C-BAD | #57: TTC 0,6 s, trễ 0,5 s, giảm tốc 4 m/s², tăng lực 5 m/s³ | 30 km/h thành va chạm mới → Không đạt (xấu đi) |
| P-EXP1 | Project #7 "IT-EXP1 Dự án chính" (EXP1), baseline v1.0 (TTC 1,5 s) | Có 2 run CARLA FAILED từ lần thử đầu; sau PJ-15 baseline là IT-CE-GOOD (vòng 2) |
| F3 | Họ #8 "IT-F3 Cá nhân": 30/50 km/h | V6 = #93 (30, an toàn), V7 = #94 (50, suýt va chạm) |
| CE-GOOD / CE-GOOD2 / CE-BAD | #58 / #59 / #60, như giá trị bản nháp (TTC 1,8 / 2,0 / bộ BAD) | Đạt / Đạt / Không đạt |
| P-EXP2 | Project #8 "IT-EXP2 Dự án" (EXP2) | Đã xoá ở PM-60 |
| P-PJ | Project #42 "IT-EXP1 Hành trình" (EXP1) | Họ "IT-PJ Họ 1" (1 run), candidate IT-PJ-C1 (thành baseline ở PJ-20) và IT-PJ-C2, họ "IT-PJ Họ 3" (2 run) |
| F-CW / F-CW2 | Họ #12 `PX5` (trời quang ma sát 1,00; mưa 0,65) / #13 `PX6` (9 biến thể mây/sương/mưa to × ngày/chạng vạng/đêm) | Tạo qua web ở CW-01, CW-02 |

### 5.3 Regression test

| Mã | Test | Người tạo | Candidate, tập | Kết quả |
|---|---|---|---|---|
| T-A | RT-035 | ENG1 (RC-26) | C-GOOD, V1–V3 | Đạt → Chấp nhận ở RV-33 |
| — | RT-036 / RT-037 | ENG1 (RC-20) / ADMIN1 (RC-21) | C-GOOD3, V1 | Đạt |
| T-R | RT-038 | REV1 (RC-22) | C-GOOD3, V2 | Đạt; REV1 tự duyệt bị chặn (RV-26) |
| T-E1 | RT-039 | EXP1 (RC-25) | CE-GOOD, V6–V7 | Đạt → dùng làm baseline ở PJ-15 |
| T-A2 | RT-040 | ENG1 | C-GOOD, V1 | Đạt (ca "ứng viên đã được quyết định", RV-35) |
| T-D | RT-041 | ENG1 | C-GOOD2, V1–V3, tạo trước RV-33 | Đạt; form duyệt RV-01 → RV-15; "baseline đã đổi" ở RV-34 |
| T-B | RT-042 | ENG1 | C-BAD, V1–V3 | Không đạt, 1 ca xấu đi → Từ chối ở RV-32 |
| T-F | RT-043 | ENG1 | C-GOOD3, V1, trung vị min TTC thay đổi ≥ 5 s | Không đạt theo tiêu chí, không ca nào xấu đi |
| T-F2 | RT-044 | ENG1 | C-GOOD, F2 toàn bộ biến thể | Tự tạo 2 run baseline + 2 run candidate, Đạt |
| T-E2 / T-E3 | RT-045 / RT-046 | EXP1 | CE-GOOD2 / CE-BAD trên F3 | Đạt (BASELINE_CHANGED sau PJ-15) / Không đạt |
| — | RT-047 | EXP2 | Trong P-EXP2 | Tiền điều kiện PM-60; đã xoá cùng project |
| — | RT-048 → RT-050 | ENG1 | C-GOOD3, V1 | Do API-02, API-03 và quan sát #2 tạo ra |
| — | RT-051 / RT-052 | EXP1 | IT-PJ-C1 trên IT-PJ Họ 1 (hai lần) | Đạt; RT-051 dùng cho PJ-20, PJ-21, RT-052 cho API-27 |
| — | RT-053 | EXP1 | IT-PJ-C2 trên IT-PJ Họ 1 | Đạt; dùng cho PJ-19 (project lưu trữ) |
| — | RT-054 → RT-059 | ENG1 | C-GOOD3 | Do API-12 → API-14, API-35 → API-37 tạo ra |

T-ERR (test lỗi khi CARLA tắt) cần CARLA — RR-14 Untested.

## 6. Tiền điều kiện chung

| Mã | Nội dung |
|---|---|
| PRE-ENV | Backend `:8001`, frontend `:3000`, MySQL, Redis chạy; `GET /health` trả 200; nếu chạy CARLA thì `run_xosc.py --status` báo tương thích |
| PRE-ACC | Đủ tài khoản ở 5.1, đúng role, đúng thành viên workspace |
| PRE-TEAM | P-TEAM có đúng một version `BASELINE`; F1 có 3 run baseline `COMPLETED` với `<SIM>` |
| PRE-CAND | C-GOOD, C-GOOD2, C-GOOD3, C-BAD ở `CANDIDATE` |
| PRE-EXP | P-EXP1 có F3 với 2 run baseline `COMPLETED`; CE-GOOD, CE-GOOD2, CE-BAD đã tạo |

## 7. Thứ tự đã chạy

1. Chuẩn bị: sao lưu DB, chạy migration thiếu, tạo tài khoản, MGR1 làm Quản lý workspace, tạo P-EXP1, P-EXP2, F1, F2, F3, candidate.
2. RC đọc màn (RC-01 → RC-19, RC-23, RC-24, RC-30) → tạo test qua web (RC-26, RC-20, RC-21, RC-22, RC-25) → tạo T-A2, T-D, T-B, T-F, T-F2, T-E2, T-E3 qua API.
3. RR → RV-01 → RV-30 → RV-31, RV-32 (Từ chối) → RC-11 → RV-33 (Chấp nhận) → RV-34 → RV-36 → RV-28 (lưu trữ workspace bằng SQL rồi khôi phục).
4. PM tạo/tìm/phân trang/quyền → PJ (P-PJ, rồi P-EXP1 vòng 1 → PJ-14, PJ-15 Adopt → PJ-16 → PJ-18) → PM cài đặt/lưu trữ/xoá → PM-70.
5. CW → RC-27 → RC-29 → `Server-API`.

## 8. Danh sách issue đề xuất (trạng thái 20/11/2026)

Chưa đối chiếu với issue đã có trên GitHub: ngày 20/11 không kết nối được GitHub (`git fetch` bị ngắt kết nối, máy chưa cài `gh`), so với
`origin/main` lần fetch gần nhất là `affed1b` (đã gộp vào `TuDM`). Code được đối chiếu ở `TuDM` `b592dd7`. Mức: Cao / Trung bình / Thấp.

Cột trạng thái: **Xác nhận** = tái hiện được khi chạy test; **Xác nhận bằng code** = code ở `b592dd7` đúng như mô tả nhưng chưa có ca chạy được
(thường vì cần CARLA hoặc chờ chốt hành vi); **Quan sát** = thấy hành vi nhưng chưa có Expected (chờ Q12); **Xong** = đã xử lý trên main; **Còn** = tài liệu chưa sửa.

| # | Tiêu đề đề xuất | Loại | Mức | Phạm vi | Ca | Trạng thái 20/11 |
|---|---|---|---|---|---|---|
| 1 | `criteria` có giá trị null làm API tạo regression trả 500 | Bug | Trung bình | Người 5 | API-01 | Xác nhận |
| 2 | Tiêu chí regression không giới hạn miền giá trị | Bug thiết kế | Cao | Người 5 + Người 4 | Ngoài sheet (RT-050) | Quan sát: `false_activation_increase_max_pts = 1000` được nhận; chờ Q12 |
| 3 | Không có cách huỷ một regression test đang chạy | Thiếu chức năng | Trung bình | Người 5 + Người 2 | — | Xác nhận bằng code: không có endpoint huỷ; `cancelRun` từ chối run thuộc regression |
| 4 | Màn duyệt không báo trước khi Reviewer tự duyệt test do mình tạo | UX | Thấp | Người 5 | RV-26 | Xác nhận: nút gửi bật, chỉ báo lỗi sau khi gửi |
| 5 | Cảnh báo CARLA luôn ghi "chưa hiệu chuẩn phanh" | Cần chốt | Trung bình | Người 5 + Người 2 | RR-15 (Untested) | Xác nhận bằng code (`calibrated` luôn `false`); chưa thấy trên UI vì cần run CARLA |
| 6 | Câu đánh đổi trong khuyến nghị gắn cứng tình huống người đi bộ | Bug nội dung | Thấp | Người 5 | — | Xác nhận bằng code (`RegressionViewService` dòng 245, 252) |
| 7 | Trạng thái hiển thị "Không đạt" gộp REGRESSED và không đạt tiêu chí | UX | Thấp | Người 5 | RR-08 | Xác nhận: RT-042 (xấu đi) và RT-043 (chỉ trượt tiêu chí) cùng "Không đạt" |
| 8 | Reviewer thiếu header khi tạo regression nhận câu "trước khi quyết định" | Bug thông điệp | Thấp | Người 5 | API-04 | Xác nhận |
| 9 | Thông điệp lỗi validation và một số lỗi nghiệp vụ không phải tiếng Việt | i18n | Thấp | Chung | API-05, API-06 (Fail); API-11, API-15, API-16, API-23, API-31, API-34, API-45 (ghi chú) | Xác nhận |
| 10 | Xoá project không nằm trong transaction và không khoá trạng thái chạy | Bug | Trung bình | TuDM | PM-61 (Untested) | Xác nhận bằng code; chưa tái hiện được vì cần run đang chạy |
| 11 | Project đang lưu trữ vẫn sửa được tên, mô tả, xe | Cần chốt | Thấp | TuDM | — | Xác nhận bằng code (`ProjectService.update` không kiểm `ARCHIVED`); chờ Q12 |
| 12 | Frontend gửi cứng `confirmed: true` khi Adopt | Code smell | Thấp | TuDM | PJ-14 | Xác nhận: ô xác nhận chỉ khoá nút ở giao diện |
| 13 | EXPERIENCER không gửi header thì thao tác ghi rơi vào project ACTIVE mới nhất | Cần chốt | Trung bình | TuDM | — | Xác nhận bằng code (`ProjectScope.resolve`); chờ Q12 |
| 14 | SQL của Regression/Project chưa có test chạy trên MySQL thật | Thiếu test | Trung bình | Người 5 + TuDM | — | Còn: `pom.xml` chưa có Testcontainers/H2 |
| 15 | Xung đột ADR-052 và nhãn `-xosc6` giữa `main` và `trungdam` | Tích hợp | Cao | — | — | **Xong** (ADR-055, `-xosc9`, PR #3) |
| 16 | Sửa đổi của `trungdam` trên code Người 5 chưa vào main | Tích hợp | Trung bình | — | — | **Xong** (PR #3) |
| 17 | ADR-046, ADR-047, ADR-048 vẫn Proposed dù code đã chạy | Doc | Trung bình | Nhóm | — | Còn |
| 18 | TD-49 mô tả lỗi thời (ba mục tiêu theo cặp đã có từ TD-50) | Doc | Thấp | Người 5 | — | Còn |
| 19 | Hai exec plan của EXPERIENCER còn ở `active/` với việc dang dở | Doc | Thấp | TuDM | — | Còn; tab PM/PJ của v6 dùng làm bằng chứng để đóng |
| 20 | Mục lục ADR còn tên gói `com.vehicsim.core` | Doc | Thấp | Chung | — | Còn |
| 21 | Tên regression chỉ gồm khoảng trắng được lưu | Bug | Thấp | Người 5 | API-02 | Xác nhận |
| 22 | `enabled` của tiêu chí không phải boolean bị hiểu là tắt tiêu chí | Bug | Trung bình | Người 5 | API-03 | Xác nhận |
| 23 | Lý do Adopt không giới hạn độ dài; vượt cột `notes` gây lỗi DB với thông điệp sai nghĩa | Bug | Thấp | TuDM | PJ-21 | Xác nhận |
| 24 | Nút "Tải OpenSCENARIO (.xosc)" ở màn mô tả ghi ma sát mưa 0,70, khác 0,65 của họ kịch bản | Bug | Trung bình | TuDM | CW-05 | Xác nhận |
| 25 | Màn chi tiết regression của project nhóm thiếu câu "không phải chứng nhận an toàn" | Bug nội dung | Thấp | Người 5 | RR-22 | Xác nhận (mới); kiểm lại trên CARLA vì khung cảnh báo CARLA có câu tương tự |
| 26 | Xoá project từ "Cài đặt project" không hiện thông báo "Đã xoá" | Bug UX | Thấp | TuDM | PM-59, PM-60 | Xác nhận (mới) |
| 27 | Ô "Tên project" giới hạn theo đơn vị UTF-16, emoji chỉ nhập được 75 | Bug | Thấp | TuDM | PM-11 | Xác nhận (mới) |
| 28 | Nhãn phiên bản lặp chữ "AEB AEB v4" | UX | Thấp | Người 5 | RC-10, RR-16 | Xác nhận (mới) |
| 29 | Backend khởi động được với DB thiếu migration, lỗi lộ ra là 500 ở chức năng khác | Cần chốt | Trung bình | Chung | — (môi trường) | Xác nhận (mới) khi dựng môi trường 20/11 |

Tổng 29: 15 xác nhận khi chạy (#1, #4, #7, #8, #9, #12, #21 → #29), 6 xác nhận bằng code (#3, #5, #6, #10, #11, #13), 1 quan sát chờ chốt (#2),
2 đã xong (#15, #16), 5 còn (#14 thiếu test, #17 → #20 tài liệu).
Các ca Fail trên sheet đều đã có issue: RR-22 (#25), PM-11 (#27), PM-59/PM-60 (#26), PJ-21 (#23), CW-05 (#24), API-01 → API-06 (#1, #21, #22, #8, #9).

### Chi tiết

**#1 — `criteria` null làm API trả 500.** `RegressionController.cleanCriteria` gọi `new LinkedHashMap<>(value)` với `value` null →
`ApiExceptionHandler.handleUnexpected` trả 500 "Lỗi hệ thống. Vui lòng thử lại sau." (API-01). Đề xuất: bỏ qua mục null hoặc trả 400; thêm unit test.

**#2 — Tiêu chí không giới hạn miền giá trị.** `RegressionCriteria.merge` chỉ kiểm "là số"; 20/11 gửi `value = 1000` được tạo RT-050.
Cần chốt miền hợp lệ (vd phanh oan 0–5 điểm %, TTC −1…0 s) và có cho tắt tiêu chí không bắt buộc hay không.

**#3 — Không huỷ được regression test.** `RunService.cancelRun` từ chối run thuộc regression (câu tiếng Anh "This run belongs to a regression test or
optimization and cannot be cancelled on its own"); `cancelFamilyRuns` bỏ qua run regression; controller regression không có endpoint huỷ.
Đề xuất `POST /regression/{id}/cancel` theo quy trình dừng ở TD-37.

**#4 — UI không chặn trước việc tự duyệt.** Backend chặn ở `ReviewDecisionService` ("người tạo khuyến nghị không tự duyệt được"), nhưng
`canDecide` ở trang `/review` chỉ dựa trên role. Đề xuất: trả cờ `can_decide` theo recommendation hoặc id người tạo.

**#5 — Cảnh báo CARLA luôn "chưa hiệu chuẩn".** `RegressionReportService.simulatorCaveat` luôn trả `calibrated=false`; ADR-051 đã hiệu chuẩn mô-men
phanh. Cần chốt với Người 2 câu theo profile.

**#6 — Câu đánh đổi gắn cứng người đi bộ.** `RegressionViewService.tradeoffs` (dòng 245, 252) ghi "pedestrians who stop at the curb", "late dart-outs…"
bằng tiếng Anh; từ ADR-050 có họ CCRs/CCRm/CCRb nên câu sai với họ xe phía trước. Sheet chưa có ca cho họ CCR.

**#7 — "Không đạt" gộp hai nghĩa.** `RegressionCodes.displayStatus` trả "FAILED" cho cả `verdict=REGRESSED` và `verdict=FAILED`. Đề xuất hiển thị
"Xấu đi" riêng.

**#8 — Câu báo thiếu header sai ngữ cảnh.** `ProjectAccess.explicitProjectId` dùng chung cho tạo regression và quyết định; câu luôn là
"Cần chọn project trước khi quyết định; hãy tải lại trang".

**#9 — Thông điệp tiếng Anh.** `DecisionRequest`, `CreateRegressionRequest` dùng `@NotBlank`/`@Size` không có `message`; không có
`ValidationMessages.properties`. 20/11: lý do rỗng → "must not be blank", 4001 ký tự → "size must be between 0 and 4000" (API-05, API-06); cùng kiểu ở
điều kiện 4001 ký tự, tên regression 151 ký tự, 301 biến thể, danh sách thời tiết rỗng, thiếu candidate/họ/xác nhận (API-11, API-15, API-16, API-23,
API-31, API-34, API-45: luật chặn đúng nên Pass, chỉ thông điệp sai ngôn ngữ). Các lỗi nghiệp vụ của
`ReviewDecisionService` viết chữ thường, lẫn từ tiếng Anh ("recommendation này đã có quyết định cuối", "candidate này đã được quyết định ở một regression test khác").

**#10 — Xoá project không có transaction.** `ProjectService.delete` không có `@Transactional`; `ProjectRepository.delete` chạy nhiều câu `DELETE`;
`requireIdle` không khoá dòng. Đề xuất `@Transactional`, `SELECT … FOR UPDATE`, xoá thư mục run sau commit.

**#11 — Project lưu trữ vẫn sửa được.** `ProjectService.update` (dòng 107–120) không kiểm `ARCHIVED`; `ProjectScope` và `adopt` coi ARCHIVED là chỉ đọc
(PJ-19, API-26). Trên web project lưu trữ không mở được, nên chỉ gọi thẳng `PATCH` mới sửa được.

**#12 — `confirmed` gửi cứng.** `frontend/src/services/vehicsim.ts` hàm `adoptCandidate` gửi `confirmed: true`; ô xác nhận ở `/rounds/[testId]`
chỉ khoá nút (PJ-14).

**#13 — Project ngầm định khi thiếu header.** `ProjectScope.resolve` (dòng 53) dùng `latestActivePersonal` khi EXPERIENCER không gửi header.
Web luôn gửi header của project đang mở, nên chỉ ảnh hưởng client khác.

**#14 — Chưa có test SQL trên MySQL thật.** `pom.xml` và `src/test` không có Testcontainers/H2; thứ tự xoá, khoá `FOR UPDATE`, lọc `aeb_mode` chưa có
máy kiểm. Đợt integration 20/11 chạy trên MySQL thật nhưng thủ công, chưa thay được test tự động.

**#17 → #20 — Tài liệu.** ADR-046/047/048 vẫn "Proposed 01/11/2026"; TD-49 vẫn ghi "chưa so sánh ba mục tiêu"; hai exec plan
[project cá nhân](2026-10-31-experiencer-project-ca-nhan.md), [hành trình](2026-11-01-hanh-trinh-experiencer.md) còn ở `active/`;
[docs/adr/README.md](../../adr/README.md) dòng ADR-042 còn `com.vehicsim.core`.

**#21 — Tên regression chỉ khoảng trắng.** `RegressionService.createTest` dùng `name != null && !name.isEmpty()` (không `strip()`); API-02 lưu `"   "`.

**#22 — `enabled` sai kiểu bị hiểu là tắt.** `RegressionCriteria.merge` đặt `enabled = Boolean.TRUE.equals(giá trị)`; API-03 gửi `"true"` thì
`collision_rate_not_increase` bị tắt. Gộp với #2 nếu nhóm muốn.

**#23 — Lý do Adopt không giới hạn.** `AdoptRequest.reason` không có `@Size`; `appendVersionNote` nối vào `aeb_versions.notes` (TEXT). PJ-21: ô lý do trên web
nhận 70 000 ký tự, gửi đi nhận "Dữ liệu bị trùng hoặc vi phạm ràng buộc. Hãy tải lại trang rồi thử lại.", baseline không đổi. Đề xuất `@Size(max=4000)` và `maxLength` cho ô.

**#24 — Ma sát mưa khi xuất `.xosc` từ màn mô tả.** `POST /scenarios/xosc` → `XoscExport` với IR không có `road_friction`, lõi lấy
`CrossingCase.WEATHER_FRICTION` (RAIN = 0,70); họ kịch bản lưu 0,65 theo `Vs.WEATHER_FRICTION` (CW-01: PX5 mưa 0,65; CW-05: file 0,7).
Đề xuất điền `road_friction` theo `Vs.WEATHER_FRICTION` trước khi xuất.

**#25 — Thiếu câu "không phải chứng nhận an toàn".** Ở `/validation/regression/[testId]` câu "Kết quả mô phỏng, không phải chứng nhận an toàn."
chỉ hiện khi có màn kết luận của Experiencer; với project nhóm chỉ có `CarlaCaveat` (hiện với run CARLA). RT-035 không có câu nào.
Cần kiểm lại khi chạy CARLA; nếu vẫn thiếu thì hiện câu chung cho mọi test (bất biến "không tuyên bố chứng nhận an toàn").

**#26 — Mất thông báo xoá.** Trang `/projects/[id]/settings` truyền `router.push("/projects")` làm `onDone` của `useProjectActions`; toast
"Đã xoá “…”." nằm trong state của trang cài đặt nên mất khi chuyển trang (đã kiểm 3 giây, mỗi 100 ms). Xoá từ menu "⋯" ở "Project của tôi" vẫn hiện.
Đề xuất mang thông báo sang trang danh sách (query hoặc context).

**#27 — Giới hạn tên theo UTF-16.** `ProjectForms.tsx` đặt `maxLength={150}` (trình duyệt đếm đơn vị UTF-16) trong khi bộ đếm `[...text].length`
và `ProjectService` (`codePointCount`) đếm ký tự. Emoji/ký tự ngoài BMP chỉ nhập được 75. Đề xuất bỏ `maxLength`, cắt theo code point trong `onChange`.

**#28 — Nhãn lặp "AEB".** Màn tạo regression ("Bản cơ sở (cũ)", danh sách ứng viên, thẻ "Bộ kịch bản") và thẻ phiên bản ở màn kết quả ghép
`AEB ${label}`; version có nhãn "AEB v4" hiện "AEB AEB v4" (RC-10, RR-16).
Đề xuất chỉ thêm tiền tố khi nhãn chưa bắt đầu bằng "AEB" (dùng chung một hàm format).

**#29 — Không phát hiện DB thiếu migration.** DB local thiếu 009, 010, 011, 015 nhưng backend vẫn chạy; lỗi lộ ra là 500 "Lỗi hệ thống" khi thêm
thành viên workspace. Cần chốt: kiểm cột/phiên bản schema lúc khởi động (log cảnh báo) hoặc bảng phiên bản migration.

**Quan sát nhỏ, chưa thành issue:** với ENG1/MGR1/ADMIN1 trang `/review` hiện câu chặn quyền và khoá "Gửi quyết định" nhưng các ô vẫn nhập được
(RV-16 → RV-18); câu "Người tạo kiểm thử không tự duyệt khuyến nghị…" vẫn hiện cho Experiencer dù project cá nhân không có khuyến nghị
(đã ẩn với Experiencer ngày 23/11/2026);
trang kết quả regression mở tab "Mọi thay đổi (0)" nên không có link phát lại khi không ca nào đổi (RR-21 phải mở tab "Tất cả");
trang vòng của project đang lưu trữ hiện thêm câu "Bạn đang mở project khác…" dù người dùng không mở project nào khác (PJ-19).

## 9. Câu hỏi cần chốt

| Mã | Câu hỏi | Kết quả / đề xuất |
|---|---|---|
| Q1 | Merge `origin/main` vào `TuDM` trước khi chạy? | Đã có (`b592dd7`) |
| Q2 | Đợi `trungdam` vào main? | Không còn cần: PR #3 đã vào main |
| Q3 | Ai xử lý xung đột ADR-052 / `-xosc6`? | Đã xử lý (ADR-055) |
| Q4, Q5, Q14, Q15 | Số ca, bước theo UI/API, thông điệp nguyên văn, tab Statistics | Ca luồng người dùng thao tác trên web; luật phía server ở tab `Server-API` (integration mức API) |
| Q6 | Tăng hạn mức khi test? | Đã làm (ghi, đăng nhập = 1000); ca giới hạn tần suất chưa có trong sheet |
| Q7, Q16 | Ca không đảo ngược, lưu trữ workspace bằng SQL | Đã sao lưu DB trước; RV-28 khôi phục workspace ngay trong ca; xem mục 10 |
| Q8, Q9 | Khởi động lại backend khi CARLA chạy; hai Reviewer duyệt đồng thời | Không có trong sheet v6 |
| Q10 | Tạo issue: cài `gh` hay dán tay? Label, assignee? | **Còn mở** |
| Q11 | Sửa issue thuộc TuDM/Người 5 trước hay sau? | **Còn mở** — đề xuất sửa #1, #8, #9, #21, #22, #23, #24, #26, #27 rồi chạy lại ca Fail |
| Q12 | Hành vi mong muốn cho #2, #11, #13, #29 | **Còn mở** |
| Q13 | Commit file kế hoạch và sheet? | **Còn mở** — sheet và file `.xlsx` cũ đang untracked |
| Q17 | Email tài khoản test | `@vsos.test` trên DB local |
| Q18 | Máy nào chạy lại phần CARLA (mục 0.3)? | **Mới** — cần máy có GPU rời |

## 10. Dữ liệu đã đổi trên DB local và cách khôi phục

Các thao tác không đảo ngược trong đợt 1 (đều trên DB dev local, có bản sao lưu trước khi test):
- Quản lý workspace "AEB Pedestrian" đổi từ tài khoản admin cũ sang MGR1; baseline P-TEAM đổi AEB v4 → IT-C-GOOD (RV-33); IT-C-BAD bị từ chối (RV-32).
- Baseline P-EXP1 đổi v1.0 → IT-CE-GOOD (PJ-15); xoá project P-EXP2, "IT-EXP1 Xoá thử" và 3 project thử thông báo xoá.
- Thêm migration 009, 010, 011, 015. Dữ liệu test còn lại sau đợt: 67 project của tài khoản `it.*` (gồm 30 project "IT-EXP4 Hạn mức" của API-28; đã xoá 5),
  7 họ kịch bản, 24 regression test (RT-035 → RT-059, trừ RT-047 xoá cùng P-EXP2), 9 quyết định, 61 run (53 COMPLETED, 8 FAILED từ lần thử CARLA).
- Thêm: IT-C-GOOD2 bị từ chối (RV-37); baseline P-PJ đổi v1.0 → IT-PJ-C1 (PJ-20); tài khoản `it.exp4` cho API-28 (backend tạm chạy với hạn mức mặc định rồi trả về cấu hình test).

Muốn quay về trạng thái trước test: dừng backend, nạp lại `backup-it-2026-11-20-truoc-test.sql` vào DB `vehicsim`, rồi chạy lại 009, 010, 011, 015
(bản sao lưu được lấy trước khi chạy migration). Không dùng `docker compose down -v`.

## 11. Tài liệu đã đọc và chỗ khác code

Đã đọc: CLAUDE.md, AGENTS.md, kế hoạch này (bản nháp 3), 6 file trong [2026-11-17-integration-test](2026-11-17-integration-test/), các tab của v5,
migration 009 → 015, code các màn/controller ở mục 1. Chỗ tài liệu khác code hoặc DB, đã sửa trong v6 và file này:
- Tab `Test Data` của v5 ghi ADMIN1 là Quản lý workspace và thêm thành viên; code chỉ cho role MANAGER (`requireMemberManager`).
- Bản nháp giả định P-TEAM có baseline v1.0 (TTC 1,5 s); DB thật là AEB v4 → đổi giá trị candidate (mục 5.2), Expected của RC-10, RR-16, RR-20.
- Mục 4 cũ ghi profile `-xosc7`; hiện hành là `-xosc9` (ADR-055).
- Expected của PM-01 ghi "mở trang chủ project"; thiết kế (và câu "Tạo xong, bạn sẽ sang bước ①" trên màn tóm tắt) mở trang bước ① → sửa Expected.
- PJ-06 dùng P-EXP1 nhưng project này đã có kiểm chứng khi chạy tới ca → dựng trạng thái trên P-PJ.

## 12. Nhật ký

- 17/11/2026: rà code, git log TuDM (31 commit), so nhánh `main`, `trungdam`, `chuvv`, `PhuongNA`, `feature/reviewer`. Bản nháp 1.
- 18/11/2026: bản nháp 2 — tách test case ra 5 file; dữ liệu theo từng trường; mã test `RT-%03d`; thêm Q16–Q17.
- 18/11/2026: bản nháp 3 — EP/BVA (`ep-bva.md`), 29 ca mới, issue #21–#23; sheet `docs/Integration-Test_VSOS_TuDM.xlsx` → v5 viết lại theo thao tác web; thêm CW-10, issue #24.
- 20/11/2026: chạy đợt 1. Thử CARLA không được (máy yếu), các ca cần CARLA để Untested; chạy migration thiếu; điền Actual Result/Test Date/Status vào
  `docs/Integration-Test_VSOS_TuDM_v6.xlsx`; thêm RV-31 → RV-36, PJ-14 → PJ-18, tab `Server-API`; cập nhật trạng thái issue, thêm #25 → #29.
- 20/11/2026 (bổ sung): áp đủ `ep-bva.md` vào sheet — RV-37, PJ-19 → PJ-21, CW-12, API-11 → API-52; cột "Ca" của `ep-bva.md` đổi sang mã sheet;
  xác nhận #23. Còn 2 lớp EP và 4 biên/luật chờ CARLA, biên ngưỡng phanh oan chờ Q12.
- 20/11/2026 (rà issue): đối chiếu lại mục 8 với code `b592dd7` và kết quả sheet; thêm chú thích trạng thái, cột Ca cho #9, #28, #29;
  #3, #5, #6, #10, #11, #13 ghi "xác nhận bằng code"; chưa đối chiếu được GitHub (mất kết nối, chưa cài `gh`).
