package com.vsos.core.simulation;

import java.util.List;
import java.util.Map;

/**
 * Hiệu chuẩn bàn đạp phanh CARLA theo xe: đổi lệnh giảm tốc AEB ra bàn đạp theo số đo thật thay cho giả định "bàn đạp tỉ lệ tuyến tính với giảm tốc,
 * 1,0 ứng với phanh 100%".
 *
 * <p>Mỗi xe một bảng: mỗi tốc độ (bước 5 km/h) một hàng {bàn đạp, giảm tốc đo được}, nội suy tuyến tính theo giảm tốc rồi theo tốc độ; dưới điểm đo nhỏ nhất
 * nội suy từ vùng chết, trên điểm lớn nhất ngoại suy và kẹp [0, 1]; ngoài dải tốc độ của bảng dùng hàng gần nhất. Số đo bằng carla-ped-bench (lệnh phanh
 * cố định, CARLA 0.9.16 Windows, Town04 road 40):
 * <ul>
 *   <li>e-tron 1800 N·m — đợt 3 (D1, 16/11/2026, 30–100 km/h), ADR-054: leave-one-out RMS 0,073 m/s² (giả định cũ lệch −0,27 ± 0,37).</li>
 *   <li>Model 3 1750 N·m, Patrol 2250 N·m, Sprinter 2250 N·m — đợt 4 (P1, 22/11/2026, 30–80 km/h), ADR-059: leave-one-out RMS 0,047 / 0,197 / 0,166 m/s²
 *   (giả định cũ RMS 0,34 / 1,23 / 0,78).</li>
 * </ul>
 *
 * <p>Bảng chỉ đúng cho đúng cấu hình đã đo (blueprint, mô-men phanh mọi bánh, phanh 100%); xe khác hoặc đổi mô-men thì trả null và adapter giữ giả định
 * tuyến tính cho tới khi đo lại. Lõi chỉ dùng JDK, không gọi CARLA.
 */
public final class CarlaPedalMap {

    /** Cấu hình đã đo của e-tron (ADR-051 + đợt 3 carla-ped-bench). */
    static final String ETRON_BLUEPRINT = "vehicle.audi.etron";
    static final double ETRON_BRAKE_TORQUE_NM = 1800.0;
    static final double ETRON_FULL_BRAKE_DECEL = 9.13;
    /** Bàn đạp ứng với giảm tốc 0 (vùng chết) theo hồi quy: 0,512 / (1,032 · 9,13). */
    static final double ETRON_DEADZONE_PEDAL = 0.512 / (1.032 * ETRON_FULL_BRAKE_DECEL);

    private static final double[] ETRON_SPEEDS_KMH = {30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100};
    /** Mỗi hàng: các cặp {bàn đạp, giảm tốc đo được m/s²} theo bàn đạp tăng dần (a_dải). */
    private static final double[][][] ETRON_POINTS = {
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

    private static final double[] MODEL3_SPEEDS_KMH = {30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80};
    private static final double[][][] MODEL3_POINTS = {
        {{0.1013, 0.542}, {0.2026, 1.521}, {0.3040, 2.488}, {0.4053, 3.549}},  // 30 km/h
        {{0.1013, 0.558}, {0.2026, 1.565}, {0.3040, 2.566}, {0.4053, 3.593}, {0.5066, 4.774}, {0.6079, 6.413}},  // 35 km/h
        {{0.1013, 0.565}, {0.2026, 1.578}, {0.3040, 2.588}, {0.4053, 3.614}, {0.5066, 4.690}, {0.6079, 5.927}, {0.7092, 7.289}, {0.8105, 9.022}},  // 40 km/h
        {{0.1013, 0.589}, {0.2026, 1.585}, {0.3040, 2.597}, {0.4053, 3.618}, {0.5066, 4.667}, {0.6079, 5.798}, {0.7092, 7.068}, {0.8105, 8.303}, {0.9119, 9.593}, {1.0000, 10.929}},  // 45 km/h
        {{0.1013, 0.638}, {0.2026, 1.590}, {0.3040, 2.604}, {0.4053, 3.622}, {0.5066, 4.659}, {0.6079, 5.735}, {0.7092, 6.846}, {0.8105, 8.029}, {0.9119, 9.184}, {1.0000, 10.220}},  // 50 km/h
        {{0.1013, 0.694}, {0.2026, 1.593}, {0.3040, 2.608}, {0.4053, 3.624}, {0.5066, 4.655}, {0.6079, 5.716}, {0.7092, 6.795}, {0.8105, 7.913}, {0.9119, 9.021}, {1.0000, 10.011}},  // 55 km/h
        {{0.1013, 0.755}, {0.2026, 1.603}, {0.3040, 2.612}, {0.4053, 3.629}, {0.5066, 4.657}, {0.6079, 5.699}, {0.7092, 6.768}, {0.8105, 7.862}, {0.9119, 9.000}, {1.0000, 9.893}},  // 60 km/h
        {{0.1013, 0.819}, {0.2026, 1.626}, {0.3040, 2.617}, {0.4053, 3.634}, {0.5066, 4.659}, {0.6079, 5.701}, {0.7092, 6.753}, {0.8105, 7.829}, {0.9119, 8.893}, {1.0000, 9.865}},  // 65 km/h
        {{0.2026, 1.661}, {0.3040, 2.624}, {0.4053, 3.638}, {0.5066, 4.661}, {0.6079, 5.701}, {0.7092, 6.754}, {0.8105, 7.796}, {0.9119, 8.844}, {1.0000, 9.783}},  // 70 km/h
        {{0.2026, 1.702}, {0.3040, 2.642}, {0.4053, 3.644}, {0.5066, 4.667}, {0.6079, 5.698}, {0.7092, 6.742}, {0.8105, 7.787}, {0.9119, 8.838}, {1.0000, 9.753}},  // 75 km/h
        {{0.2026, 1.747}, {0.3040, 2.669}, {0.4053, 3.654}, {0.5066, 4.670}, {0.6079, 5.703}, {0.7092, 6.746}, {0.8105, 7.786}, {0.9119, 8.819}, {1.0000, 9.734}},  // 80 km/h
    };

    private static final double[] PATROL_SPEEDS_KMH = {30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80};
    private static final double[][][] PATROL_POINTS = {
        {{0.1010, 0.359}, {0.2020, 1.207}, {0.3030, 2.516}},  // 30 km/h
        {{0.1010, 0.373}, {0.2020, 1.221}, {0.3030, 2.205}, {0.4040, 3.181}, {0.5051, 6.237}},  // 35 km/h
        {{0.1010, 0.401}, {0.2020, 1.226}, {0.3030, 2.115}, {0.4040, 3.027}, {0.5051, 4.496}, {0.6061, 7.382}, {0.7071, 10.863}},  // 40 km/h
        {{0.1010, 0.454}, {0.2020, 1.230}, {0.3030, 2.108}, {0.4040, 2.975}, {0.5051, 4.117}, {0.6061, 5.633}, {0.7071, 7.909}, {0.8081, 10.596}, {0.9091, 14.516}},  // 45 km/h
        {{0.1010, 0.518}, {0.2020, 1.234}, {0.3030, 2.095}, {0.4040, 2.974}, {0.5051, 3.968}, {0.6061, 5.174}, {0.7071, 6.715}, {0.8081, 8.452}, {0.9091, 10.658}, {1.0000, 12.942}},  // 50 km/h
        {{0.1010, 0.586}, {0.2020, 1.242}, {0.3030, 2.094}, {0.4040, 2.951}, {0.5051, 3.904}, {0.6061, 4.978}, {0.7071, 6.220}, {0.8081, 7.577}, {0.9091, 9.136}, {1.0000, 10.654}},  // 55 km/h
        {{0.1010, 0.655}, {0.2020, 1.268}, {0.3030, 2.098}, {0.4040, 2.948}, {0.5051, 3.867}, {0.6061, 4.857}, {0.7071, 5.912}, {0.8081, 7.145}, {0.9091, 8.475}, {1.0000, 9.616}},  // 60 km/h
        {{0.1010, 0.725}, {0.2020, 1.306}, {0.3030, 2.100}, {0.4040, 2.948}, {0.5051, 3.849}, {0.6061, 4.798}, {0.7071, 5.848}, {0.8081, 6.903}, {0.9091, 8.066}, {1.0000, 9.072}},  // 65 km/h
        {{0.2020, 1.352}, {0.3030, 2.117}, {0.4040, 2.954}, {0.5051, 3.837}, {0.6061, 4.785}, {0.7071, 5.757}, {0.8081, 6.761}, {0.9091, 7.824}, {1.0000, 8.771}},  // 70 km/h
        {{0.2020, 1.402}, {0.3030, 2.142}, {0.4040, 2.956}, {0.5051, 3.830}, {0.6061, 4.730}, {0.7071, 5.671}, {0.8081, 6.666}, {0.9091, 7.687}, {1.0000, 8.644}},  // 75 km/h
        {{0.2020, 1.455}, {0.3030, 2.177}, {0.4040, 2.974}, {0.5051, 3.830}, {0.6061, 4.726}, {0.7071, 5.664}, {0.8081, 6.580}, {0.9091, 7.581}, {1.0000, 8.444}},  // 80 km/h
    };

    private static final double[] SPRINTER_SPEEDS_KMH = {30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80};
    private static final double[][][] SPRINTER_POINTS = {
        {{0.1122, 0.478}, {0.2245, 1.411}, {0.3367, 2.369}, {0.4489, 4.495}},  // 30 km/h
        {{0.1122, 0.489}, {0.2245, 1.437}, {0.3367, 2.400}, {0.4489, 3.629}, {0.5612, 6.005}},  // 35 km/h
        {{0.1122, 0.498}, {0.2245, 1.445}, {0.3367, 2.405}, {0.4489, 3.478}, {0.5612, 4.950}, {0.6734, 7.245}, {0.7856, 10.862}},  // 40 km/h
        {{0.1122, 0.535}, {0.2245, 1.451}, {0.3367, 2.407}, {0.4489, 3.424}, {0.5612, 4.634}, {0.6734, 6.128}, {0.7856, 8.262}, {0.8979, 10.767}, {1.0000, 12.909}},  // 45 km/h
        {{0.1122, 0.590}, {0.2245, 1.455}, {0.3367, 2.410}, {0.4489, 3.404}, {0.5612, 4.495}, {0.6734, 5.756}, {0.7856, 7.334}, {0.8979, 9.019}, {1.0000, 10.939}},  // 50 km/h
        {{0.1122, 0.652}, {0.2245, 1.460}, {0.3367, 2.413}, {0.4489, 3.393}, {0.5612, 4.437}, {0.6734, 5.582}, {0.7856, 6.918}, {0.8979, 8.258}, {1.0000, 9.010}},  // 55 km/h
        {{0.1122, 0.716}, {0.2245, 1.475}, {0.3367, 2.417}, {0.4489, 3.389}, {0.5612, 4.400}, {0.6734, 5.498}, {0.7856, 6.686}, {0.8979, 7.800}, {1.0000, 8.568}},  // 60 km/h
        {{0.1122, 0.783}, {0.2245, 1.505}, {0.3367, 2.421}, {0.4489, 3.389}, {0.5612, 4.391}, {0.6734, 5.445}, {0.7856, 6.562}, {0.8979, 7.590}, {1.0000, 8.410}},  // 65 km/h
        {{0.2245, 1.545}, {0.3367, 2.432}, {0.4489, 3.391}, {0.5612, 4.378}, {0.6734, 5.401}, {0.7856, 6.498}, {0.8979, 7.510}, {1.0000, 8.355}},  // 70 km/h
        {{0.2245, 1.591}, {0.3367, 2.455}, {0.4489, 3.395}, {0.5612, 4.378}, {0.6734, 5.394}, {0.7856, 6.451}, {0.8979, 7.436}, {1.0000, 8.262}},  // 75 km/h
        {{0.2245, 1.640}, {0.3367, 2.486}, {0.4489, 3.407}, {0.5612, 4.377}, {0.6734, 5.380}, {0.7856, 6.420}, {0.8979, 7.414}, {1.0000, 8.246}},  // 80 km/h
    };

    /**
     * Một cấu hình đã đo. {@code rampLead}: CARLA đạt lực muộn hơn bàn đạp ~0,05 s nên bật bù pha tăng lực (ADR-056) — e-tron, Model 3; Patrol / Sprinter
     * có phanh 100% đổi mạnh theo tốc độ (bảng đã tính), không đo được độ trễ riêng nên không bật. {@code fromV13}: chỉ dùng từ {@code .xosc} v13.
     */
    record Calibration(String id, String blueprint, double torqueNm, double fullBrakeDecel, double deadzonePedal, double[] speedsKmh, double[][][] points,
                       boolean rampLead, boolean fromV13, double[][] stopOnset) {
    }

    /**
     * Tốc độ (m/s) mà CARLA bắt đầu "dừng gấp" (giảm tốc &gt; 12 m/s² ở mọi mức bàn đạp, TD-17) theo bàn đạp đang đạp: {bàn đạp, tốc độ}. Đo từ khung hình
     * carla-ped-bench (lấy tốc độ lớn nhất trong các tốc độ đầu đã đo, để chuyển sang đặt tốc độ sớm hơn chứ không muộn hơn): e-tron đợt 3 D1 (40–80 km/h),
     * Model 3 / Patrol / Sprinter đợt 4 P1 (50 / 70 km/h). Kiểm CARLA thật 22/11/2026: với ngưỡng cố định 6 m/s (ADR-053), e-tron bàn đạp 0,83–0,94 đã dừng gấp
     * 18,8 m/s² từ ~8 m/s (ADR-060).
     */
    static final double[][] ETRON_STOP_ONSET = {{0.438, 6.59}, {0.657, 7.59}, {0.876, 8.32}, {0.986, 8.56}, {1.0, 8.56}};
    static final double[][] MODEL3_STOP_ONSET = {{0.405, 6.34}, {0.608, 7.19}, {0.810, 7.85}, {1.0, 7.92}};
    static final double[][] PATROL_STOP_ONSET = {{0.404, 7.59}, {0.606, 8.92}, {0.808, 9.90}, {1.0, 10.39}};
    static final double[][] SPRINTER_STOP_ONSET = {{0.449, 7.26}, {0.673, 8.56}, {0.898, 9.39}, {1.0, 9.62}};
    /** Ngưỡng tối thiểu (ADR-053) và biên cộng thêm trước điểm dừng gấp đo được. */
    static final double MIN_OVERRIDE_MPS = 6.0;
    static final double OVERRIDE_MARGIN_MPS = 0.3;

    static final List<Calibration> CALIBRATIONS = List.of(
            new Calibration("etron-1800nm-2026-11-16", ETRON_BLUEPRINT, ETRON_BRAKE_TORQUE_NM, ETRON_FULL_BRAKE_DECEL, ETRON_DEADZONE_PEDAL, ETRON_SPEEDS_KMH,
                    ETRON_POINTS, true, false, ETRON_STOP_ONSET),
            new Calibration("model3-1750nm-2026-11-22", "vehicle.tesla.model3", 1750.0, 9.87, 0.0496, MODEL3_SPEEDS_KMH, MODEL3_POINTS, true, true, MODEL3_STOP_ONSET),
            new Calibration("patrol-2250nm-2026-11-22", "vehicle.nissan.patrol_2021", 2250.0, 9.9, 0.0991, PATROL_SPEEDS_KMH, PATROL_POINTS, false, true, PATROL_STOP_ONSET),
            new Calibration("sprinter-2250nm-2026-11-22", "vehicle.mercedes.sprinter", 2250.0, 8.91, 0.0792, SPRINTER_SPEEDS_KMH, SPRINTER_POINTS, false, true, SPRINTER_STOP_ONSET));

    private final Calibration calibration;

    private CarlaPedalMap(Calibration calibration) {
        this.calibration = calibration;
    }

    /** Tên bảng ghi vào {@code result.json} để biết run dùng hiệu chuẩn nào. */
    public String id() {
        return calibration.id();
    }

    /**
     * Tốc độ (m/s) để adapter chuyển sang đặt tốc độ ở bàn đạp {@code pedal} (ADR-060): điểm dừng gấp đo được nội suy theo bàn đạp, cộng biên 0,3 m/s,
     * không dưới 6 m/s. Bàn đạp nhỏ hơn điểm đo đầu tiên dùng điểm đầu.
     */
    public double overrideSpeed(double pedal) {
        double[][] onset = calibration.stopOnset();
        double v = onset[0][1];
        for (int i = 1; i < onset.length; i++) {
            if (pedal >= onset[i - 1][0]) {
                double w = Math.min(1.0, (pedal - onset[i - 1][0]) / (onset[i][0] - onset[i - 1][0]));
                v = onset[i - 1][1] + (onset[i][1] - onset[i - 1][1]) * w;
            }
        }
        return Math.max(MIN_OVERRIDE_MPS, v + OVERRIDE_MARGIN_MPS);
    }

    /** Bật bù pha tăng lực (ADR-056) cho xe này. */
    public boolean rampLead() {
        return calibration.rampLead();
    }

    /**
     * Bảng của xe nếu xe khớp đúng cấu hình đã đo: blueprint, mô-men phanh mọi bánh trong {@code .xosc} và giảm tốc phanh 100% controller dùng.
     * {@code includeV13} = profile cho phép các bảng thêm ở v13 (ADR-059). Không khớp thì null (giữ giả định tuyến tính).
     */
    public static CarlaPedalMap forVehicle(Map<String, Object> vehicleCarla, double fullBrakeDecel, boolean includeV13) {
        if (vehicleCarla == null) {
            return null;
        }
        Double torque = wheelBrakeTorque(vehicleCarla);
        for (Calibration c : CALIBRATIONS) {
            if (c.fromV13() && !includeV13) {
                continue;
            }
            if (c.blueprint().equals(vehicleCarla.get("blueprint")) && torque != null && Math.abs(torque - c.torqueNm()) <= 1e-6
                    && Math.abs(fullBrakeDecel - c.fullBrakeDecel()) <= 1e-9) {
                return new CarlaPedalMap(c);
            }
        }
        return null;
    }

    /** Như {@link #forVehicle(Map, double, boolean)} chỉ với bảng có từ v8 (e-tron). */
    public static CarlaPedalMap forVehicle(Map<String, Object> vehicleCarla, double fullBrakeDecel) {
        return forVehicle(vehicleCarla, fullBrakeDecel, false);
    }

    /**
     * Bàn đạp feed-forward [0, 1] cho lệnh giảm tốc {@code decelCmd} (m/s²) ở tốc độ {@code speedMps}. Lệnh ≤ 0 → 0. Tốc độ ngoài dải của bảng dùng hàng gần
     * nhất (dưới 6 m/s adapter đặt tốc độ thay bàn đạp, ADR-053).
     */
    public double feedForward(double decelCmd, double speedMps) {
        if (decelCmd <= 0) {
            return 0.0;
        }
        double[] speeds = calibration.speedsKmh();
        double kmh = Math.max(speeds[0], Math.min(speeds[speeds.length - 1], speedMps * 3.6));
        int hi = 1;
        while (hi < speeds.length - 1 && speeds[hi] < kmh) {
            hi++;
        }
        int lo = hi - 1;
        double w = (kmh - speeds[lo]) / (speeds[hi] - speeds[lo]);
        double dead = calibration.deadzonePedal();
        return clamp(rowPedal(calibration.points()[lo], decelCmd, dead) * (1 - w) + rowPedal(calibration.points()[hi], decelCmd, dead) * w);
    }

    /** Bàn đạp cho giảm tốc {@code a} trong một hàng: nội suy giữa hai điểm kề; dưới điểm nhỏ nhất nội suy từ vùng chết; trên điểm lớn nhất ngoại suy. */
    static double rowPedal(double[][] row, double a, double deadzonePedal) {
        if (a <= row[0][1]) {
            return deadzonePedal + (row[0][0] - deadzonePedal) * a / row[0][1];
        }
        for (int i = 1; i < row.length; i++) {
            if (a <= row[i][1]) {
                return lerp(row[i - 1], row[i], a);
            }
        }
        int n = row.length;
        return row[n - 1][0] >= 1.0 ? 1.0 : lerp(row[n - 2], row[n - 1], a);
    }

    /** Như {@link #rowPedal(double[][], double, double)} với vùng chết của e-tron. */
    static double rowPedal(double[][] row, double a) {
        return rowPedal(row, a, ETRON_DEADZONE_PEDAL);
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
