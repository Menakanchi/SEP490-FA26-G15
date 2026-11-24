# Production JSON input integration — Failure Analysis V3.1

Ngày 2026-11-24. Đã implement bounded JSON intake và public CLI diagnostic/handoff
trong package Failure Analysis hiện có. Standalone2499 và ba collection thật chạy
được trực tiếp; không dùng test bridge, fake ZIP/CSV hoặc một pipeline vật lý mới.
Đây là offline producer-output acceptance; MOBO consumer vẫn
NOT_DIRECTLY_CONSUMABLE và dispatch=false.

## Implementation và ranh giới

`JsonInputAdapter` nhận exact schema versions, kiểm container/document/embedded
hash theo trust scope, giữ run identity/sequence/mode, chuẩn hóa embedded tables
và cung cấp Artifact/Run cho lõi. `FailureAnalysisInput` chỉ dispatch JSON hoặc
RawArtifactAdapter. `JsonDiagnosticSummary` chỉ chiếu identity và output thật ra
CSV. Không thêm backend service/interface framework hoặc dependency mới.

Luồng thực thi:

1. BoundedInput đọc/parse một container, kiểm duplicate keys/finite numeric
   syntax/depth/string/token/value/byte limits theo Batch04.
2. Adapter kiểm membership/identity/copies và reserves normalization/digest
   allocation/work trước khi tạo immutable evidence views.
3. Existing DiagnosticReport gọi EvidenceReport/EvidenceValidator,
   GeometryEngine/StoppingModel, AebTimelineBuilder/PhysicalBrakingAnalyzer,
   ImpactAnalyzer, DiagnosisPolicy, ObjectiveExplainer và HypothesisInvestigator.
4. Existing MoboHandoffBuilder xuất tất cả supplied members; không tự freeze,
   bind baseline hoặc tạo canonical sample/score từ declaration.
5. Existing ConsumerCompatibilityValidator kiểm schema/digest và báo gaps ở
   consumer source thật; không gọi optimizer.

Không sửa GeometryEngine, StoppingModel, AebTimelineBuilder,
PhysicalBrakingAnalyzer, ImpactAnalyzer, DiagnosisPolicy, DiagnosticReport,
HypothesisInvestigator, AnalysisMetrics, producer hoặc consumer. Hai sửa boundary
trong EvidenceValidator/ObjectiveExplainer chỉ làm gate/source locator hoạt động
với original container pointers; không thay công thức/chính sách diagnosis.

## Source thay đổi

Prefix `src/main/java/com/vsos/core/failureanalysis/`:

| File | Thay đổi |
|---|---|
| JsonInputAdapter.java — mới | Bounded read-only standalone/collection intake; independent member accounting, table views, document/embedded digests, declaration provenance |
| FailureAnalysisInput.java — mới | Shared format dispatch; unique tuple-based JSON OFF comparator lookup; no physics |
| JsonDiagnosticSummary.java — mới | CSV projection, no scalar aggregation |
| Evidence.java | Optional Artifact provenance + backward-compatible constructor/serialization; translate refs into original JSON table row/column indices |
| EvidenceValidator.java | Embedded copy/state/profile quality checks; collision-event issue lookup compares translated locator; local data access remains view-relative |
| EvidenceReport.java | Additive declared identity/source/objective metadata; JSON mode declaration; copy/profile conflicts fail quality without changing scalar |
| MetricProvenanceResolver.java | Read declared embedded git/core hashes when available; external source verification and runtime equivalence remain UNKNOWN |
| ObjectiveExplainer.java | One locator-prefix comparison uses translated result ref, preserving invalid-clock gate for collection JSON |
| MoboHandoffBuilder.java | JSON-only recorded objectives/declared IDs/source context and repetition/attempt; authorization/aggregation/partition/hint gates unchanged |
| OfflineDiagnosticAnalysis.java | Public JSON/ZIP/directory dispatch, manifest/CSV, partial population disclosure, CREATE_NEW outputs |
| OfflineFailureAnalysis.java | Same JSON dispatch for M1A evidence-only CLI |
| OfflineMoboHandoff.java | JSON dispatch; incomplete original population rejected before building a smaller handoff |

Tests added: `JsonInputAdapterTest.java` and `JsonInputIntegrationTest.java` under
the matching test package. Existing tests remain byte-for-byte unchanged.
[production diff](evidence/production-source.diff), [test diff](evidence/new-tests.diff),
[diff statistics](evidence/diff-stat.json) and
[preservation proof](evidence/preservation-summary.json) cover the existing
untracked FA tree; a plain git diff cannot represent those pre-existing files.
Of1502 protected pre-existing paths,1493 remain byte-identical; only the nine
listed existing FA Java files changed. Three production classes and two test
classes were added. All old tests, eight specs, raw inputs, historical audit/
reports and producer/consumer sources remain unchanged.

## Identity, provenance and partial inputs

Container SHA, optional independently expected SHA, declared external-file hashes
and self-declared embedded consistency hashes are separate. A matching embedded
digest does not authenticate original CSV/JAR bytes. Raw files remain untouched.
All original row values, scalar/null and producer null reasons are retained.
Clock/quality/coordinate declarations and masks are visible without granting
calibration, synchronization or causal authority.

Declared project4/AEB33 and BASELINE/v1.0 labels do not establish baseline v1.
Verified binding fields remain UNKNOWN; declared IDs are separate CONDITIONAL
claims. No fake lifecycle/environment/DB rows are created. Intake COMPLETE means
delivered manifest membership only; it does not imply sealed selection, inclusion
of excluded unfinished runs, physical evidence completeness or MOBO readiness.

Invalid/missing/duplicate collection members have explicit manifest records.
Independent readable members may produce diagnostics, but OfflineMoboHandoff
rejects INCOMPLETE_INPUT_POPULATION before aggregation. An invalid optional table
is quarantined locally; a valid scalar/contact from independent evidence can
remain usable. Fatal resource rejection stops the session.

Bounded parsing is not a streaming whole-report model or exact heap/CPU/RSS
guarantee. Defaults retain Batch04's finite heap-aware limits, including member
8MiB, max256 runs, depth48, max128 columns, max20000 rows per embedded table and
max60000 records per run, subject to the existing policy's heap envelope.
Normalization copies/digest serialization receive conservative extra charges.
No catch-OutOfMemoryError fallback or implicit limit increase is introduced.

## Commands and results

Use JDK21, from repository root, after compilation:

```powershell
java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis D:/Downloads/result_run2499_full_dataset.json NEW_DIAGNOSTICS
java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff D:/Downloads/result_run2499_full_dataset.json NEW_DIAGNOSTICS NEW_HANDOFF.json F:/CodeVipChu/SEP490-FA26-G15
```

Substitute a collection JSON or original Golden ZIP/directory for INPUT. Exact
optional run_key selection remains supported by the diagnostic CLI. JSON output
directories/files must be new; original paths and input overlap are rejected.
No database is needed. To validate a handoff offline, use
OfflineConsumerCompatibility with its independently computed expected byte SHA;
this checks conformance/source gaps, not actual MOBO execution.

Final verification and exact commands are in [TEST_RESULTS.md](TEST_RESULTS.md),
[test-results.json](evidence/test-results.json), and
[e2e-results.json](evidence/e2e-results.json). Actual result details:
[run2499](RUN2499_E2E_RESULT.md), [six collection runs](COLLECTION_E2E_RESULT.md).
Eight actual-input analyses represent six distinct run IDs because2499 was
provided in three export contexts; no cross-file population/score was invented.

Golden18 remains72/72 oracle,54ON/18OFF,31COLLISION/41UNKNOWN,12 disagreements,
216 canonical scalar/null values unchanged,42 stopping replays,0 confirmed roots.
All72 report input/report/content digests and the historical handoff content digest
remain identical. Independent physics32/32 and Golden digest checks74/74 pass.

## Source/contracts read and discrepancies

The eight V3.1 specs, M1A–M1D implementation reports, final-audit01–10,
FIX_BATCH_01–04 reports, functional test plan and prior run2499/v2/collection
validation artifacts provide the design/audit trail. Source behavior takes
precedence over stale design-stage wording. AGENTS/CLAUDE, metric contract and
ADR-040/055 establish canonical/phase boundaries. Source paths/hashes and before
copies are in evidence/protected-before.json and evidence/before-source/.

Attached ADR-065 at Downloads and the updated collection-folder ADR are supplied
producer contracts. No matching producer implementation was found in this
checkout outside Failure Analysis. Neither an Accepted label nor reported
producer tests establishes deployment/source equivalence. The collections have
BUILT_AT_EXPORT provenance and missing git revision; no equivalent old git value
is filled in. Legacy freeze metadata EGO_SPEED_NOT_RELATIVE and current consumer
selection/aggregation/bounds gaps remain documented and unchanged.

See [INPUT_CONTRACT_MAPPING.md](INPUT_CONTRACT_MAPPING.md) for exact paths and
[REMAINING_DEPENDENCIES.md](REMAINING_DEPENDENCIES.md) for unresolved authorities,
consumer work and owners. No API/DB/frontend/MOBO integration, CARLA execution,
baseline/parameter update, historical rewrite, commit/push/merge or branch change
is part of this implementation.
