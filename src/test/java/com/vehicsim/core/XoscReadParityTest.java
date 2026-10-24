package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Bộ đọc {@code .xosc} và profile của Java phải trùng {@code read_xosc}/{@code read_profile} của Python trên fixture, kể cả thông báo lỗi (ADR-042). */
class XoscReadParityTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @SuppressWarnings("unchecked")
    @Test
    void readXoscAndProfileMatchPython() throws IOException {
        List<Map<String, Object>> entries = PyCompatTest.fixture("xosc.json", new TypeReference<>() { });
        assertThat(entries).hasSizeGreaterThan(25);
        int specOk = 0;
        int specErr = 0;
        for (Map<String, Object> e : entries) {
            String xml = (String) e.get("xml");
            String label = (String) e.get("name");
            if (e.containsKey("spec_error")) {
                specErr++;
                assertThatThrownBy(() -> Xosc.read(xml)).as(label).isInstanceOf(Bundle.BundleError.class).hasMessage((String) e.get("spec_error"));
            } else {
                specOk++;
                Bundle.RunSpec spec = Xosc.read(xml);
                Map<String, Object> caseFields = new LinkedHashMap<>(spec.caseSpec().asDict());
                caseFields.remove("road_friction");
                Map<String, Object> actual = new LinkedHashMap<>();
                actual.put("case", caseFields);
                actual.put("params", spec.params().asCodes());
                actual.put("vehicle", spec.vehicle().asDict());
                actual.put("seed", spec.seed());
                actual.put("source", spec.source());
                actual.put("vehicle_carla", spec.vehicleCarla());
                List<String> diffs = new ArrayList<>();
                Map<String, Object> expected = new LinkedHashMap<>((Map<String, Object>) e.get("spec"));
                assertThat(spec.aebLabel()).as(label + " aeb_label").isEqualTo(expected.remove("aeb_label"));
                assertThat(spec.vehicleName()).as(label + " vehicle_name").isEqualTo(expected.remove("vehicle_name"));
                KinematicParityTest.compare(label, expected, MAPPER.readValue(MAPPER.writeValueAsBytes(actual), Map.class), diffs);
                assertThat(diffs).as(label).isEmpty();
            }
            if (e.containsKey("profile_error")) {
                assertThatThrownBy(() -> Xosc.profile(xml)).as(label + " profile").isInstanceOf(Bundle.BundleError.class).hasMessage((String) e.get("profile_error"));
            } else {
                List<Object> want = (List<Object>) e.get("profile");
                Xosc.Profile got = Xosc.profile(xml);
                assertThat(got.suffix()).as(label + " profile").isEqualTo(want.get(0));
                assertThat(got.stepS()).isEqualTo(((Number) want.get(1)).doubleValue());
                assertThat(got.perceptionPeriodS()).isEqualTo(((Number) want.get(2)).doubleValue());
            }
        }
        assertThat(specOk).isGreaterThan(15);
        assertThat(specErr).isGreaterThan(5);
    }

    /**
     * {@code export_xosc} của Python (v3) và {@link XoscExport#export} của Java (v4) ghi cùng từng byte cho ca băng ngang, trừ
     * {@code vs_format}. Ca dừng ở lề đổi có chủ đích ở v4 (TD-47: waypoint cuối + event StopAtCurb) nên so với
     * {@code xosc_v4_stops_at_curb.json}, sinh từ bộ xuất Java ngày 23/10/2026 sau khi kiểm trên CARLA thật.
     */
    @SuppressWarnings("unchecked")
    @Test
    void exportIsByteIdenticalToPython() throws IOException {
        List<Map<String, Object>> entries = PyCompatTest.fixture("xosc.json", new TypeReference<>() { });
        Map<String, String> curbV4 = new LinkedHashMap<>();
        for (Map<String, Object> row : PyCompatTest.fixture("xosc_v4_stops_at_curb.json", new TypeReference<List<Map<String, Object>>>() { })) {
            curbV4.put((String) row.get("name"), (String) row.get("xml"));
        }
        int exported = 0;
        int curb = 0;
        for (Map<String, Object> e : entries) {
            String name = (String) e.get("name");
            if (!name.startsWith("export ")) {
                continue;
            }
            Long seedOverride = e.get("seed_override") == null ? null : ((Number) e.get("seed_override")).longValue();
            Bundle.RunSpec spec = Bundle.readSpec(e.get("bundle"), (Map<String, Object>) e.get("aeb_override"), seedOverride);
            String expected;
            if (spec.caseSpec().stopsAtCurb()) {
                expected = curbV4.get(name);
                assertThat(expected).as(name + " có trong xosc_v4_stops_at_curb.json").isNotNull();
                curb++;
            } else {
                expected = ((String) e.get("xml")).replace(Xosc.PREVIOUS_FORMAT, Xosc.FORMAT);
            }
            assertThat(XoscExport.export(spec)).as(name).isEqualTo(expected);
            exported++;
        }
        assertThat(exported).isGreaterThan(15);
        assertThat(curb).as("mọi ca dừng ở lề trong fixture Java đều được dùng").isEqualTo(curbV4.size()).isPositive();
    }

    @Test
    void refusesXmlWithADoctype() {
        assertThatThrownBy(() -> Xosc.parameters("<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><OpenSCENARIO/>"))
                .isInstanceOf(Bundle.BundleError.class);
    }
}
