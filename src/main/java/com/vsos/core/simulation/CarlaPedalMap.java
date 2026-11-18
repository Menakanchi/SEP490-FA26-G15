package com.vsos.core.simulation;

import java.util.Map;

/**
 * Hiệu chuẩn bàn đạp phanh CARLA theo xe (ADR-054): đổi lệnh giảm tốc AEB ra bàn đạp theo số đo thật thay cho giả định "bàn đạp tỉ lệ tuyến tính
 * với giảm tốc, 1,0 ứng với phanh 100%".
 *
 * <p>Đo 16/11/2026 bằng carla-ped-bench đợt 3 (nhóm D1, 170 run, lệnh phanh cố định, CARLA 0.9.16 Windows, Town04 road 40): với e-tron
 * mô-men 1800 N·m, giảm tốc ổn định thấp hơn mức đích một lượng gần như không đổi ≈ 0,45–0,5 m/s² ở mọi tốc độ (vùng chết bàn đạp ≈ 0,05).
 * Hồi quy 85 điểm (50–100 km/h, mức 2–9 m/s²): {@code a_đo ≈ 1,032 · a_đích − 0,512}, độ lệch chuẩn phần dư 0,136 m/s² (trước hiệu chỉnh
 * lệch −0,33 ± 0,15 m/s²). Đảo lại: {@code bàn đạp = (a + 0,512) / (1,032 · a_100%)}.
 *
 * <p>Bảng chỉ đúng cho đúng cấu hình đã đo (blueprint, mô-men phanh, phanh 100%); xe khác hoặc đổi mô-men thì trả null và adapter giữ giả định
 * tuyến tính cho tới khi đo lại. Lõi chỉ dùng JDK, không gọi CARLA.
 */
public final class CarlaPedalMap {

    /** Cấu hình đã đo của e-tron (ADR-051 + đợt 3 carla-ped-bench). */
    static final String ETRON_BLUEPRINT = "vehicle.audi.etron";
    static final double ETRON_BRAKE_TORQUE_NM = 1800.0;
    static final double ETRON_FULL_BRAKE_DECEL = 9.13;
    static final double ETRON_GAIN = 1.032;
    static final double ETRON_OFFSET_MPS2 = 0.512;

    private final String id;
    private final double fullBrakeDecel;
    private final double gain;
    private final double offset;

    private CarlaPedalMap(String id, double fullBrakeDecel, double gain, double offset) {
        this.id = id;
        this.fullBrakeDecel = fullBrakeDecel;
        this.gain = gain;
        this.offset = offset;
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
        return new CarlaPedalMap("etron-1800nm-2026-11-16", ETRON_FULL_BRAKE_DECEL, ETRON_GAIN, ETRON_OFFSET_MPS2);
    }

    /** Bàn đạp feed-forward [0, 1] cho lệnh giảm tốc {@code decelCmd} (m/s²) ở tốc độ {@code speedMps}. Lệnh ≤ 0 → 0. */
    public double feedForward(double decelCmd, double speedMps) {
        if (decelCmd <= 0) {
            return 0.0;
        }
        return clamp((decelCmd + offset) / (gain * fullBrakeDecel));
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
