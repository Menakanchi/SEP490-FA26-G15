package com.vsos.core.aeb;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.core.common.Py;

/**
 * Bộ bám nhiều mục tiêu từ điểm radar thô (ADR-043). Chỉ dùng JDK; không có logic quyết định AEB (việc đó ở {@link AebStack#stepMeasured}).
 *
 * <p>Radar gắn ở mũi xe ego, trục x theo hướng xe. Mỗi điểm CARLA có {@code depth}, {@code azimuth} (dương = bên phải), {@code altitude} và
 * {@code velocity} (vận tốc xuyên tâm, âm = tiến lại gần). Vật tĩnh có {@code v_r ≈ −v_ego·cos(az)·cos(alt)}, nên <b>phần dư Doppler</b>
 * {@code v_r + v_ego·cos(az)·cos(alt)} ≈ 0; người đang băng ngang thì khác 0. Điểm có phần dư đủ lớn mở track; mỗi track bám bằng cổng vị trí và
 * bộ lọc alpha–beta, mất điểm quá {@link #LOST_S} thì bỏ.</p>
 *
 * <p><b>Nhiều mục tiêu, chặn vật tĩnh (13/11/2026).</b> Bản một mục tiêu (22/10) mở track trên vật lề đường ở ca an toàn c6 rồi bám suốt run, che người
 * đi bộ: vật tĩnh trả điểm mỗi tick nên track không bao giờ mất, và bỏ track tĩnh thì vật kế tiếp lại mở track mới. Nay mọi track được giữ (track tĩnh
 * vẫn "hút" điểm của vật đó nên không mở lại), mỗi track có vận tốc so với <b>mặt đất</b> trong {@link #MOTION_WINDOW_S}: thành phần ngang từ hồi quy
 * vị trí đo (radar đo góc tốt, Doppler gần như mù với chuyển động ngang), thành phần dọc từ Doppler ({@link #dopplerForward}; tâm cụm điểm trên thân
 * người dao động dọc nên vận tốc dọc từ vị trí nhiễu). Track chỉ được báo cho AEB khi vận tốc mặt đất ≥ {@link #MOVING_MIN_MPS} <i>và</i> lớn hơn
 * {@link #MOTION_SIGMA} lần sai số chuẩn, đạt liên tục {@link #MOTION_CONFIRM_S}; hết chuyển động quá {@link #STATIC_HOLD_S} thì thôi báo.
 * Báo track chuyển động gần nhất phía trước.</p>
 *
 * <p><b>Bù tốc độ radar.</b> Phần dư Doppler tính theo tốc độ radar ước lượng từ cảnh tĩnh của cùng lần đo ({@link #sensorSpeed}), không theo
 * {@code egoV}: trên CARLA tốc độ ego răng cưa lệch pha lần đo radar, làm mọi điểm lệch cùng một lượng — nguyên nhân track giả ở ca c6.</p>
 *
 * <p>Giới hạn: vật đứng yên trong làn (xe đỗ, người đứng giữa đường) không bao giờ được báo — đúng đặc tính radar Doppler, ghi ở ADR-043.
 * Bộ bám chỉ dùng cho người đi bộ băng ngang; xe phía trước (ADR-050) vẫn dùng ground truth.</p>
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
    /** |phần dư Doppler| tối thiểu để điểm chưa thuộc track nào mở track mới. */
    public static final double RESIDUAL_MIN_MPS = 0.15;
    /** Cổng bám: điểm cách vị trí dự đoán quá xa thì không thuộc track. */
    public static final double GATE_M = 1.5;
    /** Hai track gần hơn khoảng này là cùng một vật: bỏ track mở sau. */
    public static final double MERGE_M = 0.75;
    /** Hệ số alpha–beta cho vị trí và dự đoán cổng (đo 22/10, exec plan). Vận tốc đầu ra lấy từ hồi quy, không từ bộ lọc. */
    public static final double ALPHA = 0.5;
    public static final double BETA = 0.2;
    /** Cửa sổ hồi quy vận tốc ngang đầu ra (s); ít hơn {@link #VELOCITY_MIN_SAMPLES} mẫu thì dùng vận tốc của bộ lọc. */
    public static final double VELOCITY_WINDOW_S = 0.2;
    public static final int VELOCITY_MIN_SAMPLES = 5;
    /** Cửa sổ hồi quy vận tốc mặt đất để phân loại chuyển động/tĩnh (s). Dài hơn cửa sổ vận tốc đầu ra để sai số chuẩn nhỏ. */
    public static final double MOTION_WINDOW_S = 0.5;
    /** Vận tốc mặt đất tối thiểu coi là chuyển động; thấp hơn tốc độ người đi bộ nhỏ nhất của kịch bản (0,5 m/s, {@code FamilyService}). */
    public static final double MOVING_MIN_MPS = 0.3;
    /**
     * Vận tốc mặt đất phải lớn hơn bấy nhiêu lần sai số chuẩn (khác 0 có ý nghĩa thống kê). Hàng chục track được kiểm định lại mỗi tick trên cửa sổ trượt
     * nên 3σ báo nhầm hàng rào tổng hợp ở 6/20 seed; 4σ với {@link #MOTION_MIN_SAMPLES} = 15 và {@link #MOTION_CONFIRM_S} = 0,1 s: 0/100 (13/11/2026).
     */
    public static final double MOTION_SIGMA = 4.0;
    /** Kiểm định chuyển động phải đạt liên tục bấy lâu (s) mới bắt đầu báo track: bằng chứng độc lập theo thời gian. */
    public static final double MOTION_CONFIRM_S = 0.1;
    /** Track đang báo mà hết chuyển động liên tục lâu hơn thì thôi báo (người dừng ở lề). */
    public static final double STATIC_HOLD_S = 0.3;
    /** Thời gian bám liên tục (từ lúc mở track) để độ tin cậy lên 1. */
    public static final double CONFIRM_S = 0.1;
    /** Mất điểm lâu hơn thì bỏ track. */
    public static final double LOST_S = 0.3;
    /** Giới hạn số track đồng thời (vật lề đường); đủ thì không mở thêm. */
    public static final int MAX_TRACKS = 64;
    /** Số mẫu tối thiểu để phân loại chuyển động: ít mẫu thì phân phối t đuôi nặng, xu hướng ngẫu nhiên lọt kiểm định. */
    public static final int MOTION_MIN_SAMPLES = 15;
    /** Ước lượng tốc độ radar từ cảnh tĩnh cần ít nhất bấy nhiêu điểm, chỉ lấy điểm gần trục (cos(az)·cos(alt) lớn) để không chia cho số nhỏ. */
    public static final int EGO_SPEED_MIN_POINTS = 10;
    public static final double EGO_SPEED_MIN_COS = 0.5;

    /** Một điểm radar CARLA (rad, m/s). */
    public record Point(double depth, double azimuth, double altitude, double velocity) {
    }

    /** Ước lượng ở một tick. {@code tracked = false} thì các trường còn lại không có nghĩa. */
    public record Estimate(boolean tracked, double forward, double left, double vLeft, double confidence) {
    }

    private record Xy(double forward, double left, double residual) {
    }

    /** Hồi quy y = a + b·t: độ dốc và sai số chuẩn của nó. */
    record Fit(double slope, double stderr) {
    }

    private static final class Track {
        double forward;
        double left;
        double vForward;
        double vLeft;
        final double openedT;
        double lastSeenT;
        Double movingSinceT;
        Double staticSinceT;
        /** Lần đầu kiểm định chuyển động đạt trong chuỗi đạt liên tục hiện tại; null khi lần gần nhất không đạt. */
        Double passingSinceT;
        /** (t, ngang, phần dư Doppler trung bình, dọc) của tâm điểm đo thô trong {@link #MOTION_WINDOW_S} gần nhất. */
        final ArrayDeque<double[]> history = new ArrayDeque<>();
        List<Xy> assigned = new ArrayList<>();

        Track(double t, double forward, double left, double egoV) {
            this.forward = forward;
            this.left = left;
            this.vForward = -egoV;
            this.openedT = t;
            this.lastSeenT = t;
        }
    }

    private final List<Track> tracks = new ArrayList<>();
    private Double lastT;

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
        c.put("kind", "multi_target_static_suppressed");
        c.put("fov_deg", FOV_DEG);
        c.put("vertical_fov_deg", VERTICAL_FOV_DEG);
        c.put("range_m", RANGE_M);
        c.put("points_per_second", POINTS_PER_SECOND);
        c.put("min_altitude_deg", MIN_ALTITUDE_DEG);
        c.put("residual_min_mps", RESIDUAL_MIN_MPS);
        c.put("gate_m", GATE_M);
        c.put("merge_m", MERGE_M);
        c.put("alpha", ALPHA);
        c.put("beta", BETA);
        c.put("velocity_window_s", VELOCITY_WINDOW_S);
        c.put("velocity_min_samples", VELOCITY_MIN_SAMPLES);
        c.put("motion_window_s", MOTION_WINDOW_S);
        c.put("moving_min_mps", MOVING_MIN_MPS);
        c.put("motion_sigma", MOTION_SIGMA);
        c.put("static_hold_s", STATIC_HOLD_S);
        c.put("confirm_s", CONFIRM_S);
        c.put("lost_s", LOST_S);
        c.put("max_tracks", MAX_TRACKS);
        c.put("motion_min_samples", MOTION_MIN_SAMPLES);
        c.put("motion_confirm_s", MOTION_CONFIRM_S);
        c.put("ground_velocity", "lateral_from_position_forward_from_doppler");
        c.put("residual_ego_speed", "radar_static_median");
        c.put("ego_speed_min_points", EGO_SPEED_MIN_POINTS);
        c.put("ego_speed_min_cos", EGO_SPEED_MIN_COS);
        return c;
    }

    /** Số track đang giữ (cả tĩnh lẫn chuyển động) — chẩn đoán. */
    public int trackCount() {
        return tracks.size();
    }

    /** Một tick: điểm của lần đo mới nhất, vận tốc ego (m/s). Gọi theo thứ tự thời gian. */
    public Estimate update(double t, double egoV, List<Point> points) {
        double dt = lastT == null ? 0.0 : t - lastT;
        lastT = t;
        List<Xy> valid = toVehicleFrame(egoV, points);

        // Dự đoán rồi gán mỗi điểm cho track gần nhất trong cổng.
        for (Track tr : tracks) {
            tr.forward += tr.vForward * dt;
            tr.left += tr.vLeft * dt;
            tr.assigned = new ArrayList<>();
        }
        List<Xy> unassigned = new ArrayList<>();
        for (Xy p : valid) {
            Track best = null;
            double bestD = GATE_M;
            for (Track tr : tracks) {
                double d = Math.hypot(p.forward() - tr.forward, p.left() - tr.left);
                if (d <= bestD) {
                    bestD = d;
                    best = tr;
                }
            }
            if (best != null) {
                best.assigned.add(p);
            } else {
                unassigned.add(p);
            }
        }

        // Cập nhật: mọi điểm trong cổng, không lọc theo phần dư (gần tim làn phần dư của từng điểm lần lượt rơi dưới ngưỡng; đo 22/10).
        for (Track tr : tracks) {
            if (tr.assigned.isEmpty()) {
                continue;
            }
            double[] m = mean(tr.assigned);
            double rf = m[0] - tr.forward;
            double rl = m[1] - tr.left;
            tr.forward += ALPHA * rf;
            tr.left += ALPHA * rl;
            if (dt > 0) {
                tr.vForward += BETA * rf / dt;
                tr.vLeft += BETA * rl / dt;
            }
            tr.lastSeenT = t;
            remember(tr, t, m[1], m[2], m[0]);
        }
        tracks.removeIf(tr -> t - tr.lastSeenT > LOST_S);
        mergeDuplicates();
        openTracks(t, egoV, unassigned);
        for (Track tr : tracks) {
            classify(tr, t);
        }

        Track chosen = null;
        for (Track tr : tracks) {
            if (tr.movingSinceT != null && tr.forward > 0 && (chosen == null || tr.forward < chosen.forward)) {
                chosen = tr;
            }
        }
        if (chosen == null) {
            return new Estimate(false, 0.0, 0.0, 0.0, 0.0);
        }
        // Độ tin cậy theo thời gian bám liên tục kể từ lúc mở track (như bản một mục tiêu); kiểm định chuyển động là điều kiện riêng để được báo.
        double confirm = Math.min(1.0, (t - chosen.openedT + 1e-9) / CONFIRM_S);
        double fade = Math.max(0.0, 1.0 - (t - chosen.lastSeenT) / LOST_S);
        return new Estimate(true, chosen.forward, chosen.left, outputVLeft(chosen, t), confirm * fade);
    }

    private static boolean usable(Point p, double minAlt) {
        return p.altitude() >= minAlt && Math.abs(p.velocity()) <= MAX_SPEED_MPS && p.depth() > 0 && p.depth() <= RANGE_M;
    }

    /**
     * Tốc độ của chính radar ước lượng từ cảnh tĩnh: trung vị của {@code −v_r / (cos(az)·cos(alt))} trên mọi điểm của lần đo. Đa số điểm là vật tĩnh nên
     * trung vị là tốc độ cảm biến <b>đúng thời điểm đo</b>. Đo trên CARLA 13/11/2026: tốc độ ego dao động răng cưa từng tick và lệch pha với lần đo radar,
     * nên dùng {@code egoV} của tick làm phần dư của mọi điểm lệch cùng một lượng (độ lệch chuẩn 0,34 m/s, 89% điểm vượt {@link #RESIDUAL_MIN_MPS}); trừ
     * theo tốc độ ước lượng còn 0,05 m/s và 0,3%. Ít hơn {@link #EGO_SPEED_MIN_POINTS} điểm thì dùng {@code egoV}.
     */
    static double sensorSpeed(double egoV, List<Point> points) {
        double minAlt = Math.toRadians(MIN_ALTITUDE_DEG);
        List<Double> speeds = new ArrayList<>();
        for (Point p : points) {
            double c = Math.cos(p.azimuth()) * Math.cos(p.altitude());
            if (usable(p, minAlt) && c > EGO_SPEED_MIN_COS) {
                speeds.add(-p.velocity() / c);
            }
        }
        if (speeds.size() < EGO_SPEED_MIN_POINTS) {
            return egoV;
        }
        speeds.sort(null);
        int n = speeds.size();
        return n % 2 == 1 ? speeds.get(n / 2) : (speeds.get(n / 2 - 1) + speeds.get(n / 2)) / 2;
    }

    private static List<Xy> toVehicleFrame(double egoV, List<Point> points) {
        List<Xy> valid = new ArrayList<>();
        double minAlt = Math.toRadians(MIN_ALTITUDE_DEG);
        double sensorV = sensorSpeed(egoV, points);
        for (Point p : points) {
            if (!usable(p, minAlt)) {
                continue;
            }
            double horizontal = p.depth() * Math.cos(p.altitude());
            double fwd = horizontal * Math.cos(p.azimuth());
            if (fwd <= 0) {
                continue;
            }
            double residual = p.velocity() + sensorV * Math.cos(p.azimuth()) * Math.cos(p.altitude());
            valid.add(new Xy(fwd, -horizontal * Math.sin(p.azimuth()), residual));
        }
        return valid;
    }

    /** Mở track từ cụm điểm chưa gán có phần dư đủ lớn, điểm gần nhất trước. */
    private void openTracks(double t, double egoV, List<Xy> unassigned) {
        List<Xy> seeds = new ArrayList<>();
        for (Xy p : unassigned) {
            if (Math.abs(p.residual()) >= RESIDUAL_MIN_MPS) {
                seeds.add(p);
            }
        }
        seeds.sort((a, b) -> Double.compare(a.forward(), b.forward()));
        boolean[] used = new boolean[seeds.size()];
        for (int i = 0; i < seeds.size() && tracks.size() < MAX_TRACKS; i++) {
            if (used[i]) {
                continue;
            }
            Xy seed = seeds.get(i);
            List<Xy> cluster = new ArrayList<>();
            for (int j = i; j < seeds.size(); j++) {
                Xy p = seeds.get(j);
                if (!used[j] && Math.hypot(p.forward() - seed.forward(), p.left() - seed.left()) <= GATE_M) {
                    used[j] = true;
                    cluster.add(p);
                }
            }
            double[] m = mean(cluster);
            Track tr = new Track(t, m[0], m[1], egoV);
            remember(tr, t, m[1], m[2], m[0]);
            tracks.add(tr);
        }
    }

    /** Hai track bám cùng một vật (cổng chồng nhau): giữ track mở trước, nó có lịch sử dài hơn. */
    private void mergeDuplicates() {
        tracks.sort((a, b) -> Double.compare(a.openedT, b.openedT));
        List<Track> kept = new ArrayList<>();
        for (Track tr : tracks) {
            boolean duplicate = false;
            for (Track k : kept) {
                if (Math.hypot(tr.forward - k.forward, tr.left - k.left) < MERGE_M) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                kept.add(tr);
            }
        }
        tracks.clear();
        tracks.addAll(kept);
    }

    /** Chuyển động nếu vận tốc mặt đất đủ lớn và khác 0 có ý nghĩa; báo tiếp tới khi hết chuyển động liên tục {@link #STATIC_HOLD_S}. */
    private static void classify(Track tr, double t) {
        boolean moving = false;
        if (tr.history.size() >= MOTION_MIN_SAMPLES) {
            Fit l = fit(tr.history, 1, Double.NEGATIVE_INFINITY);
            double[] f = l == null ? null : dopplerForward(tr.history, l.slope());
            if (f != null) {
                double speed = Math.hypot(f[0], l.slope());
                // gL dùng chung cho mọi mẫu của gF nên sai số của nó lan sang gF theo hệ số trung bình left/fwd (lớn với vật sát bên xe).
                double se = Math.hypot(Math.hypot(f[1], l.stderr() * Math.abs(f[2])), l.stderr());
                moving = speed >= MOVING_MIN_MPS && speed >= MOTION_SIGMA * se;
            }
        }
        if (moving) {
            tr.staticSinceT = null;
            if (tr.passingSinceT == null) {
                tr.passingSinceT = t;
            }
            // Vào trạng thái chuyển động chỉ khi kiểm định đạt liên tục MOTION_CONFIRM_S: bằng chứng độc lập theo thời gian, chống báo nhầm khi
            // hàng chục track được kiểm định lại mỗi tick trên cửa sổ trượt.
            if (tr.movingSinceT == null && t - tr.passingSinceT >= MOTION_CONFIRM_S - 1e-9) {
                tr.movingSinceT = t;
            }
        } else if (tr.movingSinceT == null) {
            tr.passingSinceT = null;
        } else {
            tr.passingSinceT = null;
            if (tr.staticSinceT == null) {
                tr.staticSinceT = t;
            }
            if (t - tr.staticSinceT >= STATIC_HOLD_S) {
                tr.movingSinceT = null;
                tr.staticSinceT = null;
            }
        }
    }

    private static void remember(Track tr, double t, double left, double residual, double forward) {
        tr.history.addLast(new double[] {t, left, residual, forward});
        while (t - tr.history.peekFirst()[0] > MOTION_WINDOW_S + 1e-9) {
            tr.history.removeFirst();
        }
    }

    /** Vận tốc ngang đầu ra: hồi quy trên {@link #VELOCITY_WINDOW_S} gần nhất; thiếu mẫu thì vận tốc của bộ lọc alpha–beta. */
    private static double outputVLeft(Track tr, double t) {
        Fit l = fit(tr.history, 1, t - VELOCITY_WINDOW_S - 1e-9);
        return l != null ? l.slope() : tr.vLeft;
    }

    /** Hồi quy bình phương tối thiểu cột {@code column} theo t trên các mẫu có t ≥ {@code fromT}; null khi thiếu mẫu hoặc t không đổi. */
    static Fit fit(Iterable<double[]> samples, int column, double fromT) {
        int n = 0;
        double st = 0;
        double sy = 0;
        for (double[] h : samples) {
            if (h[0] >= fromT) {
                n++;
                st += h[0];
                sy += h[column];
            }
        }
        if (n < VELOCITY_MIN_SAMPLES) {
            return null;
        }
        double mt = st / n;
        double my = sy / n;
        double cov = 0;
        double var = 0;
        for (double[] h : samples) {
            if (h[0] >= fromT) {
                cov += (h[0] - mt) * (h[column] - my);
                var += (h[0] - mt) * (h[0] - mt);
            }
        }
        if (var <= 1e-12) {
            return null;
        }
        double slope = cov / var;
        double sse = 0;
        for (double[] h : samples) {
            if (h[0] >= fromT) {
                double e = h[column] - (my + slope * (h[0] - mt));
                sse += e * e;
            }
        }
        double stderr = n > 2 ? Math.sqrt(sse / (n - 2) / var) : Double.POSITIVE_INFINITY;
        return new Fit(slope, stderr);
    }

    private static double[] mean(List<Xy> points) {
        double f = 0;
        double l = 0;
        for (Xy p : points) {
            f += p.forward();
            l += p.left();
        }
        double r = 0;
        for (Xy p : points) {
            r += p.residual();
        }
        return new double[] {f / points.size(), l / points.size(), r / points.size()};
    }

    /**
     * Vận tốc mặt đất <b>dọc</b> của track từ Doppler: phần dư Doppler là thành phần xuyên tâm của vận tốc mặt đất,
     * {@code r = (gF·fwd + gL·left) / range} ⇒ {@code gF = (r·range − gL·left) / fwd}, với {@code gL} từ hồi quy vị trí ngang. Trả {trung bình, sai số chuẩn, left/fwd trung bình}
     * trên cửa sổ và hệ số left/fwd trung bình (để lan truyền sai số của gL); null khi thiếu mẫu. Đo trên CARLA 13/11/2026: tâm cụm điểm trên thân người dao động dọc 0,1–0,17 m nên vận tốc dọc từ vị trí nhiễu, còn
     * Doppler của người đi bộ khớp vận tốc thật trong 0,03 m/s; track trôi dọc một vật dài (hàng rào) có vận tốc vị trí giả nhưng Doppler ≈ 0.
     */
    static double[] dopplerForward(Iterable<double[]> history, double gL) {
        List<Double> values = new ArrayList<>();
        double ratio = 0;
        for (double[] h : history) {
            if (h[3] > 1.0) {
                values.add((h[2] * Math.hypot(h[3], h[1]) - gL * h[1]) / h[3]);
                ratio += h[1] / h[3];
            }
        }
        int n = values.size();
        if (n < MOTION_MIN_SAMPLES) {
            return null;
        }
        double mean = 0;
        for (double v : values) {
            mean += v;
        }
        mean /= n;
        double var = 0;
        for (double v : values) {
            var += (v - mean) * (v - mean);
        }
        return new double[] {mean, Math.sqrt(var / (n - 1) / n), ratio / n};
    }
}
