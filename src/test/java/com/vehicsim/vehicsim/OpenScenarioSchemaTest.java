package com.vehicsim.vehicsim;

import com.vehicsim.core.Bundle;
import com.vehicsim.core.XoscExport;
import org.junit.jupiter.api.Test;

import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import java.io.StringReader;
import java.nio.file.Path;
import java.util.Map;

/** OpenSCENARIO 1.0: file xuất của lõi (ADR-042) và golden đã kiểm schema đều hợp lệ theo XSD. */
class OpenScenarioSchemaTest {

    private static Schema schema() throws Exception {
        var factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        return factory.newSchema(Path.of("tests/schemas/OpenSCENARIO_1_0.xsd").toFile());
    }

    @Test
    void exportedPedestrianGoldenValidatesAgainstOpenScenario10() throws Exception {
        schema().newValidator().validate(new StreamSource(Path.of("src/test/resources/golden/cp-crossing.xosc").toFile()));
    }

    @Test
    void everyFreshExportValidatesAgainstOpenScenario10() throws Exception {
        Schema schema = schema();
        for (Map<String, Object> variant : java.util.List.of(
                Map.<String, Object>of("ego_speed_kmh", 40, "trigger_distance_m", 25, "pedestrian_speed_mps", 3, "weather", "RAIN", "time_of_day", "NIGHT"),
                Map.<String, Object>of("ego_speed_kmh", 130, "trigger_distance_m", 80, "pedestrian_speed_mps", 1.4, "stops_at_curb", true),
                Map.<String, Object>of("ego_speed_kmh", 10, "trigger_distance_m", 5, "pedestrian_speed_mps", 8, "weather", "FOG", "time_of_day", "DUSK", "friction", 0.6))) {
            String xml = XoscExport.export(Bundle.readSpec(variant));
            schema.newValidator().validate(new StreamSource(new StringReader(xml)));
        }
    }
}
