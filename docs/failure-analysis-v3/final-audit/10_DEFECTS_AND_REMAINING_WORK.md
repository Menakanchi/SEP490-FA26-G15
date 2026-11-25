# 10 — Defects, remaining work và ownership

Audit ngày 2026-11-24, source HEAD `baf0892d456b5dcf4bfc0358b7124bf6a8b6fe5a`
cộng cây Failure Analysis untracked có sẵn. Không sửa source/test/contract cũ.
Severity dưới đây là mức ảnh hưởng kỹ thuật/integration, không là chứng nhận mức
nguy hiểm ngoài đời. Finding FA là phần Failure Analysis; DEP là dependency bên ngoài.

Reproduction dùng [FinalAuditProbe.java](verification/FinalAuditProbe.java), output
[independent-probes-final-v2.json](evidence/independent-probes-final-v2.json).
Các mutations đều **SYNTHETIC_AUDIT_MUTATION**, không phải dữ liệu CARLA mới hoặc
thay đổi Golden18. JSON Pointer `/observations/{NAME}` xác định từng observation.
Expected lấy từ tám contract, không từ nhãn legacy hoặc expected của implementation.
Source prefix `.../failureanalysis/` ở các finding là
`src/main/java/com/vsos/core/failureanalysis/`; line ranges tính trên snapshot bảo vệ.

## FA-001 — HIGH — Timeline bỏ qua validity của mode và event time

- **Owner:** FAILURE_ANALYSIS. **Class/method:** AebTimelineBuilder.build,
  DiagnosisPolicy.assess; EvidenceValidator.validate.
- **Source:** `src/main/java/com/vsos/core/failureanalysis/AebTimelineBuilder.java`
  L11–19,26–37; `DiagnosisPolicy.java` L66–94; `EvidenceValidator.java` L18–39,80–82.
- **Reproduction:** MODE_CONFLICT_STILL_DIAGNOSED: từ007R1, explicit mode=ON nhưng
  manifest=AEB_OFF. M1A phát hiện mode CONFLICTING; report vẫn NO_RECORDED_AEB_COMMAND
  và SUSPECTED NO_BRAKING. NEGATIVE_TIMELINE_EVENT_TIMES:004R1 có Q=-1,B=-.75;
  behavior vẫn AEB_COMMAND_ENGAGED, không reject event times âm.
- **Expected:** DATA_CONTRACT §2,§6,§10; POLICY §4–5: mode unresolved phải chặn
  functional assessment phụ thuộc ON; timestamp invalid không là command hợp lệ.
- **Observed/cause:** builder chỉ lấy `EvidenceReport.mode(r).value()`; blocked
  không bao gồm AEB_MODE_DISAGREEMENT. Metric event times không được kiểm domain/
  coverage/order như stream times; r.read vẫn có thể gắn OBSERVED vào số âm.
- **Impact:** sinh symptom của hệ thống đang bật khi mode còn bất đồng; narrative
  và latencies dùng mốc không hợp lệ. 18 OFF thật vẫn pass, không phủ định defect này.
- **Recommended fix:** tiêu thụ cả status của mode/time và issues liên quan;
  giữ physical evidence độc lập, functional claim INCONCLUSIVE với refs/reasons.
  Validate event time domain/coverage/order trước summary. Thêm pipeline regressions
  cho hai reproductions; không chỉ test reader có phát hiện conflict.

## FA-002 — HIGH — Stopping breakdown vượt clock gate

- **Owner:** FAILURE_ANALYSIS. **Class/method:** ObjectiveExplainer.decompose/explain.
- **Source:** `.../failureanalysis/ObjectiveExplainer.java` L35–41,51–55,60–96;
  `DiagnosticReport.java` L14–17,40–41.
- **Reproduction:** BACKWARDS_CLOCK_STOPPING_DECOMPOSITION: chỉ đổi last core frame
  t thành0 ở004R1. Validator phát hiện TIMESTAMP_NON_MONOTONIC, geometry UNKNOWN;
  breakdown vẫn start=2.5s,end=0s, trace=9.35m, tail=.000004m, replay_difference=0.
- **Expected:** FORMULA general missing/domain rules, T01; OBJECTIVE §3.3,§7:
  breakdown không hợp lệ theo clock/trace phải UNKNOWN/INVALID; giữ canonical9.35.
- **Observed:** decompose không nhận/kiểm validation issues, monotonic coverage
  hoặc end>=start; quality có thể vẫn PARTIAL chỉ vì có hai components.
- **Impact:** numerical replay khớp được dùng để trình bày một window bất khả thi;
  canonical integrity và interpretability bị trộn. Đây không là sai P02 closed form.
- **Recommended fix:** claim-local validated trace gate trước decomposition;
  retained canonical scalar và failure reason riêng. Test clock backwards,
  duplicate times, missing endpoint/onset và invalid components trong actual report.

## FA-003 — HIGH — Pre-contact reconstruction thiếu age/episode/frame-time validation

- **Owner:** FAILURE_ANALYSIS. **Class/method:** ImpactAnalyzer.extract;
  EvidenceValidator.compareRecorderClock/stream.
- **Source:** `.../failureanalysis/ImpactAnalyzer.java` L17–52;
  `EvidenceValidator.java` L31–36,89–104.
- **Reproduction:** STALE_PRECONTACT_FRAME:007R1 chỉ đổi gt_frame_before về frame
  đầu28512824; vẫn admissible=true và vector_relative_speed=13.894113321835258m/s.
  Event thật ở5.78s/frame28513402, trong GT có các snapshot gần contact hơn.
  CONTACT_EVENT_OUTSIDE_RECORDED_EPISODE đổi event time thành50000s, giữ world frame;
  event vẫn được chấp nhận với time OBSERVED dù recorder episode chỉ khoảng5.8s.
- **Expected:** FORMULA I01, DATA_CONTRACT §4–5: pre-contact snapshot phải đúng
  episode/temporal support; thiếu freshness/interpolation bound → reconstruction
  UNKNOWN. Các source cùng recorder frame phải thống nhất clock hoặc giữ conflict.
- **Observed:** chỉ kiểm before<event frame và snapshot time<event time; không
  kiểm newest supported pre-contact snapshot, age, episode horizon hoặc event-frame
  timestamp join. compareRecorderClock chỉ đối chiếu frames.csv với GT.
- **Impact:** có thể trình bày vận tốc của nhiều giây trước như impact speed, cắt
  physical metrics theo contact time ngoài episode. Canonical impact không bị sửa.
- **Recommended fix:** tách positive-event evidence khỏi khả năng reconstruct
  impact; kiểm event frame/time/episode và pre-contact support/age theo declared
  sampling policy. Thiếu bound thì UNKNOWN cho speed reconstruction, giữ recorded
  scalar/event claim và conflict riêng, không xóa toàn bộ positive evidence.

## FA-004 — HIGH — Nhiều collision events cùng frame làm mất positive target contact

- **Owner:** FAILURE_ANALYSIS. **Class/method:** EvidenceValidator.stream,
  ImpactAnalyzer.extract.
- **Source:** `.../failureanalysis/EvidenceValidator.java` L34–35,119–135;
  `ImpactAnalyzer.java` L20–21; `DiagnosticSupport.java` L54–60.
- **Reproduction:** MULTIPLE_CONTACTS_ONE_WORLD_FRAME: giữ nguyên matching event
 007R1 rồi thêm contact khác với actor999999999 ở cùng frame/time. Validator gán
  DUPLICATE_FRAME_DISAGREEMENT cho cả stream; outcome COLLISION đổi thành UNKNOWN.
- **Expected:** DATA_CONTRACT §5,§10/Q01: event array có thể có nhiều contacts cùng
  physics frame; positive matching contact không mất vì event khác hợp lệ.
- **Observed:** collisions gọi stream với actor=null; uniqueness key chỉ
  `stream:frame`, như một state snapshot, không phải event identity.
- **Impact:** suppress collision/physical impact/candidate evidence khi contact
  nhiều actor hoặc nhiều callbacks trong một tick. Golden18 mỗi run tối đa1 event
  nên tests hiện tại không bắt được.
- **Recommended fix:** event-specific validation/identity; giữ multiplicity và
  actor/sensor/sequence context. Chỉ conflicting cùng event identity mới quarantine
  claim đó. Không đồng nhất event count với collision flag.

## FA-005 — MEDIUM — Nested EvidenceValue hỏng vẫn schema VERIFIED

- **Owner:** FAILURE_ANALYSIS. **Class/method:** ConsumerCompatibilityValidator
  validateTree/identity.
- **Source:** `.../failureanalysis/ConsumerCompatibilityValidator.java` L103–114,
  127–133; DATA_CONTRACT §2; MOBO_HANDOFF §5.2.
- **Reproduction:** MISSING_NESTED_EV_STATUS: synthetic valid handoff, bỏ status
  và source_refs của members[0].seed; recompute đúng cohort/content digests.
  Output schema=VERIFIED, integrity=VERIFIED, identity=VERIFIED.
- **Expected:** seed bắt buộc EV<integer>; missing wrapper fields phải INVALID,
  bất kể digest có khớp. Digest integrity không thay schema conformance.
- **Observed:** validateTree chỉ nhận diện EV nếu cả value/status/source_refs đã
  hiện diện; object thiếu discriminator đi qua như object thường.
- **Impact:** báo cáo schema assurance quá mạnh. Dispatch vẫn false do các gate
  khác; không có bằng chứng unsafe dispatch trong M1D.
- **Recommended fix:** validate required nested fields theo contract paths/types,
  không dùng presence heuristic làm schema validator. Thêm malformed-wrapper,
  wrong-type/null/missing status/source refs tests cho member/baseline/objectives.

## FA-006 — MEDIUM — Parameter hint trỏ candidate ID như hypothesis ID

- **Owner:** FAILURE_ANALYSIS. **Class/method:** ParameterHintBuilder.hint/build.
- **Source:** `.../failureanalysis/ParameterHintBuilder.java` L25–28,77–89.
- **Reproduction:** POSITIVE_SYNTHETIC_HINT_REFERENCES: positive fixture có hint
  SUSPECTED BRAKE_BUILDUP_RATE; related_candidate_ids và hypothesis_refs đều là
  [synthetic-ineffective], trong khi report_hypothesis_ids=[] và candidate tồn tại.
- **Expected:** MOBO_HANDOFF §6 và POLICY §7: hypothesis_refs phải resolve đúng
  hypothesis; candidate và causal hypothesis là hai loại claim. Không bắt buộc
  root cause/hypothesis để có suspected hint khi gates đã đủ.
- **Observed:** hint helper nhận candidates rồi gán thẳng vào hypothesis_refs.
- **Impact:** causal/evidence graph có dangling hoặc sai loại references dù mọi
  artifact registry reference đều resolve; test source_refs không phát hiện được.
- **Recommended fix:** lấy hypothesis IDs thực hoặc []; giữ candidate IDs ở field
  riêng; kiểm report-relative claim ID resolution/type, không bịa hypothesis.

## FA-007 — MEDIUM — Positive policy/calibration/absence context chưa wired vào report

- **Kind:** UNWIRED_CAPABILITY/REMAINING_WORK. **Owner:** FAILURE_ANALYSIS.
- **Class/method/source:** DiagnosticReport.analyze L9–20,50–60;
  DiagnosisPolicy.assess L94, applyRequirements L28–51; EvidenceGates.calibration
  L24–43; EvidenceReport.analyze L13–18.
- **Evidence:** report API chỉ nhận Run hoặc Run+pairedOff; luôn gọi
  outcome(...verifiedNoContact=false,null,null,null), calibration(null,...),
  applyRequirements(...,Map.of()); không truyền baseline binding vào M1A report.
  Positive approved-requirement/calibration tests chỉ gọi helper độc lập.
- **Expected:** DATA_CONTRACT §3,§8–9, POLICY §3/§5, Q02: có đường đọc normalized
  requirement/coverage/calibration context để áp dụng khi evidence hợp lệ.
- **Observed:** pipeline chỉ hoạt động conservative symptom profile; không thể
  xuất SUPPORTED/IN_DOMAIN/SAFE bằng context được caller cung cấp qua report API.
- **Impact:** helper implemented không đồng nghĩa capability đã integrated.
  UNKNOWN trên Golden18 là đúng; không dùng finding này để ép Golden18 thành SAFE.
- **Recommended fix:** trong task riêng, truyền verified versioned context qua
  assembler, reuse gates hiện có; missing vẫn conservative. Positive pipeline
  tests phải đi hết report thay vì gọi helper. P05 certification vẫn được defer.

## FA-008 — MEDIUM — Kinematic objective lineage/explanation chưa đúng profile

- **Owner:** FAILURE_ANALYSIS. **Class/method:** MetricProvenanceResolver.resolve/
  objectiveLineage, ObjectiveExplainer.explain.
- **Source:** `.../failureanalysis/MetricProvenanceResolver.java` L16–19,27–40,
  73–87; `ObjectiveExplainer.java` L19–27; `DiagnosticSupport.java` L20–23.
- **Reproduction:** KINEMATIC_PROFILE_EXPLANATION, actual Simulator.simulate tạo
  fixture kinematic1.4 offline (không CARLA), không có carla metadata: signal/window
  UNKNOWN nhưng mechanism_notes vẫn nói
  canonical CARLA jerk lọc whole series và cửa sổ T_AEB. Pipeline khai hỗ trợ1.4.
- **Expected:** OBJECTIVE §3.1/OA-02: kinematic raw jerk từ command onset, .05s,
  không Butterworth10Hz; unknown vintage phải nói UNKNOWN, không narrative CARLA.
- **Observed:** resolver chỉ nhận các CARLA profiles9…15 cho mapped bases;
  explanation CARLA là unconditional text cho mọi profile.
- **Impact:** mô tả sai/không đầy đủ metric vintage; CARLA Golden18 không bắt lỗi.
- **Recommended fix:** per-profile descriptor có source/version rõ; unsupported
  metadata không đoán. Test actual supported kinematic producer result và unknown
  profile trong report. Không thêm filter hay tính lại canonical values.

## FA-009 — LOW — Hypotheses thiếu source mechanism và falsification plan cụ thể

- **Owner:** FAILURE_ANALYSIS. **Class/method:** DiagnosisPolicy.claim/assess.
- **Source:** `.../failureanalysis/DiagnosisPolicy.java` L77–85,96–99.
- **Evidence:**007/012 hypothesis PRIMARY_PERCEPTION_OR_DELIVERY_UNRESOLVED có
  alternatives/missing evidence, nhưng refs chỉ result/contact/formula, không
  RadarTracker mechanism; không có falsification test.064 tương tự track persistence.
- **Expected:** POLICY §7/BLUEPRINT: supporting/counterevidence, source mechanism,
  competing hypotheses và test có thể bác bỏ từng hypothesis.
- **Observed:** dùng generic claim template; không confirmed root là đúng nhưng
  chưa đủ một hồ sơ điều tra nguyên nhân theo contract.
- **Impact:** reviewer biết thiếu gì nhưng không truy được causal mechanism/test
  tiếp theo chỉ từ report; không phải bằng chứng root cause đã bị xác nhận sai.
- **Recommended fix:** source-backed hypothesis descriptors + explicit proposed
  falsification/trace requirements; không chạy reproduction trong audit này.

## FA-010 — MEDIUM — Không giới hạn artifact inflation; process có thể OOM

- **Owner:** FAILURE_ANALYSIS. **Class/method:** RawArtifactAdapter.bytes/load.
- **Source:** `.../failureanalysis/RawArtifactAdapter.java` L90–117,124–129;
  HandoffSnapshots.read L13–20 cũng read-all, cần cùng quota policy.
- **Reproduction:** [verify_resource_limit.py](verification/verify_resource_limit.py),
  [log](evidence/resource-limit-probe.log): archive synthetic65415bytes chứa member
 67108866bytes; JVM giới hạn32MiB chết OutOfMemoryError tại bytes:L125.
- **Expected:** untrusted input/resource review F3: controlled rejection/limits
  trước allocation, không làm chết process chỉ vì một oversized member.
- **Observed:** readAllBytes và full in-memory JSON/CSV, không entry/total/ratio/
  nesting/row quotas. Path traversal guard không giải quyết resource exhaustion.
- **Impact:** CLI hiện tại crash; đây là blocker hardening trước nhận upload qua
  backend. Không tuyên bố đã exploit server production.
- **Recommended fix:** bounded streaming/read sizes, per-artifact/cohort budgets,
  close-on-constructor-failure và controlled input-error report. Size limits phải
  chọn theo product/data contract; audit không tự áp một con số production.

## Dependencies — không gán nhầm thành lỗi producer Failure Analysis

### DEP-01 — BLOCKER — Thiếu operational baseline/frozen identity exports

**Owner DATA_PROVIDER.** BaselineBindingResolver.verify L42–65;
MoboHandoffBuilder.member L125–148. Actual72 result có source={}; handoff có72
diagnostic members, DB IDs null, baseline/score UNKNOWN; HF-02/HF-03 luôn skip vì
chưa có authorized fixtures. Expected MOBO_HANDOFF §4/§8 yêu cầu project/version/
creation lineage/currentness/variant+seed+selected run hashes. Output UNKNOWN là
đúng về honesty nhưng operational data chưa đủ. Impact: chưa bàn giao được baseline
v1/score/cohort thực. Required action: cung cấp authorized immutable exports và
reviewed selection; không sửa Golden18 hoặc bootstrap để tạo evidence giả.

### DEP-02 — BLOCKER — Chưa có bound post-fit calibration/quality acceptance package

**Owner CALIBRATION.** MetricProvenanceResolver.resolve L25–26;
DiagnosticReport.analyze L50–54; raw `/outcome/case/carla` và DATA_CONTRACT §8/Q02.
Golden18 có pedal-map/full-brake/physics metadata, nhưng không cung cấp validated
per-field domain/residual/holdout package gắn cùng operational baseline/source.
Expected là IN/OUT/UNKNOWN theo domain thật; observed UNKNOWN là đúng. Impact:
không chứng minh FA đã được nghiệm thu trên actual post-fit operational context.
Required action: calibration owner cấp artifact/version/hash/domain/residuals và
approved observational-vs-physical quality policy; FA-007 xử lý đường nhận context.
Không nói Golden18 chưa từng dùng calibration; nói chưa đủ acceptance evidence.

### DEP-03 — BLOCKER — Consumer integration ngoài phạm vi Failure Analysis

**Owner MOBO_CONSUMER.** OptimizationController.OptimizationRequest L40–64;
ConsumerSourceInspection.gaps L43–55 mô tả consumer boundary đã pin hashes.
Request hiện không nhận dataset/frozen split; typed MoboTrial không nhận Diagnostic
JSON; source selection/aggregation/custom-bound enforcement còn gaps. Report M1D
actual ghi NOT_DIRECTLY_CONSUMABLE/dispatch=false, đúng contract §1/§9.
Impact: chưa thể external execution trực tiếp. Required action: đồng đội tích hợp
qua boundary được duyệt, giữ canonical/cohort/bounds/holdout. **Đây không phải bug
của FA chỉ vì NOT_DIRECTLY_CONSUMABLE.** Không audit GP/qEHVI hoặc implement M2.

### DEP-04 — HIGH — Freeze metadata còn sai nghĩa impact hiện hành

**Owner BACKEND_INTEGRATION.** AnalysisService.freeze L186–189 ghi
EGO_SPEED_NOT_RELATIVE cho mọi profile; CarlaSession.step L373–374 và finish
L785–811 hiện dùng relative impact và filtered jerk. Expected OBJECTIVE §2 và
metric contract yêu cầu đúng vintage. Observed source contradiction đã xác nhận,
chưa có DB export để đếm record affected. Impact: metadata downstream có thể hiểu
sai scalar. Required action: versioned descriptor/sidecar trong task backend riêng;
không rewrite archive hoặc đổi canonical producer.

### DEP-05 — MEDIUM — Full Maven gate còn hai failure có trước

**Owner BACKEND_INTEGRATION.** OptimizationServiceTest L154–176, actual
[full log](evidence/full-verify.log). Hai Mockito expectation failures cùng tên
và loại đã có trong log M1D trước audit. Expected full verify xanh trước release;
observed1317tests/2fail/3skip. Impact: full project build chưa thành công, dù focused
FA verify thành công. Required action: owner xử lý riêng semantics/test expectations;
audit không sửa service hoặc test để làm xanh.

## Thứ tự sửa và gate trước backend

1. Sửa FA-001…004; thêm regression ở actual report pipeline và giữ nguyên Golden18
   oracle/counts/canonical values. Không chỉ sửa message hoặc unit expected.
2. Sửa FA-005/006; kiểm EV schema theo field và typed claim references của positive
   fixture. Preserve digest profiles, source integrity và sealed validation.
3. Chốt observational integration scope; xử lý FA-007/008 và ghi giới hạn FA-009.
   P05 certificate/confirmed root vẫn có thể DEFER, có reason rõ, không ép known.
4. Hardening FA-010 trước untrusted backend input. Sau đó rerun formula, pipeline,
   Golden18, handoff/isolation/digest/adversarial gates và full project checks.
5. DEP-01/02 do data/calibration team; DEP-03/04/05 do downstream owners. Chúng không
   được dùng để che defect FA hoặc buộc tác giả FA làm optimizer của đồng đội.

Không có fix nào được thực hiện trong audit này. Kế hoạch M2 trước đó chỉ là tài
liệu tham khảo; audit không kích hoạt bất kỳ phase implementation nào.

## Source path key cho các tên rút gọn trong register

Line ranges nêu tại mỗi finding, tính trên snapshot hash ở protected-before.json.
Tên class FA không có path đầy đủ dùng prefix `src/main/java/com/vsos/core/failureanalysis/`.
Các tên ngoài package đó resolve như sau:

| Name | Repository-relative source file |
|---|---|
| OptimizationController |`src/main/java/com/vsos/backend/controller/optimization/OptimizationController.java` |
| OptimizationService |`src/main/java/com/vsos/backend/service/optimization/OptimizationService.java` |
| AnalysisService |`src/main/java/com/vsos/backend/service/analysis/AnalysisService.java` |
| RegressionService |`src/main/java/com/vsos/backend/service/regression/RegressionService.java` |
| MoboEngine / MoboTrial / ParameterBounds |`src/main/java/com/vsos/core/mobo/` + class name + `.java` |
| CarlaSession / Simulator |`src/main/java/com/vsos/core/simulation/` + class name + `.java` |
| OptimizationServiceTest |`src/test/java/com/vsos/backend/service/optimization/OptimizationServiceTest.java` |

M1AAuthorizedFixtureTest nằm trong `src/test/java/com/vsos/core/failureanalysis/`.
