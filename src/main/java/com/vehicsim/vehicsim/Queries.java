package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/** Các truy vấn tra cứu dùng chung (port của ``common.py`` và ``current_project`` / ``display_names``). */
@Component
public class Queries {

    private final Db db;

    public Queries(Db db) {
        this.db = db;
    }

    /** MVP chỉ có một project ACTIVE mặc định (TD-30: chưa lọc theo workspace). */
    public Row currentProject() {
        Row project = db.first("SELECT * FROM projects WHERE status = 'ACTIVE' ORDER BY id LIMIT 1");
        if (project == null) {
            throw new NotFoundException("project — ADMIN gọi POST /api/v1/vehicsim/bootstrap để tạo project mặc định");
        }
        return project;
    }

    public List<Row> versions(long projectId, boolean newestFirst) {
        return db.list("SELECT * FROM aeb_versions WHERE project_id = ? ORDER BY version_no " + (newestFirst ? "DESC" : "ASC"), projectId);
    }

    public Row baselineVersion(long projectId) {
        return db.first("SELECT * FROM aeb_versions WHERE project_id = ? AND status = 'BASELINE'", projectId);
    }

    public List<Row> parameterCatalog() {
        return db.list("SELECT * FROM aeb_parameters ORDER BY sort_order");
    }

    /** ``{"TTC_THRESHOLD": 1.5, ...}`` của một AEB version. */
    public Map<String, Double> aebValues(long aebVersionId) {
        Map<String, Double> out = new LinkedHashMap<>();
        for (Row r : db.list(
                "SELECT p.code, v.param_value FROM aeb_parameters p JOIN aeb_parameter_values v ON v.parameter_id = p.id "
                        + "WHERE v.aeb_version_id = ?", aebVersionId)) {
            out.put(r.str("code"), r.dbl("param_value"));
        }
        return out;
    }

    /** Xe project đang chọn (ADR-038). */
    public Row activeVehicle(long projectId) {
        Row row = db.first(
                "SELECT m.* FROM carla_vehicle_models m JOIN projects p ON p.carla_vehicle_model_id = m.id WHERE p.id = ?", projectId);
        if (row == null) {
            throw new NotFoundException("xe của project (chưa chọn xe)");
        }
        return row;
    }

    /** Run cũ giữ đúng xe nó đã chạy. */
    public Row vehicleById(long vehicleModelId) {
        Row row = db.first("SELECT * FROM carla_vehicle_models WHERE id = ?", vehicleModelId);
        if (row == null) {
            throw new NotFoundException("xe");
        }
        return row;
    }

    /** ``{user_id: "Họ Đệm Tên"}`` cho các màn hiển thị người tạo / người duyệt. */
    public Map<Long, String> displayNames(Collection<Long> ids) {
        List<Long> wanted = ids.stream().filter(Objects::nonNull).distinct().collect(Collectors.toCollection(ArrayList::new));
        Map<Long, String> out = new LinkedHashMap<>();
        if (wanted.isEmpty()) {
            return out;
        }
        for (Row r : db.list("SELECT id, last_name, middle_name, first_name FROM users WHERE id IN (" + Db.placeholders(wanted.size()) + ")",
                wanted.toArray())) {
            out.put(r.lng("id"), joinFullName(r.str("last_name"), r.str("middle_name"), r.str("first_name")));
        }
        return out;
    }

    public static String joinFullName(String last, String middle, String first) {
        return java.util.stream.Stream.of(last, middle, first)
                .filter(part -> part != null && !part.isEmpty())
                .collect(Collectors.joining(" "));
    }
}
