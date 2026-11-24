# Production JSON input integration

Scope: Failure Analysis only; direct standalone result and collection JSON into
the existing core, public CLI diagnostics/handoff, bounded input validation,
exact original JSON references, real sample acceptance and regression proof.
No producer/backend/physics/diagnosis policy/MOBO/DB/calibration changes.

1. Inspect exact supplied schemas/contracts/source and preserve hashes/status.
   Run unchanged focused baseline before production edits.
2. Implement bounded JSON adapter, source-layout/identity provenance and shared
   input dispatch. Retain ZIP/directory behavior and historical digests.
3. Route existing CLI core and handoff through input dispatch, with manifest-level
   partial/blocked accounting. No implicit full cohort on invalid members.
4. Add synthetic negative/boundary tests and real public-CLI sample/collections
   tests; run focused/full Maven and original Golden72/32physics/digests.
5. Write mapping/report/CSV/commands/diffs/preservation evidence under
   docs/failure-analysis-v3/json-input-integration; stop after this integration.

Prior task evidence is characterization, not a production adapter. Inputs and all
previous reports remain unchanged. Missing operational authority remains UNKNOWN.

Completed 2026-11-24: JsonInputAdapter + shared CLI dispatch and JSON metadata/
original-pointer mapping; existing physics/diagnosis reused.50new tests pass;
focused912total/910pass/2skip, BUILD SUCCESS; full1639total/1634pass/2existing
OptimizationServiceTest failures/3skip, BUILD FAILURE. All5actualJSONfiles,
6distinctrunIDs/8analyses through public CLIs,5handoffs schema/digest validated,
dispatch=false. Golden72 reports and handoff digest unchanged,32independent
physics/74digests pass.1502protectedpaths:1493unchanged,9existingFAJava changed;
old tests/specs/raw/history/producer/consumer unchanged. No M2/backend integration.
Evidence and seven deliverables:
docs/failure-analysis-v3/json-input-integration/JSON_INPUT_ADAPTER_REPORT.md.
