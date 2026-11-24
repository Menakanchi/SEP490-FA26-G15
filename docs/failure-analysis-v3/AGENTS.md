# Failure Analysis handover instructions

Read README.md first, then the relevant handover/MODULE_2_JSON_PRODUCER.md or
handover/MODULE_4_MOBO_CONSUMER.md and handover/ARCHITECTURE_AND_STATUS.md.
Repository-root AGENTS.md/CLAUDE.md still apply.

- The production implementation is src/main/java/com/vsos/core/failureanalysis/.
  Do not confuse before-source snapshots, probe classes, old samples or historical
  DESIGN ONLY wording with the current implementation.
- Original eight specs remain mathematical/contract references. Implementation
  status is in current README/handover/JSON integration report and actual source.
- The input is completed-run result/collection JSON, not an XOSC scenario file.
  Run identity, variant, seed, repetition, attempt and ON/OFF remain separate.
- Keep canonical producer values, nulls and adr040-stored-aggregation/1. Do not
  use sensor recomputation or failure candidates as replacement optimizer targets.
- An offline handoff with verified schema/digest is not authorization to dispatch.
  Do not flip false flags, fabricate baseline/partitions/ranges/calibration or
  infer v1 from a label/parameter tuple. Missing authority remains UNKNOWN.
- Core clock and recorder clock are not independently aligned by matching t=0.
  Contact count, canonical collision and full-body geometry are distinct claims.
- Future M2 consumer changes require the user's task scope; this handover does
  not implement an API/import endpoint, GP optimizer or campaign execution.
- Use bundled real examples with -Dfa.json.samples as documented. Missing Golden
  or authorized exports must be reported SKIPPED/BLOCKED, never synthesized as PASS.
- No source/test Java was removed or changed during this handover cleanup.
  The curated overlay ZIP is for the matching complete repository, not a standalone
  Maven project. External backup/history is optional, not a runtime dependency.
