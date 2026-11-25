package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Validates streams independently; a bad sensor source cannot erase a good stored metric. */
public final class EvidenceValidator {
    // Numerical equality of recorded clock values, not a physical sample-age allowance.
    static final double CLOCK_EQUALITY_S = 1e-9;
    static final List<String> AEB_TIMES = List.of("first_detection_t", "aeb_decision_t", "brake_onset_t");
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
        collisionEvents(run, issues);
        compareRecorderClock(run, issues);
        for (String field : AEB_TIMES) if (run.get("result", "/outcome/metrics/" + field) != null) {
            Value time = coreEventTime(run, field, issues);
            if (time.status() != Status.OBSERVED)
                add(issues, run, "result", "/outcome/metrics/" + field, time.status(), time.reasonCodes().getFirst(),
                        "Event time is not admissible core command evidence");
        }
        add(issues, run, "result", "/outcome/frames", Status.UNKNOWN, "CLOCK_ALIGNMENT_UNKNOWN",
                "Core GameTime origin is not bound to recorder world-frame origin; no inferred offset applied");
        identity(run, issues);
        if(JsonInputAdapter.supports(run))jsonMetadata(run,issues);
        return List.copyOf(issues);
    }

    private void jsonMetadata(Run r,List<Issue> issues){
        Object aggregation=r.get("result","/dataset/objectives/metric_version/aggregation");
        if(aggregation!=null&&!com.vsos.core.evaluation.AnalysisMetrics.VERSION.equals(aggregation))
            add(issues,r,"result","/dataset/objectives/metric_version/aggregation",Status.CONFLICTING,"METRIC_METADATA_CONFLICT","Declared aggregation differs; stored scalar is retained, scoring is unresolved");
        for(String key:List.of("engine","simulator"))for(String base:List.of("/dataset/provenance/","/dataset/objectives/metric_version/")){
            Object claim=r.get("result",base+key),original=r.get("result","/"+key);
            if(claim!=null&&!Objects.equals(claim,original))add(issues,r,"result",base+key,Status.CONFLICTING,"METRIC_METADATA_CONFLICT","Producer/profile copies disagree");
        }
        for(String key:CanonicalObjectiveReader.KEYS){
            String p="/dataset/objectives/"+key;Object copy=r.get("result",p),canonical=r.get("result","/outcome/metrics/"+key),evaluation=r.get("result","/evaluation/aeb_result/"+key);
            if(copy instanceof Map<?,?> m){
                if(m.containsKey("consistent")&&!Boolean.TRUE.equals(m.get("consistent")))add(issues,r,"result",p+"/consistent",Status.CONFLICTING,"JSON_OBJECTIVE_CONSISTENCY_NOT_CONFIRMED","Declared copy consistency is not true; stored copies are still compared independently");
                if(m.containsKey("value")&&!sameNumber(canonical,m.get("value"))||m.containsKey("evaluation_value")&&!sameNumber(evaluation,m.get("evaluation_value")))
                    add(issues,r,"result",p,Status.CONFLICTING,"JSON_OBJECTIVE_MIRROR_DISAGREEMENT","Embedded objective copy differs; original producer fields retained");
                Object state=m.get("state");if(state!=null&&!List.of("OK","NOT_APPLICABLE","MISSING","INVALID","CONFLICTING").contains(state))
                    add(issues,r,"result",p+"/state",Status.INVALID,"JSON_OBJECTIVE_STATE_INVALID","Unknown objective state");
                if("INVALID".equals(state)||"CONFLICTING".equals(state))add(issues,r,"result",p+"/state","INVALID".equals(state)?Status.INVALID:Status.CONFLICTING,"JSON_OBJECTIVE_PRODUCER_QUALITY_REJECTED","Producer flags this objective; stored scalar remains available for inspection");
                if(Arrays.asList("NOT_APPLICABLE","MISSING").contains(state)&&m.get("value")!=null||"OK".equals(state)&&m.get("value")==null)
                    add(issues,r,"result",p,Status.CONFLICTING,"JSON_OBJECTIVE_STATE_VALUE_CONFLICT","State/value disagree; no null coercion");
                if(Arrays.asList("NOT_APPLICABLE","MISSING","INVALID","CONFLICTING").contains(state)&&!(m.get("reason") instanceof String s&&!s.isBlank()))
                    add(issues,r,"result",p+"/reason",Status.UNKNOWN,"JSON_OBJECTIVE_NULL_REASON_MISSING","Non-value/conflicting state needs a reason");
            }
        }
        if("FLAGGED".equals(r.get("result","/dataset/status/signal_quality/state")))
            add(issues,r,"result","/dataset/time_series/quality",Status.UNKNOWN,"SOURCE_SIGNAL_QUALITY_FLAGGED","Raw signal and initialization/contact masks retained; canonical metric is unchanged");
        Object flag=r.get("result","/dataset/collisions/flag_in_result"),canonical=r.get("result","/outcome/metrics/collision");
        if(flag!=null&&!Objects.equals(flag,canonical))add(issues,r,"result","/dataset/collisions/flag_in_result",Status.CONFLICTING,"JSON_COLLISION_FLAG_COPY_DISAGREEMENT","Collision flag copies differ; no authority selected");
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
            if (name.equals("result") && previous != null && t.equals(previous))
                add(issues, r, name, loc, Status.INVALID, "TIMESTAMP_DUPLICATE", "Core state timestamps must increase strictly");
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
    /** Claim-local event validation. Missing events are not invalid zero-time events. */
    static Value coreEventTime(Run r, String field, List<Issue> issues) {
        String pointer = "/outcome/metrics/" + field;
        List<SourceRef> refs = List.of(r.ref("result", pointer), r.ref("result", "/outcome/frames"));
        Object raw = r.get("result", pointer);
        if (raw == null) return value(null, Status.UNKNOWN, "s", "core", refs, "FIELD_MISSING_OR_NULL");
        Double time = number(raw);
        if (!(raw instanceof Number) || time == null || time < 0)
            return value(null, Status.INVALID, "s", "core", refs, "AEB_EVENT_TIME_INVALID");
        var frames = DiagnosticSupport.rows(r, "result", "/outcome/frames");
        if (frames.isEmpty() || DiagnosticSupport.blocked(r, issues, "result"))
            return value(null, Status.UNKNOWN, "s", "core", refs, "AEB_EVENT_CLOCK_COVERAGE_UNRESOLVED");
        Double first = number(frames.getFirst().get("t")), end = number(frames.getLast().get("t"));
        if (first == null || end == null || first < 0 || end < first)
            return value(null, Status.UNKNOWN, "s", "core", refs, "AEB_EVENT_CLOCK_COVERAGE_UNRESOLVED");
        if (time < first - CLOCK_EQUALITY_S || time > end + CLOCK_EQUALITY_S)
            return value(null, Status.INVALID, "s", "core", refs, "AEB_EVENT_OUTSIDE_EPISODE");
        for (int i = 0; i < AEB_TIMES.size(); i++) for (int j = i + 1; j < AEB_TIMES.size(); j++) {
            String early = AEB_TIMES.get(i), late = AEB_TIMES.get(j);
            Double a = number(r.get("result", "/outcome/metrics/" + early)), b = number(r.get("result", "/outcome/metrics/" + late));
            if (a != null && b != null && a >= 0 && b >= 0 && a > b + CLOCK_EQUALITY_S && (field.equals(early) || field.equals(late)))
                return value(null, Status.INVALID, "s", "core", List.of(r.ref("result", "/outcome/metrics/" + early),
                        r.ref("result", "/outcome/metrics/" + late)), "AEB_EVENT_ORDER_INVALID");
        }
        return value(time, Status.OBSERVED, "s", "core", refs);
    }

    /** Collisions are callbacks, not a one-row-per-world-frame state stream. */
    private void collisionEvents(Run r, List<Issue> issues) {
        Object raw = r.get("collisions", "");
        if (!(raw instanceof List<?> events)) return;
        Map<String, List<Integer>> identities = new LinkedHashMap<>();
        for (int i = 0; i < events.size(); i++) {
            Object row = events.get(i); String loc = "/" + i;
            if (!(row instanceof Map<?,?> event)) {
                add(issues, r, "collisions", loc, Status.INVALID, "COLLISION_EVENT_ROW_INVALID", "Expected event object");
                continue;
            }
            if (decimalId(event.get("frame")) == null)
                add(issues, r, "collisions", loc + "/frame", Status.INVALID, "COLLISION_EVENT_FRAME_INVALID", "Expected decimal world frame");
            if (decimalId(event.get("other_actor_id")) == null)
                add(issues, r, "collisions", loc + "/other_actor_id", Status.INVALID, "COLLISION_EVENT_ACTOR_INVALID", "Expected decimal contacted actor ID");
            Value time = contactTime(r, i);
            if (time.status() != Status.OBSERVED)
                add(issues, r, "collisions", loc + "/sim_time_s", time.status(), time.reasonCodes().getFirst(), "Event frame/time lacks consistent episode support");
            // Explicit IDs are scoped to their sensor. Without IDs, JSON array positions
            // identify records; differing payloads in one tick are not identity conflicts.
            if (event.get("event_id") != null) {
                String sensor = Objects.toString(event.get("sensor_id"), Objects.toString(event.get("sensor_actor_id"), "unspecified-sensor"));
                String key = com.vsos.core.common.MiniJson.write(List.of(sensor, event.get("event_id")));
                identities.computeIfAbsent(key, ignored -> new ArrayList<>()).add(i);
            }
        }
        for (var indices : identities.values()) if (indices.size() > 1) {
            Object first = events.get(indices.getFirst());
            boolean conflict = indices.stream().anyMatch(i -> !first.equals(events.get(i)));
            for (int i : indices) add(issues, r, "collisions", "/" + i,
                    conflict ? Status.CONFLICTING : Status.DERIVED,
                    conflict ? "COLLISION_EVENT_IDENTITY_CONFLICT" : "COLLISION_EVENT_REPEATED_RECORD",
                    conflict ? "Same explicit sensor/event identity has conflicting payloads; quarantine these records only" : "Repeated identical explicit event record");
        }
    }

    /** Exact recorder frame join proves support at the event, not complete no-contact coverage. */
    static Value contactTime(Run r, int index) {
        String loc = "/" + index;
        List<SourceRef> refs = new ArrayList<>(List.of(r.ref("collisions", loc)));
        Object raw = r.get("collisions", loc + "/sim_time_s");
        Double time = number(raw); String frame = decimalId(r.get("collisions", loc + "/frame"));
        if (time == null || time < 0)
            return value(null, Status.INVALID, "s", "recorder", refs, "COLLISION_EVENT_TIME_INVALID");
        if (frame == null) return value(null, Status.INVALID, "s", "recorder", refs, "COLLISION_EVENT_FRAME_INVALID");
        boolean supported = false, contextualSupport = false;
        List<SourceRef> invalidContext = new ArrayList<>();
        for (String name : List.of("frames", "ground_truth")) {
            Object data = r.get(name, "");
            if (!(data instanceof List<?> rows)) continue;
            java.math.BigInteger hit = new java.math.BigInteger(frame), previous = null, next = null;
            boolean pointSupported = false, contextValid = true;
            List<SourceRef> contextRefs = new ArrayList<>();
            for (int j = 0; j < rows.size(); j++) if (frame.equals(decimalId(at(rows.get(j), "/frame")))) {
                refs.add(r.ref(name, "/" + j + "/sim_time_s"));
                Double t = number(at(rows.get(j), "/sim_time_s"));
                if (t == null || t < 0 || Math.abs(t - time) > CLOCK_EQUALITY_S)
                    return value(null, Status.INVALID, "s", "recorder", refs, "COLLISION_EVENT_CLOCK_MISMATCH");
                supported = true; pointSupported = true;
            }
            // Check the immediate recorder context, rather than accepting a coordinated
            // outlier in event/CSV/GT as an episode or rejecting an unrelated bad row.
            for (Object row : rows) {
                String f = decimalId(at(row, "/frame")); if (f == null) continue;
                var id = new java.math.BigInteger(f);
                if (id.compareTo(hit) < 0 && (previous == null || id.compareTo(previous) > 0)) previous = id;
                if (id.compareTo(hit) > 0 && (next == null || id.compareTo(next) < 0)) next = id;
            }
            for (int j = 0; j < rows.size(); j++) {
                String f = decimalId(at(rows.get(j), "/frame")); if (f == null) continue;
                var id = new java.math.BigInteger(f);
                if (!id.equals(previous) && !id.equals(next)) continue;
                contextRefs.add(r.ref(name, "/" + j + "/sim_time_s"));
                Double t = number(at(rows.get(j), "/sim_time_s"));
                if (t == null || t < 0 || id.equals(previous) && t >= time - CLOCK_EQUALITY_S || id.equals(next) && t <= time + CLOCK_EQUALITY_S)
                    contextValid = false;
            }
            if (pointSupported && contextValid) { contextualSupport = true; refs.addAll(contextRefs); }
            else if (pointSupported) invalidContext.addAll(contextRefs);
        }
        // A broken GT pre-contact clock invalidates reconstruction, not an event
        // independently supported by a consistent CSV episode (and vice versa).
        // All available exact-frame timestamps above must still agree.
        if (supported && !contextualSupport) {
            refs.addAll(invalidContext);
            return value(null, Status.INVALID, "s", "recorder", refs, "COLLISION_EVENT_EPISODE_ORDER_INVALID");
        }
        return supported ? value(time, Status.OBSERVED, "s", "recorder", refs)
                : value(null, Status.UNKNOWN, "s", "recorder", refs, "COLLISION_EVENT_EPISODE_COVERAGE_UNPROVEN");
    }

    static String decimalId(Object x) { return x != null && x.toString().matches("\\d+") ? x.toString() : null; }
    static boolean collisionEventInvalid(Run r, List<Issue> issues, int index) {
        String loc = r.ref("collisions","/" + index).locator();
        return issues.stream().anyMatch(i -> i.source().artifactId().equals(r.artifact("collisions").id())
                && (i.source().locator().equals(loc) || i.source().locator().startsWith(loc + "/"))
                && i.code().startsWith("COLLISION_EVENT_") && (i.status() == Status.INVALID || i.status() == Status.CONFLICTING));
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
