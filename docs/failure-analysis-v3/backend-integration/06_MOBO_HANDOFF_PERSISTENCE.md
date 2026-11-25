# BE-R1 — Handoff storage không phải quyền chạy MOBO

Existing MoboHandoffBuilder được gọi khi toàn bộ delivered population có report hợp
lệ. BE-R1 không có independently authorized frozen selection/quality policy/baseline
registry, nên builder nhận null selection/policy/bindings và unknown sourced domains.
Đây là genuine diagnostic export, **không phải operational handoff được phê duyệt**.
Không chuyển collection project/scenario labels thành reviewed cohort.

Builder giữ schema `vehicsim.failure-analysis-mobo-handoff/v1`, canonical aggregation
version `adr040-stored-aggregation/1`, unknown baseline scores, diagnostic-only member
roles, no invented parameter hints/ranges và NOT_DIRECTLY_CONSUMABLE. Không có optimizer,
trial, candidate, regression, calibration hoặc producer side effect.

ConsumerCompatibilityValidator cũng được tái sử dụng. Packaged REST deployment chưa
có reviewed source checkout/probe/currentness bundle. Existing ConsumerSourceInspection.read
được gọi trên thư mục trống do server sở hữu để tạo **explicit missing-source profile**:
source artifacts UNVERIFIED, hashes null, texts empty, audited=false. Không dùng empty
map Profile gây lỗi ref; không fake source text/hash hay coi bytecode là Java source.
Compatibility result vì thế BLOCKED/UNKNOWN ở các claim cần audited source, dispatch=false.
Đây không là kiểm chứng current deployed consumer parity; M1D source/probe tests vẫn
chạy riêng. Handoff builder literal compatibility và missing-source validator status
được giữ riêng, không reconcile bằng tăng readiness.

Handoff resource metadata: project/source/execution/context/core, builder schema,
semantic digest, byte SHA, status, blockers, complete compatibility report, created time.
Payload giữ original builder bytes. Semantic digest dùng HandoffSnapshots.digest,
không AnalysisService dataset-v2 digest. GET/download kiểm cả byte và content integrity.

| Điều kiện | Status resource | Download |
|---|---|---|
| Complete input/reports, builder tạo được output | DIAGNOSTIC_ONLY; dispatch_allowed=false | Original M1C JSON |
| Population incomplete, member failed hoặc empty | BLOCKED; INCOMPLETE_INPUT_POPULATION | 409 HANDOFF_NOT_GENERATED |
| Builder không tạo được output | BLOCKED; HANDOFF_BUILD_FAILED | 409 |
| Builder tạo được nhưng compatibility unavailable | DIAGNOSTIC_ONLY + explicit validation blocker | Giữ output builder; không tự xóa evidence |

Không có READY path trong BE-R1. Independent approved context/cohort/domain integration
chưa implement. Future task phải có server-authorized binding/currentness/partition
resolver và đưa identity/digest vào execution determinants trước khi chấp nhận context_id.
Không nhận approval packages do browser tự gắn VERIFIED/APPROVED, không lấy archive
dataset-v2 handoff_ready làm authority thay thế.

Để chạy MOBO thật vẫn cần consumer M2: exact frozen cohort/seed/rep handling,
canonical aggregation parity, baseline objectives, enforced custom bounds và sealed
validation consumption. BE-R1 không sửa các class consumer và không gọi optimization API.
