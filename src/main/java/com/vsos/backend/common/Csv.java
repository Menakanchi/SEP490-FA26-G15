package com.vsos.backend.common;

import java.nio.charset.StandardCharsets;

/** Ô CSV dùng chung cho failures.csv và gói xuất regression. */
public final class Csv {

    private Csv() {
    }

    /** Excel recognizes Vietnamese UTF-8 reports from their BOM; raw simulation artifacts remain byte-for-byte unchanged. */
    public static byte[] utf8WithBom(String csv) {
        int start = 0;
        while (start < csv.length() && csv.charAt(start) == '\uFEFF') {
            start++;
        }
        return ("\uFEFF" + csv.substring(start)).getBytes(StandardCharsets.UTF_8);
    }

    /** Định dạng QUOTE_MINIMAL, chặn công thức trong chuỗi; null -> rỗng, bool -> True/False. */
    public static String cell(Object value) {
        if (value == null) {
            return "";
        }
        String s = value instanceof Boolean b ? (b ? "True" : "False") : String.valueOf(value);
        // CSV injection: ô chữ bắt đầu bằng = + - @ (hoặc tab / CR) bị Excel hiểu là công thức. Tên họ kịch bản do người dùng đặt.
        // Chỉ chuỗi mới bị chặn; số âm (vd. -0.5) là Number nên giữ nguyên.
        if (value instanceof String && !s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0) {
            s = "'" + s;
        }
        return s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }
}
