# Failure Analysis V3.1 — correctness fixes FA-001…004

Authorized scope: fix only the four HIGH findings from final-audit. Preserve the
eight contracts, original audit, Golden18 oracle/raw results, canonical metrics,
controller/simulator/calibration/backend/MOBO. No campaign/DB/commit/push/merge.

1. Read contracts, actual source and independent reproductions; snapshot inputs
   and source before edits; run focused baseline.
2. Add actual-pipeline regression tests and execute them against old production
   source, recording failures before implementing fixes.
3. Gate functional mode/event times; validate stopping trace/window; separate
   contact authority/scalar from reconstruction support; validate collisions as
   individual events with claim-local quarantine.
4. Rerun regression/probes, all M1A–M1D focused tests, actual Golden18 E2E and
   independent mathematics, then full Maven verify. Keep pre-existing failures.
5. Verify canonical/null/outcome/hash/reference/digest invariants, archive actual
   source diff and deliver docs/failure-analysis-v3/fixes/FIX_BATCH_01_REPORT.md.

Evidence: docs/failure-analysis-v3/fixes/batch-01-evidence/. Stop after this batch;
FA-005…010 remain outside scope.

Completed: seven FA production files changed, one regression test class with
44invocations. Validated red run on old source37tests/31fail; final focused634tests/
632pass/2skip. Final full1361tests/1356pass/2pre-existing OptimizationServiceTest
failures/3skip. Original probes6/6resolved checks; Golden18 72/72oracle match,
31COLLISION/41UNKNOWN/12disagreements,216canonical scalar/null values preserved;
independent math32/32, semantic digests74/74. Report contains actual diff, logs,
source/raw/audit/contract preservation and remaining external dependencies.
No fixes beyond FA-001…004, no campaign/DB/commit/push/merge.
