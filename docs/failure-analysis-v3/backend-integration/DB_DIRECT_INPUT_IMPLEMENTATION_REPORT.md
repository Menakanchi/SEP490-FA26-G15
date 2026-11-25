# Failure Analysis — Database Direct Input

Date: 2026-11-25. Scope: Module 3 backend/frontend/tests only. No commit/push/merge,
production DB writes, CARLA execution, producer/controller/calibration/MOBO changes.

## Result

Implemented: select a completed CARLA run or all completed CARLA members of a variant
from the authenticated project → read original result JSON from existing storage →
existing V3.1 pipeline → existing BE-R1 immutable source/execution/report/handoff
persistence → existing FE-R4 report/deep-link views. Manual JSON upload remains an
advanced compatibility option. This task does not authorize optimizer dispatch.

**Test scope matters:** actual JDBC MySQL tests use provided real CARLA result content
with identities restored into a disposable DB. This is not a snapshot/query of the
team's live application DB. Browser tests use HTTP fixtures captured from those MySQL
tests. A live browser → deployed REST → application artifact volume end-to-end test
has not been executed. Deployment acceptance remains BLOCKED until that environment
is supplied; successful offline/browser-fixture tests are not a claim otherwise.

## Where Module 2 stores results

Read-only source inspection:

| Source | Contents / use |
|---|---|
| `simulation_runs` | Run/project/scenario/variant/AEB/model/seed/mode/repetition/attempt/purpose/simulator identity; completed CARLA selection. Stored three scalar metric columns, `telemetry_json` and `run_config_json` are not complete result documents and are not used to synthesize input. |
| `simulation_artifacts` | `simulation_run_id`, `artifact_type='RESULT_FILE'`, `file_name`, `storage_url`, MIME/size. `storage_url` is the filesystem reference; there is no inline original-JSON payload or authoritative byte hash here. |
| `RunService.runDir(id)/result.json` | Original `vehicsim.result/v1` bytes. `runDir` resolves configured `vehicsim.dataRoot` (default `./data/vehicsim`) + `runs/{id}`. Adapter uses this existing location resolver only. |
| Collection | No collection JSON column/table in current producer storage. Module 3 snapshots actual completed CARLA membership for a variant and wraps existing original member bytes in `vehicsim.run-collection/v1`. It does not reconstruct scientific fields. |

Source anchors: `src/main/java/com/vsos/backend/service/simulation/RunService.java`
(`runDir`, artifact registration, run metric persistence), producer `RunDatasetWriter`,
`RunCollectionService.variantCollection`, and `database/mysql/01_schema.sql`.
The existing producer collection exporter can rebuild missing dataset content from
DB/config. Module 3 deliberately does not call it or `bundleForRun` here.

Provided run2499 v2 contains `vehicsim.result/v1`, dataset identity and the three
producer objectives. Provided collection1033 contains run2499 ON and run2511 OFF,
seed49033, repetition1/attempt1. They remain separate observations. The ON source
file is read byte-for-byte; the OFF test source is the actual nested result from the
provided collection, serialized with existing MiniJson. No new metric values are
invented. Restored fixture DB labels/IR/config are not scientific inputs.

This agrees with using Module 2's `result.json` as the complete metric source. It
also means a DB backup without its referenced artifact volume is insufficient for
first analysis. Already captured FA source/report bytes remain persisted independently.

## Implemented adapter and boundaries

- `FailureAnalysisDatabaseRepository`: project-scoped SELECTs only, completed CARLA
  run list, variant list, full member identity and result references. No Module 2 writes.
- `FailureAnalysisDatabaseAdapter`: preflight and capture; validates schema/identity,
  reads original storage bytes and feeds existing `RestJsonAnalysis` → `JsonInputAdapter`
  → `DiagnosticReport`. Existing physics, diagnosis and canonical reader are unchanged.
- Reference must match the canonical run's `result.json`. Multiple result references,
  arbitrary paths, symlinks/storage escape, invalid JSON, missing `/dataset`, unsupported
  format and DB/document identity disagreement are blocked with field/reason codes.
  If the artifact row is absent, an existing canonical file may be used with explicit
  `CANONICAL_RUN_STORAGE_NO_ARTIFACT_ROW` provenance; no JSON is generated to replace it.
- All identity fields are checked, including run/project/scenario/version/variant,
  AEB version/model/seed/mode/repetition/attempt/purpose/simulator. DB ownership does
  not establish approved baseline v1, physical authority or calibration validity.
- Bounded read and file metadata before/after detect mutation. Captured provenance
  includes adapter version, selected DB identity, artifact row ID, safe relative path,
  observed byte SHA-256 and size. A newly observed hash is not a producer-signed hash.
- Collection uses each original document's lexical bytes and a producer-compatible
  semantic document digest. Missing/invalid members remain in the manifest, never
  silently disappear. A second membership check rejects concurrent changes.
- Existing intake budgets apply: 1MiB source, 16 members. A 17th sentinel detects
  excess selection; HTTP413 rejects the whole cohort, never truncates it. Two
  concurrent source readers bound intake work. Large collections need an explicit
  reviewed Module 3 budget extension; selecting one run is supported meanwhile.
- Current UTF-8 BOM inputs are rejected with
  `DB_RESULT_BOM_NOT_EMBEDDABLE_WITHOUT_BYTE_CHANGE`; bytes are never silently normalized.
- Observed selection is explicitly `OBSERVED_SELECTION_NOT_AUTHORIZED_FROZEN_COHORT`.
  This is not an approved optimizer partition, baseline or search-space definition.

Missing members have `issues[].reason_code`, `field`, and
`required_from=MODULE_2_ORIGINAL_RESULT_OR_ARTIFACT_REFERENCE`. Examples:
`DB_RESULT_FILE_MISSING:result.json`, `DATASET_REQUIRED:/dataset`,
`DB_IDENTITY_FIELD_MISSING:/dataset/identity/seed`, `DB_IDENTITY_CONFLICT`,
`DB_RESULT_REFERENCE_AMBIGUOUS`. No telemetry/config-to-result fallback exists.

## API and persistence

Prefix: `/api/v1/vehicsim/analysis/v3`. Existing authenticated project context,
read/write role and ACTIVE project/workspace checks remain in use; no shared security
changes. All old source/execution/report/handoff routes remain compatible.

| Method | Added route | Behavior |
|---|---|---|
| GET | `/database/runs?limit=20&offset=0` | Paged completed CARLA runs in current project |
| GET | `/database/collections?limit=20&offset=0` | Variant cohorts with member counts |
| GET | `/database/runs/{id}` | Original-input preflight, SHA, availability, exact missing fields |
| GET | `/database/collections/{variantId}` | Full cohort preflight and missing-member accounting |
| POST | `/database/runs/{id}/executions?source_sha256={observedHash}` | Empty body; capture original run and analyze |
| POST | `/database/collections/{variantId}/executions?source_sha256={observedHash}` | Empty body; capture collection and analyze each available member |

Preflight does intake validation, not physical reanalysis or persistence. Optional
POST hash is a stale-input guard; frontend always supplies it. Malformed hash400,
changed source409, inaccessible project/selection404, unavailable standalone source422,
budget413. Query hash avoids adding a CORS header to shared security. No path is accepted
from the client. DB numeric IDs are separate from stored FA UUID resource IDs.

`FailureAnalysisService.ingestDatabase` uses BE-R1 `FailureAnalysisStore` and its four
existing tables: `fa_json_sources`, `fa_json_executions`, `fa_json_reports`,
`fa_json_handoffs`. No schema or additional persistence system was introduced.
Raw bytes plus DB acquisition provenance determine immutable source deduplication.
Manual upload and DB capture of identical bytes can retain distinct acquisition
records without falsely claiming different result bytes. Actual differing bytes for
the same identity still produce the existing disagreement signal.

Execution/report/handoff graph is committed through existing BE-R1 transaction and
digest verification. Complete diagnostic-only handoff JSON is stored and downloadable.
Partial cohorts persist reports plus `BLOCKED` handoff metadata with no payload when
the existing builder cannot produce a valid handoff; no fake handoff JSON/digest is
created. Frontend displays that distinction and `dispatch_allowed=false`. No automatic
baseline score, search range, approved context or dispatch permission is added.

## Frontend

`FailureAnalysisDatabasePicker` is primary in the existing V3 workspace: choose one
run or one variant, inspect availability, click “Phân tích kết quả CARLA”. Run options
include seed/mode/repetition/attempt. No duplicate dashboard or primary tab was added.
Existing saved-source/upload workflow is under “Nguồn JSON đã lưu / nhập nâng cao”.
Results reuse FE-R4 execution/member/report/handoff views and UUID deep links. Refresh
reads persisted resources, without reanalysis. Missing standalone inputs disable the
action; partial collections retain missing/blocked counts. Project switch/unmount
discards stale requests/navigation. Mobile/keyboard and loading/error/empty/read-only
states are covered in the regression suite. User-facing views do not require baseline
IDs, Java class names or internal formula IDs as inputs.

## Verification

Baseline before edits: 26 focused Java tests PASS; 70 frontend unit tests PASS.
Workspace already contained extensive FE-R1–FE-R4/BE-R1 changes. The task-start
2610-file SHA inventory was used to distinguish this task's changes from that state.

| Check | Result / qualification |
|---|---|
| Focused Java, final source | 51 PASS, 0 fail/error/skip; includes 7 actual isolated MySQL DB-direct tests, 8 adapter tests, REST/service/store/integration/architecture regression |
| Existing BE-R1 actual MySQL regression | 10 PASS, 0 fail/error/skip; separate disposable `fa_ber1_test` DB |
| Full Maven verify/package | BUILD SUCCESS:1745 total,1729 PASS,0 fail/error,16 SKIPPED |
| Frontend node regression | 73 PASS, 0 fail/skip (70 existing +3 DB input tests) |
| New DB browser flow | 9 assertion groups PASS with actual MySQL-response fixtures; not live network/DB E2E |
| FE-R1/R2/R3/R4 browser regression | PASS all13 browser suites, including FE-R4's17 groups and new DB flow's9 groups; no browser suite skipped |
| ESLint / TypeScript / Next production build | PASS |
| Live application DB/artifact-volume rollout | BLOCKED / not executed; production DB untouched |

MySQL8.4 runs in a disposable owned localhost Docker container with random test
password/port. Tests require explicit `FA_DB_DIRECT_MYSQL_URL` pointing only to
`127.0.0.1:<port>/fa_db_direct_test?...`, and reject a non-empty target DB before setup.
They never read application datasource/.env. Test fixture producer rows are inserted
only in this isolated DB. A second synthetic repetition without an artifact proves
missing repetitions remain blocked/accounted; it is not claimed as a real CARLA run.

The seven DB tests verify: actual run and collection selection without upload;
exact canonical objective values and bytes; reload with a new service instance;
source/report/handoff digests; partial/missing members; cross-project reads/writes;
tampered stored report rejection; repetition accounting; actual controller + pipeline
and JDBC composition. Controller MySQL test uses scoped access/test principal rather
than a live JWT deployment. Separate REST security tests exercise existing SecurityConfig.

Commands (PowerShell, repository root unless stated):

```powershell
.\mvnw.cmd -B '-Dtest=FailureAnalysisDatabaseMysqlTest,FailureAnalysisDatabaseAdapterTest,FailureAnalysisRestTest,FailureAnalysisServiceTest,FailureAnalysisStoreTest,FailureAnalysisIntegrationFindingsTest,ArchitectureRulesTest' test
.\mvnw.cmd -B '-Dtest=FailureAnalysisMysqlTest' test
.\mvnw.cmd -B '-Dfa.json.samples=docs/failure-analysis-v3/handover/examples/inputs' verify
# frontend/; set opt-in DB env only for the corresponding disposable DB above
node tests/helpers/build-db-input-fixtures.mjs
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3143
$env:ANALYSIS_UI_URL='http://127.0.0.1:3143'
$env:ANALYSIS_TEST_OUTPUT='F:/CodeVipChu/SEP490-FA26-G15/data/analysis-db-direct-verified'
npm.cmd run test:analysis -- --browser
```

Initial test failures corrected: fixture required scenario IR column; assertions for
Java numeric types and report list ordering. A runner invocation initially used a
frontend-relative artifact folder rejected by its safety guard; rerun uses absolute
repository `data/` path. None were resolved by fabricating canonical values or
loosening evidence gates. The first full frontend run passed eleven browser suites,
then FE-R4 exposed its old “first select” upload test selector, which now pointed at
the new DB scope selector. It was corrected to target the explicit saved-source label;
all upload byte/identity checks were retained. DB busy button text was also made
distinct from the compatibility action. A second browser attempt was invalidated by
starting its server while a frontend rebuild was still replacing `.next`; overview
logged a runtime error. The server was stopped, the build's actual successful exit
awaited, then a fresh production server and regression run started. No assertion was
removed to hide either failure. See final logs for authoritative results.

Full verify skips:7 DB-direct and6 BE-R1 class test nodes without their opt-in DB
environment variables (separately executed successfully as7 and10 invocations),
2 authorized HF fixture tests without supplied authority packages, and1 opt-in full
kinematic parity test without `vsos.parity.full`. Golden18 integration itself ran.

## Remaining integration decisions / dependencies

| Classification | Owner / issue | Status |
|---|---|---|
| FIX_IN_SCOPE | Module3 DB result selection, original-byte adapter, stale-input/identity gates, persistence and primary frontend flow | Implemented and tested within the limits above |
| FIX_IN_SCOPE | Same-byte acquisitions falsely reported as different-byte identity conflict | Corrected peer lookup; existing divergent-byte checks retained |
| DEPENDENCY: Module2/input boundary | Missing/cold/moved result volume, old result without `/dataset`, stale/ambiguous artifact references or wrong identity | Detect/list exact fields only. Producer not edited. Supply original result/ref; do not rebuild from telemetry. |
| FOLLOW_UP: Module3 | Larger collection/source budgets and durable frozen-cohort membership | Explicit reviewed extension needed beyond current16/1MiB; no truncation or automatic freeze |
| FOLLOW_UP: Module3/shared contract | Transport loses nested FA reason codes on failed HTTP responses | Shared transport unchanged; status and successful preflight field issues remain usable |
| FOLLOW_UP: legacy AnalysisService | Earlier impact provenance concerns | Legacy service unchanged; this DB path uses canonical producer values and existing V3 evidence. No claim to fix that separate issue. |
| BLOCKED: approved authority / M2 | Baseline v1 binding, authorized optimization/validation partitions, approved domains and consumer integration | Not inferred from DB identities; diagnostic-only/blocked remains valid |
| BLOCKED: deployment acceptance | Team application DB snapshot + original artifact volume + live authenticated environment | Needed for final deployed browser/REST/MySQL integration acceptance |

No Module2 table/schema/producer write or shared auth/security edit was needed.
No historical artifact was modified. No claim that BE-R1 alone resolves every earlier
integration issue; read the separate findings and this report's test qualifications.

## Files changed in this task

New production files:

- `src/main/java/com/vsos/backend/repository/analysis/FailureAnalysisDatabaseRepository.java`
- `src/main/java/com/vsos/backend/service/analysis/FailureAnalysisDatabaseAdapter.java`
- `frontend/src/components/analysis/FailureAnalysisDatabasePicker.tsx`
- `frontend/src/components/analysis/failureAnalysisDatabaseData.ts`

Existing Module3 production files extended: `FailureAnalysisController.java`,
`FailureAnalysisService.java`, `FailureAnalysisStore.java`,
`frontend/src/services/failureAnalysisV3.ts`, `FailureAnalysisV3.tsx`.

New tests: `FailureAnalysisDatabaseAdapterTest.java`,
`FailureAnalysisDatabaseMysqlTest.java`, `frontend/tests/analysis-db-input.mjs`,
`analysis-db-input-ui.mjs`, `helpers/build-db-input-fixtures.mjs`, and
`fixtures/fa-db-input/mysql-output.json` (explicitly BROWSER_FIXTURE_ONLY).
Extended tests: `FailureAnalysisMemoryStore.java`, `FailureAnalysisRestTest.java`,
`frontend/tests/run-analysis.mjs` and twelve existing analysis browser fixtures with
independent empty DB-source responses. The FE-R4 saved-source selector now uses its
explicit label. Existing regression assertions remain.

Documentation: this report, `db-direct-evidence/`, Failure Analysis README and
handover architecture/status, and the task execution plan. Full task delta is in
[scope verification](db-direct-evidence/task-scope-check.json); full worktree status
includes earlier tasks' unrelated dirty files and is not this task's diff.

Evidence: [focused Java/MySQL](db-direct-evidence/fa-db-final-mysql.log),
[BE-R1 MySQL regression](db-direct-evidence/fa-db-ber1-regression.log),
[full verify](db-direct-evidence/fa-db-full-verify-final.log),
[sample real-input report](db-direct-evidence/run-report-2499.json),
[partial handoff metadata](db-direct-evidence/missing-member-handoff-status.json).
Final frontend: [suite summary](db-direct-evidence/frontend-summary.json),
[command log](db-direct-evidence/fa-db-frontend-verified.log),
[DB flow assertions](db-direct-evidence/database-browser-result.json),
[desktop](db-direct-evidence/database-run-desktop.png),
[mobile](db-direct-evidence/database-run-mobile.png),
[partial collection](db-direct-evidence/database-partial-desktop.png).
These screenshots use labelled test-fixture context; they are not screenshots of
the team's application database. [Git status](db-direct-evidence/git-status-short.txt)
records the full pre-existing dirty worktree plus this task. The disposable MySQL
container/temporary credentials and owned frontend server were removed/stopped after
verification; no application migration or deployment was performed.
