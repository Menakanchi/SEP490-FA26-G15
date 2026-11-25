# FE-R3 — Results and investigation

Scope: Failure Analysis frontend only. Preserve FE-R1/FE-R2 worktree, stored
canonical values, routes, request isolation and dataset selection/freeze. No
backend/API/physics changes, no core V3 REST facade, no FE-R4/5, no commit.

Baseline HEAD: d712146c2ee03de8d751725c506eb1d4a814d2d8. SHA-256 snapshot of
2446 tracked and34 existing untracked files: task-local temporary
`fa-fe-r3-source-hashes.json`. Baseline units52/52; explainability and workflow
browser suites PASS on existing production build, HTTP fixtures only.

1. Verify result API and producer/profile provenance against source and audit.
2. Organize identity, recorded outcome, objectives, legacy assessment and limits;
   keep detailed investigation collapsed with honest clock/source attribution.
3. Add runtime rendering guards and regression tests, preserve existing gates.
4. Run units, lint, TypeScript, production build and browser fixture suites;
   capture desktop/mobile evidence and source-scope comparison.
5. Deliver FE_R3_IMPLEMENTATION_REPORT; stop at FE-R3.

Live backend/test DB, Figma, native screen-reader/touch testing are not supplied;
report these separately from browser fixture verification.

Completed25/11/2026. Result hierarchy, legacy-only assessment boundary, unverified
metric provenance/reference inputs, source/writer/clock limits and rendering
guards implemented. Canonical scalar/null formatting and FE-R1/R2 state preserved.

Final verification:63/63 units ×2,11/11 browser suites ×2,16/16 new acceptance
groups each pass. Lint0errors/warnings, TypeScript exit0, production build exit0;
RepoDocsTest5/5. Real browser controls with HTTP fixtures only; live backend/DB,
Figma and native accessibility remain unverified. No CARLA/optimizer execution.

19 existing tracked files changed within frontend FA scope;34 existing untracked
files preserved byte-for-byte. Added1 pure production helper and3 test files.
No backend/contracts/selection/freeze/playback/shared-provider changes, no staging
or commit. Six before/after screenshots, hashes and detailed results in
[FE_R3_IMPLEMENTATION_REPORT](../../failure-analysis-v3/frontend-redesign/FE_R3_IMPLEMENTATION_REPORT.md).
Intermediate failed harness runs retained separately; only release-complete is
the final two-pass gate. Stop at FE-R3.
