package com.vsos.backend.repository.project;

import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class ProjectRepository {

    private static final String DEFAULT_VEHICLE = "vehicle.audi.etron";

    private static final String SELECT = """
            SELECT p.*, COALESCE(NULLIF(m.display_name, ''), m.carla_blueprint_id) AS vehicle_name,
                   COALESCE(NULLIF(b.label, ''), CONCAT('v', b.version_no)) AS baseline_label,
                   (SELECT COUNT(*) FROM scenarios s WHERE s.project_id = p.id) AS family_count,
                   (SELECT COUNT(*) FROM simulation_runs r WHERE r.project_id = p.id) AS run_count,
                   (SELECT COUNT(*) FROM regression_tests t WHERE t.project_id = p.id) AS regression_count,
                   (SELECT COUNT(*) FROM simulation_runs r WHERE r.project_id = p.id AND r.status IN ('PENDING','RUNNING','PAUSED'))
                   + (SELECT COUNT(*) FROM optimization_runs o WHERE o.project_id = p.id AND o.status IN ('PENDING','RUNNING'))
                   + (SELECT COUNT(*) FROM regression_tests t WHERE t.project_id = p.id AND t.execution_status IN ('PENDING','RUNNING'))
                     AS running_work
              FROM projects p
              LEFT JOIN carla_vehicle_models m ON m.id = p.carla_vehicle_model_id
              LEFT JOIN aeb_versions b ON b.project_id = p.id AND b.status = 'BASELINE'
            """;

    private final Db db;

    public Row find(long projectId) {
        return db.first(SELECT + " WHERE p.id = ?", projectId);
    }

    public List<Row> listPersonal(long ownerId) {
        return db.list(SELECT + " WHERE p.workspace_id IS NULL AND p.created_by_user_id = ? ORDER BY p.updated_at DESC, p.id DESC",
                ownerId);
    }

    public Row row(long projectId) {
        return db.first("SELECT * FROM projects WHERE id = ?", projectId);
    }

    public Row latestActivePersonal(long ownerId) {
        return db.first("""
                SELECT * FROM projects WHERE workspace_id IS NULL AND created_by_user_id = ? AND status = 'ACTIVE'
                 ORDER BY updated_at DESC, id DESC LIMIT 1
                """, ownerId);
    }

    public Row firstActiveTeamProject() {
        return db.first("SELECT * FROM projects WHERE workspace_id IS NOT NULL AND status = 'ACTIVE' ORDER BY id LIMIT 1");
    }

    public int countActivePersonal(long ownerId) {
        return ((Number) db.scalar("SELECT COUNT(*) FROM projects WHERE workspace_id IS NULL AND created_by_user_id = ? AND status = 'ACTIVE'",
                ownerId)).intValue();
    }

    public String existingName(long ownerId, String name, long exceptProjectId) {
        Row row = db.first("SELECT name FROM projects WHERE workspace_id IS NULL AND created_by_user_id = ? AND name = ? AND id <> ?",
                ownerId, name, exceptProjectId);
        return row == null ? null : row.str("name");
    }

    public Long supportedVehicle(Long vehicleId) {
        Row row = vehicleId == null
                ? db.first("SELECT id FROM carla_vehicle_models WHERE is_supported = TRUE ORDER BY carla_blueprint_id = ? DESC, id LIMIT 1",
                DEFAULT_VEHICLE)
                : db.first("SELECT id FROM carla_vehicle_models WHERE id = ? AND is_supported = TRUE", vehicleId);
        return row == null ? null : row.lng("id");
    }

    public List<Row> supportedVehicles() {
        return db.list("""
                SELECT id, COALESCE(NULLIF(display_name, ''), carla_blueprint_id) AS name, carla_blueprint_id = ? AS is_default,
                       length_m, width_m, mass_kg, max_brake_decel_mps2
                  FROM carla_vehicle_models WHERE is_supported = TRUE ORDER BY is_default DESC, name
                """, DEFAULT_VEHICLE);
    }

    public Row journeySummary(long projectId) {
        return db.first("""
                SELECT b.id AS baseline_id, COALESCE(NULLIF(b.label, ''), CONCAT('v', b.version_no)) AS baseline_label,
                       (SELECT COUNT(*) FROM aeb_versions v WHERE v.project_id = p.id AND v.status IN ('BASELINE','ARCHIVED')) AS rounds,
                       (SELECT COUNT(*) FROM aeb_versions v WHERE v.project_id = p.id AND v.parent_version_id IS NOT NULL) AS candidates,
                       (SELECT COUNT(*) FROM scenarios s WHERE s.project_id = p.id) AS families,
                       (SELECT COUNT(*) FROM analysis_results a
                         WHERE a.project_id = p.id AND a.analysis_type = 'BASELINE_DATASET' AND a.status = 'COMPLETED') AS datasets,
                       (SELECT COUNT(*) FROM optimization_runs o WHERE o.project_id = p.id AND o.status IN ('PENDING','RUNNING'))
                         AS optimizations_running,
                       (SELECT COUNT(*) FROM regression_tests t WHERE t.project_id = p.id AND t.execution_status IN ('PENDING','RUNNING'))
                         AS regressions_running,
                       (SELECT COUNT(*) FROM regression_tests t WHERE t.project_id = p.id AND t.execution_status = 'COMPLETED')
                         AS regressions_completed,
                       (SELECT t.id FROM regression_tests t WHERE t.project_id = p.id AND t.execution_status = 'COMPLETED'
                         ORDER BY t.id DESC LIMIT 1) AS last_regression_id,
                       (SELECT t.verdict FROM regression_tests t WHERE t.project_id = p.id AND t.execution_status = 'COMPLETED'
                         ORDER BY t.id DESC LIMIT 1) AS last_verdict,
                       GREATEST(p.updated_at,
                                COALESCE((SELECT MAX(COALESCE(r.ended_at, r.queued_at)) FROM simulation_runs r WHERE r.project_id = p.id),
                                         p.updated_at),
                                COALESCE((SELECT MAX(s.updated_at) FROM scenarios s WHERE s.project_id = p.id), p.updated_at),
                                COALESCE((SELECT MAX(t.created_date) FROM regression_tests t WHERE t.project_id = p.id), p.updated_at))
                         AS last_activity_at
                  FROM projects p
                  LEFT JOIN aeb_versions b ON b.project_id = p.id AND b.status = 'BASELINE'
                 WHERE p.id = ?
                """, projectId);
    }

    public List<Long> currentVariantIds(long projectId) {
        return db.list("""
                SELECT v.id FROM scenario_versions v JOIN scenarios s ON s.id = v.scenario_id
                 WHERE s.project_id = ?
                   AND v.parent_version_id = (SELECT MAX(b.id) FROM scenario_versions b
                                               WHERE b.scenario_id = s.id AND b.source <> 'GENERATED')
                """, projectId).stream().map(r -> r.lng("id")).toList();
    }

    public List<Row> latestBaselineRuns(long projectId, long baselineVersionId) {
        return db.list("""
                SELECT r.scenario_version_id, r.status, r.collision_occurred, r.min_ttc_s, r.min_distance_m, r.is_false_positive
                  FROM simulation_runs r
                 WHERE r.project_id = ? AND r.purpose = 'BASELINE' AND r.aeb_version_id = ?
                   AND r.id = (SELECT MAX(x.id) FROM simulation_runs x
                                WHERE x.project_id = r.project_id AND x.purpose = 'BASELINE'
                                  AND x.aeb_version_id = r.aeb_version_id AND x.scenario_version_id = r.scenario_version_id)
                """, projectId, baselineVersionId);
    }

    @Transactional
    public long insert(String name, String description, long ownerId, long vehicleId, LocalDateTime now) {
        long projectId = db.insert("""
                INSERT INTO projects (workspace_id, name, description, status, created_by_user_id, carla_vehicle_model_id, created_date, updated_at)
                VALUES (NULL, ?, ?, 'ACTIVE', ?, ?, ?, ?)
                """, name, description, ownerId, vehicleId, now, now);
        long versionId = db.insert("""
                INSERT INTO aeb_versions (project_id, version_no, label, source, status, notes, created_by_user_id, created_date)
                VALUES (?, 1, 'v1.0', 'MANUAL', 'BASELINE', 'Initial baseline', ?, ?)
                """, projectId, ownerId, now);
        db.update("""
                INSERT INTO aeb_parameter_values (aeb_version_id, parameter_id, param_value)
                SELECT ?, id, IF(code = 'TTC_THRESHOLD', 1.5, default_value) FROM aeb_parameters
                """, versionId);
        return projectId;
    }

    public void update(long projectId, String name, String description, Long vehicleId, LocalDateTime now) {
        db.update("UPDATE projects SET name = ?, description = ?, carla_vehicle_model_id = ?, updated_at = ? WHERE id = ?",
                name, description, vehicleId, now, projectId);
    }

    public void setStatus(long projectId, String status, LocalDateTime now) {
        db.update("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?", status, now, projectId);
    }

    public List<Long> runIds(long projectId) {
        return db.list("SELECT id FROM simulation_runs WHERE project_id = ?", projectId).stream().map(r -> r.lng("id")).toList();
    }

    @Transactional
    public void delete(long projectId) {
        db.update("DELETE FROM engineering_recommendations WHERE project_id = ?", projectId);
        db.update("DELETE FROM regression_test_items WHERE regression_test_id IN (SELECT id FROM regression_tests WHERE project_id = ?)",
                projectId);
        db.update("DELETE FROM simulation_runs WHERE project_id = ? ORDER BY id DESC", projectId);
        db.update("DELETE FROM analysis_results WHERE project_id = ?", projectId);
        db.update("DELETE FROM regression_tests WHERE project_id = ?", projectId);
        db.update("DELETE FROM optimization_runs WHERE project_id = ?", projectId);
        db.update("DELETE FROM scenario_versions WHERE scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?) ORDER BY id DESC",
                projectId);
        db.update("DELETE FROM scenarios WHERE project_id = ?", projectId);
        db.update("DELETE FROM aeb_versions WHERE project_id = ? ORDER BY id DESC", projectId);
        db.update("DELETE FROM projects WHERE id = ?", projectId);
    }
}
