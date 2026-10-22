package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.Test;

/** Bộ JSON tối thiểu của lõi phải đọc/ghi giống Jackson và giữ phân biệt số nguyên/số thực như Python (ADR-042). */
class MiniJsonTest {

    private static final ObjectMapper JACKSON = new ObjectMapper();

    private static String fixtureText(String name) throws IOException {
        try (InputStream in = MiniJsonTest.class.getResourceAsStream("/parity/" + name)) {
            assertThat(in).isNotNull();
            InputStream stream = name.endsWith(".gz") ? new GZIPInputStream(in) : in;
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void readsEveryParityFixtureLikeJackson() throws IOException {
        for (String name : List.of("rng.json", "round.json", "format.json", "libm.json", "filters.json", "bundle.json", "kinematic.json.gz")) {
            String text = fixtureText(name);
            List<String> diffs = new ArrayList<>();
            KinematicParityTest.compare(name, Map.of("v", JACKSON.readValue(text, Object.class)), Map.of("v", MiniJson.parse(text)), diffs);
            assertThat(diffs).as(name).isEmpty();
        }
    }

    @Test
    void writesWhatJacksonAndPythonCanReadBack() throws IOException {
        for (String name : List.of("bundle.json", "kinematic.json.gz", "filters.json")) {
            Object parsed = MiniJson.parse(fixtureText(name));
            String written = MiniJson.write(parsed);
            List<String> diffs = new ArrayList<>();
            KinematicParityTest.compare(name, Map.of("v", parsed), Map.of("v", JACKSON.readValue(written, Object.class)), diffs);
            assertThat(diffs).as(name).isEmpty();
            assertThat(MiniJson.write(MiniJson.parse(written))).as("ghi lại ổn định " + name).isEqualTo(written);
        }
    }

    @Test
    void keepsIntegersAndFloatsApartAndFormatsFloatsLikePythonRepr() {
        Map<String, Object> m = MiniJson.parseObject("{\"i\": 5, \"f\": 5.0, \"big\": 9223372036854775808, \"neg\": -3, \"e\": 1e-05, \"nz\": -0.0}");
        assertThat(m.get("i")).isEqualTo(5L);
        assertThat(m.get("f")).isEqualTo(5.0);
        assertThat(m.get("big")).isEqualTo(new BigInteger("9223372036854775808"));
        assertThat(m.get("neg")).isEqualTo(-3L);
        assertThat(MiniJson.write(m)).isEqualTo("{\"i\": 5, \"f\": 5.0, \"big\": 9223372036854775808, \"neg\": -3, \"e\": 1e-05, \"nz\": -0.0}");
    }

    @Test
    void handlesEscapesUnicodeAndSurrogatePairs() {
        String json = "{\"s\": \"a\\n\\\"b\\\\ \\u00e9 \\ud83d\\ude00 Việt ²\"}";
        Map<String, Object> m = MiniJson.parseObject(json);
        assertThat(m.get("s")).isEqualTo("a\n\"b\\ é 😀 Việt ²");
        assertThat(MiniJson.write(m)).isEqualTo("{\"s\": \"a\\n\\\"b\\\\ é 😀 Việt ²\"}");
        assertThat(MiniJson.write("\u0001")).isEqualTo("\"\\u0001\"");
    }

    @Test
    void rejectsMalformedInputWithAPosition() {
        for (String bad : List.of("", "{", "[1,", "{\"a\" 1}", "{\"a\": }", "tru", "\"abc", "[1] x", "{\"a\": 1,}", "-", "01x")) {
            assertThatThrownBy(() -> MiniJson.parse(bad)).as(bad).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> MiniJson.write(Double.NaN)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> MiniJson.write(new Object())).isInstanceOf(IllegalArgumentException.class);
    }
}
