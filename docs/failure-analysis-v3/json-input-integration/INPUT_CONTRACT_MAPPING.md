# Production JSON → Failure Analysis evidence mapping

Adapter `fa-json-input/1`, 2026-11-24. Supported exact formats:
`vehicsim.result/v1` with `dataset.format=vehicsim.run-dataset/v1`, and
`vehicsim.run-collection/v1` containing `runs[{run_id,result}]` plus manifest.
This is result intake, not XOSC import or a backend dataset API.

`P` below is empty for standalone; for collection member i it is
`/runs/i/result`. Every pointer is relative to the **original container**, not a
serialized normalized view. JSON pointer escaping is RFC6901 (`~0`, `~1`).

## Exact compatibility matrix

| Original JSON path after P | Source → evidence/consumer | Unit / clock / frame | Validation and null behavior | Provenance |
|---|---|---|---|---|
| `/format`, `/dataset/format` | Result envelope → result Artifact | none | Exact supported versions; missing/wrong dataset blocks member | Original result retained, no synthesized fields |
| `/dataset/identity/run_id` | Export identity → Run.runKey (decimal string) | identifier | Positive integer identity; compare source and wrapper; duplicates block every duplicate | Declared identity EV CONDITIONAL; not authorized DB binding |
| `/dataset/identity/variant_id`, `scenario_version_id` | Variant → Run.caseKey | identifier | Required variant; copies must agree; no inference from label | `input.declared_identity.variant_id` |
| `/source/{run_id,scenario_id,scenario_version_id,aeb_version_id,carla_vehicle_model_id}` | Producer identity copies | identifier | Compare when both copies exist; inconsistent identity blocks member | Exact original source path in rejection detail |
| `/dataset/identity/{project_id,scenario_id,aeb_version_id,carla_vehicle_model_id,purpose}` | Export metadata → declared identity; handoff member declared IDs | identifiers / enum | Missing stays UNKNOWN; no baseline authorization or v1 confirmation | CONDITIONAL, PRODUCER_DECLARED_NOT_AUTHORIZED_BINDING |
| `/seed`, `/dataset/identity/seed` | Stored seed → input.seed, handoff.seed | integer | Required exact integer copies; no invented seed | Original result ref |
| `/simulator`, `/dataset/identity/simulator` | Actual declared profile → MetricProvenanceResolver | version string | Exact copies; missing conflicting metadata remains visible | Runtime/source equivalence still UNVERIFIED |
| `/dataset/identity/aeb_mode` | Recorded mode → EvidenceReport.mode | ON / OFF | Exact enum, compare explicit outcome.case.aeb_mode; OFF remains control only | OBSERVED declaration with original pointer |
| `/dataset/identity/{repetition,attempt}` | Run sequence → handoff.replicate/attempt | positive integers | Required; never collapse equal variant/seed repetitions or derive sequence from list index | CONDITIONAL declaration, exact pointer |
| `/outcome/params/ttc_threshold` ↔ `/dataset/config/aeb/params/TTC_THRESHOLD` | Actual configured threshold → input.parameters/handoff.actual_parameters | s / config, no clock | Compare finite numeric copies when present; conflict blocks identity-dependent claims | No parameter mutation |
| `/outcome/params/brake_activation_delay` ↔ `.../BRAKE_ACTIVATION_DELAY` | Configured delay | s | Same as above; not measured actuator delay | Source-supported context only |
| `/outcome/params/max_deceleration` ↔ `.../MAX_DECELERATION` | Requested cap | m/s² | Same as above; not achieved deceleration | No calibration inferred |
| `/outcome/params/brake_buildup_rate` ↔ `.../BRAKE_BUILDUP_RATE` | Requested ramp | m/s³ | Same as above; not measured jerk | No range synthesized |
| `/outcome/metrics/{rms_jerk_mps3,impact_speed_mps,stopping_distance_m}` | CanonicalObjectiveReader → canonical_value, handoff.recorded_objectives | m/s³, m/s, m / core | Finite nonnegative numbers or null; missing/invalid never becomes zero | Producer scalar retained without recalculation |
| `/evaluation/aeb_result/{same three keys}` | Evaluation copies → evaluation_copy/copy_agreement | same | Compare independently; disagreement retained; no averaging or preferred-copy replacement | Canonical source remains outcome.metrics |
| `/dataset/objectives/{key}` | Embedded mirror/state/reason → declared_metadata | per objective / declared | Compare values; validate enum/state/value/reason; conflict marks quality FAIL while raw canonical remains available | Original metadata object + exact ref; producer declaration only |
| `/dataset/objectives/metric_version/{aggregation,engine,simulator}` | Extra profile declarations | strings | Compare aggregation to adr040-stored-aggregation/1 and engine/profile to top level | Conflict issues, no producer algorithm change |
| `/outcome/case/carla/jerk_filtered` | Existing metric metadata → signal/filter/window lineage | ego_a, core / projected frame | Existing descriptor checks unchanged, fixed dt/filter support gates unchanged | Dataset jerk metadata is not substituted for producer metadata |
| `/outcome/frames/j/{t,ego_x,ego_v,ego_a,ped_x,ped_y,ped_vy,...}` | Core state → existing timeline/geometry/stopping replay | s,m,m/s,m/s² / core / producer projected frame | Existing finite/time/order gates; no recorder offset inferred | Each ref P+/outcome/frames/j/field |
| `/outcome/metrics/{first_detection_t,aeb_decision_t,brake_onset_t}` | Detection/decision/command timeline | s / core | Existing episode/order/mode gates; OFF shadow traces do not become real commands | Command model onset is not pedal/physics consumption |
| `/dataset/time_series/frames/{columns,rows,row_count}` | Embedded recorder → frames Artifact list of column-name maps | column-specific / recorder | Unique nonempty columns, row width/count, frame/time columns; invalid table quarantined independently | View retains container SHA, original table pointer, columns |
| `.../frames/rows/j/c` | frame,sim_time_s,ego_speed_ms,throttle,brake,steer,IMU/radar/obstacle cells | frameID,s,m/s,[0..1],m/s²,m/s³,m,s / recorder | Existing per-stream checks; null cells unchanged; no GT substitution for radar | r.ref(frames,/j/column) → original /rows/j/c |
| `/dataset/time_series/ground_truth/{columns,rows,row_count}` | Embedded GT → ground_truth Artifact | CARLA world / recorder | Same table gates plus actor_id/role; actor/clock validation remains in core | Original rows preserved, no CSV re-encoding |
| `.../ground_truth/rows/j/c` | frame,sim_time_s,actor_id,role,type_id,x_m,y_m,z_m,yaw_deg,vx_ms,vy_ms,vz_ms,ax_ms2,ay_ms2,az_ms2,speed_ms,a_along_v_ms2 | s,m,deg,m/s,m/s² / recorder / CARLA left-handed world | No actor merge between runs; signed raw acceleration retained | Actual column index, including whole-row refs |
| `/dataset/collisions/events/j` | Contact records → collisions Artifact, ImpactAnalyzer | recorder frame/time, actor ID, m/s, N·s | Array count is not collision flag. Existing frame/episode/actor/precontact gates apply; zero impulse not absence | P+/dataset/collisions/events/j/... |
| `/dataset/collisions/flag_in_result` vs `/outcome/metrics/collision` | Canonical flag copy | boolean | Compare without truthy coercion or event-count override | Conflict issue, no new collision authority |
| `/dataset/sensors/summary` | Recorder summary → summary Artifact | producer-specific | Must be object; missing/bad source stays local | Summary does not replace frames or actor/contact evidence |
| `/dataset/config` | Declared actual bundle/config → bundle view | config | Object; no invented lifecycle/environment or scenario source file | External bundle byte hash stays UNVERIFIED |
| `/dataset/time_series/{clock,time_origin,units,coordinate_system,quality}` | Declared metadata/masks → input.json_source | recorder / declared frames | Retain raw declarations/masks; no authorized cross-clock transform created | Recorder exact-frame joins still checked from rows |
| `/dataset/provenance/{git_commit,core_jar_sha256}` | Declared lineage → metric provenance | revision / SHA256 | Missing stays UNKNOWN; no binary/source equivalence assertion | source_hash_verification UNKNOWN |
| `/dataset/provenance/files/<escaped filename>` | Original external-file hash claims | SHA256 bytes / declared | Stored separately; original CSV/JAR bytes not supplied or verified by adapter | external_source_integrity=UNVERIFIED |
| `/dataset/provenance/embedded_payloads/<escaped payload key>` | Embedded consistency digests | SHA256 UTF-8 declared Python JSON profile | Known profile checks payload; mismatch quarantines view; unknown profile stays UNVERIFIED | SELF_DECLARED_CONSISTENCY_ONLY, not external authenticity |
| `/dataset/{derived,status}` | Reference-only formulas, per-section status | heterogeneous | Never used to replace Core V3 formulas or canonical objectives; raw status/provenance retained | Declared derived role, quality masks/status metadata |

## Collection-level mapping

| Container path | Validation/output |
|---|---|
| `/runs/i/run_id` | Required positive unique wrapper identity, exact match to result identity; no generated offline DB ID |
| `/manifest/j` | Unique positive run_id; cover supplied members and identify missing documents; compare optional seed/mode/sequence/profile/purpose/version/vehicle/end_reason/collision copies |
| `/manifest/j/document_sha256` | Required per-document consistency digest, checked using supported `/rules/document_digest_spec`; mismatch blocks that member |
| `/manifest/j/document_state/state` | Present non-OK state blocks member |
| `/collection/{project_id,scenario_id,variant_id}` | Compare when declared; variant header may be absent for a multi-variant collection |
| `/collection/{sealed,selection,excluded,...}`, `/status` | Retained in intake manifest and per-run json_source.declared_collection_context. COMPLETE means delivered manifest only, never a frozen whole-scenario cohort |
| `/groups[]` | Producer pairing declaration is not authority. Lookup uses actual same variant/seed/vehicle/profile/AEB version/config and requires exactly one OFF; ImpactAnalyzer still applies its own compatibility gates |

The adapter does not enforce one fixed population size. All three supplied files
happen to contain two runs each. A manifest member without a document has an
explicit BLOCKED record. Uncovered/duplicate/invalid members cannot silently
become a smaller complete handoff. Resource exhaustion rejects the session.

## Hash, missing evidence and output contracts

The actual container byte SHA is computed once. Optional independently expected
SHA is accepted by `JsonInputAdapter(Path,InputResourcePolicy,String)`; without
it the container and views remain UNVERIFIED. The CLI does not obtain independent
authority from an embedded hash. Matching embedded digests show internal
consistency only. `Artifact.sha256` for a JSON view is explicitly scoped to
container bytes, not bytes of a reconstructed CSV. `json_container` is shared
container evidence, while every result/stream view is bound to its run key.

Missing lifecycle/JAR/environment/metadata/ZIP manifest has SOURCE_MISSING and
null data; these are unavailable evidence slots, not fabricated files. Approved
clock transforms, calibration, requirements, baseline binding and frozen
selection are not created from producer labels. Missing input remains claim-local
UNKNOWN/NOT_APPLICABLE or INVALID/CONFLICTING with reason codes.

`OfflineDiagnosticAnalysis` writes one report per analyzable run, an
`_input_manifest.json` and a CSV for JSON intake. Original report schema/formula/
policy/digest profiles are retained; additive `input.declared_identity`,
`input.json_source` and per-objective `declared_metadata` disclose the new source.
Handoff adds member declared identity, recorded objectives and JSON source
provenance. `canonical_sample` and baseline aggregates remain unavailable without
the existing independently bound/authorized M1C evidence.

In CSV, an empty cell represents a raw null or an unknown physical outcome;
the referenced report contains its typed status/reason. It is never a zero.
Collection view hashes use container-byte scope; a future authorized binding
must explicitly agree this scope and the member identity/pointer, rather than
silently treating a manifest's Python document digest as original-file bytes.
