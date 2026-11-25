# Test results and reproduction

JDK21/Maven wrapper, Windows PowerShell; actual Golden ZIP and all five JSON
exports available. No CARLA, optimizer campaign, DB or network API was started.

## Actual executions

| Execution | Total | Pass | Fail | Error | Skip | Result |
|---|---:|---:|---:|---:|---:|---|
| Unchanged focused baseline before edits |862|860|0|0|2|BUILD SUCCESS|
| New JSON unit/edge tests, final |39|39|0|0|0|PASS|
| Actual JSON integration tests, final |11|11|0|0|0|PASS|
| Final focused verify, existing + JSON |912|910|0|0|2|BUILD SUCCESS, JAR/repackage|
| Full clean Maven verify |1639|1634|2|0|3|BUILD FAILURE, existing OptimizationServiceTest failures|
| Actual JSON public-CLI input files |5|5|0|0|0|8 report executions,6 distinct run IDs|
| Actual collection manifest members |6|6|0|0|0|one report per member,3ON/3OFF|
| Golden18 per-run oracle |72|72|0|0|0|54ON/18OFF, all scalar/null/timeline/candidate assertions preserved|
| Independent exact-model physics checks |32|32|0|0|0|Independent integration/math oracle|
| Golden report/handoff/compatibility digests |74|74|0|0|0|No stale/mismatched digest|

Final focused legacy coverage includes Batch01=44, Batch02=79,
Batch03=72context+8dossier=80, Batch04=69, all PASS. M1A–D, canonical aggregation,
hints/bounds, isolation, metrics, architecture and docs tests remain passing.
The count table is derived from each command's terminal summary, not a sum of
stale XML files from different runs. See [test-results.json](evidence/test-results.json).

Skipped: M1AAuthorizedFixtureTest HF-02/HF-03 lack actual authorized export
fixtures (2 skips, focused and full); KinematicParityFullTest is disabled by its
existing annotation (additional full-suite skip). They are not PASS and were
not replaced by synthetic approval evidence.

Full-suite failures, unchanged outside this package:

- OptimizationServiceTest.executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt
- OptimizationServiceTest.executeOptimization_refusesToRunOnADifferentSimulatorThanItWasCreatedFor

These are the same pre-existing failures documented in M1A–M1D and Batch04.
The services/tests were not edited. Full build is therefore **not green**;
focused FA build, compile and packaging succeed. Full log:
[full-final.log](evidence/full-final.log).

## Commands

The exact focused list is:

```powershell
$faJsonTests = 'JsonInputAdapterTest,JsonInputIntegrationTest,Batch04ResourceTest,Batch03ContextTest,Batch03DossierRegressionTest,Batch02RegressionTest,HighSeverityFindingsRegressionTest,ConsumerCompatibilityValidatorTest,M1DConsumerCharacterizationTest,M1DGolden18IntegrationTest,CanonicalAggregationTest,MoboHandoffBuilderTest,ParameterHintsAndBoundsTest,M1CGolden18IntegrationTest,PhysicsFormulaTest,EvidenceAndAvoidabilityTest,M1BPartialEvidenceTest,M1BGolden18IntegrationTest,M1AEvidenceTest,Golden18IntegrationTest,M1AAuthorizedFixtureTest,CoreIsolationTest,AnalysisMetricsTest,RepoDocsTest,ArchitectureRulesTest'
.\mvnw.cmd -B "-Dtest=$faJsonTests" '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify
.\mvnw.cmd -B clean '-Dgolden18.zip=D:/Downloads/golden18_raw_artifacts.zip' verify
```

Baseline used the same existing test list without the two new classes and
`clean verify`. Final full clean verify ran before the final focused packaging
verification, on the same final Java source. Logs:
[baseline](evidence/baseline-focused.log),
[focused final](evidence/focused-final-accepted.log).

Actual CLIs and independent evidence runner:

```powershell
python docs/failure-analysis-v3/json-input-integration/evidence/run_public_e2e.py NEW_EVIDENCE_DIRECTORY_NAME
python docs/failure-analysis-v3/json-input-integration/evidence/verify_state.py
git status --short
```

E2E creates new outputs and asserts exact stored values, identities, modes, null
metadata, contact/stopping characterization, document/payload consistency,
handoff population/schema/digest and no dispatch. It also replays the unchanged
Golden ZIP public CLI and uses the previous independent oracle with only its
output-directory constant changed. Audit probe is compiled into a separate
directory with javac so it shares the test-fixture classloader; it does not run
CARLA. Exact argv/exit/logs for every Java/subprocess are in
[e2e-results.json](evidence/e2e-results.json).

## Synthetic negative/boundary scope

JsonInputAdapterTest checks invalid JSON/duplicates/unsupported schemas,
missing dataset/identity/sequence/mode, wrapper/source/variant/seed conflicts,
canonical invalid type/missing/copy disagreement, exact original table pointers,
unverified external hashes, absent lifecycle/baseline, multi-variant/seed/repetition
preservation, unique/missing/ambiguous OFF lookup, duplicate/missing manifest
members, stale document and embedded digests, independent container hash mismatch,
invalid actor/contact/clock/precontact/table shape, translated event gates,
null reasons/state conflicts, missing manifest, unknown digest profile, resource
byte/population limits and producer profile/consistency conflicts even with a
pinned container. These are synthetic assertions, not new physical ground truth.

JsonInputIntegrationTest uses both actual2499 exports and all3 actual collections
through public CLIs (5 invocations), plus6 actual-schema mutation invocations for
bad core clock, raw GT spike, out-of-episode contact, bad precontact, collision
copy disagreement and distinct null reason. The conservative core deliberately
still reports a matching positive contact when canonical collision is false,
with OPEN disagreement and RECORDED_MATCHING_CONTACT basis; this is the existing
policy, not a new authority selected by the adapter.

During development, one test compilation error and immutable synthetic-table
mutation errors were corrected. A collision-disagreement assertion was corrected
after inspecting DiagnosisPolicy.outcome: positive matching contact remains an
observed COLLISION while source disagreement stays OPEN. Source diagnosis was
not changed to match an invented expectation. Earlier logs/outputs remain under
evidence as development history; accepted evidence is indexed by e2e-results.json
and focused-final-accepted.log, not the earlier failed attempts.

## Preservation and operational scope

Golden72:31 COLLISION/41 UNKNOWN,12 disagreements,216 canonical values/nulls,
42 stopping replays,0 confirmed roots. All72 report input/report/content digests
and historical handoff content digest are unchanged.978 archive member byte
sizes/hashes are checked by the independent oracle. Actual JSON input byte hashes
are checked before/after; protected source/history hashes are separately verified.

JSON handoff schema/digest validation PASS does not imply frozen cohort,
authorized baseline/currentness, approved ranges/calibration or execution by a
real consumer. Every actual handoff remains NOT_DIRECTLY_CONSUMABLE with dispatch
false. No precision/recall or causal accuracy is reported without independent
ground truth. See [remaining dependencies](REMAINING_DEPENDENCIES.md).
