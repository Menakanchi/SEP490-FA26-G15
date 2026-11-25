package com.vsos.backend.repository.analysis;

import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import org.springframework.stereotype.Repository;
import java.util.List;

/** Module 3 read-only projection. Never writes producer tables or reconstructs result JSON. */
@Repository
public class FailureAnalysisDatabaseRepository {
    private static final String IDENTITY="id,project_id,scenario_id,scenario_version_id,aeb_version_id,carla_vehicle_model_id,random_seed,aeb_mode,repetition,attempt,purpose,simulator_version";
    private final Db db;
    public FailureAnalysisDatabaseRepository(Db db) { this.db=db; }
    public List<Row> runs(long project,int limit,int offset) {
        return db.list("SELECT r.id, r.project_id, r.scenario_id, r.scenario_version_id, r.random_seed, r.aeb_mode, r.repetition, r.attempt, "+
                "(SELECT COUNT(*) FROM simulation_artifacts a WHERE a.simulation_run_id=r.id AND a.artifact_type='RESULT_FILE') AS artifact_count "+
                "FROM simulation_runs r WHERE r.project_id=? AND r.simulator_type='CARLA' AND r.status='COMPLETED' ORDER BY r.id DESC LIMIT ? OFFSET ?",project,limit,offset);
    }
    public List<Row> collections(long project,int limit,int offset) {
        return db.list("SELECT scenario_version_id AS id, project_id, scenario_id, COUNT(*) AS member_count FROM simulation_runs "+
                "WHERE project_id=? AND simulator_type='CARLA' AND status='COMPLETED' GROUP BY scenario_version_id,project_id,scenario_id "+
                "ORDER BY scenario_version_id DESC LIMIT ? OFFSET ?",project,limit,offset);
    }
    public Row run(long project,long id) {
        return db.first("SELECT "+IDENTITY+" FROM simulation_runs WHERE project_id=? AND id=? AND simulator_type='CARLA' AND status='COMPLETED'",project,id);
    }
    public Row variant(long project,long id) {
        return db.first("SELECT v.id,v.scenario_id,v.version_no FROM scenario_versions v JOIN scenarios s ON s.id=v.scenario_id WHERE s.project_id=? AND v.id=?",project,id);
    }
    public List<Row> members(long project,long variant) {
        // One extra row is a budget sentinel, never a silently truncated analysis cohort.
        return db.list("SELECT "+IDENTITY+" FROM simulation_runs WHERE project_id=? AND scenario_version_id=? AND simulator_type='CARLA' AND status='COMPLETED' "+
                "ORDER BY aeb_version_id,carla_vehicle_model_id,simulator_version,random_seed,aeb_mode,repetition,attempt,id LIMIT 17",project,variant);
    }
    public List<Row> artifacts(long project,long run) {
        return db.list("SELECT a.id,a.storage_url,a.file_name,a.mime_type FROM simulation_artifacts a JOIN simulation_runs r ON r.id=a.simulation_run_id "+
                "WHERE r.project_id=? AND r.id=? AND a.artifact_type='RESULT_FILE' ORDER BY a.id LIMIT 2",project,run);
    }
}
