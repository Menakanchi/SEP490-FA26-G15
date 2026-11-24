# M1D — Offline MOBO consumer compatibility validation

Đã implement validator offline và kiểm thử consumer thật ở phạm vi helper/signature.
**Chưa có consumer thực thi frozen cohort, canonical aggregation và approved bounds
theo contract.** Golden18 và synthetic hợp lệ đều `NOT_DIRECTLY_CONSUMABLE`,
`dispatch_allowed=false`, `operational_ready=false`. Input sai digest/identity/schema
hoặc source không còn đúng revision được kiểm tra trả `BLOCKED`.

Không implement M2, không sửa consumer, metric producer, AEB, simulator, calibration,
DB/API/frontend hoặc kết quả lịch sử. Không chạy CARLA/campaign/migration, commit,
push hoặc merge. M1A/M1B/M1C được tái sử dụng nguyên trạng.

## Nền tảng đã đọc và baseline

Đã đọc đủ tám đặc tả V3.1 trong thư mục này, ba implementation reports M1A/B/C,
sáu audit ở `data/failure-audit-output/`, source Failure Analysis M1A/B/C và các
consumer được yêu cầu: AnalysisMetrics, AnalysisService, OptimizationController,
OptimizationService, MoboEngine, MoboTrial, ParameterBounds, RegressionService.
Đã đối chiếu thêm RunService/Row và contract parameter catalog/freeze/handoff.

Hướng dẫn repo: AGENTS/CLAUDE, package naming/update, metric ADR-040/044/055 và kế
hoạch 20/10 được đối chiếu code. Những câu “design only/chưa MOBO” trong tài liệu
cũ không được dùng để phủ nhận source hiện có hoặc thay thế phạm vi M1D được giao.
Đặc tả/audit là nguồn bằng chứng, không phải quyền tự triển khai M2.

HEAD khi bắt đầu: `baf0892d456b5dcf4bfc0358b7124bf6a8b6fe5a`.
Failure Analysis source/test/docs của các phase trước đã **untracked** từ đầu.
Snapshot `target/m1d-before.json` giữ SHA256 của 553 file có trước M1D.
Baseline full verify: 1,182 tests = 1,177 pass / 2 fail / 0 error / 3 skip.

## Source và boundary mới

| File/class mới | Trách nhiệm thực tế |
|---|---|
| [ConsumerCompatibilityValidator](../../src/main/java/com/vsos/core/failureanalysis/ConsumerCompatibilityValidator.java) | Schema/digest/identity/cohort/partition, canonical replay, baseline, freshness export, isolation/taint, hint gates, bounds assessment, mapping và blockers |
| [ConsumerSourceInspection](../../src/main/java/com/vsos/core/failureanalysis/ConsumerSourceInspection.java) | Đọc/hash tám consumer files; profile revision cố định, source refs có line/anchor; drift/missing → UNKNOWN, không đoán capability đã được sửa |
| [OfflineConsumerCompatibility](../../src/main/java/com/vsos/core/failureanalysis/OfflineConsumerCompatibility.java) | CLI đọc hash-pinned JSON/source, ghi sidecar CREATE_NEW; từ chối overwrite input/output có sẵn |

Production chỉ dùng JDK và core hiện có; không import backend/Spring/repository,
không gọi optimizer hoặc DB. Không tạo facade/DTO/API M2 thực thi được.

`ConsumerCompatibilityValidator.Input` nhận:

- `handoff`: Artifact JSON M1C cùng SHA256 byte/integrity.
- `source`: profile source consumer đọc từ repository.
- `parityProbe` tùy chọn: observation synthetic do test gọi helper Java thật, có
  source hashes, loaded class hashes và canonical version.
- `freshness` tùy chọn: read-only export `vehicsim.consumer-freshness-snapshot/v1`;
  có timestamp, project/baseline/selection/cohort và per-run report/artifact/config
  digests. Chỉ chứng minh **as-of supplied export**, không live DB hoặc invented TTL.
- `referenceInput` tùy chọn: nguyên bộ Input M1C. Replay builder không sửa đổi để
  kiểm gates/binding/policy/domains/hints và so stable content digest. Đây là
  conformance replay, không tạo optimization proposal hoặc nới policy.

Thiếu probe/reference bundle/freshness → UNKNOWN với reason codes, không tự xác
minh từ registry/hash hoặc biến synthetic export thành bằng chứng production.
Các JSON schema freshness/probe là evidence phụ của validator offline, không phải
API mới của backend hoặc consumer hiện hành.

Output schema `vehicsim.failure-analysis-consumer-compatibility/v1`, build
`failure-analysis-m1d/1.0.0`, digest profile
`fa-consumer-compatibility-sorted-json/1`. Stable digest bỏ compatibility UUID/time;
input byte SHA, `fa-handoff-sorted-json/1`, `fa-report-sorted-json/1` và semantic
digest AnalysisService là các profile khác nhau, không hoán đổi.

Report có field-by-field mapping tới consumer source, exact descriptive bindings,
canonical replay/probe, baseline/freshness, validation isolation, bounds, findings,
operational blockers và đề xuất M2. `canonical_metric_parity.status=DIVERGENT`
cho source hiện tại; trạng thái replay của handoff được ghi riêng. Schema VERIFIED
không có nghĩa consumer READY. Source profile/hash không chứng nhận binary deploy.

## Kiểm chứng consumer hiện hữu

Profile `baf0892d-consumer-contract/1` pin SHA256 của tám file đã đọc. Mọi kết luận
source trong JSON có registry và locator. Source thay đổi hoặc không tìm thấy sẽ
không tự được coi là compatible.

| Khoảng cách được xác nhận | Evidence/source hiện tại | Kết luận M1D |
|---|---|---|
| Không consume dataset/frozen partitions | OptimizationRequest chỉ có tám fields scenario/base version/trial counts/name/search_space/objective_config/simulator_type | DATASET_CONSUMPTION_MISSING |
| Latest-family/latest-baseline substitution | executeOptimization/getOrCreateBaselineRuns | Frozen identity chưa enforce |
| Nhiều seed/replicate mất identity | baselineMap key scenario_version_id | MULTI_SEED_VARIANT_MAP_LOSS; validator giữ mọi binding |
| Objective math khác canonical | evaluateCandidateRuns | Activation membership, drop null, fallback0, rounding3 khác AnalysisMetrics |
| BaselineStats thiếu canonical vector | Record chỉ collisionRatePct,falseActivationRatePct | Không tự tạo baseline objective scores/trial0 |
| Engine nhận typed scalar trials | MoboEngine.propose(List<MoboTrial>, ...), MoboTrial record | Diagnostic JSON không phải engine input |
| Custom bounds bị bỏ qua | proposeCandidate dựng ParameterBounds.defaults() | CUSTOM_BOUNDS_IGNORED |
| Mutation thoát narrowed bounds | Equality branch TTC+0.1, round2, cap3.5 | Static counterexample; cần check sau mọi mutation |
| Regression không consume sealed validation | selectCandidateForVerification/createTest/latestBaselineRuns | Không giả holdout đã được enforce |
| Numeric boundary chưa đủ | MoboTrial.valid, ParameterBounds.isValid | Actual tests chứng minh NaN có thể pass; cần future external finite guard |
| Frozen metric descriptor conflict | AnalysisService.freeze ghi EGO_SPEED_NOT_RELATIVE | Giữ archive; descriptor phải version theo producer profile ở M2 |

Test utility [M1DConsumerProbe](../../src/test/java/com/vsos/core/failureanalysis/M1DConsumerProbe.java)
gọi **actual private evaluateCandidateRuns** bằng reflection trên service không có
dependencies, chỉ helper thuần. Dùng **actual AnalysisService.sample** và unchanged
AnalysisMetrics/CanonicalAggregation làm đối chiếu. Không gọi executeOptimization,
MoboEngine, runner hoặc repository. Hash class được load cũng được ghi; observation
không phải runtime attestation/deployed binary equivalence.

12 cases chạy thật: MATCH_COMPLETE, ACTIVATION_VS_BRAKED, MISSING_JERK,
NULL_COLLISION_IMPACT, ALL_NO_BRAKE, BRAKED_UNKNOWN, ROUNDING, TRACE_MISSING,
ROW_FLAGS_UNKNOWN, FAILED_STATUS_HELPER_ONLY, NEGATIVE_SCALAR, EMPTY_HELPER_ONLY.
Complete fixture khớp scalar 3/2/15, được ghi
`SCALAR_MATCH_NOT_GENERAL_CONTRACT_PARITY`; 11 cases còn lại divergent.
FAILED_STATUS/EMPTY là **helper-only counterexamples**; orchestration hiện có
COMPLETED guard, không tuyên bố toàn pipeline chấp nhận failed/empty runs.

## Identity, isolation, hints và bounds

Projection giữ ordered run_key/run_id/variant_id/seed/replicate/attempt/baseline
và digests; chỉ là descriptive binding, chưa là executable adapter. DB IDs là
decimal strings; duplicate variant+seed, duplicate DB run, member/run-key mismatch,
variant overlap giữa OPTIMIZATION/VALIDATION hoặc run list bị thay đều bị phát hiện.
Nhiều seed khác nhau cùng optimization variant giữ nguyên và báo legacy map loss.
Không chọn best repetition, không đổi cohort, không drop missing member để lấy mean.

Validation được inspect để xác minh integrity/review, không fit GP/Pareto/acquisition.
Hints/ranges chỉ được dùng optimization/external approved provenance; direct và
transitive reference sang validation bị reject. Taint traversal có cycle guard.
Handoff thiếu source bundle không được claim toàn bộ lineage đã chứng minh.

Positive synthetic có baseline binding và mechanism review/gates hợp lệ tạo
**SUSPECTED** BRAKE_BUILDUP_RATE hint qua unchanged ParameterHintBuilder. Không đòi
confirmed root cause để có hint. Negative fixture thiếu mechanism review trả
**ABSTAIN**, không gán tham số; không dùng validation để bù evidence. Confirmed root
cause không phải một hint status. Numeric proposal/probability trong hint bị reject.
Golden18 không được nới gate và vẫn không có hints/numeric suggested ranges.

Bounds được kiểm exact bốn keys, units, finite lower<upper và nằm trong tất cả
sourced domains. Code defaults chỉ là context, không là approval. Counterexample
synthetic: parent TTC1.5 nằm trong [.5,1.55], nhánh +.1 hiện tại ra1.6. Đây là chứng
minh rủi ro ở source, **không phải proposal hay lần chạy optimizer**. Validator không
claim custom bounds đang enforced; chưa có future executor chạy chúng.

## Golden18 và sample reports

Nguồn thật: `D:/Downloads/golden18_raw_artifacts.zip`, SHA256
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`;
[M1C handoff thật](samples/m1c/GOLDEN18_OFFLINE-handoff.json) được đọc nguyên trạng.
Giữ đủ 18 cases, 72 lượt, 54 ON/18 OFF và từng repetition. All members giữ
DIAGNOSTIC_ONLY, run/variant DB IDs null; FA-G4-091 TTC0.6 giữ nguyên. Không biến
sensor contact thành canonical collision/impact; không tính lại canonical scores
để bù baseline thiếu. Baseline identity/score/freshness operational vẫn UNKNOWN.

| Output mới | Kết quả |
|---|---|
| [GOLDEN18-compatibility.json](samples/m1d/GOLDEN18-compatibility.json) | Schema/digest verified, source gaps và probe divergent; NOT_DIRECTLY_CONSUMABLE; thiếu operational binding/freshness/reference bundle được ghi UNKNOWN |
| [SYNTHETIC_POSITIVE-compatibility.json](samples/m1d/SYNTHETIC_POSITIVE-compatibility.json) | Baseline/cohort/canonical replay/source bundle hợp lệ trong fixture, 1 SUSPECTED hint; vẫn synthetic, NOT_DIRECTLY_CONSUMABLE, không dispatch |
| [SYNTHETIC_NEGATIVE-compatibility.json](samples/m1d/SYNTHETIC_NEGATIVE-compatibility.json) | Negative evidence path → ABSTAIN, không fake confirmed cause; consumer vẫn không compatible |
| [consumer-parity-probe.json](samples/m1d/consumer-parity-probe.json) | 12 actual Java helper observations, explicitly synthetic/no campaign/DB/engine |

Synthetic IDs, approvals, scores và timestamps chỉ thuộc fixture. Không promote
chúng thành production baseline hay approved parameter search. Sai digest, leaked
partition và ignored/narrowed bounds được kiểm riêng trong unit tests; không sửa
fixture Golden18 để làm chúng pass readiness.

## Acceptance và kết quả test

| Gate | Kết quả M1D |
|---|---|
| OA-10 | PASS: actual helper versus canonical trên complete và 11 divergence cases; null/NA không thành score0 ở canonical |
| HF-09 | PASS: actual request/trial signatures, latest selector/multi-seed map, baseline scores, exact identity và NOT_DIRECTLY_CONSUMABLE |
| HF-10 | PASS trong offline scope: actual defaults/custom-bound gap, static equality mutation witness, invalid/out-of-domain intervals; chưa thực thi approved bounds qua consumer |
| Validation sealed | PASS: variant/run leakage, direct/transitive hint/range references rejected; GP/optimizer không chạy |
| Digest/freshness | PASS: byte/semantic distinction, rehashed content tampering, stale baseline/report, registry collision, missing evidence/probe/source drift |
| Hint paths | PASS: positive SUSPECTED, negative ABSTAIN, unknown Golden18 và confirmed-root/numeric-proposal rejection |
| Golden18 | PASS: 72 real members; không skip/fabricate integration fixture; byte inputs bất biến |
| HF-02/HF-03 authorized integrations | SKIPPED/BLOCKED như M1A: chưa có authorized project/version/creation-lineage và frozen/current-state fixture; synthetic không thay chúng |

| Suite | Total | Pass | Fail | Error | Skip | Build |
|---|---:|---:|---:|---:|---:|---|
| Full baseline trước sửa | 1182 | 1177 | 2 | 0 | 3 | FAILURE, có trước M1D |
| M1D trong final focused/full | 135 | 135 | 0 | 0 | 0 | Tests PASS |
| Focused M1A–M1D + metric/core/architecture/docs | 590 | 588 | 0 | 0 | 2 | SUCCESS, package/repackage hoàn tất |
| Full final | 1317 | 1312 | 2 | 0 | 3 | FAILURE, cùng hai lỗi baseline |

M1D: ConsumerCompatibilityValidatorTest37, M1DConsumerCharacterizationTest19,
M1DGolden18IntegrationTest79. M1A/B/C không có regression mới. Hai full failures:

- OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor
- OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt

Đây là Mockito expectation failures ngoài phạm vi, đã hiện ở baseline; không sửa
OptimizationService hoặc test cũ để làm xanh. Full verify dừng ở test nên không
claim full build thành công. Skip thứ ba full là KinematicParityFullTest đã disabled.

Commands thực chạy từ repo root (PowerShell, Java21):

```powershell
.\mvnw.cmd -B verify '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' *> target/m1d-baseline-verify.log
.\mvnw.cmd -B '-Dtest=ConsumerCompatibilityValidatorTest,M1DConsumerCharacterizationTest,M1DGolden18IntegrationTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' test *> target/m1d-tests-final.log
.\mvnw.cmd -B '-Dtest=ConsumerCompatibilityValidatorTest,M1DConsumerCharacterizationTest,M1DGolden18IntegrationTest,CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest,PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> target/m1d-focused-verify-final.log
.\mvnw.cmd -B '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> target/m1d-full-verify-final.log
```

Standalone M1D command ở trên chạy khi có133 tests; sau thêm envelope/null checks,
final focused/full thực chạy đủ135. Không cộng số từ các lần chạy để tạo pass count.
Offline Golden18 integration nằm trong Surefire, không phải external DB/CARLA test.

CLI read-only: `java -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility
handoff.json expected-byte-sha256 repository-root NEW-output.json
[probe.json expected-probe-byte-sha256]`. Test đã chạy CLI thật và kiểm refuses overwrite.
CLI không nhận source bundle/freshness; các proof tương ứng giữ UNKNOWN. Java Input
API mới hỗ trợ chúng khi caller có export offline, không tự đọc DB.

Sau khi copy samples, chạy `java -cp target/classes target/CheckM1DReports.java`:
parse/recompute cả3 compatibility digests, kiểm **738 source references** đều có
registry entry và scope/no-dispatch/hint assertions: PASS. Evidence checker chỉ ở
target; kết quả `target/m1d-sample-check.json`. Probe JSON giữ nguyên byte SHA mà
report trích dẫn. Không serialize NaN để giả bằng chứng numeric hợp lệ.

## File diff, bất biến và git status

Thêm3 production classes,3 test classes+1 probe utility, report này, M2 plan,
4 sample JSON và completed exec plan. Không sửa/xóa553 file bảo vệ từ trước,
bao gồm toàn bộ source/test cũ,8spec,3implementation reports,6audit,rawZIP và
72report M1B. Chi tiết hash/diff: `target/m1d-protected-check.json`,
`target/m1d-source.diff`; generated test logs/reports nằm dưới target.
Unified patch có đúng7 Java files mới, **818 added lines**. Tám specs/audits và
các báo cáo phase trước không được ghi đè để mô tả phase mới.

`git diff --exit-code` trả0 vì toàn bộ cây Failure Analysis đã untracked từ đầu;
điều đó không có nghĩa không có code mới. Không stage/commit để đổi trạng thái này.

```text
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1a.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1b.md
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1c.md
?? docs/exec-plans/completed/2026-11-24-failure-analysis-m1d.md
?? docs/failure-analysis-v3/
?? src/main/java/com/vsos/core/failureanalysis/
?? src/test/java/com/vsos/core/failureanalysis/
```

## Operational blockers và điểm dừng

M1D offline scope đã hoàn thành; operational use vẫn BLOCKED do consumer gaps,
không được dùng JSON pass làm dispatch approval. Nhóm còn cần:

- Actual authorized project/scenario/variant/run/AEB-version exports, creation
  lineage/current baseline và freshness/revision/digest proof; Golden18 source={}
  không xác minh baseline v1.
- Reviewed exact unique/disjoint frozen partition, case roles, replicate selection
  và holdout access policy; không tự chọn best rep hoặc legacy SAFE/root labels.
- Approved per-objective quality/calibration/contact authority và metric/build/
  simulator/worker/runner provenance. Canonical contract vẫn giữ nguyên.
- Live catalog/approved campaign/model domains, custom-bound enforcement và
  duplicate/fixed-dimension/post-mutation policy (OD-10…14); không invent ranges.
- Scope/owner/authorization và acceptance cho opt-in M2 adapter/API/storage,
  constraints/verification và rollback. Xem [M2_CHANGE_PLAN.md](M2_CHANGE_PLAN.md)
  để có class/method mapping, thứ tự thực hiện, risks và rollback.

Dừng sau M1D. M2 chỉ là đề xuất trong tài liệu, chưa triển khai.
