# Analysis theo từng đợt — Đợt 1: bỏ suy diễn vật lý tại frontend

Ngày 04/11/2026. Nhánh `chuvv`; working tree sạch khi bắt đầu.
Chỉ thực hiện Đợt 1 trong phiên này. Không git add/commit/push/merge/reset/clean.
Không tự chuyển Đợt 2; người dùng kiểm tra và commit trước khi yêu cầu tiếp tục.

## Kế hoạch các đợt độc lập

| Đợt | Nhóm công việc | Trạng thái |
|---|---|---|
| 1 | Audit pipeline, bỏ tính toán/prediction không cần thiết ở Analysis UI, giữ telemetry/API | Hoàn thành code và kiểm thử fixture; giới hạn runtime ghi dưới |
| 2 | Rà và cải thiện Analysis Overview dựa trên kết quả Đợt 1 | Chưa bắt đầu |
| 3 | Run Explorer: bảng, filter/search/sort/pagination, giữ state | Chưa bắt đầu |
| 4 | Run Detail/Telemetry: tổ chức thông tin, chỉ số đúng nguồn | Chưa bắt đầu |
| 5 | Playback: giao diện/timeline/sự kiện, giữ engine hiện có | Chưa bắt đầu |
| 6 | Failure/Root Cause: trình bày nhận định và evidence | Chưa bắt đầu |
| 7 | Dataset Preparation: chọn tập, rà soát, handoff theo backend | Chưa bắt đầu |
| 8 | UI consistency, responsive/accessibility và regression | Chưa bắt đầu |

Các đợt sau đánh giá phần redesign đã có, không viết lại chỉ để đủ đợt.

## Audit pipeline theo source hiện tại

Đã đọc AGENTS/CLAUDE, frontend/AGENTS, hướng dẫn đổi gói 30/10,
quy tắc đặt tên (bảng 7), hợp đồng analysis-metrics; kiểm tra code đúng gói `com.vsos`.
Truy vết hai nguồn, không coi mọi metric là dữ liệu CARLA trả trực tiếp:

1. **Kết quả chấm AEB:** CARLA actor/state → `worker/vehicsim_aeb_control.py`
   (`get_transform/get_velocity`, vị trí/vận tốc người đi bộ, collision callback) → stdio bridge
   → `core/simulation/CarlaSession` + `core/aeb/DecelMeter/AebStack` →
   `Simulator.buildOutcome` + Evaluation → `result.json` → `RunService` kiểm/lưu
   scalar trong `simulation_runs`, frames/events/metrics trong `telemetry_json`, failures/root_causes
   → `AnalysisService`/`AnalysisViewService` → Analysis API → detail/playback/chart/dataset.
2. **Sensor:** `worker/sensor_recorder.py` đọc GT/sensor → `frames.csv`, `collisions.json`,
   `summary.json`, camera → `RunService.carlaData` + `TelemetryMetricsService` →
   GET `/runs/{id}/carla-data` hoặc POST `/telemetry/evaluate` → trang dữ liệu CARLA.
   Sensor recomputed không được tự thế chỗ objective SIMULATOR_RESULT của snapshot.

### Nguồn từng loại dữ liệu và quyết định

| Dữ liệu | Nguồn thực tế | Xử lý Đợt 1 |
|---|---|---|
| Vị trí, vector vận tốc, timestamp, sự kiện collision sensor | CARLA API/worker; lõi chuyển hệ tọa độ/ghi frame | Giữ |
| Tốc độ ego trong recorder | Độ lớn vector velocity do recorder tính, không phải metric AEB riêng | Giữ recorder, không sửa |
| `ego_a` trong result CARLA | DecelMeter từ tốc độ qua cửa sổ, kẹp theo giới hạn, makeFrame đổi dấu; không phải IMU thô | Giữ giá trị API, bỏ frontend kẹp/đổi dấu thành metric khác |
| TTC perception/GT, detection/confidence/AEB, verdict và chain | Lõi Java AEB/Simulator/Evaluation từ trạng thái CARLA; perception chính dựa GT, không mặc định radar thật | Giữ; không tính lại ở UI |
| RMS jerk, quãng phanh, impact, min TTC/distance | Lõi Java tổng hợp và lưu scalar; quãng phanh có thể gồm ngoại suy | Giữ công thức/nguồn/version, không sửa scoring |
| IMU accel, radar depth/relative velocity, obstacle range, control | Sensor/GT recorder | Giữ |
| Radar TTC và IMU jerk | Recorder tính từ radar/IMU; jerk có smoothing, không trực tiếp do CARLA trả sẵn | Giữ backend/worker |
| Sensor recomputed và summary | TelemetryMetricsService từ CSV/collision, khác cửa sổ/nguồn với result | Giữ API/service/form upload CSV; không phải simulator độc lập |
| `motion_telemetry.jerk_mps3`, `crossing_distance_m`, `motion_state` | RecordedTelemetry ở backend dẫn xuất từ frame đã lưu | Giữ biểu đồ và API; playback đọc distance cùng timestamp, thiếu thì — |
| Vùng TTC `x + speed × threshold` | Frontend tự dự đoán | Bỏ layer, vùng vẽ và legend ở playback |
| Sự kiện vượt ngưỡng TTC/trễ kích hoạt/vùng tô | Frontend quét TTC và trừ timestamp | Bỏ tính toán; chỉ dùng event backend nếu có, giữ summary backend |
| Trạng thái dừng | Frontend trước đây đoán từ `speed < 0.05` | Chỉ hiện ĐÃ DỪNG khi có event stopped được backend ghi |
| Lệch vị trí GT/perception | Frontend tự tính chênh lệch | Bỏ metric này; hiện riêng hai vị trí đã ghi |
| Đổi m/s sang km/h, định dạng số, layout/chart scaling, chọn frame theo timestamp | Trình bày dữ liệu, không mô phỏng hay chấm điểm | Giữ |

## Phạm vi loại bỏ và dependency

Không thấy calculator, form nhập phương trình chuyển động hoặc route simulator độc lập trong
`/analysis/failures/**`. Không xóa `MotionTelemetryChart` vì nó hiển thị số API,
không xóa `VEHICLE_DYNAMICS` vì đây là loại nguyên nhân lỗi chính thức.
Bộ mô phỏng động học nằm ở `core/simulation/Simulator`, được runner/test/module khác dùng:
không thuộc phần được phép xóa. Giữ kết quả run cũ; không đổi chúng thành nhãn CARLA.

`ScenarioMap`, `TelemetryChart` và `MotionTelemetryChart` được kiểm tra usages.
Đợt này chỉ tách sự phụ thuộc prediction ở caller; không sửa/xóa component/API dùng chung.
Trang `/analysis/carla`, worker, runner, optimizer/regression, schema và backend giữ nguyên.
Không đổi filter mặc định toàn dashboard để tránh che run lịch sử hoặc trộn identity của dataset.
Detail/playback hiển thị simulator từ API, không suy ra mọi run là CARLA.

## Source thay đổi dự kiến để commit riêng

- Modified: `frontend/src/app/analysis/failures/[runId]/page.tsx`.
- Modified: `frontend/src/app/analysis/failures/[runId]/playback/page.tsx`.
- Modified: `frontend/tests/analysis-redesign.mjs` (thêm trường hợp không tự suy diễn).
- Added: `docs/exec-plans/completed/2026-11-04-analysis-du-lieu-api-dot-1.md`.
- Deleted: không xóa file/route; chỉ bỏ tính toán/UI không có nguồn backend trong hai page.

## Kiểm chứng

- `npm.cmd run lint`: PASS.
- `npx.cmd tsc --noEmit`: PASS.
- `npm.cmd run build`: PASS, gồm TypeScript và toàn bộ route frontend.
- `mvnw.cmd -B "-Dtest=RepoDocsTest" test`: PASS, 5 test, 0 lỗi/skip.
- `node tests/analysis-redesign.mjs`: PASS trên Edge headless và production frontend :3100.
  Giữ các checks overview/explorer/detail/playback/dataset/handoff đã có; bổ sung kiểm riêng Đợt 1.
  Một lượt đầu timeout vì selector chọn bản sao bị ẩn trong tab khác; đã sửa selector test,
  chạy lại PASS, không đổi hành vi production để làm test qua.
- Ảnh responsive 1920×1080, 1366×768, 1024×768 và các màn/state trong
  `data/analysis-batch1-ui/` (gitignored). `result.json` ghi rõ BROWSER_FIXTURE_ONLY;
  đã xem ảnh `batch1-api-playback.png` để kiểm không còn vùng TTC và số API được giữ nguyên.
- `git diff --check`: PASS. Diff backend, worker, schema, API client/types và shared components rỗng.
- Production frontend tạm được dừng sau test; chưa thao tác Git ghi/stage/commit/push.

Test mới dùng giá trị API fixture cố ý khác phép tính từ tọa độ để phát hiện fallback UI:
không tạo event TTC/dừng khi API không có; giữ event API khi có; distance API được ưu tiên,
thiếu projection giữ —; gia tốc giữ dấu; không còn vùng TTC dự đoán.

## Giới hạn

Pipeline đã được đối chiếu bằng source; chưa phải kiểm chứng CARLA/DB runtime.
Không có backend/CARLA lắng nghe các cổng app lúc kiểm tra; chưa có file/node Figma.
Mock chỉ trong browser test; production fetch dữ liệu API bình thường.
Không thay dữ liệu cá nhân, schema, hợp đồng API hay công thức AEB.

## Git status và điểm dừng

Nhánh `chuvv`; không có thay đổi chưa commit trước khi bắt đầu. Sau Đợt 1 chỉ có
hai page và test ở danh sách trên Modified, báo cáo này Added trong completed/; không Deleted.
Không git add/commit/push/merge/reset/clean hoặc revert thay đổi khác.
Không có lỗi code/check chưa xử lý trong phạm vi Đợt 1; live backend/CARLA/DB/Figma chưa xác minh.

Đợt 1 hoàn thành ở phạm vi source và browser fixture; dừng hẳn và chờ người dùng tự commit.
Commit gợi ý:
`refactor(analysis): remove frontend kinematics predictions`.
Không chạy bất kỳ công việc của Đợt 2 khi chưa có lệnh tiếp tục của người dùng.
