# Failure Analysis V3.1 / M1B

Authorized: implement pure Java diagnostic physics, policy and objective explanation.
Preserve M1A and producer/controller/evaluator/optimizer/database/frontend code.

1. Read eight contracts, six audits and M1A; snapshot input files and run baseline.
2. Implement independently testable G01-G04, P01-P05, T01-T02, I01, Q01-Q02.
3. Compose a separate M1B DiagnosticReport from M1A evidence. Keep canonical values.
4. Test analytic cases and all 72 real Golden18 runs, including disagreements and
   conditional nominal/applied geometry. No synthesized Golden18 fallback.
5. Run focused verify and full suite, generate real sidecars and coverage report.

Baseline focused verify: 134 tests, 132 pass, 2 authorized-fixture skips, JAR build
success. Full baseline suite is recorded in target/m1b-baseline-full.log.
Inputs are fingerprinted in target/m1b-before.json. All M1A files remain unchanged.
Completed M1B: 12 new source files, 4 test files, actual offline reports.
Final focused verify: 293 tests, 291 pass, 2 existing authorized-fixture skips;
JAR/repackage success. Full baseline: 861 tests, 2 existing failures, 3 skips.
Final full suite: 1020 tests, 1015 pass, same 2 failures, 3 skips.
M1B alone: 159/159 tests pass, including all 72 real Golden18 runs.
72 serialized report digests and 5 real-input sample replays verified.
909 pre-existing file fingerprints unchanged. All M1A source/tests preserved.
P05 screening is conditional; numerical/exhaustive physical certification deferred,
never a physical-limit claim. Detailed coverage and evidence mapping are in
`docs/failure-analysis-v3/M1B_IMPLEMENTATION_REPORT.md`.
Stopped after M1B. No CARLA, DB/API writes, optimizer dispatch, commit, push or merge.
