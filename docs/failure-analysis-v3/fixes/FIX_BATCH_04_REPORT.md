# Fix Batch04 — FA-010 bounded input ingestion

24/11/2026. **IMPLEMENTED_AND_VERIFIED trong offline bounded-input profile. Không
production-ready.** Không chạy campaign mới, CARLA, AEB, MOBO, DB/API/frontend hoặc
migration; không stage/commit/push/merge. Eight contracts, original oracle và toàn
bộ historical reports được giữ nguyên.

## 1. Root cause và scope

RawArtifactAdapter trước batch dùng unbounded readAllBytes, full JSON/CSV/JSONL
allocation, repeated global-member decompression và không có cumulative/retained/
complexity budgets. ZipFile cũng allocate central directory trước khi loop kiểm
member count. CSV giữ intermediate whole-record lists; MiniJson recursive parser
không có depth/token/duplicate-key guard. Snapshot/report/source readers khác còn
đường unbounded file reads. Path traversal check không giải quyết resource safety.

Đã đọc nguồn/callers và audit 05/08/10, original resource script/evidence, Batch01–03
reports; đối chiếu tám V3.1 specs đã dùng trong các batch trước và missing/invalid/
claim-local invariants. Các stale DESIGN ONLY statements trong immutable contracts
không phải yêu cầu dừng task implementation hiện tại. AGENTS/CLAUDE, metric contract
và ADR-055 tiếp tục áp dụng. Plan nằm trong fixes tree theo scope hẹp của user:
[IMPLEMENTATION_PLAN](batch-04-evidence/IMPLEMENTATION_PLAN.md).

Không sửa math G/P/T/I/Q, diagnosis policy, canonical producer/aggregation, context
acceptance hay dossier logic. DiagnosticReport/EvidenceReport/AnalysisContext và
validator đã được kiểm đường gọi nhưng **không sửa**; input budgets nằm trước
parsing/allocation. Existing offline runners tự nhận bounded adapter defaults;
chỉ OfflineMoboHandoff cần sửa direct report-file read sang shared bounded session.

## 2. Sizing thực tế và default policy

[golden-sizing.json](batch-04-evidence/golden-sizing.json),
[sizing script](batch-04-evidence/size_golden.py).

| Golden18 measurement | Giá trị |
|---|---:|
| ZIP bytes | 13,877,855 |
| Total uncompressed | 31,054,156 |
| Maximum member / CSV | 249,345 |
| Maximum JSON / JSONL | 149,472 / 61,488 bytes |
| ZIP entries / runs | 980 / 72 |
| Manifest-pinned members | 978; manifest và README là hai entries khác |
| Maximum CSV rows / JSONL records | 1250 / 72 |
| Maximum core frames | 625 |
| Maximum measured JSON depth / string / nodes | 7 / 200 chars / 9705 |
| Maximum CSV columns | 24 |
| Compression ratio median / p95 / max | 1.884 / 10.886 / 14.036 |

Sizing lấy corpus thật, không khẳng định đây là campaign maximum hoặc quota được
phê duyệt. max physical text line149469 thuộc JSON; CSV/JSONL row budget khác JSON
document budget. JSON depth ở script dùng root depth0; parser budget đếm containers.

`InputResourcePolicy` là immutable record, explicit constructor override, không
zero/negative/unlimited defaults. Mặc định thử nghiệm:

| Budget | Default và enforce point |
|---|---|
| Compressed archive | 64 MiB trước ZIP directory/index allocation |
| Member/document bytes | min(8 MiB, JVM max heap /64); declared và actual streamed bytes |
| Cumulative uncompressed | 256 MiB declared toàn archive và actual session reads riêng |
| Compression ratio | 100:1; declared và actual read bytes / compressed-member bytes |
| Members / runs | min(4096,heap/8192) /256; directory visits cũng bounded, không chỉ regular files |
| Records / combined run records | 20000 mỗi JSON array/CSV/JSONL stream; 60000 combined core frames + run stream records |
| CSV/JSONL row chars / CSV columns | 65536 UTF-16 chars; quoted multiline CSV record cũng bounded /128 |
| JSON depth/string/token/values | 48 containers /262144 raw string chars /256 token chars /200000 values |
| Retained allocation charge | min(1 GiB, heap/2), cumulative và không hoàn trả trong session |
| Accounted work | 256 Mi units: read bytes + preflight text chars + copy traversal/directory operations |

Default margins so với Golden: member >32× max member ở heap đủ lớn, records16×
max GT rows, array/core frames32×, ratio >7× observed max; các count/depth/token
caps hữu hạn. Heap-aware guards quan trọng hơn việc chỉ tăng file-size default.
Policy không được vượt member heap/16, retained heap/2, central-index envelope
members×2048≤heap/4, run-index envelope runs×1024≤heap/8, depth64 hoặc Java array
capacity. Các counters và size additions dùng checked arithmetic; arithmetic
overflow trở thành SIZE_COUNTER_OVERFLOW controlled resource rejection.

**Retained charge là allocation model, không exact JVM object size/live heap/RSS.**
Text8× và per-value/key/cell128-byte charges được reserve trước tree allocation;
shared global evidence immutable copies được charge lại. ZIP index metadata cũng
reserve charge trước ZipFile. Mô hình bao gồm parser/immutable-copy headroom nhưng
không chứng minh mọi JVM/object-layout/concurrent workload đều không thể OOM.
Hard process heap/timeout vẫn phải do orchestrator khai báo. No catch-OOME fallback.

Không enforce wall-clock CPU deadline, exact heap/RSS, across-session/global process
admission, report/output memory, hoặc physics solver complexity bằng parser budget.
Direct Java objects đã allocated (Run/AnalysisContext) không phải byte-ingestion
boundary. Local files phải immutable trong analysis; không tuyên bố filesystem
sandbox/atomic lease chống concurrent mutation. ZIP64/multidisk/encrypted archives
được reject explicit; không silently bypass budgets để đọc chúng.

## 3. Files/methods thay đổi

Prefix main: `src/main/java/com/vsos/core/failureanalysis/`.

| File | Actual change |
|---|---|
| InputResourcePolicy.java — mới | Finite defaults, immutable config và heap-envelope validation |
| InputRejectedException.java — mới | Structured category/reason/source reference; không là AEB label |
| BoundedInput.java — mới | Bounded byte reads, checked session counters, UTF-8 validation, JSON lexical preflight trước existing MiniJson, bounded JSONL |
| ArchiveIndex.java — mới | EOCD/central-directory preflight trước ZipFile; unsafe/duplicate/case/prefix collisions, declared sizes/ratios/counts, reject unsupported ZIP structures |
| RawArtifactAdapter.java | Policy overload, bounded index/read/CRC, run/record budgets, cache parsed members/runs, global-copy charging, close-on-constructor-failure và close-session behavior |
| ArtifactCsv.java | Bounded row/cell/column/record parser, giữ RFC4180/BOM/CRCRLF; không giữ whole intermediate record list |
| HandoffSnapshots.java | Bounded snapshot/source reads và shared-budget overload; invalid parsed payload không usable/verified |
| BaselineBindingResolver.java | Bounded snapshot bytes/parser; không đổi binding semantics hoặc identity assumptions |
| ConsumerSourceInspection.java | Bound existing checked-out source file reads; không sửa inspected consumer |
| SearchRangeResolver.java | Bound catalog/engine source reads; giữ source bounds/constraints/methodology |
| OfflineMoboHandoff.java | Shared bounded report input session; invalid report abort trước aggregate build |
| Batch04ResourceTest.java — test mới | 69 invocations; tất cả old tests giữ byte-for-byte |

Không viết lại MiniJson parser: bounded lexical pass kiểm depth/token/string/array/
duplicate keys/nonfinite numbers, sau đó MiniJson xử lý grammar. CSV là parser có
sẵn được sửa trực tiếp. JSON/CSV/JSONL vẫn dùng bounded buffering, **không tuyên bố
fully streaming object model**. Binary JAR chỉ bounded read/hash, không decode JSON
hoặc execute/load artifact code. Archive không extract vào filesystem.

[production-source.diff](batch-04-evidence/production-source.diff),
[new-resource-tests.diff](batch-04-evidence/new-resource-tests.diff),
[diff-stat.json](batch-04-evidence/diff-stat.json).

## 4. Error isolation và trust boundary

| Category | Output/boundary |
|---|---|
| RESOURCE_LIMIT_EXCEEDED | InputRejectedException với reason/source; session exhausted; không trả partially read run/score |
| INVALID_ARTIFACT | Unsafe/colliding/unsupported ZIP structure rejected trước ingestion; invalid report không được handoff |
| INTEGRITY_MISMATCH | ZIP CRC/size/read failure, hoặc existing HASH_MISMATCH/SIZE_MISMATCH issues; payload không usable |
| PARSE_ERROR | Structured malformed UTF-8/JSON/CSV/duplicate key/number issue; whole affected payload null/FAILED |
| INCOMPLETE_INPUT | Truncated container/quote hoặc missing root; existing SOURCE_MISSING giữ nguyên cho missing member |
| VALID_BUT_INSUFFICIENT_EVIDENCE | Valid facts nhưng thiếu identity/clock/authority/requirement; existing UNKNOWN/ANALYZED_PARTIAL, không parser error |

Resource exception message là structured JSON có category, reason_code và
SourceRef. CLI giữ nonzero rejection/stack trace; không tạo success report từ
exception. Error enums không ép thay existing missing/integrity issue codes; future
campaign summary mapping được nêu trong functional plan.

Member parse/CRC failure được quarantine, không giữ partial parsed tree. Actual
byte SHA nếu đọc đầy đủ vẫn được lưu, không sửa expected digest để pass. Fatal
archive structure/resource failure abort ingestion; optional non-resource parse
failure cho phép independent evidence tiếp tục. Tested: malformed summary giữ
canonical impact10 và matching contact COLLISION; malformed contact stream không
thành SAFE; oversize result không cho partial canonical sample/score. Mọi raw files
read-only. Cached artifacts không bị decompress lại mỗi repetition/read; metadata
copies vẫn có đúng per-run run_key, được charge riêng. Close clear caches và close
ZIP, kể cả constructor fail sau open; exhausted stream cũng được close.

## 5. Before/after original OOM và measurements

Reuse original audit archive **không sửa**:
`final-audit/evidence/SYNTHETIC-oversized-input.zip`, 65415 compressed bytes,
67108866-byte member; SHA256
`a7fd09c7fa72aa86db21359c4c435342e83dad9bca811357815bba0544e26c06`.
Original script đọc để xác định exact attack/command; Batch04 copy command với
new output directory, không overwrite original audit outputs.

| Isolated child | Result |
|---|---|
| Before `-Xmx32m` | exit1; OutOfMemoryError reproduce tại old reader |
| After cùng input/heap | exit1; RESOURCE_LIMIT_EXCEEDED / DECLARED_MEMBER_BYTES; no OOM; 0 partial reports |

[red](batch-04-evidence/resource-red.json), [red log](batch-04-evidence/resource-red.log),
[green](batch-04-evidence/resource-green.json), [green log](batch-04-evidence/resource-green.log),
[reproduction/measurement script](batch-04-evidence/verify_resource_limit.py).
Bounded child timeouts30/60s; không uncontrolled stress test hoặc multi-GB files.

| 72-run ingestion, all Runs retained | Elapsed | End used heap | Sum heap-pool peak usage |
|---|---:|---:|---:|
| Original pre-edit, heap512 MiB | 1772ms | 389545984 | 470286336 |
| Before, same heap2 GiB comparison | 5801ms | 381157376 | 515375104 |
| After, heap2 GiB | 4226ms | 353370112 | 445644800 |

Before2g dùng compiled unchanged pre-batch adapter/CSV snapshots trước current
classpath, không sửa historical source. Một cold child per condition; có cache/GC/
concurrent-test effects, **không statistical performance benchmark**, và sum of
pool peaks không concurrent process RSS. After512m intentionally bị controlled
retained-charge rejection; không OOM. New safe accounting đòi heap/profile phù hợp,
không khẳng định mọi dataset trước đây vừa heap nhỏ đều được chấp nhận.

After2g counters: 29,507,254 actual read bytes; 48,897,682 accounted work units;
693,322,980 retained allocation-charge bytes. Do đó tested2g profile đủ cho actual
Golden72; maxRetained512m profile256MiB không đủ. Không suy charge là measured RAM.
[baseline-memory.json](batch-04-evidence/baseline-memory.json),
[memory-runtime-results.json](batch-04-evidence/memory-runtime-results.json).

## 6. Adversarial/boundary và regression results

69 Batch04 tests bao gồm oversized member, actual inflation với forged small
declared size, cumulative bytes, ratios, entry/run/record counts, unsafe names và
duplicate/case/prefix collisions, JSON nesting/string/token/value/key/number,
CSV row/columns/records/quotes/header/multiline, JSONL, corrupt/truncated ZIP/CRC,
missing source/root, overflow, constructor/stream close, exact boundaries, cache,
poisoned work budget, no partial canonical và independent-evidence preservation.

| Execution | Total | Pass | Fail | Error | Skip | Build |
|---|---:|---:|---:|---:|---:|---|
| Pre-edit focused baseline |793|791|0|0|2|SUCCESS |
| Final focused clean verify |862|860|0|0|2|SUCCESS; package/repackage |
| Full Maven verify |1589|1584|2|0|3|FAILURE, known consumer tests |
| New Batch04 |69|69|0|0|0|PASS |
| Existing Batch01 / Batch02 / Batch03 |44 /79 /80|44 /79 /80|0|0|0|PASS |

M1A–M1D, real Golden18, metrics/core isolation/architecture/docs suites chạy thật.
HF-02/HF-03 authorized-export fixtures vẫn SKIPPED; full suite thêm disabled
KinematicParityFullTest. Không tính skips là pass. Full failures duy nhất:

- OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt
- OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor

Không sửa consumer để làm xanh. Hai intermediate new-test failures được giữ log:
assertion substring COLLID/COLLISION và tiny retained test policy bị extra guard
chặn trước boundary. Đã sửa assertion/guard phù hợp; final69 pass. Không gọi chúng
là pre-existing production failures. Red proof là original child OOM reproduction,
không tuyên bố mọi new unit test đã chạy red trên source cũ.

Exact commands: [COMMANDS.md](batch-04-evidence/COMMANDS.md).
[baseline](batch-04-evidence/baseline-focused.log),
[focused accepted](batch-04-evidence/focused-accepted.log),
[full](batch-04-evidence/full-final.log),
[test-results](batch-04-evidence/test-results.json).

## 7. Golden72, physics/digests và protected history

Rebuilt vào **new Batch04 paths**:
[72 diagnostics](batch-04-evidence/final-confirmation/diagnostics/),
[handoff](batch-04-evidence/final-confirmation/GOLDEN18-audited-handoff.json),
[compatibility](batch-04-evidence/final-confirmation/GOLDEN18-audited-compatibility.json).

72/72 original oracle; 54 ON/18 OFF; 31 COLLISION/41 UNKNOWN; 12 disagreements;
6/6/14 suspected NO/FALSE/INEFFECTIVE; 0 confirmed roots. All216 canonical scalar/
null values unchanged; 42 stopping replays max diff0; baseline identity/scores UNKNOWN;
OFF không functional claims. Positive context tests Batch03 vẫn pass. 26 dossiers,
124 NOT_EXECUTED plans, objective links giữ nguyên vì source logic không sửa.

Independent32 physics checks PASS, 978 member sizes/hashes verified, raw ZIP SHA256
`22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339` unchanged.
74 digests recomputed; 0 dangling artifact refs. **Cả72 input/report objects và
content digests trùng Batch03; handoff semantic digest cũng trùng.** Compatibility
vẫn NOT_DIRECTLY_CONSUMABLE / dispatch=false. Analyzer/digest/profile semantics không
bị đổi chỉ để thêm resource accounting vào valid reports.

[golden summary](batch-04-evidence/final-confirmation/golden72-summary.json),
[per-run CSV](batch-04-evidence/final-confirmation/golden72-review.csv),
[independent math](batch-04-evidence/final-confirmation/independent-math-checks.json),
[digest verification](batch-04-evidence/final-confirmation/digest-verification.json).

Protected1845 paths: 1838 unchanged, đúng7 existing FA input-reader files sửa; thêm
4 production/1 test. All old tests, eight contracts, math/context/dossier sources,
raw/audits/historical reports, AEB/radar/calibration/producers/backend/MOBO giữ byte
hashes. No outside-scope modifications detected.
[before hashes](batch-04-evidence/protected-before.json),
[after hashes](batch-04-evidence/protected-after.json),
[preservation summary](batch-04-evidence/preservation-summary.json).

Git FA/docs trees vốn untracked; git diff một mình không thể hiện source changes.
Actual diffs dùng pre-batch snapshots. [git status --short](batch-04-evidence/git-status-after.txt).

## 8. Functional testing handoff và remaining external decisions

[FAILURE_ANALYSIS_FUNCTIONAL_TEST_PLAN.md](FAILURE_ANALYSIS_FUNCTIONAL_TEST_PLAN.md)
quy định inputs, matrix, existing commands, authorized-context API, resource profile,
CSV/JSON output specification, acceptance và stop conditions. Chỉ plan/runner spec;
không triển khai runner lớn hoặc post-fit campaign. Không tính classification
accuracy khi thiếu independent labels; không coi72runs là72IID scenario samples.

| Owner | Cần chốt/cung cấp ngoài batch |
|---|---|
| DATA_PROVIDER / requirements authority | Real immutable run/project/version/cohort bindings, reviewer policy/pins, duty/caution/coverage/threshold/control-clock evidence |
| CALIBRATION | Actual post-fit validated domain/residual/holdout/response packages gắn vehicle/profile/source và approved quality gates |
| Runtime/data governance | Approved production quotas, representative campaign sizing, heap/concurrency/output admission, wall-clock solver limits, upload sandbox and ZIP64 policy |
| MOBO_CONSUMER / backend | Frozen cohort/canonical/bounds/sealed-validation adapter, metadata discrepancies và hai known OptimizationServiceTest failures; task riêng |
| Safety reviewer | Independent expected labels/adjudication; functional correctness tách physical outcome/evidence quality/operational completeness |

FA-010 reproduction đã được controlled rejection và finite boundary budgets xử lý;
không ghi đè historical defect register hay tuyên bố universal resource/security
certification. Không chuyển backend/MOBO integration hay functional campaign sau
Batch04 nếu chưa có nhiệm vụ riêng.
