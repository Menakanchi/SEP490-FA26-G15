# Remaining dependencies and ownership

JSON intake and offline evidence export are implemented. These dependencies
remain; none is a reason to manufacture missing values or dispatch MOBO.

| Dependency | Actual evidence / consequence | Owner and required action |
|---|---|---|
| Producer implementation/deployment | ADR-065 and real exports supplied; no RunDataset/RunDatasetWriter/RunCollection implementation or matching format literals found outside FA in this checkout | Producer owner: supply source revision and deployment/binary linkage; ADR is contract evidence, not deployment proof |
| Independent external artifacts | Container SHA computed; embedded table/document digests agree. Original CSV/JAR/XOSC bytes not verified merely by their declared hashes | Data owner: supply original bytes plus independently expected hashes if external verification is required |
| Baseline binding/currentness/v1 | Project4/scenario26/AEB33 are declarations; collection config captured at COLLECTION_EXPORT, status_at_result_time null. Existing resolver returns UNKNOWN | Baseline/backend owner: independently pinned run/version/config binding and historical/as-of scope; do not call label v1.0 or BASELINE purpose confirmation |
| Dataset freeze and reviewed partition | All3 collections sealed=false; selection is completed CARLA exports, excludes unfinished runs. Six delivered members are not a reviewed optimization/validation cohort | Dataset/reviewer owner: authorized immutable selection, variant-disjoint split, representative repetition policy, nonhazard controls and quality decisions. No automatic split from current files |
| Legacy SAFE gate | Only ON2498 is legacy SAFE after AnalysisService false-activation classification; ON2500 has false_activation=true despite evaluation.outcome SAFE | Backend/requirements/reviewer: resolve retention policy. Do not promote V3 UNKNOWN to SAFE or erase legacy flags to pass freeze |
| Metric/profile/sample authorization | Scalars readable; filtered core jerk distinct from raw GT/IMU; collections may lack git revision and runtime binary linkage | Metric/data owner: canonical sample snapshot and complete provenance/quality binding for scoring. No fallback-zero baseline aggregate |
| Clock/control writer | Core has no recorded world-frame join; dataset alignment is DECLARED. First pedal sample does not identify command writer | Producer/recorder owner: independently verifiable clock mapping, emitted/applied/consumed controls and writer IDs before actuator-delay/cause assertions |
| Absence/geometry/requirements | Empty contact array does not prove complete encounter/no collision; full transform/uncertainty/caution/requirement evidence still absent | Requirements/simulation owner: reviewed absence coverage, transform, thresholds and claim-local predicates |
| Calibration/physical feasibility | Pedal-map label, cap/friction/config are not approved domain evidence or P05 certificate | Calibration/physics owner: versioned validation domain/artifact and bounded response/uncertainty/action scope; physical limit/root remain UNKNOWN |
| Parameter hints/search ranges | No approved optimization partition/mechanism/domain artifacts; hints empty and suggested ranges UNKNOWN | Requirements/MOBO reviewer: independently sourced approved domain and mechanism evidence. No ±percentage ranges or Golden-derived hints |
| MOBO/Regression consumer | Existing source reselects latest runs, differs in aggregation and ignores custom bounds; sealed holdout not consumed | MOBO/Regression owner: separately authorized M2 adapter work per existing M2_CHANGE_PLAN. This task makes no API/DB/optimizer changes |
| Authorized acceptance fixtures | HF-02/HF-03 real authorized exports unavailable; both tests explicitly skipped | Dataset/backend/reviewer owner: provide actual independently pinned exports; synthetic fixtures are not production acceptance |
| Full project verification | Two existing OptimizationServiceTest failures remain; see TEST_RESULTS.md | Backend/MOBO owner: separate task for semantics/test expectations. No unrelated repairs made here |
| Deployment resource envelope | Batch04 limits reused, bounded parsing/normalization accounting; not a whole-process CPU/RSS/concurrency guarantee | Runtime owner: approve operational limits, process heap/timeout/admission and immutable-file policy before exposing untrusted network intake |

No CARLA, MOBO campaign, database connection/migration, baseline update,
candidate creation, commit, push, merge or branch change was performed. This
task stops at direct JSON intake, diagnostic/handoff generation and offline
validation. Existing M2 and integration decisions are not silently activated.
