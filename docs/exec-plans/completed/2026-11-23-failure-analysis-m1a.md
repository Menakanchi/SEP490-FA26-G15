# Failure Analysis V3.1 / M1A

Authorized scope: read-only Java evidence/identity and canonical objective reader.
No controller, evaluator, canonical metric, database, API or optimizer changes.

1. Read eight V3.1 contracts, six audits and real Golden18 metadata.
2. Implement artifact adapter, validation, objective/provenance and baseline readers,
   with an offline report writer using existing JDK-only MiniJson.
3. Exercise malformed/missing/conflicting evidence and all 72 real runs.
4. Run Maven verification, generate a real sample, document coverage and blockers.

Acceptance: OA-01, HF-01 and the available M1A scope of HF-02/03; explicitly
skip unavailable authorized DB/frozen-dataset fixtures. Preserve raw hashes.
Completed M1A only. Final focused verify: 134 tests, 132 passed, 2 explicitly
skipped for unavailable authorized HF-02/HF-03 integration fixtures. Real Golden18:
82 tests passed, covering all 72 runs. Full clean verify found two existing
OptimizationServiceTest failures, both reproduced on an isolated HEAD archive
without M1A. No existing source changes; no raw/audit changes.
Verification commands, sample reports and limitations are recorded in
`docs/failure-analysis-v3/M1A_IMPLEMENTATION_REPORT.md`.
