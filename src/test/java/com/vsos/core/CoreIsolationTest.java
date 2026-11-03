package com.vsos.core;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Lõi {@code com.vsos.core} (ADR-042) là code thuần: không Spring, không DB, không {@code carla}, không import phần còn lại của backend. Nhờ vậy cầu nối
 * CARLA chạy nó như một tiến trình nhỏ độc lập và bộ động học chạy trong tiến trình backend mà không kéo theo hạ tầng.
 */
class CoreIsolationTest {

    private static final Path CORE = Path.of("src/main/java/com/vsos/core");
    private static final Pattern FORBIDDEN = Pattern.compile(
            "^\\s*import\\s+(org\\.springframework|jakarta\\.persistence|jakarta\\.servlet|javax\\.(persistence|servlet|sql)|com\\.vsos\\.backend\\b|carla\\b)", Pattern.MULTILINE);

    @Test
    void coreImportsNothingFromSpringDatabaseOrTheRestOfTheBackend() throws IOException {
        List<Path> files;
        try (Stream<Path> walk = Files.walk(CORE)) {
            files = walk.filter(p -> p.toString().endsWith(".java")).toList();
        }
        assertThat(files).as("lõi phải có file").hasSizeGreaterThan(5);
        for (Path file : files) {
            assertThat(FORBIDDEN.matcher(Files.readString(file)).find()).as("%s import hạ tầng ngoài lõi", file).isFalse();
        }
    }
}
