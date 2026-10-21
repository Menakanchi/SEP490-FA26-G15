package com.vehicsim.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Bộ lọc gia tốc 10 Hz trước khi tính jerk (kế hoạch 20/10, D3) — port 1:1 từ {@code worker/vehicsim_core/filters.py} (ADR-042).
 *
 * <p>Đây là **một** cách cài đặt D3, chưa phải objective chính thức. Bộ lọc là Butterworth bậc 2 chạy một chiều (causal, có trễ pha), nên số jerk đã
 * lọc **không** tuân theo Euro NCAP AEB/LSS VRU v4.5.1 mục 4.4.1.2 ("12-pole phaseless Butterworth filter with a cut off frequency of 10Hz").
 * Việc đó là phần định nghĩa pha phanh/nguồn gia tốc của kế hoạch 20/10, làm sau khi port.</p>
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
