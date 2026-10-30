package com.vsos.backend;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Bất biến kiến trúc ép bằng CI thay vì bằng luật trong tài liệu (luật cứng 1, 2 và 8 của AGENTS.md; TD-33).
 * Quét thẳng mã nguồn nên không cần Spring, MySQL hay Redis.
 */
class ArchitectureRulesTest {

    private static final Path JAVA = Path.of("src/main/java");
    private static final Path WORKER = Path.of("worker");

    /** Dấu hiệu của logic AEB/mô phỏng/chấm điểm; chỉ {@code com.vsos.core} được chứa (ADR-042). Giữ khớp {@code worker/tests/test_bridge.py}. */
    private static final List<String> AEB_LOGIC_MARKERS =
            List.of("AebStack", "ttc_threshold", "decel_cmd =", "brake_pedal(", "DecelMeter", "CrossingFrame", "evaluate(");

    private static List<Path> files(Path root, String suffix) throws IOException {
        try (Stream<Path> s = Files.walk(root)) {
            return s.filter(p -> p.toString().endsWith(suffix)).sorted().toList();
        }
    }

    /** Luật 1: mọi lời gọi LLM đi qua {@code LlmService}; không nơi nào khác nhắc tới provider (đổi provider = đổi một biến môi trường). */
    @Test
    void onlyLlmServiceKnowsTheLlmProviders() throws IOException {
        Pattern provider = Pattern.compile("openai|deepseek|anthropic|gemini|litellm", Pattern.CASE_INSENSITIVE);
        List<String> offenders = files(JAVA, ".java").stream()
                .filter(p -> !p.getFileName().toString().equals("LlmService.java"))
                .filter(p -> {
                    try {
                        return provider.matcher(Files.readString(p)).find();
                    } catch (IOException e) {
                        throw new IllegalStateException(e);
                    }
                })
                .map(Path::toString).toList();
        assertThat(offenders).as("chỉ LlmService được nhắc tới provider LLM").isEmpty();
    }

    /** Luật 2: lõi Java và backend không import CARLA; lời gọi API {@code carla} chỉ ở adapter Python trong {@code worker/}. */
    @Test
    void javaBackendNeverTouchesCarlaApi() throws IOException {
        Pattern carlaImport = Pattern.compile("^\\s*import\\s+carla\\b", Pattern.MULTILINE | Pattern.CASE_INSENSITIVE);
        List<String> offenders = files(JAVA, ".java").stream().filter(p -> {
            try {
                return carlaImport.matcher(Files.readString(p)).find();
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }).map(Path::toString).toList();
        assertThat(offenders).isEmpty();
    }

    /** Luật 8: logic AEB, bộ mô phỏng và luật chấm chỉ ở {@code com.vsos.core}; {@code worker/} chỉ còn adapter CARLA. */
    @Test
    void pythonWorkerHoldsNoAebLogic() throws IOException {
        List<Path> modules;
        try (Stream<Path> s = Files.list(WORKER)) { // chỉ các module ngay trong worker/: không vào tests/ hay venv .venv-carla
            modules = s.filter(p -> p.toString().endsWith(".py")).sorted().toList();
        }
        assertThat(modules).as("adapter CARLA phải còn trong worker/").contains(WORKER.resolve("vehicsim_aeb_control.py"));
        List<String> offenders = new ArrayList<>();
        for (Path py : modules) {
            String text = Files.readString(py);
            for (String marker : AEB_LOGIC_MARKERS) {
                if (text.contains(marker)) {
                    offenders.add(py + ": " + marker);
                }
            }
            if (text.contains("vehicsim_core")) {
                offenders.add(py + ": tham chiếu lõi Python đã xóa (vehicsim_core)");
            }
        }
        assertThat(offenders).as("worker/*.py không được chứa logic AEB").isEmpty();
    }

    /** Lõi Python đã chuyển sang Java ở M5 và chỉ còn trong git history; không được khôi phục song song (hai bản AEB sẽ lệch nhau). */
    @Test
    void thePythonCoreStaysDeleted() throws IOException {
        // Thư mục có thể còn lại chỉ với __pycache__ (bị gitignore) trên máy từng chạy lõi cũ: chỉ file .py mới là vi phạm.
        Path core = WORKER.resolve("vehicsim_core");
        assertThat(Files.isDirectory(core) ? files(core, ".py") : List.<Path>of()).as("worker/vehicsim_core/*.py").isEmpty();
        for (String name : List.of("kinematic_sim.py", "sim_common.py", "openscenario_export.py", "run_variant.py")) {
            assertThat(WORKER.resolve(name)).as(name).doesNotExist();
        }
    }

    /** Mật khẩu / OTP / token không được vào câu log: mọi {@code log.xxx(...)} trong mã nguồn không chứa các từ khoá đó làm tham số. */
    @Test
    void logStatementsDoNotMentionSecretValues() throws IOException {
        Pattern logCall = Pattern.compile("log\\.(info|warn|error|debug)\\([^;]*;", Pattern.DOTALL);
        Pattern secretArg = Pattern.compile(",\\s*(rawPassword|password|newPassword|oldPassword|jwt|token|accessToken)\\b");
        List<String> offenders = files(JAVA, ".java").stream().flatMap(p -> {
            try {
                String text = Files.readString(p);
                return logCall.matcher(text).results()
                        .map(m -> m.group())
                        .filter(call -> secretArg.matcher(call).find())
                        .map(call -> p + ": " + call.replaceAll("\\s+", " ").toLowerCase(Locale.ROOT));
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }).toList();
        assertThat(offenders).isEmpty();
    }
}
