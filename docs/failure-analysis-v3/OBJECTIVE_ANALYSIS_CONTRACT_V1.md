# OBJECTIVE_ANALYSIS_CONTRACT_V1 — Diagnostic Report tập trung ba objective

V3.1 / DESIGN ONLY, 2026-11-23. Schema đề xuất `vehicsim.objective-analysis/v1`. Giữ nguyên Failure Analysis Core V3, formula `fa-formula/3.0.0`, diagnosis `fa-diagnosis/1.0.0`. Contract này **giải thích số canonical đã ghi**, không thay công thức chấm, không tối ưu tham số và không xác nhận deployment. Companion: [DATA_CONTRACT](DATA_CONTRACT_V1.md), [FORMULA](FORMULA_SPEC_V3.md), [POLICY](DIAGNOSIS_POLICY_V1.md), [MOBO_HANDOFF](MOBO_HANDOFF_CONTRACT_V1.md).

## 1. Source of truth và ba lớp số liệu

| Lớp | Nguồn đúng | Được dùng để làm gì |
|---|---|---|
| Canonical per-run objective | SIMULATOR_RESULT của đúng vintage, `result.json /outcome/metrics` và `/evaluation/aeb_result`; DB columns qua RunService | Đọc/đối chiếu số đã ghi cho3 objective. Không thay bằng sensor recompute hay physical diagnosis |
| Canonical aggregate | `AnalysisMetrics.VERSION = adr040-stored-aggregation/1`, kết hợp `AnalysisService.sample` | Tổng hợp đúng missing/NA/denominator hiện hành trên tập đã chốt; không tạo baseline score khi chưa có baseline/dataset hợp lệ |
| Physical/evidence diagnostics | Contact events, GT/sensor, command timeline, full-body geometry, conditional models của Core V3 | Giải thích ý nghĩa/giới hạn; không dùng các số này thay canonical objective cùng tên |

Source tại HEAD `baf0892d456b5dcf4bfc0358b7124bf6a8b6fe5a`:

- [AnalysisMetrics.java](../../src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java) L9–54; [AnalysisService.java](../../src/main/java/com/vsos/backend/service/analysis/AnalysisService.java) sample L48–59, freeze L151–217.
- [Hợp đồng metric hiện hành](../vehicsim/analysis-metrics-contract.md); [ADR-055](../adr/ADR-055-chot-chi-so-va-che-do-aeb-tat-13-11.md) cập nhật impact/filter/OFF; [ADR-040](../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md) giữ trạng thái Proposed như bản gốc.
- [Simulator.java](../../src/main/java/com/vsos/core/simulation/Simulator.java) brakePhaseMetrics L262–304, summaryMetrics L319–384; [CarlaSession.java](../../src/main/java/com/vsos/core/simulation/CarlaSession.java) finish L772–901; [Filters.java](../../src/main/java/com/vsos/core/aeb/Filters.java) L95–201; [DecelMeter.java](../../src/main/java/com/vsos/core/aeb/DecelMeter.java) L34–47.
- [Evaluation.java](../../src/main/java/com/vsos/core/evaluation/Evaluation.java) L139–155 sao chép metrics; [RunService.java](../../src/main/java/com/vsos/backend/service/simulation/RunService.java) RESULT_COLUMNS L97–115, persist L1193–1296; [Bundle.java](../../src/main/java/com/vsos/core/bridge/Bundle.java) resultDocument L557–570.
- [A01](../../data/failure-audit-output/01_EVALUATOR_LOGIC_AUDIT.md), [A03](../../data/failure-audit-output/03_DATA_CONSISTENCY_AUDIT.md), [A04](../../data/failure-audit-output/04_BACKEND_IMPACT_ASSESSMENT.md), [A05 P0-05](../../data/failure-audit-output/05_RECOMMENDED_CHANGES.md). Raw/hash registry ở DATA_CONTRACT; Golden18 JAR/source equivalence vẫn UNKNOWN.

“Canonical” là contract dự án đang dùng để ghi/tổng hợp, không đồng nghĩa validated physical truth. `OFFICIAL` trong jerk metadata là nhãn code, không chứng nhận tiêu chuẩn. Version aggregate không mô tả đủ signal của per-run: bắt buộc pin cả simulator/profile/dt/core/filter và source hashes.

## 2. Mapping field thật, không đoán JSON

| Ý nghĩa | Raw result.json | Persisted DB / telemetry | Frozen dataset v2 | MOBO hiện tại |
|---|---|---|---|---|
| Jerk canonical | `/outcome/metrics/rms_jerk_mps3`; copy `/evaluation/aeb_result/rms_jerk_mps3` | `simulation_runs.rms_jerk_mps3`; `telemetry_json.metrics.rms_jerk_mps3` | `/runs[]/metrics/rms_jerk_mps3`; `/optimization_objectives/rms_jerk_mps3` aggregate object | OptimizationService đọc DB column, ghi optimization_trials cùng tên; MoboTrial.rmsJerk |
| Impact canonical | `/outcome/metrics/impact_speed_mps`; copy evaluation | `simulation_runs.impact_speed_mps`; telemetry.metrics | `/runs[]/metrics/impact_speed_mps`; aggregate dưới optimization_objectives | Trial scalar → MoboTrial.impactSpeed |
| Stopping canonical | `/outcome/metrics/stopping_distance_m`; copy evaluation | `simulation_runs.stopping_distance_m`; telemetry.metrics | `/runs[]/metrics/stopping_distance_m`; aggregate dưới optimization_objectives | Trial scalar → MoboTrial.stoppingDistance |
| Collision used by legacy aggregate | `/outcome/metrics/collision` và evaluation.aeb_result.collision | `simulation_runs.collision_occurred` | `runs[]/outcome` là flattened display enum, **không** collision bool; cần manifest/raw/row để dựng Sample | OptimizationService dùng r.bool(collision_occurred), không CoreV3.physical_outcome |
| Decision / command onset | M.aeb_decision_t / M.brake_onset_t | aeb_activated lấy từ evaluation.aeb_triggered=decision; telemetry.metrics.brake_onset_t | runs[].metrics chỉ3scalar, onset không có trong item; manifests có digest, không toàn raw | Optimizer dùng aeb_activated thay vì AnalysisService.sample.braked |
| Parameters thực | `/outcome/params/{ttc_threshold,brake_activation_delay,max_deceleration,brake_buildup_rate}` | `telemetry_json.params`; aeb_parameter_values qua versionID | `/manifests[]/params` | proposed params uppercase qua queries.aebValues; không lấy từ diagnostic hint |
| Jerk lineage | M.rms_jerk_raw_mps3, M.t_aeb_s; `/outcome/case/carla/jerk_filtered` | telemetry.metrics/case | manifests.case chứa metadata nếu đã ghi; chưa có per-objective quality field | Không được truyền sang MoboTrial hiện tại |
| Contact impact vật lý được ghi | `sensors/collisions.json[]/relative_speed_before_ms`, ego_speed_before_ms và preimpact frame | carla-data là đường sensor riêng, không overwrite column | Không có event array trong runs[]; cần artifact refs | Không phải objective input hiện tại |

M=`/outcome/metrics`. `telemetry_json` là raw projection do persist tạo, **không có outer /outcome** và không giữ đủ outer seed/source/engine. Freeze `/manifests[]` chứa run_id,scenario_config,case,params,vehicle,metric_source,evaluation_version,artifact_digest,config_digest; không có toàn metrics/frames. Field vehicle có thể null. Không suy metadata đã lưu từ tên field giả định.

DB columns lấy từ `evaluation.aeb_result`, không trực tiếp từ M; phải so hai nguồn khi có. Golden18 có72/72 bộ3scalar khớp M↔evaluation; điều này không chứng minh từng artifact đã được ingest DB. Nếu DB/M/evaluation khác, giữ disagreement, không tự lấy max/min/recompute để hòa giải.

## 3. Canonical per-run provenance

### 3.1 rms_jerk_mps3

CARLA current profile xosc15 (rule tương đối/filter từxosc9): acceleration input là `frames[].ego_a` = signed output của DecelMeter: gate trước AEB, max(0,speed drop), moving window và clamp theo μg. Không phải raw IMU hay raw GT acceleration.

Đúng source algorithm:

1. Lọc **toàn series** ego_a bằng Butterworth order6 mỗi pass, forward rồi backward zero phase, cutoff10Hz mỗi pass. Padding odd reflection p=min(3×(6+1),N−1), cascade initialization theo Filters. Đây không là causal online filter.
2. Tìm lần crossing cuối: c=max{i:a_filtered[i]<−1 và (i=0 hoặc a_filtered[i−1]≥−1)}. Không có c → canonical jerk=null.
3. Từ c lùi j khi j>0 và a_filtered[j−1]<−.3. j là index T_AEB của source.
4. Với i=j..N−1, jerk_i=(a_filtered[i]−a_filtered[i−1])/dt; i=0 dùng a_filtered[0] cho before. RMS=round3(√(Σjerk_i²/(N−j))).
5. Window tới **end of run**, không tự cắt trước sensor collision; canonical sampling dùng configured stepS của profile. Metadata measured_step_s dùng kiểm chất lượng, không đổi canonical denominator thành actual-Δt tại chỗ.

Không phanh hoặc không có crossing T_AEB có thể cho null; **có command onset nhưng T_AEB không xuất hiện vẫn là missing khi Sample.braked=true**, không NOT_APPLICABLE. Golden026 cả3ON là ví dụ. OFF phase metrics được markOff thành null.

Kinematic current1.4 (dt=.05s): jerk raw từ command-onset index tới end, prev acceleration từ sample trước hoặc0 ởstart0, fixed dt; không thêm filter10Hz ở Nyquist10Hz. Profiles cũ giữ đúng số/definition đã lưu. Có cùng unit không có nghĩa CARLA và kinematic cùng phép đo.

Diagnostic raw-GT jerk/IMU jerk hoặc pre-contact window được phép ở namespace khác với signal/filter/window/version riêng. Không mask collision/override rồi ghi kết quả đó vào canonical field.

### 3.2 impact_speed_mps

Từ kinematic1.1 và CARLA xosc9 trở đi, canonical impact là **relative** theo source profile: CP_CROSSING dùng relative vector trong crossing frame ở tick core kết thúc; lead-vehicle nhánh hiện tại dùng max(0,closing). Ego speed ở `ego_impact_speed_mps`. Kinematic1.0/CARLA≤xosc8 là ego legacy; không trộn identity.

Core contact condition có geometric overlap OR callback; do đó canonical non-null impact không tự xác nhận recorder contact. Diagnostic physical event speed lấy matching contact và preimpact frame theo I01, là field khác.

- Không collision theo canonical flag: canonical per-run impact=null; **chỉ canonical aggregate** đóng góp0 sau validity gate.
- Diagnostic không có admissible contact: physical event impact=null, lý do NO_RECORDED_CONTACT hoặc CONTACT_AUTHORITY_UNKNOWN. Không gọi0 mitigation hay biết no-contact khi coverage thiếu.
- Contact có nhưng thiếu preimpact vector/scalar hợp lệ: diagnostic impact UNKNOWN; không lấy core termination speed thay contact speed.
- Golden007R1: canonical13.900m/s, recorder13.935m/s;012R1:8.545 vs8.242;029R1:10.436 vs10.456. Giữ cả hai, basis/timestamp khác nhau; không ép bằng nhau.
- Golden011/091/144R1: canonical impact tồn tại theo legacy flag nhưng physical event impact UNKNOWN/null khi recorder[]; V3 không sửa canonical sang0.

### 3.3 stopping_distance_m

Đây là **trace displacement + model extrapolation**, không đồng nghĩa quãng dừng đã quan sát trọn vẹn. Source `Simulator.brakePhaseMetrics`:

s=min{i:t_i≥brake_onset_t−1e−9}; s không có →null.
x_start=x_s nếu positionAfterStep=false; nếu true thì x_start=x_s−v_s·dt.
D_trace=x_last−x_start.
a_extrap=round3(decelTarget); D_extrap=v_last²/(2a_extrap) khi a_extrap>0, source legacy trả0 khi a_extrap≤0.
D_canonical=round3(D_trace+D_extrap).

CARLA dùng positionAfterStep=false; kinematic từ1.3 dùng true. D_trace CARLA là displacement longitudinal front projection trên core recorded positions; không là3D path length, không phải distance tới crossing/clearance. Không âm thầm thay bằng tích phân sensor speed.

a_extrap current CARLA=min(config max decel,vehicle limit,μg,full-brake decel), theo đúng profile/vintage; giá trị truyền hàm đã round3. Golden125 raw a_available6.377 phải giữ cho replay canonical, không thay bằng6.3765 dù con số sau là analytic μg chưa làm tròn. a_extrap≤0 là observed legacy behavior; V3 flag MODEL_INPUT_INVALID, không coi extrap0 đáng tin cho physical claim.

Ngay EGO_STOPPED với v_last nhỏ nhưng khác0 source vẫn cộng tail. Không ép tail0 bằng threshold dừng mới. Run kết thúc khi hit/target cleared có extrapolation; không chạy tiếp xe để đo quãngdừng trong FA.

Components là giải thích có refs:

- trace_component (m), trace start/end và frame/convention;
- extrapolated_component (m), v_last,a_extrap,formula/model/source domain;
- total_as_recorded (m), round3 và replay difference;
- measured_physical_distance riêng nếu có đủ snapshot/window; thiếu →UNKNOWN.

Nếu chỉ có scalar DB mà thiếu trace/config/vintage thì total vẫn đọc được, **breakdown UNKNOWN**; không ước lượng tail bằng calibration của DB hiện tại. Ngay khi replay thành công, D_extrap chỉ conditional model; calibration domain thiếu không làm scalar canonical biến mất nhưng chặn physical guarantee.

## 4. Canonical aggregation chính xác

Input thật `AnalysisMetrics.Sample(status,endReason,collision,falsePositive,falseNegative,verdict,braked,jerk,impact,stopping)`. AnalysisService.sample bổ sung trace gating:

`braked=true` nếu brake_onset tồn tại và không phải string "null"; else true nếu jerk hoặc stopping non-null; else false nếu aeb_activated==false; else null.
`qualityStatus=INCOMPLETE` nếu DB status COMPLETED nhưng trace_available=false; còn lại giữ DB status. `trace_available` là trace_frames>0 hoặc frames array không rỗng tùy projection. Không hiểu `braked` canonical này là chứng minh actual AEB consumption.

`valid(s)` ⇔ status=COMPLETED, endReason non-null và không TIMEOUT/ERROR, collision/falsePositive/falseNegative đều non-null, verdict∈{PASS,FAIL}. Verdict FAIL vẫn valid; values của FP/FN không là causal truth, chỉ completeness metadata mà canonical function hiện đòi. Canonical valid không kiểm operational calibration/physics/causal evidence.

Cho objective k, mỗi sample được phân loại **theo đúng thứ tự**:

1. Invalid sample → missing++, không đóng góp gì.
2. Impact: collision==false →x=0; collision==true →x=impact. Không phụ thuộc braked.
3. Jerk/stopping: braked==false →notApplicable++, bỏ sample; braked==null →missing++; true →x=jerk/stopping.
4. x=null/nonfinite/negative →missing++; x finite≥0 →sum+=x,samples++.

Output thực `Objective(value,samples,missing,notApplicable,unit,status)` (chú ý camelCase `notApplicable`):

- value=sum/samples chỉ khi missing=0 và samples>0, ngược lại null;
- status=INCOMPLETE nếu missing>0; else NOT_APPLICABLE nếu samples=0; else VALID;
- aggregate không round mean thêm; per-run input đã round theo producer;
- `invalid_runs` đếm !valid(s); `version` là `adr040-stored-aggregation/1`.
- `evidenceComplete` = nonempty input và missing=0 cho cả3; có thể true khi jerk/stopping toànNA.
- `objectivesAvailable` = nonempty và **cả3status VALID**. Đây mới là gate mà freeze dùng cho optimization subset.

Boundary phải kiểm aggregate value finite trước khi đưa GP, kể cả khi status producer nói VALID; không clamp hoặc sửa mean để vượt gate.

Không reweight theo case/rep/seed, không bỏ samples xấu để làm đẹp score; quy tắc hiện tại là mean theo run. Nếu dự án muốn mean theo case/seed cluster, đó là metric/cohort decision khác, chưa được phép thay canonical.

Ví dụ synthetic đã có trong AnalysisMetricsTest: run(braked,collision,J,I,D)=(true,true,2,6,10),(true,false,4,null,20),(false,false,null,null,null) →aggregate J=3,I=2,D=15. Đây là **fixture toán học có sẵn**, không baseline score Golden18. Một collision thiếu impact →INCOMPLETE, không0. Một run aeb_activated=true, onset/jerk/stop null →braked=null; không tự coi không phanh. Một nonbraking valid sample vẫn đóng góp0 hoặc impact cho objective impact.

## 5. Diagnostic Report contract

Dùng EvidenceValue/SourceRef/Artifact/Capability từ DATA_CONTRACT. Tất cả path ở đây là **đề xuất mới**, không có trong API hiện hành. Diagnostic envelope giữ toàn bộ `/report` CoreV3 và thêm `/report/objectives`, chứa đúng3key `rms_jerk_mps3`, `impact_speed_mps`, `stopping_distance_m`. Mỗi value là ObjectiveEvidence:

| Field tương đối trong từng objective | Type / unit | Source, ý nghĩa và NULL |
|---|---|---|
| `canonical_value` | EV<number> / m/s³,m/s,m theo key | Scalar as-recorded đã xác minh source; không recompute replacement. Thiếu→UNKNOWN, không phanh→NA chỉ khi canonical applicability chứng minh |
| `direction` | MINIMIZE | Constant contract, không weight/score |
| `metric_source` | SIMULATOR_RESULT hoặc UNKNOWN | SENSOR_RECOMPUTED không được chứa trong canonical_value |
| `aggregation_version` | string | adr040-stored-aggregation/1; chưa biết vintage→UNKNOWN reason, không đoán |
| `producer_profile` | EV<string> | Simulator identity + declared signal/algorithm descriptor, không phải invented canonical version |
| `input_field_refs` | array<SourceRef> | M/evaluation/DB/manifest refs, preserve disagreements |
| `canonical_applicability` | APPLICABLE,NOT_APPLICABLE,UNKNOWN | Jerk/stop theo canonical Sample.braked; impact per-run collision=false là NOT_APPLICABLE/null nhưng aggregate vẫn đóng góp0 sau valid gate. APPLICABLE có thể missing |
| `signal`, `filter`, `window` | EV<string> ×3 | Per-run lineage phần3; window ghi anchor và end; unknown metadata không tự “AS_RECORDED là đủ” |
| `clock_id`, `frame_id` | string hoặc null ×2 | Core clock/projection; scalar không có world frame thì null có reason |
| `decomposition` | StoppingDecomposition hoặc null | Chỉ stopping; jerk/impact null với NOT_APPLICABLE semantics |
| `physical_event_impact` | EV<number>/m/s hoặc null | Chỉ impact key dùng I01 recorded contact, no-contact value=null; hai key khác object=null |
| `explanation` | ObjectiveExplanation | Phần6; mọi câu quy cause phải có hypothesis scope |
| `quality` | ObjectiveQuality | Phần7; numeric completeness không causal completeness |
| `baseline_comparison` | ObjectiveComparison | Không có matched bound baseline thì delta UNKNOWN, không đoánscore |
| `parameter_hint_refs` | array<string> | Trỏ hint trong handoff nếu có, không predicted improvement |

`StoppingDecomposition`={trace_component:EV<number>[m],extrapolated_component:EV<number>[m],total_as_recorded:EV<number>[m],start_time:EV<number>[s],end_time:EV<number>[s],start_index:EV<integer>,position_after_step:EV<boolean>,last_speed:EV<number>[m/s],decel_for_extrapolation:EV<number>[m/s²],measured_physical_distance:EV<number>[m],rounding_rule:EV<string>,replay_difference:EV<number>[m]}. Tất cả time cùng clock core; missing raw →components UNKNOWN. `replay_difference`=reconstructed rounded total−as-recorded, không sửa total khi khác.

`ObjectiveExplanation`={observed_facts:array<SourceRef>,mechanism_notes:array<string>,hypothesis_refs:array<string>,limitations:array<string>,assessment:DESCRIPTIVE_ONLY hoặc COMPARABLE_OBSERVATION hoặc INCONCLUSIVE}. Chưa có approved threshold thì không “jerk failed/stop too long” bằng ngưỡng tự đặt.

`ObjectiveQuality`={canonical_integrity:PASS hoặc FAIL hoặc UNKNOWN,physical_interpretability:SUFFICIENT hoặc PARTIAL hoặc INSUFFICIENT hoặc NOT_APPLICABLE,mobo_eligibility:ELIGIBLE hoặc EXCLUDED hoặc UNKNOWN hoặc NOT_APPLICABLE,reason_codes:array<string>,capability_refs:array<string>}. Integrity PASS chỉ đọc/lineage/replay phù hợp, không validated physics. Eligibility theo MOBO contract, role và whole-cohort gate.

`ObjectiveComparison`={baseline_run_id:EV<string>,baseline_version_id:EV<string>,pairing_status:MATCHED hoặc MISMATCHED hoặc UNKNOWN,delta:EV<number>,relative_change:EV<number>}. delta=current−baseline, MINIMIZE; relative_change=delta/baseline chỉ baseline>0, baseline0→NA (không∞/arbitraryepsilon). Cả hai cần same metric/profile/identity/context, đủ quality và baseline confirmed; no candidate/comparator→UNKNOWN. Không gộp3delta thành score.

Diagnostic Report luôn bao gồm physical outcome,3 objective+explanations, AEB timeline, physical feasibility, failure candidates, hypotheses, sufficiency và inconclusive reasons của CoreV3. Có thể xuất report hữu ích với objective unknown, không bắt buộc failure/cause.

## 6. Methodology giải thích objective và parameter context

| Objective | Giải thích có thể hỗ trợ bởi evidence | Điều không được quy nguyên nhân |
|---|---|---|
| Jerk | Window/filter/input gating/clamp; ramp demand; overrides/contact/end effects; missing T_AEB; variation giữa matched runs | Jerk lớn không chứng minh BRAKE_BUILDUP_RATE sai; giảm build-up có thể tăng impact/distance; filter không làm evidence physical độc lập |
| Impact | Canonical vs matching contact speed, relative/ego distinction; Q/B vs encounter/feasibility; observed mitigation với pair hợp lệ | Contact không tự ineffective failure; source mismatch không tự sensor bug; outcome không cho biết gradient TTC/maxdecel |
| Stopping | Start/end displacement, extrap fraction/model, initial speed, source decel cap, termination/censoring | D nhỏ có thể do phanh muộn, không tự tốt toàn hệ; D lớn không tự weak brakes; predicted stop model không thay canonical distance |

Bốn AEB parameters chỉ là `baseline configuration + diagnostic context + suspected search hints`. Hint rules trong MOBO_HANDOFF. Failure Analysis không chạy candidate, surrogate, acquisition, optimizer hoặc sensitivity sweep. Không đưa hidden future pedestrian intent vào justification của command tại Q.

## 7. Objective-specific evidence quality và eligibility

Tách3capability độc lập: `READ_CANONICAL_OBJECTIVE`, `EXPLAIN_PHYSICAL_MEANING`, `EXPORT_FOR_MOBO`. Quality missing có thể chặn handoff, không xóa scalar đã ghi.

| Gate | Jerk | Impact | Stopping |
|---|---|---|---|
| Canonical integrity | Source scalar finite≥0 hoặc reason null; profile/filter/window declared; M/evaluation/DB consistency | Same + explicit relative/ego vintage; canonical collision flag origin | Same + command anchor, positions, v_last,a_extrap,vintage cho breakdown |
| Physical interpretation | Raw vs gated signal/override/clamp known; filter/window/clock traceability | Admissible contact + preimpact frame/actor/vector; no-event coverage cho absence | Distinguish trace projection vs measured physical travel; envelope/calibration domain cho extrap |
| Inconclusive | Missing T_AEB/trace/profile; short window; unstable sampling; physical acceleration source unknown | Collision authority mismatch; event/no-event not resolved; scalar fallback unlike vector | Components/model/anchor missing; duration censoring; current DB calibration unlike run |
| Handoff | Canonical value applicable và complete; approved metric-quality gates, no source substitution | Canonical aggregate contribution traceable; unresolved collision authority not auto-zero for physical use | Scalar canonical kept; decomposition+model limitation explicit; approved extrapolation/calibration policy |

Một nonbraking run đủ validity không phải bị loại chỉ vì J/D NA; giữ ở eligible cohort cho impact và safe-control constraints. Optimization aggregate toànNA J/D không có3 objective available; không fabricate0 để fit GP. Root cause UNKNOWN không tự loại metric hợp lệ. Physical calibration UNKNOWN cần per-objective policy OD-05/06/12, không all-or-nothing data deletion.

Reason codes bổ sung: METRIC_SOURCE_MISMATCH, METRIC_PROFILE_UNKNOWN, CANONICAL_COPY_DISAGREEMENT, CANONICAL_VALUE_MISSING, CANONICAL_NOT_APPLICABLE, T_AEB_NOT_FOUND, STOPPING_BREAKDOWN_UNKNOWN, EXTRAPOLATION_DOMAIN_UNKNOWN, BASELINE_ID_UNCONFIRMED, BASELINE_SCORE_UNAVAILABLE, COHORT_NOT_FROZEN, AGGREGATOR_CONSUMER_DIVERGENCE. Core reason codes giữ nguyên.

## 8. Golden18 và acceptance

Đã đọc raw72run để xác minh presence/copy, **không tính baseline score**:

- ON54: jerk39present/15null; impact29present/25null; stopping42present/12null.
- OFF18: jerk/stopping18null; impact14present/4null. OFF không optimization objective cohort.
- M và evaluation.aeb_result khớp3scalar ở72/72; contact events31 khác canonical collision43; giữ12disagreement.
- Case026 B có nhưng jerk null;011 Q có/Bnull;007/012 không Q/B;091 TTC.6 khác17caseTTC1.5.
- Metadata manifest “run_id=FA-G1-001-R1” là artifact run key, không DB runID/variantID/AEBversionID. Source={} khiến baseline identification UNKNOWN. Không count3rep cùng variant/seed như3row eligible freeze.

Acceptance IDs OA-01…OA-10 và per-stage M1A/M1B/M1C/M1D/M2 ở [GOLDEN18](GOLDEN18_EXPECTED_BEHAVIOR.md) và [BLUEPRINT](REFACTOR_BLUEPRINT.md). Không có implementation mới hay test suite mới được chạy ở V3.1.
