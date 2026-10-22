package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** {@code read_spec}, {@code make_bundle}, {@code result_document} và thông báo lỗi của bản Java phải trùng lõi Python trên fixture (ADR-042). */
class BundleParityTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @SuppressWarnings("unchecked")
    @Test
    void readSpecAcceptsAndRejectsExactlyLikePython() throws IOException {
        List<Map<String, Object>> entries = PyCompatTest.fixture("bundle.json", new TypeReference<>() { });
        assertThat(entries).hasSizeGreaterThan(40);
        int ok = 0;
        int rejected = 0;
        for (int i = 0; i < entries.size(); i++) {
            Map<String, Object> e = entries.get(i);
            Object doc = e.get("doc");
            Long seedOverride = e.get("seed_override") == null ? null : ((Number) e.get("seed_override")).longValue();
            Map<String, Object> aebOverride = (Map<String, Object>) e.get("aeb_override");
            String label = "bundle #" + i + " " + MAPPER.writeValueAsString(doc);
            if (e.containsKey("error")) {
                rejected++;
                assertThatThrownBy(() -> Bundle.readSpec(doc, aebOverride, seedOverride)).as(label).isInstanceOf(Bundle.BundleError.class)
                        .hasMessage((String) e.get("error"));
                continue;
            }
            ok++;
            Bundle.RunSpec spec = Bundle.readSpec(doc, aebOverride, seedOverride);
            Map<String, Object> expected = (Map<String, Object>) e.get("ok");
            Map<String, Object> caseFields = new java.util.LinkedHashMap<>(spec.caseSpec().asDict());
            caseFields.remove("road_friction"); // chỉ có trong outcome.case, không có trong dữ liệu đầu vào
            Map<String, Object> actual = Map.of("case", caseFields, "params", spec.params().asCodes(), "vehicle", spec.vehicle().asDict(),
                    "seed", spec.seed(), "source", spec.source(), "vehicle_carla", spec.vehicleCarla());
            List<String> diffs = new java.util.ArrayList<>();
            KinematicParityTest.compare(label + " spec", withoutNulls(expected, "aeb_label", "vehicle_name"), roundTrip(actual), diffs);
            assertThat(diffs).as(label).isEmpty();
            assertThat(spec.aebLabel()).as(label + " aeb_label").isEqualTo(expected.get("aeb_label"));
            assertThat(spec.vehicleName()).as(label + " vehicle_name").isEqualTo(expected.get("vehicle_name"));

            diffs.clear();
            KinematicParityTest.compare(label + " make_bundle", (Map<String, Object>) e.get("make_bundle"), roundTrip(Bundle.makeBundle(spec)), diffs);
            assertThat(diffs).as(label).isEmpty();

            SimulationOutcome outcome = Simulator.simulate(spec.caseSpec(), spec.params(), spec.seed(), spec.vehicle());
            Map<String, Object> result = Bundle.resultDocument(spec, outcome, Bundle.KINEMATIC_SIMULATOR, null, Evaluation.evaluate(outcome, spec.params()).toDocument());
            diffs.clear();
            KinematicParityTest.compare(label + " result", (Map<String, Object>) e.get("result"), roundTrip(result), diffs);
            assertThat(diffs).as(label).isEmpty();

            Bundle.ResultDoc back = Bundle.readResult(roundTrip(result));
            assertThat(back.simulator()).isEqualTo(Bundle.KINEMATIC_SIMULATOR);
            assertThat(back.outcome().endReason()).isEqualTo(outcome.endReason());
        }
        assertThat(ok).isGreaterThan(10);
        assertThat(rejected).isGreaterThan(20);
    }

    @Test
    void carlaSimulatorNameFollowsServerVersion() {
        assertThat(Bundle.carlaSimulator("0.9.16")).isEqualTo("carla-0.9.16");
        assertThat(Bundle.carlaSimulator(" 0.9.16-12-gabcdef ")).isEqualTo("carla-0.9.16");
        assertThat(Bundle.carlaSimulator("nightly")).isEqualTo("carla-nightly");
        assertThat(Bundle.carlaSimulator("x".repeat(60))).hasSize(30);
    }

    @Test
    void readResultRejectsForeignFormats() {
        assertThatThrownBy(() -> Bundle.readResult(Map.of("format", "other"))).isInstanceOf(Bundle.BundleError.class)
                .hasMessage("result.json không đúng định dạng vehicsim.result/v1");
        assertThatThrownBy(() -> Bundle.readResult(Map.of("format", Bundle.RESULT_FORMAT, "outcome", Map.of()))).isInstanceOf(Bundle.BundleError.class)
                .hasMessage("result.json thiếu outcome.frames/events/metrics/end_reason");
    }

    private static Map<String, Object> withoutNulls(Map<String, Object> m, String... drop) {
        Map<String, Object> copy = new java.util.LinkedHashMap<>(m);
        for (String k : drop) {
            copy.remove(k);
        }
        return copy;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> roundTrip(Map<String, Object> doc) throws IOException {
        return MAPPER.readValue(MAPPER.writeValueAsBytes(doc), Map.class);
    }
}
