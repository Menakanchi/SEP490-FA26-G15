package com.vehicsim;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Bất biến kiến trúc ép bằng CI thay vì bằng luật trong tài liệu (luật cứng 1 và 8 của AGENTS.md; TD-33).
 * Quét thẳng mã nguồn nên không cần Spring, MySQL hay Redis.
 */
class ArchitectureRulesTest {

    private static final Path JAVA = Path.of("src/main/java");
    private static final Path WORKER_CORE = Path.of("worker/vehicsim_core");

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

    /** Luật 8: lõi mô phỏng chỉ dùng thư viện chuẩn và không bao giờ import CARLA (CARLA chỉ ở {@code worker/run_variant.py}). */
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

    @Test
    void simulationCoreNeverImportsCarla() throws IOException {
        Pattern carlaImport = Pattern.compile("^\\s*(import|from)\\s+carla\\b", Pattern.MULTILINE);
        List<String> offenders = files(WORKER_CORE, ".py").stream().filter(p -> {
            try {
                return carlaImport.matcher(Files.readString(p)).find();
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }).map(Path::toString).toList();
        assertThat(offenders).as("worker/vehicsim_core không được import carla").isEmpty();
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
