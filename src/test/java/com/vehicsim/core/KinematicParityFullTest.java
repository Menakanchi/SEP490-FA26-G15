package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/**
 * Đối chiếu rộng (ad hoc): toàn bộ lưới 1296 ca của lõi Python, không nằm trong repo vì nặng. Sinh bằng lõi Python (commit trước M5) rồi chạy
 * {@code mvnw -Dtest=KinematicParityFullTest -Dvsos.parity.full=<file.jsonl.gz> test}. Bỏ qua khi không có thuộc tính.
 */
@EnabledIfSystemProperty(named = "vsos.parity.full", matches = ".+")
class KinematicParityFullTest {

    @Test
    void wholeGridMatchesThePythonCore() throws IOException {
        Path file = Path.of(System.getProperty("vsos.parity.full"));
        ObjectMapper mapper = new ObjectMapper();
        List<String> diffs = new ArrayList<>();
        int count = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new GZIPInputStream(Files.newInputStream(file)), StandardCharsets.UTF_8))) {
            for (String line; (line = reader.readLine()) != null; ) {
                @SuppressWarnings("unchecked")
                Map<String, Object> c = mapper.readValue(line, Map.class);
                KinematicParityTest.checkCase(c, "lưới #" + count, diffs);
                count++;
            }
        }
        assertThat(count).isEqualTo(1296);
        assertThat(diffs).as("%d sai khác so với lõi Python", diffs.size()).isEmpty();
    }
}
