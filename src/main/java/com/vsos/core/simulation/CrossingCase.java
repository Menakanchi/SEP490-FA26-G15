package com.vsos.core.simulation;

import java.util.LinkedHashMap;
import java.util.Map;

/** Một biến thể của mô típ người đi bộ băng ngang. Trigger là **khoảng cách**, không phải giây tuyệt đối. */
public record CrossingCase(
        double egoSpeedKmh, double triggerDistanceM, double pedestrianSpeedMps, boolean stopsAtCurb, String weather, String timeOfDay, Double friction) {

    public static final Map<String, Double> WEATHER_FRICTION = Map.of("CLEAR", 1.0, "CLOUDY", 1.0, "FOG", 1.0, "RAIN", 0.70, "HEAVY_RAIN", 0.55);

    /** Ma sát mặt đường: giá trị cho sẵn, hoặc suy từ thời tiết. */
    public double roadFriction() {
        return friction != null ? friction : WEATHER_FRICTION.getOrDefault(weather, 1.0);
    }

    /** Quãng từ mũi xe lúc bắt đầu tới vạch băng qua: trigger + LEAD_TIME_S ở tốc độ đầu. */
    public double crossingX() {
        return triggerDistanceM + egoSpeedKmh / 3.6 * Simulator.LEAD_TIME_S;
    }

    /** {@code {**asdict(case), "road_friction": ...}} của bản Python. */
    public Map<String, Object> asDict() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ego_speed_kmh", egoSpeedKmh);
        out.put("trigger_distance_m", triggerDistanceM);
        out.put("pedestrian_speed_mps", pedestrianSpeedMps);
        out.put("stops_at_curb", stopsAtCurb);
        out.put("weather", weather);
        out.put("time_of_day", timeOfDay);
        out.put("friction", friction);
        out.put("road_friction", roadFriction());
        return out;
    }
}
