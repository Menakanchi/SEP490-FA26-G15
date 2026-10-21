package com.vehicsim.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Một lần chạy CARLA ở phía lõi (ADR-042): toàn bộ logic của controller ScenarioRunner trước đây nằm ở {@code worker/vehicsim_aeb_control.py} — khung tọa độ,
 * đo giảm tốc, AEB, bàn đạp phanh, điều kiện kết thúc, ghi khung/sự kiện/chỉ số và {@code result.json}. Python chỉ đọc trạng thái CARLA, gửi sang đây và áp
 * lệnh phanh trả về; nó không giữ logic AEB nào.
 *
 * <p>Vòng đời: {@link #open} (đọc {@code .xosc}) → {@link #init} (khi người đi bộ đã xuất hiện, đặt gốc khung tọa độ) → {@link #step} mỗi tick → kết thúc khi
 * {@code step} báo {@code finished} (đã ghi {@code result.json}) hoặc {@link #finish} khi bị ngắt.</p>
 */
public final class CarlaSession {

    /** Mức giảm tốc ứng với bàn đạp 1,0 khi chưa đo (m/s²); controller có thể truyền giá trị khác. */
    public static final double DEFAULT_FULL_BRAKE_DECEL = 4.6;

    private final Bundle.RunSpec spec;
    private final Xosc.Profile profile;
    private final String simulatorVersion;
    private final Path outDir;
    private final double fullBrakeDecel;
    private final double stepS;
    private final List<Map<String, Object>> events = new ArrayList<>();
    private final List<Frame> frames = new ArrayList<>();
    private final AebStack stack;
    private final Simulator.MotionStats stats;
    private final DecelMeter meter;

    private CrossingFrame frame;
    private double frontOffset;
    private Map<String, Object> carlaInfo = Map.of();
    private boolean pedStarted;
    private boolean braking;
    private String endReason;
    private Path resultPath;

    private CarlaSession(Bundle.RunSpec spec, Xosc.Profile profile, String simulatorVersion, Path outDir, double fullBrakeDecel) {
        this.spec = spec;
        this.profile = profile;
        this.simulatorVersion = simulatorVersion;
        this.outDir = outDir;
        this.fullBrakeDecel = fullBrakeDecel;
        this.stepS = profile.stepS();
        this.stack = Simulator.newAebStack(spec.caseSpec(), spec.params(), spec.seed(), spec.vehicle(), events, stepS, profile.perceptionPeriodS());
        this.stats = new Simulator.MotionStats(stepS);
        // Cửa sổ đo giảm tốc giữ nguyên 0,1 s (2 tick ở 20 Hz): đúng một chu kỳ răng cưa tốc độ CARLA đã đo.
        this.meter = new DecelMeter(spec.caseSpec().roadFriction() * Simulator.G, Math.max(2, (int) Py.round(0.1 / stepS)), stepS);
    }

    public static CarlaSession open(Path xoscFile, Path outDir, String simulatorVersion, Double fullBrakeDecel) {
        Bundle.RunSpec spec = Xosc.read(xoscFile);
        Xosc.Profile profile = Xosc.profile(xoscFile);
        return new CarlaSession(spec, profile, simulatorVersion, outDir, fullBrakeDecel != null ? fullBrakeDecel : DEFAULT_FULL_BRAKE_DECEL);
    }

    public Bundle.RunSpec spec() {
        return spec;
    }

    public Xosc.Profile profile() {
        return profile;
    }

    public boolean finished() {
        return endReason != null;
    }

    public Path resultPath() {
        return resultPath;
    }

    /**
     * Đặt gốc khung tọa độ tại vạch băng qua khi người đi bộ đã xuất hiện. Người đi bộ bắt đầu bên phải tim làn một khoảng {@code PEDESTRIAN_START_Y_M}, nên
     * gốc = vị trí đó dịch theo vector phải của ego; {@code frontOffset} là khoảng từ gốc xe tới mũi xe theo bounding box.
     *
     * @param carla thông tin chỉ CARLA biết (tên map, blueprint), ghi vào {@code case.carla} của kết quả
     */
    public void init(double[] egoForward, double[] egoRight, double[] walker, double frontOffset, Map<String, Object> carla) {
        double startY = Simulator.PEDESTRIAN_START_Y_M;
        this.frame = new CrossingFrame(walker[0] + egoRight[0] * startY, walker[1] + egoRight[1] * startY, egoForward[0], egoForward[1], egoRight[0], egoRight[1]);
        this.frontOffset = frontOffset;
        this.carlaInfo = carla;
    }

    /** Kết quả của một tick: {@code skip} = cùng tick đã xử lý; {@code finished} = lý do kết thúc nếu run vừa kết thúc ở tick này. */
    public record Tick(boolean skip, boolean braking, double decelCmd, double pedal, String finished) {
    }

    public Tick step(double t, double[] egoLoc, double[] egoForward, double[] egoVel, double[] pedLoc, double[] pedVel, boolean walkerCollision) {
        if (frame == null) {
            throw new IllegalStateException("step trước init");
        }
        if (endReason != null) {
            throw new IllegalStateException("run đã kết thúc: " + endReason);
        }
        if (!frames.isEmpty() && t <= frames.get(frames.size() - 1).t()) {
            return new Tick(true, braking, 0.0, 0.0, null);
        }
        double gap = -frame.along(egoLoc[0] + egoForward[0] * frontOffset, egoLoc[1] + egoForward[1] * frontOffset);
        double egoV = Math.max(0.0, frame.velocityAlong(egoVel[0], egoVel[1]));
        double pedY = frame.left(pedLoc[0], pedLoc[1]);
        double pedVy = frame.velocityLeft(pedVel[0], pedVel[1]);
        if (!pedStarted && pedVy > 0.05) {
            pedStarted = true;
            AebStack.Events.record(events, t, "gt_start", "Pedestrian starts crossing");
        }
        double decel = meter.update(egoV, braking);
        AebTick tick = stack.step(t, gap, pedY, pedVy, egoV);
        if (tick.decelCmd() > 0) {
            braking = true;
        }
        double pedal = braking ? DecelMeter.brakePedal(tick.decelCmd(), decel, fullBrakeDecel) : 0.0;
        stats.add(decel);
        CrossingCase c = spec.caseSpec();
        frames.add(Simulator.makeFrame(t, c.crossingX() - gap, egoV, decel, c.crossingX(), pedY, pedVy, tick,
                Simulator.groundTruthTtc(gap, pedY, egoV, spec.vehicle()), stack));

        double pedAlong = frame.along(pedLoc[0], pedLoc[1]);
        double egoY = frame.left(egoLoc[0], egoLoc[1]);
        double radius = Simulator.PEDESTRIAN_RADIUS_M;
        boolean overlap = pedAlong - radius <= -gap && pedAlong + radius >= -gap - spec.vehicle().lengthM()
                && Math.abs(pedY - egoY) <= spec.vehicle().widthM() / 2 + radius;
        String finished = null;
        if (overlap || walkerCollision) {
            AebStack.Events.record(events, t, "collision", "Collision · " + Py.fixed(egoV * 3.6, 1) + " km/h", "impact_speed_mps", Py.round(egoV, 3));
            finished = "COLLISION";
        } else if (egoV <= 0.05 && stack.decisionT() != null) {
            AebStack.Events.record(events, t, "stopped", "Ego stopped", "gap_m", Py.round(gap, 2));
            finished = "EGO_STOPPED";
        } else if (-gap - spec.vehicle().lengthM() > pedAlong + 1.0) {
            finished = "TARGET_CLEARED";
        } else if (t >= Simulator.MAX_DURATION_S - 0.1) {
            finished = "TIMEOUT";
        }
        if (finished != null) {
            finish(finished);
        }
        return new Tick(false, braking, tick.decelCmd(), pedal, finished);
    }

    /** Ghi {@code result.json}. Gọi lại sau khi đã kết thúc, hoặc khi chưa có khung nào, là không làm gì (như {@code _finish} của bản Python). */
    public void finish(String reason) {
        if (endReason != null || frames.isEmpty()) {
            return;
        }
        CrossingCase c = spec.caseSpec();
        double decelAvailable = Math.min(Math.min(spec.params().maxDeceleration(), spec.vehicle().maxBrakeDecelMps2()), c.roadFriction() * Simulator.G);
        SimulationOutcome outcome = Simulator.buildOutcome(c, spec.params(), spec.vehicle(), stack, stats, frames, events, reason, c.crossingX(),
                decelAvailable, stepS);
        List<Double> egoA = new ArrayList<>(frames.size());
        List<Double> times = new ArrayList<>(frames.size());
        for (Frame f : frames) {
            egoA.add(f.egoA());
            times.add(f.t());
        }
        int start = Simulator.brakePhaseStart(frames, stack.brakeOnsetT());
        // Thực nghiệm (D3, kế hoạch 20/10): cùng tín hiệu ego_a của rms_jerk_mps3 nhưng lọc Butterworth 10 Hz trước khi đạo hàm. Không thay objective chính
        // thức. Chỉ tính được khi bước < 0,05 s.
        Double filtered = start >= 0 && stepS < 0.05 ? Filters.filteredRmsJerk(egoA, start, stepS, (Double) Filters.SPEC.get("cutoff_hz")) : null;

        Map<String, Object> jerk = new LinkedHashMap<>();
        jerk.put("status", "EXPERIMENTAL");
        jerk.put("filter", Filters.SPEC);
        jerk.put("signal", "ego_a");
        jerk.put("rms_jerk_mps3", filtered == null ? null : Py.round(filtered, 3));
        Map<String, Object> measured = null;
        if (times.size() > 1) {
            double min = Double.POSITIVE_INFINITY;
            double max = Double.NEGATIVE_INFINITY;
            double sum = 0.0;
            for (int i = 1; i < times.size(); i++) {
                double step = times.get(i) - times.get(i - 1);
                min = Math.min(min, step);
                max = Math.max(max, step);
                sum += step;
            }
            measured = new LinkedHashMap<>();
            measured.put("min", Py.round(min, 4));
            measured.put("max", Py.round(max, 4));
            measured.put("mean", Py.round(sum / (times.size() - 1), 4));
            measured.put("frames", frames.size());
        }
        Map<String, Object> carla = new LinkedHashMap<>();
        carla.put("map", carlaInfo.get("map"));
        carla.put("blueprint", carlaInfo.get("blueprint"));
        carla.put("full_brake_decel", fullBrakeDecel);
        carla.put("runner", "ScenarioRunner");
        carla.put("decel_clamped_frames", meter.clamped());
        // Bước cấu hình và bước đo được từ timestamp khung thật: không coi cấu hình là đã đạt tốc độ này.
        carla.put("fixed_delta_seconds", stepS);
        carla.put("perception_period_s", profile.perceptionPeriodS());
        carla.put("jerk_filtered", jerk);
        carla.put("measured_step_s", measured);
        outcome.caseDoc().put("carla", carla);

        Map<String, Object> result = Bundle.resultDocument(spec, outcome, simulatorVersion, null, Evaluation.evaluate(outcome, spec.params()).toDocument());
        result.put("engine", Bundle.ENGINE);
        try {
            Files.createDirectories(outDir);
            resultPath = outDir.resolve("result.json");
            Files.writeString(resultPath, MiniJson.write(result), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Không ghi được result.json: " + e.getMessage(), e);
        }
        endReason = reason;
    }
}
