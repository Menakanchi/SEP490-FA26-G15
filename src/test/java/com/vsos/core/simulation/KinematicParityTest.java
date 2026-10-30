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

        SimulationOutcome actual = Simulator.simulate(crossing, params, seed, vehicle);
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
