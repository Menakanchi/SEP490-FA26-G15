# BE-R1 — JSON-first Failure Analysis REST and persistence

User attachment eb3208ea-55bf-4b37-a75e-b6e48f4f638c is the current task.
Preserve all FE-R1/R2/R3 work, legacy APIs and existing core algorithms. No
producer/controller/calibration/optimizer/regression/auth/shared transport edits.
No stage/commit/push/merge, no production migrations or CARLA/optimizer runs.

1. Audit instructions, eight contracts, current JSON/core/backend/schema/tests;
   fingerprint worktree, run actual baseline, verify real2499/1032/1033/1034.
2. Add immutable project-owned byte-source store, bounded intake and synchronous
   orchestration invoking existing adapter/DiagnosticReport/MoboHandoffBuilder.
3. Atomically persist execution/per-member reports/handoff with content/byte
   digests, retry/duplicate semantics and scoped authenticated typed REST reads.
4. Add additive FA-only migration/schema documentation; do not apply to live DB.
5. Run API/security/resource/persistence tests and real JSON integration, core
   regression/build; distinguish mocked storage from live database verification.
6. Deliver backend-integration01–09, actual examples, FE-R4 instructions, logs,
   remaining authority/DB blockers and scope/status evidence. Stop at BE-R1.

No independent authority for approved context/frozen cohorts is implied by JSON
metadata or existing legacy snapshot flags. Preserve blocked diagnostic handoff;
document any unavailable operational-context integration as BLOCKED.

Completed BE-R1 implementation, 2026-11-25. Evidence and exact FE-R4 contract:
docs/failure-analysis-v3/backend-integration/01..09 (named Markdown reports).
Baseline213pass; focused527pass includes real disposable MySQL10 tests;
full clean verify1729total/1720pass/9skip/0fail/error, BUILD SUCCESS;
frontend unchanged regression63pass. No production DB migration or optimizer call.

Team findings classified in report09: missing/old collection boundary and FA-only
archived workspace mutation gate FIX_IN_SCOPE; producer availability/currentness,
legacy AnalysisService impact provenance and shared lifecycle behavior FOLLOW_UP.
Approved context/cohort/consumer M2 remain blocked. No FE-R4/5 work started.
