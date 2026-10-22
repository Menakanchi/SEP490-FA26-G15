package com.vehicsim.vehicsim;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class DescribeServiceTest {

    private static LlmService.Properties props(String baseUrl, String key) {
        return new LlmService.Properties("deepseek", "", "https://api.openai.com/v1", key, baseUrl, "", "", "none", 0.7, 5);
    }

    @Test
    void ruleBasedExtractsOnlyWhatTheSentenceSays() {
        Map<String, Object> ir = DescribeService.ruleBased("Xe VF8 chạy 60 km/h ban đêm trời mưa, một người đi bộ lao ra khi xe còn cách 25 m");
        assertEquals(true, ir.get("is_pedestrian_crossing"));
        assertEquals(60.0, ir.get("ego_speed_kmh"));
        assertEquals(25.0, ir.get("trigger_distance_m"));
        assertEquals(3.0, ir.get("pedestrian_speed_mps"));
        assertEquals("RAIN", ir.get("weather"));
        assertEquals("NIGHT", ir.get("time_of_day"));
        assertEquals(false, ir.get("stops_at_curb"));
        assertEquals(List.of("pedestrian_speed_mps"), ir.get("inferred_fields"));
    }

    @Test
    void vagueSentencesAreRejectedBeforeAnyLlmCall() {
        assertTrue(DescribeService.isTooVagueToGenerate("ab"));
        assertTrue(DescribeService.isTooVagueToGenerate("12345678901"));
        assertTrue(DescribeService.isTooVagueToGenerate("xechaynhanhqua dimatroi")); // dài đủ nhưng chỉ 2 từ
        assertFalse(DescribeService.isTooVagueToGenerate("xe chạy nhanh")); // đúng 3 từ, 13 ký tự: không bị chặn
        assertFalse(DescribeService.isTooVagueToGenerate("xe chạy 50 km/h gặp người đi bộ"));
    }

    @Test
    void outOfRangeValuesAreReportedForRepair() {
        Map<String, Object> ir = DescribeService.validate(Map.of("is_pedestrian_crossing", true, "ego_speed_kmh", 300), new java.util.ArrayList<>());
        List<String> issues = DescribeService.check(ir);
        assertEquals(1, issues.size());
        assertTrue(issues.get(0).contains("Tốc độ xe ego = 300 km/h"));
    }

    @Test
    void withoutApiKeyDescribeFallsBackToRulesAndSaysWhy() {
        DescribeService service = new DescribeService(new LlmService(props("http://localhost:1", "")));
        Map<String, Object> out = service.describe("Người đi bộ đứng ở mép đường rồi dừng lại, không sang đường; xe chạy 40 km/h");
        assertEquals("rules", out.get("source"));
        assertNotNull(out.get("llm_error"));
        Map<String, Object> ir = Json.asMap(out.get("ir"));
        assertEquals(40.0, ir.get("ego_speed_kmh"));
        assertEquals(true, ir.get("stops_at_curb"));
        assertTrue(Json.asList(out.get("assumed")).contains("trigger_distance_m")); // câu không nói -> giả định, không bịa
    }

    @Test
    void llmPathParsesTheForcedToolCallAndComputesCost() throws IOException {
        AtomicInteger calls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            calls.incrementAndGet();
            String reply = "{\"choices\":[{\"message\":{\"tool_calls\":[{\"function\":{\"name\":\"extract\",\"arguments\":"
                    + Json.write("{\"is_pedestrian_crossing\":true,\"title\":\"Đêm mưa\",\"ego_speed_kmh\":60,\"trigger_distance_m\":25,"
                    + "\"pedestrian_speed_mps\":3.0,\"stops_at_curb\":false,\"weather\":\"RAIN\",\"time_of_day\":\"NIGHT\","
                    + "\"inferred_fields\":[\"pedestrian_speed_mps\"]}")
                    + "}}]}}],\"usage\":{\"prompt_tokens\":1000,\"completion_tokens\":200}}";
            byte[] bytes = reply.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            DescribeService service = new DescribeService(new LlmService(props("http://127.0.0.1:" + server.getAddress().getPort(), "test-key")));
            Map<String, Object> out = service.describe("Xe chạy 60 km/h ban đêm trời mưa, người đi bộ lao ra khi xe còn cách 25 m");
            assertEquals("llm", out.get("source"));
            assertEquals("deepseek-flash", out.get("model"));
            assertEquals(1, calls.get());
            assertEquals("Đêm mưa", out.get("title"));
            Map<String, Object> ir = Json.asMap(out.get("ir"));
            assertEquals(25.0, ir.get("trigger_distance_m"));
            assertEquals("inferred", Json.asList(out.get("fields")).stream().map(Json::asMap)
                    .filter(f -> "pedestrian_speed_mps".equals(f.get("key"))).findFirst().orElseThrow().get("origin"));
            // 1000 token vào x $0.30/M + 200 token ra x $1.20/M = $0.00054
            assertEquals(0.00054, (Double) out.get("cost_usd"), 1e-9);
        } finally {
            server.stop(0);
        }
    }
}
