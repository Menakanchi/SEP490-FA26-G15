# M1C — MOBO Handoff Builder implementation

Đã implement lớp bàn giao **offline, read-only** của Failure Analysis V3.1.
Không sửa M1A/M1B, producer, công thức vật lý, diagnosis, AnalysisMetrics,
AnalysisService, RunService, OptimizationService, MoboEngine, DB/API/frontend.
Không chạy CARLA, campaign, commit/push/merge. Dừng tại M1C; M1D/M2 chưa làm.

Nguồn đối chiếu: toàn bộ tám đặc tả V3.1; báo cáo M1A/M1B; sáu audit trong
`data/failure-audit-output/`; source failureanalysis, AnalysisMetrics,
AnalysisService, OptimizationService, MoboEngine, ParameterBounds,
BootstrapService; metric contract, ADR-040/044/055, quy tắc repo/package và kế
hoạch 20/10. Audit và tám bản thiết kế được giữ nguyên. Câu “MOBO chưa triển
khai” trong tài liệu repo cũ khác source hiện hữu: engine/service có code,
consumer cho V3.1 và frozen partition chưa có.

## Source và entry points mới

Tất cả source mới ở `src/main/java/com/vsos/core/failureanalysis/`, chỉ dùng JDK
và core hiện có; không thêm dependency, Spring service, interface hoặc DB adapter.

| Class/method | Chức năng |
|---|---|
| [HandoffSnapshots.read/source/digest](../../src/main/java/com/vsos/core/failureanalysis/HandoffSnapshots.java) | Đọc snapshot với expected byte SHA độc lập do caller cung cấp; registry source; digest canonical, không biến hash thành chứng nhận reviewer/runtime |
| [CanonicalAggregation.aggregate/readSample/sampleJson](../../src/main/java/com/vsos/core/failureanalysis/CanonicalAggregation.java) | Gọi trực tiếp `AnalysisMetrics.aggregate`, chỉ project record sang JSON; giữ Sample camelCase/null, không có thuật toán mean mới |
| [SearchRangeResolver.repositorySources/resolve](../../src/main/java/com/vsos/core/failureanalysis/SearchRangeResolver.java) | Đọc catalog từ actual BootstrapService source và defaults từ loaded ParameterBounds; phân biệt source seed/live catalog/campaign/model constraints, giao miền theo key |
| [ParameterHintBuilder.build/gates](../../src/main/java/com/vsos/core/failureanalysis/ParameterHintBuilder.java) | Chỉ đọc optimization evidence; nối candidate, canonical lineage, ordered detection/decision/command, reviewed evidence gates và source mechanism thành SUSPECTED/ABSTAIN/NO_PARAMETER_HINT |
| [MoboHandoffBuilder.build](../../src/main/java/com/vsos/core/failureanalysis/MoboHandoffBuilder.java) | Bind raw/report/snapshot/sample; manifest, canonical replay, baseline score gate, roles, quality, eligibility, provenance/digest và compatibility |
| [OfflineMoboHandoff.main](../../src/main/java/com/vsos/core/failureanalysis/OfflineMoboHandoff.java) | Đọc ZIP/directory và các Diagnostic Report đã có; ghi một sidecar mới bằng CREATE_NEW; không tự freeze, sinh DB sample hoặc baseline |

`MoboHandoffBuilder.Input` gồm members, selection, quality policy, sourced domains,
source mechanism và source artifacts. Mỗi `MemberInput` giữ Run bất biến, Evidence
Report và/hoặc Diagnostic Report, optional baseline-binding snapshot, canonical
sample snapshot và mechanism review. Có cả hai report thì phải cùng raw identity
và canonical values. Raw Run cần cho hash/binding checks; không dùng result.source
trống như DB identity.

## Offline input contract thực tế

Các schema dưới đây là **normalized offline export mới**, không phải cấu trúc
JSON hiện hành của backend. Không có endpoint/exporter DB mới. Snapshot thiếu,
không verified hash, sai schema/scope hoặc chưa được phê duyệt làm gate UNKNOWN;
không lấy AebParams.DEFAULT, seed catalog hoặc case name để điền dữ liệu.

| Input | Schema và fields cần thiết |
|---|---|
| Baseline binding | Tái sử dụng nguyên `vehicsim.baseline-binding-snapshot/v1` và `BaselineBindingResolver.verify`. Per-run raw source IDs/result SHA/4 actual params phải khớp. Project/version/currentness/v1 lineage không suy từ tuple |
| Selection | `vehicsim.failure-analysis-selection/v1`: snapshot_schema=`vehicsim.analysis-dataset/v2`, snapshot_id, selection_status=FROZEN, reviewed, baseline_current, project_id, scenario_id, baseline_version_id, exported_at RFC3339, review_refs, members[] |
| Selection member | run_key, partition, run_id, **scenario_version_id**→variant_id, seed, replicate, attempt, report_digest, result_sha256, configuration_digest/profile, case_roles, role_basis. Partition thuộc OPTIMIZATION/VALIDATION/DIAGNOSTIC_ONLY/EXCLUDED/UNKNOWN |
| Canonical sample | `vehicsim.canonical-sample-snapshot/v1`: run_key, run_id, selection_sha256, report_digest, result_sha256, trace_available, sample, provenance. Sample giữ đúng status/endReason/collision/falsePositive/falseNegative/verdict/braked/jerk/impact/stopping |
| Provenance trong sample | aggregation_version, metric_source=SIMULATOR_RESULT, simulator, producer, dt, vehicle_id, core_jar_sha256, core_source_commit, worker_sha256, scenario_runner_version/sha256, source_refs, metric_source_hashes[{path,sha256,commit}], objectives[key]{signal,filter,window,source_refs} |
| Quality policy | `vehicsim.handoff-quality-policy/v1`: status=APPROVED, scope=MOBO_HANDOFF, version, selection_sha256, approval_refs, constraint_refs, members keyed by run_key. Mỗi objective có status, report_digest, source_refs, profile_verified EV và calibration applicability/basis |
| Per-objective calibration | NOT_APPLICABLE phải có calibration_basis_refs; IN_DOMAIN phải có calibration_refs với id/version/artifact_sha256/source_refs. UNKNOWN/OUT_OF_DOMAIN không đủ. Source/JAR hash không thay validation artifact |
| Collision adjudication | Run có report.disagreements cần thêm cited `collision_adjudication` EV true/OBSERVED hoặc DERIVED. General quality approval không tự giải quyết collision authority |
| Nonhazard review | SAFE_CONTROL và EVIDENCE_REVIEWED, thêm nonhazard_review{status=REVIEWED_NONHAZARD,report_digest,source_refs} trong policy cho mỗi partition. Design intent/legacy SAFE không đủ, không sửa Core UNKNOWN thành SAFE |
| Parameter mechanism review | `vehicsim.parameter-mechanism-review/v1`: run_key, report_digest, status=APPROVED, version, basis_partition=OPTIMIZATION, approval_refs, parameter_code, direction. Phải có actual ordered same-clock timeline và cited supported gates trong report.parameter_mechanism_evidence; review không thay missing facts |
| Authorized domain | `vehicsim.search-domain-snapshot/v1`: kind=CATALOG_LIVE/CAMPAIGN_APPROVED/MODEL_CONSTRAINT, status=APPROVED, version, project_id, baseline_version_id, selection_sha256, basis_partition=OPTIMIZATION hoặc EXTERNAL_POLICY, approval_refs, intervals[code]{lower,upper,unit} |
| Model constraints | Chỉ explicit parameter intervals của model có model_id/model_sha256/validation_refs. Campaign cần model_constraints_complete=true; không tự chiếu calibration speed/μ domain thành parameter range |

Sample projection được đối chiếu raw M/evaluation: ba scalar, collision, legacy
false_activation/missed_activation/verdict, end reason và braked inference như
AnalysisService.sample. Status DB phải từ export; không dựng COMPLETED. Trace phải
thật sự có đủ fields finite, t không âm/tăng nghiêm ngặt và ego_v không âm; một
trace_available=true không thay trace. Flags legacy chỉ là canonical sample claims,
không ground truth của functional diagnosis.

Caller chịu trách nhiệm cung cấp export được cấp quyền và expected SHA từ một
reference độc lập. Hash đúng chỉ xác minh bytes. M1C kiểm tính nhất quán của các
claims/as-of snapshot; không xác thực danh tính reviewer bằng chữ ký, truy vấn DB
hiện tại hoặc chứng nhận freshness tại thời điểm future consumption. Những việc
đó không được giả làm đã hoàn thành bởi một field APPROVED.

## Canonical aggregation và baseline gates

Version giữ nguyên `adr040-stored-aggregation/1`. `CanonicalAggregation` gọi
`AnalysisMetrics.aggregate(List.copyOf(samples))`; không tự round, đổi denominator,
weight repetitions, skip null hoặc thêm objective. Shape Objective giữ nguyên
value/samples/missing/**notApplicable**/unit/status.

- VALID/INCOMPLETE/NOT_APPLICABLE và thứ tự invalid sample → impact no-hit zero →
  braked false NA/unknown missing → finite scalar được giữ nguyên.
- Null contact speed trong Diagnostic Report vẫn null. No-hit zero chỉ là đóng
  góp của valid sample cho impact aggregate.
- `canonical_aggregation` là replay có identity của **đúng requested partition**,
  không phải baseline score. Policy chưa approved vẫn có thể đọc replay này,
  nhưng `baseline_objectives` UNKNOWN.
- Baseline score cần reviewed frozen source, full DB/run/version/actual config
  binding, canonical samples/provenance, approved per-objective quality, reviewed
  nonhazard controls và aggregate completeness. Optimization cần cả ba VALID;
  validation có thể NA theo `evidenceComplete`, không tạo ba zero.
- Bad/missing member không bị bỏ để score đẹp. Duplicate variant+seed, overlap
  variant giữa partitions, duplicate DB run, mixed config/provenance hoặc OFF bị
  yêu cầu vào operational partition block cohort; không chọn best repetition.
- Finite input sum vẫn có thể overflow trong existing aggregator. Adapter chặn
  serialization của nonfinite aggregate, không sửa thuật toán hoặc clamp mean.
- Không tạo MoboTrial, trial0, candidate hoặc baseline version mới.

Synthetic OA-08 có ba optimization samples, J/I/D=**3/2/15**, với đúng counts;
validation fixture all-no-brake giữ J/D NOT_APPLICABLE. Đây là test math và binding,
không phải số đo baseline của một project thật.

## Hints, ranges và sealed validation

Hints chỉ xét TTC_THRESHOLD, BRAKE_ACTIVATION_DELAY, MAX_DECELERATION,
BRAKE_BUILDUP_RATE, map theo **code**, không positional engine/UI order.
Output gồm evidence refs, candidate/metric IDs, source mechanism, direction cho
review, ba objective tradeoffs, prerequisites và non-parameter alternatives.
Không có numeric candidate, expected score/improvement, acquisition hay probability.

Positive hint cần cited mechanism review cùng report digest, actual timeline có
detection≤decision≤command trong cùng clock, canonical copy/lineage, explicit
detection/clock/geometry/calibration/attributed-response gates và mechanism-specific
opportunity/headroom/ramp/threshold gate. CONDITIONAL hoặc missing gate không
được nâng thành proof. NO_BRAKING với detection/control chain unresolved phải
ABSTAIN. OFF không có hints; validation bị trả về trước khi đọc evidence.

Golden18 thiếu prerequisites nên không có parameter proposal. Builder không tự
chọn optimization partition cho Golden18. Unit tests riêng gọi hint reader để xác
nhận 007/012/061/064 ABSTAIN; điều này không enroll các run ấy vào dataset.

Source domains được đọc từ source thật:

| Code | Catalog source seed | Loaded engine defaults |
|---|---|---|
| TTC_THRESHOLD | [.5,4] s | [.5,3.5] s |
| BRAKE_ACTIVATION_DELAY | [0,.5] s | [.05,.45] s |
| MAX_DECELERATION | [3,10] m/s² | [5,10] m/s² |
| BRAKE_BUILDUP_RATE | [5,20] m/s³ | [5,20] m/s³ |

`catalog_domain` có SOURCE_SEED_ONLY; `live_catalog_domain` là field riêng.
Suggested interval chỉ là giao live catalog ∩ engine ∩ approved campaign ∩
explicit validated model constraints. Thiếu nguồn/scope/unit/approval thì UNKNOWN;
empty intersection EXCLUDED; lower=upper FIXED_DIMENSION_UNSUPPORTED, không widen.
Không dùng ±percentage, baseline-centered range hoặc μg làm requested cap bound.
Validation evidence không tham gia hint/range generation. Selection digest có thể
pin cả hai partitions để integrity, không phải dùng validation distribution để fit.

## Golden18 thực tế và contract coverage

Input `D:/Downloads/golden18_raw_artifacts.zip`, SHA256
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`.
Đọc đủ **18 case / 72 run / 54 ON / 18 OFF**, giữ từng repetition/attempt.

| Output | Kết quả thực tế |
|---|---|
| Dataset manifest | 72 member, local run_key giữ nguyên, tất cả DIAGNOSTIC_ONLY; DB run_id/variant_id/version_id UNKNOWN, không cast case name |
| Baseline | Identity/v1/current/score UNKNOWN, không dựng one-baseline aggregate từ 17 tuple TTC1.5 và case091 TTC.6 |
| Objectives | Chỉ refs tới canonical values và explanations M1A/M1B; không sửa jerk/filter/window, stopping trace/tail hoặc physical contact impact |
| Operational selection | UNFROZEN, optimization/validation IDs rỗng; không phân rep thành independent variants hoặc tự chọn representative |
| Eligibility | 54 ON UNKNOWN, 18 OFF EXCLUDED/OFF_CONTROL_ONLY; counts reconcile đủ72; overall BLOCKED |
| Hints/ranges | Không hints từ unselected corpus; cả4 suggested_range UNKNOWN. Source catalog/default intervals vẫn có refs/hashes |
| Failure evidence | Trỏ Diagnostic Report candidates; root UNKNOWN được giữ, không học legacy labels |
| Provenance/digest | Raw byte hashes, report semantic digest/profile và sourced-code hashes riêng; simulator/dt/core/source giữ khi có evidence, worker/calibration validation thiếu vẫn UNKNOWN |
| Consumer | NOT_DIRECTLY_CONSUMABLE, dispatch_allowed=false |

Samples mới, không ghi đè sidecar M1A/M1B:

- [GOLDEN18_OFFLINE-handoff.json](samples/m1c/GOLDEN18_OFFLINE-handoff.json): actual72,
  evidence_scope OFFLINE_UNBOUND, không operational baseline.
- [SYNTHETIC_ONLY-handoff.json](samples/m1c/SYNTHETIC_ONLY-handoff.json): explicit
  SYNTHETIC_TEST_ONLY, positive binding/aggregation/hint/range test, không dữ liệu thật.
  Input generator: [M1CFixture.java](../../src/test/java/com/vsos/core/failureanalysis/M1CFixture.java).

Digest profile `fa-handoff-sorted-json/1` tái dùng sorted JSON/number normalization
của M1A, bỏ volatile handoff_id/created_at_utc/content_digest; arrays giữ order.
Registry/report reference ghi đúng digest profile, không coi report semantic digest
là byte SHA hoặc AnalysisService/Jackson semantic digest. Đổi partition/input/hash
làm đổi digest; map ordering và UUID/time không làm đổi content digest.

## Acceptance và verification

Kiểm chứng bắt đầu 23/11 và hoàn tất 24/11/2026, JDK21, PowerShell. Logs/test XML
nằm trong `target/`. Không gọi CARLA, provider thật hoặc operational DB; full suite
có legacy optimizer/regression unit tests dùng mock, không phải campaign/approval thật.

| Suite | Total | Pass | Fail | Error | Skip | Build |
|---|---:|---:|---:|---:|---:|---|
| Full baseline trước sửa | 1,020 | 1,015 | 2 | 0 | 3 | FAILURE có sẵn |
| M1C mới | 162 | 162 | 0 | 0 | 0 | PASS trong focused/full |
| Focused cuối, gồm M1A/M1B + architecture/docs/metric | 455 | 453 | 0 | 0 | 2 | SUCCESS, JAR + repackage |
| Full verify cuối | 1,182 | 1,177 | 2 | 0 | 3 | FAILURE do cùng hai lỗi baseline |

Test files mới ở `src/test/java/com/vsos/core/failureanalysis/`:

- [CanonicalAggregationTest](../../src/test/java/com/vsos/core/failureanalysis/CanonicalAggregationTest.java):
  **37 pass**, OA-08/09, exact canonical parity, invalid/null/NA/denominators,
  no rounding, empty/incomplete/status fixtures và overflow guard.
- [MoboHandoffBuilderTest](../../src/test/java/com/vsos/core/failureanalysis/MoboHandoffBuilderTest.java):
  **20 pass**, positive synthetic binding, duplicate/leakage/OFF/mixed config,
  missing trace/sample/profile/calibration, unapproved quality, unknown role,
  retained missing denominator, report tamper, digest và sealed validation.
- [ParameterHintsAndBoundsTest](../../src/test/java/com/vsos/core/failureanalysis/ParameterHintsAndBoundsTest.java):
  **21 pass**, actual sourced bounds, valid/empty/fixed/invalid intervals, explicit
  model constraints, strict four keys, hint evidence/tradeoffs/abstention và
  actual timeline không được thay bằng một true gate.
- [M1CGolden18IntegrationTest](../../src/test/java/com/vsos/core/failureanalysis/M1CGolden18IntegrationTest.java):
  **84 pass**, gồm72 independent member checks +12 corpus/runner invariants.
- [M1CFixture](../../src/test/java/com/vsos/core/failureanalysis/M1CFixture.java):
  một utility dùng thật để tạo synthetic snapshots/run evidence; không phải test
  count thêm, không fixture operational.

Hai lỗi có sẵn, tái hiện cả trước và sau M1C:

1. `OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor`
2. `OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt`

Đều là expectation của mocked `db.update` không khớp FAILED/message trong source
hiện hữu. Không sửa service hoặc test ngoài phạm vi để full suite xanh.

Hai skip focused là HF-02/HF-03 trong M1AAuthorizedFixtureTest: chưa có authorized
project/version/run/creation-lineage export và frozen dataset/current-baseline/
revision/semantic-digest fixture. Synthetic positive không thay thế chúng. Skip
thứ ba của full suite là KinematicParityFullTest đã @Disabled từ trước.

| Acceptance | Trạng thái và bằng chứng |
|---|---|
| OA-08 | PASS, synthetic3run 3/2/15 và exact samples/missing/notApplicable parity |
| OA-09 | PASS, canonical null/negative/NaN/Infinity/brakedUnknown/TIMEOUT/ERROR/INCOMPLETE/empty rules; missing trace claim không thành COMPLETED sample |
| HF-04 | PASS, duplicate variant+seed và variant leakage block whole operational cohort; Golden repetitions không gộp |
| HF-05 | PASS, OFF diagnostic-only/excluded; design/legacy SAFE không làm nonhazard review hoặc đổi physical UNKNOWN |
| HF-06 | PASS, mixed actual configs block;091 TTC.6 giữ nguyên, không tạo one-baseline aggregate |
| HF-07 | PASS, actual source intervals và verified-domain intersection; missing/invalid/empty/fixed abstention |
| HF-08 | PASS, chỉ4code, evidence/lineage/source mechanism, SUSPECTED/ABSTAIN/NO_PARAMETER_HINT, không numeric optimization proposal |
| HF-11 | PASS, validation không làm đổi hints/ranges; không drop bad/missing member; counts reconcile |
| HF-12 | PASS trong M1C scope, profile/hash/window/calibration thiếu hoặc conflict block quality với reasons; không mượn JAR hash làm calibration artifact |
| Raw/history/M1A/M1B | PASS, protected hashes không đổi; 72 prior M1B sidecars và report inputs không bị ghi đè |
| Authorized operational baseline/freeze integration | **BLOCKED bởi fixture chưa được cung cấp**, không claim PASS từ synthetic; đây không phải thiếu parser/math của M1C |
| M1D/M2 | NOT_RUN, đúng giới hạn nhiệm vụ |

Lệnh thực tế từ repository root:

```powershell
# Baseline trước sửa
.\mvnw.cmd -B verify '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' *> target/m1c-baseline-verify.log

# Compile và tests trong khi implement
.\mvnw.cmd -B -DskipTests compile *> target/m1c-compile.log
.\mvnw.cmd -B '-Dtest=CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' test *> target/m1c-tests-second.log

# Final focused verify; 455 tests, SUCCESS
.\mvnw.cmd -B '-Dtest=CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest,PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> target/m1c-focused-verify-final.log

# Final full verify; 1182 tests, hai lỗi baseline
.\mvnw.cmd -B verify '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' *> target/m1c-full-verify-final.log

# Runner được gọi thật trong Golden18 integration, với @TempDir output mới:
# java -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff <zip> <report-dir> <NEW-output.json> <repository-root>

# Kiểm tra lại hai sample sau serialize/pretty-print
java --class-path target/classes target/CheckM1CHandoffs.java docs/failure-analysis-v3/samples/m1c/GOLDEN18_OFFLINE-handoff.json docs/failure-analysis-v3/samples/m1c/SYNTHETIC_ONLY-handoff.json
git diff --exit-code
git status --short
```

Checker JDK đã parse lại hai JSON, recompute đúng content digest và kiểm
**1,689 source references** đều có registry entry: PASS. Golden actual72/baseline
UNKNOWN, synthetic label/positive score và consumer status đều đạt. Checker nằm
trong target như verification artifact, không thêm runtime abstraction.

## File diff, tính bất biến và git status

So snapshot đầu M1C: **0 pre-existing file modified/deleted**, kể cả source/test
M1A/M1B, tám đặc tả, hai báo cáo implementation cũ, sáu audit và ZIP raw. Thêm
6 source Java, 4 test classes +1 fixture utility, report này, 2 sample JSON và exec
plan hoàn tất. Unified patch chính xác11Java mới: `target/m1c-source.diff`,
**1,106 added lines**; hashes/list: `target/m1c-protected-check.json`.

`git diff --exit-code` trả0 vì source/docs failureanalysis đã untracked từ M1A,
không phải vì không có implementation mới. Không stage/commit để làm giả diff.

```text
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1a.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1b.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1c.md
?? docs/failure-analysis-v3/
?? src/main/java/com/vsos/core/failureanalysis/
?? src/test/java/com/vsos/core/failureanalysis/
```

## Dữ liệu operational còn thiếu và consumer gaps

Nhóm cần cung cấp authorized project/scenario/variant/run/version snapshots với
creation lineage/currentness/4actual params, reviewed unique/disjoint frozen
partition/representative selection, DB Sample projection, metric/build/simulator/
worker/runner hashes và signal/filter/window, approved per-objective quality/
calibration/contact adjudication/nonhazard scope, live catalog/campaign/model
domains. M1B hiện chưa có supported parameter-mechanism gates ở Golden18; không
tự tạo chúng để có hint. Chưa có các export/decisions này thì operational use vẫn
UNKNOWN/BLOCKED. Các producer không có dt/provenance cần thiết cũng UNKNOWN,
không được default sang CARLA/current profile.

Consumer gaps đã xác nhận bằng source và serialize thành status, chưa implement
compatibility validator/integration M1D/M2:

- Current OptimizationRequest không nhận V3.1 handoff/dataset partition/evidence.
- OptimizationService tự chọn latest runs/variant, không enforce exact frozen
  cohort, sealed validation, source/report digests và approved quality.
- Legacy helper khác canonical về activation membership, null skipping/zero
  fallback và rounding; baseline stats chỉ rates, không three-objective score.
- proposeCandidate vẫn dùng ParameterBounds.defaults; stored custom bounds chưa
  được enforce và nhánh mutation TTC còn có thể ra ngoài narrowed range.

Do đó file hợp lệ hoặc baseline synthetic KNOWN vẫn luôn
**NOT_DIRECTLY_CONSUMABLE**; `consumer_dispatch_allowed=false`. Không thêm API,
consumer shim, optimizer invocation hoặc triển khai M1D/M2 để vượt ranh giới này.
