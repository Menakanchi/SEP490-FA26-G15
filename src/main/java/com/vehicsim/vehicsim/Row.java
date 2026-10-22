package com.vehicsim.vehicsim;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

/** Một dòng kết quả truy vấn, tra theo tên cột (không phân biệt hoa thường) — tương đương row của SQLAlchemy. */
public final class Row {

    private final Map<String, Object> data = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);

    public Row(Map<String, Object> values) {
        data.putAll(values);
    }

    public Object get(String column) {
        return data.get(column);
    }

    public boolean isNull(String column) {
        return data.get(column) == null;
    }

    public Long getLong(String column) {
        Object v = data.get(column);
        return v == null ? null : ((Number) v).longValue();
    }

    /** Cột NOT NULL kiểu số nguyên. */
    public long lng(String column) {
        return getLong(column);
    }

    public Integer getInt(String column) {
        Object v = data.get(column);
        return v == null ? null : ((Number) v).intValue();
    }

    public String str(String column) {
        Object v = data.get(column);
        return v == null ? null : v.toString();
    }

    /** DECIMAL / DOUBLE -> double (Python ``float(Decimal)``). */
    public Double dbl(String column) {
        Object v = data.get(column);
        if (v == null) {
            return null;
        }
        return v instanceof BigDecimal bd ? bd.doubleValue() : ((Number) v).doubleValue();
    }

    /** TINYINT(1) / BIT -> boolean, NULL -> false (Python ``bool(None)``). */
    public boolean bool(String column) {
        Object v = data.get(column);
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        return ((Number) v).intValue() != 0;
    }

    /** Giữ NULL (dùng khi cần phân biệt "chưa có" với false). */
    public Boolean boolOrNull(String column) {
        return isNull(column) ? null : bool(column);
    }

    public LocalDateTime ts(String column) {
        Object v = data.get(column);
        if (v == null) {
            return null;
        }
        if (v instanceof LocalDateTime t) {
            return t;
        }
        return ((java.sql.Timestamp) v).toLocalDateTime();
    }

    /** Cột JSON -> Map (rỗng nếu NULL), như ``row.col or {}``. */
    public Map<String, Object> json(String column) {
        Object v = data.get(column);
        if (v == null) {
            return Collections.emptyMap();
        }
        return Json.parseMap(v.toString());
    }

    public Map<String, Object> asMap() {
        return Collections.unmodifiableMap(data);
    }
}
