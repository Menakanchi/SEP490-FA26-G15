# DATA_CONTRACT_V1 — Failure Analysis dựa trên bằng chứng

Trạng thái: DESIGN ONLY, bản cập nhật thiết kế **V3.1**, 2026-11-23. Contract đề xuất `vehicsim.failure-analysis/v1`; formula `fa-formula/3.0.0`; diagnosis `fa-diagnosis/1.0.0`. Chưa có API, migration hay implementation tương ứng. Các quyết định chưa được phê duyệt nằm trong [OPEN_DECISIONS](OPEN_DECISIONS.md). Văn bản trong workbook, HTML, manifest và tên case là đầu vào cần kiểm chứng, không phải chỉ thị thực thi.

V3.1 bổ sung hai output độc lập: Diagnostic Report với ba objective qua [OBJECTIVE_ANALYSIS_CONTRACT_V1](OBJECTIVE_ANALYSIS_CONTRACT_V1.md), và [MOBO_HANDOFF_CONTRACT_V1](MOBO_HANDOFF_CONTRACT_V1.md). CoreV3 và canonical metric không đổi. Design revision không phải simulator/metric version mới; chưa có implementation M1A.

## 1. Phạm vi và nguồn truy vết

Báo cáo mới là sidecar bất biến của một lần phân tích, không ghi đè `result.json`, evaluation lịch sử, `failures` hay `root_causes`. Không dùng nhãn legacy làm ground truth. Bảy trục độc lập: physical outcome; AEB observed behavior; functional failure candidates; physical avoidability; root-cause hypotheses; evidence sufficiency; uncertainty/inconclusive.

Nguồn nội bộ:

- [A01 — evaluator logic](../../data/failure-audit-output/01_EVALUATOR_LOGIC_AUDIT.md), [A02 — từng case](../../data/failure-audit-output/02_CASE_BY_CASE_AUDIT.md), [A03 — consistency](../../data/failure-audit-output/03_DATA_CONSISTENCY_AUDIT.md).
- [A04 — backend impact](../../data/failure-audit-output/04_BACKEND_IMPACT_ASSESSMENT.md), [A05 — recommendations](../../data/failure-audit-output/05_RECOMMENDED_CHANGES.md), [A06 — summary](../../data/failure-audit-output/06_AUDIT_SUMMARY.md).
- SRC: HEAD `baf0892d456b5dcf4bfc0358b7124bf6a8b6fe5a`. Artifact core metadata commit `6985f846d9757285d284e586f6686d676a6159f6`, JAR SHA256 `34f6ee911ff87e4b96ed70506096fcc49bcb276811fe621d9254da0de200d5b9`. Khác byte với build hiện tại không tự chứng minh khác logic.
- RAW: `D:/Downloads/golden18_raw_artifacts.zip` SHA256 `22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`. ON member gốc `runs/{case}/rep{1|2|3}_a1/`; OFF dùng member thực tế trong `runs_aeboff/`, lấy nguyên từ manifest, không đoán tên thư mục.
- HTML: `D:/Downloads/Bo_Cong_Thuc_Failure_Analysis_AEB_V2.html` SHA256 `c9c87978fb4226887c26035a62bb23cd65cf737e3e95b6a90cc928631662a026`.
- XLS: member `AEB_FAILURE_ANALYSIS_FULL_DATASET.xlsx` trong `D:/Downloads/drive-download-20261123T104900Z-1-001.zip`; workbook SHA256 `0cfd16acc5fe23bc2d8039565396c6cedcc1b81ddae82b26d27994e21a10836c`. Sheet `12_FORMULAS`, F01–F23 ở row 2–24, cột A:H.

Fingerprint sáu báo cáo audit đã dùng (SHA256, kiểm tra lại khi review):

| Report | SHA256 |
|---|---|
| 01_EVALUATOR_LOGIC_AUDIT.md | `60eaf8e9665f2c86aee8098f2e2bc369611b60956ad6b2107d463221abaf7252` |
| 02_CASE_BY_CASE_AUDIT.md | `38ac49eace120d81a6bae12fa681179bf8d70ad42f05b84a945885d5e46dab1b` |
| 03_DATA_CONSISTENCY_AUDIT.md | `9d643d3eae3783a23443f45b7a0ce97efae41361485dce2646046f42aeb3a35b` |
| 04_BACKEND_IMPACT_ASSESSMENT.md | `8b8c3ef167abf50d0a910e104976dee8760e3115712bd08c63aed44d4e4c6ee1` |
| 05_RECOMMENDED_CHANGES.md | `6832428b246df813eee18da8d020bc783b8ee2545a4ac94c9784c28d0f622bc0` |
| 06_AUDIT_SUMMARY.md | `3b9a09bac05a90f19f51ebb4663cf828879ee603bd088096b5b95b803782d364` |

Ký hiệu dưới đây: R = result.json; O = R `/outcome`; M = O `/metrics`; C = O `/case`; F = `sensors/frames.csv`; G = `sensors/ground_truth.csv`; E = `sensors/collisions.json`; S = `sensors/summary.json`; B = bundle.json. Mỗi locator thực phải kèm member ZIP và hash. Các file audit ở `data/` là bằng chứng local, có thể không nằm trong checkout khác.

## 2. Quy tắc kiểu dữ liệu

`EvidenceValue<T>` dùng cho mọi giá trị quan sát/dẫn xuất không chắc chắn. Những metadata định danh bắt buộc ở bảng sau dùng trực tiếp. Quy ước này là một phần của từng field, không phải chú thích tùy chọn.

| Field của EvidenceValue | Type / đơn vị | Ý nghĩa, NULL và nguồn |
|---|---|---|
| `value` | T hoặc null; unit theo bảng domain | OBSERVED là bản ghi từ nguồn, không mặc nhiên là sự thật vật lý; DERIVED là tính toán; CONDITIONAL phụ thuộc giả định. UNKNOWN/NOT_APPLICABLE/INVALID có value=null. CONFLICTING chỉ được có value nếu đó là một góc nhìn có tên, không phải giá trị hòa giải ngầm. |
| `status` | enum OBSERVED, DERIVED, CONDITIONAL, UNKNOWN, NOT_APPLICABLE, CONFLICTING, INVALID | Không null. Thiếu dữ liệu không đổi thành false/0; xung đột không lấy trung bình. |
| `unit` | string hoặc null | SI: s,m,m/s,m/s²,m/s³,N·s,rad; null cho categorical/dimensionless. Độ gốc được lưu trong source, chuyển rad có formula ref. |
| `clock_id` / `frame_id` | string hoặc null / string hoặc null | Time series bắt buộc clock; hình học bắt buộc frame; null chỉ khi không áp dụng hoặc nguồn chưa biết, kèm reason. Không tự đặt clock chung. |
| `source_refs` | array<SourceRef>, có thể rỗng | OBSERVED phải có ≥1 ref; DERIVED phải truy về ref/input IDs và formula. Rỗng chỉ cho UNKNOWN/NOT_APPLICABLE hoặc metadata do policy tạo, nêu reason. |
| `formula_id` / `assumptions` | string hoặc null / array<string> | formula null cho observed; derived bắt buộc ID/version. assumptions ghi cả counterfactual, boundary, filter và interpolation. |
| `bounds` | {lower:number,upper:number,kind:BOUND hoặc STANDARD_UNCERTAINTY hoặc EXPANDED_UNCERTAINTY,coverage_factor:number hoặc null} hoặc null | Cùng đơn vị value. lower≤upper. Không tự chuyển fit score thành sai số; coverage_factor chỉ có với expanded uncertainty và cơ sở thống kê. |
| `reason_codes` | array<string> | Không null. Khi value null hoặc conditional/conflicting phải có lý do; dùng mã ổn định, không chỉ prose. |

`SourceRef` có đúng: `artifact_id:string`; `locator:string` (JSON pointer, CSV row range + columns, source path + method + line hoặc workbook sheet/cells); `input_ids:array<string>`. Artifact registry: `id:string`, `uri:string` (local/member, không chứa credential), `sha256:string|null`, `media_type:string`, `integrity:VERIFIED|FAILED|UNVERIFIED`. Hash thiếu → UNVERIFIED; integrity FAILED cách ly artifact, không xóa bằng chứng từ nguồn khác.

Các kiểu dùng chung: vector3={x:number,y:number,z:number}; pose={position:vector3,rotation:vector3}, rotation=(roll,pitch,yaw) rad; thiếu một thành phần bắt buộc thì EV<vector3/pose>.value=null, không điền0. Các object nguồn opaque chỉ được lưu để truy vết, không dùng trực tiếp trong phép tính nếu chưa có typed adapter.

Số là finite JSON number; cấm NaN/Infinity. Các ID DB BIGINT và actor/frame/sequence serialize dưới dạng decimal string để tránh mất chính xác trên client. Boolean có đủ true/false/null; array rỗng không chứng minh coverage đầy đủ. JSON pointer bên dưới thuộc normalized input `/input` hoặc output `/report`, không phải field đã tồn tại trong source. Field mới chưa ghi được trong Golden18 phải UNKNOWN, tuyệt đối không bổ sung vào raw.

## 3. Envelope và identity

| JSON path | Type / unit | Nguồn, thời gian/hệ tọa độ, đo hay dẫn xuất | NULL / legacy / bất đồng |
|---|---|---|---|
| `/schema_version`, `/formula_version`, `/policy_version` | string ×3 / — | Metadata analyzer; không có clock/frame | Bắt buộc; không dùng R.format thay version mới. |
| `/analysis_id`, `/created_at_utc` | string / —; RFC3339 string / UTC | Analyzer identity và thời điểm tạo report | Bắt buộc; analysis_id mới cho mỗi record, không giả DB run_id. |
| `/analyzer_build_id`, `/content_digest` | string ×2 / — | Analyzer metadata và SHA256 của canonical report content không gồm created_at_utc/analysis_id/content_digest | Bắt buộc; pin build, input hashes và versions để replay; không lấy hash raw thay content digest. |
| `/input/run_key`, `/input/case_key` | string ×2 / — | Member manifest + content identity; không spatial/time | Bắt buộc offline key; không phải nhãn failure. |
| `/input/database_run_id` | string / — | DB nếu đã bind hợp lệ | null khi offline; source={} trong 72 run không được fabricate identity. |
| `/input/mode`, `/input/seed` | EV<ON\|OFF\|UNKNOWN>; EV<integer> / — | XOSC/manifest/R.seed, observed metadata | Giữ từng claim nếu mâu thuẫn; không suy ON từ có pedal. |
| `/input/simulator`, `/input/core_sha256`, `/input/source_commit` | EV<string> ×3 / — | R.simulator, lifecycle.core.sha256, environment metadata | null khi thiếu; engine/version khác nhau không gộp mặc định. |
| `/input/artifacts` | array<Artifact> | Registry nguyên bản | Bắt buộc; không bỏ artifact lỗi khỏi registry. |
| `/input/parameters/ttc_threshold` | EV<number> / s | O.params.ttc_threshold; config | null nếu thiếu/mâu thuẫn; 091=.6, các case khác=1.5. |
| `/input/parameters/activation_delay` | EV<number> / s | O.params.brake_activation_delay | Config, không phải physical lag đo; mặc định source .15 không thay field thiếu. |
| `/input/parameters/max_deceleration`, `/input/parameters/buildup_rate` | EV<number> / m/s²; EV<number> / m/s³ | O.params.max_deceleration, brake_buildup_rate | Config, không phải achieved decel; Golden18=8,20. |
| `/input/environment/road_friction`, `/input/environment/grade` | EV<number> / 1; EV<number> / rad | C.road_friction là run config; grade cần pose/road evidence, chưa có validated grade trong Golden18 | B.variant.friction=null không thay μ đã resolve; không suy μ từ weather. |
| `/input/environment/weather`, `/input/environment/map` | EV<string> ×2 / — | C.weather, C.carla.map; run-local metadata | Thiếu context → UNKNOWN; không lấy DB hiện tại. |
| `/input/physical_limits/vehicle_max_decel`, `/input/physical_limits/full_brake_decel` | EV<number> ×2 / m/s² | B.vehicle.max_brake_decel_mps2; C.carla.full_brake_decel hoặc B.vehicle.carla.full_brake_decel_mps2, tách claims nếu khác | Golden18 nominal9.5/full9.13; không gọi full9.13 là achieved ở mọi speed/domain. |
| `/input/physical_limits/actuator_delay`, `/input/physical_limits/jerk_cap`, `/input/physical_limits/gravity` | EV<number> / s,m/s³,m/s² | Source AebStack constant.10; AebParams jerk cap20; Simulator.G9.81; source-derived model params | Thiếu source vintage → UNKNOWN; không phải đo physical delay/jerk/grade. |
| `/input/requirements` | array<{id:string,version:string,status:APPROVED hoặc DRAFT,scope:string,source_refs:array<SourceRef>}> / — | External approved requirement hoặc draft policy record | [] không tạo duty mặc định; DRAFT không support functional confirmation. |
| `/input/policy_parameters/safety_margin`, `/input/policy_parameters/near_clearance` | EV<number> ×2 / m | Approved policy artifact; không có số được chốt từ corpus | null khi DRAFT/missing; chặn supported margin/NEAR_MISS claim phụ thuộc, không default .5m. |
| `/input/policy_parameters/prediction_horizon`, `/input/policy_parameters/max_interpolation_gap` | EV<number> ×2 / s | Versioned motion/coverage policy; source registry | Missing → UNKNOWN cho absence/prediction claims; không tự dùng toàn run làm ex-ante horizon. |
| `/input/policy_parameters/physical_onset_decel`, `/input/policy_parameters/physical_onset_duration` | EV<number> / m/s²; EV<number> / s | Approved measurement policy + baseline/filter evidence | Missing → physical_onset UNKNOWN; recorder pedal threshold không thay thế. |
| `/input/model_refs` | array<{id:string,artifact_id:string,role:DYNAMICS hoặc ACTION_SET hoặc UNCERTAINTY_SET hoặc MOTION_PREDICTOR hoặc FILTER}> | Versioned model specification artifact gắn assumptions/parameter domain; cùng source registry | Không có model ref phù hợp thì canonical feasibility UNKNOWN; không tạo certificate từ source heuristic. |
| `/input/termination/reason`, `/input/termination/time` | EV<string>; EV<number> / s | O.end_reason, duration_s, core clock | Không coi COLLISION là sensor authority; thời gian end có clock, khác S.duration_s vẫn giữ. |
| `/input/termination/coverage_end` | EV<number> / s | Last valid physics snapshot trên clock tương ứng | Không lấy CSV sensor-only tail làm physics coverage. |

## 4. Clocks, coverage và geometry input

`/input/clocks[]` gồm `id:string`; `origin:EV<string>`; `absolute_start:EV<number>` (s world elapsed); `to_reference_offset:EV<number>` (s, t_ref=t_this+offset); `alignment_method:EV<FRAME_JOIN|RECORDED_ORIGIN|INFERRED_TRAJECTORY|UNKNOWN>`; `max_error:EV<number>` (s). Clock offset không có chứng cứ thì null, không tự dùng +.01 cho mọi run. Inferred alignment chỉ cho phân tích conditional; không chứng minh causal order của sự kiện sát nhau.

`/input/coverage[]` gồm `stream_id:string`; `clock_id:string`; `start:EV<number>`, `end:EV<number>` (s); `missing_intervals:array<{start:number,end:number}>` cùng clock; `max_sample_gap:EV<number>` (s); `completion:EV<COMPLETE|RIGHT_CENSORED|LEFT_CENSORED|UNKNOWN>`; `callback_drain_watermark:EV<string>` (frame ID); `actor_scope:array<string>`. Rỗng missing_intervals chỉ nói không thấy gap trong đoạn đã ghi, không chứng minh stream được attach sớm/drain đủ.

| Input path (mỗi sample) | Type / unit | Source; time/frame; M=đo, D=dẫn xuất | NULL, legacy và disagreement |
|---|---|---|---|
| `/input/actors[]/actor_id`, `role`, `type_id` | string ×3 / — | G.actor_id,role,type_id; M simulator snapshot | Actor binding bắt buộc khi dùng collision/geometry; thiếu thì claim liên quan UNKNOWN. |
| `/input/states[]/world_frame`, `time` | string; EV<number>/s | G.frame,sim_time_s; recorder clock | Không join core t với recorder t bằng row index. |
| `/input/states[]/actor_id` | string / — | G.actor_id | Không null cho valid state. |
| `/input/states[]/position` | EV<vector3> / m | G.x_m,y_m,z_m; CARLA world; M | Không thay bằng ego_x core; khác projection là hai series. |
| `/input/states[]/velocity`, `acceleration` | EV<vector3> / m/s; m/s² | G.vx_ms,vy_ms,vz_ms và ax_ms2,ay_ms2,az_ms2; world; M | Thiếu thành phần không tự gán 0; scalar speed riêng không đủ vector collision speed. |
| `/input/states[]/yaw`, `pitch`, `roll` | EV<number> ×3 / rad | G.yaw_deg→rad D; pitch/roll không có trong G | pitch/roll UNKNOWN trong dataset; flat-road approximation phải CONDITIONAL. |
| `/input/geometry[]/id` | string / — | Stable local geometry identity gồm source vintage/model | Bắt buộc; nominal/applied có ID khác nhau để geometry_results trỏ đúng. |
| `/input/geometry[]/actor_id` | string / — | Actor registry | Bắt buộc khi geometry usable. |
| `/input/geometry[]/shape` | EV<OBB\|DISC\|CAPSULE\|POLYGON> | Source model/bbox metadata; M config/model | Không đổi axis-expanded box thành mesh truth. |
| `/input/geometry[]/length`, `width`, `height` | EV<number> ×3 / m | B.vehicle nominal và C.carla.physics_applied; riêng source refs | Giữ nominal và applied thành hai geometry record, không overwrite; 4.75×1.93 khác 4.855709×2.032757. |
| `/input/geometry[]/center_offset`, `local_rotation` | EV<vector3> / m; EV<vector3> / rad | Actor bounding_box transform nếu có | Golden18 thiếu full bbox transform → UNKNOWN, không mặc định actor center là box center. |
| `/input/geometry[]/radius` | EV<number> / m | Ped model .3 trong core; D/model parameter | Không gọi .3 là measured mesh radius; uncertainty chưa biết. |
| `/input/core_frames[]/time`, `ego_front_x`, `ego_speed`, `ego_accel_legacy` | EV<number> / s,m,m/s,m/s² | O.frames[].t,ego_x,ego_v,ego_a; core trajectory frame; source convention xác minh CarlaSession | ego_a là signed acceleration =−DecelMeter output, đã gate/clamp; không acceleration raw; ego_x/front projection không world actor center. |
| `/input/core_frames[]/detected`, `/input/core_frames[]/confidence_raw`, `/input/core_frames[]/perceived_y` | EV<boolean>; EV<number>/1; EV<number>/m | O.frames[].detected,confidence,perceived_y; core clock; perceived_y theo source local-left convention | Không có track ID/delivery time không được tạo track state đầy đủ; confidence không probability. |
| `/input/core_frames[]/ttc`, `/input/core_frames[]/ttc_gt` | EV<number> ×2 / s | O.frames[].ttc và ttc_gt; radar/legacy instantaneous-GT values tách source | Null không safe; TTC_GT không oracle collision2D; chỉ replay legacy rule ở namespace riêng. |
| `/input/core_frames[]/fcw_latched`, `/input/core_frames[]/decision_latched` | EV<boolean> ×2 / — | O.frames[].fcw,aeb; core clock, latched state | aeb=true chỉ decision latch, không actual command/pedal. OFF vẫn có shadow latch. |
| `/input/core_frames[]/target_x`, `target_y`, `target_vy` | EV<number> / m,m,m/s | O.frames[].ped_x,ped_y,ped_vy; core projection | Không dùng như full world footprint; mapping cần source refs. |

CARLA world là hệ trái x-forward, y-right, z-up theo [CARLA 0.9.16 sensors](https://carla.readthedocs.io/en/0.9.16/ref_sensors/). Local projection chọn forward f=(cosψ,sinψ), left l=(sinψ,−cosψ), tọa độ dot với f,l; yaw theo CARLA, chuyển deg→rad. Transform đầy đủ cần pose và bbox local transform. Không mix left của tracker với world y. Mọi output geometry phải chỉ rõ geometry_id và `ACTUAL_TRAJECTORY|EX_ANTE_CONSTANT_VELOCITY|COUNTERFACTUAL_ACTION`.

## 5. Collision evidence riêng

`/input/collision_evidence[]` dùng cùng schema cho từng nguồn, không làm phẳng thành bool.

| Field | Type / unit | Path gốc / nguồn; clock/frame; đo/dẫn xuất | NULL, compatibility và bất đồng |
|---|---|---|---|
| `id`, `kind` | string; enum SENSOR_CONTACT, CORE_TERMINATION, CORE_CALLBACK, GEOMETRY_INTERSECTION, LEGACY_FLAG | E event; O.end_reason/events; model; evaluation.aeb_result.collision | Không null; CORE_CALLBACK chỉ tạo nếu raw ghi riêng, Golden18 chưa có. |
| `occurred` | EV<boolean> | E có positive event → observed true; M.collision là legacy claim | E=[] chỉ là zero recorded events, occurred=UNKNOWN nếu chưa chứng minh complete coverage. |
| `time`, `world_frame` | EV<number>/s; EV<string> | E[].sim_time_s,frame recorder | CORE event ở clock core; không merge bằng time làm mất hai nguồn. |
| `other_actor_id`, `other_actor_type` | EV<string> ×2 | E[].other_actor_id,other_actor | Không khẳng định target contact khi không bind actor; ego assumed sensor attach phải xác minh. |
| `impulse` | EV<number>/N·s | E[].impulse_ns, magnitude | 0 là recorded 0, không loại collision; thiếu → null. |
| `preimpact_frame` | EV<string> | E[].gt_frame_before | Không lấy sample sau hit làm trước hit. |
| `ego_preimpact_speed`, `other_preimpact_speed`, `relative_preimpact_speed` | EV<number>/m/s ×3 | E[].ego_speed_before_ms,other_speed_before_ms,relative_speed_before_ms | Scalar relative đã ghi giữ nguyên; kiểm lại vector G trước hit khi có. Không fallback \|speedE-speedP\| cho crossing. |
| `geometry_id`, `coverage_id` | string hoặc null ×2 | Registry | Geometry null cho sensor contact; coverage null không làm positive event biến mất, nhưng chặn suy vắng mặt. |

Sensor event không bằng geometric proximity và cũng không phải certification mesh truth. Rule hòa giải mặc định trong policy: positive matching contact → COLLISION trên cơ sở recorded event; mismatch legacy true/event empty → outcome UNKNOWN, giữ hai claims. [A02 các case011/091; A03 mismatch]. Authority có thể đổi chỉ bằng policy version mới.

## 6. AEB command timeline riêng

`/input/control_events[]`:

| Field | Type / unit | Nguồn / clock / loại | NULL và legacy |
|---|---|---|---|
| `id`, `stage` | string; DETECTION, FCW, DECISION, COMMAND_ENGAGED, COMMAND_EMITTED, CONTROL_APPLIED, PHYSICS_CONSUMED, VELOCITY_OVERRIDE | O.events/M cho 4 stage đầu; worker logs tương lai cho các stage sau | Không suy tồn tại emitted/applied/consumed từ decision. |
| `time`, `world_frame`, `sequence` | EV<number>/s; EV<string>; EV<string> | Core t hoặc callback/worker tick, ghi clock riêng | Golden18 core không có world frame; cross-clock ordering có thể UNKNOWN. |
| `writer` | EV<AEB\|PLANNER\|SCENARIO_RUNNER\|INITIALIZATION\|FINISHED_HOLD\|EXTERNAL_OVERRIDE\|UNKNOWN> | Provenance writer log | Pedal hiện tại không có writer; không gán AEB bằng mode ON. |
| `effective` | EV<boolean> | Evidence emitted/applied/consumed theo stage | OFF shadow D/Q có effective=false, hypothetical=true; absence command cần coverage. |
| `hypothetical` | boolean | Mode OFF shadow hoặc replay; derived metadata | Bắt buộc; không đếm vào actuation/latency/FP/ineffective. |
| `request_decel` | EV<number>/m/s² | Core command trace nếu có | Không có per-tick request trong raw → UNKNOWN; không lấy M.max_decel làm command. |
| `pedal`, `throttle` | EV<number>/1 ×2 | F.brake,throttle là observed control sample; không khẳng định stage CONTROL_APPLIED nếu chỉ có live read | Pedal [0,1]; F phải lưu ở physical/control samples dưới đây khi chưa biết applied. |
| `velocity_override` | EV<vector3>/m/s | Worker constant velocity operation trace | Golden18 chỉ có aggregate low_speed_override_frames, không dựng timeline giả. |

Legacy `brake_onset_t` map thành COMMAND_ENGAGED, không thành onset gia tốc. `aeb_decision_t` map DECISION. Source `AebStack.control` engage sau activation_delay+.10s và ramp rời rạc; không cộng ramp duration vào field latency legacy. OFF giữ shadow timeline ở namespace hypothetical; actual control samples vẫn quan sát được. [A01,A03; AebMode.markOff, worker/vehicsim_aeb_control.py run_step].

## 7. Physical braking/control samples riêng

`/input/physical_samples[]`:

| Field | Type / unit | Source; time/frame; loại | NULL / disagreement |
|---|---|---|---|
| `time`, `world_frame` | EV<number>/s; EV<string> | F.sim_time_s,frame; recorder | Sample snapshot/control có acquisition semantics khác nhau, không coi atomic. |
| `pedal_readback`, `throttle_readback`, `steer_readback` | EV<number>/1 ×3 | F.brake,throttle,steer; live get_control | M simulator API; writer/physics consumption UNKNOWN. |
| `speed` | EV<number>/m/s | F.ego_speed_ms live read hoặc G.speed_ms snapshot, tách source series | Không trộn hai speed series vào derivative. |
| `imu_accel_x`, `imu_jerk` | EV<number>/m/s²; EV<number>/m/s³ | F.imu_accel_x_ms2,imu_jerk_ms3; sensor-local frame | Sensor pose/gravity/grade chưa biết → không đồng nhất b_physical. |
| `longitudinal_decel` | EV<number>/m/s² | D từ G.velocity và declared path/filter/window | Chỉ tạo khi đủ timestamps; impulse, startup và overrides phải mask có lý do. |
| `writer`, `consumed_world_frame` | EV<string> ×2 | Future provenance; không có Golden18 | null=UNKNOWN. Pulse .3 của012 không được quy AEB. |

Derived `/report/braking`: `first_pedal_sample:EV<number>/s` (strict >.05, ≥.5s, trước collision, chỉ tái hiện thống kê recorder); `physical_onset:EV<number>/s` (cần baseline, filter, threshold và sustain duration theo policy); `peak_decel:EV<number>/m/s²`; `tracking_rmse:EV<number>/m/s²`; `jerk_rms:EV<number>/m/s³`; `command_to_physical_delay:EV<number>/s`. Mọi field này cần window/clock/frame/source/formula trong wrapper. Thiếu command source, baseline hoặc alignment → delay UNKNOWN. Threshold recorder không phải tiêu chí onset vật lý.

## 8. Radar và calibration scope riêng

| Normalized path | Type / unit | Nguồn và ngữ nghĩa | NULL / compatibility / disagreements |
|---|---|---|---|
| `/input/radar_streams[]/id`, `role` | string; PRIMARY_AEB hoặc RECORDER | C.carla.perception_radar vs F radar columns | Hai sensor khác nhau; không thay primary bằng recorder. |
| `/input/radar_streams[]/mount`, `config` | EV<pose>; EV<object> | C.carla.perception_radar.tracker config; worker/sensor_recorder.py mount | pose={position:vector3[m],rotation:vector3[rad]}; config opaque original object giữ source, không dùng unknown fields tính toán. |
| `/input/radar_observations[]/time`, `frame`, `stream_id` | EV<number>/s; EV<string>; string | Primary callback raw nếu có; F.time/frame cho recorder | Primary raw Golden18 không có; stats không dựng point cloud. |
| `/input/radar_observations[]/depth`, `azimuth`, `altitude`, `radial_velocity` | EV<number>/m,rad,rad,m/s | Primary point record tương lai; recorder F.radar_depth_m,radar_rel_velocity_ms là selected summary, góc thiếu | Radial Doppler không phải target vx/vy. Không gán selected point cho target khi chưa associate. |
| `/input/tracks[]/id`, `measurement_time`, `delivered_time`, `consumed_time` | EV<string>; EV<number>/s ×3 | Controller/tracker trace tương lai | Golden18 thiếu; không dùng hindsight GT như input đã biết ở Q. |
| `/input/tracks[]/forward`, `left`, `v_forward`, `v_left` | EV<number>/m,m,m/s,m/s | Core perceived_y chỉ cho left nếu convention chứng minh; forward/v_left không có đầy đủ trace | Không dùng ped_vy GT thay v_left tracker; missing → UNKNOWN. |
| `/input/tracks[]/detected`, `confidence_raw`, `rejection_reason` | EV<boolean>; EV<number>/1; EV<string> | O.frames.detected,confidence; rejection log nếu có | Confidence_raw là score, không probability; in-view không chứng minh observability/recall. |
| `/input/calibration[]/id`, `version`, `artifact_sha256` | EV<string> ×3 | C.carla.pedal_map/full_brake metadata + calibration artifact nếu có | Name không đủ validated domain; không dùng DB calibration hiện tại cho run cũ. |
| `/input/calibration[]/corrected_field` | string | Explicit field: pedal_to_decel, speed, IMU, jerk… | Bắt buộc; một calibration không hợp thức hóa mọi signal. |
| `/input/calibration[]/domain` | EV<object> | Validated set: vehicle/physics hash, simulator/map/grade, speed range[m/s], friction, weather, load, controller/adapter version | Domain.value={constraints:array<DomainConstraint>,validation_artifact_ids:array<string>}; thiếu domain trong Golden18 → UNKNOWN. Không suy domain từ danh sách xe của XLS F19. |
| `/input/calibration[]/residual_bounds` | EV<object> | Measured residual model và test coverage | Thiếu → UNKNOWN; fit 80% không có nghĩa ±20%. |
| `/report/calibration_applicability[]/field`, `status`, `reason_codes` | string; IN_DOMAIN\|OUT_OF_DOMAIN\|UNKNOWN\|NOT_APPLICABLE; array<string> | D từ record/hash/domain và run context | Không gộp bool; missing domain là UNKNOWN, khác OUT. |

DomainConstraint={path:string,operator:EQ hoặc IN hoặc CLOSED_RANGE,value:string hoặc number hoặc boolean hoặc array<string> hoặc {min:number,max:number},unit:string hoặc null}. path thuộc normalized run context, không expression code; EQ/IN so đúng kiểu, CLOSED_RANGE dùng cùng unit. Constraint thiếu context thì UNKNOWN; validation_artifact_ids phải trỏ evidence validation thật, không chỉ tên map. Scope mỗi corrected_field riêng, không union tùy tiện các calibration domains.

## 9. Output có thể tiêu thụ bởi backend

Các object dưới đây bắt buộc hiện diện; EV null chỉ cho claim thiếu dữ liệu, không bỏ field. Geometry/feasibility results được lưu dạng danh sách để không trộn nhiều mô hình.

| Output path | Type / unit | Semantics và nguồn | Missing/legacy |
|---|---|---|---|
| `/report/physical_outcome` | EV<SAFE\|COLLISION\|NEAR_MISS\|UNKNOWN> | Theo policy; assumptions chứa basis và claim level, source refs bắt buộc cho known | UNKNOWN là categorical value với status UNKNOWN và value=null; tên nhãn UNKNOWN là cách hiển thị, không serialize literal thay null. Legacy outcome lưu riêng. |
| `/report/observed_behavior` | EV<AEB_COMMAND_ENGAGED\|AEB_DECISION_PENDING\|NO_RECORDED_AEB_COMMAND\|CONTROL_ACTIVITY_UNATTRIBUTED\|OFF_HYPOTHETICAL_ONLY\|UNKNOWN> | Timeline summary; không khẳng định physical braking từ command | Nhiều sự kiện giữ đầy đủ, summary không xóa control activity khác. |
| `/report/functional_candidates[]` | array<Claim> | Claim.type = FALSE_BRAKING,NO_BRAKING,INEFFECTIVE_BRAKING | [] nghĩa không có candidate được hỗ trợ, không đồng nghĩa PASS. |
| `/report/functional_assessment` | EV<NO_SUPPORTED_FAILURE\|FAILURE_SUPPORTED\|INCONCLUSIVE\|NOT_APPLICABLE> | FAILURE_SUPPORTED cần explicit requirement và sufficient evidence; OFF NOT_APPLICABLE | Không map legacy FAIL/PASS tự động. |
| `/report/geometry_results[]` | array<GeometryResult> | Xem schema dưới; model output, không contact truth | Missing model tạo EV UNKNOWN, không clearance=0. |
| `/report/feasibility_results[]` | array<FeasibilityResult> | Separate stopping vs 2D avoidance | Model conditional không tự PHYSICAL_LIMIT. |
| `/report/root_cause_hypotheses[]` | array<Claim> | Không thứ tự causal priority ngầm | [] được phép; legacy chain không tự nâng CONFIRMED. |
| `/report/confirmed_root_cause` | EV<string> | Chỉ qua policy evidence threshold/adjudication | Golden18 toàn UNKNOWN; không đặt confidence .9. |
| `/report/evidence_sufficiency[]` | array<Capability> | Claim-local gates | Partial run không xóa known contact. |
| `/report/uncertainty_notes`, `/report/inconclusive_reasons` | array<string> ×2 | Reason codes và limitations có refs qua capabilities/claims | Bắt buộc; không score xác suất. |
| `/report/disagreements[]` | array<Disagreement> | Xung đột còn mở | Không hòa giải tự động. |
| `/report/legacy` | object {artifact_id:string,json_pointer:string} | Pointer đến nguyên R.evaluation/O.metrics, không clone có sửa | Nếu không có legacy, object null; không tạo default SAFE. |

`Claim` = {`id:string`, `type:string`, `status:SUSPECTED|SUPPORTED|REFUTED|UNKNOWN|NOT_APPLICABLE`, `evidence:EV<string>`, `requirement_id:string|null`, `alternatives:array<string>`, `missing_evidence:array<string>`}. Với hypothesis, SUPPORTED vẫn không CONFIRMED root cause. Không có confidence probability field. Human adjudication ngoài phạm vi implementation hiện tại, khi có phải có identity, evidence và policy version trong source refs.

`GeometryResult` = {`id:string`, `geometry_id:string`, `trajectory_kind:string`, `decision_time:EV<number>[s]`, `horizon_start:EV<number>[s]`, `horizon_end:EV<number>[s]`, `conflict:EV<boolean>`, `intervals:array<Interval>`, `minimum_clearance:EV<number>[m]`, `pet:EV<number>[s]`, `pet_relation:EV<DISJOINT|OVERLAPPING|CENSORED|NOT_APPLICABLE>`}. Interval={`enter:EV<number>[s]`, `exit:EV<number>[s]`, `left_censored:boolean`, `right_censored:boolean`}; EV clock inherited from result. Empty intervals only proves no conflict within a COMPLETE, resolved horizon and declared model. Formula_spec defines full-body solver and boundary inclusivity.

`FeasibilityResult` = {`id:string`, `reference_time:EV<number>[s]`, `model_id:string`, `action_set_id:string`, `stopping_distance:EV<number>[m]`, `available_distance:EV<number>[m]`, `stopping_margin:EV<number>[m]`, `latest_decision_windows:array<Interval>`, `avoidability:EV<AVOIDABLE_UNDER_MODEL|UNAVOIDABLE_UNDER_MODEL|UNKNOWN>`, `search_certificate:EV<string>`}. Empty search certificate forbids UNAVOIDABLE_UNDER_MODEL; model assumptions/integrity/calibration dependencies in EV. PHYSICAL_LIMIT is a policy conclusion tied to a specific certificate, never a synonym for margin<0.

`Capability`={`id:string`, `claim_id:string`, `status:SUFFICIENT|PARTIAL|INSUFFICIENT|NOT_APPLICABLE`, `required:array<string>`, `available:array<string>`, `missing:array<string>`, `source_refs:array<SourceRef>`}. `Disagreement`={`id:string`, `field_path:string`, `claim_refs:array<string>`, `status:OPEN|RESOLVED_BY_VERSIONED_POLICY`, `resolution_policy:string|null`, `reason_codes:array<string>`}. Claims differing clock/units are not compared until transform validated.

Canonical digest scope là toàn envelope với ba field analysis_id, created_at_utc, content_digest bị loại, bao gồm input registry, analyzer build và versions. Quy tắc serialization phải được version-pinned khi implement (key order, number representation, Unicode, array order); chưa có canonicalizer đã được chọn ở Phase2, do đó khác serialization profile không được so digest như cùng identity. Không hash tự tham chiếu content_digest.

## 10. Import/validation invariants

1. Validate artifact integrity/schema first; isolate bad source, retain positive evidence from independent valid sources. Monotonic timestamps within stream; duplicate frame with different content → disagreement; gaps do not interpolate silently.
2. Positive event requires valid run/ego/actor binding. Absence requires coverage from attach through relevant horizon and drain watermark. `[]` is not sufficient.
3. Distinguish measured snapshot/live API, config, source-derived timeline, and counterfactual. Never present configured max decel as achieved, or GT shadow as actual primary perception.
4. Geometry guard: named shape/size/center transform/pose/clock; missing full geometry allows nominal conditional result only. Any projection used must disclose plane/heading/offset.
5. Ex-ante diagnosis uses only inputs delivered/consumed no later than decision time; future GT is hindsight evidence in another result.
6. No arbitrary default: no event impact=null; no eligible denominator=UNKNOWN; missing calibration=UNKNOWN; missing cause=UNKNOWN; OFF actual AEB diagnosis NOT_APPLICABLE.
7. Golden18 exact counts and per-run obligations are in [GOLDEN18_EXPECTED_BEHAVIOR](GOLDEN18_EXPECTED_BEHAVIOR.md). Contract round-trip must preserve legacy bytes/hash and all 12 collision disagreements.

## 11. V3.1 extension — objective inputs, baseline binding và hai output

Phần1–10 vẫn là core evidence contract. Extension này additive, opt-in theo objective/handoff schema riêng; không thay API hay historical result. Bốn parameters chỉ configuration/context/hints, không decision variables của một optimizer nằm trong Failure Analysis.

| Normalized input/output path | Type / unit | Source thật, NULL, derived/measured và compatibility |
|---|---|---|
| `/design_revision`, `/objective_analysis_schema` | string ×2 / — | V3.1 và vehicsim.objective-analysis/v1, metadata do analyzer tạo |
| `/input/project_id`, `scenario_id`, `variant_id` | EV<string> ×3 / — | DB project/scenario/scenario_version IDs, verified run/source binding; variant_id không lấy runs[].variant label. Golden18 đều UNKNOWN |
| `/input/artifact_run_key` | string / — | Raw metadata.run_id như FA-G1-001-R1 là artifact key; không cast sang DB ID |
| `/input/baseline_binding` | Baseline object của MOBO_HANDOFF mục 5.3 | Version_no,label,status/creation lineage/current baseline và4values snapshot; thiếu DB binding→UNKNOWN, không infer v1 từ AebParams.DEFAULT |
| `/input/recorded_objectives/rms_jerk_mps3` | EV<number> / m/s³ | O.metrics.rms_jerk_mps3; evaluation.aeb_result copy; DB simulation_runs.rms_jerk_mps3. Canonical as-recorded, không raw sensor recompute |
| `/input/recorded_objectives/impact_speed_mps` | EV<number> / m/s | Same exact paths/key. No canonical collision→per-run null; aggregate contribution0 là field/concept khác |
| `/input/recorded_objectives/stopping_distance_m` | EV<number> / m | Same exact paths/key; total trace+extrapolation, không đặt nghĩa measured-only |
| `/input/canonical_sample` | CanonicalSample hoặc null | Schema MOBO_HANDOFF mục 5.2; AnalysisService.sample + row scalar flags/status/trace. Đây là stored aggregation projection, không physical truth. Thiếu required status/identity thì null, không fabricate COMPLETED |
| `/input/metric_producer_profile` | EV<string> / — | Simulator/profile/dt + signal/filter/window/source vintage; aggregation version alone không đủ |
| `/input/metric_aggregation_version` | string / — | AnalysisMetrics.VERSION=adr040-stored-aggregation/1, source confirmed. Không invented objective version thay nó |
| `/input/metric_lineage/signal`, `filter`, `window` | EV<string> ×3 / — | C.carla.jerk_filtered.{signal,filter,window} và pinned producer source. Filter object gốc giữ opaque; normalized description có refs |
| `/input/metric_lineage/dt`, `t_aeb`, `command_onset` | EV<number> ×3 / s | C.carla.fixed_delta_seconds, M.t_aeb_s,M.brake_onset_t; core clock. Mốc khác nhau, thiếu không thay bằng first pedal |
| `/input/stored_metric_disagreements` | array<Disagreement> | M↔evaluation↔DB, actual profile↔freeze metadata; không chọn số đẹp hơn để hòa giải |
| `/report/objectives` | map<3 exact objective keys,ObjectiveEvidence> | Full schema trong OBJECTIVE_ANALYSIS mục 5; cùng report giữ timeline/feasibility/candidates/hypotheses/sufficiency/inconclusive |
| `/handoff_reference` | EV<string> / — | Reference đến separate MOBO handoff artifact ID+hash; không nhét proposed_params/campaign side effects vào Diagnostic Report |

Input `/input/parameters` tiếp tục là4actual run-resolved config, không baseline identity proof. Raw O.params dùng lower-case, DB/engine dùng4uppercase codes; mapping by key trong MOBO_HANDOFF mục 6, không dựa positional order.

Output provenance invariants:

1. `canonical_value` là scalar đã lưu; physical event impact dùng collision evidence riêng. No recorded admissible contact→physical event value null; canonical non-null vì legacy geometry vẫn giữ với disagreement.
2. Stopping decomposition có trace_component và extrapolated_component/model/last_speed/a_extrap/window; scalar-only thiếu inputs→breakdown UNKNOWN, không lấy current DB calibration để điền.
3. Jerk canonical dùng đúng gated/clamped ego_a/filter/window của producer profile; diagnostic raw-GT/IMU jerk giữ ID riêng, không đổi canonical.
4. Dataset v2 manifests không chứa mọi raw metrics/frames; binding/digest lookup cần registry/authorized source, không đoán JSON.
5. Handoff không có baseline score/suggested range khi baseline/approved domain/canonical cohort thiếu. Hints luôn SUSPECTED hoặc ABSTAIN, không confirmed cause/optimizer action.
6. Scalar readable, physical interpretation sufficient và MOBO eligible là ba trạng thái khác nhau. Root cause UNKNOWN không tự làm metric invalid; unresolved metric/identity/contact quality không được che bằng scalar finite.
7. EV.source_refs cho known dùng exact field locator và hash profile. Semantic AnalysisService.digest khác byte SHA256; không interchange.

## 12. Source fingerprints V3.1

SHA256 source bytes ở HEAD đã pin; không phải hash runtime deployment hay calibration validation. Phải giữ riêng với Golden18 JAR hash. Những file này được đọc trực tiếp, không thực thi/build.

| Source path | SHA256 |
|---|---|
| [src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java](../../src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java) | `a98d3df710d0ccf42794136384c9c1c07d7a52e29a046a360387aa444131eb17` |
| [src/main/java/com/vsos/backend/service/analysis/AnalysisService.java](../../src/main/java/com/vsos/backend/service/analysis/AnalysisService.java) | `e478ed167ca6d7f83ef00f70b189cf8ce6ba04060e6486d343b29d276a359554` |
| [src/main/java/com/vsos/backend/service/optimization/OptimizationService.java](../../src/main/java/com/vsos/backend/service/optimization/OptimizationService.java) | `abe10997fef03dfd01749a806d50e90467df8e18167f29f0f213cdc2d428c786` |
| [src/main/java/com/vsos/core/mobo/MoboEngine.java](../../src/main/java/com/vsos/core/mobo/MoboEngine.java) | `fff2fbe62f7291c0a6a3f2c00a00c9e00c24639de4cbbd705995671605219c7b` |
| [src/main/java/com/vsos/core/mobo/MoboTrial.java](../../src/main/java/com/vsos/core/mobo/MoboTrial.java) | `1cdf0b45235e238d7ec0ac1580d3d2fa4b6c8369f1c58ded5553fe35363f8a02` |
| [src/main/java/com/vsos/core/mobo/ParameterBounds.java](../../src/main/java/com/vsos/core/mobo/ParameterBounds.java) | `cb509c68a58a2c491f0e63e47dcde61d1a3044a94515d6bda224578e0d7ce5f8` |
| [src/main/java/com/vsos/backend/service/system/BootstrapService.java](../../src/main/java/com/vsos/backend/service/system/BootstrapService.java) | `68d6bb26a6924faa56a91383a286716fe8284643ff431d4a1787cb4da62555ac` |
| [src/main/java/com/vsos/backend/repository/project/ProjectRepository.java](../../src/main/java/com/vsos/backend/repository/project/ProjectRepository.java) | `2a9fa53cc8127871e5e45bbaa14fc3a13eeaaca07ef394333375ff917bfb8e35` |
| [src/main/java/com/vsos/backend/repository/common/Queries.java](../../src/main/java/com/vsos/backend/repository/common/Queries.java) | `2de146d90b510dbc03ac31987acb597325181dc972aafdf771ed613bedcf1a0a` |
| [src/main/java/com/vsos/backend/service/aeb/AebService.java](../../src/main/java/com/vsos/backend/service/aeb/AebService.java) | `214fceab9772a28b56661c0ad054d088c0712d0f6c8758078454820784a02237` |
| [src/main/java/com/vsos/core/aeb/AebParams.java](../../src/main/java/com/vsos/core/aeb/AebParams.java) | `7a99c0c47463ba5d6f1cd98d46d8aa0d9e31fa631b95def5d1fdd98075d74d6a` |
| [src/main/java/com/vsos/core/aeb/Filters.java](../../src/main/java/com/vsos/core/aeb/Filters.java) | `9d9a9d3df1f46ddc76f36e7351ea9dd72adf7d3de92ee2a301d159788dcf81e7` |
| [src/main/java/com/vsos/core/simulation/Simulator.java](../../src/main/java/com/vsos/core/simulation/Simulator.java) | `e8b01649b57aaa1c8c9acf0f34b324426a24959fbf04b149370e755a1e5ce9c8` |
| [src/main/java/com/vsos/core/simulation/CarlaSession.java](../../src/main/java/com/vsos/core/simulation/CarlaSession.java) | `9bacd1665412fb33689c532ac22e8eeb3c7e6c502ffba44d78ce94dc93b179f2` |
| [src/main/java/com/vsos/backend/service/simulation/RunService.java](../../src/main/java/com/vsos/backend/service/simulation/RunService.java) | `b0979812f439842390dd3da77661893228d406a85684377380663276d7ab061e` |
| [database/mysql/01_schema.sql](../../database/mysql/01_schema.sql) | `e6a7c3b560f5a64b92c4a2cb95497630d17fa56b74ad9601d0b335d9fe3a4eea` |
| [database/mysql/migrations/018_2026-11-23_ttc-mac-dinh-1-5.sql](../../database/mysql/migrations/018_2026-11-23_ttc-mac-dinh-1-5.sql) | `8f7a801cb51eec76e654a4061c83dfa220225f8066087b3b3c19c00bb23b3cce` |
| [src/main/java/com/vsos/backend/controller/optimization/OptimizationController.java](../../src/main/java/com/vsos/backend/controller/optimization/OptimizationController.java) | `30c6fb24456149406e3fb6daacd1aed3756b9c88657402e3d13679fdd98e2347` |
| [src/main/java/com/vsos/backend/controller/analysis/AnalysisController.java](../../src/main/java/com/vsos/backend/controller/analysis/AnalysisController.java) | `7b520c3bf50da3e4273b8576b8d9e6f2a97061b5d3095fd3b6071ae82278de4e` |
| [src/main/java/com/vsos/backend/common/Json.java](../../src/main/java/com/vsos/backend/common/Json.java) | `c58c7096586b8435e945d5f781175bbe7b86eccabb2a321453a5651f7202db0a` |
| [frontend/src/components/aeb/MoboSection.tsx](../../frontend/src/components/aeb/MoboSection.tsx) | `f28be3c489f438138232665867aa77652c046181bc36b35b99b356065f01db28` |
