package com.vsos.core.common;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

/**
 * Hành vi số học và định dạng của CPython mà lõi mô phỏng dựa vào (ADR-042). Cùng seed + cùng tham số phải ra
 * cùng từng số lưu, nên {@code round}, {@code f"{x:.1f}"} và {@code hypot} ở đây theo đúng CPython, không theo Java.
 *
 * <ul>
 *   <li>{@code round(x, n)}: làm tròn **giá trị nhị phân đúng**, hòa thì về số chẵn. {@code Math.round(x * 10^n) / 10^n} sai ở ca hòa và
 *       do sai số nhân.</li>
 *   <li>{@code f"{x:.nf}"}: cùng quy tắc; {@code String.format} của Java làm tròn lên trên chuỗi thập phân ngắn nhất nên lệch (0,125 → 0,13).</li>
 * </ul>
 */
public final class Py {

    private static final MathContext SQRT_CONTEXT = new MathContext(60);

    private Py() {
    }

    /** {@code round(x, n)} của Python cho float. */
    public static double round(double x, int digits) {
        if (!Double.isFinite(x)) {
            return x;
        }
        double r = new BigDecimal(x).setScale(digits, RoundingMode.HALF_EVEN).doubleValue();
        return r == 0.0 && isNegative(x) ? -0.0 : r;
    }

    /** {@code round(x)} một đối số: số nguyên gần nhất, hòa thì về chẵn. */
    public static long round(double x) {
        return (long) Math.rint(x);
    }

    /** {@code f"{x:.{digits}f}"}. */
    public static String fixed(double x, int digits) {
        if (Double.isNaN(x)) {
            return "nan";
        }
        if (Double.isInfinite(x)) {
            return x > 0 ? "inf" : "-inf";
        }
        String body = new BigDecimal(Math.abs(x)).setScale(digits, RoundingMode.HALF_EVEN).toPlainString();
        return isNegative(x) ? "-" + body : body;
    }

    /** {@code f"{x:g}"}: 6 chữ số có nghĩa, bỏ số 0 thừa, dạng mũ khi số mũ < -4 hoặc ≥ 6. */
    public static String g(double x) {
        if (Double.isNaN(x)) {
            return "nan";
        }
        if (Double.isInfinite(x)) {
            return x > 0 ? "inf" : "-inf";
        }
        String sign = isNegative(x) ? "-" : "";
        if (x == 0.0) {
            return sign + "0";
        }
        BigDecimal rounded = new BigDecimal(Math.abs(x)).round(new MathContext(6, RoundingMode.HALF_EVEN));
        int exponent = rounded.precision() - rounded.scale() - 1;
        BigDecimal stripped = rounded.stripTrailingZeros();
        if (exponent < -4 || exponent >= 6) {
            String digits = stripped.unscaledValue().toString();
            String mantissa = digits.length() == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
            return sign + mantissa + "e" + (exponent < 0 ? "-" : "+") + (Math.abs(exponent) < 10 ? "0" : "") + Math.abs(exponent);
        }
        return sign + stripped.toPlainString();
    }

    /** {@code math.hypot(a, b)}: căn của tổng bình phương làm tròn đúng (CPython ≥ 3.10 cho kết quả gần như luôn làm tròn đúng). */
    public static double hypot(double a, double b) {
        if (Double.isInfinite(a) || Double.isInfinite(b)) {
            return Double.POSITIVE_INFINITY;
        }
        if (Double.isNaN(a) || Double.isNaN(b)) {
            return Double.NaN;
        }
        if (a == 0.0 || b == 0.0) {
            return Math.abs(a == 0.0 ? b : a);
        }
        BigDecimal sum = new BigDecimal(a).pow(2).add(new BigDecimal(b).pow(2));
        return sum.sqrt(SQRT_CONTEXT).doubleValue();
    }

    /** {@code repr(float)} của Python: chữ số ngắn nhất, dạng mũ khi số mũ < -4 hoặc ≥ 16. */
    public static String reprFloat(double x) {
        if (Double.isNaN(x)) {
            return "nan";
        }
        if (Double.isInfinite(x)) {
            return x > 0 ? "inf" : "-inf";
        }
        if (x == 0.0) {
            return isNegative(x) ? "-0.0" : "0.0";
        }
        BigDecimal shortest = new BigDecimal(Double.toString(Math.abs(x))).stripTrailingZeros();
        String digits = shortest.unscaledValue().toString();
        int exponent = digits.length() - shortest.scale() - 1;
        String sign = isNegative(x) ? "-" : "";
        if (exponent < -4 || exponent >= 16) {
            String mantissa = digits.length() == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
            return sign + mantissa + "e" + (exponent < 0 ? "-" : "+") + (Math.abs(exponent) < 10 ? "0" : "") + Math.abs(exponent);
        }
        String plain = shortest.toPlainString();
        return sign + (plain.contains(".") ? plain : plain + ".0");
    }

    /** {@code repr(value)} của Python cho giá trị JSON, dùng trong thông báo lỗi bundle. */
    public static String repr(Object value) {
        if (value == null) {
            return "None";
        }
        if (value instanceof Boolean b) {
            return b ? "True" : "False";
        }
        if (value instanceof Double || value instanceof Float) {
            return reprFloat(((Number) value).doubleValue());
        }
        if (value instanceof Number || value instanceof BigInteger) {
            return value.toString();
        }
        if (value instanceof String s) {
            return reprString(s);
        }
        if (value instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                sb.append(i == 0 ? "" : ", ").append(repr(list.get(i)));
            }
            return sb.append(']').toString();
        }
        if (value instanceof Map<?, ?> map) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : map.entrySet()) {
                sb.append(first ? "" : ", ").append(repr(e.getKey())).append(": ").append(repr(e.getValue()));
                first = false;
            }
            return sb.append('}').toString();
        }
        return value.toString();
    }

    private static String reprString(String s) {
        char quote = s.indexOf('\'') >= 0 && s.indexOf('"') < 0 ? '"' : '\'';
        StringBuilder sb = new StringBuilder().append(quote);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c == quote) {
                        sb.append('\\').append(c);
                    } else if (c < 0x20 || c == 0x7f) {
                        sb.append(String.format("\\x%02x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append(quote).toString();
    }

    private static boolean isNegative(double x) {
        return Double.doubleToRawLongBits(x) < 0;
    }
}
