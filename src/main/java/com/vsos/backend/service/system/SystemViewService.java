package com.vsos.backend.service.system;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.aeb.AebViewService;
import com.vsos.backend.service.simulation.RunService;

/** Ngữ cảnh chung của app: workspace, project, xe, AEB versions, họ kịch bản, danh mục tham số. Tách từ {@code ViewsService}. */
@Service
public class SystemViewService {

    private static final String AEB_SYSTEM_NAME = "AEB";

    private final Db db;
    private final Queries queries;
    private final RunService runs;

    public SystemViewService(Db db, Queries queries, RunService runs) {
        this.db = db;
        this.queries = queries;
        this.runs = runs;
    }

    public Map<String, Object> context() {
        Row project = queries.currentProject();
        Row workspace = db.first("SELECT * FROM workspaces WHERE id = ?", project.lng("workspace_id"));
        Row vehicle = queries.activeVehicle(project.lng("id"));
        List<Row> versions = queries.versions(project.lng("id"), false);
        Row baseline = versions.stream().filter(v -> "BASELINE".equals(v.str("status"))).findFirst().orElse(null);
        List<Row> fams = db.list("SELECT * FROM scenarios WHERE project_id = ? ORDER BY id", project.lng("id"));

        List<Map<String, Object>> parameters = new ArrayList<>();
        for (Row p : queries.parameterCatalog()) {
            parameters.add(Json.obj("code", p.str("code"), "name", p.str("name"), "category", p.str("category"), "unit", p.str("unit"),
                    "min_value", p.dbl("min_value"), "max_value", p.dbl("max_value"), "default_value", p.dbl("default_value")));
        }
        String vehicleName = vehicle.str("display_name") != null && !vehicle.str("display_name").isEmpty()
                ? vehicle.str("display_name") : vehicle.str("carla_blueprint_id");
        return Json.obj(
                "project", Json.obj("id", project.lng("id"), "name", project.str("name")),
                "workspace", workspace == null ? null : Json.obj("id", workspace.lng("id"), "name", workspace.str("name")),
                "vehicle", Json.obj("id", vehicle.lng("id"), "name", vehicleName),
                // Bộ mô phỏng mà run MỚI sẽ dùng (màn chạy baseline hiện ra trước khi bấm chạy).
                "simulator", runs.configuredSimulator(),
                "system", Json.obj("id", project.lng("id"), "name", AEB_SYSTEM_NAME,
                        "baseline", baseline == null ? null : AebViewService.versionBrief(baseline)),
                "versions", versions.stream().map(AebViewService::versionBrief).toList(),
                "families", fams.stream().map(f -> Json.obj("id", f.lng("id"), "code", f.str("code"), "name", f.str("name"))).toList(),
                "parameters", parameters);
    }
}
