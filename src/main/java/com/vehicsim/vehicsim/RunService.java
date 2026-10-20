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
import java.math.BigDecimal;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lần chạy mô phỏng: xếp hàng, thực thi, ghi kết quả (FE-08/09/11/12). Port của ``runs.py``.
 * <p>
 * Một ``simulation_runs`` = một biến thể × một xe × một AEB version × một seed × một bộ mô phỏng. Thực thi: dựng bundle
 * (``vehicsim.variant/v1`` nội bộ, profile carla-xosc chuyển thành OpenSCENARIO) -> **worker Python** -> ``result.json``
 * (đã kèm kết quả chấm) -> ghi vào chính dòng ``simulation_runs`` + ``collision_events`` + ``failures`` + ``root_causes``
 * trong một transaction, rồi báo cho regression (nếu run thuộc một regression test).
 * <p>
 * Java không có bản AEB riêng: một AEB cho mọi bộ mô phỏng nằm ở ``worker/vehicsim_core`` (xem AGENTS.md), nên cả bộ động học
 * lẫn CARLA đều gọi lại lõi đó và ghi cùng hợp đồng result.
 */
@Slf4j
@Service
public class RunService {

    public static final String KINEMATIC_SIMULATOR = "vehicsim-kinematic-1.0";
    public static final String VARIANT_FORMAT = "vehicsim.variant/v1";
    public static final String RESULT_FORMAT = "vehicsim.result/v1";
    public static final double DT = 0.05;
    /** Bước của profile CARLA OpenSCENARIO hiện tại (100 Hz, kế hoạch 20/10 D3); bộ động học vẫn dùng {@link #DT}. */
    public static final double CARLA_XOSC_STEP_S = 0.01;
    public static final double MAX_DURATION_S = 12.0;

    private static final int STOP_GRACE_S = 15;
    /** File cờ trong thư mục run: worker thấy nó thì tự dọn CARLA rồi thoát (Windows không có SIGTERM mềm cho tiến trình con). */
    static final String STOP_FLAG = "stop.requested";
    /** PID + thời điểm khởi động của worker CARLA, để sau khi backend chết còn tìm ra worker mồ côi. */
    static final String PID_FILE = "worker.pid";
    private static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase().contains("win");
    private static final String XOSC_SUFFIX = "-xosc3";
    private static final java.util.concurrent.locks.ReentrantLock CARLA_LOCK = new java.util.concurrent.locks.ReentrantLock();
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

    /** Người dùng hủy một run đang chạy; bị ném từ vòng chờ tiến trình và bắt ở {@link #executeRun}. */
    static class RunCancelledException extends RuntimeException {
        RunCancelledException() {
            super("Cancelled by user");
        }
    }

    /** Run mà JVM này đang giữ (từ lúc nhận tới lúc xong) và run đã bị xin hủy; cờ hủy là điểm trao đổi giữa HTTP và luồng chạy. */
    private final Set<Long> executing = ConcurrentHashMap.newKeySet();
    private final Set<Long> cancelRequested = ConcurrentHashMap.newKeySet();

    /** Thời gian chờ worker mồ côi tự dọn trước khi giết cả cây; đặt được để test không phải chờ 15 s. */
    int orphanGraceS = STOP_GRACE_S;

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
        if ("carla".equals(props.simulator()) || "carla-xosc".equals(props.simulator())) {
            return carlaSimulator(props.carlaVersion()) + ("carla-xosc".equals(props.simulator()) ? XOSC_SUFFIX : "");
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
        if (isCarla(configuredSimulator()) && carlaCommand().isEmpty()) {
            throw new InvalidRequestException("VEHICSIM_SIMULATOR=carla nhưng chưa đặt VEHICSIM_CARLA_COMMAND");
        }
        return configuredSimulator();
    }

    static boolean isCarla(String simulator) {
        return simulator != null && simulator.startsWith("carla-");
    }

    /** ``fixed_delta_seconds`` của run: bước mô phỏng theo identity simulator. */
    static double stepFor(String simulator) {
        return simulator != null && simulator.endsWith(XOSC_SUFFIX) ? CARLA_XOSC_STEP_S : DT;
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
        return createRuns(projectId, scenarioId, variants, vehicleModelId, aebVersionId, userId, purpose, regressionTestId, baselineRuns, null, null);
    }

    private List<Long> createRuns(long projectId, long scenarioId, List<Row> variants, long vehicleModelId, long aebVersionId,
                                  long userId, String purpose, Long regressionTestId, Map<Long, Row> baselineRuns,
                                  String requestedSimulator, Long requestedSeed) {
        checkActiveRunQuota(userId, variants.size());
        LocalDateTime ts = Vs.now();
        List<Long> ids = new ArrayList<>();
        String newRunSimulator = requestedSimulator;
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
                seed = requestedSeed == null ? seedFor(variant.lng("id")) : requestedSeed;
            }
            long runId = db.insert(
                    "INSERT INTO simulation_runs (project_id, scenario_id, scenario_version_id, carla_vehicle_model_id, aeb_version_id, "
                            + "simulator_type, simulator_version, fixed_delta_seconds, max_duration_s, regression_test_id, baseline_run_id, "
                            + "purpose, random_seed, status, run_config_json, created_by_user_id, queued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    projectId, scenarioId, variant.lng("id"), vehicleModelId, aebVersionId, simulatorType(simulator), simulator, stepFor(simulator),
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
        if (!executing.add(runId)) {
            return; // dispatch trùng (recoverUnfinished + dispatch): luồng thật đang giữ run, không được xoá dấu của nó
        }
        // Thêm trước khi nhận: cancelRun thấy RUNNING thì luôn tìm được run trong tập này.
        try {
            runClaimed(runId);
        } finally {
            executing.remove(runId);
            cancelRequested.remove(runId);
        }
    }

    private void runClaimed(long runId) {
        Boolean claimed = tx.execute(status -> db.update(
                "UPDATE simulation_runs SET status = 'RUNNING', started_at = ?, worker_host = ? WHERE id = ? AND status = 'PENDING'",
                Vs.now(), hostName(), runId) > 0);
        if (!Boolean.TRUE.equals(claimed)) {
            return; // đã có luồng khác nhận, đã COMPLETED/STOPPED, hoặc không tồn tại
        }
        try {
            Row run = db.first("SELECT * FROM simulation_runs WHERE id = ?", runId);
            String profile = run.str("simulator_version");
            if (isCarla(profile) && (profile.endsWith("-xosc1") || profile.endsWith("-xosc2"))) {
                // xosc2 là bước 0,05 s: không chạy lại bằng bộ xuất mới và không ghép với số đo 0,01 s (xosc3).
                throw new SimulatorException("run CARLA dùng " + profile.substring(profile.lastIndexOf('-') + 1)
                        + " đã cũ; tạo lượt chạy mới để dùng profile " + XOSC_SUFFIX);
            }
            Map<String, Object> bundle = bundleForRun(run);
            Map<String, Object> result = runWorker(run, bundle);
            tx.executeWithoutResult(status -> persist(run, result));
        } catch (InterruptedException e) {
            // Tắt app giữa chừng: trả run về PENDING để lần khởi động sau nhặt lại, thay vì ghi FAILED.
            Thread.currentThread().interrupt();
            tx.executeWithoutResult(status -> db.update("UPDATE simulation_runs SET status = 'PENDING', started_at = NULL WHERE id = ? AND status = 'RUNNING'", runId));
            return;
        } catch (RunCancelledException e) {
            // Run bị hủy không có điểm hợp lệ: không persist, không báo regression (cancelRun từ chối run của regression).
            tx.executeWithoutResult(status -> db.update(
                    "UPDATE simulation_runs SET status = 'STOPPED', error_message = ?, ended_at = ? WHERE id = ?",
                    e.getMessage(), Vs.now(), runId));
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
        if (isCarla(run.str("simulator_version"))) {
            CARLA_LOCK.lockInterruptibly();
            try {
                return runWorkerProcess(run, bundle);
            } finally {
                CARLA_LOCK.unlock();
            }
        }
        return runWorkerProcess(run, bundle);
    }

    private Map<String, Object> runWorkerProcess(Row run, Map<String, Object> bundle) throws IOException, InterruptedException {
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

            Path input = bundlePath;
            if (carla && run.str("simulator_version").endsWith(XOSC_SUFFIX)) {
                input = folder.resolve("scenario.xosc");
                writeXosc(bundlePath, input);
            }
            command.addAll(List.of(input.toString(), "--out", folder.toString(), "--fast"));
            ProcessBuilder pb = new ProcessBuilder(command).directory(repoRoot().toFile()).redirectErrorStream(true)
                    .redirectOutput(logPath.toFile());
            pb.environment().put("PYTHONIOENCODING", "utf-8");
            Files.deleteIfExists(folder.resolve(STOP_FLAG));
            Process proc = pb.start();
            if (carla) {
                recordWorker(folder, proc);
            }
            int timeout = subprocessTimeoutS();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeout);
            boolean finished = false;
            try {
                // Chờ từng nhịp ngắn để thấy yêu cầu hủy; tiến trình thoát thì dừng chờ ngay.
                while (!finished && System.nanoTime() < deadline) {
                    finished = proc.waitFor(500, TimeUnit.MILLISECONDS);
                    if (!finished && cancelRequested.contains(run.lng("id"))) {
                        stop(proc, folder, carla);
                        throw new RunCancelledException();
                    }
                }
            } catch (InterruptedException e) {
                proc.descendants().forEach(ProcessHandle::destroyForcibly); // không để tiến trình con mồ côi khi app tắt
                proc.destroyForcibly();
                throw e;
            }
            if (!finished) {
                stop(proc, folder, carla);
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
                if (input.toString().endsWith(".xosc")) {
                    artifacts.put("scenario", input.toString());
                }
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

    /** XML là artifact thực thi/tải xuống; bundle chỉ còn là giao tiếp nội bộ với bộ sinh Python. */
    public String exportXosc(Map<String, Object> bundle) {
        Path folder = null;
        try {
            folder = Files.createTempDirectory("vehicsim-xosc-");
            Path input = folder.resolve("bundle.json");
            Path output = folder.resolve("scenario.xosc");
            Files.writeString(input, Json.write(bundle), StandardCharsets.UTF_8);
            writeXosc(input, output);
            return Files.readString(output, StandardCharsets.UTF_8);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SimulatorException("Đã ngắt việc sinh OpenSCENARIO");
        } catch (IOException e) {
            throw new SimulatorException("Không sinh được OpenSCENARIO: " + e.getMessage());
        } finally {
            if (folder != null) {
                deleteQuietly(folder);
            }
        }
    }

    private void writeXosc(Path input, Path output) throws IOException, InterruptedException {
        Path log = output.resolveSibling("export.log");
        runTool(List.of(props.workerPython(), repoRoot().resolve(props.workerDir()).resolve("openscenario_export.py").toString(),
                input.toString(), "--out", output.toString()), log, 20);
    }

    private void runTool(List<String> command, Path log, int timeout) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(command).directory(repoRoot().toFile()).redirectErrorStream(true).redirectOutput(log.toFile());
        builder.environment().put("PYTHONIOENCODING", "utf-8");
        Process process = builder.start();
        try {
            if (!process.waitFor(timeout, TimeUnit.SECONDS)) {
                stop(process);
                throw new SimulatorException("Công cụ CARLA/OpenSCENARIO quá hạn " + timeout + " s");
            }
            if (process.exitValue() != 0) {
                throw new InvalidRequestException("Công cụ CARLA/OpenSCENARIO: " + tail(log));
            }
        } catch (InterruptedException e) {
            process.descendants().forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
            throw e;
        }
    }

    public Map<String, Object> carlaStatus() {
        if (carlaCommand().isEmpty()) {
            return Json.obj("configured", false, "connected", false, "scenario_runner", false);
        }
        Path folder = null;
        try {
            folder = Files.createTempDirectory("vehicsim-carla-probe-");
            List<String> command = new ArrayList<>(carlaCommand());
            command.add("--status");
            Path log = folder.resolve("status.json");
            runTool(command, log, 15);
            Map<String, Object> result = new LinkedHashMap<>(Json.parseMap(Files.readString(log, StandardCharsets.UTF_8)));
            result.put("configured", true);
            result.put("simulator", configuredSimulator());
            return result;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SimulatorException("Đã ngắt kiểm tra CARLA");
        } catch (IOException | RuntimeException e) {
            return Json.obj("configured", true, "connected", false, "scenario_runner", false, "error", e.getMessage());
        } finally {
            if (folder != null) {
                deleteQuietly(folder);
            }
        }
    }

    public List<Map<String, Object>> carlaRuns(long projectId) {
        return db.list("SELECT id, status, scenario_id, aeb_version_id, simulator_version, error_message, queued_at FROM simulation_runs "
                + "WHERE project_id = ? AND simulator_type = 'CARLA' ORDER BY id DESC LIMIT 30", projectId).stream().map(Row::asMap).toList();
    }

    /** Chạy lại đúng biến thể/AEB/xe/seed bằng profile mới; không gắn baseline_run_id khác simulator. */
    @Transactional
    public long runOnCarla(long projectId, long sourceId, long userId) {
        Row source = db.first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ?", sourceId, projectId);
        if (source == null) {
            throw new NotFoundException("simulation run");
        }
        if (!"carla-xosc".equals(props.simulator()) || carlaCommand().isEmpty()) {
            throw new InvalidRequestException("Chưa chọn chế độ OpenSCENARIO/CARLA local; chạy scripts/dev-carla.ps1 -RestartBackend trước");
        }
        Row variant = new Row(Json.obj("id", source.lng("scenario_version_id"), "scenario_ir_json", Json.write(source.json("run_config_json"))));
        List<Long> ids = createRuns(projectId, source.lng("scenario_id"), List.of(variant), source.lng("carla_vehicle_model_id"),
                source.lng("aeb_version_id"), userId, "EVALUATION", null, null, carlaSimulator(props.carlaVersion()) + XOSC_SUFFIX, source.lng("random_seed"));
        dispatch(ids);
        return ids.getFirst();
    }

    /**
     * Hủy một run (TD-37). PENDING thành STOPPED ngay; RUNNING chỉ hủy được khi luồng chạy nằm trong JVM này
     * (sau khi backend khởi động lại, run RUNNING mồ côi do {@link #recoverUnfinished} xử lý). Run thuộc regression/tối ưu
     * bị từ chối vì bộ so sánh cần đủ cặp; hủy từng run sẽ làm test không bao giờ chốt.
     *
     * @return {@code STOPPED} (đã hủy) hoặc {@code STOPPING} (đã xin dừng, worker đang dọn)
     */
    public String cancelRun(long projectId, long runId, long userId) {
        Row run = db.first("SELECT id, status, regression_test_id, optimization_trial_id FROM simulation_runs WHERE id = ? AND project_id = ?",
                runId, projectId);
        if (run == null) {
            throw new NotFoundException("simulation run");
        }
        if (!run.isNull("regression_test_id") || !run.isNull("optimization_trial_id")) {
            throw new InvalidRequestException("This run belongs to a regression test or optimization and cannot be cancelled on its own");
        }
        String status = run.str("status");
        if ("PENDING".equals(status)) {
            Integer changed = tx.execute(s -> db.update(
                    "UPDATE simulation_runs SET status = 'STOPPED', error_message = ?, ended_at = ? WHERE id = ? AND status = 'PENDING'",
                    "Cancelled by user", Vs.now(), runId));
            if (changed != null && changed > 0) {
                AuditLog.event("run.cancel", "success", "user_id", userId, "run_id", runId, "previous_status", status);
                return "STOPPED";
            }
            status = "RUNNING"; // vừa bị luồng chạy nhận giữa hai câu lệnh
        }
        if ("RUNNING".equals(status)) {
            if (!executing.contains(runId)) {
                // Run mồ côi (backend chết giữa run và chưa được nhặt lại): dừng worker còn sống rồi đóng run. Chờ tới
                // orphanGraceS nên làm ngoài luồng HTTP.
                AuditLog.event("run.cancel", "success", "user_id", userId, "run_id", runId, "previous_status", status, "orphan", true);
                CompletableFuture.runAsync(() -> cancelOrphan(runId));
                return "STOPPING";
            }
            cancelRequested.add(runId);
            AuditLog.event("run.cancel", "success", "user_id", userId, "run_id", runId, "previous_status", status);
            return "STOPPING";
        }
        throw new InvalidRequestException("Run is already " + status + "; nothing to cancel");
    }

    public Path carlaFile(long projectId, long runId, String name) {
        Row run = db.first("SELECT id FROM simulation_runs WHERE id = ? AND project_id = ? AND simulator_type = 'CARLA'", runId, projectId);
        if (run == null || !(List.of("frames.csv", "collisions.json").contains(name) || name.matches("[0-9]{8}\\.png"))) {
            throw new NotFoundException("CARLA artifact");
        }
        Path path = runDir(runId).resolve("sensors").resolve(name.endsWith(".png") ? "camera/" + name : name);
        if (!Files.isRegularFile(path)) {
            throw new NotFoundException("CARLA artifact");
        }
        return path;
    }

    public Map<String, Object> carlaData(long projectId, long runId, TelemetryMetricsService telemetry) throws IOException {
        Path csv = carlaFile(projectId, runId, "frames.csv");
        Path collisions = carlaFile(projectId, runId, "collisions.json");
        List<Map<String, Object>> hits = Json.parseList(Files.readString(collisions, StandardCharsets.UTF_8)).stream().map(Json::asMap).toList();
        var summary = telemetry.summarise(telemetry.parseCsvFrames(Files.readString(csv, StandardCharsets.UTF_8)), telemetry.parseCollisions(hits), 4.6);
        List<String> images = List.of();
        Path camera = csv.getParent().resolve("camera");
        if (Files.isDirectory(camera)) {
            try (var files = Files.list(camera)) {
                images = files.map(p -> p.getFileName().toString()).filter(n -> n.matches("[0-9]{8}\\.png")).sorted().toList();
            }
        }
        return Json.obj("run_id", runId, "summary", summary, "camera_frames", images);
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
        checkResultId(result.get("seed"), run.getLong("random_seed"), "seed");
        Map<String, Object> source = Json.asMap(result.get("source"));
        for (String key : List.of("run_id", "scenario_id", "scenario_version_id", "aeb_version_id", "carla_vehicle_model_id")) {
            checkResultId(source.get(key), run.getLong("run_id".equals(key) ? "id" : key), "source." + key);
        }
    }

    /** Không cắt phần thập phân hoặc làm tròn ID/seed lớn khi đối chiếu JSON với BIGINT của DB. */
    private static void checkResultId(Object actual, Long expected, String field) {
        if (actual instanceof Number number && expected != null) {
            try {
                if (new BigDecimal(number.toString()).longValueExact() == expected) {
                    return;
                }
            } catch (ArithmeticException | NumberFormatException ignored) {
                // Ngoài miền BIGINT, không nguyên hoặc không hữu hạn đều không phải ID/seed hợp lệ.
            }
        }
        throw new SimulatorException("result.json " + field + " không khớp run (yêu cầu " + expected + ")");
    }

    private static void recordWorker(Path folder, Process proc) {
        try {
            long started = proc.toHandle().info().startInstant().map(java.time.Instant::toEpochMilli).orElse(0L);
            Files.writeString(folder.resolve(PID_FILE), Json.write(Json.obj("pid", proc.pid(), "start_epoch_ms", started)),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("không ghi được {} trong {}", PID_FILE, folder, e);
        }
    }

    /** Worker còn sống của run, hoặc null. So cả thời điểm khởi động để không nhầm với tiến trình khác đã được tái dùng PID. */
    static ProcessHandle liveWorker(Path folder) {
        try {
            Path file = folder.resolve(PID_FILE);
            if (!Files.isRegularFile(file)) {
                return null;
            }
            Map<String, Object> doc = Json.parseMap(Files.readString(file, StandardCharsets.UTF_8));
            long pid = ((Number) doc.get("pid")).longValue();
            long started = ((Number) doc.get("start_epoch_ms")).longValue();
            return ProcessHandle.of(pid).filter(ProcessHandle::isAlive)
                    .filter(h -> started != 0 && h.info().startInstant().map(i -> i.toEpochMilli() == started).orElse(false))
                    .orElse(null);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** Dừng worker mồ côi của run dưới khóa CARLA (không để run mới chạy song song khi đang dọn). */
    private void stopOrphan(long runId) throws InterruptedException {
        CARLA_LOCK.lockInterruptibly();
        try {
            stopOrphanWorker(runId);
        } finally {
            CARLA_LOCK.unlock();
        }
    }

    /**
     * Xin dừng bằng file cờ (worker tự dọn actor/chế độ đồng bộ); quá {@link #orphanGraceS} mới giết cả cây.
     *
     * @return true nếu tìm thấy worker còn sống
     */
    boolean stopOrphanWorker(long runId) throws InterruptedException {
        Path folder = runDir(runId);
        ProcessHandle worker = liveWorker(folder);
        if (worker == null) {
            return false;
        }
        try {
            Files.writeString(folder.resolve(STOP_FLAG), "stop", StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("không ghi được {} trong {}", STOP_FLAG, folder, e);
        }
        awaitDeath(worker, orphanGraceS);
        if (worker.isAlive()) {
            worker.descendants().forEach(ProcessHandle::destroyForcibly);
            worker.destroyForcibly();
            awaitDeath(worker, 5);
        }
        return true;
    }

    private static void awaitDeath(ProcessHandle worker, int seconds) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (worker.isAlive() && System.nanoTime() < deadline) {
            Thread.sleep(100);
        }
    }

    /** Hủy run RUNNING mồ côi: dừng worker còn sống rồi đóng run, không ghi điểm hợp lệ. */
    void cancelOrphan(long runId) {
        try {
            stopOrphan(runId);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return;
        } catch (RuntimeException e) {
            log.error("không dừng được worker mồ côi của run {}", runId, e);
            return;
        }
        tx.executeWithoutResult(status -> db.update(
                "UPDATE simulation_runs SET status = 'STOPPED', error_message = ?, ended_at = ? WHERE id = ? AND status = 'RUNNING'",
                "Cancelled by user", Vs.now(), runId));
    }

    /**
     * Xin dừng nhẹ nhàng; quá STOP_GRACE_S mới giết cứng cả cây tiến trình (launcher venv trên Windows có tiến trình con).
     * Worker CARLA đọc file cờ {@link #STOP_FLAG} để tự dọn actor/chế độ đồng bộ trước khi thoát. Trên Windows
     * {@code destroy()} là giết cứng (TerminateProcess), nên với CARLA chỉ dựa vào file cờ trong thời gian chờ.
     */
    private static void stop(Process proc, Path folder, boolean carla) throws InterruptedException {
        try {
            Files.writeString(folder.resolve(STOP_FLAG), "stop", StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("không ghi được {} trong {}", STOP_FLAG, folder, e);
        }
        if (!(WINDOWS && carla)) {
            proc.descendants().forEach(ProcessHandle::destroy);
            proc.destroy();
        }
        awaitExitOrKill(proc);
    }

    /** Công cụ ngắn không có trạng thái CARLA cần dọn (xuất .xosc): dừng ngay theo cách mặc định của hệ điều hành. */
    private static void stop(Process proc) throws InterruptedException {
        proc.descendants().forEach(ProcessHandle::destroy);
        proc.destroy();
        awaitExitOrKill(proc);
    }

    private static void awaitExitOrKill(Process proc) throws InterruptedException {
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
    public Map<String, Object> submitCarlaResult(long projectId, long runId, long userId, Map<String, Object> resultPayload) {
        Row imported = tx.execute(transaction -> {
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
            return run;
        });
        // Giống executeRun: commit xong mới cho listener đọc run bằng transaction mới, không giữ snapshot của upload.
        AuditLog.event("run.carla_result", "success", "user_id", userId, "run_id", runId, "previous_status", imported.str("status"));
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
        // Chỉ gọi lúc khởi động: không luồng nào của JVM này đang giữ run, nên mọi run RUNNING đều mồ côi (backend chết giữa run).
        // Worker mồ côi có thể còn sống (Windows không giết tiến trình con khi cha chết): dừng nó trước khi chạy lại để hai
        // runner không tranh quyền tick của một server CARLA. Không nhận result.json mồ côi: không xác minh được worker đã
        // hoàn tất, trong khi ba mục tiêu (RMS jerk, quãng phanh, vận tốc va chạm) phải đến từ run hợp lệ.
        for (Row orphan : db.list("SELECT id FROM simulation_runs WHERE status = 'RUNNING'")) {
            long id = orphan.lng("id");
            if (executing.contains(id)) {
                continue;
            }
            try {
                stopOrphan(id);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            db.update("UPDATE simulation_runs SET status = 'PENDING', started_at = NULL WHERE id = ? AND status = 'RUNNING'", id);
        }
        List<Long> ids = db.list("SELECT id FROM simulation_runs WHERE status = 'PENDING' ORDER BY id").stream().map(r -> r.lng("id")).toList();
        dispatch(ids);
        return ids.size();
    }
}
