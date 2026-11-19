# Admin & Analysis — Phase 11/20: Failure Analysis Audit & Technical Assessment

Ngày 14/11/2026, nhánh `chuvv`, nền `3027692` (Phase 10 đã commit), working tree sạch lúc bắt đầu.
Chỉ audit/tài liệu và hai characterization tests. Không đổi production/Admin/schema/quyền/AEB/CARLA,
không commit/push và không triển khai Phase 12.

## 1. Executive Summary

Pipeline thực có: scenario → bundle → động học Java hoặc .xosc/CARLA → AEB/metrics/evaluation Java →
DB → API → Analysis UI. **CP_CROSSING, CCRS, CCRM, CCRB** chạy được; CPLA/TURNING/CUT_IN có
schema/nhận diện nhưng **Documented but not implemented** ở tầng mô phỏng.

Giữ các điểm đã đạt: seed/source/profile, SI, aggregation missing/NOT_APPLICABLE, TTC GT tách perception,
UI đọc frame đã ghi, guards callback cũ, dataset v2 tách biến thể/giữ safe cases/revisions/digest/baseline.
Ưu tiên xử lý: LOW_FRICTION có thể gán nhầm giới hạn xe; thiếu command/target-speed trace; rule version
bị thay bằng aggregation version; UI CCR còn vẽ người đi bộ; taxonomy chưa tách giới hạn vật lý.
Core có thể trả SAFE/PASS cho evidence rỗng, nhưng Analysis API/dataset có guard phía sau:
không suy ra UI luôn báo SAFE sai.

Chưa xác nhận P0 đầu cuối; có 9 finding P1 và 4 finding P2 ở mục 10. Hai characterization tests chứng minh giới hạn hiện tại,
không sửa thuật toán. Không có cơ sở kết luận độ chính xác thực địa hay confirmed root cause.
Hiệu chuẩn ADR-051 là đo **trong CARLA**, không đo xe thật; kinematic cũng chưa validated như xe thực.

## 2. Architecture & Data Flow

Vị trí từ gốc repo; `core/`=`src/main/java/com/vsos/core/`, `backend/`=`src/main/java/com/vsos/backend/`,
`ui/`=`frontend/src/components/analysis/`. Số sau dấu hai chấm là dòng tại nền audit.

| Giai đoạn / file:function | Input → output / đơn vị / nguồn | Validation/lỗi, tin cậy và phần thiếu |
|---|---|---|
| Scenario — backend/service/scenario/ScenarioRules.java:21, FamilyService, LeadFamilySpec | IR/category → GENERATED variants; ego/target km/h, ped m/s, gap m, target decel âm m/s², μ | Luật category/range +Bundle validation; bốn category có runner; ba nhóm còn lại không được coi là runnable |
| Execution config — backend/service/simulation/RunService.java:219/384 | Variant/xe/AEB/seed/profile → queued run, run_config/bundle; dt s | Project/quota/identity; regression chép seed/profile baseline; CCR road40 bounds. Legacy replay còn TD-40 |
| Kinematic — core/bridge/Bundle.java:175; core/simulation/Simulator.java:95, LeadVehicleSimulator:24 | Bundle → frames/events/outcome, dt0,05 s, tối đa12 s | min(command,μg), integration/hình học đơn giản; tất định có parity; không xe thật |
| CARLA — XoscExport.export/exportLead; worker/run_xosc.py:187, vehicsim_aeb_control.py, vehicsim_lead_control.py | .xosc v5 → ScenarioRunner/CARLA actors, dt0,01 s, Town04 | Runner giữ tick, timeout/error/physics read-back; chưa chạy runtime trong Phase 11 |
| Collection — worker/sensor_recorder.py:78/242/271; core/simulation/CarlaSession.java:248/320 | Actor/control/IMU/radar/hit → CSV/JSON/RGB nếu bật; bridge → canonical frames | Recorder wait_for_tick; RGB không đủ mọi tick. Canonical và sensor là hai nhánh khác nguồn |
| Normalization — Simulator.makeFrame:51; core/aeb/DecelMeter.java:36; TelemetryMetricsService:395 | m/s, timestamp s, magnitude decel → signed ego_a; typed frames | CARLA speed difference smoothed~0,1 s/clamped μg, không raw IMU; CSV bỏ invalid/negative speed/time, chưa full semantic validator |
| Metrics — Simulator.brakePhaseMetrics:202; LeadVehicleSimulator.summaryMetrics:117; AnalysisMetrics:14 | Frames/events → scalar/aggregation SI | Legacy unchanged; sensor recomputation khác nguồn; 10Hz filtered EXPERIMENTAL chưa thay objective |
| Failure — core/evaluation/Evaluation.java:105/127/214 | Outcome/params/GT TTC → verdict/failure/chain | Heuristics; thiếu validity gate ngay core, chưa causal/avoidability; confidence hằng |
| Storage — RunService:778/1040 | result/evaluation → simulation_runs/collision_events/failures/root_causes/artifacts | Transaction +check seed/source/profile; DB projection không giữ toàn metadata result; không đọc DB runtime ở audit |
| API — AnalysisController; AnalysisService:48/95/151/219/264; AnalysisViewService:480/648 | Scalar +telemetry_json → dashboard/detail/playback/snapshot/handoff | Status/trace/objective/project gates, freeze REPEATABLE_READ/revisions/digest; related-run identity thiếu |
| UI — BaselineAnalysisDashboard:56/70; app/analysis/failures/** | API recorded → overview/runs/failures/detail/telemetry/evidence/playback/dataset | Request keys/cleanup, loading/empty/error/retry, không tự chấm; CCR scene chưa theo contract |

Đã đọc AGENTS.md, frontend/AGENTS.md, CLAUDE.md, frontend/CLAUDE.md, DESIGN.md và đối chiếu:
[architecture](../../vehicsim/architecture.md), [naming](../../vehicsim/quy-tac-dat-ten.md),
[rename guide](../../vehicsim/huong-dan-cap-nhat-sau-doi-ten-goi.md),
[ADR-040](../../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md),
[ADR-042](../../adr/ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md),
[ADR-043](../../adr/ADR-043-perception-tu-radar-chay-bong-truoc.md),
[ADR-050](../../adr/ADR-050-mo-category-xe-phia-truoc-bo-dong-hoc.md),
[ADR-051](../../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md),
[metric contract](../../vehicsim/analysis-metrics-contract.md),
[sổ công thức](../../vehicsim/cong-thuc-cp-crossing.md),
[sổ nguồn](../../vehicsim/nguon-va-kiem-chung-du-lieu.md), schema SQL và plans liên quan.
Không kiểm lại tiêu chuẩn/nguồn ngoài repo, không xác nhận compliance.

Đối chiếu [audit03/11](../../vehicsim/audit-redesign-analysis-2026-11-03.md), Analysis đợt1–8 ngày04/11,
Admin Phase 1–4/6–10. Không có báo cáo Phase 5 cùng chuỗi20phase; refinement Phase 05 ngày07/11 thuộc chuỗi khác.
Phase 10 kiểm Admin, không lấy làm coverage Analysis. AnalysisDatasetPanel.tsx không có import sử dụng
tìm được trong frontend; không coi component cũ là màn hiện hành.

## 3. CARLA vs Kinematic Data Source Matrix

| Dữ liệu | Kinematic | CARLA | Backend/UI và giới hạn |
|---|---|---|---|
| Position/speed | Integration Java; km/h÷3,6; target profile | Actor transform/velocity chiếu khung giao cắt, front/rear bounding box | Rounding0,001; không đo thực địa |
| ego_a | -min(command,μg) | -DecelMeter(speed), chỉ khi braking, smoothing/kẹp μg | Signal đã xử lý; IMU CSV khác nguồn |
| Perceived TTC | AebStack trên mô hình perception | Cùng mô hình từ actor GT+nhiễu/trễ | Radar shadow riêng CP; chưa sensor-driven control chính |
| GT TTC | Geometry gap/closing | Actor geometry/velocity; **CCR đã có ttc_gt**, CarlaSession:350 | Truth simulator, không truth thực địa; không fallback cho TTC perception thiếu |
| AEB/FCW/onset | Controller Java | Cùng controller | aeb là latch quyết định; onset là command onset, chưa measured-response onset |
| decel_cmd/pedal | AebTick/CarlaSession.Tick có | Pedal áp actor; recorder control.brake | Canonical Frame chưa giữ command/pedal/target_v dọc |
| Collision/impact | Ped-radius/ego-box hoặc hai vehicle boxes | Target-hit adapter+geometry; sensor collision stream riêng | Boolean canonical không đồng nhất số sensor hit; impact legacy ego speed |
| μ/available decel | min(AEBmax,vehicle max,μg) | V5 thêm min(fullBrakeDecel) | Assumption/calibration scalar cho ngoại suy, không available force đo từng tick |
| Physics/calibration | VehicleSpec dimensions/max giả định | Mass/torque read-back, full_brake_decel/physics_check trong case.carla | E-tron1800 N·m/9,13 m/s² theo ADR-051; chưa calibration ID riêng |
| Jerk | Canonical Δa/dt legacy | Canonical; filtered10Hz EXPERIMENTAL và smoothed IMU riêng | Sensor recomputation không ghi đè stored objective |
| Real-world measured | Không phải | Không phải | Chưa xác minh dataset/hợp đồng đo xe thật trong pipeline audit |

Tách bốn tầng: theoretical reference có giả định; kinematic model chưa validation thực địa;
CARLA có calibration trong simulator; real-world measured data chưa xác minh.
ADR-051 có bốn ca CARLA lịch sử, không phải test runtime Phase 11. CarlaSession:81 dùng cửa sổ
max(2,round(0,1/dt)), limit μg; kẹp **số đo** không ép tire force. Trễ controller gồm delay+actuator0,10 s+ramp.

## 4. AEB Metrics & Formula Matrix

d: gap dọc; c: closing; v m/s; a dương là độ lớn giảm tốc, a_frame âm khi phanh.
Đây là công thức/threshold thực có, không đề xuất công thức production mới.

| Metric | Formula thực dùng | Input/unit/source | Implementation | Limitation/edge cases |
|---|---|---|---|---|
| TTC perception | d/(v_ego-v_target); CP targetV=0 | m,m/s→s, controller | AebStack.java:205–224 | detected, perceivedY có số,d>0,closing≥2,0. Path gating quyết định riêng; undefined=null |
| TTC GT | CP d/v_ego; CCR d/closing | Geometry/actor GT→s | Simulator:46; LeadVehicleSimulator:59; CarlaSession:350 | Trong path,d>0; CP v>0,1/CCR closing>0,1. Không tự là ideal braking time |
| Min TTC | min frame ttc_gt; collision ép0 | s, stored | Simulator:248/256; LeadVehicleSimulator:130/137 | Không mẫu→null;0 collision là quy ước, không chia0; sampling có thể bỏ cực tiểu |
| Relative distance | CP crossingX-egoFront; CCR targetRear-egoFront | m, geometry | Simulator:140; LeadVehicleSimulator:58; CarlaSession:326 | Khác radar range Euclid; CCR UI còn thiếu dynamic targetX |
| Relative speed | egoV-targetV; radar closing=-radialVelocity | m/s | AebStack:209; TelemetryMetricsService:104–128 | TargetV có runtime chưa canonical Frame; radial không luôn là tốc độ dọc |
| Brake activation | DecisionT đầu khi TTC≤threshold và predicted path | s, controller | AebStack:212–223 | Lookahead min(TTC,2 s), corridor+margin; noise/confidence tổng hợp |
| Brake onset/delay | onset-decision; onset khi t≥decision+delay+0,10 | s, controller | AebStack:165–170; Simulator:284–285 | Command time, chưa actual decel onset; tick quantization |
| Available decel | kin min(a_nom,a_vehicle,μg); CARLA v5 thêm min(a_full) | m/s², config/calibration | Simulator:179; CarlaSession:470 | Không maximum measured theo tick/speed/wet condition |
| Required stopping envelope | t_ctrl=delay+0,10+(a_nom/ramp)/2; needed=t_ctrl+v0/(2a) | s, a_nom hoặc a_available | Evaluation:240–245 | Chưa required stopping distance metric riêng. Xấp xỉ vật cản tĩnh; dùng v0 không target profile; chưa guard a=0 tại evaluator |
| Stored stopping distance | x_last-x_onset+v_last²/(2a_available); remainder0 nếu a≤0 | m, observed+predicted | Simulator:202–218, dùng chung CCR | No brake→null; run còn chạy không là actual distance-to-stop; invalid a có thể che remainder |
| Actual braking travel | x_last-x_onset: phần đầu công thức trên | m, frames | Simulator:218 | Chưa field tách observed/remainder hoặc measured-to-stop riêng |
| Impact speed | egoV cuối run nếu collision; ngược lại null | m/s, canonical | Simulator:260–274; LeadVehicleSimulator:166 | Không relative impact; aggregate0 chỉ non-collision hợp lệ |
| Relative impact | max(0,egoV-targetV) lúc CCR hit | m/s, runtime | LeadVehicleSimulator:80–84/167; CarlaSession:355–360 | Raw metrics có; failureDetail chưa chiếu riêng; sensor calculation khác nguồn |
| Min separation | CP max(0,hypot(dx,dy)-0,3); CCR hypot(dx,dy) giữa boxes | m, geometry | Simulator:241–247; LeadVehicleSimulator:121–135 | Collision ép0; CP shape giả định; CCR summary targetY cuối phù hợp fixed lateral hiện tại |
| Max/mean decel | max positive decel; mean trên decel>0 | m/s² magnitude | Simulator.MotionStats:71–78 | Không mean toàn run; CARLA smoothed/clamped; max0→null legacy |
| Max jerk | max abs(a_i-a_prev)/dt | m/s³, MotionStats | Simulator:77 | Toàn stats, khác cửa sổ RMS và command jerk limit |
| RMS jerk | sqrt(mean(((a_i-a_prev)/dt)²)) từ onset tới cuối | m/s³, canonical stored | Simulator:202–218 | No brake→null; nominal dt/rounding/spike/kẹp ảnh hưởng; không filtered metric |
| Sensor recomputed | RMS IMU jerk hoặc Δa/Δt; travel trapezoid speed+remainder; impact khung trước hit | SI, CSV | TelemetryMetricsService:237/262/302/361 | Warmup0,5 s;brake>0,05;cắt trước hit; không gộp canonical |
| Aggregates | Mean jerk/stop trên braked; impact mean mọi valid run | SI, stored columns | AnalysisMetrics:14–55 | Missing/âm/NaN⇒INCOMPLETE/null;no-brake⇒NOT_APPLICABLE. Version aggregation không rule |
| Outcome/verdict | Collision; else near miss minTTC<1 hoặc minDist<0,5; else SAFE; FAIL nếu collision/false/missed | Categorical | Evaluation:105–138 | Near miss có thể PASS và có failure record: hai trục khác nhau |

Simulator.makeFrame:53 lưu ego_a âm khi phanh; RecordedTelemetry:19–27 giữ dấu, jerk theo Δt thực
chỉ khi hai mẫu finite và tăng thời gian. Không có lỗi đảo dấu đã chứng minh. TTC null khác0;
AnalysisViewService:501–503/513 đổi m/s×3,6 khi hiển thị. CarlaSession:508–551 lưu min/max/mean measured step:
cấu hình0,01 s không chứng minh runtime đạt0,01 s. Rounding0,001 và vi phân tăng sai số jerk.
Core thiếu guard một số denominator nhưng Bundle/range validation là lớp bảo vệ trước đó;
không khẳng định inputa=0 đi qua được web production.

## 5. Failure Classification Assessment

| Nhóm mục tiêu | Production thực có | Chưa đủ bằng chứng / giới hạn |
|---|---|---|
| False braking | triggered && !hazard; hazard=entered_path hoặc collision; FALSE_BRAKING và PATH_PREDICTION_TOO_CONSERVATIVE | Có predicted path2 s/observed geometric path; không no-brake counterfactual. Path trong closed-loop run chưa đủ phân biệt phòng ngừa hợp lý/phanh oan; chưa tách pedal ngoài AEB đầy đủ |
| Missed braking | hazard && idealTriggerT!=null && !triggered; GT TTC đầu≤threshold | Không đánh giá avoidable/unavoidable; collision ưu tiên failure_typeCOLLISION, missed flag là trục khác. GT closing>0,1 khác controller ≥2,0 ở closing thấp |
| Ineffective braking | COLLISION/LATE_BRAKING/NEAR_MISS; chain CONTROL/VEHICLE_DYNAMICS | Không INEFFECTIVE_BRAKING taxonomy riêng, chưa tách no-command/no-achieved-decel/giới hạn xe. **Documented but not implemented** cho phân loại ba nhóm đầy đủ |
| Non-AEB/inconclusive | API có INCOMPLETE/TIMEOUT/ERROR/UNCLASSIFIED/NOT_FINISHED, UI unknown | Core stage pass/fail boolean, chưa explicit inconclusive; không được suy confirmed cause từ score hằng |

Evaluation:118 quét trace đã chịu phanh, không chạy ideal actuator counterfactual.
neededNominal/Actual dùng v0/(2a), không là proof avoidability CCRm/CCRb hoặc pedestrian.
Phản chứng điều kiện áp dụng: ego20 m/s,target19 m/s có closing1 m/s; yêu cầu dừng ego như trước vật tĩnh
không trực tiếp chứng minh TTC threshold sai. Đây là phản chứng lý thuyết, chưa runtime CARLA ca đó.

Phản chứng **đã thực thi**: Simulator thật với xe max3 m/s²,μ1,a_nom8; μg 9,81>8 nhưng Dynamics nói LOW_FRICTION.
Đây là stage attribution sai; không khẳng định Dynamics luôn là primaryStage (lấy khâu đầu fail).
Characterization thứ hai: TIMEOUT+empty frames/metrics trả SAFE/PASS trong core; AnalysisService:61–69
chặn TIMEOUT/INCOMPLETE downstream. Không đồng nhất core default với AEB conclusion trên mọi UI.

Observed outcome=collision/near miss/no collision; failure category=nhãn luật; suspected cause=chain/cause_code.
Confirmed cause cần evidence/validation độc lập. `evidence_policy=RULE_BASED_HYPOTHESIS_NOT_CAUSAL_PROOF` đúng.
Score0,9 không phải90% chắc chắn. Thiếu evidence/non-AEB phải giữ inconclusive, không ép ba nhóm.

## 6. Simulation Discrepancy & Calibration Readiness

Đã đọc [plan13/11](../active/2026-11-13-do-do-lech-carla-dong-hoc.md) và
[plan11/11](../active/2026-11-11-cong-thuc-cp-crossing-carla.md); vẫn là kế hoạch, không biến dự kiến thành số đo.
Plan13/11 nói CCR ttc_gt luôn null **đã cũ**: CarlaSession:350/CarlaLeadVehicleTest có GT TTC;
decel_cmd/target_v canonical frame vẫn thiếu.

| Readiness | Hiện có | Cần trước kết luận |
|---|---|---|
| Repeatability | Run/bundle/.xosc seed; kinematic parity; CARLA sync profile | Seed không bảo đảm CARLA bitwise; lặp, log world/actors/physics/thứ tự chạy |
| Controlled inputs | run_config/source IDs/xe/AEB/bundle; physics_applied/check/map/dt | Artifact/build/calibration hashes, actual target dimensions, command/targetV trace |
| Calibration | ADR-051 e-tron torque/full-brake scalar; measure_brake pedal sweep | Ghi validity domain speed/pedal/μ/vehicle; chưa gọi kinematic là calibrated thực địa |
| Discrepancy | Có thể pair cùng bundle và so Δv/Δd/Δtime | Hai simulator khác nhau không suy ra real-world error hoặc AEB rootcause |
| Uncertainty | Measured step min/max/mean; chain confidence hằng | Chưa interval/uncertainty model; range3 lần chỉ sơ bộ |
| Independent validation | Dataset v2 split biến thể | Calibration corpus chưa runner/split thực thi; chốt split trước fit, không fit trên validation |

Đề xuất nghiên cứu **40 cấu hình**:8CCRs(speed/gap),8CCRm(closing/gap),8CCRb(−2/−6,gap/speed),
8CP_CROSSING(speed/trigger/ped),8safe(curbstop/offset/no-threat). Phân tầng khô/ướt/tốc độ thấp trong nhóm,
không cộng các lần lặp thành cấu hình độc lập. Chia trước20 calibration+20held-outvalidation:
mỗi bên4 ca mỗi nhóm và4safe. Kiểm road40/12 s/range trước; ca export từ chối ghi riêng, không đổi input âm thầm.

Mỗi cấu hình hai simulator=80 run; chọn6anchor đa nhóm CARLA thêm2 lần (tổng3/anchor)=12 run bổ sung.
Seed cố định kiểm repeatability; thay seed là thí nghiệm riêng về perception.
Pedal/speed sweep không AEB là bước riêng, không gộp40 ca end-to-end. Chưa tạo bundle/chạy calibration.

So signedΔ cùng đơn vị: collision/outcome, impact, observed braking travel, decision/onset/response/decel.
Một bên không collision thì ghi discrepancy outcome, không lấy null impact trừ số hay bỏ ca bất tiện.
Tách actual travel/remainder; protocol chốt trước xử lý collision impulses. Báo bias/spread theo nhóm,
interval kèm giả định. Không đặt arbitrary error threshold, không lấy max-min3 lần thành ngưỡng khoa học.
0,01 s là sampling contract, không accuracy threshold; acceptance phải dựa mục đích/độ phân giải/uncertainty.
Physics mismatch/TIMEOUT/missing trace ghi invalid/inconclusive và báo cả số bị loại.
40 ca chỉ exploratory coverage, chưa chứng minh accuracy tổng quát; chỉ đo xe thật độc lập mới đánh giá
real-world error. Không dùng ΔCARLA-kinematic tự động phân loại AEB failure.

## 7. Analysis UI/UX Audit

Người dùng: Engineer/Experiencer xem run/chuẩn bị tập; Reviewer/Manager đọc theo quyền/project.
Ưu tiên identity/category → technical status → outcome/collision/decision → evidence/limits → handoff.

| Màn/vị trí | Input/mục đích/nội dung hữu ích | States, responsive, accessibility, phần thiếu |
|---|---|---|
| Overview — ui/AnalysisOverview:26 | API full-scope KPI/objective groups theo AEB/xe/profile/dt | Loading/partial/zero/error riêng, không thêm widget. KPI không là confidence |
| Runs — ui/AnalysisRunExplorer:38 | Baseline mọi status, row identity/actions, chọn tập | Search/sort ghi trong trang; table region/pager/focus; không giả server search |
| Failure Explorer — ui/AnalysisFailureExplorer:18/68 | /failures server filters/KPI/stages/CSV/evidence links | Loading/empty/error riêng, labels/table scroll; dropdown outcomes chỉ collision/near-miss/false-braking, chưa missed/ineffective taxonomy |
| Run Detail — app/.../[runId]/page:29/47/106; ui/AnalysisRunSummary:20/63 | Identity/seed/result/config/environment/time links | Guards callback/ID, retry403/404, technical run tách AEB result; tabs keyboard. CCR vẫn pedestrian fields và không hiện target speed/gap/decel; quãng phanh thiếu ngoại suy note |
| Evidence — ui/AnalysisRunEvidence:44–80 | Chain/stage measurements/rule score/parameter và time links | Giữ unknown/missing, nói rõ giả thuyết; “version luật” sai nghĩa aggregation. Không cần chart confidence giả |
| Telemetry — ui/AnalysisRunTelemetry:18/34; TelemetryChart:14/44; MotionTelemetryChart:21/73 | TTC/speed trục riêng, motion/jerk projection/cursor numeric | Null/gaps giữ riêng, timeline keyboard/svg name; chữ11px trong SVG706 px quá nhỏ khi co390 px. Motion hover pointer có numeric cursor thay thế; chưa screen reader proof |
| Playback — app/.../playback/page:53/70/118; ui/AnalysisPlaybackScene:15/21/34 | Recorded frames/events, play/seek/speed/layers/related run | Missing/invalid duration/error state; không nội suy. CCR dùng crossingX cố định thay targetX; “Thực tế(GT)” dễ hiểu là thực địa. RGB/LiDAR chưa đồng bộ, UI đã ghi |
| Dataset — ui/AnalysisDatasetPreparation:21/53; AnalysisSelectionSummary | Draft role/checks vs snapshot, revisions/digest/baseline/handoffID | Busy/error/retry/readonly/legacy/empty; table scroll. Chưa khởi chạy optimizer/candidate/regression, không cần thêm dashboard |
| CARLA — app/analysis/carla/page:18; CarlaRunnerPanel | Status/run họ/sensor/artifact API riêng | Không phải playback RGB sync. Phase 11 chỉ kiểm tĩnh, không gọi live CARLA/status hoặc tạo run |

Focused browser kiểm8 màn×5 viewport1920/1366/1024/768/390, không page overflow trong fixture.
Menu chung dưới 1024px: Enter/Escape/return focus/outline đạt. Table/tabstrip được cuộn riêng.
Đã xem ảnh CCR contract mismatch và telemetry390; chart labels nhỏ thật. Không khôi phục menu cũ.
Fixture CCR bổ sung dựa trên CP parity rồi đặt category/target_kindCCR để kiểm contract presentation;
**không phải run CCR thật**, không dùng số fixture này làm kết luận vật lý.

Người dùng trả lời được run/seed/kết quả/metric đã lưu, xem collision/decision time và evidence.
Chưa trả lời chắc controller sai hay physics limit, avoidability, confirmedcause hoặc empiricalconfidence.
Giữ câu “chưa đủ evidence” khi cần, không thêm widget/biểu đồ không phục vụ câu hỏi đó.

## 8. Evidence & Traceability Gaps

| Mắt xích | Đã có trong code/schema/API | Gap |
|---|---|---|
| Scenario→run | FK scenario/version/vehicle/AEB, seed/profile/dt/run_config; schema SQL:582–661 | Legacy replayTD-40; current ID không thay actual snapshot |
| Run→raw | Artifact rows +telemetry_json frames/events/metrics/case/params/chain | RunService.persist:1053 bỏ source/engine top-level; raw.vehicle không có trong projection; original bundle/result/JAR ngoài DB vẫn cần giữ |
| Raw→metric | Timestamps, storedcolumns/source; sensor riêng | Thiếu command/targetV; actual travel vs predictedremainder chưa tách |
| Metric→rule | Chain/cause/parameter/score/evidence_policy | Evaluation chưa VERSION riêng; AnalysisViewService:542 gắn aggregation VERSION khi đọc lịch sử |
| Calibration→run | case.carla.full_brake_decel/physics_applied/check và profile xosc5 | Chưa calibration ID/hash/validity domain; bổ sungADR051ngày11/11 còn chờ identity decision, không coi mọi xosc5 tương đương |
| Conclusion→review | Run/detail/playback/measurement và snapshot/handoff | Chưa independently confirmedcause; related-run thiếu seed/xe/profile/dt |
| Missing vszero | AnalysisMetrics/RecordedTelemetry giữ null; datasetfinite/monotonictrace gates | Core thiếu defaultunknown; collision_events persist:1073 fallback missingimpact0 cần ingress test thêm, chưa end-to-endrepro |
| Immutable dataset | v2manifests/hash/revisions, split, baselinecheck | Manifestraw.vehicle có thể null; không tự chứa telemetry/JAR; chưa gọi là gói tái lập độc lập đầy đủ |

Đối chiếu **schema SQL/code truy vấn**, không đọc DB runtime/dữ liệu cá nhân.
root_causes.confidence nullableDECIMAL(4,3), không measuredprobabilitymodel; analysis_results.summary_json
giữ snapshot, không formula/calibration column riêng. JSONaggregation version không là rule/calibration version.
Related-run UI đã cảnh báo kiểm seed/xe/simulator ở playback:144; giữ cảnh báo đến khi đủ metadata.

## 9. Test Coverage Matrix

Ma trận hành vi/nguồn test, **không phần trăm linecoverage** (không chạyJaCoCo).

| Phạm vi | Test/bằng chứng đã kiểm | Gap/risk |
|---|---|---|
| Aggregation/missing/null/zero/âm | AnalysisMetricsTest (5 tests); AnalysisServiceTest (14 tests) | Stored contract tốt, không physical validation |
| Dataset split/revisions/hash/baseline/legacy | AnalysisDatasetTest (4 tests), AnalysisSnapshotTest (5 tests), AnalysisServiceTest | DB mocked, chưa MySQLconcurrency/lock đầu cuối |
| TelemetryCSV/units/serialization/collision window | TelemetryMetricsServiceTest (15 tests), test_sensor_recorder.py | Không sensor calibration runtime; malformedCSV/semantic consistency còn cần kiểm |
| TTC/geometry/false/missed/late/sideentry | SimulatorBehaviorTest (18 tests), LeadVehicleSimulatorTest (10 tests) | Không complete counterfactual/avoidability/physical uncertainty |
| CARLAbridge/sample/brake/physics | CarlaSessionLogicTest (12 tests), CarlaLeadVehicleTest (4 tests) | Syntheticactors, không CARLAserver; wetfriction/low-speed cần runtime |
| Python→Java kinematic parity | KinematicParityTest (1 tests), BundleParityTest (3 tests) | Fixture lịch sử, **không CARLA↔kinematic numeric parity** |
| Full 1296 parity | KinematicParityFullTest | SKIP: chưa vsos.parity.full/fixture ngoài repo |
| .xosc/category/identity | XoscExportTest (30 tests),XoscReadParityTest (3 tests),ScenarioCategoryTest (6 tests) | Không nghiệm thu các category chưa runner |
| Result submission/API | CarlaResultSubmissionTest (12 tests),CarlaWebTest (23 tests) | MockMvc/mock IO, identity≠semantic consistency; chưa luồng evidence hỏng đầu cuối |
| Audit counterexamples | FailureAnalysisAuditTest (2 tests) mới | Characterization hiện trạng, đổi expectation khi evaluator version mới sửa; test xanh không là algorithm safety |
| Render/navigation/charts/playback/dataset states | analysis-redesign.mjs: nhiều assertions batch1–7 chạy trước điểm FAIL | **Suite tổng FAIL** dòng846, các assertions sau đó chưa chạy |
| Current menu/responsive/CCR contract | audit-ui.mjs artifact:40 checks+CCR | Fixture API, không thay suite chính hoặc live auth |
| Real integration smoke | analysis-ui-smoke.mjs | KHÔNG CHẠY: cần evidence/DB test/backend :8101 và frontend API riêng; không dùng DB người dùng |
| Worker lifecycle/physics/recording | pytest worker: 59 PASS | Offline/mocks, không live CARLA |
| SR/zoom/touch/cross browser | Names/labels tĩnh và Edge keyboard | Chưa NVDA/VoiceOver/native touch/Firefox/Safari; không tuyên bố WCAG conformant |

## 10. Findings theo P0/P1/P2

P0: chưa xác nhận lỗi đầu cuối đủ bằng chứng. P1: rủi ro dữ liệu/evidence/diễn giải quan trọng;
P2: clarity/usability/performance/docs. Missing/cause counterexamples ghi đúng tầng và guard hiện hữu.

| ID/Severity | Component/file:vị trí | Bằng chứng/ảnh hưởng | Hướng sửa / phase đề xuất |
|---|---|---|---|
| F11-01/P1 | core/evaluation/Evaluation.java:105–138 | Empty metrics/frames+TIMEOUT→SAFE/PASS; characterization PASS. AnalysisService:61–69 chặn downstream; consumer lõi khác có thể hiểu sai | Evidence validity/inconclusive ở evaluator version mới, không rescore lịch sử;13 |
| F11-02/P1 | Evaluation:289–298; Simulator:179 | Xe max 3, μ 1, a_nom 8 vẫn LOW_FRICTION dù μg 9,81; test Simulator thật. Stage hypothesis sai, chưa chắc primary | Lưu limiting factor/source; tách vehicle/controller/friction;13/17 |
| F11-03/P1 | Evaluation:118/132/240–268 | False/missed dựa closed-loop+threshold, v0/(2a) dùng cả moving/braking target; chưa avoidability/inconclusive/ineffective | Chốt observable taxonomy/category applicability/counterfactual protocol trước đổi verdict;17 |
| F11-04/P1 | core/simulation/Frame.java:9/14; CarlaSession:245/283/350 | Tick có command/pedal/targetV, frame không; aeb flag/onset không là measured braking | Versioned optional trace; command/applied pedal/measured decel tách;15 phối hợp runner |
| F11-05/P1 | AnalysisViewService:542; AnalysisService:185/208; AnalysisMetrics:9 | “Phiên bản luật” nhận aggregation VERSION, gắn khi đọc không chứng minh historical rule | Tách aggregation/formula/evaluator/build/calibration identity, legacy UNKNOWN;16 |
| F11-06/P1 | ui/AnalysisRunSummary.tsx:63–85; AnalysisPlaybackScene:15–30; AnalysisViewService:582 | target_kind=LEAD_VEHICLE bị bỏ; scene dùng crossingX/pedY, không targetX; browser fixture tái hiện nhãn pedestrian | Fields/scene theo category, actual target geometry/x, fallback rõ;12 UI +15 trace |
| F11-07/P1 | RunService:1053–1062; AnalysisService:205–210 | Raw projection không giữ source/engine; manifest dùng raw.vehicle, manifest vehicle có thể null; artifacts ngoài DB vẫn cần | Preserve/hash original artifact/build/actual config, không suy physics từ catalog ID;16 |
| F11-08/P2 | Simulator:217–218; ui/AnalysisRunSummary:45; analysisFailurePresentation:17 | “Quãng phanh” chưa nói remainder; “phanh có hiệu lực” là command onset | Giải thích observed/extrapolated/command/missing;14 |
| F11-09/P2 | playbackPresentation:5; AnalysisPlaybackScene:30/34; TelemetryChart:44; MotionTelemetryChart:73 | “Thực tế(GT)” dễ hiểu thực địa; SVG chữ 11px co rất nhỏ trên 390 px; numeric cursor hiện có | Nhãn GT mô phỏng, note nguồn/limits, keyboard numeric +chart mobile dễ đọc;12/14 |
| F11-10/P1 | frontend/tests/analysis-redesign.mjs:846/852 | FAIL 0!=1: tìm menu Analysis cũ, shell dùng Menu chung lg:hidden; suite dừng | Cập nhật current shell regression +CCR fixtures, không khôi phục DOM cũ để test xanh;12/19 |
| F11-11/P2 | analysis-metrics-contract.md:13; architecture.md:139/171; plan 13/11 mục 4 | “Chưa hiệu chuẩn”/“cùng JSON”/“CCR GT null” đã cũ | Refresh docs theo ADR-051/code, đánh dấu plan chưa thực hiện;16/18 |
| F11-12/P2 | AnalysisService:95–122,TD-53 | Nạp toàn scalar scope rồi skip/limit Java; search/sort trong trang đã ghi rõ | Benchmark RAM/latency trước SQL count/aggregate/paging cùng filter;19 nếu quy mô chứng minh |
| F11-13/P1 | AnalysisViewService:634–644,TD-54 | Related runs chỉ cùng variant+COMPLETED, payload thiếu seed/xe/profile/dt; UI đã cảnh báo | Trả đủ identity hoặc filter cùng identity, giữ observational/archive;16 |

F11-03 là giới hạn thiết kế cần corpus trước thuật toán mới. F11-01/F11-02 có test thực thi; F11-06 có static contract/browser repro;
F11-10 có log FAIL. Không mô tả finding chưa runtime CARLA/DB như lỗi đã đo trên deployment.

## 11. Recommended Remediation Roadmap

Đề xuất Phase 12–19 dưới đây chờ nội dung từng phase từ người dùng; chưa phải ủy quyền triển khai.

| Phase | Loại công việc/ưu tiên | Deliverable và nghiệm thu |
|---|---|---|
| 12 | UI-only: F11-06/F11-09; regression F11-10 | Category fields/scene đúng, current menu test đúng; CP + CCRs/m/b fixtures, keyboard/5 viewport; không tính metric ở client |
| 13 | Data correctness: F11-01/F11-02 | Invalid không SAFE; limiting factor vehicle vs μ; evaluator version, counterexamples, archive nguyên trạng |
| 14 | Metric explanation: F11-08/F11-09 | TTC undefined/source, command vs onset, ego vs relative impact, observed vs extrapolated; chart mobile đọc được; không đổi stored formula |
| 15 | Evidence capture: F11-04 | Versioned trace decel_cmd/pedal/targetV/time; gaps explicit; bridge→persist→API tests; không AEB Python |
| 16 | Evidence/traceability: F11-05/F11-07/F11-11/F11-13 | Rule/formula/aggregation/build/calibration identity, source manifest, related-run identity, docs theo code; legacy UNKNOWN, không gán version hồi tố |
| 17 | Failure classification | Observed/category/suspected/confirmed/inconclusive, physical/category applicability và counterfactual; chốt ADR/tests trước đổi verdict |
| 18 | Calibration/validation research | Chốt trước 40 cases/split/protocol/uncertainty; chỉ chạy khi có môi trường; không claim real-world accuracy hoặc fit/validate cùng tập |
| 19 | Regression/quality/scalability | Offline/browser/isolated API matrix, CCR fixture thật, stale/source guards; benchmark lớn trước SQL optimization |

Nguồn trace và identity cần có trước diễn giải confirmed cause; UI giải thích dữ liệu hiện có có thể làm độc lập.
Đổi hành vi/kết quả phải đổi simulator identity theo ADR-042, không rescore run cũ/ghép simulator khác.
Không cần migration cho audit. MOBO/Pareto/sensitivity/robustness vẫn chưa implementation đầy đủ;
có bảng DB/dataset handoff không có nghĩa optimizer đã chạy.

## 12. Validation Results & Limitations

Artifact local gitignored: `data/analysis-phase11-2026-11-14/`.
Lệnh PowerShell từ root trừ frontend; npm.cmd/npx.cmd vì execution policy.
Java dùng `MAVEN_OPTS=-Xmx512m -XX:ActiveProcessorCount=2`.

| Kiểm tra thực thi | Kết quả | Loại bằng chứng |
|---|---|---|
| Git branch/status/log trước sửa | chuvv, sạch, HEAD 3027692 | Git local |
| Maven nhóm 18 class bên dưới |168 tests: 167 PASS, 0 fail/error, 1 SKIP | Core unit/kinematic execution/parity/backend mock/MockMvc |
| python -m pytest worker/tests -q |59 PASS | Adapter offline/mock, không CARLA runtime |
| Frontend npm.cmd run lint |PASS exit 0 | ESLint |
| Frontend npx.cmd tsc --noEmit |PASS exit 0 | Typecheck |
| Frontend npm.cmd run build |PASS exit 0,Next 16.4.1 | Production build cho browser audit |
| node tests/analysis-redesign.mjs với ANALYSIS_UI_URL=http://127.0.0.1:3123 |**FAIL exit 1**, assertion dòng 846: 0!=1 | Existing fixture suite; result.json cũ không là PASS lượt này |
| node data/.../audit-ui.mjs |PASS 40 screen/viewport checks, menu Enter/Escape/focus, CCR mismatch reproduced; 0 writes, 41 ảnh | Audit bổ sung với API interception, không thay suite FAIL |
| RepoDocsTest |PASS 5 tests, 0 fail/error/skip | Kiểm tài liệu repository |
| git diff --check và kiểm whitespace/conflict markers của hai file mới |PASS | Diff tracked + kiểm file chưa stage |

Nhóm Java đã chạy:

```powershell
.\mvnw.cmd -B '-Dtest=FailureAnalysisAuditTest,AnalysisMetricsTest,AnalysisServiceTest,AnalysisDatasetTest,AnalysisSnapshotTest,SimulatorBehaviorTest,LeadVehicleSimulatorTest,CarlaSessionLogicTest,CarlaLeadVehicleTest,TelemetryMetricsServiceTest,KinematicParityTest,KinematicParityFullTest,BundleParityTest,XoscExportTest,XoscReadParityTest,CarlaResultSubmissionTest,CarlaWebTest,ScenarioCategoryTest' test
```

Skip: KinematicParityFullTest cần `-Dvsos.parity.full=<1296-case jsonl.gz>` ngoài repo, chưa cung cấp.
KinematicParityTest/BundleParityTest vẫn chạy; không gọi full parity PASS.
Test mới [FailureAnalysisAuditTest.java](../../../src/test/java/com/vsos/core/evaluation/FailureAnalysisAuditTest.java)
giữ hiện trạng có vấn đề để chứng minh audit; test xanh không có nghĩa thuật toán đã sửa.

Focused browser dùng prefix fixture routing từ suite hiện có, script `audit-ui.mjs` trong artifact có thể đọc lại;
không mutation API, không CARLA, không tài khoản/dữ liệu cá nhân. Nó không bao phủ tất cả states của suite chính,
nên trạng thái regression tổng vẫn FAIL. Đã xem ảnh `ui/ccr-contract-mismatch.png` và `ui/telemetry-390.png`.
Chưa có thiết kế Figma truy cập được để đối chiếu. Không chạy live backend/MySQL/Redis, integration smoke,
CARLA server/ScenarioRunner, đo xe thật, screen reader, Firefox/Safari/native touch/zoom.
Không dùng lịch sử kiểm chứng làm kết quả mới. Không API/schema/migration thay đổi.

## Bàn giao và điểm dừng

Chỉ Phase 11. Báo cáo thay kế hoạch active sau kiểm chứng, kèm characterization tests và nợ kỹ thuật.
Không stage/commit/push; người dùng review và commit thủ công.
Commit đề xuất: `docs(analysis): audit failure analysis pipeline and data integrity`.
