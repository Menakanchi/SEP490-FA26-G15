package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Offline verification of an explicitly supplied, hash-pinned export. Never queries a database. */
public final class BaselineBindingResolver {
    public static final Map<String, String> PARAMETERS = Collections.unmodifiableMap(new TreeMap<>(Map.of(
            "TTC_THRESHOLD", "ttc_threshold", "BRAKE_ACTIVATION_DELAY", "brake_activation_delay",
            "MAX_DECELERATION", "max_deceleration", "BRAKE_BUILDUP_RATE", "brake_buildup_rate")));
    public record Binding(String identityStatus, Map<String, Value> fields, List<Issue> issues) {
        public Binding { fields = Collections.unmodifiableMap(new LinkedHashMap<>(fields)); issues = List.copyOf(issues); }
        public Map<String, Object> json() {
            Map<String, Object> out = obj("identity_status", identityStatus);
            fields.forEach((k, v) -> out.put(k, v.json()));
            out.put("issues", issues.stream().map(Issue::json).toList());
            return out;
        }
    }
    /** expectedSha256 must come from the caller's authorized export reference, not from this file. */
    public static Artifact readSnapshot(Path path, String expectedSha256) throws IOException {
        BoundedInput input=new BoundedInput(InputResourcePolicy.defaults());
        byte[] bytes = input.read(path,"baseline_snapshot");
        String hash = sha256(bytes);
        List<Issue> issues = new ArrayList<>();
        Integrity integrity = expectedSha256 == null ? Integrity.UNVERIFIED : hash.equals(expectedSha256) ? Integrity.VERIFIED : Integrity.FAILED;
        Object data = null;
        SourceRef ref = new SourceRef("baseline_snapshot", "");
        if (integrity == Integrity.FAILED) issues.add(new Issue(Status.INVALID, "HASH_MISMATCH", ref, "Baseline snapshot hash differs"));
        if(integrity!=Integrity.FAILED)try { data = input.parse(bytes,"application/json","baseline_snapshot");
            if(!(data instanceof Map<?,?>))throw new IllegalArgumentException("JSON object required"); }
        catch(InputRejectedException e){if(e.kind()==InputRejectedException.Kind.RESOURCE_LIMIT_EXCEEDED)throw e;
            integrity=Integrity.FAILED;issues.add(new Issue(Status.INVALID,e.kind().name(),ref,e.reason()));}
        catch (IllegalArgumentException e) { data=null;integrity=Integrity.FAILED;issues.add(new Issue(Status.INVALID, "SCHEMA_PARSE_ERROR", ref, e.getMessage())); }
        return new Artifact("baseline_snapshot", "external", path.getFileName().toString(), hash, "application/json", integrity, data, issues);
    }

    public Binding verify(Run r, Artifact snapshot) {
        Map<String, Value> out = new LinkedHashMap<>();
        for (String key : List.of("project_id", "database_run_id", "scenario_id", "variant_id", "version_id", "version_no", "label", "current", "confirmed_as_v1"))
            out.put(key, unknown("BASELINE_ID_UNCONFIRMED", null));
        out.put("baseline_score", unknown("BASELINE_SCORE_UNAVAILABLE", null));
        if (snapshot == null || !snapshot.usable() || snapshot.integrity() != Integrity.VERIFIED) {
            String reason = snapshot == null ? "BASELINE_BINDING_MISSING" : "BASELINE_SNAPSHOT_UNVERIFIED";
            return new Binding("UNKNOWN", out, List.of(new Issue(Status.UNKNOWN, reason,
                    new SourceRef(snapshot == null ? r.artifact("result").id() : snapshot.id(), ""), "No verified authorized binding snapshot")));
        }
        Object data = snapshot.data();
        SourceRef ref = new SourceRef(snapshot.id(), "");
        List<Issue> issues = new ArrayList<>();
        if (!"vehicsim.baseline-binding-snapshot/v1".equals(at(data, "/schema")))
            return new Binding("UNKNOWN", out, List.of(new Issue(Status.INVALID, "BASELINE_SNAPSHOT_SCHEMA_INVALID", ref, "Unsupported offline export schema")));
        List<String> missing = new ArrayList<>(), conflicting = new ArrayList<>();
        if (!"vehicsim.result/v1".equals(r.get("result", "/format"))) missing.add("supported_result_schema");
        for (String p : List.of("/project_id", "/version_id", "/version_project_id", "/version_no", "/label", "/status", "/exported_at",
                "/run/run_id", "/run/project_id", "/run/scenario_id", "/run/scenario_version_id", "/run/aeb_version_id", "/run/result_sha256"))
            if (at(data, p) == null) missing.add(p);
        compare(data, "/project_id", data, "/version_project_id", conflicting);
        compare(data, "/project_id", data, "/run/project_id", conflicting);
        compare(data, "/version_id", data, "/run/aeb_version_id", conflicting);
        for (String id : List.of("run_id", "scenario_id", "scenario_version_id", "aeb_version_id")) {
            Object raw = r.get("result", "/source/" + id), exported = at(data, "/run/" + id);
            if (raw == null) missing.add("result/source/" + id);
            else if (exported != null && !raw.toString().equals(exported.toString())) conflicting.add("result/source/" + id);
        }
        if (at(data, "/run/result_sha256") != null && !at(data, "/run/result_sha256").equals(r.artifact("result").sha256())) conflicting.add("result_sha256");
        for (var parameter : PARAMETERS.entrySet()) {
            Object actual = r.get("result", "/outcome/params/" + parameter.getValue());
            Object expected = at(data, "/parameters/" + parameter.getKey());
            if (actual == null || expected == null) missing.add(parameter.getKey());
            else if (!finiteNonnegative(actual) || !finiteNonnegative(expected) || !sameNumber(actual, expected)) conflicting.add(parameter.getKey());
        }
        for (String p : List.of("/project_id", "/version_id", "/version_project_id", "/run/run_id", "/run/project_id", "/run/scenario_id", "/run/scenario_version_id", "/run/aeb_version_id")) {
            Object id = at(data, p);
            if (id != null && !id.toString().matches("[1-9]\\d*")) conflicting.add(p + ":not_decimal_id");
        }
        if (at(data, "/exported_at") != null) try { java.time.OffsetDateTime.parse(at(data, "/exported_at").toString()); }
        catch (RuntimeException e) { conflicting.add("exported_at"); }
        Object number = at(data, "/version_no");
        if (number != null && (!(number instanceof Number) || !number.toString().matches("[1-9]\\d*"))) conflicting.add("version_no:not_positive_integer");
        if (at(data, "/label") != null && !(at(data, "/label") instanceof String)) conflicting.add("label:not_string");
        if (at(data, "/creation_lineage/created_at") != null) try { java.time.OffsetDateTime.parse(at(data, "/creation_lineage/created_at").toString()); }
        catch (RuntimeException e) { conflicting.add("creation_lineage/created_at"); }
        if (!conflicting.isEmpty()) {
            issues.add(new Issue(Status.CONFLICTING, "BASELINE_BINDING_CONFLICT", ref, String.join(",", conflicting)));
            out.replaceAll((key, v) -> value(null, Status.CONFLICTING, null, null, List.of(ref), "BASELINE_BINDING_CONFLICT"));
            return new Binding("CONFLICTING", out, issues);
        }
        if (!missing.isEmpty()) return new Binding("UNKNOWN", out, List.of(new Issue(Status.UNKNOWN, "BASELINE_BINDING_INCOMPLETE", ref, String.join(",", missing))));
        Map<String, String> fields = Map.of("project_id", "/project_id", "database_run_id", "/run/run_id", "scenario_id", "/run/scenario_id",
                "variant_id", "/run/scenario_version_id", "version_id", "/version_id", "version_no", "/version_no", "label", "/label");
        fields.forEach((k, p) -> out.put(k, value(k.endsWith("_id") ? at(data, p).toString() : at(data, p), Status.OBSERVED, null, null, List.of(new SourceRef(snapshot.id(), p)))));
        String status = "RUN_VERSION_BOUND";
        Object currentId = at(data, "/current_baseline_version_id");
        if (currentId != null) {
            boolean current = currentId.toString().equals(at(data, "/version_id").toString()) && "BASELINE".equals(at(data, "/status"));
            out.put("current", value(current, Status.OBSERVED, null, null, List.of(ref), "CURRENTNESS_AS_OF_EXPORT_ONLY"));
            if (current) status = "PROJECT_BASELINE_CONFIRMED";
        }
        Object versionNo = at(data, "/version_no");
        if (!sameNumber(versionNo, 1)) out.put("confirmed_as_v1", value(false, Status.OBSERVED, null, null, List.of(ref)));
        else {
            Object lineage = at(data, "/creation_lineage");
            boolean full = lineage instanceof Map<?, ?> && at(lineage, "/created_at") != null && "MANUAL".equals(at(lineage, "/source"))
                    && sameNumber(at(lineage, "/version_no"), 1) && "v1.0".equals(at(lineage, "/label")) && "v1.0".equals(at(data, "/label"))
                    && Objects.equals(at(data, "/project_id").toString(), Objects.toString(at(lineage, "/project_id"), null))
                    && Objects.equals(at(data, "/version_id").toString(), Objects.toString(at(lineage, "/version_id"), null));
            if (full) out.put("confirmed_as_v1", value(true, Status.OBSERVED, null, null, List.of(new SourceRef(snapshot.id(), "/creation_lineage"))));
        }
        return new Binding(status, out, issues);
    }
    private static void compare(Object a, String ap, Object b, String bp, List<String> conflicts) {
        Object x = at(a, ap), y = at(b, bp);
        if (x != null && y != null && !x.toString().equals(y.toString())) conflicts.add(ap + " != " + bp);
    }
}
