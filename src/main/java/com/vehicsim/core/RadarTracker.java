package com.vehicsim.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Bộ bám một mục tiêu chuyển động từ điểm radar thô (ADR-043). Chỉ dùng JDK; không có logic quyết định AEB (việc đó ở {@link AebStack#stepMeasured}).
 *
 * <p>Radar gắn ở mũi xe ego, trục x theo hướng xe. Mỗi điểm CARLA có {@code depth}, {@code azimuth} (dương = bên phải), {@code altitude} và
 * {@code velocity} (vận tốc xuyên tâm, âm = tiến lại gần). Vật tĩnh có {@code v_r ≈ −v_ego·cos(az)·cos(alt)}, nên <b>phần dư Doppler</b>
 * {@code v_r + v_ego·cos(az)·cos(alt)} ≈ 0; người đang băng ngang thì khác 0. Mở track từ điểm có phần dư đủ lớn, bám bằng cổng vị trí và
 * bộ lọc alpha–beta (cho vận tốc ngang), mất điểm quá {@link #LOST_S} thì bỏ track.</p>
 *
 * <p>Toạ độ đầu ra theo khung xe: {@code forward} (m, trước mũi xe), {@code left} (m, trái dương — cùng chiều {@code pedY} của khung giao cắt).</p>
 */
public final class RadarTracker {

    public static final double FOV_DEG = 90.0;
    public static final double VERTICAL_FOV_DEG = 10.0;
    public static final double RANGE_M = AebStack.SENSOR_RANGE_M;
    /** Ở 100 Hz là ~400 tia mỗi tick: người đi bộ ở 20–25 m nhận vài điểm mỗi tick trong FOV 90° × 10°. */
    public static final int POINTS_PER_SECOND = 40_000;
    /** Điểm thấp hơn góc này là mặt đường (đo 10/2026 trên Town04: dội đường ở altitude âm). */
    public static final double MIN_ALTITUDE_DEG = -1.0;
    /** |v_r| lớn hơn là số phi vật lý (lúc spawn CARLA báo ~5.600 m/s). */
    public static final double MAX_SPEED_MPS = 70.0;
    /** |phần dư Doppler| tối thiểu để coi điểm thuộc vật đang chuyển động. */
    public static final double RESIDUAL_MIN_MPS = 0.25;
    /** Cổng bám: điểm cách vị trí dự đoán quá xa thì không thuộc track. */
    public static final double GATE_M = 1.5;
    /**
     * Hệ số alpha–beta. Đo trên CARLA 22/10 (exec plan): α=0,5/β=0,2 → vị trí bám nhanh, quyết định bóng trùng ground truth nhưng vận tốc ngang nhiễu
     * (sai số TB 1,58 m/s); α=0,2/β=α²/(2−α) → vận tốc tốt (0,36 m/s) nhưng vị trí trễ, quyết định muộn 0,35 s. Chưa chọn được hệ số đủ tốt cho
     * cả hai. Vì vậy α=0,5 chỉ dùng cho vị trí và dự đoán cổng; vận tốc ngang đầu ra lấy từ hồi quy cửa sổ ({@link #VELOCITY_WINDOW_S}), không chỉnh
     * số cho khớp một ca (ADR-043).
     */
    public static final double ALPHA = 0.5;
    public static final double BETA = 0.2;
    /** Cửa sổ hồi quy vận tốc ngang (s) trên tâm điểm đo thô; ít hơn {@link #VELOCITY_MIN_SAMPLES} mẫu thì dùng vận tốc của bộ lọc. */
    public static final double VELOCITY_WINDOW_S = 0.2;
    public static final int VELOCITY_MIN_SAMPLES = 5;
    /** Thời gian bám liên tục để độ tin cậy lên 1. */
    public static final double CONFIRM_S = 0.1;
    /** Mất điểm lâu hơn thì bỏ track. */
    public static final double LOST_S = 0.3;

    /** Một điểm radar CARLA (rad, m/s). */
    public record Point(double depth, double azimuth, double altitude, double velocity) {
    }

    /** Ước lượng ở một tick. {@code tracked = false} thì các trường còn lại không có nghĩa. */
    public record Estimate(boolean tracked, double forward, double left, double vLeft, double confidence) {
    }

    private record Xy(double forward, double left, double residual) {
    }

    private boolean tracked;
    private double forward;
    private double left;
    private double vForward;
    private double vLeft;
    private double firstSeenT;
    private double lastSeenT;
    private Double lastT;
    /** (t, left) của tâm điểm đo thô trong {@link #VELOCITY_WINDOW_S} gần nhất. */
    private final java.util.ArrayDeque<double[]> history = new java.util.ArrayDeque<>();

    /** Thuộc tính blueprint {@code sensor.other.radar} mà adapter CARLA áp (một nguồn duy nhất cho cả Python và Java). */
    public static Map<String, Object> sensorAttributes() {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("horizontal_fov", Py.repr(FOV_DEG));
        a.put("vertical_fov", Py.repr(VERTICAL_FOV_DEG));
        a.put("range", Py.repr(RANGE_M));
        a.put("points_per_second", String.valueOf(POINTS_PER_SECOND));
        return a;
    }

    public static Map<String, Object> constants() {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("fov_deg", FOV_DEG);
        c.put("vertical_fov_deg", VERTICAL_FOV_DEG);
        c.put("range_m", RANGE_M);
        c.put("points_per_second", POINTS_PER_SECOND);
        c.put("min_altitude_deg", MIN_ALTITUDE_DEG);
        c.put("residual_min_mps", RESIDUAL_MIN_MPS);
        c.put("gate_m", GATE_M);
        c.put("alpha", ALPHA);
        c.put("beta", BETA);
        c.put("velocity_window_s", VELOCITY_WINDOW_S);
        c.put("velocity_min_samples", VELOCITY_MIN_SAMPLES);
        c.put("confirm_s", CONFIRM_S);
        c.put("lost_s", LOST_S);
        return c;
    }

    /** Một tick: điểm của lần đo mới nhất, vận tốc ego (m/s). Gọi theo thứ tự thời gian. */
    public Estimate update(double t, double egoV, List<Point> points) {
        double dt = lastT == null ? 0.0 : t - lastT;
        lastT = t;
        List<Xy> valid = new ArrayList<>();
        double minAlt = Math.toRadians(MIN_ALTITUDE_DEG);
        for (Point p : points) {
            if (p.altitude() < minAlt || Math.abs(p.velocity()) > MAX_SPEED_MPS || p.depth() <= 0 || p.depth() > RANGE_M) {
                continue;
            }
            double horizontal = p.depth() * Math.cos(p.altitude());
            double fwd = horizontal * Math.cos(p.azimuth());
            if (fwd <= 0) {
                continue;
            }
            double residual = p.velocity() + egoV * Math.cos(p.azimuth()) * Math.cos(p.altitude());
            valid.add(new Xy(fwd, -horizontal * Math.sin(p.azimuth()), residual));
        }

        if (tracked) {
            double fwdP = forward + vForward * dt;
            double leftP = left + vLeft * dt;
            // Mọi điểm trong cổng, không lọc theo phần dư: gần tim làn phần dư của từng điểm lần lượt rơi dưới ngưỡng, chọn riêng điểm "đang chuyển động" làm
            // tâm nhảy giữa các phản xạ trên thân người (đo được ở test tổng hợp). Phần dư chỉ dùng để mở track.
            List<Xy> used = new ArrayList<>();
            for (Xy p : valid) {
                if (Math.hypot(p.forward() - fwdP, p.left() - leftP) <= GATE_M) {
                    used.add(p);
                }
            }
            if (!used.isEmpty()) {
                double[] m = mean(used);
                double rf = m[0] - fwdP;
                double rl = m[1] - leftP;
                forward = fwdP + ALPHA * rf;
                left = leftP + ALPHA * rl;
                if (dt > 0) {
                    vForward += BETA * rf / dt;
                    vLeft += BETA * rl / dt;
                }
                lastSeenT = t;
                remember(t, m[1]);
            } else {
                forward = fwdP;
                left = leftP;
                if (t - lastSeenT > LOST_S) {
                    tracked = false;
                }
            }
        }
        if (!tracked) {
            Xy seed = null;
            for (Xy p : valid) {
                if (Math.abs(p.residual()) >= RESIDUAL_MIN_MPS && (seed == null || p.forward() < seed.forward())) {
                    seed = p;
                }
            }
            if (seed != null) {
                List<Xy> cluster = new ArrayList<>();
                for (Xy p : valid) {
                    if (Math.abs(p.residual()) >= RESIDUAL_MIN_MPS && Math.hypot(p.forward() - seed.forward(), p.left() - seed.left()) <= GATE_M) {
                        cluster.add(p);
                    }
                }
                double[] m = mean(cluster);
                tracked = true;
                forward = m[0];
                left = m[1];
                vForward = -egoV;
                vLeft = 0.0;
                firstSeenT = t;
                lastSeenT = t;
                history.clear();
                remember(t, m[1]);
            }
        }
        if (!tracked) {
            return new Estimate(false, 0.0, 0.0, 0.0, 0.0);
        }
        double confirm = Math.min(1.0, (lastSeenT - firstSeenT + 1e-9) / CONFIRM_S);
        double fade = Math.max(0.0, 1.0 - (t - lastSeenT) / LOST_S);
        return new Estimate(true, forward, left, regressedVLeft(), confirm * fade);
    }

    private void remember(double t, double measuredLeft) {
        history.addLast(new double[] {t, measuredLeft});
        while (t - history.peekFirst()[0] > VELOCITY_WINDOW_S + 1e-9) {
            history.removeFirst();
        }
    }

    /** Độ dốc bình phương tối thiểu của left theo t trên cửa sổ; thiếu mẫu thì vận tốc của bộ lọc alpha–beta. */
    private double regressedVLeft() {
        if (history.size() < VELOCITY_MIN_SAMPLES) {
            return vLeft;
        }
        Double s = slope(1);
        return s != null ? s : vLeft;
    }

    /** Độ dốc bình phương tối thiểu của cột {@code column} trong lịch sử theo t; null khi t không đổi. */
    private Double slope(int column) {
        double n = history.size();
        double st = 0;
        double sy = 0;
        for (double[] h : history) {
            st += h[0];
            sy += h[column];
        }
        double mt = st / n;
        double my = sy / n;
        double cov = 0;
        double var = 0;
        for (double[] h : history) {
            cov += (h[0] - mt) * (h[column] - my);
            var += (h[0] - mt) * (h[0] - mt);
        }
        return var > 1e-12 ? cov / var : null;
    }

    private static double[] mean(List<Xy> points) {
        double f = 0;
        double l = 0;
        for (Xy p : points) {
            f += p.forward();
            l += p.left();
        }
        return new double[] {f / points.size(), l / points.size()};
    }
}
