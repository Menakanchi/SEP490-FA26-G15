package com.vsos.backend.repository.common;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;

import java.sql.PreparedStatement;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;

/**
 * Truy cập MySQL cho vòng MVP bằng SQL thuần (JdbcTemplate): các màn đọc là những phép JOIN/gộp dài,
 * dịch thẳng từ SQLAlchemy Core cũ dễ đối chiếu hơn là dựng quan hệ JPA. Tham gia transaction của Spring.
 */
@Component
public class Db {

    private final JdbcTemplate jdbc;

    public Db(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Row> list(String sql, Object... args) {
        return jdbc.query(sql, (rs, i) -> {
            ResultSetMetaData md = rs.getMetaData();
            Map<String, Object> values = new LinkedHashMap<>();
            for (int c = 1; c <= md.getColumnCount(); c++) {
                values.put(md.getColumnLabel(c), rs.getObject(c));
            }
            return new Row(values);
        }, convert(args));
    }

    /** Dòng đầu tiên hoặc null — như ``conn.execute(...).first()``. */
    public Row first(String sql, Object... args) {
        List<Row> rows = list(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Giá trị ô đầu tiên của dòng đầu tiên (null nếu không có dòng hoặc ô NULL). */
    public Object scalar(String sql, Object... args) {
        Row row = first(sql, args);
        return row == null ? null : row.asMap().values().iterator().next();
    }

    public int update(String sql, Object... args) {
        return jdbc.update(sql, convert(args));
    }

    /** INSERT một dòng và trả khoá tự tăng. */
    public long insert(String sql, Object... args) {
        Object[] params = convert(args);
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < params.length; i++) {
                ps.setObject(i + 1, params[i]);
            }
            return ps;
        }, keys);
        return keys.getKey().longValue();
    }

    /** INSERT nhiều dòng cùng một câu lệnh. */
    public void batchInsert(String sql, List<Object[]> rows) {
        List<Object[]> converted = new ArrayList<>();
        for (Object[] row : rows) {
            converted.add(convert(row));
        }
        jdbc.batchUpdate(sql, converted);
    }

    /** "?,?,?" cho mệnh đề IN. */
    public static String placeholders(int n) {
        return String.join(",", java.util.Collections.nCopies(n, "?"));
    }

    private static Object[] convert(Object[] args) {
        Object[] out = new Object[args.length];
        for (int i = 0; i < args.length; i++) {
            Object a = args[i];
            // Cột JSON nhận chuỗi JSON; Map/List được tuần tự hoá ở đây.
            out[i] = (a instanceof Map || a instanceof List) ? Json.write(a) : a;
        }
        return out;
    }
}
