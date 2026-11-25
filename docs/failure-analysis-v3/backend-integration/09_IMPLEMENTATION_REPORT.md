# BE-R1 — Implementation và bàn giao

Repository HEAD khi bắt đầu: `d712146c2ee03de8d751725c506eb1d4a814d2d8`.
Phạm vi: JSON-first REST và persistence riêng Module3. Giữ các thay đổi FE-R1/2/3
đã có; không stage/commit/push/merge, không chạy CARLA/MOBO, không sửa producer,
AnalysisService, auth/shared transport, core algorithms hoặc dữ liệu lịch sử.

## Trạng thái thực hiện

| Hạng mục | Phân loại | Bằng chứng / giới hạn |
|---|---|---|
| Immutable byte source + project-scoped REST | IMPLEMENTED / TESTED | Source/core/HTTP + MySQL test; schema migration020 additive |
| Existing adapter/DiagnosticReport orchestration | IMPLEMENTED / TESTED | Result2499 và collections1032/1033/1034; không parser/formula thứ hai |
| Atomic execution/report/handoff persistence | IMPLEMENTED / TESTED | JDBC reload, UNIQUE race, trigger child failure rollback, FK/corruption tests trên MySQL8.4 riêng |
| Default context | IMPLEMENTED / TESTED | AnalysisContext.empty; không verified baseline/calibration/cause giả |
| Operational approved context/cohort integration | BLOCKED / NOT_IMPLEMENTED | Chưa có independent registry/resolver; context_id409; không giả approved selection |
| Diagnostic-only M1C handoff + compatibility | IMPLEMENTED / TESTED | Existing builder/validator; missing consumer source profile, dispatch=false |
| Production DB migration / deployed HTTP+DB smoke | NOT_IMPLEMENTED | Chỉ container test riêng, không dùng application DB; cần review/apply migration và deployment smoke |
| FE-R4 / consumer M2 / producer changes | NOT_IMPLEMENTED | Nhiệm vụ riêng |

Full commands/counts/fail/skip/build và evidence manifest ở [08](08_TEST_REPORT.md).
Focused527/527 pass gồm actual MySQL10 tests; full clean verify1729 total,
1720pass/9skip/0fail/error và BUILD SUCCESS; frontend regression63/63pass.
Contract chính xác cho FE-R4 ở [03](03_REST_API_CONTRACT.md); đây không phải lời
tuyên bố frontend đã tích hợp API hoặc MOBO đã chạy được.

## Lỗi tích hợp nhóm yêu cầu đối chiếu

`FIX_IN_SCOPE` nghĩa phần sửa nằm trong BE-R1/Module3 mới; chỉ ghi TESTED khi test thực
sự chạy. `FOLLOW_UP` nghĩa chưa được sửa ở đường tương ứng. Không dùng characterization
test PASS để tuyên bố bug legacy đã hết. Các negative mutations dưới đây là synthetic,
được dựng từ bản sao input thật, không sửa fixture gốc.

| ID | Finding / source | Owner | Phân loại | Xử lý và acceptance thực tế |
|---|---|---|---|---|
| INT-01 | Collection thiếu member result, manifest vẫn khai báo run | Module3 boundary | FIX_IN_SCOPE | Adapter giữ blocked/missing entries; partial execution lưu report hợp lệ; không handoff giả. Service + MySQL partial test |
| INT-02 | Result cũ thiếu dataset hoặc schema cũ chưa hỗ trợ | Module3 boundary | FIX_IN_SCOPE | Giữ DATASET_REQUIRED/block hoặc JSON_SCHEMA_UNSUPPORTED; không reconstruct từ DB. IntegrationFindings test |
| INT-03 | Producer không tìm được original result.json / collection export thiếu input | Module2 | FOLLOW_UP / DEP-M2-01 | Chỉ kiểm chứng delivered boundary; không sửa RunCollectionService/RunDatasetWriter/RunService |
| INT-04 | Collection đã cũ nhưng internal digests vẫn đúng | Module3 currentness | FOLLOW_UP | Tuổi file không chứng minh stale so với DB/cohort mới nhất. Source ghi UNKNOWN_NO_AUTHORITATIVE_COHORT, không READY; test export timestamp cũ |
| INT-05 | Export revision/currentness evidence chưa được cấp | Module2 + cohort owner | FOLLOW_UP / DEP-M2-02 | Cần source references/export population/revision evidence có authority; timestamp/checksum không thay approval |
| INT-06 | ReviewerScope trả archived workspace/project để đọc lịch sử; role check không là write-state gate | Module3 REST mới | FIX_IN_SCOPE | FA-specific project/workspace ACTIVE gate trước compute và row-lock recheck trong transaction; đọc lịch sử không bị đổi; HTTP + actual MySQL archive test |
| INT-07 | Lifecycle/role/default project behavior của shared/legacy endpoints | Shared access + legacy Module3 | FOLLOW_UP | Không sửa ProjectAccess/ProjectScope/ReviewerScope/SecurityConfig hay legacy AnalysisService. ADMIN/MANAGER default-project limitation vẫn theo TD-30 |
| INT-08 | AnalysisService.freeze hardcode evaluation.impact=EGO_SPEED_NOT_RELATIVE cho xosc15 | Module3 legacy metric | FOLLOW_UP | Real AnalysisService characterization tái hiện label sai; real xosc15 resolver cho RELATIVE_SPEED_CORE_COLLISION_TICK. Không sửa source/historical snapshot trong BE-R1 |
| INT-09 | Repository import service làm architecture gate fail ở lần full test đầu | Module3 BE-R1 | FIX_IN_SCOPE | FA codec chuyển common/analysis, FA exception chuyển exception/analysis; không nới ArchitectureRulesTest |

## Dependency tickets cục bộ — chưa gửi lên tracker ngoài

**DEP-M2-01 — Khôi phục/đảm bảo export collection đủ source.** Owner Module2.
Evidence: RunCollectionService.collection giữ manifest và status MISSING khi document
không có; adapter test mô phỏng một document bị thiếu. Yêu cầu nhóm cung cấp export
thật tái hiện lỗi, run IDs, producer revision và source availability; không dùng
synthetic deletion như bằng chứng lỗi producer đã được sửa. Acceptance: export giữ
mọi declared member, reason cụ thể khi missing, original bytes/hash/provenance truy
vết; Module3 nhận partial đúng. Không yêu cầu tự sinh telemetry/calibration bị mất.

**DEP-M2-02 — Collection freshness/revision evidence.** Owner Module2 + cohort owner.
Evidence: collection.generated_at_utc/sealed=false chỉ là thời điểm export, không
authorized frozen cohort. Acceptance cần export identity/revision/population evidence
được xác nhận, định nghĩa stale/as-of và authority interface thống nhất. Module3 chỉ
validate input, không truy DB producer để tự phán latest hay sửa producer contract.

**FU-M3-01 — Legacy impact provenance theo profile.** Owner Module3 metric/backend.
Scope task sau: version-aware descriptor cho snapshot mới, explicit archive compatibility,
tests current relative vs old ego profiles và missing metadata. Giữ canonical scalar
và historical snapshots. Không đổi nhãn archive bằng migration/backfill ngầm.

**FU-M3-02 — Approved context/currentness adapter.** Owner Module3 + reviewer/domain owners.
Cần independently authorized baseline/requirements/calibration, quality policy và frozen
optimization/validation split, với digest/currentness registry. Test stale baseline,
changed cohort, denied context, validation isolation trước khi mở context_id. Không
nhận browser APPROVED flags và không gọi optimizer để “kiểm tra thử”.

## Các file và ranh giới

FA production additions: controller/analysis/FailureAnalysisController,
service/analysis/FailureAnalysisService, common/analysis/FailureAnalysisJson,
repository/analysis/FailureAnalysisStore, exception/analysis/FailureAnalysisException,
core/failureanalysis/RestJsonAnalysis. Chỉ facade mới ở core, không sửa class core có sẵn.
Tests FA mới và migration020; `01_schema.sql`/database-schema.md chỉ bổ sung FA storage.
Source/status/hash evidence và danh sách chính xác được ghi ở evidence manifest cuối.
`evidence/git-status-final.txt` chứa nguyên git status --short; gồm cả thay đổi FE đã
có trước BE-R1. `evidence/scope-guard.json` phân biệt các file thực sự do BE-R1 sửa,
giữ nguyên existing frontend/core/producer/auth source và không xóa file có sẵn.

Không sửa AEB/CARLA/calibration/Evaluation/AnalysisMetrics/AnalysisService/RunService/
RunCollectionService/OptimizationService/MoboEngine/Regression/API legacy/frontend.
Giữ dataset-v2 handoff và M1C handoff tách biệt. Dừng ở BE-R1.
