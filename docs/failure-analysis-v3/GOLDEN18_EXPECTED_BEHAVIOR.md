# GOLDEN18_EXPECTED_BEHAVIOR — Oracle theo bằng chứng, không theo legacy label

V3.1 DESIGN ONLY. Đây là expected behavior cho implementation tương lai của contract v1 / formulas3.0.0 / policy1.0.0 conservative diagnostic. Chưa chạy module mới, chưa có kết quả đánh giá mới. Không tạo ground truth từ `Evaluation.evaluate` hoặc tên/intention golden case.

## 1. Corpus và quy tắc oracle

Đã đối chiếu72result,72frames.csv,72ground_truth.csv,72collisions.json và summaries/lifecycle/bundle. Có18case×(3ON+1OFF), 54ON/18OFF;18 clusters, không72 independent scenarios. Tất cả CP_CROSSING Audi e-tron, cùng bộ delay.15/max8/buildup20; TTC1.5 ngoại trừ091=.6. Raw31423coreframes,31528framesCSVrows,62768GTrows. Hash và source revision nằm trong [DATA_CONTRACT](DATA_CONTRACT_V1.md); không sửa artifact.

Nguồn chính [A02 — từng case và bảng72run](../../data/failure-audit-output/02_CASE_BY_CASE_AUDIT.md), [A03 — consistency và geometry](../../data/failure-audit-output/03_DATA_CONSISTENCY_AUDIT.md), [A01 — code paths](../../data/failure-audit-output/01_EVALUATOR_LOGIC_AUDIT.md); source cụ thể ở [REFACTOR_BLUEPRINT](REFACTOR_BLUEPRINT.md). Facts dưới đây là confirmed **as recorded**, không certified physical causation.

Đường dẫn RAW chính xác:

- ON: `runs/{case}/rep{r}_a1/result.json` và sibling `sensors/{frames.csv,ground_truth.csv,collisions.json,summary.json}`.
- OFF: `runs_aeboff/{case}-OFF/rep1_a1/result.json` và siblings như trên.
- Config: `runs/{case}/bundle.json`, scenario.xosc; metadata: `metadata/runs_manifest_subset.jsonl`.
- D=`/outcome/metrics/first_detection_t`; Q=`aeb_decision_t`; B=`brake_onset_t`. Những ký hiệu này đều ở clock core. B là command engage model, **không physical onset**.
- Contact count lấy array length của `sensors/collisions.json` sau actor binding; chưa có complete absence coverage/drain watermark.

Mọi run phải có: calibration applicability UNKNOWN cho physical corrected claim thiếu domain; exact physical avoidability UNKNOWN (có thể có model conditional); confirmed_root_cause UNKNOWN; uncertainty bounds UNKNOWN nếu chưa có model hợp lệ; giữ nominal/applied geometry disagreement. Không ép candidates khi không có triệu chứng hỗ trợ.

## 2. Expected72run matrix

Mỗi tuple theo thứ tự R1/R2/R3/OFF-R1. `C`=COLLISION, basis RECORDED_MATCHING_CONTACT; `U`=physical outcome UNKNOWN theo conservative policy. Đây **không** là legacy outcome. `X`=core termination COLLISION, `S`=EGO_STOPPED, `T`=TARGET_CLEARED. ∅ là raw null, không số0. D/Q/B triples là ON R1/R2/R3; OFF luôn B∅, D/Q cho ở cột cuối. Expected time comparisons dùng declared raw precision, không clock-align ngầm.

| Case | Core ends R1/R2/R3/OFF | Contact counts R1/R2/R3/OFF | New physical outcomes | ON D/Q/B R1; R2; R3 [s] | OFF D/Q [s], hypothetical |
|---|---|---|---|---|---|
| FA-G1-001 | X/S/S/X | 1/0/0/1 | C/U/U/C | 2.35/2.35/2.60; 2.30/2.30/2.55; 2.30/2.30/2.55 | 2.30/2.30 |
| FA-G1-002 | T/T/T/T | 0/0/0/0 | U/U/U/U | 5.30/∅/∅; 5.30/∅/∅; 5.30/∅/∅ | 5.30/∅ |
| FA-G1-003 | S/S/S/T | 0/0/0/0 | U/U/U/U | 2.20/3.15/3.40; 2.25/3.15/3.40; 2.20/3.15/3.40 | 2.20/3.15 |
| FA-G1-004 | S/S/S/X | 0/0/0/1 | U/U/U/C | 2.20/2.25/2.50; 2.20/2.25/2.50; 2.20/2.25/2.50 | 2.20/2.25 |
| FA-G1-007 | X/X/X/X | 1/1/1/1 | C/C/C/C | ∅/∅/∅; ∅/∅/∅; ∅/∅/∅ | ∅/∅ |
| FA-G1-010 | S/S/S/X | 0/0/0/1 | U/U/U/C | 2.40/2.90/3.15; 2.40/2.90/3.15; 2.40/2.90/3.15 | 2.40/2.90 |
| FA-G1-011 | X/X/X/X | 0/0/0/0 | U/U/U/U | 4.90/4.90/∅; 4.90/4.90/∅; 4.90/4.90/∅ | 4.90/4.90 |
| FA-G1-012 | X/X/X/X | 1/1/1/1 | C/C/C/C | ∅/∅/∅; ∅/∅/∅; ∅/∅/∅ | ∅/∅ |
| FA-G2-026 | X/X/X/X | 1/1/1/1 | C/C/C/C | 2.05/2.60/2.85; 2.05/2.60/2.85; 2.05/2.60/2.85 | 2.05/2.60 |
| FA-G2-027 | X/X/X/X | 1/0/0/0 | C/U/U/U | 2.10/2.25/2.50; 2.10/2.60/2.85; 2.10/2.60/2.85 | 2.10/2.25 |
| FA-G2-028 | X/X/X/X | 1/1/1/0 | C/C/C/U | 2.05/2.15/2.40; 2.05/2.15/2.40; 2.05/2.15/2.40 | 2.05/2.15 |
| FA-G2-029 | X/X/X/X | 1/1/1/1 | C/C/C/C | 2.20/2.20/2.45; 2.20/2.20/2.45; 2.20/2.20/2.45 | 2.20/2.20 |
| FA-G3-061 | S/S/S/T | 0/0/0/0 | U/U/U/U | 2.10/2.15/2.40; 2.10/2.15/2.40; 2.10/2.15/2.40 | 2.10/2.15 |
| FA-G3-064 | S/S/S/T | 0/0/0/0 | U/U/U/U | 2.10/2.45/2.70; 2.05/2.45/2.70; 2.10/2.45/2.70 | 2.05/2.45 |
| FA-G4-091 | X/X/X/X | 0/0/0/1 | U/U/U/C | 2.25/3.60/3.85; 2.25/3.60/3.85; 2.25/3.60/3.85 | 2.25/3.60 |
| FA-G5-125 | X/X/T/X | 1/1/0/1 | C/C/U/C | 2.10/2.10/2.35; 2.10/2.10/2.35; 2.05/2.05/2.30 | 2.10/2.10 |
| FA-G6-144 | X/S/S/X | 0/0/0/1 | U/U/U/C | 2.10/2.10/2.35; 2.10/2.10/2.35; 2.10/2.10/2.35 | 2.10/2.10 |
| FA-G6-168 | S/X/S/X | 0/1/0/1 | U/C/U/C | 2.30/2.30/2.55; 2.35/2.35/2.60; 2.30/2.30/2.55 | 2.30/2.30 |

Expected aggregates:20ON+11OFF=31recorded contacts/C,41U,0 hard SAFE/NEAR_MISS under this profile. Legacy43collision=29ON+14OFF vẫn giữ trong legacy namespace. Exact12collision disagreements:011ONR1/R2/R3/OFF;027ONR2/R3/OFF;028OFF;091ONR1/R2/R3;144ONR1. Positive event trong corpus không có trường hợp legacy collision=false.

Outcome UNKNOWN ở các no-event run là do absence/encounter authority thiếu, không có nghĩa có bằng chứng đã hit. Conditional nominal geometry results và end_reason giữ đầy đủ để report không mất thông tin. Policy authority hoặc threshold thay đổi chỉ tạo expected set version mới.

## 3. Expected functional behavior quy định cho từng run

Các rule này cùng matrix xác định đủ72run:

- 18OFF: observed behavior OFF_HYPOTHETICAL_ONLY; actual functional_candidates=[]; functional_assessment=NOT_APPLICABLE. Giữ actual pedal/speed, không ghi actual AEB command từ shadow Q.
- 007ONR1–R3 và012ONR1–R3: NO_RECORDED_AEB_COMMAND; NO_BRAKING SUSPECTED; functional assessment INCONCLUSIVE. Không SUPPORTED failure hay confirmed cause.
- 011ONR1–R3: AEB_DECISION_PENDING; response right-censored; candidates=[] cho NO_BRAKING/actuator failure; functional assessment INCONCLUSIVE.
- 061ONR1–R3 và064ONR1–R3: AEB_COMMAND_ENGAGED theo core event; FALSE_BRAKING SUSPECTED theo hindsight, functional assessment INCONCLUSIVE; ex-ante policy violation UNKNOWN.
- Các ON có positive contact **và B**:001R1;026R1–R3;027R1;028R1–R3;029R1–R3;125R1/R2;168R2. AEB_COMMAND_ENGAGED, INEFFECTIVE_BRAKING SUSPECTED (command+contact symptom), assessment INCONCLUSIVE vì performance duty/actuation chain/feasibility chưa đủ. Không khẳng định mitigation thất bại.
- 027R2/R3,091R1–R3,144R1: command engage known nhưng contact authority disagreement; candidates=[] về confirmed/observed ineffective collision, có risk note COLLISION_AUTHORITY_DISAGREEMENT, functional assessment INCONCLUSIVE. Không giả event.
- 002ONR1–R3: NO_RECORDED_AEB_COMMAND, candidates=[], NO_SUPPORTED_FAILURE ở scope recorded evidence (CONDITIONAL); không copy MA=true. Caution obligation còn UNKNOWN.
- Các ON còn lại (001R2/R3;003R1–R3;004R1–R3;010R1–R3;125R3;144R2/R3;168R1/R3): command engage recorded, candidates=[] theo corpus hiện có; NO_SUPPORTED_FAILURE/CONDITIONAL. Không gọi positive compliance PASS. Có thể thêm hypothesis từ evidence mới bằng report version khác; không dùng tương lai để thay oracle hiện tại.

Không run nào có SUPPORTED functional failure hoặc confirmed root cause trong expected hiện tại. SUSPECTED là oracle về triệu chứng và evidence gap, không label train root-cause model.

## 4. Dossier từng case: facts, hypotheses, UNKNOWN và acceptance

### FA-G1-001 — Boundary repeat variability

Confirmed: R1 contact;R2/R3 stop end không recorded contact; Q/B R1 muộn50ms so R2/R3;OFF contact. Hypothesis: sample/decision timing và physical response gần boundary góp phần khác biệt; chưa chứng minh primary radar noise gây outcome.

Expected: matrix và ineffective suspected chỉR1; các rep giữ riêng, không vote thành case-level “collision” hay “safe”. UNKNOWN: full dynamics counterfactual, exact safe absence, actual physical onset và cause. Acceptance G01: assert50ms core difference; không đổi clock/việc có contact để khẳng định all replabel giống nhau;50ms@50km/h≈.694m chỉ là scale illustration.

### FA-G1-002 — Không có simultaneous crossing conflict trong nominal trace

Confirmed: D5.30, không Q/B ở3ON vàOFF; sensor event0; target lateral occupancy3.41–5.09, ego longitudinal full-body broad phase5.81–6.19 không overlap; min legacy1.090m, GT nominal~1.08m. Ở ideal4.33, gap20.731,y+.117,vy1.5,v13.856, predicted arrival~5.826,y~2.361.

Hypothesis: legacy “ever TTC_GT” tạo MA giả so với mục tiêu brake-on-2D-conflict; acceptable caution duty chưa chốt. Expected: no forced NO_BRAKING candidate, conditional no nominal conflict; physical outcome U do authority gate. UNKNOWN: duty phải phanh khi target đang lane nhưng rời trước xe, full mesh clearance bounds. G02: không dùng GT shadow Q4.35 làm oracle, không chuyển legacyMA thành failure.

### FA-G1-003 — ON dừng, OFF cũng rời qua không recorded contact

Confirmed: Q3.15/B3.40 cả3ON;OFF shadowQ3.15, B∅, TARGET_CLEARED. Sensor first-pedal time khác B,OFF có first pedal.55s. Hypothesis: hậu nghiệm phanh có thể không cần cho target này; chưa có approved caution/complete hazard coverage.

Expected: no supported failure/candidates forced; giữ pedal unrelated/unknown writer. UNKNOWN: actual AEB causal necessity và verified no-contact. G03: không gán confirmed FALSE_BRAKING chỉ vì OFF không hit; không chọn sensor first pedal làm AEB onset.

### FA-G1-004 — Evidence tốt về lịch lệnh, không cần forced failure

Confirmed: D2.20/Q2.25/B2.50;3ON stop end/no events;OFF contact. ON stopped gap4.55m ởR1 và legacy min_distance4.256 khác metric. Hypothesis: AEB đã hỗ trợ tránh/giảm nguy cơ theo paired observation; causal effect và physical onset chưa xác nhận.

Expected: candidates=[], NO_SUPPORTED_FAILURE conditional; report .25s **command latency**. UNKNOWN: applied/consumed provenance, validated avoided contact, cause. G04: không làm mọi run thànhfailure; separate stopped gap/min clearance; không áp bất kỳ số impact giả nào cho no-event ON.

### FA-G1-007 — Contact, primary detection không xuất hiện

Confirmed: target có từGT0, bắt đầu đi khoảngcore1.56; D/Q/B∅, in-view574/detected0;3ON+OFF contact. R1 event frame28513402,other_actor_id6911,impulse0,relative speed13.935m/s. Target không phải “spawn sát xe” như một lời giải thích chắc chắn.

Hypotheses: residual gate/static suppression, altitude/road slope, occlusion, callback timing, track qualification; theoretical radial residual~.06<.15 ởxa chỉ là mechanism plausibility. Expected: C, no-braking SUSPECTED, cause UNKNOWN; zero impulse không discard. Conditional stop model v13.889,b8,J20,td.25→18.253m so gap~20.45 tại shadow4.35, không chứng minh observability/realized avoidance. G07: cấm confirmed perception root, cấm PHYSICAL_LIMIT từ spawn time/in-view.

### FA-G1-010 — ON stopping và OFF contact

Confirmed: D2.40/Q2.90/B3.15,3ONstop/noevents;OFFcontact. Hypothesis: AEB intervention có liên hệ outcome tốt hơn control, không chứng minh whole causal chain.

Expected: no supported failure, conditional nominal outcome analysis;OFFfunctionalNA. UNKNOWN: calibrated response và verified absence. G10: không gán failure chỉ vì legacy near-miss row hoặc report phải có primary cause; no impact0 ở per-run report.

### FA-G1-011 — Collision disagreement và censored command window

Confirmed: cả4legacy collision/event0;ON Q4.90/B∅;last physics5.09,scheduled command5.15; CSVtail5.11 có sensor-only không mở rộng physics. Nominal unforced distance ởlast core~.06261m, trong khi min_distance metric bị force0.

Hypotheses: corner/axis-expanded overlap, geometric termination trước callback, drain coverage thiếu. Expected:4U+OPENdisagreement,3ONpending/right-censored, không no-braking/actuator-failure candidate. UNKNOWN: physical contact/no-contact, full bbox geometry, exact root. G11: assert positive nominal clearance giữ như model view, không thành safe; không label actuator failed vì Bnull.

### FA-G1-012 — Pedal pulses chưa có AEB command attribution

Confirmed:3ON/OFFcontact, D/Q/B∅; pedal.3 rời rạc ONR1 tạirecorder3.15,4.55,5.41;R2 tại3.17,4.97;R3 tại4.07;OFF tại4.31 (và sample5.67 trong trace). Đây không là warmup<.5s.

Hypothesis: recorder live get_control thấy planner write trước final override, không biết physics đã consume. Expected: C, no-braking SUSPECTED, CONTROL_ACTIVITY_UNATTRIBUTED giữ bên cạnh summary; không actual AEB braking từ pedal. UNKNOWN: writer/sequence/consumed frame, actual decel attributable, perception root. G12: OFFpulse vẫn lưu, không giải thích tất cả bằng initialization hoặc confirmed planner race.

### FA-G2-026 — Side/body timing phải xét toàn thân

Confirmed: 3ON/OFF đều có contact; ON Q2.60/B2.85. Front đã vượt crossing khoảng3.272m khi hit, pedY≈−1.295; TTC_GT có thể null. Hypothesis: phanh làm đổi body occupancy/arrival; chưa có contact normal để xác nhận impact zone/cause.

Expected: ineffective SUSPECTED ở ON, phân tích full-body conflict; không bỏ contact vì front đã qua. UNKNOWN: precise side geometry/contact normal, avoidability và action outcome. G26: solver phải xét rear/body; không dùng front-only TTC như safe shortcut.

### FA-G2-027 — Replicate timing và collision authority khác nhau

Confirmed: Q/B R1=2.25/2.50, R2/R3=2.60/2.85; legacy cả4run collision nhưng event chỉ ONR1. OFF không có event. Hypothesis: decision khác350ms có thể đổi encounter và geometric termination; chưa chứng minh causal contribution.

Expected: C/U/U/U, giữ3mismatch OPEN; ineffective SUSPECTED chỉR1. UNKNOWN: physical contact ở3run còn lại, có tránh được bằng timing khác hay không, root cause. G27: không copy eventR1 sang cảcase; không đếm toàn bộ legacy hit như physical truth.

### FA-G2-028 — ON contact, OFF legacy-only collision

Confirmed: ON3event, Q2.15/B2.40; OFF legacy collision/no event. ON canonical relative impact khoảng12.966–12.967m/s ở outcome.metrics; recorder R1 là13.000m/s, giữ basis riêng. Hypothesis: intervention thay đổi arrival/contact; chưa biết OFF có physical contact.

Expected: ON C và ineffective SUSPECTED; OFF U; paired mitigation UNKNOWN khi baseline contact authority thiếu. G28: không dùng OFF legacy impact để khẳng định tăng/giảm severity; không confirmed threshold cause.

### FA-G2-029 — Mitigation quan sát được, cause vẫn mở

Confirmed: ON/OFF có matching contact; Q2.20/B2.45; ON canonical relative impact10.436–10.449m/s ở outcome.metrics; recorder R1 là10.456m/s, không cùng sample basis. Hypothesis: AEB giúp giảm impact so OFF, nhưng control writers/dynamics disturbance chưa được matched đầy đủ.

Expected: observed paired Δv nếu comparator xác minh cùng basis/identity; chỉ CONDITIONAL/observational khi matching còn thiếu. Ineffective symptom không đồng nghĩa mitigation thất bại. UNKNOWN: causal contribution, calibration và cause. G29: relative/ego impact phải tách; không “mọi collision đều không có hiệu quả”.

### FA-G3-061 — Hindsight unnecessary, ex-ante caution plausible

Confirmed: 3ON stop/no event; OFF target cleared; pedestrian không vào physical nominal corridor, curb y≈−2.245, min≈.980m. Tại Q2.15: GT y−3.002, vy1.865, perceived_y−2.912, TTC1.145. Chỉ cần vLeft≥1.264 để predicted path vào corridor1.465; target đến khoảng2.62 mới gần đứng.

Hypothesis: command phòng ngừa có thể hợp lý nếu người tiếp tục đi, dù hindsight không cần. Expected: FALSE_BRAKING SUSPECTED theo hindsight; functional FP UNKNOWN. G61: không đưa stops_at_curb/future GT vào thông tin controller biết tại Q; acceptable caution còn mở.

### FA-G3-064 — Track persistence là hypothesis cần trace

Confirmed: Q2.45/B2.70; GT y−2.225, vy.106, perceived_y−2.181, TTC1.449; muốn predicted path vào corridor cần vLeft≥.494. GT gần đứng từ khoảng2.42. ONR1 recorder first pedal2.44 nhưng inferred offset+.27 → core khoảng2.71.

Hypothesis: regression.2s/static hold.3s giữ velocity cũ; thực tế vLeft/predictedY không được log. Expected: FALSE_BRAKING SUSPECTED, không confirmed prediction root; không khẳng định brake before Q. UNKNOWN: actual track state, caution policy và authoritative clock offset. G64: không so recorder time thô với Q; alignment chỉ conditional.

### FA-G4-091 — TTC config khác và legacy geometry conflict

Confirmed: TTC=.6s, Q3.60/TTC≈.593, B3.85;3ON legacy collision/event0, OFF event1. ON last GT4.19, CSV tail4.21 chỉ sensor; unforced nominal distance≈.05291/.04912/.05291m.

Hypotheses: threshold thấp làm giảm nominal stopping margin; corner geometry/termination có thể giải thích mismatch, chưa confirmed cause. Expected: ON3U/OFFC; giữ config.6, không default1.5; collision disagreement và timing risk riêng. G91: không gọi late perception từ việc Q muộn so threshold1.5; không confirmed THRESHOLD_TOO_LOW chỉ từ ideal stopping calculation.

### FA-G5-125 — Wet cap và boundary variability

Confirmed: μ=.65 cho model cap6.3765; R1/R2 contact (canonical relative≈10.409/10.434; recorder R1=10.563), R3 TARGET_CLEARED/no event, min legacy.212m. Q/B R3 sớm50ms; OFF contact. Hypothesis: response/timing/friction constraints có thể góp phần; chưa chứng minh unavoidable.

Expected: C/C/U/C; ineffective SUSPECTED R1/R2; R3 có conditional close encounter, không hard NEAR_MISS khi absence/threshold gate chưa đủ. UNKNOWN: PHYSICAL_LIMIT, calibrated envelope, cause. G125: nominal P02 distance20.785m tại50km/h không là physical proof; không automatic LOW_FRICTION root.

### FA-G6-144 — Timing giống nhưng outcome khác

Confirmed: 3ON D/Q2.10,B2.35 giống nhau; R1 legacy collision/no event, R2/R3 stop/no event; OFF contact. R1 nominal unforced distance≈.08881m. Hypothesis: physical response/geometry gần boundary; chưa chứng minh primary Gaussian noise gây mọi khác biệt vì stepMeasured bypass synthetic perceive.

Expected: ON3U/OFFC; R1 disagreement/candidates=[] cùng risk note; R2/R3 NO_SUPPORTED_FAILURE conditional. UNKNOWN: actual contactR1/cause. G144: không ép cùng physical outcome từ cùng Q; không tự chọn Gaussian noise làm explanation.

### FA-G6-168 — Small observed impact và rep-specific facts

Confirmed: μ=.8 cho conditional cap7.848; R2 contact; canonical relative2.820m/s, recorder relative2.811m/s, Q/B2.35/2.60. R1/R3 Q/B2.30/2.55, stop/no event, min legacy.266/.341m; OFF contact. Hypothesis: timing50ms và physical response gần boundary có thể góp phần; cần trace cho causal attribution.

Expected: U/C/U/C; ineffective SUSPECTED R2, không confirmed root; conditional near encounter R1/R3 không tự thành functional failure. UNKNOWN: avoidability, causal impact reduction, complete absence. G168: giữ canonical2.820 và recorder event2.811 với source riêng; không gộp3rep thành một case label.

## 5. Cases không phải golden root-cause labels

**Tất cả18case và72run** không được dùng làm confirmed root-cause labels. Cấm biến007 thành perception ground truth,012 thành planner/actuator ground truth,061/064 thành FP/prediction ground truth,011/091/144 thành collision-sensor defect ground truth,125 thành friction/physical-limit ground truth,001/027/168 thành decision-noise root ground truth. Tên group, design_intent, workbook HIGH và legacy chain không thay thế bằng chứng.

Có thể dùng facts làm golden: số event/actor/speed/time; D/Q/B; OFF hypothetical; missing field; disagreement; right censoring; kết quả toán học của nominal geometry/stop model với assumptions. Derived test value phải có formula ID/tolerance phù hợp, không tạo physical truth bằng chính legacy algorithm.

## 6. Acceptance unit/integration specification

Các test dưới đây **chưa được implement/chạy**; là hợp đồng cần đạt khi implementation được giao riêng.

| ID / mức | Fixture và assertion | Điều kiện chấp nhận |
|---|---|---|
| U-CONTRACT | EV null/unknown/conflicting, ID string, units/clocks | Không default0/false; null có reason; không NaN; provenance có locator/hash |
| U-GEOMETRY | Circle–OBB corner, rear body, disjoint occupancy, rotating/moving uncertainty | G03 continuous solver; unresolved→UNKNOWN; không1D collision claim |
| U-PHYSICS | P02 hai branch/boundary/J→∞/v0=0; P05 finite search không có nghiệm | Số chuẩn FORMULA tolerance1e−8m; search fail không UNAVOIDABLE |
| U-POLICY | OFF shadow, positive event impulse0, empty coverage, unknown thresholds, no candidate | Đúng decision tree; không force failure/confidence |
| I-72-IDENTITY | Manifest72runkeys, hashes,3ON1OFF/case | Không ingest giả source ID; không duplicate/collapse; raw hashes bất biến |
| I-72-FACTS | Toàn matrix phần2; raw D/Q/B và event counts | Exact raw precision;31positive,12mismatch,18OFF functionalNA |
| I-72-DIAGNOSIS | Phần3 và Gxx dossier | 6suspected no-command;6suspected false-braking;14suspected ineffective;0supported functional failure;0confirmed root; không đếm OFF |
| I-CLOCKS | Inferred offsets riêng:007R1+.03,029R2+.04,064R1+.27,168R2+.07,027OFF+.03;67run còn lại≈+.01s | Không universal offset; fit không authoritative clock;064 ordering conditional/unresolved |
| I-CENSOR |011physics end5.09<scheduled engage5.15;091sensor-only tail | Không NO_BRAKING011; không suy post-end physics/contact absence |
| I-LEGACY | R.evaluation/O.metrics và historical result snapshots | Hash bất biến; report mới version riêng; legacy43collision không bị đổi thành31 |
| I-DOWNSTREAM | Eligible cohort/vintage/metric versions, unknown denominators | Không dùng legacy failure rows làm ground truth; không reuse legacy FP denominator cho V3 |
| I-EXPLAIN | Mỗi known/candidate/unknown có ref/formula/assumption/reason | Truy được member/row/JSON pointer/source; không unsupported causal headline |

Các candidate counts ở I-72-DIAGNOSIS là expected **symptom counts** của profile, không prevalence functional failure. Không dùng0confirmed root làm rate0% khi không có cause-evaluable denominator.

## 7. V3.1 objective oracle: as-recorded, không baseline score

[OBJECTIVE_ANALYSIS](OBJECTIVE_ANALYSIS_CONTRACT_V1.md) là authority cho metric provenance; [MOBO_HANDOFF](MOBO_HANDOFF_CONTRACT_V1.md) cho selection/baseline/consumer. Core event matrix và candidate counts phần2/3 giữ nguyên.

Bảng dưới là **scalar ONR1 đã có trong từng result**, không aggregate, không score baseline v1, không khẳng định calibrated physical truth. Locators cố định theo case: `runs/{case}/rep1_a1/result.json#/outcome/metrics/{key}`; event speed ở sibling `sensors/collisions.json#/0/relative_speed_before_ms`. ∅ là source null/no event, không số0. M/evaluation copies khớp72/72 cho3 objective.

| Case | rms_jerk_mps3 [m/s³] | impact_speed_mps canonical [m/s] | stopping_distance_m [m] | Recorder event relative [m/s] |
|---|---|---|---|---|
| FA-G1-001 | 11.823 | 2.413 | 14.631 | 2.473 |
| FA-G1-002 | ∅ | ∅ | ∅ | ∅ |
| FA-G1-003 | 12.174 | ∅ | 9.362 | ∅ |
| FA-G1-004 | 13.428 | ∅ | 9.350 | ∅ |
| FA-G1-007 | ∅ | 13.900 | ∅ | 13.935 |
| FA-G1-010 | 12.051 | ∅ | 14.590 | ∅ |
| FA-G1-011 | ∅ | 13.944 | ∅ | ∅ |
| FA-G1-012 | ∅ | 8.545 | ∅ | 8.242 |
| FA-G2-026 | ∅ | 16.737 | 18.002 | 16.806 |
| FA-G2-027 | 18.387 | 8.800 | 9.499 | 8.825 |
| FA-G2-028 | 16.773 | 12.967 | 19.943 | 13.000 |
| FA-G2-029 | 13.432 | 10.436 | 20.404 | 10.456 |
| FA-G3-061 | 12.380 | ∅ | 14.597 | ∅ |
| FA-G3-064 | 11.869 | ∅ | 20.547 | ∅ |
| FA-G4-091 | 22.736 | 10.022 | 9.608 | ∅ |
| FA-G5-125 | 11.178 | 10.409 | 23.844 | 10.563 |
| FA-G6-144 | 13.141 | 3.085 | 14.668 | ∅ |
| FA-G6-168 | 9.872 | ∅ | 14.868 | ∅ |

### 7.1 Assertions trên toàn72run

- ON54: jerk39present/15null; canonical impact29present/25null; stopping42present/12null. OFF18: jerk/stopping18null; canonical impact14present/4null.
- Jerk và stopping canonical null khác nhau ở case026: B2.85 có, stopping có, jerk cả3ONnull vì không có T_AEB crossing trong signal/window source. Nếu projected valid Sample có braked=true thì jerk missing, không NA/0.
- 011ON Q4.90/Bnull và cảJ/Dnull: canonical Sample.braked UNKNOWN nếu DB activation=true như source evaluation, không inferred false. Response right-censored giữ nguyên.
- 002/007/012ON khôngQ/B, J/Dnull; canonical sample khi đầy đủ row source có braked=false. J/D NA không xóa impact evidence hoặc tự thành functionalPASS.
- Raw M.collision=false thì canonical per-run impactnull; khi replay **valid legacy aggregate** đóng góp0. Diagnostic physical impact vẫnnull do no admissible event, no-contact coverage UNKNOWN ở profile conservative.
- 011/091ON/144R1 có canonical impact nhưng physical event impactnull/UNKNOWN; giữ12contact disagreement, không replacecanonical bằng0 hay recorder scalar.
- Stopping decomposition CARLA dùng x_last−x_start +v_last²/(2a_extrap), positionAfterStep=false, a_extrap đã round3;125source6.377. Không gọi total hoàn toàn measured; raw-only missingparts→UNKNOWN.
- Metadata manifest run_id dạng FA-…-R1 là artifact runkey. Không có verified DB project/variant/run/AEBversion binding, không verified v1, không baseline score.17default tuples không chứng minh v1;091.6 phải giữ riêng.
- 3rep cùngcase/seed không tự thành3freeze-eligible samples; không chọn “best rep” để tạo score. OFF18 giữ diagnostic only.
- Hints007/012 phải cho phépABSTAIN/no parameter code;061/064 chỉsuspectedcautioncontext;091reviewTTCcontextkhôngconfirmed cause. Suggested numeric ranges toànGolden18 UNKNOWN do catalog/campaign authority thiếu.
- Current consumer không đọc frozen split; handoff schema mới phải NOT_DIRECTLY_CONSUMABLE. Không gọi POST /optimizations trong acceptance read-only.

### 7.2 Acceptance objective-specific

Các test IDs sau là **đặc tả future tests**, không implementation đã chạy. Fixtures synthetic ghi nhãn rõ, không tạo truth mới cho Golden18.

| ID | Input / assertion | Expected |
|---|---|---|
| OA-01 |72raw M/evaluation copies,18R1table trên | Exact scalar/null/presence counts; no DB ingestion assumption |
| OA-02 | CARLA ego_a profile/filter/window, kinematic raw profile | Read đúng stored objective, no GT/IMU replacement; T_AEB distinct B; old profiles tách |
| OA-03 |026ON3run B có, jerk null, stopping present | Missing jerk khi braked=true; không0/NA; aggregate không valid nếu member applicable missing |
| OA-04 |011pending versus007/012noQ/B | Unknown canonical braking state của011 khác false/no-phase007/012; không đổi Core candidate rules |
| OA-05 |001/007/012/029/125R1 và168R2 core vs event speeds | Giữ hai basis/timestamps, no numeric equality assertion; physical no-contact impactnull |
| OA-06 |004/010 no-event và091legacy-only hit | Per-run impactnull khi no canonical collision; mismatch giữ canonical non-null nhưng physicalimpactnull; no fabricated0 |
| OA-07 |CARLA stopping components/replay với6.377 ở125 | Total replay dùng exact source/rounding; trace/model fields tách; no currentDB calibration fallback |
| OA-08 |Synthetic3run fixture AnalysisMetricsTest J/I/D=(3,2,15) | Exact canonical outputs/counts; đây không Golden18 baseline |
| OA-09 |Missing collision impact, NaN/negative, allNA, brakedUnknown, TIMEOUT/ERROR/emptytrace fixtures | Canonical ordered missing/NA rules và evidenceComplete vs objectivesAvailable khác nhau; no custom0 |
| OA-10 |OptimizationService helper vs AnalysisMetrics trên fixtures thiếu jerk/impact và no brake | Detect divergent membership/null/rounding, không claim compatibility bằng3key giống tên |

### 7.3 Acceptance MOBO handoff và baseline

| ID | Input / assertion | Expected |
|---|---|---|
| HF-01 |Golden18source{} + artifact run_id strings | DB IDs/versionlabel/current baseline/v1confirmation UNKNOWN; baseline aggregates UNKNOWN, không trial0 |
| HF-02 |SourceBootstrap/ProjectRepository seed versus authorized DB-version fixture | Seed definition known nhưng chưa RUN_BOUND; version_no1/lineage/params/project phải bind trước confirmed_as_v1 |
| HF-03 |DB v2 selection/run revision/raw/config digest fixture | Strict freshness và semantic digest profile giữ nguyên; byte hash không so như semantic digest |
| HF-04 |3rep same variant+seed; overlapping variants between partitions | Duplicate/leakage rejected for operational cohort; rep giữdiagnostic; không invent reducer/seed |
| HF-05 |OFF controls, safe/nonhazard design roles, legacy SAFE vs Core UNKNOWN | OFF exclude optimization/validation; design role không tự confirmedsafe; no forced label to passfreeze |
| HF-06 |Mixed actual params (091.6 và17case1.5) | Không one-baseline aggregate; require reviewed split/binding, no best rep/configmerge |
| HF-07 |Catalog/engine sourced intervals, missingcampaign/catalog snapshot,emptyintersection | SuggestedrangeUNKNOWN khi requiredsource thiếu; empty→EXCLUDED; no guessed ±range |
| HF-08 |Hintdirection và strict4code keys/order mismatch | Only source-supported SUSPECTED/ABSTAIN; no numeric candidate/probability; map by key, không positional |
| HF-09 |Current OptimizationRequest/MoboTrial signatures và service selection | Detect no datasetID/hints input, latestfamily+latestvariant selection, NOT_DIRECTLY_CONSUMABLE |
| HF-10 |Storedcustom bounds/objectiveconfig versus actual defaults/helper | Không claim enforced; equality-TTC mutation phải future boundary revalidate; no source change |
| HF-11 |Frozen optimization và sealed validation evidence | Validation không ảnh hưởng fit/hint/range; sameobjectivecohort không bị silent filter, unknown/excluded counts reconcile |
| HF-12 |Metric profile/calibration/build/simulator/hash thiếu hoặc đổi | UNKNOWN/conflict/stale with refs; neither copyJARhash ascalibrationvalidation nor defaultcurrentprofile |

Stage coverage trong [BLUEPRINT](REFACTOR_BLUEPRINT.md): M1A OA-01/HF-01..03; M1B Core tests+OA-02..07; M1C OA-08..09/HF-04..08/HF-11..12; M1D OA-10/HF-09..10+consumercompatibility; M2 toànsuite trên authorized integrationfixture. Không chạyM1A/MOBO/CARLA trong V3.1.
