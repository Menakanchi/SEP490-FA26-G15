# Failure Analysis V3.1 — Fix Batch 02

Đã sửa FA-005, FA-006, FA-008 trong offline Failure Analysis. Giữ nguyên các
contract/digest profiles, canonical producer/aggregation, công thức vật lý và
Batch 01. Đây không phải nghiệm thu operational baseline hoặc consumer M2.

Focused verify cuối: **713 tests, 711 pass, 0 fail/error, 2 skip; BUILD SUCCESS**.
Full verify cuối: **1.440 tests, 1.435 pass, 2 fail có trước, 0 error, 3 skip;
BUILD FAILURE**. Không sửa hai test/service ngoài phạm vi để làm xanh full build.

Golden18: **72/72 oracle**, 54 ON / 18 OFF, 31 COLLISION / 41 UNKNOWN,
12 source disagreements, 216 canonical scalar/null giữ nguyên, 0 confirmed root
causes. Independent physics: 32/32. Diagnostic/handoff/compatibility digests: 74/74.

## 1. Cơ sở và giới hạn

Đã đối chiếu tám spec V3.1, sáu audit trong `data/failure-audit-output/`, toàn bộ
final-audit và probe gốc, Batch 01 report, FA source/tests và producer source.
Tài liệu audit là bằng chứng cần kiểm tra; yêu cầu triển khai lấy từ task Batch 02
của người dùng. Không lấy legacy failure labels làm oracle mới.

Nguồn chính: [defects](../final-audit/10_DEFECTS_AND_REMAINING_WORK.md),
[objective audit](../final-audit/04_OBJECTIVE_ANALYSIS_AUDIT.md),
[handoff audit](../final-audit/07_MOBO_OUTPUT_CONTRACT_AUDIT.md),
[test audit](../final-audit/08_TEST_AND_CODE_QUALITY_AUDIT.md),
[probe gốc](../final-audit/verification/FinalAuditProbe.java),
[Batch 01](FIX_BATCH_01_REPORT.md).

Đối chiếu source thực: `CarlaSession.currentFormat/finish`,
`Simulator.simulate/brakePhaseMetrics`, `AebStack.DT`, `DecelMeter.update`,
`Filters.butterworthZeroPhase/tAebIndex/rmsJerk`. Những class producer này chỉ đọc.
Hướng dẫn AGENTS/CLAUDE, metric contract và ADR-055 đã được tra trước khi sửa;
khẳng định cũ trong AGENTS rằng MOBO chưa triển khai không được dùng thay cho
consumer source thực tế. Exec plan được lưu riêng theo quy tắc repository.

## 2. Root causes và sửa chữa

| Finding | Root cause | Sửa trong batch này |
|---|---|---|
| FA-005 | `validateTree` chỉ nhận EV khi cả `value/status/source_refs` đã có; xóa discriminator khiến object thoát validation | Thêm `HandoffSchemaValidator`, chọn schema từ path và expected type; wrapper vẫn bắt buộc dù status/source refs bị xóa |
| FA-006 | Helper hint nhận một danh sách candidates rồi dùng cho cả `related_candidate_ids` và `hypothesis_refs` | Thu ID string duy nhất từ hai collection riêng; refs được đối chiếu đúng namespace trong report gốc đã bind identity/digest |
| FA-008 | Resolver chỉ đọc CARLA metadata; jerk narrative CARLA không có guard producer | Descriptor source-supported cho CARLA currentFormat và Kinematic 1.4; unknown/conflicting profile abstains; explanation theo descriptor |

Các source thay đổi:

| File/method | Thay đổi |
|---|---|
| [HandoffSchemaValidator](../../../src/main/java/com/vsos/core/failureanalysis/HandoffSchemaValidator.java) — mới | `validate/member/ev/aggregate/sample`: schema theo path, typed unions, required fields, null/status/reason/source refs, finite numbers, units, bounds và version literals |
| [ConsumerCompatibilityValidator](../../../src/main/java/com/vsos/core/failureanalysis/ConsumerCompatibilityValidator.java) | `validate`: gọi schema validator; `validateTree`: chỉ giữ walk finite/source integrity; `isolation/validateClaimReferences`: scoped typed claim graph |
| [ParameterHintBuilder](../../../src/main/java/com/vsos/core/failureanalysis/ParameterHintBuilder.java) | `claimIds/build/hint`: tách candidates/hypotheses, không stringify numeric IDs, loại ID trùng; missing candidate identity → ABSTAIN; refs hypotheses thật được cite riêng |
| [MetricProvenanceResolver](../../../src/main/java/com/vsos/core/failureanalysis/MetricProvenanceResolver.java) | `Descriptor/descriptor/resolve/objectiveLineage`: producer/profile/metadata gates; Kinematic raw lineage; giữ declared conflicting evidence nhưng không dùng làm accepted lineage |
| [ObjectiveExplainer](../../../src/main/java/com/vsos/core/failureanalysis/ObjectiveExplainer.java) | `explain`: notes/descriptor theo producer; unsupported → UNKNOWN, không gán CARLA window; `decompose`: thêm descriptor gate, không đổi arithmetic Batch 01 |
| [EvidenceReport](../../../src/main/java/com/vsos/core/failureanalysis/EvidenceReport.java) | Chỉ build ID M1A `1.0.0 → 1.0.1` để nhận diện output provenance đã sửa |
| [DiagnosticReport](../../../src/main/java/com/vsos/core/failureanalysis/DiagnosticReport.java) | Chỉ build ID M1B `1.0.1 → 1.0.2` |
| [MoboHandoffBuilder](../../../src/main/java/com/vsos/core/failureanalysis/MoboHandoffBuilder.java) | Chỉ build ID M1C `1.0.0 → 1.0.1` |

M1D validator build ID `1.0.0 → 1.0.1`. Schema, policy/formula versions,
`adr040-stored-aggregation/1`, `fa-report-sorted-json/1`,
`fa-handoff-sorted-json/1`, `fa-consumer-compatibility-sorted-json/1` không đổi.
Expected enum values trong lỗi schema được sort để tránh digest phụ thuộc thứ tự
iteration của Set giữa các JVM.
Kiểm tra hai JVM trên cùng một serialized negative handoff đã pass:
[cross-jvm-schema-digest](batch-02-evidence/cross-jvm-schema-digest.json).
Hai log `schema-digest-jvm1/2.txt` đầu tái tạo fixture riêng nên chưa kiểm soát cùng
input bytes và không được tính là pass; lần kiểm chứng chấp nhận dùng fixed input.

Không thêm dependency, API/service, optimizer adapter hay abstraction chưa dùng.
Actual diff: [production-source.diff](batch-02-evidence/production-source.diff),
[diff-stat](batch-02-evidence/diff-stat.json),
[new test diff](batch-02-evidence/new-regression-test.diff).

## 3. Schema coverage — FA-005

| Vùng/path | Kiểm tra structural/typed | Evidence và operational semantics |
|---|---|---|
| EV tại các path bên dưới | 10 required keys; status enum; expected value type; finite/null rules; string refs/reasons/assumptions; conditional assumptions; derived formula; uncertainty bounds | UNKNOWN/INVALID/NA có null; observed phải cite; missing không thành false/0 |
| `/dataset` | EV schema/IDs/digests/currentness; partition selection enum; decimal-string ID lists; known snapshot/digest versions | Thiếu DB binding với UNKNOWN hợp lệ không thành schema INVALID |
| `/members[]` | Seed signed integer; DB IDs string; replicate/attempt positive integer; mode; role/partition enum; refs/digest profiles; parameter EV/unit; dt seconds | Identity equality/cohort hash/collision of IDs vẫn ở identity/integrity gates riêng |
| `/members[]/canonical_sample` | Nullable plain Sample, string/boolean/number fields | Không ép plain Sample thành EV, không tính lại canonical values |
| `/members[]/metric_provenance` | Unavailable EV hoặc plain provenance; 3 objective lineage definitions; source refs/hashes/version/dt | Registry hash không chứng minh runtime/source equivalence |
| `/members[]/objective_quality_decisions` | Unavailable EV hoặc sourced decision; report digest; profile_verified EV; calibration enum/refs | Quality approval/currentness vẫn cần source replay, không suy từ schema pass |
| `/members[]/eligibility` | Status enum cho canonical/optimization/validation và 3 objective; reason/capability lists | Không nới eligibility gate |
| `/baseline` | Identity status; version/project/number/label/current/v1 EV; 4 parameter EV; parameter digest/refs/score status | Offline binding thiếu vẫn UNKNOWN; tuple tham số không xác nhận baseline |
| `/canonical_aggregation`, `/baseline_objectives` | Aggregate EV hoặc null; known aggregation version; 3 Objective plain records; counts/status/unit/value | VALID cần number; MISSING/NA cần null; không đổi aggregate arithmetic |
| `/parameter_hints[]` | Typed string claim IDs, artifact refs, hint status/direction, 3 objective keys, baseline EV, prerequisites/reasons | Claim membership/partition được kiểm riêng ở FA-006 |
| `/search_ranges/{4}` | Range EV, finite ordered endpoints, units, domain method/eligibility, constraint refs | Source domains có thể fixed; consumer suggested fixed bounds vẫn bị gate cũ chặn; không tạo range |
| `/provenance`, `/source_registry` | Known versions; EV fields; source hashes; registry required fields/integrity/type | Digest mismatch/unresolved registry ở INTEGRITY, không dùng schema pass thay byte proof |
| Envelope/consumer/eligibility manifest | Contract/stage/version/digest identity; plain typed compatibility/manifest/counts | Consumer gaps vẫn NOT_DIRECTLY_CONSUMABLE/dispatch=false |

Các union chỉ được nhận diện tại path hợp đồng cho phép, rồi validate trọn branch;
không coi mọi object có `status` là EV. `bounds` có lower/upper/kind/coverage_factor;
lower≤upper; coverage_factor chỉ áp dụng cho EXPANDED_UNCERTAINTY. Không coi bounds
là xác suất/confidence mới.

Phân biệt đã được kiểm chứng:

| Fixture | Schema | Integrity | Kết luận |
|---|---|---|---|
| Positive synthetic | VERIFIED | VERIFIED | NOT_DIRECTLY_CONSUMABLE, không production ready |
| Xóa seed status/source_refs, rehash cả cohort/handoff | INVALID | VERIFIED | BLOCKED vì schema, không đổ lỗi digest |
| Canonical structural input, content digest stale | VERIFIED | INVALID | BLOCKED vì integrity |
| UNKNOWN seed/baseline binding EV hợp lệ | VERIFIED | Có thể fail identity/cohort/replay nếu sửa source riêng | UNKNOWN operational không phải schema defect |
| Golden18 thực | VERIFIED | VERIFIED | Source replay/operational binding UNKNOWN, dispatch=false |

## 4. Typed references — FA-006

`related_candidate_ids` resolve vào `/report/failure_candidates[].id`;
`hypothesis_refs` resolve vào `/report/root_cause_hypotheses[].id`.
Artifact/SourceRef là `{artifact_id,locator,input_ids}`, formula refs không được
dùng thay claim IDs, objective refs vẫn ở artifact/objective paths riêng.

Hint generation đọc optimization report đã verify digest; không đọc validation
partition. Handoff validation yêu cầu đúng một report optimization được qualify
bởi evidence refs, body có đúng run_key/schema/digest và registry digest.
Không có source body → `HINT_TYPED_CLAIM_PROOF_UNAVAILABLE` UNKNOWN; có body nhưng
sai namespace/dangling → `HINT_TYPED_CLAIM_REFERENCE_INVALID`; sai identity/hash
→ `HINT_TYPED_CLAIM_SOURCE_INVALID`. Validation report không được bù ID còn thiếu.
Nhiều report trong một claim scope không qualify được IDs local → reject scope.

| Trường hợp | Kết quả test |
|---|---|
| Candidate thật + không hypothesis | SUSPECTED với hypothesis_refs=[] |
| Hypothesis thật, chưa confirmed | SUSPECTED; không đòi confirmed root cause |
| Candidate string đặt trong hypothesis_refs nhưng namespace không có | Reject cụ thể, không chỉ source replay mismatch |
| Dangling candidate / dangling hypothesis | Reject cả hai đường |
| Cùng string tồn tại ở hai namespaces | Đối chiếu độc lập từng collection; chấp nhận typed membership |
| Report khác run nhưng digest/body/registry khớp nhau | Reject run binding |
| ABSTAIN | Chỉ giữ claim IDs có thật, không sinh hypothesis giả |
| Validation partition | Builder trả [] trước khi inspect; existing direct/transitive isolation tests vẫn pass |
| Golden18 | 0 hints; không nới mechanism gates để tạo positive |

## 5. Producer profiles — FA-008

Tất cả source mappings có runtime/source equivalence **UNVERIFIED** và descriptor
**CONDITIONAL**, không nâng thành verified runtime provenance. Metadata quan sát
thật có thể OBSERVED; đây là trạng thái của bản ghi, không phải chứng nhận binary.

| Thuộc tính | CARLA source-supported currentFormat | Actual Kinematic 1.4 |
|---|---|---|
| Identity | `vsos-core-java/1` + các literal xosc9,10,11,12,13,14,15 được `currentFormat()` liệt kê | `vsos-core-java/1` + đúng `vehicsim-kinematic-1.4` |
| Jerk input | `ego_a` từ DecelMeter: gated speed-drop average, nonnegative, clamp theo limit | `ego_a` là applied model deceleration, có friction cap; không phải measured IMU |
| Filter | Whole-series Butterworth 6th order mỗi pass, forward/backward zero phase, cutoff10Hz | RAW_UNFILTERED; không Butterworth |
| Sampling | `fixed_delta_seconds` ghi trong metadata; official branch chỉ khi 0<dt<.05 | `AebStack.DT=.05s`, source-defined CONDITIONAL; không giả là metadata đã ghi |
| Window/onset | T_AEB index: lần cuối qua -1m/s², lùi về đoạn dưới -.3m/s², đến hết run | First frame t≥brake_onset_t−1e−9 đến hết run; previous acceleration hoặc0 ở frame đầu |
| Jerk output | Producer finite differences RMS rồi round3 | Producer finite differences RMS rồi round3 |
| Impact | Core termination collision tick; crossing relative vector, lead branch closing speed | Crossing relative speed tại model collision tick |
| Stopping trace | Command sample projected x tới last x; positionAfterStep=false | Sau bước dynamics; startX=firstX−firstV*.05; positionAfterStep=true |
| Tail | LastV²/(2×stored rounded decel_available), model extrapolation | Cùng producer tail convention; không measured stopping travel |

CARLA Golden18 xosc15 dùng metadata thật dt=.01. Tests cho các literal9–14 là
synthetic source-branch conformance, không phải operational CARLA runs ở vintage đó.
Fixture Kinematic gọi `Simulator.simulate` thật với seed42; đây là model fixture,
không phải dữ liệu CARLA hoặc operational baseline. Phần recorder/binding tối thiểu
của fixture vẫn synthetic và không dùng xác nhận contact/root cause.

Unknown simulator/engine version, thiếu profile metadata, xosc8/xosc16 chưa support,
official branch dt không hợp lệ, filter/signal/window/status/canonical metadata copy
xung đột → UNKNOWN/UNSUPPORTED với reason. Declared conflicting metadata được giữ
riêng, không dùng làm accepted jerk lineage. Không suy timestep/filter/window từ
version lân cận. Impact/stopping source basis có thể biết độc lập khi engine/profile
đã biết nhưng thiếu jerk metadata; không lấy jerk window áp vào hai objective đó.

Canonical jerk null dù có command vẫn null. No-contact physical impact vẫn null;
zero chỉ thuộc quy tắc canonical aggregate legacy. Chưa biết profile thì không
replay decomposition bằng timestep đoán. Không thay scalar để làm narrative khớp.

## 6. Before/after evidence

Đầy đủ: [finding-before-after.json](batch-02-evidence/final-confirmation/finding-before-after.json).

```json
{
  "FA-005": {"before_schema":"VERIFIED", "after_schema":"INVALID", "integrity":"VERIFIED"},
  "FA-006": {
    "before":{"related_candidate_ids":["synthetic-ineffective"],"hypothesis_refs":["synthetic-ineffective"]},
    "after":{"related_candidate_ids":["synthetic-ineffective"],"hypothesis_refs":[]}
  },
  "FA-008": {
    "before":{"signal":null,"window":null,"note":"Canonical CARLA jerk ... T_AEB-to-run-end"},
    "after":{"signal":"ego_a","filter":"RAW_UNFILTERED","window":"brake_onset_t to end of run","dt_s":0.05,"status":"CONDITIONAL"}
  }
}
```

Samples: [positive synthetic](batch-02-evidence/final-confirmation/SYNTHETIC-POSITIVE-compatibility.json),
[invalid schema](batch-02-evidence/final-confirmation/SYNTHETIC-INVALID-SCHEMA-compatibility.json),
[wrong claim](batch-02-evidence/final-confirmation/SYNTHETIC-WRONG-CLAIM-compatibility.json),
[actual Kinematic producer input](batch-02-evidence/final-confirmation/KINEMATIC-ACTUAL-PRODUCER-input.json),
[Kinematic diagnostic](batch-02-evidence/final-confirmation/KINEMATIC-ACTUAL-PRODUCER-diagnostic.json),
[unknown producer](batch-02-evidence/final-confirmation/UNKNOWN-PRODUCER-diagnostic.json).
Không dùng synthetic score/approval làm baseline production.

## 7. Tests và commands

[Batch02RegressionTest](../../../src/test/java/com/vsos/core/failureanalysis/Batch02RegressionTest.java)
có **79 invocations**, gồm malformed wrapper/types/reasons/null/bounds/derivation,
schema-vs-integrity, scoped claim positives/negatives, source identity, producer
positives/unknown/conflicts và real Golden18. Toàn bộ test cũ, gồm Batch 01 class,
giữ nguyên byte.

| Lần chạy | Total | Pass | Fail | Error | Skip | Build |
|---|---:|---:|---:|---:|---:|---|
| Focused baseline, trước sửa source | 634 | 632 | 0 | 0 | 2 | SUCCESS |
| Red: 44 test Batch02 đầu trên source cũ | 44 | 13 | 31 | 0 | 0 | FAILURE đúng kỳ vọng |
| Red signed-seed trên validator trung gian | 3 | 1 | 2 | 0 | 0 | FAILURE đúng kỳ vọng |
| Green đầu, cùng 44 test + 4 class liên quan | 179 | 179 | 0 | 0 | 0 | SUCCESS |
| Batch02 cuối, trong focused/full | 79 | 79 | 0 | 0 | 0 | PASS |
| Batch01 cuối, trong focused/full | 44 | 44 | 0 | 0 | 0 | PASS |
| Focused accepted cuối | 713 | 711 | 0 | 0 | 2 | SUCCESS, jar/repackage pass |
| Full accepted cuối | 1440 | 1435 | 2 | 0 | 3 | FAILURE có trước |

Red/green ghi nhận cho 44 invocations đầu trên source cũ và 3 signed-seed cases
trên validator trung gian (2 fail/1 pass). Các32 invocations mở rộng khác đã chạy
real green; không tuyên bố giả rằng tất cả79 đều có red log. Seed giữ miền signed
integer theo source hiện hành; không thêm điều kiện không âm. Replicate/attempt
vẫn phải dương. [Red seed log](batch-02-evidence/red-signed-seed.log).
Evidence: [baseline](batch-02-evidence/baseline-focused.log),
[red](batch-02-evidence/red.log), [green](batch-02-evidence/green.log),
[focused final](batch-02-evidence/focused-accepted-final.log),
[full final](batch-02-evidence/full-accepted-final.log).
Các lần green-initial/focused-initial/pre-determinism và retry còn giữ trong cùng
thư mục; không dùng kết quả trung gian thay kết quả cuối.

Hai failure full suite đều là Mockito expectations có trước, owner
BACKEND_INTEGRATION:

- `OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt`.
- `OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor`.

Hai focused skips là HF-02/HF-03 trong M1AAuthorizedFixtureTest do chưa có authorized
DB baseline exports. Full suite thêm disabled KinematicParityFullTest. Không gọi
những fixture thiếu này là PASS; không giả lập export để vượt gate.

Commands thực tế, chạy ở repo root với Java21/Maven wrapper:

```powershell
# Baseline: cùng focused list bên dưới nhưng chưa có Batch02RegressionTest.
# Red: -Dtest=Batch02RegressionTest, trước mọi production edit.
.\mvnw.cmd -B '-Dtest=Batch02RegressionTest,HighSeverityFindingsRegressionTest,ConsumerCompatibilityValidatorTest,M1DConsumerCharacterizationTest,M1DGolden18IntegrationTest,CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest,PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify
.\mvnw.cmd -B '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify

javac -cp 'target/classes;target/test-classes' -d docs/failure-analysis-v3/fixes/batch-02-evidence/probe-classes docs/failure-analysis-v3/final-audit/verification/FinalAuditProbe.java docs/failure-analysis-v3/fixes/batch-02-evidence/verification/Batch02Evidence.java docs/failure-analysis-v3/fixes/batch-02-evidence/verification/VerifyReportDigests.java
java -Xmx1024m -cp 'target/classes;target/test-classes;docs/failure-analysis-v3/fixes/batch-02-evidence/probe-classes' com.vsos.core.failureanalysis.FinalAuditProbe 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/fixes/batch-02-evidence/final-confirmation/independent-probes-after.json
# Batch02Evidence cần test dependency classpath, lấy từ Surefire java.class.path.
$batch02ClassPath = Get-Content docs/failure-analysis-v3/fixes/batch-02-evidence/test-classpath.txt -Raw
java -Xmx1024m -cp "$batch02ClassPath;docs/failure-analysis-v3/fixes/batch-02-evidence/probe-classes" com.vsos.core.failureanalysis.Batch02Evidence docs/failure-analysis-v3/fixes/batch-02-evidence/final-confirmation
java -Xmx1024m -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/fixes/batch-02-evidence/final-confirmation/diagnostics
java -Xmx1024m -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/fixes/batch-02-evidence/final-confirmation/diagnostics docs/failure-analysis-v3/fixes/batch-02-evidence/final-confirmation/GOLDEN18-audited-handoff.json .
$batch02Handoff = 'docs/failure-analysis-v3/fixes/batch-02-evidence/final-confirmation/GOLDEN18-audited-handoff.json'
$batch02Sha = (Get-FileHash -LiteralPath $batch02Handoff -Algorithm SHA256).Hash.ToLowerInvariant()
$batch02Probe = 'target/m1d-consumer-probe.json'
$batch02ProbeSha = (Get-FileHash -LiteralPath $batch02Probe -Algorithm SHA256).Hash.ToLowerInvariant()
java -Xmx1024m -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility $batch02Handoff $batch02Sha . docs/failure-analysis-v3/fixes/batch-02-evidence/final-confirmation/GOLDEN18-audited-compatibility.json $batch02Probe $batch02ProbeSha
java -cp 'target/classes;docs/failure-analysis-v3/fixes/batch-02-evidence/probe-classes' VerifyReportDigests
python docs/failure-analysis-v3/fixes/batch-02-evidence/verification/verify_batch02.py
python docs/failure-analysis-v3/fixes/batch-02-evidence/verification/verify_batch02_state.py
git status --short
```

Kiểm chứng digest giữa JVM chạy thêm `javac -cp 'target/classes;target/test-classes'
-d docs/failure-analysis-v3/fixes/batch-02-evidence/probe-classes
docs/failure-analysis-v3/fixes/batch-02-evidence/verification/Batch02SchemaDigestProbe.java`,
rồi hai process riêng cùng command:
`java -cp 'target/classes;target/test-classes;docs/failure-analysis-v3/fixes/batch-02-evidence/probe-classes' com.vsos.core.failureanalysis.Batch02SchemaDigestProbe docs/failure-analysis-v3/fixes/batch-02-evidence/final-confirmation/SYNTHETIC-INVALID-SCHEMA-handoff.json`.
Input byte SHA, handoff digest, compatibility digest và trạng thái giống nhau.

CLI output dùng CREATE_NEW: chạy lại phải chọn output directory/file mới. Lần đầu
probe thiếu output directory, và lần đầu synthetic exporter thiếu Spring test
classpath đã lỗi trước khi ghi output; đã sửa cách gọi, chạy lại thành công. Không
ghi PASS từ các lần lỗi đó. Không thay original audit probe để làm nó xanh.

## 8. Golden18 và preservation

| Acceptance | Kết quả thực |
|---|---|
| Case/run/repetition | 18 case clusters, 72 run riêng; 54 ON / 18 OFF |
| Original oracle | 72/72, gồm outcome/contact count/end reason/timeline/candidate expectations |
| Physical outcome | 31 COLLISION / 41 UNKNOWN; không ép thành SAFE |
| Collision disagreement | 12 giữ nguyên, không tự chọn authority |
| Canonical values | 216 scalar/null khớp raw M và evaluation copy; jerk39/null33, impact43/null29, stop42/null30 |
| Stopping | 42 replay hợp lệ, maximum difference0; trace/model tail tách riêng |
| Candidates | 6 NO_BRAKING, 6 FALSE_BRAKING, 14 INEFFECTIVE_BRAKING, tất cả SUSPECTED; OFF không functional diagnosis |
| Certainty | 0 confirmed roots/physical limits; P05 certification UNKNOWN |
| Handoff | 72 diagnostic-only; DB IDs, baseline identity/v1/score UNKNOWN; 0 hints, no invented ranges |
| Consumer | Schema/integrity VERIFIED nhưng NOT_DIRECTLY_CONSUMABLE; dispatch=false |
| Raw bytes | ZIP SHA256 `22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`; 978 manifest member sizes/hashes khớp |
| Physics / refs / digest | 32 independent math checks pass; 0 unregistered report artifact refs; 74 content digests match |

Evidence: [summary](batch-02-evidence/final-confirmation/golden72-summary.json),
[per-run review](batch-02-evidence/final-confirmation/golden72-review.csv),
[independent math](batch-02-evidence/final-confirmation/independent-math-checks.json),
[digest verification](batch-02-evidence/final-confirmation/digest-verification.json),
[handoff](batch-02-evidence/final-confirmation/GOLDEN18-audited-handoff.json),
[compatibility](batch-02-evidence/final-confirmation/GOLDEN18-audited-compatibility.json).
Formula helpers G01–G04/P01–P05/T01–T02/I01/Q01–Q02 không đổi arithmetic;
canonical producer/AnalysisMetrics không đổi. Diagnostic decomposition chỉ thêm
profile sufficiency gate; invalid/missing clocks vẫn theo Batch 01.

## 9. Hashes, Git và phần còn lại

[Final state verification](batch-02-evidence/final-state-verification.json) so sánh
910 existing files: **903 unchanged, đúng7 authorized existing source changes,
0 unauthorized/missing**. New Java source chỉ HandoffSchemaValidator; new Java test
chỉ Batch02RegressionTest. Tất cả old tests, 111 original final-audit files, 296
Batch01 evidence files, Batch01 report/scripts, raw ZIP và tám contracts giữ nguyên.
Chi tiết từng SHA trước/sau: [protected-after](batch-02-evidence/protected-after.json),
snapshot trước: [protected-before](batch-02-evidence/protected-before.json).

Các FA trees đã untracked trước batch; `git diff` một mình không phản ánh thay đổi.
Không có staged/tracked diff. Actual source/test diff dùng snapshot trước sửa.
New deliverables gồm report này, một new class/test, separate evidence/verification,
72 diagnostics, samples, handoff/compatibility, logs và completed exec plan.

`git status --short` cuối, cũng lưu tại [git-status-after](batch-02-evidence/git-status-after.txt):

```text
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1a.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1b.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1c.md
?? docs/exec-plans/completed/2026-11-24-failure-analysis-fixes-batch-02.md
?? docs/exec-plans/completed/2026-11-24-failure-analysis-high-fixes-batch-01.md
?? docs/exec-plans/completed/2026-11-24-failure-analysis-m1d.md
?? docs/failure-analysis-v3/
?? src/main/java/com/vsos/core/failureanalysis/
?? src/test/java/com/vsos/core/failureanalysis/
```

| Còn lại | Owner / hành động riêng |
|---|---|
| FA-007 | FAILURE_ANALYSIS: wire approved requirements/calibration/absence context vào report pipeline; chưa làm trong batch này |
| FA-009 | FAILURE_ANALYSIS: source mechanisms và falsification plans cụ thể cho hypotheses |
| FA-010 | FAILURE_ANALYSIS: controlled resource limits/streaming; cần approved size/quota policy trước upload integration |
| DEP-01 | DATA_PROVIDER: authorized baseline/project/version/creation-lineage/currentness, selected variant+seed/run exports; HF-02/03 đang SKIPPED |
| DEP-02 | CALIBRATION: bound post-fit validity domain/residual/holdout và approved quality package; không suy từ pedal-map label |
| DEP-03 | MOBO_CONSUMER: approved M2 adapter thực thi frozen cohort, canonical aggregation, bounds, sealed validation; không triển khai ở đây |
| DEP-04 | BACKEND_INTEGRATION: freeze metadata impact vintage contradiction; không rewrite historical data |
| DEP-05 | BACKEND_INTEGRATION: xử lý hai OptimizationServiceTest failures có trước |

Không sửa AEB/controller/radar/simulator/calibration/Evaluation/AnalysisMetrics,
backend/MOBO/DB/API/frontend/historical results. Không chạy CARLA/MOBO campaign,
migration; không stage/commit/push/merge. **Dừng ở FA-005/006/008; không Batch 03/M2.**
