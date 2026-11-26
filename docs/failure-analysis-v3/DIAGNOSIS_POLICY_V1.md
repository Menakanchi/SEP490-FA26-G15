# DIAGNOSIS_POLICY_V1 — Chính sách chẩn đoán theo bằng chứng

V3.1 DESIGN ONLY. Core policy giữ nguyên; policy đề xuất `fa-diagnosis/1.0.0`, profile `FA_DIAGNOSTIC_CONSERVATIVE_V1`. Đây là profile phục vụ diagnostic shadow/review, **chưa là policy release/MOBO/Regression được phê duyệt**. Những lựa chọn cần chủ sở hữu chốt được đánh số trong [OPEN_DECISIONS](OPEN_DECISIONS.md). Khi chưa chốt threshold hay requirement, module vẫn xuất facts/candidates và UNKNOWN cho claim phụ thuộc; không tự áp default “confirmed failure”.

Nguồn: [A01](../../data/failure-audit-output/01_EVALUATOR_LOGIC_AUDIT.md) về heuristic/chain; [A02](../../data/failure-audit-output/02_CASE_BY_CASE_AUDIT.md) về từng run; [A03](../../data/failure-audit-output/03_DATA_CONSISTENCY_AUDIT.md) về sensor/time/geometry; [A04](../../data/failure-audit-output/04_BACKEND_IMPACT_ASSESSMENT.md) về downstream; [A05](../../data/failure-audit-output/05_RECOMMENDED_CHANGES.md), [A06](../../data/failure-audit-output/06_AUDIT_SUMMARY.md). Contract và công thức chuẩn nằm ở [DATA_CONTRACT](DATA_CONTRACT_V1.md), [FORMULA_SPEC](FORMULA_SPEC_V3.md).

## 1. Bảy trục độc lập

| Trục | Câu hỏi | Giá trị/ý nghĩa |
|---|---|---|
| Physical outcome | Có contact? Có verified close encounter? | SAFE, COLLISION, NEAR_MISS hoặc UNKNOWN; luôn kèm basis, coverage và claim level |
| AEB observed behavior | AEB/worker đã ghi nhận hành động gì? | Decision, command engage, emitted/applied/consumed và physical response tách riêng; OFF shadow riêng |
| Functional failure candidate | Có triệu chứng vi phạm yêu cầu nào cần điều tra? | FALSE_BRAKING, NO_BRAKING, INEFFECTIVE_BRAKING, có thể nhiều hoặc không có |
| Physical avoidability | Có action khả thi tránh footprint conflict dưới model nào? | AVOIDABLE_UNDER_MODEL, UNAVOIDABLE_UNDER_MODEL, UNKNOWN; stopping feasibility riêng |
| Root-cause hypothesis | Cơ chế nào được evidence ủng hộ/chống? | Danh sách SUSPECTED/SUPPORTED/REFUTED/UNKNOWN; confirmed cause riêng, được null |
| Evidence sufficiency | Claim nào có đủ bằng chứng? | SUFFICIENT/PARTIAL/INSUFFICIENT/NOT_APPLICABLE theo capability, không global pass giả |
| Uncertainty/inconclusive | Độ bất định và giới hạn suy luận là gì? | Bounds có cơ sở hoặc UNKNOWN; các reason codes; không xác suất tự tạo |

Outcome không phải symptom; symptom không phải functional failure; functional failure không tự xác định cause. COLLISION không kéo theo confirmed AEB failure. SAFE không chứng minh không có unnecessary braking. Physical limit tại một reference time không miễn trừ một quyết định muộn hơn trước đó. Không bắt buộc mọi run có failure hoặc mọi failure có cause.

Claim status: SUSPECTED có triệu chứng và cơ chế khả dĩ nhưng thiếu prerequisites; SUPPORTED thỏa evidence/requirement cụ thể, vẫn có phạm vi; REFUTED có bằng chứng phủ định chính claim đó; UNKNOWN chưa đủ để khẳng định/phủ định. CONFIRMED chỉ áp cho root cause sau ngưỡng ở phần7, không phải alias của SUPPORTED. Không có “confidence=0.9” và không chuyển score tracker thành xác suất causal.

## 2. Decision tree tổng thể

1. **Validate identity/integrity/schema từng artifact.** Không bind được run/actor thì cách ly claim từ artifact đó; giữ evidence độc lập khác. Source={} không được nới ingestion DB; offline analysis dùng artifact run_key.
2. **Build separate clocks, coverage, geometry views và timelines.** Giữ nominal/applied dimensions, core termination vs sensor contact, command vs physical controls, raw vs calibrated series.
3. **Assess physical outcome** theo phần3; không cần calibration của jerk để giữ positive matching contact.
4. **Assess actual AEB mode/behavior** theo phần4. Nếu OFF → functional assessment NOT_APPLICABLE; chỉ tiếp tục outcome/geometry/physical observation/paired comparison, không chấm OFF như AEB đã phanh.
5. **Build ex-ante hazard/opportunity evidence**, hindsight conflict và counterfactual no-brake riêng. Nếu thiếu actual controller inputs hoặc requirement, functional assessment INCONCLUSIVE, có thể vẫn có SUSPECTED candidate.
6. **Evaluate cả ba candidate predicates độc lập** ở phần5. Không first-match cascade, không chọn stage thất bại đầu tiên làm primary cause.
7. **Evaluate feasibility/PHYSICAL_LIMIT độc lập** theo phần6; model-only margin không nâng thành physical certainty.
8. **Generate hypotheses và sufficiency report**, giữ alternatives và missing evidence. Nếu đủ root threshold mới điền confirmed_root_cause; còn lại UNKNOWN.
9. **Serialize append-only versioned report**. Không overwrite historical outcome, flags, failures/chain/headline; không tự gán functional PASS từ candidates=[].

## 3. Outcome predicates và collision authority

### 3.1 Collision evidence admissibility

Positive `SENSOR_CONTACT` được chấp nhận khi: integrity/schema hợp lệ; sensor attach đúng ego/run; other_actor bind đúng actor/loại cần đánh giá; event frame/time hợp lý trong recorded episode. Giữ impulse=0 là giá trị đo được, không làm event vô hiệu. Outcome=COLLISION, basis=RECORDED_MATCHING_CONTACT, claim_level=OBSERVED_EVENT. Claim này là “contact event được ghi”, không phải certification rằng geometry/mesh model nào đúng tuyệt đối.

Core `COLLISION` là termination/evaluator claim. Khi không ghi branch geometric/callback và sensor event không có, không tự gọi physical contact confirmed. Nếu sau này controller callback có raw event đúng binding thì xử lý như một nguồn contact riêng, không nhập nhằng với geometry.

`NO_RECORDED_CONTACT` chỉ là số event0. Muốn `VERIFIED_NO_CONTACT` cần: sensor attach trước relevant episode; event coverage/health; actor scope; physics snapshots liên tục trong encounter; callback drain watermark sau horizon; không termination sớm trước vùng nghi va; hoặc nguồn physical-contact authority được phê duyệt tương đương. Golden18 thiếu drain/branch evidence, nên [] không đủ.

### 3.2 Nhánh kết luận

| Điều kiện evidence | Physical outcome | Evidence bắt buộc và giới hạn |
|---|---|---|
| Có matching admissible positive contact | COLLISION | Event ref/actor/time; nếu nguồn khác nói no-contact thì disagreement OPEN, không xóa positive |
| Legacy/core collision=true, recorder=[] và không independent positive callback | UNKNOWN | COLLISION_AUTHORITY_DISAGREEMENT + CONTACT_COVERAGE_UNPROVEN; không chọn sensor hay legacy làm “đúng tuyệt đối” |
| VERIFIED_NO_CONTACT và resolved full-body min-clearance ≤ approved d_near hoặc approved encounter TTC/PET predicate | NEAR_MISS | Named geometry/trajectory, actual encounter coverage, uncertainty không cắt ngưỡng không xác định; thresholds chưa approved→UNKNOWN |
| VERIFIED_NO_CONTACT và no near-miss theo approved complete-encounter policy | SAFE | Không collision không đồng nghĩa SAFE khi encounter censored; phải có no near evidence |
| Các trường hợp còn lại | UNKNOWN | Giữ conditional nominal geometric safety/close-encounter ở geometry_results |

NEAR_MISS là outcome encounter severity, không mặc nhiên failure. Nếu interval uncertainty vượt cả hai phía threshold → outcome UNKNOWN với candidate near encounter. Không dùng TTC_GT tức thời/min_distance legacy bị force0 làm authority. Existing TTC<1s hoặc min_distance<.5m ở `Evaluation.classifyOutcome` là rule legacy, chỉ tham khảo trong OPEN_DECISIONS OD-07.

Default conservative expected trên Golden18:31 run COLLISION theo positive recorded event,41 physical outcome UNKNOWN; không có hard SAFE/NEAR_MISS khi absence/threshold evidence chưa đủ. Điều này không phủ nhận các trace không contact hay nominal clearance an toàn; chúng được hiển thị riêng. Nếu authority policy tương lai thay đổi thì expected outcome thay **bằng policy version mới**, không sửa raw/legacy. [A02,A03; golden table].

## 4. AEB observed behavior và opportunity

Timeline stage order có thể kiểm tra khi cùng clock hoặc offset bound đủ nhỏ:

`DETECTION → FCW/DECISION → COMMAND_ENGAGED → COMMAND_EMITTED → CONTROL_APPLIED → PHYSICS_CONSUMED → PHYSICAL_RESPONSE`.

Đây là diagnostic model, không khẳng định source hiện đã log mọi stage. FCW không bắt buộc phải xảy ra trước decision nếu requirement cho phép. Source hiện có Q và B model; physical onset không tự có. Decision latch, cancellation/hold và control writers cần provenance.

- Mode OFF: D/Q do shadow là hypothetical; B/command effect không được suy từ Q. Actual pedal/speed vẫn được quan sát, writer có thể UNKNOWN. Output behavior OFF_HYPOTHETICAL_ONLY; functional assessment NOT_APPLICABLE.
- Mode ON, B recorded: AEB_COMMAND_ENGAGED trên cơ sở core event; applied/consumed/physical response riêng, không tự confirmed.
- Mode ON, Q nhưng B chưa đến schedule trước end: AEB_DECISION_PENDING + RIGHT_CENSORED. Case011 Q4.90, source schedule5.15, last physics5.09; không NO_BRAKING/actuator timeout.
- Mode ON, không Q/B: NO_RECORDED_AEB_COMMAND chỉ nói trace; muốn “không có lệnh trong opportunity” cần complete command logging trong window.
- Có pedal nhưng không writer: CONTROL_ACTIVITY_UNATTRIBUTED cùng summary no-recorded-command, không đổi thành AEB braking. Case012 pulses .3 cả OFF.
- First pedal statistic strict>.05 sau.5s không là nguồn onset functionally meaningful. Low-speed constant-velocity override có thể ảnh hưởng response, cần tick/writer provenance để gán AEB intervention.

Validated hazard H_d tại decision time dựa trên thông tin **đã delivered/consumed** tới controller, với uncertainty, relevant actors, policy-approved prediction/caution envelope. Không đưa future `stops_at_curb` hoặc GT trajectory vào inputs ex-ante. Hindsight actual conflict H_h và no-brake modeled conflict H_cf dùng để tìm candidate, không thay H_d.

Opportunity O_d cần đồng thời: AEB ON/operational; relevant hazard có thể quan sát theo sensor evidence; requirement yêu cầu intervention tại window; decision/command latency allowance; feasible/actionable time dưới declared model; command coverage đủ. Target spawn, GT first in-lane hay geometric in-FOV counter không đủ chứng minh observability. Shadow GT decision không là oracle.

## 5. Functional candidate predicates

### 5.1 FALSE_BRAKING candidate

Triệu chứng cho SUSPECTED:

- Có source-supported actual AEB command engagement/intervention ở ON; nếu chỉ Q thì chỉ là DECISION_UNNECESSARY_CANDIDATE, không gọi đã phanh.
- Hindsight/no-brake model không cho target conflict, hoặc braking làm dừng trong encounter không có relevant hazard được ghi.
- Thiếu acceptable caution policy, trace prediction/all actors hoặc other reasons → missing evidence ghi rõ, không functional confirmation.

SUPPORTED false-braking cần **tất cả**: actual AEB attribution và meaningful intervention; approved acceptable-caution requirement; đủ ex-ante sensor/tracker trace để chứng minh không có allowed hazard với uncertainty trong planning horizon; coverage mọi relevant actor/other legitimate reason; matched controls nếu dùng counterfactual; threshold can thiệp đã chốt; không lỗi clock/geometry chi phối kết luận. Vi phạm requirement phải chỉ rõ ID và đoạn thời gian.

No contact sau phanh không chứng minh false braking vì phanh có thể đã tránh hit. OFF không hit chỉ là evidence counterfactual yếu nếu chưa chứng minh pairing. Case061/064: SUSPECTED hindsight unnecessary braking, functional false braking UNKNOWN. 061 đang đi tại Q nên caution plausible;064 stale velocity plausible nhưng actual vLeft/predictedY không có. Không “HIGH confidence” từ min clearance>1m.

### 5.2 NO_BRAKING candidate

SUSPECTED khi ON có recorded contact hoặc credible hindsight conflict và không ghi AEB Q/engagement trong trace. Tên symptom chính xác là NO_RECORDED_AEB_COMMAND. Nếu logs/window censored trước due time thì không tạo candidate từ thiếu onset.

SUPPORTED cần: approved duty requirement; validated observable hazard và opportunity O_d; full command trace bao trùm earliest actionable đến latest allowed response; không inhibit/mode transition hợp lệ; không decision/cancellation được phép; comparison với feasible 2D action nếu requirement dựa trên tránh hit. Nếu command có nhưng physical response không có thì khác candidate, không NO_BRAKING.

007/012 có contact, không D/Q/B → SUSPECTED, requirement/observability/controller trace còn thiếu. 002 không Q nhưng actual occupancy không đồng thời; không lấy legacy MA để tạo no-braking failure. 011 Q đã có và command due sau termination → không candidate no-braking.

### 5.3 INEFFECTIVE_BRAKING candidate

SUSPECTED khi ON có AEB command engage source và contact/response goal không đạt. Cần ghi rõ “command+recorded contact”; nếu actuation provenance thiếu, không khẳng định brakes physically worked hay failed. Legacy-only collision disagreement chỉ tạo note/suspected risk, không pretend observed hit.

SUPPORTED cần requirement về avoidance hoặc impact mitigation/braking performance cụ thể; actual demanded→applied→consumed command và response trên cùng clock; meaningful opportunity; physical envelope/model applicability; verified failure of stated goal. Nếu goal chỉ mitigation thì contact không tự failure; kiểm impact/response so target goal. Negative stopping margin đơn lẻ không support label.

Có thể đồng thời late-decision hypothesis và weak-response hypothesis; không ưu tiên cố định physical_limit→late_detect→late_decision→weak_brake. PHYSICAL_LIMIT là constraint riêng, không thay/loại mọi functional candidate.

### 5.4 Không có supported failure

Run có outcome thuận lợi, không symptom được hỗ trợ → candidates=[] và functional_assessment=NO_SUPPORTED_FAILURE (status CONDITIONAL nếu chỉ partial coverage). Điều này không tuyên bố compliance PASS. Muốn positive “compliant/no failure” cần requirement coverage đủ; contract không thêm trường PASS mặc định. Case004/010 là ví dụ không cần gán failure dù cause của physical response chưa đủ. OFF luôn NOT_APPLICABLE.

## 6. Physical avoidability và PHYSICAL_LIMIT

1. Báo ideal stopping screen, full delay+ramp stopping margin, 2D avoidance windows riêng.
2. Chọn reference time công khai: first validated observable hazard, actual decision, hoặc hypothetical earlier decision. Không đổi reference time giữa phân tích để chọn cause thuận tiện.
3. Cho phép AVOIDABLE_UNDER_MODEL khi có verified admissible action tránh conflict toàn horizon dưới stated uncertainty, validated dynamics và scope; nếu chưa validated, chỉ conditional example, canonical avoidability UNKNOWN.
4. UNAVOIDABLE_UNDER_MODEL cần certificate đủ theo FORMULA P05. Search hữu hạn thất bại không đủ; negative margin không đủ; “ideal braking infeasible” không loại việc pedestrian rời lane trước arrival.
5. PHYSICAL_LIMIT chỉ supported khi certificate unavoidable đáp ứng scope, sensor opportunity/reference time rõ, calibration/envelope/context validated, horizon đủ và physical authority/uncertainty không đảo kết quả. Label phải đọc “physical limit dưới model X, action set Y, tại thời điểm Z”, không universal cause.
6. Golden18 chưa đủ: mọi case avoidability canonical UNKNOWN; có conditional calculations như00718.253m và12520.785m. Không auto-label125 LOW_FRICTION hoặc PHYSICAL_LIMIT vì μ=.65.

## 7. Root-cause hypothesis và evidence threshold

Mỗi hypothesis cần: evidence ủng hộ; phản chứng/alternative; missing evidence; liên hệ requirement/symptom; causal mechanism ở source; model scope; falsification test dự kiến. Source cho biết một gate **có thể** gây failure không chứng minh gate đó **đã** gây failure trong run.

Ví dụ:

| Hypothesis | Evidence có | Còn thiếu / không được kết luận |
|---|---|---|
| 007 primary radar gate/static suppression | D0, stats in-view574/detect0; residual theoretical~.06 dưới.15; code gate có | Raw primary returns/occlusion/altitude/rejection/track lifecycle; không confirmed OBJECT_NOT_DETECTED root |
| 012 intermediate control writer race | Q/Bnull, isolated pedal.3, OFF cũng có; worker planner rồi override, recorder live get_control | Writer sequence và consumed frame; không confirmed planner gây physical braking |
| 064 stale vLeft/static hold | Q khi GT gần đứng; tracker regression/hold có source support | Actual tracker estimate/predictedY/track ID; không confirmed prediction failure |
| 011/091 nominal corner geometry/early termination | Legacy collision/event0, unforced nominal positive distance, code overlap difference | Full bbox/mesh/callback/drain; không confirmed sensor defect hoặc no-contact |
| 125/168 near-boundary variability | Reps cùng config outcomes khác; delays/response variation measured | Matching primary trace/writer dynamics; không “noise caused collision” confirmed |

Confirmed root cause chỉ khi ngưỡng OD-04 đã phê duyệt và đáp ứng tối thiểu: specific requirement violated; reliable outcome/symptom; relevant inputs/state/commands traced; causal path mechanistically demonstrated in this run; clock/geometry/calibration valid cho claim; competing explanations đủ quan trọng bị kiểm tra; counterfactual hoặc controlled reproduction có evidence cho causal contribution; adjudication record và policy version. Nếu thiếu controlled reproduction nhưng có decisive deterministic trace thì phải có explicit approved exception, không tự nới. Phase2 không chạy reproduction/CARLA.

Không đổi legacy score .9/.8 thành posterior probability. Golden18 **không case nào** được làm confirmed root-cause golden label; confirmed_root_cause=null/UNKNOWN ở cả72run. Các hypothesis và known event/timing vẫn là test oracle hợp lệ theo scope.

## 8. Inconclusive không xóa evidence

INCONCLUSIVE áp cho functional assessment hoặc claim thiếu dữ liệu; physical_outcome có thể vẫn COLLISION. Ví dụ007: event known, Q absent in recorded trace, no-braking suspected, avoidability unknown, root unknown. Ví dụ011: collision authority unknown, decision4.9 known, response window censored, no actuator-failure assertion.

Reason codes tối thiểu: IDENTITY_UNBOUND, INTEGRITY_FAILED, CLOCK_ALIGNMENT_INFERRED, CLOCK_ORDER_UNRESOLVED, GEOMETRY_TRANSFORM_MISSING, NOMINAL_APPLIED_DIMENSION_MISMATCH, CONTACT_COVERAGE_UNPROVEN, COLLISION_AUTHORITY_DISAGREEMENT, COMMAND_COVERAGE_UNPROVEN, CONTROL_WRITER_UNKNOWN, PHYSICS_CONSUMPTION_UNKNOWN, RESPONSE_WINDOW_RIGHT_CENSORED, PRIMARY_RADAR_TRACE_MISSING, OBSERVABILITY_UNPROVEN, REQUIREMENT_UNAPPROVED, CAUTION_POLICY_UNAPPROVED, CALIBRATION_DOMAIN_UNKNOWN, MODEL_RESPONSE_UNVALIDATED, COUNTERFACTUAL_ASSUMPTIONS_UNVERIFIED, NEAR_MISS_THRESHOLD_UNAPPROVED, UNCERTAINTY_BOUNDS_MISSING, ROOT_CAUSE_THRESHOLD_UNAPPROVED. Codes không là causes; mỗi code phải trỏ claim và sources.

Report narrative phải có “observed / derived under assumptions / hypothesis / unknown” rõ ràng, không headline như “AEB reacted too slowly” khi chỉ TTC threshold hoặc legacy chain. Không có reason unknown thì serializer reject UNKNOWN claim.

## 9. Acceptance cho policy implementation tương lai

- Positive matching event impulse0 vẫn COLLISION; event[] với incomplete coverage không SAFE;12 mismatch giữ OPEN, không auto-select authority.
- 007/012 SUSPECTED no command, không confirmed perception/actuator root;002 không forced missed activation;011 pending censored không no-brake;061/064 không confirmed FP.
- OFF18run không functional candidates actual; shadow decisions không command/actuation. Pedal OFF không bị xóa.
- SAFE/NEAR_MISS chỉ có với absence+complete encounter+approved thresholds; uncertainty cắt threshold → UNKNOWN.
- Supported functional failure phải có requirement ID; candidates=[] không tự PASS; outcome contact không auto-functional failure.
- No scalar confidence probability; no first-stage primary-cause shortcut; no PHYSICAL_LIMIT từ ideal 1D infeasibility.
- Tất cả nhãn/notes truy vết source refs, formula/policy/contract version; legacy nguyên trạng. Chi tiết72run trong [GOLDEN18](GOLDEN18_EXPECTED_BEHAVIOR.md).

## 10. V3.1 objective-centric policy và MOBO boundary

Hai output không thay bảy trục của CoreV3: Diagnostic Report thêm [ObjectiveEvidence](OBJECTIVE_ANALYSIS_CONTRACT_V1.md); MOBO Handoff là separate contract có gates độc lập.

Bổ sung vào decision tree sau khi tạo facts/timeline và trước export:

1. Đọc3canonical per-run values và resolve simulator/filter/signal/window/metric vintage; so raw/evaluation/DB copies nếu có. Không dùng legacy failure label để suy score.
2. Xuất objective explanation từ timeline, response, contact, feasibility và decomposition. Chưa có approved comfort/impact/distance requirement thì chỉ DESCRIPTIVE_ONLY/INCONCLUSIVE, không objective-failure threshold tự tạo.
3. Phân biệt numeric readable, physical interpretable và export eligible. INCONCLUSIVE physical diagnosis không xóa scalar canonical; scalar finite không chứng minh physical claim.
4. Chỉ compare với confirmed baseline + matched metric/cohort/pair; chưa có baseline→BASELINE_ID_UNCONFIRMED/BASELINE_SCORE_UNAVAILABLE, không Golden18-default=v1.
5. Candidate/hypothesis có thể liên hệ parameter hint bằng source mechanism; ghi SUSPECTED/ABSTAIN, tradeoffs và missing prerequisites, không optimum/score/probability.
6. Export evidence refs + canonical aggregation + partition/eligibility/ranges qua MOBO_HANDOFF; không dispatch optimizer hoặc tạo candidate.

Các invariant bắt buộc:

- Physical event impact null khi không có admissible contact; canonical impact giữ recorded semantics. No-hit0 chỉ trong valid legacy aggregate contribution. Canonical geometry-only impact và physical outcome UNKNOWN có thể cùng tồn tại, kèm disagreement.
- Jerk thiếu do không có T_AEB khi B có (026) không0/NA; command không đủ nói acceleration đã có. 011 Q có/B chưa due thì canonical braking state có thể UNKNOWN, không bằng no-brake confirmed.
- Stopping distance lớn/nhỏ không tự functional failure/success; trace+extrapolation có ý nghĩa khác full physical stop đo được.
- Tăng TTC/maxdecel, giảm delay hoặc đổi build-up chỉ suspected review direction khi prerequisites có; perception/clock/geometry problems không forced map vào4knobs.
- OFF vẫn physical/control diagnostic được, nhưng không vào optimization/validation objective cohort, không baseline AEB.
- Root cause UNKNOWN không là mandatory exclusion cho canonical metric. Eligibility phải dựa đúng objective/identity/quality requirement; known quality conflict giữ trong manifest.
- Legacy freeze đòi SAFE theo classifier cũ; V3 physical SAFE chưa có trong Golden18 conservative. Không tự promote UNKNOWN thành SAFE để qua freeze, không tự đổi current gate/API; safe retention policy OD-14 cần chốt.
- Validation partition không dùng để fit GP, chọn hint/range hoặc kết luận optimal params. Review role không tự biết physical truth.
- Current consumer not directly consumable; `handoff_ready` của archive v2 không phải phê duyệt V3 quality/campaign.

Reason codes bổ sung: BASELINE_ID_UNCONFIRMED, BASELINE_VERSION_PARAMETER_MISMATCH, BASELINE_SCORE_UNAVAILABLE, METRIC_METADATA_CONFLICT, CANONICAL_VALUE_MISSING, T_AEB_NOT_FOUND, EXTRAPOLATION_DOMAIN_UNKNOWN, COHORT_NOT_FROZEN, DUPLICATE_VARIANT_SEED, PARTITION_LEAKAGE, PARAMETER_DOMAIN_UNCONFIRMED, EMPTY_ALLOWED_SEARCH_DOMAIN, CONSUMER_DATASET_NOT_SUPPORTED, CONSUMER_AGGREGATION_DIVERGENCE, CONSUMER_CUSTOM_BOUNDS_NOT_ENFORCED. Đây là evidence/compatibility reasons, không root causes.

Core outcome/candidate golden assertions phần1–9 không đổi. Phần objective/handoff acceptance bổ sung ở [GOLDEN18](GOLDEN18_EXPECTED_BEHAVIOR.md), triển khai tương lai theo [M1A/M1B/M1C/M1D/M2](REFACTOR_BLUEPRINT.md); V3.1 hiện dừng ở thiết kế.
