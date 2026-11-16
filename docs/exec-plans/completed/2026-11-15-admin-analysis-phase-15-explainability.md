# Phase 15/20 — AEB metric explainability & evidence traceability

Ngày 15/11/2026. Nhánh `chuvv`, nền `4ca0a93`, working tree sạch; Phase 14 đã commit.
Chỉ frontend presentation/metadata, tests và tài liệu. Không stage/commit/push/Phase 16.
Không đổi công thức backend, AEB, classification, calibration, CARLA/kinematic physics, schema hoặc Admin.

## 1. Nguồn đã đối chiếu và finding

Đã đọc AGENTS.md, frontend/AGENTS.md, CLAUDE.md, frontend/CLAUDE.md, DESIGN.md,
rename guide/mục 7 naming, Next installed accessibility guide, architecture;
[Phase 11](2026-11-14-admin-analysis-phase-11-audit.md),
[Phase 12](2026-11-14-admin-analysis-phase-12-overview.md),
[plan Phase 13](../active/2026-11-14-admin-analysis-phase-13-metrics.md),
[Phase 14](2026-11-15-admin-analysis-phase-14-classification.md);
[metric contract](../../vehicsim/analysis-metrics-contract.md),
[công thức CP_CROSSING](../../vehicsim/cong-thuc-cp-crossing.md),
[ADR-040](../../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md),
[ADR-042](../../adr/ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md),
[ADR-043](../../adr/ADR-043-perception-tu-radar-chay-bong-truoc.md),
[ADR-050](../../adr/ADR-050-mo-category-xe-phia-truoc-bo-dong-hoc.md),
[ADR-051](../../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md),
[plan đo độ lệch CARLA/động học](../active/2026-11-13-do-do-lech-carla-dong-hoc.md).
Phase 13 chỉ có plan, chưa có báo cáo completed; đối chiếu code/tests đã commit.

Nguồn production để tra lại công thức:
[Simulator.java](../../../src/main/java/com/vsos/core/simulation/Simulator.java),
[LeadVehicleSimulator.java](../../../src/main/java/com/vsos/core/simulation/LeadVehicleSimulator.java),
[CarlaSession.java](../../../src/main/java/com/vsos/core/simulation/CarlaSession.java),
[AebStack.java](../../../src/main/java/com/vsos/core/aeb/AebStack.java),
[DecelMeter.java](../../../src/main/java/com/vsos/core/aeb/DecelMeter.java),
[RecordedTelemetry.java](../../../src/main/java/com/vsos/core/simulation/RecordedTelemetry.java),
[AnalysisViewService.java](../../../src/main/java/com/vsos/backend/service/analysis/AnalysisViewService.java),
[TelemetryMetricsService.java](../../../src/main/java/com/vsos/backend/service/simulation/TelemetryMetricsService.java).
Bảng dưới dùng gốc `core` = src/main/java/com/vsos/core, `backend` = src/main/java/com/vsos/backend,
`ui` = frontend/src/components/analysis. Dòng tham chiếu ở nền audit hiện tại.

| Finding / ưu tiên | Bằng chứng trước sửa | Xử lý |
|---|---|---|
| E15-01 / P2 | AnalysisRunSummary/RunFact chỉ value + note, chưa có method/variables/input/source disclosure | 7 native details cạnh các metric chính; không nhồi vào Overview |
| E15-02 / P1 nội dung | TTC/geometry khác CP và CCR, không được chọn theo hình vẽ pedestrian hoặc tên run | Dùng environment.category đã có trong API; thiếu/unsupported/source/profile chưa xác định thì không hiện công thức áp dụng |
| E15-03 / P1 trace | Quãng phanh và RMS chưa đủ input trong Detail để tái lập; calibration/formula ID không có | Chỉ công thức code hiện tại và input có thật, không thay số hoặc suy version theo xe/profile |
| E15-04 / P1 nhãn | analysisRunData.ts/runMarkers còn “Phanh có hiệu lực” dù là command onset | “Bắt đầu lệnh phanh”; decision gọi “Quyết định AEB”, không thêm timestamp |
| E15-05 / P2 QA | Mở details dài trong grid 3 cột kéo hai ô cạnh cao bằng, khoảng trắng lớn | Chỉ ô có explanation mở chiếm trọn hàng; trạng thái đóng giữ grid hiện hành |
| E15-06 / P2 harness | analysis-metrics-ui login qua Home, regression fixture mặc định trả array thay object | Thêm đúng feed fixture; không sửa Home production hoặc bỏ assertion page errors |

## 2. Metric explainability inventory

Mỗi công thức sau được đối chiếu source; không phải đề xuất thay công thức.
Canonical = SIMULATOR_RESULT, sensor = SENSOR_RECOMPUTED; hai nhánh không được gộp.
Đơn vị nội bộ SI trừ config/API ghi km/h. Nguồn CARLA là mô phỏng, không đo xe thực.

| Metric | Source Field | Implementation | Formula | Unit | Assumptions | Failure Relevance | Evidence |
|---|---|---|---|---|---|---|---|
| TTC nhận thức | Frame.ttc → telemetry.ttc, aeb_activation_ttc_s | core/aeb/AebStack.decide:205 | gap/(egoV−targetVx) | s, gap m, v m/s | Detected/perceivedY, gap>0, closing≥2; CP targetVx=0. Corridor dự đoán xét riêng | Thời điểm quyết định theo luật; không một mình chứng minh cần phanh | Canonical frames; UI explain TTC phân biệt perception/GT, link telemetry |
| TTC GT/min | Frame.ttc_gt → metrics.min_ttc_s | Simulator.groundTruthTtc:46; LeadVehicleSimulator:59; CarlaSession:350; summaryMetrics | CP gap/egoV; CCR gap/closing; min các frame; collision ép 0 | s | CP in GT path và egoV>0,1; CCR inPath và closing>0,1; gap>0; vận tốc tức thời coi không đổi | Biên an toàn theo luật; không đồng nhất collision observed time | Raw/projection GT, scalar min; không timestamp min trong Detail |
| Relative distance/gap | Runtime gap; ped_x−ego_x ở CCR; CP crossingX−egoFront | Simulator:140; LeadVehicleSimulator:48; CarlaSession:326 | CP tới vạch từ mũi; CCR từ mũi ego tới đuôi target | m | Hệ trục run; khác center/Euclidean/radar range | TTC/path đầu vào | Canonical frame/runtime; Detail chưa field dynamic gap độc lập, không tính mới ở UI |
| Relative speed/closing | Runtime targetVx; radar_rel_velocity_ms ở CSV | AebStack:209; CarlaSession:342; TelemetryMetricsService.nearestRadarTarget | EgoV−targetVx; radar closing=−radialVelocity | m/s | Radar xuyên tâm khác vận tốc dọc | Điều kiện TTC, không TTC nếu receding | TargetV runtime chưa canonical Frame; không suy từ đạo hàm ped_x ở frontend |
| Ego speed | Frame.ego_v; telemetry.speed_kmh; environment.ego_speed_kmh | Simulator.makeFrame; AnalysisViewService:501; Playback speedKmh | API speed_kmh=round(v×3,6); config ban đầu và speed từng frame riêng | m/s → km/h | API km/h không nhân lại; giữ precision raw khi chưa display | Quan sát tốc độ; khác closing/relative impact | Detail telemetry/playback; không dùng initial config thay speed tại collision |
| AEB decision | metrics.aeb_activation_t; events.aeb_decision.t | AebStack.decide:222; ViewService:518 | Tick đầu TTC≤configured threshold và corridor phù hợp | s | Latch quyết định, chưa applied pedal | Evidence quyết định, không tự kết luận response | Disclosure timeline chỉ mốc API, link đến thời điểm nếu trong range |
| Brake command | AebTick.decelCmd; CarlaSession.Tick.pedal | AebStack.control:165; DecelMeter.brakePedal:54; worker/vehicsim_aeb_control.py | Cmd ramp đến min(AEB max, xe max); pedal=clamp(cmd/a_full+0,05(cmd−measured),0,1) | m/s²; ratio 0–1 | 100% không một mức decel cố định; không thay command bằng aeb latch | Cần để tách lỗi điều khiển/đáp ứng | Có runtime/CSV pedal; Not implemented trong canonical Frame/Detail projection nên không dựng numeric command ở UI |
| Onset/delay controller | metrics.brake_onset_t; stage_evidence CONTROL response_time_s | AebStack.control; Simulator.summaryMetrics:284; RunService.RESULT_COLUMNS | Onset tick t≥decision+configDelay+0,10; latency=onset−decision nếu đủ cả hai | s | Actuator constant mô hình, quantization dt; không measured physical delay | Đối chiếu timing luật | Mốc đã lưu, input config và latency backend riêng; không frontend trừ/suy timestamp |
| Applied brake/physical onset | CSV brake, sensor first_brake_time_s; không canonical field riêng | worker/sensor_recorder.py; TelemetryMetricsService | Sensor onset khi brake>0,05 sau warmup0,5; physical T_AEB riêng chưa có | ratio; s | Pedal không đồng nghĩa gia tốc bắt đầu | Chưa đủ phân biệt command/applied/response | Not implemented trong Detail; không gọi gt_start là hazard onset |
| Actual deceleration/max/mean | Frame.ego_a; max/mean_deceleration_mps2 | Simulator.makeFrame/MotionStats:67; DecelMeter.update:34 | Frame a=−decel; max magnitude; mean chỉ mẫu positive. Kin min(cmd,μg); CARLA speed-window finite diff rồi kẹp | m/s² | CARLA cửa sổ~0,1 s, dt danh định; trước braking trả0; max0 legacy→null | Quan sát response, chưa available physical force | UI max disclosure; signed accel telemetry giữ nguyên; sensor IMU nguồn khác |
| Available deceleration | raw metrics.decel_available_mps2 | Simulator:179; LeadVehicleSimulator:99; CarlaSession.decelAvailable:470 | min(AEBmax,xeMax,μg); CARLA xosc5 thêm min(a_full) | m/s² | Config/calibration scalar dùng ngoại suy; không maximum achieved mỗi tick | Limiting-factor heuristic còn TD-58 | Tính ở core, Detail chưa chiếu field này. Không dùng max_deceleration thay a_available |
| Required deceleration | Không field canonical/Analysis DTO | Không tìm thấy production metric tương ứng | Not implemented | — | Không tự dùng v²/(2d) làm metric đang có | Chưa đủ input/contract để kết luận ineffective | Không thêm metric/công thức frontend |
| Required stopping distance | Không field riêng | Evaluation.hazardChain có needed TTC, không required distance output | Not implemented; needed TTC hiện dùng tCtrl+v0/(2a) | — | Xấp xỉ static stopping envelope không thay cho moving-target proof | Tránh suy avoidability từ một scalar | Không hiển thị ví dụ required distance từ công thức tham khảo |
| Stored stopping distance | metrics.stopping_distance_m | Simulator.brakePhaseMetrics:202, dùng chung canonical kin/CARLA/CCR | (x_last−x_onset)+v_last²/(2a_available) nếu a_available>0; ngược lại remainder0 | m | Onset→last; no onset/frame→null. Remainder giảm tốc không đổi | Không luôn measured-to-stop; không includes reaction distance | UI disclosure, Java sample test 5 m; không frontend thay số |
| Actual braking travel riêng | Phần x_last−x_onset của công thức trên | Simulator.brakePhaseMetrics:218 | Observed travel từ onset; chưa field tách observed/remainder | m | Nếu run chưa dừng thì observed ≠ full stop | Không dùng stored total làm đo thuần | Not implemented như metric độc lập trong Detail; không tách từ scene rút gọn |
| Reaction/available stopping distance riêng | Không field Analysis riêng | Không tìm thấy production output tương ứng | Not implemented | — | Không lấy trigger distance hoặc min separation thay | Không tự suy khả năng tránh | Disclosure stopping nêu thiếu; không thêm API/metric |
| Impact ego | metrics.impact_speed_mps | Simulator.summaryMetrics:260; LeadVehicleSimulator:166; CarlaSession.finish | Last ego speed nếu collision, else null | m/s | Tốc độ ego; không relative. Aggregate valid noncollision0 là quy ước khác | Không một mình xác định nguyên nhân/avoidability | UI impact guard giữ Phase13; sensor dùng khung trước hit khác nguồn |
| Relative impact | raw relative_impact_speed_mps; sensor relative_impact_speed_mps | LeadVehicleSimulator:167; CarlaSession:355; TelemetryMetricsService:326 | CCR max(0,egoV−targetV) lúc hit; sensor ưu tiên supplied/vector/radar theo hợp đồng | m/s | Nguồn/phương pháp khác canonical ego impact | Điều tra impact, không trộn scalar | Có raw/sensor; Detail chưa chiếu riêng, không tạo số thay |
| Minimum separation | metrics.min_distance_m | Simulator.summaryMetrics:233; LeadVehicleSimulator.summaryMetrics:117 | CP min max(0,hypot(dx,dy)−r), r0,3; CCR min hypot(dx,dy) giữa boxes; collision0 | m | CP point/radius và ego rectangle; CCR hộp theo trục run, dy theo targetY hiện hành | Biên an toàn; không cause riêng lẻ | Disclosure chọn CP/CCR từ API category; không TTC/radar distance |
| RMS jerk | metrics.rms_jerk_mps3 | Simulator.brakePhaseMetrics:202 | j=(a_i−a_prev)/dt_nominal; RMS=sqrt(mean(j²)) từ onset đến cuối | m/s³ | Prev trước onset hoặc0; canonical không thêm filter RMS; có last/collision frame | Quan sát độ êm, không cert safety/comfort | UI formula/inputs/limit; Java numeric anchor14.142; stored value không tính lại |
| Jerk trace | motion_telemetry.jerk_mps3 | RecordedTelemetry.project:19–27 | (a_i−a_prev)/(t_i−t_prev) khi finite/t tăng | m/s³ | Missing/duplicate/nonmonotonic→null; không bridge missing a | Observational derivative, khác objective | Motion chart note sẵn có; không smoothing mới |
| Max abs jerk | max_jerk_mps3; sensor max_abs_jerk_mps3 | Simulator.MotionStats:77; TelemetryMetricsService.summarise | Max abs Δa/dt; sensor ưu tiên IMU jerk theo contract | m/s³ | Khác cửa sổ RMS | Điều tra biến thiên, không threshold safety mới | Raw/sensor summary, không thêm scalar Detail |
| Sensor RMS/stop/impact | TelemetrySummary từ CSV + collisions | TelemetryMetricsService:262/302/361; worker/sensor_recorder.py | RMS ưu tiên IMU jerk else Δa/Δt; travel trapezoid+remainder; ego speed trước hit | SI | Warmup0,5; brake>0,05; trước collision; source SENSOR_RECOMPUTED | Observational, không ghi đè canonical | Existing CARLA page labels giữ Phase13; không áp disclosure canonical cho CSV |
| First detection/time/distance | first_detection_t/distance_m; events.detection | AebStack/Simulator:265; LeadVehicleSimulator:145 | Time detected đầu; scalar CP gap tới vạch hoặc CCR gap; event detection có thể range hypot(gap,y) | s; m | Không gộp event Euclidean range và scalar longitudinal gap | Perception timing/evidence | Scalar sẵn có; timeline chỉ time thật, không tự dựng hazard onset |
| FCW/stop/collision events | fcw_t; events[].t/kind | AebStack; Simulator/CarlaSession | Timestamp sự kiện/cờ do core ghi | s; categorical | GT start không tự là hazard; zero speed không tự là stopped event | Quan sát khác classification theo luật | Existing markers/playback giữ event identity; disclosure timeline liệt kê valid recorded stop/collision |
| Collision state | raw collision; outcome=COLLISION; event collision | Core simulator + Evaluation; backend persists | Kinematic geometry; CARLA target hit/geometry; sensor collision stream riêng | Boolean/categorical | Sensor hit count khác canonical boolean | Va chạm chưa chứng minh missed/ineffective | UI Phase14 vẫn tách verdict/classification/giả thuyết |
| μ/AEB params/nominal dt | environment.road_friction; configuration[]; inspection.run.dt | Run config/Case/AebParams/CarlaSession.profile | Cấu hình đã lưu; không công thức metric frontend | ratio; s; m/s²; m/s³ | μ không chứng minh tire force CARLA; dt config không actual measured step | Điều kiện phương pháp, không direct cause | Input labels/source selectors rõ; không hardcode μ/mass/calibration |
| Aggregates/confidence | ObjectiveAggregate; chain.confidence | AnalysisMetrics.aggregate; Evaluation.StageVerdict | Means theo hợp đồng; score luật hằng | SI; score | Aggregate ≠ từng run; confidence không probability | Không kết luận chắc chắn | Giữ renderer/guards Phase13–14, không score mới |

## 3. Truy vết và điều kiện áp dụng

1. Worker adapter đọc actor/control/IMU/radar trong CARLA và chuyển quan sát qua bridge; AEB/metrics canonical ở Java.
2. Kinematic integration hoặc CarlaSession → Frame/events → Simulator/LeadVehicleSimulator metrics.
3. RunService.persist giữ scalar ở simulation_runs và projection frames/events/metrics/chain trong telemetry_json.
4. AnalysisViewService.failureDetail: `GET /api/v1/vehicsim/analysis/runs/{id}` inspection chứa run + detail.
   Metrics/source/category/scene/config/stage_evidence từ API hiện có, không endpoint mới.
5. Detail truyền inspection.run vào Summary để lấy dt đúng run; không lấy cấu hình/global context thay.
6. analysisMetricExplanationData chỉ chọn metadata và format display qua helper Phase13; không tính metric/phân loại.
7. Disclosure hiện run/scenario/simulator/category/source field và link sang route Evidence/Telemetry cùng ID/returnTo/signal.

Công thức chỉ hiện khi category CP_CROSSING/CCRS/CCRM/CCRB, source SIMULATOR_RESULT,
và simulator đối chiếu được (vehicsim-kinematic-1.0 hoặc CARLA xosc3/4/5 có version số).
Source/category/profile khác hoặc thiếu: định nghĩa tổng quát + trạng thái chưa xác định công thức, không đoán từ frame/hình cảnh/tên.
Các công thức luôn ghi **code hiện tại** và **API chưa có formula version của run**;
không khẳng định version code lịch sử đã được chứng minh chỉ từ profile.

Source field ở UI là đường dẫn/selector của dữ liệu có thật: metrics.*, run.dt,
configuration[code=...].value, stage_evidence[stage=CONTROL].values.response_time_s,
events[kind=...].t. Không tạo đường tải artifact, run ID hoặc calibration version giả.
Category lấy theo API; ViewService có fallback CP cho IR thiếu category, nên chưa là manifest kiểm chứng lịch sử độc lập.

## 4. Nội dung explainability và dữ liệu còn thiếu

Bảy disclosure: RMS jerk, impact, quãng phanh, TTC min, minimum separation, max deceleration, decision/timeline.
Mỗi disclosure có definition/unit, phương pháp/công thức/biến/điều kiện,
API inputs có sẵn, interpretation/limitations, run source và links.
Giá trị chính, formatter/precision, classification engine/guards giữ nguyên.

- TTC min là GT, không perceived TTC, không thời điểm collision. CP và CCR khác closing/geometry.
  Không API timestamp min nên link telemetry không gán thời gian min giả.
- Quãng phanh không includes reaction distance; không thay a_available bằng observed max decel hoặc MAX_DECELERATION.
  Thiếu x_onset/a_available nên không có ví dụ thay số dù value d_stop có thật.
- RMS canonical dùng dt danh định; derivative chart dùng timestamp thực. Không thêm filter/smoothing.
  No-brake/missing/null không tự cùng nghĩa; chỉ thông báo không có số đo hợp lệ hoặc không áp dụng.
- Timeline chỉ liệt kê finite nonnegative timestamps đã ghi. Applied pedal, physical response/hazard onset chưa có Detail field;
  không sinh mốc từ decision+delay hoặc gt_start.
- Impact không collision vẫn “—”; noncollision aggregate0 không được đọc như per-run impact.
- CARLA decel signal smoothed/clamped, không raw IMU, không thực địa; full pedal không decel cố định.
- Không formula/calibration ID trong API: ghi rõ thiếu, không gán ADR-051 thành calibration version của run.

Kế hoạch đo độ lệch 13/11 là **đề xuất**: a_dải, η, ΔTTC(v), tiêu chí run/lô chưa được chứng minh chạy trong phase này.
Mục “CCR ttc_gt luôn null” của plan đã cũ: CarlaSession:350 có GT TTC. Không dùng câu đó để mô tả production.
CT31b trong sổ tay là công thức giải thích, ghi rõ không có trong code: không đưa nó thành formula production trên UI.
Không kiểm lại nguồn tiêu chuẩn bên ngoài hoặc tuyên bố compliance.

## 5. UI, accessibility và responsive

Chọn native details/summary vì mở bằng Enter/Space, focus ở summary khi đóng, không focus trap/modal/overlay.
Mỗi summary có accessible name riêng “Giải thích {metric}”.
Nội dung đóng mặc định; Definition→formula→inputs→source/limits chỉ xuất hiện khi người dùng mở.
Không thay Overview, bảng Explorer, Admin shell hoặc thêm widget.

QA ảnh đầu cho thấy grid kéo cao các ô bên cạnh; đã thêm rule chỉ fact có explanation open chiếm trọn hàng.
Đóng lại trở về grid cũ. Nội dung 14px/line-height1,65, max100ch; formula wrap, không page overflow.
Màu/focus dùng token hiện hành, không chỉ màu để truyền tải trạng thái.
Giữ dl chính của mỗi RunFact chỉ chứa scalar value; phần nguồn dùng lists để phân biệt metadata với số đo chính.

Evidence link giữ run/scenario context qua returnTo, t/signal đang có.
Telemetry link chỉ gán t cho onset/decision đã ghi trong recorded range; scalar min/impact không có timestamp nên không tự gán.
Không tự làm nội suy, chuyển đổi hoặc gửi mutation khi mở/đóng/navigate disclosure.

## 6. File thay đổi

| File | Thay đổi và lý do |
|---|---|
| ui/analysisMetricExplanationData.ts (mới) | 7 method definitions, category/source guard, API inputs/value mapping; không calculation mới |
| ui/AnalysisMetricExplanation.tsx (mới) | Native disclosure + lineage và evidence/telemetry links theo run |
| ui/AnalysisMetricExplanation.module.css (mới) | Nội dung/units/formula readable, wrap/focus/tokens |
| ui/AnalysisRunSummary.tsx | Gắn 7 explanation; RunFact thêm optional child; nhận inspection.run |
| ui/AnalysisRunDetail.module.css | Chỉ expanded explanation fact span cả grid row, tránh ô hàng xóm bị kéo cao |
| ui/analysisRunData.ts | Marker labels command onset/decision đúng nghĩa, không timestamp/rule mới |
| frontend/src/app/analysis/failures/[runId]/page.tsx | Truyền inspection vào Summary, không đổi fetching/permissions |
| frontend/src/types/vehicsim.ts | Optional environment.category là field AnalysisViewService đã trả; không đổi API |
| frontend/tests/analysis-explainability.mjs (mới) | 6 nhóm data/source/category/missing/value/inputs/timeline tests production mapper |
| frontend/tests/analysis-explainability-ui.mjs (mới) | Login fixture, 7 disclosures ×3 viewport, keyboard/focus/context/formula branch/missing/source |
| frontend/tests/analysis-metrics-ui.mjs | Bổ sung đúng Home regression fixture object sau login, không nới assertion |
| src/test/java/com/vsos/core/simulation/MetricExplanationContractTest.java (mới) | 2 numerical anchor tests gọi hàm production, không sửa calculation |
| Báo cáo này | Chuyển plan completed kèm inventory và QA thực thi |

## 7. Trước/sau và ví dụ dữ liệu

| Input từ API/contract | Trước | Sau |
|---|---|---|
| CP_CROSSING, min_ttc_s=0, SIMULATOR_RESULT | 0.00 s + note ngắn | Giữ 0.00 s; disclosure gap/v_ego, path/v>0,1, collision0 và perceived gate riêng |
| CCRM, cùng source/metric | Không giải thích khác CP | gap/(v_ego−v_target,x), khoảng mũi→đuôi, closing>0,1; không công thức CP fallback |
| Category/source/simulator thiếu hoặc CPLA | Chưa có disclosure | Không chọn formula áp dụng, không đoán category từ hình pedestrian |
| stopping_distance_m=33.25, onset0.25, dt0.01, thiếu a_available/x_onset | 33.250 m, note ngoại suy | Giữ 33.250 m, formula/variables + input0.25 s/0.01 s đúng field; không tính ví dụ từ a_max |
| rms_jerk_mps3=null | “—” | Vẫn “—”, lý do trung tính + phương pháp chung; không dựng RMS từ telemetry thiếu |
| SAFE nhưng stale impact10 | Impact “—” theo Phase13 | Giữ “—” trong cả value và disclosure; không hiển thị10 m/s như measurement |
| Simulator kin dt0.05 vs CARLA dt0.01 | Có identity ở header | Trong disclosure cũng có engine/source/dt danh định đúng run; không nhãn measured real-world |
| brake_onset_t=0.25 | Marker “Phanh có hiệu lực” | “Bắt đầu lệnh phanh”, value/timestamp không đổi |
| Stop/command time thiếu | Không timeline explanation | Không synthesize timestamp từ config; chỉ mốc còn thật trong API |

Numerical anchor **unit fixture**, không phải input của run UI:
frames (t,x,v,a)=(0,0,10,0),(0.1,1,8,−2),(0.4,3,6,−2), onset0.1, dt_nominal0.1, a_available6
→ Simulator.brakePhaseMetrics trả RMS14.142 m/s³ và quãng5.0 m.
Jerk là −20 và0 theo dt danh định; distance=(3−1)+6²/(2×6).
Test đối chiếu code, không xuất ví dụ này lên UI/run evidence. a_available0 giữ legacy remainder0;
đây là characterization của branch hiện có, không endorsement vật lý hoặc fix công thức.

## 8. Regression tests và kết quả thực thi

Artifact gitignored: `data/analysis-phase15-2026-11-15/`.
Production Next 127.0.0.1:3127, Edge headless; login form dùng API interception/actor .invalid.
Không tài khoản thật, không live backend/DB/CARLA. 3 ảnh before, 8 ảnh after
(3 closed, 3 stopping expanded, missing RMS, CCR TTC). Đã xem desktop/mobile expanded và CCR TTC.
Native Enter/Space/return focus, không overflow cả 7 disclosures ở375/768/1440.

| Kiểm tra | Kết quả thực tế |
|---|---|
| Git trước sửa | chuvv, sạch, Phase14 commit4ca0a93 |
| npm.cmd run lint | PASS exit0; lint-final.log |
| npx.cmd tsc --noEmit | PASS exit0; types-final.log |
| npm.cmd run build | PASS exit0; build-final.log sau expanded-row fix |
| node --test tests/analysis-explainability.mjs tests/analysis-metric-format.mjs tests/analysis-classification.mjs | PASS18 nhóm =6 mới+12 regression; unit-final.log |
| node tests/analysis-explainability-ui.mjs | PASS exit0, final build, 7 disclosures/3 viewport/keyboard/source/category/inputs/missing/navigation,0 writes/errors |
| node tests/analysis-redesign.mjs | PASS exit0 trên final build; toàn bộ suite Analysis, menu/focus/5 viewport, analysis-regression-final.log |
| node tests/analysis-overview.mjs | PASS exit0,5 viewport/context/states/units/menu |
| node tests/analysis-classification-ui.mjs | PASS exit0, validity/classification/no inference/keyboard/context |
| node tests/analysis-metrics-ui.mjs | PASS exit0 lượt cuối sau sửa feed Home fixture; metric values/units/CSV không đổi |
| Maven nhóm dưới | PASS84 tests,0 failure/error/skip; có2 numerical anchors mới |
| RepoDocsTest sau chuyển completed | PASS5 tests,0 failure/error/skip; docs-check.log |
| git diff --check/file mới/conflict markers/link report | PASS, kiểm cả files chưa stage |

```powershell
$env:MAVEN_OPTS='-Xmx512m -XX:ActiveProcessorCount=2'
.\mvnw.cmd -B '-Dtest=MetricExplanationContractTest,AnalysisMetricsTest,AnalysisServiceTest,AnalysisSnapshotTest,SimulatorBehaviorTest,LeadVehicleSimulatorTest,CarlaSessionLogicTest,TelemetryMetricsServiceTest' test
```

Unit tests không chỉ kiểm text: category/source/profile đổi làm formula presence/branch đổi; API values/null/invalid/zero
đổi output; dt chỉ thuộc cùng run; config đổi không thay stored distance; timestamp thiếu không tạo marker.
Browser thay response rồi reload để kiểm CP→CCR/unknown/kinematic, source/missing/null/impact guard;
điều hướng Evidence/Telemetry kiểm ID/returnTo/signal/t thực, không chỉ snapshot text.
Java gọi hàm core thật với timestamp không đều để phân biệt RMS canonical và derivative projection.

Lượt TypeScript đầu phát hiện inspection có thể undefined; đã chuẩn hóa prop null, build/typecheck cuối PASS.
Lượt ảnh đầu phát hiện ô hàng xóm kéo cao khi disclosure mở; sửa CSS scope hẹp rồi chạy lại final browser/suite.
Legacy metrics suite FAIL một lượt ở Home vì fixture regression trả array; thêm object đúng schema và chạy lại PASS,
không bỏ pageerror assertion hoặc sửa production Home. Log lỗi được giữ metrics-ui.log.

Chưa kiểm live API/MySQL/Redis, CARLA/ScenarioRunner, thực nghiệm xe thật, screen reader hoặc Safari/Firefox/native touch.
Không có Figma truy cập được để đối chiếu. Test xanh không xác minh accuracy vật lý, calibration hoặc thực địa.
Chỉ có code inspection + offline Java + API/browser fixtures trong phase này.

## 9. Rủi ro và công việc tiếp theo (chưa triển khai)

- TD-59: cần immutable formula/build/evaluator/calibration identity và original artifact lineage;
  profile/category hiện tại chưa đủ tái lập lịch sử. UI giữ nhãn code hiện tại và giới hạn rõ.
- API Detail thiếu a_available/x_onset, observed/remainder split, min timestamp, applied pedal/physical onset/target_v.
  Không thêm API hoặc giả lập input trong phase này; cần hợp đồng trace versioned ở phase phù hợp.
- TD-17: CARLA low-speed stop/ma sát và các xe chưa hiệu chuẩn; scalar a_full/μ không chứng minh lực thực mỗi tick.
- TD-58: evaluator thiếu gate core/limiting-factor attribution/avoidability; một metric không xác nhận nguyên nhân.
  Không sửa classification engine hoặc thresholds.
- TD-60: scene CCR còn hạn chế hình học; disclosure giải thích metric không sửa scene hoặc “hợp thức hóa” hình vẽ.
- Công thức ở frontend cần đồng bộ khi core/version thay đổi. Tests hiện hành neo mẫu số học và mapping,
  không exhaustive proof tất cả categories/physics hoặc historical simulator versions.
- Đề xuất nhóm chốt formula/calibration/versioned evidence contract trước khi bổ sung thay số hoặc measured-response timeline;
  chưa được coi là ủy quyền sang Phase16.

Dừng Phase15 để người dùng review, commit/push thủ công.
Commit đề xuất: `feat(analysis): add AEB metric explainability and source context`.
