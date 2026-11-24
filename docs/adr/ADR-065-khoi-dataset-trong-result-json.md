# ADR-065 — Khối `dataset` trong `result.json` của run CARLA cho Failure Analysis

**Trạng thái:** Accepted 24/11/2026 — theo yêu cầu trực tiếp của người dùng: `result.json` phải gồm mọi dữ liệu cần thiết có trong dataset phân tích lỗi AEB (23/11/2026, 800 run).
**Liên quan:** [ADR-055](ADR-055-chot-chi-so-va-che-do-aeb-tat-13-11.md) (chỉ số, AEB OFF), [ADR-042](ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md) (lõi Java), [hợp đồng chỉ số](../vehicsim/analysis-metrics-contract.md).

## Bối cảnh

Dataset phân tích lỗi (174 cột) ghép nhiều nguồn: `result.json`, `sensors/*`, `lifecycle.json`, git, hash file và một script ngoài repo tính các cột `d_*`. `result.json` chỉ có khoảng 100 cột trong số đó. Module Failure Analysis cần dựng lại một run từ một JSON mà không đoán: định danh từng run, cấu hình thực, ba objective canonical kèm nguồn/phiên bản metric, **nội dung** frames và ground truth (số dòng CSV không thay thế nội dung), collision evidence riêng, đơn vị/hệ tọa độ, hash theo từng run và trạng thái missing/invalid/conflicting.

## Quyết định

Sau khi worker thoát (lúc `sensors/*` đã đủ), `RunService` gọi `RunDatasetWriter.attach` ghép thêm khóa cấp cao **`dataset`** vào `result.json` của run CARLA; `outcome` và `evaluation` giữ nguyên từng byte. Khối gồm:

| Mục | Nội dung |
|---|---|
| `identity` | `run_id`, `scenario_id`, `scenario_version_id` = `variant_id`, `aeb_version_id`, xe, `seed`, `aeb_mode`, `purpose`, `baseline_run_id`, simulator. `repetition` (lần lặp của cùng cấu hình) và `attempt` (số lần worker nhận run), hai cột mới của `simulation_runs` (migration 019) |
| `config` | bundle thực: `aeb` (4 tham số), `vehicle` (kích thước, phanh, CARLA), `variant` (tốc độ, thời tiết, ma sát…), `road_friction` |
| `objectives` | `rms_jerk_mps3`, `impact_speed_mps`, `stopping_distance_m`: giá trị ở `outcome.metrics` **và** `evaluation.aeb_result`, cờ `consistent`, nguồn, phiên bản metric (simulator, engine, `AnalysisMetrics.VERSION`), định nghĩa impact, bộ lọc jerk |
| `provenance` | `git_commit`, phiên bản CARLA (theo định danh simulator), `core_jar_sha256`, `bundle_sha256`, `xosc_sha256`, và `files`: kích thước, SHA-256, số dòng của từng file của run |
| `sensors` | `sensors/summary.json` nguyên văn (nhóm B) |
| `collisions` | danh sách sự kiện từ `collisions.json` (actor, thời điểm, tốc độ trước va chạm, xung lực), giữ riêng với cờ `collision` của result |
| `time_series` | nội dung `frames.csv` (brake/throttle/steer/radar…) và `ground_truth.csv` (vị trí, hướng, vận tốc) dạng cột + hàng; mốc thời gian, đơn vị, hệ tọa độ |
| `derived` | nhóm C: các cột `d_*` (`RunDataset`) kèm `role = REFERENCE_ONLY`, phiên bản, công thức F02–F17, nguồn đầu vào, `caveats`, `null_reasons` |
| `status` | mỗi mục: `OK` / `MISSING` / `INVALID` / `CONFLICTING` kèm lý do (ví dụ cờ va chạm khác `collisions.json`, hai nơi chứa objective khác nhau) |

**Cập nhật 24/11/2026 (sau kiểm thử file mẫu run 2499 của đồng đội, mục C02–C08):**

| Mục | Thay đổi |
|---|---|
| C08 `objectives` | Mỗi objective có `state`/`reason` riêng: `OK`, `NOT_APPLICABLE` (impact khi không va chạm; RMS jerk và quãng phanh khi `brake_onset_t = null`), `MISSING` (điều kiện áp dụng có mà thiếu số, hoặc không biết điều kiện), `INVALID`, `CONFLICTING`. Bỏ câu "null nghĩa là không áp dụng" áp chung |
| C05 `time_series.quality` | Mặt nạ dòng `[từ, đến]` cho mỗi bảng: `initialization` (< 0,5 s), `implausible_acceleration` (\|a\| > 50 m/s², cùng hằng với `sensor_recorder.py`), `post_contact` (từ tiếp xúc đầu tiên); trạng thái theo tín hiệu. Dữ liệu thô giữ nguyên. Số dòng phi lý lệch `summary.json` thì `CONFLICTING`. Mục `status.signal_quality` mới, trạng thái `FLAGGED` khi có dòng bị đánh dấu |
| C04 `time_series.clock` | Đồng hồ máy đọc: `id`, định nghĩa t0, từng luồng (`frames_csv`, `ground_truth_csv`, `core_frames`) với world frame đầu/cuối, t đầu/cuối, bước; `alignment` ghép hai luồng recorder theo world frame id (`OBSERVED`) và lõi với recorder theo thời gian gần nhất (`DECLARED`, lõi không ghi world frame id) |
| C02 `provenance.embedded_payloads` | SHA-256 của chính dữ liệu đã nhúng (frames, ground truth, collisions, summary) theo quy tắc `spec` (Python `json.dumps(…, ensure_ascii=False)`), bên nhận tính lại được không cần file gốc. Hash file gốc ghi rõ là `DECLARED` |
| C06 `config.aeb_version` | Dòng `aeb_versions` lúc ghi kết quả: `version_no`, `label`, `status_at_result_time`, `is_project_baseline_at_result_time`, `verification = DECLARED`. Không chứng nhận baseline hay hiệu chuẩn |

Bộ từ vựng trạng thái: `OK` / `MISSING` / `INVALID` / `CONFLICTING` / `FLAGGED` (mục) và thêm `NOT_APPLICABLE` (từng objective). C07 (nhãn `LOW_FRICTION` sai của `Evaluation`) là lỗi luật chấm có từ trước, ghi ở TD-63, không sửa trong khối này. C01 (adapter đọc JSON) thuộc phần Phân tích.

**Cập nhật 24/11/2026 (lần 2, C08 bằng chứng và C09):** `GET /api/v1/vehicsim/variants/{variantId}/collection` (`RunCollectionService`) xuất
file gộp `vehicsim.run-collection/v1` của một biến thể: mọi run CARLA `COMPLETED` (mọi purpose) trong project đang mở, **mỗi run giữ nguyên
tài liệu `result.json`** ở `runs[]`, cùng `manifest` (định danh, ON/OFF, `repetition`, `attempt`, `document_state`, `dataset_source`,
`document_sha256` theo cùng quy tắc digest), `groups` (cùng AEB version + xe + simulator + seed; liệt kê run ON và OFF, `on_off_comparable`,
ghi chú khi thiếu lần lặp hoặc thiếu OFF), `excluded` (số run động học và run CARLA chưa hoàn tất) và `status`. Không gộp hay trung bình số giữa
các run (`rules.no_cross_run_aggregation`); không niêm phong (`sealed = false`). Run có trước ADR này chưa có khối `dataset`: khối được dựng lúc
xuất (`captured_when = COLLECTION_EXPORT`, `dataset_source = BUILT_AT_EXPORT`), không ghi lại vào đĩa, `git_commit = null`, và trạng thái phiên bản
AEB nằm ở `status_at_export_time` (hai trường `*_at_result_time` là `null` vì không còn biết). Khối ghi lúc chạy mang `captured_when = RESULT_WRITE`.

**C01 (24/11/2026, sau khi gộp nhánh `chuvv`):** `JsonInputAdapter` của module Failure Analysis (`com.vsos.core.failureanalysis`, ChuVV) đọc trực tiếp
`vehicsim.result/v1` có khối `dataset` và `vehicsim.run-collection/v1`. Thử trên file v2 của run 2499 và hai file gộp (biến thể 1033, 1034):
`OfflineDiagnosticAnalysis` báo `input=COMPLETE`, sinh báo cáo cho từng run và tự ghép ON với OFF trong file gộp. Container vẫn `UNVERIFIED` (chưa có hash kỳ vọng
độc lập) và `declared_collection.sealed = false`: đúng như ADR này khai báo, không phải lỗi. Khi gộp đã sửa `ConsumerSourceInspection`: hash nguồn consumer được
ghim trên byte CRLF của máy Windows nên test lỗi trên mọi checkout LF (CI Linux); nay chuẩn hóa về LF trước khi băm và ghim lại 8 hash (nội dung 8 file đúng
bằng `baf0892d`).

Bằng chứng xuất thật từ DB dev (project 4, `-xosc15`): biến thể 1032 (ON 2498 không phanh, OFF 2510), 1033 (ON 2499 và OFF 2511 đều va chạm),
1034 (ON 2500 phanh dừng an toàn, OFF 2512). Ra đủ các nhánh `NOT_APPLICABLE` của C08 từ dữ liệu thật; `MISSING`/`INVALID`/`CONFLICTING` chỉ có
bằng chứng từ test (`RunDatasetWriterTest`), không dựng dữ liệu giả để minh họa. Chưa có lần lặp ON thứ hai nào trên `-xosc15`: muốn có phải
chạy thêm CARLA.

Nguyên tắc: không điền giả. Trường chưa thu được là `null` kèm lý do; module phân tích đọc thành `UNKNOWN`. Lỗi khi dựng khối chỉ ghi `status.build = INVALID`, không bao giờ làm run thất bại.

**Nhóm C là số tham khảo.** `RunDataset` (lõi Java, thuần JDK) tính độc lập từ `outcome.frames`, `outcome.metrics` và ground truth theo công thức của dataset; không thay công thức của `Evaluation`/`AnalysisMetrics` (V3), không làm objective, không phải bằng chứng đã xác nhận. Các cột cần nhiều run (`d_impact_speed_reduction_mps` = AEB OFF − ON, thống kê lặp, candidate lỗi `FALSE_BRAKING`…) **không** vào `result.json`; chúng thuộc phần Phân tích (Dataset v2).

## Không đổi

Định danh run (`-xosc15`, `vehicsim-kinematic-1.4`), số liệu và luật chấm. Có **một migration**: [019](../../database/mysql/migrations/019_2026-11-24_lan-lap-va-lan-thu-cua-run.sql) thêm `simulation_runs.repetition` và `attempt` (DB đã có phải chạy trước khi dùng backend mới). Khối chỉ nằm trên đĩa: `persist` vẫn chỉ lưu `outcome`/`evaluation`/artifact vào DB, nên DB không phình. Run đã có trước ADR này không có khối `dataset`; không tái dựng cho run cũ. Kinematic không ghi file nên không có khối. Run CARLA nộp từ máy khác (`submitCarlaResult`) cũng chưa có khối (thiếu `sensors/` ở backend).

## Hệ quả và giới hạn

- `result.json` tăng khoảng 160 KB mỗi run (chủ yếu `time_series`). `generated_at_utc` đổi mỗi lần dựng: so sánh hai lần chạy phải so `outcome`/`evaluation`, không so cả file.
- `repetition` = số run đang có cùng (biến thể, AEB, `aeb_mode`, xe, simulator, seed) + 1, tính lúc tạo run (`RunService.nextRepetition`); xóa run cũ thì số lặp quay về, hai lệnh tạo đồng thời có thể cùng một số (không ràng buộc duy nhất vì mỗi run có `run_id` riêng). `attempt` tăng ở bước `PENDING → RUNNING`: 0 = chưa chạy, 1 = chạy bình thường, 2 trở lên = run bị khôi phục sau khi backend chết. Run cũ được đánh số lại trong migration 019 (`repetition` theo thứ tự id, `attempt` = 1 nếu đã có `started_at`; không biết run cũ từng bị nhặt lại mấy lần).
- Hằng "0,10 s" trong quãng cần dừng (CT 31b) lấy từ dataset (khớp 18,1812 m của FA-G1-001-R1); cần xác nhận nguồn gốc vật lý của nó trong tài liệu công thức.

## Kiểm chứng

`RunDatasetTest` (số chuẩn của dataset: quãng cần dừng 18,1812 m, biên dừng 0,0238 m, liên tục ở ranh giới pha tăng lực, giảm tốc đỉnh/trung bình, PET, clearance, xung đột nếu không phanh), `RunDatasetWriterTest` (đủ mục, thiếu cảm biến thành `MISSING`, mâu thuẫn thành `CONFLICTING`, ghi lại `result.json` giữ nguyên `outcome`). Thử trên run CARLA thật 2499 (Sprinter, va chạm): khối đủ mục, 786 dòng ground truth, các `d_*` khớp quan hệ (biên dừng = D − d_req; mốc muộn nhất sớm hơn quyết định thực 0,29 s).
