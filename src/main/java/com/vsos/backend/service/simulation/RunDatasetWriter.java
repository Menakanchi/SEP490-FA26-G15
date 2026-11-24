package com.vsos.backend.service.simulation;

import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Row;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.common.MiniJson;
import com.vsos.core.evaluation.AnalysisMetrics;
import com.vsos.core.evaluation.RunDataset;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;

/**
 * Ghép khối {@code dataset} vào {@code result.json} của run CARLA (ADR-065) sau khi worker thoát, lúc {@code sensors/*} đã đầy đủ.
 * Khối này gom mọi thứ Failure Analysis cần để dựng lại một run mà không phải mở file khác: định danh, cấu hình thực, ba objective canonical,
 * dấu vết (hash từng file), nội dung frames/ground truth, collision evidence riêng và chỉ số dẫn xuất tham khảo {@code d_*}.
 *
 * <p>Không bao giờ làm run thất bại: lỗi dựng khối chỉ ghi {@code status.build = INVALID} và log. Trường chưa thu được là {@code null} kèm lý do ở
 * {@code status}; module phân tích đọc thành {@code UNKNOWN}. Khối không đổi số liệu của {@code outcome}/{@code evaluation} và không đổi định danh run.</p>
 */
@Slf4j
final class RunDatasetWriter {

    static final String DERIVED_VERSION = "run-dataset-derived/1";
    private static final Pattern PROFILE = Pattern.compile("^carla-(\\d+\\.\\d+\\.\\d+)(?:-xosc(\\d+))?$");
    private static final int VEHICLE_CORRIDOR_FROM_XOSC = 11;
    private static final int RELATIVE_IMPACT_FROM_XOSC = 9;
    private static final List<String> HASHED_FILES = List.of("bundle.json", "scenario.xosc", "scenario.runtime.xosc", "lifecycle.json",
            "scenario_runner.log", "sensors/frames.csv", "sensors/ground_truth.csv", "sensors/collisions.json", "sensors/summary.json");
    private static volatile String cachedGit;

    private RunDatasetWriter() {
    }

    /** Dựng khối, đặt vào {@code result} (bộ nhớ) và ghi lại {@code result.json} trên đĩa. Không ném lỗi. */
    static void attach(Path resultPath, Map<String, Object> result, Row run, Map<String, Object> bundle, Path folder, Path repoRoot) {
        Map<String, Object> block;
        try {
            block = build(run, bundle, result, folder, gitCommit(repoRoot));
        } catch (IOException | RuntimeException e) {
            log.warn("Không dựng được khối dataset cho run {}: {}", run.lng("id"), e.toString());
            block = new LinkedHashMap<>();
            block.put("format", RunDataset.FORMAT);
            block.put("status", Json.obj("build", state("INVALID", "không dựng được khối dataset: " + e.getClass().getSimpleName() + ": " + e.getMessage())));
        }
        result.put("dataset", block);
        try {
            Map<String, Object> onDisk = MiniJson.parseObject(Files.readString(resultPath, StandardCharsets.UTF_8));
            onDisk.put("dataset", block);
            Files.writeString(resultPath, MiniJson.write(onDisk), StandardCharsets.UTF_8);
        } catch (IOException | RuntimeException e) {
            log.warn("Không ghi được khối dataset vào {}: {}", resultPath, e.toString());
        }
    }

    static Map<String, Object> build(Row run, Map<String, Object> bundle, Map<String, Object> result, Path folder, String gitCommit) throws IOException {
        Map<String, Object> status = new LinkedHashMap<>();
        Map<String, Object> outcome = Json.asMap(result.get("outcome"));
        Map<String, Object> metrics = Json.asMap(outcome.get("metrics"));
        Map<String, Object> caseDoc = Json.asMap(outcome.get("case"));
        Map<String, Object> carla = Json.asMap(caseDoc.get("carla"));
        String simulator = String.valueOf(result.get("simulator"));
        Matcher profile = PROFILE.matcher(simulator);
        boolean parsed = profile.matches();
        int xosc = parsed && profile.group(2) != null ? Integer.parseInt(profile.group(2)) : 0;

        Table frames = readCsv(folder.resolve("sensors/frames.csv"));
        Table groundTruth = readCsv(folder.resolve("sensors/ground_truth.csv"));
        Map<String, Object> summary = readJson(folder.resolve("sensors/summary.json"));
        List<Object> collisionList = readJsonList(folder.resolve("sensors/collisions.json"));

        Map<String, Object> block = new LinkedHashMap<>();
        block.put("format", RunDataset.FORMAT);
        block.put("identity", identity(run, result, status));
        block.put("config", config(bundle, caseDoc));
        status.put("config", bundle == null || bundle.get("aeb") == null || bundle.get("vehicle") == null
                ? state("MISSING", "bundle thiếu aeb hoặc vehicle") : state("OK", null));
        block.put("objectives", objectives(result, metrics, carla, xosc, status));
        block.put("provenance", provenance(folder, simulator, parsed ? profile.group(1) : null, result, frames, groundTruth, gitCommit, status));
        block.put("sensors", summary == null ? null : Json.obj("summary", summary));
        status.put("sensors", summary == null ? state("MISSING", "không có sensors/summary.json (run không ghi cảm biến)") : state("OK", null));
        block.put("collisions", collisions(collisionList, metrics, status));
        block.put("time_series", timeSeries(frames, groundTruth, summary, status));
        block.put("derived", derived(result, bundle, carla, xosc, groundTruth, status));
        block.put("status", status);
        return block;
    }

    // ---------------------------------------------------------------- định danh, cấu hình, objective

    private static Map<String, Object> identity(Row run, Map<String, Object> result, Map<String, Object> status) {
        Map<String, Object> id = new LinkedHashMap<>();
        id.put("run_id", run.lng("id"));
        id.put("scenario_id", run.getLong("scenario_id"));
        id.put("scenario_version_id", run.getLong("scenario_version_id"));
        id.put("variant_id", run.getLong("scenario_version_id")); // biến thể = một phiên bản kịch bản; cùng giá trị để khớp tên cột phân tích
        id.put("aeb_version_id", run.getLong("aeb_version_id"));
        id.put("carla_vehicle_model_id", run.getLong("carla_vehicle_model_id"));
        id.put("seed", run.getLong("random_seed"));
        id.put("aeb_mode", run.str("aeb_mode"));
        id.put("purpose", run.str("purpose"));
        id.put("baseline_run_id", run.getLong("baseline_run_id"));
        id.put("simulator", run.str("simulator_version"));
        id.put("repetition", run.getLong("repetition"));
        id.put("attempt", run.getLong("attempt"));
        Object source = Json.asMap(result.get("source")).get("run_id");
        boolean conflict = source != null && !Objects.equals(String.valueOf(source), String.valueOf(run.lng("id")));
        boolean unnumbered = run.getLong("repetition") == null || run.getLong("attempt") == null;
        status.put("identity", conflict ? state("CONFLICTING", "source.run_id của result.json khác run đang xử lý")
                : unnumbered ? state("MISSING", "repetition/attempt: DB chưa chạy migration 019")
                : state("OK", "repetition = lần lặp của cùng cấu hình; attempt = số lần worker nhận run (2 trở lên: run bị khôi phục)"));
        return id;
    }

    private static Map<String, Object> config(Map<String, Object> bundle, Map<String, Object> caseDoc) {
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("aeb", bundle == null ? null : bundle.get("aeb"));
        cfg.put("vehicle", bundle == null ? null : bundle.get("vehicle"));
        cfg.put("variant", bundle == null ? null : bundle.get("variant"));
        cfg.put("road_friction", caseDoc.get("road_friction"));
        return cfg;
    }

    private static Map<String, Object> objectives(Map<String, Object> result, Map<String, Object> metrics, Map<String, Object> carla, int xosc,
                                                  Map<String, Object> status) {
        Map<String, Object> aebResult = Json.asMap(Json.asMap(result.get("evaluation")).get("aeb_result"));
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> version = new LinkedHashMap<>();
        version.put("simulator", result.get("simulator"));
        version.put("engine", result.get("engine"));
        version.put("aggregation", AnalysisMetrics.VERSION);
        out.put("metric_version", version);
        List<String> conflicts = new ArrayList<>();
        for (String key : List.of("rms_jerk_mps3", "impact_speed_mps", "stopping_distance_m")) {
            Object stored = metrics.get(key);
            Object graded = aebResult.get(key);
            boolean same = same(stored, graded);
            if (!same) {
                conflicts.add(key);
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("value", stored);
            entry.put("evaluation_value", graded);
            entry.put("consistent", same);
            entry.put("source", "outcome.metrics." + key);
            out.put(key, entry);
        }
        out.put("impact_speed_definition", xosc >= RELATIVE_IMPACT_FROM_XOSC ? "relative_closing_speed" : "ego_speed_legacy");
        out.put("ego_impact_speed_mps", metrics.get("ego_impact_speed_mps"));
        out.put("rms_jerk_raw_mps3", metrics.get("rms_jerk_raw_mps3"));
        out.put("jerk_filter", carla.get("jerk_filtered"));
        status.put("objectives", conflicts.isEmpty() ? state("OK", "null nghĩa là không áp dụng (không va chạm hoặc không phanh), không phải 0")
                : state("CONFLICTING", "outcome.metrics khác evaluation.aeb_result ở: " + String.join(", ", conflicts)));
        return out;
    }

    private static boolean same(Object a, Object b) {
        if (a instanceof Number x && b instanceof Number y) {
            return Math.abs(x.doubleValue() - y.doubleValue()) < 1e-9;
        }
        return Objects.equals(a, b);
    }

    // ---------------------------------------------------------------- dấu vết

    private static Map<String, Object> provenance(Path folder, String simulator, String carlaVersion, Map<String, Object> result, Table frames,
                                                  Table groundTruth, String gitCommit, Map<String, Object> status) throws IOException {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("generated_at_utc", Instant.now().toString());
        p.put("git_commit", gitCommit);
        p.put("simulator", simulator);
        p.put("carla_version", carlaVersion);
        p.put("carla_version_source", "định danh simulator của run (không hỏi server lúc chạy)");
        p.put("engine", result.get("engine"));
        Map<String, Object> lifecycle = readJson(folder.resolve("lifecycle.json"));
        p.put("core_jar_sha256", lifecycle == null ? null : Json.asMap(lifecycle.get("core")).get("sha256"));
        Map<String, Object> files = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        for (String name : HASHED_FILES) {
            Path file = folder.resolve(name);
            if (!Files.isRegularFile(file)) {
                missing.add(name);
                continue;
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("bytes", Files.size(file));
            entry.put("sha256", sha256(file));
            if ("sensors/frames.csv".equals(name) && frames != null) {
                entry.put("rows", frames.rows().size());
            }
            if ("sensors/ground_truth.csv".equals(name) && groundTruth != null) {
                entry.put("rows", groundTruth.rows().size());
            }
            files.put(name, entry);
        }
        p.put("bundle_sha256", Json.asMap(files.get("bundle.json")).get("sha256"));
        p.put("xosc_sha256", Json.asMap(files.get("scenario.xosc")).get("sha256"));
        p.put("files", files);
        List<String> gaps = new ArrayList<>();
        if (gitCommit == null) {
            gaps.add("git_commit");
        }
        gaps.addAll(missing.stream().map(n -> "thiếu file " + n).toList());
        status.put("provenance", gaps.isEmpty() ? state("OK", "result.json không tự băm mình; hash của các file còn lại nằm ở files")
                : state("MISSING", String.join("; ", gaps)));
        return p;
    }

    // ---------------------------------------------------------------- collision evidence

    private static Map<String, Object> collisions(List<Object> events, Map<String, Object> metrics, Map<String, Object> status) {
        Map<String, Object> c = new LinkedHashMap<>();
        Object flag = metrics.get("collision");
        c.put("flag_in_result", flag);
        if (events == null) {
            c.put("events", null);
            c.put("count", null);
            status.put("collisions", state("MISSING", "không có sensors/collisions.json"));
            return c;
        }
        c.put("events", events);
        c.put("count", events.size());
        boolean conflict = flag instanceof Boolean b && b != !events.isEmpty();
        status.put("collisions", conflict ? state("CONFLICTING", "cờ collision trong result khác số sự kiện trong collisions.json")
                : state("OK", "impulse_ns = 0 nghĩa là CARLA không báo xung lực cho cặp này"));
        return c;
    }

    // ---------------------------------------------------------------- chuỗi thời gian

    private static Map<String, Object> timeSeries(Table frames, Table groundTruth, Map<String, Object> summary, Map<String, Object> status) {
        Map<String, Object> ts = new LinkedHashMap<>();
        ts.put("time_origin", "sim_time_s của ScenarioRunner; frames.csv và ground_truth.csv cùng mốc t0 (sensor_recorder); outcome.frames[].t bắt đầu từ 0");
        Map<String, Object> units = new LinkedHashMap<>();
        units.put("time", "s");
        units.put("position", "m");
        units.put("velocity", "m/s");
        units.put("acceleration", "m/s^2");
        units.put("jerk", "m/s^3");
        units.put("yaw", "độ");
        ts.put("units", units);
        Object coordinates = summary == null ? null : Json.asMap(summary.get("ground_truth")).get("coordinates");
        ts.put("coordinate_system", coordinates);
        ts.put("frames", frames == null ? null : table("sensors/frames.csv", frames));
        ts.put("ground_truth", groundTruth == null ? null : table("sensors/ground_truth.csv", groundTruth));
        List<String> gaps = new ArrayList<>();
        if (frames == null) {
            gaps.add("thiếu sensors/frames.csv");
        }
        if (groundTruth == null) {
            gaps.add("thiếu sensors/ground_truth.csv");
        }
        Object implausible = summary == null ? null : Json.asMap(summary.get("ground_truth")).get("implausible_accel_rows");
        status.put("time_series", gaps.isEmpty() ? state("OK", implausible instanceof Number n && n.intValue() > 0
                ? "ground_truth có " + n.intValue() + " dòng gia tốc phi lý (xung khởi tạo/va chạm); giữ nguyên, không lọc" : null)
                : state("MISSING", String.join("; ", gaps)));
        return ts;
    }

    private static Map<String, Object> table(String source, Table t) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("source", source);
        out.put("row_count", t.rows().size());
        out.put("columns", t.columns());
        out.put("rows", t.rows());
        return out;
    }

    // ---------------------------------------------------------------- chỉ số dẫn xuất (nhóm C)

    private static Map<String, Object> derived(Map<String, Object> result, Map<String, Object> bundle, Map<String, Object> carla, int xosc,
                                               Table groundTruth, Map<String, Object> status) {
        Map<String, Object> vehicle = bundle == null ? Map.of() : Json.asMap(bundle.get("vehicle"));
        Double width = Json.asDouble(vehicle.get("width_m"));
        Double length = Json.asDouble(vehicle.get("length_m"));
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("version", DERIVED_VERSION);
        d.put("role", "REFERENCE_ONLY");
        d.put("note", "Số tham khảo tính độc lập từ dữ liệu của chính run này; không thay công thức của lõi/bộ chấm, không dùng làm objective hay bằng chứng đã xác nhận.");
        d.put("formulas", List.of("F02 hành lang AEB", "F04 quãng cần để dừng (CT 31b)", "F05 biên dừng mô hình", "F06 biên dừng quan sát", "F07 giảm tốc lý tưởng",
                "F08 mốc quyết định muộn nhất", "F09/F10 độ lệch so với mốc muộn nhất", "F12 giảm tốc đỉnh ground truth", "F13 sai số bám giảm tốc",
                "F14 khoảng hở hình học", "F15/F16 xung đột nếu không phanh", "F17 PET"));
        d.put("inputs", List.of("result.outcome.frames", "result.outcome.metrics", "result.outcome.params", "bundle.vehicle", "sensors/ground_truth.csv"));
        d.put("caveats", List.of("ego_x được coi là vị trí mũi xe; trục y của người đi bộ có tâm là làn ego.",
                "d_gt_peak_decel_0p1s_mps2 gồm cả khoảnh khắc va chạm; d_decel_tracking_error_peak_mps2 tin cậy thấp khi run kết thúc bằng va chạm hoặc sớm.",
                "d_required_braking_distance_m dùng giảm tốc khả dụng của chính hệ thống nên không độc lập với mô hình đã fit; chỉ để so với d_stopping_margin_observed_m.",
                "d_noBrake_conflict_by_gt ngoại suy tuyến tính theo ped_vy cuối khi cửa sổ xe chiếm vạch vượt quá thời gian run (xem d_noBrake_conflict_window_observed_fully)."));
        d.put("excluded","d_impact_speed_reduction_mps và các cột gộp nhiều run (AEB OFF − ON, thống kê lặp) cần nhiều run: tính ở phần phân tích, không ở một result.json");
        if (width == null || length == null) {
            d.put("values", null);
            d.put("null_reasons", null);
            status.put("derived", state("MISSING", "bundle.vehicle thiếu width_m hoặc length_m"));
            return d;
        }
        double corridor = AebParams.corridorHalfWidth(xosc >= VEHICLE_CORRIDOR_FROM_XOSC ? width : AebParams.LEGACY_CORRIDOR_VEHICLE_WIDTH_M);
        Map<String, Object> applied = Json.asMap(carla.get("physics_applied"));
        RunDataset.Geometry geometry = new RunDataset.Geometry(width, length, corridor, Json.asDouble(applied.get("length_m")), Json.asDouble(applied.get("width_m")));
        RunDataset.GroundTruth gt = groundTruth == null ? RunDataset.GroundTruth.NONE : groundTruth(groundTruth);
        Map<String, Object> values = RunDataset.derived(result, geometry, gt);
        d.put("values", values);
        d.put("null_reasons", RunDataset.nullReasons(values));
        d.put("ground_truth_used", gt.ego() != null && !gt.ego().isEmpty());
        status.put("derived", state("OK", groundTruth == null ? "các cột cần ground truth là null: thiếu sensors/ground_truth.csv" : null));
        return d;
    }

    private static RunDataset.GroundTruth groundTruth(Table t) {
        int frame = t.columns().indexOf("frame");
        int time = t.columns().indexOf("sim_time_s");
        int role = t.columns().indexOf("role");
        int x = t.columns().indexOf("x_m");
        int y = t.columns().indexOf("y_m");
        int yaw = t.columns().indexOf("yaw_deg");
        int speed = t.columns().indexOf("speed_ms");
        List<RunDataset.GtRow> ego = new ArrayList<>();
        List<RunDataset.GtRow> target = new ArrayList<>();
        if (frame < 0 || time < 0 || role < 0 || x < 0 || y < 0 || yaw < 0 || speed < 0) {
            return RunDataset.GroundTruth.NONE;
        }
        for (List<Object> row : t.rows()) {
            if (!(row.get(frame) instanceof Number f) || !(row.get(time) instanceof Number tt) || !(row.get(x) instanceof Number px)
                    || !(row.get(y) instanceof Number py) || !(row.get(yaw) instanceof Number pyaw) || !(row.get(speed) instanceof Number ps)) {
                continue;
            }
            RunDataset.GtRow item = new RunDataset.GtRow(f.intValue(), tt.doubleValue(), px.doubleValue(), py.doubleValue(), pyaw.doubleValue(), ps.doubleValue());
            if ("ego".equals(row.get(role))) {
                ego.add(item);
            } else if ("target".equals(row.get(role))) {
                target.add(item);
            }
        }
        return new RunDataset.GroundTruth(ego, target);
    }

    // ---------------------------------------------------------------- đọc file

    /** Bảng CSV: ô rỗng là null, số nguyên là Long, số thực là Double, còn lại giữ chuỗi. */
    record Table(List<String> columns, List<List<Object>> rows) {
    }

    static Table readCsv(Path file) throws IOException {
        if (!Files.isRegularFile(file)) {
            return null;
        }
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        if (lines.isEmpty()) {
            return null;
        }
        List<String> columns = List.of(lines.get(0).split(",", -1));
        List<List<Object>> rows = new ArrayList<>(lines.size() - 1);
        for (int i = 1; i < lines.size(); i++) {
            if (lines.get(i).isBlank()) {
                continue;
            }
            String[] cells = lines.get(i).split(",", -1);
            List<Object> row = new ArrayList<>(columns.size());
            for (int c = 0; c < columns.size(); c++) {
                row.add(c < cells.length ? cell(cells[c]) : null);
            }
            rows.add(row);
        }
        return new Table(columns, rows);
    }

    private static Object cell(String text) {
        if (text.isEmpty()) {
            return null;
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException ignored) {
            // không phải số nguyên
        }
        try {
            double value = Double.parseDouble(text);
            return Double.isFinite(value) ? (Object) value : text;
        } catch (NumberFormatException ignored) {
            return text;
        }
    }

    private static Map<String, Object> readJson(Path file) {
        try {
            return Files.isRegularFile(file) ? MiniJson.parseObject(Files.readString(file, StandardCharsets.UTF_8)) : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Object> readJsonList(Path file) {
        try {
            if (!Files.isRegularFile(file)) {
                return null;
            }
            Object parsed = MiniJson.parse(Files.readString(file, StandardCharsets.UTF_8));
            return parsed instanceof List<?> list ? (List<Object>) list : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    static String sha256(Path file) throws IOException {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String gitCommit(Path repoRoot) {
        String cached = cachedGit;
        if (cached != null) {
            return cached.isEmpty() ? null : cached;
        }
        String value = "";
        try {
            Process process = new ProcessBuilder("git", "rev-parse", "HEAD").directory(repoRoot.toFile()).redirectErrorStream(true).start();
            if (process.waitFor(5, TimeUnit.SECONDS) && process.exitValue() == 0) {
                String out = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
                value = out.matches("[0-9a-f]{40}") ? out : "";
            } else {
                process.destroyForcibly();
            }
        } catch (IOException e) {
            // không có git trên máy chạy: git_commit = null kèm lý do ở status.provenance
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        cachedGit = value;
        return value.isEmpty() ? null : value;
    }

    static Map<String, Object> state(String state, String reason) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("state", state);
        s.put("reason", reason);
        return s;
    }
}
