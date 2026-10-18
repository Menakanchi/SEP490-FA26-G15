package com.vehicsim.vehicsim;

import com.vehicsim.audit.AuditLog;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lần chạy mô phỏng: xếp hàng, thực thi, ghi kết quả (FE-08/09/11/12). Port của ``runs.py``.
 * <p>
 * Một ``simulation_runs`` = một biến thể × một xe × một AEB version × một seed × một bộ mô phỏng. Thực thi: dựng bundle
 * (``vehicsim.variant/v1``, cũng là thứ nút "Tải JSON chạy CARLA" xuất ra) -> **worker Python** -> ``result.json``
 * (đã kèm kết quả chấm) -> ghi vào chính dòng ``simulation_runs`` + ``collision_events`` + ``failures`` + ``root_causes``
 * trong một transaction, rồi báo cho regression (nếu run thuộc một regression test).
 * <p>
 * Java không có bản AEB riêng: một AEB cho mọi bộ mô phỏng nằm ở ``worker/vehicsim_core`` (xem AGENTS.md), nên cả bộ động học
 * lẫn CARLA đều đi qua cùng một CLI nhận bundle và ghi result.
 */
@Slf4j
@Service
public class RunService {

    public static final String KINEMATIC_SIMULATOR = "vehicsim-kinematic-1.0";
    public static final String VARIANT_FORMAT = "vehicsim.variant/v1";
    public static final String RESULT_FORMAT = "vehicsim.result/v1";
    public static final double DT = 0.05;
    public static final double MAX_DURATION_S = 12.0;

    private static final int STOP_GRACE_S = 15;
    private static final String COLLISION_ACTOR = "walker.pedestrian.0001";

    /**
     * Mã 4 tham số AEB chỉnh được theo thứ tự trường của ``AebParams`` và giá trị mặc định của lõi (khi DB thiếu mã).
     * Sáu tham số còn lại là hằng số trong ``worker/vehicsim_core/aeb_stack.py`` — bundle không mang chúng (ADR-040).
     */
    static final Map<String, Double> AEB_DEFAULTS = new LinkedHashMap<>();

    static {
        AEB_DEFAULTS.put("TTC_THRESHOLD", 1.5);
        AEB_DEFAULTS.put("BRAKE_ACTIVATION_DELAY", 0.15);
        AEB_DEFAULTS.put("MAX_DECELERATION", 8.0);
        AEB_DEFAULTS.put("BRAKE_BUILDUP_RATE", 20.0);
    }

    /** evaluation.aeb_result -> cột kết quả của simulation_runs. */
    private static final Map<String, String> RESULT_COLUMNS = new LinkedHashMap<>();

    static {
        RESULT_COLUMNS.put("verdict", "verdict");
        RESULT_COLUMNS.put("collision", "collision_occurred");
        RESULT_COLUMNS.put("aeb_triggered", "aeb_activated");
        RESULT_COLUMNS.put("aeb_trigger_time_s", "aeb_activation_time_s");
        RESULT_COLUMNS.put("false_activation", "is_false_positive");
        RESULT_COLUMNS.put("missed_activation", "is_false_negative");
        RESULT_COLUMNS.put("impact_speed_mps", "impact_speed_mps");
        RESULT_COLUMNS.put("min_distance_m", "min_distance_m");
        RESULT_COLUMNS.put("min_ttc_s", "min_ttc_s");
        RESULT_COLUMNS.put("braking_latency_s", "braking_response_time_s");
        RESULT_COLUMNS.put("max_deceleration_mps2", "max_deceleration_mps2");
        RESULT_COLUMNS.put("mean_deceleration_mps2", "mean_deceleration_mps2");
        RESULT_COLUMNS.put("max_jerk_mps3", "max_jerk_mps3");
        RESULT_COLUMNS.put("rms_jerk_mps3", "rms_jerk_mps3");
        RESULT_COLUMNS.put("stopping_distance_m", "stopping_distance_m");
    }

    /** Báo cho regression rằng một run đã xong (kể cả khi hỏng). */
    public record RunFinished(long runId) {
    }

    /** Bộ mô phỏng không trả được kết quả (crash, timeout, sai định dạng). */
    public static class SimulatorException extends RuntimeException {
        public SimulatorException(String message) {
            super(message);
        }
    }

    private final Db db;
    private final Queries queries;
    private final VehicSimProperties props;
    private final TaskExecutor simulationExecutor;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate tx;
    private final FamilyService families;

    public RunService(Db db, Queries queries, VehicSimProperties props, @Qualifier("simulationExecutor") TaskExecutor simulationExecutor,
                      ApplicationEventPublisher events, TransactionTemplate tx, FamilyService families) {
        this.db = db;
        this.queries = queries;
        this.props = props;
        this.simulationExecutor = simulationExecutor;
        this.events = events;
        this.tx = tx;
        this.families = families;
    }

    // ------------------------------------------------------------------ bộ mô phỏng cấu hình

    /** Bộ mô phỏng mà cấu hình hiện tại chọn — dùng để lọc baseline cho regression. */
    public String configuredSimulator() {
        if ("carla".equals(props.simulator())) {
            return carlaSimulator(props.carlaVersion());
        }
        return KINEMATIC_SIMULATOR;
    }

    /** ``"0.9.16-12-gabc"`` -> ``"carla-0.9.16"``. */
    static String carlaSimulator(String version) {
        Matcher m = Pattern.compile("^\\d+\\.\\d+\\.\\d+").matcher(version.strip());
        String name = "carla-" + (m.find() ? m.group() : version.strip());
        return name.length() > 30 ? name.substring(0, 30) : name;
    }

    private List<String> carlaCommand() {
        String raw = props.carlaCommand();
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Json.parseList(raw).stream().map(String::valueOf).toList();
    }

    String simulatorForNewRuns() {
        if ("carla".equals(props.simulator()) && carlaCommand().isEmpty()) {
            throw new InvalidRequestException("VEHICSIM_SIMULATOR=carla nhưng chưa đặt VEHICSIM_CARLA_COMMAND");
        }
        return configuredSimulator();
    }

    static boolean isCarla(String simulator) {
        return simulator != null && simulator.startsWith("carla-");
    }

    static String simulatorType(String simulator) {
        return isCarla(simulator) ? "CARLA" : "KINEMATIC";
    }

    /** Seed ổn định theo biến thể: chạy lại cùng biến thể luôn cùng nhiễu perception. */
    static long seedFor(long scenarioVersionId) {
        return 48_000 + scenarioVersionId;
    }

    // ------------------------------------------------------------------ tạo + chạy

    /**
     * Tạo các dòng ``simulation_runs`` (PENDING). Chưa dispatch — người gọi dispatch sau commit.
     * Với REGRESSION, {@code baselineRuns} = {scenario_version_id: run baseline}: run mới chép đúng seed, đúng bộ mô phỏng và
     * đúng xe của run baseline — kết quả động học không bao giờ được so với CARLA.
     */
    public List<Long> createRuns(long projectId, long scenarioId, List<Row> variants, long vehicleModelId, long aebVersionId,
                                 long userId, String purpose, Long regressionTestId, Map<Long, Row> baselineRuns) {
        checkActiveRunQuota(userId, variants.size());
        LocalDateTime ts = Vs.now();
        List<Long> ids = new ArrayList<>();
        String newRunSimulator = null;
        for (Row variant : variants) {
            Row baseline = baselineRuns == null ? null : baselineRuns.get(variant.lng("id"));
            long seed;
            String simulator;
            if (baseline != null) {
                seed = baseline.lng("random_seed");
                simulator = baseline.str("simulator_version");
                if (baseline.lng("carla_vehicle_model_id") != vehicleModelId) {
                    throw new InvalidRequestException("run baseline dùng xe khác — không ghép cặp regression được");
                }
            } else {
                newRunSimulator = newRunSimulator != null ? newRunSimulator : simulatorForNewRuns();
                simulator = newRunSimulator;
                seed = seedFor(variant.lng("id"));
            }
            long runId = db.insert(
                    "INSERT INTO simulation_runs (project_id, scenario_id, scenario_version_id, carla_vehicle_model_id, aeb_version_id, "
                            + "simulator_type, simulator_version, fixed_delta_seconds, max_duration_s, regression_test_id, baseline_run_id, "
                            + "purpose, random_seed, status, run_config_json, created_by_user_id, queued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    projectId, scenarioId, variant.lng("id"), vehicleModelId, aebVersionId, simulatorType(simulator), simulator, DT,
                    MAX_DURATION_S, regressionTestId, baseline == null ? null : baseline.lng("id"), purpose, seed, "PENDING",
                    variant.json("scenario_ir_json"), userId, ts);
            ids.add(runId);
        }
        return ids;
    }

    /** Một người không được giữ quá nhiều run đang chờ + đang chạy (app mở đăng ký công khai, hàng đợi dùng chung). */
    private void checkActiveRunQuota(long userId, int newRuns) {
        long active = ((Number) db.scalar("SELECT COUNT(*) FROM simulation_runs WHERE created_by_user_id = ? AND status IN ('PENDING','RUNNING')", userId)).longValue();
        if (active + newRuns > props.maxActiveRunsPerUser()) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,
                    "Bạn đang có " + active + " run chờ hoặc đang chạy; thêm " + newRuns + " run nữa vượt hạn mức " + props.maxActiveRunsPerUser()
                            + ". Đợi các run hiện tại xong rồi thử lại.");
        }
    }

    /**
     * Đẩy run vào hàng đợi luồng nền, hoặc chạy ngay khi ``vehicsim.run-mode=inline``. Nếu đang trong transaction thì
     * chờ commit xong mới đẩy — luồng nền không thấy dòng chưa commit.
     */
    public void dispatch(List<Long> runIds) {
        if (runIds.isEmpty()) {
            return;
        }
        Runnable go = () -> {
            for (long id : runIds) {
                if ("inline".equals(props.runMode())) {
                    executeRun(id);
                } else {
                    simulationExecutor.execute(() -> executeRun(id));
                }
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    go.run();
                }
            });
        } else {
            go.run();
        }
    }

    /** Chạy một run. Idempotent và chống chạy đôi: chỉ luồng nào chuyển được PENDING -> RUNNING mới chạy tiếp. */
    public void executeRun(long runId) {
        Boolean claimed = tx.execute(status -> db.update(
                "UPDATE simulation_runs SET status = 'RUNNING', started_at = ?, worker_host = ? WHERE id = ? AND status = 'PENDING'",
                Vs.now(), hostName(), runId) > 0);
        if (!Boolean.TRUE.equals(claimed)) {
            return; // đã có luồng khác nhận, đã COMPLETED, hoặc không tồn tại
        }
        try {
            Row run = db.first("SELECT * FROM simulation_runs WHERE id = ?", runId);
            Map<String, Object> bundle = bundleForRun(run);
            Map<String, Object> result = runWorker(run, bundle);
            tx.executeWithoutResult(status -> persist(run, result));
        } catch (InterruptedException e) {
            // Tắt app giữa chừng: trả run về PENDING để lần khởi động sau nhặt lại, thay vì ghi FAILED.
            Thread.currentThread().interrupt();
            tx.executeWithoutResult(status -> db.update("UPDATE simulation_runs SET status = 'PENDING', started_at = NULL WHERE id = ? AND status = 'RUNNING'", runId));
            return;
        } catch (Exception e) {
            log.error("simulation run {} failed", runId, e);
            String message = String.valueOf(e.getMessage());
            tx.executeWithoutResult(status -> db.update(
                    "UPDATE simulation_runs SET status = 'FAILED', error_message = ?, ended_at = ? WHERE id = ?",
                    message.length() > 2000 ? message.substring(0, 2000) : message, Vs.now(), runId));
        }
        // Regression tự chốt khi mọi cặp đã xong — kể cả khi run này hỏng (test sẽ ra ERROR).
        events.publishEvent(new RunFinished(runId));
    }

    private static String hostName() {
        try {
            String name = InetAddress.getLocalHost().getHostName();
            return name.length() > 150 ? name.substring(0, 150) : name;
        } catch (IOException e) {
            return "unknown";
        }
    }

    // ------------------------------------------------------------------ bundle

    /** JSON mà nút "Tải JSON chạy CARLA" trả về — chính là đầu vào backend đưa cho bộ mô phỏng. */
    public Map<String, Object> bundleForRun(Row run) {
        Map<String, Double> codes = queries.aebValues(run.lng("aeb_version_id"));
        Row vehicle = queries.vehicleById(run.lng("carla_vehicle_model_id"));
        Object friction = db.scalar("SELECT road_friction FROM scenario_versions WHERE id = ?", run.lng("scenario_version_id"));
        Row version = db.first("SELECT * FROM aeb_versions WHERE id = ?", run.lng("aeb_version_id"));
        Map<String, Object> ir = run.json("run_config_json");

        Map<String, Object> params = new LinkedHashMap<>();
        AEB_DEFAULTS.forEach((code, def) -> params.put(code, codes.getOrDefault(code, def)));

        Map<String, Object> variant = Json.obj(
                "ego_speed_kmh", ((Number) ir.get("ego_speed_kmh")).doubleValue(),
                "trigger_distance_m", ((Number) ir.get("trigger_distance_m")).doubleValue(),
                "pedestrian_speed_mps", ((Number) ir.get("pedestrian_speed_mps")).doubleValue(),
                "stops_at_curb", Boolean.TRUE.equals(ir.get("stops_at_curb")),
                "weather", ir.getOrDefault("weather", "CLEAR"),
                "time_of_day", ir.getOrDefault("time_of_day", "DAY"),
                "friction", friction == null ? null : ((Number) friction).doubleValue());

        Map<String, Object> vehicleDoc = Json.obj(
                "name", vehicle.str("display_name") != null && !vehicle.str("display_name").isEmpty()
                        ? vehicle.str("display_name") : vehicle.str("carla_blueprint_id"),
                "length_m", vehicle.dbl("length_m"),
                "width_m", vehicle.dbl("width_m"),
                "max_brake_decel_mps2", vehicle.dbl("max_brake_decel_mps2"),
                "carla", carlaVehicle(vehicle));

        Map<String, Object> source = Json.obj(
                "run_id", run.lng("id"),
                "scenario_id", run.lng("scenario_id"),
                "scenario_version_id", run.lng("scenario_version_id"),
                "aeb_version_id", run.lng("aeb_version_id"),
                "carla_vehicle_model_id", run.lng("carla_vehicle_model_id"),
                "simulator", run.str("simulator_version"));

        return Json.obj(
                "format", VARIANT_FORMAT,
                "variant", variant,
                "aeb", Json.obj("label", version == null ? null : version.str("label"), "params", params),
                "vehicle", vehicleDoc,
                "seed", run.lng("random_seed"),
                "source", source);
    }

    /**
     * Phần thông số xe mà runner CARLA ép vào blueprint. Khối lượng luôn ép; hệ số cản và trọng tâm khi có. Ma sát lốp /
     * mô-men phanh chưa gửi vì đo trên CARLA 0.9.16 thấy đổi chúng không đổi quãng phanh (TD-17).
     */
    static Map<String, Object> carlaVehicle(Row row) {
        Map<String, Object> physics = Json.obj("mass", row.dbl("mass_kg"));
        if (row.dbl("drag_coefficient") != null) {
            physics.put("drag_coefficient", row.dbl("drag_coefficient"));
        }
        if (row.dbl("center_of_mass_x_m") != null) {
            physics.put("center_of_mass", Json.obj("x", row.dbl("center_of_mass_x_m"), "y", row.dbl("center_of_mass_y_m"),
                    "z", row.dbl("center_of_mass_z_m")));
        }
        Map<String, Object> dimensions = Json.obj("height_m", row.dbl("height_m"));
        if (row.dbl("wheelbase_m") != null) {
            dimensions.put("wheelbase_m", row.dbl("wheelbase_m"));
        }
        return Json.obj("blueprint", row.str("carla_blueprint_id"), "physics", physics, "dimensions", dimensions);
    }

    // ------------------------------------------------------------------ gọi worker

    Path repoRoot() {
        return Path.of(System.getProperty("user.dir"));
    }

    Path runDir(long runId) {
        Path root = Path.of(props.dataRoot());
        if (!root.isAbsolute()) {
            root = repoRoot().resolve(root);
        }
        return root.resolve("runs").resolve(String.valueOf(runId));
    }

    private int subprocessTimeoutS() {
        // Chừa STOP_GRACE_S + 10 s để run được ghi FAILED tử tế.
        return Math.max(10, props.simulationTimeoutS() - STOP_GRACE_S - 10);
    }

    /** Gọi CLI mô phỏng với bundle của run, đọc lại ``result.json``. Bộ động học dùng thư mục tạm, CARLA giữ thư mục run. */
    private Map<String, Object> runWorker(Row run, Map<String, Object> bundle) throws IOException, InterruptedException {
        boolean carla = isCarla(run.str("simulator_version"));
        List<String> command = new ArrayList<>();
        if (carla) {
            command.addAll(carlaCommand());
            if (command.isEmpty()) {
                throw new SimulatorException("run cần CARLA nhưng máy này chưa đặt VEHICSIM_CARLA_COMMAND");
            }
        } else {
            command.add(props.workerPython());
            command.add(repoRoot().resolve(props.workerDir()).resolve("kinematic_sim.py").toString());
        }
        Path folder = carla ? runDir(run.lng("id")) : Files.createTempDirectory("vehicsim-run-" + run.lng("id") + "-");
        Files.createDirectories(folder);
        try {
            Path bundlePath = folder.resolve("bundle.json");
            Files.writeString(bundlePath, Json.write(bundle), StandardCharsets.UTF_8);
            Path resultPath = folder.resolve("result.json");
            Files.deleteIfExists(resultPath);
            Path logPath = folder.resolve("simulator.log");

            command.addAll(List.of(bundlePath.toString(), "--out", folder.toString(), "--fast"));
            ProcessBuilder pb = new ProcessBuilder(command).directory(repoRoot().toFile()).redirectErrorStream(true)
                    .redirectOutput(logPath.toFile());
            pb.environment().put("PYTHONIOENCODING", "utf-8");
            Process proc = pb.start();
            int timeout = subprocessTimeoutS();
            boolean finished;
            try {
                finished = proc.waitFor(timeout, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                proc.descendants().forEach(ProcessHandle::destroyForcibly); // không để tiến trình con mồ côi khi app tắt
                proc.destroyForcibly();
                throw e;
            }
            if (!finished) {
                stop(proc);
                throw new SimulatorException("bộ mô phỏng vượt " + timeout + " s, đã dừng");
            }
            if (proc.exitValue() != 0 || !Files.exists(resultPath)) {
                throw new SimulatorException("bộ mô phỏng thoát mã " + proc.exitValue() + ": " + tail(logPath));
            }
            Map<String, Object> result = Json.parseMap(Files.readString(resultPath, StandardCharsets.UTF_8));
            checkResult(result, run);
            if (carla) {
                Map<String, Object> artifacts = new LinkedHashMap<>();
                artifacts.put("result", resultPath.toString());
                artifacts.putAll(Json.asMap(result.get("artifacts")).entrySet().stream()
                        .collect(LinkedHashMap::new, (m, e) -> m.put(e.getKey(), String.valueOf(e.getValue())), Map::putAll));
                result.put("artifacts", artifacts);
            }
            return result;
        } finally {
            if (!carla) {
                deleteQuietly(folder);
            }
        }
    }

    private static void checkResult(Map<String, Object> result, Row run) {
        if (!RESULT_FORMAT.equals(result.get("format"))) {
            throw new SimulatorException("result.json không đúng định dạng " + RESULT_FORMAT);
        }
        Map<String, Object> outcome = Json.asMap(result.get("outcome"));
        for (String key : List.of("frames", "events", "metrics", "end_reason")) {
            if (!outcome.containsKey(key)) {
                throw new SimulatorException("result.json thiếu outcome." + key);
            }
        }
        if (!(result.get("evaluation") instanceof Map)) {
            throw new SimulatorException("result.json thiếu kết quả chấm (evaluation) — worker quá cũ?");
        }
        String simulator = String.valueOf(result.getOrDefault("simulator", "unknown"));
        if (!simulator.equals(run.str("simulator_version"))) {
            throw new SimulatorException("run yêu cầu " + run.str("simulator_version") + " nhưng bộ mô phỏng báo " + simulator);
        }
    }

    /** Xin dừng nhẹ nhàng; quá STOP_GRACE_S mới giết cứng cả cây tiến trình (launcher venv trên Windows có tiến trình con). */
    private static void stop(Process proc) throws InterruptedException {
        proc.descendants().forEach(ProcessHandle::destroy);
        proc.destroy();
        if (!proc.waitFor(STOP_GRACE_S, TimeUnit.SECONDS)) {
            proc.descendants().forEach(ProcessHandle::destroyForcibly);
            proc.destroyForcibly();
            proc.waitFor();
        }
    }

    private static String tail(Path log) {
        try {
            List<String> lines = Files.readAllLines(log, StandardCharsets.UTF_8);
            return String.join(" | ", lines.subList(Math.max(0, lines.size() - 3), lines.size()));
        } catch (IOException e) {
            return "(không đọc được log)";
        }
    }

    private static void deleteQuietly(Path dir) {
        try (var walk = Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException ignored) {
            // thư mục tạm, hệ điều hành sẽ dọn
        }
    }

    // ------------------------------------------------------------------ ghi kết quả

    /**
     * Nhận ``result.json`` của một run CARLA chạy ngoài backend (vd. ``run_variant.py`` trên máy có GPU) cho run chưa có
     * kết quả. Chỉ nhận khi:
     * <ul>
     *   <li>run thuộc project và là run <b>CARLA</b> — kết quả CARLA không bao giờ ghi vào run động học (luật cứng 9);</li>
     *   <li>run đang {@code PENDING} hoặc {@code FAILED} — {@code RUNNING} đang có worker ghi, {@code COMPLETED} đã có
     *       kết quả (ghi lần nữa sẽ nhân đôi ca lỗi / va chạm);</li>
     *   <li>regression test chứa run (hoặc dùng run làm baseline) chưa chốt — không sửa bằng chứng sau khi đã có kết quả;</li>
     *   <li>``result.json`` qua đúng bước kiểm như run chạy trong backend ({@link #checkResult}).</li>
     * </ul>
     * Khoá dòng run ({@code FOR UPDATE}) nên luồng nền không nhận run này cùng lúc. Đường dẫn artifact do client gửi bị
     * bỏ — backend không ghi đường dẫn tới file nó không tạo.
     */
    @Transactional
    public Map<String, Object> submitCarlaResult(long projectId, long runId, long userId, Map<String, Object> resultPayload) {
        Row run = db.first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ? FOR UPDATE", runId, projectId);
        if (run == null) {
            throw new NotFoundException("simulation run");
        }
        if (!isCarla(run.str("simulator_version"))) {
            throw new InvalidRequestException("run " + runId + " dùng " + run.str("simulator_version")
                    + " — chỉ nhận kết quả CARLA cho run CARLA, không ghép với bộ động học");
        }
        String status = run.str("status");
        if (!"PENDING".equals(status) && !"FAILED".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "run " + runId + " đang " + status
                    + " — chỉ nhận kết quả cho run PENDING hoặc FAILED");
        }
        Object lockedTests = db.scalar("SELECT COUNT(*) FROM regression_tests t WHERE t.execution_status IN ('COMPLETED','FAILED') "
                + "AND (t.id = ? OR t.id IN (SELECT regression_test_id FROM simulation_runs WHERE baseline_run_id = ? AND regression_test_id IS NOT NULL))",
                run.getLong("regression_test_id"), runId);
        if (((Number) lockedTests).longValue() > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "run " + runId + " thuộc regression test đã chốt — không sửa kết quả sau khi có verdict");
        }
        if (resultPayload == null) {
            throw new InvalidRequestException("thiếu result.json");
        }
        Map<String, Object> result = new LinkedHashMap<>(resultPayload);
        result.remove("artifacts");
        try {
            checkResult(result, run);
        } catch (SimulatorException e) {
            throw new InvalidRequestException(e.getMessage());
        }
        // Run FAILED/PENDING không có dòng con (persist chạy trong một transaction), xoá phòng hờ để không bao giờ nhân đôi.
        db.update("DELETE FROM collision_events WHERE simulation_run_id = ?", runId);
        db.update("DELETE FROM failures WHERE simulation_run_id = ?", runId); // root_causes xoá theo (ON DELETE CASCADE)
        try {
            persist(run, result);
        } catch (ClassCastException | NullPointerException | IllegalArgumentException e) {
            throw new InvalidRequestException("result.json sai cấu trúc: " + e.getMessage());
        }
        AuditLog.event("run.carla_result", "success", "user_id", userId, "run_id", runId, "previous_status", status);
        events.publishEvent(new RunFinished(runId));
        return Json.obj("ok", true, "run_id", runId, "status", "COMPLETED");
    }


    /** Ghi kết quả chấm vào run + collision_events + failures + root_causes (một transaction). */
    @SuppressWarnings("unchecked")
    private void persist(Row run, Map<String, Object> result) {
        long runId = run.lng("id");
        LocalDateTime ts = Vs.now();
        Map<String, Object> outcome = Json.asMap(result.get("outcome"));
        Map<String, Object> ev = Json.asMap(result.get("evaluation"));
        Map<String, Object> metrics = Json.asMap(outcome.get("metrics"));
        List<Object> frames = Json.asList(outcome.get("frames"));
        List<Object> chain = Json.asList(ev.get("chain"));
        Map<String, Object> aebResult = Json.asMap(ev.get("aeb_result"));
        Map<String, Object> failure = ev.get("failure") instanceof Map ? Json.asMap(ev.get("failure")) : null;
        double duration = Json.asDouble(outcome.get("duration_s")) == null ? 0.0 : Json.asDouble(outcome.get("duration_s"));
        double crossingX = Json.asDouble(outcome.get("crossing_x")) == null ? 0.0 : Json.asDouble(outcome.get("crossing_x"));

        Map<String, Object> raw = Json.obj(
                "frames", frames,
                "events", outcome.get("events"),
                "metrics", metrics,
                "crossing_x", outcome.get("crossing_x"),
                "case", outcome.get("case"),
                "params", outcome.get("params"),
                "outcome", ev.get("outcome"),
                "headline", ev.get("headline"),
                "chain", chain);

        if (Boolean.TRUE.equals(metrics.get("collision"))) {
            Map<String, Object> collision = Json.asList(outcome.get("events")).stream()
                    .map(Json::asMap).filter(e -> "collision".equals(e.get("kind"))).findFirst().orElse(null);
            double at = collision != null ? Json.asDouble(collision.get("t")) : duration;
            Double impact = Json.asDouble(metrics.get("impact_speed_mps"));
            Object lastPedY = frames.isEmpty() ? null : Json.asMap(frames.get(frames.size() - 1)).get("ped_y");
            db.insert("INSERT INTO collision_events (simulation_run_id, frame, simulation_time_s, other_actor_type_id, collision_type, "
                            + "impact_speed_mps, location_x_m, location_y_m) VALUES (?,?,?,?,?,?,?,?)",
                    runId, Vs.roundToLong(at / run.dbl("fixed_delta_seconds")), at, COLLISION_ACTOR, "FRONT",
                    impact == null ? 0.0 : impact, crossingX, lastPedY);
        }

        if (failure != null) {
            int primaryIndex = -1; // khâu đầu tiên hỏng = nguyên nhân chính (so theo chỉ số, không theo tham chiếu đối tượng)
            for (int i = 0; i < chain.size(); i++) {
                if (!Boolean.TRUE.equals(Json.asMap(chain.get(i)).get("passed"))) {
                    primaryIndex = i;
                    break;
                }
            }
            Map<String, Object> primary = primaryIndex < 0 ? null : Json.asMap(chain.get(primaryIndex));
            long failureId = db.insert("INSERT INTO failures (simulation_run_id, failure_type, category, severity, description, detected_by, created_date) "
                            + "VALUES (?,?,?,?,?,?,?)",
                    runId, failure.get("failure_type"),
                    // Khâu của nguyên nhân chính; sát nút mà mọi khâu đạt thì là biên quyết định (ngưỡng TTC).
                    primary != null ? primary.get("stage") : "DECISION",
                    failure.get("severity"), failure.get("description") == null ? "" : failure.get("description"), "AUTO", ts);
            Map<String, Long> paramIds = new LinkedHashMap<>();
            for (Row p : db.list("SELECT id, code FROM aeb_parameters")) {
                paramIds.put(p.str("code"), p.lng("id"));
            }
            for (int i = 0; i < chain.size(); i++) {
                Map<String, Object> stage = Json.asMap(chain.get(i));
                if (Boolean.TRUE.equals(stage.get("passed")) || stage.get("cause_code") == null) {
                    continue;
                }
                String parameterCode = stage.get("parameter_code") == null ? "" : String.valueOf(stage.get("parameter_code"));
                db.insert("INSERT INTO root_causes (failure_id, category, cause_code, aeb_parameter_id, description, confidence, is_primary) VALUES (?,?,?,?,?,?,?)",
                        failureId, stage.get("stage"), stage.get("cause_code"), paramIds.get(parameterCode), stage.get("summary"),
                        stage.get("confidence"), i == primaryIndex);
            }
        }

        for (Map.Entry<String, Object> artifact : Json.asMap(result.get("artifacts")).entrySet()) {
            Path file = Path.of(String.valueOf(artifact.getValue()));
            String type = "result".equals(artifact.getKey()) ? "RESULT_FILE" : "video".equals(artifact.getKey()) ? "VIDEO_MP4" : "LOG";
            String mime = "result".equals(artifact.getKey()) ? "application/json" : "video".equals(artifact.getKey()) ? "video/mp4" : null;
            Long size = null;
            try {
                size = Files.isRegularFile(file) ? Files.size(file) : null;
            } catch (IOException ignored) {
                // kích thước chỉ để hiển thị
            }
            db.insert("INSERT INTO simulation_artifacts (simulation_run_id, artifact_type, file_name, storage_url, mime_type, file_size_bytes, created_date) VALUES (?,?,?,?,?,?,?)",
                    runId, type, file.getFileName().toString(), file.toString(), mime, size, ts);
        }

        Map<String, Object> carlaCase = Json.asMap(Json.asMap(outcome.get("case")).get("carla"));
        StringBuilder sql = new StringBuilder("UPDATE simulation_runs SET status = ?, ended_at = ?, error_message = NULL, end_reason = ?, "
                + "simulated_duration_s = ?, map_name = ?, first_detection_time_s = ?, first_detection_distance_m = ?, fcw_activated = ?, "
                + "fcw_time_s = ?, telemetry_json = ?");
        // ArrayList (không phải List.of) vì nhiều giá trị hợp lệ là NULL.
        List<Object> all = new ArrayList<>();
        all.add("COMPLETED");
        all.add(ts);
        all.add(outcome.get("end_reason"));
        all.add(duration);
        all.add(isCarla(run.str("simulator_version")) ? carlaCase.get("map") : null);
        all.add(metrics.get("first_detection_t"));
        all.add(metrics.get("first_detection_distance_m"));
        all.add(metrics.get("fcw_t") != null);
        all.add(metrics.get("fcw_t"));
        all.add(raw);
        for (Map.Entry<String, String> col : RESULT_COLUMNS.entrySet()) {
            sql.append(", ").append(col.getValue()).append(" = ?");
            all.add(aebResult.get(col.getKey()));
        }
        sql.append(" WHERE id = ?");
        all.add(runId);
        db.update(sql.toString(), all.toArray());
    }

    // ------------------------------------------------------------------ chạy cả họ

    /** Chạy mọi biến thể của bộ biến thể hiện hành bằng AEB version (mặc định: baseline) trên xe đang dùng. */
    @Transactional
    public List<Long> runFamily(long projectId, long scenarioId, long userId, Long aebVersionId) {
        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId);
        if (scenario == null) {
            throw new NotFoundException("scenario family");
        }
        Row version = aebVersionId == null
                ? queries.baselineVersion(projectId)
                : db.first("SELECT * FROM aeb_versions WHERE id = ? AND project_id = ?", aebVersionId, projectId);
        if (version == null) {
            throw new NotFoundException("AEB version");
        }
        List<Row> variants = families.variantsOf(families.latestBaseVersionId(scenarioId));
        List<Long> ids = createRuns(projectId, scenarioId, variants, queries.activeVehicle(projectId).lng("id"), version.lng("id"), userId,
                "BASELINE".equals(version.str("status")) ? "BASELINE" : "EVALUATION", null, null);
        dispatch(ids);
        return ids;
    }

    /** Nhặt lại run bỏ dở sau khi backend khởi động lại (hàng đợi trong bộ nhớ không sống qua restart). */
    public int recoverUnfinished() {
        // RUNNING quá lâu so với trần thời gian = tiến trình chết giữa chừng.
        db.update("UPDATE simulation_runs SET status = 'PENDING' WHERE status = 'RUNNING' AND started_at < ?",
                Vs.now().minusSeconds(props.simulationTimeoutS() * 2L));
        List<Long> ids = db.list("SELECT id FROM simulation_runs WHERE status = 'PENDING' ORDER BY id").stream().map(r -> r.lng("id")).toList();
        dispatch(ids);
        return ids.size();
    }
}
