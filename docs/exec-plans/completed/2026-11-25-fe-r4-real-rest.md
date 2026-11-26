# FE-R4 — Real V3.1 REST integration (completed)

Task: attachment9426c0e4-7a06-4408-932b-0a4e2f4e2e77.
Strict FA frontend scope; preserve earlier FE-R1/2/3 and BE-R1 changes.
HEAD remains d712146c2ee03de8d751725c506eb1d4a814d2d8.

- Read actual REST/core/shared frontend contracts and local Next16 instructions.
- Baseline:63/63 frontend unit tests;2539existing file fingerprints captured.
- Added FA-specific client/typed guards, original-byte upload/download, source selection,
  immutable execution/member/report/handoff views in existing workspace.
- Preserve numeric legacy routes/drafts/snapshots and query context. Guard stale
  source/account/project/navigation responses. No scientific calculation in frontend.
- Full regression:70/70 units,12/12 browser suites including17new acceptance groups.
- Final API ID guard: repeated70units +17V3 browser groups against rebuilt app.
- Final lint/TypeScript/build pass. Existing Java API tests14/14 pass.
- Live FE→REST→MySQL BLOCKED. Shared transport nested FA reason codes FOLLOW_UP;
  producer availability/freshness and legacy impact provenance remain separate tickets.
- FE_R4_IMPLEMENTATION_REPORT and evidence include screenshots/logs/scope/git status.
- No backend/shared/API/DB/core/producer/optimizer edits or migration deployment.
  No branch/stage/commit/push/merge. Stop before FE-R5.