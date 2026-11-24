# 04 — Three canonical objectives

Verdict **PARTIAL** cho explanation/physical interpretation; **PASS** cho việc
giữ canonical CARLA Golden18 và canonical aggregation namespace hiện hành.
Version vẫn `adr040-stored-aggregation/1`; không weighted score hoặc chọn optimum.
Authority: [OBJECTIVE contract](../OBJECTIVE_ANALYSIS_CONTRACT_V1.md), metric contract,
ADR-040/055 và actual producer source, không implementation report tự xác nhận.

## Canonical read và provenance

CanonicalObjectiveReader.read/scalar L13–58 đọc `/outcome/metrics/{key}`, copy
`/evaluation/aeb_result/{key}`; finite/nonnegative/null/applicability/copy conflict
được tách. Toàn72×3values/nulls giữ nguyên; tất cả M/evaluation copies match.
Reader không gọi filter hoặc tính lại objective. Source revision và JAR hashes
không bị gọi là deployed binary equivalence.

| Actual presence | Jerk | Impact | Stopping |
|---|---:|---:|---:|
|ON54 non-null /null|39 /15|29 /25|42 /12|
|OFF18 non-null /null|0 /18|14 /4|0 /18|

OFF impact readable cho diagnostic; OFF không optimization/validation baseline.
No canonical collision thì per-run impact null; aggregate0 chỉ theo valid Sample.

## C1 — RMS jerk

Đối chiếu CarlaSession.finish L789–811, Filters L95–201 và DecelMeter.update
L34–47: input là gated/clamped signed ego_a, Butterworth bậc6 mỗi lượt xuôi/ngược,10Hz
lọc **whole series**; last crossing −1 rồi lùi −.3 xác định T_AEB; fixed stepS
derivative/RMS từ T_AEB đến run end. Không raw GT/IMU, không cắt precontact lại.
M1A giữ declared signal/filter/window; conflict metadata không đổi scalar.

ObjectiveExplainer L19–28 giải thích command có nhưng canonical jerk thiếu và
đặt diagnostic GT jerk ở namespace/window riêng.026 cóB2.85 nhưng jerk null giữ
UNKNOWN/missing, không0/NA. Câu chữ không tự quy jerk cao cho BRAKE_BUILDUP_RATE.
Thay đổi clamp/filter/last crossing/window có thể đổi objective nhưng không chứng
minh physical brake ramp hoặc parameter causality.

FA-008: kinematic1.4 actual producer fixture vẫn nhận UNKNOWN lineage và CARLA
narrative. Kinematic phải raw/onset/.05s; đây là thiếu/sai profile interpretation,
không lý do thêm filter hoặc sửa canonical values. Positive pipeline profile tests
hiện thiên về CARLA; unknown-profile test chỉ kiểm không có assumed geometry.

## C2 — Impact speed

Canonical current crossing impact là relative velocity ở **core termination tick**,
CarlaSession.step L371–375; ego key riêng. Legacy/core overlap OR callback không
bằng recorder contact. M1B xuất recorded event scalar, reconstructed world vector
và discrepancy riêng; không lấy norm(speedE−speedP) vô hướng cho crossing.

| Actual example | Canonical[m/s] | Recorder physical scalar[m/s] | Interpretation |
|---|---:|---:|---|
|007R1|13.900|13.935|Different recorded samples/bases, không overwrite |
|012R1|8.545|8.242|Giữ khác biệt và writer/context UNKNOWN |
|029R1|10.436|10.456|Paired reduction≈6.348m/s, observational |
|168R2|2.820|2.811|Không ép bằng nhau; no confirmed root |
|091ON|Non-null|Null|Core-only collision disagreement, không synthetic physical0 |

FA-003: strict before-frame inequality chưa đủ precontact support; stale snapshot
và event time ngoài episode vẫn admissible. FA-004: event uniqueness sai làm mất
positive contact. Cần sửa claim-local gates trước physical-impact sign-off.

Pair comparison kiểm ON/OFF,case/seed,simulator,bundle vehicle/variant,params,
physics và core hash; đòi double comparable contact.028OFF thiếu contact→UNKNOWN.
Disturbances/actual target timing/control writers chưa controlled: report ghi
observational association và causal contribution UNKNOWN, không causal proof.
Verified-no-contact categorical avoidance branch chưa wired (FA-007); không bịaON0.

## C3 — Stopping distance

Simulator.brakePhaseMetrics L286–305 dùng first t≥B−1e−9, front displacement,
tail v_last²/(2*stored rounded a_available), total round3. CARLA positionAfterStep
false; kinematic1.3+ true dùng x_s−v_sdt. ObjectiveExplainer.decompose L60–96
giữ total_as_recorded, trace/tail, anchor/index/window, final speed/cap và replay diff.

**42/42actual ON stopping totals replay chính xác**, max difference0.125 dùng6.377,
không thay6.3765 của analytic μg.004R1 trace9.35m +tail.000004m →round3=9.35m.
Ngay EGO_STOPPED còn v_last nhỏ vẫn giữ tail; không tự threshold tail thành0.
Measured_physical_distance để UNKNOWN vì chưa có clock/window alignment.

P02 feasibility bắt đầu tại actual/hypothetical decision, có delay+ramp, giả định
initial decel0. Canonical D bắt đầu B. Report nêu khác biệt; không so chúng như cùng
window hay lấy episode GT travel thay canonical D. Lower D không tự tốt: brake muộn
hoặc termination/contact thay đổi trace window và model tail.

FA-002: invalid core clock vẫn có trace/tail và replay0. Numeric reconstruction
khớp không chứng minh temporal validity/physical interpretability. Phải giữ scalar
nhưng chặn breakdown chất lượng sai, không sửa stored total.

## C4 — Cross-objective tradeoffs

| Tình huống yêu cầu | Actual capability | Audit conclusion |
|---|---|---|
|Jerk giảm nhưng impact tăng|Per-objective facts + generic tradeoffs trong hints; không có matched bound baseline comparator|PARTIAL, không claim đã quan sát trên Golden18 |
|Stopping giảm nhưng impact không giảm|Có window/tail cautions; không automatic comparison/ranking|Descriptive reasoning có; comparative observation chưa validated |
|Không contact nhưng braking có thể không cần|061/064 retrospective FALSE_BRAKING candidates + caution alternatives|Đúng SUSPECTED; functional policy violation UNKNOWN |
|Có contact nhưng impact giảm soOFF|029 (và các valid double-contact pairs) có measured scalar delta, no causal contribution|Implemented observational path; I01 gates cần FA-003/004 fixes |

Objective baseline_comparison ở actual DiagnosticReport vẫn UNKNOWN; report API
không nhận verified baseline comparator/context. Không dùng OFF với jerk/stop null
làm một valid3-objective baseline. Không thể tuyên bố cross-objective analysis đã
đủ cho mọi yêu cầu chỉ vì có4static tradeoff strings trong ParameterHint.

Các thiếu sót không cho phép suy gradient/optimum từ một run hoặc force parameter
culprit. Roots UNKNOWN không tự invalidate canonical numbers. Operational quality
cần per-objective approval/domain/identity, không finite scalar alone.

Full severity/source/repro/impact/fix/owner: FA-002/003/004/007/008 trong
[register10](10_DEFECTS_AND_REMAINING_WORK.md); real values tại
[golden72-review.csv](evidence/golden72-review.csv).
