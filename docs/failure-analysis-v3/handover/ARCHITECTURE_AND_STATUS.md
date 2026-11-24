# Module3 — kiến trúc và hiện trạng implement

Đây là bản đồ source hiện tại, không phải kế hoạch bắt đầu M1A. Package production
có41 Java files,23 Java test/fixture files. Trong đợt chuẩn bị bàn giao không sửa
hoặc xóa Java source/test, không sửa producer/consumer/DB/API/frontend.

## Public flow đang chạy

Input JSON result/collection hoặc ZIP/directory → FailureAnalysisInput →
JsonInputAdapter/RawArtifactAdapter → Evidence.Run/Artifact → DiagnosticReport →
MoboHandoffBuilder → ConsumerCompatibilityValidator (offline).

JSON adapter chỉ chuẩn hóa evidence views và validate intake. Tất cả geometry,
braking model, timeline, diagnosis, objective explanation dùng cùng core như ZIP.
Không có controller/model/optimizer thứ hai trong adapter.

## Source map đầy đủ

Mọi file trong bảng nằm tại `src/main/java/com/vsos/core/failureanalysis/`.

| Nhóm | Classes | Trách nhiệm / boundary |
|---|---|---|
| Types | Evidence | Immutable Run/Artifact/Value/Issue/SourceRef; units/status/reasons và original JSON pointer translation |
| JSON intake | FailureAnalysisInput, JsonInputAdapter | Dispatch; exact schemas; manifest/run identity, embedded tables/hashes/provenance; partial accounting; unique OFF lookup |
| Legacy intake | RawArtifactAdapter, ArtifactCsv, ArchiveIndex | ZIP/directory/CSV/JSONL, archive safety and original artifact identity |
| Resource/error | BoundedInput, InputResourcePolicy, InputRejectedException | Bounded bytes/parse/work/allocation model; controlled rejection, not a failure label |
| Evidence foundation | EvidenceValidator, EvidenceReport, EvidenceGates | Schema/identity/timestamps/copies; M1A sidecar; claim-local quality, disagreement and calibration gates |
| Canonical reader | CanonicalObjectiveReader, MetricProvenanceResolver | Stored3scalars/null; M/evaluation agreement; profile/signal/filter/window lineage; never re-score |
| Geometry/physics | GeometryEngine, StoppingModel, AvoidabilityAnalyzer | 2D fixed-heading model/full-body conflict/clearance/PET; delay+ramp/caps/margins; conditional action screening, no certified P05 physical-limit proof |
| Events/physical signals | AebTimelineBuilder, PhysicalBrakingAnalyzer, ImpactAnalyzer | Core D/Q/B vs recorder control; achieved trace diagnostics vs configured cap; actor-bound contact/precontact relative velocity and conditional ON/OFF comparison |
| Diagnosis/explanation | DiagnosisPolicy, ObjectiveExplainer, HypothesisInvestigator | FALSE_BRAKING/NO_BRAKING/INEFFECTIVE_BRAKING candidates; canonical explanation and source-backed hypothesis/falsification dossiers |
| Composition/context | DiagnosticReport, DiagnosticSupport, AnalysisContext, AnalysisContextValidator | Public core pipeline, optional independently bound reviewed requirements/calibration/coverage/baseline packages; no inferred authority |
| Handoff | MoboHandoffBuilder, CanonicalAggregation, BaselineBindingResolver, HandoffSnapshots | Versioned manifest/report refs/quality/baseline; canonical aggregate only on bound samples; pinned snapshot loading/digests; no DB queries |
| Parameter context | ParameterHintBuilder, SearchRangeResolver | SUSPECTED/ABSTAIN hints and sourced approved domain intersection; no optimizer or automatic parameter update |
| Compatibility | ConsumerCompatibilityValidator, ConsumerSourceInspection, HandoffSchemaValidator | Typed schema/digest/cohort/bounds/holdout checks and source-backed consumer gaps; NOT_DIRECTLY_CONSUMABLE is a valid result |
| CLI | OfflineFailureAnalysis, OfflineDiagnosticAnalysis, OfflineMoboHandoff, OfflineConsumerCompatibility | M1A evidence, full diagnostic, handoff export, offline compatibility sidecar |
| Review output | JsonDiagnosticSummary | CSV projection of identity/raw canonical values/core output, not a scoring input |

Core imports only JDK plus existing core helpers, notably MiniJson and
AnalysisMetrics; no Spring/backend/DB dependency is introduced. Consumer source
files are inspected as evidence, not executed by the offline validator.

## Bảy trục không gộp làm một nhãn

| Trục | Output chính | Không được suy thành |
|---|---|---|
| Physical outcome | report.physical_outcome + basis/disagreements | Collision không tự là lỗi AEB; empty events không tự SAFE |
| AEB observed behavior | observed_behavior, aeb_timeline/control_activity | Pedal activity không tự chứng minh AEB writer/physics consumption |
| Functional candidate | failure_candidates, functional_assessment | SUSPECTED không là confirmed requirement violation |
| Physical feasibility | feasibility_results, physical_feasibility/physical_limit | Ideal1D margin không là proof inevitable2D collision |
| Root hypothesis | root_cause_hypotheses, confirmed_root_cause | Legacy chain/confidence không là causal truth/probability |
| Evidence sufficiency | validation/evidence_sufficiency/objective quality | Có đủ scalar không là đủ physical/operational authority |
| Uncertainty/inconclusive | reason codes, assumptions, bounds/status | UNKNOWN không được thay bằng false/0/PASS |

SAFE/NEAR_MISS/SUPPORTED cần reviewed complete-encounter coverage/criteria,
requirements và claim-local predicates. Positive context paths có synthetic tests;
không tự cấp authority cho Golden18 hay actual user exports. P05 certificate và
confirmed root cause vẫn UNKNOWN khi thiếu evidence, không có placeholder proof.

## Ba objective

Canonical source là outcome.metrics, copy evaluation.aeb_result. Phiên bản
tổng hợp duy nhất hiện hành `adr040-stored-aggregation/1`. Jerk producer profile
hiện tại khác raw sensor jerk; stopping là projected trace+modeled tail; canonical
impact khác recorder precontact impact. Read-only reader không gọi producer để
ghi đè số. ObjectiveExplainer dùng descriptor đúng vintage và guard clock/inputs.

Handoff chứa per-run recorded objectives riêng với authorized canonical_sample,
canonical_aggregation và baseline_objectives. Thiếu frozen identity/sample/
quality/baseline thì score UNKNOWN; không aggregate một subset ngầm.

## Bốn loại hash và ba cấp authority

Container SHA256 bytes, declared external-file hashes, embedded payload/document
consistency hashes và normalized report/handoff content digests có scope khác nhau.
Không dùng một loại thay loại khác. JSON view SHA là container hash được ghi rõ
scope, không fake CSV hash. SourceRef trỏ original container row/column, không
normalized CSV giả. Source revision/JAR hash không tự chứng minh runtime equivalence.

Phân biệt (1) source declaration, (2) independently hash-pinned consistent artifact,
(3) authorized scoped review/currentness. Pinned bytes không tự là authorized
review; approved label không tự là verified reviewer; export-time status không
chứng minh historical baseline v1. CLI đơn giản xuất offline unbound reports;
programmatic AnalysisContext/M1C APIs mới nhận các scoped snapshots tương ứng.

## Trạng thái và kiểm chứng

| Phần | Hiện trạng |
|---|---|
| M1A evidence/identity/canonical reader | Implemented, tested; baseline thiếu binding UNKNOWN |
| M1B physics/diagnosis/objective explanation | Implemented trong declared model/evidence scope; no certified physical limit/root |
| M1C manifest/aggregate/hints/ranges/export | Implemented; actual user exports thiếu authority nên diagnostic-only/no scores/no suggestions |
| M1D consumer compatibility | Implemented offline; phát hiện existing consumer gaps; không dispatch |
| Production JSON adapter | Implemented cho standalone và collection; real files/negative tests đã chạy |
| Backend API/DB integration cho core mới | Chưa implement trong các task này; existing AnalysisService là boundary legacy cần owner nối riêng |
| M2/frozen consumer execution | Chưa implement; xem M2_CHANGE_PLAN, không coi handoff parser là completed integration |

Latest prior verification: focused912/910pass/2skip, full1639/1634pass/2oldfail/3skip.
Golden18 là18case clusters,54ON/18OFF, không72IID scenarios;31COLLISION/41UNKNOWN,
12disagreements,216scalar/null,42stoppingreplay,0confirmedroots.32independent
model checks và74digest checks pass. Handover validation được ghi riêng trong
CLEANUP_AND_PACKAGE để không nhập nhằng với lần chạy full suite trước đó.

Không tự chạy CARLA/GP/DB khi đọc tài liệu. Phần còn thiếu có owner và evidence
được liệt kê ở [remaining dependencies](../json-input-integration/REMAINING_DEPENDENCIES.md).
