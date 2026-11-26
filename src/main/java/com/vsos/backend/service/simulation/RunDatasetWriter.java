package com.vsos.backend.service.simulation;

import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Row;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.common.MiniJson;
import com.vsos.core.evaluation.AnalysisMetrics;
import com.vsos.core.evaluation.RunDataset;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
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
 * Khối này gom mọi thứ Failure Analysis cần để dựng lại một run mà không phải mở file khác: định danh, cấu hình thực, ba objective canonical
 * (trạng thái riêng từng cái), dấu vết (hash từng file + digest của dữ liệu nhúng), nội dung frames/ground truth kèm cờ chất lượng tín hiệu và
 * đồng hồ dạng máy đọc, collision evidence riêng và chỉ số dẫn xuất tham khảo {@code d_*}.
 *
 * <p>Không bao giờ làm run thất bại: lỗi dựng khối chỉ ghi {@code status.build = INVALID} và log. Trường chưa thu được là {@code null} kèm lý do ở
 * {@code status}; module phân tích đọc thành {@code UNKNOWN}. Khối không đổi số liệu của {@code outcome}/{@code evaluation} và không đổi định danh run.
 * Mọi thứ trong khối là <b>khai báo của producer</b>; khối không tự chứng nhận baseline, hiệu chuẩn hay đồng bộ đồng hồ.</p>
 */
@Slf4j
final class RunDatasetWriter {

    static final String DERIVED_VERSION = "run-dataset-derived/1";
    /** Cách băm dữ liệu nhúng (C02): bên nhận tính lại được mà không cần file CSV/JSON gốc. */
    static final String PAYLOAD_DIGEST_SPEC = "SHA-256 (hex) của chuỗi UTF-8 mà Python json.dumps(value, ensure_ascii=False) sinh ra "
            + "(dấu phân cách mặc định ', ' và ': ', số thực theo repr); bảng: value = {\"columns\": columns, \"rows\": rows}";
    /** Cùng hằng với {@code worker/sensor_recorder.py} (SUMMARY_WARMUP_S, MAX_PLAUSIBLE_ACCEL_MS2) để số dòng bị đánh dấu đối chiếu được với summary. */
    static final double INITIALIZATION_WINDOW_S = 0.5;
    static final double MAX_PLAUSIBLE_ACCEL_MPS2 = 50.0;
    private static final List<String> GT_ACCEL_COLUMNS = List.of("ax_ms2", "ay_ms2", "az_ms2");
    private static final Pattern PROFILE = Pattern.compile("^carla-(\\d+\\.\\d+\\.\\d+)(?:-xosc(\\d+))?$");
    private static final int VEHICLE_CORRIDOR_FROM_XOSC = 11;
    private static final int RELATIVE_IMPACT_FROM_XOSC = 9;
    private static final List<String> HASHED_FILES = List.of("bundle.json", "scenario.xosc", "scenario.runtime.xosc", "lifecycle.json",
            "scenario_runner.log", "sensors/frames.csv", "sensors/ground_truth.csv", "sensors/collisions.json", "sensors/summary.json");
    private static volatile String cachedGit;

    private RunDatasetWriter() {
    }

    /**
     * Dựng khối, đặt vào {@code result} (bộ nhớ) và ghi lại {@code result.json} trên đĩa. Không ném lỗi.
     *
     * @param aebVersion dòng {@code aeb_versions} của run đọc lúc ghi (null nếu không có); chỉ để khai báo trạng thái phiên bản (C06)
     */
    static void attach(Path resultPath, Map<String, Object> result, Row run, Map<String, Object> bundle, Map<String, Object> aebVersion,
                       Path folder, Path repoRoot) {
        Map<String, Object> block;
        try {
            block = build(run, bundle, aebVersion, result, folder, gitCommit(repoRoot));
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
            writeAtomically(resultPath, MiniJson.write(onDisk));
        } catch (IOException | RuntimeException e) {
            log.warn("Không ghi được khối dataset vào {}: {}", resultPath, e.toString());
        }
    }

    /** Keep the producer result intact if writing its optional dataset fails midway. */
    static void writeAtomically(Path resultPath, String content) throws IOException {
        Path temporary = Files.createTempFile(resultPath.toAbsolutePath().getParent(), "result-dataset-", ".tmp");
        try {
            Files.writeString(temporary, content, StandardCharsets.UTF_8);
            try {
                Files.move(temporary, resultPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temporary, resultPath, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    /** Khối dựng lúc worker vừa ghi kết quả (đường chạy run bình thường). */
    static final String CAPTURE_RESULT_WRITE = "RESULT_WRITE";
    /** Khối dựng lúc xuất file gộp cho run cũ chưa có khối: trạng thái DB là trạng thái lúc xuất, không phải lúc run. */
    static final String CAPTURE_COLLECTION_EXPORT = "COLLECTION_EXPORT";

    static Map<String, Object> build(Row run, Map<String, Object> bundle, Map<String, Object> aebVersion, Map<String, Object> result, Path folder,
                                     String gitCommit) throws IOException {
        return build(run, bundle, aebVersion, result, folder, gitCommit, CAPTURE_RESULT_WRITE);
    }

    static Map<String, Object> build(Row run, Map<String, Object> bundle, Map<String, Object> aebVersion, Map<String, Object> result, Path folder,
                                     String gitCommit, String capture) throws IOException {
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
        Double contactT = firstContact(collisionList);

        Map<String, Object> block = new LinkedHashMap<>();
        block.put("format", RunDataset.FORMAT);
        block.put("captured_when", capture);
        block.put("identity", identity(run, result, status));
        block.put("config", config(bundle, caseDoc, aebVersion, run, capture, status));
        block.put("objectives", objectives(result, metrics, carla, xosc, status));
        block.put("provenance", provenance(folder, simulator, parsed ? profile.group(1) : null, result, frames, groundTruth, summary, collisionList,
                gitCommit, status));
        block.put("sensors", summary == null ? null : Json.obj("summary", summary));
        status.put("sensors", summary == null ? state("MISSING", "không có sensors/summary.json (run không ghi cảm biến)") : state("OK", null));
        block.put("collisions", collisions(collisionList, metrics, status));
        block.put("time_series", timeSeries(frames, groundTruth, summary, outcome, contactT, status));
        block.put("derived", derived(result, bundle, carla, xosc, groundTruth, status));
        block.put("status", status);
        return block;
    }

    // ---------------------------------------------------------------- định danh, cấu hình, objective

    private static Map<String, Object> identity(Row run, Map<String, Object> result, Map<String, Object> status) {
        Map<String, Object> id = new LinkedHashMap<>();
        id.put("run_id", run.lng("id"));
        id.put("project_id", run.getLong("project_id"));
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

    private static Map<String, Object> config(Map<String, Object> bundle, Map<String, Object> caseDoc, Map<String, Object> aebVersion, Row run,
                                              String capture, Map<String, Object> status) {
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("aeb", bundle == null ? null : bundle.get("aeb"));
        cfg.put("aeb_version", aebVersion(aebVersion, run, capture));
        cfg.put("vehicle", bundle == null ? null : bundle.get("vehicle"));
        cfg.put("variant", bundle == null ? null : bundle.get("variant"));
        cfg.put("road_friction", caseDoc.get("road_friction"));
        List<String> gaps = new ArrayList<>();
        if (bundle == null || bundle.get("aeb") == null || bundle.get("vehicle") == null) {
            gaps.add("bundle thiếu aeb hoặc vehicle");
        }
        if (aebVersion == null) {
            gaps.add("không đọc được dòng aeb_versions của run");
        }
        String when = CAPTURE_RESULT_WRITE.equals(capture) ? "lúc ghi kết quả" : "lúc xuất file gộp (không phải lúc run)";
        status.put("config", gaps.isEmpty() ? state("OK", "aeb_version là trạng thái khai báo từ DB " + when + ", không phải chứng nhận baseline/hiệu chuẩn")
                : state("MISSING", String.join("; ", gaps)));
        return cfg;
    }

    /**
     * C06: phiên bản AEB của run và trạng thái của nó trong project. Khai báo, không xác minh. Dựng lúc ghi kết quả thì đó là trạng thái lúc
     * ghi; dựng lúc xuất file gộp (run cũ) thì trạng thái lúc ghi không còn biết được: hai trường {@code *_at_result_time} để null và trạng thái
     * đọc được nằm ở {@code *_at_export_time}.
     */
    private static Map<String, Object> aebVersion(Map<String, Object> version, Row run, String capture) {
        if (version == null) {
            return null;
        }
        boolean atResult = CAPTURE_RESULT_WRITE.equals(capture);
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("id", version.get("id"));
        v.put("project_id", version.get("project_id"));
        v.put("version_no", version.get("version_no"));
        v.put("label", version.get("label"));
        v.put("status_at_result_time", atResult ? version.get("status") : null);
        v.put("is_project_baseline_at_result_time", atResult ? "BASELINE".equals(version.get("status")) : null);
        if (!atResult) {
            v.put("status_at_export_time", version.get("status"));
            v.put("is_project_baseline_at_export_time", "BASELINE".equals(version.get("status")));
            v.put("note", "khối dựng lúc xuất file gộp: không biết trạng thái phiên bản lúc run ghi kết quả");
        }
        v.put("source", version.get("source"));
        v.put("parent_version_id", version.get("parent_version_id"));
        v.put("captured_when", capture);
        v.put("captured_at_utc", Instant.now().toString());
        v.put("verification", "DECLARED");
        v.put("matches_run", Objects.equals(String.valueOf(version.get("id")), String.valueOf(run.getLong("aeb_version_id"))));
        return v;
    }

    /** C08: mỗi objective có trạng thái riêng; null không mặc định là "không áp dụng". */
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
        List<String> missing = new ArrayList<>();
        List<String> notApplicable = new ArrayList<>();
        for (String key : List.of("rms_jerk_mps3", "impact_speed_mps", "stopping_distance_m")) {
            Object stored = metrics.get(key);
            Object graded = aebResult.get(key);
            boolean same = same(stored, graded);
            String[] st = objectiveState(key, stored, metrics);
            if (!same) {
                st = new String[] {"CONFLICTING", "outcome.metrics." + key + " khác evaluation.aeb_result." + key};
            }
            switch (st[0]) {
                case "CONFLICTING" -> conflicts.add(key);
                case "MISSING" -> missing.add(key);
                case "NOT_APPLICABLE" -> notApplicable.add(key);
                default -> { }
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("value", stored);
            entry.put("evaluation_value", graded);
            entry.put("consistent", same);
            entry.put("state", st[0]);
            entry.put("reason", st[1]);
            entry.put("source", "outcome.metrics." + key);
            out.put(key, entry);
        }
        out.put("impact_speed_definition", xosc >= RELATIVE_IMPACT_FROM_XOSC ? "relative_closing_speed" : "ego_speed_legacy");
        out.put("ego_impact_speed_mps", metrics.get("ego_impact_speed_mps"));
        out.put("rms_jerk_raw_mps3", metrics.get("rms_jerk_raw_mps3"));
        out.put("jerk_filter", carla.get("jerk_filtered"));
        if (!conflicts.isEmpty()) {
            status.put("objectives", state("CONFLICTING", "outcome.metrics khác evaluation.aeb_result ở: " + String.join(", ", conflicts)));
        } else if (!missing.isEmpty()) {
            status.put("objectives", state("MISSING", "thiếu giá trị dù điều kiện áp dụng có: " + String.join(", ", missing)));
        } else {
            status.put("objectives", state("OK", notApplicable.isEmpty() ? "cả ba objective có giá trị"
                    : "không áp dụng (xem state/reason từng objective): " + String.join(", ", notApplicable)));
        }
        return out;
    }

    /** Trạng thái của một objective từ điều kiện áp dụng của nó: impact cần va chạm, RMS jerk và quãng phanh cần có phanh. */
    static String[] objectiveState(String key, Object value, Map<String, Object> metrics) {
        if (value instanceof Number n && Double.isFinite(n.doubleValue())) {
            return new String[] {"OK", null};
        }
        if (value != null) {
            return new String[] {"INVALID", "giá trị không phải số hữu hạn"};
        }
        if ("impact_speed_mps".equals(key)) {
            Object collision = metrics.get("collision");
            if (Boolean.FALSE.equals(collision)) {
                return new String[] {"NOT_APPLICABLE", "không va chạm (outcome.metrics.collision = false)"};
            }
            return Boolean.TRUE.equals(collision) ? new String[] {"MISSING", "có va chạm nhưng thiếu vận tốc va chạm"}
                    : new String[] {"MISSING", "không biết run có va chạm hay không (thiếu outcome.metrics.collision)"};
        }
        if (!metrics.containsKey("brake_onset_t")) {
            return new String[] {"MISSING", "không biết run có phanh hay không (thiếu outcome.metrics.brake_onset_t)"};
        }
        if (metrics.get("brake_onset_t") == null) {
            return new String[] {"NOT_APPLICABLE", "không phanh (outcome.metrics.brake_onset_t = null)"};
        }
        return new String[] {"MISSING", "có phanh (brake_onset_t khác null) nhưng thiếu " + key};
    }

    private static boolean same(Object a, Object b) {
        if (a instanceof Number x && b instanceof Number y) {
            return Math.abs(x.doubleValue() - y.doubleValue()) < 1e-9;
        }
        return Objects.equals(a, b);
    }

    // ---------------------------------------------------------------- dấu vết

    private static Map<String, Object> provenance(Path folder, String simulator, String carlaVersion, Map<String, Object> result, Table frames,
                                                  Table groundTruth, Map<String, Object> summary, List<Object> collisions, String gitCommit,
                                                  Map<String, Object> status) throws IOException {
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
        p.put("files_verification", "DECLARED: hash của file gốc do producer tính; bên nhận không có file gốc thì chỉ kiểm được embedded_payloads");
        // C02: digest của chính dữ liệu đã nhúng trong khối, tính lại được từ result.json mà không cần file gốc
        Map<String, Object> embedded = new LinkedHashMap<>();
        embedded.put("spec", PAYLOAD_DIGEST_SPEC);
        embedded.put("time_series.frames", frames == null ? null : payloadSha256(tableValue(frames)));
        embedded.put("time_series.ground_truth", groundTruth == null ? null : payloadSha256(tableValue(groundTruth)));
        embedded.put("collisions.events", collisions == null ? null : payloadSha256(collisions));
        embedded.put("sensors.summary", summary == null ? null : payloadSha256(summary));
        p.put("embedded_payloads", embedded);
        List<String> gaps = new ArrayList<>();
        if (gitCommit == null) {
            gaps.add("git_commit");
        }
        gaps.addAll(missing.stream().map(n -> "thiếu file " + n).toList());
        status.put("provenance", gaps.isEmpty()
                ? state("OK", "hash file gốc là khai báo; embedded_payloads kiểm được ngay trong file. result.json không tự băm mình")
                : state("MISSING", String.join("; ", gaps)));
        return p;
    }

    private static Map<String, Object> tableValue(Table t) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("columns", t.columns());
        value.put("rows", t.rows());
        return value;
    }

    static String payloadSha256(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(MiniJson.write(value).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
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
        c.put("note", "relative_speed_before_ms là tốc độ tương đối ở tick ground truth ngay trước tiếp xúc; khác outcome.metrics.impact_speed_mps "
                + "(tick va chạm của lõi) là đúng phạm vi, không thay nhau");
        boolean conflict = flag instanceof Boolean b && b != !events.isEmpty();
        status.put("collisions", conflict ? state("CONFLICTING", "cờ collision trong result khác số sự kiện trong collisions.json")
                : state("OK", "impulse_ns = 0 nghĩa là CARLA không báo xung lực cho cặp này"));
        return c;
    }

    private static Double firstContact(List<Object> events) {
        Double first = null;
        if (events != null) {
            for (Object e : events) {
                Double t = Json.asDouble(Json.asMap(e).get("sim_time_s"));
                if (t != null && (first == null || t < first)) {
                    first = t;
                }
            }
        }
        return first;
    }

    // ---------------------------------------------------------------- chuỗi thời gian, đồng hồ, chất lượng tín hiệu

    private static Map<String, Object> timeSeries(Table frames, Table groundTruth, Map<String, Object> summary, Map<String, Object> outcome,
                                                  Double contactT, Map<String, Object> status) {
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
        ts.put("clock", clock(frames, groundTruth, outcome));
        ts.put("frames", frames == null ? null : table("sensors/frames.csv", frames));
        ts.put("ground_truth", groundTruth == null ? null : table("sensors/ground_truth.csv", groundTruth));
        ts.put("quality", quality(frames, groundTruth, summary, contactT, status));
        List<String> gaps = new ArrayList<>();
        if (frames == null) {
            gaps.add("thiếu sensors/frames.csv");
        }
        if (groundTruth == null) {
            gaps.add("thiếu sensors/ground_truth.csv");
        }
        status.put("time_series", gaps.isEmpty() ? state("OK", "cấu trúc bảng đầy đủ; chất lượng vật lý của từng tín hiệu xem status.signal_quality")
                : state("MISSING", String.join("; ", gaps)));
        return ts;
    }

    /**
     * C04: đồng hồ dạng máy đọc. Recorder ghi {@code frame} (world frame id của CARLA) và {@code sim_time_s}; lõi chỉ có {@code t}. Ghép
     * frames.csv với ground truth theo world frame id (bằng chứng có trong dữ liệu); ghép lõi với recorder theo thời gian gần nhất (khai báo).
     */
    private static Map<String, Object> clock(Table frames, Table groundTruth, Map<String, Object> outcome) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("id", "carla.sim_time");
        c.put("unit", "s");
        c.put("t0_definition", "sim_time_s = 0 ở tick đầu tiên recorder ghi; world frame id của tick đó ở streams.*.world_frame_first");
        Map<String, Object> streams = new LinkedHashMap<>();
        Map<Long, Double> frameTimes = frames == null ? Map.of() : frameTimes(frames);
        Map<Long, Double> gtTimes = groundTruth == null ? Map.of() : frameTimes(groundTruth);
        streams.put("frames_csv", frames == null ? null : stream(frames, frameTimes));
        streams.put("ground_truth_csv", groundTruth == null ? null : stream(groundTruth, gtTimes));
        List<Double> core = new ArrayList<>();
        for (Object f : Json.asList(outcome.get("frames"))) {
            Double t = Json.asDouble(Json.asMap(f).get("t"));
            if (t != null) {
                core.add(t);
            }
        }
        Map<String, Object> coreStream = new LinkedHashMap<>();
        coreStream.put("path", "outcome.frames[].t");
        coreStream.put("time_column", "t");
        coreStream.put("world_frame_column", null);
        coreStream.put("rows", core.size());
        coreStream.put("t_first", core.isEmpty() ? null : core.get(0));
        coreStream.put("t_last", core.isEmpty() ? null : core.get(core.size() - 1));
        coreStream.put("step_s", steps(core));
        streams.put("core_frames", coreStream);
        c.put("streams", streams);

        Map<String, Object> alignment = new LinkedHashMap<>();
        if (frames != null && groundTruth != null) {
            int common = 0;
            double maxDiff = 0.0;
            for (Map.Entry<Long, Double> e : frameTimes.entrySet()) {
                Double other = gtTimes.get(e.getKey());
                if (other != null) {
                    common++;
                    maxDiff = Math.max(maxDiff, Math.abs(other - e.getValue()));
                }
            }
            Map<String, Object> fg = new LinkedHashMap<>();
            fg.put("method", "world frame id");
            fg.put("binding", "OBSERVED");
            fg.put("common_frames", common);
            fg.put("only_in_frames_csv", frameTimes.size() - common);
            fg.put("only_in_ground_truth_csv", gtTimes.size() - common);
            fg.put("max_abs_time_diff_s", round(maxDiff));
            alignment.put("frames_csv_vs_ground_truth_csv", fg);
        }
        if (frames != null && !core.isEmpty()) {
            List<Double> recorder = new ArrayList<>(frameTimes.values());
            recorder.sort(Double::compare);
            double maxDiff = 0.0;
            for (double t : core) {
                maxDiff = Math.max(maxDiff, nearestGap(recorder, t));
            }
            Map<String, Object> cr = new LinkedHashMap<>();
            cr.put("method", "sim_time_s gần nhất");
            cr.put("binding", "DECLARED");
            cr.put("max_abs_time_diff_s", round(maxDiff));
            cr.put("note", "lõi không ghi world frame id; cùng bắt đầu từ 0 và lệch nhỏ không chứng minh đồng bộ độc lập");
            alignment.put("core_frames_vs_frames_csv", cr);
        }
        c.put("alignment", alignment);
        return c;
    }

    private static Map<Long, Double> frameTimes(Table t) {
        int frame = t.columns().indexOf("frame");
        int time = t.columns().indexOf("sim_time_s");
        Map<Long, Double> out = new LinkedHashMap<>();
        if (frame < 0 || time < 0) {
            return out;
        }
        for (List<Object> row : t.rows()) {
            if (row.get(frame) instanceof Number f && row.get(time) instanceof Number s) {
                out.putIfAbsent(f.longValue(), s.doubleValue());
            }
        }
        return out;
    }

    private static Map<String, Object> stream(Table t, Map<Long, Double> frameTimes) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("time_column", "sim_time_s");
        s.put("world_frame_column", "frame");
        s.put("rows", t.rows().size());
        s.put("distinct_frames", frameTimes.size());
        List<Long> ids = new ArrayList<>(frameTimes.keySet());
        List<Double> times = new ArrayList<>(frameTimes.values());
        s.put("world_frame_first", ids.isEmpty() ? null : ids.get(0));
        s.put("world_frame_last", ids.isEmpty() ? null : ids.get(ids.size() - 1));
        s.put("t_first", times.isEmpty() ? null : times.get(0));
        s.put("t_last", times.isEmpty() ? null : times.get(times.size() - 1));
        s.put("step_s", steps(times));
        return s;
    }

    private static Map<String, Object> steps(List<Double> times) {
        if (times.size() < 2) {
            return null;
        }
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        for (int i = 1; i < times.size(); i++) {
            double d = times.get(i) - times.get(i - 1);
            min = Math.min(min, d);
            max = Math.max(max, d);
        }
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("min", round(min));
        s.put("max", round(max));
        return s;
    }

    private static double nearestGap(List<Double> sorted, double t) {
        int lo = 0;
        int hi = sorted.size() - 1;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (sorted.get(mid) < t) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        double gap = Math.abs(sorted.get(lo) - t);
        return lo > 0 ? Math.min(gap, Math.abs(sorted.get(lo - 1) - t)) : gap;
    }

    /**
     * C05: cờ chất lượng theo tín hiệu và mặt nạ dòng. Dữ liệu thô giữ nguyên; mặt nạ là danh sách đoạn chỉ số dòng [từ, đến] (tính từ 0, gồm cả hai đầu)
     * trong {@code rows} của bảng tương ứng.
     */
    private static Map<String, Object> quality(Table frames, Table groundTruth, Map<String, Object> summary, Double contactT, Map<String, Object> status) {
        Map<String, Object> q = new LinkedHashMap<>();
        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("initialization_window_s", INITIALIZATION_WINDOW_S);
        spec.put("max_plausible_accel_mps2", MAX_PLAUSIBLE_ACCEL_MPS2);
        spec.put("ground_truth_accel_columns", GT_ACCEL_COLUMNS);
        spec.put("source", "worker/sensor_recorder.py SUMMARY_WARMUP_S, MAX_PLAUSIBLE_ACCEL_MS2; CLAUDE.md mục 7.5");
        spec.put("mask_format", "danh sách đoạn [từ, đến] chỉ số dòng (0-based, gồm hai đầu) trong rows của bảng");
        spec.put("post_contact_definition", "sim_time_s ≥ thời điểm tiếp xúc đầu tiên trong collisions.json");
        q.put("spec", spec);
        q.put("contact_time_s", contactT);
        List<String> notes = new ArrayList<>();
        boolean flagged = false;

        if (frames != null) {
            Map<String, Object> masks = new LinkedHashMap<>();
            masks.put("initialization", ranges(rowsWhere(frames, (row, t) -> t != null && t < INITIALIZATION_WINDOW_S)));
            masks.put("post_contact", contactT == null ? List.of() : ranges(rowsWhere(frames, (row, t) -> t != null && t >= contactT)));
            List<Integer> implausible = implausibleRows(frames, List.of("imu_accel_x_ms2"));
            masks.put("implausible_acceleration", ranges(implausible));
            Map<String, Object> signals = new LinkedHashMap<>();
            signals.put("ego_speed_ms", signal("OK", List.of(), "tốc độ ego từ CARLA"));
            signals.put("throttle,brake,steer", signal("OK", List.of(), "lệnh điều khiển xe đã áp ở tick đó (không phải lệnh AEB yêu cầu)"));
            signals.put("imu_accel_x_ms2,imu_jerk_ms3", signal("FLAGGED", List.of("initialization", "post_contact", "implausible_acceleration"),
                    "IMU có xung khi đặt lại vị trí/tốc độ ở đầu run và đo xung lực đâm sau va chạm; không dùng đỉnh thô làm chỉ số phanh"));
            signals.put("radar_*", signal("OK", List.of(), "ô trống khi radar không có điểm khớp mục tiêu ở tick đó"));
            signals.put("obstacle_*", signal("OK", List.of(), "ô trống khi không có vật cản phía trước"));
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("masks", masks);
            f.put("signals", signals);
            q.put("frames", f);
            flagged = true; // IMU luôn có đoạn khởi tạo
        }
        if (groundTruth != null) {
            Map<String, Object> masks = new LinkedHashMap<>();
            masks.put("initialization", ranges(rowsWhere(groundTruth, (row, t) -> t != null && t < INITIALIZATION_WINDOW_S)));
            masks.put("post_contact", contactT == null ? List.of() : ranges(rowsWhere(groundTruth, (row, t) -> t != null && t >= contactT)));
            List<Integer> implausible = implausibleRows(groundTruth, GT_ACCEL_COLUMNS);
            masks.put("implausible_acceleration", ranges(implausible));
            Map<String, Object> signals = new LinkedHashMap<>();
            signals.put("x_m,y_m,z_m,yaw_deg", signal("OK", List.of(), "vị trí và hướng ground truth (ActorSnapshot)"));
            signals.put("vx_ms,vy_ms,vz_ms,speed_ms", signal("OK", List.of(), "vận tốc ground truth"));
            signals.put("ax_ms2,ay_ms2,az_ms2,a_along_v_ms2", signal(implausible.isEmpty() ? "OK" : "FLAGGED",
                    implausible.isEmpty() ? List.of() : List.of("implausible_acceleration", "initialization", "post_contact"),
                    implausible.isEmpty() ? "không có dòng vượt ngưỡng" : implausible.size() + " dòng vượt " + MAX_PLAUSIBLE_ACCEL_MPS2
                            + " m/s² (xung khởi tạo/va chạm); giữ nguyên, không lọc"));
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("masks", masks);
            g.put("signals", signals);
            g.put("implausible_acceleration_rows", implausible.size());
            q.put("ground_truth", g);
            flagged |= !implausible.isEmpty();
            Object declared = summary == null ? null : Json.asMap(summary.get("ground_truth")).get("implausible_accel_rows");
            if (declared instanceof Number n && n.intValue() != implausible.size()) {
                status.put("signal_quality", state("CONFLICTING", "summary.json báo " + n.intValue() + " dòng gia tốc phi lý, khối dataset đếm được "
                        + implausible.size()));
                return q;
            }
            if (!implausible.isEmpty()) {
                notes.add("ground truth có " + implausible.size() + " dòng gia tốc phi lý");
            }
        }
        if (frames == null && groundTruth == null) {
            status.put("signal_quality", state("MISSING", "không có frames.csv và ground_truth.csv"));
        } else {
            notes.add("IMU có đoạn khởi tạo" + (contactT == null ? "" : " và đoạn sau va chạm") + " bị đánh dấu");
            status.put("signal_quality", state(flagged ? "FLAGGED" : "OK", "đọc được không có nghĩa là đúng vật lý; " + String.join("; ", notes)
                    + ". Dùng masks khi tính chỉ số, dữ liệu thô giữ nguyên"));
        }
        return q;
    }

    private interface RowTest {
        boolean test(List<Object> row, Double t);
    }

    private static List<Integer> rowsWhere(Table table, RowTest test) {
        int time = table.columns().indexOf("sim_time_s");
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < table.rows().size(); i++) {
            List<Object> row = table.rows().get(i);
            Double t = time < 0 ? null : Json.asDouble(row.get(time));
            if (test.test(row, t)) {
                out.add(i);
            }
        }
        return out;
    }

    private static List<Integer> implausibleRows(Table table, List<String> columns) {
        List<Integer> idx = columns.stream().map(table.columns()::indexOf).filter(i -> i >= 0).toList();
        return rowsWhere(table, (row, t) -> idx.stream().anyMatch(i -> row.get(i) instanceof Number n && Math.abs(n.doubleValue()) > MAX_PLAUSIBLE_ACCEL_MPS2));
    }

    /** Gom chỉ số dòng tăng dần thành đoạn [từ, đến]. */
    static List<List<Integer>> ranges(List<Integer> rows) {
        List<List<Integer>> out = new ArrayList<>();
        int start = -1;
        int prev = -1;
        for (int r : rows) {
            if (start < 0) {
                start = r;
            } else if (r != prev + 1) {
                out.add(List.of(start, prev));
                start = r;
            }
            prev = r;
        }
        if (start >= 0) {
            out.add(List.of(start, prev));
        }
        return out;
    }

    private static Map<String, Object> signal(String state, List<String> masks, String note) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("state", state);
        s.put("masks", masks);
        s.put("note", note);
        return s;
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
        d.put("excluded", "d_impact_speed_reduction_mps và các cột gộp nhiều run (AEB OFF − ON, thống kê lặp) cần nhiều run: tính ở phần phân tích, không ở một result.json");
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

    private static double round(double v) {
        return Math.round(v * 1e6) / 1e6;
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
