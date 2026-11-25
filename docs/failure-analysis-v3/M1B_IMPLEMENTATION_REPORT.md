# M1B — Core physics, failure diagnosis và objective explanation

Ngày 2026-11-23; repository HEAD `baf0892d456b5dcf4bfc0358b7124bf6a8b6fe5a`.
M1B được implement bằng Java và kiểm thử trên raw Golden18 thật. M1A được tái sử
dụng nguyên trạng; không sửa controller/evaluator/metric producer, database, API,
frontend hoặc optimizer. Không chạy CARLA; không commit/push/merge; dừng trước M1C.

**Phạm vi kết luận:** continuous translational geometry và các phép toán vật lý đã
được implement. Report giữ rõ conditional model views, evidence gaps và các claim
chưa chứng nhận. P05 có 2D interval screening thật, **chưa có certified avoidability
solver/certificate verifier**. Không dùng screening để kết luận PHYSICAL_LIMIT.

## Build/test baseline và kết quả cuối

Đã kiểm `git status`, đọc nền tảng và chạy baseline trước khi sửa source. Hash của
909 file có sẵn được lưu ở `target/m1b-before.json`: gồm 880 tracked files, source/tests
M1A, tám đặc tả, report/samples M1A và sáu audit. Không file nào trong snapshot thay đổi.

| Lần kiểm | Tổng tests | Pass | Fail | Error | Skip | Build |
|---|---:|---:|---:|---:|---:|---|
| Baseline focused M1A + architecture/docs/metrics | 134 | 132 | 0 | 0 | 2 | SUCCESS, JAR/repackage |
| Baseline full suite trước source M1B | 861 | 856 | 2 | 0 | 3 | FAILURE do hai lỗi có sẵn |
| Final focused verify, M1A + M1B + architecture/docs/metrics | 293 | 291 | 0 | 0 | 2 | SUCCESS, compile/JAR/repackage |
| Final full verify với source M1B cuối | 1020 | 1015 | 2 | 0 | 3 | FAILURE, cùng hai lỗi baseline |
| M1B riêng trong các lần cuối | 159 | 159 | 0 | 0 | 0 | Tất cả pass |

M1B tests: `PhysicsFormulaTest` **45**; `EvidenceAndAvoidabilityTest` **24**;
`M1BPartialEvidenceTest` **5**; `M1BGolden18IntegrationTest` **85**
(72 dynamic per-run tests và 13 corpus/behavior tests).

Toàn bộ tests M1A giữ nguyên và pass: `M1AEvidenceTest` 33,
`Golden18IntegrationTest` 82; `M1AAuthorizedFixtureTest` 2 vẫn SKIPPED vì thiếu
authorized HF-02/HF-03 fixtures. Full suite còn một skip có sẵn:
`KinematicParityFullTest`. Không gộp skip thành pass.

Hai lỗi baseline/final giống nhau, ngoài phạm vi và không sửa:

- `OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor`
- `OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt`

Cả hai là Mockito argument verification mismatch, cũng xảy ra trước source M1B.
Full verify dừng ở test failures nên không gọi nó là full build success. Focused
verify đã tạo JAR thành công. Tests backend hiện có dùng mocks; không khởi động
backend/database, simulator session hoặc operational optimization campaign.

Lần unit đầu phát hiện exact corner tangency bị bỏ sót do roundoff của biểu thức
distance²−radius². Đã sửa bằng ULP tolerance trong nhánh quadratic solver; test
counterexample axis-expanded corner vẫn pass. Tolerance số học không được dùng
làm measurement uncertainty hoặc nâng conditional geometry thành mesh truth.

## File thêm mới và kiến trúc

Nền tảng đã đối chiếu: đủ tám file DATA_CONTRACT, FORMULA_SPEC,
DIAGNOSIS_POLICY, GOLDEN18_EXPECTED_BEHAVIOR, REFACTOR_BLUEPRINT,
OPEN_DECISIONS, OBJECTIVE_ANALYSIS_CONTRACT, MOBO_HANDOFF_CONTRACT; sáu audit
01_EVALUATOR_LOGIC_AUDIT đến06_AUDIT_SUMMARY; source M1A; source producer
Simulator/CarlaSession, AebStack command timing, AnalysisMetrics và AebMode.
Đọc root AGENTS/CLAUDE, hướng dẫn package/naming, analysis-metrics-contract và
ADR-055. Những tài liệu cũ ghi MOBO chưa có được hiểu theo source engine hiện có;
không vì documentary drift mà thay optimizer. Chỉ thị DESIGN ONLY trong tài liệu
cũ không thay yêu cầu implementation M1B mới của người dùng.

Source mới ở `src/main/java/com/vsos/core/failureanalysis/`:

| File | Trách nhiệm |
|---|---|
| `DiagnosticSupport.java` | Evidence wrappers, formula/source references, units/assumptions và claim-local source gates |
| `GeometryEngine.java` | G01–G04 projection, continuous fixed-heading OBB–disc conflict, clearance, occupancy union/PET |
| `StoppingModel.java` | P01–P04 caps, delay/ramp trajectory, stop-during-buildup, inverse cap và disjoint stopping windows |
| `AvoidabilityAnalyzer.java` | P05 conditional brake-only 2D interval screening với target position/velocity bounds; resource-limit→UNRESOLVED |
| `AebTimelineBuilder.java` | T01 detection/decision/core command, source schedule, pending/censoring và unattributed pedal readback |
| `PhysicalBrakingAnalyzer.java` | T01 recorded travel; T02 actual-timestamp peak/RMS jerk/tracking error, tách signal/window |
| `ImpactAnalyzer.java` | I01 matching contact, strict precontact frame, 3D relative velocity, reported scalar và paired observation |
| `EvidenceGates.java` | Q01 claim-local capabilities/interval differences; Q02 typed calibration membership |
| `DiagnosisPolicy.java` | Outcome policy và ba independent functional candidates; explicit requirement gates để nâng SUPPORTED |
| `ObjectiveExplainer.java` | Giữ canonical values; jerk/impact explanation; stopping trace+model-tail decomposition/replay |
| `DiagnosticReport.java` | Compose M1A evidence thành M1B sidecar, seven axes, quality/disagreements và immutable digest |
| `OfflineDiagnosticAnalysis.java` | Runner offline, optional exact run key, unique OFF comparator, CREATE_NEW output |

Tests mới ở `src/test/java/com/vsos/core/failureanalysis/`:

- `PhysicsFormulaTest.java`
- `EvidenceAndAvoidabilityTest.java`
- `M1BPartialEvidenceTest.java`
- `M1BGolden18IntegrationTest.java`

Không thêm dependency, interface/service chưa dùng, SQL, controller, endpoint hoặc
Spring bean. Các phép toán dùng JDK; JSON tái sử dụng MiniJson, rounding producer
tái sử dụng Py, canonical reader/report/digest tái sử dụng M1A.

`DiagnosticReport.analyze(run, optionalOff)` là entry point mới. Không thay hành vi
`EvidenceReport.analyze` hoặc runner M1A. M1B có analyzer build
`failure-analysis-m1b/1.0.0`, stage M1B, status ANALYZED_PARTIAL, các schema/formula/
policy version của V3.1 và digest profile M1A. Partial là evidence/claim completeness,
không phải dữ liệu giả để hoàn tất một pipeline.

## Formula coverage — IMPLEMENTED / CONDITIONAL / DEFERRED

Nguồn công thức: [FORMULA_SPEC_V3](FORMULA_SPEC_V3.md), cùng
[DATA_CONTRACT](DATA_CONTRACT_V1.md), [DIAGNOSIS_POLICY](DIAGNOSIS_POLICY_V1.md),
[OBJECTIVE_ANALYSIS](OBJECTIVE_ANALYSIS_CONTRACT_V1.md). EV có SI unit, clock/frame,
formula ID `fa-formula/3.0.0:{ID}`, raw source locators và assumptions. Formula-spec
artifact được pin SHA256 `dde2f15a856ed0830c3193c6bfae6119a0fed114211512d6479b30f1da74e2b5`;
registry không gọi source/spec hash là runtime binary/calibration verification.

| Formula | Phép toán đã code | Coverage / giới hạn runtime |
|---|---|---|
| G01 | km/h÷3.6; CARLA forward/left dot products; near-side gap=crossing_x−r−front | **IMPLEMENTED** math; **CONDITIONAL** core front projection. Full bbox center offset/pitch/roll chưa có |
| G02 | TTC=gap/closing chỉ gap>0,closing>0; không infinity | **IMPLEMENTED** plane-arrival helper. Không dùng TTC làm collision truth, không replay controller từ missing primary track state |
| G03 | Partition linear relative trajectory tại qx=±L/2,qy=±W/2; solve quadratic rounded-rectangle inequality; union contact intervals; minimize distance liên tục | **IMPLEMENTED** fixed-heading translation. Golden nominal/applied views **CONDITIONAL**; general rotating/accelerating continuous solver và actual mesh geometry **DEFERRED**, unresolved không trả false-safe |
| G04 | Full longitudinal body occupancy gồm rear+radius; lateral occupancy union; PET cho explicit named complete encounter | **IMPLEMENTED**. Overlap→null/OVERLAPPING; missing exit→CENSORED; nhiều encounter chưa associate→UNKNOWN. Broad phase không thay G03/contact authority |
| P01 | min(config cap,vehicle cap,adapter cap,μg); missing bound giữ unknown cap và known upper bound riêng | **IMPLEMENTED** math; flat-road attainable envelope **CONDITIONAL**, không achieved deceleration |
| P02 | Exact continuous delay/ramp/capped-brake trajectory; hai stop branches; v=0 không chờ delay | **IMPLEMENTED**, kiểm số chuẩn và numerical integration độc lập. Physical response applicability **CONDITIONAL**; initial brake/overrides/grade khác model không được reset ramp giả |
| P03 | Ideal lower bound; delay inverse; monotone full-ramp cap bisection trong [0,b_cap] | **IMPLEMENTED**. Zero là physical limiting bound, không invented MOBO search range. Không feasible→null/status, không infinity hoặc actuator-failure label |
| P04 | Gap−stop−margin; piecewise-linear state path, concave margin superlevel sets, disjoint union; censored latest boundary | **IMPLEMENTED** mathematical window solver. Runtime chỉ có explicitly unbuffered predecision screen; approved safety margin/latest feasible 2D decision **UNKNOWN** |
| P05 | Straight brake-only actions; target x/y/vx/vy intervals; recursive time-cell footprint distance enclosures; per-action SCREEN/UNRESOLVED result | **CONDITIONAL** 2D screening. Certified numerical-error enclosure, validated uncertainty/dynamics, exhaustive continuous action-set proof và certificate verifier **DEFERRED**. Canonical avoidability/certificate/PHYSICAL_LIMIT UNKNOWN |
| T01 | Detection/decision/command differences cùng clock; source schedule Q+activation_delay+0.10; recorded 2D/3D path increments; pedal statistic | **IMPLEMENTED**. Earliest observability, writer/applied/consumed provenance và approved physical onset/delay **DEFERRED** do raw thiếu evidence. OFF shadow riêng; 011 right-censored |
| T02 | Actual-timestamp 0.1s speed-drop windows; duration-weighted diagnostic jerk; exact integration of squared piecewise-linear tracking error | **IMPLEMENTED** math. GT diagnostic signal NONE filter, precontact/censored window riêng; missing samples không bridge. Demanded feasible per-tick trace thiếu→tracking RMSE UNKNOWN; onset threshold/baseline không tự đặt |
| I01 | Recorded scalar riêng; full vector ||vE−vP||; frame_before<contact_frame và precontact time checks; paired OFF−ON speed association khi recorded context match | **IMPLEMENTED**. Writer/disturbance matching thiếu→association **CONDITIONAL**, causal mitigation UNKNOWN; no-contact impact không thành zero |
| Q01 | Claim-local SUFFICIENT/PARTIAL/INSUFFICIENT/NA; interval timing difference [a−d,b−c]; explicit supported-functional gates | **IMPLEMENTED** phần dùng trong M1B. Validated statistical covariance propagation/probability/rates không có inputs và không được tạo; formal uncertainty/rate claims **DEFERRED** |
| Q02 | Typed EQ/IN/CLOSED_RANGE với units, required context, calibration version/hash/validation refs; four-state applicability | **IMPLEMENTED**. Golden18 map name/full-brake scalar không cung cấp validated domain→UNKNOWN; raw uncorrected kinematics→NA |
| OA-J | Read/explain existing ego_a/filter/window; raw GT jerk ở namespace khác | **IMPLEMENTED** explanation; không tính lại canonical RMS/filter/window hoặc aggregate |
| OA-I | Canonical core-tick impact, recorded contact scalar và precontact vector giữ ba named views | **IMPLEMENTED**; copy disagreement/authority/clock khác nhau không hòa giải bằng min/max/average |
| OA-D | source profile/onset index; trace displacement + v_last²/(2 stored rounded decel); producer round3 replay difference | **IMPLEMENTED** trên 42 Golden ON totals. Calibrated measured stopping distance UNKNOWN khi không bind core/recorder command window |

P05 không chứa nhánh “finite search failed→unavoidable”. Các tên SCREEN_* mô tả
kết quả enclosure tính bằng floating point, không là certificate. Ngay khi caller
cung cấp domain refs và finite-set completeness, solver hiện vẫn trả UNKNOWN cho
canonical avoidability vì chưa có verified numerical-error proof. Đây là phần
deferred rõ ràng, không phải một solver trả kết luận chắc chắn từ negative 1D margin.

Golden example 2D dùng đúng một demand theo existing config tại core decision hoặc
GT-shadow reference được đặt tên. Target CV point-state là **assumption minh họa**,
không measurement uncertainty=0, không controller input, không exhaustive action set.
Horizon chỉ là phần episode còn ghi và right-censored; tránh nhập nhằng với full encounter.

## Failure candidates → evidence và công thức

Các predicates độc lập; không ưu tiên physical limit/first failed stage hoặc ép
mọi run thành failure. Status không phải xác suất. Root-cause hypotheses giữ
alternatives/missing evidence; confirmed_root_cause UNKNOWN ở cả 72 run.

| Candidate | Evidence tạo SUSPECTED trong Golden18 | Formula refs | Missing evidence / alternative | Counts |
|---|---|---|---|---:|
| NO_BRAKING | ON; matching contact hoặc credible model conflict; không recorded Q/B; không pending before due time | G03,T01,Q01 | Approved duty, observable/actionable opportunity, full command window, inhibits/cancellation; alternatives perception/occlusion/delivery/log coverage | 6: 007/012 ×3 |
| FALSE_BRAKING | Core command engaged; hindsight target thực tế đứng ngoài corridor và không recorded lateral occupancy trong resolved nominal model | G03,G04,T01,Q01 | Approved caution, ex-ante consumed prediction, all actors/reasons, meaningful attributed intervention; alternatives acceptable caution/track persistence | 6: 061/064 ×3 |
| INEFFECTIVE_BRAKING | ON; recorded core command engagement và admissible matching contact | T01,I01,P05,Q01 | Goal/avoidance versus mitigation requirement, applied/consumed chain, opportunity, calibrated response; mitigation có thể vẫn đạt, timing/geometry khác | 14: 001R1,026×3,027R1,028×3,029×3,125R1/R2,168R2 |

Mỗi candidate có status/evidence/reason_codes/missing_evidence/alternatives,
requirement_id và requirement_reference. Không có approved requirement trong raw
Golden18 nên requirement refs UNKNOWN/null; không invent một duty từ TTC_GT.

`DiagnosisPolicy.applyRequirements` implement nhánh SUPPORTED trên **explicit
normalized requirement/evidence package**: requirement có id/version/APPROVED/type
scope/ref; mọi named gate phải true, OBSERVED hoặc DERIVED có formula/source refs,
không CONDITIONAL/UNKNOWN. Draft/missing requirement, thiếu một gate hoặc derived
gate không trace được đều không upgrade. Đây là API thuần cho package đã được
caller validate/bind; không phải collector/adjudicator tự xác thực một requirement.
Trong actual Golden adapter không có package ấy nên không dùng nhánh này. Tests
positive/negative dùng fixtures synthetic được ghi rõ, không làm golden ground truth.
OFF không nhận functional candidate/SUPPORTED ngay cả khi có supplied package.
SUPPORTED functional failure cũng không xác nhận root cause.

Physical outcome theo conservative policy đã đặc tả: **31 COLLISION/OBSERVED_EVENT,
41 UNKNOWN**, 12 authority disagreements OPEN. Empty collision array không chứng
minh absence; geometric intersection không trở thành sensor event. Không tự gán
SAFE/NEAR_MISS khi chưa có absence coverage và approved encounter threshold.

## Golden18 acceptance thực tế

Dataset: `D:/Downloads/golden18_raw_artifacts.zip`, SHA256
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`.
Đủ 18 case, 72 distinct run keys, 54 ON/18 OFF; không gộp repetitions.

| Case | Kết quả đã kiểm |
|---|---|
| G1-002 ×3 | Không forced missed/no braking; nominal full-body occupancy disjoint, model conflict=false; physical outcome vẫn UNKNOWN. R1 core-model min clearance≈1.08822m, PET≈0.70923s, không hard SAFE |
| G1-007 ×3 | Matching contact, NO_BRAKING SUSPECTED; impulse=0 không bị discard; root/avoidability UNKNOWN; recorder scalar13.935 khác canonical13.9 ở R1 |
| G1-011 ×3 | Q4.90, schedule5.15, core physics end5.09; AEB_DECISION_PENDING/RIGHT_CENSORED; không no-braking/actuator-failure candidate. Nominal min clearance≈0.062614m giữ nguyên, không force0 vì legacy collision |
| G1-012 ×3 | Pedal readback tồn tại nhưng writer/consumption UNKNOWN; NO_BRAKING SUSPECTED cùng CONTROL_ACTIVITY_UNATTRIBUTED; không coi pedal pulse là AEB command |
| G2-026 ×3 | Front đã qua crossing nhưng thân vẫn cần xét. R1 nominal min clearance0.03m, projected applied dimensions có conflict/CONDITIONAL. Sensor contact giữ độc lập. Canonical jerk null dù B2.85 có, không sensor substitution |
| G3-061/G3-064 ×3 | FALSE_BRAKING SUSPECTED theo hindsight; không confirmed ex-ante violation/prediction cause. Không so recorder2.44 với coreQ2.45 để kết luận phanh trước quyết định |
| G5-125 | μ=.65→model cap6.3765 CONDITIONAL; PHYSICAL_LIMIT UNKNOWN. Actual case là60km/h, v tạiQ=16.624m/s; runtime P02 distance≈28.44906m. Ví dụ unit50km/h→20.78523m là input minh họa khác, không gán làm run fact |
| G4-091 | TTC=.6 được giữ; ON core/event disagreement không tạo observed-ineffective collision candidate hay physical impact0 |
| G2-028/G2-029 | 028 OFF thiếu matched contact→paired mitigation UNKNOWN. 029 double-contact/context match→observational speed reduction CONDITIONAL; causal contribution UNKNOWN |
| G6-168R2 | Canonical impact2.820 và recorded contact2.811 là hai giá trị riêng |
| Toàn72 | 0 SUPPORTED functional failure, 0 confirmed root; OFF18 functional NA; canonical copies/values/null/filter/window không đổi; root labels không lấy từ legacy chain |

G2-026 nêu rõ applied-dimensions view vẫn chỉ là **core-front-anchored model**;
không dựng full bbox world transform từ actor center. Contact ở những run mà model
không giao cũng không bị xóa: model scope/censoring/mesh/clock còn giới hạn.

## Objective explanation và dữ liệu giữ nguyên

- `rms_jerk_mps3`: giữ exact canonical scalar và provenance M1A. CARLA là gated/
  clamped ego_a, producer Butterworth6×2 10Hz, T_AEB→end; diagnostic GT acceleration
  jerk dùng actual timestamps, NONE filter và recorder precontact/censored window.
  Không có T_AEB ở026 không được biến null thành0 hoặc lấy GT jerk thay thế.
- `impact_speed_mps`: core tick scalar, reported precontact scalar và vector
  reconstruction tách riêng. Preimpact frame phải nhỏ hơn event frame; đủ3vector
  components mới tính norm; không dùng |speedE−speedP| cho crossing.
- `stopping_distance_m`: giữ exact total; cả42 producer totals có decomposition và
  replay difference≈0. G125R1 trace16.074m, tail≈7.770270111m, stored a_extrap6.377,
  round3 total23.844m. Không thay stored6.377 bằng analytical cap6.3765. Trace là
  front projection, tail là model; command-aligned measured physical distance UNKNOWN.
- P02 predicted stop tính từ decision và gồm delay/ramp; canonical stopping total
  bắt đầu từ recorded command onset. Không dùng hai phép đo như cùng một metric.
- Mỗi objective liên kết timeline/feasibility và candidate refs, nêu limitations,
  physical quality PARTIAL/INSUFFICIENT, eligibility vẫn UNKNOWN hoặc OFF EXCLUDED.
  Không tạo score, aggregate, parameter recommendation/search range hoặc handoff.

Schema registry có hash/locator cho raw inputs và pinned formula spec. Recorded
control, core và GT giữ clock riêng; không inferred universal offset. Invalid
optional GT acceleration không xóa independent matching contact: unit test kiểm
claim-local gate này. Missing travel không thành zero; partial travel tách total,
không bridge missing intervals. Có raw velocity override count thì giữ flag; không
tự clip peaks theo configured cap hoặc giả rằng đã mask mọi override/contact effect.

## Report samples và replay

Runner đã sinh **72** sidecars từ input thật vào `target/m1b-diagnostic-reports/`.
Năm samples dễ review được pretty-print, giữ nguyên values/digest:

- [007-R1 — no recorded command](samples/m1b/FA-G1-007-R1.json)
- [011-R1 — pending/right-censored](samples/m1b/FA-G1-011-R1.json)
- [026-R1 — rear/body conflict](samples/m1b/FA-G2-026-R1.json)
- [061-R1 — hindsight false-braking candidate](samples/m1b/FA-G3-061-R1.json)
- [125-R1 — conditional friction envelope](samples/m1b/FA-G5-125-R1.json)

JDK/MiniJson checker kiểm lại content digest của72 serialized reports và replay
năm samples trực tiếp từ raw ZIP bằng source cuối: **72 digest + 5 replay PASS**.
Sample report không là ground truth root-cause label. UUID/time analysis mới được
loại khỏi content digest theo profile M1A; raw/history/report M1A không bị overwrite.

## Commands và logs

PowerShell, JDK21, từ repository root. Dùng actual ZIP; nếu ZIP thiếu, Golden tests
JUnit SKIPPED/BLOCKED có reason/property path, không có generated Golden18 fallback.

```powershell
# Baseline trước sửa source
.\mvnw.cmd -B '-Dtest=M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> target/m1b-baseline-focused.log
.\mvnw.cmd -B test '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' *> target/m1b-baseline-full.log

# Compile/unit checks trong lúc implement
.\mvnw.cmd -B -DskipTests compile
.\mvnw.cmd -B '-Dtest=PhysicsFormulaTest,EvidenceAndAvoidabilityTest' test

# Final focused build (293 tests)
.\mvnw.cmd -B '-Dtest=PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> target/m1b-focused-verify-final.log

# Final full suite (1020 tests; hai lỗi baseline giữ nguyên)
.\mvnw.cmd -B verify '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' *> target/m1b-full-verify-final.log

# Sidecars: thư mục output mới, CREATE_NEW
java -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis D:/Downloads/golden18_raw_artifacts.zip target/m1b-diagnostic-reports
java --class-path target/classes target/CheckM1BReports.java D:/Downloads/golden18_raw_artifacts.zip target/m1b-diagnostic-reports docs/failure-analysis-v3/samples/m1b

git diff --exit-code
git status --short
```

Không chạy `clean` trong lần cuối để giữ baseline fingerprints/logs trong target;
Maven đã recompile khi source thay đổi và focused verify đã đóng gói JAR. Đây không
phải tuyên bố full verify xanh. Logs/test XML là build artifacts, không source changes.

## File diff và tính bất biến

`git diff --exit-code` trả0 vì toàn bộ source/tài liệu mới vẫn untracked; không stage
để tạo diff giả. So với snapshot đầu M1B: **0 modified/deleted pre-existing files**;
12 source Java mới, 4 test Java mới, report này, 5 samples và exec plan hoàn tất.

Unified diff cho đúng12 source +4 tests mới: `target/m1b-source.diff`.
Danh sách file/line counts và protected hash comparison: `target/m1b-protected-check.json`.
Không đưa9 source M1A hoặc tám đặc tả cũ vào diff M1B chỉ vì chúng đã untracked từ trước.

```text
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1a.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1b.md
?? docs/failure-analysis-v3/
?? src/main/java/com/vsos/core/failureanalysis/
?? src/test/java/com/vsos/core/failureanalysis/
```

## Còn thiếu và điểm dừng

Các phần deferred cần evidence/model mới, không thể chốt bằng Golden18: full bbox
pose/mesh/rotation/motion bounds; authoritative clock origins/drain coverage;
primary delivered/consumed perception; command writers/applied/consumed physics;
approved observability/caution/performance/onset requirements; calibration validation
domain/residuals; validated uncertainty/dynamics/action-set scope và numerical
certificate checker. Root-cause confirmation còn cần causal trace/adjudication.
Không thu thập chúng bằng CARLA hoặc nới policy trong nhiệm vụ này.

Không có M1C aggregation/handoff builder, MOBO integration, database/API/frontend
thay đổi hoặc auto-implementation bước tiếp theo. M1B dừng tại Diagnostic Report.
