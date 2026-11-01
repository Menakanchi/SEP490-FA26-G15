package com.vsos.backend.service.simulation;

import com.vsos.backend.common.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import com.vsos.backend.security.ProjectAccess;

import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;

/** Dữ liệu đọc của lần chạy mô phỏng: bundle JSON để chạy lại run ngoài web. Tách từ {@code ViewsService}. */
@Service
public class SimulationViewService {

    private final Db db;
    private final Queries queries;
    private final ProjectAccess projects;
    private final RunService runs;

    public SimulationViewService(Db db, Queries queries, RunService runs, ProjectAccess projects) {
        this.db = db;
        this.queries = queries;
        this.projects = projects;
        this.runs = runs;
    }

    /** JSON của nút "Tải JSON chạy CARLA" — đúng đầu vào backend đưa cho bộ mô phỏng (ADR-027). */
    public Map<String, Object> runVariantBundle(long runId) {
        Row project = projects.currentProject();
        Row run = db.first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ?", runId, project.lng("id"));
        if (run == null) {
            throw new NotFoundException("simulation run");
        }
        Map<String, Object> doc = runs.bundleForRun(run);
        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ?", run.lng("scenario_id"));
        Row variant = db.first("SELECT * FROM scenario_versions WHERE id = ?", run.lng("scenario_version_id"));
        Json.asMap(doc.get("source")).putAll(Json.obj(
                "family", scenario.str("name"),
                "variant", Vs.variantLabel(scenario.str("code"), variant.lng("version_no")),
                "exported_at", Vs.isoSeconds(Vs.now())));
        return doc;
    }
}
