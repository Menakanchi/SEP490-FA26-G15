# Phase 17 — Playback và đồng bộ telemetry

Ban đầu: chuvv sạch, HEAD0f3e080 (Phase16 đã commit). Chỉ frontend playback, tests và báo cáo; không commit/push.

## Findings từ code

| Capability | Current implementation | Issue | Severity | Fix |
|---|---|---|---|---|
| Data | API runs/{id}/playback, saved frames/events + motion projection | Không video/3D; clock sensor riêng TD61 | Limitation | Giữ source, không dựng engine |
| Restart | End → setT(0) | Frame đầu có thể t>0 | P1 | Quay first valid frame, giữ rate/context |
| Play | enabled=valid duration+frames.length | Một timestamp/duplicate-only vẫn Play | P1 | Inspect riêng, chỉ animate ≥2 distinct times |
| Clock | RAF elapsed×rate, cleanup effect | Không visibility handler, resume có thể nhảy thời gian; nested state update ở end | P1 | Pure clock reducer, key guard, pause khi hidden, một RAF loop cleanup |
| Seek/frame | Floor binary với epsilon1e-6; native step0,01 | Có thể chọn future frame sát boundary; event millisecond không truy cập đủ | P1 | Exact floor, step any, clamp domain, actual sample/age rõ |
| Events | Previous/next dùng ±0,001 | Bỏ mốc cách đúng1ms | P1 | Strict recorded timestamp comparison; không infer discrete events |
| Quality | Invalid t excluded/sorted; motion.find first | Chưa cảnh báo trùng/lùi, duplicate frame/projection join không chắc | P2 | Diagnostics; không gắn projection mơ hồ |
| Performance | Filter/map path và find motion mỗi RAF | Repeated whole-trace work khi frame chưa đổi | P2 | Prepared data/index, path memo theo recorded index; không downsample |

## Kế hoạch

1. Truy vết source/route/time contract và baseline browser.
2. Chuẩn hóa clock/time helpers và controls tối thiểu; giữ layout, Scene geometry, Phase16 chart domain.
3. Unit production helpers/reducer và browser fixtures: play/pause/restart/rate/seek/hidden/races/run switch/cleanup/events/data quality.
4. Lint, TS, build, full Analysis+Phase16 regressions; five viewport, keyboard, large traces và ảnh.
5. Báo cáo capability/state/source/performance/limits; chuyển completed, dừng Phase17.

Không CARLA/AEB/metric/classifier/schema/Admin/backend execution changes. Không map clock CSV/camera thiếu evidence.

## 1. Kiến trúc và nguồn thời gian

Đối chiếu AGENTS/CLAUDE/DESIGN, frontend guides/Next accessibility guide đang cài, rename guide/mục7 naming,
architecture/analysis-metrics-contract, ADR040/042/050/051 và các kết quả Phase11–16.
Phase13 hiện có plan, không có completed report riêng; không sửa lịch sử phase đó.

Route /analysis/failures/[runId]/playback → page.tsx → PlaybackScene/PlaybackFacts,
PlaybackTimeline/PlaybackEvents và MotionTelemetryChart. Đây là **2D recorded-data playback**, không video,
không CARLA3D replay và không simulation engine mới.

| Nguồn/điểm nối | Dữ liệu và semantics |
|---|---|
| frontend/src/services/vehicsim.ts:playback | GET /api/v1/vehicsim/runs/{id}/playback; không tải snapshot dataset để dựng trace khác |
| backend/service/analysis/AnalysisViewService.playback:648–672 | RunBundle saved telemetry_json → raw frames/events + RecordedTelemetry.project; header/run context/scene dimensions |
| core/simulation/Frame + Simulator.makeFrame | Recorded t/ego_x/ego_v/ego_a/ped_x/ped_y/ped_vy/perceived_y/TTC/flags; t round3 ở core |
| worker/vehicsim_aeb_control.py:run_step | CARLA GameTime−started_at, round3 → Java bridge; ScenarioRunner sở hữu tick |
| core/simulation/CarlaSession.step | Actual observation t; repeated/backward ticks bị bỏ; processed acceleration không raw IMU |
| core/simulation/RecordedTelemetry.project | Motion SI projection + actual-Δt jerk, không canonical RMS objective |
| duration_s | API lấy last raw frame.t, else stored simulated duration; frontend chỉ validate, không frames.length×dt |
| events[].t | Recorded simulation-relative seconds; không browser clock hoặc inferred time |
| Browser RAF | now−previous /1000 × selected rate chỉ tăng playhead; không sinh frame/position/brake/collision |
| Sensor/camera | CSV snapshot−first recorder frame có t0 khác controller; camera index không simulation timestamp. Không ghép clock TD61 |

Các đường dẫn Java bên trên bắt đầu src/main/java/com/vsos/.
Không backend/API contract/schema/data migration hoặc core/worker changes trong phase này.

## 2. Vấn đề đã xác nhận và hành vi trước/sau

| ID/mức | Bằng chứng trước sửa | Sau sửa |
|---|---|---|
| P17-01/P1 | route onPlayPause end→setT(0), không xét first frame | Play tại cuối hoặc trước first sample quay first validated frame timestamp; nút Về khung đầu seek/pause, giữ rate/context |
| P17-02/P1 | enabled chỉ cần frames.length>0 | ≥2 distinct validated timestamps mới animate; one/duplicate-only/zero-duration vẫn inspect được nhưng Play disabled |
| P17-03/P1 | Không visibilitychange; RAF prev có thể cũ khi tab bị throttle | Pause khi document.hidden, reset effect-local baseline; visible lại vẫn paused, user chủ động tiếp tục |
| P17-04/P1 | setPlaying trong functional setT khi đến cuối; nhiều state setters | Pure clock reducer, clamp/stop ở end, key guard stale callbacks, một cleanup RAF effect |
| P17-05/P1 | frameAt/currentEvent/frameStatus dùng epsilon1e-6 | Exact upper-bound/floor, không chọn future frame hoặc collision/stop sớm; không round trước lookup |
| P17-06/P1 | Next/prev event dùng time±0,001; slider step0,01 | Strict timestamp navigation, step any; event1,201 sau1,200 truy cập được; controls/log hiển thị3 decimals qua formatter Phase13 |
| P17-07/P2 | motion.find first timestamp trong khi floor chọn last duplicate frame | Ambiguous frame/projection timestamps không join như unique measurement; facts để —; đếm duplicate/backward |
| P17-08/P2 | Filter/map whole path và find motion mỗi RAF | Prepared path/map; prefix memo theo recorded frameIndex; exact projection Map; current event binary lookup |
| P17-09/P2 | Filter bỏ missing coordinate rồi nối trajectory qua phần thiếu; placeholder height khác360px canvas | Không nối trajectory nếu trace có invalid/duplicate/backward t hoặc thiếu coordinate; raw giữ nguyên. Fixed scene viewport360px giữ control y ổn định khi frame không đủ tọa độ |
| P17-10/P2 | Event world-X lấy floor frame như vị trí tại event | Chỉ đánh vị trí event khi có exact frame.t; timeline marker vẫn actual event time, không invent coordinate |

Không đổi classifier, metrics, thresholds, source identity, scene CP/CCR geometry, Admin hoặc shared tokens.
Giữ event identity, layer toggles, signal/rate/returnTo context, error/retry và Phase16 chart preparation.

## 3. State/time model

Clock data: key(runId:refresh), time, start(first validated sample), end(API duration), canPlay,
playing, speed, backgroundPaused. Không thêm state-machine dependency.

| Trạng thái | Nguồn trạng thái/UI |
|---|---|
| Idle | Clock chưa load; không render data từ key cũ |
| Loading | Request key mới chưa có result; loader, data cũ ẩn; loop cũ cleanup |
| Ready/Paused | Load luôn playing=false; timestamp query hoặc recorded decision/end như UX trước; không autoplay |
| Playing | Explicit toggle và canPlay; một RAF effect tiến triển bằng elapsed seconds |
| Ended | time=end và không playing; nhãn Cuối dữ liệu đã ghi; Play lại từ start |
| Error | Invalid route/API error; không controls/scene cũ; retry tạo key mới |
| No data | Invalid duration/no frames: unavailable. Một timestamp: inspect-only, không animate |

Reducer load kiểm rate0,25/0,5/1/2, finite duration/time; dữ liệu không hợp lệ không tự thành animation.
Seek clamp [0,API duration], pause, không đổi source; domain vẫn simulation-relative origin0.
Nếu first frame bắt đầu1s, người dùng vẫn có thể inspect event/gap trước1s và thấy chưa có frame;
Restart/Play từ đầu dùng1s, không dịch toàn bộ timeline về0.
Pause giữ last committed playhead; seek/rate không tạo thêm loop. Rate đổi không đổi timestamps dữ liệu.
Double-click/rapid clicks là ordered reducer transitions; stale tick/seek key cũ bị bỏ.

RAF cleanup khi pause/rate change/run switch/unmount; effect-local previous khởi tạo null,
không dùng old browser baseline để catch-up khi visible lại. Visibility handler cleanup cùng source.
URL chỉ lưu paused positions; rate/signal có handler riêng. Không history write mỗi RAF hoặc API reload khi thao tác controls.
Existing API promise active guard giữ response run trước khỏi ghi đè run hiện tại.

## 4. Chọn frame, gap và projection

Playback chọn **last recorded timestamp≤cursor**, exact binary upper bound. Không nội suy vị trí hoặc discrete state.
Trước first sample: frame=null. Duplicate time: stable recorded order, chọn bản ghi sau cùng và cảnh báo.
Lookup sort trên bản sao đã lọc, không mutate original frames/events. Null row/NaN/Infinity/missing/negative/out-of-domain time bị loại và đếm.

Giữa hai mẫu: hiển thị actual frame timestamp, current cursor và tuổi khung. Ví dụ cursor2,500s,
frames1/1,2/2,75/3 → frame1,2s, cách1,300s; không biến thành frame2,5s.
Đây là khoảng chưa có exact sample, không tự gọi là packet loss vì API chưa có loss/cadence evidence.
Late/truncated trace có thể giữ last frame tới API duration, nhưng age/cursor nói rõ source cũ; không tạo tail frames.

Projection chỉ exact frame.t và unique timestamp trong cả hai source. Nếu frame hoặc projection trùng timestamp,
không tự chọn một derived value rồi ghép sang frame khác. Missing measurement vẫn —, zero vẫn0.
Path prefix chỉ các recorded frames đến selected index, memo giữ nguyên khi cursor đổi mà frame chưa đổi.
Đường nối là guide giữa tọa độ đã ghi, không update vị trí bằng interpolation; trace lỗi/thiếu coordinate không vẽ đường nối.
Raw point/time/metric arrays không bị bỏ vì tối ưu hoặc làm đẹp cảnh.

## 5. Đồng bộ chart và event

MotionTelemetryChart vẫn dùng API duration/timeEnd và cursor=t từ clock này. Pause/seek/play cùng domain;
không index→time conversion, không downsampling mới hoặc hai chiều update loop.
Chart hover là tạm thời, không seek/pause playback. Native timeline/event buttons là điều khiển seek.

Phân biệt hai lookup policies được ghi rõ: Playback facts/cảnh dùng previous sample;
tooltip chart Phase16 dùng nearest (earlier tie), hiển thị actual sample t/source và no extrapolation.
Chúng chia sẻ cursor time, không giả rằng mọi signal có sample đúng cursor hoặc cùng array index.
Run key/request guard ngăn chart/source của run cũ xuất hiện sau navigation.

| Event | Source / meaning |
|---|---|
| Detection/FCW | Recorded events[].t/flags, không hazard onset |
| AEB decision | events[kind=aeb_decision].t hoặc recorded aeb latch; không brake applied |
| Bắt đầu lệnh phanh | events[kind=brake_onset].t; command, không actual force/deceleration |
| Collision/stopped | Chỉ recorded event, exact time threshold; không infer từ speed0/TTC0/impact scalar |
| gt_start/gt_stop/custom | Giữ recorded label/kind/id; không đổi GT start thành hazard |

Timeline groups nearby events nhưng journal giữ từng identity; next/prev chuyển timestamp nghiêm ngặt,
same-time events vẫn có từng journal button. Marker/journal title cung cấp events[kind=...].t và actual time.
Hazard/applied-force/deceleration-onset chưa có source hợp lệ nên không tạo marker.
Event time không phải có exact position; thiếu exact coordinate thì không dựng world-X marker.

## 6. Files thay đổi

Component root frontend/src/components/analysis/.

| File | Lý do |
|---|---|
| playbackClockData.ts (mới) | Pure reducer/rate guard/keyed transitions và exact floor index; không physical calculation |
| frontend/src/app/analysis/failures/[runId]/playback/page.tsx | Clock integration/visibility/cleanup, prepared lookup/path/projection, source quality, exact event position |
| playbackPresentation.ts | Timestamp diagnostics/canPlay, null-row validation, giữ raw identity, bỏ early-event epsilon |
| AnalysisPlaybackTimeline.tsx | Về khung đầu, Play gating, trạng thái/age, strict event seek, step any/3-decimal display/source titles |
| AnalysisPlaybackScene.tsx | Không nối qua trace lỗi; no-interpolation note, scene viewport; không sửa geometry |
| AnalysisPlayback.module.css | Giữ360px cho valid/placeholder; reserve clock status height, scoped CSS |
| frontend/tests/analysis-playback.mjs (mới) | 9 nhóm production reducer/time/source tests,20k và no premature events |
| frontend/tests/analysis-playback-ui.mjs (mới) | Login fixture,5 widths, state/races/visibility/source/large trace/cleanup/keyboard |
| frontend/tests/analysis-redesign.mjs | Event selector assertions cập nhật3-decimal timestamp, giữ expected raw values/behaviors |
| docs/exec-plans/tech-debt-tracker.md | Bổ sung bằng chứng annotation mobile vào TD60, không mở rộng shared scene trong phase này |
| Báo cáo này | Plan→completed, capability/source/state/QA/limitations |

Không stage/commit/push, không main, không Phase18. Backend/API/data/schema/migration không đổi.

## 7. Browser QA và performance

Artifact gitignored: data/analysis-phase17-2026-11-16/.
Next production127.0.0.1:3129, Edge headless; login form thực với API interception và actor .invalid.
Không tài khoản thật, live backend/DB/CARLA. 5 ảnh before +10 after.
375/390/768/1024/1440 kiểm overflow/focus/native keyboard/context/chart cursor.
Đã xem ảnh before375, after recorded scene375 và after1440.
Before/five matching after fixture thiếu top-level scene dimensions nên hiện placeholder đúng;
thêm recorded-scene-375/large fixture với dimensions/tọa độ để kiểm cả cảnh thật do UI dựng.

Test cảnh thiếu coordinate giữ control y không đổi giữa frame thiếu/đủ; trạng thái clock reserve height.
Data-state labels có chữ, accessible Play/Pause/native seek, End/Home/focus-visible;
không tự scroll khi phát. Không đổi CSS shell/roles khác.
Một số annotation theo world-coordinate của ScenarioMap vẫn có thể bị cắt trên mobile; facts dạng chữ giữ đầy đủ.
Đây là giới hạn scene chung/TD60, không tự dịch actor hoặc redesign shared map trong phase này.

Large fixture20.000 records, dt dữ liệu13ms, chọn t200s, rate1:

| Đo thực tế | Kết quả |
|---|---|
| Navigation→chart ready | 774ms |
| Play/Pause interaction window | 670ms wallclock |
| Simulation cursor advanced | 0,632s |
| RAF callbacks tracked | 16 |
| Maximum simultaneously pending RAF | 1 |
| JS heap snapshot | 73,2MB |
| Chart retained dots | 20.000; không downsample |

Đo từ after/result.json trước browser suites khác; có IPC/Playwright/input/render overhead, không isolated CPU benchmark.
RAF wrapper chỉ đếm/cancel real callbacks, không fake/fast-forward clock. Assertions chờ cleanup pending0 sau pause/unmount.
Chart geometry giữ memo Phase16. Frame/event lookup O(log n), motion lookup O(1) sau index;
prefix path rebuild chỉ khi selected recorded index đổi. ScenarioMap vẫn tạo geometry theo chiều dài path,
full playback không phải O(log n) toàn bộ render. Không claim60fps, no-memory-leak hoặc performance trên mọi thiết bị.
20k là stress fixture, không run CARLA thực; một heap snapshot không phải memory/RSS stability test.

## 8. Tests và validation

| Check | Thực thi |
|---|---|
| Git ban đầu | chuvv sạch, Phase16 commit0f3e080 |
| npm.cmd run lint | PASS exit0; lint-final.log; targeted harness lint sau edits cuối exit0 (lint-harness-final.log) |
| npx.cmd tsc --noEmit | PASS exit0 trên final build; types-final.log |
| npm.cmd run build | PASS exit0; build-final.log |
| Node unit/regression | PASS33 nhóm =9 playback+24 Phase13–16; unit-final.log |
| analysis-playback-ui.mjs | PASS exit0 final build,10 after screenshots,0 errors/0 writes; playback-ui-final.log + after/result.json |
| analysis-redesign.mjs | PASS exit0 final build, đầy đủ Analysis/Detail/Evidence/Playback/navigation/error/roles/context; analysis-regression-final.log |
| analysis-telemetry-ui.mjs | PASS exit0, Phase16 domain/hover/gaps/events/focus/20k; telemetry-regression-final.log |
| analysis-metrics-ui.mjs | PASS exit0, unit/source/negative/zero/missing/CSV fixtures; metrics-regression-final.log |
| RepoDocsTest | PASS5 tests,0 failure/error/skip sau chuyển completed; docs-check.log |
| git diff --check / untracked files | PASS whitespace/conflict/newline cho toàn bộ11 files Phase17; staging rỗng |

Unit command: node --test tests/analysis-playback.mjs tests/analysis-telemetry.mjs tests/analysis-metric-format.mjs tests/analysis-classification.mjs tests/analysis-explainability.mjs

Coverage: load paused/no-data, rates invalid/valid, elapsed seconds/end/restart, pause/seek/clamp,
rapid toggles/old key callbacks, irregular floor/no future epsilon/duplicates, missing/null/nonfinite/backward time,
one timestamp/zero duration, exact discrete collision/stop, event identities và20k full-resolution timestamps.
Browser: real controls/rAF, double-click+rapid toggles, natural end, seek while playing, rate changes,
gap age/no coordinates/ambiguous projection, event1,200→1,201, loading/run switching/API503/retry,
no stale source, no extra API fetch during controls (full suite), context/back/unmount, focus/responsive.

Visibility QA dùng document.hidden fixture + visibilitychange event với **real RAF**, chứng minh handler pause/no catch-up;
không chứng minh browser/OS background throttling thực tế hoặc every suspension mode.
Lần harness đầu timeout vì constant-value SVG dot path có bbox height0 dù stroke được vẽ;
đã chờ parent SVG visible/path attached và kiểm stroke5px/count20k, không sửa production để hợp thức hóa test.
Lượt TS đầu phát hiện lỗi refactor formatter selector, sửa trước final TS/lint/build; không bỏ assertion giá trị nguồn.

Backend/worker không sửa nên không chạy lại integration/worker/CARLA suites trong phase này.
Không có live API/DB hoặc thực nghiệm physics/calibration; source code inspection không thay cho runtime evidence.

## 9. Rủi ro, giới hạn và bàn giao

- TD61: API Playback chưa dt/observed cadence/loss map, CSV/controller/camera chưa verified clock mapping.
  Không suy frequency từ profile hoặc coi gap là mất mẫu chắc chắn; không ghép sensor nguồn khác.
- TD59: canonical command/pedal/target-v/immutable build-formula-calibration identity còn thiếu.
  Không invented applied braking/hazard onset hoặc tái chấm history.
- TD60: shared scene còn CP/CCR geometry/annotation limitations; TD54 related run identity chưa chứng minh comparability.
  Không mở rộng backend hoặc tự sửa geometry để các nguồn trông khớp.
- Trajectory guard bảo thủ: một invalid/outside/duplicate/backward timestamp hoặc missing coordinate có thể tắt đường nối
  cho toàn trace; vẫn inspect từng frame và raw giữ nguyên. Unknown finite timestamp gaps cần metadata TD61.
- Full-resolution20k ScenarioMap geometry vẫn tốn CPU; chưa long-running memory/low-end-device/60fps guarantee.
- Chưa Figma truy cập được, screen reader thật, Safari/Firefox hoặc native touch; browser keyboard/viewport fixtures không thay thế các kiểm này.

Dừng Phase17 để người dùng review và commit/push thủ công.
Commit đề xuất: fix(analysis): refine playback controls and telemetry synchronization.
