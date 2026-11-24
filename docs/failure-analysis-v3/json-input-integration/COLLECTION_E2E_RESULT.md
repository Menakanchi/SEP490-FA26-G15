# Actual collection acceptance

All three supplied files in `D:/Downloads/vsos-collections-2026-11-24/`
were read through production CLI entrypoints. Each contains one ON and one OFF
member. All six delivered manifest members produced their own diagnostic report;
no scalar/repetition/actor/clock data was merged across runs.

| File | Bytes | SHA256 |
|---|---:|---|
| vehicsim-variant-1032-collection.json | 473687 | 6eca4da1435bcfb4706408111016f1a21b0520926e593cbd22ee87f412b86bff |
| vehicsim-variant-1033-collection.json | 518003 | a0986fc7d5fdd3bb83452724591a1d80ce41065754e0636727f2c737c00b8799 |
| vehicsim-variant-1034-collection.json | 594409 | ab94207b381f9d8f87dc0ca6382b6aef5b0f92f4a66a41abb953c29b9f1ae1d0 |

Common declarations: project4, scenario26, AEB version33, vehicle5 Sprinter,
carla-0.9.16-xosc15. All repetition/attempt values are1. Four actual parameters
are TTC1.5 s, configured delay.15 s, max8 m/s², buildup20 m/s³. These values
remain context, not a verified baseline tuple or recommended search range.

| Run | Variant | Seed | Mode | Physical outcome | Candidate | Jerk / impact / stopping |
|---|---:|---:|---|---|---|---|
|2498|1032|49032|ON|UNKNOWN|none|null / null / null|
|2510|1032|49032|OFF|UNKNOWN|none|null / null / null|
|2499|1033|49033|ON|COLLISION|INEFFECTIVE_BRAKING, SUSPECTED|17.68 / 6.067 / 17.518|
|2511|1033|49033|OFF|COLLISION|none|null / 13.961 / null|
|2500|1034|49034|ON|UNKNOWN|FALSE_BRAKING, SUSPECTED|21.621 / null / 16.627|
|2512|1034|49034|OFF|UNKNOWN|none|null / null / null|

Units: m/s³, m/s, m. Root cause and physical limit stay UNKNOWN for every member.
No contact does not prove SAFE; no candidate does not mean functional PASS.
OFF legacy/shadow traces do not generate actual functional AEB diagnoses.
Null state/reason objects from each dataset objective are preserved verbatim.
All six M/evaluation triples match, including nulls. Each result/document digest
and four embedded payload digests are checked with the supplied Python JSON
digest profile; external file bytes remain UNVERIFIED.

Every collection has `sealed=false`. Its selection is completed CARLA runs at
export time and explicitly excludes unfinished runs (three per supplied variant).
The adapter's COMPLETE status means **all delivered manifest members accounted
for**, not complete scenario history, review approval or a frozen optimization
cohort. Header metadata/exclusions remain visible in the manifest and JSON source
context. Export-time BASELINE status is not historical v1 confirmation.

Pair lookup requires an unambiguous matching variant/seed/vehicle/simulator/AEB
version/config tuple. The core ImpactAnalyzer still decides evidence comparability;
the producer's groups[].on_off_comparable flag does not confer authority.
Different seed/variant, ambiguous controls and missing pairs abstain; no forced
mitigation score is created.

Three handoffs preserve their exact two-member populations. All members remain
DIAGNOSTIC_ONLY, baseline identity/score UNKNOWN, canonical samples absent,
optimization/validation eligible arrays empty, parameter hints empty and suggested
ranges UNKNOWN. M1D verifies schema/digest and reports consumer integration gaps;
all remain NOT_DIRECTLY_CONSUMABLE, dispatch=false. No synthetic complete
whole-scenario/frozen score is exported.

The final artifacts/commands are indexed in
[e2e-results.json](evidence/e2e-results.json). The CSV
[FUNCTIONAL_TEST_SUMMARY.csv](FUNCTIONAL_TEST_SUMMARY.csv) has eight analysis rows:
six collection runs plus two standalone exports of2499. There are six distinct
run IDs, not eight independent observations or an aggregated cohort.
