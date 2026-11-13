package com.vsos.core.aeb;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.core.common.Py;

/**
 * Bộ lọc gia tốc 10 Hz trước khi tính jerk (kế hoạch 20/10, D3) — port 1:1 từ {@code worker/vehicsim_core/filters.py} (ADR-042).
 *
 * <p>{@link #butterworthLowpass2}/{@link #filteredRmsJerk}/{@link #SPEC}: bản thử D3 (Butterworth bậc 2 một chiều, có trễ pha), không theo Euro NCAP;
 * chỉ còn cho file CARLA ≤ v5 chạy lại ra đúng kết quả đã lưu. Từ CARLA v6 (13/11/2026) {@code rms_jerk_mps3} dùng bộ lọc đúng Euro NCAP AEB/LSS VRU
 * v4.5.1 mục 4.4.1.2 ({@link #butterworthZeroPhase}, {@link #EURO_NCAP_SPEC}) với cửa sổ từ T_AEB ({@link #tAebIndex}).</p>
 */
public final class Filters {

    /** Đặc tả bộ lọc ghi kèm kết quả. */
    public static final Map<String, Object> SPEC = specMap();

    private Filters() {
    }

    private static Map<String, Object> specMap() {
        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("type", "butterworth");
        spec.put("order", 2);
        spec.put("cutoff_hz", 10.0);
        spec.put("causal", true);
        spec.put("init", "first sample (DC steady state)");
        return java.util.Collections.unmodifiableMap(spec);
    }

    /** Butterworth bậc 2 thông thấp, chỉ chạy xuôi, qua biến đổi song tuyến có tiền biến dạng tần số. Trạng thái đầu = mẫu đầu tiên. */
    public static List<Double> butterworthLowpass2(List<Double> samples, double dt, double cutoffHz) {
        if (!(0 < cutoffHz && cutoffHz < 0.5 / dt)) {
            throw new IllegalArgumentException("cutoff " + Py.repr(cutoffHz) + " Hz phải nằm dưới tần số Nyquist " + Py.repr(0.5 / dt) + " Hz của bước "
                    + Py.repr(dt) + " s");
        }
        if (samples.isEmpty()) {
            return List.of();
        }
        double wc = StrictMath.tan(Math.PI * cutoffHz * dt);
        double k = Math.sqrt(2.0) * wc;
        double norm = 1.0 + k + wc * wc;
        double b0 = wc * wc / norm;
        double b1 = 2.0 * b0;
        double a1 = 2.0 * (wc * wc - 1.0) / norm;
        double a2 = (1.0 - k + wc * wc) / norm;
        double x1 = samples.get(0);
        double x2 = x1;
        double y1 = x1;
        double y2 = x1;
        List<Double> out = new ArrayList<>(samples.size());
        for (double x : samples) {
            double y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
            out.add(y);
            x2 = x1;
            x1 = x;
            y2 = y1;
            y1 = y;
        }
        return out;
    }

    // ---- Euro NCAP AEB/LSS VRU Test Protocol v4.5.1 (chốt 13/11/2026, CARLA v6) ------------------------------------------------------------

    /** Bậc của mỗi lượt: "12-pole phaseless" theo quy ước SAE J211 = bộ lọc 6 cực chạy xuôi rồi ngược (6 × 2 = 12 cực, pha bằng 0). */
    public static final int EURO_NCAP_ORDER_PER_PASS = 6;
    public static final double EURO_NCAP_CUTOFF_HZ = 10.0;
    /** Ngưỡng định nghĩa T_AEB (mục 2): lần cuối gia tốc đã lọc xuống dưới −1 m/s², lùi về lúc vượt −0,3 m/s². */
    public static final double T_AEB_LOW_MPS2 = -1.0;
    public static final double T_AEB_HIGH_MPS2 = -0.3;

    /** Đặc tả bộ lọc Euro NCAP ghi kèm kết quả v6. */
    public static final Map<String, Object> EURO_NCAP_SPEC = euroNcapSpec();

    private static Map<String, Object> euroNcapSpec() {
        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("type", "butterworth");
        spec.put("standard", "Euro NCAP AEB/LSS VRU Test Protocol v4.5.1, 4.4.1.2 (12-pole phaseless, 10 Hz)");
        spec.put("order_per_pass", EURO_NCAP_ORDER_PER_PASS);
        spec.put("passes", "forward + backward (zero phase)");
        spec.put("cutoff_hz", EURO_NCAP_CUTOFF_HZ);
        spec.put("cutoff_interpretation", "design cutoff of each pass; combined response -6 dB at 10 Hz");
        spec.put("edges", "odd reflection padding, 3 x (order + 1) samples");
        spec.put("t_aeb", "last crossing below -1 m/s2, back to the -0.3 m/s2 crossing (protocol section 2)");
        return java.util.Collections.unmodifiableMap(spec);
    }

    /**
     * Butterworth thông thấp bậc {@code order} (chẵn), pha bằng 0: chạy xuôi rồi ngược qua các tầng biquad (biến đổi song tuyến có tiền biến dạng tần số).
     * Hai biên đệm phản xạ lẻ ({@code 2·x0 − x[i]}) để giảm quá độ, như {@code scipy.signal.filtfilt}; mỗi lượt khởi đầu ở trạng thái DC của mẫu đầu.
     */
    public static List<Double> butterworthZeroPhase(List<Double> samples, double dt, double cutoffHz, int order) {
        if (order <= 0 || order % 2 != 0) {
            throw new IllegalArgumentException("bậc bộ lọc phải chẵn và dương: " + order);
        }
        if (!(0 < cutoffHz && cutoffHz < 0.5 / dt)) {
            throw new IllegalArgumentException("cutoff " + Py.repr(cutoffHz) + " Hz phải nằm dưới tần số Nyquist " + Py.repr(0.5 / dt) + " Hz của bước "
                    + Py.repr(dt) + " s");
        }
        int n = samples.size();
        if (n == 0) {
            return List.of();
        }
        int pad = Math.min(3 * (order + 1), n - 1);
        double[] x = new double[n + 2 * pad];
        double first = samples.get(0);
        double last = samples.get(n - 1);
        for (int i = 0; i < pad; i++) {
            x[i] = 2 * first - samples.get(pad - i);
            x[n + pad + i] = 2 * last - samples.get(n - 2 - i);
        }
        for (int i = 0; i < n; i++) {
            x[pad + i] = samples.get(i);
        }
        double[] y = cascade(x, dt, cutoffHz, order);
        reverse(y);
        y = cascade(y, dt, cutoffHz, order);
        reverse(y);
        List<Double> out = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            out.add(y[pad + i]);
        }
        return out;
    }

    /** Một lượt xuôi qua {@code order/2} tầng biquad Butterworth; Q của tầng k là 1 / (2·cos θ_k), θ_k = π(2k − 1)/(2·order). */
    private static double[] cascade(double[] x, double dt, double cutoffHz, int order) {
        double[] y = x.clone();
        double wc = StrictMath.tan(Math.PI * cutoffHz * dt);
        for (int k = 1; k <= order / 2; k++) {
            double q = 1.0 / (2.0 * Math.cos(Math.PI * (2 * k - 1) / (2.0 * order)));
            double norm = 1.0 + wc / q + wc * wc;
            double b0 = wc * wc / norm;
            double b1 = 2.0 * b0;
            double a1 = 2.0 * (wc * wc - 1.0) / norm;
            double a2 = (1.0 - wc / q + wc * wc) / norm;
            double x1 = y[0];
            double x2 = x1;
            double y1 = x1;
            double y2 = x1;
            for (int i = 0; i < y.length; i++) {
                double xi = y[i];
                double yi = b0 * xi + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
                x2 = x1;
                x1 = xi;
                y2 = y1;
                y1 = yi;
                y[i] = yi;
            }
        }
        return y;
    }

    private static void reverse(double[] a) {
        for (int i = 0, j = a.length - 1; i < j; i++, j--) {
            double t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
    }

    /**
     * Chỉ số khung T_AEB trên gia tốc đã lọc (Euro NCAP mục 2): lần cuối tín hiệu vượt xuống dưới {@link #T_AEB_LOW_MPS2}, rồi lùi về khung đầu tiên của
     * đoạn đó đã ở dưới {@link #T_AEB_HIGH_MPS2}. {@code -1} nếu gia tốc không bao giờ xuống dưới −1 m/s² (không phanh).
     */
    public static int tAebIndex(List<Double> filteredAccel) {
        int cross = -1;
        for (int i = 0; i < filteredAccel.size(); i++) {
            boolean below = filteredAccel.get(i) < T_AEB_LOW_MPS2;
            boolean wasAbove = i == 0 || filteredAccel.get(i - 1) >= T_AEB_LOW_MPS2;
            if (below && wasAbove) {
                cross = i;
            }
        }
        if (cross < 0) {
            return -1;
        }
        int j = cross;
        while (j > 0 && filteredAccel.get(j - 1) < T_AEB_HIGH_MPS2) {
            j--;
        }
        return j;
    }

    /** RMS của jerk (Δa_lọc/dt) trên gia tốc đã lọc theo Euro NCAP, từ khung {@code start} tới hết; {@code null} nếu {@code start} ngoài chuỗi. */
    public static Double rmsJerk(List<Double> filteredAccel, int start, double dt) {
        if (start < 0 || start >= filteredAccel.size()) {
            return null;
        }
        double total = 0.0;
        int count = 0;
        for (int i = start; i < filteredAccel.size(); i++) {
            double before = i > 0 ? filteredAccel.get(i - 1) : filteredAccel.get(0);
            double jerk = (filteredAccel.get(i) - before) / dt;
            total += jerk * jerk;
            count++;
        }
        return Math.sqrt(total / count);
    }

    /** RMS của Δa_lọc/dt từ khung {@code start} tới hết; {@code null} nếu không có khung nào. Lọc cả chuỗi rồi mới cắt pha phanh. */
    public static Double filteredRmsJerk(List<Double> accel, int start, double dt, double cutoffHz) {
        if (start < 0 || start >= accel.size()) {
            return null;
        }
        List<Double> smooth = butterworthLowpass2(accel, dt, cutoffHz);
        double total = 0.0;
        int count = 0;
        for (int i = start; i < smooth.size(); i++) {
            double before = i > 0 ? smooth.get(i - 1) : smooth.get(0);
            double jerk = (smooth.get(i) - before) / dt;
            total += jerk * jerk;
            count++;
        }
        return Math.sqrt(total / count);
    }
}
