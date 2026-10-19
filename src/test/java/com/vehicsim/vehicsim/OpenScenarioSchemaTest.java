package com.vehicsim.vehicsim;

import org.junit.jupiter.api.Test;

import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;
import java.nio.file.Path;

class OpenScenarioSchemaTest {
    @Test
    void exportedPedestrianGoldenValidatesAgainstOpenScenario10() throws Exception {
        var factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        var schema = factory.newSchema(Path.of("tests/schemas/OpenSCENARIO_1_0.xsd").toFile());
        schema.newValidator().validate(new StreamSource(Path.of("worker/tests/fixtures/cp-crossing.xosc").toFile()));
    }
}
