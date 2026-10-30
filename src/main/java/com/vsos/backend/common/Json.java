package com.vsos.backend.common;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** JSON thủ công cho các cột JSON của DB và tài liệu bundle/result — số thực giữ nguyên kiểu như ``json`` của Python. */
public final class Json {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Json() {
    }

    public static Map<String, Object> parseMap(String text) {
        try {
            return MAPPER.readValue(text, new TypeReference<LinkedHashMap<String, Object>>() {
            });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("JSON không hợp lệ: " + e.getOriginalMessage(), e);
        }
    }

    public static List<Object> parseList(String text) {
        try {
            return MAPPER.readValue(text, new TypeReference<List<Object>>() {
            });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("JSON không hợp lệ: " + e.getOriginalMessage(), e);
        }
    }

    public static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Map có thứ tự khoá, cho phép giá trị null: ``obj("a", 1, "b", null)``. */
    public static Map<String, Object> obj(Object... keyValues) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            out.put((String) keyValues[i], keyValues[i + 1]);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> asMap(Object value) {
        return value instanceof Map ? (Map<String, Object>) value : Map.of();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> asList(Object value) {
        return value instanceof List ? (List<Object>) value : List.of();
    }

    public static Double asDouble(Object value) {
        return value instanceof Number n ? n.doubleValue() : null;
    }
}
