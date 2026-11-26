# BE-R1 — Khả năng phân tích từ JSON nguồn

JSON là input chính. `telemetry_json` hiện tại là projection của outcome/evaluation;
không giữ nguyên outer result, dataset, collection manifest hoặc original bytes.
`simulation_artifacts.storage_path` chưa cung cấp hợp đồng immutable byte digest,
project-scoped intake và report lifecycle cần cho REST V3. Không dựng lại input từ DB.

Nguồn kiểm tra: `JsonInputAdapter`, `FailureAnalysisInput`, `RunService.persist`,
`RunCollectionService`, ADR-065 và các input thật tại
`../handover/examples/inputs/`. Core và producer hiện có được giữ nguyên.

| Evidence cần | JSON/path thật | Tình trạng | Kiểm tra / ảnh hưởng |
|---|---|---|---|
| Schema | `/format`, `/dataset/format`; collection `/runs[]/result` | AVAILABLE | Adapter nhận result/v1 + run-dataset/v1 hoặc run-collection/v1; root version khác bị từ chối |
| Member population | `/manifest[]`, `/runs[]`, `/status` | AVAILABLE cho collections | Adapter kiểm document digest, wrapper/member copies, duplicates và missing documents; không bỏ member bị chặn |
| Identity | `/dataset/identity`, collection `/collection` | PRODUCER_DECLARED | Run/variant/seed/mode/repetition/attempt giữ riêng; không là DB authorization |
| AEB config | `/outcome/params`, `/dataset/config` | AVAILABLE | Adapter/core phát hiện copy conflict; không đổi thông số |
| Ba objective | `/outcome/metrics/{rms_jerk_mps3,impact_speed_mps,stopping_distance_m}`, `/evaluation/aeb_result` | AVAILABLE, có null | CanonicalObjectiveReader giữ nguyên producer values và disagreement; không tính lại để thay số |
| Telemetry/trajectory | `/outcome/frames`, `/dataset/time_series` | AVAILABLE theo stream | Adapter kiểm embedded digest, clock/units và budget; core giữ missing/quality riêng |
| Contact | `/dataset/collisions`, `/dataset/sensors` | AVAILABLE theo input | Event count, canonical collision và physical outcome là ba claim khác nhau |
| Clock/geometry | Dataset stream metadata + recorded rows/config | PARTIAL | Có timestamp không đồng nghĩa clock được align hoặc full bbox được xác nhận |
| Provenance | `/dataset/provenance`, `/source`, `/simulator` | PARTIAL | File hashes/producer declarations không chứng minh deployed binary equivalence |
| Applied command writer/consumption | Các stream được producer ghi | INSUFFICIENT khi không có | Core giữ UNKNOWN; không dùng pedal readback để xác nhận AEB đã tác động |
| Approved baseline/v1 | Không có independent binding trong các JSON này | REQUIRES APPROVED CONTEXT | ID/version/parameter tuple khai báo không tự thành verified baseline |
| Calibration/caution/requirements/certificate | Không có authority package được server pin | REQUIRES APPROVED CONTEXT | Root cause/physical limit/absence policy không tự xác nhận |
| Frozen optimization/validation cohort | Không được cấp bởi collection export | MISSING AUTHORITY | Handoff diagnostic-only, không tự chọn partition hay tạo baseline score |

Năm input được test: result 2499 bản gốc và v2; collections 1032, 1033, 1034.
Ba collections có sáu run riêng: ON 2498/2499/2500 và OFF 2510/2511/2512;
không coi standalone 2499 và member 2499 là hai run độc lập của một frozen cohort.
Các nguồn là các resource khác nhau vì container bytes/pointers khác nhau.

`COMPLETE` của input manifest chỉ nói population được giao cho adapter đã đọc đủ;
không nói evidence đủ để xác nhận cause hoặc toàn bộ scenario đã freeze.
Report có thể hữu ích trong khi physical outcome/baseline/cause vẫn UNKNOWN.
File/hash/counts thực tế và response được ghi trong `evidence/` và báo cáo test 08.
