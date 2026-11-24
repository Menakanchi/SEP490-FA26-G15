# M1A — Evidence/Identity + Canonical Objective Reader

Ngày: 2026-11-23. Repository HEAD: `baf0892d456b5dcf4bfc0358b7124bf6a8b6fe5a`.
Phạm vi hoàn tất: Java foundation **M1A**, chạy offline, read-only đối với input.
Không triển khai M1B/M1C/M1D/M2, API, database integration hoặc optimizer integration.

## Kết quả kiểm chứng

| Kiểm tra | Tổng | Pass | Fail/error | Skip | Kết quả |
|---|---:|---:|---:|---:|---|
| Final focused Maven verify | 134 | 132 | 0 | 2 | BUILD SUCCESS; compile, test, JAR và Spring Boot repackage thành công |
| M1AEvidenceTest trong final verify | 33 | 33 | 0 | 0 | Unit tests dùng fixture tạm được ghi rõ là synthetic |
| Golden18IntegrationTest trong final verify | 82 | 82 | 0 | 0 | 72 dynamic run tests + 10 corpus/contract tests, dùng ZIP thật |
| M1AAuthorizedFixtureTest trong final verify | 2 | 0 | 0 | 2 | Thiếu authorized HF-02/HF-03 integration fixtures |
| Existing isolation/metrics/architecture/docs tests trong final verify | 17 | 17 | 0 | 0 | CoreIsolationTest, AnalysisMetricsTest, ArchitectureRulesTest, RepoDocsTest |
| Full clean verify trước final locator tests | 859 | 854 | 2 | 3 | BUILD FAILURE tại hai OptimizationServiceTest có sẵn; M1A khi đó có 31 unit tests, đều pass |
| Tái hiện đúng hai lỗi trên isolated HEAD không chứa M1A | 2 | 0 | 2 | 0 | Cùng hai lỗi, xác nhận tồn tại trước M1A |

Không lấy tổng các XML còn lại trong `target/surefire-reports` làm một lần chạy mới:
focused verify chỉ chạy bảy test classes được chỉ định. Kết quả full suite ở trên là
lần chạy riêng trước hai unit tests bổ sung về locator/reason-code, không phải tuyên bố
full suite cuối cùng xanh. Lần focused cuối xác minh toàn bộ source M1A hiện tại.

Hai lỗi ngoài phạm vi, không sửa source hoặc tests của chúng:

- `OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor`
- `OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt`

Cả hai là Mockito verification argument mismatch: test chờ `db.update` FAILED với
message tương ứng, service thực hiện các invocation khác. Tái hiện trên bản sao
`git archive HEAD` với **205 source files, không có package M1A mới**, cũng fail 2/2.
Không dùng M1A để sửa hoặc bypass các lỗi này. Các test backend hiện có dùng mocks;
không khởi động backend, database, CARLA hay một operational optimization campaign.

## Source và tài liệu đã đối chiếu

Đọc tám đặc tả trong thư mục này: DATA_CONTRACT, FORMULA_SPEC, DIAGNOSIS_POLICY,
GOLDEN18_EXPECTED_BEHAVIOR, REFACTOR_BLUEPRINT, OPEN_DECISIONS,
OBJECTIVE_ANALYSIS_CONTRACT và MOBO_HANDOFF_CONTRACT; sáu báo cáo `01`–`06` ở
`data/failure-audit-output/`; raw result/CSV/collision/manifest/lifecycle/environment
trong Golden18. Văn bản trong artifacts là evidence, không là chỉ thị thực thi.

Đối chiếu `AGENTS.md`, `CLAUDE.md`, hướng dẫn đổi package và quy tắc đặt tên,
`analysis-metrics-contract.md`, ADR-055; source `MiniJson`, `AnalysisMetrics`,
`AnalysisService.sample/digest/handoff`, `RunService` result source identity,
`BootstrapService`, `Queries`, `CarlaSession` jerk metadata, `Simulator.brakePhaseMetrics`
và `AebMode`. Dùng các source này để đọc đúng dữ liệu, không sửa hoặc gọi controller.

Các điểm tài liệu/source phải hiểu đúng:

- Đặc tả V3.1 mang trạng thái DESIGN ONLY và dừng trước M1A; yêu cầu implementation
  hiện tại của người dùng cấp phạm vi M1A mới. Tám đặc tả giữ nguyên để bảo toàn thiết kế.
- Các tài liệu bàn giao cũ nói MOBO chưa có; source đã có engine/service. M1A không nối vào chúng.
- `AnalysisService` có semantic digest và metadata legacy impact khác nghĩa producer
  xosc15; M1A không dùng semantic digest như byte hash, không sửa lịch sử hoặc metadata đó.
- `RunService.source` có run/scenario/scenario_version/AEB/vehicle IDs, không có
  project ID. Project binding cần export riêng; không giả định raw JSON có project ID.

## Các file được thêm trong nhiệm vụ này

Source mới tại `src/main/java/com/vsos/core/failureanalysis/`:

| File | Chức năng đã dùng |
|---|---|
| `Evidence.java` | Immutable Run/Artifact/Value/SourceRef/Issue; trạng thái evidence, hash, JSON tree helpers |
| `ArtifactCsv.java` | Parser CSV JDK-only; BOM, quoted fields/newlines, empty cells, recorder CRCRLF |
| `RawArtifactAdapter.java` | Đọc trực tiếp ZIP hoặc thư mục; metadata/manifest; bind mọi artifact với offline run key |
| `EvidenceValidator.java` | Schema, integrity, identity, số/timestamp/frame, duplicate content, recorder clock comparison |
| `CanonicalObjectiveReader.java` | Đọc đúng ba producer scalars và evaluation copies; giữ null, invalid và disagreements |
| `MetricProvenanceResolver.java` | Declared producer/profile/signal/filter/window/revision/hash; metadata conflicts; lineage theo từng objective |
| `BaselineBindingResolver.java` | Xác minh export được caller cung cấp/pin hash, actual params và source/run/version lineage; không DB |
| `EvidenceReport.java` | Partial M1A envelope, source registry, quality/reason codes, separate sensor impact, deterministic digest |
| `OfflineFailureAnalysis.java` | Runner offline tạo sidecar mới; CREATE_NEW, từ chối output chồng lên raw input |

Tests mới tại `src/test/java/com/vsos/core/failureanalysis/`:

- `M1AEvidenceTest.java`: 33 unit tests.
- `Golden18IntegrationTest.java`: 82 integration assertions/test cases trên corpus thật.
- `M1AAuthorizedFixtureTest.java`: hai integration blockers được ghi SKIPPED bằng JUnit assumptions.

Tài liệu/artifact mới:

- File báo cáo này.
- [Sample FA-G1-007-R1](samples/m1a/FA-G1-007-R1.json).
- [Sample FA-G4-091-R1](samples/m1a/FA-G4-091-R1.json).
- [Exec plan đã hoàn tất](../exec-plans/completed/2026-11-23-failure-analysis-m1a.md), theo quy trình root `AGENTS.md`.

Tám đặc tả tồn tại từ nhiệm vụ thiết kế trước đã untracked khi bắt đầu. Nhiệm vụ
này không viết lại chúng. Không sửa bất kỳ tracked file nào trong repository.

## Reader/report contract đã implement

`RawArtifactAdapter(Path)` nhận ZIP hoặc root directory của cùng layout, trả từng
`Evidence.Run` qua `runDirectories()/read(directory)`. Không extract, không ghi raw.
Giữ riêng repetition và attempt trong key; OFF giữ hậu tố OFF. Metadata run ID
`FA-…-R1` là artifact key, không cast thành DB ID. Identity trong manifest và
run JSONL được đối chiếu với member path; seed được so với result/bundle/manifest.
Manifest binding được kiểm cho mỗi artifact có identity claim, không chỉ result.

Đọc result, frames CSV, ground-truth CSV, collisions, summary, lifecycle, core JAR
hash, case bundle, environment và hai metadata manifests. Không thực thi JAR raw.
Byte SHA256 và size so với manifest; nguồn FAILED/parse-invalid được cách ly,
nguồn độc lập hợp lệ vẫn đọc được. Manifest hash là kiểm tra integrity tương đối
với manifest được cung cấp, không là chứng chỉ authenticity từ một authority bên ngoài.
Manifest không tự chứa hash của chính nó nên registry ghi UNVERIFIED cho manifest.
Không tuyên bố kiểm mọi member ngoài các artifact mà M1A sử dụng.

| Dữ liệu | Raw locator | M1A output/ý nghĩa |
|---|---|---|
| Ba objectives | `/outcome/metrics/{exact_key}` | `/report/objectives/{exact_key}/canonical_value`, giữ numeric value/null |
| Evaluation copy | `/evaluation/aeb_result/{exact_key}` | `evaluation_copy`, `copy_agreement`; không hòa giải hoặc overwrite |
| Canonical collision | `/outcome/metrics/collision` | `/report/collision_evidence/canonical_collision`, Boolean hoặc UNKNOWN/INVALID |
| Sensor events | `sensors/collisions.json` array | `sensor_event_count` dùng formula `m1a-array-cardinality/1`, không thay collision flag |
| Physical event scalar | Matching event `relative_speed_before_ms` | Giữ riêng, cần actor/ego preimpact binding và recorder validity; không contact evidence → null |
| TTC | `/outcome/params/ttc_threshold` | `/input/parameters/ttc_threshold`, không default 1.5 |
| Delay/build-up | `brake_activation_delay`, `brake_buildup_rate` | Normalized `activation_delay`, `buildup_rate`; chỉ config |
| Max deceleration | `/outcome/params/max_deceleration` | Normalized cùng tên; không là measured achieved decel |
| Source revision | Environment/JSONL `git_commit` | Hai named claims giữ riêng nếu conflict; runtime binary equivalence UNKNOWN |
| Jerk provenance | `/outcome/case/carla/jerk_filtered` | Declared signal/filter/window giữ nguyên; objective filter có text description, original object ở lineage |
| DB variant | `/source/scenario_version_id` + verified export | `variant_id` chỉ khi baseline binding đủ; Golden18 UNKNOWN |

`UNKNOWN`, `INVALID`, `NOT_APPLICABLE`, `CONFLICTING` khác nhau. Mỗi EvidenceValue
null có reason code. Missing không thành false/0. Giá trị invalid không xuất
NaN/Infinity. M thiếu/invalid không bị lấp bằng evaluation; evaluation copy hợp lệ
vẫn được giữ trong named view. Disagreement không lấy trung bình/chọn số đẹp hơn.

SourceRef dùng JSON pointer cho JSON; CSV logical record (header=record 1) và
column; JSONL line và JSON pointer trong line. Registry chứa byte hash và URI member.
Core và recorder có clock IDs riêng; chưa có origin binding thì offset UNKNOWN.
Same recorder frame khác timestamp báo CLOCK_MISMATCH; không áp dụng offset suy ra
10 ms cho tất cả. CSV sensor-only tail được giữ, không gọi nó là complete physics coverage.

Envelope có schema `vehicsim.failure-analysis/v1`, objective schema
`vehicsim.objective-analysis/v1`, stage `M1A`, status `ANALYZED_PARTIAL`, analyzer
`failure-analysis-m1a/1.0.0`. Formula/policy versions là phiên bản đặc tả, không là
tuyên bố đã chạy các công thức/chẩn đoán M1B. Canonical aggregation compatibility
ghi đúng `AnalysisMetrics.VERSION = adr040-stored-aggregation/1`; reader không gọi aggregate.

`content_digest` dùng profile mới `fa-report-sorted-json/1`: loại ba field
`analysis_id`, `created_at_utc`, `content_digest`; sort object keys bằng TreeMap;
normalize finite Number qua BigDecimal/stripTrailingZeros; giữ array order;
serialize bằng MiniJson (UTF-8, Unicode nguyên dạng, separators comma-space/colon-space).
Digest này **không** là AnalysisService dataset semantic digest, raw byte hash hoặc
HF-03 freshness proof. UUID và creation timestamp thay đổi không đổi content digest.

Report giữ scalar readable, physical interpretation và MOBO eligibility riêng.
Physical outcome/feasibility/diagnosis và stopping decomposition UNKNOWN với
reason DEFERRED_M1B; không có failure/root-cause label được suy ra từ legacy chain.
Stopping total giữ đúng producer, không gọi nó là measured-only. Jerk giữ đúng
declared ego_a/filter/T_AEB window; không recompute từ IMU/GT. Profile-to-source
mapping của impact/stopping được đánh dấu CONDITIONAL vì binary/source equivalence
chưa xác minh. OFF giữ shadow decision, actual AEB consumption NOT_APPLICABLE,
MOBO eligibility EXCLUDED; không coi shadow command là phanh thật.

## Baseline binding và phần chưa có fixture

Library nhận optional `Artifact` từ `BaselineBindingResolver.readSnapshot(path,
expectedSha256)`. Caller phải cung cấp authorized export và expected hash độc lập;
hash tự đọc từ cùng file không chứng minh quyền/authority. Runner Golden18 không
ngầm tìm hoặc tin một baseline export bên trong ZIP.

Offline adapter input mới có schema `vehicsim.baseline-binding-snapshot/v1`;
đây không phải JSON/API hiện hữu được suy đoán. Các field cần có:

- `project_id`, `version_id`, `version_project_id`, integer `version_no`, `label`,
  `status`, RFC3339 `exported_at`.
- `run.run_id/project_id/scenario_id/scenario_version_id/aeb_version_id/result_sha256`;
  khớp raw result source và byte hash, không dùng local artifact key làm run ID.
- `parameters` với đủ bốn uppercase codes; so với actual raw lower-case params,
  không điền source seed/default.
- Optional `current_baseline_version_id`: currentness chỉ có nghĩa **as of export**.
- Khi muốn confirmed v1: `creation_lineage` có project/version IDs, version_no=1,
  label=v1.0, source=MANUAL, valid created_at; phải khớp version/run/export.

Thiếu binding → UNKNOWN; bất đồng → CONFLICTING; đủ run/version evidence →
RUN_VERSION_BOUND; current snapshot khớp BASELINE → PROJECT_BASELINE_CONFIRMED.
Version 1 thiếu creation lineage vẫn UNKNOWN cho confirmed_as_v1. Không tạo score
kể cả binding đã verified; không xác nhận freshness với DB hiện tại trong M1A.

| Acceptance ID | Phạm vi đã kiểm | Trạng thái còn thiếu |
|---|---|---|
| OA-01 | Toàn 72 run, đủ ba scalar/null, M↔evaluation, 18 R1 tuples và presence counts | PASS trên artifact thật |
| HF-01 | Toàn Golden18 source={}, DB IDs/current/v1/score UNKNOWN | PASS trên artifact thật |
| HF-02 | Unit positive/negative contract: source IDs, hash, params, project/version, v1 lineage, malformed timestamp, unpinned export | Unit PASS; authorized DB export integration SKIPPED/BLOCKED |
| HF-03 | Byte hash isolation, immutable raw, named digest profile, deterministic report | Authorized frozen-v2 freshness/semantic-digest integration SKIPPED/BLOCKED; không gọi phần này PASS |

Team còn phải cung cấp authorized project/version/run/creation-lineage export
và frozen dataset v2 + current baseline/run revisions/config/telemetry semantic
digest fixture nếu muốn kiểm HF-02/HF-03 đầy đủ. Không cần dựng DB hoặc tạo binding
giả để M1A offline đọc được corpus. Đây là giới hạn integration, không là lý do bỏ
qua unit/integration tests có dữ liệu thật.

## Golden18 và sample từ input thật

ZIP: `D:/Downloads/golden18_raw_artifacts.zip`, SHA256
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339`.

- 18 case, 72 distinct run keys: 54 ON + 18 OFF; ba repetition cùng case không gộp.
- ON present J/I/D = 39/29/42; OFF = 0/14/0. M và evaluation khớp 72/72 cho cả ba.
- Canonical collision 43, run có recorder event 31; 12 disagreements được giữ.
- 31,423 core frames; 31,528 recorder rows; 62,768 ground-truth rows được đọc nguyên.
- 091 có TTC=0.6 ở cả bốn run; 68 run còn lại giữ 1.5. Không sửa params.
- Sample 007-R1: canonical impact 13.9, sensor preimpact relative speed 13.935;
  jerk/stopping null; baseline/v1 UNKNOWN.
- Sample 091-R1: J=22.736, I=10.022, D=9.608, TTC=0.6; recorder [] nên
  physical event impact null, không 0, không sửa canonical I. Baseline/v1 UNKNOWN.

Integration kiểm ZIP SHA256 và modification time trước/sau. Sau chạy tests/runner,
880 tracked files và sáu audit files được so SHA256 với snapshot trước nhiệm vụ:
không file nào thay đổi. Tám đặc tả không bị chỉnh. Raw JAR/lifecycle giữ riêng;
không dùng JAR vừa build để xác nhận runtime của Golden18.

## Commands đã chạy

Từ root repository, PowerShell/JDK 21. Logs là build artifacts trong `target/`.

```powershell
.\mvnw.cmd -B -DskipTests compile
.\mvnw.cmd -B '-Dtest=M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' test
.\mvnw.cmd -B clean verify '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' *> target-m1a-verify.log
.\mvnw.cmd -B '-Dtest=M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest' '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify *> target/m1a-focused-verify-final.log
```

Initial focused run: 116 tests, 1 assertion failure ở thông báo output-overlap,
2 skipped; assertion kỳ vọng một từ cụ thể trong message mặc dù overlap guard đã
hoạt động. Sửa assertion kiểm đúng rejection; các focused runs sau đều pass.
Full clean log đã chuyển thành `target/m1a-full-clean-verify.log` sau khi Maven kết thúc.

Tái hiện lỗi có sẵn, hoàn toàn trong ignored build directory:

```powershell
git archive --format=zip --output=target/m1a-head.zip HEAD
Expand-Archive -LiteralPath target/m1a-head.zip -DestinationPath target/m1a-head-check
# workdir: target/m1a-head-check
.\mvnw.cmd -B '-Dtest=OptimizationServiceTest#executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor+executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt' test *> baseline-verification.log
```

Tạo hai sidecars từ raw thật:

```powershell
java -cp target/classes com.vsos.core.failureanalysis.OfflineFailureAnalysis D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/samples/m1a FA-G1-007-R1
java -cp target/classes com.vsos.core.failureanalysis.OfflineFailureAnalysis D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/samples/m1a FA-G4-091-R1
git diff --exit-code
git status --short
```

Samples được pretty-print JSON sau khi runner tạo để đọc/review; không thay giá trị.
Hai samples đã được parse lại bằng MiniJson, kiểm `content_digest`, rồi replay với
source M1A cuối và raw ZIP thật: cả hai digest trùng nhau. Lệnh kiểm tra build artifact:

```powershell
java --class-path target/classes target/CheckM1ASamples.java D:/Downloads/golden18_raw_artifacts.zip docs/failure-analysis-v3/samples/m1a
```

Runner dùng CREATE_NEW: chạy lại cùng output file sẽ từ chối overwrite. Khi cần
replay, dùng thư mục output mới. Corpus thiếu ở máy khác thì JUnit báo SKIPPED với
reason và cách cung cấp `-Dgolden18.zip`; không có synthetic Golden18 fallback.

## Git status khi bàn giao

```text
?? docs/exec-plans/completed/2026-11-23-failure-analysis-m1a.md
?? docs/failure-analysis-v3/
?? src/main/java/com/vsos/core/failureanalysis/
?? src/test/java/com/vsos/core/failureanalysis/
```

Không commit/push/merge. Dừng sau M1A; không tự chuyển sang triển khai giai đoạn tiếp theo.
