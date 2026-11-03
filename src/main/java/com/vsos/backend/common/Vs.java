package com.vsos.backend.common;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import com.vsos.backend.repository.common.Row;

/**
 * Tiện ích dùng chung cho vòng MVP (port của ``services/vehicsim/common.py`` và các hằng chấm điểm).
 * Mọi hàm làm tròn/định dạng bắt chước Python (làm tròn half-even trên giá trị nhị phân chính xác)
 * để số trả về khớp từng chữ số với backend cũ.
 */
public final class Vs {

    private Vs() {
    }

    /** Bản ghi không tồn tại (hoặc không thuộc project) — HTTP 404. */
    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String what) {
            super(what);
        }
    }

    /** Đúng kiểu nhưng sai nghiệp vụ — HTTP 400. */
    public static class InvalidRequestException extends RuntimeException {
        public InvalidRequestException(String message) {
            super(message);
        }
    }

    public static final String OUTCOME_COLLISION = "COLLISION";
    public static final String OUTCOME_NEAR_MISS = "NEAR_MISS";
    public static final String OUTCOME_SAFE = "SAFE";

    public static final double NEAR_MISS_TTC_S = 1.0;
    public static final double NEAR_MISS_DISTANCE_M = 0.5;
    public static final double LANE_WIDTH_M = 3.5;

    public static final Map<String, String> WEATHER_LABELS = Map.of(
            "CLEAR", "clear", "CLOUDY", "cloudy", "RAIN", "rain", "HEAVY_RAIN", "heavy rain", "FOG", "fog");
    public static final Map<String, String> TIME_LABELS = Map.of("DAY", "Day", "DUSK", "Dusk", "NIGHT", "Night");
    public static final Map<String, Double> WEATHER_FRICTION = Map.of(
            "CLEAR", 1.0, "CLOUDY", 1.0, "FOG", 1.0, "RAIN", 0.70, "HEAVY_RAIN", 0.55);

    /** UTC dạng naive, như quy ước DATETIME của MySQL ở backend cũ. */
    public static LocalDateTime now() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }

    /** Python ``datetime.isoformat()``: có phần micro giây thì in đủ 6 chữ số, không thì thôi. */
    public static String iso(LocalDateTime t) {
        if (t == null) {
            return null;
        }
        String base = t.withNano(0).toString();
        if (base.length() == 16) { // LocalDateTime.toString bỏ giây khi giây = 0
            base += ":00";
        }
        int micros = t.getNano() / 1000;
        return micros == 0 ? base : base + String.format(java.util.Locale.ROOT, ".%06d", micros);
    }

    /** ``isoformat(timespec="seconds")``. */
    public static String isoSeconds(LocalDateTime t) {
        String base = t.withNano(0).toString();
        return base.length() == 16 ? base + ":00" : base;
    }

    /** Python ``round(x, nd)``: half-even trên giá trị nhị phân chính xác. */
    public static double round(double x, int digits) {
        if (Double.isNaN(x) || Double.isInfinite(x)) {
            return x;
        }
        return new BigDecimal(x).setScale(digits, RoundingMode.HALF_EVEN).doubleValue();
    }

    /** Python ``round(x)`` -> int. */
    public static long roundToLong(double x) {
        return new BigDecimal(x).setScale(0, RoundingMode.HALF_EVEN).longValue();
    }

    /** Python ``f"{x:.0f}"``. */
    public static String fmt0(double x) {
        return new BigDecimal(x).setScale(0, RoundingMode.HALF_EVEN).toPlainString();
    }

    public static String versionLabel(Row version) {
        String label = version.str("label");
        return label != null && !label.isEmpty() ? label : "v" + version.lng("version_no");
    }

    public static String variantLabel(String scenarioCode, long versionNo) {
        return String.format(java.util.Locale.ROOT, "%s-%03d", scenarioCode, versionNo);
    }

    /** ``Night · heavy rain · 60 km/h`` — dòng mô tả ngắn của một biến thể. */
    public static String variantSummary(Map<String, Object> ir) {
        String time = TIME_LABELS.getOrDefault(String.valueOf(ir.getOrDefault("time_of_day", "DAY")), "Day");
        String weather = WEATHER_LABELS.getOrDefault(String.valueOf(ir.getOrDefault("weather", "CLEAR")), "clear");
        Object speed = ir.get("ego_speed_kmh");
        double kmh = speed instanceof Number n ? n.doubleValue() : 0.0;
        StringBuilder sb = new StringBuilder(time).append(" · ").append(weather).append(" · ").append(fmt0(kmh)).append(" km/h");
        if (Boolean.TRUE.equals(ir.get("stops_at_curb"))) {
            sb.append(" · stops at curb");
        }
        return sb.toString();
    }

    public static String classifyOutcome(boolean collision, Double minTtcS, Double minDistanceM) {
        if (collision) {
            return OUTCOME_COLLISION;
        }
        if ((minTtcS != null && minTtcS < NEAR_MISS_TTC_S) || (minDistanceM != null && minDistanceM < NEAR_MISS_DISTANCE_M)) {
            return OUTCOME_NEAR_MISS;
        }
        return OUTCOME_SAFE;
    }

    /** Median như ``statistics.median`` (không làm tròn). */
    public static Double median(List<Double> values) {
        if (values.isEmpty()) {
            return null;
        }
        List<Double> sorted = values.stream().sorted().toList();
        int n = sorted.size();
        return n % 2 == 1 ? sorted.get(n / 2) : (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0;
    }
}
