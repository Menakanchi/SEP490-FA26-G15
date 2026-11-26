# Failure Analysis handover instructions

Read README.md first: it consolidates current source map, Admin/legacy analysis,
V3 REST/DB, producer/consumer boundaries, input mapping, run commands and open work.
Repository-root AGENTS.md/CLAUDE.md still apply.

- The production implementation is src/main/java/com/vsos/core/failureanalysis/.
  Do not confuse before-source snapshots, probe classes, old samples or historical
  DESIGN ONLY wording with the current implementation.
- Original eight specs remain mathematical/contract references. Implementation
  status is in current README, ADR-067 and actual source. Generated milestone
  reports/audit/fix evidence are historical Git content, not runtime dependencies.
- The input is completed-run result/collection JSON, not an XOSC scenario file.
  Run identity, variant, seed, repetition, attempt and ON/OFF remain separate.
- Keep canonical producer values, nulls and adr040-stored-aggregation/1. Do not
  use sensor recomputation or failure candidates as replacement optimizer targets.
- An offline handoff with verified schema/digest is not authorization to dispatch.
  Do not flip false flags, fabricate baseline/partitions/ranges/calibration or
  infer v1 from a label/parameter tuple. Missing authority remains UNKNOWN.
- Core clock and recorder clock are not independently aligned by matching t=0.
  Contact count, canonical collision and full-body geometry are distinct claims.
- Future M2 consumer changes require the user's task scope. Module3 REST and DB
  intake exist; M2 consumer/GP optimizer/campaign execution are separate work.
- Use bundled real examples with -Dfa.json.samples as documented. Missing Golden
  or authorized exports must be reported SKIPPED/BLOCKED, never synthesized as PASS.
- Keep handover/examples/inputs and INPUT_PROVENANCE.json unchanged. The Golden18
  handoff under samples/m1c is read by Java tests; HTTP fixtures live under
  frontend/tests/fixtures/fa-v3. External history is not a runtime dependency.
