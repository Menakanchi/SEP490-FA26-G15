# FIX BATCH 01 — Failure Analysis V3.1 / FA-001…004

Ngày 2026-11-24. Phạm vi: sửa correctness của đúng bốn HIGH findings, không thiết
kế lại module hoặc triển khai MOBO/M2. Diagnostic analyzer build mới là
`failure-analysis-m1b/1.0.1`; schema/policy/formula/canonical metric versions giữ
nguyên. Historical reports không được rewrite.

**Kết quả của batch:** bốn findings được sửa trong actual DiagnosticReport pipeline;
original negative probes được chạy lại nguyên source. Golden18 giữ conservative
oracle và canonical values. Điều này không nâng verdict toàn module thành READY:
FA-005…010 và các dependencies của final audit vẫn ngoài phạm vi.

## 1. Source và evidence trước khi sửa

Đối chiếu original final-audit (10reports, verification và actual artifacts), tám
V3.1 contracts, source M1A–M1D liên quan, AGENTS/CLAUDE, package guidance và metric
contract/ADR-040/055. Các điều khoản được dùng trực tiếp: DATA_CONTRACT §2/§5/§6,
FORMULA T01/I01/OA-D, DIAGNOSIS_POLICY mode/outcome separation và OBJECTIVE contract
stopping decomposition/canonical preservation. Không phát hiện contradiction cần
đổi tám contracts trong batch này.

Source before snapshot gồm30FA classes, cùng SHA snapshot609existing files;
111files thuộc original final-audit được bảo vệ. Actual source được đọc trước khi
sửa: EvidenceValidator, AebTimelineBuilder, DiagnosisPolicy, ImpactAnalyzer,
ObjectiveExplainer, DiagnosticReport, DiagnosticSupport; đối chiếu EvidenceReport,
Evidence/CanonicalObjectiveReader và các callers/tests hiện có.

Input thật: `D:/Downloads/golden18_raw_artifacts.zip`, SHA256
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`.
Baseline focused verify chạy **trước production edits**:590total,588pass,0fail,
0error,2skip, BUILD SUCCESS.

## 2. Root cause và thay đổi

### FA-001 — Mode và AEB event-time validity

**Root cause:** AebTimelineBuilder lấy mode.value mà bỏ status. Raw metric timestamps
được đọc OBSERVED mà chưa kiểm finite/nonnegative/episode/order; DiagnosisPolicy
tin behavior do timeline cung cấp.

**Fix:** DiagnosticSupport.modeIs kiểm status cùng value. CONFLICTING/INVALID/UNKNOWN
không thể là actual ON/OFF; existing conditional legacy omission convention vẫn
được giữ. DiagnosisPolicy.assess có mode gate riêng: unresolved→INCONCLUSIVE và
không functional candidates, không ảnh hưởng independent contact/geometry.

EvidenceValidator.coreEventTime kiểm numeric type/finite/nonnegative, core clock
coverage, interval first…last và thứ tự detection≤decision≤command khi có các mốc.
Missing event không được chuyển0 hoặc coi là invalid event. Invalid/unsupported
times trả EV có reason+refs và không được dùng cho command/latencies/schedule.
Scheduled future command của decision hợp lệ vẫn có thể RIGHT_CENSORED, không bị
nhầm với một actual event timestamp nằm ngoài episode.

AebTimelineBuilder dùng validated values và validity cho behavior. DiagnosticReport
đưa mode/time reason codes vào inconclusive reasons; positive contact vẫn COLLISION
khi mode conflict. Paired mitigation cũng kiểm mode status, không chỉ string.

**Methods:** EvidenceValidator.coreEventTime/validate; DiagnosticSupport.modeIs;
AebTimelineBuilder.build; DiagnosisPolicy.assess; DiagnosticReport.analyze;
ImpactAnalyzer.compare.

### FA-002 — Stopping decomposition clock/window gate

**Root cause:** ObjectiveExplainer.decompose tự chọn first/last frames và kiểm replay
math nhưng không tiêu thụ clock validation; window start>end vẫn có numeric components.

**Fix:** core state timestamps phải tăng nghiêm ngặt, kể cả duplicate timestamps.
Decomposition kiểm validated trace/onset trước chọn anchor; bad clock/source,
outside/onset-order errors, invalid endpoint position/speed/step hoặc displacement
chặn components tương ứng. Missing onset/trace giữ UNKNOWN; invalid inputs có
INVALID với reason+source refs. Replay chỉ chạy sau validity gates. Nonfinite model
tail cũng bị giữ INVALID/UNKNOWN, không được truyền vào rounding/replay.

Canonical `total_as_recorded` và objective canonical_value giữ nguyên. Missing cap
có thể giữ trace hợp lệ nhưng tail/replay chưa biết; không global wipe mọi component.
Không thay công thức trace, tail, delay/ramp hoặc canonical rounding.

**Methods:** EvidenceValidator.stream; DiagnosticSupport.blocked;
ObjectiveExplainer.decompose/stoppingUnavailable.

### FA-003 — Event temporal support và pre-contact reconstruction

**Root cause:** before-frame/time inequalities chưa chứng minh event thuộc episode
hay snapshot đủ mới; ImpactAnalyzer gộp actor binding với availability của vector.

**Fix:** EvidenceValidator.contactTime join event world frame/time với recorder
frames.csv và GT khi có; các source tại cùng frame phải consistent. Kiểm context
frame liền trước/sau để không chấp nhận outlier đồng loạt ở event/CSV/GT. Không dùng
core clock để áp một offset giả cho recorder. Thiếu support→UNKNOWN; invalid/mismatch
event bị quarantine, không thành contact thuộc episode đã xác minh.

Mọi timestamp có mặt tại chính event frame vẫn phải đồng ý; không tự chọn authority
khi chúng khác nhau. Episode context cần ít nhất một source tại frame đó có context
hợp lệ. GT pre-contact clock hỏng không xóa event được CSV context hỗ trợ, và ngược
lại; nó vẫn làm reconstructed velocity UNKNOWN. Coordinated outlier không có source
context hợp lệ thì bị chặn. Các clock issues còn nguyên trong validation.

Target actor binding độc lập với `gt_frame_before`. Latest recorded world snapshot
trước event phải khớp declared before frame, có ego/target cùng time/frame và vector
hợp lệ. Conflicting velocity records cùng snapshot không được chọn tùy ý. Vector
chỉ reconstruct khi có adjacent world frames và interval phù hợp declared fixed
step; không fallback stale/post-impact snapshot, không interpolation tùy ý.

**Nguồn và giới hạn age policy:** `worker/sensor_recorder.py:174–202` chọn latest
pre-hit ego/other snapshot để ghi scalar/frame; `/outcome/case/carla/fixed_delta_seconds`
là metadata actual producer. Gate chỉ hỗ trợ một adjacent recorded interval cho
declared CARLA profile, không certify instantaneous contact velocity hoặc physical
interpolation error. Missing step/policy, gap, stale/mismatched snapshot→vector UNKNOWN.
`CLOCK_EQUALITY_S=1e-9s` reuse existing numerical recorder clock comparison; không
phải physical maximum-age threshold, measurement uncertainty hoặc safety standard.

Recorded event scalar và positive-contact claim vẫn có thể OBSERVED khi vector
UNKNOWN. Invalid scalar không xóa contact/vector hợp lệ. Clock conflict ở unrelated
record không tự wipe supported event. Invalid event time không được dùng để cắt
pedal timeline: DiagnosticReport dựng contact trước và truyền validated contact
vào timeline. PhysicalBrakingAnalyzer đã nhận validated Contact, không sửa source đó.

**Methods:** EvidenceValidator.contactTime; ImpactAnalyzer.extract/
snapshotClockConsistent; AebTimelineBuilder.build; DiagnosticReport.analyze.

### FA-004 — Collision callbacks không phải unique-frame state stream

**Root cause:** collisions array được validate bằng state-stream uniqueness key
`stream:frame`; ImpactAnalyzer dùng global stream block và rows helper bỏ toàn bộ
array khi có một corrupt row.

**Fix:** collisionEvents validate từng record với original JSON array index. Multiple
actors/sensors/callback payloads trong một frame hợp lệ; không phát sinh
DUPLICATE_FRAME_DISAGREEMENT chỉ vì same world frame. Explicit event identity là
sensor_id (hoặc sensor_actor_id; nếu thiếu dùng producer stream scope) + event_id.
Conflicting payloads của cùng explicit identity quarantine **tất cả records có
identity đó**, không các identity khác. Identical explicit records là repeats,
không mâu thuẫn vật lý.

Khi raw không có event_id (như Golden18), record identity giữ artifact+array index;
không bịa sequence, không khẳng định hai callbacks là cùng physical event chỉ từ
frame/actor hoặc payload similarity. Raw array cardinality vẫn là cardinality;
không thay canonical collision flag hoặc suy collision prevalence từ event count.

ImpactAnalyzer bỏ riêng corrupt/unbound/conflicting event, giữ valid matching target
event; chọn earliest admissible event thay vì first arbitrary array position. Các
issues vẫn có record refs trong validation. Actor binding/temporal validation,
recorded scalar và reconstruction là các claim riêng.

**Methods:** EvidenceValidator.collisionEvents/collisionEventInvalid;
ImpactAnalyzer.extract.

## 3. Before/after — exact original audit reproductions

Không sửa [FinalAuditProbe.java](../final-audit/verification/FinalAuditProbe.java).
Compile cùng file vào batch output riêng và chạy với new production classes.
Raw mutations có nhãn SYNTHETIC_AUDIT_MUTATION, không ghi vào ZIP hoặc gọi là CARLA
runs mới. [After JSON](batch-01-evidence/final-replay/independent-probes-after.json)
và [asserted summary](batch-01-evidence/probe-regression-summary.json).

| Original observation | Before | After |
|---|---|---|
|MODE_CONFLICT_STILL_DIAGNOSED|Mode CONFLICTING vẫn NO_RECORDED_AEB_COMMAND + suspectedNO_BRAKING|Behavior UNKNOWN, functional INCONCLUSIVE, candidates[]; positive COLLISION/recorded speed vẫn giữ |
|NEGATIVE_TIMELINE_EVENT_TIMES|Q=-1,B=-.75 thành AEB_COMMAND_ENGAGED|Invalid event EVs, behavior UNKNOWN, no functional candidates/derived latencies |
|BACKWARDS_CLOCK_STOPPING_DECOMPOSITION|Start2.5/end0 vẫn trace9.35+tail/replay0|Components/replay withheld, reason+refs; canonical9.35 giữ nguyên |
|STALE_PRECONTACT_FRAME|Reconstruct13.894113…m/s từ snapshot đầu|Vector UNKNOWN/PRECONTACT_SNAPSHOT_NOT_LATEST; contact COLLISION và recorded13.935 giữ nguyên |
|CONTACT_EVENT_OUTSIDE_RECORDED_EPISODE|Time50000 vẫn admissible|Event clock mismatch, contact/time UNKNOWN; valid geometry vẫn giữ. NO_BRAKING symptom có thể còn từ geometry độc lập |
|MULTIPLE_CONTACTS_ONE_WORLD_FRAME|Other actor cùng frame làm COLLISION→UNKNOWN|Matching contact vẫn COLLISION/scalar/vector; không duplicate-frame disagreement |

Six original observations liên quan bốn findings đều có assertion riêng. Các
observations FA-005/006/008 của cùng probe vẫn được ghi nhưng không sửa hoặc tính
thành resolved. Original final-audit reports không bị chỉnh verdict hồi tố.

## 4. Diff thật và regression tests

Production files thay đổi so với pre-batch snapshot, không phải so với empty Git
index: [production-source.diff](batch-01-evidence/production-source.diff).
Prefix source table là `src/main/java/com/vsos/core/failureanalysis/`.

| File / methods | Thay đổi có chủ đích |
|---|---|
|[EvidenceValidator.java](../../../src/main/java/com/vsos/core/failureanalysis/EvidenceValidator.java) — validate/stream/coreEventTime/collisionEvents/contactTime|Core event-time/domain/order; strict core clocks; event-local identity/clock/episode validation |
|[AebTimelineBuilder.java](../../../src/main/java/com/vsos/core/failureanalysis/AebTimelineBuilder.java) — build|Mode status và validated event EVs; không cắt pedal bằng invalid/unbound contact |
|[DiagnosisPolicy.java](../../../src/main/java/com/vsos/core/failureanalysis/DiagnosisPolicy.java) — assess|Defensive ON/OFF status gate, INCONCLUSIVE khi unresolved |
|[ImpactAnalyzer.java](../../../src/main/java/com/vsos/core/failureanalysis/ImpactAnalyzer.java) — extract/snapshotClockConsistent/compare|Event-local quarantine, episode/target binding, independent scalar/vector, latest adjacent support, valid pair mode |
|[ObjectiveExplainer.java](../../../src/main/java/com/vsos/core/failureanalysis/ObjectiveExplainer.java) — decompose/stoppingUnavailable|Clock/anchor/endpoint/model-result gates, sourced null components, canonical total retained |
|[DiagnosticSupport.java](../../../src/main/java/com/vsos/core/failureanalysis/DiagnosticSupport.java) — modeIs/blocked|Shared validity predicate và duplicate core timestamp gate |
|[DiagnosticReport.java](../../../src/main/java/com/vsos/core/failureanalysis/DiagnosticReport.java) — analyze|Pass validated contact into timeline, inconclusive reasons, analyzer patch build1.0.1 |

Thêm duy nhất một test class production-scope:
[HighSeverityFindingsRegressionTest.java](../../../src/test/java/com/vsos/core/failureanalysis/HighSeverityFindingsRegressionTest.java),
[new test diff](batch-01-evidence/new-regression-test.diff). **44invocations** gồm
parameterized cases, không44test methods:

- Mode CONFLICTING/INVALID/UNKNOWN; physical contact/geometry independent.
- Negative/nonfinite/wrong-type/outside/order-invalid AEB timestamps; valid011
  pending/censored path không bị regress; invalid command không xóa contact.
- Clock backwards/duplicate/missing endpoint/onset, invalid position/speed,
  outside onset và overflowing tail; canonical value/ref/digest preservation.
- Stale/missing/gapped precontact, missing age policy/vector, cross-source clock
  disagreement, conflicting snapshot velocities; scalar/vector/contact independence.
- Multiple actors/sensors/callbacks, exact repeated records, explicit conflicting
  identities và independent identity, corrupt event/row, canonical flag khác count.
- Invalid contact không truncate independent pedal; unrelated recorder clock issue
  không wipe supported event/vector; coordinated event/CSV/GT outlier bị chặn.

Regression helper kiểm canonical values theo producer schema, confirmed root vẫn
UNKNOWN, semantic digest match và mọi artifact reference đều có registry entry.
Không kiểm typed hypothesis-reference graph như đã fix FA-006; finding đó vẫn mở.

### Red trước green

Authoritative pre-fix run: [regression-before-validated.log](batch-01-evidence/regression-before-validated.log),
37total /6pass /31fail /0error /0skip trên **production source cũ**. Sau fix,
cùng37cases pass. Thêm7boundary/independence cases trong review; final44/44pass
trong focused và full suite. Không tuyên bố cả44 đã chạy red trên source cũ.

`regression-before.log` là draft harness run33fail, có assertion Integer/Long
cardinality và missing-format canonical convention chưa đúng. Hai vấn đề harness
đã sửa **trước production edits**; không dùng chúng như defect evidence. Log
`regression-after-final.log` ghi iteration41cases; `focused-final.log`/`full-final.log`
ghi iteration43. Authoritative final44 nằm trong `focused-accepted.log`/
`full-accepted.log`. Các intermediate logs được giữ để truy vết.

## 5. Commands và kết quả thật

Environment: repo root `F:\CodeVipChu\SEP490-FA26-G15`, JDK21.0.11, Maven wrapper3.9.9.
PowerShell Maven logs ở batch-01-evidence là UTF-16.

Final focused command thực sự đã chạy:

```powershell
.\mvnw.cmd -B '-Dtest=HighSeverityFindingsRegressionTest,ConsumerCompatibilityValidatorTest,M1DConsumerCharacterizationTest,M1DGolden18IntegrationTest,CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest,PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> docs/failure-analysis-v3/fixes/batch-01-evidence/focused-accepted.log
.\mvnw.cmd -B '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> docs/failure-analysis-v3/fixes/batch-01-evidence/full-accepted.log
```

Baseline cùng focused list bỏ HighSeverityFindingsRegressionTest, log
baseline-focused.log. Red command trước sửa:

```powershell
.\mvnw.cmd -B '-Dtest=HighSeverityFindingsRegressionTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' test *> docs/failure-analysis-v3/fixes/batch-01-evidence/regression-before-validated.log
```

| Run | Total | Pass | Fail | Error | Skip | Build |
|---|---:|---:|---:|---:|---:|---|
|Baseline focused, pre-edit|590|588|0|0|2|SUCCESS |
|Pre-fix regression, validated harness|37|6|31|0|0|FAILURE, expected red |
|Final regression class in focused/full|44|44|0|0|0|PASS |
|[Final focused verify](batch-01-evidence/focused-accepted.log)|634|632|0|0|2|SUCCESS, jar/repackage completed |
|[Final full verify](batch-01-evidence/full-accepted.log)|1361|1356|2|0|3|FAILURE at tests |
|Original-probe acceptance checks|6|6|0|0|0|Separate verification, not Maven count |
|Independent mathematics|32|32|0|0|0|Separate verification, not Maven count |
|Report/handoff/compatibility digest checks|74|74|0|0|0|Separate verification, not physics certification |

Full failures vẫn là đúng hai Mockito expectation failures đã có trong original
audit, không có FA failure mới:

- OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt (test L176).
- OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor (test L157).

Hai focused skips: M1AAuthorizedFixtureTest HF-02/HF-03 thiếu authorized baseline/
frozen freshness exports. Full suite thêm disabled KinematicParityFullTest.
Không tính skips là pass; không sửa OptimizationService hoặc tests của đồng đội.

## 6. Actual Golden18 replay và independent verification

Final output dùng [final-replay](batch-01-evidence/final-replay), không ghi đè
old reports/samples. Files trực tiếp dưới batch-01-evidence/diagnostics và các
root handoff/probe là **intermediate replay**, không authoritative final source.
`replay-before-context-isolation/` cũng là intermediate snapshot được giữ riêng;
chỉ `final-replay/` là replay của source cuối cùng.

```powershell
javac -cp 'target/classes;target/test-classes' -d docs/failure-analysis-v3/fixes/batch-01-evidence/probe-classes docs/failure-analysis-v3/final-audit/verification/FinalAuditProbe.java
java -Xmx1024m -cp 'target/classes;target/test-classes;docs/failure-analysis-v3/fixes/batch-01-evidence/probe-classes' com.vsos.core.failureanalysis.FinalAuditProbe 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/fixes/batch-01-evidence/final-replay/independent-probes-after.json
java -Xmx1536m -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/fixes/batch-01-evidence/final-replay/diagnostics
java -Xmx1536m -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/fixes/batch-01-evidence/final-replay/diagnostics docs/failure-analysis-v3/fixes/batch-01-evidence/final-replay/GOLDEN18-audited-handoff.json .
python docs/failure-analysis-v3/fixes/verification/verify_batch01.py
java -cp target/classes docs/failure-analysis-v3/fixes/verification/VerifyReportDigests.java
python docs/failure-analysis-v3/fixes/verification/verify_batch01_state.py
```

OfflineConsumerCompatibility cũng chạy trên new handoff với independently computed
byteSHA256 và original consumer-parity-probe JSON/hash. Không gọi optimizer/DB trong
pipeline, report ghi optimizer_called=false/database_accessed=false/dispatch=false.
Full Maven suite có các unit tests engine hiện có, không optimization campaign.
CLI outputs CREATE_NEW; nếu reproduce cần output mới, không overwrite files cũ.

Independent Python được copy từ original audit vào fixes/verification và chỉ đổi
output base/input probe path; equations/original Golden18 oracle không thay. Math
oracle dùng integration/bisection độc lập cho delay+ramp, không lấy Java helper
làm expected. Tolerances: distance1e-8m/time1e-8s; vector/cap/simple geometry1e-12
theo unit; inverse1e-10m/s². Đây là numeric tolerances, không measurement uncertainty.

| Invariant trên corpus gốc | Final actual |
|---|---|
|Cases/runs/modes|18/72 =54ON+18OFF, giữ R1/R2/R3 và seed/attempt |
|Original oracle từng run|72/72match, không đổi expected |
|Physical outcome|31positive COLLISION/41UNKNOWN, không UNKNOWN→SAFE |
|Canonical/sensor collision disagreements|12, không thay canonical flag bằng event count |
|Functional candidates|6NO_BRAKING,6FALSE_BRAKING,14INEFFECTIVE, đều SUSPECTED;18OFF no functional candidates |
|Canonical objective values|216scalar/null giữ nguyên;72M/evaluation copy sets match |
|J/I/D present/null|39/33;43/29;42/30 |
|Stopping replay|42decompositions, max replay difference0 trên valid clocks |
|Roots/physical certainty|0confirmed roots/physical limits; certified P05 vẫn UNKNOWN |
|Raw manifest integrity|978unique member sizes/SHA256 verified |
|Artifact references|0unregistered artifact refs; không claim FA-006 fixed |
|Content digests|74/74recomputed match; stable fresh-report digest test pass |
|MOBO handoff|72diagnostic-only; baseline/v1/score UNKNOWN, no invented ranges/hints; NOT_DIRECTLY_CONSUMABLE |

Evidence: [golden72-summary](batch-01-evidence/final-replay/golden72-summary.json),
[per-run CSV](batch-01-evidence/final-replay/golden72-review.csv),
[independent math](batch-01-evidence/final-replay/independent-math-checks.json),
[digest results](batch-01-evidence/final-replay/digest-verification.json).
Semantic report/handoff digests thay đổi vì corrected claims/provenance và build
patch; old digests không được ghi đè. Canonical producer/aggregation version vẫn
`adr040-stored-aggregation/1`.

## 7. Scope preservation, Git và remaining work

[Final state verification](batch-01-evidence/final-state-verification.json) kiểm
609existing files:602unchanged, đúng7authorized source files changed;0unauthorized
changes/0missing. Cả111original final-audit files, ZIP, Golden18 oracle, tám contracts,
producer/controller/calibration/AnalysisMetrics/backend/MOBO source và old tests
được giữ nguyên. No staged/tracked diff; FA source/docs/test trees vốn đã untracked
trước batch nên `git diff` một mình không thể hiện thay đổi. Actual batch diff ở §4.

New files: HighSeverityFindingsRegressionTest.java; report này; fixes/verification/
ba scripts; fixes/batch-01-evidence/ logs/snapshots/diffs/probes/final72reports/
handoff/compatibility; completed exec plan. Không thay historical data hoặc samples.

`git status --short` được lưu nguyên tại
[git-status-after.txt](batch-01-evidence/git-status-after.txt); output cuối:

```text
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1a.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1b.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1c.md
?? docs/exec-plans/completed/2026-11-24-failure-analysis-high-fixes-batch-01.md
?? docs/exec-plans/completed/2026-11-24-failure-analysis-m1d.md
?? docs/failure-analysis-v3/
?? src/main/java/com/vsos/core/failureanalysis/
?? src/test/java/com/vsos/core/failureanalysis/
```

Remaining: FA-005nested schema, FA-006hint hypothesis refs, FA-007positive context
wiring, FA-008kinematic narrative, FA-009hypothesis dossiers, FA-010resource limits;
DEP-01…05 operational data/calibration/consumer/metadata/full-build issues. Không
đánh dấu resolved, không nới gates để tạo hints hoặc score cho Golden18.
Thiếu age/interpolation policy vẫn abstain reconstruction; không certified physics.

Không sửa AEB/CARLA/calibration/MOBO, DB/API/frontend, canonical math hoặc tám specs;
không CARLA/campaign/migration/stage/commit/push/merge. **Dừng sau FA-001…004.**
