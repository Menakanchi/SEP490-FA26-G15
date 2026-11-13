package com.vsos.core.simulation;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.Test;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.evaluation.Evaluation;

/**
 * Bản Java của bộ động học + luật chấm phải cho đúng từng trường đã lưu như lõi Python trên fixture (ADR-042).
 * Trường rời rạc (lý do kết thúc, loại và thời điểm sự kiện, nhãn, quyết định chấm) phải trùng tuyệt đối; số thực so theo số đã lưu, không so chuỗi.
 * Mọi sai khác ở một trường đã lưu buộc phải đổi định danh simulator (KINEMATIC_SIMULATOR, RunService) thay vì sửa số cho khớp.
 */
public class KinematicParityTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static List<Map<String, Object>> cases() throws IOException {
        try (InputStream raw = KinematicParityTest.class.getResourceAsStream("/parity/kinematic.json.gz")) {
            assertThat(raw).as("thiếu fixture parity/kinematic.json.gz").isNotNull();
            try (GZIPInputStream in = new GZIPInputStream(raw)) {
                return MAPPER.readValue(in, new TypeReference<List<Map<String, Object>>>() { });
            }
        }
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> map(Object o) {
        return (Map<String, Object>) o;
    }

    @Test
    void everyFixtureCaseMatchesThePythonCore() throws IOException {
        List<Map<String, Object>> cases = cases();
        assertThat(cases).hasSizeGreaterThan(200);
        List<String> diffs = new ArrayList<>();
        for (int i = 0; i < cases.size(); i++) {
            checkCase(cases.get(i), "ca #" + i, diffs);
        }
        assertThat(diffs).as("%d sai khác so với lõi Python (hiện tối đa 25 dòng đầu)", diffs.size()).isEmpty();
    }

    /**
     * Ngoại lệ có chủ đích (13/11/2026, bộ động học 1.1): {@code impact_speed_mps} thành vận tốc va chạm tương đối hypot(v_ego, v_ped), tốc độ ego chuyển
     * sang {@code ego_impact_speed_mps}. Mọi trường khác của outcome giống hệt định nghĩa 1.0 trên toàn bộ fixture.
     */
    @Test
    void currentDefinitionOnlyChangesTheImpactSpeedKeys() throws IOException {
        int collisions = 0;
        for (Map<String, Object> c : cases()) {
            Map<String, Object> cs = map(c.get("case"));
            Map<String, Double> codes = new HashMap<>();
            map(c.get("params")).forEach((k, v) -> codes.put(k, ((Number) v).doubleValue()));
            Map<String, Object> vh = map(c.get("vehicle"));
            CrossingCase crossing = new CrossingCase(num(cs, "ego_speed_kmh"), num(cs, "trigger_distance_m"), num(cs, "pedestrian_speed_mps"),
                    (Boolean) cs.get("stops_at_curb"), (String) cs.get("weather"), (String) cs.get("time_of_day"),
                    cs.get("friction") == null ? null : num(cs, "friction"));
            VehicleSpec vehicle = new VehicleSpec(num(vh, "length_m"), num(vh, "width_m"), num(vh, "max_brake_decel_mps2"));
            long seed = ((Number) c.get("seed")).longValue();
            AebParams params = AebParams.fromCodes(codes);
            Map<String, Object> legacy = Simulator.simulate(crossing, params, seed, vehicle, false).asDict();
            Map<String, Object> current = Simulator.simulate(crossing, params, seed, vehicle).asDict();
            Map<String, Object> lm = new java.util.LinkedHashMap<>(map(legacy.get("metrics")));
            Map<String, Object> cm = new java.util.LinkedHashMap<>(map(current.get("metrics")));
            Object ego = cm.remove("ego_impact_speed_mps");
            assertThat(ego).isEqualTo(lm.get("impact_speed_mps"));
            Object relative = cm.remove("impact_speed_mps");
            lm.remove("impact_speed_mps");
            assertThat(cm).isEqualTo(lm);
            if (ego != null) {
                collisions++;
                java.util.List<?> frames = (java.util.List<?>) current.get("frames");
                Map<String, Object> last = map(frames.get(frames.size() - 1));
                double expected = Math.hypot(((Number) last.get("ego_v")).doubleValue(), ((Number) last.get("ped_vy")).doubleValue());
                assertThat(((Number) relative).doubleValue()).isCloseTo(expected, org.assertj.core.api.Assertions.within(0.002))
                        .isGreaterThanOrEqualTo(((Number) ego).doubleValue());
            } else {
                assertThat(relative).isNull();
            }
            legacy.remove("metrics");
            current.remove("metrics");
            assertThat(current).isEqualTo(legacy);
        }
        assertThat(collisions).as("fixture có ca va chạm để kiểm").isGreaterThan(10);
    }


    /** Chạy lại một ca bằng lõi Java và ghi mọi trường lệch so với kết quả Python vào {@code diffs}. */
    public static void checkCase(Map<String, Object> c, String name, List<String> diffs) throws IOException {
        Map<String, Object> cs = map(c.get("case"));
        Map<String, Object> pv = map(c.get("params"));
        Map<String, Object> vh = map(c.get("vehicle"));
        long seed = ((Number) c.get("seed")).longValue();
        CrossingCase crossing = new CrossingCase(num(cs, "ego_speed_kmh"), num(cs, "trigger_distance_m"), num(cs, "pedestrian_speed_mps"),
                (Boolean) cs.get("stops_at_curb"), (String) cs.get("weather"), (String) cs.get("time_of_day"),
                cs.get("friction") == null ? null : num(cs, "friction"));
        Map<String, Double> codes = new HashMap<>();
        pv.forEach((k, v) -> codes.put(k, ((Number) v).doubleValue()));
        AebParams params = AebParams.fromCodes(codes);
        VehicleSpec vehicle = new VehicleSpec(num(vh, "length_m"), num(vh, "width_m"), num(vh, "max_brake_decel_mps2"));

        // Fixture sinh bằng lõi Python = định nghĩa bộ động học 1.0 (impact_speed_mps là tốc độ ego). Chế độ hiện hành 1.1 chỉ khác ở hai khoá vận tốc
        // va chạm — kiểm riêng ở currentDefinitionOnlyChangesTheImpactSpeedKeys.
        SimulationOutcome actual = Simulator.simulate(crossing, params, seed, vehicle, false);
        String label = name + " " + cs + " seed=" + seed;
        compare(label + " outcome", map(c.get("outcome")), roundTrip(actual.asDict()), diffs);
        compare(label + " evaluation", map(c.get("evaluation")), roundTrip(Evaluation.evaluate(actual, params).toDocument()), diffs);
    }

    private static double num(Map<String, Object> m, String key) {
        return ((Number) m.get(key)).doubleValue();
    }

    /** Qua JSON như khi ghi {@code result.json}, để so cùng kiểu dữ liệu với fixture (Integer/Long/Double như Jackson đọc). */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> roundTrip(Map<String, Object> doc) throws IOException {
        return MAPPER.readValue(MAPPER.writeValueAsBytes(doc), Map.class);
    }

    public static void compare(String path, Object expected, Object actual, List<String> diffs) {
        if (diffs.size() >= 25) {
            return;
        }
        if (expected instanceof Map<?, ?> em && actual instanceof Map<?, ?> am) {
            if (!em.keySet().equals(am.keySet())) {
                diffs.add(path + ": khóa khác nhau " + em.keySet() + " vs " + am.keySet());
                return;
            }
            for (Object k : em.keySet()) {
                compare(path + "." + k, em.get(k), am.get(k), diffs);
            }
        } else if (expected instanceof List<?> el && actual instanceof List<?> al) {
            if (el.size() != al.size()) {
                diffs.add(path + ": độ dài " + el.size() + " vs " + al.size());
                return;
            }
            for (int i = 0; i < el.size(); i++) {
                compare(path + "[" + i + "]", el.get(i), al.get(i), diffs);
            }
        } else if (expected instanceof Number en && actual instanceof Number an) {
            if (Double.compare(en.doubleValue(), an.doubleValue()) != 0 && !(en.doubleValue() == 0.0 && an.doubleValue() == 0.0)) {
                diffs.add(path + ": " + en + " vs " + an);
            }
        } else if (expected == null ? actual != null : !expected.equals(actual)) {
            diffs.add(path + ": " + expected + " vs " + actual);
        }
    }
}
