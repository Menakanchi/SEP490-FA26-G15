# Module3 → Module4: nhận handoff.json cho MOBO

File đúng tên là **handoff.json**. Diagnostic Report, result JSON, backend
`vehicsim.analysis-dataset/v2` và FA handoff là các contract khác nhau.
Không gửi thẳng cả Diagnostic JSON vào MoboEngine rồi coi đó là MoboTrial.

Schema FA: `vehicsim.failure-analysis-mobo-handoff/v1`, design revision V3.1,
aggregation `adr040-stored-aggregation/1`. Contract đầy đủ:
[MOBO_HANDOFF_CONTRACT_V1.md](../MOBO_HANDOFF_CONTRACT_V1.md).

## File thật để nối parser

- [variant1032/handoff.json](examples/outputs/variant-1032/handoff.json):2498ON +2510OFF, null objectives.
- [variant1033/handoff.json](examples/outputs/variant-1033/handoff.json):2499ON +2511OFF, contact và ba canonical objectives của ON.
- [variant1034/handoff.json](examples/outputs/variant-1034/handoff.json):2500ON +2512OFF, suspected false braking.
- [run2499 standalone v2](examples/outputs/run2499-v2/handoff.json):một member, source pointers không có collection prefix.

Mỗi thư mục có diagnostic reports, intake manifest và compatibility.json.
Đây là output thật đã kiểm chứng, không phải synthetic authorized dataset.
Tất cả hiện **NOT_DIRECTLY_CONSUMABLE / dispatch=false**. Dùng chúng để test
import/display/blocking, không dùng làm positive campaign-ready fixture.
Sample URI còn phản ánh vị trí chạy gốc; input copy được ánh xạ bằng hash trong
[INPUT_PROVENANCE.json](examples/INPUT_PROVENANCE.json). Không sửa JSON report để
đổi URI vì làm đổi digest; chạy lại CLI nếu cần output theo đường dẫn máy mới.

## Mapping phải giữ

| Path | Ý nghĩa / điều consumer cần làm |
|---|---|
| /schema_version, /aggregation_version, /digest_profile, /content_digest | Kiểm exact version và digest đúng profile trước khi tin payload |
| /dataset | Snapshot/frozen identity, requested/operational run sets và cohort digest; không thay bằng query latest scenario |
| /members[]/{member_id,run_key,run_id,variant_id,seed,replicate,attempt,mode} | Giữ từng run/seed/repetition. ID là EV với status/source; CONDITIONAL declaration không bằng verified operational binding |
| /members[]/declared_identity | Các ID producer khai báo; giữ để trace, không tự cấp baseline authority |
| /members[]/actual_parameters | Bốn tham số thực theo CODE, không map theo thứ tự UI/engine |
| /members[]/recorded_objectives/{key} | Với JSON input: canonical_value, evaluation_copy, copy_agreement, declared_metadata và version; số đã ghi, kể cả null |
| /members[]/canonical_sample | Sample đã được bind theo contract; null nếu thiếu authorized source. recorded_objectives không tự biến thành field này |
| /members[]/{diagnostic_report_ref,failure_evidence_refs,objective_evidence_refs,json_source} | Evidence/report refs và provenance; không phải GP targets |
| /baseline | Identity/currentness/v1/parameters được bind; không lấy tuple hoặc purpose=BASELINE làm chứng nhận |
| /canonical_aggregation | Replay đúng requested partition khi đủ binding/sample; không là baseline score mặc định |
| /baseline_objectives | Score có gate riêng; UNKNOWN không được thay bằng0 hoặc mean tự tính |
| /eligibility_manifest | Optimization/validation/excluded/unknown phải reconcile toàn requested membership; giữ lý do từng member |
| /parameter_hints | SUSPECTED hoặc ABSTAIN; không cần confirmed root cho hint, nhưng cần đủ mechanism/quality/partition gates |
| /search_ranges | Sourced domains + suggested intersection khi được approved; UNKNOWN không được thay bằng defaults để dispatch |
| /consumer_compatibility, /source_registry, /provenance | Khả năng consumer, source/hash/profile/calibration scope; schema valid không chứng minh runtime support |

EV có value/status/unit/clock_id/frame_id/source_refs/formula_id/assumptions/
bounds/reason_codes. Luôn đọc status cùng value. UNKNOWN/INVALID/NOT_APPLICABLE
không được có numeric value; CONDITIONAL/CONFLICTING cần giữ assumptions/reasons.

## Ba objective và population

Giữ [jerk,impact,stopping] theo tên, unit m/s³,m/s,m. Chỉ candidate trial thật
hoàn tất trên đúng approved optimization cohort mới được tạo3numeric observations
cho MoboTrial. Baseline không phải trial0; failure label/confidence không là target.

CanonicalAggregation gọi AnalysisMetrics.aggregate, không phải mean riêng:
invalid/missing block objective; braked=false thì jerk/stopping NA; impact của
valid no-collision sample đóng góp0 tại aggregate. Physical event impact không
contact vẫn null. Không fallback-zero, skip run xấu, đổi rounding/membership hoặc
mean repetitions để lấp số. Root UNKNOWN không tự loại scalar, nhưng không cấp
eligibility khi thiếu các gate khác.

OPTIMIZATION dùng fitGP/hints/ranges; VALIDATION được sealed cho verification,
không fitGP/acquisition/hints/range selection. OFF chỉ diagnostic control.
Không dùng Map<variant,oneRun> làm mất nhiều seed, không chia repetitions cùng
variant sang hai partition. Dataset thật phải được review; module3 không tự chốt
hai tập từ ba file export sealed=false.

## Những gap hiện hữu phải xử lý ở task consumer riêng

OptimizationRequest chưa có dataset/frozen split; OptimizationService reselect
latest baseline, baseline map collapse seed/rep, aggregator khác canonical,
BaselineStats thiếu3objective, ParameterBounds.defaults bỏ custom search_space,
post-proposal mutation có thể vượt narrowed bounds, Regression chưa nhận sealed
validation. MoboEngine chỉ nhận typed MoboTrial và supplied ParameterBounds.
Đọc [M2_CHANGE_PLAN.md](../M2_CHANGE_PLAN.md) cho exact class/method/order/rollback.
Source inspection có pin profile; khi source owner thay đổi phải tái kiểm contract,
không tắt drift gate để làm report xanh.

Bộ validator hiện là offline conformance, không campaign executor. Không bật cờ
true trong file để “nối được”. Future authorized consumer phải thật sự enforce
identity/currentness/frozen cohort/canonical aggregation/bounds/holdout trước
dispatch; JSON parse thành công chưa chứng minh các việc đó.

## Nếu cần xuất authorized handoff trong bước tích hợp tương lai

CLI đơn giản cố ý không nhận DB/policy authority. Programmatic API đã có:
MoboHandoffBuilder.MemberInput(run,evidenceReport,diagnosticReport,baselineBinding,
canonicalSample,mechanismReview), và Input(members,selection,qualityPolicy,domains,
mechanismSource,sourceArtifacts). Baseline/selection/canonical sample/quality/
mechanism/domain snapshots phải đúng schema/scope/digest/review của M1C; expected
hash phải đến từ reference độc lập. Chữ APPROVED tự khai trong file không xác thực
reviewer hay currentness. Xem M1C_IMPLEMENTATION_REPORT và tests M1CFixture cho
synthetic positive contract; synthetic vẫn không phải production authorization.

Acceptance cho consumer task: reject stale digest/identity, không latest fallback,
giữ full membership/seed/rep, parity canonical null/NA/counts, no validation
leakage, proposed parameters nằm trong approved bounds sau mọi mutation, baseline
không fake score/trial0, missing gate trả blocked reasons. Không cần sửa GP/qEHVI.
