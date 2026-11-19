# Phase 16 — Telemetry charts và timeline

Git ban đầu: chuvv sạch, HEAD 2301898 (Phase15 đã commit). Chỉ frontend/chart, tests và báo cáo; không commit/push.

## Bằng chứng và phạm vi

- P1: TelemetryChart và MotionTelemetryChart tự lấy max timestamp; plot bounds 62–644 và 62–680 khác nhau. Cursor cùng t chưa cùng trục.
- P1: Cả hai chỉ ngắt null/invalid/nonmonotonic, vẫn nối hai mẫu finite dù khoảng thời gian dài. API inspection.run.dt là cấu hình danh định, không phải actual cadence; Playback không có dt.
- P1: speed/TTC âm vẫn vẽ trong khi core speed là magnitude nonnegative và formatter Phase13 loại số âm. Giữ signed acceleration/jerk/target_vy.
- P2: Motion chart dựng toàn bộ geometry và quét nearest O(n) mỗi hover; legend chưa lọc markers như SVG; nhãn mobile bị thu nhỏ.
- Chưa có canonical pedal/force/physical-onset series; không thêm brake chart hoặc marker suy đoán. Sensor CSV có t0 riêng, không ghép clock.

## Kế hoạch

1. Audit pipeline/core/adapter/storage/API/charts, inventory nguồn/đơn vị/thời gian và baseline browser fixture.
2. Helper chart nhỏ: chuẩn bị segments/index, gap policy có chú thích, nearest lookup, giá trị hợp lệ theo signal; memo geometry. Không sửa raw hoặc tính metric.
3. Dùng chung time end/plot bounds trong Detail; Playback theo duration API. Hiện nearest timestamp rõ, keyboard timeline hiện hành và pointer dùng cùng cursor thời gian; nguồn marker, vùng chart cuộn riêng trên mobile.
4. Tests production helper, fixtures missing/partial/irregular/duplicates/negative/large, responsive375/390/768/1024/1440, keyboard/timestamp/context và Analysis regression.
5. Lint, TS, build, offline projection tests; chuyển completed với kết quả thực và giới hạn, dừng Phase16.

Chính sách ngắt đường là **hiển thị bảo thủ**, không suy ra packet loss: ngắt nếu delta >1,5×dt danh định +0,001 s (độ phân giải timestamp canonical); thiếu dt chỉ vẽ mẫu rời. Không gán t=index×dt, không đổi timestamp, không downsample/smooth.

## 1. Tài liệu và pipeline đã đối chiếu

Đã đọc AGENTS.md, frontend/AGENTS.md, CLAUDE.md, DESIGN.md, rename guide/mục7 naming,
Next accessibility guide đang cài, architecture, analysis-metrics-contract, ADR040/042/050/051,
reports Phase11/12/14/15 và plan Phase13 hiện có. Không có completed report riêng Phase13; không sửa lịch sử phase đó.
Ưu tiên code Java hiện hành thay các tên kiến trúc Python cũ trong tài liệu.

Các đường dẫn Java bên dưới bắt đầu từ src/main/java/com/vsos/; UI bắt đầu frontend/src/components/.

| Chặng | File/function production | Input → output / transformations | Thời gian, missing và giới hạn |
|---|---|---|---|
| Kinematic | core/simulation/Simulator.makeFrame:51, Simulator.run; LeadVehicleSimulator | AebStack/integration → Frame(t,ego_x,ego_v,ego_a,ped_x,ped_y,ped_vy,perceived_y,ttc,ttc_gt,detected,confidence,fcw,aeb) | Simulation-relative t giây; configured dt; makeFrame round3; nullable TTC |
| CARLA adapter | worker/vehicsim_aeb_control.py:run_step | Actor/target loc+velocity/hit → bridge.step; Java decel_cmd/pedal → apply_control | round(GameTime.get_time−started_at,3); ScenarioRunner sở hữu tick; không HTTP/frontend clock |
| Core CARLA | core/simulation/CarlaSession.step:256/leadStep; core/aeb/DecelMeter | Run-local coordinates, nonnegative projected ego speed, processed signed accel, AebStack → cùng Frame/events | Bỏ t≤last; actual observation t khác nominal profile dt; accel không raw IMU |
| Events | core/aeb/AebStack.Events.record:236; Simulator/CarlaSession | Recorded detection/FCW/decision/command/TTC/collision/stopped → events[].kind/t | t round3; command không chứng minh force/applied/physical onset |
| Evaluation/storage | core/evaluation/Evaluation; backend/service/simulation/RunService:1043–1063 | Scalar evaluation/metrics → simulation_runs; frames/events/metrics/case/params/chain → telemetry_json | Không rescore frontend; raw source/build/formula lineage chưa đủ TD59 |
| Inspection API | backend/service/analysis/AnalysisService.item; AnalysisViewService.failureDetail:480/498–561 | frames → telemetry.t/ttc/speed_kmh (ego_v×3,6 round2), motion projection, scalar/config | Loại row thiếu/nonfinite t, không báo số đã bỏ; inspection.run.dt là config run |
| Motion projection | core/simulation/RecordedTelemetry.project | SI field map; jerk=(a−lastA)/(t−lastT) khi t tăng/a đủ; crossing=max(0,crossingX−egoX) | Original order; invalid numeric→null; thiếu t bỏ row/reset derivative; không GT fallback |
| Playback API | AnalysisViewService.playback:648–672 | Raw frames/events + motion projection; duration_s=last raw t, else stored duration | Response không dt/cadence; frontend validates/sorts lookup frame/event riêng |
| Chart UI | analysisRunData; AnalysisRunTelemetry; TelemetryChart; MotionTelemetryChart; playback route | Raw API → display segments + separate sorted nearest index → memo SVG | Actual seconds; không index×dt hoặc đổi timestamp; không metric math |
| Sensor riêng | worker/sensor_recorder.py:261/329–357; TelemetryMetricsService.parseCsv/summarise | wait_for_tick/IMU/radar/control → CSV/collisions → SENSOR_RECOMPUTED summary | CSV sim_time_s=snapshot time−first recorder frame; t0 khác controller; smoothing/warmup/collision window riêng |
| CARLA screen | CarlaRunnerPanel | Summary/artifacts + camera filename list → scalar/image index slider | Chọn ảnh theo index, không simulation-time chart; chưa verified clock mapping |

Nguồn canonical kinematic và CARLA dùng cùng schema nhưng không được ghép khác run/engine.
Không thay backend/core/worker/schema/classifier/calibration trong phase này.

## 2. Signal inventory

K/C = recorded canonical kinematic/CARLA frame t; M = projection cùng t; CSV = recorder clock riêng.
Nominal kinematic thường0,05s; CARLA xosc5 nominal0,01s; UI luôn dùng actual timestamp.
Sampling của sensor không được đồng nhất với canonical chỉ vì cùng simulator.

| Signal / loại | Source field | Unit | Sampling / timestamp | Chart/UI | Limitations |
|---|---|---|---|---|---|
| Ego speed / simulated GT | Frame.ego_v → telemetry.speed_kmh, motion.ego_speed_mps | m/s; km/h | K/C/M t | Combined, Motion, playback | Nonnegative magnitude, không relative speed; API km/h đã convert |
| Relative speed | Không canonical target_vx; CSV radar_rel_velocity_ms | m/s | CSV sensor frame/time | Không canonical chart | Radial velocity âm khi closing, không đầy đủ ego−target longitudinal |
| Signed longitudinal accel | Frame.ego_a → motion.ego_accel_mps2 | m/s² | K/C/M t | Motion default/facts | CARLA processed speed difference/DecelMeter, không raw IMU |
| Max/mean decel / aggregate | metrics.max_deceleration_mps2 / mean_deceleration_mps2 | m/s² | Scalar/run | Summary/Evidence | Magnitude, không dựng series từ max hoặc đảo dấu accel |
| Decel demand / command | CarlaSession.Tick.decelCmd → bridge.decel_cmd | m/s² | Runtime bridge tick | Không persisted chart | Demand không phải force/applied acceleration; TD59 |
| Pedal/control command | bridge.pedal → VehicleControl.brake; CSV.brake | Ratio0–1 | Runtime/CSV riêng | Không canonical series endpoint | Không tạo brake percentage/step chart khi API chưa có series |
| Brake physically applied | Không có canonical force/actuator onset field | — | — | Không marker/chart | brake_onset_t là đầu lệnh, không actual application time |
| TTC perceived | Frame.ttc → telemetry.ttc / motion.ttc_perceived_s | s | K/C/M t | Combined/Motion | Nullable theo detect/path/closing; không summary→series hay GT fallback |
| TTC GT | Frame.ttc_gt → motion.ttc_gt_s | s | K/C/M t | Motion | CP/CCR khác geometry/closing; không thay perception |
| TTC min / aggregate | metrics.min_ttc_s | s | Scalar/run | Summary/Phase15 | Không API time-of-min; không gán timestamp giả |
| Threshold / config | detail.ttc_threshold_s từ AEB params | s | Run config | Combined line | Chỉ finite nonnegative từ API, không threshold mới |
| Ego X / coordinate | Frame.ego_x → motion.ego_x_m | m | K/C/M t | Motion/scene | Run-local, không absolute map distance |
| Target X/Y | Frame.ped_x/ped_y → motion.target_x_m/target_y_m | m | K/C/M t | Y selectable; X có trong API | CCR ped_x mapping target rear; scene geometry còn TD60 |
| Target Y velocity | Frame.ped_vy → motion.target_vy_mps | m/s | K/C/M t | Motion | Signed lateral component, không speed magnitude/target longitudinal |
| Perceived Y | Frame.perceived_y → motion.perceived_y_m | m | K/C/M t | Motion/scene | Perception result, nullable; không mặc định real sensor |
| Distance tới vạch / derived | motion.crossing_distance_m từ crossing_x−ego_x | m | M t | Motion/facts | Backend max(0,...); không radar range/box gap; frontend không tính lại |
| Minimum separation / aggregate | metrics.min_distance_m | m | Scalar/run | Summary/Phase15 | GT geometry CP/CCR; không series; value0 không tự collision |
| Jerk / derived | motion.jerk_mps3 từ ego_a và actual Δt | m/s³ | M t, cần valid pair | Motion | Signed/unfiltered; không RMS canonical theo nominal dt |
| Flags/confidence | Frame.detected/confidence/fcw/aeb | Bool; score | K/C t | Playback/Evidence | aeb là decision latch, không applied brake; confidence không calibrated probability |
| Collision/stop | events[kind=collision/stopped].t | s; categorical | Recorded event t | Marker/log/state | Không infer từ speed0/impact/min-distance |
| Sensor-only signals | imu_accel_x_ms2, imu_jerk_ms3, radar_depth_m, radar_ttc_s, obstacle_distance_m | SI | CSV time domain | Summary, không Analysis series endpoint | Reference/filter/window khác; không overlay canonical |

## 3. Timestamp mapping và data quality

- Canonical t/events[].t là giây tương đối simulation, không epoch ms. Round3 upstream được giữ, không round thêm trước lookup.
- CARLA GameTime−controller start và CSV snapshot−first recorder frame có hai t0 khác nhau; chưa có mapping xác minh.
- Fetch arrival time/navigation time không làm trục. RAF wallclock chỉ chạy playhead/rate hiện hành, không tạo samples.
- Detail dùng [0,max(valid t của telemetry ∪ motion)] và L62/R644 cho cả hai chart. Slider vẫn recorded min/max.
  Nguồn bắt đầu muộn để trống trước first sample; không dịch về0.
- Playback dùng [0,duration_s] đã validate, loại samples ngoài duration. Positive duration nhỏ giữ nguyên;
  duration0 có đệm trục0,01s để SVG không chia0, source vẫn chỉ t≤0.
- Paths giữ original order; null/invalid magnitude/time và trùng/lùi đều ngắt. Nearest index sort riêng, không mutate raw.
- Gap policy delta≤1,5×dt danh định+0,001s: 0,001 theo độ phân giải canonical; 1,5 là display policy,
  **không** observed frequency/packet-loss detector. Irregular intervals trong policy giữ actual t.
- Không dt hoặc dt invalid/nonpositive: chỉ vẽ mẫu rời, có lý do. Playback không đoán cadence từ profile string/global/median.
  Detail chỉ dùng dt khi inspection.run_id khớp detail.run_id.
- Backend đã bỏ invalid-time rows trước API thì UI không kiểm đếm đủ mất mẫu; thiếu frame counters/loss map.
  Samples không có riêng run_id nên không phát hiện được backend trộn trace bằng timestamp/tọa độ đơn thuần.
- Magnitude speed/TTC/crossing distance âm/nonfinite không vẽ và có invalid count, không clamp về0;
  signed accel/jerk/target_vy/coordinates giữ dấu. Zero có thật vẫn hiển thị, missing vẫn —.

## 4. Findings có bằng chứng và trước/sau

| Mức | Trước / vị trí | Sau |
|---|---|---|
| P1 | TelemetryChart tự tMax và R644; Motion tự tMax và R680 | Chung domain/bounds; cùng t có cùng cursor/hover/marker x |
| P1 | Hai chart chỉ ngắt null/nonmonotonic, nối finite samples cách xa | Nominal gap policy có chú thích; không dt vẽ rời; không giả khẳng định phát hiện mọi mất mẫu |
| P1 | Negative speed/TTC plotted trong khi Phase13 readout — và core speed nonnegative | Exclude khỏi chart, quality counts/raw preserved; không abs/clamp; signed signals giữ nguyên |
| P2 | Motion filter/map/segment/reduce mỗi hover | Memo source preparation/static SVG; binary nearest, memo floor facts khi hover |
| P2 | Motion nearest không giải thích, khác timeline floor | Shared hover t, explicit nearest/actual sample t/earlier tie/no interpolation/source |
| P2 | Motion legend map tất cả markers nhưng SVG filter | Một valid in-domain set cho line/legend, thêm field nguồn |
| P2 | SVG11px scale rất nhỏ375/390, Motion h256 letterbox | Min-width706 + local scroll/focus, physical text≥11px, no fixed-height letterbox/page overflow |
| P2 | TTC/speed phân biệt chủ yếu bằng màu | TTC solid / speed dashed + labels/units/separate axes/text readout |

Giữ nguyên metrics, classifier/thresholds/permissions/fetching, CSV summaries, event identities,
Detail tabs/Evidence/returnTo/signal/t, playback controls/rates/layers/scene, Admin và tokens chung.
Không dependency, filter/smoothing/downsampling hoặc brake/relative-speed series giả.

## 5. Synchronization và event sources

Selected cursor dùng native timeline: Arrow/Home/End/touch, URL giữ t/signal/returnTo; không refetch.
Hover là tạm thời dùng actual SVG coordinate→simulation seconds, chia sẻ hai chart Detail, không write URL/API.
Nearest tooltip giữ timestamp gốc, hòa chọn mốc trước, ngoài [first,last] nguồn → unavailable.
Sample có value missing vẫn chọn missing, không nhảy sang finite sample khác. Duplicate được cảnh báo, không merge/average.

Facts/timeline vẫn last-recorded-at-or-before, hiển thị sample t riêng và note có thể cũ trong gap;
đây khác nearest chart tooltip. Playback frame lookup vẫn floor/binary, motion fact match exact frame.t.
Playback chart end/cursor theo duration/t, hover tạm thời không pause/seek. Không có zoom/time-pan/range-selection trước phase,
không thêm framework mới. Horizontal scroll chỉ vùng SVG, không đổi time domain.

| Marker | Nguồn | Ý nghĩa |
|---|---|---|
| Phát hiện | metrics.first_detection_t / DB first_detection_time_s | Detection recorded, không hazard onset |
| Cảnh báo FCW | metrics.fcw_t / DB fcw_time_s | Warning do core ghi |
| Quyết định AEB | metrics.aeb_activation_t / DB aeb_activation_time_s | Decision, không applied force |
| Bắt đầu lệnh phanh | metrics.brake_onset_t / raw metrics | Command onset, không physical response |
| Mốc TTC từ backend | events[kind=ttc_below].t | Không tự threshold→event |
| Va chạm | events[kind=collision].t | Recorded hit; dot chỉ exact speed sample, không interpolate |
| Dừng | events[kind=stopped].t | Recorded stopped, không speed0 inference |
| Playback khác | events[kind=...].t | Giữ identity/label; gt_start/gt_stop không đổi thành hazard |

Finite nonnegative timestamps trong domain mới hiển thị. Event có clock timestamp riêng nên không bắt buộc exact sample;
chỉ collision speed dot yêu cầu exact sample. Không có canonical force/applied-brake/decel-onset/hazard-onset source
đủ tin cậy để tự thêm marker. Marker không là kết luận nguyên nhân lỗi.

## 6. File thay đổi

Component root frontend/src/components/; ui dưới đây là analysis/.

| File | Mục đích |
|---|---|
| TelemetryChart.tsx | Common axis, prepared magnitude data, dashed speed, source/time readouts, quality/scroll, memo exact collision sample |
| MotionTelemetryChart.tsx | Common domain/hover, signed-vs-magnitude guard, explicit nearest, memo geometry, responsive dropdown/SVG |
| ui/telemetryChartData.ts (mới) | Segments/quality/gap policy/separate sorted index/binary nearest; không metric math |
| ui/TelemetryChartParts.tsx (mới) | Memo SVG, batch isolated dots, marker/source legend, quality notes/pointer mapping |
| ui/TelemetryChart.module.css (mới) | Scoped scroll/focus/text/token styles; không global overrides |
| ui/AnalysisRunTelemetry.tsx | Shared end/hover/nominal step, memo floor readouts và stale-frame note |
| ui/analysisRunData.ts | Marker source fields; giữ timestamp/rules Phase15 |
| app/analysis/failures/[runId]/page.tsx | Matching-run dt/key; không endpoint mới |
| app/analysis/failures/[runId]/playback/page.tsx | Chart end=duration, run key/event sources; không đoán dt |
| frontend/tests/analysis-telemetry.mjs (mới) | 6 nhóm production-helper tests/20k/invalid-time barrier/small duration |
| frontend/tests/analysis-telemetry-ui.mjs (mới) | Login fixtures,5 widths,keyboard/shared hover/quality/events/20k |
| frontend/tests/analysis-redesign.mjs | Stronger actual-gap/invalid-speed guards; scoped marker selector theo source legend |
| docs/exec-plans/tech-debt-tracker.md | TD61 ghi rõ thiếu cadence/frame-counter/clock mapping; không sửa backend ngoài phạm vi |
| Báo cáo này | Plan→completed, inventory/clock map/validation/limits |

API contract/data/schema/migration không đổi. Không stage/commit/push/main.

## 7. Performance và ảnh QA

Artifact gitignored: data/analysis-phase16-2026-11-16/. Next production127.0.0.1:3128, Edge headless.
Đăng nhập form thực bằng API interception/.invalid actor; không tài khoản thật/backend/DB/CARLA.
5 ảnh before,8 after (5 viewport,duplicates,Playback missing dt,20k). Đã xem375 before/after và final1440/768/Playback.
Playback fixture tập trung chart, thiếu scene dimensions ở top-level nên scene hiển thị placeholder đúng; full Analysis suite
có fixture scene đầy đủ. Không lấy ảnh fixture làm chứng cứ run CARLA thật.

Preparation/index theo source/field/domain/dt; geometry memo giữ mounted qua hover/playhead ticks.
Nearest O(log n), index sort riêng O(n log n) upper bound; floor facts O(n) khi cursor đổi, memo khi chỉ hover.
>1000 isolated samples batch vào một SVG path chứa từng dot, không giảm mẫu/extrema hoặc thay frequency.
Browser asserts đủ20k polyline points/dots và raw stored metrics không thay đổi.

| Samples fixture | Navigation→chart ready | Pointer mean/max,10 moves | JS heap snapshot |
|---|---|---|---|
| 200 | 264ms | 6,8 / 7ms | 38,0MB |
| 2.000 | 240ms | 6,5 / 9ms | 58,2MB |
| 20.000 | 467ms | 7,2 / 12ms | 90,5MB |

Số đo từ after/result.json final, trước khi chạy browser suites khác. Includes navigation/IPC/Playwright overhead;
đợi tọa độ hover mới ở cả hai chart, không chỉ đếm marker cũ. Heap không RSS và không chứng minh no-memory-leak.
Không có benchmark trước sửa tương ứng để khẳng định % tăng tốc hoặc SLO.
Large traces là stress fixture; API trả saved arrays không explicit limit, không khẳng định có production CARLA20k run.
Playback scene/path còn tính theo frames/t mỗi RAF; chưa đo animation20k/60fps hoặc long-running memory/thiết bị yếu.

## 8. Regression tests và kết quả thực thi

| Kiểm tra | Kết quả |
|---|---|
| Git ban đầu | chuvv sạch; Phase15 commit2301898 |
| npm.cmd run lint | PASS exit0 trên production/test code; lint-final.log; targeted harness lint sau assertion cuối cũng exit0 (lint-harness-final.log) |
| npx.cmd tsc --noEmit | PASS exit0, final build; types-final.log |
| npm.cmd run build | PASS exit0; build-final.log |
| node --test 4 scripts Analysis | PASS24 nhóm =6 telemetry+18 metric/classification/explainability; unit-final.log |
| node tests/analysis-telemetry-ui.mjs | PASS exit0 final build,5 widths,8 ảnh,0 page errors/0 API writes; telemetry-ui-final.log + after/result.json |
| node tests/analysis-redesign.mjs | PASS exit0 final build, toàn bộ Analysis/Detail/Evidence/Playback/errors/roles/context/menu; analysis-regression-final.log |
| node tests/analysis-metrics-ui.mjs | PASS exit0, formatting/source/signed tiny/null/CSV fixtures; metrics-ui-final.log |
| node tests/analysis-explainability-ui.mjs | PASS exit0, source/formula/native disclosures/context; explainability-ui-final.log |
| Maven nhóm contracts dưới | PASS70 tests,0 failures/errors/skips; java-contracts.log |
| RepoDocsTest | PASS5 tests,0 failure/error/skip sau chuyển completed; docs-check.log |
| git diff --check + file mới/conflict markers | PASS; kiểm cả13 file code/test/report + tracker, không chỉ tracked diff |

Unit command: node --test tests/analysis-telemetry.mjs tests/analysis-metric-format.mjs tests/analysis-classification.mjs tests/analysis-explainability.mjs

Java command: .\mvnw.cmd -B '-Dtest=AnalysisSnapshotTest,CarlaSessionLogicTest,MetricExplanationContractTest,TelemetryMetricsServiceTest,SimulatorBehaviorTest,LeadVehicleSimulatorTest,AnalysisMetricsTest' test
(MAVEN_OPTS=-Xmx512m -XX:ActiveProcessorCount=2). Đây là offline contracts, không backend integration.

Unit coverage: actual/irregular time, gaps/no dt, invalid/duplicate/backward time, null/NaN/Inf/zero/tiny/signed,
negative magnitudes, nearest/tie/no extrapolation, shorter sources,20k/extrema/immutability.
Added assertion lookup vẫn đúng khi timestamp đảo sau invalid-time barrier; sort lookup không sort paths.
Browser additionally verifies exact-only collision dot, no event inference/source/domain, shared hover/cursor,
keyboard ArrowRight thực sự cuộn vùng/focus/timeline, zero-duration marker bounds, URL context, empty/partial/duplicates/large traces. Native touch/screen reader chưa kiểm thực.

Lần hover harness đầu timeout vì SVG ngoài viewport; sửa scrollIntoView và chờ đúng tọa độ, không bỏ assertions.
Full suite đầu timeout selector exact whole-text marker sau khi legend có source; selector mới scoped named legend
vẫn kiểm absence/presence backend event. Gap assertions cập nhật do bugfix đã chứng minh: sparse0,5s với dt0,01
phải rời, negative speed bị exclude/cảnh báo; không thay expected metric hoặc bỏ checks.

## 9. Giới hạn và điểm dừng

Không live backend integration/MySQL/Redis, không CARLA/ScenarioRunner/physics/calibration runtime.
Không Figma truy cập được để đối chiếu; không screen reader thật, Safari/Firefox/native touch.
Unit/browser fixtures chứng minh mapping/render/interaction, không chứng nhận automotive safety.

- TD59: source/build/formula/calibration lineage và canonical command/pedal/target-v còn thiếu.
- TD61: cần observed cadence/frame counters/loss map và mapping controller/recorder t0 trước khi chứng minh mọi missing interval
  hoặc ghép radar/IMU/camera. Hiện gap policy bảo thủ, có thể ngắt irregular interval hợp lệ; không bảo đảm phát hiện mọi mất mẫu.
- Chưa timestamp minima/applied physical response/hazard evidence nên không thêm marker suy đoán.
- TD17 low-speed/friction/other-car calibration, TD58 evaluator, TD60 CCR scene và TD54 related identity giữ nguyên.
- Chưa benchmark full20k playback animation/long-running memory; không claim60fps toàn module.

Dừng Phase16 để review/commit thủ công, không Phase17.
Commit đề xuất: fix(analysis): improve telemetry charts and timeline synchronization.
