# Run2499 — direct production CLI acceptance

Input thật: `D:/Downloads/result_run2499_full_dataset.json`, 260672 bytes,
SHA256 `e7957e2467628058453a6724fce09c96ce2ab810d70efcc3e92aaf11a1d7bf81`.
Companion v2: 265802 bytes,
`33c935d8a8075edce3400879ebfd6f543b64fe1b380879eef3719c9899945244`.
Hai file được chạy độc lập qua `OfflineDiagnosticAnalysis` rồi
`OfflineMoboHandoff`, không gọi SampleInputProbe hoặc dựng ZIP/CSV trung gian.

| Assertion | Actual result |
|---|---|
| Identity | run2499, project4 declared, scenario26, variant1033, seed49033, ON, repetition1/attempt1 |
| Canonical RMS jerk | 17.68 m/s³, M/evaluation MATCH |
| Canonical impact | 6.067 m/s, M/evaluation MATCH |
| Canonical stopping | 17.518 m, M/evaluation MATCH |
| Matching recorded contact | 1, admissible, t=3.92 s, world frame16088, target actor258 |
| Recorded precontact relative speed | 6.084 m/s, separate from canonical impact |
| Core stopping trace component | 14.493000000000002 m, conditional projected displacement |
| Modeled stopping tail | 3.024752987697715 m, conditional constant-deceleration tail |
| Stopping replay difference | 0 m after producer rounding, canonical value unchanged |
| Candidate | INEFFECTIVE_BRAKING / SUSPECTED |
| Root cause / physical limit | UNKNOWN / UNKNOWN |
| Baseline identity / confirmed v1 | UNKNOWN; declared AEB33 not verified binding |
| External original-file hashes | UNVERIFIED; container byte SHA computed |
| Core↔recorder alignment / control writer | UNKNOWN / UNKNOWN |

First eligible pedal activity is .57 s; command onset is 2.6 s, decision 2.35 s.
This does not establish a negative actuator delay or an AEB-attributed pedal
sample. Core393, telemetry395 and GT786 records remain separate. Raw GT startup
acceleration spike and diagnostic raw jerk remain distinct from the 17.68 filtered
canonical objective; v2 quality masks/status are retained as source declarations.
Filter/window/producer profile resolution uses the existing core descriptor.

Sample characterization agrees with the previous bridge evidence, but the new
acceptance uses the public production input path. During development an incorrect
double-prefixed contact pointer was observed and fixed in the source-reference
translation boundary. Regression tests cover translated event validity and core
clock/decomposition gating. The initial failed-characterization outputs under
`evidence/run2499-original/` are development evidence, not accepted reports.

Accepted artifacts are indexed by [e2e-results.json](evidence/e2e-results.json);
the `input-0-*` and `input-1-*` directories contain report2499, input manifest,
CSV, handoff, compatibility report and command logs. The final test suite runs
both actual files; missing actual fixtures would explicitly skip, not simulate
integration success.

Handoff preserves all three stored objectives under `members[].recorded_objectives`.
`canonical_sample=null`, baseline score UNKNOWN, partitions DIAGNOSTIC_ONLY,
hints empty and suggested ranges UNKNOWN are expected. Compatibility schema and
digest validation succeed; operational consumer remains NOT_DIRECTLY_CONSUMABLE,
dispatch=false. This is producer-export acceptance, not a MOBO campaign test.
