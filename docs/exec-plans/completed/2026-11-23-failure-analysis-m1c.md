# M1C — offline MOBO handoff

Scope: implement the V3.1 handoff builder, canonical aggregation, reviewed dataset
manifest, eligibility, sourced bounds and suspected parameter hints. No optimizer
dispatch, backend/DB/API changes, physics changes, M1D or M2.

Inputs read: eight V3.1 specifications, M1A/M1B implementation reports, six audit
reports, existing failureanalysis source, AnalysisMetrics/AnalysisService,
OptimizationService/MoboEngine/ParameterBounds, BootstrapService catalog, metric
contract and applicable ADRs. Source supersedes stale claims that MOBO is absent;
its V3.1/frozen-cohort consumer is absent.

Steps:

1. Fingerprint existing source, documents, reports and actual Golden18 ZIP; run
   full baseline verification before edits.
2. Add pure JDK/core builder with explicitly versioned offline snapshot inputs.
   Reuse M1A binding/reader and AnalysisMetrics.aggregate; no implicit authority.
3. Test positive synthetic binding, missing/invalid data, partition leakage,
   quality/domain gates, hints and deterministic digests. Exercise real 72 runs.
4. Run focused verify and full verify, generate new sample sidecars, compare
   protected hashes, and document exact results and consumer gaps.

Completed 24/11/2026. Six new Java sources, four test classes plus one synthetic
fixture utility; no existing source/test/design/audit/raw changes.

Verification: baseline full 1020 =1015 pass/2 fail/3 skip. Final focused verify
455 =453 pass/0 fail/2 skip with JAR success; new M1C162/162 pass including actual
Golden18 84 checks. Final full1182 =1177 pass/2 fail/3 skip. The same two existing
OptimizationServiceTest Mockito failures remain outside scope. HF02/HF03 external
integration fixtures remain absent; synthetic positive binding is separately labeled.

Actual72-run Golden handoff and synthetic-only positive handoff were generated;
JDK checker verified both content digests and1689 registered source refs. Protected
hashes found zero old file changes. No M1D/M2/consumer dispatch was performed.

Details, commands, acceptance matrix, input schemas and consumer gaps:
[M1C_IMPLEMENTATION_REPORT](../../failure-analysis-v3/M1C_IMPLEMENTATION_REPORT.md).
