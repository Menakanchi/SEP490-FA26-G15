# 07 — MOBO output contract audit

**PARTIAL về producer contract; BLOCKED về operational population và external
consumption.** NOT_DIRECTLY_CONSUMABLE không tự nó là defect Failure Analysis.
Audit không đánh giá GP/qEHVI, chạy optimizer hoặc yêu cầu FA implement consumer.

## Ba mức assurance phải tách riêng

1. **Contract implemented:** MoboHandoffBuilder thực sự dựng members, baseline,
   canonical aggregation, diagnostics references, hints/ranges, eligibility và
   provenance. ConsumerCompatibilityValidator kiểm byte/semantic digest, cohort,
   metric replay, partition và source-pinned consumer boundary. Tuy nhiên schema
   validation chưa đầy đủ theo field paths (FA-005), hint claim graph sai loại
   reference trong positive fixture (FA-006). Không được gọi toàn bộ schema đúng.
2. **Populated trên dữ liệu thật:** Golden18 cung cấp72 local run keys, seed,
   actual per-run parameters, canonical samples và diagnostic references; không
   cung cấp authorized DB/frozen baseline binding. UNKNOWN là output đúng, không
   phải operational population đầy đủ.
3. **Ready để external consume:** chưa. Ngoài defects FA, thiếu data/calibration
   acceptance package và consumer adapter thật (DEP-01…04). M1D luôn chặn dispatch;
   ngay synthetic positive cũng không được tuyên bố production-ready.

## Tám nhóm output đồng đội cần

Evidence thật: [new handoff](evidence/GOLDEN18-audited-handoff.json),
[new compatibility report](evidence/GOLDEN18-audited-compatibility.json),
[72-run review](evidence/golden72-review.csv). Paths dưới đây là JSON paths thực tế,
không suy ra từ proposed JSON của design.

| Requirement | Actual mapping | Golden18 thực tế | Assessment / owner |
|---|---|---|---|
| Dataset variant+seed+role+run | `/members/*/{run_key,run_id,variant_id,seed,case_roles,partition}`, `/dataset/*run_ids`, cohort digest |72members giữ từng repetition; DB IDs UNKNOWN; DIAGNOSTIC_ONLY, UNFROZEN |PASS honesty; BLOCKED operational / DATA_PROVIDER |
| Baseline v1 và4parameters | `/baseline/{identity_status,version_id,version_no,confirmed_as_v1,current,parameter_values}`; actual parameters riêng trong members |Baseline UNKNOWN; không gán tuple seed làm verified v1. FA-G4-091 giữ TTC.6s |PASS honesty; BLOCKED population / DATA_PROVIDER |
| Ba baseline scores | `/canonical_aggregation/{optimization,validation}`, `/baseline_objectives/*` |UNKNOWN vì chưa có bound cohort/baseline; không lấy aggregate72unselected làm score |PASS abstention; BLOCKED / DATA_PROVIDER |
| Failure diagnostics/evidence | `/failure_evidence`, member report references/digests, `/source_registry` |72reports được bound,26suspected candidates,0confirmed roots |PARTIAL do validity defects ở upstream và FA-006 / FAILURE_ANALYSIS |
| Suspected parameter hints | `/parameter_hints` |Empty do unselected/unbound corpus. Positive synthetic có SUSPECTED; insufficient mechanism→ABSTAIN |Gating conservative đúng; FA-006 sai hypothesis refs / FAILURE_ANALYSIS |
| Suggested sourced ranges | `/search_ranges/{PARAMETER}/suggested_range` và component domains |Cả4UNKNOWN; catalog source seed khác live catalog; không tự tạo campaign range |PASS conservative / data/catalog/campaign authorities còn thiếu |
| Quality/unknown/excluded | `/eligibility_manifest`, source-specific EV reason codes |72requested=0optimization+0validation+18excludedOFF+54unknownON |PASS reconciliation; không readiness proof |
| Versions/hash/reproducibility | `/core_contract`, `/objective_contract`, `/aggregation_version`, `/provenance`, `/source_registry`, `/digest_profile`, `/content_digest` |Actual byte hashes và semantic digest; missing lineage giữ UNKNOWN |PASS observed integrity, chưa proof freshness/calibration/current DB |

Exact object field details có trong handoff; không cast case name thành variant_id,
không đồng nhất scenario_version_id và variant_id. Seed/repetition identity không
được collapse hoặc coi72observations là72independent variants.

## Canonical aggregation và scalar boundary

CanonicalAggregation sử dụng `adr040-stored-aggregation/1`, theo source
AnalysisMetrics (source được bảo vệ, không sửa). Giữ canonical stored scalar/null,
braked membership, denominator/null semantics và rounding; physical contact impact
không thay canonical impact. Legacy aggregate zero-for-no-collision không được
lan sang diagnostic physical event impact. Handoff Golden18 không có eligible
bound aggregate, do đó không xuất score giả.

M1C synthetic OA-08 có J/I/D=3/2/15 là **fixture math**, không project baseline.
M1DConsumerProbe gọi actual AnalysisService.sample và private pure aggregation
helper của OptimizationService qua reflection, không execute optimization.
Twelve characterization cases gồm một parity và11divergences; đây là scalar
boundary evidence, không chứng minh consumer thực thi frozen cohort/bounds.
Consumer source/probe được pin hashes, drift phải UNKNOWN. Existing probe JSON là
test observation được kiểm hash, không runtime deployment attestation.

## Parameter hints và ranges

ParameterHintBuilder chỉ đọc optimization partition. Validation bị loại trước
đọc mechanism evidence; SearchRangeResolver chỉ giao các sourced/approved domains,
không dùng validation evidence để thu hẹp. M1C/M1D tests kiểm leakage, altered
digests và positive/negative paths. Golden18 không được nới gates để tạo hints.

Positive fixture cấp explicit mechanism review, report digest và approved gates;
hint SUSPECTED không cần confirmed root cause. Tuy nhiên fixture tự cung cấp
`parameter_mechanism_evidence`; actual DiagnosticReport chưa tự emit verified
mechanism reviews. Vì vậy positive test chứng minh builder/gates hoạt động khi có
input hợp lệ, không chứng minh autonomous causal analysis trên CARLA.

FA-006 reproduce: BRAKE_BUILDUP_RATE hint có related_candidate_ids và hypothesis_refs
cùng `synthetic-ineffective`, trong khi report_hypothesis_ids rỗng. Artifact refs
resolve không đủ để kiểm typed claim references. Xem finding register để sửa mà
không ép tạo root cause.

Enum `NO_PARAMETER_HINT` được user M1C request cho phép rõ bên cạnh SUSPECTED/ABSTAIN
(attached M1C task §4). Nó rộng hơn design §6 cũ, **không ghi thành implementation
defect trái user authorization**. Trước handover cần freeze versioned wire schema
đã được hai bên đồng ý; không dùng proposed design snippets thay schema thực tế.

Source defaults không phải suggested search range:

| Parameter | Source catalog seed | Engine defaults | Unit |
|---|---|---|---|
| TTC_THRESHOLD |.5…4 |.5…3.5 |s |
| BRAKE_ACTIVATION_DELAY |0….5 |.05….45 |s |
| MAX_DECELERATION |3…10 |5…10 |m/s² |
| BRAKE_BUILDUP_RATE |5…20 |5…20 |m/s³ |

Live catalog/campaign/model authority chưa có thì suggested_range UNKNOWN; không
lấy μg như một approved bound cho configured maximum. Đơn vị/code mapping tránh
nhầm thứ tự UI và engine. Không candidate proposal, acquisition hoặc probability.

## Current consumer boundary — dependency, không audit optimizer

Compatibility report có field-by-field mapping và source refs. Request hiện
không nhận dataset/frozen partitions, service reselects latest baseline, variant map
không giữ multi-seed/repetition, aggregation khác canonical, baseline stats thiếu
3scores, typed MoboTrial nhận scalars thay diagnostic JSON, custom bounds chưa
được enforce ở actual dispatch/mutation, regression chưa consume sealed validation.
Đây là DEP-03 với owner MOBO_CONSUMER; FA phát hiện/chặn là hành vi đúng.

FA-005 vẫn là lỗi riêng của **validator FA**: nested seed EV mất status/source_refs
nhưng schema/integrity/identity đều VERIFIED sau recompute digest. Overall vẫn
NOT_DIRECTLY_CONSUMABLE và dispatch=false; audit không claim đã có unsafe dispatch.

## Acceptance trước ký output

- Sửa FA-005/006 bằng path/type schema và report-relative typed claim resolution;
  rerun malformed wrapper, positive hint và stale digest/partition tests.
- Giữ validation sealed trong producer; consumer execution proof cần task riêng.
- DATA_PROVIDER cấp authorized baseline/frozen identity; CALIBRATION cấp bound
  acceptance package. Synthetic positive không thay hai loại evidence này.
- Recheck byte hash, semantic digest, exact member/order/seed/report binding và
  canonical replay trên dataset operational thật, vẫn không gọi optimizer ở audit.

Full finding metadata/lines/repros/expected/impact/fix/owner:
[FA-005/006, DEP-01…04](10_DEFECTS_AND_REMAINING_WORK.md).
