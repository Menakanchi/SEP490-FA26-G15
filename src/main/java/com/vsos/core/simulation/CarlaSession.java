package com.vsos.core.simulation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.core.aeb.AebStack;
import com.vsos.core.aeb.AebTick;
import com.vsos.core.aeb.DecelMeter;
import com.vsos.core.aeb.Filters;
import com.vsos.core.aeb.RadarTracker;
import com.vsos.core.bridge.Bundle;
import com.vsos.core.common.MiniJson;
import com.vsos.core.common.Py;
import com.vsos.core.evaluation.Evaluation;
import com.vsos.core.xosc.Xosc;

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
    // Perception từ radar (ADR-043). Giai đoạn 1 (≤ v5): AEB thật dùng ground truth, bản bóng nhận radar để đo. Giai đoạn 2 (v6, ca người đi bộ):
    // AEB thật nhận radar, bản bóng nhận ground truth để so. Bản bóng không bao giờ điều khiển xe.
    private final RadarTracker tracker = new RadarTracker();
    private final List<Map<String, Object>> shadowEvents = new ArrayList<>();
    private final AebStack shadow;
    private final boolean radarPerception;
    private final ShadowStats shadowStats = new ShadowStats();
    private boolean radarSeen;
    private Map<String, Object> firstOffTarget;

    private CrossingFrame frame;
    private double frontOffset;
    // Xe phía trước (ADR-050): kích thước thật của xe mục tiêu (bounding box CARLA), độ lệch tâm bbox so với gốc actor, mốc mũi ego lúc đầu.
    private double targetLength = LeadVehicleCase.TARGET_LENGTH_M;
    private double targetWidth = LeadVehicleCase.TARGET_WIDTH_M;
    private double targetCenterOffset;
    private Double egoFront0;
    private Double lastTargetY;
    private double peakTargetSpeed;
    private boolean targetBraking;
    private double impactRelative;
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
        this.stack = newStack(spec, events, stepS, profile.perceptionPeriodS());
        this.shadow = newStack(spec, shadowEvents, stepS, profile.perceptionPeriodS());
        this.radarPerception = radarPerception(spec, profile);
        this.stats = new Simulator.MotionStats(stepS);
        // Cửa sổ đo giảm tốc giữ nguyên 0,1 s (2 tick ở 20 Hz): đúng một chu kỳ răng cưa tốc độ CARLA đã đo.
        this.meter = new DecelMeter(spec.roadFriction() * Simulator.G, Math.max(2, (int) Py.round(0.1 / stepS)), stepS);
    }

    /** Cùng cách dựng AEB như {@link Simulator#newAebStack}, đọc thời tiết / giờ từ spec để dùng được cho cả nhóm xe phía trước. */
    private static AebStack newStack(Bundle.RunSpec spec, List<Map<String, Object>> events, double stepS, Double perceptionPeriodS) {
        if (spec.leadCase() == null) {
            return Simulator.newAebStack(spec.caseSpec(), spec.params(), spec.seed(), spec.vehicle(), events, stepS, perceptionPeriodS);
        }
        return new AebStack(spec.params(), spec.seed(), spec.weather(), spec.timeOfDay(), spec.vehicle().lengthM(),
                Math.min(spec.params().maxDeceleration(), spec.vehicle().maxBrakeDecelMps2()), events, stepS, perceptionPeriodS);
    }

    /** AEB thật nhận perception từ radar: profile hiện hành (v6) và mục tiêu là người đi bộ. Xe phía trước và file ≤ v5 vẫn dùng ground truth. */
    static boolean radarPerception(Bundle.RunSpec spec, Xosc.Profile profile) {
        return spec.leadCase() == null && Xosc.SIMULATOR_SUFFIX.equals(profile.suffix());
    }

    /** File định dạng hiện hành (v6): dùng các định nghĩa chỉ số chốt 13/11/2026; file cũ giữ định nghĩa của nó. */
    private boolean currentFormat() {
        return Xosc.SIMULATOR_SUFFIX.equals(profile.suffix());
    }

    /** Mục tiêu là xe phía trước (CCRs/CCRm/CCRb)? */
    public boolean leadVehicle() {
        return spec.leadCase() != null;
    }

    /**
     * @param fullBrakeDecel ghi đè giảm tốc khi phanh 100% (thuộc tính controller); null thì lấy số đo của xe trong {@code .xosc}
     *                       ({@link Bundle#FULL_BRAKE_DECEL}), xe chưa đo thì {@link #DEFAULT_FULL_BRAKE_DECEL}
     */
    public static CarlaSession open(Path xoscFile, Path outDir, String simulatorVersion, Double fullBrakeDecel) {
        Bundle.RunSpec spec = Xosc.read(xoscFile);
        Xosc.Profile profile = Xosc.profile(xoscFile);
        return new CarlaSession(spec, profile, simulatorVersion, outDir, fullBrakeDecel(fullBrakeDecel, spec.vehicleCarla()));
    }

    public static double fullBrakeDecel(Double override, Map<String, Object> vehicleCarla) {
        if (override != null) {
            return override;
        }
        return vehicleCarla.get(Bundle.FULL_BRAKE_DECEL) instanceof Number measured ? measured.doubleValue() : DEFAULT_FULL_BRAKE_DECEL;
    }

    /** Sai số tương đối chấp nhận cho trường đã ép (khối lượng, hệ số cản, trọng tâm): CARLA lưu float32. */
    static final double FORCED_RELATIVE_TOLERANCE = 1e-3;
    /** Lệch kích thước mesh so với DB coi là đáng kể (m): mesh của blueprint cố định, runner không ép được kích thước. */
    static final double DIMENSION_TOLERANCE_M = 0.05;

    /**
     * So thông số xe đã yêu cầu (DB → {@code .xosc}) với thông số CARLA đọc lại sau khi ép (kế hoạch 20/10 việc 4). Trường ép được phải khớp; kích thước chỉ
     * báo lệch vì mesh cố định. Chỉ ghi nhận để kỹ sư biết xe trong CARLA khác xe trong DB bao nhiêu, không chặn run và không sửa số.
     */
    static Map<String, Object> physicsCheck(Map<String, Object> vehicleCarla, VehicleSpec vehicle, Map<?, ?> applied) {
        List<Map<String, Object>> fields = new ArrayList<>();
        boolean forcedOk = true;
        boolean dimensionsOk = true;
        Map<?, ?> physics = vehicleCarla.get("physics") instanceof Map<?, ?> p ? p : Map.of();
        for (String key : List.of("mass", "drag_coefficient")) {
            forcedOk &= compare(fields, key, physics.get(key), applied.get(key), true);
        }
        if (physics.get("center_of_mass") instanceof Map<?, ?> com && applied.get("center_of_mass") instanceof Map<?, ?> got) {
            for (String axis : List.of("x", "y", "z")) {
                forcedOk &= compare(fields, "center_of_mass_" + axis, com.get(axis), got.get(axis), true);
            }
        }
        if (physics.get("wheels") instanceof Map<?, ?> wheels && wheels.get("max_brake_torque") != null) {
            // ADR-051: mô-men phanh đã hiệu chuẩn phải tới được mọi bánh; thiếu thì CARLA phanh như xe chưa hiệu chuẩn (~4 m/s², TD-17).
            List<?> got = applied.get("wheels") instanceof List<?> l ? l : List.of();
            if (got.isEmpty()) {
                forcedOk &= compare(fields, "wheel_max_brake_torque", wheels.get("max_brake_torque"), null, true);
            }
            for (int i = 0; i < got.size(); i++) {
                Object value = got.get(i) instanceof Map<?, ?> wheel ? wheel.get("max_brake_torque") : null;
                forcedOk &= compare(fields, "wheel_" + i + "_max_brake_torque", wheels.get("max_brake_torque"), value, true);
            }
        }
        Map<?, ?> dims = vehicleCarla.get("dimensions") instanceof Map<?, ?> d ? d : Map.of();
        dimensionsOk &= compare(fields, "length_m", vehicle.lengthM(), applied.get("length_m"), false);
        dimensionsOk &= compare(fields, "width_m", vehicle.widthM(), applied.get("width_m"), false);
        for (String key : List.of("height_m", "wheelbase_m")) {
            dimensionsOk &= compare(fields, key, dims.get(key), applied.get(key), false);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("forced_ok", forcedOk);
        out.put("dimensions_ok", dimensionsOk);
        out.put("dimension_tolerance_m", DIMENSION_TOLERANCE_M);
        out.put("fields", fields);
        return out;
    }

    /** Thêm một dòng so sánh; thiếu một trong hai số thì ghi lại nhưng không tính là lệch. */
    private static boolean compare(List<Map<String, Object>> fields, String name, Object requested, Object applied, boolean forced) {
        if (!(requested instanceof Number r) || !(applied instanceof Number a)) {
            if (requested != null || applied != null) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("field", name);
                row.put("requested", requested);
                row.put("applied", applied);
                row.put("forced", forced);
                row.put("ok", null);
                fields.add(row);
            }
            return true;
        }
        double delta = a.doubleValue() - r.doubleValue();
        boolean ok = forced
                ? Math.abs(delta) <= FORCED_RELATIVE_TOLERANCE * Math.max(1.0, Math.abs(r.doubleValue()))
                : Math.abs(delta) <= DIMENSION_TOLERANCE_M;
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("field", name);
        row.put("requested", r.doubleValue());
        row.put("applied", Py.round(a.doubleValue(), 4));
        row.put("delta", Py.round(delta, 4));
        row.put("forced", forced);
        row.put("ok", ok);
        fields.add(row);
        return ok;
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
        if (leadVehicle()) {
            initLead(egoForward, egoRight, walker, frontOffset, carla, null, 0.0);
            return;
        }
        double startY = Simulator.PEDESTRIAN_START_Y_M;
        this.frame = new CrossingFrame(walker[0] + egoRight[0] * startY, walker[1] + egoRight[1] * startY, egoForward[0], egoForward[1], egoRight[0], egoRight[1]);
        this.frontOffset = frontOffset;
        this.carlaInfo = carla;
    }

    /**
     * Xe phía trước (ADR-050): gốc khung = điểm trên tim làn ego ngang với tâm xe mục tiêu lúc đầu (dịch vị trí xe mục tiêu sang phải đúng độ lệch ngang
     * đã đặt). {@code targetSize} = [dài, rộng] bounding box CARLA (null = kích thước mặc định), {@code centerOffset} = tâm bbox lệch trước gốc actor.
     */
    public void initLead(double[] egoForward, double[] egoRight, double[] target, double frontOffset, Map<String, Object> carla, double[] targetSize,
                         double centerOffset) {
        double offset = spec.leadCase().lateralOffsetM(spec.vehicle().widthM());
        double cx = target[0] + egoForward[0] * centerOffset;
        double cy = target[1] + egoForward[1] * centerOffset;
        this.frame = new CrossingFrame(cx + egoRight[0] * offset, cy + egoRight[1] * offset, egoForward[0], egoForward[1], egoRight[0], egoRight[1]);
        this.frontOffset = frontOffset;
        this.carlaInfo = carla;
        if (targetSize != null && targetSize.length == 2 && targetSize[0] > 0 && targetSize[1] > 0) {
            this.targetLength = targetSize[0];
            this.targetWidth = targetSize[1];
        }
        this.targetCenterOffset = centerOffset;
    }

    /** Kết quả của một tick: {@code skip} = cùng tick đã xử lý; {@code finished} = lý do kết thúc nếu run vừa kết thúc ở tick này. */
    public record Tick(boolean skip, boolean braking, double decelCmd, double pedal, String finished) {
    }

    public Tick step(double t, double[] egoLoc, double[] egoForward, double[] egoVel, double[] pedLoc, double[] pedVel, boolean walkerCollision) {
        return step(t, egoLoc, egoForward, egoVel, pedLoc, pedVel, walkerCollision, null);
    }

    /**
     * @param radar điểm thô của radar 90° gắn mũi xe ở lần đo mới nhất (ADR-043); {@code null} = adapter không gắn radar, bỏ qua chạy bóng.
     *              Chỉ dùng cho bản bóng: quyết định AEB thật và mọi số đã lưu không phụ thuộc tham số này.
     */
    public Tick step(double t, double[] egoLoc, double[] egoForward, double[] egoVel, double[] pedLoc, double[] pedVel, boolean walkerCollision,
                     List<RadarTracker.Point> radar) {
        if (frame == null) {
            throw new IllegalStateException("step trước init");
        }
        if (endReason != null) {
            throw new IllegalStateException("run đã kết thúc: " + endReason);
        }
        if (!frames.isEmpty() && t <= frames.get(frames.size() - 1).t()) {
            return new Tick(true, braking, 0.0, 0.0, null);
        }
        if (leadVehicle()) {
            return leadStep(t, egoLoc, egoForward, egoVel, pedLoc, pedVel, walkerCollision);
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
        double pedAlong = frame.along(pedLoc[0], pedLoc[1]);
        double egoY = frame.left(egoLoc[0], egoLoc[1]);
        AebTick tick;
        if (radarPerception) {
            // ADR-043 giai đoạn 2 (v6): AEB thật nhận perception từ radar; ground truth chạy bóng để so và để chấm.
            if (radar == null) {
                throw new IllegalStateException("Profile " + profile.suffix() + " cần điểm radar mỗi tick (ADR-043); adapter chưa gắn radar");
            }
            radarSeen = true;
            tick = measuredStep(stack, t, gap, egoV, egoY, radarEstimate(t, gap, egoV, pedAlong + gap, pedY - egoY, pedVy, egoY, radar));
            shadow.step(t, gap, pedY, pedVy, egoV);
        } else {
            tick = stack.step(t, gap, pedY, pedVy, egoV);
            if (radar != null) {
                radarSeen = true;
                measuredStep(shadow, t, gap, egoV, egoY, radarEstimate(t, gap, egoV, pedAlong + gap, pedY - egoY, pedVy, egoY, radar));
            }
        }
        if (tick.decelCmd() > 0 && !spec.aebOff()) { // AEB tắt: AEB vẫn quyết định để ghi lại, không phanh
            braking = true;
        }
        double pedal = braking ? DecelMeter.brakePedal(tick.decelCmd(), decel, fullBrakeDecel) : 0.0;
        stats.add(decel);
        CrossingCase c = spec.requireCrossing("Runner CARLA");
        frames.add(Simulator.makeFrame(t, c.crossingX() - gap, egoV, decel, c.crossingX(), pedY, pedVy, tick,
                Simulator.groundTruthTtc(gap, pedY, egoV, spec.vehicle()), stack));

        double radius = Simulator.PEDESTRIAN_RADIUS_M;
        boolean overlap = pedAlong - radius <= -gap && pedAlong + radius >= -gap - spec.vehicle().lengthM()
                && Math.abs(pedY - egoY) <= spec.vehicle().widthM() / 2 + radius;
        String finished = null;
        if (overlap || walkerCollision) {
            AebStack.Events.record(events, t, "collision", "Collision · " + Py.fixed(egoV * 3.6, 1) + " km/h", "impact_speed_mps", Py.round(egoV, 3));
            // |v_ego − v_ped| theo vector thật trong khung giao cắt (người có thể có thành phần dọc), ngay tick phát hiện tiếp xúc.
            impactRelative = Math.hypot(egoV - frame.velocityAlong(pedVel[0], pedVel[1]), pedVy);
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
        // AEB tắt: báo adapter không có lệnh phanh, để xe giữ tốc độ như không có AEB (adapter thôi giữ tốc độ khi decel_cmd > 0).
        return new Tick(false, braking, spec.aebOff() ? 0.0 : tick.decelCmd(), pedal, finished);
    }

    /**
     * Một tick với xe phía trước: khoảng cách tới đuôi xe mục tiêu, TTC theo tốc độ tiếp cận ({@link AebStack#stepTarget}), va chạm khi hai hình hộp chồng
     * nhau hoặc cảm biến va chạm báo trúng xe. Chưa chạy bóng radar cho xe (bộ bám ADR-043 viết cho người đi bộ).
     */
    private Tick leadStep(double t, double[] egoLoc, double[] egoForward, double[] egoVel, double[] targetLoc, double[] targetVel, boolean targetHit) {
        LeadVehicleCase c = spec.leadCase();
        double egoFront = frame.along(egoLoc[0] + egoForward[0] * frontOffset, egoLoc[1] + egoForward[1] * frontOffset);
        if (egoFront0 == null) {
            egoFront0 = egoFront;
        }
        double targetCenter = frame.along(targetLoc[0] + egoForward[0] * targetCenterOffset, targetLoc[1] + egoForward[1] * targetCenterOffset);
        double targetRear = targetCenter - targetLength / 2;
        double gap = targetRear - egoFront;
        double egoV = Math.max(0.0, frame.velocityAlong(egoVel[0], egoVel[1]));
        double targetV = Math.max(0.0, frame.velocityAlong(targetVel[0], targetVel[1]));
        double egoY = frame.left(egoLoc[0], egoLoc[1]);
        double targetY = frame.left(targetLoc[0], targetLoc[1]) - egoY; // lệch ngang so với ego
        lastTargetY = targetY;
        // Tick đầu CARLA chưa áp vận tốc (xe đứng yên): so với vận tốc lớn nhất đã thấy, không phải khung đầu.
        peakTargetSpeed = Math.max(peakTargetSpeed, targetV);
        if (!targetBraking && LeadVehicleCase.CCRB.equals(c.category()) && peakTargetSpeed > 0.5 && peakTargetSpeed - targetV > 0.3) {
            targetBraking = true;
            AebStack.Events.record(events, t, "gt_start", "Lead vehicle brakes · " + Py.fixed(c.targetDecelMps2() == null ? 0.0 : c.targetDecelMps2(), 1) + " m/s²");
        }
        double halfSum = spec.vehicle().widthM() / 2 + targetWidth / 2;
        boolean inPath = Math.abs(targetY) < halfSum;
        double closing = egoV - targetV;
        double decel = meter.update(egoV, braking);
        AebTick tick = stack.stepTarget(t, gap, targetY, 0.0, egoV, targetV, targetWidth / 2);
        if (tick.decelCmd() > 0 && !spec.aebOff()) { // AEB tắt: AEB vẫn quyết định để ghi lại, không phanh
            braking = true;
        }
        double pedal = braking ? DecelMeter.brakePedal(tick.decelCmd(), decel, fullBrakeDecel) : 0.0;
        stats.add(decel);
        Double ttcGt = inPath && gap > 0 && closing > 0.1 ? gap / closing : null;
        frames.add(Simulator.makeFrame(t, egoFront - egoFront0, egoV, decel, targetRear - egoFront0, targetY, 0.0, tick, ttcGt, stack));

        double egoRear = egoFront - spec.vehicle().lengthM();
        boolean overlap = inPath && egoFront >= targetRear && egoRear <= targetRear + targetLength;
        String finished = null;
        if (overlap || targetHit) {
            impactRelative = Math.max(0.0, closing);
            AebStack.Events.record(events, t, "collision", "Collision · " + Py.fixed(egoV * 3.6, 1) + " km/h", "impact_speed_mps", Py.round(egoV, 3),
                    "relative_impact_speed_mps", Py.round(impactRelative, 3));
            finished = "COLLISION";
        } else if (egoV <= 0.05 && stack.decisionT() != null) {
            AebStack.Events.record(events, t, "stopped", "Ego stopped", "gap_m", Py.round(gap, 2));
            finished = "EGO_STOPPED";
        } else if (egoRear > targetRear + targetLength + 1.0) {
            finished = "TARGET_CLEARED";
        } else if (t >= Simulator.MAX_DURATION_S - 0.1) {
            finished = "TIMEOUT";
        }
        if (finished != null) {
            finish(finished);
        }
        // AEB tắt: báo adapter không có lệnh phanh, để xe giữ tốc độ như không có AEB (adapter thôi giữ tốc độ khi decel_cmd > 0).
        return new Tick(false, braking, spec.aebOff() ? 0.0 : tick.decelCmd(), pedal, finished);
    }

    /**
     * Đưa ước lượng radar vào một {@code AebStack}. Không phát hiện thì {@code gap} chỉ để giữ chữ ký: {@link AebStack#stepMeasured} chỉ dùng khoảng cách
     * khi {@code detected}, nên ground truth không lọt vào quyết định. Vị trí ngang quy về khung giao cắt bằng {@code egoY} (trạng thái của chính ego).
     */
    private static AebTick measuredStep(AebStack target, double t, double gap, double egoV, double egoY, RadarTracker.Estimate e) {
        boolean detected = e.tracked() && e.confidence() >= AebStack.DETECTION_CONFIDENCE_THRESHOLD;
        return target.stepMeasured(t, detected ? e.forward() : gap, egoV, detected, e.confidence(), e.left() + egoY, e.vLeft());
    }

    /**
     * Một tick bộ bám radar, rồi so ước lượng với ground truth (sai số, track bám nhầm).
     *
     * @param gtForward khoảng dọc thật từ mũi xe tới người đi bộ; {@code gtLeft} vị trí ngang thật so với trục xe; {@code gtVLeft} vận tốc ngang thật
     */
    private RadarTracker.Estimate radarEstimate(double t, double gap, double egoV, double gtForward, double gtLeft, double gtVLeft, double egoY,
                                                List<RadarTracker.Point> radar) {
        if (RADAR_DUMP) {
            dumpRadar(t, gap, egoV, gtForward, gtLeft, gtVLeft, egoY, radar);
        }
        RadarTracker.Estimate e = tracker.update(t, egoV, radar);
        boolean detected = e.tracked() && e.confidence() >= AebStack.DETECTION_CONFIDENCE_THRESHOLD;
        boolean inView = gtForward > 0 && Math.hypot(gtForward, gtLeft) <= RadarTracker.RANGE_M
                && Math.abs(Math.toDegrees(Math.atan2(gtLeft, gtForward))) <= RadarTracker.FOV_DEG / 2;
        shadowStats.add(inView, detected, e.forward() - gtForward, e.left() - gtLeft, e.vLeft() - gtVLeft);
        if (detected && firstOffTarget == null && Math.hypot(e.forward() - gtForward, e.left() - gtLeft) > RadarTracker.GATE_M * 2) {
            // Chẩn đoán track bám nhầm (ca an toàn c6, 22/10): ghi lần đầu để biết vật bị bám nằm đâu so với xe và người đi bộ.
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("t", t);
            d.put("ego_v_mps", Py.round(egoV, 3));
            d.put("track_forward_m", Py.round(e.forward(), 2));
            d.put("track_left_m", Py.round(e.left(), 2));
            d.put("track_v_left_mps", Py.round(e.vLeft(), 2));
            d.put("pedestrian_forward_m", Py.round(gtForward, 2));
            d.put("pedestrian_left_m", Py.round(gtLeft, 2));
            d.put("points", radar.size());
            firstOffTarget = d;
        }
        return e;
    }

    /**
     * Chẩn đoán bộ bám (ADR-043): biến môi trường {@code VSOS_RADAR_DUMP=1} ghi mỗi tick điểm radar thô cùng ground truth vào {@code radar_dump.jsonl}, để
     * phát lại bộ bám ngoài CARLA. Mặc định tắt (~15 MB mỗi run); không ảnh hưởng quyết định AEB hay {@code result.json}.
     */
    static final boolean RADAR_DUMP = "1".equals(System.getenv("VSOS_RADAR_DUMP"));

    private void dumpRadar(double t, double gap, double egoV, double gtForward, double gtLeft, double gtVLeft, double egoY, List<RadarTracker.Point> radar) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("t", t);
        line.put("gap", gap);
        line.put("ego_v", egoV);
        line.put("ego_y", egoY);
        line.put("gt_forward", gtForward);
        line.put("gt_left", gtLeft);
        line.put("gt_v_left", gtVLeft);
        List<List<Double>> pts = new ArrayList<>(radar.size());
        for (RadarTracker.Point p : radar) {
            pts.add(List.of(p.depth(), p.azimuth(), p.altitude(), p.velocity()));
        }
        line.put("points", pts);
        try {
            Files.createDirectories(outDir);
            Files.writeString(outDir.resolve("radar_dump.jsonl"), MiniJson.write(line) + "\n", StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
        } catch (IOException e) {
            throw new IllegalStateException("Không ghi được radar_dump.jsonl: " + e.getMessage(), e);
        }
    }

    /** Sai số perception bóng so với ground truth, cộng dồn qua các tick. */
    private static final class ShadowStats {
        private int inView;
        private int detectedInView;
        private int detectedOutOfView;
        private int far;
        private final double[] sumAbs = new double[3];
        private final double[] maxAbs = new double[3];

        void add(boolean inView, boolean detected, double errForward, double errLeft, double errVLeft) {
            if (inView) {
                this.inView++;
            }
            if (!detected) {
                return;
            }
            if (!inView) {
                detectedOutOfView++;
                return;
            }
            detectedInView++;
            double[] err = {Math.abs(errForward), Math.abs(errLeft), Math.abs(errVLeft)};
            if (Math.hypot(errForward, errLeft) > RadarTracker.GATE_M * 2) {
                far++; // track bám sai vật (không phải người đi bộ)
            }
            for (int i = 0; i < 3; i++) {
                sumAbs[i] += err[i];
                maxAbs[i] = Math.max(maxAbs[i], err[i]);
            }
        }

        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("frames_target_in_view", inView);
            m.put("frames_detected_in_view", detectedInView);
            m.put("frames_detected_out_of_view", detectedOutOfView);
            m.put("frames_far_from_target", far);
            String[] names = {"forward_m", "left_m", "v_left_mps"};
            for (int i = 0; i < 3; i++) {
                m.put("mean_abs_err_" + names[i], detectedInView == 0 ? null : Py.round(sumAbs[i] / detectedInView, 3));
                m.put("max_abs_err_" + names[i], detectedInView == 0 ? null : Py.round(maxAbs[i], 3));
            }
            return m;
        }
    }

    /**
     * Số đo của đường radar so với đường ground truth. {@code status}: {@code SHADOW} = radar chạy bóng (≤ v5), {@code PRIMARY} = radar điều khiển AEB thật (v6).
     * Các khoá {@code first_detection_t}/{@code fcw_t}/{@code aeb_decision_t} luôn là của đường radar, {@code ground_truth_*} luôn là của đường ground truth,
     * dù đường nào đang điều khiển xe.
     */
    private Map<String, Object> radarDocument() {
        AebStack radarStack = radarPerception ? stack : shadow;
        AebStack truthStack = radarPerception ? shadow : stack;
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("status", radarPerception ? "PRIMARY" : "SHADOW");
        doc.put("source", "radar");
        doc.put("adr", "ADR-043");
        doc.put("tracker", RadarTracker.constants());
        doc.put("first_detection_t", radarStack.firstDetectionT());
        doc.put("ground_truth_first_detection_t", truthStack.firstDetectionT());
        doc.put("fcw_t", radarStack.fcwT());
        doc.put("aeb_decision_t", radarStack.decisionT());
        doc.put("ground_truth_aeb_decision_t", truthStack.decisionT());
        doc.putAll(shadowStats.toMap());
        doc.put("first_off_target", firstOffTarget);
        return doc;
    }

    /**
     * Giảm tốc xe làm được ({@code a_avail}), dùng cho phần ngoại suy quãng dừng và cho chuỗi nguyên nhân: min(MAX_DECELERATION, giới hạn xe, μ·g).
     * Từ định dạng hiện hành (11/11/2026) giới hạn xe trên CARLA là giảm tốc phanh 100% đo được ({@code fullBrakeDecel}, cùng số controller dùng đổi ra
     * bàn đạp và cùng số {@code RunService.carlaData} dùng ngoại suy telemetry), không phải {@code max_brake_decel_mps2} giả định của bộ động học.
     * File định dạng cũ giữ cách tính cũ để chạy lại ra đúng kết quả đã lưu.
     */
    static double decelAvailable(Bundle.RunSpec spec, Xosc.Profile profile, double fullBrakeDecel) {
        double nominal = Math.min(Math.min(spec.params().maxDeceleration(), spec.vehicle().maxBrakeDecelMps2()), spec.roadFriction() * Simulator.G);
        boolean measuredBrake = Xosc.SIMULATOR_SUFFIX.equals(profile.suffix()) || Xosc.V5_SIMULATOR_SUFFIX.equals(profile.suffix());
        return measuredBrake ? Math.min(nominal, fullBrakeDecel) : nominal;
    }

    /** Ghi {@code result.json}. Gọi lại sau khi đã kết thúc, hoặc khi chưa có khung nào, là không làm gì (như {@code _finish} của bản Python). */
    public void finish(String reason) {
        if (endReason != null || frames.isEmpty()) {
            return;
        }
        double decelAvailable = decelAvailable(spec, profile, fullBrakeDecel);
        SimulationOutcome outcome;
        if (leadVehicle()) {
            double halfSum = spec.vehicle().widthM() / 2 + targetWidth / 2;
            outcome = LeadVehicleSimulator.buildOutcome(spec.leadCase(), spec.params(), spec.vehicle(), stack, stats, frames, events, reason,
                    lastTargetY == null ? 0.0 : lastTargetY, targetLength, halfSum, spec.leadCase().egoSpeedKmh() / 3.6, decelAvailable, impactRelative,
                    stepS, currentFormat()); // như người đi bộ: tốc độ đầu theo kịch bản (khung đầu CARLA ego còn đứng yên)
        } else {
            CrossingCase c = spec.requireCrossing("Runner CARLA");
            // v6: impact_speed_mps là vận tốc va chạm tương đối (chốt 13/11/2026); file ≤ v5 giữ tốc độ ego để chạy lại ra đúng kết quả đã lưu.
            outcome = Simulator.buildOutcome(c, spec.params(), spec.vehicle(), stack, stats, frames, events, reason, c.crossingX(), decelAvailable, stepS,
                    currentFormat() ? Double.valueOf(impactRelative) : null);
        }
        List<Double> egoA = new ArrayList<>(frames.size());
        List<Double> times = new ArrayList<>(frames.size());
        for (Frame f : frames) {
            egoA.add(f.egoA());
            times.add(f.t());
        }
        Map<String, Object> jerk = new LinkedHashMap<>();
        if (currentFormat() && stepS < 0.05) {
            // v6 (chốt 13/11/2026): rms_jerk_mps3 chính thức = RMS jerk của ego_a đã lọc theo Euro NCAP AEB/LSS VRU v4.5.1 (12-pole phaseless 10 Hz),
            // cửa sổ từ T_AEB (mục 2) tới hết run. Số chưa lọc giữ ở rms_jerk_raw_mps3 để đối chiếu.
            List<Double> smooth = Filters.butterworthZeroPhase(egoA, stepS, Filters.EURO_NCAP_CUTOFF_HZ, Filters.EURO_NCAP_ORDER_PER_PASS);
            int tAeb = Filters.tAebIndex(smooth);
            Double rms = Filters.rmsJerk(smooth, tAeb, stepS);
            Map<String, Object> m = outcome.metrics();
            m.put("rms_jerk_raw_mps3", m.get("rms_jerk_mps3"));
            m.put("rms_jerk_mps3", rms == null ? null : Py.round(rms, 3));
            m.put("t_aeb_s", tAeb < 0 ? null : times.get(tAeb));
            jerk.put("status", "OFFICIAL");
            jerk.put("filter", Filters.EURO_NCAP_SPEC);
            jerk.put("signal", "ego_a");
            jerk.put("window", "T_AEB to end of run");
            jerk.put("t_aeb_s", tAeb < 0 ? null : times.get(tAeb));
            jerk.put("rms_jerk_mps3", rms == null ? null : Py.round(rms, 3));
        } else {
            int start = Simulator.brakePhaseStart(frames, stack.brakeOnsetT());
            // File ≤ v5 — thực nghiệm D3 (kế hoạch 20/10): Butterworth bậc 2 một chiều 10 Hz, không thay objective. Giữ để chạy lại ra đúng kết quả.
            Double filtered = start >= 0 && stepS < 0.05 ? Filters.filteredRmsJerk(egoA, start, stepS, (Double) Filters.SPEC.get("cutoff_hz")) : null;
            jerk.put("status", "EXPERIMENTAL");
            jerk.put("filter", Filters.SPEC);
            jerk.put("signal", "ego_a");
            jerk.put("rms_jerk_mps3", filtered == null ? null : Py.round(filtered, 3));
        }
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
        if (carlaInfo.get("physics") != null) {
            // Thông số CARLA thực sự áp cho xe (đọc lại sau khi ép, kế hoạch 20/10 việc 4) — đối chiếu với thông số xe đã yêu cầu.
            carla.put("physics_applied", carlaInfo.get("physics"));
            if (carlaInfo.get("physics") instanceof Map<?, ?> applied) {
                carla.put("physics_check", physicsCheck(spec.vehicleCarla(), spec.vehicle(), applied));
            }
        }
        carla.put("full_brake_decel", fullBrakeDecel);
        if (leadVehicle()) {
            // Xe mục tiêu thật trong CARLA (blueprint cố định, kích thước theo mesh) và khoảng cách ban đầu đo được ở khung đầu.
            Map<String, Object> target = new LinkedHashMap<>();
            target.put("length_m", Py.round(targetLength, 3));
            target.put("width_m", Py.round(targetWidth, 3));
            target.put("initial_gap_m", Py.round(frames.get(0).pedX() - frames.get(0).egoX(), 3));
            target.put("controller", "vehicsim_lead_control");
            target.put("blueprint", carlaInfo.get("target_blueprint"));
            carla.put("target", target);
        }
        carla.put("runner", "ScenarioRunner");
        carla.put("decel_clamped_frames", meter.clamped());
        // Bước cấu hình và bước đo được từ timestamp khung thật: không coi cấu hình là đã đạt tốc độ này.
        carla.put("fixed_delta_seconds", stepS);
        carla.put("perception_period_s", profile.perceptionPeriodS());
        carla.put("jerk_filtered", jerk);
        carla.put("measured_step_s", measured);
        if (Xosc.SIMULATOR_SUFFIX.equals(profile.suffix())) {
            // Nguồn perception của AEB thật từ v6: radar (người đi bộ) hay ground truth (xe phía trước). File ≤ v5 không có khoá này (ground truth),
            // để chạy lại ra đúng result.json đã lưu.
            carla.put("perception_source", radarPerception ? "radar" : "ground_truth");
        }
        if (radarSeen) {  // adapter không gắn radar (run cũ, test) thì không có khối này — kết quả giữ nguyên như trước ADR-043
            // Khoá cũ perception_shadow giữ cho run ≤ v5 để so được với bằng chứng 22/10; v6 ghi perception_radar.
            carla.put(radarPerception ? "perception_radar" : "perception_shadow", radarDocument());
        }
        outcome.caseDoc().put("carla", carla);
        if (spec.aebOff()) {
            AebMode.markOff(outcome);
        }

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
