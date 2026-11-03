package com.vsos.core.aeb;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import com.vsos.core.evaluation.Evaluation;

/**
 * Danh mục tham số AEB và loại lỗi mà lõi ghi phải khớp schema và seed của backend (ADR-042; chuyển từ {@code worker/tests/test_simulator.py}).
 */
class AebParameterSeedTest {

    private static final Path SQL_SCHEMA = Path.of("database/mysql/01_schema.sql");
    private static final Path JAVA_SEED = Path.of("src/main/java/com/vsos/backend/service/system/BootstrapService.java");
    private static final Path EVALUATION = Path.of("src/main/java/com/vsos/core/evaluation/Evaluation.java");

    private static String read(Path p) throws IOException {
        return Files.readString(p, StandardCharsets.UTF_8);
    }

    /** {code: "category|min|max|default|sort"} mà {@code BootstrapService} seed. */
    private static Map<String, String> seedFromJava() throws IOException {
        Matcher m = Pattern.compile("new Object\\[\\]\\{\"(\\w+)\", \"[^\"]*\", \"(\\w+)\", \"[^\"]*\", ([\\d.]+), ([\\d.]+), ([\\d.]+), (\\d+)\\}").matcher(read(JAVA_SEED));
        Map<String, String> out = new LinkedHashMap<>();
        while (m.find()) {
            out.put(m.group(1), m.group(2) + "|" + Double.parseDouble(m.group(3)) + "|" + Double.parseDouble(m.group(4)) + "|" + Double.parseDouble(m.group(5)) + "|" + m.group(6));
        }
        return out;
    }

    @Test
    void everyFailureTypeTheEvaluatorWritesExistsInTheSqlEnum() throws IOException {
        Matcher enumMatch = Pattern.compile("failure_type\\s+ENUM\\(([^)]*)\\)").matcher(read(SQL_SCHEMA));
        assertThat(enumMatch.find()).as("không thấy ENUM failure_type trong 01_schema.sql").isTrue();
        Set<String> allowed = new TreeSet<>();
        Matcher values = Pattern.compile("'(\\w+)'").matcher(enumMatch.group(1));
        while (values.find()) {
            allowed.add(values.group(1));
        }
        Set<String> written = new TreeSet<>();
        for (String line : read(EVALUATION).split("\n")) {
            Matcher w = Pattern.compile("(?:failure_type\"|failureType)[^\\n]*?\"([A-Z_]+)\"").matcher(line);
            while (w.find()) {
                written.add(w.group(1));
            }
        }
        assertThat(written).as("loại lỗi mà Evaluation ghi").isNotEmpty();
        assertThat(allowed).containsAll(written);
    }

    @Test
    void everySeededParameterIsUsedByTheSimulator() throws IOException {
        assertThat(seedFromJava()).isNotEmpty();
        assertThat(seedFromJava().keySet()).isSubsetOf(AebParams.CODES);
    }

    @Test
    void javaParameterSeedMatchesSqlSeed() throws IOException {
        // BootstrapService seed phải khớp SEED DATA trong 01_schema.sql.
        String sql = read(SQL_SCHEMA);
        String block = sql.substring(sql.indexOf("INSERT INTO aeb_parameters"));
        block = block.substring(0, block.indexOf(';'));
        Matcher m = Pattern.compile("\\('(\\w+)',\\s*'[^']*',\\s*'(\\w+)',\\s*'[^']*',\\s*'[^']*',\\s*([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+),\\s*(\\d+)\\)").matcher(block);
        Map<String, String> fromSql = new LinkedHashMap<>();
        while (m.find()) {
            fromSql.put(m.group(1), m.group(2) + "|" + Double.parseDouble(m.group(3)) + "|" + Double.parseDouble(m.group(4)) + "|" + Double.parseDouble(m.group(5)) + "|" + m.group(6));
        }
        assertThat(fromSql).isNotEmpty().isEqualTo(seedFromJava());
    }
}
