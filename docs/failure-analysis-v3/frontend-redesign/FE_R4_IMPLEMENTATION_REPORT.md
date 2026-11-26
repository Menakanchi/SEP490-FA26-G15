# FE-R4 — Real V3.1 REST integration

Date: 2026-11-25. Scope: Module 3 Failure Analysis frontend only. Backend, shared
transport/auth/project providers, database and scientific core are unchanged.
No migration020 deployed; no optimizer/CARLA/campaign, branch/stage/commit/push/merge.

## Implemented workflow

The existing `/analysis/failures` workspace now starts with **Phân tích dữ liệu**:
choose a persisted source → Phân tích → persisted execution and all declared members
→ choose a run → actual DiagnosticReport → investigate → download stored JSON.
Upload is a secondary disclosure. Saved sources have identities, collection/standalone
kind, manifest member count, status, upload timestamp and explicit freshness uncertainty.
Recent executions, source hashes/manifest/producer metadata are expandable.
No source UUID entry, context approval form, extra top-level dashboard/tab, fake
progress/cancellation, client-side objective recomputation or unsafe automatic retry.

The report displays physical outcome/basis separately from observed AEB behavior,
three canonical objective values/status/units, exact returned failure candidates,
root UNKNOWN, evidence sufficiency and unknowns. The default evidence summary counts
the returned sufficiency statuses; all claim details/missing evidence remain available.
Timeline, physics, provenance and causal hypotheses are closed disclosures. Supporting
evidence, counterevidence, alternatives and unexecuted falsification plans remain distinct.
Canonical impact is separate from contact impact; stopping trace and extrapolated tail
are separately displayed. Signal/filter/window/quality/source refs/clocks are retained
in objective/investigation details. No scientific thresholds are added.

Execution accounting displays expected/accepted/analyzed/blocked/failed/missing as
returned, checks conservation and member statuses, and explicitly says missing is a
subset of blocked. Members use member_index/run_key; repetitions are never grouped.
Completeness is delivered-manifest scope, not a frozen scenario population.

The M1C handoff is shown as diagnostic-only/blocked with dispatch_allowed=false,
schema, compatibility/reasons and explicit eligibility UNKNOWN when not supplied by
metadata. A download button requires an actual content_digest. It remains separate
from the existing dataset-v2 snapshot and optimizer request. No new optimization call.

## Navigation and routes

| Route | Behavior |
|---|---|
| `/analysis/failures` and existing view/filter/dataset_id queries | Same workspace, source action above clearly labeled legacy explorer; legacy drafts/snapshots remain mounted |
| `/analysis/failures?fa_execution=<UUID>` | Persisted execution result view; hides legacy panels without discarding their state |
| `?fa_execution=<UUID>&fa_report=<UUID>` | Same result view with selected report; hard refresh resolves execution, member metadata and report |
| `/analysis/failures/<numeric-runId>` | Unchanged legacy run detail; UUID reports never passed to this route |
| `/analysis/failures/<numeric-runId>/playback` | Unchanged advanced recorded playback |

The return action removes only fa_execution/fa_report, preserving filters, page,
search and dataset context. There is still one primary workspace and one result
hierarchy, without additional primary navigation. Numeric legacy routes stay separate
from UUID resource identity. Invalid/unsupported/mismatched resources cannot become
legacy reports. Report downloads remain available when a report schema is unsupported.

## Actual REST mapping

Client: `frontend/src/services/failureAnalysisV3.ts`. It reuses `apiRequest`/`apiBlob`;
Bearer, reviewer/project/session logic remains solely in the shared transport.
Base supplied to shared transport: `/vehicsim/analysis/v3` (shared adds `/api/v1`).
All paths below were checked against actual FailureAnalysisController and Service.

| Action | Method/path | Boundary |
|---|---|---|
| List/select source | GET sources?limit=20&offset, GET sources/{UUID} | Source, ResourcePage; actual project ownership |
| Upload | POST sources, application/json, original File body | Source; no JSON.parse/stringify replacement |
| Analyze | POST sources/{UUID}/executions | Empty body; no context_id/approval; returned committed execution |
| Recent results | GET executions?source_id={UUID}&limit=20&offset | Execution page; replay uses returned ID |
| Open execution | GET executions/{UUID} | Execution and every declared member |
| Run metadata | GET executions/{UUID}/reports?limit=20&offset | ReportMetadata; server pagination, no invented total |
| Report | GET reports/{UUID} | Versioned DiagnosticReport, actual schema only |
| Handoff state | GET handoffs/{UUID} | HandoffMetadata; dispatch false enforced |
| Downloads | GET sources/reports/handoffs/{UUID}/download | Authenticated Blob; exact bytes, nonempty application/json, local UUID-only filename |

No untrusted URL/path/filename is followed. Provenance JSON is escaped text, not an
executable link. Downloads use object URLs for API bytes and revoke them; production
never synthesizes a report via JSON.stringify. Async cleanup discards late responses
after source/run/context changes or unmount; AnalysisScope retains account/project remount
isolation. Pending POST disables mutation controls and never paints a success in advance.

## Typed scientific contract

| Fields | Use and guard |
|---|---|
| resource_schema/resource_kind/id/project_id/source_id/execution_id | Version, UUID and active-project checks; never confuse producer-declared identity with storage ownership |
| Execution counters/members/member_index/run_key/report_id | Nonnegative integers, unique member indices, status accounting, missing subset; reports must match member/source/execution |
| schema_version | Only vehicsim.failure-analysis/v1 accepted; malformed and unsupported versions are distinct errors |
| input.run_key/metric_aggregation_version | Exact member linkage; adr040-stored-aggregation/1 required |
| report.objectives.{rms_jerk_mps3,impact_speed_mps,stopping_distance_m}.canonical_value | Numeric/null EV and exact aggregation contract; no fallback zero, rounding or normalization |
| EvidenceValue | value/status/unit retained; OBSERVED/DERIVED/CONDITIONAL/UNKNOWN/INVALID/CONFLICTING/NOT_APPLICABLE kept separate |
| physical_outcome/physical_outcome_basis/observed_behavior | Separate physical event, evidence basis and observed functional behavior |
| objectives.*.physical_event_impact/decomposition/signal/filter/window/quality | Separate physical contact, trace/tail and metric lineage; missing stays unknown |
| failure_candidates/root_cause_hypotheses/evidence_sufficiency/inconclusive_reasons | Exact returned statuses, evidence and limits; no client diagnosis/causal confirmation |
| handoff.dispatch_allowed/content_digest/status/consumer_compatibility/reason_codes | False dispatch and diagnostic-only semantics; no production readiness implied by a valid JSON |

## Validation evidence

Final commands/counts/screenshots and scope fingerprints are recorded in
`fe-r4-evidence/verification.json`, `regression-summary.json`, `scope-verification.json`
and the captured logs. Browser results are **BROWSER_FIXTURE_ONLY**, never live E2E.
The baseline before edits was 63/63 unit tests passing. Existing dirty work was
fingerprinted at HEAD d712146c2ee03de8d751725c506eb1d4a814d2d8.

Browser fixtures were generated by the unchanged actual service/core with the existing
test memory store. Complete collection and standalone use original producer bytes;
PARTIAL/BLOCKED are explicitly synthetic run deletions from copies, processed by the
actual backend. Original source/report/handoff byte sequences are stored as Base64.
See `frontend/tests/fixtures/fa-v3/README.md` and generator source for provenance.
The offline core CLI separately read collection1033 and generated two reports without
CARLA/DB. These fixtures do not prove production persistence/auth/deployment.

An initial legacy browser run failed because its generic old fixture returned [] for
the new sources endpoint, yielding an extra malformed-page alert. Eleven legacy test
fixtures now explicitly return `{items:[],limit:20,offset:0}` for this additive endpoint.
Existing legacy assertions remain intact. An early focused test exposed a missing
explicit source-select accessible name; this was corrected and browser-tested.
Another composite attempt exposed ambiguous unscoped pagination buttons. The source
pager now appears only when pagination is needed; legacy pagination assertions remain.
The failed composite attempt summaries/logs are retained alongside the passing results.

| Gate | Actual command (frontend directory unless noted) | Result |
|---|---|---|
| Before-edit baseline | `npm.cmd run test:analysis` | 63 tests, 63 pass, 0 fail/skip |
| Full FA regression | `npm.cmd run test:analysis -- --browser` with local production app at 127.0.0.1:3143 | 70 unit tests pass; 12/12 browser suites pass, including all 11 legacy suites and 17 V3 acceptance groups; no skipped suites |
| After final UUID-response guard | `npm.cmd run test:analysis`, then `node tests/analysis-v3-ui.mjs` against rebuilt app | 70/70 units and 17/17 V3 browser groups pass, 0 fail/skip |
| ESLint | `npm.cmd run lint` | PASS, exit0 |
| TypeScript | `npx.cmd tsc --noEmit` | PASS, exit0 |
| Production build | `npm.cmd run build` | PASS, exit0 |
| Existing API checks, repository root | `.\mvnw.cmd -B -Dtest=FailureAnalysisRestTest,FailureAnalysisIntegrationFindingsTest,AnalysisApiContractTest,RestJsonAnalysisTest test` | BUILD SUCCESS; 14 tests, 14 pass, 0 fail/error/skip |
| Whitespace | `git diff --check` | PASS |
| Live FE→BE→MySQL | Not run | BLOCKED; no verified deployed environment; no listener on local8001 at check time |

The full composite browser run precedes the last isolated API UUID-response guard.
After that guard, all unit suites, lint, TypeScript, build and the complete V3 browser
suite were rerun successfully. Legacy production components received no subsequent
logic change. Evidence identifies both runs instead of implying an unexecuted final
full rerun. API guards check requested resource ID as well as project/parent/run linkage.

Desktop/mobile workspace/result and desktop investigation/partial/blocked screenshots
are captured in the evidence directory. The prior FE-R3 result hierarchy is preserved;
the new flow adds one source task and a query-linked report view, not new primary tabs.

## Backend dependencies and honest limits

| Finding | Owner / classification | Current behavior / remaining evidence |
|---|---|---|
| Nested FA error.code lost by shared JSON transport; Blob errors also discard response body | Shared transport, FOLLOW_UP FE-R4-DEP-01 | HTTP statuses 400/401/403/404/409/413/422/429/500/503 are preserved and separately explained. Exact reason becomes HTTP_REASON_UNAVAILABLE; UI says it cannot provide the detailed FA code. No scientific reason inferred; no duplicate auth/fetch workaround or backend change. Needs separately authorized additive shared error-envelope support and live verification. |
| Missing collection member / old unsupported schema | Module3 boundary FIX_IN_SCOPE in BE-R1; FE display FIX_IN_SCOPE | Partial/blocked, missing counters and 422 remain visible; actual API characterization/fixture tests, not a claim all producer exports are repaired. |
| Original source/export missing or outdated at producer | Module2 FOLLOW_UP DEP-M2-01/02 | Validate only delivered boundary; request complete export and authoritative revision/population evidence. Do not modify producer. |
| Internally valid old collection has no authoritative currentness binding | Module3 FOLLOW_UP / FU-M3-02 | UNKNOWN_NO_AUTHORITATIVE_COHORT retained; frontend never upgrades timestamp/COMPLETE into verified/current/frozen. |
| Archived workspace/project writes | Module3 REST FIX_IN_SCOPE in BE-R1; FE handles 403 | Shared role canWrite is a UI affordance, not lifecycle authorization; backend enforces ACTIVE/rechecks. Read history remains separate. Current FE fixture and API tests do not replace a deployed lifecycle E2E test. |
| Legacy/shared role/lifecycle/default-project behavior | Shared/legacy Module3 FOLLOW_UP | No provider/access edits; current shared scope governs history and errors. |
| AnalysisService.freeze impact provenance hardcodes EGO_SPEED_NOT_RELATIVE for xosc15 | Module3 FOLLOW_UP FU-M3-01 | Legacy snapshot/source unchanged. New V3 displays core provenance separately; no claim BE-R1 or FE-R4 repairs historical/legacy labeling. |
| Approved baseline/context/cohort registry and optimizer adapter absent | Module3/domain owners + Module4 FOLLOW_UP | No approval UI/search control/fake partition or dispatch. Eligibility UNKNOWN/BLOCKED; current handoff diagnostic-only. |
| No authorized deployed BE-R1 + migration020 + project test environment verified in this phase | Deployment owner BLOCKED | Live FE→REST→MySQL E2E NOT RUN. Do not use production DB or deploy migrations to manufacture a pass. |

Tests run here are frontend gates plus focused existing Java API/contract tests.
Prior BE-R1 MySQL results are historical evidence only; they were not rerun as a live
frontend integration. No deployed E2E, producer freshness remediation, consumer readiness
or total resolution of the team's integration findings is claimed.

## Files and scope

Production additions: FailureAnalysisV3.tsx, FailureAnalysisV3Report.tsx,
FailureAnalysisV3.module.css, failureAnalysisV3Data.ts under components/analysis and
services/failureAnalysisV3.ts. Existing FA-owned BaselineAnalysisDashboard embeds them
and hides legacy panels only while a UUID result is selected. Legacy content remains.

Tests: analysis-v3.mjs, analysis-v3-ui.mjs, four service-generated fixture files plus
README/generator; run-analysis.mjs adds the two suites. Eleven old browser fixture
routers add only the empty-source response. Documentation/evidence and the FE-R4
execution plan are the remaining changes. Complete per-file inventory and final
`git status --short` are in `fe-r4-evidence/`; pre-existing dirty BE/FE work is not
attributed to FE-R4. Fingerprint comparisons verify no backend/shared/core/producer
file changed in this task.

## FE-R5 readiness checklist — no implementation

- [ ] Provide an authorized deployed REST/MySQL environment, migration020 deployment
  decision, real accounts/projects including archived/read-only states, and actual
  allowed test uploads; run live FE→BE E2E and record exact requests/outcomes.
- [ ] Authorize a shared transport change for nested error.code/retryable and Blob
  errors; preserve current callers/auth expiry and test all FA statuses/reasons.
- [ ] Resolve Module2 export availability/currentness tickets with evidence. Do not
  infer freshness from an old timestamp or seal a cohort in the UI.
- [ ] Decide legacy impact provenance fix/version compatibility separately; preserve
  historical scalars/snapshots and test actual simulator profiles.
- [ ] Define approved baseline/cohort/context and Module4 consumer integration before
  any readiness/dispatch action. This task introduces none.

Stop after FE-R4. FE-R5, optimizer integration and backend remediation remain unimplemented.
