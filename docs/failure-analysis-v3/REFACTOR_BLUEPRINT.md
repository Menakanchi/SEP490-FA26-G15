# REFACTOR_BLUEPRINT — Backend evidence diagnosis, kế hoạch chưa thực hiện

V3.1 DESIGN ONLY. Không source diff, không DB migration, không đổi AEB/CARLA/calibration/evaluator, không chạy simulator và không commit/push. Đây là phương án triển khai cho một nhiệm vụ sau nếu được giao. Bản thiết kế dùng HEAD `baf0892d456b5dcf4bfc0358b7124bf6a8b6fe5a` và các artifact/hash trong [DATA_CONTRACT](DATA_CONTRACT_V1.md).

Nguồn quyết định: [A01 logic](../../data/failure-audit-output/01_EVALUATOR_LOGIC_AUDIT.md), [A02 cases](../../data/failure-audit-output/02_CASE_BY_CASE_AUDIT.md), [A03 consistency](../../data/failure-audit-output/03_DATA_CONSISTENCY_AUDIT.md), [A04 impact](../../data/failure-audit-output/04_BACKEND_IMPACT_ASSESSMENT.md), [A05 changes](../../data/failure-audit-output/05_RECOMMENDED_CHANGES.md), [A06 summary](../../data/failure-audit-output/06_AUDIT_SUMMARY.md). Không lấy legacy root-cause chain làm specification correctness.

Bổ sung trọng tâm3 objective và hai output qua [OBJECTIVE_ANALYSIS](OBJECTIVE_ANALYSIS_CONTRACT_V1.md), [MOBO_HANDOFF](MOBO_HANDOFF_CONTRACT_V1.md). Bốn AEB parameters chỉ là configuration/context/suspected hints. Source hiện có MoboEngine/OptimizationService; thiết kế này không viết lại optimizer và không tự chạy M1A.

## 1. Ranh giới kiến trúc

Giữ diagnostic math/policy deterministic, chỉ JDK trong package **đề xuất** `com.vsos.core.failureanalysis`; không import CARLA, Spring, DB hoặc đọc network trong core. Backend adapter/orchestrator chịu trách nhiệm đọc artifact, bind quyền/project/run, serialize/persist sidecar. Dùng cùng logic cho report offline và backend; không tạo một evaluator Python/Frontend khác.

Luồng tương lai:

1. Artifact adapters đọc immutable raw/legacy/config và tạo normalized `EvidenceBundle`.
2. `EvidenceValidator` tạo capability matrix, identity/integrity/time/coverage disagreements.
3. `GeometryEngine` và `ConflictMetrics` tính actual/ex-ante/counterfactual views có tên.
4. `PhysicalEnvelopeResolver` / `CalibrationScopeResolver` / `StoppingModel` / `FeasibilityAnalyzer` tính envelope, stopping và avoidance dưới scope.
5. `AebTimelineBuilder` / `PhysicalBrakingAnalyzer` giữ command và physical response độc lập.
6. `DiagnosisPolicy` đọc facts đã gắn provenance; xuất outcome/candidates/hypotheses, không sửa facts.
7. `EvidenceReportAssembler` serialize bảy trục, reasons và source graph.
8. `LegacyCompatibilityAdapter` chỉ đọc/pointer historical result; không ép mọi trục về một legacy enum.

Evidence sufficiency là dependency graph: calibration physical field không chặn recorded collision; thiếu radar trace chặn perception cause nhưng không xóa Q recorded. Functional diagnosis không được gọi source controller để tự “sửa” control.

## 2. Module interfaces đề xuất và trách nhiệm

Tên dưới đây là định hướng class/method, chưa tồn tại. Input/output dùng kiểu contract, không chọn framework/DTO có side effect.

| Module / method | Input → output | Điều kiện và error semantics |
|---|---|---|
| backend `RawArtifactAdapter.read` | Registry + raw bytes → EvidenceBundle | Verify hash, preserve JSON pointer/CSV rows; parse unsupported version → capability gap, không coerce |
| backend `LegacyEvidenceAdapter.read` | Historical evaluation/raw → LegacyClaims + refs | Không biến score thành probability; không dùng missing boolean default false |
| core `EvidenceValidator.validate` / `capability` | Bundle → ValidationReport + per-claim capabilities | Isolate invalid stream; duplicate/conflicting record giữ disagreements; source identity chưa bind chỉ offline |
| `ClockAlignmentResolver.resolve` | Recorded origins/frame IDs hoặc trajectory pairs → clock mapping + bounds | Frame/origin ưu tiên; inferred alignment conditional; không extrapolate gap hoặc đổi raw t |
| `CoordinateNormalizer.project` | Poses + named frame → projected state | Explicit handedness, yaw units, bbox local transform; missing pitch/roll/center → conditional model |
| `GeometryEngine.conflictIntervals` / `minimumClearance` | Geometry + trajectories + horizon → GeometryResult | Continuous piecewise solver; không chỉ sampled no-hit; unresolved intervals UNKNOWN |
| `ConflictMetrics.longitudinalTtc` / `occupancy` / `pet` | Named trajectories/encounter → typed metric | TTCx descriptive, PET null on overlap/censor; body not front-only |
| `CalibrationScopeResolver.applicability` | Calibration artifact/hash/domain + context + field → 4-state result | Missing domain UNKNOWN; no calibration rewriting/fitting |
| `PhysicalEnvelopeResolver.resolve` | Config, context, calibration applicability → envelope + bounds | Upper-bound model khác achieved/validated response; không weather→μ fallback ngầm |
| `StoppingModel.integrate` / `requiredEnvelope` | Initial state, delay/ramp/envelope → distance/time/feasible b | P02 branches; partial initial braking dùng generalized integrator; analytic/model error exposed |
| `FeasibilityAnalyzer.stoppingWindows` / `avoidanceWindows` / `verifyCertificate` | Model, action set, uncertainty, horizon → windows + certificate | Negative stop margin không unavoidable2D; finite no solution không certificate |
| `AebTimelineBuilder.build` | Mode + raw event/control traces + clocks → actual/hypothetical timelines | OFF never actual command from shadow; Blegacy not physical onset; right censor explicit |
| `PhysicalBrakingAnalyzer.estimate` / `trackingError` / `jerk` | Raw velocity/control/IMU + feasible demand + masks → response metrics | Readback không consumed; declared baseline/filter/windows; no clamp to hide spikes |
| `ImpactAnalyzer.extract` / `PairComparison.compare` | Contact + preimpact vectors + pair identity → speeds/observed mitigation | Separate ego/relative; no-hit null; pairing failures return UNKNOWN |
| `DiagnosisPolicy.assessOutcome` / `functionalCandidates` / `hypotheses` | Validated fact views + requirement/policy → seven-axis assessment | No first-stage cause; no forced failure/cause; claim-local UNKNOWN |
| `UncertaintyPropagator.propagate` | Validated bounds/covariance + formula → output bounds | Missing model UNKNOWN, no score-as-probability |
| `EvidenceReportAssembler.assemble` | All facts/claims + versions → immutable report + content digest | Stable ordering/canonical serialization; no created_at_utc/analysis_id/content_digest in deterministic content digest |
| `DiagnosticRateCalculator.aggregate` | Versioned eligible cohort → rates + n/unknown | Separate denominators, no denominator0→0%, cluster rep disclosure |
| backend `FailureAnalysisReportService.analyze` | Authorized run/artifact reference + requested versions → report | Read-only analysis inputs; optional sidecar write in future separate transaction |
| backend `LegacyCompatibilityAdapter.readLegacy` | Original result/evaluation → existing response | Historical semantics untouched; V3 requires explicit selected version |

Failure handling: structural artifact error is data-quality issue, not AEB failure. Solver timeout is ANALYSIS_INCONCLUSIVE, not simulator collision or physical limit. No arbitrary fallback to legacy outcome when V3 UNKNOWN.

## 3. Mapping class/method hiện tại

KEEP giữ hành vi/historical identity. FIX là ngữ nghĩa adapter/consumer **trong V3**, không sửa âm thầm kết quả legacy. EXTEND thêm versioned capability hoặc source adapter. REPLACE nghĩa thay vai trò trong đường chẩn đoán V3; phương thức cũ vẫn giữ cho legacy. Mọi thay đổi source nói dưới đây đều là đề xuất cho phase khác.

| Current source / method / vị trí | Disposition | Vấn đề được audit xác nhận → mapping V3 |
|---|---|---|
| [Evaluation.java](../../src/main/java/com/vsos/core/evaluation/Evaluation.java) `classifyOutcome` L105, `idealTriggerT` L118, `evaluate` L127 | REPLACE trong V3; KEEP legacy | TTC_GT ever/MA/FA và contact→FAIL không tách axes. DiagnosisPolicy + GeometryEngine thay vai trò, giữ R.evaluation gốc |
| Cùng file `hazardChain` L213, `falseActivationChain` L301, `Result.primaryStage` L52, `headline` L319 | REPLACE | First failed stage và hardcoded confidence không causal proof. Hypothesis set + evidence gaps + neutral narrative |
| [Simulator.java](../../src/main/java/com/vsos/core/simulation/Simulator.java) `groundTruthTtc` L72, summary logic L319–384 | KEEP legacy / FIX interpretation | Instantaneous lane TTC và fixed crossing distance/forcezero là legacy claims; new geometry recompute từ named model, không overwrite |
| [AebStack.java](../../src/main/java/com/vsos/core/aeb/AebStack.java) `stepMeasured` L170, `control` L187, `decide` L228 | KEEP | Giữ controller, latches, sample period và delays; adapter mô tả actual events, không gọi decide làm oracle |
| [AebParams.java](../../src/main/java/com/vsos/core/aeb/AebParams.java) `corridorHalfWidth` L54 và ramp L59 | KEEP | Config/rule descriptor, không physical footprint/actual decel |
| [RadarTracker.java](../../src/main/java/com/vsos/core/aeb/RadarTracker.java) update/usable/open/classify L171–382 | KEEP | Gate/hold là mechanism hypotheses; primary raw lifecycle thiếu không confirmed root. Optional future logging contract, không refactor tracker |
| [AebMode.java](../../src/main/java/com/vsos/core/simulation/AebMode.java) markOff L39–46 | KEEP / EXTEND adapter | Preserve shadow D/Q, label hypothetical; actual OFF diagnosis NA |
| [CarlaSession.java](../../src/main/java/com/vsos/core/simulation/CarlaSession.java) step L331–385, lowSpeed L655–671, pedal L678–747, finish L772–901 | KEEP; EXTEND future evidence proposal | Geometric-or-callback branch currently unlogged, low-speed override and pedal map confound physical evidence. Read current fields as legacy/model; future log emitted/applied source only after separate scope authorization |
| [DecelMeter.java](../../src/main/java/com/vsos/core/aeb/DecelMeter.java) L34–47 | KEEP legacy / REPLACE diagnostic input | Gated/clamped core acceleration không independent actual response. PhysicalBrakingAnalyzer dùng snapshot velocity/masks |
| [Filters.java](../../src/main/java/com/vsos/core/aeb/Filters.java) L95–201 | KEEP ADR legacy; EXTEND diagnostic contract | Filter/window/signal basis versioned. Không tuyên bố rawGT metric cùng official objective chỉ vì cùng Butterworth |
| [TelemetryMetricsService.java](../../src/main/java/com/vsos/backend/service/simulation/TelemetryMetricsService.java) `summarise` L138, `brakePhase` L238 | KEEP legacy / FIX V3 labels | First pedal>.05 after.5 not AEB onset; raw live-read provenance preserved |
| Cùng file `calculateRmsJerk` L263, `calculateImpactSpeed` L303, `calculateRelativeImpactSpeed` L326, `calculateStoppingDistance` L362 | KEEP legacy / REPLACE V3 metrics | Separate signals/windows, vector relative impact; measured/extrapolated distance split, no historical objective rewrite |
| Cùng file `parseCsvFrames` L396, `parseCollisions` L447 | EXTEND adapters | Do not drop sensor-only rows from evidence registry; E ego_speed_before_ms mapping separately from relative; parsing loss must be reported |
| [RunService.java](../../src/main/java/com/vsos/backend/service/simulation/RunService.java) bundle L459–552, `checkResult` L926–961, submit L1143–1187 | KEEP | Preserve source ID/project/version/seed checks and transaction. Offline source={} corpus must not bypass production identity gate |
| Cùng file carlaData L907–923, persist logic L1193–1296 | KEEP historical / EXTEND sidecar | Current DB-derived context must not replace run-local calibration. Existing synthesized collision/failure rows remain LEGACY; no causal training source |
| [AnalysisService.java](../../src/main/java/com/vsos/backend/service/analysis/AnalysisService.java) `outcome` L61, `sample` L48, `freeze` L151, `validTrace` L219, `handoff` L262 | KEEP legacy / EXTEND V3 selection | Current scalar completeness ≠ evidence sufficiency; V3 pins report/formula/policy/metric versions and capability eligibility. Correct future contract “ego impact” vs actual relative semantics, no historical dataset edits |
| [AnalysisViewService.java](../../src/main/java/com/vsos/backend/service/analysis/AnalysisViewService.java) `outcomeOf` L57, OUTCOME_SQL L65, `analysisOutcome` L305 | KEEP legacy / REPLACE V3 projection | Multiple current outcome rules differ in MA/order. V3 reads one report, no second SQL classifier |
| Cùng file `failureList` L137, `failureDetail` L480, `analysisDataset` L323 | EXTEND | Existing detail says RULE_BASED_HYPOTHESIS_NOT_CAUSAL_PROOF (L541); expose V3 axes + missing evidence, explicit mode/authority, no forced failure rows |
| [AnalysisMetrics.java](../../src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java) VERSION L9, valid L14, objective L22–38, evidenceComplete L49 | KEEP `adr040-stored-aggregation/1` | Preserve no-hit impact0 only legacy aggregate contract. Add new named diagnostic metrics/cohorts, not silently change objective denominator/units |
| [Bundle.java](../../src/main/java/com/vsos/core/bridge/Bundle.java) readSpec L199, AEB L370, resultDocument L557; [Xosc.java](../../src/main/java/com/vsos/core/xosc/Xosc.java) read L217 | KEEP / EXTEND read adapter | Import exact vintage identity/config; no re-export/rewrite existing bundles |
| [worker control](../../worker/vehicsim_aeb_control.py) init L69, run_step L103–159; [recorder](../../worker/sensor_recorder.py) radar attach L357, record L401, collision L466, write L521 | KEEP; EXTEND future provenance only | Planner/final/hold/override writers and snapshot vs live read; two radars distinct. Phase2 does not add Python logging |
| [run_xosc.py](../../worker/run_xosc.py) run L247–323 | KEEP | Preserve JAR snapshot/lifecycle; capture missing evidence only future explicit collection |
| [schema](../../database/mysql/01_schema.sql) simulation_runs L582, collision_events L690, failures L710, root_causes L731 | KEEP; EXTEND proposed storage separately | No historical update/backfill overwriting. New evidence report storage/version pointers optional future migration |
| [FailureAnalysisAuditTest.java](../../src/test/java/com/vsos/core/evaluation/FailureAnalysisAuditTest.java) | KEEP characterization; EXTEND separate V3 tests | Tests characterize legacy SAFE/PASS on missing trace and cap→LOW_FRICTION; not V3 correctness oracle |

Line numbers are navigation hints for pinned source. If source moves, resolve named method at pinned revision; file/hash provenance supersedes line location. Full method mapping to formulas is in [FORMULA_SPEC](FORMULA_SPEC_V3.md).

## 4. Storage, API và versioning proposal

### Immutable identities

Report identity includes input artifact hashes, source vintage, schema/formula/policy/requirement/metric versions, geometry/model/action-set IDs, analyzer build ID và deterministic content digest. `analysis_id`/created_at_utc/content_digest excluded from digest. Same input+versions+config yields same content; a new policy creates a new report, không sửa report trước.

Có thể lưu sidecar object storage/file trong prototype; nếu DB cần thì **đề xuất** bảng `failure_analysis_reports` chứa run binding, report JSON/hash, version columns, parent_report_id, created_at và status. Artifact/source refs có thể embedded hoặc separate append-only registry. Đây không là SQL migration đã chốt/đã chạy. Không dùng tables failures/root_causes cũ cho V3 cause claim vì semantics khác. Việc chọn storage/retention/access ở OD-08.

### API version selection

Legacy endpoint/response giữ semantics. New endpoint hoặc explicit analysis_version selector trả contract v1; unknown version fail explicitly, không fallback legacy khi V3 UNKNOWN. Read permission/project binding giữ qua service hiện có. Offline artifact analysis không có quyền tạo run DB giả. Error states tách NOT_ANALYZED, ANALYSIS_FAILED, ANALYZED_PARTIAL khỏi AEB outcome.

V3 endpoint phải trả cả `report` và pointer legacy để reviewer đối chiếu. Consumer chọn requested version; “latest” chỉ là view có audit log/pinning khi freeze. Không tạo boolean is_failure để ép7axes thành1cờ. UI changes chỉ là dependency tương lai, không deliverable Phase2.

### Metric identity

Mỗi metric ID gồm signal basis (raw/G/core-gated), filter, window/event anchor, unit và version. ADR-040 currently stored objective giữ nguyên, bao gồm aggregate no-hit impact0 theo contract của nó. Diagnostic per-run no-contact impact=null. Dataset không trộn hai basis; đổi objective phải ADR/version riêng, không chỉ đổi label.

## 5. V3.1 implementation staging, chưa thực hiện

Bảng dưới supersede stage labels M0/M1/M2-shadow/M3/M4/M5 của bản thiết kế trước; không thay CoreV3 behavior. Đó là **acceptance cho công việc tương lai**, không danh sách việc được quyền triển khai ở task V3.1. Read-only diagnostic stages không cần đợi mọi operational decision; M2 chỉ mở khi dependency phù hợp scope đã chốt.

| Stage tương lai | Work | Exit criteria / giới hạn |
|---|---|---|
| M1A — Evidence/identity + canonical reader | Read-only adapters, artifact/source registry, core validation, current baseline-binding procedure,3scalar as-recorded reader | OA-01/HF-01..03; Golden18DB/v1 binding UNKNOWN; hashes immutable, no inferred IDs/default score. Chưa cần chốt cause threshold để đọc facts |
| M1B — CoreV3 + objective explanation | Geometry/conflict, timeline, feasibility, diagnosis và Diagnostic Report thêm3 objective provenance/decomposition | Giữ toàn bộ Core acceptance; OA-02..07;31recorded contacts/12conflicts giữ nguyên, no raw-GT replacement canonical, pending/censored/missing correct |
| M1C — Handoff builder read-only | Canonical aggregation/statuses, reviewed-role manifest, eligibility và sourced-domain/suspected-hint serializer | OA-08..09/HF-04..08/HF-11..12; no fake baseline score/range; no duplicate variant-seed/validation leakage; unresolved source→UNKNOWN, no candidate creation |
| M1D — Offline consumer compatibility | Compare exact v2 DTO/manifest/metric semantics với current consumer; export review artifact và validate future projection via fixtures | OA-10/HF-09..10; detect missing dataset consumption, null/rounding/activation divergence, ignored custom bounds; current NOT_DIRECTLY_CONSUMABLE. No optimizer dispatch/DB/API mutation |
| M2 — Future authorized integration | Reuse current MoboEngine via reviewed boundary; exact frozen optimization cohort, canonical calculator, source identity, enforced bounds; validation sealed | Full OA/HF/Core suite + actual binding/quality decisions resolved for intended scope. No new optimizer/controller/calibration; preserve legacy histories; stalebaseline/digest/missing/constraint failure block. Integration requires separate task, not automatically started |

Rollback: stop V3 serving/selection, keep sidecars for audit, revert consumers to pinned legacy view. Since raw/history untouched, no data reversal/recompute needed. Do not delete reports to hide disagreements. Không stage nào được thực hiện hoặc tự động bắt đầu bởi task thiết kế V3.1 này.

## 6. Downstream MOBO/Regression quality gates

Current `AnalysisService` ON-only selection, finite metrics và `AnalysisMetrics.evidenceComplete` do not prove contact/causal completeness [A04]. V3 must separate:

- Outcome eligibility: physical authority/coverage sufficient for objective; collision-disagreement quarantine for contact-dependent objectives.
- Metric eligibility: signal/window/calibration applicability/uncertainty sufficient for **that metric**, not requirement for confirmed root.
- Functional eligibility: approved duty/caution/hazard/opportunity evidence; false-brake denominator only policy-eligible nonhazard encounters.
- Causal-label eligibility: confirmed cause threshold met; Golden18 none. Not required to optimize legitimate physical metric, required if training/selecting by confirmed cause.
- Pair eligibility: same scenario/seed/vehicle/physics/simulator/controller version except candidate parameters, target trajectory context and timing; disturbances/clock/control gaps disclosed.
- Cohort reproducibility: freeze artifact/report/digest/version/eligibility reasons, ON/OFF roles, cluster/rep grouping and excluded/unknown counts. Include safe/nonhazard cases; no selection from failures table alone.

Historical frozen datasets/baselines/regression decisions remain immutable under original metric contract. New V3 dataset gets new identity/version, not edit of old snapshot. Unknown metrics cannot become successful score0 or silently drop high-risk cases; quality failures reported alongside cohort. Need OD-06 before operational gate use.

## 7. Proposed evidence collection backlog, không thay đổi runtime

Golden18 không thể bổ sung từ source suy đoán: primary radar point/track/rejection state, measurement/delivery/consumed frames, controller prediction inputs, full bbox pose, command writer/sequence/applied/consumed final control, velocity override ticks, physics snapshot origin, contact branch/raw callback/drain watermark, calibration validation domain/residuals. Contract defines these as UNKNOWN today.

Một future task có thể chỉ bổ sung logging/provenance mà không đổi control algorithm, nhưng vẫn cần separate scope/review và versioned simulator identity nếu artifact semantics thay đổi. Không thu thập bằng cách chạy CARLA trong Phase2; không tự fit calibration hay “sửa” AEB để làm golden pass.

## 8. Verification và bàn giao

Implementation tương lai phải đạt [GOLDEN18 acceptance](GOLDEN18_EXPECTED_BEHAVIOR.md) và formula/policy invariants, cùng relevant repository architecture/security checks khi code thật sự thay đổi. Legacy characterization tests tiếp tục pass; V3 tests dùng independent analytic cases/facts, không mirror legacy heuristic.

V3.1 cập nhật sáu Markdown hiện có và tạo hai contract mới, chỉ trong thư mục này. Kiểm chứng tài liệu gồm đủ53formula mappings,18case/72run consistency, source links/hashes, equations và unchanged source/history. Không chạy build/test suite tạo outputs ngoài scope; không claim backend behavior đã được sửa.

## 9. V3.1 objective-centric architecture và mapping hiện hữu

CoreV3 tiếp tục tạo geometry/timeline/physical/diagnosis/evidence. Thêm các **module đề xuất**, không ghi đè core facts:

| Proposed module | Responsibility / input → output | Existing source disposition |
|---|---|---|
| CanonicalObjectiveReader.read | Raw/evaluation/DB snapshot →3stored values, applicability và disagreements | KEEP Simulator/CarlaSession/Evaluation/RunService; không tái chấm |
| MetricProvenanceResolver.resolve | Producer profile/dt/core/filter/window →typed lineage | KEEP Filters/DecelMeter algorithm; signal gate/clamp được công khai |
| ObjectiveExplainer.explain | Core facts +3canonical values →ObjectiveEvidence | EXTEND report; physical diagnostic metrics có ID riêng, không REPLACE canonical objective |
| StoppingObjectiveExplainer.decompose | Source frames/onset/v_last/a_available/vintage →trace+tail+replay check | KEEP brakePhaseMetrics total; outputcomponents là descriptive derived facts |
| BaselineBindingResolver.verify | Authorized project/version/run/config snapshot →binding/currentness/v1 status | KEEP Queries/Bootstrap/ProjectRepository read semantics; không bootstrap hoặc viếtversion |
| CanonicalAggregateProjector.aggregate | Frozen ordered cohort →AnalysisMetrics.aggregate exact shape/statuses | KEEP AnalysisMetrics.VERSION và sample semantics, no custom weighted score |
| ObjectiveEligibilityEvaluator.assess | Per-objective quality + reviewedroles + identities →eligibility manifest | EXTEND gates; không require confirmed root cho mọi metric, không drop unsafe/missing quietly |
| ParameterHintBuilder.describe | Optimizationpartition evidence +4actual params + source mechanism →SUSPECTED/ABSTAIN hints | EXTEND context; không gọi AebStack/MoboEngine, không propose numeric candidate |
| SourcedRangeResolver.intersect | Verified catalog/engine/approveddomains →suggested range hoặc UNKNOWN | KEEP domain values; future proposal boundary phảienforce, source-only numbers không approval |
| MoboHandoffAssembler.assemble | Dataset/baseline/aggregate/refs/hints/domains/quality →review artifact | EXTEND separateoutput, không tạo optimizationrun/trial/candidate |
| ConsumerCompatibilityValidator.check | Exact current DTO/service contract + proposedhandoff →gaps/parity result | KEEP existingengine; NOT_DIRECTLY_CONSUMABLE cho AS-IS. No silent API adaptation |

Current class/method mapping bổ sung:

| Current class.method | Action trong thiết kế | Evidence / dependency |
|---|---|---|
| AnalysisMetrics.valid/aggregate/evidenceComplete/objectivesAvailable | KEEP canonical; EXTEND external quality report | Objective fields/status/missing/NA exact; evidenceComplete không đồng nghĩa3available hayphysical proof |
| AnalysisService.sample/item/SELECT | KEEP current projection; EXTEND typed adapter inputs | Braked inference/tracegate khác actualphysics; variantID=scenario_version_id, not variantlabel |
| AnalysisService.freeze/handoff/digest | KEEP archive/identity/digest semantics; EXTEND companionreport, FIX descriptor trongfuture versionedview | Current EGO_SPEED_NOT_RELATIVE conflictsxosc15; preserve archivedliteral, add sourceddescriptor; no historical rewrite |
| OptimizationController.OptimizationRequest | KEEP current API; document NOT_SUPPORTED fields | No datasetID/runsets/evidencerefs/hints; không pretend schema accepted |
| OptimizationService.executeOptimization/getOrCreateBaselineRuns | KEEP AS-IS; future integration boundary EXTEND exact cohort | Latestfamily/latestrowpervariant hiện không frozen role/seed list/digest enforcement |
| OptimizationService.evaluateCandidateRuns/computeStats | Current semantics documented, **not canonical**; future authorized alignment qua shared boundary | Nullskip/fallback0, aeb_activated vs Sample.braked, rounding/rates; no objectivechange to imitateit |
| OptimizationService.proposeCandidate | KEEP algorithm call; future boundary parameter validation | Defaults hardcoded dù customspace stored; post-parent-equality TTC mutation can break narrowedrange |
| MoboEngine/MoboTrial/MoboProposal/ParameterBounds | KEEP optimizer, no refactor in FA | Typed3scalars/4keys; MoboTrial.valid lacks finite/quality; keydimensionorder phải namedmapping |
| AebService.createCandidate / Queries.parameterCatalog,aebValues,baselineVersion | KEEP livecatalog enforcement/read authority | Currentcatalog can differ seed; no hint apply/mutation fromFA |
| OptimizationService.selectCandidateForVerification | KEEP current behavior as source fact; future contract mustpin validationhandoff | Current call createsTest byscenario without frozen validationID; no Pareto/Reviewer approval assumption |

Source/hash fingerprints trong DATA_CONTRACT mục12. Authoritative currentconsumer shape, aggregation discrepancies và bounds trong MOBO_HANDOFF mục1–3,6–7. AGENTS/CLAUDE/oldplan “MOBO chưa có” được ghi là documentary drift; chỉ docs trong thư mục này được cập nhật.

## 10. Stage gates, rollback và definition of done V3.1

- M1A phải làm được diagnostic read khi baseline vẫnUNKNOWN; không bắt nhập DB/fake ID để parser pass.
- M1B phải giữseven axes+all Core tests và thêm3 objective explanations; không phase nào đổicanonical/physicalsignal để golden pass.
- M1C chỉaggregate trên verified reviewed cohort hoặc synthetic test fixtures; không tự chạy toànGolden18 để tạo “v1 score”. Gate thiếu→partial handoff artifact, no numerical fabrication.
- M1D là offline conformance, khôngcall current POST /optimizations; data đủ không biến integrationgap thành supported.
- M2 require explicitnewtask, approvedOD dependencies, current baseline/snapshotchecks, shared canonical metrics và enforced bounds/partition. Reuse engine, no optimizer rewrite; source/API/DB changes nếu cần phải được scope/review riêng.
- Validation evidence sealed cho hints/fit; OFF control không baseline. Handoff claims không bypass reviewer/quotas/authorization.
- Rollback giữraw/history/dataset v2 và sidecar reports, không re-score hoặc reset baseline; disabledconsumerintegration chỉ ngừng serving/export for operation.

V3.1 design DoD: đủ8file, source-backed canonical/path/domain/baseline/consumer mappings,10OA+12HF acceptance và M1A/M1B/M1C/M1D/M2exit criteria; Core53formula dispositions/18case matrix giữ. Kiểm chứng chỉ read-only source/raw và document consistency; không compile/build,khôngCARLA,khôngDB/API,khôngoptimizerrun,khôngcommit/push/merge. Sau bàn giao **dừng trước M1A**.
