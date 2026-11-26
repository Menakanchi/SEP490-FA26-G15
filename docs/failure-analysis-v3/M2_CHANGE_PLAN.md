# M2 change plan — proposed integration, NOT IMPLEMENTED

> **Cập nhật 26/11/2026 — đối chiếu code sau merge:** Các mô tả source trong
> bảng dưới là ảnh chụp lịch sử, không còn phản ánh toàn bộ `OptimizationService`.
> Luồng **dataset FA V2** hiện đã nhận `dataset_id` và `dataset_digest`, kiểm tra
> lại snapshot và danh tính run, chạy các seed của tập tối ưu, chuyển tập xác minh
> sang regression, đồng thời dùng và kiểm tra khoảng tìm kiếm đã lưu. Xem
> [hợp đồng chỉ số](../vehicsim/analysis-metrics-contract.md) và code hiện hành
> để biết điều kiện chi tiết; không coi test mock là nghiệm thu runtime.
>
> Đây vẫn **chưa phải consumer handoff chẩn đoán FA V3**: nguồn ngữ cảnh được
> duyệt, chính sách chất lượng và miền tham số có thẩm quyền cùng adapter V3 còn
> thiếu. Không suy ra các phê duyệt này từ dataset V2; `dispatch_allowed=false`
> theo [ADR-067](../adr/ADR-067-api-failure-analysis-v3-va-4-bang-fa-json.md)
> vẫn phải được tôn trọng.

M1D chỉ kiểm chứng offline. Tài liệu này không cấp quyền sửa source/DB/API, chạy
campaign hoặc bắt đầu M2. Consumer tại source profile `baf0892d-consumer-contract/1`
vẫn NOT_DIRECTLY_CONSUMABLE. Không thay GP/qEHVI/Pareto, AEB/controller, simulator,
calibration hoặc canonical `adr040-stored-aggregation/1`.

## Boundary đề xuất

Thêm một facade opt-in ngoài lõi MOBO trong nhiệm vụ M2 được giao riêng. Chưa tạo
Java interface/DTO/endpoint nào trong M1D. Contract chức năng:

```text
verifyCurrent(HandoffRef, AuthorizedCurrentSnapshot)
    -> VerifiedFrozenContext | Blocked(reasons)

optimizationBindings(VerifiedFrozenContext)
    -> ordered list<RunBinding>

RunBinding = projectId, scenarioId, variantId=scenario_version_id,
             sourceRunId, seed, replicate, attempt, baselineAebVersionId,
             vehicleId, simulator, dt, artifact/config/report digests + profiles

aggregateCompletedCandidate(ordered bound results)
    -> AnalysisMetrics.aggregate(all requested optimization samples)
       + source identity + canonical counts/statuses + approved constraints

validateProposal(named four parameters, ApprovedDomain, afterAllMutations)
    -> ValidatedParameters | Rejected(reasons)

sealedValidation(VerifiedFrozenContext)
    -> verification-only immutable reference; never GP/hints/ranges/acquisition
```

Engine tiếp tục nhận `List<MoboTrial>` của **candidate trials thực sự đã hoàn
thành**, có ba scalar finite/nonnegative, constraints và cùng canonical cohort.
Không gửi Diagnostic JSON trực tiếp cho engine. Baseline context/score không trở
thành trial0. Không chuyển NA/missing thành0 hoặc bỏ run xấu để fit GP.

## Mapping source chính xác

Line locators/hash của source được xuất trong compatibility reports. Dưới đây
là class/method hiện có và thay đổi **đề xuất**; chưa sửa class nào.

| Existing class/method | Hiện tại đã xác nhận | Thay đổi M2 dự kiến |
|---|---|---|
| [OptimizationController.OptimizationRequest/createOptimization](../../src/main/java/com/vsos/backend/controller/optimization/OptimizationController.java) | Request chỉ scenario_id, base_aeb_version_id, max_trials, n_initial_points, name, search_space, objective_config, simulator_type | Opt-in versioned dataset/handoff/digest reference sau khi API owner chốt. Không nhận client tự khai READY như quyền dispatch; giữ requireEngineer/projectId/limitWrites |
| [AnalysisService.handoff](../../src/main/java/com/vsos/backend/service/analysis/AnalysisService.java) | Read-only kiểm current baseline, exact saved rows/revisions và artifact/config semantic digests | Reuse bên trong authorized current-state verification. Pin datasetID/schema và semantic profile; không thay bằng raw byte SHA hay handoff digest |
| AnalysisService.freeze/sample/item/digest | Strict variant+seed uniqueness, variant-disjoint partitions, trace/flags canonical sample; frozen descriptor còn EGO_SPEED_NOT_RELATIVE | Giữ canonical sample/digest math. New versioned descriptor/sidecar sửa nghĩa per producer profile; archive cũ nguyên trạng. Không bắt Core UNKNOWN thành SAFE để qua legacy freeze |
| [OptimizationService.createAndStartRun](../../src/main/java/com/vsos/backend/service/optimization/OptimizationService.java) | Version lookup/active vehicle/current config; stores search_space/objective_config, không pin frozen cohort | Future opt-in context pin immutable dataset/baseline/vehicle/simulator/dt/hashes/domain/policy versions trong một transaction. Không tự chọn latest fallback nếu pin thiếu/stale |
| OptimizationService.executeOptimization | latestBaseVersionId → variantsOf → getOrCreateBaselineRuns; trials/candidate creation và dispatch | Tách orchestration opt-in dùng exact bindings đã xác minh. Recheck currentness trước dispatch và finalize. Giữ cancellation/quotas/transaction boundaries; không tự chạy thêm baseline cho frozen cohort |
| OptimizationService.getOrCreateBaselineRuns | Query completed ON rows ORDER BY id; `Map<Long,Row>` key scenario_version_id, latest row thắng, thiếu thì chạy thêm | Legacy path giữ nguyên cho campaign cũ. Frozen path dùng ordered RunBinding/composite identity, không gọi latest selector/auto baseline fill. Nhiều seed cùng variant phải còn đủ rows; không mean/best-rep reducer |
| OptimizationService.evaluateCandidateRuns | aeb_activated membership, null-skip, impact null fallback0, zero denominator fallback0, round3; status guard ở orchestration không thay trace/canonical rules | Future canonical path tạo Samples bằng cùng semantics AnalysisService.sample và gọi AnalysisMetrics.aggregate. Missing/incomplete block observation; lưu counts/NA/profile/cohort. Consumer display rounding tách khỏi stored canonical score |
| OptimizationService.computeStats / BaselineStats | BaselineStats chỉ collisionRatePct,falseActivationRatePct | Giữ rates theo explicitly approved constraint basis, thêm typed baseline canonical summary riêng. Không dùng rates làm three-objective vector hoặc baseline trial0 |
| OptimizationService.proposeCandidate | `new MoboEngine(ParameterBounds.defaults(),...)`; stored custom space không được dùng | Future boundary dựng ParameterBounds từ verified intersection và pass vào existing engine. Validate finite/exact4keys/units/domain trước engine và sau mọi mutation |
| OptimizationService.executeOptimization equality branch | parent equality tolerance1e-4; TTC+0.1 round2 capped3.5 | Revalidate sau branch hoặc dùng approved in-domain duplicate strategy do owner chốt. Không mặc định clamp narrowed range để che proposal invalid. Rejection/retry phải bounded và traceable |
| OptimizationService.selectCandidateForVerification | `RegressionService.createTest(..., true,true,null,...)`, không sealed validation IDs | Future opt-in verification truyền immutable validation context và hashes; không select all variants thay holdout. Không tự Accept candidate/Pareto |
| [RegressionService.createTest/latestBaselineRuns](../../src/main/java/com/vsos/backend/service/regression/RegressionService.java) | latest family/baseline map, optional variantIds chỉ chọn variants, không exact run/seed cohort; có thể tạo baseline missing và dispatch | Thêm future explicit sealed-context path sau auth/reviewer/constraints checks. Exact source run/variant/seed/vehicle/sim/dt; không fallback latest, không tạo baseline để sửa cohort |
| [RunService.createOptimizationRuns/createRuns](../../src/main/java/com/vsos/backend/service/simulation/RunService.java) | Candidate seed lấy từ baseline map theo variant; vehicle/simulator pairing guard hữu ích | Future overload nhận immutable binding list/composite keys để nhiều seed không collapse. Preserve candidate/source pairing; không sửa AEB/controller/simulator hoặc historical run |
| [MoboEngine.propose](../../src/main/java/com/vsos/core/mobo/MoboEngine.java) | Typed trials → bounded engine proposal; no diagnostic consumer | **KEEP** algorithm. Supplied approved bounds/validated trials đến từ facade; không thêm JSON/DB/evidence policy vào GP |
| [MoboTrial.valid](../../src/main/java/com/vsos/core/mobo/MoboTrial.java) | Chỉ non-null scalars + constraint flag; không finite/provenance | **KEEP** trong scope thuật toán; M2 boundary phải chặn NaN/Infinity/negative/unknown statuses trước construction/fit |
| [ParameterBounds.defaults/isValid](../../src/main/java/com/vsos/core/mobo/ParameterBounds.java) | Defaults khác catalog source; isValid comparison có tolerance, NaN có thể pass | **KEEP** numeric engine contract; external exact finite/domain check không dựa solely isValid. Fixed dimensions vẫn unsupported cho đến khi owner chốt |
| [AnalysisMetrics.aggregate](../../src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java) | Canonical valid/missing/NA/impact-zero/mean đã chốt | **KEEP** nguyên version/math. Adapter chỉ serialize/guard nonfinite aggregate, không custom mean hoặc objective replacement |

## Thứ tự triển khai đề xuất

1. **Chốt dữ liệu và decisions trước dispatch.** Actual authorized project/version/
   creation lineage/current baseline, frozen partition và revisions, roles/nonhazard
   scope, representative policy, metric producer/build/calibration quality, contact
   authority và catalog/campaign/model domain. OD-10…14 chưa được resolver tự chốt.
2. **Versioned context và read-only verification.** Định nghĩa facade/persistence/API
   opt-in, owners và authorization; pin current source/digests. Nếu cần schema/API
   mới phải giao scope/migration riêng. Không giả current request đã hỗ trợ field mới.
3. **Exact execution binding.** Implement frozen selector và candidate run pairing
   trên ordered source-run identities, giữ nhiều seed/rep metadata. So diff binding
   trước/sau; validation sealed; missing/stale →block, không latest fallback.
4. **Canonical aggregate và constraints.** Shared Sample projection/AnalysisMetrics,
   baseline summary riêng, incomplete/invalid trial status có lý do. Preserve raw
   results và legacy campaign numbers. Chốt legacy versus V3 constraint labels;
   suspected failure không tự thành confirmed FP/FN constraint flag.
5. **Approved bounds boundary.** Load đúng intersection, finite/exact keys và unit
   checks, validate sau engine/parent-equality mutation trước createCandidate.
   Không thay acquisition/surrogate để vượt phạm vi.
6. **Sealed regression path.** Transfer verified holdout reference sau candidate
   selection. Dùng exact validation identities, seed/context/digest checks và quyền
   reviewer hiện có. Holdout không quay lại hints/search/fit qua feedback loop.
7. **Authorized end-to-end acceptance.** Chỉ task M2 được cấp quyền mới chạy fixture
   tích hợp/campaign phù hợp; đạt OA/HF/Core, auth/cancel/stale/rollback gates. Một
   JSON đẹp hoặc numerical parity trên complete fixture không phải readiness.

## Rủi ro và acceptance bắt buộc cho M2

| Risk | Gate/acceptance |
|---|---|
| Silent latest-run substitution/multi-seed loss | Exact ordered bindings equality; thêm unrelated newer baseline không làm đổi selected cohort |
| Validation leakage | Variant/run disjointness; taint tracing trong hints/ranges; executor/GP chỉ nhận optimization bindings; holdout integrity verification riêng |
| Missing/NA/activation/rounding drift | OA-10 actual helper counterexamples vẫn được giữ; future consumer canonical parity trên same Samples, no dropped member, no score0 fallback |
| Stale baseline/config/report sau export | Recheck source state/revision/semantic and byte profiles đúng chỗ; mismatch block trước dispatch/finalization |
| Numeric domain/proposal mutation | Narrowed bounds witness, exact finite checks, post-mutation rejection; không dùng NaN-accepting existing isValid làm full guard |
| False readiness vì synthetic | Fixture scope luôn explicit SYNTHETIC_TEST_ONLY; operational acceptance phải dùng authorized real snapshots/runtime evidence, không promote fixture |
| Partial trial/cancellation/DB write | Giữ transaction/lock/quotas, idempotent source pin và cancellation; incomplete trial không fit GP hoặc đổi baseline |
| Historical reinterpretation | Versioned new path và descriptor; byte/raw/evaluation/dataset/campaign cũ không overwrite hoặc silently recompute |

## Rollback và điểm dừng

Future rollout phải opt-in và có switch dừng **dispatch mới**. Campaign đã pin
canonical/frozen context không được tự chuyển giữa chừng sang latest/legacy path;
giữ snapshot/trial/evidence và block/cancel theo workflow được duyệt. Legacy
campaign/archive vẫn đọc đúng version cũ. Revert integration serving/config khi
cần, không xóa evidence, re-score history, reset baseline hoặc tự Accept.

M1D không triển khai bất kỳ bước M2 nào trong bảng này. Cần nhiệm vụ tích hợp mới
và các operational decisions/export phù hợp trước khi sửa các class được nêu.
