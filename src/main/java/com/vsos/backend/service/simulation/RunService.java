package com.vsos.backend.service.simulation;

import com.vsos.backend.common.audit.AuditLog;
import com.vsos.core.bridge.Bundle;
import com.vsos.core.simulation.LeadVehicleCase;
import com.vsos.core.simulation.CarlaSession;
import com.vsos.core.evaluation.Evaluation;
import com.vsos.core.simulation.SimulationOutcome;
import com.vsos.core.xosc.Xosc;
import com.vsos.core.xosc.XoscExport;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
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
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.scenario.FamilyService;

/**
 * Lần chạy mô phỏng: xếp hàng, thực thi, ghi kết quả (FE-08/09/11/12). Port của ``runs.py``.
 * <p>
 * Một ``simulation_runs`` = một biến thể × một xe × một AEB version × một seed × một bộ mô phỏng. Thực thi: dựng bundle
 * (``vehicsim.variant/v1`` nội bộ, profile carla-xosc chuyển thành OpenSCENARIO) -> **worker Python** -> ``result.json``
 * (đã kèm kết quả chấm) -> ghi vào chính dòng ``simulation_runs`` + ``collision_events`` + ``failures`` + ``root_causes``
 * trong một transaction, rồi báo cho regression (nếu run thuộc một regression test).
 * <p>
 * Lõi AEB, bộ mô phỏng động học và luật chấm nằm ở ``com.vsos.core`` (ADR-042): bộ động học chạy ngay trong tiến trình
 * này; CARLA chạy ở worker Python (adapter mỏng) và dùng cùng lõi đó. Hai đường ghi cùng hợp đồng result.
 */
@Slf4j
@Service
public class RunService {

    public static final String KINEMATIC_SIMULATOR = com.vsos.core.bridge.Bundle.KINEMATIC_SIMULATOR;
    public static final String VARIANT_FORMAT = "vehicsim.variant/v1";
    public static final String RESULT_FORMAT = "vehicsim.result/v1";
    public static final double DT = 0.05;
    /** Bước của profile CARLA OpenSCENARIO hiện tại (100 Hz, kế hoạch 20/10 D3); bộ động học vẫn dùng {@link #DT}. */
    public static final double CARLA_XOSC_STEP_S = 0.01;
    public static final double MAX_DURATION_S = 12.0;

    private static final int STOP_GRACE_S = 15;
    /** File cờ trong thư mục run: worker thấy nó thì tự dọn CARLA rồi thoát (Windows không có SIGTERM mềm cho tiến trình con). */
    static final String STOP_FLAG = "stop.requested";
    /** Video xem lại do {@code worker/make_video.py} ghép từ ảnh camera; nằm cạnh {@code result.json} của run. */
    static final String VIDEO_FILE = "video.mp4";
    /** PID + thời điểm khởi động của worker CARLA, để sau khi backend chết còn tìm ra worker mồ côi. */
    static final String PID_FILE = "worker.pid";
    private static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase().contains("win");
    private static final String XOSC_SUFFIX = Xosc.SIMULATOR_SUFFIX;
    private static final java.util.concurrent.locks.ReentrantLock CARLA_LOCK = new java.util.concurrent.locks.ReentrantLock();
    private static final String COLLISION_ACTOR = "walker.pedestrian.0001";

    /**
     * Mã 4 tham số AEB chỉnh được theo thứ tự trường của ``AebParams`` và giá trị mặc định của lõi (khi DB thiếu mã).
     * Sáu tham số còn lại là hằng số trong ``com.vsos.core.aeb.AebStack`` — bundle không mang chúng (ADR-040).
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
    public static String carlaSimulator(String version) {
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

    public String simulatorForNewRuns() {
        if ("carla".equals(props.simulator())) {
            throw new InvalidRequestException("VEHICSIM_SIMULATOR=carla (runner JSON trực tiếp) đã gỡ ở ADR-042: dùng carla-xosc (scripts/dev-carla.ps1)");
        }
        if (isCarla(configuredSimulator()) && carlaCommand().isEmpty()) {
            throw new InvalidRequestException("VEHICSIM_SIMULATOR=carla nhưng chưa đặt VEHICSIM_CARLA_COMMAND");
        }
        if (isCarla(configuredSimulator())) {
            requireRunnableCarlaCommand();
        }
        return configuredSimulator();
    }

    /** Lệnh CARLA đã chạy được một lần trên máy này; chỉ nhớ lần đạt để máy vừa cài Python không phải khởi động lại backend. */
    private final Set<String> runnableCommands = ConcurrentHashMap.newKeySet();
    private volatile Predicate<String> commandProbe = RunService::exitsCleanlyWithVersionFlag;

    /** Test thay bước thử lệnh bằng hàm giả để không chạy tiến trình thật. */
    public RunService useCommandProbe(Predicate<String> probe) {
        this.commandProbe = probe;
        return this;
    }

    /**
     * Từ chối xếp run CARLA khi lệnh runner không chạy được, thay vì để mọi run lỗi sau khi xếp hàng.
     * Mặc định {@code carla-xosc} dùng {@code python3}; trên Windows đó thường là file giả trong WindowsApps:
     * có trên PATH nhưng thoát mã 9009 ("Python was not found").
     */
    private void requireRunnableCarlaCommand() {
        String executable = carlaCommand().getFirst();
        if (runnableCommands.contains(executable)) {
            return;
        }
        if (!commandProbe.test(executable)) {
            throw new InvalidRequestException("Không chạy được lệnh CARLA \"" + executable + "\" (VEHICSIM_CARLA_COMMAND). "
                    + "Bật CARLA bằng scripts/dev-carla.ps1 -RestartBackend, hoặc đặt VEHICSIM_SIMULATOR=kinematic trong .env để chạy bộ động học");
        }
        runnableCommands.add(executable);
    }

    private static boolean exitsCleanlyWithVersionFlag(String executable) {
        try {
            Process process = new ProcessBuilder(executable, "--version").redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
            if (!process.waitFor(15, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (IOException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    public boolean isCarlaConfigured() {
        return isCarla(configuredSimulator()) && !carlaCommand().isEmpty();
    }

    public static boolean isCarla(String simulator) {
        return simulator != null && simulator.startsWith("carla-");
    }

    /** ``fixed_delta_seconds`` của run: bước mô phỏng theo identity simulator. */
    static double stepFor(String simulator) {
        return simulator != null && (simulator.endsWith(XOSC_SUFFIX) || simulator.endsWith(Xosc.V14_SIMULATOR_SUFFIX) || simulator.endsWith(Xosc.V13_SIMULATOR_SUFFIX) || simulator.endsWith(Xosc.V12_SIMULATOR_SUFFIX) || simulator.endsWith(Xosc.V11_SIMULATOR_SUFFIX) || simulator.endsWith(Xosc.V10_SIMULATOR_SUFFIX) || simulator.endsWith(Xosc.V9_SIMULATOR_SUFFIX) || simulator.endsWith(Xosc.V8_SIMULATOR_SUFFIX)
                || simulator.endsWith(Xosc.V7_SIMULATOR_SUFFIX) || simulator.endsWith(Xosc.V6_SIMULATOR_SUFFIX)
                || simulator.endsWith(Xosc.V5_SIMULATOR_SUFFIX) || simulator.endsWith(Xosc.V4_SIMULATOR_SUFFIX)
                || simulator.endsWith(Xosc.V3_SIMULATOR_SUFFIX)) ? CARLA_XOSC_STEP_S : DT;
    }

    static String simulatorType(String simulator) {
        return isCarla(simulator) ? "CARLA" : "KINEMATIC";
    }

    /** Seed ổn định theo biến thể: chạy lại cùng biến thể luôn cùng nhiễu perception. */
    public static long seedFor(long scenarioVersionId) {
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
        return createRuns(projectId, scenarioId, variants, vehicleModelId, aebVersionId, userId, purpose, regressionTestId, null, baselineRuns, null, null,
                com.vsos.core.simulation.AebMode.ON);
    }

    public List<Long> createRuns(long projectId, long scenarioId, List<Row> variants, long vehicleModelId, long aebVersionId,
                                 long userId, String purpose, Long regressionTestId, Map<Long, Row> baselineRuns, String requestedSimulator) {
        return createRuns(projectId, scenarioId, variants, vehicleModelId, aebVersionId, userId, purpose, regressionTestId, null, baselineRuns, requestedSimulator, null,
                com.vsos.core.simulation.AebMode.ON);
    }

    public List<Long> createOptimizationRuns(long projectId, long scenarioId, List<Row> variants, long vehicleModelId, long aebVersionId,
                                             long userId, long optimizationTrialId, Map<Long, Row> baselineRuns) {
        return createRuns(projectId, scenarioId, variants, vehicleModelId, aebVersionId, userId, "OPTIMIZATION", null, optimizationTrialId, baselineRuns, null, null,
                com.vsos.core.simulation.AebMode.ON);
    }

    private List<Long> createRuns(long projectId, long scenarioId, List<Row> variants, long vehicleModelId, long aebVersionId,
                                  long userId, String purpose, Long regressionTestId, Long optimizationTrialId, Map<Long, Row> baselineRuns,
                                  String requestedSimulator, Long requestedSeed, String aebMode) {
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
            Object category = variant.json("scenario_ir_json").get("category");
            if (isCarla(simulator) && category != null && LeadVehicleCase.CATEGORIES.contains(category.toString())) {
                // ADR-050: xe phía trước phải nằm trọn trong đoạn road 40 của Town04; kiểm bằng chính bộ xuất .xosc trước khi xếp hàng.
                xosc(Json.obj("variant", variantForBundle(variant.json("scenario_ir_json"), null), "seed", 0));
            }
            long repetition = nextRepetition(variant.lng("id"), aebVersionId, aebMode, vehicleModelId, simulator, seed);
            long runId = db.insert(
                    "INSERT INTO simulation_runs (project_id, scenario_id, scenario_version_id, carla_vehicle_model_id, aeb_version_id, "
                            + "simulator_type, simulator_version, fixed_delta_seconds, max_duration_s, regression_test_id, baseline_run_id, "
                            + "optimization_trial_id, purpose, random_seed, status, run_config_json, created_by_user_id, queued_at, aeb_mode, repetition) "
                            + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    projectId, scenarioId, variant.lng("id"), vehicleModelId, aebVersionId, simulatorType(simulator), simulator, stepFor(simulator),
                    MAX_DURATION_S, regressionTestId, baseline == null ? null : baseline.lng("id"), optimizationTrialId, purpose, seed, "PENDING",
                    variant.json("scenario_ir_json"), userId, ts, aebMode, repetition);
            ids.add(runId);
        }
        return ids;
    }

    /**
     * Lần lặp thứ mấy của cùng một cấu hình: biến thể + AEB + chế độ ON/OFF + xe + simulator + seed (ADR-065). Run đầu là 1; chạy lại đúng
     * cấu hình đó (ví dụ để đo dung sai chạy lặp) là 2, 3… Số đếm theo các run đang có, nên xóa run cũ thì số lặp quay về; hai lệnh tạo run
     * đồng thời có thể cùng nhận một số (không có ràng buộc duy nhất, vì mỗi run đã có {@code run_id} và seed riêng).
     */
    private long nextRepetition(long variantId, long aebVersionId, String aebMode, long vehicleModelId, String simulator, long seed) {
        Object existing = db.scalar("SELECT COUNT(*) FROM simulation_runs WHERE scenario_version_id = ? AND aeb_version_id = ? AND aeb_mode = ? "
                + "AND carla_vehicle_model_id = ? AND simulator_version = ? AND random_seed = ?", variantId, aebVersionId, aebMode, vehicleModelId, simulator, seed);
        return (existing instanceof Number n ? n.longValue() : 0L) + 1;
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
                "UPDATE simulation_runs SET status = 'RUNNING', started_at = ?, worker_host = ?, attempt = attempt + 1 WHERE id = ? AND status = 'PENDING'",
                Vs.now(), hostName(), runId) > 0);
        if (!Boolean.TRUE.equals(claimed)) {
            return; // đã có luồng khác nhận, đã COMPLETED/STOPPED, hoặc không tồn tại
        }
        try {
            Row run = db.first("SELECT * FROM simulation_runs WHERE id = ?", runId);
            String profile = run.str("simulator_version");
            if (isCarla(profile) && (profile.endsWith("-xosc1") || profile.endsWith("-xosc2") || profile.endsWith(Xosc.V3_SIMULATOR_SUFFIX)
                    || profile.endsWith(Xosc.V4_SIMULATOR_SUFFIX) || profile.endsWith(Xosc.V5_SIMULATOR_SUFFIX) || profile.endsWith(Xosc.V6_SIMULATOR_SUFFIX)
                    || profile.endsWith(Xosc.V7_SIMULATOR_SUFFIX) || profile.endsWith(Xosc.V8_SIMULATOR_SUFFIX)
                    || profile.endsWith(Xosc.V9_SIMULATOR_SUFFIX) || profile.endsWith(Xosc.V10_SIMULATOR_SUFFIX)
                    || profile.endsWith(Xosc.V11_SIMULATOR_SUFFIX) || profile.endsWith(Xosc.V12_SIMULATOR_SUFFIX)
                    || profile.endsWith(Xosc.V13_SIMULATOR_SUFFIX) || profile.endsWith(Xosc.V14_SIMULATOR_SUFFIX))) {
                // xosc2 là bước 0,05 s; xosc3 có người "dừng ở lề" đi vào làn (TD-47); xosc4 chưa ép mô-men phanh (ADR-051);
                // xosc5 chưa kẹp lệnh ở μ·g (ADR-052); xosc6 còn cú dừng gấp dưới 6 m/s (ADR-053); xosc7 bàn đạp còn tuyến tính (ADR-054);
                // xosc8 AEB còn dùng ground truth cho người đi bộ (ADR-043 giai đoạn 2, ADR-055); xosc9 chưa bù pha tăng lực (ADR-056); xosc10 hành lang AEB
                // 1,93 m cho mọi xe (ADR-057); xosc11 phanh trễ một bước / bàn đạp còn khâu bù (ADR-058);
                // xosc12 chưa có bảng bàn đạp 3 xe (ADR-059); xosc13 Patrol / Sprinter chưa bù pha tăng lực (ADR-061):
                // xosc14 người khởi hành sớm bù bộ động học ≤ 1.3 (ADR-062): không chạy lại bằng bộ xuất mới, không ghép với xosc15.
                throw new SimulatorException("run CARLA dùng " + profile.substring(profile.lastIndexOf('-') + 1)
                        + " đã cũ; tạo lượt chạy mới để dùng profile " + XOSC_SUFFIX);
            }
            if (!isCarla(profile) && !KINEMATIC_SIMULATOR.equals(profile)) {
                // vehicsim-kinematic-1.0: impact_speed_mps là tốc độ ego; 1.1 đổi sang vận tốc tương đối (13/11/2026); 1.2 hành lang AEB theo bề rộng xe
                // (ADR-057); 1.3 phanh đúng mốc, quãng dừng đúng bước (ADR-058); 1.4 người tăng tốc dần (ADR-062). Không chạy lại run cũ dưới định danh cũ, không ghép với 1.4.
                throw new SimulatorException("run động học dùng " + profile + " đã cũ; tạo lượt chạy mới để dùng " + KINEMATIC_SIMULATOR);
            }
            if (isCarla(profile) && !profile.endsWith(XOSC_SUFFIX)) {
                // Runner CARLA trực tiếp nhận bundle JSON (run_variant.py) đã gỡ ở ADR-042: run_xosc.py từ chối JSON, nên báo rõ trước khi gọi worker.
                throw new SimulatorException("run CARLA dùng runner JSON trực tiếp (" + profile + ") đã gỡ ở ADR-042; tạo lượt chạy mới để dùng profile "
                        + XOSC_SUFFIX);
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

        Map<String, Object> variant = variantForBundle(ir, friction);

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

        Map<String, Object> bundle = Json.obj(
                "format", VARIANT_FORMAT,
                "variant", variant,
                "aeb", Json.obj("label", version == null ? null : version.str("label"), "params", params),
                "vehicle", vehicleDoc,
                "seed", run.lng("random_seed"),
                "source", source);
        if (com.vsos.core.simulation.AebMode.OFF.equals(run.str(com.vsos.core.simulation.AebMode.KEY))) {
            bundle.put(com.vsos.core.simulation.AebMode.KEY, com.vsos.core.simulation.AebMode.OFF); // run ON giữ bundle như cũ
        }
        return bundle;
    }

    /**
     * Phần {@code variant} của bundle từ cấu hình run. Biến thể người đi bộ giữ nguyên dạng cũ (không thêm khóa nào, bundle cũ tái lập y hệt);
     * biến thể xe phía trước (ADR-050) mang {@code category} và các trường của nó.
     */
    static Map<String, Object> variantForBundle(Map<String, Object> ir, Object friction) {
        Object category = ir.get("category");
        if (category != null && LeadVehicleCase.CATEGORIES.contains(category.toString())) {
            return Json.obj(
                    "category", category.toString(),
                    "ego_speed_kmh", ((Number) ir.get("ego_speed_kmh")).doubleValue(),
                    "target_speed_kmh", ((Number) ir.get("target_speed_kmh")).doubleValue(),
                    "initial_distance_m", ((Number) ir.get("initial_distance_m")).doubleValue(),
                    "target_decel_mps2", ir.get("target_decel_mps2") instanceof Number n ? n.doubleValue() : null,
                    "lateral_overlap_pct", ir.get("lateral_overlap_pct") instanceof Number n ? n.doubleValue() : null,
                    "weather", ir.getOrDefault("weather", "CLEAR"),
                    "time_of_day", ir.getOrDefault("time_of_day", "DAY"),
                    "friction", friction == null ? null : ((Number) friction).doubleValue());
        }
        return Json.obj(
                "ego_speed_kmh", ((Number) ir.get("ego_speed_kmh")).doubleValue(),
                "trigger_distance_m", ((Number) ir.get("trigger_distance_m")).doubleValue(),
                "pedestrian_speed_mps", ((Number) ir.get("pedestrian_speed_mps")).doubleValue(),
                "stops_at_curb", Boolean.TRUE.equals(ir.get("stops_at_curb")),
                "weather", ir.getOrDefault("weather", "CLEAR"),
                "time_of_day", ir.getOrDefault("time_of_day", "DAY"),
                "friction", friction == null ? null : ((Number) friction).doubleValue());
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
        if (row.dbl("max_brake_torque_nm") != null) {  // hiệu chuẩn phanh CARLA (ADR-051, TD-17); trống = mô-men mặc định của blueprint
            physics.put("wheels", Json.obj("max_brake_torque", row.dbl("max_brake_torque_nm")));
        }
        Map<String, Object> dimensions = Json.obj("height_m", row.dbl("height_m"));
        if (row.dbl("wheelbase_m") != null) {
            dimensions.put("wheelbase_m", row.dbl("wheelbase_m"));
        }
        Map<String, Object> carla = Json.obj("blueprint", row.str("carla_blueprint_id"), "physics", physics, "dimensions", dimensions);
        if (row.dbl("carla_full_brake_decel_mps2") != null) {  // đo trên CARLA (TD-17); chưa đo thì controller dùng mặc định
            carla.put(Bundle.FULL_BRAKE_DECEL, row.dbl("carla_full_brake_decel_mps2"));
        }
        return carla;
    }

    // ------------------------------------------------------------------ gọi worker

    Path repoRoot() {
        return Path.of(System.getProperty("user.dir"));
    }

    public Path runDir(long runId) {
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
        return runKinematic(run, bundle);
    }

    /**
     * Bộ động học chạy trong tiến trình (ADR-042): cùng bundle → cùng kết quả như bản Python đã sinh các run cũ (kiểm bằng fixture
     * ``KinematicParityTest``), nên giữ nguyên định danh {@link #KINEMATIC_SIMULATOR}. Một lần chạy mất vài ms; hủy được kiểm trước khi chạy.
     */
    Map<String, Object> runKinematic(Row run, Map<String, Object> bundle) {
        if (cancelRequested.contains(run.lng("id"))) {
            throw new RunCancelledException();
        }
        Bundle.RunSpec spec;
        try {
            spec = Bundle.readSpec(bundle);
        } catch (Bundle.BundleError e) {
            throw new SimulatorException("Không đọc được đầu vào: " + e.getMessage());
        }
        SimulationOutcome outcome = Bundle.simulateKinematic(spec);
        Map<String, Object> document = Bundle.resultDocument(spec, outcome, KINEMATIC_SIMULATOR, null,
                Evaluation.evaluate(outcome, spec.params()).toDocument());
        document.put("engine", Bundle.ENGINE);
        Map<String, Object> result = Json.parseMap(Json.write(document)); // cùng kiểu dữ liệu như khi đọc result.json từ worker
        checkResult(result, run);
        return result;
    }

    private Map<String, Object> runWorkerProcess(Row run, Map<String, Object> bundle) throws IOException, InterruptedException {
        List<String> command = new ArrayList<>(carlaCommand());
        if (command.isEmpty()) {
            throw new SimulatorException("run cần CARLA nhưng máy này chưa đặt VEHICSIM_CARLA_COMMAND");
        }
        Path folder = runDir(run.lng("id"));
        Files.createDirectories(folder);
        Path bundlePath = folder.resolve("bundle.json");
        Files.writeString(bundlePath, Json.write(bundle), StandardCharsets.UTF_8);
        Path resultPath = folder.resolve("result.json");
        Files.deleteIfExists(resultPath);
        Path logPath = folder.resolve("simulator.log");

        Path input = bundlePath;
        if (run.str("simulator_version").endsWith(XOSC_SUFFIX)) {
            input = folder.resolve("scenario.xosc");
            Files.writeString(input, xosc(bundle), StandardCharsets.UTF_8);
        }
        command.addAll(List.of(input.toString(), "--out", folder.toString(), "--fast"));
        ProcessBuilder pb = new ProcessBuilder(command).directory(repoRoot().toFile()).redirectErrorStream(true)
                .redirectOutput(logPath.toFile());
        pb.environment().put("PYTHONIOENCODING", "utf-8");
        Files.deleteIfExists(folder.resolve(STOP_FLAG));
        Process proc = pb.start();
        recordWorker(folder, proc);
        int timeout = subprocessTimeoutS();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeout);
        boolean finished = false;
        try {
            // Chờ từng nhịp ngắn để thấy yêu cầu hủy; tiến trình thoát thì dừng chờ ngay.
            while (!finished && System.nanoTime() < deadline) {
                finished = proc.waitFor(500, TimeUnit.MILLISECONDS);
                if (!finished && cancelRequested.contains(run.lng("id"))) {
                    stop(proc, folder, true);
                    throw new RunCancelledException();
                }
            }
        } catch (InterruptedException e) {
            stopOnShutdown(proc, folder); // không để tiến trình con mồ côi khi app tắt, nhưng cho nó dọn CARLA trước (TD-34)
            throw e;
        }
        if (!finished) {
            stop(proc, folder, true);
            throw new SimulatorException("bộ mô phỏng vượt " + timeout + " s, đã dừng");
        }
        if (proc.exitValue() != 0 || !Files.exists(resultPath)) {
            throw new SimulatorException("bộ mô phỏng thoát mã " + proc.exitValue() + ": " + tail(logPath));
        }
        Map<String, Object> result = Json.parseMap(Files.readString(resultPath, StandardCharsets.UTF_8));
        checkResult(result, run);
        // ADR-065: khối dataset cho Failure Analysis, không bao giờ làm run lỗi. Dòng aeb_versions chỉ để khai báo trạng thái phiên bản lúc ghi.
        Row aebVersion = db.first("SELECT id, project_id, version_no, label, status, source, parent_version_id FROM aeb_versions WHERE id = ?",
                run.lng("aeb_version_id"));
        RunDatasetWriter.attach(resultPath, result, run, bundle, aebVersion == null ? null : Json.parseMap(Json.write(aebVersion.asMap())), folder, repoRoot());
        Map<String, Object> artifacts = new LinkedHashMap<>();
        artifacts.put("result", resultPath.toString());
        if (input.toString().endsWith(".xosc")) {
            artifacts.put("scenario", input.toString());
        }
        artifacts.putAll(Json.asMap(result.get("artifacts")).entrySet().stream()
                .collect(LinkedHashMap::new, (m, e) -> m.put(e.getKey(), String.valueOf(e.getValue())), Map::putAll));
        Path video = folder.resolve(VIDEO_FILE); // worker/make_video.py ghép ảnh camera sau run; không ghi vào result.json nên không đổi identity run
        if (Files.isRegularFile(video)) {
            artifacts.putIfAbsent("video", video.toString());
        }
        result.put("artifacts", artifacts);
        return result;
    }

    /** XML là artifact thực thi/tải xuống; bundle chỉ là giao tiếp nội bộ. Sinh trong tiến trình bằng lõi Java (ADR-042), cùng từng byte với bản Python cũ. */
    public String exportXosc(Map<String, Object> bundle) {
        return xosc(bundle);
    }

    private static String xosc(Map<String, Object> bundle) {
        try {
            return XoscExport.export(Bundle.readSpec(bundle));
        } catch (Bundle.BundleError e) {
            throw new InvalidRequestException("Không sinh được OpenSCENARIO: " + e.getMessage());
        }
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
        return db.list("SELECT id, status, scenario_id, aeb_version_id, simulator_version, aeb_mode, purpose, regression_test_id, error_message, queued_at FROM simulation_runs "
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
        requireRunnableCarlaCommand();
        Row variant = new Row(Json.obj("id", source.lng("scenario_version_id"), "scenario_ir_json", Json.write(source.json("run_config_json"))));
        List<Long> ids = createRuns(projectId, source.lng("scenario_id"), List.of(variant), source.lng("carla_vehicle_model_id"),
                source.lng("aeb_version_id"), userId, "EVALUATION", null, null, null, carlaSimulator(props.carlaVersion()) + XOSC_SUFFIX, source.lng("random_seed"),
                com.vsos.core.simulation.AebMode.OFF.equals(source.str(com.vsos.core.simulation.AebMode.KEY))
                        ? com.vsos.core.simulation.AebMode.OFF : com.vsos.core.simulation.AebMode.ON); // chạy lại đúng chế độ AEB của run gốc
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
        return stopActiveRun(runId, run.str("status"), userId);
    }

    /**
     * Dừng các run đang chờ / đang chạy của một regression test khi cả test bị hủy ({@code RegressionService#cancelTest}). Chỉ gọi sau khi test đã
     * sang CANCELLED, để {@code tryFinalize} không chốt test từ các run còn lại. Run baseline bổ sung (không gắn {@code regression_test_id}) chạy tiếp.
     *
     * @return số run {@code stopped} và {@code stopping}
     */
    public Map<String, Object> cancelRegressionRuns(long projectId, long testId, long userId) {
        int stopped = 0;
        int stopping = 0;
        for (Row r : db.list("SELECT id, status FROM simulation_runs WHERE project_id = ? AND regression_test_id = ? AND status IN ('PENDING','RUNNING') "
                + "ORDER BY (status = 'RUNNING'), id", projectId, testId)) {
            try {
                if ("STOPPED".equals(stopActiveRun(r.lng("id"), r.str("status"), userId))) {
                    stopped++;
                } else {
                    stopping++;
                }
            } catch (InvalidRequestException e) {
                // run vừa chạy xong giữa lúc liệt kê và lúc hủy
            }
        }
        return Json.obj("stopped", stopped, "stopping", stopping);
    }

    private String stopActiveRun(long runId, String currentStatus, long userId) {
        String status = currentStatus;
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

    /**
     * Hủy mọi run đang chờ/đang chạy của một họ kịch bản bằng đúng {@link #cancelRun} cho từng run. Bỏ qua run của regression/tối ưu
     * (chúng chỉ dừng theo cả test). Hủy run chờ trước để luồng chạy không kịp nhận chúng; run vừa xong giữa chừng thì bỏ qua.
     *
     * @return số run {@code stopped} (đã hủy ngay) và {@code stopping} (đang chạy, đã xin dừng)
     */
    public Map<String, Object> cancelFamilyRuns(long projectId, long scenarioId, long userId) {
        if (db.first("SELECT id FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId) == null) {
            throw new NotFoundException("scenario family");
        }
        List<Row> active = db.list("SELECT id FROM simulation_runs WHERE project_id = ? AND scenario_id = ? AND status IN ('PENDING','RUNNING') "
                + "AND regression_test_id IS NULL AND optimization_trial_id IS NULL ORDER BY (status = 'RUNNING'), id", projectId, scenarioId);
        int stopped = 0;
        int stopping = 0;
        for (Row r : active) {
            try {
                if ("STOPPED".equals(cancelRun(projectId, r.lng("id"), userId))) {
                    stopped++;
                } else {
                    stopping++;
                }
            } catch (InvalidRequestException e) {
                // run vừa chạy xong giữa lúc liệt kê và lúc hủy: không còn gì để hủy
            }
        }
        return Json.obj("scenario_id", scenarioId, "stopped", stopped, "stopping", stopping);
    }

    /** Trạng thái đã kết thúc: chỉ run ở trạng thái này mới xoá được; run đang chờ / đang chạy phải hủy trước. */
    private static final Set<String> FINISHED_STATUSES = Set.of("COMPLETED", "FAILED", "STOPPED");

    /**
     * Xoá kết quả của một run baseline: dòng {@code simulation_runs} (kèm {@code collision_events}, {@code failures}, {@code root_causes}, {@code simulation_artifacts}
     * theo ON DELETE CASCADE) rồi cả thư mục file của run (ảnh/video/CSV/{@code result.json}). Chỉ run {@code BASELINE} không thuộc regression/tối ưu, đã kết thúc,
     * và không phải mốc đối chiếu của một regression test (regression chạy lại đúng biến thể của run này nên cần giữ nó để so sánh).
     */
    public Map<String, Object> deleteBaselineRun(long projectId, long runId, long userId) {
        Row run = db.first("SELECT id, status, purpose, regression_test_id, optimization_trial_id FROM simulation_runs WHERE id = ? AND project_id = ?",
                runId, projectId);
        if (run == null) {
            throw new NotFoundException("simulation run");
        }
        if (!"BASELINE".equals(run.str("purpose")) || !run.isNull("regression_test_id") || !run.isNull("optimization_trial_id")) {
            throw new InvalidRequestException("Only baseline run results can be deleted");
        }
        if (!FINISHED_STATUSES.contains(run.str("status"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Run is " + run.str("status") + "; cancel it before deleting its result");
        }
        if (!deleteFinishedBaselineRun(projectId, runId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This run is the reference of a regression test and cannot be deleted");
        }
        deleteRunFolder(runId);
        AuditLog.event("run.delete", "success", "user_id", userId, "run_id", runId, "previous_status", run.str("status"));
        return Json.obj("run_id", runId, "deleted", true);
    }

    /**
     * Xoá mọi kết quả baseline đã kết thúc của một họ kịch bản bằng đúng luật của {@link #deleteBaselineRun}. Run đang chờ / đang chạy và run đang là mốc của
     * regression được giữ lại và đếm riêng, để người dùng biết còn gì chưa xoá.
     */
    public Map<String, Object> deleteFamilyBaselineRuns(long projectId, long scenarioId, long userId) {
        return deleteFamilyBaselineRuns(projectId, scenarioId, userId, null);
    }

    /** Như {@link #deleteFamilyBaselineRuns(long, long, long)}, lọc thêm {@code simulator_type} ({@code CARLA}/{@code KINEMATIC}) khi có. */
    public Map<String, Object> deleteFamilyBaselineRuns(long projectId, long scenarioId, long userId, String simulatorType) {
        String normalizedType = null;
        if (simulatorType != null && !simulatorType.isBlank()) {
            normalizedType = simulatorType.trim().toUpperCase(java.util.Locale.ROOT);
            if (!"CARLA".equals(normalizedType) && !"KINEMATIC".equals(normalizedType)) {
                throw new InvalidRequestException("simulator_type phải là CARLA hoặc KINEMATIC");
            }
        }
        if (db.first("SELECT id FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId) == null) {
            throw new NotFoundException("scenario family");
        }
        int deleted = 0;
        int inUse = 0;
        int active = 0;
        StringBuilder sql = new StringBuilder("SELECT id, status FROM simulation_runs WHERE project_id = ? AND scenario_id = ? AND purpose = 'BASELINE' "
                + "AND regression_test_id IS NULL AND optimization_trial_id IS NULL");
        List<Object> args = new ArrayList<>();
        args.add(projectId);
        args.add(scenarioId);
        if (normalizedType != null) {
            sql.append(" AND simulator_type = ?");
            args.add(normalizedType);
        }
        sql.append(" ORDER BY id");
        for (Row r : db.list(sql.toString(), args.toArray())) {
            if (!FINISHED_STATUSES.contains(r.str("status"))) {
                active++;
            } else if (deleteFinishedBaselineRun(projectId, r.lng("id"))) {
                deleteRunFolder(r.lng("id"));
                deleted++;
            } else {
                inUse++;
            }
        }
        AuditLog.event("family.baseline_runs.delete", "success", "user_id", userId, "scenario_id", scenarioId, "deleted", deleted, "kept_in_use", inUse, "kept_active", active);
        return Json.obj("scenario_id", scenarioId, "deleted", deleted, "skipped_in_use", inUse, "skipped_active", active);
    }

    /** Xoá dòng run baseline đã kết thúc trong một transaction; {@code false} khi một regression còn tham chiếu nó (hoặc run vừa đổi trạng thái). */
    private boolean deleteFinishedBaselineRun(long projectId, long runId) {
        try {
            Boolean done = tx.execute(status -> {
                Object referenced = db.scalar("SELECT (SELECT COUNT(*) FROM simulation_runs WHERE baseline_run_id = ?) "
                        + "+ (SELECT COUNT(*) FROM regression_test_items WHERE baseline_run_id = ?)", runId, runId);
                if (referenced instanceof Number n && n.longValue() > 0) {
                    return false;
                }
                return db.update("DELETE FROM simulation_runs WHERE id = ? AND project_id = ? AND status IN ('COMPLETED','FAILED','STOPPED') "
                        + "AND purpose = 'BASELINE' AND regression_test_id IS NULL AND optimization_trial_id IS NULL", runId, projectId) > 0;
            });
            return Boolean.TRUE.equals(done);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            return false; // khoá ngoại RESTRICT là chốt chặn cuối: có bảng khác đang tham chiếu run này
        }
    }

    private void deleteRunFolder(long runId) {
        try {
            org.springframework.util.FileSystemUtils.deleteRecursively(runDir(runId));
        } catch (IOException e) {
            log.warn("Không xoá được thư mục run {}: {}", runId, e.getMessage());
        }
    }

    /** Trường biến thể hiện cho người dùng nhận ra run trong danh sách run đang chạy (ca người đi bộ). */
    private static final List<String> ACTIVE_RUN_VARIANT_KEYS = List.of("ego_speed_kmh", "trigger_distance_m", "pedestrian_speed_mps", "stops_at_curb",
            "weather", "time_of_day");

    /**
     * Run đang chờ / đang chạy của một họ kịch bản, để hủy từng run ở trang Kịch bản (TD-37). Run chờ đứng trước run đang chạy cho khớp thứ tự hủy
     * của {@link #cancelFamilyRuns}. Run của regression / tối ưu vẫn liệt kê nhưng {@code cancellable = false} kèm {@code blocked_by}, vì
     * {@link #cancelRun} từ chối chúng (chỉ dừng theo cả test / đợt tối ưu).
     */
    public List<Map<String, Object>> activeFamilyRuns(long projectId, long scenarioId) {
        if (db.first("SELECT id FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId) == null) {
            throw new NotFoundException("scenario family");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row r : db.list("SELECT id, status, scenario_version_id, simulator_version, aeb_mode, purpose, regression_test_id, optimization_trial_id, "
                + "queued_at, started_at, run_config_json FROM simulation_runs WHERE project_id = ? AND scenario_id = ? AND status IN ('PENDING','RUNNING') "
                + "ORDER BY (status = 'RUNNING'), id", projectId, scenarioId)) {
            String blockedBy = !r.isNull("regression_test_id") ? "REGRESSION" : !r.isNull("optimization_trial_id") ? "OPTIMIZATION" : null;
            Map<String, Object> variant = new LinkedHashMap<>();
            Map<String, Object> config = r.isNull("run_config_json") ? Map.of() : r.json("run_config_json");
            for (String key : ACTIVE_RUN_VARIANT_KEYS) {
                if (config.get(key) != null) {
                    variant.put(key, config.get(key));
                }
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("run_id", r.lng("id"));
            item.put("status", r.str("status"));
            item.put("scenario_version_id", r.lng("scenario_version_id"));
            item.put("simulator_version", r.str("simulator_version"));
            item.put("aeb_mode", r.str("aeb_mode"));
            item.put("purpose", r.str("purpose"));
            item.put("queued_at", r.get("queued_at"));
            item.put("started_at", r.get("started_at"));
            item.put("variant", variant);
            item.put("cancellable", blockedBy == null);
            item.put("blocked_by", blockedBy);
            out.add(item);
        }
        return out;
    }

    public Path carlaFile(long projectId, long runId, String name) {
        Row run = db.first("SELECT id FROM simulation_runs WHERE id = ? AND project_id = ? AND simulator_type = 'CARLA'", runId, projectId);
        if (run == null || !(List.of("frames.csv", "collisions.json", "ground_truth.csv").contains(name) || name.matches("[0-9]{8}\\.png"))) {
            throw new NotFoundException("CARLA artifact");
        }
        Path path = runDir(runId).resolve("sensors").resolve(name.endsWith(".png") ? "camera/" + name : name);
        if (!Files.isRegularFile(path)) {
            throw new NotFoundException("CARLA artifact");
        }
        return path;
    }

    /** Video xem lại của run CARLA (một file mp4 do worker ghép từ ảnh camera). Không có thì 404. */
    public Path carlaVideo(long projectId, long runId) {
        Row run = db.first("SELECT id FROM simulation_runs WHERE id = ? AND project_id = ? AND simulator_type = 'CARLA'", runId, projectId);
        Path path = run == null ? null : runDir(runId).resolve(VIDEO_FILE);
        if (path == null || !Files.isRegularFile(path)) {
            throw new NotFoundException("CARLA video");
        }
        return path;
    }

    public Map<String, Object> carlaData(long projectId, long runId, TelemetryMetricsService telemetry) throws IOException {
        Path csv = carlaFile(projectId, runId, "frames.csv");
        Path collisions = carlaFile(projectId, runId, "collisions.json");
        List<Map<String, Object>> hits = Json.parseList(Files.readString(collisions, StandardCharsets.UTF_8)).stream().map(Json::asMap).toList();
        // Quãng phanh còn lại được ngoại suy bằng đúng mức phanh 100% mà controller đã dùng cho xe này.
        Object measured = db.scalar("SELECT m.carla_full_brake_decel_mps2 FROM simulation_runs r JOIN carla_vehicle_models m ON m.id = r.carla_vehicle_model_id "
                + "WHERE r.id = ? AND r.project_id = ?", runId, projectId);
        double fullBrake = measured instanceof Number n ? n.doubleValue() : CarlaSession.DEFAULT_FULL_BRAKE_DECEL;
        var summary = telemetry.summarise(telemetry.parseCsvFrames(Files.readString(csv, StandardCharsets.UTF_8)), telemetry.parseCollisions(hits), fullBrake);
        List<String> images = List.of();
        Path camera = csv.getParent().resolve("camera");
        if (Files.isDirectory(camera)) {
            try (var files = Files.list(camera)) {
                images = files.map(p -> p.getFileName().toString()).filter(n -> n.matches("[0-9]{8}\\.png")).sorted().toList();
            }
        }
        return Json.obj("run_id", runId, "summary", summary, "camera_frames", images, "has_video", Files.isRegularFile(runDir(runId).resolve(VIDEO_FILE)));
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

    /**
     * Backend bị tắt giữa run (luồng chạy bị interrupt, TD-34): ghi cờ {@link #STOP_FLAG} <b>trước tiên</b> — kể cả khi JVM thoát trước khi chờ xong,
     * worker vẫn thấy cờ trong 0,5 s và tự dọn world thay vì để CARLA kẹt chế độ đồng bộ — rồi chờ tối đa {@link #STOP_GRACE_S} mới giết cả cây.
     * Giữ lại trạng thái interrupt cho nơi gọi.
     */
    static void stopOnShutdown(Process proc, Path folder) {
        try {
            Files.writeString(folder.resolve(STOP_FLAG), "stop", StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("không ghi được {} trong {}", STOP_FLAG, folder, e);
        }
        boolean interrupted = Thread.interrupted(); // waitFor ném ngay nếu cờ interrupt còn bật
        try {
            if (!proc.waitFor(STOP_GRACE_S, TimeUnit.SECONDS)) {
                proc.descendants().forEach(ProcessHandle::destroyForcibly);
                proc.destroyForcibly();
            }
        } catch (InterruptedException again) {
            proc.descendants().forEach(ProcessHandle::destroyForcibly);
            proc.destroyForcibly();
            interrupted = true;
        } finally {
            if (interrupted) {
                Thread.currentThread().interrupt();
            }
        }
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
     * Nhận ``result.json`` của một run CARLA chạy ngoài backend (vd. ``worker/run_xosc.py`` trên máy có GPU) cho run chưa có
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
        return runFamily(projectId, scenarioId, userId, aebVersionId, false);
    }

    /**
     * @param withAebOff thêm một lượt AEB tắt cho mỗi biến thể (cùng seed, cùng bộ mô phỏng) — mốc tham chiếu "không có AEB" của baseline (chốt
     *                   13/11/2026). Run OFF không bao giờ là baseline của regression/tối ưu.
     */
    @Transactional
    public List<Long> runFamily(long projectId, long scenarioId, long userId, Long aebVersionId, boolean withAebOff) {
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
        long vehicleId = queries.activeVehicle(projectId).lng("id");
        String purpose = "BASELINE".equals(version.str("status")) ? "BASELINE" : "EVALUATION";
        List<Long> ids = new ArrayList<>(createRuns(projectId, scenarioId, variants, vehicleId, version.lng("id"), userId, purpose, null, null));
        if (withAebOff) {
            ids.addAll(createRuns(projectId, scenarioId, variants, vehicleId, version.lng("id"), userId, purpose, null, null, null, null, null,
                    com.vsos.core.simulation.AebMode.OFF));
        }
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
