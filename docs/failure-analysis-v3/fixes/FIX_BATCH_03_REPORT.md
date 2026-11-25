# Fix Batch 03 — FA-007 / FA-009

Ngày 24/11/2026. Phạm vi đã hoàn thành: verified-context acceptance path và
source-backed investigation dossiers trong offline Failure Analysis. **Không READY**:
FA-010, operational authorities/traces và MOBO consumer integration vẫn chưa được giải quyết.

## 1. Kết quả và ranh giới

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Public `DiagnosticReport.analyze(run, optionalOff, context)` | IMPLEMENTED_AND_USED | 72 context test invocations qua public API và JSON serialization; overload cũ giữ nguyên |
| Requirements, calibration, coverage validation | IMPLEMENTED_AND_USED | Schema/scope/hash/review/provenance/units/clocks/dependencies được kiểm; reject riêng claim |
| Operational approved packages cho Golden18 | BLOCKED_BY_EXTERNAL_EVIDENCE | Không cấp authority giả cho dữ liệu thật |
| Functional `SUPPORTED` | CONDITIONAL | Chỉ existing candidate, requirement đúng scope và mọi approved predicate hợp lệ; synthetic positive cho cả ba loại |
| Calibration membership/residual | CONDITIONAL | Domain constraints từ package; residual chỉ khi được supplied/cited; membership không phải achieved response |
| Verified absence / SAFE / NEAR_MISS | CONDITIONAL | Complete reviewed sensor coverage, actor/clock/drain/criterion và approved full-body clearance bounds/threshold |
| Source mechanism dossiers / objective links | IMPLEMENTED_AND_USED | 26 dossiers, 124 falsification plans, 78 links trên Golden72 |
| Confirmed root cause / P05 physical limit | UNKNOWN | Không có causal adjudication hay certified numerical action-set solver |
| Optional baseline identity | CONDITIONAL | Reuse `BaselineBindingResolver`; không DB query, không baseline score mới |
| FA-010 / M2 / optimizer adapter | DEFERRED | Không implement trong batch này |

Đã đọc tám contracts V3.1; các final-audit reports 01, 03, 05, 06, 10; hai
FIX_BATCH_01/02 reports; source/tests được yêu cầu; `AGENTS.md`, `CLAUDE.md`,
analysis-metrics contract và ADR-055. Đối chiếu read-only AebStack, RadarTracker,
CarlaSession, Simulator và producer metadata. Audit line numbers không dùng làm
source authority. Mô tả repository cũ nói MOBO chưa triển khai không thắng source
consumer hiện tại; scope batch này vẫn không sửa consumer. Tám contracts và audit
history được giữ nguyên. Plan đặt trong fixes tree theo giới hạn explicit của task:
[IMPLEMENTATION_PLAN.md](batch-03-evidence/IMPLEMENTATION_PLAN.md).

## 2. Root cause và actual source changes

FA-007: helper đã có nhưng public composition dùng empty requirements, null
calibration và absence=false. Không có trusted-context ingress tới actual report.
FA-009: generic hypothesis strings chưa mô tả source mechanism hoặc test có thể bác
bỏ; INEFFECTIVE_BRAKING chưa có dossier tương ứng.

Prefix Java: `src/main/java/com/vsos/core/failureanalysis/`.

| Class/method | Thay đổi |
|---|---|
| `AnalysisContext` (mới) | Immutable versioned input, package/source lists, caller-pinned review authorities, explicit as-of và optional baseline snapshot |
| `AnalysisContextValidator.validate` (mới) | Package review/scope validation, claim-local requirements, calibration, coverage/absence, dependency and conflict gates |
| `AnalysisContextValidator.verifiedBaseline` | Reuse binding verification, reject unknown context schema và raw project/binding conflict |
| `HypothesisInvestigator.investigate` (mới) | Mechanism alternatives, actual source hashes/method references, support/counterevidence, falsification plans và objective links |
| `DiagnosticReport.analyze` (sửa) | Public three-argument path; consume verified context; requirements/calibration/outcome/sufficiency/provenance; compose dossiers; build `failure-analysis-m1b/1.0.3-batch03` |
| `ObjectiveExplainer.explain` (sửa) | Add objective-specific dossier links và field-local calibrated-response context; giữ canonical values và existing decompose math |

Chỉ **hai existing production files** thay đổi; thêm ba production classes và hai
test classes. Không sửa DiagnosisPolicy, EvidenceGates, M1A readers, math engines,
AEB, radar, CARLA, producers, consumer, API, DB hoặc frontend. Chi tiết đầy đủ:
[production-source.diff](batch-03-evidence/production-source.diff),
[new-regression-tests.diff](batch-03-evidence/new-regression-tests.diff),
[diff-stat.json](batch-03-evidence/diff-stat.json).

## 3. AnalysisContext v1 và trust boundary

Đây là additive offline Java input, không phải sửa tám contracts hay backend API.
Exact declaration nằm trong `AnalysisContext.java`; ví dụ serialized inputs tại
[SYNTHETIC-context-input.json](batch-03-evidence/final-confirmation/synthetic-final/SYNTHETIC-context-input.json).
Mọi reviewer, ID, claims, residual và approval trong fixture này là **SYNTHETIC_TEST_ONLY**.

| Thành phần | Field/contract |
|---|---|
| Context | `schemaVersion=vehicsim.analysis-context/v1`, immutable `packages`, `sources`, `authorities`, explicit `asOf`, optional `baselineBinding` |
| Package | `schema=vehicsim.analysis-context-package/v1`, nonempty `id/version`, `kind`, `scope`, `review_artifact_id`, `payload` |
| Kinds | REQUIREMENT / CALIBRATION / COLLISION_COVERAGE; duplicate same requirement type or calibration field/coverage package → CONFLICTING |
| Scope | Exact `run_key`, `result_sha256`, named raw `artifact_hashes`; supplied project/scenario/scenario-version/AEB-version/simulator must match proven input |
| Temporal scope | `interval={start_s,end_s,unit:s,clock_id:core\|recorder}`; within actual recorded episode; absence covers entire recorder interval |
| Review | `schema=vehicsim.analysis-context-review/v1`, `review_id`, `authority_id`, `reviewer_id`, APPROVED, reviewed-at/valid-until, subject ID/version/byte hash/data hash, evidence hash pins |
| Caller trust pin | `ReviewAuthority(authorityId, reviewerId, reviewSha256, reviewDataSha256)`; explicit independent caller policy; never loaded from the package itself |
| External attestation | `schema=vehicsim.analysis-context-attestation/v1`, same run/result hash, typed `claims`; functional basis must be REVIEWED_EX_ANTE_EVIDENCE |
| Predicate | Non-null OBSERVED value, exact unit/clock/interval, resolvable source refs whose typed cited value exactly equals the asserted value |

Byte SHA256 giữ nguyên profile của Artifact reader. `AnalysisContext.dataHash` là
SHA256 của UTF-8 compact MiniJson parsed content, pin thêm để phát hiện in-memory
substitution; **không thay report/handoff digest profile**. Package byte hash và
parsed-content hash phải được review pin; review byte/content hashes phải nằm trong
caller trust anchors; cited evidence có cả byte/content pins. APPROVED đơn lẻ,
self-citation, text ref không resolve, stale review, wrong units hoặc unsupported
schema không cấp quyền kết luận.

Đây là offline acceptance of independently trusted reviewed attestations, **không
phải authentication service hay automated substantive audit of primary traces**.
Caller phải cung cấp trust anchors từ authority policy độc lập, đọc source artifacts
bằng verified reader và chọn as-of hợp lệ; timestamp là freshness **as of supplied
offline review time**, không tuyên bố current DB/reviewer authority. Context registry
không được chiếm raw artifact ID hoặc reserved source-mechanism/spec IDs. Default
path không có authorities. Không tạo reviewer/DB export/certificate operational.

### Requirements và claim-local gates

Gates dùng đúng `DiagnosisPolicy.requiredGates(type)` hiện có. Requirement chỉ nâng
**existing symptom** khi đúng type/scope/version, review hợp lệ, mọi predicate có
attestation citations và raw mode/core event/identity/recorder clock không xung đột.
Không suy duty từ configured TTC hoặc hindsight GT. Raw invalid mode/clock/event
vẫn bị Batch01 gates chặn. Generic và candidate-specific sufficiency được xuất.

`payload.dependencies` phải khai báo rõ, kể cả empty list. VERIFIED_NO_CONTACT phải
thực sự được chấp nhận; CALIBRATION:<field> phải IN_DOMAIN. PHYSICAL_AVOIDABILITY và
dependency chưa hỗ trợ giữ unproven vì chưa có certified P05 checker. Một true gate
không tạo certificate. Valid review và missing evidence được báo tách trong package
claim status/reason codes; context không áp dụng không nâng candidate. Functional
SUPPORTED không nâng dossier/root-cause certainty.

### Calibration

Field-local scopes hiện dùng: `pedal_to_deceleration`, `conditional_braking_model`,
`stopping_extrapolation`. `diagnostic_gt_kinematics_uncorrected` tiếp tục NOT_APPLICABLE.
Các constraints lấy từ approved payload, không bắt buộc fixed universal field set.
Supported operators reuse EvidenceGates: EQ / IN / CLOSED_RANGE. Source paths dùng
`result:/...` hoặc `bundle:/...`; units phải khớp mapping có trong validator. Ví dụ
friction `1`, speed `m/s`, deceleration `m/s2`, delay/TTC `s`, ramp `m/s3`, dimensions
`m`, categorical values unit null. Numeric field không có unit mapping không được
chấp nhận như categorical data.

`result:/outcome/frames/*/ego_v` kiểm **mọi core sample**; không lấy initial speed
thay toàn trace. Missing sample/context → UNKNOWN; violated valid constraint →
OUT_OF_DOMAIN; đúng mọi declared constraint và validation evidence → IN_DOMAIN.
Residual không được supplied/cited → UNKNOWN. OUT_OF_DOMAIN giữ raw objectives,
contact/GT observations và mathematical screen values; dependent calibrated physical
interpretation bị chặn. IN_DOMAIN cũng chưa chứng minh achieved response hoặc P05.

### Coverage, absence và outcome

Required reviewed predicates: sensor_attached, sensor_healthy, complete_encounter,
clock_valid, approved_absence_criterion; structured sensor_binding phải trùng
sensor/ego/target IDs và actor roles thực tế. Structured absence_criterion có ID,
version và policy MATCHING_TARGET_SENSOR_EVENTS_ZERO_AFTER_DRAIN. Các source CSV/
GT/collision hashes, clocks, episode endpoints/actor coverage phải đúng; drain
watermark phải **sau** end of encounter. Package partial recorder scope không đủ.

Recorded positive contact hoặc unresolved core collision authority chặn absence.
Không auto-select authority. Empty array/core=false/nominal geometry không đủ.
Verified absence còn cần approved clearance interval, unit m, recorder clock,
CARLA_WORLD FULL_BODY / VALIDATED_ENCOUNTER_BOUNDS basis và approved near-miss
threshold mới áp dụng `DiagnosisPolicy.outcome`: high≤threshold NEAR_MISS;
low>threshold SAFE; bounds cắt threshold UNKNOWN. Thiếu threshold/basis vẫn UNKNOWN
outcome, dù absence có thể được verified riêng. Reviewed bounds/threshold và source
refs được giữ trong `/report/analysis_context`.

## 4. Dossiers và objective explanation

Mỗi existing candidate có dossier với related candidate IDs, stage, technical
mechanism, pinned inspected source refs/methods, supporting/counterevidence,
alternative hypotheses, prerequisites, formulas, scope và falsification tests.
Old NO/FALSE IDs giữ `primary-perception` / `caution-or-prediction`; thêm
`response-or-opportunity` cho INEFFECTIVE. IDs scoped trong từng run/report.

| Candidate / example | Investigation alternatives | Formulas |
|---|---|---|
| NO_BRAKING — FA-G1-007-R1 | Target delivery/confidence, Doppler opening/motion qualification/association, actual predictor predicates, late/pending command, writer/consumption/log clock | G01–G03, T01–T02, P02/P04/P05, Q01 |
| FALSE_BRAKING — FA-G3-064-R1 | Ex-ante conflict khác later curb stop, static hold/track persistence/vLeft, approved caution/other actor, corridor/full geometry/writer attribution | G01–G04, T01–T02, Q01 |
| INEFFECTIVE_BRAKING — FA-G5-125-R1 | Late feasible opportunity, friction/response envelope, demand-to-pedal/delay/ramp/consumption, full-body 2D occupancy, mitigation meeting goal, contact/clock authority | G01/G03/G04, P01–P05, T01–T02, I01, Q01–Q02 |

References pin actual inspected AebStack/RadarTracker/CarlaSession/Simulator bytes;
runtime binary-to-source equivalence vẫn UNKNOWN. Missing/changed inspected source
→ INCONCLUSIVE, không tạo citation giả. Source mechanism mô tả khả năng, không phải
actual cause. Radar branches chỉ áp dụng measured-radar runtime; kinematic synthetic
perception phải được xem riêng. Detection/core command/GT deceleration là
counterevidence chống diễn giải "không có bất kỳ detection/command/response" ở đúng
layer, không tự xác nhận delivered actor hoặc consumed command. Valid positive
paired ON/OFF observed reduction được giữ làm observational counterevidence, không
biến thành causal contribution/compliance.

Mỗi test plan có hypothesis, required trace, expected-if-true, refuting observation,
formula và clock/actor/requirement alignment. **124/124 NOT_EXECUTED và
BLOCKED_BY_EXTERNAL_EVIDENCE**; không có CARLA experiment mới. Dossiers ở SUSPECTED
hoặc INCONCLUSIVE; root_cause_certainty luôn UNKNOWN trong dữ liệu hiện có.

| Objective | Observed evidence và hypothesized mechanism | Giới hạn |
|---|---|---|
| RMS jerk | Stored scalar; command timing; raw recorder GT jerk riêng; possible ramp/oscillation/filter-window effects | Giữ canonical signal/filter/window; high jerk không chứng minh buildup-rate cause |
| Impact speed | Canonical core sample, recorded contact/precontact vector riêng; paired observation khi hợp lệ; timing/response/crossing alternatives | No-contact physical impact null; zero chỉ thuộc legacy aggregate; pair không phải causal experiment |
| Stopping distance | References tới trace component / extrapolated component, source frames/decel/friction; delay/ramp screen có reference khác | Không thay canonical total hoặc tail math; shorter distance không tự là tốt; calibration/2D uncertainty giữ riêng |

Mỗi link có `relation=HYPOTHESIZED`, riêng observed_value_relation, evidence refs,
formula refs, limitations và observed evidence context. 78 links = 26 dossiers × 3
objectives. Không weighted score, predicted improvement hoặc parameter cause mới.

## 5. Actual before/after và Golden18

Before reports được copy byte-for-byte từ accepted Batch02 output:
[before-examples](batch-03-evidence/before-examples/).
After là rebuilt current-source outputs, không synthetic approvals trên Golden:
[diagnostics](batch-03-evidence/final-confirmation/diagnostics/).
Structured comparison:
[finding-before-after.json](batch-03-evidence/final-confirmation/finding-before-after.json).

- NO example: old generic primary-perception hypothesis → five technical branches,
  delivery falsification và explicit root uncertainty; candidate vẫn SUSPECTED.
- FALSE example: two vague alternatives → four structured ex-ante/caution/track/
  geometry-writer investigations; no-contact không tự thành false-positive truth.
- INEFFECTIVE example: old empty hypotheses → five response/opportunity/2D/mitigation
  branches; conditional friction screen không thành confirmed PHYSICAL_LIMIT.

Independent comparison xác nhận **72/72 outcomes, behaviors, candidates, contact,
paired observations và physical unknowns giữ nguyên**, 54 ON / 18 OFF, 31 COLLISION /
41 UNKNOWN, 12 disagreements, 6 NO / 6 FALSE / 14 INEFFECTIVE đều SUSPECTED, 18 OFF
không functional claims/dossiers, 0 confirmed roots; calibration UNKNOWN/NA.
All 216 canonical scalar/null values giữ nguyên và M/E khớp. 42 stopping replays
maximum difference 0. Không dùng legacy labels làm ground truth. FA-G4-091 TTC=.6
và run/seed/replicate identity vẫn nguyên theo existing M1A–M1D checks/raw binding.

[golden72-summary.json](batch-03-evidence/final-confirmation/golden72-summary.json),
[golden72-review.csv](batch-03-evidence/final-confirmation/golden72-review.csv),
[dossier-verification.json](batch-03-evidence/final-confirmation/dossier-verification.json).

Handoff rebuilt với cả 72 diagnostic digests. Baseline identity/scores UNKNOWN,
72 DIAGNOSTIC_ONLY, 0 eligible optimization/validation, 18 excluded / 54 unknown,
0 parameter hints. Compatibility vẫn NOT_DIRECTLY_CONSUMABLE, dispatch=false.
[Handoff](batch-03-evidence/final-confirmation/GOLDEN18-audited-handoff.json),
[compatibility](batch-03-evidence/final-confirmation/GOLDEN18-audited-compatibility.json).

## 6. Tests, red/green và commands thực tế

| Run | Total | Pass | Fail | Error | Skip | Build |
|---|---:|---:|---:|---:|---:|---|
| Pre-edit focused baseline | 713 | 711 | 0 | 0 | 2 | SUCCESS |
| Red dossier/public-entry tests trên old pipeline | 5 | 0 | 5 | 0 | 0 | FAILURE đúng mong đợi |
| First context + dossier green | 55 | 55 | 0 | 0 | 0 | SUCCESS |
| Final focused clean verify | 793 | 791 | 0 | 0 | 2 | SUCCESS; jar/repackage thành công |
| Full Maven verify | 1520 | 1515 | 2 | 0 | 3 | FAILURE: hai known consumer tests |

Batch01: 44/44; Batch02: 79/79; Batch03: 80/80 (72 context + 8 dossier tests).
M1A–M1D, real Golden18, metrics, core isolation, docs và architecture suites nằm
trong focused verify. Hai authorized-export tests HF-02/HF-03 vẫn skipped vì thiếu
fixtures; full suite có thêm disabled KinematicParityFullTest. Không fake PASS.

Full failures duy nhất, cùng hai pre-existing failures đã ghi ở Batch02:

1. `OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt`
2. `OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor`

Không sửa OptimizationService. Intermediate context-hardening run có một test
accessor typo (`binding()` thay vì `baselineBinding()`), đã sửa. Một incremental
run không discover tests do stale IDE-generated classes (`NoClassDefFoundError:
Run`); clean Maven recompilation giải quyết, đúng hướng dẫn AGENTS. Các logs lỗi
vẫn giữ, không gọi chúng là green hay lỗi pre-existing source. Red/green chỉ chứng
minh năm missing API/dossier behaviors; các context acceptance scenarios khác được
chạy thật sau implementation, không tuyên bố đã có pre-implementation red cho tất cả.

Commands từ repo root (PowerShell; `*>` logs UTF-16):

```powershell
# FOCUSED là exact test list ghi trong COMMANDS.md
.\mvnw.cmd -B clean "-Dtest=$FOCUSED" '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify
.\mvnw.cmd -B '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' '-Dbatch03.evidence=docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/synthetic-final' verify
java -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/diagnostics
java -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/diagnostics docs/failure-analysis-v3/fixes/batch-03-evidence/final-confirmation/GOLDEN18-audited-handoff.json .
python docs/failure-analysis-v3/fixes/batch-03-evidence/verification/verify_batch03.py
java -cp 'target/classes;docs/failure-analysis-v3/fixes/batch-03-evidence/verification/classes' VerifyReportDigests
python docs/failure-analysis-v3/fixes/batch-03-evidence/verification/verify_batch03_state.py
git status --short
```

Các CLIs CREATE_NEW: replay dùng **new output path**, không overwrite accepted
evidence. Exact probe javac/java và compatibility hash command trong
[COMMANDS.md](batch-03-evidence/COMMANDS.md). Logs:
[focused](batch-03-evidence/focused-final-context-guards.log),
[full](batch-03-evidence/full-final.log),
[red](batch-03-evidence/red-dossiers.log),
[test-results.json](batch-03-evidence/test-results.json).

## 7. Independent verification, scope và preservation

32 independent mathematical checks PASS: numerical integration/bisection stopping
oracle, buildup boundaries, friction cap, relative vector, corner/full-body geometry,
PET, missing clock, margin/inverse/nonclosing cases. Reuse original audit probe
unchanged và copy independent oracle sang Batch03 chỉ đổi output directory; không
thay physics/oracle để pass.
[independent-math-checks.json](batch-03-evidence/final-confirmation/independent-math-checks.json).

978 ZIP member size/byte hashes đã kiểm, archive SHA256
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339` giữ nguyên.
74 content digests được recompute (72 reports + handoff + compatibility), 0 dangling
artifact refs, handoff member report hashes đều trỏ đúng rebuilt reports.
[digest-verification.json](batch-03-evidence/final-confirmation/digest-verification.json).

Protected snapshot: **1644 paths**, 1642 unchanged; đúng hai existing FA source
files thay đổi. Tất cả prior tests/contracts/audits/history và protected producer/
consumer source giữ byte hashes. Thêm ba main/two test files đúng scope; không
stage/commit/push/merge. Evidence scripts/logs/reports chỉ trong fixes tree.
[protected-before.json](batch-03-evidence/protected-before.json),
[protected-after.json](batch-03-evidence/protected-after.json),
[preservation-summary.json](batch-03-evidence/preservation-summary.json).

Git vẫn hiển thị các FA/docs/exec-plan directories untracked từ trước batch;
`git diff --stat` rỗng không chứng minh không có sửa đổi. Actual review dùng
pre-batch source snapshots/diffs ở trên.
[git-status-before.txt](batch-03-evidence/git-status-before.txt),
[git-status-after.txt](batch-03-evidence/git-status-after.txt).

## 8. Remaining work và external owners

| Owner | Dữ liệu / quyết định còn thiếu | Trạng thái |
|---|---|---|
| DATA_PROVIDER / safety requirement authority | Authenticated reviewer policy/pins, approved intervention/caution/mitigation requirements, all-actor ex-ante delivery/reason traces, consumption/writer/clock mapping, complete sensor coverage/criterion/clearance evidence | BLOCKED_BY_EXTERNAL_EVIDENCE |
| CALIBRATION / vehicle dynamics owner | Approved measured validation packages, domain constraints/vehicle/profile bindings, residuals/limitations, physical response envelope và certified uncertainty/action scope | BLOCKED_BY_EXTERNAL_EVIDENCE |
| Causal adjudication owner | Controlled causal evidence, competing-hypothesis elimination, approved root-cause adjudication | UNKNOWN; không có confirm path tự động |
| MOBO_CONSUMER | Frozen cohort/seed-replicate consumption, canonical aggregation parity, baseline objectives, bounded mutation, sealed validation, M2 adapter acceptance | DEFERRED; consumer NOT_DIRECTLY_CONSUMABLE |
| Backend/performance owner | FA-010 capacity/resource issue và operational sizing acceptance | DEFERRED; không sửa trong Batch03 |

Không chạy CARLA, MOBO campaign, migration hoặc DB access trong implementation.
Không chỉnh parameters, calibration hay historical evaluations. Dừng sau Batch03;
không tự chuyển Batch04/M2.
