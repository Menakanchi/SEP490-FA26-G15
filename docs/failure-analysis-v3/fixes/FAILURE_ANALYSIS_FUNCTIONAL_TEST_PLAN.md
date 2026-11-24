# Failure Analysis functional test campaign — plan, chưa chạy campaign

24/11/2026; chuẩn bị sau Batch04. Chỉ offline analysis trên dữ liệu đã ghi. Không
chạy AEB/CARLA/MOBO, không DB/API integration, không tạo baseline score hoặc thay
parameters. Kết quả Golden18 và synthetic resource fixtures không chứng nhận
post-fit calibration, classification accuracy hay production readiness.

## 1. Input manifest cần chốt trước khi chạy

| Input | Kiểm tra / hành vi khi thiếu |
|---|---|
| Immutable ZIP/directory và independently expected SHA256 | Chọn đúng corpus; không extract ZIP; source registry giữ member SHA256; malformed/over-budget archive BLOCKED |
| Per-run identity | run_key, case_key, ON/OFF, seed, replicate/attempt; DB/project/scenario/variant/AEB version chỉ khi có authorized binding; thiếu để UNKNOWN |
| Bốn actual AEB parameters | TTC threshold, activation delay, max deceleration, buildup rate từ result; không thay bằng defaults hay auto-adjust |
| Result format / producer | `vehicsim.result/v1`, exact simulator/engine/core hash/source revision, metric profile/dt/signal/filter/window; unsupported/missing profile không suy từ vintage lân cận |
| Evidence streams | result.json, frames.csv, ground_truth.csv, collisions.json, summary/lifecycle/bundle/environment/manifests; expected hash/size và required/optional role |
| Calibration | Actual approved validation package, hashes, applicable field/domain, residual/limitations và clock/speed/vehicle/profile scope; thiếu UNKNOWN |
| Requirements/absence context | Approved duty/caution/mitigation policy; reviewer authority pins độc lập; coverage/actor/health/drain/clearance/threshold evidence; không APPROVED tự cấp quyền |
| Baseline/comparison | Actual binding/version/currentness export và fully matched ON/OFF context; không lấy Golden18/config seed làm v1; thiếu score/binding UNKNOWN |
| Draft campaign resource profile | Exact InputResourcePolicy fields, JVM heap, process timeout, expected maximum members/runs/rows/depth; team approval cho dataset size thực tế |

Giữ raw và historical evaluations read-only. Declared simulator/source phải đúng
với dữ liệu post-fit, không lấy calibration hiện tại từ DB để thay run-local context.
Legacy failure labels, case design intent và workbook confidence không là oracle.

## 2. Functional matrix

| Nhóm | Test / assertion | Không được suy ra |
|---|---|---|
| Intake/identity | Exact artifact/run/seed/replicate binding, SHA/CRC/size/schema; no grouping reps; missing/invalid sources có refs/reasons | Missing=false/0; unverified baseline=v1 |
| Resource safety | Reuse Batch04 adversarial/boundary cases; per-member/actual inflation/cumulative/count/row/JSON/retained/work limits; fail closed at configured boundary | Controlled rejection là actual simulation failure |
| Geometry/TTC | G01–G04 units/frames, corners/full body, occupancy/PET, continuous declared horizon; gaps UNKNOWN | TTC1D hoặc nominal overlap là contact truth |
| Braking physics | P01–P05, delay/ramp/stop-during-buildup, calibration scope, meaningful opportunity; screen vs certificate | Configured deceleration=achieved; negative margin=confirmed PHYSICAL_LIMIT |
| Timeline | D/Q/B vs emitted/applied/consumed vs physical onset; clock validity; pending/right-censored; writer attribution | OFF shadow là actual AEB intervention; pedal là writer proof |
| Outcome/candidates | Positive bound contact; authority disagreement; approved absence/threshold gates; FALSE/NO/INEFFECTIVE candidates + requirement gates | Every collision is AEB failure; no-contact=SAFE/false braking |
| Three objectives | Preserve M/evaluation values/nulls and `adr040-stored-aggregation/1`; jerk exact lineage; impact event vs canonical; stopping trace/tail | Sensor replacement, zero-fill, new aggregation hoặc shorter stop=better |
| Dossiers | Candidate/hypothesis references resolve; source mechanism scope; support/counterevidence, alternatives, falsification plans NOT_EXECUTED | Numeric confidence, source possibility=causal fact, forced root cause |
| Context | Public analyze→serialized report; positive approved gates; wrong run/project/version/hash/clock/stale review rejected claim-locally | Approved unrelated claim unlocks all diagnoses |
| Missing/corrupt | Required-source invalidity blocks dependent claim; optional failure retains independent contact/scalars; no truncated physical calculation | Invalid stream means no collision or no braking |
| Report/provenance | Registered artifact refs, formula/policy/profile versions, deterministic semantic digest, immutable sources | Digest proves physical truth or current authority |
| MOBO contract only | Handoff identity/partition/canonical/eligibility/ref/digest checks; compatibility report and dispatch=false | Direct optimizer consumption, GP fit, campaign or DB writes |

Expected behavior phải được reviewer ghi trước theo evidence scope. Những nhãn
SUPPORTED, IN_DOMAIN, SAFE/NEAR_MISS cần actual authorized packages; nếu chưa có,
expected UNKNOWN/SUSPECTED/INCONCLUSIVE là kết quả đúng của test, không phải test fail.

## 3. Cách bắt đầu bằng runner hiện có

Chạy focused tests và resource probe trước trên repository checkout đã pin. Xem
[Batch04 report](FIX_BATCH_04_REPORT.md) và exact
[commands](batch-04-evidence/COMMANDS.md). Dùng **NEW output directory** cho mỗi
attempt; không ghi đè accepted evidence. Ví dụ offline default-context path:

```powershell
java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis <INPUT.zip-or-directory> <NEW-diagnostics-directory>
java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff <INPUT.zip-or-directory> <diagnostics-directory> <NEW-handoff.json> .
$handoffHash = (Get-FileHash -LiteralPath <handoff.json> -Algorithm SHA256).Hash.ToLowerInvariant()
java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility <handoff.json> $handoffHash . <NEW-compatibility.json>
```

Các CLIs hiện dùng finite defaults; **không có flag `--context` hoặc `--limits`**.
Trusted local dataset cần profile khác dùng Java API
`new RawArtifactAdapter(path, inputResourcePolicy)` và shared
`BoundedInput(inputResourcePolicy)` cho snapshot/report readers. Mọi limit phải
explicit, positive và qua heap-envelope guards; không dùng zero/negative làm unlimited.

Authorized context path dùng public
`new DiagnosticReport().analyze(run, optionalOff, analysisContext)`; load external
JSON bằng bounded HandoffSnapshots reader và authority pins từ independent review
policy. Batch03 tests là mẫu acceptance wiring, không phải authority operational.
Đây là specification cho harness được giao riêng; batch này không viết runner lớn.

Chạy tuần tự hoặc trong isolated process với declared heap/timeout và admission
budget. `-Xmx2g` là profile thử Golden18 trong Batch04, không approved quota cho
mọi dataset. Allocation charge không phải exact JVM/RSS measurement. Nếu process
bị kill/timeout/OOM hoặc intake resource error: dataset attempt BLOCKED, không
export aggregate/score từ subset. Các reports của runs đã xử lý trước đó chỉ là
partial sidecars, không chứng minh whole-dataset completion.

## 4. Runner/output specification cho task campaign sau

Không implement trong Batch04. Future harness cần:

1. Seal input manifest và resource/context profiles; verify bytes, member counts,
   identity; giữ expected run set, partitions và artifact roles.
2. Chạy offline analysis, ghi per-run reports bằng CREATE_NEW; ghi structured
   input failures ngay khi blocked và stop dependent processing.
3. Verify every expected run/report, source refs và digests trước whole-dataset
   summary; không tự drop lỗi/missing runs để làm đẹp kết quả.
4. Xuất CSV/JSON summaries dưới đây; reviewers adjudicate evidence, không bootstrap
   ground truth từ chính evaluator/report.

| Output | Fields tối thiểu |
|---|---|
| Per-run Diagnostic Report | Existing V3.1 envelope và three objectives; context, outcome/timeline/physics/candidates/dossiers/quality/inconclusive/source/digest |
| case/run CSV | case/run key, ON/OFF, variant/seed/replicate/attempt, actual 4 parameters, simulator/core/source hashes, raw/report digest, physical outcome/status, candidate IDs/types/statuses, root certainty |
| objective CSV | run/objective key, stored value/null/status/unit, canonical agreement/profile/signal/filter/window, trace/tail when available, quality/calibration/comparison/inconclusive reasons |
| dataset JSON summary | Requested/read/analyzed/blocked/missing counts; ON/OFF/case/replicate counts; partition/eligibility; outcome/candidate/dossier distributions with explicit denominators |
| invalid/blocked artifact summary | Run/member/ref, category/reason, configured limit/observed bounded counter when available, integrity/parse status, processing stopped vs claim-local quarantine |
| unknown/missing summary | Per-claim reason counts and refs; evidence capability denominators; no UNKNOWN→negative conversion |
| contract-only handoff | Failure refs, canonical provenance, identity/partition/baseline/eligibility and compatibility blockers; no dispatch |

Categories cần giữ riêng: RESOURCE_LIMIT_EXCEEDED, INVALID_ARTIFACT,
INTEGRITY_MISMATCH, PARSE_ERROR, INCOMPLETE_INPUT,
VALID_BUT_INSUFFICIENT_EVIDENCE. Existing SOURCE_MISSING maps to incomplete input;
HASH_MISMATCH/SIZE_MISMATCH map to integrity; valid trace with missing authority is
insufficient evidence. Không đổi legacy issue codes hoặc gắn parser error thành
AEB failure.

## 5. Acceptance và cách báo kết quả

| Trục | Ý nghĩa |
|---|---|
| Functional test PASS/FAIL | Actual output đúng/sai assertion đã chốt, kể cả expected rejection/UNKNOWN |
| Physical outcome | COLLISION / SAFE / NEAR_MISS / UNKNOWN theo contact/coverage/policy |
| Functional candidate | SUSPECTED / SUPPORTED / absent; OFF NOT_APPLICABLE |
| Evidence quality | Usable facts, invalid/incomplete/conflicting sources và claim-local capabilities |
| Operational completeness | Authorized identities/policies/calibration/trace/cohort/currentness đầy đủ hay còn BLOCKED |

Một test có thể PASS với physical COLLISION + NO_BRAKING SUSPECTED + root UNKNOWN.
Controlled resource rejection là PASS của hardening assertion nhưng BLOCKED của
dataset attempt. Full build có known failures phải công khai; không gọi toàn bộ
suite green. Omitted/timeout/disabled checks báo SKIPPED/BLOCKED, không PASS.

Không tính classification accuracy/precision/recall khi không có independent,
approved ground-truth labels. Golden18 là **18 case clusters**, 54 ON repetitions
và 18 OFF, không 72 IID scenarios. Giữ per-run canonical aggregation hiện hành;
không tự mean theo case hoặc lấy best repetition. ON/OFF observations không tự
thành controlled causal experiment. Root UNKNOWN không tự loại scalar readable,
nhưng không tự cấp eligibility cho MOBO.

Điều kiện dừng/review: new FA regression; resource/process failure; source/hash/
identity conflict; unsupported metric profile; missing expected run; policy gate
bị bypass; hoặc summary dùng incomplete subset làm score. External owners chốt
post-fit resource/coverage/calibration/requirement policies trước operational
acceptance. Task riêng mới được phép triển khai harness/campaign/backend/MOBO.
