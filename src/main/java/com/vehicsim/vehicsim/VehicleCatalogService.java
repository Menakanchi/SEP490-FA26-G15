package com.vehicsim.vehicsim;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Màn "Phương tiện" (FE-04-01/02): danh mục mẫu xe CARLA, chỉ đọc. Thông số cố định theo mẫu xe, app không có màn sửa (ADR-038).
 * <p>
 * Số run đếm trong project hiện tại (TD-30: app còn chạy trên một project). Chọn xe cho project chưa làm ở đây: regression ép
 * baseline và candidate cùng xe, đổi xe giữa chừng làm hỏng so sánh đang dở (exec plan 26/10).
 */
@Service
public class VehicleCatalogService {

    private final Db db;
    private final Queries queries;

    public VehicleCatalogService(Db db, Queries queries) {
        this.db = db;
        this.queries = queries;
    }

    /** Mọi mẫu xe, xe project đang dùng trước, rồi theo id. */
    public List<Map<String, Object>> list(long projectId) {
        Long inUse = projectVehicleId(projectId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row row : db.list("SELECT m.*, (SELECT COUNT(*) FROM simulation_runs r WHERE r.project_id = ? AND r.carla_vehicle_model_id = m.id) "
                + "AS run_count FROM carla_vehicle_models m ORDER BY m.id", projectId)) {
            Map<String, Object> item = summary(row, inUse);
            item.put("run_count", row.lng("run_count"));
            out.add(item);
        }
        out.sort((a, b) -> Boolean.compare((Boolean) b.get("in_use"), (Boolean) a.get("in_use")));
        return out;
    }

    /** Một mẫu xe: đủ thông số vật lý, cảm biến gắn trên xe, số run theo bộ mô phỏng. */
    public Map<String, Object> detail(long projectId, long vehicleId) {
        Row row = queries.vehicleById(vehicleId);
        Map<String, Object> out = summary(row, projectVehicleId(projectId));
        out.put("physics", Json.obj(
                "drag_coefficient", row.dbl("drag_coefficient"),
                "center_of_mass_m", row.isNull("center_of_mass_x_m") ? null
                        : Json.obj("x", row.dbl("center_of_mass_x_m"), "y", row.dbl("center_of_mass_y_m"), "z", row.dbl("center_of_mass_z_m")),
                "tire_friction", row.dbl("tire_friction"),
                "max_brake_torque_nm", row.dbl("max_brake_torque_nm"),
                "wheelbase_m", row.dbl("wheelbase_m"),
                "max_speed_mps", row.dbl("max_speed_mps")));
        List<Map<String, Object>> sensors = new ArrayList<>();
        for (Row s : db.list("SELECT * FROM sensors WHERE carla_vehicle_model_id = ? ORDER BY id", vehicleId)) {
            sensors.add(Json.obj(
                    "id", s.lng("id"),
                    "name", s.str("name"),
                    "sensor_type", s.str("sensor_type"),
                    "carla_blueprint_id", s.str("carla_blueprint_id"),
                    "location_m", Json.obj("x", s.dbl("location_x_m"), "y", s.dbl("location_y_m"), "z", s.dbl("location_z_m")),
                    "rotation_deg", Json.obj("pitch", s.dbl("rotation_pitch_deg"), "yaw", s.dbl("rotation_yaw_deg"), "roll", s.dbl("rotation_roll_deg")),
                    "attributes", s.json("attributes_json"),
                    "is_enabled", s.bool("is_enabled")));
        }
        out.put("sensors", sensors);
        List<Map<String, Object>> usage = new ArrayList<>();
        long total = 0;
        for (Row u : db.list("SELECT simulator_type, simulator_version, COUNT(*) AS runs, MAX(queued_at) AS last_run_at FROM simulation_runs "
                + "WHERE project_id = ? AND carla_vehicle_model_id = ? GROUP BY simulator_type, simulator_version ORDER BY runs DESC, simulator_version",
                projectId, vehicleId)) {
            total += u.lng("runs");
            usage.add(Json.obj("simulator_type", u.str("simulator_type"), "simulator_version", u.str("simulator_version"),
                    "runs", u.lng("runs"), "last_run_at", Vs.iso(u.ts("last_run_at"))));
        }
        out.put("run_count", total);
        out.put("usage", usage);
        return out;
    }

    private Long projectVehicleId(long projectId) {
        Object id = db.scalar("SELECT carla_vehicle_model_id FROM projects WHERE id = ?", projectId);
        return id == null ? null : ((Number) id).longValue();
    }

    private static Map<String, Object> summary(Row row, Long inUse) {
        String name = row.str("display_name");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.lng("id"));
        out.put("name", name != null && !name.isEmpty() ? name : row.str("carla_blueprint_id"));
        out.put("carla_blueprint_id", row.str("carla_blueprint_id"));
        out.put("length_m", row.dbl("length_m"));
        out.put("width_m", row.dbl("width_m"));
        out.put("height_m", row.dbl("height_m"));
        out.put("num_wheels", row.getInt("num_wheels"));
        out.put("mass_kg", row.dbl("mass_kg"));
        out.put("max_brake_decel_mps2", row.dbl("max_brake_decel_mps2"));
        out.put("carla_full_brake_decel_mps2", row.dbl("carla_full_brake_decel_mps2"));
        out.put("is_supported", row.bool("is_supported"));
        out.put("in_use", inUse != null && inUse == row.lng("id"));
        return out;
    }
}
