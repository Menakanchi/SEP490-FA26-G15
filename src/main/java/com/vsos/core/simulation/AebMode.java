package com.vsos.core.simulation;

import java.util.List;
import java.util.Map;

/**
 * Chế độ AEB của một run (chốt 13/11/2026: baseline đo cả AEB hiện tại lẫn AEB tắt). {@code OFF}: perception và quyết định AEB vẫn chạy để ghi "AEB lẽ
 * ra làm gì" ({@code fcw_t}, {@code aeb_decision_t}), nhưng không đạp phanh — xe đi tiếp như không có AEB. Run OFF là mốc tham chiếu (va chạm/vận tốc
 * va chạm khi không có AEB, ca an toàn có thật sự an toàn không), không bao giờ là baseline của regression hay tối ưu.
 *
 * <p>Bundle/{@code .xosc} chỉ mang khoá chế độ khi là OFF, nên run ON giữ nguyên từng byte như trước.</p>
 */
public final class AebMode {

    public static final String ON = "ON";
    public static final String OFF = "OFF";
    /** Khoá trong bundle ({@code aeb_mode}), {@code .xosc} ({@code vs_aeb_mode}), {@code result.json} ({@code case.aeb_mode}) và cột DB. */
    public static final String KEY = "aeb_mode";

    /** Chỉ số của pha phanh: AEB tắt thì không có pha phanh — để trống, không để số tính từ lệnh phanh không được áp. */
    static final List<String> BRAKE_PHASE_METRICS = List.of("brake_onset_t", "braking_latency_s", "rms_jerk_mps3", "rms_jerk_raw_mps3", "t_aeb_s",
            "stopping_distance_m");

    private AebMode() {
    }

    /** {@code null}/thiếu = ON. Giá trị khác ON/OFF là lỗi. */
    public static boolean isOff(Object value) {
        if (value == null || ON.equals(value)) {
            return false;
        }
        if (OFF.equals(value)) {
            return true;
        }
        throw new IllegalArgumentException(KEY + " phải là " + ON + " hoặc " + OFF + ", nhận " + value);
    }

    /** Ghi chế độ OFF vào kết quả và bỏ các chỉ số pha phanh (không có phanh nào được áp). */
    public static void markOff(SimulationOutcome outcome) {
        outcome.caseDoc().put(KEY, OFF);
        Map<String, Object> m = outcome.metrics();
        for (String key : BRAKE_PHASE_METRICS) {
            if (m.containsKey(key)) {
                m.put(key, null);
            }
        }
    }
}
