package com.vehicsim.vehicsim;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * **Chỗ duy nhất gọi LLM** (port của ``services/llm.py``): DeepSeek / OpenAI nói giao thức chat-completions, ép đầu ra có
 * cấu trúc bằng tool call bắt buộc, tự leo model ở lần thử thứ ba, và ghi lại chi phí từng lượt.
 */
@Slf4j
@Service
public class LlmService {

    /** Cấu hình LLM (prefix {@code llm}); tên biến môi trường giữ như backend Python cũ. */
    @ConfigurationProperties(prefix = "llm")
    public record Properties(String provider, String openaiApiKey, String openaiBaseUrl, String deepseekApiKey, String deepseekBaseUrl,
                             String modelName, String escalatedModel, String reasoningEffort, double temperature, int timeoutSeconds) {

        public boolean isDeepseek() {
            return "deepseek".equalsIgnoreCase(provider);
        }

        public String apiKey() {
            return isDeepseek() ? deepseekApiKey : openaiApiKey;
        }

        public String baseUrl() {
            String url = isDeepseek() ? deepseekBaseUrl : openaiBaseUrl;
            return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        }

        /** Model mặc định đi theo provider, trừ khi .env đặt rõ MODEL_NAME / ESCALATED_MODEL. */
        public String primaryModel() {
            return modelName != null && !modelName.isBlank() ? modelName : isDeepseek() ? "deepseek-flash" : "gpt-5.4-mini";
        }

        public String escalated() {
            return escalatedModel != null && !escalatedModel.isBlank() ? escalatedModel : isDeepseek() ? "deepseek-v4-pro" : "gpt-5.4";
        }
    }

    /** Giá theo 1M token (USD). DeepSeek ghi giá CAO ĐIỂM: số báo cáo là trần trên, không bao giờ thấp hơn hoá đơn thật. */
    private static final Map<String, double[]> MODEL_COSTS = Map.of(
            "gpt-5.6-luna", new double[]{0.20, 0.02, 1.20},
            "gpt-5.4-mini", new double[]{0.75, 0.075, 4.5},
            "gpt-5.4", new double[]{2.5, 0.25, 15.0},
            "deepseek-flash", new double[]{0.30, 0.006, 1.20},
            "deepseek-v4-pro", new double[]{1.32, 0.044, 3.96});

    private static final int MAX_RETRIES = 3;

    /** Kết quả một lượt gọi thành công. */
    public record Call(Map<String, Object> result, String model, boolean escalated, double costUsd) {
    }

    private final Properties props;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public LlmService(Properties props) {
        this.props = props;
    }

    public Properties properties() {
        return props;
    }

    public static double tokenCostUsd(String model, long inputTokens, long outputTokens, long cachedInputTokens) {
        double[] prices = MODEL_COSTS.get(model);
        if (prices == null) {
            return 0.0;
        }
        long uncached = Math.max(0, inputTokens - cachedInputTokens);
        return (uncached * prices[0] + cachedInputTokens * prices[1] + outputTokens * prices[2]) / 1_000_000;
    }

    /**
     * Gọi LLM, ép trả về đối tượng khớp {@code schema}. Lần 0 và 1 dùng model bậc 1, lần 2 dùng model leo thang;
     * thử hết {@value #MAX_RETRIES} lần mà vẫn lỗi thì ném lại lỗi cuối.
     */
    public Call callWithEscalation(List<Map<String, Object>> messages, Map<String, Object> schema) {
        RuntimeException last = null;
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            boolean escalated = attempt >= 2;
            String model = escalated ? props.escalated() : props.primaryModel();
            try {
                return callOnce(model, escalated, messages, schema);
            } catch (RuntimeException e) {
                last = e;
                log.warn("llm_call_retry model={} attempt={} error={}", model, attempt, e.getMessage());
            }
        }
        throw last != null ? last : new IllegalStateException("callWithEscalation kết thúc mà không có kết quả lẫn lỗi");
    }

    @SuppressWarnings("unchecked")
    private Call callOnce(String model, boolean escalated, List<Map<String, Object>> messages, Map<String, Object> schema) {
        if (props.apiKey() == null || props.apiKey().isBlank()) {
            throw new IllegalStateException("chưa cấu hình API key cho provider " + props.provider());
        }
        Map<String, Object> function = Json.obj("name", "extract", "description", "Trả về kết quả có cấu trúc", "parameters", schema);
        Map<String, Object> body = Json.obj(
                "model", model,
                "messages", messages,
                "temperature", props.temperature(),
                "tools", List.of(Json.obj("type", "function", "function", function)),
                "tool_choice", Json.obj("type", "function", "function", Json.obj("name", "extract")));
        if (props.reasoningEffort() != null && !props.reasoningEffort().isBlank()) {
            body.put("reasoning_effort", props.reasoningEffort());
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(props.baseUrl() + "/chat/completions"))
                .timeout(Duration.ofSeconds(props.timeoutSeconds()))
                .header("Authorization", "Bearer " + props.apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(Json.write(body)))
                .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new IllegalStateException("LLM không phản hồi: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("LLM bị ngắt", e);
        }
        if (response.statusCode() / 100 != 2) {
            String snippet = response.body() == null ? "" : response.body().substring(0, Math.min(200, response.body().length()));
            throw new IllegalStateException("LLM trả HTTP " + response.statusCode() + ": " + snippet);
        }
        Map<String, Object> json = Json.parseMap(response.body());
        List<Object> choices = Json.asList(json.get("choices"));
        if (choices.isEmpty()) {
            throw new IllegalStateException("LLM không trả choices");
        }
        Map<String, Object> message = Json.asMap(Json.asMap(choices.get(0)).get("message"));
        List<Object> toolCalls = Json.asList(message.get("tool_calls"));
        if (toolCalls.isEmpty()) {
            throw new IllegalStateException("LLM không trả tool call (output không phải JSON có cấu trúc)");
        }
        String arguments = String.valueOf(Json.asMap(Json.asMap(toolCalls.get(0)).get("function")).get("arguments"));
        Map<String, Object> result = Json.parseMap(arguments);

        Map<String, Object> usage = Json.asMap(json.get("usage"));
        long in = usage.get("prompt_tokens") instanceof Number n ? n.longValue() : 0;
        long out = usage.get("completion_tokens") instanceof Number n ? n.longValue() : 0;
        long cached = Json.asMap(usage.get("prompt_tokens_details")).get("cached_tokens") instanceof Number n ? n.longValue() : 0;
        return new Call(result, model, escalated, tokenCostUsd(model, in, out, cached));
    }

    public static Map<String, Object> message(String role, String content) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("role", role);
        m.put("content", content);
        return m;
    }
}
