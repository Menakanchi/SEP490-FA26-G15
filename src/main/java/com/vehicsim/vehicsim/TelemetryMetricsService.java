package com.vehicsim.vehicsim;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Số đo từ dữ liệu sensor CARLA (``frames.csv`` + ``collisions.json`` của ``worker/sensor_recorder.py``) và 3 mục tiêu
 * MOBO, cùng định nghĩa ADR-040 mà bộ động học dùng (``worker/vehicsim_core/simulator.py::brake_phase_metrics``):
 * <ol>
 *   <li><b>RMS jerk</b> (độ êm, m/s³): căn trung bình bình phương jerk trong <i>pha phanh</i>. NULL nếu không phanh.</li>
 *   <li><b>Vận tốc va chạm</b> (m/s): tốc độ ego lúc va chạm. NULL nếu không va chạm — khi gộp theo họ tính 0.</li>
 *   <li><b>Quãng phanh dừng</b> (m): quãng từ lúc phanh tác dụng tới lúc dừng; run kết thúc khi xe còn chạy thì cộng
 *       \( v^2 / (2 \cdot decel\_available) \), nên ca va chạm cũng có giá trị. NULL nếu không phanh.</li>
 * </ol>
 * Pha phanh = từ khung phanh đầu tiên (sau {@link #SUMMARY_WARMUP_S}) tới <b>trước</b> khung va chạm đầu tiên: từ lúc
 * va chạm IMU đo xung lực đâm xe (~40 m/s²), không phải phanh. Bộ động học dừng đúng lúc va chạm nên không cần cắt.
 * Vận tốc va chạm <i>tương đối</i> (ISO 22733-1) chỉ là số đo phụ.
 * <p>
 * Đổi 4 tham số AEB chỉnh được là đổi các số này; 6 hằng số còn lại ở ``aeb_stack.py``
 * (``docs/vehicsim/aeb-parameter-ranges.md``).
 */
@Service
public class TelemetryMetricsService {

    public static final double SUMMARY_WARMUP_S = 0.5;
    public static final double RADAR_TARGET_HALF_ANGLE_DEG = 4.0;
    public static final double RADAR_MIN_ALTITUDE_DEG = -1.0;
    public static final double MAX_PLAUSIBLE_REL_VELOCITY_MS = 70.0;
    public static final double MAX_PLAUSIBLE_ACCEL_MS2 = 50.0;
    public static final double BRAKE_ACTIVE_THRESHOLD = 0.05;
    public static final double STOP_VELOCITY_THRESHOLD_MS = 0.05;

    public record RadarDetection(
            double depthM,
            double relVelocityMs,
            double azimuthDeg,
            double altitudeDeg
    ) {}

    public record RadarTargetResult(
            double radarDepthM,
            double radarRelVelocityMs,
            Double radarTtcS
    ) {}

    public record TelemetryFrame(
            double simTimeS,
            double egoSpeedMs,
            Double egoAccelMs2,
            Double imuJerkMs3,
            Double brake,
            Double throttle,
            Double steer,
            Double radarDepthM,
            Double radarRelVelocityMs,
            Double radarTtcS,
            Double obstacleDistanceM,
            String obstacleActor,
            Double targetSpeedMs
    ) {}

    public record CollisionEvent(
            double simTimeS,
            String actor,
            Double impactSpeedEgoMs,
            Double impactSpeedTargetMs,
            Double relativeImpactSpeedMs,
            Double peakAccelMs2
    ) {}

    /** JSON khoá snake_case như mọi route ``/vehicsim/*`` khác (``rms_jerk_mps3``…). */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record TelemetrySummary(
            // 3 mục tiêu MOBO (ADR-040)
            Double rmsJerkMps3,
            Double impactSpeedMps,
            Double stoppingDistanceM,

            // Số đo phụ
            Double relativeImpactSpeedMps,
            int totalFrames,
            double durationS,
            Double radarMinTtcS,
            Double obstacleMinDistanceM,
            Double maxDecelerationMs2,
            Double meanDecelerationMs2,
            Double maxAbsJerkMps3,
            Double firstBrakeTimeS,
            int collisions,
            Double firstCollisionTimeS,
            Double impactPeakAccelMs2
    ) {}

    /**
     * Lọc điểm radar gần nhất trong nón phía trước (\(\pm 4^\circ\)) và tính TTC (nếu đang tiến lại gần).
     * Loại bỏ các điểm dội mặt đường (góc âm < -1°) và vận tốc phi vật lý (> 70 m/s lúc spawn).
     */
    public RadarTargetResult nearestRadarTarget(List<RadarDetection> detections) {
        if (detections == null || detections.isEmpty()) {
            return null;
        }
        RadarDetection best = null;
        for (RadarDetection det : detections) {
            if (Math.abs(det.azimuthDeg()) > RADAR_TARGET_HALF_ANGLE_DEG) {
                continue;
            }
            if (det.altitudeDeg() < RADAR_MIN_ALTITUDE_DEG) {
                continue;
            }
            if (Math.abs(det.relVelocityMs()) > MAX_PLAUSIBLE_REL_VELOCITY_MS) {
                continue;
            }
            if (best == null || det.depthM() < best.depthM()) {
                best = det;
            }
        }
        if (best == null) {
            return null;
        }
        double closing = -best.relVelocityMs();
        Double ttc = closing > 0.1 ? round3(best.depthM() / closing) : null;
        return new RadarTargetResult(round3(best.depthM()), round3(best.relVelocityMs()), ttc);
    }

    /**
     * Tính toán tổng hợp số đo và 3 Objective tối ưu MOBO từ chuỗi khung telemetry và các sự kiện va chạm.
     *
     * @param frames          Chuỗi khung theo thời gian
     * @param collisions      Danh sách sự kiện va chạm
     * @param decelAvailable  Gia tốc phanh tối đa khả dụng theo ma sát/cấu hình xe (m/s²)
     */
    public TelemetrySummary summarise(List<TelemetryFrame> frames, List<CollisionEvent> collisions, double decelAvailable) {
        if (frames == null || frames.isEmpty()) {
            return new TelemetrySummary(null, null, null, null, 0, 0.0, null, null, 0.0, null, null, null, 0, null, null);
        }

        double duration = round3(frames.get(frames.size() - 1).simTimeS() - frames.get(0).simTimeS());
        Double tHit = (collisions != null && !collisions.isEmpty()) ? collisions.get(0).simTimeS() : null;

        // Bỏ khoảng khởi tạo (warmup < 0.5s) và phân đoạn trước va chạm
        List<TelemetryFrame> before = new ArrayList<>();
        List<TelemetryFrame> after = new ArrayList<>();
        for (TelemetryFrame f : frames) {
            if (f.simTimeS() >= SUMMARY_WARMUP_S) {
                if (tHit == null || f.simTimeS() < tHit) {
                    before.add(f);
                } else {
                    after.add(f);
                }
            }
        }

        // Tìm thời điểm bắt đầu phanh thực tế (first brake time)
        Double firstBrakeTime = null;
        for (TelemetryFrame r : before) {
            if (r.brake() != null && r.brake() > BRAKE_ACTIVE_THRESHOLD) {
                firstBrakeTime = r.simTimeS();
                break;
            }
        }

        // Lọc các giá trị số đo
        Double minTtc = null;
        Double minObstacle = null;
        Double maxDecel = 0.0;
        Double maxAbsJerk = null;
        double sumDecel = 0.0;
        int decelCount = 0;

        for (TelemetryFrame r : before) {
            if (r.radarTtcS() != null) {
                minTtc = minTtc == null ? r.radarTtcS() : Math.min(minTtc, r.radarTtcS());
            }
            if (r.obstacleDistanceM() != null) {
                minObstacle = minObstacle == null ? r.obstacleDistanceM() : Math.min(minObstacle, r.obstacleDistanceM());
            }
            if (r.egoAccelMs2() != null && Math.abs(r.egoAccelMs2()) <= MAX_PLAUSIBLE_ACCEL_MS2) {
                double decel = -r.egoAccelMs2();
                if (decel > 0) {
                    maxDecel = Math.max(maxDecel, decel);
                    sumDecel += decel;
                    decelCount++;
                }
            }
            if (r.imuJerkMs3() != null) {
                double absJerk = Math.abs(r.imuJerkMs3());
                maxAbsJerk = maxAbsJerk == null ? absJerk : Math.max(maxAbsJerk, absJerk);
            }
        }

        // Đỉnh xung lực va chạm sau thời điểm đâm xe
        Double impactPeakAccel = null;
        for (TelemetryFrame r : after) {
            if (r.egoAccelMs2() != null) {
                double absA = Math.abs(r.egoAccelMs2());
                impactPeakAccel = impactPeakAccel == null ? absA : Math.max(impactPeakAccel, absA);
            }
        }

        // 3 mục tiêu MOBO (ADR-040)
        Double rmsJerk = calculateRmsJerk(frames, firstBrakeTime, tHit);
        Double impactSpeed = calculateImpactSpeed(frames, collisions);
        Double stoppingDistance = calculateStoppingDistance(frames, firstBrakeTime, tHit, decelAvailable);

        int colCount = collisions != null ? collisions.size() : 0;
        Double meanDecel = decelCount > 0 ? round3(sumDecel / decelCount) : null;

        return new TelemetrySummary(
                rmsJerk,
                impactSpeed,
                stoppingDistance,
                calculateRelativeImpactSpeed(frames, collisions),
                frames.size(),
                duration,
                minTtc != null ? round3(minTtc) : null,
                minObstacle != null ? round3(minObstacle) : null,
                round3(maxDecel),
                meanDecel,
                maxAbsJerk != null ? round3(maxAbsJerk) : null,
                firstBrakeTime != null ? round3(firstBrakeTime) : null,
                colCount,
                tHit != null ? round3(tHit) : null,
                impactPeakAccel != null ? round3(impactPeakAccel) : null
        );
    }

    /**
     * Pha phanh: chỉ số {@code [start, end)} từ khung đầu tiên có {@code t >= brakeOnsetS} tới trước khung va chạm đầu
     * tiên (khung {@code t >= collisionTimeS} chứa xung lực đâm xe). {@code null} khi không phanh hoặc pha rỗng.
     */
    static int[] brakePhase(List<TelemetryFrame> frames, Double brakeOnsetS, Double collisionTimeS) {
        if (brakeOnsetS == null || frames == null || frames.isEmpty()) {
            return null;
        }
        int start = -1;
        int end = frames.size();
        for (int i = 0; i < frames.size(); i++) {
            double t = frames.get(i).simTimeS();
            if (collisionTimeS != null && t >= collisionTimeS - 1e-6) {
                end = i;
                break;
            }
            if (start < 0 && t >= brakeOnsetS - 1e-6) {
                start = i;
            }
        }
        return start < 0 || start >= end ? null : new int[]{start, end};
    }

    /**
     * Mục tiêu 1: RMS jerk trong pha phanh — căn trung bình bình phương jerk, mỗi mẫu một trọng số như
     * ``brake_phase_metrics`` của bộ động học. Nguồn jerk chọn <b>một lần cho cả run</b> để không trộn hai kiểu số:
     * có cột ``imu_jerk_ms3`` (``sensor_recorder.py`` đã làm mượt 0,1 s) thì dùng nó; không có thì lấy {@code Δa/Δt}
     * của gia tốc, khung trước pha phanh làm điểm xuất phát (đạo hàm thô mỗi tick khuếch đại nhiễu IMU).
     */
    public Double calculateRmsJerk(List<TelemetryFrame> frames, Double brakeOnsetS, Double collisionTimeS) {
        int[] phase = brakePhase(frames, brakeOnsetS, collisionTimeS);
        if (phase == null) {
            return null;
        }
        List<TelemetryFrame> inPhase = frames.subList(phase[0], phase[1]);
        boolean smoothed = inPhase.stream().anyMatch(f -> f.imuJerkMs3() != null);
        double sumSquares = 0.0;
        int samples = 0;
        if (smoothed) {
            for (TelemetryFrame f : inPhase) {
                if (f.imuJerkMs3() != null) {
                    sumSquares += f.imuJerkMs3() * f.imuJerkMs3();
                    samples++;
                }
            }
        } else {
            TelemetryFrame before = phase[0] > 0 ? frames.get(phase[0] - 1) : null;
            Double prevA = before == null ? null : before.egoAccelMs2();
            double prevT = before == null ? 0.0 : before.simTimeS();
            for (TelemetryFrame f : inPhase) {
                if (f.egoAccelMs2() == null) {
                    continue;
                }
                if (prevA != null && f.simTimeS() - prevT > 1e-6) {
                    double jerk = (f.egoAccelMs2() - prevA) / (f.simTimeS() - prevT);
                    sumSquares += jerk * jerk;
                    samples++;
                }
                prevA = f.egoAccelMs2();
                prevT = f.simTimeS();
            }
        }
        return samples == 0 ? null : round3(Math.sqrt(sumSquares / samples));
    }

    /**
     * Mục tiêu 2: tốc độ ego lúc va chạm (``impact_speed_mps``). Lấy từ sự kiện va chạm nếu có, không thì từ khung cuối
     * trước va chạm (khung sau đó tốc độ đã bị cú đâm làm đổi). NULL nếu không va chạm — khi gộp theo họ tính 0.
     */
    public Double calculateImpactSpeed(List<TelemetryFrame> frames, List<CollisionEvent> collisions) {
        if (collisions == null || collisions.isEmpty()) {
            return null;
        }
        CollisionEvent first = collisions.get(0);
        if (first.impactSpeedEgoMs() != null) {
            return round3(first.impactSpeedEgoMs());
        }
        // collisions.json của sensor_recorder không ghi tốc độ: lấy khung cuối TRƯỚC va chạm — khung đúng lúc va chạm đã
        // chịu xung lực đâm xe (cùng lý do pha phanh dừng trước khung đó).
        TelemetryFrame last = null;
        for (TelemetryFrame f : frames) {
            if (f.simTimeS() >= first.simTimeS() - 1e-6) {
                break;
            }
            last = f;
        }
        return last == null ? null : round3(last.egoSpeedMs());
    }

    /**
     * Số đo phụ: vận tốc va chạm tương đối \( |v_{ego}(t_c) - v_{target}(t_c)| \) (ISO 22733-1:2022).
     */
    public Double calculateRelativeImpactSpeed(List<TelemetryFrame> frames, List<CollisionEvent> collisions) {
        if (collisions == null || collisions.isEmpty()) {
            return null;
        }
        CollisionEvent firstHit = collisions.get(0);
        if (firstHit.relativeImpactSpeedMs() != null) {
            return round3(Math.abs(firstHit.relativeImpactSpeedMs()));
        }
        if (firstHit.impactSpeedEgoMs() != null) {
            double targetV = firstHit.impactSpeedTargetMs() != null ? firstHit.impactSpeedTargetMs() : 0.0;
            return round3(Math.abs(firstHit.impactSpeedEgoMs() - targetV));
        }

        // Event không có sẵn vận tốc: khung cuối trước va chạm, như calculateImpactSpeed (khung lúc va chạm đã chịu xung lực)
        double tHit = firstHit.simTimeS();
        TelemetryFrame hitFrame = null;
        for (TelemetryFrame f : frames) {
            if (f.simTimeS() >= tHit - 1e-6) {
                break;
            }
            hitFrame = f;
        }
        if (hitFrame == null && !frames.isEmpty()) {
            hitFrame = frames.get(0);
        }
        if (hitFrame != null) {
            double targetV = hitFrame.targetSpeedMs() != null ? hitFrame.targetSpeedMs() : 0.0;
            return round3(Math.abs(hitFrame.egoSpeedMs() - targetV));
        }
        return null;
    }

    /**
     * Mục tiêu 3: quãng phanh dừng — tích phân hình thang tốc độ ego trong pha phanh tới khi dừng. Run kết thúc khi xe
     * còn chạy (va chạm, hết khung) thì cộng \( v^2 / (2 \cdot decel\_available) \) của khung cuối trước va chạm.
     */
    public Double calculateStoppingDistance(List<TelemetryFrame> frames, Double brakeOnsetS, Double collisionTimeS, double decelAvailable) {
        int[] phase = brakePhase(frames, brakeOnsetS, collisionTimeS);
        if (phase == null) {
            return null;
        }
        double distance = 0.0;
        int endIndex = phase[1] - 1;
        for (int i = phase[0] + 1; i < phase[1]; i++) {
            TelemetryFrame prev = frames.get(i - 1);
            TelemetryFrame curr = frames.get(i);
            double dt = curr.simTimeS() - prev.simTimeS();
            if (dt > 0) {
                distance += 0.5 * (prev.egoSpeedMs() + curr.egoSpeedMs()) * dt;
            }
            if (curr.egoSpeedMs() <= STOP_VELOCITY_THRESHOLD_MS) {
                endIndex = i;
                break;
            }
        }

        TelemetryFrame lastFrame = frames.get(endIndex);
        double finalSpeed = lastFrame.egoSpeedMs();
        double remainingDistance = 0.0;
        if (finalSpeed > STOP_VELOCITY_THRESHOLD_MS && decelAvailable > 0.0) {
            remainingDistance = (finalSpeed * finalSpeed) / (2.0 * decelAvailable);
        }

        return round3(distance + remainingDistance);
    }

    /**
     * Phân tích chuỗi CSV từ file ``frames.csv`` của ``sensor_recorder.py``. Frame chỉ có sensor (không có tốc độ
     * ground truth) không đủ để tính động học; bỏ frame đó thay vì tạo một lần dừng xe giả với tốc độ 0.
     */
    public List<TelemetryFrame> parseCsvFrames(String csvContent) {
        List<TelemetryFrame> list = new ArrayList<>();
        if (csvContent == null || csvContent.isBlank()) {
            return list;
        }
        String[] lines = csvContent.split("\\r?\\n");
        String headerLine = lines[0];
        String[] headers = headerLine.split(",");
        Map<String, Integer> colMap = new java.util.HashMap<>();
        for (int i = 0; i < headers.length; i++) {
            colMap.put(headers[i].trim(), i);
        }
        if (!colMap.containsKey("sim_time_s") || !colMap.containsKey("ego_speed_ms")) {
            throw new InvalidRequestException("frames.csv thiếu cột sim_time_s hoặc ego_speed_ms");
        }

        for (int i = 1; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) {
                continue;
            }
            String[] parts = line.split(",", -1);
            Double t = getNullableDouble(parts, colMap.get("sim_time_s"));
            Double speed = getNullableDouble(parts, colMap.get("ego_speed_ms"));
            if (t == null || speed == null || t < 0 || speed < 0) {
                continue;
            }
            Double accel = getNullableDouble(parts, colMap.get("imu_accel_x_ms2"));
            Double jerk = getNullableDouble(parts, colMap.get("imu_jerk_ms3"));
            Double brake = getNullableDouble(parts, colMap.get("brake"));
            Double throttle = getNullableDouble(parts, colMap.get("throttle"));
            Double steer = getNullableDouble(parts, colMap.get("steer"));
            Double radarDepth = getNullableDouble(parts, colMap.get("radar_depth_m"));
            Double radarRelV = getNullableDouble(parts, colMap.get("radar_rel_velocity_ms"));
            Double radarTtc = getNullableDouble(parts, colMap.get("radar_ttc_s"));
            Double obstacleDist = getNullableDouble(parts, colMap.get("obstacle_distance_m"));
            String obstacleActor = getString(parts, colMap.get("obstacle_actor"));
            Double targetV = getNullableDouble(parts, colMap.get("target_speed_ms"));

            list.add(new TelemetryFrame(t, speed, accel, jerk, brake, throttle, steer, radarDepth, radarRelV, radarTtc, obstacleDist, obstacleActor, targetV));
        }
        if (list.isEmpty()) {
            throw new InvalidRequestException("frames.csv không có khung hợp lệ với thời gian và tốc độ ego");
        }
        return list;
    }

    /**
     * Đọc ``collisions.json`` của ``sensor_recorder.py`` (``sim_time_s``, ``other_actor``, ``impulse_ns``…), sắp theo
     * thời gian. Mục thiếu ``sim_time_s`` dạng số bị bỏ qua.
     */
    public List<CollisionEvent> parseCollisions(List<Map<String, Object>> raw) {
        List<CollisionEvent> list = new ArrayList<>();
        if (raw == null) {
            return list;
        }
        for (Map<String, Object> c : raw) {
            if (c == null || !(c.get("sim_time_s") instanceof Number t)) {
                continue;
            }
            Object actor = c.get("other_actor");
            list.add(new CollisionEvent(t.doubleValue(), actor == null ? null : String.valueOf(actor),
                    number(c.get("impact_speed_ego_ms")), number(c.get("impact_speed_target_ms")),
                    number(c.get("relative_impact_speed_ms")), number(c.get("peak_accel_ms2"))));
        }
        list.sort(java.util.Comparator.comparingDouble(CollisionEvent::simTimeS));
        return list;
    }

    private static Double number(Object v) {
        return v instanceof Number n ? n.doubleValue() : null;
    }

    private static Double getNullableDouble(String[] parts, Integer idx) {
        if (idx == null || idx >= parts.length) {
            return null;
        }
        String s = parts[idx].trim();
        if (s.isEmpty() || "None".equalsIgnoreCase(s) || "null".equalsIgnoreCase(s)) {
            return null;
        }
        try {
            double value = Double.parseDouble(s);
            return Double.isFinite(value) ? value : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String getString(String[] parts, Integer idx) {
        if (idx == null || idx >= parts.length) {
            return null;
        }
        String s = parts[idx].trim();
        return (s.isEmpty() || "None".equalsIgnoreCase(s) || "null".equalsIgnoreCase(s)) ? null : s;
    }

    private static double round3(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
