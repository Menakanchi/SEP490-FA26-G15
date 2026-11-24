# 02 — Formula implementation và actual pipeline usage

Authority: [FORMULA_SPEC_V3](../FORMULA_SPEC_V3.md), không Excel/legacy labels.
Source prefix dưới đây là `src/main/java/com/vsos/core/failureanalysis/`.
Status chỉ nói scope được ghi rõ; helper tồn tại không tự thành implemented pipeline.
Finding IDs resolve tới [register10](10_DEFECTS_AND_REMAINING_WORK.md).

## Actual call graph

`DiagnosticReport.analyze` L11–41 → EvidenceReport/EvidenceValidator →
AebTimelineBuilder → ImpactAnalyzer.extract → geometry(nominal/applied) →
DiagnosisPolicy.assess → PhysicalBrakingAnalyzer → feasibility(P01…P05) →
ImpactAnalyzer.compare → ObjectiveExplainer.explain/decompose.

Geometry dùng **core projected actual trajectory**, không GT world bbox đầy đủ,
không controller-delivered ex-ante prediction. Nominal/applied views được đặt tên
riêng và CONDITIONAL. G03 không được dùng làm sensor contact authority. Formula
IDs trong72actual reports được đếm tại [golden72-summary](evidence/golden72-summary.json).
Presence của ID chỉ là call-path evidence, không thay kiểm toán toán học/input validity.

## G/P/T/I/Q matrix

| ID | Implementation status | Method + lines | Math/units/domain và input thực | Used in report / test / limits |
|---|---|---|---|---|
| G01 | PARTIAL_OR_CONDITIONAL | GeometryEngine.project/kmhToMps L24–27; DiagnosticReport.geometry L80–112,feasibility L128–145 | projection dot f/l; km/h÷3.6; near gap=ped_x−r−front[m]. Pipeline dùng projected SI do producer ghi; full bbox/pose không có | Gap wired; projection/conversion primitives chỉ unit test. Không tự actor-center=bbox-center; helpers chưa tự guard mọi invalid vector |
| G02 | IMPLEMENTED_NOT_WIRED | GeometryEngine.longitudinalTtc L28–31 | gap/closing[s], finite/gap>0/closing>0; null ngoài domain | Không gọi trong actual report; legacy TTC chỉ raw refs. Không dùng1D làm collision truth. Legacy rule descriptor chưa thành module báo cáo |
| G03 | IMPLEMENTED_AND_USED trong fixed-heading PWL model | GeometryEngine.analyze L35–71,quadraticLeq L82–91; DiagnosticReport.geometry L80–112 | d=hypot(max(abs(qx)−L/2,0),max(abs(qy)−W/2,0))−r[m]; partition rectangle edges, solve quadratic continuously | Corner/rear/between-frame tests; two views/run. Rotation/gap/missing pose không chứng minh no-conflict; full physical mesh DEFERRED |
| G04 | IMPLEMENTED_AND_USED trong named single encounter | GeometryEngine.addSlab/merge/pet L93–115; DiagnosticReport L93–110 | Full-body axial intervals; PET=enter_later−exit_earlier[s] chỉ disjoint/full coverage | Overlap→null+OVERLAPPING; censored→null. Multiple unresolved encounter association→UNKNOWN, không gộp nhiều lần qua thành một |
| P01 | IMPLEMENTED_AND_USED, conditional envelope | StoppingModel.availableDeceleration L15–24; DiagnosticReport L120–143 | min(config,vehicle,adapter,μ×9.81)[m/s²]. Missing bound giữ cap=null, có known upper bound | Actual params/vehicle/full_brake/friction; không weather fallback; không coi configured/available là achieved |
| P02 | IMPLEMENTED_AND_USED, conditional response model | StoppingModel.stop/at L25–45,validate L103–105; DiagnosticReport L129–144 | v≥0,b>0,J>0,delay≥0 finite; zero initial decel, straight brake-only; units m,s,m/s²,m/s³ | Actual decision hoặc named GT-shadow reference; config delay+.10s source model. Initial partial braking/grade/validated realized response DEFERRED |
| P03 | IMPLEMENTED_AND_USED cho ideal/inverse cap | StoppingModel.ideal/requiredEnvelope L46–65; DiagnosticReport L150–153 | ideal v²/(2b); inverse monotone P02 distance bisection trong declared [0,cap]; infeasible→null/status | Boundary independent checks pass; không chuyển infeasible stop thành inevitable pedestrian collision. requiredIdeal helper chưa wired |
| P04 | PARTIAL_OR_CONDITIONAL | StoppingModel.margin/windows L66–100; DiagnosticReport L146–163 | M=D_clear−D_stop−m_s[m]; concave PWL superlevel interval unions; latest only uncensored | Unbuffered screen/windows wired; approved margin và certified2D latest UNKNOWN. DifferenceBounds helper/timing comparator chưa vào report |
| P05 | PARTIAL_OR_CONDITIONAL; certified conclusion DEFERRED | AvoidabilityAnalyzer.screen/cell L20–64; DiagnosticReport L164–175 | Brake-only, point/range constant-velocity target, remaining horizon; interval screening không certified numerical bound/action set | Conditional screen used. screen luôn avoidability UNKNOWN/certificate=null, kể cả all tested actions contact; đúng restraint. Không có certified unavoidable/PHYSICAL_LIMIT solver |
| T01 | INCORRECT trên invalid/conflicting metadata; normal Golden18 path used | AebTimelineBuilder.build L11–44; PhysicalBrakingAnalyzer.travel L14–24 | Core D/Q/B differences[s], delay/config descriptor; recorder pedal/window tách clock; travel[m] |011 censored đúng; OFF thật đúng; FA-001 mode/time validity bypass. Earliest observability, physical onset/delay vẫn UNKNOWN |
| T02 | PARTIAL_OR_CONDITIONAL | PhysicalBrakingAnalyzer.jerk/trackingError/peakDeceleration L26–75,analyze L76–109 | J=Δa/Δt; duration-weighted RMS; peak timestamp .1s window; RMSE exact integral linear error² | Jerk/peak used on precontact/censored GT episode; no canonical replacement. RMSE helper NOT_WIRED, demanded/consumed/mask evidence thiếu. Không command-aligned performance claim |
| I01 | INCORRECT ở admissibility/support gate; vector math correct | ImpactAnalyzer.relativeVelocity/extract/compare L12–81 | norm(vE−vP)[m/s], pre-contact same world frame; OFF−ON same scalar basis | Golden18 separation/029 mitigation đúng. FA-003 stale/future event support; FA-004 duplicate contacts làm mất event. Pair association không causal contribution |
| Q01 | PARTIAL_OR_CONDITIONAL | EvidenceGates.capability/differenceBounds L12–16,49–52; DiagnosticReport L55–64 | Claim-local required/available/missing, no calibrated probabilities | Capabilities used; interval subtraction only helper. Covariance propagation/rates DEFERRED, uncertainty bounds UNKNOWN. FA-001/004 làm một số gates sai |
| Q02 | PARTIAL_OR_CONDITIONAL; positive membership NOT_WIRED | EvidenceGates.calibration L24–46; DiagnosticReport L50–54 | Typed EQ/IN/CLOSED_RANGE + unit/hash/version; IN/OUT/UNKNOWN/NA | Helper tests all states, report luôn null-domain hoặc unused. Golden18 UNKNOWN đúng; actual domain ingestion chưa có (FA-007) |

Không có PHYSICAL_LIMIT từ negative1D margin. P05 loop có giới hạn depth/cell,
không dùng “không tìm thấy action” làm certificate. Quy tắc này đã kiểm source và
toàn72report; thiếu certificate là limitation được phép, không defect cần giả kết luận.

## Đối chiếu toán độc lập

P02 tích phân `dv/dt=−min(Ju,b)` sau delay; trước delay v=v0.
Nếu v0≤b²/(2J), ts=√(2v0/J), D=v0td+(2/3)v0ts.
Nếu v0>b²/(2J), tr=b/J,v1=v0−b²/(2J),
D=v0td+v0tr−Jtr³/6+v1²/(2b). v0=0 →D=T=0.

[verify_independent.py](verification/verify_independent.py) dùng quadrature của
acceleration, bisection root v(t)=0 và quadrature velocity, không gọi production
stop helper để tạo expected D. Sau đó đối chiếu outputs thật của Java probe.

| v0[m/s] | b[m/s²] | J[m/s³] | td[s] | D[m] từ Java, khớp independent integration | T[s] |
|---:|---:|---:|---:|---:|---:|
|11.1|8|20|.25|12.6422916666667|1.8375|
|50/3.6|8|20|.25|18.2529938271605|2.18611111111111|
|50/3.6|6.3765|20|.25|20.7852272990162|2.58754923471166|
|1|8|20|.25|.460818510677892|.566227766016838|
|0|8|20|.25|0|0|
|1.6|8|20|.25|.826666666666667|.65|

Thêm hai input v0=1.6±1e−8 kiểm continuity hai nhánh. Boundary inverse tại
D=18.2529938271605 trả b≈8; D−1e−7 không có feasible cap≤8. Đây là boundary stop
model, không chứng minh physical collision/avoidability2D.

32checks tổng cộng gồm16distance/time checks, μg=6.3765, crossing √104,
corner tangency (.3,.4,.5), Euclidean corner separation, full-body enter .27s/exit
.83s, rear conflict, missing clock, PET1s/disjoint và null/overlap, margin0,
inverse boundary và nonclosing TTC null. Exact results/expected/tolerance tại
[independent-math-checks.json](evidence/independent-math-checks.json).

Tolerances tuyệt đối: distance integration1e−8m, time integration1e−8s;
simple geometry/PET/vector/cap1e−12 cùng unit; inverse1e−10m/s². Solver source có
EPS1e−10 và32ULP rounding support. **Tất cả là numerical tolerances, không phải
measurement uncertainty, residual bounds hoặc confidence.**

## Traceability đủ30 mục HTML V2

Mỗi row kế thừa math/units/domain/missing/source/test/usage của group trên.
Disposition KEEP/CORRECT/REPLACE trong spec là design disposition; không đổi chúng
thành implemented khi code chưa wired. Status ở đây là thực trạng runtime.

| V2 IDs | Group / actual implementation coverage |
|---|---|
|A01|G01 PARTIAL: conversion/projection primitive not wired; boundary gap used |
|A02|Q01 PARTIAL: capability used, uncertainty/rate propagation absent |
|A03|Q02 PARTIAL: UNKNOWN/NA wired, positive domain not wired |
|B01|G01 conditional boundary gap wired |
|B02|G02 IMPLEMENTED_NOT_WIRED |
|B03|G04 IMPLEMENTED_AND_USED within declared model |
|B04|G03 IMPLEMENTED_AND_USED fixed heading; rotation unresolved |
|B05|G03 minimum clearance used, not forced0 by legacy collision |
|B06|G04 PET used, censored/overlap null |
|C01|P01 conditional cap used |
|C02|P03 ideal lower bound used |
|C03/C04/C05|P02 delay, post-ramp và ramp-stop branches used |
|C06|P04 unbuffered margin used; approved safety margin deferred |
|C07|P03 inverse cap used |
|C08|P05 conditional screen used; certified avoidance windows DEFERRED |
|D01|T01 used, INCORRECT invalid-metadata branches FA-001 |
|D02|T01 episode travel used; command-aligned measured stop DEFERRED |
|D03|T02 trackingError IMPLEMENTED_NOT_WIRED |
|D04|T02 diagnostic jerk used; canonical untouched |
|D05|I01 vector/scalar used; admissibility INCORRECT FA-003/004 |
|D06|I01 matched observation used, causal contribution UNKNOWN |
|E01|Q01 interval difference helper NOT_WIRED; covariance DEFERRED |
|E02|Outcome helper exists; only conservative positive/UNKNOWN report branches wired |
|E03|FALSE_BRAKING SUSPECTED path used, SUPPORTED requirement path NOT_WIRED |
|E04|NO/INEFFECTIVE SUSPECTED paths used, mode gate defect; no confirmed cause |
|F01/F02/F03|Official rates/grouped rates DEFERRED, không denominator0→0%; only counts |

## Traceability đủ Excel F01–F23

| XLS | Runtime coverage và scope |
|---|---|
|F01|G02 helper NOT_WIRED, no1D collision oracle |
|F02|AebParams.corridorHalfWidth producer source kept; V3 descriptor NOT_WIRED |
|F03|Legacy decision replay/descriptor DEFERRED, actual tracker inputs absent; no controller reimplementation |
|F04|P02 IMPLEMENTED_AND_USED, independent number12.6422916667 validated |
|F05|P04 conditional unbuffered margin; approved m_s UNKNOWN |
|F06|Stopped-gap-specific adapter DEFERRED; original events accessible via raw registry |
|F07|P03 ideal bound/inverse used, no actuator attribution |
|F08|P04 stop windows used; certified P05 windows DEFERRED |
|F09/F10|Interval subtraction primitive NOT_WIRED into detection/decision deadline comparison |
|F11|T01 command latency used; physical latency UNKNOWN; FA-001 validity defect |
|F12|T02 timestamp-window peak used, episode not approved physical-onset window |
|F13|Tracking RMSE helper NOT_WIRED; aligned demanded trace missing |
|F14|G03 circle/OBB distance used conditionally; full pose missing |
|F15|G04 full-body occupancy used |
|F16|G03 actual trajectory used; ex-ante delivered-input prediction DEFERRED |
|F17|G04 PET used; no artificial0 on overlap |
|F18|I01 ON/OFF observation used; bad pre-contact support FA-003 |
|F19|Q02 domain helper exists, positive report integration NOT_WIRED |
|F20|FALSE_BRAKING SUSPECTED used; functional confirmation not wired |
|F21|NO_BRAKING SUSPECTED used; invalid-mode gate FA-001 |
|F22|INEFFECTIVE SUSPECTED used; no physical-limit priority shortcut |
|F23|Q01 capabilities used, input-gate defects must be fixed |

OA extensions: OA-J/OA-I canonical reader và OA-A aggregation dùng nguyên producer/
AnalysisMetrics; OA-D decomposition has FA-002; OA-C M1D detects consumer divergences,
OA-H only sourced intersections/no arbitrary numeric hints. OA-J kinematic description
còn FA-008. Full math coverage không đồng nghĩa every normalized field/positive
capability đã có trong Diagnostic Report.
