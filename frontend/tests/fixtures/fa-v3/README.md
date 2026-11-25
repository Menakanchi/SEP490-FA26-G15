# FE-R4 fixture provenance

These are **BROWSER_FIXTURE_ONLY**, not a deployed REST/MySQL environment and not
production-ready datasets. The original producer inputs and historical results are unchanged.

`GenerateFixtures.java.txt` is the exact temporary fixture-generation source used on
2026-11-25. It invokes the existing, unchanged `FailureAnalysisService` and actual
Failure Analysis core with the existing **test-only** `FailureAnalysisMemoryStore`.
It is documentation/test tooling, not a Java production source or API implementation.
Run it as `FeR4Fixtures.java` using the Maven test runtime classpath after `test-compile`.
Its output directory is this directory; regeneration intentionally replaces only these
four generated fixture JSON files. Resource UUIDs and timestamps change on regeneration.

| Fixture | Input | What is real / synthetic |
|---|---|---|
| collection | handover/examples/inputs/vsos-collections-2026-11-24/vehicsim-variant-1033-collection.json | Actual producer bytes; actual service/core outputs; two separate ON/OFF reports |
| standalone | handover/examples/inputs/result_run2499_full_dataset_v2.json | Actual producer bytes; actual service/core outputs; one report |
| partial | In-memory copy of collection with the second `runs` entry removed | Explicit synthetic missing-input test; original manifest retained; actual backend accounting and blocked handoff |
| blocked | In-memory copy of collection with `runs=[]` | Explicit synthetic missing-input test; actual backend accounting; no report/handoff payload |

Paths above are relative to `docs/failure-analysis-v3/`. Project 1/user 7 are test
storage ownership, not independently verified producer/core baseline bindings.
`sourceBase64`, `reportBytesBase64` and `handoffBase64` preserve the actual stored
bytes, including numeric lexical representation and whitespace. The browser fixture
serves those bytes directly. Parsing for assertions never replaces downloaded bytes.

Browser contract routing is test-only in `analysis-v3-ui.mjs`; production code imports
no fixtures, performs no mocking, and uses the real authenticated shared transport.
Separate malformed/schema/null/HTTP negative fixtures are explicitly constructed by
the unit tests and do not create new producer ground truth.
