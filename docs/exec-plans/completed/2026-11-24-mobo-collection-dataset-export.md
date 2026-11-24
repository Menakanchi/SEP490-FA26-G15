# Offline collection dataset export and consumer check

User requested one complete dataset file from the three supplied real collections
to check MOBO input compatibility. No backend/MOBO/controller/database changes,
campaign, fabricated baseline, reviewer approval, freeze or safe labels.

1. Read collection ADR, raw collections, current AnalysisService freeze/sample,
   AnalysisMetrics, OptimizationController request and engine boundary.
2. Validate all six document/embedded digests, identities, null/NA and streams.
3. Export one self-contained file retaining all source collections, six actual
   reports, observed identities/config/objectives, sourced domains and a proposed
   variant-disjoint optimization/validation split. Preserve unverified authority.
4. Exercise actual Java consumer DTO and AnalysisService selection predicates
   offline; enumerate all splits and report the exact blockers. No optimizer call.
5. Verify output digests, inputs/source preservation and report results honestly.

Initial finding: only2498 is SAFE under AnalysisService.outcome;2500 has legacy
evaluation SAFE but false_activation=true, so freeze treats it FALSE_BRAKING.
No split can retain a SAFE run in each disjoint partition with only one SAFE run.

Completed export/compatibility assessment (not operational integration):

- D:/Downloads/mobo_dataset_scenario26.json includes all6 real source documents,
 6diagnostics, IDs/configs/objectives, sourced engine bounds and proposed opt2499/
 2500 vs validation2498, OFF2510/2511/2512 diagnostic-only.
-219/219 input checks and89/89 export assertions pass. M1D verifies schema and
 integrity; current consumer remains NOT_DIRECTLY_CONSUMABLE, dispatch=false.
- Actual current OptimizationRequest accepts known scenario/baseline/search-space
 fields under Spring-builder defaults but drops cohort/dataset fields. Actual
 OptimizationService helper rounds canonical metrics differently.
- All6 possible nonempty variant-disjoint ON splits fail the available freeze
 predicates because there is only1 SAFE under the current classifier.
-1256 protected source/contracts/history paths unchanged. No optimizer, DB,
 simulator, production edits or git commit/push. Evidence and commands are in
 docs/failure-analysis-v3/fixes/collection-dataset-export/REPORT.md.
