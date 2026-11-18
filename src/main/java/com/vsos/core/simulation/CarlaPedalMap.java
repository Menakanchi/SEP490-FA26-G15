package com.vsos.core.simulation;

import java.util.Map;

/**
 * Hiệu chuẩn bàn đạp phanh CARLA theo xe (ADR-054): đổi lệnh giảm tốc AEB ra bàn đạp theo số đo thật thay cho giả định "bàn đạp tỉ lệ tuyến tính
 * với giảm tốc, 1,0 ứng với phanh 100%".
 *
 * <p>Đo 16/11/2026 bằng carla-ped-bench đợt 3 (nhóm D1, 170 run, lệnh phanh cố định, CARLA 0.9.16 Windows, Town04 road 40): với e-tron
 * mô-men 1800 N·m, giảm tốc ổn định thấp hơn mức đích một lượng gần như không đổi ≈ 0,45–0,5 m/s² ở mọi tốc độ (vùng chết bàn đạp ≈ 0,05),
 * còn đổi theo tốc độ: ở 40–45 km/h bàn đạp lớn cho tới 10,3–10,6 m/s², trên 80 km/h bàn đạp nhỏ được thêm lực cản gió.
 * Bước 1 dùng hồi quy tuyến tính {@code a_đo ≈ 1,032 · a_đích − 0,512}; bước 2 (bản này) dùng thẳng bảng đo: mỗi tốc độ 30–100 km/h (bước 5) một
 * hàng {bàn đạp, giảm tốc đo được}, nội suy tuyến tính theo giảm tốc rồi theo tốc độ. Kiểm leave-one-out 97 điểm giữa hàng: RMS 0,073 m/s²
 * (tuyến tính bước 1: 0,198; giả định cũ {@code a / a_100%}: lệch −0,27 ± 0,37 m/s² trên các điểm của bảng).
 *
 * <p>Bảng chỉ đúng cho đúng cấu hình đã đo (blueprint, mô-men phanh, phanh 100%); xe khác hoặc đổi mô-men thì trả null và adapter giữ giả định
 * tuyến tính cho tới khi đo lại. Lõi chỉ dùng JDK, không gọi CARLA.
 */
public final class CarlaPedalMap {

    /** Cấu hình đã đo của e-tron (ADR-051 + đợt 3 carla-ped-bench). */
    static final String ETRON_BLUEPRINT = "vehicle.audi.etron";
    static final double ETRON_BRAKE_TORQUE_NM = 1800.0;
    static final double ETRON_FULL_BRAKE_DECEL = 9.13;
    /** Bàn đạp ứng với giảm tốc 0 (vùng chết) theo hồi quy bước 1: 0,512 / (1,032 · 9,13). Dùng nội suy dưới điểm đo nhỏ nhất của hàng. */
    static final double ETRON_DEADZONE_PEDAL = 0.512 / (1.032 * ETRON_FULL_BRAKE_DECEL);

    private static final double[] SPEEDS_KMH = {30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100};
    /** Mỗi hàng: các cặp {bàn đạp, giảm tốc đo được m/s²} theo bàn đạp tăng dần (đợt 3 D1, a_dải, 16/11/2026). */
    private static final double[][][] POINTS = {
        {{0.1095, 0.524}, {0.2191, 1.492}, {0.3286, 2.452}, {0.4381, 3.473}},  // 30 km/h
        {{0.1095, 0.539}, {0.2191, 1.529}, {0.3286, 2.515}, {0.4381, 3.521}, {0.5476, 4.793}, {0.6572, 6.696}},  // 35 km/h
        {{0.1095, 0.547}, {0.2191, 1.541}, {0.3286, 2.530}, {0.4381, 3.533}, {0.5476, 4.646}, {0.6572, 6.104}, {0.7667, 7.693}, {0.8762, 10.256}},  // 40 km/h
        {{0.1095, 0.574}, {0.2191, 1.547}, {0.3286, 2.541}, {0.4381, 3.541}, {0.5476, 4.598}, {0.6572, 5.747}, {0.7667, 7.071}, {0.8762, 8.784}, {0.9858, 10.596}},  // 45 km/h
        {{0.1095, 0.624}, {0.2191, 1.552}, {0.3286, 2.547}, {0.4381, 3.546}, {0.5476, 4.580}, {0.6572, 5.657}, {0.7667, 6.852}, {0.8762, 8.088}, {0.9858, 9.663}, {1.0000, 9.822}},  // 50 km/h
        {{0.1095, 0.683}, {0.2191, 1.557}, {0.3286, 2.552}, {0.4381, 3.549}, {0.5476, 4.571}, {0.6572, 5.623}, {0.7667, 6.745}, {0.8762, 7.891}, {0.9858, 9.129}, {1.0000, 9.290}},  // 55 km/h
        {{0.1095, 0.746}, {0.2191, 1.568}, {0.3286, 2.557}, {0.4381, 3.556}, {0.5476, 4.570}, {0.6572, 5.608}, {0.7667, 6.693}, {0.8762, 7.853}, {0.9858, 8.958}, {1.0000, 9.117}},  // 60 km/h
        {{0.1095, 0.810}, {0.2191, 1.594}, {0.3286, 2.562}, {0.4381, 3.560}, {0.5476, 4.570}, {0.6572, 5.600}, {0.7667, 6.663}, {0.8762, 7.740}, {0.9858, 8.856}, {1.0000, 8.980}},  // 65 km/h
        {{0.2191, 1.631}, {0.3286, 2.572}, {0.4381, 3.566}, {0.5476, 4.575}, {0.6572, 5.597}, {0.7667, 6.645}, {0.8762, 7.724}, {0.9858, 8.761}, {1.0000, 8.952}},  // 70 km/h
        {{0.2191, 1.674}, {0.3286, 2.591}, {0.4381, 3.572}, {0.5476, 4.579}, {0.6572, 5.596}, {0.7667, 6.637}, {0.8762, 7.680}, {0.9858, 8.751}, {1.0000, 8.924}},  // 75 km/h
        {{0.2191, 1.721}, {0.3286, 2.620}, {0.4381, 3.584}, {0.5476, 4.583}, {0.6572, 5.599}, {0.7667, 6.626}, {0.8762, 7.676}, {0.9858, 8.724}, {1.0000, 8.860}},  // 80 km/h
        {{0.2191, 1.771}, {0.3286, 2.655}, {0.4381, 3.605}, {0.5476, 4.593}, {0.6572, 5.602}, {0.7667, 6.629}, {0.8762, 7.658}, {0.9858, 8.702}, {1.0000, 8.837}},  // 85 km/h
        {{0.3286, 2.693}, {0.4381, 3.632}, {0.5476, 4.609}, {0.6572, 5.616}, {0.7667, 6.630}, {0.8762, 7.661}, {0.9858, 8.678}, {1.0000, 8.802}},  // 90 km/h
        {{0.3286, 2.735}, {0.4381, 3.665}, {0.5476, 4.632}, {0.6572, 5.623}, {0.7667, 6.631}, {0.8762, 7.665}, {0.9858, 8.679}, {1.0000, 8.815}},  // 95 km/h
        {{0.3286, 2.779}, {0.4381, 3.700}, {0.5476, 4.660}, {0.6572, 5.648}, {0.7667, 6.646}, {0.8762, 7.664}, {0.9858, 8.681}, {1.0000, 8.813}},  // 100 km/h
    };

    private final String id;

    private CarlaPedalMap(String id) {
        this.id = id;
    }

    /** Tên bảng ghi vào {@code result.json} để biết run dùng hiệu chuẩn nào. */
    public String id() {
        return id;
    }

    /**
     * Bảng của xe nếu xe khớp đúng cấu hình đã đo: blueprint, mô-men phanh mọi bánh trong {@code .xosc} và giảm tốc phanh 100% controller dùng.
     * Không khớp thì null (giữ giả định tuyến tính).
     */
    public static CarlaPedalMap forVehicle(Map<String, Object> vehicleCarla, double fullBrakeDecel) {
        if (vehicleCarla == null || !ETRON_BLUEPRINT.equals(vehicleCarla.get("blueprint"))) {
            return null;
        }
        Double torque = wheelBrakeTorque(vehicleCarla);
        if (torque == null || Math.abs(torque - ETRON_BRAKE_TORQUE_NM) > 1e-6 || Math.abs(fullBrakeDecel - ETRON_FULL_BRAKE_DECEL) > 1e-9) {
            return null;
        }
        return new CarlaPedalMap("etron-1800nm-2026-11-16");
    }

    /**
     * Bàn đạp feed-forward [0, 1] cho lệnh giảm tốc {@code decelCmd} (m/s²) ở tốc độ {@code speedMps}. Lệnh ≤ 0 → 0. Tốc độ ngoài 30–100 km/h dùng
     * hàng gần nhất (dưới 6 m/s adapter đặt tốc độ thay bàn đạp, ADR-053).
     */
    public double feedForward(double decelCmd, double speedMps) {
        if (decelCmd <= 0) {
            return 0.0;
        }
        double kmh = Math.max(SPEEDS_KMH[0], Math.min(SPEEDS_KMH[SPEEDS_KMH.length - 1], speedMps * 3.6));
        int hi = 1;
        while (hi < SPEEDS_KMH.length - 1 && SPEEDS_KMH[hi] < kmh) {
            hi++;
        }
        int lo = hi - 1;
        double w = (kmh - SPEEDS_KMH[lo]) / (SPEEDS_KMH[hi] - SPEEDS_KMH[lo]);
        return clamp(rowPedal(POINTS[lo], decelCmd) * (1 - w) + rowPedal(POINTS[hi], decelCmd) * w);
    }

    /** Bàn đạp cho giảm tốc {@code a} trong một hàng: nội suy giữa hai điểm kề; dưới điểm nhỏ nhất nội suy từ vùng chết; trên điểm lớn nhất ngoại suy. */
    static double rowPedal(double[][] row, double a) {
        if (a <= row[0][1]) {
            return ETRON_DEADZONE_PEDAL + (row[0][0] - ETRON_DEADZONE_PEDAL) * a / row[0][1];
        }
        for (int i = 1; i < row.length; i++) {
            if (a <= row[i][1]) {
                return lerp(row[i - 1], row[i], a);
            }
        }
        int n = row.length;
        return row[n - 1][0] >= 1.0 ? 1.0 : lerp(row[n - 2], row[n - 1], a);
    }

    private static double lerp(double[] p0, double[] p1, double a) {
        return p0[0] + (p1[0] - p0[0]) * (a - p0[1]) / (p1[1] - p0[1]);
    }

    private static double clamp(double pedal) {
        return Math.max(0.0, Math.min(1.0, pedal));
    }

    private static Double wheelBrakeTorque(Map<String, Object> vehicleCarla) {
        if (vehicleCarla.get("physics") instanceof Map<?, ?> physics && physics.get("wheels") instanceof Map<?, ?> wheels
                && wheels.get("max_brake_torque") instanceof Number n) {
            return n.doubleValue();
        }
        return null;
    }
}
