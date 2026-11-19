# Phase 19 — Analysis regression testing & quality hardening

Ngày 17/11/2026. Nhánh `chuvv`, nền `1649771`; Phase18 đã commit, working tree sạch lúc bắt đầu.
Chỉ Phase19; không commit/push/stage, không sửa physics/AEB/evaluator/schema hoặc triển khai Phase20.

## Audit và ưu tiên trước triển khai

| Module | Behavior | Production Code | Existing Test | Coverage Gap | Risk | Action |
|---|---|---|---|---|---|---|
| Overview/explorer | Status/source/metrics/filters | AnalysisOverview, Run/FailureExplorer | analysis-overview/redesign | Có browser assertions; fixture tự dựng, chưa đồng bộ API thật | P1 drift | Giữ coverage; thêm service contract dùng chung frontend |
| Metrics/source | SI/null/0/precision | AnalysisViewService, RecordedTelemetry, formatters | Java metrics + frontend6 suites | Chưa có fixture được kiểm bởi cả Java service và frontend | P1 | Golden contract từ production service, không dữ liệu CARLA giả |
| Detail/Evidence | ID/source/missing/time links | route, Evidence, helper | Phase18 suites | Stale test dùng page.goto, có thể hủy JS context trước khi response cũ về | P1 | Controlled responses + client navigation trong cùng document |
| Playback | ID/validity | playback/page.tsx:58/138 | Phase17 suites | Chưa guard response run_id; badge dùng evaluation_valid !== false | P0/P1 tiềm năng | Test tái hiện trước; chỉ sửa nhỏ frontend nếu fail |
| Charts/clock | domain/gaps/duplicates/20k/cleanup | telemetryChartData, playbackClockData | Phase16/17 unit/browser | Đã có; không viết test trùng hoặc đổi clock/formula | P1 | Chạy lại, hai lượt suite quan trọng |
| Test infrastructure | Fail closed/fresh results/isolation | frontend/tests + CI | run-admin chỉ cho Admin | CI frontend chưa chạy Analysis unit; fixed output có thể giữ PASS cũ | P1 | Entry point Analysis, output riêng, kết quả mới bắt buộc, CI unit |

## Kế hoạch

1. Đọc pipeline/tests/Phase11–18, ADR/metric contract; bổ sung coverage matrix chi tiết và giới hạn.
2. Viết contract regression cho AnalysisViewService/inspection + frontend mapping; fixture được Java kiểm golden.
3. Viết browser defensive ID/validity và controlled stale response tests; chạy trước sửa.
4. Sửa tối thiểu lỗi frontend tái hiện; chuẩn hóa artifact/result và runner, không đổi framework/dependency.
5. Lint/TS/build, Java Analysis/core/worker offline, Analysis unit và browser; lặp hai lượt quan trọng.
6. Báo cáo kết quả thực, gap/taxonomy/runtime/Figma, checklist đề xuất Phase20; chuyển completed và dừng.

## Giới hạn ban đầu

Không dùng DB/tài khoản thật, không chạy batch CARLA hoặc sửa môi trường cá nhân.
Mock DB/service/browser không chứng minh persistence/HTTP live/CARLA hoặc độ chính xác thực địa.
TD58–61, TD17 và taxonomy ineffective/avoidability vẫn ngoài sửa thuật toán của phase này.


## 1. Executive Summary

Phase19 giữ nguyên algorithm/formula/threshold/database. Hai lỗi nhỏ ở Playback được tái hiện trước sửa:
response run103 có thể render dưới URL101, và metadata evaluation_valid thiếu vẫn hiện badge “An toàn”.
Sửa duy nhất production là guard ID và dùng cùng classificationPresentation.trusted của Detail để cấp badge;
frames vẫn xem được khi thiếu kết luận. Đây là phòng vệ trước API sai/thiếu metadata,
không khẳng định backend hiện hành đã trả sai ID trong production.

Thêm contract dùng chung Java/frontend:4 kết quả động học từ core thật → persistence mock → read services thật
→ JSON/gzip reviewed fixture → frontend helpers/browser. CI backend kiểm fixture với producer;
CI frontend nay chạy48 unit tests dùng fixture đó. Không cần dependency/framework mới.
Runner browser có artifact riêng từng suite/lượt, fail closed, dọn result PASS cũ, force tắt baseline mode.
Không đo code-coverage %, không suy physics accuracy từ test count.

Đối chiếu AGENTS/CLAUDE gốc và frontend, DESIGN, Next accessibility guide cài sẵn,
rename guide/mục7 naming, architecture, ADR040/042/050/051, CP_CROSSING và analysis-metrics-contract.
Đã đọc reports Phase11/12/14–18 và plan Phase13 còn ở active; code hiện tại được ưu tiên so với lịch sử.
Report Phase18 còn placeholder ở bảng validation; không lấy placeholder đó làm bằng chứng đã chạy,
Phase19 dùng logs/test results mới của mình.

## 2. Analysis Test Coverage Matrix

`UI` = frontend/src/components/analysis, `Java` = src/main/java/com/vsos;
test names viết ngắn tương ứng frontend/tests/*.mjs hoặc src/test/java/com/vsos/**.
“Có test” chỉ nói phạm vi assertion tương ứng, không phải full integration/runtime safety.

| Module | Behavior | Production Code | Existing Test | Coverage Gap | Risk | Action |
|---|---|---|---|---|---|---|
| Overview | Scope/engine/AEB/vehicle/dt identity | BaselineAnalysisDashboard; UI/AnalysisOverview | analysis-overview; AnalysisServiceTest | Fixture cũ tự dựng, chưa HTTP+DB thật | P1 | Giữ browser scope; shared service contract kiểm identity |
| Overview | Run/scenario/status/outcome/navigation | UI/AnalysisRunExplorer, Overview | overview/redesign | Không phải mọi field AEB đều nằm trong dashboard API | P1 | Không tạo activation widget/metric; detail contract kiểm field thật |
| Overview | Primary objectives/SI/null/0 | UI/AnalysisOverview, analysisMetricFormat; AnalysisMetrics | overview, metric-format, AnalysisMetricsTest | Aggregate không thay metric từng run | P0 | Shared contract checks + giữ grouping source gates |
| Overview | Loading/empty/error/partial | BaselineAnalysisDashboard | overview/redesign | Browser mock, không live HTTP503 | P2 | Chạy lặp browser giữ assertions |
| Failure Explorer | Server filters/KPI/page/CSV/evidence links | LegacyFailureCases → UI/AnalysisFailureExplorer | redesign, classification-ui | Search client và server filter có scope khác nhau | P1 | Full suite kiểm payload/context/readonly; không gán code mới |
| TTC | CP gap/speed, zero gap/low speed/outside path | core/simulation/Simulator.groundTruthTtc | MetricExplanationContractTest mới | Chưa numerical boundary CP trực tiếp trước phase này | P1 | Thêm anchor10/5=2s; gap0/âm, speed0/0,1/âm, ngoài path→null |
| TTC | CCR closing dương/0/receding/nonconflicting | LeadVehicleSimulator, AebStack | LeadVehicleSimulatorTest:ttcUsesTheClosingSpeedForAMovingLeadVehicle/equalSpeedAndRecedingTargetsHaveNoTtcOrImpactMeasurement/nonIntersectingLaneHasNoGroundTruthTtc | Không dùng CP formula cho CCR | P1 | Chạy core tests, không viết trùng |
| TTC | Perception ≠ GT; unavailable ≠0 | RecordedTelemetry; AnalysisViewService.failureDetail | AnalysisSnapshotTest; telemetry; api-contract mới | JSON NaN không phải number hợp lệ trên wire | P0 | Test direct nonfinite maps và HTTP null tách riêng, không fake NaN JSON |
| Distance/speed | Gap geometry, closing vs ego speed | Simulator/LeadVehicleSimulator/CarlaSession; RecordedTelemetry | LeadVehicleSimulatorTest, CarlaLeadVehicleTest; metric-format/api-contract | Canonical chưa target_v; Detail chưa dynamic required distance/closing field | P1 | Không tính closing/required distance ở frontend; ghi TD59 |
| Brake command | Controller decision/onset, không applied brake | AebStack, stage_evidence, UI/Evidence | evidence, api-contract; integrity-ui | Frame chưa numeric command/pedal ratio | P0 | Chỉ test fields thật; không tạo brake chart/percentage giả |
| Pedal ratio | 0..1 saturation, feedback, calibration scale | core/aeb/DecelMeter.brakePedal | CarlaSessionLogicTest.brakePedalMapsDecelerationIntoZeroOne | Canonical Analysis không có % display | P1 | Giữ offline test; 100% ≠ gia tốc cố định, không test % UI không tồn tại |
| Activation/delay | Absolute time vs duration/unit s | Simulator.summaryMetrics; AnalysisViewService; analysisEvidenceData | evidence/explainability/api-contract mới | Physical applied/decel onset chưa API | P0 | Link chỉ absolute timestamp, delay không biến thành marker |
| Deceleration | Signed a vs positive magnitude/processed CARLA | DecelMeter, RecordedTelemetry, MotionTelemetryChart | CarlaSessionLogicTest; telemetry; metrics-ui | Max decel không a_available; chưa physical IMU validation | P0 | Giữ sign/source, không abs toàn bộ hoặc suy command |
| Available/required decel | Available min/config/calibration; required envelope heuristic | CarlaSession.decelAvailable, Evaluation.hazardChain | CarlaSessionLogicTest.decelAvailableUsesTheMeasuredFullBrakeOnTheCurrentFormatOnly; FailureAnalysisAuditTest | Required deceleration/required stopping-distance metric riêng chưa có; LOW_FRICTION TD58 | P1 | Mark absent/heuristic; không tự thêm formula/test output giả |
| Stopping distance | Observed + v²/(2a) remainder | Simulator.brakePhaseMetrics | MetricExplanationContractTest; SimulatorBehaviorTest | Legacy a<=0 remainder0 còn giới hạn | P1 | Characterize/giải thích, không sửa formula |
| Impact/min separation | Ego m/s vs km/h, collision0/min vs null | Simulator.summaryMetrics; AnalysisViewService | core behavior; metric-format/metrics-ui; api-contract mới | Relative impact chưa Detail field; no argmin time | P0 | Assert SI/raw/null/zero/source; không jump tới time giả |
| RMS jerk | Nominal dt window/pre-onset vs projection actualΔt | Simulator.brakePhaseMetrics; RecordedTelemetry | MetricExplanationContractTest; AnalysisSnapshotTest.projectedJerkUsesActualIntervalsAndDoesNotBridgeMissingOrDuplicateSamples | Missing/duplicate timestamps ở projection không phải đổi canonical RMS | P0 | Chạy anchors hiện có; không smoothing/compute lại từ chart |
| Numeric boundaries | Undefined/null/NaN/Inf/âm/0/tiny/extreme | analysisMetricFormat, telemetryChartData | metric-format; telemetry; metrics-ui | API required object schema chưa validator toàn bộ | P0 | Shared field/rounding contract + ghi rõ partial boundaries |
| Classification | 5 code thực, verdict/validity/status | Evaluation; analysisClassificationData | classification + classification-ui | Ineffective/avoidability/confirmed cause chưa taxonomy | P0 | Không tạo code; PASS/null vẫn thiếu classification |
| Classification | Collision/no-collision/command không tự là cause | AnalysisClassification; Evidence; Evaluation | classification; FailureAnalysisAuditTest | Backend verdict FAIL với collision là rule, không causal diagnosis | P0 | Giữ rule verdict; UI không suy missed/false/ineffective hay confirmed cause |
| Classification | Playback thiếu validity | playback/page.tsx | integrity-ui mới --probe=validity | Guard cũ dùng !==false | P0/P1 | Test FAIL trước sửa; chung trusted gate, giữ recorded frames |
| Chart | Irregular/duplicate/backward/invalid time, cadence | telemetryChartData, TelemetryChartParts | telemetry; telemetry-ui | Nominal dt không chứng minh loss map | P1 | Chạy lại; no interpolation/GT fallback |
| Chart | Units, marker source, common cursor/domain | TelemetryChart, MotionTelemetryChart | telemetry-ui/redesign; evidence/api-contract | Domain sensor/camera chưa mapped | P1 | Source/event timestamp assertions; không offsets |
| Chart | 20k data/extrema/full samples | TelemetryChartParts | telemetry + telemetry-ui | Không có downsampling feature; chưa low-end benchmark | P2 | Kiểm giữ samples/extrema, không gọi là downsample test |
| Playback | Play/pause/seek/restart/rate/end/loop cleanup | playbackClockData, PlaybackTimeline, route | playback9unit + playback-ui | Browser timing phụ thuộc máy; chưa long-session memory proof | P1 | Hai lượt, reverse order; giữ real RAF probes |
| Playback | One sample/zero duration/gap/no fake collision | playbackPresentation, Scene/Facts | playback unit/browser | CCR map còn TD60 | P1 | Không mở rộng map redesign/physical model |
| Playback | Wrong response ID | route fetch boundary | integrity-ui mới --probe=mismatch | URL/request key không kiểm response identity trước phase19 | P0/P1 | Reject trước prepare/clock/render, test error+no source |
| Detail/Evidence | Identity/run/scenario/source path/unit/raw | detail route, Evidence + helpers | Phase18 evidence suites; api-contract/integrity mới | Mock DB không actual persistence/HTTP integration | P0 | Producer/consumer shared fixture, exact IDs/precision |
| Detail/Evidence | Missing stage/null/unknown field/source/unsupported | evidenceGroups, Classification, explanationData | evidence, evidence-ui, explainability | Các required objects khác vẫn theo API contract | P1 | Không fake missing→0 hoặc full schema-validation claim |
| Detail/Evidence | Exact time/context/metric vs event | evidenceHref, recordedRange, runMarkers | evidence + api-contract + redesign | Scalar extrema không có timestamp; only supported first event per kind | P1 | Keep source/actual time; no index time/cursor timestamp fabrication |
| Cross-run async | Old response after new, same document | detail/playback effects + request keys | integrity-ui mới | page.goto test cũ có thể hủy context, không chứng minh effect cleanup | P0/P1 | Real Link/back, held response decoded sau current, document UUID giữ nguyên |
| Negative states | 400/403/404/409/5xx/retry/malformed ID/payload | routes, analysisError, snapshot operations | redesign; integrity-ui error/network/null-body mới | Không exhaust mọi code; no client timeout contract | P1/P2 | Error không empty/SAFE; không gọi abort=timeout |
| Test runner | Fresh results/baseline/isolation/CI | tests/run-analysis + helpers; ci.yml | analysis-test-infra mới | Browser CI chưa provision | P1 | CI unit, local browser runner2 rounds; TD57 |

## 3. P0/P1/P2 Risk Assessment

- P0/P1 đã sửa frontend: response ID sai ở Playback và kết luận badge khi metadata chưa đủ.
  Chứng cứ là defensive HTTP fixtures, chưa xác nhận incident trên backend hiện tại.
- P1 đã giảm: contract drift service→frontend, CI không chạy Analysis units, stale response test chưa cùng document,
  PASS artifact cũ và kết quả baseline nhầm regression. Không đưa ra tỷ lệ coverage chưa đo.
- P1 còn: TD58 validity/causal taxonomy core, TD59 provenance/applied trace, TD61 clock/cadence,
  immutable snapshot/actual DB/HTTP boundary chưa live; không sửa thuật toán để “đạt” invariant.
- P2 còn: bounded real-clock waits/performance phụ thuộc máy, native touch/screen reader/browser khác chưa kiểm;
  TD60 hình học CCR/annotation không thuộc hardening test này.
- Dependency risk mới TD62: npm audit thấy1 moderate cho Next16.4.1. Advisory của publisher liệt kê
  range16.3.0–16.4.4, patch16.4.5:
  [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h).
  Không chứng minh app có exploit path; không tự nâng dependency hoặc tắt security check.

## 4. Existing Test Quality Assessment

Điểm giữ nguyên: production helpers được transpile/import thay vì copy logic; numeric anchors độc lập;
parity fixtures; actual time/units/null/negative cases; chart extrema/no mutation; real RAF max pending;
stateful browser paths kiểm filter/ID/snapshot payload và error recovery.

Các gap được khắc phục:
1. CI chỉ lint/TS/build/audit, không chạy6 Analysis unit files. Thêm `npm run test:analysis`,
   gồm6 suites gốc + shared API contract + infrastructure; backend CI tự chạy new Java test trong clean test.
2. Mỗi browser suite hardcode output, full redesign không xóa result.json cũ.
   Shared prepareAnalysisArtifacts dùng env override, giới hạn data/subdirectory, xóa riêng result.json cũ.
3. Telemetry/Playback result không có status/kind rõ; thêm completed fixture metadata,
   baseline được đánh dấu BASELINE, runner không chấp nhận baseline thay assertions.
4. New integrity fixture fail-closed với endpoint chưa khai báo. Families/recommendations/projects/regression
   được khai báo đúng shape từ API types, không dùng catch-all [] che contract drift.
   Legacy8 suites vẫn còn fallback read feeds; không tuyên bố đã thay toàn bộ setup của chúng.
5. Test stale mới không page.goto giữa hai request cần so sánh: Link/back giữ UUID document,
   giữ response104 trong route và chờ response101; sau đó release104 và chờ consumer JSON decode thật.
   Kiểm facts hiện tại theo dd/config, không nhầm label của link “run liên quan” là dữ liệu đã trộn.

Không đổi framework, không auto-accept snapshot, không thêm dependency, không xóa assertion cũ để PASS.
Legacy assertions nghiệp vụ giữ nguyên;8 suites chỉ đổi artifact setup, hai result schemas rõ ràng.
Không tuyên bố mọi fixed timeout/fixture duplication đã được xử lý: playback/perf vẫn có elapsed-time windows.

## 5. New/Improved Regression Tests

`AnalysisApiContractTest.productionReadServicesMatchTheFixtureConsumedByFrontendTests`:
core Simulator/Evaluation thật cho101collisionCP,102curb-safe/no-brake,103CCRs,104cùngCP101/seed3 nhưng AEB khác.
Read services AnalysisService.inspection, AnalysisViewService.failureDetail/playback thật; DB/queries mock.
Fixture golden gzip42KB giữ toàn frames/events (321 frame), không rút gọn chart hoặc sửa metric.
Case101/104 có cùng scenario/variant/seed/xe/profile, version AEB7/8 khác nhau;
similar/related links trong browser được thiết lập cho đúng cặp này, không bịa comparability từ khác variant.
Một Java test thứ hai kiểm project/completion gate.

`analysis-api-contract.mjs` có4 groups: identity/provenance/full frames/events, unit/precision/GT/null,
classification/zero/no-brake, exact stage source paths/time links. Loader transpile production graph thực,
không copy formatter/evaluator vào test.
`analysis-test-infra.mjs` có3 groups: output không thoát data, xóa PASS cũ giữ diagnostics,
không nhận incomplete/baseline/page error làm PASS.
`MetricExplanationContractTest` thêm1 CP TTC boundary test; giữ nguyên anchors RMS nominal dt và stopping remainder.
`analysis-integrity-ui.mjs` kiểm cả golden thật qua mock HTTP và defensive malformed/metadata cases,
native keyboard/five widths, current fact assertions, API500/aborted network/null body retry.
Không test required-decel hoặc % phanh UI chưa tồn tại.

Golden được tạo có chủ đích bằng `-Danalysis.contract.update=true` trong quá trình xây test;
normal test/CI không ghi lại fixture. File actual.json diagnostic chỉ ở target/analysis-contract.
Khi contract đổi: chạy mặc định để xem failure, review actual so với fixture/code,
sau đó chỉ regenerate nếu thay đổi đã được chấp nhận; không tự update trong CI.
File gzip có thể đọc bằng Node zlib hoặc Python gzip; dữ liệu sinh từ core, không người dùng/DB thật.

## 6. Production Bugs Found

| Lỗi | Tái hiện trước sửa | Nguyên nhân | Sửa tối thiểu | Bằng chứng sau |
|---|---|---|---|---|
| Wrong run payload | --probe=mismatch: URL101 nhưng payload103 render source/frames, assertion lỗi không hiện | Playback chỉ request-key/cleanup, không kiểm data.run_id | Check ID trước playbackPresentation/clock | integrity browser: error, không source; unit/core không đổi |
| Missing evaluation validity | --probe=validity: thiếu field vẫn có “An toàn” | Header dùng evaluation_valid !== false | Dùng classificationPresentation.trusted cho outcome/cause badges + neutral note khi chưa đủ điều kiện | No SAFE badge, playback controls vẫn dùng frames đã ghi |

Production diff chỉ `frontend/src/app/analysis/failures/[runId]/playback/page.tsx`.
Không thay classification engine, metric source/value, AEB/control, CARLA/physics/calibration,
DB/schema, role/reviewer, Admin hoặc Workspace.
Ảnh trước lỗi ở data/analysis-phase19-2026-11-17/probe-{mismatch,validity}/.
Probes trước sửa thất bại là expected regression evidence, không được báo PASS.

## 7. Data Integrity Verification

Pipeline thực: core simulation/adapter → persisted scalar + telemetry_json → read services
→ JSON consumer → renderer. Shared contract đi qua core + service + Json serialization,
**bỏ qua actual RunService.persist/MySQL/HTTP auth** bằng persisted Row mock; không gọi là live end-to-end.
Fixture không đại diện CARLA; CarlaSession tests dùng observations/sessions offline, worker tests dùng mocks/bridge.

Các invariant kiểm bằng số:
run/scenario/variant/seed/profile IDs khớp; full frames/events giữ nguyên; t0=0 và duration từ frame cuối;
raw m/s vào motion giữ m/s; speed_kmh từ API không nhân3,6 lần nữa; đúng backend rounding ±0,005km/h;
TTC perception null không thay bằng GT; signed ego_a giữ dấu; impact null khi noncollision;
collision min-distance0 không thành missing; no-brake RMS/onset null; source canonical rõ ràng.
Duration response_time không absolute event; unknown stage không được gán event vì trùng tên key.
Labels/code mapping không tái chấm từ metric frontend.

NaN/Infinity/undefined được kiểm trong helper/direct Map tests theo đúng nơi có thể xuất hiện;
không gọi JSON fixture NaN là valid wire format. Partial stage được giữ siblings; null toàn payload
phát sinh retry/error. Thiếu mọi required nested object chưa có schema validator frontend — gap được ghi riêng.
Không suy dữ liệu thiếu thành0, không tính lại objective từ số đã rounded/chart.

## 8. Failure Classification Regression

Giữ code backend thật COLLISION/FALSE_BRAKING/MISSED_BRAKING/LATE_BRAKING/NEAR_MISS.
“Ineffective braking”, unavoidable, confirmed cause, evaluation pending/failed riêng chưa có contract;
không tạo backend value chỉ để phủ danh sách.
Backend hiện đặt rule verdict FAIL khi collision; điều đó không được UI diễn giải thành confirmed AEB root cause.
UI chỉ trình bày classification đã lưu và suspected rule chain; score không probability.
PASS không sinh classification từ null, no collision không sinh false braking, command không sinh effective braking.
Unknown code/unsupported category có neutral/limit presentation, không ép vào taxonomy mới.

Phase19 đóng missing-validity gap ở Playback; phần helper/Evidence đã có regression Phase14–18 được chạy lại.
Backend FailureAnalysisAuditTest vẫn characterization empty SAFE/PASS và LOW_FRICTION attribution,
không biến các giới hạn đó thành approved/physically correct.

## 9. Telemetry/Playback Regression

Unit timestamp/domain/nearest/lookup/zero/duplicates/invalid gaps/sign + browser source/readout/shared cursor.
Projection jerk dùng actual Δt; canonical RMS dùng nominal dt; hai thứ không bị gộp.
Large datasets200/2000/20000 giữ timestamps/extrema/all samples; implementation không downsample.
Không test “downsampling preserves extrema” cho feature chưa có.
Playback9 clock tests + browser kiểm pause/seek/rates/restart/end/one sample/zero duration/strict events/RAF cleanup;
double/rapid clicks không nhiều pending loop. Timestamps mô phỏng không đổi khi tăng rate.

Stability chạy lại cùng production bundle, suite order đảo ngược pass2, mỗi suite có process/context/artifact riêng.
Không claim60fps, long-session memory hoặc low-end/native device performance.
Synthetic document.hidden event trong suite Phase17 chỉ kiểm handler, không chứng minh OS background throttling.

## 10. Evidence Traceability Regression

Shared producer/consumer contract giữ chain/stage_evidence/source metadata và index JSON thực.
API source paths và raw values được kiểm độc lập với display text; link truyền t chính xác, returnTo/signal/run ID.
Scalar min/extreme và delay/config không có fake timestamp link.
Detail và Playback dùng cùng raw recording; browser Link/back chờ old payload decode rồi kiểm latest facts,
không gọi full document reload là chứng minh stale response guard.
Unknown class/missing cause không tạo confirmed cause/confidence mới.
Time mapping chỉ trong canonical recording cùng run; recorder CSV/IMU/camera chưa mapping origin (TD61).

## 11. Browser QA Results

New integrity test dùng real production Next app ở3131 + Edge headless, actual login form với .invalid actor;
mọi API trong context được intercept, không đăng nhập backend thật.
UI widths375/390/768/1024/1440 kiểm exact impact SI, identity, source, keyboard tabs/focus, overflow.
Existing full suite còn coverage Failure Explorer/datasets/readonly/HTTP errors/menu/URL return.
Ảnh không thay metric assertions; new suite chỉ chụp2 trạng thái lỗi trước sửa và1 source state sau,
existing suites giữ screenshot evidence của các trạng thái từ phase trước. Hai probe sau sửa được chụp riêng ở after-mismatch/after-validity; đã xem ảnh đối chiếu, không ghi đè ảnh trước.
Chưa Figma file/key, screen reader thật, native touch hoặc Safari/Firefox.

## 12. Validation Commands & Results

Logs dưới `data/analysis-phase19-2026-11-17/`, runner summary/result riêng từng pass/suite.
Không có code-coverage instrumentation; không ghi phần trăm coverage.

| Command / scope | Thực thi / PASS / FAIL / SKIP | Log / thời gian nếu có |
|---|---|---|
| `npm.cmd run lint` | PASS exit0 final source/test code | lint-final.log; không đo riêng |
| `npx.cmd tsc --noEmit` | PASS exit0 sau build | types.log; không đo riêng |
| `npm.cmd run build` | Lần đầu exit1 ở SecurityFatalError; retry exit0, giữ nguyên package/config | build.log + build-retry.log; baseline cũng có cùng nudge/retry; không che failure đầu |
| `npm.cmd run test:analysis -- --repeat=2` | 48 PASS/0 FAIL/0 SKIP mỗi lượt, thứ tự unit đảo | data/analysis-regression/2026-11-17T10-07-55-669Z-9464/summary.json |
| `npm.cmd run test:analysis -- --browser --repeat=2` | 48 unit ×2 và9 browser suites ×2 đều PASS;20 child runs PASS | analysis-runner.log + regression/summary.json; browser elapsed tổng365,998s, mỗi suite5,830–88,612s |
| Java selection16 classes, final | 134 tests:133 PASS/0 FAIL/0 ERROR/1 SKIP | java-regression-final.log; Maven14,191s; lượt đầu trước thêm CP boundary132 PASS/1 SKIP |
| Java important selection7 classes | 43 PASS/0 FAIL/0 SKIP | java-regression-2.log;4,876s; overlap selection trên, không cộng thành test độc lập |
| New/shared contract + CP TTC/RMS anchors | 5 PASS/0 FAIL/0 SKIP ×2 | contract-boundary-1.log9,544s; contract-boundary-2.log8,490s; không có update flag |
| `python -m pytest worker/tests -q` | 59 PASS/0 FAIL/0 SKIP | worker-tests.log;4,16s pytest; offline mocks/bridge |
| `python -m ruff check worker` | KHÔNG CHẠY ĐƯỢC: No module named ruff | worker-lint.log, Python3.15.0; Get-Command ruff không tìm được; không cài global |
| `npm.cmd audit --omit=dev --json` | exit1,1 moderate Next,0 high/critical | audit.json; dependency không đổi |
| `npm.cmd audit --omit=dev --audit-level=high --json` | exit0 theo ngưỡng CI, vẫn1 moderate | audit-ci.json; không gọi là hết advisory |
| Mismatch/validity probes trước sửa | 2 expected FAIL, mỗi probe bắt đúng defect | probe-mismatch.log / probe-validity.log + ảnh |
| Cùng probes sau sửa | 2 PASS exit0 | probe-*-after.log + after-mismatch/after-validity ảnh đã xem |
| `.\mvnw.cmd -B -Dtest=RepoDocsTest test` | 5 PASS/0 FAIL/0 SKIP | docs-final.log;5,012s |
| Report links/UTF8/whitespace/conflicts/Git + `git diff --check` | PASS | final-check.log;22 files gồm1gzip,19 local links,20 child results; HEAD1649771 không đổi, staging rỗng |

Frontend commands chạy trong `frontend`. Browser command có
`$env:ANALYSIS_UI_URL='http://127.0.0.1:3131'` và
`$env:ANALYSIS_TEST_OUTPUT='<repo>/data/analysis-phase19-2026-11-17/regression'`;
app riêng chạy `npm.cmd start -- --port 3131` từ production bundle.
Không đưa thông tin account/token thật vào tests; .invalid login chỉ fixture.

Java command cuối (root, MAVEN_OPTS=-Xmx512m -XX:ActiveProcessorCount=2):
`.\mvnw.cmd -B -Dtest=AnalysisApiContractTest,AnalysisServiceTest,AnalysisSnapshotTest,AnalysisDatasetTest,AnalysisMetricsTest,FailureAnalysisAuditTest,MetricExplanationContractTest,SimulatorBehaviorTest,LeadVehicleSimulatorTest,CarlaSessionLogicTest,CarlaLeadVehicleTest,KinematicParityTest,KinematicParityFullTest,TelemetryMetricsServiceTest,CarlaResultSubmissionTest,CarlaWebTest test`.
Golden generation lúc xây test có update flag explicit; mọi validation cuối dùng mặc định, kiểm fixture thay vì ghi lại.

UI tests dùng Edge cài sẵn + Playwright1.64.1, Node22.22.0; Maven JDK21.0.11.
Frontend không có dependency mới. Không gọi network timeout nếu test chỉ route.abort.
CARLA listener2000 không được thấy lúc kiểm read-only; không khởi tạo server/world/actors để “có runtime PASS”.

QA harness iterations: chỉnh verifier Java đọc cùng run2 lần (detail+playback), sửa loader import spans bằng TypeScript AST;
thêm đúng shape3 background feeds mà strict fixture bắt ra. Stale check đọc đúng dd/config,
không nhầm nhãn link “Contract v8” với cấu hình hiện hành. Không sửa physics hoặc bỏ assertions để PASS.
Các build trước retry và Ruff/skip đều được giữ trong logs.


## 13. Remaining Coverage Gaps

- Live HTTP/controller/auth/MySQL persistence, CARLA runtime/physics/calibration và xe thật chưa được kiểm bằng fixtures.
- Full parity1296-case fixture nằm ngoài repo: KinematicParityFullTest skip có điều kiện, không tính PASS.
- Worker Ruff chưa chạy vì Python hiện tại không có module; không cài vào môi trường cá nhân.
- Browser CI chưa provision/khởi động app/browser: mới nối unit vào CI, không tự tuyên bố GitHub job đã chạy.
- Dependency advisory TD62 còn tồn tại dù build retry thành công/audit high-threshold exit0.
- TTL/timeout client cho request không phản hồi chưa có contract; aborted-network test không được gọi là timeout test.
- Legacy fixture fallback read feeds, some real-time waits, malformed nested required DTO không có exhaustive tests.
- TD58/59/60/61/17 vẫn cần việc riêng; không bổ sung classifier/geometry/command/calibration fake trong phase này.
- Các biến đổi numeric không có source lineage/version immutable chưa thể chứng minh historical reproducibility đầy đủ.

## 14. Recommended Phase 20 Final QA Checklist (chỉ đề xuất)

1. Review diff/commit Phase19 thủ công trước khi bắt đầu phase mới; giữ clean chuvv.
2. Chạy CI unit + backend + worker, provision browser riêng nếu đưa browser gate vào CI;
   không dùng test:analysis --browser vào app người khác đang chạy dữ liệu thật.
3. Xử lý dependency advisory qua PR nâng Next riêng, lint/TS/build/Analysis/Admin/audit sau upgrade.
4. Smoke với account/project test cô lập và live API/DB để kiểm mapping/persistence/auth còn thiếu.
5. Nếu có môi trường CARLA riêng: run có seed/variant/xe/AEB/profile rõ, ghi artifact/timestamp/calibration,
   không trộn sensor/controller clock và không gọi mô phỏng là real-world validation.
6. Kiểm CCR scene/metadata TD60, control-vs-applied/provenance TD59, unknown/null/evaluation limits TD58/61.
7. Native keyboard/screen reader/touch, mobile375/390/tablet/desktop và Figma nếu được cung cấp.
8. Lưu commands/counts/skips/limits thực; không tự Accept hoặc thay thuật toán để qua QA.

Chưa thực hiện Phase20 hoặc nâng dependency trong phase này.

## 15. Commit Message và file bàn giao

`test(analysis): strengthen regression coverage and data integrity`.

File production duy nhất: playback/page.tsx; CI/package scripts;8 legacy browser artifact setups;
new runner/helpers,3 new Node suites (API contract/infra/integrity browser), Java producer/gzip fixture,
CP TTC boundary test, tech-debt tracker và báo cáo.
Không commit/push/stage, không sửa main/algorithm/DB/Admin/Workspace.
App test riêng port3131 đã dừng. Dừng Phase19 để người dùng review/commit/push thủ công;
không tự chuyển Phase20.
