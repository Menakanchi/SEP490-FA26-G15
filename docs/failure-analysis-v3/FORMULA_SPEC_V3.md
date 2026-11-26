# FORMULA_SPEC_V3 — Công thức và phạm vi suy luận

V3.1 DESIGN ONLY. Core version giữ nguyên; version đề xuất `fa-formula/3.0.0`. Không thay công thức, calibration hay evaluator đang chạy. Tài liệu này phủ đủ **30 mục công thức HTML V2** (A:3, B:6, C:8, D:6, E:4, F:3) và **F01–F23 của workbook**, không chỉ các công thức ưu tiên. IDs V2-A01…V2-F03 dưới đây là ID truy vết do đặc tả gán theo thứ tự trong từng nhóm HTML, không giả rằng HTML có sẵn các ID này. XLS-Fnn trỏ sheet `12_FORMULAS`, row nn+1, cột A:H. Hash/đường dẫn nguồn ở [DATA_CONTRACT](DATA_CONTRACT_V1.md).

KEEP: giữ phép toán với scope rõ; CORRECT: sửa nghĩa/điều kiện/biểu thức; REPLACE: thay mô hình suy luận; DEFER: không tính claim khi thiếu dữ liệu. Mapping class/method dưới đây là **đề xuất**, chưa tồn tại, trừ source reference được ghi SRC.

## 1. Quy ước và yêu cầu áp dụng chung

- SI: v≥0 [m/s], b>0 là độ lớn giảm tốc [m/s²], J>0 [m/s³], t [s], D [m], μ không thứ nguyên, g=9.81 [m/s²] là hằng mô hình. Không suy μ từ weather khi chỉ weather được ghi.
- Mọi phép tính có input IDs, clock/frame, geometry ID, horizon, uncertainty và assumption IDs như contract. Input thiếu/invalid → output UNKNOWN với reason; không fallback 0. Nếu chỉ thiếu applicability calibration thì có thể xuất CONDITIONAL, không xuất validated physical conclusion.
- V2/XLS row dưới đây kế thừa quy tắc missing chung; ngoại lệ được ghi tại từng dòng. “GT có” là snapshot mô phỏng, không phải quan sát sensor thực và không phải thông tin AEB đã nhận ở thời điểm Q.
- Số tham số lấy từ run, không từ DB/vehicle hiện tại. Tách số đo, tham số configured, model-derived và counterfactual. Có ON/OFF cùng seed chỉ là paired observation, chưa đảm bảo mọi disturbance giống nhau.
- Tolerance số học dùng để giải nghiệm không phải uncertainty vật lý. Không tự đặt ngưỡng .05s/1m/s² thành chuẩn chức năng. Threshold gần va/chấp nhận phòng ngừa cần policy version, [OPEN_DECISIONS](OPEN_DECISIONS.md).
- Ví dụ Golden18 trích [A02](../../data/failure-audit-output/02_CASE_BY_CASE_AUDIT.md) và [A03](../../data/failure-audit-output/03_DATA_CONSISTENCY_AUDIT.md), truy về RAW member theo contract. Giá trị làm tròn chỉ minh họa, không dùng làm expected exact value khi raw có độ chính xác cao hơn.

## 2. Các phép tính chuẩn V3

### G01 — Đơn vị, projection và gap có boundary

v_ms=v_kmh/3.6. Với yaw ψ của CARLA, f=(cosψ,sinψ), l=(sinψ,−cosψ), q_f=(p−p_ref)·f, q_l=(p−p_ref)·l. Front p_front là support point của footprint theo f, có tính box center offset và pose. Không mặc định actor center + L/2 nếu center offset chưa biết.

Gap đến một stop boundary được chỉ định: D_clear(t)=(p_boundary(t)−p_front(t))·f(t), chỉ trong mô hình đường thẳng/chọn boundary phù hợp. Với crossing plane x=cx và pedestrian disc radius r, near-side stop boundary là cx−r. Nếu dùng cx−r thì không trừ radius lần nữa trong margin. Safety offset m_s≥0 là policy, không lẫn corridor buffer. Output: m; source G positions/pose + bbox hoặc core projection conditional. Method `CoordinateNormalizer.project`, `GeometryEngine.distanceToBoundary`.

### G02 — TTC dọc và legacy corridor

TTC_x=g_x/(v_E,x−v_P,x), chỉ khi g_x>0 và closing>0. Closing≤0 hoặc gap≤0 → NOT_APPLICABLE, không serialize ∞; không đồng nghĩa safe. Đây là thời gian tới mặt phẳng dọc, **không phải dự đoán collision 2D**.

Corridor legacy w_c=W_nominal/2+.25×2.0. Với W=1.93: w_c=1.465m. Source `AebParams.corridorHalfWidth`. Đây là vùng ra quyết định của AEB hiện tại; physical nominal half-width+ped radius là .965+.3=1.265m, applied footprint khác nữa. Không dùng 1.465 làm kích thước mesh.

Legacy logic được mô tả, không sửa: detected, gap>0, closing≥2m/s; y_pred=y_seen+v_left×min(TTC_x,2s); in_path=(|y_seen|≤w_c OR |y_pred|≤w_c); FCW nếu in_path và TTC_x≤TTC_threshold+1s; decision nếu in_path và TTC_x≤TTC_threshold. Latches/sampled 50ms cần replay đúng source, không dùng biểu thức liên tục thay execution. Method `LegacyAebRuleDescriptor.describe`; không reimplement controller trong module diagnosis. [A01; SRC AebStack.decide, AebParams].

### G03 — Full-body conflict 2D và clearance

Cho footprint E(t), P(t) trên cùng mặt phẳng và clock:
C_H={t∈[t0,t0+H] : E(t)∩P(t)≠∅}.
Conflict=true khi C_H không rỗng; false chỉ khi mọi thời điểm trong horizon được giải quyết và không giao; thiếu coverage/geometry → UNKNOWN hoặc conditional cho model riêng.

Mô hình OBB–disc: c_E là bbox center world, R là heading rotation, h=(L/2,W/2), q=Rᵀ(p_P−c_E).
d(t)=sqrt(max(|q_x|−h_x,0)²+max(|q_y|−h_y,0)²)−r.
d≤0 tương đương intersection của disc với closed rectangle; giá trị âm là overlap indicator, **không là penetration depth chính xác khi tâm disc nằm trong box**. Clearance không âm =max(d,0); giữ d riêng để không mất dấu. Min signed indicator=min_t d(t); min clearance=min_t max(d(t),0). Không ép cả hai về0 chỉ vì core end_reason=COLLISION. Geometry engine dùng polygon distance/intersection nếu actor shape khác; không lấy bbox làm physical mesh authority.

Với translation piecewise-linear, heading cố định trên segment: partition tại q_x=±h_x và q_y=±h_y; trong mỗi partition, giải bất đẳng thức bậc hai distance²≤r², intersect với segment/horizon, union các interval liền nhau. Đây là continuous collision detection, bao gồm contact ở góc và thân sau. Rotation/acceleration cần solver có bounds/subdivision được kiểm chứng; phần chưa resolve thành UNKNOWN, không tuyên bố no-conflict từ sampled frames. Không interpolate qua missing interval chưa có motion bound. Hindsight G và ex-ante constant-velocity prediction là hai trajectory_kind khác nhau.

Method `GeometryEngine.conflictIntervals`, `minimumClearance`. Golden002: nominal ego long occupancy5.81–6.19s, ped lateral3.41–5.09s không giao; đây là bằng chứng chống legacy MA, còn exact mesh/uncertainty chưa đủ để certification SAFE.

### G04 — Full-body occupancy và PET

Chỉ cho ego thẳng tốc độ v>0, front x_f0, pedestrian tại crossing plane cx, disc radius r:
I_E=[t0+(cx−r−x_f0)/v, t0+(cx+r+L−x_f0)/v]∩[t0,t0+H].
Ped lateral occupancy I_P={t: |y_P(t)−y_E(t)|≤W/2+r}. Có thể là union nhiều interval. Broad-phase I_E∩I_P là điều kiện cần; để kết luận collision phải dùng G03 đồng thời, nhất là ở góc rectangle.

PET áp dụng trên cùng conflict area định danh và các occupancy interval đầy đủ, disjoint: PET=t_enter,later−t_exit,earlier>0. Nếu overlap: pet=null, pet_relation=OVERLAPPING; không tạo giá trị0 mang nghĩa safe. Nếu một actor chưa exit do censoring: UNKNOWN/CENSORED. Nhiều lần đi qua phải báo từng encounter, không ghép enter sớm nhất/exit muộn nhất qua các khoảng trống.

[SSAM của FHWA](https://www.fhwa.dot.gov/publications/research/safety/08051/02.cfm) dùng trajectory projection và PET/TTC trong phân tích vehicle conflicts. V3 chọn null khi overlap để tách conflict khỏi spacing; đây là **quy ước project có chủ đích**, khác convention PET=0 của SSAM. Không coi threshold TTC1.5 của SSAM là tiêu chuẩn AEB pedestrian bắt buộc. Method `ConflictMetrics.occupancy`, `pet`.

### P01 — Available deceleration envelope

b_cap=min(b_AEB,max,b_vehicle,b_adapter,μg), chỉ là mô hình flat-road friction-limited khi từng bound hợp lệ, cùng context. Thiếu một bound không tự coi là∞; có thể xuất upper bound từ các bound biết nhưng b_cap thực UNKNOWN. Applied tire friction không đồng nhất road μ. Grade/drag/tire/ABS/load/speed dependence cần envelope b(v,context) có validation.

Golden125 μ=.65 → μg=6.3765m/s²; Golden168 μ=.8 →7.848m/s². Các con số là **conditional model caps**, không xác nhận achieved decel và không chứng minh LOW_FRICTION root cause. Calibration applicability theo Q02. Method `PhysicalEnvelopeResolver.resolve`.

### P02 — Delay, jerk buildup và stopping distance

Mô hình quyết định lúc t=0, v0≥0, initial braking=0; td=activation delay + actuator delay (source config .15+.10=.25s); sau td, b(u)=min(Ju,b_cap), tr=b_cap/J. Delay này là source command timing model; physical delay phải đo riêng, tránh đếm hai lần cùng lag. Core dùng bước rời rạc, lệnh đầu có thể .2m/s²; công thức continuous không là bit-exact core replay.

Trong delay: x=v0t, v=v0. Trong ramp tại u=t−td≥0 trước khi stop/cap:
v=v0−Ju²/2; x=v0td+v0u−Ju³/6.

Nếu v0≤b_cap²/(2J): ts=√(2v0/J);
D_stop=v0td+(2/3)v0ts; T_stop=td+ts.
Nếu v0>b_cap²/(2J):
v1=v0−b_cap²/(2J);
D_stop=v0td+v0tr−Jtr³/6+v1²/(2b_cap)
=v0(td+tr/2)+v0²/(2b_cap)−b_cap tr²/24;
T_stop=td+tr+v1/b_cap.
v0=0 → D_stop=0,T_stop=0 (không chờ td khi đã đứng). b≤0/J≤0 invalid cho model này; constant-b được tính riêng P03, không chia cho0. Initial decel≠0, partial command, cancellation, variable grade/envelope → integrate model b(t,v) riêng với certified numerical error, không reset ramp ở mỗi frame.

Giả định trajectory thẳng, không collision impulse/velocity override, b thực đạt envelope, không thay target motion. Nguồn: tích phân dv/dt=−b(t), dx/dt=v; phần constant acceleration đối chiếu [OpenStax](https://openstax.org/books/university-physics-volume-1/pages/3-4-motion-with-constant-acceleration). Không coi closed form này là kết quả calibration.

Ví dụ:

- v0=11.1,b=8,J=20,td=.25 → **12.6422916667m**,1.8375s. XLS F04 ví dụ13.7m không đúng với bộ input này.
- v0=50/3.6,b=8,J=20,td=.25 →18.2529938272m,2.1861111111s (007 conditional).
- v0=50/3.6,b=6.3765,J=20,td=.25 →20.7852272990m,2.5875492347s (125 wet conditional).
- v0=1,b=8,J=20,td=.25 →.4608185107m,.5662277660s, stop trong ramp.

Method `StoppingModel.integrate`, `distanceFromRestBrake`. D_stop không tự dự đoán có pedestrian ở đó lúc xe tới.

### P03 — Ideal distance và inverse braking requirement

Constant b, no delay/ramp: D_ideal=v²/(2b), T_ideal=v/b. Required no-delay b_ideal=v²/(2D), D>0. Với pure delay td nhưng instant b:
b_req,delay=v²/[2(D−vtd)], chỉ D>vtd.
D≤vtd và v>0: infeasible to stop before boundary under that delay model, không output infinite number và không suy inevitable pedestrian collision.

Inverse đầy đủ: tìm b trong admissible envelope sao cho P02.D_stop(v,b,J,td)≤D−m_s; report feasible set/b_req nếu solver chứng nhận nghiệm và monotonicity trong miền dùng; nếu không → UNKNOWN. Không thay inverse ramp bằng v²/2D rồi gán actuator failure. Method `StoppingModel.idealLowerBound`, `requiredEnvelope`.

### P04 — Stopping margin và latest decision windows

M_stop(t)=D_clear(t)−D_stop(state(t),envelope)−m_s. m_s không lặp lại footprint radius/boundary offset. M≥0 chỉ nói mô hình dừng trước boundary, chưa phải 2D avoidability.

F_stop={t∈decision_domain: M_stop(t)≥0 và model valid}; biểu diễn union interval, không giả monotone từ mọi trace. t_last,stop=sup F_stop chỉ có khi tập không rỗng và right boundary thực sự được quan sát/giải quyết; right-censored thì report bound, t_last exact UNKNOWN. Empty proven set → NO_FEASIBLE_STOP_WINDOW, không t_last=0.

Δdecision=t_decision−t_last,stop và Δdetection=t_detect−t_last,stop là signed comparisons [s] có interval uncertainty. Với t_decision∈[a,b],t_last∈[c,d], Δ∈[a−d,b−c]. Nếu khoảng chứa0 thì thứ tự không xác định. Detection time không phải earliest observable time. Dữ liệu sau phanh không dùng làm unbraked path mà không có counterfactual model ghi rõ.

Method `FeasibilityAnalyzer.stoppingWindows`, `TimingComparator.compareIntervals`. Golden011 Q4.90, command engage5.15>coverage5.09: right-censored response, không “no brake”.

### P05 — Avoidability 2D, action set và physical limit

Cho U là tập action được cho phép (brake-only hoặc thêm steering phải nêu rõ), Θ là uncertainty set đã định nghĩa, response dynamics và prediction horizon H:
A={t_d : ∃u∈U, ∀θ∈Θ, E_u,θ(t)∩P_θ(t)=∅ cho mọi t∈[t_d,t_d+H]}.
A là feasible robust avoidance windows dưới model; có thể không liên thông vì braking thay đổi arrival/occupancy. Không thay A bằng F_stop.

UNAVOIDABLE_UNDER_MODEL chỉ khi certificate chứng minh ∀u∈U,∀θ∈Θ,∃t∈horizon có intersection (và Θ không rỗng, model domain validated). Nếu chỉ ∀u∃θ collision thì đó là “không bảo đảm tránh”, chưa phải mọi thực tế đều unavoidable. Nếu không robust tránh được nhưng có cả safe/unsafe possibilities → UNKNOWN. Finite search không tìm ra u chỉ báo NO_VERIFIED_AVOIDING_ACTION. Action realizability, decision/observable reference time và target response assumptions phải có refs; không chứng minh physical limit bằng một TTC hoặc negative 1D margin.

PHYSICAL_LIMIT label cần policy và capability đủ, tham chiếu reference time (ví dụ first validated observable hazard), action set, certificate và uncertainty. Không hàm ý AEB không có lỗi trước reference time. Golden18 thiếu validated dynamics/domain/observability, do đó **physical avoidability/PHYSICAL_LIMIT chưa thể khẳng định**. Method `FeasibilityAnalyzer.avoidanceWindows`, `verifyCertificate`. Latest feasible 2D decision là sup A khi boundary không censored, không dùng min{egoX≥cx−D_stop} của XLS.

### T01 — AEB/physical event latency và travel

L_detect=t_detect−t_observable; L_decision=t_decision−t_detect; L_command=t_command_engaged−t_decision; L_physical=t_physical_onset−t_command_engaged. Earliest observability phải có sensor/visibility evidence, không lấy target spawn/GT shadow làm observable. Có thể report signed order nếu uncertainty nhưng không gọi negative latency vật lý khi clocks chưa chắc.

D_travel=Σ||p_i−p_(i−1)|| trên window đã định danh; chọn 2D horizontal hoặc 3D riêng. Không cộng model extrapolation vào measured travel mà không tách component. Coverage gaps → measured partial distance, total UNKNOWN. Golden004 D/Q2.2/2.25 và engage2.5 core →.05s decision lag,.25s command lag; physical lag UNKNOWN. Method `AebTimelineBuilder.build`, `MotionMetrics.distance`.

### T02 — Physical deceleration, tracking và jerk

Speed horizontal s=√(vx²+vy²) hoặc signed tangent velocity theo use case, ghi choice. b_avg(t_i,t_j)=(s_i−s_j)/(t_j−t_i), timestamps thật, window [s], không cố định “10 rows” nếu sampling không đều. Peak=max b_avg trong pre-contact eligible window; output filter/window and coverage. G không bị core DecelMeter clamp nhưng vẫn là cùng simulator, không độc lập với calibration/velocity override.

RMSE_b=√[∫_W(b_ref,feasible(t)−b_measured(t))²dt/|W|], numeric quadrature duration-weighted; chỉ so aligned valid samples, không dùng max configurable làm reference suốt ramp. J_i=(a_i−a_(i−1))/(t_i−t_(i−1)); RMS_J=√[Σ J_i² Δt_i/ΣΔt_i] trên window/filter đã định nghĩa. Contact impulse, initialization và override phải flag, không chỉ clip về μg làm đẹp.

Peak deficit b_cap−b_peak có thể descriptive diagnostic nhưng không causal failure test; cap không phải demanded decel mọi lúc. Physical onset cần baseline/noise/filter + threshold + sustained duration approved; Golden18 chỉ có first pedal statistic và legacy T_AEB từ gated/clamped acceleration, không physical onset authoritative. Existing ADR-040 jerk objective giữ nguyên trong legacy namespace, diagnostic jerk có metric ID/version riêng. Method `PhysicalBrakingAnalyzer.estimate`, `trackingError`, `jerk`.

### I01 — Impact và mitigation

Với contact time tc từ matching event, chọn pre-contact snapshot frame<contact frame; v_impact,ego=||v_E(tc−)||; v_impact,relative=||v_E(tc−)−v_P(tc−)||. Không dùng |speedE−speedP| khi khác hướng, không lấy post-impact hoặc core termination frame không có contact. Missing vector/time interpolation bound → UNKNOWN, có thể giữ reported scalar source riêng.

Paired Δv=v_rel,OFF−v_rel,ON chỉ khi cả hai có comparable matched contact, cùng speed basis và pairing criteria (seed, variant, vehicle/physics/simulator, target program, timing/coverage). Kết quả là observed association, không quy causal contribution nếu disturbances/writers chưa kiểm soát. Nếu ON không ghi contact nhưng coverage chưa complete → mitigation UNKNOWN. Nếu ON verified no-contact và OFF contact → COLLISION_AVOIDED_OBSERVED, impact ON vẫn null, không per-run synthetic0. Legacy aggregation `AnalysisMetrics` cho0 no-hit được giữ ở objective version riêng. Golden029 có ON/OFF contact hỗ trợ observed speed mitigation; 028 OFF không có sensor contact nên không lấy legacy impact để khẳng định paired mitigation. Method `ImpactAnalyzer.extract`, `PairComparison.compare`.

### Q01 — Evidence gates, uncertainty và rates

Capability q_k=AND các requirement thật sự cần cho claim k; kết quả SUFFICIENT/PARTIAL/INSUFFICIENT/NOT_APPLICABLE. Không AND tất cả sensor/calibration cho mọi claim. Positive contact có thể đủ dù calibration jerk chưa biết.

Với y=f(x), validated covariance Σ: u_y²=J_fΣJ_fᵀ (first-order approximation, nêu nonlinearity limits). Nếu dùng expanded uncertainty U=k u_y phải có coverage rationale; nếu chỉ có input intervals thì dùng verified interval/bound propagation, không tự gán probability. Tham khảo [NIST TN1297 combined uncertainty](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-5-combined-standard-uncertainty) và [reporting](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-7-reporting-uncertainty). Không có σ/bounds → uncertainty UNKNOWN; arithmetic precision không bù được uncertainty thiếu.

Rate_outcome=n_collision_among_eligible/n_outcome_eligible; unknown count công khai riêng. Rate_false=n_supported_false/n_nonhazard_policy_eligible; Rate_failure=n_supported_functional_failure/n_functionally_evaluable. Denominator0 → UNKNOWN, không0%. Eligibility phải được freeze theo version, cùng cohort; outcome-eligible không đồng nghĩa cause-eligible. Grouped rate dùng từng bin có n và unknown, không gộp ON/OFF hoặc rep như independent scenario. Nếu cohort chỉ còn positive events đủ evidence còn no-event run bị thiếu coverage, rate trên eligible subset bị selection bias: không gọi đó là population collision rate. Luôn công khai eligible/unknown/excluded counts; chưa approved eligibility thì rate chính thức UNKNOWN, có thể báo descriptive recorded-contact count riêng. Golden18 có18 clusters, không 72 mẫu độc lập; không ước lượng xác suất sensor miss/cause từ score. Method `EvidenceValidator.capability`, `UncertaintyPropagator.propagate`, `DiagnosticRateCalculator.aggregate`.

### Q02 — Calibration applicability

Với corrected field f, run context c và validated domain D_f tied to calibration artifact/version/hash:
applicability=IN_DOMAIN nếu mọi required constraint được chứng minh c∈D_f; OUT_OF_DOMAIN nếu ít nhất một constraint chắc chắn vi phạm; UNKNOWN nếu chưa đủ context/domain evidence và chưa chứng minh vi phạm; NOT_APPLICABLE nếu claim không dùng corrected field đó. Conflict metadata giữ disagreements và UNKNOWN cho applicability liên quan.

“Vehicle nằm trong4 mẫu, speed20–60,μ≥.55” trong XLS F19 là giả định tác giả, không phải D_f đã được xác nhận. Golden18 pedal_map name và full_brake_decel9.13 không đủ domain/residual bounds. Method `CalibrationScopeResolver.applicability`.

## 3. Disposition đầy đủ của HTML V2

Mỗi dòng xác định công thức chuẩn chính xác ở phần2; units/conditions/missing của công thức đó có hiệu lực. Cột input liệt kê cái thực sự có, không giả availability. Source=HTML nhóm/ordinal tương ứng + audit/source được nêu; công thức mới là derivation của V3, không gán cho nguồn đã xuất bản.

| ID / disposition | Biểu thức chuẩn, giả định và đơn vị | Input thực tế; missing rule riêng | Golden example; giới hạn causal; future method |
|---|---|---|---|
| V2-A01 KEEP | G01: v=V/3.6; v_long=v·f, đúng pose [m/s] | B.variant.ego_speed_kmh, G vectors/yaw; full pose thiếu | 004 nominal40→11.111m/s; không achieved speed. CoordinateNormalizer.project |
| V2-A02 CORRECT | Q01: q_k=AND dependencies của claim k [categorical] | Schema/time/unit có, sensor coverage/calibration partial | 007 contact giữ known khi root unknown; không whole-run reject. EvidenceValidator.capability |
| V2-A03 CORRECT | Q02 four-state membership, không bool [—] | Name/hash có phần; domain/residual thiếu | Toàn18 domain UNKNOWN; không gán calibration failure. CalibrationScopeResolver.applicability |
| V2-B01 CORRECT | G01 boundary gap=(boundary−front)·f [m] | Core ego_x/crossing_x có, bbox transform thiếu | 007 gap20.45 ở shadow4.35 conditional; không proof avoidable. GeometryEngine.distanceToBoundary |
| V2-B02 KEEP | G02 TTC_x=g/closing [s], g>0,closing>0 | Core ttc/perceived_y có, full track vx thiếu | 002 TTC dọc dương nhưng target ra lane; không collision oracle. ConflictMetrics.longitudinalTtc |
| V2-B03 CORRECT | G04 union occupancy intervals [s] | GT trajectory có, full bbox thiếu | 026 contact khi front đã qua3.272m; front arrival không đủ. ConflictMetrics.occupancy |
| V2-B04 CORRECT | G03 ∃same-time footprint intersection [bool] | Nominal/applied dimensions, G; missing transforms → conditional | 011 corner geometry disagreement; không axis-expanded OR truth. GeometryEngine.conflictIntervals |
| V2-B05 CORRECT | G03 min_t distance(E,P) [m], continuous resolution | G series có, full physical shape missing | 002 nominal ~1.08m; không ép0 vì end label. GeometryEngine.minimumClearance |
| V2-B06 CORRECT | G04 PET=enter_later−exit_earlier [s], disjoint only | Occupancy boundary & exit cần resolved | 002 disjoint intervals support timing separation; overlap→null. ConflictMetrics.pet |
| V2-C01 CORRECT | P01 min of valid physical bounds [m/s²] | Run max8,μ,full9.13,vehicle9.5; validity missing | 125 cap6.3765 conditional; low cap không automatic root. PhysicalEnvelopeResolver.resolve |
| V2-C02 KEEP | P03 D=v²/(2b),T=v/b [m,s] no delay/ramp | Speed/config có | 007 ideal distance nhỏ hơn18.253 full model; lower bound only. StoppingModel.idealLowerBound |
| V2-C03 CORRECT | P02 td=τact+τadapter, b(u)=min(Ju,b) [s,m/s²] | Config .15, source adapter.10; physical delay missing | 011 engage scheduled5.15, censored5.09; no actuator failure. StoppingModel.integrate |
| V2-C04 KEEP | P02 stop-after-ramp closed form [m], v>b²/(2J) | Config/model inputs có | 00718.253m conditional; chưa 2D proof. StoppingModel.distanceFromRestBrake |
| V2-C05 KEEP | P02 ramp-stop D=vtd+(2/3)v√(2v/J) [m] | Low-speed states có; override contaminates | 004 low-speed override aggregate108 frames: analytic response not actual proof. StoppingModel.distanceFromRestBrake |
| V2-C06 CORRECT | P04 M=Dclear−Dstop−m_s [m], radius once | Model distances có, approved m_s thiếu | 125 near boundary variability; M<0 không inevitable contact. FeasibilityAnalyzer.stoppingWindows |
| V2-C07 CORRECT | P03 inverse with delay/ramp [m/s²]; ideal special case | D/v/config partial; envelope validity missing | 007 ideal demand không evidence actuator lacked force. StoppingModel.requiredEnvelope |
| V2-C08 REPLACE | P05 feasible avoidance windows; P04 separate stop latest [s] | Counterfactual dynamics/uncertainty incomplete | 027 earlier350ms correlated with event difference; no unique cause. FeasibilityAnalyzer.avoidanceWindows |
| V2-D01 CORRECT | T01 separate detect/decision/command/physical delays [s] | D/Q/B present most; observable/physical onset absent | 012 pedal pulses không match AEB; latency UNKNOWN. AebTimelineBuilder.build |
| V2-D02 CORRECT | T01 Σ position increments [m], measured vs extrapolated | G positions có, horizons censored at end | 011 tailCSV không thêm measured physics travel. MotionMetrics.distance |
| V2-D03 CORRECT | T02 duration-weighted feasible-reference RMSE [m/s²] | GT speed có; per-tick demanded/applied command missing | 004 max metric9.81 ≠ requested8; không root from scalar. PhysicalBrakingAnalyzer.trackingError |
| V2-D04 CORRECT | T02 jerk finite difference + declared RMS/filter [m/s³] | Raw G/F và core gated/clamped khác signal | 004 aggregate physical spikes need flags; no silently change ADR objective. PhysicalBrakingAnalyzer.jerk |
| V2-D05 CORRECT | I01 relative và ego pre-contact speeds riêng [m/s] | E scalars/G vectors có khi event | 007 relative13.935 vs ego13.891; not interchangeable. ImpactAnalyzer.extract |
| V2-D06 CORRECT | I01 Δv only comparable double-contact; avoided is category [m/s] | ON3/OFF1 same seed, writer/dynamics matching incomplete | 029 observed mitigation; không causal proof/synthetic0. PairComparison.compare |
| V2-E01 CORRECT | Q01 interval/covariance uncertainty [unit of quantity] | No validated σ/residual bounds | 064 inferred+.27s không exact timestamp certainty; no score→probability. UncertaintyPropagator.propagate |
| V2-E02 CORRECT | Policy outcome predicates using G03/contact/thresholds [enum] | Legacy thresholds exist, normative new thresholds open | 011 outcome UNKNOWN; unsafe flag không confirmed failure. DiagnosisPolicy.assessOutcome |
| V2-E03 REPLACE | AEB-effective intervention AND no allowed hazard/reason at decision time [bool candidate] | Q/B và retrospective path; controller trace missing | 061 acceptable caution unknown; FP only suspected. DiagnosisPolicy.falseBraking |
| V2-E04 REPLACE | Independent no-command/ineffective candidates with duty/opportunity/evidence [claims] |007/012 noQ, other contacts haveQ; gaps remain | 007 no root “perception” confirmed; OFF excluded. DiagnosisPolicy.functionalCandidates |
| V2-F01 CORRECT | Q01 rates with explicit claim-specific denominator [fraction] |72 run,31 recorded events,12 mismatch | Do not count unknown as safe; not false-brake rate6/54 without eligibility. DiagnosticRateCalculator.aggregate |
| V2-F02 CORRECT | Q01 supported failure / functionally evaluable [fraction] | No confirmed Golden18 functional ground truth | Denominator0→UNKNOWN; not100% evaluator labels. DiagnosticRateCalculator.aggregate |
| V2-F03 KEEP | Q01 rate per bin + n,unknown and clustered reps [fraction] |18cases/54ON/18OFF only Audi/CP_CROSSING | 125 wet group sample tiny, no reliability/causal claim. DiagnosticRateCalculator.group |

## 4. Disposition đầy đủ Excel F01–F23

| XLS ID / disposition | Công thức chuẩn và phạm vi chính xác | Input dataset; missing và đơn vị | Golden example; causal limit; future method |
|---|---|---|---|
| XLS-F01 CORRECT | G02 TTC_x=g/(vE−vTx), mathematical closing>0; legacy eligibility closing≥2 tách riêng | Core gap/speed/ttc có; target vx track thiếu [s]; dùng GT chỉ cho hindsight | 002 no simultaneous conflict dù TTC nhỏ. ConflictMetrics.longitudinalTtc |
| XLS-F02 KEEP | G02 w_c=.5W+.25×2.0 [m], legacy AEB corridor only | Nominal W1.93 có; physical W2.032757 khác | 1.465 corridor ≠1.265 nominal physical center bound. LegacyAebRuleDescriptor.describe |
| XLS-F03 CORRECT | G02 detected AND in_path(current OR predicted) AND TTC thresholds; FCW+1 [bool] | Q/D/FCW có; actual vLeft/predictedY absent → replay UNKNOWN | 064 predicted motion hypothesis only. LegacyAebRuleDescriptor.describe |
| XLS-F04 CORRECT | P02 full delay+ramp piecewise; fixes branch and numeric example [m] | τ.15,b8,J20 và adapter.10 source; physical efficacy missing | v11.1→12.6422917m, không13.7; case004 model only. StoppingModel.distanceFromRestBrake |
| XLS-F05 REPLACE | P04 M=Dclear−Dstop−m_s [m], G01 near-side boundary | Core crossing_x/ego_x có; transform/m_s incomplete | 125 model stop margin alone not 2D failure. FeasibilityAnalyzer.stoppingWindows |
| XLS-F06 CORRECT | Legacy observed gap=stopped_event.gap_m [m], not body clearance; new G03 clearance riêng | O.events stopped gap có khi stop; no stop→NOT_APPLICABLE | 004 stopped gap4.55 vs min_distance4.256; not same metric. LegacyEvidenceAdapter.stoppedGap |
| XLS-F07 KEEP | P03 b_ideal=v²/(2D) [m/s²], no delay/ramp lower bound | D/v có conditional; D≤0 special status | 007 ideal feasible screen cannot certify physical avoidability. StoppingModel.idealLowerBound |
| XLS-F08 REPLACE | P04 F_stop union and sup; P05 A union for 2D [s] | Counterfactual path/envelope/horizon missing parts | 026 full-body side entry, no single front-crossing latest. FeasibilityAnalyzer.avoidanceWindows |
| XLS-F09 CORRECT | P04 Δdecision interval difference [s], boundary not censored | Q known most, certified t_last absent | 027 Q2.25 vs2.60 observation, not proven causal deadline breach. TimingComparator.compareIntervals |
| XLS-F10 CORRECT | P04 Δdetect=tDetect−tLast [s], not observable lateness | D known except007/012; missing observability | 007 Dnull not infinite delay/perception root. TimingComparator.compareIntervals |
| XLS-F11 CORRECT | T01 command latency B−Q; physical onset separate [s] | B/Q core gives .25; ramp completion extra; physical onset missing | 011 Q4.9/Bnull expected5.15 beyondend; no actuation timeout. AebTimelineBuilder.build |
| XLS-F12 CORRECT | T02 peak over actual timestamp .1s windows [m/s²], not fixed10rows blindly | G vectors/time available; impulse/overrides masks incomplete | 004 speed-derived response can be inspected, not independent calibrated truth. PhysicalBrakingAnalyzer.estimate |
| XLS-F13 REPLACE | T02 feasible demand tracking RMSE; peak deficit only descriptive [m/s²] | Per-tick request missing; configured min caps available | Cannot label actuator root from b_cap−b_peak>1. PhysicalBrakingAnalyzer.trackingError |
| XLS-F14 CORRECT | G03 distance to OBB minus ped radius, bbox offset/pose [m] | G yaw+position and two sizes; pitch/roll/offset missing | 011 nominal pre-force d≈.06261m, not forced0. GeometryEngine.minimumClearance |
| XLS-F15 CORRECT | G04 ego interval [cx−r−front0, cx+r+L−front0]/v [s] | Front convention, target radius and motion assumptions explicit | 002 longitudinal5.81–6.19; rear body included. ConflictMetrics.occupancy |
| XLS-F16 REPLACE | G03 ∃t actual E(t)∩P(t), ex-ante and hindsight distinct [bool] | GT available; full geometry/control prediction missing | 002 ever-in-lane not hazard, 061 future curb intent unknown atQ. GeometryEngine.conflictIntervals |
| XLS-F17 CORRECT | G04 PET positive disjoint; overlap→null+relation [s] | Full interval exits required, censoring→UNKNOWN | 011 terminated before full encounter; no PET proof safe. ConflictMetrics.pet |
| XLS-F18 REPLACE | I01 paired Δv only both confirmed comparable contact [m/s] | Event scalar relative speeds available31run; no-hit field stays null | 029 observational reduction, 028 OFF mismatch invalidates comparison. PairComparison.compare |
| XLS-F19 REPLACE | Q02 validated per-field domain membership [enum] | Name/config present, domain/coverage not supplied | All18 calibration applicability UNKNOWN where used; not assume4vehicles validity. CalibrationScopeResolver.applicability |
| XLS-F20 REPLACE | Decision-time false-braking candidate predicate, no hindsight HIGH score [claim] | 061/064 Q/B/hindsight no corridor entry, no trackertrace | 061 caution plausible,064 stalevelocity plausible; neither confirmed FP. DiagnosisPolicy.falseBraking |
| XLS-F21 REPLACE | No effective command + validated duty/opportunity + complete command coverage [claim] | 007/012 no D/Q/B,011Qpending,OFFshadow excluded | 012 pedal>0 insufficient AEB attribution; 011 not no-brake. DiagnosisPolicy.noBraking |
| XLS-F22 REPLACE | Independent ineffective-braking, feasibility, timing and response claims; no priority cascade [claims] | Q/contact common, model/cause evidence partial | 125μ.65 cap conditional, not automatic PHYSICAL_LIMIT; no .05s/1m/s² magic thresholds. DiagnosisPolicy.ineffectiveBraking |
| XLS-F23 CORRECT | Q01 capability-local sufficiency/censoring [enum] |12collision disagreements and other missing traces | 007 contact known while cause unknown; 011 preserveQ timing despite outcome UNKNOWN. EvidenceValidator.capability |

Không DEFER toàn bộ một công thức chỉ vì một input hiện thiếu: phép toán vẫn được đặc tả để implement. Các **claim được DEFER ở runtime**: validated physical onset, earliest sensor observability, calibrated response guarantee, certified 2D unavoidable, probability/confidence và confirmed root cause khi prerequisites thiếu. Chúng xuất UNKNOWN với missing evidence, không bị loại khỏi report.

## 5. Verification specification cho implementer

Đây là acceptance cho implementation tương lai; Phase2 chỉ kiểm tra tính nhất quán tài liệu và số học.

1. Unit dimensions phải khớp mọi phương trình; degree/radian, km/h/m/s, left/world-y sai phải bị reject hoặc explicit transform. Numerical checks P02 có tolerance1e−8m với exact decimal inputs; không áp tolerance này lên raw measured ground truth.
2. P02 continuous ở v=b²/(2J), D≥0 và D(v=0)=0; J→∞ hội tụ vtd+v²/(2b); td tăng Δ thì D tăng vΔ; numeric integration độc lập so analytic hai branch.
3. G03 corner counterexample: axis-expanded rectangle overlap nhưng Euclidean circle/rectangle chưa contact không được positive; rear-side conflict vẫn phải positive dù front TTC null. Rotation/gap unresolved phải UNKNOWN.
4. G04 occupancy phải dùng cùng time, đầy đủ thân và radius; no lane-entry-at-any-time oracle; PET overlap không giả0; missing exit là censored.
5. P05 chỉ “không tìm được action” không được UNAVOIDABLE; negative stopping margin với pedestrian rời sớm vẫn có thể no conflict. Non-monotone feasible set phải giữ union.
6. T01 OFF Q không thành actual action;011 coverage trước scheduled engage không thành failure;064R1 clock offset không chứng minh brake before decision.
7. I01 crossing velocities phải vector relative; no-contact speed null; legacy aggregate0 chỉ ở ADR objective namespace.
8. Mỗi row mapping ở phần3/4 phải có formula ID trong provenance và local unit/integration acceptance từ [GOLDEN18](GOLDEN18_EXPECTED_BEHAVIOR.md). Không dùng legacy chain làm expected causal label.

## 6. V3.1 — Canonical objectives và hướng suy luận, không thay53formula mappings

Các mục G/P/T/I/Q và dispositions trên vẫn giữ cho evidence diagnosis. **T02 diagnostic jerk, T01 measured travel, P02 predicted stopping distance và I01 contact impact không thay canonical objective cùng tên.** Exact provenance/algorithm và per-run/aggregate mappings tại [OBJECTIVE_ANALYSIS](OBJECTIVE_ANALYSIS_CONTRACT_V1.md).

| ID / disposition | Công thức/contract phải giữ | Scope, missing và mapping |
|---|---|---|
| OA-J KEEP canonical | CARLA: RMS=round3(√mean(((Butterworth6×2_10Hz(ego_a)[i]−before)/stepS)²)), i từ tAebIndex đến end | Lọc whole series trước window; source init/padding/last threshold crossing như Filters; no T_AEB→null, không0. Kinematic giữ raw brakePhaseMetrics. CanonicalObjectiveReader/ObjectiveExplainer đề xuất, producer KEEP |
| OA-I KEEP canonical | Scalar impact của đúng simulator vintage, relative current CP/lead source; no-collision per-run null | Aggregate no-hit0 sau valid gate; diagnostic contact impact I01 riêng, missing contact không lấy termination speed làm physical truth. ImpactObjectiveExplainer đề xuất |
| OA-D KEEP canonical | D=round3((x_last−x_start)+v_last²/(2round3(a_available))) khi a_available>0; legacy source tail0 nếu≤0 | x_start theo positionAfterStep/vintage; short trace/onset missing→null; a≤0 flag invalid không physical guarantee; trace/model components riêng. StoppingObjectiveExplainer đề xuất |
| OA-A KEEP canonical | AnalysisMetrics.aggregate/1 theo Sample + ordered missing/NA branches | Mean theo run, không cluster mean/new weight; missing>0→value null; NA toànJ/D→không3 objectivesAvailable. Không chạy aggregate để tạo Golden18 v1 score |
| OA-C REPLACE assumption of consumer parity | So exact cohort+membership+missing handling+rounding giữa AnalysisMetrics và OptimizationService.evaluateCandidateRuns | Source hiện divergent, không tự sửa số. CompatibilityValidator đề xuất, không sửa optimizer trong nhiệm vụ này |
| OA-H DEFER numeric hints khi thiếu evidence | R_k=intersection của catalog_snapshot,actual_engine,approved_campaign và explicit validated parameter constraints | Không ±percentage/tựshrink; unknown domain→UNKNOWN, empty→EXCLUDED. ParameterHintBuilder/SourcedRangeResolver đề xuất; chỉ4codes |

Tất cả OA entry có units và input thực tế theo contract mới; không biến “KEEP canonical” thành endorsement measurement quality. Golden026 command B có nhưng T_AEB/jerk null là required missing case. Golden125 canonical extrap dùng6.377 đã round, không thay6.3765 analytic. Khi bounds/cause chưa đủ, explanation vẫn xuất scalar recorded và UNKNOWN cho causal impact.

Không suy gradient hoặc optimum của bốn parameters từ một run. Causal explainability, physical avoidability, objective value và suspected parameter direction là bốn kết luận khác nhau. Hint derivation phải dùng optimization partition evidence; sealed validation không làm nguồn chọn hint/search range.
