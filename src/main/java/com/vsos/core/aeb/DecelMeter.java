package com.vsos.core.aeb;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Giảm tốc đo từ tốc độ CARLA: trung bình trượt qua {@code window} tick, kẹp ở {@code limit} — port từ {@code DecelMeter} của {@code worker/run_variant.py}
 * (ADR-042).
 *
 * <ul>
 *   <li>Trước khi AEB phanh luôn trả 0: ở chế độ giữ tốc độ, tốc độ đọc về dao động ±0,1 m/s mỗi tick — đạo hàm thô ra "giảm tốc" 4 m/s² giả.</li>
 *   <li>Khi phanh, tốc độ đọc về có dạng răng cưa chu kỳ 2 tick (đo: 2 rồi 7 m/s² xen kẽ, trung bình 4,6) — cửa sổ 2 tick lấy đúng một chu kỳ.</li>
 *   <li>Dưới ~6 m/s xe CARLA dừng gần như tức thì (21–27 m/s²): giá trị vượt {@code limit} (μ·g, giới hạn vật lý của lốp) bị kẹp và đếm vào {@code clamped}.</li>
 * </ul>
 */
public final class DecelMeter {

    private final double limit;
    private final double dt;
    private final int window;
    private final Deque<Double> speeds = new ArrayDeque<>();
    private int clamped;

    public DecelMeter(double limit, int window, double dt) {
        this.limit = limit;
        this.window = window;
        this.dt = dt;
    }

    public int clamped() {
        return clamped;
    }

    public double update(double speed, boolean braking) {
        speeds.addLast(speed);
        while (speeds.size() > window + 1) {
            speeds.removeFirst();
        }
        if (!braking || speeds.size() < 2) {
            return 0.0;
        }
        double decel = Math.max(0.0, (speeds.getFirst() - speeds.getLast()) / (dt * (speeds.size() - 1)));
        if (decel > limit) {
            clamped++;
            return limit;
        }
        return decel;
    }

    /**
     * Mức giảm tốc AEB yêu cầu (m/s²) → bàn đạp phanh CARLA [0, 1]: feed-forward theo giả định bàn đạp tỉ lệ tuyến tính với giảm tốc (1,0 ứng với
     * {@code fullBrakeDecel}), cộng một chút bù theo sai số đo được ở tick trước.
     */
    public static double brakePedal(double decelCmd, double measuredDecel, double fullBrakeDecel) {
        if (decelCmd <= 0) {
            return 0.0;
        }
        double pedal = decelCmd / fullBrakeDecel + 0.05 * (decelCmd - measuredDecel);
        return Math.max(0.0, Math.min(1.0, pedal));
    }
}
