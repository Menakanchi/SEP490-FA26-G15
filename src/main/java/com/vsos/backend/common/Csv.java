package com.vsos.backend.common;

/** Ô CSV dùng chung cho failures.csv và gói xuất regression. */
public final class Csv {

    private Csv() {
    }

    /** Như ``csv.writer`` (QUOTE_MINIMAL): bao dấu nháy khi có dấu phẩy / nháy / xuống dòng; None -> rỗng; bool -> True/False. */
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
