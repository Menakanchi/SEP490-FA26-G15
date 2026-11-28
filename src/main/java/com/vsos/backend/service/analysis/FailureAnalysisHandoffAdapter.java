package com.vsos.backend.service.analysis;

import com.vsos.core.common.MiniJson;
import com.vsos.core.evaluation.AnalysisMetrics;
import com.vsos.core.failureanalysis.*;
import com.vsos.core.mobo.ParameterBounds;

import java.time.Instant;
import java.util.*;

import static com.vsos.core.failureanalysis.Evidence.*;

/** Maps a server-persisted, authenticated canonical-target review into the existing V3 contract.
 * The review approves recorded optimizer samples and their frozen partition/domain only. It
 * supplies no physical requirement, calibration, collision-absence or causal attestations. */
public final class FailureAnalysisHandoffAdapter {
    public static final String VERSION = "fa-runtime-canonical-review/1";
    private final Map<String,Object> snapshot;
    private final Map<String,Object> dataset;
    private final Map<String,Object> review;
    private final Artifact authority;
    private final Set<String> nonhazard;

    @SuppressWarnings("unchecked")
    public FailureAnalysisHandoffAdapter(Map<String,Object> snapshot) {
        this.snapshot = (Map<String,Object>) freeze(Objects.requireNonNull(snapshot));
        this.dataset = map(this.snapshot.get("dataset"));
        this.review = map(this.snapshot.get("review"));
        if (!Boolean.TRUE.equals(review.get("confirmed")) || !positive(review.get("reviewer_id"))
                || text(review.get("reason")) == null || text(review.get("reason")).isBlank()
                || !Boolean.TRUE.equals(review.get("canonical_targets_only"))
                || !Boolean.TRUE.equals(review.get("calibration_not_applicable")))
            throw new IllegalArgumentException("V3_CANONICAL_REVIEW_REQUIRED");
        Instant.parse(Objects.toString(review.get("reviewed_at"), ""));
        if (!positive(this.snapshot.get("project_id")) || !positive(this.snapshot.get("dataset_id"))
                || !hash(this.snapshot.get("dataset_digest"))
                || !"vehicsim.analysis-dataset/v2".equals(dataset.get("schema")))
            throw new IllegalArgumentException("V3_SEALED_SELECTION_REQUIRED");
        this.nonhazard = new HashSet<>(list(review.get("nonhazard_run_ids")).stream().map(String::valueOf).toList());
        this.authority = artifact("runtime-review", obj("schema", "vehicsim.runtime-fa-review/v1",
                "adapter_version", VERSION, "scope", "RECORDED_CANONICAL_OPTIMIZER_TARGETS",
                "canonical_constraints", canonicalConstraints(), "snapshot", this.snapshot));
    }

    /** Baseline identity comes from the current DB version. Physical claims stay UNKNOWN. */
    public AnalysisContext context(Run run) {
        requireMember(run);
        return new AnalysisContext(AnalysisContext.VERSION, List.of(), List.of(), List.of(),
                Instant.parse(review.get("reviewed_at").toString()), binding(run));
    }

    public Map<String,Object> handoff(List<MoboHandoffBuilder.MemberInput> reports) {
        Map<String,Object> handoff=new LinkedHashMap<>(new MoboHandoffBuilder().build(input(reports)));
        Map<String,Object> compatibility=new LinkedHashMap<>(map(handoff.get("consumer_compatibility")));
        compatibility.put("scope","OFFLINE_SOURCE_INSPECTION_PROFILE");handoff.put("consumer_compatibility",compatibility);
        Map<String,Object> eligibility=new LinkedHashMap<>(map(handoff.get("eligibility_manifest")));
        eligibility.put("dispatch_scope","OFFLINE_HANDOFF_ONLY");handoff.put("eligibility_manifest",eligibility);
        handoff.put("runtime_consumer",obj("schema","vehicsim.fa-v3-runtime-consumer/v1",
                "adapter_version","fa-runtime-v3-campaign/1","context_id",snapshot.get("context_id"),
                "context_digest",snapshot.get("context_digest"),"campaign_contract","vehicsim.fa-v3-campaign/v1",
                "dispatch_authorization","RECHECKED_BY_BACKEND_AT_CAMPAIGN_CREATION_AND_EACH_TRIAL"));
        handoff.put("content_digest",HandoffSnapshots.digest(handoff));
        return handoff;
    }

    public MoboHandoffBuilder.Input input(List<MoboHandoffBuilder.MemberInput> reports) {
        Set<String> expected = map(snapshot.get("members")).keySet();
        Set<String> delivered = new HashSet<>();
        for (var report : reports) {
            String id = requireMember(report.run());
            if (!delivered.add(id)) throw new IllegalArgumentException("V3_DUPLICATE_MEMBER");
        }
        if (!expected.equals(delivered)) throw new IllegalArgumentException("V3_REVIEW_POPULATION_CHANGED");
        List<Map<String,Object>> rows = new ArrayList<>();
        for (var report : reports) {
            Run run = report.run(); String id = runId(run); Map<String,Object> identity = identity(run);
            var sample = sample(run);
            boolean control = nonhazard.contains(id);
            if (control && (!Boolean.FALSE.equals(sample.collision()) || !Boolean.FALSE.equals(sample.falsePositive())
                    || !Boolean.FALSE.equals(sample.falseNegative())))
                throw new IllegalArgumentException("V3_NONHAZARD_REVIEW_CONFLICT:" + id);
            String role = control ? "SAFE_CONTROL" : Boolean.TRUE.equals(sample.collision())
                    || Boolean.TRUE.equals(run.get("result", "/outcome/metrics/target_entered_path"))
                    || Boolean.TRUE.equals(run.get("result", "/outcome/metrics/pedestrian_entered_path"))
                    ? "HAZARD_ENCOUNTER" : "CAUTION_CANDIDATE";
            rows.add(obj("run_key", run.runKey(), "run_id", id, "scenario_version_id", source(run, "scenario_version_id"),
                    "partition", partition(id), "seed", run.get("result", "/seed"),
                    "replicate", identity.get("repetition"), "attempt", identity.get("attempt"),
                    "report_digest", report(report).get("content_digest"), "result_sha256", run.artifact("result").sha256(),
                    "configuration_digest", MoboHandoffBuilder.configurationDigest(run),
                    "configuration_digest_profile", "fa-handoff-run-configuration/1",
                    "case_roles", List.of(role), "role_basis", "EVIDENCE_REVIEWED"));
        }
        Map<String,Object> baseline = map(snapshot.get("baseline"));
        Artifact selection = artifact("selection", obj("schema", "vehicsim.failure-analysis-selection/v1",
                "evidence_scope", "AUTHENTICATED_DATABASE_REVIEW", "snapshot_schema", "vehicsim.fa-v3-sealed-dataset/v1",
                "source_selection_schema", "vehicsim.analysis-dataset/v2",
                "snapshot_id", snapshot.get("dataset_id").toString(), "source_dataset_digest", snapshot.get("dataset_digest"),
                "selection_status", "FROZEN", "reviewed", true, "baseline_current", true,
                "project_id", snapshot.get("project_id").toString(), "scenario_id", at(dataset, "/scenario/id").toString(),
                "baseline_version_id", baseline.get("id").toString(), "review_refs", refs(authority, "/snapshot/review"),
                "exported_at", review.get("reviewed_at"), "members", rows));
        Map<String,Object> decisions = new LinkedHashMap<>();
        List<MoboHandoffBuilder.MemberInput> members = new ArrayList<>();
        for (var report : reports) {
            Run run = report.run(); String id = runId(run); var sample = sample(run);
            var provenance = new MetricProvenanceResolver().resolve(run);
            var descriptor = MetricProvenanceResolver.descriptor(run);
            boolean profileAccepted = descriptor.supported() && provenance.issues().isEmpty();
            Map<String,Object> objectives = new LinkedHashMap<>();
            for (String key : CanonicalObjectiveReader.KEYS) {
                boolean na = !key.equals("impact_speed_mps") && Boolean.FALSE.equals(sample.braked());
                objectives.put(key, obj("status", na ? "NOT_APPLICABLE" : "ELIGIBLE",
                        "report_digest", report(report).get("content_digest"),
                        "source_refs", refs(authority, "/snapshot/review"),
                        "profile_verified", new Value(profileAccepted, Status.DERIVED, null, null,
                                List.of(new SourceRef(authority.id(), "/snapshot/review"), run.ref("result", "/simulator")),
                                List.of(), "fa-reviewed-canonical-producer-profile/1").json(),
                        "calibration_applicability", "NOT_APPLICABLE",
                        "calibration_scope", "RECORDED_CANONICAL_OPTIMIZER_TARGETS_ONLY",
                        "calibration_basis_refs", refs(authority, "/snapshot/review/calibration_not_applicable")));
            }
            Map<String,Object> member = obj("objectives", objectives);
            if (nonhazard.contains(id)) member.put("nonhazard_review", obj("status", "REVIEWED_NONHAZARD",
                    "report_digest", report(report).get("content_digest"),
                    "source_refs", refs(authority, "/snapshot/review/nonhazard_run_ids")));
            // A collision disagreement must be adjudicated explicitly; this canonical review cannot erase it.
            decisions.put(run.runKey(), member);
            Artifact canonical = artifact("sample-" + id, obj("schema", "vehicsim.canonical-sample-snapshot/v1",
                    "evidence_scope", "AUTHENTICATED_DATABASE_REVIEW", "selection_sha256", selection.sha256(),
                    "run_key", run.runKey(), "run_id", id, "report_digest", report(report).get("content_digest"),
                    "result_sha256", run.artifact("result").sha256(), "trace_available", trace(run),
                    "sample", CanonicalAggregation.sampleJson(sample), "provenance", provenance(run, provenance)));
            members.add(new MoboHandoffBuilder.MemberInput(run, report.evidenceReport(), report.diagnosticReport(), binding(run), canonical, null));
        }
        Artifact policy = artifact("quality-policy", obj("schema", "vehicsim.handoff-quality-policy/v1",
                "evidence_scope", "AUTHENTICATED_DATABASE_REVIEW", "version", VERSION, "status", "APPROVED",
                "scope", "MOBO_HANDOFF", "selection_sha256", selection.sha256(),
                "approval_refs", refs(authority, "/snapshot/review"),
                "constraint_refs", refs(authority, "/canonical_constraints"), "members", decisions,
                "canonical_constraints", canonicalConstraints(),
                "limitations", List.of("Recorded canonical targets only; no physical calibration, safety or causal certification")));
        return new MoboHandoffBuilder.Input(members, selection, policy, domains(selection), null, List.of(authority));
    }

    private Artifact binding(Run run) {
        Map<String,Object> baseline = map(snapshot.get("baseline"));
        Map<String,Object> data = obj("schema", "vehicsim.baseline-binding-snapshot/v1",
                "project_id", snapshot.get("project_id"), "version_project_id", baseline.get("project_id"),
                "version_id", baseline.get("id"), "version_no", baseline.get("version_no"),
                "label", baseline.get("label"), "status", baseline.get("status"),
                "exported_at", review.get("reviewed_at"), "current_baseline_version_id", baseline.get("id"),
                "parameters", snapshot.get("baseline_parameters"),
                "run", obj("run_id", runId(run), "project_id", snapshot.get("project_id"),
                        "scenario_id", source(run, "scenario_id"), "scenario_version_id", source(run, "scenario_version_id"),
                        "aeb_version_id", source(run, "aeb_version_id"), "result_sha256", run.artifact("result").sha256()));
        if (baseline.get("created_at") != null) data.put("creation_lineage", obj("project_id", baseline.get("project_id"),
                "version_id", baseline.get("id"), "version_no", baseline.get("version_no"), "label", baseline.get("label"),
                "source", baseline.get("source"), "created_at", baseline.get("created_at")));
        return artifact("baseline-" + runId(run), data);
    }

    private SearchRangeResolver.Domains domains(Artifact selection) {
        Map<String,Object> live = new TreeMap<>(), approved = new TreeMap<>(), engine = new TreeMap<>();
        Map<String,Object> catalog = new HashMap<>();
        for (Object raw : list(snapshot.get("catalog"))) {
            Map<String,Object> row = map(raw);
            if (catalog.putIfAbsent(text(row.get("code")), row) != null)
                throw new IllegalArgumentException("V3_CATALOG_PARAMETER_DUPLICATED");
        }
        if (!map(snapshot.get("search_space")).keySet().equals(Set.copyOf(ParameterBounds.PARAM_KEYS)))
            throw new IllegalArgumentException("V3_APPROVED_DOMAIN_REQUIRES_FOUR_PARAMETERS");
        ParameterBounds defaults = ParameterBounds.defaults();
        for (String code : ParameterBounds.PARAM_KEYS) {
            Map<String,Object> row = map(catalog.get(code)); List<?> pair = list(map(snapshot.get("search_space")).get(code));
            if (row.isEmpty() || pair.size() != 2 || !(pair.get(0) instanceof Number low) || !(pair.get(1) instanceof Number high)
                    || !(row.get("min_value") instanceof Number min) || !(row.get("max_value") instanceof Number max)
                    || !Double.isFinite(low.doubleValue()) || !Double.isFinite(high.doubleValue())
                    || low.doubleValue() >= high.doubleValue() || low.doubleValue() < Math.max(min.doubleValue(), defaults.lower(code))
                    || high.doubleValue() > Math.min(max.doubleValue(), defaults.upper(code)))
                throw new IllegalArgumentException("V3_APPROVED_DOMAIN_INVALID:" + code);
            String unit = SearchRangeResolver.unit(code);
            live.put(code, obj("lower", min, "upper", max, "unit", unit));
            approved.put(code, obj("lower", low, "upper", high, "unit", unit));
            engine.put(code, obj("lower", defaults.lower(code), "upper", defaults.upper(code), "unit", unit));
        }
        Artifact catalogSource = artifact("catalog-source", obj("schema", "vehicsim.sourced-parameter-domain/v1",
                "scope", "DATABASE_CATALOG_SNAPSHOT", "intervals", live));
        Artifact engineSource = artifact("engine-domain", obj("schema", "vehicsim.sourced-parameter-domain/v1",
                "scope", "LOADED_ENGINE_DEFAULTS", "intervals", engine));
        return new SearchRangeResolver.Domains(catalogSource, engineSource,
                domain("live-catalog", "CATALOG_LIVE", selection, live),
                domain("approved-campaign", "CAMPAIGN_APPROVED", selection, approved), List.of());
    }

    private Artifact domain(String id, String kind, Artifact selection, Map<String,Object> intervals) {
        return artifact(id, obj("schema", "vehicsim.search-domain-snapshot/v1", "kind", kind,
                "status", "APPROVED", "version", VERSION, "basis_partition", "EXTERNAL_POLICY",
                "project_id", snapshot.get("project_id").toString(),
                "baseline_version_id", map(snapshot.get("baseline")).get("id").toString(),
                "selection_sha256", selection.sha256(), "approval_refs", refs(authority, "/snapshot/review"),
                "model_constraints_complete", true,
                "model_constraint_scope", "CANONICAL_MOBO_FOUR_PARAMETER_DOMAIN_NO_DIAGNOSTIC_PHYSICAL_MODEL",
                "intervals", intervals));
    }

    private Map<String,Object> provenance(Run run, MetricProvenanceResolver.Provenance resolved) {
        Map<String,Object> p = map(run.get("result", "/dataset/provenance"));
        Map<String,Object> profiles = new TreeMap<>();
        for (String key : CanonicalObjectiveReader.KEYS) {
            Map<String,Value> lineage = new MetricProvenanceResolver().objectiveLineage(resolved, key);
            profiles.put(key, obj("signal", lineage.get("signal").value(),
                    "filter", lineage.get("filter").status() == Status.NOT_APPLICABLE ? "NOT_APPLICABLE" : lineage.get("filter").value(),
                    "window", lineage.get("window").value(), "source_refs", List.of(run.ref("result", "/simulator").json())));
        }
        Object core = p.get("core_jar_sha256"), bytecode = p.get("core_bytecode_sha256"), commit = p.get("git_commit");
        List<?> sourceHashes = list(p.get("metric_source_hashes"));
        if (sourceHashes.isEmpty() && hash(core) && text(commit) != null)
            sourceHashes = List.of(obj("path", "core/vsos-core.jar", "sha256", core, "commit", commit));
        else if (sourceHashes.isEmpty() && hash(bytecode) && text(commit) != null)
            sourceHashes = List.of(obj("path", "classes/com/vsos/core", "sha256", bytecode, "commit", commit));
        Map<String,Object> storedSource = map(map(snapshot.get("members")).get(runId(run)));
        Map<String,Object> databaseSource = obj("source_id", storedSource.get("source_id"),
                "project_id", snapshot.get("project_id"), "run_id", runId(run), "attempt", storedSource.get("attempt"),
                "source_sha256", storedSource.get("source_sha256"), "revision", storedSource.get("revision"));
        return obj("aggregation_version", AnalysisMetrics.VERSION, "metric_source", "SIMULATOR_RESULT",
                "provenance_scope", "PERSISTED_CANONICAL_RESULT", "source_sha256", run.artifact("result").sha256(),
                "database_source", databaseSource, "canonical_targets_only", review.get("canonical_targets_only"),
                "calibration_not_applicable", review.get("calibration_not_applicable"),
                "canonical_review_refs", refs(authority, "/snapshot/review"),
                "simulator", run.get("result", "/simulator"), "producer", run.get("result", "/engine"),
                "dt", resolved.fields().get("dt").value(), "vehicle_id", String.valueOf(identity(run).get("carla_vehicle_model_id")),
                "core_jar_sha256", core, "core_bytecode_sha256", bytecode,
                "core_source_commit", commit, "worker_sha256", p.get("worker_sha256"),
                "scenario_runner_version", p.get("scenario_runner_version"), "scenario_runner_sha256", p.get("scenario_runner_sha256"),
                "metric_source_hashes", sourceHashes, "objectives", profiles,
                "source_refs", List.of(run.ref("result", "/dataset/provenance").json()),
                "runtime_source_equivalence", "UNVERIFIED");
    }

    private String requireMember(Run run) {
        String id = runId(run); Map<String,Object> member = map(map(snapshot.get("members")).get(id));
        if (member.isEmpty() || !Objects.equals(member.get("source_sha256"), run.artifact("result").sha256())
                || !Objects.equals(String.valueOf(member.get("attempt")), String.valueOf(identity(run).get("attempt"))))
            throw new IllegalArgumentException("V3_SOURCE_REVIEW_SCOPE_MISMATCH:" + id);
        return id;
    }
    private String partition(String id) {
        if (list(dataset.get("optimization_run_ids")).stream().anyMatch(x -> id.equals(x.toString()))) return "OPTIMIZATION";
        if (list(dataset.get("validation_run_ids")).stream().anyMatch(x -> id.equals(x.toString()))) return "VALIDATION";
        throw new IllegalArgumentException("V3_MEMBER_PARTITION_MISSING:" + id);
    }
    private static Map<String,Object> report(MoboHandoffBuilder.MemberInput input) {
        return Objects.requireNonNull(input.diagnosticReport() == null ? input.evidenceReport() : input.diagnosticReport());
    }
    private static String runId(Run run) { return String.valueOf(identity(run).get("run_id")); }
    private static Object source(Run run, String field) { return run.get("result", "/source/" + field); }
    private static Map<String,Object> identity(Run run) { return map(run.get("result", "/dataset/identity")); }
    private AnalysisMetrics.Sample sample(Run run) {
        Map<String,Object> row = list(dataset.get("runs")).stream().map(FailureAnalysisHandoffAdapter::map)
                .filter(x -> runId(run).equals(String.valueOf(x.get("run_id")))).findFirst().orElseThrow();
        Object onset = run.get("result", "/outcome/metrics/brake_onset_t");
        Double jerk = number(run.get("result", "/outcome/metrics/rms_jerk_mps3")),
                stop = number(run.get("result", "/outcome/metrics/stopping_distance_m"));
        Boolean braked = onset != null && !"null".equals(onset) || jerk != null || stop != null ? Boolean.TRUE
                : Boolean.FALSE.equals(run.get("result", "/evaluation/aeb_result/aeb_triggered")) ? Boolean.FALSE : null;
        return new AnalysisMetrics.Sample(text(row.get("status")), text(run.get("result", "/outcome/end_reason")),
                bool(run.get("result", "/outcome/metrics/collision")), bool(run.get("result", "/evaluation/aeb_result/false_activation")),
                bool(run.get("result", "/evaluation/aeb_result/missed_activation")), text(run.get("result", "/evaluation/aeb_result/verdict")),
                braked, jerk, number(run.get("result", "/outcome/metrics/impact_speed_mps")), stop);
    }
    private static boolean trace(Run run) { return !list(run.get("result", "/outcome/frames")).isEmpty(); }
    private Artifact artifact(String kind, Object data) {
        String digest = sha256(MiniJson.write(data));
        return new Artifact("fa-runtime:" + kind + ":" + digest, "database", "urn:vehicsim:fa-runtime:" + digest,
                digest, "application/json", Integrity.VERIFIED, data, List.of());
    }
    private static List<Map<String,Object>> refs(Artifact a, String path) { return List.of(new SourceRef(a.id(), path).json()); }
    private static Map<String,Object> canonicalConstraints() {
        return obj("objective_contract", AnalysisMetrics.VERSION, "objectives", List.of("RMS_JERK", "RELATIVE_IMPACT_SPEED", "STOPPING_DISTANCE"),
                "collision_rate_pct", obj("max", "baseline"), "false_activation_increase_pts",
                obj("max", com.vsos.backend.service.regression.RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS),
                "basis", List.of("ADR-040", "ADR-044", "ADR-055"));
    }
    private static Map<String,Object> map(Object raw) {
        if (!(raw instanceof Map<?,?> value)) return Map.of();
        Map<String,Object> out = new LinkedHashMap<>(); value.forEach((k,v) -> out.put(k.toString(), v)); return out;
    }
    private static List<?> list(Object raw) { return raw instanceof List<?> list ? list : List.of(); }
    private static String text(Object raw) { return raw instanceof String value ? value : null; }
    private static boolean positive(Object raw) { return raw != null && raw.toString().matches("[1-9]\\d*"); }
    private static boolean hash(Object raw) { return raw instanceof String value && value.matches("[a-f0-9]{64}"); }
    private static Double number(Object raw) { return raw instanceof Number value ? value.doubleValue() : null; }
    private static Boolean bool(Object raw) { return raw instanceof Boolean value ? value : null; }
}
