# Failure Analysis database-direct input

Scope: Module3 only; Module2/storage/controller/scientific core/shared security read-only.
Baseline:2610existing source/document file hashes in TEMP/fa-db-direct-baseline.json;
70frontend unit tests and26existing focused Java tests pass before edits (see logs).

1. Confirmed simulation_runs has scalar/telemetry projections; original JSON is
   simulation_artifacts.RESULT_FILE/storage_url -> configured dataRoot/runs/id/result.json.
   Collection is not a stored DB JSON; producer export can reconstruct missing dataset,
   which this task deliberately must not invoke.
2. Add Module3 read-only repository + safe original-byte DB source adapter. Wrap original
   documents with actual DB membership; keep missing members/repetitions and provenance.
3. Persist source/report/handoff via existing BE-R1 store, additive project-scoped APIs.
4. Prioritize database selection in existing frontend; old JSON APIs remain advanced.
5. Actual isolated MySQL with original producer fixtures; boundary/auth/digest tests,
   frontend legacy + V3 + database browser gates, lint/type/build/full Java checks.
6. DB_DIRECT_INPUT_IMPLEMENTATION_REPORT with precise real-data vs fixture/live blockers;
   no production DB writes, producer edits, CARLA/MOBO/campaign/commit/push/merge.

Completed 2026-11-25: DB source adapter + six additive routes + primary database picker.
Focused Java51/51 and BE-R1 actual MySQL10/10 pass. Full verify1745 total/1729 pass/16 skips,
0 failures/errors; frontend73/73 units and13/13 browser suites pass; lint/tsc/build pass.
Actual DB source tests use restored provided CARLA data; browser HTTP fixtures only,
not live browser/REST/MySQL E2E. Module2/core/shared security/schema unchanged.
See docs/failure-analysis-v3/backend-integration/DB_DIRECT_INPUT_IMPLEMENTATION_REPORT.md.
Stopped disposable MySQL after tests; owned frontend server stopped after capture.
No production DB access, implementation outside Module3, CARLA/MOBO run, commit/push/merge.
