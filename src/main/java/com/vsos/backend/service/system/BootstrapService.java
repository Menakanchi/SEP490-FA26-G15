package com.vsos.backend.service.system;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;

/**
 * Dữ liệu mặc định cho vòng MVP: workspace, project (chọn sẵn xe mặc định), baseline AEB v1.0. Port của ``bootstrap.py``.
 * Idempotent: chạy lại không tạo trùng.
 * <p>
 * v1.0 dùng TTC 1,5 s (không phải mặc định 1,8 của ``aeb_parameters``) để kịch bản demo của MVP diễn ra được: tăng lên 1,8 s
 * sửa được vài ca va chạm nhưng thêm vài ca phanh oan — đúng sự đánh đổi mà màn regression cần cho thấy.
 */
@Service
public class BootstrapService {

    /**
     * code, name, category, unit, min, max, default, sort — phải khớp phần SEED của database/mysql/01_schema.sql.
     * Chỉ 4 tham số chỉnh được (ADR-040); sáu tham số còn lại của lõi AEB là hằng số trong worker, không nằm ở DB.
     */
    private static final List<Object[]> AEB_PARAMETER_SEED = List.of(
            new Object[]{"TTC_THRESHOLD", "TTC Threshold", "DECISION", "s", 0.50, 4.0, 1.8, 1},
            new Object[]{"BRAKE_ACTIVATION_DELAY", "Brake Activation Delay", "CONTROL", "s", 0.0, 0.5, 0.15, 2},
            new Object[]{"MAX_DECELERATION", "Max Deceleration", "VEHICLE_DYNAMICS", "m/s2", 3.0, 10.0, 8.0, 3},
            new Object[]{"BRAKE_BUILDUP_RATE", "Brake Build-up Rate", "CONTROL", "m/s3", 5.0, 20.0, 20.0, 4});

    private static final Map<String, Double> BASELINE_OVERRIDES = Map.of("TTC_THRESHOLD", 1.5);
    private static final String DEFAULT_BLUEPRINT = "vehicle.audi.etron";

    private final Db db;

    public BootstrapService(Db db) {
        this.db = db;
    }

    /** MySQL đã seed từ file SQL; DB trống hoàn toàn thì bổ sung danh mục tham số và xe mặc định. */
    private void seedCatalogsIfMissing() {
        if (db.first("SELECT id FROM aeb_parameters LIMIT 1") == null) {
            List<Object[]> rows = new ArrayList<>(AEB_PARAMETER_SEED);
            db.batchInsert("INSERT INTO aeb_parameters (code, name, category, unit, min_value, max_value, default_value, sort_order) VALUES (?,?,?,?,?,?,?,?)", rows);
        }
        if (db.first("SELECT id FROM carla_vehicle_models LIMIT 1") == null) {
            // Thông số vật lý cố định, không phiên bản (ADR-038); giữ đúng giá trị MVP để run cũ tái lập được.
            db.insert("INSERT INTO carla_vehicle_models (carla_blueprint_id, display_name, length_m, width_m, height_m, mass_kg, tire_friction, "
                    + "wheelbase_m, max_speed_mps, max_brake_decel_mps2) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    DEFAULT_BLUEPRINT, "Audi e-tron", 4.75, 1.93, 1.67, 2100, 1.0, 2.95, 50, 9.5);
        }
    }

    @Transactional
    public Map<String, Object> ensureDefaultProject(long ownerUserId) {
        LocalDateTime ts = Vs.now();
        seedCatalogsIfMissing();
        Row existing = db.first("SELECT id FROM projects ORDER BY id LIMIT 1");
        if (existing != null) {
            return Json.obj("project_id", existing.lng("id"), "created", false);
        }
        // Admin tạo workspace và gán Manager (ADR-038); seed dùng người chạy cho cả hai vai.
        long workspaceId = db.insert("INSERT INTO workspaces (name, description, manager_id, status, created_by_user_id, created_date, updated_at) VALUES (?,?,?,?,?,?,?)",
                "AEB Pedestrian", "MVP workspace: pedestrian-crossing AEB validation", ownerUserId, "ACTIVE", ownerUserId, ts, ts);
        long modelId = ((Number) db.scalar("SELECT id FROM carla_vehicle_models WHERE carla_blueprint_id = ?", DEFAULT_BLUEPRINT)).longValue();
        long projectId = db.insert("INSERT INTO projects (workspace_id, name, description, status, created_by_user_id, carla_vehicle_model_id, created_date, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                workspaceId, "VF8 AEB MVP", "Closed-loop MVP: describe → simulate → fail → tune → regression → decide", "ACTIVE", ownerUserId, modelId, ts, ts);
        long versionId = db.insert("INSERT INTO aeb_versions (project_id, version_no, label, source, status, notes, created_by_user_id, created_date) VALUES (?,?,?,?,?,?,?,?)",
                projectId, 1, "v1.0", "MANUAL", "BASELINE", "Initial baseline", ownerUserId, ts);
        List<Object[]> values = new ArrayList<>();
        for (Row p : db.list("SELECT * FROM aeb_parameters")) {
            values.add(new Object[]{versionId, p.lng("id"), BASELINE_OVERRIDES.getOrDefault(p.str("code"), p.dbl("default_value"))});
        }
        db.batchInsert("INSERT INTO aeb_parameter_values (aeb_version_id, parameter_id, param_value) VALUES (?,?,?)", values);
        return Json.obj("project_id", projectId, "created", true);
    }
}
