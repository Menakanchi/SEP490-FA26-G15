# Final technical audit — read-only work plan

Scope: independently review M1A–M1D source, tests, eight specifications, prior
audit evidence and actual Golden18. Production fixes/M2/backend/optimizer changes
are forbidden. All new audit scripts/logs/reports stay in this folder; Maven may
write normal build outputs to target. Existing files are SHA256 protected.

1. Inventory and read contracts/source/test/producer semantics. Trace formula
   helpers into the actual DiagnosticReport call graph, not method existence alone.
2. Re-run focused and full Maven verify. Keep full-suite failures distinct from
   correctness claims and inspect test effectiveness independently.
3. Write verification-only probes for independent numeric oracles, negative
   evidence/geometry/time/identity paths and real72-run offline E2E.
4. Record reproducible findings with source line ranges and owners; distinguish
   Failure Analysis defects from data/calibration/consumer dependencies.
5. Deliver ten requested reports, evidence matrix, raw/source immutability proof,
   exact command/results and a bounded verdict. Stop without fixing production.

Completed 2026-11-24: all ten reports written. Focused verify590total/588pass/2skip;
full verify1317total/1312pass/2fail/3skip. Independent mathematics32/32; actual
Golden18 E2E72reports,216canonical scalar/null values preserved,74semantic digests
verified. Negative audit probes reproduce validity/contact/schema/reference defects;
bounded resource probe records OOM. Ten FA findings and five external dependencies
have source lines, evidence and ownership in report10. Verdict NOT_READY.

Final state verification script checks498protected files unchanged, no tracked or
staged diff, report completeness/links and exact test totals. No fixes, CARLA,
optimizer campaign, DB mutation, stage, commit, push or merge performed.
