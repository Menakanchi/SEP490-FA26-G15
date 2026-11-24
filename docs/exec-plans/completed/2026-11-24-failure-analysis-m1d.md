# M1D — Offline consumer compatibility validation

Scope: add offline compatibility validation, real-helper characterization tests,
Golden18/synthetic reports, implementation report and proposed M2 change plan.
No consumer/metric/controller/DB/API changes, campaign, CARLA, commit or M2.

1. Read V3.1 contracts, M1A/B/C reports and actual consumer sources; fingerprint
   existing files and run full baseline tests before implementation.
2. Validate handoff schema/digests, exact identity/partition projection, canonical
   replay, baseline freshness, validation isolation, hints and sourced bounds.
3. Pin source inspection to the audited consumer revision; characterize the real
   private aggregation helper in tests without executing campaign orchestration.
   Changed/missing source evidence stays UNKNOWN, never inferred compatible.
4. Run focused/full suites, generate new compatibility sidecars, compare protected
   hashes and document actual blockers and M2 changes without implementing them.

Baseline full verify: 1182 tests, 1177 pass / 2 pre-existing OptimizationServiceTest
failures / 3 skips. Completion evidence will be linked here.

Completed M1D only. Added3 core/JDK production classes,3 test classes+1 actual
helper probe utility,4 JSON samples, implementation report and proposed M2 plan.
No pre-existing file changed/deleted (553 SHA256-protected files), including raw
ZIP, eight specs, audit/history and all prior phase source/tests. Java addition
diff: target/m1d-source.diff,7 files/818 lines.

Verification:
- M1D135/135 pass; Golden18 integration79/79, actual72 members intact.
- Focused verify590:588 pass,0 fail/error,2 prior authorized-fixture skips;
  BUILD SUCCESS including package/repackage.
- Full verify1317:1312 pass,2 same baseline OptimizationServiceTest failures,
  0 errors,3 prior skips. Full build remains FAILURE; no unrelated fix attempted.
- Three sample content digests and738 registered source references: PASS.
- Golden18 and both synthetic reports NOT_DIRECTLY_CONSUMABLE/dispatch=false.
  Positive SUSPECTED hint and negative ABSTAIN tested without relaxing gates.

Evidence: [M1D report](../../failure-analysis-v3/M1D_IMPLEMENTATION_REPORT.md),
[M2 design only](../../failure-analysis-v3/M2_CHANGE_PLAN.md), target/m1d-*.log,
target/m1d-protected-check.json and target/m1d-sample-check.json.
STOP: no M2 implementation/campaign/DB/API change/commit.
