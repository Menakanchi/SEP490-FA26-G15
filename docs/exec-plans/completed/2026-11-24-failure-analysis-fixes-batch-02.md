# Failure Analysis V3.1 — fixes FA-005/006/008

Scope: path/type-aware handoff EV schema, typed candidate/hypothesis references,
producer-specific metric provenance/explanation. Preserve Batch01 and contracts,
raw/history/canonical math; no FA-007/009/010, backend/optimizer/calibration changes.

1. Snapshot before state, run focused baseline and original negative audit probe.
2. Read actual producers/contracts/callers; add regression tests and record red
   on unchanged production source.
3. Implement only the three authorized fixes, with unchanged digest profiles.
4. Run new/Batch01/M1A–M1D tests, Golden18 replay, independent32math/digests, full
   verify and protected-file checks. Keep pre-existing failures/skips explicit.
5. Deliver FIX_BATCH_02_REPORT.md plus separate batch-02-evidence and stop.

Completed 2026-11-24. Evidence: docs/failure-analysis-v3/fixes/FIX_BATCH_02_REPORT.md
and fixes/batch-02-evidence/. Baseline634/632pass/2skip; red44/31fail;
new tests79/79; Batch01 44/44; final focused713/711pass/2skip SUCCESS;
full1440/1435pass/2existingfail/3skip FAILURE. Golden72/72 original oracle,
31 COLLISION/41 UNKNOWN, 216 scalars/null unchanged; independent32 math and
74 digests pass. Protected910 files:903 unchanged,7 authorized changes; new
schema validator and one test class. No backend/producer/calibration/DB edits.
Stop after FA-005/006/008. FA-007/009/010 and external operational owners remain.
