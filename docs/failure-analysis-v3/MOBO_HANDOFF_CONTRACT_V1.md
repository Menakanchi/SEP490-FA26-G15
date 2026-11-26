# MOBO_HANDOFF_CONTRACT_V1 — Evidence → objective cohort → optimizer boundary

V3.1 / DESIGN ONLY. Schema đề xuất `vehicsim.failure-analysis-mobo-handoff/v1`, không phải API/schema đã implement. Companion: [OBJECTIVE_ANALYSIS](OBJECTIVE_ANALYSIS_CONTRACT_V1.md), [DATA_CONTRACT](DATA_CONTRACT_V1.md), [GOLDEN18](GOLDEN18_EXPECTED_BEHAVIOR.md), [BLUEPRINT](REFACTOR_BLUEPRINT.md). Giữ canonical `adr040-stored-aggregation/1` và nguyên CoreV3; không chạy tối ưu, tạo candidate/version, freeze DB hay tự tạo baseline score/search bounds.

## 1. Consumer hiện tại thực sự nhận gì

Source tại HEAD `baf0892d456b5dcf4bfc0358b7124bf6a8b6fe5a`. Đây là đọc source, không xác nhận backend runtime/build đã chạy thành công.

| Boundary hiện hữu | Input/output thật | Điều đã xác nhận và giới hạn |
|---|---|---|
| [AnalysisController](../../src/main/java/com/vsos/backend/controller/analysis/AnalysisController.java) L116–131 | POST /analysis/selections: scenario_id,baseline_id,optimization_run_ids,validation_run_ids,run_revisions. GET /analysis/datasets/{id}/handoff → saved dataset | Không tự gọi optimizer |
| [AnalysisService.freeze](../../src/main/java/com/vsos/backend/service/analysis/AnalysisService.java) L151–217 | Lưu `vehicsim.analysis-dataset/v2` vào analysis_results; exact fields phần2 | Freeze hai tập, kiểm baseline/revision/identity/trace và objectives |
| Cùng file `handoff` L262–286 | Input datasetId; trả snapshot sau freshness checks | `handoff_ready=true` chỉ archive/baseline/source freshness, không consumer đã nhận V3 hoặc physical quality đạt |
| [MoboSection UI](../../frontend/src/components/aeb/MoboSection.tsx) L9–18,100–106 | Props baselineId/initialScenarioId; createOptimization gửi scenario_id,base_aeb_version_id,name,max_trials,n_initial_points | Không gửi dataset ID/partition/hints, khớp API gap; không có UI runtime test ở task này |
| [OptimizationController.OptimizationRequest](../../src/main/java/com/vsos/backend/controller/optimization/OptimizationController.java) L40–64 | POST /optimizations: scenario_id(required),base_aeb_version_id,max_trials,n_initial_points,name,search_space,objective_config,simulator_type | **Không có dataset_id, optimization_run_ids, validation_run_ids, hints hoặc evidence refs**. Gọi endpoint tạo campaign/chạy jobs; không gọi trong task này |
| OptimizationService.createAndStartRun L408–448 | supplied base_aeb_version_id →same-project aeb_versions row; nếu null mới Queries.baselineVersion; vehicle lấy activeVehicle tại creation | Explicit version lookup không kiểm status=BASELINE/current; không phải verified frozen baseline/vehicle binding |
| [OptimizationService.executeOptimization](../../src/main/java/com/vsos/backend/service/optimization/OptimizationService.java) L658–1132 | Đọc optimization_runs; lấy latestBaseVersionId(scenario), variantsOf(baseVersion); tự thu baseline rồi trials | Không đọc AnalysisService.handoff/frozen partition. Cần integration future nếu muốn đúng frozen cohort |
| `getOrCreateBaselineRuns` L1152–1272 | Query completed ON cùng project/scenario/AEB/simulator/vehicle, ORDER BY id; map key scenario_version_id, latest row thắng; thiếu thì chạy thêm | Không pin seed/run list/dt/digest/frozen role. Có thể lấy run không thuộc selection; một variant chỉ một baseline row. Query không giới hạn baselineMap vào current variants list, nên computeStats có thể bao gồm historical variants nếu DB có chúng; chưa đo actual DB effect |
| `createOptimizationRuns` trong [RunService](../../src/main/java/com/vsos/backend/service/simulation/RunService.java) L288–315 | Nhận variants + baselineMap; candidate chép seed/simulator của baseline row và kiểm vehicle | Giữ pairing hữu ích, không chứng minh đúng frozen run/partition; không nhận nhiều seed cho cùng variant qua map hiện tại |
| `proposeCandidate` L1352–1369 | Reads completed optimization_trials → MoboTrial; gọi `new MoboEngine(ParameterBounds.defaults(),nInitialPoints,42L).propose(trials)` | Stored search_space_json không được dùng để dựng bounds trong call này; algorithm seed42 không phải scenario/run seed |
| [MoboEngine.propose](../../src/main/java/com/vsos/core/mobo/MoboEngine.java) L45–95 | Java `List<MoboTrial>` → `MoboProposal(params,samplingSource,acquisitionValue,paretoTrialNumbers)` | Typed engine API, không JSON handoff parser. Bốn params/ba objectives, không evidence/hints consumer |
| [MoboTrial](../../src/main/java/com/vsos/core/mobo/MoboTrial.java) L6–15 | number:int, params:Map<String,Double>,rmsJerk:Double,impactSpeed:Double,stoppingDistance:Double,constraintViolated:boolean | Objective vector order **jerk,impact,stopping**. valid chỉ !constraintViolated và3non-null; không finite/nonnegative/lineage/quality validation |
| `selectCandidateForVerification` L2279–2403 | TrialID → candidate version + RegressionService.createTest(project,user,candidate,scenario,true,true,null,notes) | Không truyền frozen validation_run_ids/datasetId. Pareto không đồng nghĩa regression PASSED/Reviewer Accept |

AGENTS/CLAUDE/kế hoạch20/10 còn câu “MOBO chưa triển khai”; source có engine/service/controller/trial flow. Kết luận đúng là **code hiện có, frozen dataset/V3 consumer integration chưa có**, không suy availability chỉ từ tài liệu hoặc class name. Không sửa các tài liệu ngoài output.

## 2. Current dataset v2 và khoảng cách tương thích

Fields do `AnalysisService.freeze` thực sự tạo:

`schema`; `evaluation`; `scenario{id,code,name,category}`; `baseline{id,label}`; `reference{vehicle_id,simulator,dt}`; `optimization_run_ids`; `validation_run_ids`; `runs[]`; `optimization_objectives`; `validation_objectives`; `manifests[]`. Khi trả/đọc thêm `id,baseline_current,created_at`; handoff thêm `handoff_ready`.

`runs[]` qua item L78–92 có run_id,scenario_id,scenario_version_id,version_no,family,variant,seed,baseline_id,vehicle_id,simulator,dt,status,outcome,failure_class,weather,time_of_day,error,end_reason,trace_available,metrics{3 objectives},created_at,revision. **variant là label; variant_id của handoff phải map scenario_version_id, không parse label.** Outcome/failure_class legacy chỉ là claims, không physical truth.

`evaluation` hiện có version,source,per_run_definition,filter,impact,stopping_distance,identity,carla_observational_only. L186–189 luôn ghi `impact=EGO_SPEED_NOT_RELATIVE` và `per_run_definition=ADR040_LEGACY_UNCHANGED` dù xosc15 là relative impact + filtered jerk. Đây là known metadata conflict [A04/A05 P0-05], không sửa archived JSON. New sidecar giữ literal claim + corrected **descriptor có source refs**, reason METRIC_METADATA_CONFLICT; chặn silent consumer misinterpretation.

`manifests[]` chứa run_id,scenario_config,case,params,vehicle,metric_source,evaluation_version,artifact_digest,config_digest. Không toàn raw/frames/metrics; muốn kiểm lại phải đọc referenced source/registry và digest. Không đưa field `variant_id`/`aeb_parameters` vào current JSON tưởng đã tồn tại.

Freeze gates thực tế (L151–210):

- Mỗi tập1..500 unique positive IDs; disjoint run IDs, cùng project/scenario/current baseline; revision đúng preview.
- ON,purpose BASELINE,scenario version GENERATED do SELECT; cùng AEB,vehicle,simulator_version,dt.
- Toàn selection không duplicate pair scenario_version_id+seed; không overlap variant giữa optimization/validation, kể cả khácseed.
- Mỗi tập có ít nhất một outcome=SAFE **theo legacy AnalysisService.outcome**. Không coi đó là CoreV3 SAFE đã xác nhận.
- Valid/sample và trace; validation evidenceComplete, thêm missing checks cho braked; optimization objectivesAvailable(cả3VALID).
- validTrace checks finite t,ego_x,ego_v,ego_a,ped_x,ped_y,ped_vy; t strictly increasing và ego_v≥0.
- Snapshot kèm semantic artifact/config digests. Handoff kiểm current baseline, rows/item sameValue và raw/config digest unchanged. Legacy dataset v1 không handoff.

`AnalysisService.digest` L244–258: recursive TreeMap sort keys; List order giữ; Number→BigDecimal.stripTrailingZeros; Json.write UTF-8→SHA256. Đây là **semantic digest của JSON**, khác raw file SHA256 hay ZIP member hash. Handoff lưu tên digest algorithm/profile, không so hai loại như cùng hash.

## 3. Canonical aggregate vs optimizer aggregate hiện hữu

Canonical giữ `AnalysisMetrics.aggregate` / `AnalysisService.sample` như OBJECTIVE_ANALYSIS mục 4. Không thay objective chỉ để “khớp MOBO”.

`OptimizationService.evaluateCandidateRuns` L1426–1683 hiện dùng:

- `aeb_activated` (decision flag) làm activated, không tri-state sample.braked.
- Mean jerk/stopping trên activated rows có metric non-null, **bỏ null**; count0 trả0.
- Impact: collision rows cộng metric nếu non-null, nếu null cộng0; chia mọi run; no-collision đóng góp0.
- Không canonical finite/nonnegative/trace/endReason/flag checks trong helper; execute loop chỉ kiểm status COMPLETED.
- Round HALF_UP3decimals cho3 objective,2decimals cho rates. AnalysisMetrics mean không round thêm.
- Empty runs helper trả3zero với violated=true; không được dùng như legitimate baseline/trial score.

Vì vậy không claim bitwise/semantic equivalent. Chỉ có **conditional numerical parity** trên cùng run cohort khi activation membership trùng sample.braked, mọi applicable scalar finite/present, flags/trace/endReason valid và áp đúng rounding policy. Ngay khi đủ dữ liệu, cần phân biệt mean canonical và consumer-rounded display/trial scalar, không thay lưu canonical để đồng nhất.

Constraint thực tế: collision_rate=100×count(collision)/N, FP_rate=100×count(is_false_positive)/N. Violation nếu collision_rate>baseline_rate+.01 **percentage points**, hoặc FP increase>RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS(5)+1e−9. `objective_config_json` được lưu default objectives=[RMS_JERK,RELATIVE_IMPACT_SPEED,STOPPING_DISTANCE],constraints có collision max="baseline",false_activation_increase_pts max=5; evaluator helper không đọc custom objective_config để thay luật. Không gọi custom config đã enforced.

BaselineStats hiện chỉ chứa collisionRatePct,falseActivationRatePct, không có3baseline objectives. Proposed handoff thêm baseline objectives từ canonical frozen cohort; không tự thêm baseline thành MoboTrial(number=0), không tạo giả trial/score. Legacy FP flag dùng constraint hiện hữu là policy claim, không training ground truth; mapping sang V3 false-brake constraint còn OD-11/12.

Consumer compatibility kết luận hiện tại: **NOT_DIRECTLY_CONSUMABLE** cho schema V3.1. Cần adapter/integration future để giữ cohort/digests/eligibility/canonical metric semantics. Không rewrite MoboEngine; không gửi report/hints làm `proposed_params`.

## 4. Baseline version identification, nhất là v1

Evidence source:

- [BootstrapService](../../src/main/java/com/vsos/backend/service/system/BootstrapService.java) L29–36 seed catalog; L76–82 tạo version_no=1,label=v1.0,source=MANUAL,status=BASELINE, TTC override1.5.
- [ProjectRepository.insert](../../src/main/java/com/vsos/backend/repository/project/ProjectRepository.java) L154–166 tạo v1.0 và chép catalog, TTC override1.5.
- [Queries.baselineVersion/aebValues](../../src/main/java/com/vsos/backend/repository/common/Queries.java) L28–43 đọc current status BASELINE và values theo ID.
- [migration018](../../database/mysql/migrations/018_2026-11-23_ttc-mac-dinh-1-5.sql) chỉ đổi catalog default, không đổi aeb_parameter_values lịch sử.

Fresh source-seeded tuple với catalog hiện tại: TTC1.5s,delay.15s,max8m/s²,buildup20m/s³. **Đây là source seed definition, chưa là verified live project baseline.** Existing catalog có thể đã khác; ensureDefaultProject idempotent không rewrite project có sẵn. AebParams.DEFAULT giống tuple không chứng minh DB version identity.

Confirmation procedure đề xuất, read-only:

1. Bind authorized project và current baseline row qua Queries; record id,version_no,label,status,parent/source và snapshot refs/time/digest.
2. Read đủ4aeb_parameter_values, units/catalog snapshot; không điền AebParams.DEFAULT khi thiếu.
3. Verify selected DB run.aeb_version_id và raw source/config vintage, params thực tế khớp version snapshot. Default-filled/overridden runtime cần evidence riêng; mismatch không ép match.
4. Nếu yêu cầu **v1**, phải chứng minh version_no=1 và creation lineage/label phù hợp project, không chỉ label text hoặc id=1. Current baseline có thể làversion khác; không rename thànhv1.
5. Freshness trước export và trước future consumption: baseline changed →stale report/handoff blocked, archive giữ nguyên.

Baseline identity_status: SOURCE_SEED_ONLY, RUN_VERSION_BOUND, PROJECT_BASELINE_CONFIRMED, UNKNOWN, CONFLICTING. Boolean `confirmed_as_v1` chỉ true khi đầy đủ binding/lineage; thiếu thì EV UNKNOWN. Golden18 source={} và metadata run_id là local string →project_id,DB run_id,variant_id,AEBversion_id,baseline label/score **UNKNOWN**.17case tuple mặc định và091TTC.6 không thành verified v1, không gộp cả18 thành baseline cohort.

## 5. Proposed MOBO Handoff schema

Dùng EV<T>,SourceRef,Artifact,Capability trong DATA_CONTRACT. ID DB là decimal string ở sidecar; current Java DTO Long không đổi. Mọi bảng dưới đây là **normalized contract mới**, current JSON chỉ như phần1/2. Nơi chưa biết dùng EV.value=null/status UNKNOWN + reason; UNKNOWN không số0/ID giả.

### 5.1 Envelope và dataset

| Path | Type / unit | Source / NULL và invariant |
|---|---|---|
| `/schema_version`, `/design_revision` | string ×2 | vehicsim.failure-analysis-mobo-handoff/v1; V3.1 |
| `/handoff_id`, `/created_at_utc` | string; RFC3339UTC | New report identity; không campaign/runID |
| `/core_contract`, `/objective_contract`, `/aggregation_version` | string ×3 | vehicsim.failure-analysis/v1; vehicsim.objective-analysis/v1; adr040-stored-aggregation/1 |
| `/source_registry_ref` | string | Registry/hash manifest dùng chung, không chứa secrets |
| `/dataset/snapshot_schema`, `snapshot_id`, `snapshot_digest` | EV<string> ×3 | Current frozen v2 nếu đã tồn tại; offline Golden18 null/UNKNOWN |
| `/dataset/project_id`, `scenario_id` | EV<string> ×2 | Verified source/project row; không parse từ case name |
| `/dataset/selection_status` | UNFROZEN,FROZEN,STALE,UNKNOWN | FROZEN cần reviewed immutable source + roles và digest, không chỉ manifest CSV |
| `/dataset/baseline_current` | EV<boolean> | Last authorized read; missing không false pass |
| `/dataset/optimization_run_ids`, `validation_run_ids` | array<string> ×2 | DB IDs từ confirmed selection; [] không đủ cohort, không tự select |
| `/dataset/diagnostic_control_run_keys` | array<string> | OFF/unbound keys giữ diagnostic only, không optimization/validation IDs |
| `/dataset/cohort_digest`, `digest_profile` | EV<string> ×2 | Hash role/partition/order/identity/selection input; semantic vs byte digest named |
| `/members` | array<Member> | Mọi selected/excluded/unknown/control member đều hiện; không drop silently |

### 5.2 Member

| Relative field trong Member | Type / unit | Mapping / semantics |
|---|---|---|
| `member_id`, `run_key` | string ×2 | Stable artifact identity; raw manifest.run_id như FA-G1-001-R1 map run_key |
| `run_id`, `variant_id`, `scenario_id`, `baseline_aeb_version_id` | EV<string> ×4 | DB run.id,scenario_version_id,scenario_id,aeb_version_id; source={}→UNKNOWN |
| `seed` | EV<integer> | result.seed / DB random_seed verified; không sinh seed mới |
| `replicate`, `attempt` | EV<integer> ×2 | Raw metadata; không coi rep là seed mới |
| `mode` | EV<ON hoặc OFF> | Source mode; OFF luôn diagnostic only |
| `partition` | OPTIMIZATION,VALIDATION,DIAGNOSTIC_ONLY,EXCLUDED,UNKNOWN | Reviewed selection, không infer từ failure label |
| `case_roles` | array<SAFE_CONTROL hoặc HAZARD_ENCOUNTER hoặc BOUNDARY hoặc CAUTION_CANDIDATE hoặc DIAGNOSTIC_ONLY hoặc UNKNOWN> | Design/review role, không truth label |
| `role_basis`, `role_evidence_refs` | DESIGN_INTENT hoặc EVIDENCE_REVIEWED hoặc UNKNOWN; array<SourceRef> | SAFE_CONTROL theo design không đáp ứng confirmed physical SAFE gate tự động |
| `run_status`, `end_reason`, `simulator`, `dt` | EV<string> ×3; EV<number>/s | Raw lifecycle/DB identity; no matching →UNKNOWN, không COMPLETED giả từ manifest.OK |
| `actual_parameters` | map<4 uppercase Code,EV<number>> | O.params lower-case mapping phần6; units theo code |
| `artifact_digest`, `configuration_digest` | EV<string> ×2 | Source digest + explicit profile; giữ byte SHA trong registry |
| `diagnostic_report_ref` | EV<string> | Core report ID+hash registry entry; chưa phân tích thì UNKNOWN |
| `failure_evidence_refs`, `objective_evidence_refs` | array<SourceRef> ×2 | Facts/candidates/hypotheses, không cause labels để fit GP |
| `canonical_sample` | CanonicalSample hoặc null | Exactly fields từ AnalysisMetrics.Sample; không đủ DB binding/completeness thì null+eligibility reasons |
| `eligibility` | MemberEligibility | Phần8; không root-cause-required cho numerical metric |

CanonicalSample={status:string,endReason:string|null,collision:boolean|null,falsePositive:boolean|null,falseNegative:boolean|null,verdict:string|null,braked:boolean|null,jerk:number|null,impact:number|null,stopping:number|null}. Units jerk m/s³,impact m/s,stopping m. Type identity giữ Java camelCase; sample chỉ là stored contract projection, không physical ground truth. Không dựng COMPLETED/verdict/false flags thiếu để vượt valid gate.

MemberEligibility={canonical_read:ELIGIBLE hoặc EXCLUDED hoặc UNKNOWN,optimization:ELIGIBLE hoặc EXCLUDED hoặc UNKNOWN,validation:ELIGIBLE hoặc EXCLUDED hoặc UNKNOWN,objective_status:map<3 objectiveKey,ELIGIBLE hoặc EXCLUDED hoặc UNKNOWN hoặc NOT_APPLICABLE>,reason_codes:array<string>,capability_refs:array<string>}. OFF optimization/validation EXCLUDED với OFF_CONTROL_ONLY; canonical scalar có thể vẫn đọc cho diagnostic.

### 5.3 Baseline, objective và provenance

| Path | Type / unit | Source / missing |
|---|---|---|
| `/baseline/version_id`, `version_no`, `label`, `project_id` | EV<string>,EV<integer>,EV<string>,EV<string> | Verified row+run binding phần4; không default v1 |
| `/baseline/identity_status`, `confirmed_as_v1`, `current` | enum phần4; EV<boolean> ×2 | Thiếu binding →UNKNOWN, không infer từ tuple |
| `/baseline/parameter_values` | map<4code,EV<number>> | Verified version snapshot. Raw actual values riêng trong members; mixed tuple không có single baseline config |
| `/baseline/actual_config_matches_version` | EV<boolean> | Compare complete4codes và source vintage, không approximate label match |
| `/baseline/parameter_digest`, `evidence_refs` | EV<string>; array<SourceRef> | Version values/source snapshot hashes |
| `/baseline_objectives/optimization`, `validation` | EV<AggregateBundle> ×2 | Read canonical frozen output/replay authorized cohort; unavailable→UNKNOWN, không tính một score từ toàn72raw |
| `/baseline_objectives/availability` | KNOWN,UNKNOWN,NOT_APPLICABLE | Known cần confirmed baseline+cohort+same metric. Không confused với BaselineStats rates trong existing optimizer |
| `/baseline_objectives/source_dataset_digest` | EV<string> | Pin đúng dataset/partition/ordering |
| `/failure_evidence` | array<SourceRef> | Union evidence refs; unknown root không chặn facts export |
| `/parameter_hints`, `/search_ranges` | array<ParameterHint>; map<4code,SearchRange> | Phần6/7; không proposed_params |
| `/provenance` | Provenance | Pin versions/hashes/context dưới đây |
| `/eligibility_manifest` | EligibilityManifest | Phần8 |
| `/consumer_compatibility` | ConsumerCompatibility | Phần9; current overall NOT_DIRECTLY_CONSUMABLE |

AggregateBundle giữ đúng shape `AnalysisMetrics.aggregate`: {version:string,rms_jerk_mps3:Objective,impact_speed_mps:Objective,stopping_distance_m:Objective,invalid_runs:integer}; Objective={value:number|null,samples:integer,missing:integer,notApplicable:integer,unit:string,status:VALID hoặc INCOMPLETE hoặc NOT_APPLICABLE}. Source keys camelCase không đổi. Một mean không tự converted scalar vào MoboTrial nếu status không VALID. Canonical aggregate notApplicable/missing không bị thay bằng new diagnosis flags.

Provenance={simulator:EV<string>,fixed_delta_seconds:EV<number>[s],core_jar_sha256:EV<string>,core_source_commit:EV<string>,worker_sha256:EV<string>,scenario_runner_version:EV<string>,scenario_runner_sha256:EV<string>,calibration_refs:array<CalibrationRef>,metric_aggregation_version:string,metric_source_hashes:array<SourceHash>,parameter_catalog_ref:EV<string>,baseline_version_snapshot_ref:EV<string>,dataset_snapshot_ref:EV<string>,diagnostic_policy_version:string,formula_version:string}. SourceHash={path:string,sha256:string,commit:string}; CalibrationRef={id:EV<string>,version:EV<string>,artifact_sha256:EV<string>,corrected_field:string,applicability:IN_DOMAIN hoặc OUT_OF_DOMAIN hoặc UNKNOWN hoặc NOT_APPLICABLE}. Source-code hash của pedal map không phải calibration validation-artifact hash. Metadata name/version thiếu hash/domain phải giữ UNKNOWN; không copy hash JAR sang mọi thành phần.

## 6. Bốn parameter: context và suspected hints

| Code / unit | Actual O.params key | Catalog seed allowed interval | Engine defaults interval |
|---|---|---|---|
| TTC_THRESHOLD / s | ttc_threshold | [.50,4.00] | [.50,3.50] |
| BRAKE_ACTIVATION_DELAY / s | brake_activation_delay | [.00,.50] | [.05,.45] |
| MAX_DECELERATION / m/s² | max_deceleration | [3.00,10.00] | [5.00,10.00] |
| BRAKE_BUILDUP_RATE / m/s³ | brake_buildup_rate | [5.00,20.00] | [5.00,20.00] |

Nguồn catalog: [schema seed](../../database/mysql/01_schema.sql) L884–887, [BootstrapService](../../src/main/java/com/vsos/backend/service/system/BootstrapService.java) L29–33; runtime enforcement [AebService.createCandidate](../../src/main/java/com/vsos/backend/service/aeb/AebService.java) L46–74 đọc actual aeb_parameters. Nguồn engine: [ParameterBounds.DEFAULT/PARAM_KEYS](../../src/main/java/com/vsos/core/mobo/ParameterBounds.java) L11–18. Đây là **sourced intervals**, không guessed search recommendation và không chứng minh live catalog khớp seed.

Engine parameter dimension order TTC,delay,build-up,max-decel; AebParams.CODES order TTC,delay,max-decel,build-up. Luôn map by key; cấm zip hai positional arrays theo thứ tự nhãn UI. Six retired/fixed parameters không search hints để optimizer thay: confidence threshold,relative velocity threshold,prediction horizon,safety margin,jerk cap,actuator response.

Methodology hint:

1. Begin objective evidence/timeline/feasibility, list missing prerequisites và nonparameter alternatives.
2. Chỉ chọn trong4codes khi source control mechanism liên hệ được symptom; actual track/actuator trace chưa đủ thì status SUSPECTED, không confirmed causal recommendation.
3. Nêu direction để **review**, tradeoffs trên3 objective và safety/caution; không numeric candidate, predicted score/gradient, Pareto hay confidence probability.
4. Tham chiếu actual baseline parameter và current bounds evidence; không apply thay đổi, không chạy sweep.
5. Nếu symptom thuộc perception/geometry/clock/calibration hoặc thiếu causal chain →ABSTAIN/NO_PARAMETER_HINT thay vì force TTC hint.

| Mechanism candidate cần evidence | Hint có thể nêu, chưa là lệnh chỉnh | Tradeoffs / giới hạn |
|---|---|---|
| Valid observable hazard và Q muộn so feasible2D decision window; trace cho thấy TTC threshold liên quan | REVIEW/CONSIDER_INCREASE TTC_THRESHOLD | Có thể tăng caution/false-brake, đổi stopping window; late detection/nullD không được chữa bằng threshold-only claim |
| Command delay chiếm opportunity và validated scheduled/physical timing tách rõ | REVIEW/CONSIDER_DECREASE BRAKE_ACTIVATION_DELAY | Delayconfig không toànphysicallag; sensor clock/order missing→ABSTAIN |
| Sufficient demand nhưng validated envelope có room cho command cap, avoidability supported | REVIEW/CONSIDER_INCREASE MAX_DECELERATION | μ/vehicle/adapter saturation có thể không có hiệu lực; jerk/comfort/caution; không tự coi physicalcap là allowed parameter max |
| Ramp transition liên quan actual jerk/response evidence | REVIEW build-up; CONSIDER_DECREASE cho comfort hoặc CONSIDER_INCREASE cho response khi có evidence | Hai hướng đánh đổi impact/distance; source J cap20, không propose>20; filter/window/override alternatives giữ nguyên |
|007/012 không track hoặc012writer unknown | ABSTAIN; parameter_code=null | Four knobs không sửa được radar opening gate hoặc chứng minh writer; không inherit legacy primary parameter |
|061/064 hindsight unnecessary | REVIEW caution/track evidence trước; hint có thểABSTAIN | Không gán chắc TTC too high hay build-up sai |
|091 TTC.6 | REVIEW TTC context; chỉ SUSPECTED và collision authority unresolved | Không gộp thành default v1; không claimed improvement do tăng TTC |

ParameterHint={id:string,parameter_code:one_of_4 hoặc null,status:SUSPECTED hoặc ABSTAIN,direction:REVIEW hoặc CONSIDER_INCREASE hoặc CONSIDER_DECREASE hoặc NONE,objective_keys:array<3keys>,baseline_value:EV<number>,evidence_refs:array<SourceRef>,hypothesis_refs:array<string>,prerequisites:array<string>,tradeoffs:array<string>,counterevidence:array<string>,search_range_ref:string|null,reason_codes:array<string>}. Không có proposed_value/expected_score/confidence_probability.

## 7. Search range constraints, không tự sinh biên

SearchRange={unit:string,catalog_domain:EV<Range>,engine_domain:EV<Range>,approved_campaign_domain:EV<Range>,applicable_model_constraints:array<SourceRef>,suggested_range:EV<Range>,method:INTERSECTION_OF_SOURCED_DOMAINS hoặc ABSTAIN,consumer_enforcement:ENFORCED hoặc NOT_SUPPORTED hoặc UNKNOWN,reason_codes:array<string>}. Range={lower:number,upper:number}, finite, lower<upper; closedinterval. Fixed value lower=upper không searchable trongcurrent engine, ghi FIXED_DIMENSION_UNSUPPORTED và block trước GP. Nếu muốn fixed dimension future phải quyết định rõ, không tự widen.

Đề xuất R_k = catalog_snapshot_k ∩ actual_engine_domain_k ∩ approved_campaign_domain_k ∩ những parameter constraints thực sự được cấp bởi validated model/policy. Nếu bất kỳ required domain chưa biết →suggested_range UNKNOWN; không thế full default một cách im lặng. Empty intersection →EXCLUDED, reason EMPTY_ALLOWED_SEARCH_DOMAIN. Không chọn ±10%, half-range, m_s hay threshold từ Golden18 để tạo bounds.

Calibration domain thường là speed/vehicle/physics/μ, **không phải4parameter intervals**. Chỉ intersect khi artifact có explicit applicable parameter constraint; nếu không, dùng calibration applicability làm quality gate, không bịa projection thành max-decel range. μg/effective response cap không là catalog max requested deceleration; requestedmax>μg có thể allowed nhưng saturated, phải nêu sensitivity limitation.

Các nguồn .50–3.50/.05–.45/5–10/5–20 được phép báo dưới `engine_domain` vì source có thật; **không** tự đặt `suggested_range` bằng chúng khi live catalog/baseline/campaign authority thiếu. Golden18 tất cả suggested_range=null/UNKNOWN. Parameter hint direction không tự cấp range hoặc mở rộng domain.

Current limitations:

- Custom search_space_json chỉ được lưu; proposeCandidate luôn ParameterBounds.defaults. Không claim narrowed/full custom suggested range được enforced.
- executeOptimization có nhánh exact-parent-equality tăng TTC+.1, capped3.5 (L878–894), không xét customsearch range. Adapter future phải kiểm emitted proposal sau mọi mutation; không đổi branch trong spec task.
- AebService DB catalog enforcement tồn tại, nhưng không chứng minh campaign-range constraint/quality được enforced.
- ParameterBounds.isValid có tolerance1e−6 và không explicit finite guard; MoboTrial.valid chỉ non-null objectives. Boundary future phải kiểm finite, exact4keys, constraints, không dựa vào các method đó như fullquality gate.

## 8. Eligibility/exclusion/unknown manifest và cohort rules

Không gọi quality gating là đổi công thức objective. Snapshot phải giữ full requested cohort và reasons; không drop collision/missing cases rồi export aggregate trên “phần đẹp” như cùng dataset. Nếu muốn subset khác, phải reviewed new selection/digest.

EligibilityManifest={profile_version:string,requested_member_ids:array<string>,optimization_eligible:array<string>,validation_eligible:array<string>,excluded:array<EligibilityEntry>,unknown:array<EligibilityEntry>,counts:map<string,integer>,baseline_score_status:AVAILABLE hoặc UNAVAILABLE,overall:READY_FOR_REVIEW hoặc BLOCKED hoặc INCONCLUSIVE,reason_codes:array<string>}. EligibilityEntry={member_id:string,partition:string,objective_key:string|null,reason_codes:array<string>,evidence_refs:array<SourceRef>}. Counts phải reconcile requested list; arrays không được che unknown bằngexcluded chung khôngreason.

Gates đề xuất, operational choices ở OD-10…14:

1. Identity/authorization: verified DB/project/variant/run/seed/baseline+4actual params; raw hash/semantic digest/canonical profile; OFF chỉ diagnostic.
2. Freeze freshness: immutable reviewed partition, safe/nonhazard controls retained, variant-disjoint và variant+seed uniqueness như currentfreeze; không chọn3rep cùngseed như3eligible rows. Rep vẫn giữ audit; review chọn một hoặc giữ replicate ngoài trial cohort, không invent reducer.
3. Canonical metric completeness: giữ valid/sample/aggregate rules nguyên; J/D NA trên nonbraking member không loại run khỏi impact. Missing applicable value không0 và không skip; optimization cả3aggregate VALID.
4. Objective-specific evidence: integrity/profile/source/breakdown/calibration/authority theo OBJECTIVE_ANALYSIS; root cause không mandatory. Unresolved collision authority →impact physical-use quality UNKNOWN, không sử dụng0 như confirmed safe.
5. Baseline consistency: một verified version/parameter snapshot; mixed actualparameter tuples phải explicit split hoặc exclude reviewed, không average into baseline.
6. Same simulator/vehicle/dt và hashes/definition; không trộn old egoimpact với relative, filtered với unfiltered, sensor recomputed với canonical.
7. No validation leakage: optimization chỉ OPTIMIZATION members; validation sealed, hints/search ranges **không được học từ validation objective/failure distributions**. Handoff validation refs/hash cho downstream verification, không fitGP/Pareto/acquisition/hints. OFF descriptive control không vào performanceobjective/legacyFP denominator.
8. Constraints: approved shared constraint config và distinct legacy/V3 classification basis; no implicit substitution of V3 false candidates into existing FP rate.
9. No baseline score until binding/cohort/quality/computation authorized source đủ; Golden18 vẫn BASELINE_SCORE_UNAVAILABLE, không “v1 score” hay trial0.
10. Consumer support gate: current consumer không nhận frozencohort/hints/custom bounds semantics, dù file schema valid vẫn NOT_DIRECTLY_CONSUMABLE.

## 9. Mapping CoreV3 → MOBO, và adapter boundary tương lai

| Core/report output | Handoff | Consumer use cho phép |
|---|---|---|
| Physical outcome, collision source disagreement | failure_evidence, objective quality và eligibility reasons | Quality/review; không overwrite stored canonical collision hay tạo label training |
|3canonical values + producer profile | objective_evidence_refs, canonical Sample và baseline aggregate | Raw scalar→canonical aggregate trên đúng frozen optimization cohort; kiểm statuses trước numericfit |
| Command timeline/physical feasibility | diagnosis refs và suspected hint prerequisites | Explanation/review, không trực tiếp objective replacement |
| Failure candidates/root hypotheses | failure_evidence và parameter_hints refs | Search context, không confirmed root/GP target |
| Sufficiency/inconclusive | eligibility_manifest/exclusion/unknown | Gate/abstain; không penaltyscore0 tự tạo |
|4actual params/baseline snapshot | baseline.parameter_values,members.actual_parameters | Reproducible startingcontext, không optimizer trong FA |
| Approved sourced domain intersection | search_ranges | Future boundary validate proposals; current ignoredcustomrange markedNOT_SUPPORTED |
| Frozen variant/seed/run partition | dataset + members | Future executor dùng exactOPTIMIZATION membership và preservevalidation; current service chưaenforce |

ConsumerCompatibility={target:string,source_commit:string,schema_acceptance:SUPPORTED hoặc NOT_SUPPORTED hoặc UNKNOWN,cohort_enforcement:SUPPORTED hoặc NOT_SUPPORTED hoặc UNKNOWN,aggregation_parity:VERIFIED hoặc CONDITIONAL hoặc DIVERGENT hoặc UNKNOWN,bounds_enforcement:SUPPORTED hoặc NOT_SUPPORTED hoặc UNKNOWN,overall:NOT_DIRECTLY_CONSUMABLE hoặc READY_AFTER_AUTHORIZED_ADAPTER hoặc BLOCKED,reason_codes:array<string>,evidence_refs:array<SourceRef>}.

AS-IS: target=OptimizationService/MoboEngine; schema/cohort enforcement NOT_SUPPORTED cho new handoff; aggregation DIVERGENT asgeneral contract; custom bounds enforcement NOT_SUPPORTED; overall NOT_DIRECTLY_CONSUMABLE. Một dữ liệu đủ metric không chữa được integrationgap.

Future adapter chỉ project validated3numeric canonical aggregates sang objective order [jerk,impact,stopping] khi là actual completed candidate trial trên approvedcohort; không injectbaseline như trial. Handoff không đề xuất sửa thuật toánGP/qEHVI/normalization/Pareto. Integrationtaskriêng có thể nối existingengine qua validatedfacade, dùng canonicalaggregation,freeze references và enforced bounds. Không ghi optimization_trials/API/DB trongV3.1design.

## 10. Acceptance và implementation staging

[BLUEPRINT](REFACTOR_BLUEPRINT.md) định nghĩa M1A/M1B/M1C/M1D/M2; [GOLDEN18](GOLDEN18_EXPECTED_BEHAVIOR.md) chứa OA/HF tests. Exit tối thiểu:

- M1A: facts/identity/source hashes và unknown baseline đúng.
- M1B: core evidence report +3 objective explanations, canonical values unchanged.
- M1C: exact canonical missing/NA/aggregate, manifests/ranges/hints không inventvalues.
- M1D: consumer-gap/parity/partition/digest validation bằng offline fixtures; không dispatch.
- M2: chỉ trong future authorized integration; exact cohort,baselinefreshness,canonicalmetrics,bounds enforced và no leakage before real consumer use. Không rewriteoptimizer hay autoapproval.

Không bắt đầu M1A sau tài liệu này. Diagnostic Report có thể complete trong phạm vi evidence dù handoff blocked; không ép tạo score/range/confirmed cause để chuyển bước.
