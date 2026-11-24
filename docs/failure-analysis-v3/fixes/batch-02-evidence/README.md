# Batch 02 evidence index

Accepted outputs are in `final-confirmation/`; `final-replay/` and root initial
inspection exports are intermediate retained evidence. No audit or Batch01 output
was overwritten.

- `baseline-focused.log`: before production changes, 634 total / 632 pass / 2 skip.
- `independent-probes-before.json`: unchanged original audit probe on Batch01 source.
- `red.log`: first44 Batch02 tests on old source, 31 failures / 13 pass.
- `red-signed-seed.log`: intermediate validator overconstraint, 3 tests / 2 failures.
- `focused-accepted-final.log`: 713 total / 711 pass / 2 skip, jar BUILD SUCCESS.
- `full-accepted-final.log`: 1440 total / 1435 pass / 2 known failures / 3 skip.
- `final-confirmation/independent-probes-post-signed-seed.json`: original probe
  re-executed after the final production edit; identical corrected observations.
- `final-confirmation/diagnostics/`: 72 actual Golden18 raw-artifact replay reports.
- `final-confirmation/GOLDEN18-audited-{handoff,compatibility}.json`: actual offline
  Golden18; baseline UNKNOWN, consumer NOT_DIRECTLY_CONSUMABLE, dispatch=false.
- `final-confirmation/SYNTHETIC-*`: synthetic positive/negative schema/claim fixtures,
  never production baseline or operational readiness.
- `final-confirmation/KINEMATIC-ACTUAL-PRODUCER-*`: actual Simulator model output
  with minimum synthetic recorder/context. No CARLA execution or real baseline.
- `final-confirmation/golden72-{summary.json,review.csv}`, `independent-math-checks.json`,
  `digest-verification.json`: independent oracle/math/byte/hash review results.
- `cross-jvm-schema-digest.json`: two JVMs reading identical serialized negative
  input; both byte/semantic input hashes and compatibility digest agree. Initial
  `schema-digest-jvm1/2.txt` rebuilt separate fixtures and are uncontrolled attempts.
- `protected-before.json`, `protected-after.json`, `final-state-verification.json`:
  910 existing files checked, 903 unchanged, 7 authorized source edits; old tests,
  raw data, eight contracts, audit and Batch01 history unchanged.
- `production-source.diff`, `new-regression-test.diff`, `diff-stat.json`: actual
  changes against saved pre-edit source; Git trees were already untracked.
- `verification/`: replay and validation scripts. Original audit probe remains at
  `../../final-audit/verification/FinalAuditProbe.java` and is only compiled/read.

No claim that the full project build passes. Missing authorized exports and
operational calibration/consumer integration remain external dependencies.
