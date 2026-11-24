package com.vsos.backend.common;

/** Ô CSV dùng chung cho failures.csv và gói xuất regression. */
public final class Csv {

    private Csv() {
    }

    /**
     * Định dạng một ô giá trị theo chuẩn CSV an toàn (QUOTE_MINIMAL), phòng chống CSV Injection.
     *
     * @param value đối tượng dữ liệu cần định dạng
     * @return chuỗi đã được bao dấu nháy hoặc escape chuẩn xác
     */
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
