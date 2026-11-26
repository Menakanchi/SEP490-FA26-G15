# Failure Analysis: backend-first frontend audit

Scope: read-only production source audit; create nine blueprint documents under
`docs/failure-analysis-v3/frontend-redesign/`. Do not implement FE-R1 or change
backend, contracts, database, shared shell or other modules.

Baseline: HEAD `d712146c2ee03de8d751725c506eb1d4a814d2d8`; clean worktree.

- [x] Read user task, repository guidance and discover actual REST/core boundary.
- [x] Complete service/API/DB/security and module-local frontend inventory.
- [x] Run existing focused checks and distinguish offline/mock from live coverage.
- [x] Write capability matrix, inventory, UX, blueprint, dependencies and staged plan.
- [x] Validate document links, diff and unchanged production hashes; stop before FE-R1.

Key finding to verify throughout: the new evidence core and JSON adapter are
offline-only; existing Analysis REST services expose legacy views and dataset v2.

Completed 25/11/2026. Nine deliverables start at
[backend capability audit](../../failure-analysis-v3/frontend-redesign/01_BACKEND_CAPABILITY_AUDIT.md).
Proposed IA: two primary pages, existing playback deep route, secondary legacy
lookup/export review; no fake JSON analysis or optimizer dispatch on the web.

Verification: focused Java84/84, real bundled JSON integration11/11, RepoDocsTest5/5;
all100passed,0failure/error/skip. Frontend unit48/48passed after npmci restored
missing TypeScript dependency (initial attempt failed at module loading).
No browser/live DB/full suite/CARLA/optimizer execution. Detailed commands and
limitations are in [implementation plan](../../failure-analysis-v3/frontend-redesign/08_IMPLEMENTATION_PLAN.md).

All88local references in the nine deliverables resolve. Before/after SHA256
comparison of626tracked src/frontend/database/pom.xml files found0changes.
Only new audit documentation and this required execution record were added.
No stage/commit/push/merge. FE-R1 has not started.
