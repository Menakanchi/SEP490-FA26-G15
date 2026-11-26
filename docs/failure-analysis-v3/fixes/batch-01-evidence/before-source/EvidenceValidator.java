package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Validates streams independently; a bad sensor source cannot erase a good stored metric. */
public final class EvidenceValidator {
    public List<Issue> validate(Run run) {
        List<Issue> issues = new ArrayList<>(run.identityIssues());
        run.artifacts().values().forEach(a -> issues.addAll(a.issues()));
        checkType(run, "result", "", Map.class, issues);
        checkType(run, "result", "/outcome/metrics", Map.class, issues);
        checkType(run, "result", "/evaluation/aeb_result", Map.class, issues);
        checkType(run, "result", "/outcome/case", Map.class, issues);
        checkType(run, "result", "/outcome/params", Map.class, issues);
        for (String name : List.of("bundle", "environment", "lifecycle", "summary")) checkType(run, name, "", Map.class, issues);
        for (String name : List.of("metadata", "case_manifest", "manifest")) checkType(run, name, "", List.class, issues);
        if (run.get("result", "/format") != null && !"vehicsim.result/v1".equals(run.get("result", "/format")))
            add(issues, run, "result", "/format", Status.INVALID, "RESULT_SCHEMA_UNSUPPORTED", "Expected vehicsim.result/v1");
        for (String p : List.of("/format", "/simulator", "/seed", "/outcome/metrics/collision")) {
            if (run.get("result", p) == null) add(issues, run, "result", p, Status.UNKNOWN, "FIELD_MISSING_OR_NULL", p);
        }
        Object seed = run.get("result", "/seed");
        if (seed != null && (!(seed instanceof Number) || !seed.toString().matches("-?\\d+")))
            add(issues, run, "result", "/seed", Status.INVALID, "IDENTITY_TYPE_INVALID", "Seed must be an integer");
        Object collision = run.get("result", "/outcome/metrics/collision");
        if (collision != null && !(collision instanceof Boolean))
            add(issues, run, "result", "/outcome/metrics/collision", Status.INVALID, "BOOLEAN_TYPE_INVALID", "No truthy coercion");
        checkType(run, "result", "/outcome/frames", List.class, issues);
        checkType(run, "collisions", "", List.class, issues);
        stream(run, "result", "/outcome/frames", "t", null, null, issues);
        stream(run, "frames", "", "sim_time_s", "frame", null, issues);
        stream(run, "ground_truth", "", "sim_time_s", "frame", "actor_id", issues);
        if (run.get("collisions", "") instanceof List<?> events && !events.isEmpty())
            stream(run, "collisions", "", "sim_time_s", "frame", null, issues);
        compareRecorderClock(run, issues);
        add(issues, run, "result", "/outcome/frames", Status.UNKNOWN, "CLOCK_ALIGNMENT_UNKNOWN",
                "Core GameTime origin is not bound to recorder world-frame origin; no inferred offset applied");
        identity(run, issues);
        return List.copyOf(issues);
    }

    private void identity(Run r, List<Issue> issues) {
        Object metadata = r.get("metadata", "");
        if (metadata instanceof List<?> list) {
            int matched = 0;
            String suffix = r.directory().substring(r.directory().indexOf('/') + 1);
            for (int i = 0; i < list.size(); i++) {
                Object row = list.get(i);
                if (suffix.equals(Objects.toString(at(row, "/dir"), "").replace('\\', '/'))) {
                    matched++;
                    if (!r.runKey().equals(at(row, "/run_id")))
                        add(issues, r, "metadata", "/" + i + "/run_id", Status.CONFLICTING, "INCONSISTENT_IDENTITY", "Path and run key disagree");
                    String expectedCase = r.directory().split("/")[1];
                    if (!expectedCase.equals(at(row, "/case_id")))
                        add(issues, r, "metadata", "/" + i + "/case_id", Status.CONFLICTING, "INCONSISTENT_IDENTITY", "Case identity disagrees");
                    Object sim = at(row, "/simulator");
                    if (sim != null && r.get("result", "/simulator") != null && !sim.equals(r.get("result", "/simulator")))
                        add(issues, r, "metadata", "/" + i + "/simulator", Status.CONFLICTING, "INCONSISTENT_IDENTITY", "Simulator differs");
                    Object started = at(row, "/started_utc");
                    if (started != null) try { java.time.OffsetDateTime.parse(started.toString()); }
                    catch (RuntimeException e) { add(issues, r, "metadata", "/" + i + "/started_utc", Status.INVALID, "TIMESTAMP_INVALID", "Not RFC3339"); }
                }
            }
            if (matched != 1) add(issues, r, "metadata", "", matched == 0 ? Status.UNKNOWN : Status.CONFLICTING,
                    "RUN_METADATA_BINDING_UNRESOLVED", "Matching metadata records: " + matched);
        }
        Object bundleSeed = r.get("bundle", "/seed");
        if (bundleSeed != null && r.get("result", "/seed") != null && !sameNumber(bundleSeed, r.get("result", "/seed")))
            add(issues, r, "bundle", "/seed", Status.CONFLICTING, "INCONSISTENT_IDENTITY", "Bundle/result seed differs");
        Object mf = r.get("manifest", "");
        if (mf instanceof List<?> list) for (int i = 0; i < list.size(); i++) {
            Object row = list.get(i);
            if ((r.directory() + "/result.json").equals(at(row, "/path_in_zip"))) {
                Object expected = at(row, "/seed");
                if (expected != null && r.get("result", "/seed") != null && !expected.toString().equals(r.get("result", "/seed").toString()))
                    add(issues, r, "manifest", "/" + i + "/seed", Status.CONFLICTING, "INCONSISTENT_IDENTITY", "Manifest/result seed differs");
            }
        }
        Value mode = EvidenceReport.mode(r);
        if (mode.status() == Status.INVALID || mode.status() == Status.CONFLICTING)
            add(issues, r, "result", "/outcome/case/aeb_mode", mode.status(), "AEB_MODE_DISAGREEMENT", "Mode evidence is invalid or conflicting");
        Object jar = r.get("lifecycle", "/core/sha256");
        Artifact binary = r.artifact("vsos-core");
        if (jar != null && binary.sha256() != null && !jar.equals(binary.sha256()))
            add(issues, r, "lifecycle", "/core/sha256", Status.CONFLICTING, "CORE_HASH_DISAGREEMENT", "Lifecycle and binary hash differ");
    }

    private void compareRecorderClock(Run r, List<Issue> issues) {
        Map<String, Double> times = new HashMap<>();
        Object frames = r.get("frames", ""), gt = r.get("ground_truth", "");
        if (!(frames instanceof List<?> fs) || !(gt instanceof List<?> gs)) return;
        for (Object row : fs) {
            Double t = number(at(row, "/sim_time_s"));
            if (at(row, "/frame") != null && t != null) times.put(at(row, "/frame").toString(), t);
        }
        for (int i = 0; i < gs.size(); i++) {
            Object row = gs.get(i);
            Double t = number(at(row, "/sim_time_s")), f = times.get(Objects.toString(at(row, "/frame"), ""));
            if (t != null && f != null && Math.abs(t - f) > 1e-9) {
                add(issues, r, "ground_truth", "/" + i + "/sim_time_s", Status.CONFLICTING, "CLOCK_MISMATCH", "Same recorder frame has different timestamps");
                break;
            }
        }
    }

    private void stream(Run r, String name, String pointer, String time, String frame, String actor, List<Issue> issues) {
        Object data = r.get(name, pointer);
        if (!(data instanceof List<?> rows)) { checkType(r, name, pointer, List.class, issues); return; }
        if (rows.isEmpty()) { add(issues, r, name, pointer, Status.UNKNOWN, "STREAM_EMPTY", "No recorded samples"); return; }
        Map<String, Double> last = new HashMap<>();
        Map<String, Object> seen = new HashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            Object row = rows.get(i);
            String loc = pointer + "/" + i;
            if (!(row instanceof Map<?, ?> map)) { add(issues, r, name, loc, Status.INVALID, "STREAM_ROW_INVALID", "Expected object"); continue; }
            Double t = number(map.get(time));
            if (t == null || t < 0) { add(issues, r, name, loc + "/" + time, Status.INVALID, "TIMESTAMP_INVALID", "Missing, negative or nonfinite time"); continue; }
            String who = actor == null ? "stream" : Objects.toString(map.get(actor), "missing");
            if (actor != null && (map.get(actor) == null || !map.get(actor).toString().matches("\\d+")))
                add(issues, r, name, loc + "/" + actor, Status.INVALID, "ACTOR_ID_INVALID", "Actor ID missing or not decimal");
            List<String> numeric = name.equals("frames") ? List.of("ego_speed_ms", "throttle", "brake", "steer", "imu_accel_x_ms2", "imu_jerk_ms3", "radar_depth_m", "radar_rel_velocity_ms", "radar_ttc_s")
                    : name.equals("ground_truth") ? List.of("x_m", "y_m", "z_m", "yaw_deg", "vx_ms", "vy_ms", "vz_ms", "ax_ms2", "ay_ms2", "az_ms2", "speed_ms", "a_along_v_ms2")
                    : List.of("ego_x", "ego_v", "ego_a", "ped_x", "ped_y", "ped_vy", "ttc", "ttc_gt");
            for (String field : numeric) if (map.get(field) != null && number(map.get(field)) == null)
                add(issues, r, name, loc + "/" + field, Status.INVALID, "STREAM_NUMBER_INVALID", "Non-numeric or nonfinite sample; no zero substitution");
            Double previous = last.put(who, t);
            if (previous != null && t < previous)
                add(issues, r, name, loc, Status.INVALID, "TIMESTAMP_NON_MONOTONIC", "Time moved backwards within stream/actor");
            if (frame != null) {
                Object f = map.get(frame);
                if (f == null || !f.toString().matches("\\d+")) add(issues, r, name, loc, Status.INVALID, "FRAME_ID_INVALID", "Expected decimal frame ID");
                else {
                    Object old = seen.putIfAbsent(who + ":" + f, row);
                    if (old != null && !old.equals(row)) add(issues, r, name, loc, Status.CONFLICTING, "DUPLICATE_FRAME_DISAGREEMENT", "Same frame/actor, different record");
                }
            }
        }
    }
    private void checkType(Run r, String name, String pointer, Class<?> type, List<Issue> issues) {
        Object value = r.get(name, pointer);
        if (value == null) add(issues, r, name, pointer, Status.UNKNOWN, "FIELD_MISSING_OR_NULL", pointer);
        else if (!type.isInstance(value)) add(issues, r, name, pointer, Status.INVALID, "SCHEMA_TYPE_INVALID", "Expected " + type.getSimpleName());
    }
    static Double number(Object value) {
        try {
            if (!(value instanceof Number) && !(value instanceof String)) return null;
            double d = Double.parseDouble(value.toString());
            return Double.isFinite(d) ? d : null;
        } catch (NumberFormatException e) { return null; }
    }
    static void add(List<Issue> issues, Run r, String artifact, String pointer, Status status, String code, String detail) {
        issues.add(new Issue(status, code, r.ref(artifact, pointer), detail));
    }
}
