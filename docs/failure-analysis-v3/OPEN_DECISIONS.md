# OPEN_DECISIONS — Những lựa chọn dữ liệu hiện tại không tự quyết định được

V3.1 DESIGN ONLY. Các đề xuất dưới đây chưa được phê duyệt và không làm thay đổi runtime, DB, calibration, ADR hay lịch sử. `FA_DIAGNOSTIC_CONSERVATIVE_V1` chỉ là profile diagnostic đề xuất: xuất facts/candidates/UNKNOWN; không tự dùng cho release, optimization acceptance hoặc regression approval.

Bằng chứng nền: [A01](../../data/failure-audit-output/01_EVALUATOR_LOGIC_AUDIT.md), [A02](../../data/failure-audit-output/02_CASE_BY_CASE_AUDIT.md), [A03](../../data/failure-audit-output/03_DATA_CONSISTENCY_AUDIT.md), [A04](../../data/failure-audit-output/04_BACKEND_IMPACT_ASSESSMENT.md), [A05](../../data/failure-audit-output/05_RECOMMENDED_CHANGES.md), [A06](../../data/failure-audit-output/06_AUDIT_SUMMARY.md). Hash/locator ở [DATA_CONTRACT](DATA_CONTRACT_V1.md). Mỗi quyết định được chốt sau này phải có owner, rationale, evidence, effective policy/requirement version; không sửa report hay golden labels cũ.

## OD-01 — Acceptable caution policy

**Chưa biết:** lúc nào phòng ngừa trước nguy cơ chưa chắc chắn được coi là đúng, mức can thiệp nào chấp nhận được, horizon/uncertainty/actor scope nào bắt buộc. 061 người vẫn đi ở Q nên extrapolation có cơ sở;064 GT gần dừng nhưng actual tracker prediction không ghi. Hậu nghiệm curb stop không chứng minh thông tin mà AEB biết tại Q. 002 người từng vào lane nhưng rời trước ego arrival [A02 sections002/061/064; SRC AebStack.decide, RadarTracker].

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Brake chỉ khi nominal deterministic2D collision predicted | Dễ giải thích/kiểm thử, hạn chế phanh thừa | Có thể bỏ qua uncertainty và ý định người thay đổi; không đủ cơ sở chọn horizon/motion model |
| B. Brake theo approved uncertainty/caution envelope, proportional intervention | Cho phép phòng ngừa hợp lý với evidence tại decision; tách warning/partial/full brake | Cần yêu cầu rõ horizon, bounds, mức phanh và cancel policy; dữ liệu hiện chưa đủ replay |
| C. Hindsight không hit/no-brake-conflict thì false braking | Dễ tính trên corpus, gần legacy/XLS | Outcome bias; phạt đúng các lần phòng ngừa; có thể gọi phanh tránh hit là false |

**Đề xuất:** B. C chỉ giữ làm symptom “hindsight unnecessary braking”, không functional label. Chưa chốt thì FALSE_BRAKING chỉ SUSPECTED ở061/064; không probability/HIGH score. Proposed owner: product/system safety requirements owner cùng AEB engineer. Cần: requirement IDs, approved pedestrian motion/uncertainty envelope, horizon, cancellation/grace, intervention threshold và complete relevant-actor evidence. Không cần thay AEB để viết requirement; việc chỉnh controller là task khác.

## OD-02 — Collision authority và absence coverage

**Chưa biết:** source nào có quyền kết luận physical contact khi core geometric-or-callback termination khác independent recorder; làm sao chứng minh event không xảy ra. Có12legacycollision/eventempty, trong đó011/091 nominal unforced positive distance. Core branch không ghi; cleanup/drain watermark thiếu. Impulse0 có thể vẫn là recorded contact [A02,A03; SRC CarlaSession.step, sensor_recorder._on_collision/write].

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Legacy core/evaluator collision authoritative | Dễ tương thích, giữ43collision | Trộn bbox overlap với callback và forcezero; không giải quyết physical meaning |
| B. Recorder[] luôn no-contact, positive event làcontact | Dễ làm31contact và safe labels | Empty chưa chứng minh attach/coverage/drain; có thể bỏ callback chưa giao trước termination |
| C. Evidence hierarchy + positive-event semantics + explicit conflicts/coverage | Giữ31 positive, không ép12mismatch; có thể thêm authority sau | Nhiều UNKNOWN và cần report rõ; không đủ operational safe labels ngay |
| D. Manual mesh/physics adjudication mọi mismatch | Có thể giải quyết từngcase sâu hơn | Cần evidence mới/reproduction; công sức cao, không có trong raw hiện tại |

**Đề xuất:** C cho diagnostic; D chỉ khi có task/evidence riêng. Positive matching event → COLLISION với claim level OBSERVED_EVENT, không certification physical model. [] chưacomplete→UNKNOWN;core-only true→OPEN disagreement. Khi authority được chốt, version policy/golden expectation, không rewrite43 legacy collision. Owner đề xuất: simulation evidence/physics owner + review authority. Cần: authoritative event definition, branch log, actor binding, sensor health, full physics horizon/drain, tolerance cho timing và duplicate events. Geometry-only outcome nên có model basis, không giả event.

## OD-03 — Physical avoidability assumptions

**Chưa biết:** reference time nào; brake-only hay steering; target có phản ứng; flat-road/grade; initial brake; delay/jerk/dynamics; uncertainty set; finite horizon và stopping boundary/safety margin. P0218.253m của007 và20.785m wet125 là analytic model examples, không validated realized response. Negative stop margin không chứng minh collision pedestrian2D [A02,A03; FORMULA P01–P05].

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Ideal1D no-delay screen quyết định unavoidable | Nhanh, ít dữ liệu | Lạc quan về phanh, sai về occupancy2D; không chấp nhận làm physical conclusion |
| B. Delay+ramp brake-only model + full-body2D + interval uncertainty | Khả thi để thiết kế/kiểm toán, assumptions công khai | Cần response validation và action-set/horizon evidence; braking có thể tạo feasible windows không monotone |
| C. High-fidelity validated reachability/closed-loop counterfactual | Mạnh hơn về physical statement và alternatives | Chi phí dữ liệu/solver cao, vẫn phụ thuộc model/target behavior |
| D. Chỉ report observed trace, không counterfactual | Không vượt evidence | Không trả lời tránh được hay không, chỉ severity/timing facts |

**Đề xuất:** B cho conditional diagnostics; D khi prerequisites thiếu; C chỉ cho confirmed PHYSICAL_LIMIT nếu cần và được kiểm chứng. Reference time bắt buộc gắn claim: validated observable hazard vs actual Q là hai câu hỏi. Chưa đủ certificate thì canonical avoidability UNKNOWN, không gọi finite failed search là unavoidable. Owner: vehicle dynamics/simulation + requirements reviewer. Cần validated envelope, explicit admitted actions, uncertainty/certification criterion, horizon, target model và m_s; không tự calibrate từ18 case.

## OD-04 — Root-cause evidence threshold

**Chưa biết:** evidence tối thiểu nào phân biệt SUSPECTED, SUPPORTED, CONFIRMED; khi nào deterministic trace đủ thay controlled reproduction; ai adjudicate; xử lý nhiều contributing causes. Legacy first-failed-stage và confidence.9 không là probability hay causal proof [A01 hazardChain/primaryStage; A02 case007/012/064/125; A04 failure persistence].

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. First failed heuristic rule là confirmed root | Đơn giản, gần hệ thống cũ | Tạo nhãn nguyên nhân giả; vehicle cap dễ bị gọi low friction; confidence không có hiệu chuẩn |
| B. Evidence ladder + alternatives + requirement + traced causal chain | Triển khai incrementally, công khai giới hạn | Thường chỉ có hypotheses, cần reviewer hiểu khác biệt |
| C. Chỉ confirmed khi controlled intervention/reproduction và independent adjudication | Ngưỡng mạnh, phù hợp causal label dataset | Tốn kém; một số deterministic trace có thể đã decisive nhưng bị chậm |

**Đề xuất:** B với ngưỡng confirmed gần C; exception deterministic decisive trace phải là điều khoản được owner phê duyệt, không tự suy. SUPPORTED không alias confirmed. Không bắt buộc primary cause; có nhiều contributors và unknown. Owner: analysis/system validation lead + designated reviewer. Cần rubric, falsification/alternative checklist theo từngcause, adjudication evidence và causal label version. Golden18 hiện không case nào confirmed-root gold; không train/supervise root classifier bằng legacy label.

## OD-05 — Calibration validity domain

**Chưa biết:** pedal map/full-brake/IMU/jerk correction nào được validate trên xe, simulator/physics hash, speed,μ,load,grade/weather nào; residual/bounds ra sao. Golden18 có pedal_map name/full_brake9.13 và applied physics metadata nhưng không có validated domain. XLS F19 danh sách4xe/v20–60/μ≥.55 là giả định, không chứng chỉ.72 run đều nominal/applied dimensions disagree [A03; SRC CarlaSession pedal/physics check].

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Tênxe/name/map tồn tại thì IN_DOMAIN | Dễ reuse, ít unknown | Không kiểm vintage/context, dễ extrapolate sai; không có support trong input |
| B. Domain/residual metadata per corrected field, hash/version và context match | Traceable, tách IN/OUT/UNKNOWN/NA, không reject mọi claim | Cần calibration evidence package và giữ context đủ |
| C. Strict reject toànrun khi một calibration unknown | Gate đơn giản | Xóa cả contact/timing facts không phụ thuộc calibration; giảm dữ liệu không cần thiết |

**Đề xuất:** B; missing domain=UNKNOWN, known violated constraint=OUT, không dùng C làm global quality. Không fit/chỉnh calibration trong nhiệm vụ này. Owner: calibration/vehicle dynamics owner. Cần validation dataset độc lập, parameter range và cross-field dependencies, residual/covariance/bounds, holdout và version/hash. Tách model cap từ response guarantee; dimensions mismatch không tự là nguyên nhân hit hoặc invalid toànrun.

## OD-06 — Data quality gate cho MOBO/Regression

**Chưa biết:** mục tiêu nào cần contact authority, metric quality nào đủ, unknown được xử lý/quarantine ra sao, có cần root cause để optimization, policy false braking denominator gì. Current finite-scalar/evidenceComplete không bảo đảm causal/evidence completeness; current resultsource={} không được bypass ingestion [A04; SRC AnalysisService.freeze/validTrace, AnalysisMetrics, RunService.checkResult].

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Reuse scalar completeness + legacy labels | Tương thích, dễ chạy | Có thể đưa43 legacy collision,6 legacy FP,9 legacy MA làm truth; unsafe missing→score0 |
| B. Capability-specific eligibility per metric/outcome/functional/causal goal | Giữ data hữu ích, có unknown/exclusion manifest; không đòi confirmed root cho mọi optimization | Cohort rules phức tạp hơn, phải pin versions và giữ safe/control cases |
| C. Chỉ dùng all-axes-complete, confirmed cause | Dataset rất rõ cause | Hiện Golden18 không đạt; không cần thiết khi tối ưu physicalmetric không causal attribution |

**Đề xuất:** B. Không tự phê duyệt operational corpus. Prototype/shadow giữ toàn72 run để audit; contact-dependent objective loại/quarantine12mismatch cho tới adjudication; no-contact objective cần absencecoverage; calibration-sensitive metric cần domain/bounds phù hợp. Cause eligibility toàn72 chưa đạt, không suy0%root failure. Offline/source-unbound không ingest DB giả.

Owner: optimization/regression owner cùng reviewer. Cần per-objective capability rubric, metric identity (signal/window/filter/impactbasis), version-pinned cohort, exclusions/unknown counts, stable pairing, cluster/rep split và safe/nonhazard coverage. Historical datasets/baselines/approval giữ nguyên; new dataset version có lineage. Không auto-Accept baseline khi có Pareto tốt.

## OD-07 — Thresholds cho near miss, meaningful braking và physical onset

**Chưa biết:** d_near, TTC/PET encounter rule, safety margin m_s, delay tolerance, onset threshold/duration/filter/baseline, allowed measurement gaps. Legacy TTC<1/min_distance<.5 là project heuristic; XLS .05s lateness/1m/s² deficit không tự là functional standard. Recorder pedal>.05 sau.5s là statistic, không physical onset [A01,A03; FORMULA G03/G04,T01/T02].

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Copy tất cả legacy thresholds thành V3 requirements | Dễ comparison | Giữ nhập nhằng signal/horizon và arbitrarycause thresholds |
| B. Versioned thresholds theo use case + uncertainty hysteresis + requirement evidence | Giải thích được, kiểm thử boundary, tách descriptive và normative | Cần review/validation; một sốlabel UNKNOWN trước khi chốt |
| C. Không threshold, chỉ continuous metrics | Giảm nhãn tùy tiện, vẫn hữu ích cho review | Không đáp ứng nhu cầu operational SAFE/NEAR_MISS/functionalgates |

**Đề xuất:** B; dùng C cho diagnostic trong lúc chưa chốt. Không giả NCAP/FHWA/UNR152 quy định các threshold này nếu chưa có exact protocol/scope/version được kiểm chứng. Near-miss label cần verified no-contact và complete encounter; bounds cắt threshold→UNKNOWN. Owner: requirements/measurement expert. Cần approved thresholds, signal basis, uncertainty handling và test near boundaries. Không hiệu chỉnh để “đúng”18legacy labels.

## OD-08 — Storage, version selection và retention

**Chưa biết:** sidecar file/object store hay append-only DB, retention/raw access, endpoint versioning, cache policy và ai được chọn report cho freeze. Schema hiện tại failures/root_causes không biểu diễn đầy đủ7axes/provenance [A04; schema và AnalysisViewService].

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Ghi đè result/evaluation/failure rows cũ | Đọc dễ | Mất lịch sử/vintage, trái yêu cầu bảo toàn; loại khỏi phương án hợp lệ |
| B. Immutable sidecar report + source registry; new explicit API/version | Giữ audit/replay/rollback, prototype read-only dễ | Thêm storage/index/retention và version selection |
| C. Chỉ tính report mỗi request | Không migration ban đầu | Tốn compute, output “latest” dễ thay đổi, khófreeze nếu không persistdigest |

**Đề xuất:** B; prototype có thể offline sidecar, operational storage/API chốt ở future task. Mọi report có contract/formula/policy/build/input hash và content digest;created_at không ảnh hưởng determinism. Owner: backend/data governance owner. Không DDL, ingest, backfill hay endpoint implementation trong Phase2.

## OD-09 — Canonical objective compatibility: scope đã chốt, consumer alignment còn mở

**V3.1 scope đã được người dùng chốt:** giữ3canonical objectives và `adr040-stored-aggregation/1`, đúng per-run producer profile. No-hit impact0 chỉ ở valid aggregate; diagnostic physical impactnull nếu không contact; stopping trace/model tách; jerk đúng signal/filter/window. Không tạo objective version mới hoặc đổi baseline score trong nhiệm vụ này.

Source vừa đối chiếu: AnalysisMetrics/AnalysisService và [OBJECTIVE_ANALYSIS](OBJECTIVE_ANALYSIS_CONTRACT_V1.md). Current freeze vẫn có metadata `EGO_SPEED_NOT_RELATIVE` sai với xosc15; current OptimizationService.evaluateCandidateRuns có null-skipping/zero fallback/activation membership/rounding khác canonical. Đây là **known code discrepancies**, không OPEN_DECISION về việc chúng có tồn tại.

Còn cần quyết định ở OD-11: future integration đảm bảo dùng canonical contract thế nào mà giữ histories/optimizer. Diagnostic raw-GT/IMU metrics có thể giữ namespace riêng để giải thích, không thay canonical objectives. Owner: metric owner + optimizer/regression owner. Chưa có approved integration thì consumer compatibility NOT_DIRECTLY_CONSUMABLE.

## OD-10 — Xác nhận actual baseline và “AEB v1”

Dữ liệu chưa đủ: source tạo fresh v1.0 với TTC1.5 override và catalog seed delay.15/max8/build20, nhưng chưa có authorized project baseline/version values snapshot hay DB binding của Golden18. Current baseline có thể đã là version khác; catalog existing có thể khác seed. Manifest run_id local không DB runID.

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Gọi Golden18default tuple là v1 | Nhanh | Không chứng minh versionID/project/lineage;091tuple khác; tạo baseline giả |
| B. Bind actual project/version/run/config snapshot và pin hashes | Xác nhận đúng version/currentness và4values thực | Cần read-only authorized export từ nhóm; offline corpus không tự cung cấp |
| C. Chỉ dùng source seed label | Hữu ích mô tả nominal context | Không đủ operational baseline hoặc score |

**Đề xuất B**, giữ C=SOURCE_SEED_ONLY cho docs. A loại. Default: identity/v1 confirmation/score UNKNOWN. Owner: baseline/data owner. Cần projectID,versionID/version_no/label/status/creation/currentness,4parameter values/catalog snapshot, selected run source và immutable hashes; không chạy bootstrap/migration để “xác nhận”. M1A có thể hoàn thành parser/unknown handling với fixture; M2 consumption phải chờ actual binding khi vận hành.

## OD-11 — Consumer integration và aggregation parity

Known facts: OptimizationRequest không datasetID; service lấy latest family/latest baseline per variant; MoboTrial chỉ3numericobjectives; engine dùng ParameterBounds.defaults, customsearchspace và custom objective config chưa enforced. AnalysisMetrics canonical khác optimizer helper ở missing/NA/membership/rounding. AGENTS/CLAUDE vẫn nói MOBO chưa có nhưng source có engine/service.

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Export V3JSON và gọi current POST /optimizations như đã hỗ trợ | Không đổi code ban đầu | Bỏ frozen partition/evidence/quality; có thể dùng validation; số không cùng canonical aggregate |
| B. Future validated facade/adapter cho exact cohort + canonical aggregates + bounds, reuse MoboEngine | Giữ algorithm, đạt traceable boundary | Cần nhiệm vụ integration riêng; signature/storage/review có thể cần bàn thêm, không làm ở V3.1 |
| C. Dừng ở report/manifest chỉ cho review | Đúng scope, không side effects | Chưa là running MOBO handoff |

**Đề xuất C hiện tại, B cho future authorized M2**; không rewrite engine. Cần team xác nhận boundary owner và canonical shared calculator, consumer round/display policy không đổi mean canonical, record-level versioning và frozen cohort execution. Owner: analysis+MOBO engineers. No baseline as invented trial0. Current compatibility NOT_DIRECTLY_CONSUMABLE; future tests OA-10/HF-09..11 phải phân biệt archive handoff_ready khỏi actual consumer ready.

## OD-12 — Objective-specific quality profile và missing/NA policy cho operational use

Canonical missing/NA math **đã biết**, không được tự thay: case026 B có nhưngjerknull là missing; no-brake J/D NA vẫn giữ choimpact; toànNA không objectivesAvailable. Chưa chốt mức physical/calibration/coverage đủ cho MOBO quan sát mô phỏng so với claim vật lý mạnh hơn.

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Finite stored values đủ quality | Nhiều dữ liệu | Không kiểm known contact/metadata conflicts, model extrapolation hay vintage |
| B. Per-objective gates và approved observational/physical scope | Giữ được scalar hữu ích, quality claims chính xác | Cần rubric của metric owner, uncertainty/model/calibration acceptance rõ |
| C. Mọi run phải confirmed root và fullphysicalvalidation | Mạnh về causal labels | Không cần cho numerical optimization, Golden18 chưa có; loại quá mức |

**Đề xuất B**, giữ3states READ_CANONICAL / PHYSICAL_INTERPRETATION / MOBO_ELIGIBLE riêng. Root UNKNOWN không mandatoryblock; collision authority/calibration missing phải đúng claim/profile, không silentlyeligible hoặc wipe scalar. Cần owner chốt có cho phép simulator-observational optimization trên conditional calibration không, evidence tối thiểu cho từngobjective, cách quarantine12contact conflicts và threshold/model domain. Chưa chốt →operational eligibility UNKNOWN/BLOCKED, không thay canonical math hay drop missingrun để tạo score đẹp. Owner: metric+calibration+regression review.

## OD-13 — Domain authority và numeric search range recommendations

Source bounds đã biết, **không còn UNKNOWN** ở mức code: catalog seed TTC[.5,4],delay[0,.5],max[3,10],build[5,20]; engine default TTC[.5,3.5],delay[.05,.45],max[5,10],build[5,20]. Chưa có live catalog snapshot/approved campaign domain và customrange enforcement. Calibration domain không tự là AEBparameter box.

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Tạo local range ±percentage quanh Golden18defaults | Dễ hiển thị | Không có nguồn/authority, tối ưu trá hình, có thể vi phạm domain |
| B. Report sourced domains; suggested range chỉ intersection các nguồn đã được bind/phê duyệt | Không inventbounds, traceable | Thiếu source thì suggested UNKNOWN; current service không enforce custom bounds |
| C. Luôn dùng enginedefaults làm approvedrange | Có nguồn số cụ thể | Nguồn code không bằng campaign authorization/catalogactual/calibration scope |

**Đề xuất B**. Direction hint có thể SUSPECTED khi source mechanism đủ, numeric range vẫn UNKNOWN khi chưa có sources. Không đổi controller/fixed6params hay bịa bounds từ μg. Cần livecatalog/referencehash, approvedcampaign scope, parameter constraints thực nếu model cung cấp, proposalpost-mutation validation và policy for fixed dimensions. Owner: optimizer+requirements+calibration owner. Golden18 suggestedrange UNKNOWN; engine/source intervals giữ làm context, không search range được phê duyệt.

## OD-14 — Case roles, replicate selection và safe/validation partition

Current freeze không duplicate variant+seed và không overlap variant giữa2tập; mỗi tập cần legacy SAFE. Optimizer current dùng latest family/latest run, mộtrow/variant, không consume sealedvalidation. Golden18 có3rep cùngseed/case, không DBvariantID; conservativeCoreV3 không hardSAFE khi absencecoverage thiếu. Designrole/design_intent không physicaltruth.

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Chọn best rep/legacy labels và chia ngẫu nhiên các rep qua2tập | Dễ tạo số vàtập SAFE | Selection bias, same variant leakage, pseudo-groundtruth |
| B. Reviewed partition theo variant/seed, preserveallrep diagnostic, safe/nonhazard role có evidence level | Tương thích current freeze uniqueness, không leakage | Cần reviewer chốt representative-run choice/scope và safe evidence |
| C. Mean3rep như một run canonical | Giảm variability | Đổi aggregation/cohort semantics, chưa được phép; mấtindividualeventfacts |

**Đề xuất B**; C chỉ future decision ngoài canonical hiện tại, không thực hiện. Không tự chọn representative hoặc labelUNKNOWN→SAFE để quafreeze. Validation refs/hash có thể bàn giao cho downstream verification, nhưng validation evidence không làm nguồn hint/range/GP. Owner: dataset/regression reviewer. Cần actualvariant/seed mapping, reviewedrole/scope, selection policy, splitmanifest và holdoutaccess policy. Golden18 hiện diagnostic-only/unbound, chưa operational dataset.

## Decision register và chế độ khi chưa chốt

| Decision | Diagnostic default đề xuất | Operational dependency |
|---|---|---|
| OD-01 caution | Hindsight symptom only, functionalFP UNKNOWN | False brake constraints/rates |
| OD-02 authority | Positive matching event observed; [] insufficient; conflicts OPEN | Contact/no-contact objectives, SAFE |
| OD-03 avoidability | Conditional model screens, canonicalUNKNOWN | PHYSICAL_LIMIT, latest feasible 2D |
| OD-04 cause | Hypotheses only unless approved threshold met | Confirmed root labels/training |
| OD-05 calibration | Per-field UNKNOWN/OUT/IN/NA | Calibrated physical metrics |
| OD-06 cohort | Audit retain all; no operational auto eligibility | MOBO/regressionfreeze/adoption |
| OD-07 thresholds | Continuous metrics; labels dependent UNKNOWN | NEAR_MISS/onset/duty violations |
| OD-08 storage | Design only; immutable future proposal | Persistence/API rollout |
| OD-09 objectives | Canonical unchanged; known metadata/consumer discrepancies | Future consumer alignment, không new objective ở V3.1 |
| OD-10 baseline | Identity/v1/score UNKNOWN khi chưa bind | Actual project/version/run snapshots |
| OD-11 consumer | Review-only, NOT_DIRECTLY_CONSUMABLE | Future authorized adapter, reuse engine |
| OD-12 objective quality | Per-objective UNKNOWN; scalar giữ nguyên | Approved observational/physical eligibility profile |
| OD-13 ranges | Sourced domains known, suggested range UNKNOWN | Actual catalog + approved scope + enforcement |
| OD-14 partition | Diagnostic reps retained, no automatic selection | Reviewed unique/disjoint cohort, no validation leakage |

Các open decision không ngăn hoàn thành bộ thiết kế: implementer có schema, math, tree và expected unknown behavior rõ ràng. Chúng ngăn module tự biến assumptions thành ground truth hoặc dùng diagnostic profile làm approval policy. Sau V3.1 dừng ở thiết kế, không bắt đầu M1A; bất kỳ implementation/collection/migration nào là nhiệm vụ riêng.
