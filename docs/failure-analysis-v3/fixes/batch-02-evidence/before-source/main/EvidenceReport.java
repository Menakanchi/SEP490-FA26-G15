package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import com.vsos.core.evaluation.AnalysisMetrics;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** M1A partial sidecar. No geometry/feasibility, failure attribution, aggregation or handoff execution. */
public final class EvidenceReport {
    public static final String BUILD_ID = "failure-analysis-m1a/1.0.0";
    public Map<String, Object> analyze(Run r) { return analyze(r, null); }
    public Map<String, Object> analyze(Run r, Artifact bindingSnapshot) {
        List<Issue> issues = new ArrayList<>(new EvidenceValidator().validate(r));
        var objectives = new CanonicalObjectiveReader().read(r);
        var provenance = new MetricProvenanceResolver().resolve(r);
        var binding = new BaselineBindingResolver().verify(r, bindingSnapshot);
        issues.addAll(provenance.issues()); issues.addAll(binding.issues());
        objectives.values().forEach(o -> issues.addAll(o.issues()));
        Value canonicalCollision = r.read("result", "/outcome/metrics/collision", null, "core");
        if (canonicalCollision.value() != null && !(canonicalCollision.value() instanceof Boolean))
            canonicalCollision = value(null, Status.INVALID, null, "core", canonicalCollision.sourceRefs(), "BOOLEAN_TYPE_INVALID");
        Object events = r.get("collisions", "");
        Value eventCount = events instanceof List<?> list
                ? new Value(list.size(), Status.DERIVED, null, "recorder", List.of(r.ref("collisions", "")), List.of(), "m1a-array-cardinality/1")
                : unknown("COLLISION_SOURCE_UNAVAILABLE", null);
        if (events instanceof List<?> list && canonicalCollision.value() instanceof Boolean c && c != !list.isEmpty())
            issues.add(new Issue(Status.CONFLICTING, "COLLISION_EVIDENCE_DISAGREEMENT", r.ref("collisions", ""),
                    "Canonical collision claim differs from sensor event presence; empty events do not prove absence"));
        Value eventImpact = physicalImpact(r, issues);
        Value mode = mode(r);
        Map<String, Object> objectiveOutput = new LinkedHashMap<>();
        for (String key : CanonicalObjectiveReader.KEYS) {
            var o = objectives.get(key);
            Map<String, Value> objectiveLineage = new MetricProvenanceResolver().objectiveLineage(provenance, key);
            boolean invalid = o.canonicalValue().status() == Status.INVALID;
            boolean copyConflict = "DISAGREEMENT".equals(o.copyAgreement());
            boolean applicabilityConflict = o.issues().stream().anyMatch(i -> i.code().equals("CANONICAL_APPLICABILITY_CONFLICT"));
            boolean identityConflict = issues.stream().anyMatch(i -> i.code().equals("INCONSISTENT_IDENTITY") || i.code().equals("DUPLICATE_MANIFEST_IDENTITY"));
            boolean incomplete = !"MATCH".equals(o.copyAgreement()) || o.canonicalValue().status() == Status.UNKNOWN;
            List<String> reasons = new ArrayList<>(o.canonicalValue().reasonCodes());
            reasons.add("PHYSICAL_INTERPRETATION_DEFERRED_M1B"); reasons.add("COHORT_NOT_FROZEN");
            if (copyConflict) reasons.add("CANONICAL_COPY_DISAGREEMENT");
            if (applicabilityConflict) reasons.add("CANONICAL_APPLICABILITY_CONFLICT");
            if (identityConflict) reasons.add("RUN_IDENTITY_CONFLICT");
            if (provenance.issues().stream().anyMatch(i -> i.status() == Status.CONFLICTING)) reasons.add("METRIC_METADATA_CONFLICT");
            boolean unverified = r.artifact("result").integrity() != Integrity.VERIFIED;
            if (unverified) reasons.add("ARTIFACT_INTEGRITY_UNVERIFIED");
            boolean lineageMissing = objectiveLineage.values().stream().anyMatch(v -> v.status() == Status.UNKNOWN || v.status() == Status.INVALID || v.status() == Status.CONFLICTING)
                    || provenance.fields().get("producer").value() == null || provenance.fields().get("simulator_profile").value() == null;
            if (lineageMissing) reasons.add("METRIC_LINEAGE_INCOMPLETE");
            String integrity = invalid || copyConflict || applicabilityConflict ? "FAIL" : incomplete || unverified || lineageMissing || identityConflict || !provenance.issues().isEmpty() ? "UNKNOWN" : "PASS";
            Map<String, Object> entry = obj("canonical_value", o.canonicalValue().json(), "evaluation_copy", o.evaluationCopy().json(),
                    "copy_agreement", o.copyAgreement(), "canonical_applicability", o.applicability(), "direction", "MINIMIZE",
                    "metric_source", "SIMULATOR_RESULT", "aggregation_version", AnalysisMetrics.VERSION,
                    "producer_profile", provenance.fields().get("simulator_profile").json(),
                    "input_field_refs", List.of(r.ref("result", "/outcome/metrics/" + key).json(), r.ref("result", "/evaluation/aeb_result/" + key).json()),
                    "signal", objectiveLineage.get("signal").json(), "filter", objectiveLineage.get("filter").json(),
                    "window", objectiveLineage.get("window").json(), "clock_id", "core", "frame_id", null,
                    "physical_event_impact", key.equals("impact_speed_mps") ? eventImpact.json() : null,
                    "decomposition", key.equals("stopping_distance_m") ? stoppingUnknown(o.canonicalValue()) : null,
                    "quality", obj("canonical_integrity", integrity, "physical_interpretability", "INSUFFICIENT",
                            "mobo_eligibility", "OFF".equals(mode.value()) ? "EXCLUDED" : "UNKNOWN",
                            "reason_codes", reasons, "capability_refs", List.of("READ_CANONICAL_OBJECTIVE")),
                    "explanation", obj("assessment", "DESCRIPTIVE_ONLY", "observed_facts", o.canonicalValue().sourceRefs().stream().map(SourceRef::json).toList(),
                            "mechanism_notes", List.of("Stored producer scalar retained without recomputation"), "hypothesis_refs", List.of(),
                            "limitations", List.of("Physical interpretation and stopping decomposition require M1B; baseline comparison unavailable")),
                    "baseline_comparison", obj("baseline_run_id", unknown("BASELINE_COMPARATOR_MISSING", null).json(),
                            "baseline_version_id", binding.fields().get("version_id").json(), "pairing_status", "UNKNOWN",
                            "delta", unknown("BASELINE_SCORE_UNAVAILABLE", o.canonicalValue().unit()).json(),
                            "relative_change", unknown("BASELINE_SCORE_UNAVAILABLE", null).json()), "parameter_hint_refs", List.of());
            objectiveOutput.put(key, entry);
        }
        Map<String, Object> parameters = new TreeMap<>();
        for (String p : BaselineBindingResolver.PARAMETERS.values()) {
            String unit = p.equals("max_deceleration") ? "m/s\u00b2" : p.equals("brake_buildup_rate") ? "m/s\u00b3" : "s";
            Value v = r.read("result", "/outcome/params/" + p, unit, null);
            if (v.value() != null && !finiteNonnegative(v.value())) v = value(null, Status.INVALID, unit, null, v.sourceRefs(), "PARAMETER_NUMBER_INVALID");
            parameters.put(p.equals("brake_activation_delay") ? "activation_delay" : p.equals("brake_buildup_rate") ? "buildup_rate" : p, v.json());
        }
        Map<String, Object> lineage = new LinkedHashMap<>();
        provenance.fields().forEach((k, v) -> lineage.put(k, v.json()));
        List<Map<String, Object>> registry = new ArrayList<>(r.artifacts().values().stream().map(Artifact::json).toList());
        if (bindingSnapshot != null) registry.add(bindingSnapshot.json());
        Map<String, Object> input = obj("run_key", r.runKey(), "artifact_run_key", r.runKey(), "case_key", r.caseKey(),
                "database_run_id", binding.fields().get("database_run_id").value(), "project_id", binding.fields().get("project_id").json(),
                "scenario_id", binding.fields().get("scenario_id").json(), "variant_id", binding.fields().get("variant_id").json(),
                "mode", mode.json(), "seed", seed(r).json(), "parameters", parameters,
                "simulator", provenance.fields().get("simulator_profile").json(), "source_commit", provenance.fields().get("source_revision").json(),
                "core_sha256", provenance.fields().get("core_sha256").json(), "artifacts", registry, "baseline_binding", binding.json(),
                "metric_aggregation_version", AnalysisMetrics.VERSION, "metric_lineage", lineage,
                "clocks", List.of(obj("id", "core", "to_reference_offset", unknown("CLOCK_ALIGNMENT_UNKNOWN", "s").json()),
                        obj("id", "recorder", "to_reference_offset", unknown("CLOCK_ALIGNMENT_UNKNOWN", "s").json())));
        List<String> inconclusive = new ArrayList<>(List.of("M1A_FOUNDATION_ONLY", "DIAGNOSIS_NOT_EXECUTED"));
        if (!List.of("PROJECT_BASELINE_CONFIRMED", "RUN_VERSION_BOUND").contains(binding.identityStatus())) inconclusive.add("BASELINE_ID_UNCONFIRMED");
        Map<String, Object> report = obj("physical_outcome", unknown("PHYSICAL_OUTCOME_DEFERRED_M1B", null).json(),
                "collision_evidence", obj("canonical_collision", canonicalCollision.json(), "sensor_event_count", eventCount.json(),
                        "physical_event_impact", eventImpact.json(), "absence_coverage", unknown("CALLBACK_COVERAGE_UNKNOWN", null).json()),
                "objectives", objectiveOutput, "aeb_timeline", obj("decision", r.read("result", "/outcome/metrics/aeb_decision_t", "s", "core").json(),
                        "command_onset", r.read("result", "/outcome/metrics/brake_onset_t", "s", "core").json(),
                        "actual_aeb_consumption", "OFF".equals(mode.value()) ? value(null, Status.NOT_APPLICABLE, null, null, mode.sourceRefs(), "AEB_OFF_SHADOW_ONLY").json()
                                : unknown("COMMAND_WRITER_PROVENANCE_MISSING", null).json()),
                "physical_feasibility", unknown("PHYSICAL_FEASIBILITY_DEFERRED_M1B", null).json(),
                "failure_candidates", List.of(), "root_cause_hypotheses", List.of(),
                "evidence_sufficiency", obj("READ_CANONICAL_OBJECTIVE", objectiveOutput.values().stream()
                        .allMatch(o -> "PASS".equals(at(o, "/quality/canonical_integrity"))) ? "SUFFICIENT" : "PARTIAL",
                        "EXPLAIN_PHYSICAL_MEANING", "INSUFFICIENT", "EXPORT_FOR_MOBO", "INSUFFICIENT"),
                "inconclusive_reasons", inconclusive,
                "validation", issues.stream().map(Issue::json).toList());
        Map<String, Object> envelope = obj("schema_version", "vehicsim.failure-analysis/v1", "objective_analysis_schema", "vehicsim.objective-analysis/v1",
                "design_revision", "V3.1", "implementation_stage", "M1A", "analysis_status", "ANALYZED_PARTIAL",
                "formula_version", "fa-formula/3.0.0", "policy_version", "fa-diagnosis/1.0.0", "analyzer_build_id", BUILD_ID,
                "digest_profile", "fa-report-sorted-json/1", "input", input, "report", report,
                "handoff_reference", unknown("MOBO_HANDOFF_NOT_IMPLEMENTED_M1A", null).json());
        envelope.put("content_digest", contentDigest(envelope));
        envelope.put("analysis_id", UUID.randomUUID().toString());
        envelope.put("created_at_utc", Instant.now().toString());
        @SuppressWarnings("unchecked") Map<String, Object> immutable = (Map<String, Object>) freeze(envelope);
        return immutable;
    }

    private static Map<String, Object> stoppingUnknown(Value total) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total_as_recorded", total.json());
        for (String k : List.of("trace_component", "extrapolated_component", "start_time", "end_time", "start_index", "position_after_step", "last_speed",
                "decel_for_extrapolation", "measured_physical_distance", "rounding_rule", "replay_difference"))
            out.put(k, unknown("STOPPING_BREAKDOWN_DEFERRED_M1B", switch (k) {
                case "trace_component", "extrapolated_component", "measured_physical_distance", "replay_difference" -> "m";
                case "start_time", "end_time" -> "s"; case "last_speed" -> "m/s"; case "decel_for_extrapolation" -> "m/s\u00b2"; default -> null;
            }).json());
        return out;
    }
    private static Value seed(Run r) {
        Value v = r.read("result", "/seed", null, null);
        return v.value() != null && (!(v.value() instanceof Number) || !v.value().toString().matches("-?\\d+"))
                ? value(null, Status.INVALID, null, null, v.sourceRefs(), "IDENTITY_TYPE_INVALID") : v;
    }

    public static Value mode(Run r) {
        Object explicit = r.get("result", "/outcome/case/aeb_mode");
        Value mode = r.read("result", "/outcome/case/aeb_mode", null, null);
        Object rows = r.get("manifest", "");
        if (rows instanceof List<?> list) for (int i = 0; i < list.size(); i++) {
            Object row = list.get(i);
            if ((r.directory() + "/result.json").equals(at(row, "/path_in_zip"))) {
                Object control = at(row, "/control_type");
                String declared = "AEB_ON".equals(control) ? "ON" : "AEB_OFF".equals(control) ? "OFF" : null;
                if (declared != null && explicit == null) return value(declared, Status.OBSERVED, null, null, List.of(r.ref("manifest", "/" + i + "/control_type")));
                if (declared != null && !declared.equals(explicit)) return value(explicit, Status.CONFLICTING, null, null, mode.sourceRefs(), "AEB_MODE_DISAGREEMENT");
            }
        }
        if (explicit != null && !List.of("ON", "OFF").contains(explicit)) return value(null, Status.INVALID, null, null, mode.sourceRefs(), "AEB_MODE_INVALID");
        if (explicit == null && "vehicsim.result/v1".equals(r.get("result", "/format")))
            return value("ON", Status.CONDITIONAL, null, null, List.of(r.ref("result", "/format")), "LEGACY_ON_OMISSION_CONVENTION");
        return mode;
    }

    private static Value physicalImpact(Run r, List<Issue> issues) {
        Object raw = r.get("collisions", ""), gt = r.get("ground_truth", "");
        if (!(raw instanceof List<?> events)) return unknown("COLLISION_SOURCE_UNAVAILABLE", "m/s");
        if (events.isEmpty()) return value(null, Status.UNKNOWN, "m/s", "recorder", List.of(r.ref("collisions", "")), "NO_RECORDED_CONTACT", "CONTACT_ABSENCE_UNCONFIRMED");
        boolean badIdentity = issues.stream().anyMatch(i -> i.code().equals("INCONSISTENT_IDENTITY") || i.code().equals("RUN_METADATA_BINDING_UNRESOLVED") && i.status() == Status.CONFLICTING);
        boolean badRecorder = issues.stream().anyMatch(i -> (i.source().artifactId().equals(r.artifact("ground_truth").id())
                || i.source().artifactId().equals(r.artifact("collisions").id())) && (i.status() == Status.INVALID || i.status() == Status.CONFLICTING));
        if (badIdentity || badRecorder) return unknown("COLLISION_BINDING_OR_CLOCK_INVALID", "m/s");
        if (!(gt instanceof List<?> rows)) return unknown("COLLISION_ACTOR_BINDING_UNKNOWN", "m/s");
        List<SourceRef> refs = new ArrayList<>();
        for (int i = 0; i < events.size(); i++) {
            Object event = events.get(i);
            Object actor = at(event, "/other_actor_id"), before = at(event, "/gt_frame_before");
            boolean target = false, ego = false;
            for (int j = 0; j < rows.size(); j++) {
                Object row = rows.get(j);
                if (before != null && before.toString().equals(Objects.toString(at(row, "/frame"), ""))) {
                    if ("ego".equals(at(row, "/role"))) ego = true;
                    if (actor != null && actor.toString().equals(Objects.toString(at(row, "/actor_id"), "")) && "target".equals(at(row, "/role"))) {
                        target = true; refs.add(r.ref("ground_truth", "/" + j));
                    }
                }
            }
            if (target && ego && finiteNonnegative(at(event, "/relative_speed_before_ms")) && finiteNonnegative(at(event, "/sim_time_s"))) {
                refs.add(r.ref("collisions", "/" + i + "/relative_speed_before_ms"));
                return value(at(event, "/relative_speed_before_ms"), Status.OBSERVED, "m/s", "recorder", refs);
            }
        }
        issues.add(new Issue(Status.UNKNOWN, "COLLISION_ACTOR_OR_SPEED_UNRESOLVED", r.ref("collisions", ""), "No matching ego/target preimpact record with valid relative speed"));
        return unknown("COLLISION_ACTOR_OR_SPEED_UNRESOLVED", "m/s");
    }

    /** Byte hash of this profile is distinct from AnalysisService's semantic dataset digest. */
    public static String contentDigest(Map<String, Object> report) {
        Map<String, Object> scope = new LinkedHashMap<>(report);
        List.of("analysis_id", "created_at_utc", "content_digest").forEach(scope::remove);
        return sha256(MiniJson.write(canonical(scope)));
    }
    private static Object canonical(Object value) {
        if (value instanceof Map<?, ?> m) {
            Map<String, Object> out = new TreeMap<>(); m.forEach((k, v) -> out.put(k.toString(), canonical(v))); return out;
        }
        if (value instanceof List<?> l) return l.stream().map(EvidenceReport::canonical).toList();
        if (value instanceof Number n) return new BigDecimal(n.toString()).stripTrailingZeros();
        return value;
    }
}
