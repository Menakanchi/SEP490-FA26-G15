# 09 — Actual offline end-to-end audit

**PASS cho reproducible conservative Golden18 path; chưa production E2E.**
Đã chạy raw→M1A→physics/geometry→timeline→diagnosis→objective explanation→72Diagnostic
Reports→handoff→offline compatibility. Không CARLA, DB, MOBO optimizer/campaign.
Các negative counterexamples ở register10 vẫn ngăn ký correctness tổng quát.

## Input và identity

Actual input `D:/Downloads/golden18_raw_artifacts.zip`, SHA256:
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`.
Independent Python đối chiếu **978unique manifest members** cả byte hashes và sizes.
Không giả lập raw hoặc dùng legacy failure labels làm ground truth.

18case clusters,72run=54ON+18OFF, giữ đủ R1/R2/R3 từng case. Không gộp repetitions,
không gọi chúng72IID scenarios. Tất cả72 source={} nên không có DB-bound baseline
identity; local run_key giữ riêng với run_id/variant_id/scenario_version_id UNKNOWN.

## Commands đã thực thi

Repo root; target/classes được build bởi focused verify thành công.

```powershell
java -Xmx1536m -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/final-audit/evidence/diagnostics
java -Xmx1536m -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/final-audit/evidence/diagnostics docs/failure-analysis-v3/final-audit/evidence/GOLDEN18-audited-handoff.json .
```

Sau đó gọi actual OfflineConsumerCompatibility bằng Python subprocess với arguments:
new handoff path, byteSHA256 của chính file đó, repo `.`, new compatibility output,
`docs/failure-analysis-v3/samples/m1d/consumer-parity-probe.json`, byteSHA256 probe.
Không gọi optimizer. Exact expected CLI signature xem source
`src/main/java/com/vsos/core/failureanalysis/OfflineConsumerCompatibility.java`.
Lệnh tương đương để tái thực thi (đổi NEW-output thành path chưa tồn tại):

```powershell
$auditHandoff = 'docs/failure-analysis-v3/final-audit/evidence/GOLDEN18-audited-handoff.json'
$auditProbe = 'docs/failure-analysis-v3/samples/m1d/consumer-parity-probe.json'
$auditHandoffHash = (Get-FileHash -LiteralPath $auditHandoff -Algorithm SHA256).Hash.ToLowerInvariant()
$auditProbeHash = (Get-FileHash -LiteralPath $auditProbe -Algorithm SHA256).Hash.ToLowerInvariant()
java -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility $auditHandoff $auditHandoffHash . NEW-output.json $auditProbe $auditProbeHash
```

Output mới: [handoff](evidence/GOLDEN18-audited-handoff.json),
[compatibility](evidence/GOLDEN18-audited-compatibility.json).
Logs [diagnostics](evidence/offline-diagnostic.log), [handoff](evidence/offline-handoff.log).
CLI CREATE_NEW không ghi đè sample lịch sử; khi reproduce hãy chọn output mới.

Verification riêng cũng thực thi:

```powershell
javac -cp 'target/classes;target/test-classes' -d docs/failure-analysis-v3/final-audit/verification/classes docs/failure-analysis-v3/final-audit/verification/FinalAuditProbe.java
java -Xmx1024m -cp 'target/classes;target/test-classes;docs/failure-analysis-v3/final-audit/verification/classes' com.vsos.core.failureanalysis.FinalAuditProbe 'D:/Downloads/golden18_raw_artifacts.zip' docs/failure-analysis-v3/final-audit/evidence/independent-probes-final-v2.json
python docs/failure-analysis-v3/final-audit/verification/verify_independent.py
java -cp target/classes docs/failure-analysis-v3/final-audit/verification/VerifyReportDigests.java
python docs/failure-analysis-v3/final-audit/verification/verify_resource_limit.py
```

Probe output filename và resource ZIP dùng create-new; cần path mới khi rerun.
Java probe có synthetic mutations được khai báo và một actual **kinematic**
Simulator.simulate fixture để kiểm profile, không CARLA/post-fit data. Resource
probe cố ý chạy bounded child JVM32MiB, exitOOM là defect observation (FA-010).

## Independent checks trên toàn72report

Source outputs: [summary](evidence/golden72-summary.json),
[per-run CSV](evidence/golden72-review.csv), [72reports](evidence/diagnostics).
Script đọc original Golden18 oracle từ tài liệu hiện có, không sửa expected để
phù hợp actual. Kiểm mỗi run outcome/contact count/core end/detection/decision/
command và expected candidate types theo case rules: **72/72oracle match**.

| Check | Actual result |
|---|---|
| Recorded matching positive contact |31runs,20ON+11OFF |
| Physical outcome |31COLLISION,41UNKNOWN;0forcedSAFE/NEAR_MISS |
| Legacy vs sensor collision |12disagreements retained;43canonical collision vs31positive event runs |
| Functional candidates |6NO_BRAKING+6FALSE_BRAKING+14INEFFECTIVE_BRAKING; tất cảSUSPECTED |
| OFF control treatment |18OFF;0functional candidates; no shadow command treated as actual intervention |
| Causal/physical certainty |0confirmed roots,0certified physical limits; P05 certificate absent/UNKNOWN |
| Canonical values |72×3=216scalar/null retained;72 M/evaluation copy sets match |
| Jerk |39present,33null |
| Canonical impact |43present,29null; physical impact riêng không zero-fill |
| Stopping |42present,30null;42decompositions replay, maximum difference0 |
| Artifact reference integrity |0unregistered artifact refs in72reports; không proof typed semantic claim IDs |
| Handoff member binding |72report hash/run references matched; every repetition retained |
| Handoff population |72DIAGNOSTIC_ONLY;0opt/0validation eligible;18excludedOFF/54unknownON |
| Baseline/hints/ranges |Identity/v1/scoresUNKNOWN;0suspected hints;4suggested rangesUNKNOWN |
| Consumer |NOT_DIRECTLY_CONSUMABLE,dispatch=false; not FA defect merely for this status |

Chi tiết12case review sâu ở report03; không lấy case title làm truth.026full-body
geometry,011right-censored command,012unattributed pedal,091TTC.6s,125conditional
friction limit và168canonical/contact speed separation đều được giữ đúng.

## Digest và immutability

VerifyReportDigests tái tính digest72reports+handoff+compatibility = **74/74match**,
[digest result](evidence/digest-verification.json). Semantic handoff digest mới:
`ba6ce7d87a5a1bf9f23c8dba8583d7bd6f55db5b3548c1af2cabce37bd47893c`,
trùng sample M1C cũ; đây không phải byteSHA của JSON. Volatile metadata không được
lấy làm lý do đổi identity/cohort/metric digest.

Before snapshot bảo vệ498files gồm production/tests, old FA specs/samples/reports,
prior audits/execplans và ZIP. Final checker so từng byteSHA và tracked git diff;
results tại [protected-after-check.json](evidence/protected-after-check.json),
[git status after](evidence/git-status-after.txt). New audit files chỉ trong
`docs/failure-analysis-v3/final-audit/`; Maven normal outputs ở ignored target.
Existing FA source/docs/test trees đã untracked trước audit, không được nhận là
code mới do audit viết. Không stage/commit/push/merge.

## Điều chưa được chứng minh

Không có authorized operational baseline/currentness/frozen dataset hoặc bound
post-fit calibration/domain/quality package. Digest không thay freshness, hash
không chứng nhận measurement correctness, oracle match không thay hidden-case
validation, numerical tolerance không thay physical uncertainty. Synthetic approved
fixtures chỉ kiểm conditional paths, không operational acceptance.

Pipeline offline tái lập đúng Golden18 conservative scope là kết quả có ích;
FA-001…010 và DEP-01…05 vẫn phải xử lý theo ownership trước ký backend integration.
Không bắt đầu sửa production hoặc M2 sau audit này.
