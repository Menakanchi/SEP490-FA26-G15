package com.vehicsim.vehicsim;

import com.vehicsim.core.AnalysisMetrics;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

import java.util.*;
import static com.vehicsim.vehicsim.Vs.*;

/** Baseline reads and immutable selections. No runner, optimizer, or reviewer logic. */
@Service
public class AnalysisService {
    private final Db db;
    private final Queries queries;
    private final ViewsService views;
    public AnalysisService(Db db, Queries queries, ViewsService views) {
        this.db = db; this.queries = queries; this.views = views;
    }
    // Scalar projection: dashboard never fetches the whole telemetry for every run.
    static final String SELECT = "SELECT r.id, r.scenario_id, r.scenario_version_id, r.aeb_version_id, "
            + "r.carla_vehicle_model_id, r.simulator_type, r.simulator_version, r.fixed_delta_seconds, "
            + "r.random_seed, r.status, r.end_reason, r.verdict, r.collision_occurred, r.is_false_positive, r.is_false_negative, "
            + "r.aeb_activated, r.rms_jerk_mps3, r.impact_speed_mps, r.stopping_distance_m, r.min_distance_m, r.min_ttc_s, "
            + "r.error_message, r.queued_at, s.code, s.name, s.category, sv.version_no, pc.category AS failure_class, "
            + "JSON_UNQUOTE(JSON_EXTRACT(r.run_config_json, '$.weather')) AS weather, "
            + "JSON_UNQUOTE(JSON_EXTRACT(r.run_config_json, '$.time_of_day')) AS time_of_day, "
            + "JSON_EXTRACT(r.telemetry_json, '$.metrics.brake_onset_t') AS brake_onset, "
            + "JSON_LENGTH(JSON_EXTRACT(r.telemetry_json, '$.frames')) AS trace_frames "
            + "FROM simulation_runs r JOIN scenarios s ON s.id = r.scenario_id "
            + "JOIN scenario_versions sv ON sv.id = r.scenario_version_id "
            + "LEFT JOIN failures f ON f.simulation_run_id = r.id "
            + "LEFT JOIN root_causes pc ON pc.failure_id = f.id AND pc.is_primary = 1 "
            + "WHERE r.project_id = ? AND r.purpose = 'BASELINE' AND sv.source = 'GENERATED' ";
    public record Filters(Long scenarioId, Long variantId, Long aebVersionId, Long vehicleId,
                          String simulator, String weather, String timeOfDay, String status, String failureClass) {}
    private static void condition(StringBuilder sql, List<Object> args, String column, Object value) {
        if (value != null && !value.toString().isBlank()) { sql.append(" AND ").append(column).append(" = ?"); args.add(value); }
    }
    public static AnalysisMetrics.Sample sample(Row row) {
        Boolean braked = row.get("brake_onset") != null && !"null".equals(row.str("brake_onset")) ? Boolean.TRUE
                : row.dbl("rms_jerk_mps3") != null || row.dbl("stopping_distance_m") != null ? Boolean.TRUE
                : Boolean.FALSE.equals(row.boolOrNull("aeb_activated")) ? Boolean.FALSE : null;
        boolean traceAvailable = row.asMap().containsKey("trace_frames")
                ? row.getInt("trace_frames") != null && row.getInt("trace_frames") > 0
                : !Json.asList(row.json("telemetry_json").get("frames")).isEmpty();
        String qualityStatus = "COMPLETED".equals(row.str("status")) && !traceAvailable ? "INCOMPLETE" : row.str("status");
        return new AnalysisMetrics.Sample(qualityStatus, row.str("end_reason"),
                row.boolOrNull("collision_occurred"), row.boolOrNull("is_false_positive"),
                row.boolOrNull("is_false_negative"), row.str("verdict"), braked,
                row.dbl("rms_jerk_mps3"), row.dbl("impact_speed_mps"), row.dbl("stopping_distance_m"));
    }
    static String outcome(Row row) {
        if ("TIMEOUT".equals(row.str("end_reason"))) return "TIMEOUT";
        if ("STOPPED".equals(row.str("status"))) return "CANCELLED";
        if ("FAILED".equals(row.str("status")) || "ERROR".equals(row.str("end_reason"))) return "ERROR";
        if (!"COMPLETED".equals(row.str("status"))) return "NOT_FINISHED";
        if (!AnalysisMetrics.valid(sample(row)) || !AnalysisMetrics.evidenceComplete(List.of(sample(row)))) return "INCOMPLETE";
        if (row.bool("collision_occurred")) return "COLLISION";
        if (row.bool("is_false_positive")) return "FALSE_BRAKING";
        if (row.bool("is_false_negative")) return "MISSED_BRAKING";
        String kind = Vs.classifyOutcome(false, row.dbl("min_ttc_s"), row.dbl("min_distance_m"));
        if ("NEAR_MISS".equals(kind)) return kind;
        return "FAIL".equals(row.str("verdict")) ? "OTHER_FAILURE" : "SAFE";
    }
    private static String identity(Row r) {
        return r.lng("aeb_version_id") + "|" + r.lng("carla_vehicle_model_id") + "|"
                + r.str("simulator_version") + "|" + r.str("fixed_delta_seconds");
    }
    static Map<String, Object> item(Row r) {
        Map<String,Object> out = Json.obj("run_id", r.lng("id"), "scenario_id", r.lng("scenario_id"),
                "scenario_version_id", r.lng("scenario_version_id"), "version_no", r.lng("version_no"),
                "family", r.str("name"), "variant", Vs.variantLabel(r.str("code"), r.lng("version_no")),
                "seed", r.getLong("random_seed"), "baseline_id", r.lng("aeb_version_id"),
                "vehicle_id", r.lng("carla_vehicle_model_id"), "simulator", r.str("simulator_version"),
                "dt", r.dbl("fixed_delta_seconds"), "status", r.str("status"), "outcome", outcome(r),
                "failure_class", r.str("failure_class"), "weather", r.str("weather"), "time_of_day", r.str("time_of_day"),
                "error", r.str("error_message"), "end_reason", r.str("end_reason"),
                "trace_available", r.getInt("trace_frames") != null && r.getInt("trace_frames") > 0,
                "metrics", Json.obj("rms_jerk_mps3", r.dbl("rms_jerk_mps3"), "impact_speed_mps", r.dbl("impact_speed_mps"),
                        "stopping_distance_m", r.dbl("stopping_distance_m")),
                "created_at", Vs.iso(r.ts("queued_at")));
        out.put("revision",digest(out));
        return out;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> dashboard(Filters filters, int page, int pageSize) {
        long projectId = queries.currentProject().lng("id");
        StringBuilder sql = new StringBuilder(SELECT);
        List<Object> args = new ArrayList<>(List.of(projectId));
        condition(sql,args,"r.scenario_id",filters.scenarioId());
        condition(sql,args,"r.scenario_version_id",filters.variantId());
        condition(sql,args,"r.aeb_version_id",filters.aebVersionId());
        condition(sql,args,"r.carla_vehicle_model_id",filters.vehicleId());
        condition(sql,args,"r.simulator_version",filters.simulator());
        condition(sql,args,"JSON_UNQUOTE(JSON_EXTRACT(r.run_config_json, '$.weather'))",filters.weather());
        condition(sql,args,"JSON_UNQUOTE(JSON_EXTRACT(r.run_config_json, '$.time_of_day'))",filters.timeOfDay());
        condition(sql,args,"r.status",filters.status());
        condition(sql,args,"pc.category",filters.failureClass());
        List<Row> rows = db.list(sql + " ORDER BY r.id DESC", args.toArray());
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String key : List.of("SAFE","COLLISION","FALSE_BRAKING","NEAR_MISS","MISSED_BRAKING","OTHER_FAILURE",
                "ERROR","CANCELLED","TIMEOUT","INCOMPLETE","NOT_FINISHED")) counts.put(key,0L);
        rows.forEach(row -> counts.merge(outcome(row),1L,Long::sum));
        Map<String,List<Row>> groups = new LinkedHashMap<>();
        rows.forEach(row -> groups.computeIfAbsent(identity(row), k -> new ArrayList<>()).add(row));
        List<Map<String,Object>> summaries = new ArrayList<>();
        groups.forEach((key, group) -> summaries.add(Json.obj("identity",key,"simulator",group.get(0).str("simulator_version"),
                "baseline_id",group.get(0).lng("aeb_version_id"),"vehicle_id",group.get(0).lng("carla_vehicle_model_id"),
                "objectives",AnalysisMetrics.aggregate(group.stream().map(AnalysisService::sample).toList()),
                "carla_observational_only",group.get(0).str("simulator_version").startsWith("carla-"))));
        return Json.obj("total",rows.size(),"counts",counts,"page",page,"page_size",pageSize,
                "items",rows.stream().skip((long)(page-1)*pageSize).limit(pageSize).map(AnalysisService::item).toList(),
                "objective_groups",summaries,"evaluation_version",AnalysisMetrics.VERSION);
    }
    private List<Row> selected(List<Long> ids, long projectId) {
        if (ids.isEmpty()) return List.of();
        List<Object> args = new ArrayList<>(List.of(projectId)); args.addAll(ids);
        return db.list(SELECT + " AND r.id IN (" + Db.placeholders(ids.size()) + ") ORDER BY r.id", args.toArray());
    }
    @Transactional(readOnly = true)
    public Map<String,Object> inspection(long runId) {
        List<Row> found = db.list(SELECT.replace(" AND r.purpose = 'BASELINE'", "")
                + " AND r.id = ?", queries.currentProject().lng("id"), runId);
        if (found.isEmpty()) throw new NotFoundException("baseline run");
        Row row = found.get(0);
        return Json.obj("run", item(row), "detail", "COMPLETED".equals(row.str("status")) ? views.failureDetail(runId) : null);
    }
    public record Selection(long scenarioId, long baselineId, List<Long> optimization, List<Long> validation, Map<String,String> revisions) {}
    private static List<Long> ids(List<Long> ids) {
        if (ids == null || ids.isEmpty() || ids.size() > 500 || ids.stream().anyMatch(i -> i == null || i <= 0)
                || new HashSet<>(ids).size() != ids.size()) throw new InvalidRequestException("Invalid analysis selection");
        return ids;
    }
    private static void checkSet(List<Row> rows) {
        if (rows.stream().anyMatch(row -> !AnalysisMetrics.valid(sample(row))
                || row.getInt("trace_frames") == null || row.getInt("trace_frames") == 0))
            throw new InvalidRequestException("Analysis selection contains invalid runs or missing telemetry");
        if (rows.stream().noneMatch(row -> "SAFE".equals(outcome(row))))
            throw new InvalidRequestException("Each analysis set must retain safe cases");
    }
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public Map<String,Object> freeze(Selection body, long userId) {
        List<Long> optimization = ids(body.optimization()), validation = ids(body.validation());
        List<Long> all = new ArrayList<>(optimization); all.addAll(validation);
        if (new HashSet<>(all).size() != all.size()) throw new InvalidRequestException("Analysis sets overlap");
        long projectId = queries.currentProject().lng("id");
        Row baseline = queries.baselineVersion(projectId);
        if (baseline == null || baseline.lng("id") != body.baselineId())
            throw new InvalidRequestException("Analysis baseline changed");
        List<Row> rows = selected(all, projectId);
        if (rows.size() != all.size() || rows.stream().anyMatch(row -> row.lng("scenario_id") != body.scenarioId()
                || row.lng("aeb_version_id") != body.baselineId()))
            throw new InvalidRequestException("Analysis selection belongs to another baseline or scenario");
        if (body.revisions() == null || rows.stream().anyMatch(row ->
                !Objects.equals(body.revisions().get(String.valueOf(row.lng("id"))),item(row).get("revision"))))
            throw new InvalidRequestException("Analysis preview changed; reload source runs");
        if (rows.stream().map(row -> row.lng("scenario_version_id")+"|"+row.getLong("random_seed")).distinct().count() != rows.size())
            throw new InvalidRequestException("Analysis selection repeats a variant and seed");
        if (rows.stream().map(AnalysisService::identity).distinct().count() != 1)
            throw new InvalidRequestException("Analysis selection mixes vehicle or simulator identities");
        Set<Long> optVariants = new HashSet<>();
        rows.stream().filter(row -> optimization.contains(row.lng("id"))).forEach(row -> optVariants.add(row.lng("scenario_version_id")));
        if (rows.stream().anyMatch(row -> validation.contains(row.lng("id")) && optVariants.contains(row.lng("scenario_version_id"))))
            throw new InvalidRequestException("Analysis sets overlap by variant");
        List<Row> opt = rows.stream().filter(row -> optimization.contains(row.lng("id"))).toList();
        List<Row> val = rows.stream().filter(row -> validation.contains(row.lng("id"))).toList();
        checkSet(opt); checkSet(val);
        if (!AnalysisMetrics.evidenceComplete(val.stream().map(AnalysisService::sample).toList()))
            throw new InvalidRequestException("Analysis selection contains invalid runs or missing telemetry");
        if (val.stream().anyMatch(row -> Boolean.TRUE.equals(sample(row).braked())
                && (row.dbl("rms_jerk_mps3") == null || row.dbl("stopping_distance_m") == null
                || (row.bool("collision_occurred") && row.dbl("impact_speed_mps") == null))))
            throw new InvalidRequestException("Analysis selection contains invalid runs or missing telemetry");
        if (!AnalysisMetrics.objectivesAvailable(opt.stream().map(AnalysisService::sample).toList()))
            throw new InvalidRequestException("Analysis optimization objectives are incomplete");
        Row first = rows.get(0);
        Map<String,Object> contract = Json.obj("version",AnalysisMetrics.VERSION,"source","SIMULATOR_RESULT",
                "per_run_definition","ADR040_LEGACY_UNCHANGED","filter","AS_RECORDED",
                "impact","EGO_SPEED_NOT_RELATIVE","stopping_distance","MAY_INCLUDE_EXTRAPOLATION",
                "identity",identity(first),"carla_observational_only",first.str("simulator_version").startsWith("carla-"));
        Map<String,Object> snapshot = Json.obj("schema","vehicsim.analysis-dataset/v2","evaluation",contract,
                "scenario",Json.obj("id",body.scenarioId(),"code",first.str("code"),"name",first.str("name"),"category",first.str("category")),
                "baseline",Json.obj("id",baseline.lng("id"),"label",Vs.versionLabel(baseline)),
                "reference",Json.obj("vehicle_id",first.lng("carla_vehicle_model_id"),"simulator",first.str("simulator_version"),"dt",first.dbl("fixed_delta_seconds")),
                "optimization_run_ids",optimization,"validation_run_ids",validation,
                "runs",rows.stream().map(AnalysisService::item).toList(),
                "optimization_objectives",AnalysisMetrics.aggregate(opt.stream().map(AnalysisService::sample).toList()),
                "validation_objectives",AnalysisMetrics.aggregate(val.stream().map(AnalysisService::sample).toList()));
        // Preserve actual scenario/run/vehicle/AEB snapshots as well as their IDs.
        List<Object> args = new ArrayList<>(List.of(projectId)); args.addAll(all);
        List<Row> manifests = db.list("SELECT id, run_config_json, telemetry_json FROM simulation_runs WHERE project_id = ? AND id IN ("
                + Db.placeholders(all.size()) + ") ORDER BY id",args.toArray());
        if (manifests.size() != rows.size() || manifests.stream().anyMatch(row -> !validTrace(row.json("telemetry_json"))))
            throw new InvalidRequestException("Analysis selection contains invalid runs or missing telemetry");
        snapshot.put("manifests",manifests.stream().map(row -> {
            Map<String,Object> raw = row.json("telemetry_json");
            return Json.obj("run_id",row.lng("id"),"scenario_config",row.json("run_config_json"),
                    "case",raw.get("case"),"params",raw.get("params"),"vehicle",raw.get("vehicle"),
                    "metric_source","SIMULATOR_RESULT","evaluation_version",AnalysisMetrics.VERSION,
                    "artifact_digest",digest(raw),"config_digest",digest(row.json("run_config_json")));
        }).toList());
        long id = db.insert("INSERT INTO analysis_results "
                + "(project_id, analysis_type, method, scenario_id, aeb_version_id, title, config_json, summary_json, status, created_by_user_id) "
                + "VALUES (?, 'BASELINE_DATASET', 'IMMUTABLE_SNAPSHOT', ?, ?, ?, ?, ?, 'COMPLETED', ?)",
                projectId,body.scenarioId(),body.baselineId(),"Baseline analysis selection",
                Json.obj("schema","vehicsim.analysis-dataset/v2","evaluation",contract),snapshot,userId);
        snapshot.put("id",id); snapshot.put("baseline_current",true); snapshot.put("handoff_ready",true);
        return snapshot;
    }
    static boolean validTrace(Map<String,Object> raw) {
        List<Object> frames = Json.asList(raw.get("frames"));
        if (frames.isEmpty()) return false;
        double previous = -1;
        for (Object value : frames) {
            Map<String,Object> frame = Json.asMap(value);
            for (String key : List.of("t","ego_x","ego_v","ego_a","ped_x","ped_y","ped_vy")) {
                if (!(frame.get(key) instanceof Number n) || !Double.isFinite(n.doubleValue())) return false;
            }
            double t = ((Number)frame.get("t")).doubleValue();
            if (t < 0 || t <= previous || ((Number)frame.get("ego_v")).doubleValue() < 0) return false;
            previous = t;
        }
        return true;
    }

    static boolean sameValue(Object a, Object b) {
        if (a instanceof Number x && b instanceof Number y)
            return new java.math.BigDecimal(x.toString()).compareTo(new java.math.BigDecimal(y.toString())) == 0;
        if (a instanceof Map<?,?> x && b instanceof Map<?,?> y)
            return x.keySet().equals(y.keySet()) && x.keySet().stream().allMatch(k -> sameValue(x.get(k),y.get(k)));
        if (a instanceof List<?> x && b instanceof List<?> y)
            return x.size() == y.size() && java.util.stream.IntStream.range(0,x.size()).allMatch(i -> sameValue(x.get(i),y.get(i)));
        return Objects.equals(a,b);
    }
    private static Object canonical(Object value) {
        if (value instanceof Map<?,?> map) {
            Map<String,Object> sorted = new TreeMap<>();
            map.forEach((key,item)->sorted.put(String.valueOf(key),canonical(item)));
            return sorted;
        }
        if (value instanceof List<?> list) return list.stream().map(AnalysisService::canonical).toList();
        if (value instanceof Number number) return new java.math.BigDecimal(number.toString()).stripTrailingZeros();
        return value;
    }
    static String digest(Object value) {
        try {
            return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(Json.write(canonical(value)).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String,Object> handoff(long datasetId) {
        Map<String,Object> saved = views.savedAnalysisDataset(datasetId);
        if (!"vehicsim.analysis-dataset/v2".equals(saved.get("schema")))
            throw new InvalidRequestException("Legacy analysis dataset requires a new selection");
        if (!Boolean.TRUE.equals(saved.get("baseline_current"))) throw new InvalidRequestException("Analysis baseline changed");
        List<Long> ids = Json.asList(saved.get("runs")).stream().map(Json::asMap)
                .map(row -> ((Number)row.get("run_id")).longValue()).toList();
        List<Row> current = selected(ids,queries.currentProject().lng("id"));
        if (current.size() != ids.size()) throw new InvalidRequestException("Analysis source runs are unavailable");
        for (Row row : current) {
            Map<String,Object> recorded = Json.asList(saved.get("runs")).stream().map(Json::asMap)
                    .filter(item -> ((Number)item.get("run_id")).longValue() == row.lng("id")).findFirst().orElseThrow();
            if (!AnalysisMetrics.valid(sample(row)) || row.getInt("trace_frames") == null || row.getInt("trace_frames") == 0
                    || !sameValue(item(row), recorded))
                throw new InvalidRequestException("Analysis source runs changed or telemetry is missing");
        }
        for (Object value : Json.asList(saved.get("manifests"))) {
            Map<String,Object> manifest = Json.asMap(value);
            Row source = db.first("SELECT telemetry_json, run_config_json FROM simulation_runs WHERE id = ? AND project_id = ?",
                    ((Number)manifest.get("run_id")).longValue(), queries.currentProject().lng("id"));
            if (source == null || !Objects.equals(manifest.get("artifact_digest"),digest(source.json("telemetry_json")))
                    || !Objects.equals(manifest.get("config_digest"),digest(source.json("run_config_json"))))
                throw new InvalidRequestException("Analysis source runs changed or telemetry is missing");
        }
        saved.put("handoff_ready",true); return saved;
    }
}
