# Batch04 plan

1. Read contracts/audits/prior fixes and complete reader/caller allocation paths;
   protect all existing files; baseline focused build; size actual Golden18.
2. Reproduce original attack in an isolated 32 MiB JVM; add red boundary tests.
3. Add immutable finite input policy, shared session accounting, bounded byte reads,
   preflight JSON structural limits, bounded CSV/JSONL and explicit input errors.
   Keep math/policy/digest semantics; no extraction or backend integration.
4. Run Batch01/02/03/04, M1A-M1D, real72, independent32, digests/full verify;
   compare valid reports and protected bytes. Document exact limits/limitations.
5. Deliver report and functional campaign plan only; stop before campaign/MOBO.

Plan lives here to follow the user's narrower documentation scope; no active-plan
file or historical documents will be edited.
