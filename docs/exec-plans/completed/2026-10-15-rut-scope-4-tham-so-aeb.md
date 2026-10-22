# 15/10/2026 — Rút scope: 4 tham số AEB, 3 mục tiêu MOBO, 7 category kịch bản

Quyết định và lý do: [ADR-040](../../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md). Nguồn cấu trúc DB là tab DATABASE của
Google Doc "dtb" (PhuongNA, 15/10); nguồn category / tham số kịch bản là "Tham số kịch bản và Category" (TuDM, 15/10).

## Đã làm

| Việc | Nơi |
|---|---|
| Schema theo bản chuẩn (29 bảng) + `ck_sv_ranges`, `ck_sv_decel`; khôi phục comment cột mà bản Doc cắt ngắn | `database/mysql/01_schema.sql` |
| Migration cho DB đang chạy (giữ dữ liệu) | `database/mysql/migrations/007_2026-10-15_rut-scope-4-tham-so-aeb-7-category.sql` |
| Lõi AEB: `AebParams` còn 4 trường; 6 tham số cũ thành hằng số; `parameter_code = None` khi nguyên nhân là hằng số; bundle cũ 10 mã vẫn đọc được | `worker/vehicsim_core/{aeb_stack,evaluation,bundle}.py` |
| Java: seed 4 tham số, bundle 4 mã, `FamilyService` ghi category / target_type / `target_speed_kmh` / `max_duration_s`, `ScenarioRules` kiểm theo category | `src/main/java/com/vehicsim/vehicsim/{BootstrapService,RunService,AebService,FamilyService,ScenarioRules}.java` |
| Entity JPA khớp schema mới (+ enum `ScenarioCategory`, `TargetType`, `AcquisitionFunction`, `OptimizationAlgorithm`) | `src/main/java/com/vehicsim/entity/` |
| Frontend: bảng AEB, ảnh chụp tham số ở chi tiết ca lỗi, nhãn regression chỉ còn 4 tham số | `frontend/src/app/{aeb,analysis/failures/[runId],validation/regression/[testId]}` |
| Test mới: `ScenarioRulesTest` (10), `test_aeb_has_exactly_the_four_tunable_parameters`, bundle cũ 10 mã, perception không có tham số để đổ lỗi | `src/test`, `worker/tests` |
| Tài liệu: từ điển dữ liệu, kiến trúc, AGENTS.md, ADR-040, TD-39 → TD-43 | `docs/` |

## Kiểm chứng

Làm trên bản sao DB (`mysqldump | mysql`), không đụng DB chính cho tới khi xong; sao lưu DB chính trước khi chạy migration.

- **Cấu trúc:** DB sau migration 007 so với DB dựng mới từ `01_schema.sql` qua `information_schema` — cột (kiểu, null, mặc định, generated,
  COMMENT), index, nội dung CHECK, khoá ngoại: **không lệch**; bốn bảng seed (`roles`, `aeb_parameters`, `tech_references`,
  `carla_vehicle_models`) giống từng dòng.
- **Dữ liệu chuyển:** 1.380 run giữ nguyên; 7 AEB version đều còn 4 giá trị; 226 root cause trỏ `PREDICTION_HORIZON` → `aeb_parameter_id NULL`;
  743 phiên bản kịch bản: `CP_CROSSING`, `PEDESTRIAN`, `max_duration_s = 12`, `target_speed_kmh` = m/s × 3,6 (1,5 → 5,40; 3,0 → 10,80).
- **API:** 29 phản hồi (context, families, aeb/versions, failures, regression 1–4, recommendations 1–4, 4 run × detail / playback / bundle)
  chụp từ backend cũ (HEAD) và backend mới trên bản sao: 9 file giống hệt; phần còn lại chỉ khác ở danh mục tham số (10 → 4), bundle (10 → 4 mã)
  và ghi chú AEB — không có khác biệt nào khác.
- **Đường ghi:** tạo họ mới (8 biến thể, 8 run xong), ứng viên `TTC_THRESHOLD = 1.7`, regression PASSED; ứng viên mang mã đã rút bị từ chối;
  6 vi phạm CHECK bị MySQL từ chối (lỗi 3819), bản ghi kiểu CCRB hợp lệ được nhận.
- **Tái lập:** chạy lại cả 1.380 run từ bundle xuất bởi backend mới. v1.0: 994 / 996, v1.1: 96 / 96, v1.2: 96 / 96, **v1.3: 132 / 192**. Cùng 62
  run lệch dưới cả worker cũ lẫn mới (60 của v1.3 do tầm dự đoán / biên an toàn đặt khác mặc định; 2 run baseline 769, 789 lệch từ trước) — xem TD-40.
- **Gate:** `./mvnw clean test` 38 test; `python -m pytest worker/tests` 55 test; `npx tsc --noEmit` và `eslint` sạch.

## Chưa làm / mở

TD-39 (RMS jerk chưa ai ghi), TD-40 (v1.3 không tái lập), TD-41 (nghĩa của độ chồng lấn), TD-42 (6 category chưa có bộ mô phỏng, `max_duration_s`
không điều khiển bộ mô phỏng), TD-43 (giá trị giữ chỗ ở bản gốc).

## Bổ sung 15/10 (chiều) — migration 008

Sau khi chạy thử một vòng tối ưu trên 732 biến thể thật (script ngoài repo, lõi mô phỏng này, 0,5 ms/run) phát hiện hai chỗ làm bài toán
kém: `BRAKE_BUILDUP_RATE` chỉ có tác dụng ở 11 % khoảng của nó, và mục tiêu 3 chỉ có khi không va chạm. Đã sửa cả hai (ADR-040 §6–7).

| Việc | Nơi |
|---|---|
| `BRAKE_BUILDUP_RATE` biên [5, 20], mặc định 20 (giá trị lưu 50 → 20, kết quả run không đổi) | `01_schema.sql`, `008_*.sql`, `BootstrapService`, `RunService.AEB_DEFAULTS`, `AebParams` |
| `brake_phase_metrics`: RMS jerk trong pha phanh + quãng phanh dừng (cộng `v²/(2·decel_available)`, có ca va chạm); `evaluation.aeb_result.rms_jerk_mps3` → cột `rms_jerk_mps3` | `worker/vehicsim_core/{simulator,evaluation}.py`, `RunService.RESULT_COLUMNS` |
| Tính lại hai cột cho run cũ từ `telemetry_json` bằng SQL (JSON_TABLE + hàm cửa sổ) | `008_*.sql` |
| Comment cột mục tiêu + ràng buộc mặc định trong `objective_config_json` | `01_schema.sql`, `database-schema.md` |

Kiểm chứng: migration chạy trên bản sao DB; cấu trúc sau migration = DB dựng từ `01_schema.sql` (cột, comment, bốn bảng seed giống từng dòng); SQL backfill = hàm
Python của worker trên **cả 1.380 run** (429 run không phanh → NULL, 951 run có giá trị, sai lệch lớn nhất 0,0000); chạy lại 1.380 run từ bundle của backend mới: vẫn đúng
62 run lệch như trước (TD-40), 1.318 run còn lại khớp cả hai mục tiêu mới. Test: Java 38, worker 62 (+7: biên buildup, ca va chạm có mục tiêu, quãng phanh khi xe dừng…).

Kết quả vòng tối ưu thử với định nghĩa mới: 400 cấu hình ngẫu nhiên, 8 thỏa ràng buộc, mặt Pareto khả thi 7 điểm (cũ: 127); ứng viên tốt nhất giảm va chạm 12 → 8 trên họ
tối ưu và 106 → 90 trên 10 họ còn lại, không va chạm mới; `BRAKE_BUILDUP_RATE` nay có tương quan hạng +0,67 với RMS jerk, −0,37 với quãng phanh.
