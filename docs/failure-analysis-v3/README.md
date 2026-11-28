# Tài liệu tổng hợp Admin và Phân tích lỗi

Cập nhật 26/11/2026: phần Admin dựa trên mốc `main` `668f1504`; phần runtime V3
đối chiếu source triển khai tiếp theo sau audit. Tài liệu này thay các
audit, blueprint, implementation report và handover theo từng đợt của phần
Admin/Analysis do chuvv thực hiện. ADR và hợp đồng chỉ số dùng chung vẫn là nguồn
quyết định; không coi trạng thái trong báo cáo cũ là hiện trạng code.

## Phạm vi và bản đồ code

| Phần | Điểm vào | Source chính |
|---|---|---|
| Admin | `/admin/users`, `/admin/workspaces`, `/admin/tech-references` | `frontend/src/components/admin/`; backend AdminController/AdminService/AdminRepository |
| Analysis legacy | `/analysis/failures`, `/[runId]`, `/[runId]/playback` | BaselineAnalysisDashboard, AnalysisService, AnalysisViewService và helpers analysis |
| Analysis V3 | Workspace trên, chọn run/biến thể DB → execution/report UUID | FailureAnalysisV3, FailureAnalysisV3Report, FailureAnalysisDatabasePicker, services/failureAnalysisV3.ts |
| REST/persistence V3 | `/api/v1/vehicsim/analysis/v3` | FailureAnalysisController, FailureAnalysisService, FailureAnalysisDatabaseAdapter/Repository, FailureAnalysisStore |
| Context và consumer V3 | Rà soát tập đã chốt → phân tích V3 → `/aeb/mobo/new?handoff_id=…&handoff_digest=…` | FailureAnalysisHandoffService/Adapter, OptimizationService |
| Core khoa học | JSON/raw artifacts → evidence → diagnostic → handoff → compatibility | `src/main/java/com/vsos/core/failureanalysis/` |
| Module khác | Producer CARLA, optimizer, regression | Chỉ tham chiếu; tài liệu này không thay hợp đồng hoặc triển khai của các module đó |

Core intake: FailureAnalysisInput/JsonInputAdapter/RawArtifactAdapter; validation
và giới hạn: EvidenceValidator/InputResourcePolicy/BoundedInput; objective:
CanonicalObjectiveReader/MetricProvenanceResolver/ObjectiveExplainer; physics:
GeometryEngine/StoppingModel/AvoidabilityAnalyzer/ImpactAnalyzer; diagnosis:
AebTimelineBuilder/DiagnosisPolicy/HypothesisInvestigator; composition:
DiagnosticReport/AnalysisContext; handoff: MoboHandoffBuilder/CanonicalAggregation/
BaselineBindingResolver/ParameterHintBuilder/SearchRangeResolver; compatibility:
ConsumerCompatibilityValidator/HandoffSchemaValidator. Core không phụ thuộc Spring/DB.

## Admin

`/admin` redirect tới users. AdminFrame có AuthGate; sidebar dùng VehicSimShell
chung. Ba trang quản trị là tài khoản, workspace và tài liệu kỹ thuật; không có
Overview, Audit Logs hay System Settings riêng để tiếp tục redesign.

API có prefix `/api/v1/vehicsim`:
`/admin/{users,workspaces,tech-references}`: GET list/detail, POST create,
PUT update, không DELETE. Writes có requireAdmin/limitWrites; self/dependency
guards giữ ở backend. Admin không quản lý workspace members: việc đó thuộc
Manager/WorkspaceController, exact-email candidate lookup và member role rules.

Search áp dụng bằng Enter/nút Tìm; draft input khác query đã áp dụng. URL giữ
filter/page; list/detail bỏ response cũ theo request/context; save lỗi giữ draft,
không báo thành công trước response hoặc tự retry mutation không rõ kết quả.
Dialog giữ dirty/review/busy, focus return, Tab/Escape, scroll lock và ref submit lock.
URL tài liệu chỉ http/https; DECIMAL giữ dạng string khi cần precision.

Đổi role/status có auth_version/session revocation ở backend; Admin không thể
đổi email tài khoản đã tạo. UI guard
không thay authorization. ENGINEER/REVIEWER theo workspace membership; EXPERIENCER
theo project cá nhân; ADMIN/MANAGER còn giới hạn default project TD-30.
Đọc [ADR-064](../adr/ADR-064-ky-su-tao-project-cua-workspace.md) và source security
trước khi sửa scope. Các bất biến Admin không được suy từ menu đang hiển thị.

## Analysis legacy

`/analysis/runs` và `/analysis/runs/{id}` trả run projection/inspection;
`/failures` là danh sách lỗi có query scope khác, không dùng tổng lỗi làm tổng run.
`/runs/{id}/playback` và bundle/xosc/carla-data dùng numeric run ID/project scope.
V3 report UUID không được đưa vào các route numeric này.

Dataset legacy `vehicsim.analysis-dataset/v2` lưu trong analysis_results:
POST `/analysis/selections` nhận scenario_id, baseline_id,
optimization_run_ids, validation_run_ids và run_revisions. Hai tập phải độc lập
theo variant, mỗi tập có ca an toàn; unique variant+seed; cùng baseline/xe/simulator/dt.
Run lỗi/timeout/thiếu trace hoặc thiếu objective cần thiết không được chốt.
GET `/analysis/datasets/{id}` đọc archive; GET `/{id}/handoff` kiểm lại baseline,
revision và digest, không dispatch optimizer. V1 chỉ đọc, không tự nâng thành V2.

Giữ account/project isolation, deep links và lựa chọn khi đổi view; không sửa
snapshot đã lưu theo draft. KPI/search/sort trong trang không được gọi là tìm
toàn bộ DB. Dashboard còn phân trang sau khi tải scope trong Java (TD-53).
Outcome precedence giữa dashboard/failure list/detail khác nhau. SQL joins có
nguy cơ lặp run khi nhiều failure rows; cần contract test xác định grain trước
khi đổi denominator. Related runs chưa đủ identity để tự gọi là cặp A/B hợp lệ.

## Chỉ số và evidence

Đọc [hợp đồng chỉ số](../vehicsim/analysis-metrics-contract.md) và
[ADR-055](../adr/ADR-055-chot-chi-so-va-che-do-aeb-tat-13-11.md) trước khi đổi mapping.
Ba mục tiêu giữ giá trị producer/null và `adr040-stored-aggregation/1`; không
re-score từ sensor hoặc dùng failure labels làm optimizer targets.

| Dữ liệu | Nguyên tắc |
|---|---|
| Speed | m/s; hiển thị km/h nhân3,6 đúng một lần |
| TTC | Perceived và ground truth là hai nguồn; thiếu perceived không lấy GT thay |
| Impact | Profile mới là vận tốc tương đối; profile legacy có thể là ego speed. Giữ simulator identity/vintage; không gộp hai định nghĩa |
| RMS jerk | CARLA theo filter/window profile; kinematic khác cadence/filter. Chart jerk không thay canonical RMS |
| Stopping | Tách trace đã đi và modeled tail; ngoại suy không phải quãng dừng đã đo |
| Missing/NA | Null không thành0; metric không áp dụng khác thiếu bằng chứng |
| AEB events | Command/decision/onset ghi trong controller không chứng minh phanh vật lý đã tác dụng |
| Confidence | Legacy rule score không phải xác suất hay confirmed cause |

Physical outcome, observed AEB behavior, failure candidate, feasibility, hypothesis,
evidence sufficiency và uncertainty là các trục riêng. Collision không tự chứng minh
lỗi AEB có thể tránh; empty contact events không tự SAFE. Thiếu coverage/requirements/
calibration/clock mapping giữ UNKNOWN. Không tự nối core clock với recorder bằng t=0;
không gọi contact count là full-body geometry proof. Timeline/playback dùng timestamps
đã ghi, không nội suy signal thiếu hoặc tạo marker từ duration/aggregate.

## Luồng dữ liệu DB

Luồng chính: chọn completed CARLA run/variant trong project → preflight/hash →
đọc original result.json đã persist trong DB → core pipeline → immutable source/execution/report/handoff.
Upload JSON là phương án tương thích nâng cao; refresh mở stored UUID, không reanalysis.

**Cập nhật 26/11/2026 theo yêu cầu DB là nguồn chính thức:** Module2 lưu nguyên byte
result cuối cùng vào `fa_json_sources` trong cùng transaction hoàn tất run. Khóa
producer là SHA-256 của `module2-result/v1:<project>:<run>:<attempt>`; metadata
`database_input.origin=MODULE2_RESULT_DATABASE` liên kết project/run/attempt.
`simulation_runs` cung cấp identity để đối chiếu toàn bộ dataset identity và checksum.
FA chỉ đọc nguồn producer đúng attempt qua service/repository; không mở artifact/file,
không dựng lại JSON từ scalar/telemetry, không chọn nguồn upload có cùng identity.
Thiếu nguồn persist trả `DB_RESULT_NOT_PERSISTED`; run lịch sử chưa lưu nguồn phải
chạy lại bằng producer mới. Không tự backfill từ đĩa hoặc sửa DB nhóm.
Thiếu dataset/schema, sai checksum hoặc DB/document identity bị chặn. Missing member
vẫn ở collection manifest, không bỏ thầm. Artifact paths chỉ phục vụ download/playback.

Collection chụp completed CARLA membership của variant, bọc original member bytes
theo run-collection/v1 và kiểm lại membership/identity khi đọc.
SHA vừa quan sát không phải producer signature hoặc authorized frozen cohort.
BOM bị chặn thay vì sửa bytes. Preflight không chạy physics hoặc ghi DB.

## API V3

Theo [ADR-067](../adr/ADR-067-api-failure-analysis-v3-va-4-bang-fa-json.md) và
[FailureAnalysisController](../../src/main/java/com/vsos/backend/controller/analysis/FailureAnalysisController.java).
Lỗi riêng hiện là `{code, detail, retryable}` ở cấp ngoài cùng, shared transport
đã đọc code; báo cáo cũ nói error.code lồng nhau đã lỗi thời.

| Method/path cùng base V3 | Request | Kết quả |
|---|---|---|
| GET /explorer/scenarios | q, limit 1..100, offset 0..100000, sort=id_asc/id_desc | Họ kịch bản và thống kê theo run AEB ON có report khớp nguồn; tìm theo tên, code hoặc ID scenario/variant/run trong project |
| GET /explorer/scenarios/{id}/runs | q, variant_id, run_id, aeb_mode, classification, failure_type, root_cause, physical_outcome, weather, ego_speed_min/max, initial_distance_min/max, limit, offset, sort | Run phân trang, các candidate/giả thuyết và ba objective canonical; điều kiện kịch bản đọc snapshot run_config_json |
| GET /explorer/scenarios/{id}/variants | q, without_runs, limit, offset, sort | Biến thể trong họ, kể cả biến thể chưa có run |
| GET /database/runs, /database/collections | limit1..20, offset0..10000 | Page completed CARLA runs hoặc variant cohorts |
| GET /database/runs/{id}, /database/collections/{id} | Numeric run/variant ID | Preflight availability, source_sha256, issues/missing fields |
| POST /database/runs/{id}/executions, /database/collections/{id}/executions | Không body; optional source_sha256 query |201 committed Execution; frontend luôn gửi preflight hash |

Explorer liên kết report qua project/run/attempt và checksum producer, source,
execution, report; với collection còn kiểm provenance thành viên. Mỗi run chỉ
được tính một report. Phạm vi kiểm hiện là nguồn và danh tính, **chưa xác minh lại**
hiệu lực context, baseline/catalog, calibration hoặc requirements; response nêu
`context_freshness=UNVERIFIED`. Vì vậy số lỗi xác nhận và số không lỗi có đủ bằng
chứng trả `null`, filter `CONFIRMED` chưa khả dụng. `SUSPECTED` là triệu chứng trong
report, không xác nhận lỗi hay nguyên nhân. OFF không vào thống kê AEB. Report cũ
không thể bind an toàn vẫn đọc được qua nguồn/lịch sử; không tính thay cho run.
Truy vấn đọc JSON/checksum trong DB; chưa benchmark trên hàng nghìn report lớn.

DB hash sai định dạng400, source đã đổi409, cross-project/absent404,
unavailable standalone422, vượt budget413. Client không gửi đường dẫn server.
Phần tài nguyên nguồn/upload, executions, reports và handoffs:
Lỗi chung404/400 và403/429 của VehicSimAccess đi qua ApiExceptionHandler;
module không bọc lại thành FA_ACCESS_OR_REQUEST_REJECTED/FA_INTERNAL_ERROR.

Base: `/api/v1/vehicsim/analysis/v3`. Tất cả route cần Bearer authentication và
project context hiện hành qua `ProjectAccess`/`X-VehicSim-Project`.
ADMIN/ENGINEER/EXPERIENCER được mutation, qua `requireEngineer` và `limitWrites`.
Các role được đọc trong project mà shared access policy cho phép. Không sửa auth.
Các mutation còn yêu cầu project ACTIVE và workspace ACTIVE khi có workspace;
FA repository kiểm lại state với row locks trong transaction. Shared policy vẫn
quyết định quyền đọc lịch sử; đây không là thay đổi toàn cục về archived access.

| Method/path tương đối | Request | Response |
|---|---|---|
| GET `/sources` | limit 1..20 (default20), offset 0..10000 | ResourcePage<Source> |
| POST `/sources` | `application/json`, raw result/collection bytes; optional `X-Source-SHA256` lowercase64hex | 201 Source; exact duplicate cũng 201 với cùng ID |
| GET `/sources/{id}` | UUID | Source + current identity peers |
| GET `/sources/{id}/download` | UUID | Exact original JSON bytes |
| POST `/sources/{id}/executions` | **Không body**; optional `context_id` đã lưu, phải khớp chính xác nguồn | 201 Execution đã commit; thiếu context dùng nhánh chẩn đoán; retry cùng determinants trả cùng ID |
| POST `/contexts` | dataset_id/dataset_digest, confirmed, reason, canonical_targets_only, calibration_not_applicable, nonhazard_run_ids; optional search_space | 201 context_id/context_digest/source_id và miền đã chốt; không nhận full result JSON |
| GET `/contexts/{id}` | UUID context trong project | Kiểm lại context/checksum/nguồn hiện hành, trả review và miền tham số |
| POST `/contexts/{id}/executions` | **Không body** | 201 Execution dùng collection từ original producer bytes trong DB và context đã lưu |
| GET `/executions` | optional source_id; limit/offset | ResourcePage<Execution> |
| GET `/executions/{id}` | UUID | Stored Execution metadata |
| GET `/executions/{id}/reports` | limit/offset | ResourcePage<ReportMetadata> |
| GET `/reports/{id}` | UUID | Exact DiagnosticReport JSON |
| GET `/reports/{id}/download` | UUID | Cùng bytes, attachment |
| GET `/handoffs/{id}` | UUID | Stored HandoffMetadata/status/blockers/compatibility |
| GET `/handoffs/{id}/download` | UUID | Exact builder JSON; 409 nếu chưa tạo |
| GET `/handoffs/{id}/campaign` | digest query = content_digest đã nhận | Projection `vehicsim.fa-v3-campaign/v1`; kiểm lại READY, context, nguồn, report và replay handoff |

Downloads đặt application/json, private/no-store và filename do server tạo từ UUID;
không nhận filename/path/URL của client. Legacy routes và dataset-v2 handoff giữ nguyên.
GET tài nguyên đã lưu không chạy lại phân tích. GET context/campaign kiểm currentness;
campaign projection còn replay builder để phát hiện handoff thay đổi. Không tự tạo
campaign: thao tác đó vẫn qua POST `/api/v1/vehicsim/optimizations`.

Typed contract (các object evidence sâu giữ đúng schema core, không flatten):

```ts
type UUID = string;
type SHA256 = string;
interface Resource {
  resource_schema: 'vehicsim.fa-rest-resource/v1';
  resource_kind: 'SOURCE'|'EXECUTION'|'REPORT'|'HANDOFF';
  id: UUID; project_id: number; source_id: UUID|null; execution_id: UUID|null;
  created_at_utc: string; byte_sha256: SHA256|null;
}
interface ResourcePage<T> { items: T[]; limit: number; offset: number }
interface Source extends Resource {
  source_schema: 'vehicsim.result/v1'|'vehicsim.run-collection/v1';
  source_sha256: SHA256; size_bytes: number; uploaded_by: number;
  status: 'COMPLETE'|'PARTIAL_OR_BLOCKED'; producer_authenticity: 'UNVERIFIED';
  freshness: 'UNKNOWN_NO_AUTHORITATIVE_COHORT'; reason_codes: string[];
  input_manifest: object; declared_member_identities: object[];
  producer_metadata: object[]; transport_expected_sha256: SHA256|null;
  identity_disagreement?: 'NONE_DETECTED'|'UNKNOWN_IDENTITY_INCOMPLETE'|
    'SAME_DECLARED_IDENTITY_DIFFERENT_BYTES'; other_source_ids?: UUID[];
}
interface Execution extends Resource {
  status: 'COMPLETED'|'PARTIAL'|'BLOCKED'; core_version: string;
  source_sha256: SHA256; context_id: UUID|null; context_digest: SHA256;
  context_policy: 'UNKNOWN_DEFAULT_NO_AUTHORITY'|'AUTHENTICATED_CANONICAL_TARGET_REVIEW';
  expected: number; accepted: number; analyzed: number;
  blocked: number; failed: number; missing: number;
  missing_is_subset_of_blocked: true;
  members: Array<{member_index:number; run_key:string|null;
    json_pointer:string; status:'ANALYZABLE'|'BLOCKED'|'ANALYZED'|'FAILED';
    reason_codes:string[]; issues:object[]; report_id?:UUID}>;
  input_manifest: object; handoff_id: UUID; runtime_ms: number;
  completeness_scope: 'DELIVERED_MANIFEST_ONLY_NOT_FROZEN_SCENARIO_COHORT';
}
interface ReportMetadata extends Resource {
  member_index:number; run_key:string; run_identity:object;
  report_schema:'vehicsim.failure-analysis/v1'; content_digest:SHA256;
  status:'GENERATED'; evidence_sufficiency:object[];
  core_version:string; context_id:UUID|null; context_digest:SHA256; source_sha256:SHA256;
}
interface HandoffMetadata extends Resource {
  status:'BLOCKED'|'DIAGNOSTIC_ONLY'|'READY'; dispatch_allowed:boolean;
  handoff_schema:'vehicsim.failure-analysis-mobo-handoff/v1'|null;
  content_digest:SHA256|null; reason_codes:string[];
  consumer_compatibility:object|null;
  core_version:string; context_id:UUID|null; context_digest:SHA256; source_sha256:SHA256;
}
interface FAError {code:string;detail:string;retryable:boolean}
```

Source list returns persisted metadata; optional identity_disagreement/peers are
resolved on source detail/ingest. Error resource codes: 400 bad hash/pagination/body,
401 unauthenticated, 403 role/project policy, 404 absent/cross-project/invalid UUID,
409 stored integrity/version/context unavailable or handoff absent, 413 resource
budget, 422 unsupported/malformed input or supplied hash mismatch, 429 write/compute
capacity và503 storage/IO unavailable. Unexpected errors theo handler chung.
Shared security/project errors can retain the shared transport envelope; callers
must also handle ordinary HTTP status. No stack trace/absolute server path returned.
`FA_PROJECT_OR_WORKSPACE_READ_ONLY` là403 cho các mutation khi state thiếu/khác ACTIVE.

Actual HTTP responses from tests are in `frontend/tests/fixtures/fa-v3/http-*.json`, not invented
sample values. Request sequence: POST sources with real collection1033 raw bytes;
POST sources/{source.id}/executions with empty body; GET executions/{id}/reports;
GET reports/{report.id}; GET handoffs/{execution.handoff_id} and `/download`.
IDs/timestamps are test resources, not DB IDs to reuse in another environment.

FE-R4 integration: retain current shared authenticated transport/project header;
do not use producer project_id as authorization. Select source → POST execution →
list reports → fetch selected report. Show input/execution completion separately
from claim sufficiency and handoff readiness. Render objective canonical_value.value
with unit/status; preserve null, separate contact impact and legacy collision.
Use source/report UUID download routes for evidence; never open producer file paths.
Source/execution routes không nhận baseline/approval/partition do client tự gắn.
Review canonical có route `/contexts` riêng, được xác thực và persist phía backend.
READY/dispatch_allowed=true chỉ khi context hợp lệ và handoff không còn blockers;
thiếu authority hoặc evidence vẫn BLOCKED/DIAGNOSTIC_ONLY, không gọi optimizer cũ để vượt cổng.
Frontend đã tích hợp REST; luồng chọn DB là chính, upload/saved-source là lựa chọn nâng cao.

## Context canonical và bàn giao runtime V3

Theo yêu cầu triển khai 26/11/2026, tái sử dụng chính sách ADR-040/044/055 thay vì
tạo approval vật lý hoặc hệ thống duyệt candidate song song. Người có quyền ghi
rà soát snapshot đã chốt, nhập lý do 3–2000 ký tự, xác nhận rõ
`confirmed=true`, `canonical_targets_only=true`, `calibration_not_applicable=true`
và chọn `nonhazard_run_ids` đã xem evidence trong **cả hai partition**. Không tự
chọn mọi run SAFE; backend kiểm lại run và không chấp nhận collision/false braking/
missed activation mâu thuẫn với ca đối chứng. Đây không phải Reviewer Accept.

`FailureAnalysisHandoffService` lưu snapshot review bất biến bằng INSERT trong
`analysis_results` với `analysis_type=BASELINE_DATASET`, `method=FA_V3_CONTEXT`.
`config_json` giữ context UUID/dedupe; `summary_json` giữ context digest, reviewer ID
từ phiên đăng nhập, thời điểm, lý do, selection/digest, baseline/params, catalog/domain
và từng source UUID/SHA/run/attempt/revision. Không thêm bảng hoặc migration.
Selection V2 là đầu vào rà soát; kết quả chính thức vẫn lấy từ producer bytes DB,
không dùng projection V2 thay result. GET/execute/campaign kiểm lại checksum, source,
baseline, catalog và partition; nguồn đổi thì chặn, không tự backfill hoặc đổi cohort.

Adapter cấp cho builder các snapshot selection, baseline binding, canonical sample,
`vehicsim.handoff-quality-policy/v1` và hai domain `CATALOG_LIVE`/`CAMPAIGN_APPROVED`
có refs tới review đã lưu. Quality mapping giữ ba objective canonical, collision
không tăng, phanh oan tăng tối đa hằng 5 điểm % hiện hành; dữ liệu/profile thiếu vẫn
bị chặn. Domain chỉ gồm bốn mã AEB, nằm trong giao của catalog DB với
`ParameterBounds.defaults()`; request chỉ được thu hẹp, không mở rộng. Xác nhận UI
chấp nhận chính sách miền hiện hành; các khoảng cụ thể hiển thị trước khi tạo campaign.
Không suy calibration, clock transform, physical requirement hoặc confirmed cause
từ review canonical này; nhánh chẩn đoán không có context vẫn dùng authority rỗng.

`POST /optimizations` nhận **handoff_id + handoff_digest** ở cấp ngoài cùng, loại trừ
dataset_id/dataset_digest V2. Consumer đọc `fa_json_handoffs`, kiểm READY/checksum
và replay, rồi lưu `objective_config_json.handoff_ref`, search_space_json và đúng
optimization/validation run IDs. Mỗi trial chạy đúng cohort tối ưu/config/seed;
GP fit ba aggregate canonical của candidate trials đã hoàn tất. Holdout chỉ dành
verification, không tham gia fitting. Chọn candidate giữ provenance handoff trong
regression, vẫn cần Reviewer theo chính sách hiện có. Handoff V3 thiếu/sai/cũ bị
từ chối; không chuyển sang dataset V2 hoặc miền mặc định.

Payload runtime có `runtime_consumer` ràng buộc context và contract campaign. Các
nhãn `consumer_compatibility`/`consumer_dispatch_allowed=false` của lõi offline vẫn
giữ phạm vi `OFFLINE_SOURCE_INSPECTION_PROFILE`/`OFFLINE_HANDOFF_ONLY`; chúng không
cấp quyền chạy. Quyền runtime nằm ở metadata READY sau kiểm gate và được backend
kiểm lại tại campaign, mỗi trial và verification; không chỉ tin cờ trong JSON.

Các contract trên mô tả implementation; kết quả integration và giới hạn xác minh
nằm trong [báo cáo audit duy nhất](../LOGIC_AUDIT_REPORT.md), không suy PASS CARLA thật từ code.

## Persistence

Bốn bảng: fa_json_sources → fa_json_executions → fa_json_reports/fa_json_handoffs.
Immutable payload_bytes/metadata_bytes có SHA-256, project identity, dedupe_key và
FK/check constraints; chỉ INSERT, đọc lại kiểm digest/schema/identity. Source dedup
còn giữ acquisition provenance. Không có API delete; xóa baseline/run không tự
xóa bản phân tích đã capture. Partial cohort có thể chỉ có BLOCKED handoff metadata;
không tạo payload/digest giả, download chưa có trả409.

Upload và từng result≤1MiB; collection dựng từ bytes DB≤2MiB, file gộp≤16members; report/execution/handoff≤8MiB, metadata≤256KiB,
cả lượt≤32MiB. Tối đa2compute và2DB readers mỗi tiến trình, chưa phân quota theo
người dùng/cluster. Cohort quá16 bị reject cả bộ, không truncate.

DB mới theo [01_schema.sql](../../database/mysql/01_schema.sql). DB cũ: backup và
review [migration019](../../database/mysql/migrations/019_2026-11-24_lan-lap-va-lan-thu-cua-run.sql)
rồi [020](../../database/mysql/migrations/020_2026-11-25_failure_analysis_json.sql)
và [024](../../database/mysql/migrations/024_2026-11-26_fa-db-collection-2mib.sql) theo ADR-068. Luồng phân tích chính chỉ cần
original source đã được Module2 commit trong FA tables, không cần artifact volume.

## Module2 và Module4

Input là completed-run result/collection, không phải XOSC. Module2 giữ original
bytes/identity/provenance và tất cả ON/OFF/repetition/attempt. Giữ separately declared
collision và recorder contacts; external-file declared hashes chưa xác minh bytes.

Handoff schema `vehicsim.failure-analysis-mobo-handoff/v1`, aggregation
`adr040-stored-aggregation/1`. Diagnostic Report, result JSON và dataset-v2 là
các contract khác nhau. Member identity và recorded objectives không tự cấp
authorized baseline/canonical sample/score/range. Consumer kiểm digest, frozen
cohort/currentness, exact seed/rep/attempt, bounds và sealed holdout trước khi chạy.
Không đưa Diagnostic JSON trực tiếp vào MoboEngine hoặc gọi legacy optimizer để
vượt dispatch=false. Runtime consumer V3 ở `FailureAnalysisHandoffService` và
`OptimizationService` dùng handoff đã kiểm; adapter V2 vẫn là luồng riêng khi
người dùng chủ động chọn. [M2_CHANGE_PLAN](M2_CHANGE_PLAN.md) ghi lịch sử kế hoạch,
không dùng các blocker cũ trong đó để phủ nhận code runtime mới.

## Mapping đầu vào

Adapter `fa-json-input/1`, 2026-11-24. Supported exact formats:
`vehicsim.result/v1` with `dataset.format=vehicsim.run-dataset/v1`, and
`vehicsim.run-collection/v1` containing `runs[{run_id,result}]` plus manifest.
This is result intake, not XOSC import or a backend dataset API.

`P` below is empty for standalone; for collection member i it is
`/runs/i/result`. Every pointer is relative to the **original container**, not a
serialized normalized view. JSON pointer escaping is RFC6901 (`~0`, `~1`).

### Exact compatibility matrix

| Original JSON path after P | Source → evidence/consumer | Unit / clock / frame | Validation and null behavior | Provenance |
|---|---|---|---|---|
| `/format`, `/dataset/format` | Result envelope → result Artifact | none | Exact supported versions; missing/wrong dataset blocks member | Original result retained, no synthesized fields |
| `/dataset/identity/run_id` | Export identity → Run.runKey (decimal string) | identifier | Positive integer identity; compare source and wrapper; duplicates block every duplicate | Declared identity EV CONDITIONAL; not authorized DB binding |
| `/dataset/identity/variant_id`, `scenario_version_id` | Variant → Run.caseKey | identifier | Required variant; copies must agree; no inference from label | `input.declared_identity.variant_id` |
| `/source/{run_id,scenario_id,scenario_version_id,aeb_version_id,carla_vehicle_model_id}` | Producer identity copies | identifier | Compare when both copies exist; inconsistent identity blocks member | Exact original source path in rejection detail |
| `/dataset/identity/{project_id,scenario_id,aeb_version_id,carla_vehicle_model_id,purpose}` | Export metadata → declared identity; handoff member declared IDs | identifiers / enum | Missing stays UNKNOWN; no baseline authorization or v1 confirmation | CONDITIONAL, PRODUCER_DECLARED_NOT_AUTHORIZED_BINDING |
| `/seed`, `/dataset/identity/seed` | Stored seed → input.seed, handoff.seed | integer | Required exact integer copies; no invented seed | Original result ref |
| `/simulator`, `/dataset/identity/simulator` | Actual declared profile → MetricProvenanceResolver | version string | Exact copies; missing conflicting metadata remains visible | Runtime/source equivalence still UNVERIFIED |
| `/dataset/identity/aeb_mode` | Recorded mode → EvidenceReport.mode | ON / OFF | Exact enum, compare explicit outcome.case.aeb_mode; OFF remains control only | OBSERVED declaration with original pointer |
| `/dataset/identity/{repetition,attempt}` | Run sequence → handoff.replicate/attempt | positive integers | Required; never collapse equal variant/seed repetitions or derive sequence from list index | CONDITIONAL declaration, exact pointer |
| `/outcome/params/ttc_threshold` ↔ `/dataset/config/aeb/params/TTC_THRESHOLD` | Actual configured threshold → input.parameters/handoff.actual_parameters | s / config, no clock | Compare finite numeric copies when present; conflict blocks identity-dependent claims | No parameter mutation |
| `/outcome/params/brake_activation_delay` ↔ `.../BRAKE_ACTIVATION_DELAY` | Configured delay | s | Same as above; not measured actuator delay | Source-supported context only |
| `/outcome/params/max_deceleration` ↔ `.../MAX_DECELERATION` | Requested cap | m/s² | Same as above; not achieved deceleration | No calibration inferred |
| `/outcome/params/brake_buildup_rate` ↔ `.../BRAKE_BUILDUP_RATE` | Requested ramp | m/s³ | Same as above; not measured jerk | No range synthesized |
| `/outcome/metrics/{rms_jerk_mps3,impact_speed_mps,stopping_distance_m}` | CanonicalObjectiveReader → canonical_value, handoff.recorded_objectives | m/s³, m/s, m / core | Finite nonnegative numbers or null; missing/invalid never becomes zero | Producer scalar retained without recalculation |
| `/evaluation/aeb_result/{same three keys}` | Evaluation copies → evaluation_copy/copy_agreement | same | Compare independently; disagreement retained; no averaging or preferred-copy replacement | Canonical source remains outcome.metrics |
| `/dataset/objectives/{key}` | Embedded mirror/state/reason → declared_metadata | per objective / declared | Compare values; validate enum/state/value/reason; conflict marks quality FAIL while raw canonical remains available | Original metadata object + exact ref; producer declaration only |
| `/dataset/objectives/metric_version/{aggregation,engine,simulator}` | Extra profile declarations | strings | Compare aggregation to adr040-stored-aggregation/1 and engine/profile to top level | Conflict issues, no producer algorithm change |
| `/outcome/case/carla/jerk_filtered` | Existing metric metadata → signal/filter/window lineage | ego_a, core / projected frame | Existing descriptor checks unchanged, fixed dt/filter support gates unchanged | Dataset jerk metadata is not substituted for producer metadata |
| `/outcome/frames/j/{t,ego_x,ego_v,ego_a,ped_x,ped_y,ped_vy,...}` | Core state → existing timeline/geometry/stopping replay | s,m,m/s,m/s² / core / producer projected frame | Existing finite/time/order gates; no recorder offset inferred | Each ref P+/outcome/frames/j/field |
| `/outcome/metrics/{first_detection_t,aeb_decision_t,brake_onset_t}` | Detection/decision/command timeline | s / core | Existing episode/order/mode gates; OFF shadow traces do not become real commands | Command model onset is not pedal/physics consumption |
| `/dataset/time_series/frames/{columns,rows,row_count}` | Embedded recorder → frames Artifact list of column-name maps | column-specific / recorder | Unique nonempty columns, row width/count, frame/time columns; invalid table quarantined independently | View retains container SHA, original table pointer, columns |
| `.../frames/rows/j/c` | frame,sim_time_s,ego_speed_ms,throttle,brake,steer,IMU/radar/obstacle cells | frameID,s,m/s,[0..1],m/s²,m/s³,m,s / recorder | Existing per-stream checks; null cells unchanged; no GT substitution for radar | r.ref(frames,/j/column) → original /rows/j/c |
| `/dataset/time_series/ground_truth/{columns,rows,row_count}` | Embedded GT → ground_truth Artifact | CARLA world / recorder | Same table gates plus actor_id/role; actor/clock validation remains in core | Original rows preserved, no CSV re-encoding |
| `.../ground_truth/rows/j/c` | frame,sim_time_s,actor_id,role,type_id,x_m,y_m,z_m,yaw_deg,vx_ms,vy_ms,vz_ms,ax_ms2,ay_ms2,az_ms2,speed_ms,a_along_v_ms2 | s,m,deg,m/s,m/s² / recorder / CARLA left-handed world | No actor merge between runs; signed raw acceleration retained | Actual column index, including whole-row refs |
| `/dataset/collisions/events/j` | Contact records → collisions Artifact, ImpactAnalyzer | recorder frame/time, actor ID, m/s, N·s | Array count is not collision flag. Existing frame/episode/actor/precontact gates apply; zero impulse not absence | P+/dataset/collisions/events/j/... |
| `/dataset/collisions/flag_in_result` vs `/outcome/metrics/collision` | Canonical flag copy | boolean | Compare without truthy coercion or event-count override | Conflict issue, no new collision authority |
| `/dataset/sensors/summary` | Recorder summary → summary Artifact | producer-specific | Must be object; missing/bad source stays local | Summary does not replace frames or actor/contact evidence |
| `/dataset/config` | Declared actual bundle/config → bundle view | config | Object; no invented lifecycle/environment or scenario source file | External bundle byte hash stays UNVERIFIED |
| `/dataset/time_series/{clock,time_origin,units,coordinate_system,quality}` | Declared metadata/masks → input.json_source | recorder / declared frames | Retain raw declarations/masks; no authorized cross-clock transform created | Recorder exact-frame joins still checked from rows |
| `/dataset/provenance/{git_commit,core_jar_sha256}` | Declared lineage → metric provenance | revision / SHA256 | Missing stays UNKNOWN; no binary/source equivalence assertion | source_hash_verification UNKNOWN |
| `/dataset/provenance/files/<escaped filename>` | Original external-file hash claims | SHA256 bytes / declared | Stored separately; original CSV/JAR bytes not supplied or verified by adapter | external_source_integrity=UNVERIFIED |
| `/dataset/provenance/embedded_payloads/<escaped payload key>` | Embedded consistency digests | SHA256 UTF-8 declared Python JSON profile | Known profile checks payload; mismatch quarantines view; unknown profile stays UNVERIFIED | SELF_DECLARED_CONSISTENCY_ONLY, not external authenticity |
| `/dataset/{derived,status}` | Reference-only formulas, per-section status | heterogeneous | Never used to replace Core V3 formulas or canonical objectives; raw status/provenance retained | Declared derived role, quality masks/status metadata |

### Collection-level mapping

| Container path | Validation/output |
|---|---|
| `/runs/i/run_id` | Required positive unique wrapper identity, exact match to result identity; no generated offline DB ID |
| `/manifest/j` | Unique positive run_id; cover supplied members and identify missing documents; compare optional seed/mode/sequence/profile/purpose/version/vehicle/end_reason/collision copies |
| `/manifest/j/document_sha256` | Required per-document consistency digest, checked using supported `/rules/document_digest_spec`; mismatch blocks that member |
| `/manifest/j/document_state/state` | Present non-OK state blocks member |
| `/collection/{project_id,scenario_id,variant_id}` | Compare when declared; variant header may be absent for a multi-variant collection |
| `/collection/{sealed,selection,excluded,...}`, `/status` | Retained in intake manifest and per-run json_source.declared_collection_context. COMPLETE means delivered manifest only, never a frozen whole-scenario cohort |
| `/groups[]` | Producer pairing declaration is not authority. Lookup uses actual same variant/seed/vehicle/profile/AEB version/config and requires exactly one OFF; ImpactAnalyzer still applies its own compatibility gates |

The adapter does not enforce one fixed population size. All three supplied files
happen to contain two runs each. A manifest member without a document has an
explicit BLOCKED record. Uncovered/duplicate/invalid members cannot silently
become a smaller complete handoff. Resource exhaustion rejects the session.

### Hash, missing evidence and output contracts

The actual container byte SHA is computed once. Optional independently expected
SHA is accepted by `JsonInputAdapter(Path,InputResourcePolicy,String)`; without
it the container and views remain UNVERIFIED. The CLI does not obtain independent
authority from an embedded hash. Matching embedded digests show internal
consistency only. `Artifact.sha256` for a JSON view is explicitly scoped to
container bytes, not bytes of a reconstructed CSV. `json_container` is shared
container evidence, while every result/stream view is bound to its run key.

Missing lifecycle/JAR/environment/metadata/ZIP manifest has SOURCE_MISSING and
null data; these are unavailable evidence slots, not fabricated files. Approved
clock transforms, calibration, requirements, baseline binding and frozen
selection are not created from producer labels. Missing input remains claim-local
UNKNOWN/NOT_APPLICABLE or INVALID/CONFLICTING with reason codes.

`OfflineDiagnosticAnalysis` writes one report per analyzable run, an
`_input_manifest.json` and a CSV for JSON intake. Original report schema/formula/
policy/digest profiles are retained; additive `input.declared_identity`,
`input.json_source` and per-objective `declared_metadata` disclose the new source.
Handoff adds member declared identity, recorded objectives and JSON source
provenance. `canonical_sample` and baseline aggregates remain unavailable without
the existing independently bound/authorized M1C evidence.

In CSV, an empty cell represents a raw null or an unknown physical outcome;
the referenced report contains its typed status/reason. It is never a zero.
Collection view hashes use container-byte scope; a future authorized binding
must explicitly agree this scope and the member identity/pointer, rather than
silently treating a manifest's Python document digest as original-file bytes.

## Kiểm thử

JDK21 và Maven wrapper đủ cho core offline, không cần DB/Redis/CARLA/token.
Từ repo root, output CLI phải là thư mục mới:

```powershell
& .\docs\failure-analysis-v3\handover\run-offline.ps1 -Build `
  -InputPath .\docs\failure-analysis-v3\handover\examples\inputs\vsos-collections-2026-11-24\vehicsim-variant-1033-collection.json `
  -OutputDirectory .\target\fa-local-export
.\mvnw.cmd -B '-Dtest=RepoDocsTest,JsonInputAdapterTest,JsonInputIntegrationTest,RestJsonAnalysisTest,FailureAnalysisServiceTest,M1DGolden18IntegrationTest' '-Dfa.json.samples=docs/failure-analysis-v3/handover/examples/inputs' test
```

Script gọi OfflineDiagnosticAnalysis → OfflineMoboHandoff → OfflineConsumerCompatibility;
nếu intake partial thì dừng trước handoff. Expected SHA kiểm bytes, không cấp authority.
Golden18 raw ZIP là external fixture, `-Dgolden18.zip=<path>`;
thiếu fixture/authorized exports phải SKIPPED/BLOCKED, không tự tổng hợp thành PASS.

Từ frontend: `node --test tests/analysis-v3.mjs`, `npm.cmd run test:analysis`.
Lint/TypeScript/build/browser theo [frontend test guide](../../frontend/tests/README.md).
Browser fixtures không phải deployed HTTP/MySQL E2E. MySQL opt-in env chỉ được trỏ
disposable test DB đúng guard trong FailureAnalysisMysqlTest/FailureAnalysisDatabaseMysqlTest:
FA_BE_R1_MYSQL_URL, FA_DB_DIRECT_MYSQL_URL và password tương ứng; không dùng .env/app DB.

Fixtures giữ original bytes: năm inputs và INPUT_PROVENANCE.json trong handover/examples;
Golden18 handoff ở samples/m1c do Java test đọc; năm HTTP responses ở
frontend/tests/fixtures/fa-v3. Các sample/report chạy lặp khác có thể tái tạo từ CLI.

## Giới hạn và việc còn thiếu

| Phần | Trạng thái cần giữ |
|---|---|
| Producer source/reference — DEP-M2-01 | Missing/old/wrong-identity result cần original bytes/ref thật; không reconstruct từ telemetry |
| Freshness — DEP-M2-02 | Timestamp/digest riêng lẻ không cấp authority. Runtime canonical context kiểm lại selection/baseline/catalog/member revision; nhánh offline/upload chưa có context không tự được nâng quyền |
| Legacy impact — FU-M3-01 | Freeze metadata còn có label EGO_SPEED_NOT_RELATIVE cho profile relative; cần vintage/archive policy, không backfill scalar/history |
| Approved context — FU-M3-02 | Đã có runtime review canonical trong FA_V3_CONTEXT, quality/domain và frozen partitions. Physical requirement/calibration/clock authority vẫn tách riêng; thiếu không được giả lập thành approved |
| MOBO consumer V3 | Đã có implementation handoff DB → projection → campaign/GP/frozen verification. READY phụ thuộc đủ gate; không context vẫn diagnostic-only/blocked. Trạng thái integration thực tế xem báo cáo audit |
| Scientific authority | Thiếu verified clock/control-writer/full-encounter geometry/calibration domain/P05 certificate thì giữ UNKNOWN, không confirmed root cause |
| Capacity | Limits là per-process; chưa retention/delete API hay distributed/user compute quotas/SLA |
| Deployment | Migration và producer-source DB cần kiểm đúng môi trường. Artifact volume còn phục vụ playback/download, không thay nguồn FA. Không dùng fixture/offline làm bằng chứng rollout/live E2E |
| Legacy/UI | TD-30,53,54,57–62 giữ ở tracker; bản đồ scene/clock/provenance và browser CI còn giới hạn |

FA-001…010 có corrections/regression trong Batch01–04; source/tests giữ lại.
Không giữ các báo cáo cũ “chưa REST” hoặc lỗi nested envelope làm hiện trạng code.
Hồ sơ QA cũ thiếu nghiệm thu riêng ở Phase5/13/18 không được coi đã hoàn tất chỉ
vì dọn báo cáo. Không tuyên bố CARLA calibration hay mô phỏng là đo/chứng nhận xe thật.

## Đặc tả và lịch sử

Giữ tám tài liệu chi tiết DATA_CONTRACT, FORMULA_SPEC, DIAGNOSIS_POLICY,
GOLDEN18_EXPECTED_BEHAVIOR, OBJECTIVE_ANALYSIS_CONTRACT, MOBO_HANDOFF_CONTRACT,
OPEN_DECISIONS và REFACTOR_BLUEPRINT vì có công thức, schema và tiêu chí riêng.
Câu DESIGN ONLY thuộc mốc thiết kế; hiện trạng implementation đối chiếu source/ADR.

Đã gộp nội dung còn dùng và bỏ các audit/blueprint/implementation reports,
handover/AI prompts và nhật ký triển khai từng đợt của Admin/Analysis.
Bản trước dọn có ở Git `668f1504`; bản khôi phục local ở target/docs-consolidate-668f1504.
Đợt dọn lịch sử giữ ADR/tài liệu module khác; cập nhật runtime hiện tại ở ADR-067
và database-schema được ghi ngày rõ ràng, không thay công thức hoặc quyết định gốc.
