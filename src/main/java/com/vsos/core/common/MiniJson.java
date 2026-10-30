package com.vsos.core.common;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.core.bridge.Bundle;

/**
 * Bộ đọc/ghi JSON tối thiểu, chỉ dùng JDK (ADR-042): lõi và cầu nối CARLA chạy bằng {@code java -cp target/classes} không cần Jackson, nên khởi động nhanh
 * và không kéo theo hạ tầng backend.
 *
 * <p>Giữ phân biệt số nguyên ({@link Long}/{@link BigInteger}) với số thực ({@link Double}) như {@code json} của Python, vì {@link Bundle} kiểm "seed phải là
 * số nguyên". Ghi theo kiểu Python ({@code ", "} và {@code ": "}, số thực theo {@code repr}, chữ Unicode giữ nguyên) để {@code result.json} giống các file cũ.</p>
 */
public final class MiniJson {

    private final String text;
    private int pos;

    private MiniJson(String text) {
        this.text = text;
    }

    public static Object parse(String text) {
        MiniJson parser = new MiniJson(text);
        parser.skipSpace();
        Object value = parser.value();
        parser.skipSpace();
        if (parser.pos != text.length()) {
            throw parser.error("còn dữ liệu sau giá trị JSON");
        }
        return value;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String text) {
        Object value = parse(text);
        if (!(value instanceof Map)) {
            throw new IllegalArgumentException("JSON phải là một object");
        }
        return (Map<String, Object>) value;
    }

    // ------------------------------------------------------------------ đọc

    private IllegalArgumentException error(String message) {
        return new IllegalArgumentException("JSON không hợp lệ tại vị trí " + pos + ": " + message);
    }

    private void skipSpace() {
        while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) {
            pos++;
        }
    }

    private Object value() {
        if (pos >= text.length()) {
            throw error("hết dữ liệu");
        }
        char c = text.charAt(pos);
        switch (c) {
            case '{':
                return object();
            case '[':
                return array();
            case '"':
                return string();
            case 't':
                return literal("true", Boolean.TRUE);
            case 'f':
                return literal("false", Boolean.FALSE);
            case 'n':
                return literal("null", null);
            default:
                if (c == '-' || (c >= '0' && c <= '9')) {
                    return number();
                }
                throw error("ký tự không mong đợi '" + c + "'");
        }
    }

    private Object literal(String word, Object value) {
        if (!text.startsWith(word, pos)) {
            throw error("mong đợi " + word);
        }
        pos += word.length();
        return value;
    }

    private Map<String, Object> object() {
        Map<String, Object> out = new LinkedHashMap<>();
        pos++;
        skipSpace();
        if (pos < text.length() && text.charAt(pos) == '}') {
            pos++;
            return out;
        }
        while (true) {
            skipSpace();
            if (pos >= text.length() || text.charAt(pos) != '"') {
                throw error("mong đợi khóa chuỗi");
            }
            String key = string();
            skipSpace();
            if (pos >= text.length() || text.charAt(pos) != ':') {
                throw error("mong đợi ':'");
            }
            pos++;
            skipSpace();
            out.put(key, value());
            skipSpace();
            if (pos >= text.length()) {
                throw error("hết dữ liệu trong object");
            }
            char c = text.charAt(pos++);
            if (c == '}') {
                return out;
            }
            if (c != ',') {
                throw error("mong đợi ',' hoặc '}'");
            }
        }
    }

    private List<Object> array() {
        List<Object> out = new ArrayList<>();
        pos++;
        skipSpace();
        if (pos < text.length() && text.charAt(pos) == ']') {
            pos++;
            return out;
        }
        while (true) {
            skipSpace();
            out.add(value());
            skipSpace();
            if (pos >= text.length()) {
                throw error("hết dữ liệu trong mảng");
            }
            char c = text.charAt(pos++);
            if (c == ']') {
                return out;
            }
            if (c != ',') {
                throw error("mong đợi ',' hoặc ']'");
            }
        }
    }

    private String string() {
        StringBuilder sb = new StringBuilder();
        pos++;
        while (true) {
            if (pos >= text.length()) {
                throw error("chuỗi chưa đóng");
            }
            char c = text.charAt(pos++);
            if (c == '"') {
                return sb.toString();
            }
            if (c != '\\') {
                sb.append(c);
                continue;
            }
            if (pos >= text.length()) {
                throw error("escape chưa hoàn tất");
            }
            char e = text.charAt(pos++);
            switch (e) {
                case '"', '\\', '/' -> sb.append(e);
                case 'b' -> sb.append('\b');
                case 'f' -> sb.append('\f');
                case 'n' -> sb.append('\n');
                case 'r' -> sb.append('\r');
                case 't' -> sb.append('\t');
                case 'u' -> {
                    if (pos + 4 > text.length()) {
                        throw error("\\u chưa đủ 4 chữ số");
                    }
                    try {
                        sb.append((char) Integer.parseInt(text.substring(pos, pos + 4), 16));
                    } catch (NumberFormatException ex) {
                        throw error("\\u không hợp lệ");
                    }
                    pos += 4;
                }
                default -> throw error("escape không hợp lệ \\" + e);
            }
        }
    }

    private Object number() {
        int start = pos;
        if (text.charAt(pos) == '-') {
            pos++;
        }
        boolean real = false;
        while (pos < text.length()) {
            char c = text.charAt(pos);
            if (c >= '0' && c <= '9') {
                pos++;
            } else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') {
                real = true;
                pos++;
            } else {
                break;
            }
        }
        String token = text.substring(start, pos);
        try {
            if (real) {
                return Double.parseDouble(token);
            }
            BigInteger big = new BigInteger(token);
            return big.bitLength() < 64 ? (Object) big.longValue() : big;
        } catch (NumberFormatException ex) {
            pos = start;
            throw error("số không hợp lệ '" + token + "'");
        }
    }

    // ------------------------------------------------------------------ ghi

    public static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object value) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof Boolean b) {
            sb.append(b ? "true" : "false");
        } else if (value instanceof Double || value instanceof Float) {
            double d = ((Number) value).doubleValue();
            if (!Double.isFinite(d)) {
                throw new IllegalArgumentException("JSON không có biểu diễn cho " + d);
            }
            sb.append(Py.reprFloat(d));
        } else if (value instanceof Number n) {
            sb.append(n);
        } else if (value instanceof CharSequence s) {
            writeString(sb, s.toString());
        } else if (value instanceof Map<?, ?> map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : map.entrySet()) {
                sb.append(first ? "" : ", ");
                writeString(sb, String.valueOf(e.getKey()));
                sb.append(": ");
                write(sb, e.getValue());
                first = false;
            }
            sb.append('}');
        } else if (value instanceof Iterable<?> items) {
            sb.append('[');
            boolean first = true;
            for (Object item : items) {
                sb.append(first ? "" : ", ");
                write(sb, item);
                first = false;
            }
            sb.append(']');
        } else if (value instanceof Object[] items) {
            write(sb, java.util.Arrays.asList(items));
        } else if (value instanceof double[] items) {
            sb.append('[');
            for (int i = 0; i < items.length; i++) {
                sb.append(i == 0 ? "" : ", ").append(Py.reprFloat(items[i]));
            }
            sb.append(']');
        } else {
            throw new IllegalArgumentException("không ghi được kiểu " + value.getClass().getName() + " thành JSON");
        }
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }
}
