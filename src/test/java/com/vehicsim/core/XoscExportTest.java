package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.xpath.XPath;
import javax.xml.xpath.XPathConstants;
import javax.xml.xpath.XPathFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/**
 * XML thực thi, metadata đủ để chạy lại (ADR-042; chuyển từ {@code worker/tests/test_openscenario_export.py}). {@link XoscReadParityTest} đã chứng minh
 * từng byte trùng bản Python; test này giữ ý nghĩa của từng ràng buộc hình học.
 */
class XoscExportTest {

    private static final XPath XPATH = XPathFactory.newInstance().newXPath();

    private static Map<String, Object> ir(Object... overrides) {
        Map<String, Object> m = new LinkedHashMap<>(Map.of("ego_speed_kmh", 40, "trigger_distance_m", 25, "pedestrian_speed_mps", 3, "weather", "RAIN", "time_of_day", "NIGHT"));
        for (int i = 0; i < overrides.length; i += 2) {
            m.put((String) overrides[i], overrides[i + 1]);
        }
        return m;
    }

    private static Document dom(String xml) throws Exception {
        return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    }

    private static NodeList nodes(Document doc, String path) throws Exception {
        return (NodeList) XPATH.evaluate(path, doc, XPathConstants.NODESET);
    }

    @ParameterizedTest
    @CsvSource({"10, 5", "130, 80"})
    void extremeParametersStayInsideTheStraightRoad(int speed, int distance) throws Exception {
        Document doc = dom(XoscExport.export(Bundle.readSpec(ir("ego_speed_kmh", speed, "trigger_distance_m", distance))));
        NodeList positions = nodes(doc, "//LanePosition");
        assertThat(positions.getLength()).isPositive();
        for (int i = 0; i < positions.getLength(); i++) {
            Element p = (Element) positions.item(i);
            double s = Double.parseDouble(p.getAttribute("s"));
            assertThat(p.getAttribute("roadId")).isEqualTo("40");
            assertThat(p.getAttribute("laneId")).isEqualTo("-4");
            assertThat(s).isStrictlyBetween(0.0, 228.0);
        }
    }

    @Test
    void xmlMatchesTheSchemaCheckedGolden() throws IOException {
        String golden = Files.readString(Path.of("src/test/resources/golden/cp-crossing.xosc"), StandardCharsets.UTF_8);
        assertThat(XoscExport.export(Bundle.readSpec(ir()))).isEqualTo(golden);
    }

    @Test
    void roundTripPreservesSeedSourceAebVehicleAndEscapedLabels() {
        Map<String, Object> carla = Map.of("blueprint", "vehicle.audi.etron",
                "physics", Map.of("mass", 2490, "drag_coefficient", 0.28, "center_of_mass", Map.of("x", 0.1, "y", 0, "z", -0.2)),
                "dimensions", Map.of("height_m", 1.6, "wheelbase_m", 2.9));
        Map<String, Object> doc = Map.of("variant", ir(), "seed", 9007199254740993L,
                "source", Map.of("run_id", 42L, "scenario_id", 7L, "scenario_version_id", 8L, "aeb_version_id", 9L, "carla_vehicle_model_id", 10L, "simulator", "carla-0.9.16-xosc1"),
                "aeb", Map.of("label", "A & B < \"test\"", "params", Map.of("TTC_THRESHOLD", 1.8000000000000003)),
                "vehicle", Map.of("name", "Xe thử", "length_m", 4.9, "width_m", 1.93, "max_brake_decel_mps2", 8, "carla", carla));
        Bundle.RunSpec spec = Bundle.readSpec(doc);
        String xml = XoscExport.export(spec);
        assertThat(Xosc.read(xml)).isEqualTo(spec);
        assertThat(xml).contains("value=\"9007199254740993\"");
        assertThat(Xosc.read(xml).aebLabel()).isEqualTo("A & B < \"test\"");
    }

    @Test
    void pedestrianMovementUsesDistanceTriggerAndRealXmlActions() throws Exception {
        Document doc = dom(XoscExport.export(Bundle.readSpec(ir())));
        assertThat(nodes(doc, "/OpenSCENARIO/Entities/ScenarioObject[@name='hero']/Vehicle").getLength()).isEqualTo(1);
        assertThat(nodes(doc, "/OpenSCENARIO/Entities/ScenarioObject[@name='pedestrian']/Pedestrian").getLength()).isEqualTo(1);
        String event = "//Event[@name='StartCrossing']";
        assertThat(nodes(doc, event + "/StartTrigger//DistanceCondition").getLength()).isEqualTo(1);
        assertThat(nodes(doc, event + "/StartTrigger//SimulationTimeCondition").getLength()).isZero();
        assertThat(nodes(doc, event + "//FollowTrajectoryAction/Trajectory/Shape/Polyline/Vertex").getLength()).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void pedestrianPathCrossesTheLaneWithoutRotatingItsOffset(boolean stopsAtCurb) throws Exception {
        Document doc = dom(XoscExport.export(Bundle.readSpec(ir("stops_at_curb", stopsAtCurb))));
        Element spawn = (Element) nodes(doc, "/OpenSCENARIO/Storyboard/Init/Actions/Private[@entityRef='pedestrian']//LanePosition").item(0);
        NodeList route = nodes(doc, "//FollowTrajectoryAction/Trajectory/Shape/Polyline/Vertex/Position/LanePosition");
        assertThat(route.getLength()).isEqualTo(2);
        List<Element> positions = List.of(spawn, (Element) route.item(0), (Element) route.item(1));
        // ScenarioRunner 0.9.16 áp Orientation trước offset: hướng 90° sẽ biến offset ngang thành dịch chuyển dọc đường xe.
        for (Element p : positions) {
            assertThat(p.getElementsByTagName("Orientation").getLength()).isZero();
        }
        for (String key : List.of("roadId", "laneId", "s")) {
            assertThat(positions.stream().map(p -> p.getAttribute(key)).distinct()).hasSize(1);
        }
        double start = -Simulator.PEDESTRIAN_START_Y_M;
        assertThat(Double.parseDouble(spawn.getAttribute("offset"))).isEqualTo(start);
        assertThat(Double.parseDouble(positions.get(1).getAttribute("offset"))).isEqualTo(start);
        double finish = stopsAtCurb ? Simulator.CURB_STOP_Y_M : -Simulator.PEDESTRIAN_START_Y_M;
        assertThat(Double.parseDouble(positions.get(2).getAttribute("offset"))).isEqualTo(-finish);
        assertThat(Double.parseDouble(positions.get(2).getAttribute("offset"))).isLessThan(Double.parseDouble(positions.get(1).getAttribute("offset")));
    }

    @Test
    void v3ProfileIs100HzWithSensorPeriodPerception() {
        Xosc.Profile p = Xosc.profile(XoscExport.export(Bundle.readSpec(ir())));
        assertThat(p).isEqualTo(new Xosc.Profile("-xosc3", 0.01, 0.05));
    }

    @Test
    void v2FileStillRunsAs20HzWithItsOwnIdentity() {
        Bundle.RunSpec spec = Bundle.readSpec(ir());
        String old = XoscExport.export(spec).replace("vehicsim.xosc/v3", Xosc.LEGACY_FORMAT);
        assertThat(Xosc.profile(old)).isEqualTo(new Xosc.Profile("-xosc2", 0.05, 0.05));
        assertThat(Xosc.read(old)).isEqualTo(spec);
    }

    @ParameterizedTest
    @CsvSource({"0.05, 0.01", "0.01, 0.025", "0, 0.05", "x, 0.05"})
    void incompatibleTimingMetadataIsRejected(String step, String period) {
        String xml = XoscExport.export(Bundle.readSpec(ir()))
                .replace("name=\"vs_fixed_delta_seconds\" parameterType=\"string\" value=\"0.01\"", "name=\"vs_fixed_delta_seconds\" parameterType=\"string\" value=\"" + step + "\"")
                .replace("name=\"vs_perception_period_s\" parameterType=\"string\" value=\"0.05\"", "name=\"vs_perception_period_s\" parameterType=\"string\" value=\"" + period + "\"");
        assertThatThrownBy(() -> Xosc.profile(xml)).isInstanceOf(Bundle.BundleError.class);
    }

    @Test
    void unrelatedOrOldGeometryXoscIsRejectedInsteadOfRunningAsXosc2() {
        assertThatThrownBy(() -> Xosc.read("<OpenSCENARIO><ParameterDeclarations /></OpenSCENARIO>")).isInstanceOf(Bundle.BundleError.class).hasMessageContaining("vs_format");
        String v1 = XoscExport.export(Bundle.readSpec(ir())).replace("vehicsim.xosc/v3", "vehicsim.xosc/v1");
        assertThatThrownBy(() -> Xosc.read(v1)).isInstanceOf(Bundle.BundleError.class).hasMessageContaining("xuất lại từ web");
    }
}
