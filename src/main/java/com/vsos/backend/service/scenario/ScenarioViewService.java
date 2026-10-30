package com.vsos.backend.service.scenario;

import com.vsos.backend.service.regression.RegressionService;
import com.vsos.backend.common.Vs.NotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;

/** Dữ liệu đọc của màn họ kịch bản: danh sách họ, lịch sử bản, biến thể kèm nhãn tập thử. Tách từ {@code ViewsService}. */
@Service
public class ScenarioViewService {

    private final Db db;
    private final Queries queries;
    private final FamilyService families;
    private final RegressionService regression;

    public ScenarioViewService(Db db, Queries queries, FamilyService families, RegressionService regression) {
        this.db = db;
        this.queries = queries;
        this.families = families;
        this.regression = regression;
    }

    public List<Map<String, Object>> families() {
        Row project = queries.currentProject();
        Row baseline = queries.baselineVersion(project.lng("id"));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row f : db.list("SELECT * FROM scenarios WHERE project_id = ?", project.lng("id"))) {
            List<Row> bases = families.baseVersions(f.lng("id"));
            Row base = bases.get(bases.size() - 1);
            long baseId = base.lng("id");
            List<Row> variantRows = families.variantsOf(baseId);
            List<Long> variantIds = variantRows.stream().map(v -> v.lng("id")).toList();
            // Lượt chạy của bộ biến thể hiện hành; bản cũ xem ở /families/{id}/versions.
            Map<String, Object> runStats = runStatsOf(f.lng("id"), baseId);
            // Đếm theo baseline hiện hành, không cộng lỗi của các run regression của candidate.
            int failing = baseline == null ? 0 : regression.criticalVariantIds(baseline, variantIds).size();
            out.add(Json.obj(
                    "id", f.lng("id"), "code", f.str("code"), "name", f.str("name"), "description", f.str("description"),
                    "version", bases.size(), "version_count", bases.size(), "base_version_id", baseId,
                    "variants", variantIds.size(), "risk_counts", FamilyService.riskCounts(variantRows),
                    "parameter_space", Json.asMap(base.json("scenario_ir_json").get("parameter_space")),
                    "runs", runStats, "failures", failing,
                    "baseline", baseline == null ? null : Vs.versionLabel(baseline),
                    "created_at", Vs.iso(f.ts("created_date"))));
        }
        return out;
    }

    /** Số run theo trạng thái của các biến thể thuộc một bản gốc (mọi mục đích: cơ sở, regression, tối ưu). */
    private Map<String, Object> runStatsOf(long scenarioId, long baseVersionId) {
        Map<String, Object> runStats = new LinkedHashMap<>();
        for (Row r : db.list("SELECT r.status, COUNT(*) AS n FROM simulation_runs r JOIN scenario_versions v ON v.id = r.scenario_version_id "
                + "WHERE r.scenario_id = ? AND v.parent_version_id = ? GROUP BY r.status", scenarioId, baseVersionId)) {
            runStats.put(r.str("status"), r.lng("n"));
        }
        return runStats;
    }

    /** Lịch sử bản của một họ (task 4): v1, v2… với không gian tham số, số biến thể và lượt chạy của từng bản; bản cuối là hiện hành. */
    public List<Map<String, Object>> familyVersions(long scenarioId) {
        Row project = queries.currentProject();
        if (db.first("SELECT id FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, project.lng("id")) == null) {
            throw new NotFoundException("scenario");
        }
        List<Row> bases = families.baseVersions(scenarioId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < bases.size(); i++) {
            Row b = bases.get(i);
            Row creator = db.first("SELECT CONCAT_WS(' ', last_name, middle_name, first_name) AS name FROM users WHERE id = ?",
                    b.lng("created_by_user_id"));
            out.add(Json.obj("version", i + 1, "base_version_id", b.lng("id"), "source", b.str("source"),
                    "current", i == bases.size() - 1,
                    "parameter_space", Json.asMap(b.json("scenario_ir_json").get("parameter_space")),
                    "variants", families.variantIdsOf(b.lng("id")).size(), "risk_counts", FamilyService.riskCounts(families.variantsOf(b.lng("id"))),
                    "runs", runStatsOf(scenarioId, b.lng("id")),
                    "created_by", creator == null ? null : creator.str("name"), "created_at", Vs.iso(b.ts("created_date"))));
        }
        return out;
    }

    /**
     * Biến thể của một bản (mặc định bản hiện hành) kèm nhãn tập thử (task 5): nhãn đang dùng, nhãn tự suy và có phải sửa tay không.
     */
    public Map<String, Object> familyVariants(long scenarioId, Long baseVersionId) {
        Row project = queries.currentProject();
        Row scenario = db.first("SELECT id, code FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, project.lng("id"));
        if (scenario == null) {
            throw new NotFoundException("scenario");
        }
        List<Row> bases = families.baseVersions(scenarioId);
        int index = baseIndex(bases, baseVersionId);
        List<Row> rows = families.variantsOf(bases.get(index).lng("id"));
        List<Map<String, Object>> variants = new ArrayList<>();
        for (Row v : rows) {
            Map<String, Object> ir = v.json("scenario_ir_json");
            variants.add(Json.obj("scenario_version_id", v.lng("id"), "version_no", v.lng("version_no"), "summary", Vs.variantSummary(ir),
                    "ego_speed_kmh", ir.get("ego_speed_kmh"), "trigger_distance_m", ir.get("trigger_distance_m"),
                    "pedestrian_speed_mps", ir.get("pedestrian_speed_mps"), "stops_at_curb", ir.get("stops_at_curb"),
                    "weather", ir.get("weather"), "time_of_day", ir.get("time_of_day"),
                    "risk_label", FamilyService.riskLabel(ir), "auto_label", FamilyService.autoRiskLabel(ir),
                    "manual", FamilyService.riskLabelManual(ir)));
        }
        return Json.obj("scenario_id", scenarioId, "code", scenario.str("code"), "version", index + 1,
                "base_version_id", bases.get(index).lng("id"), "current", index == bases.size() - 1,
                "risk_counts", FamilyService.riskCounts(rows), "variants", variants);
    }

    /** Vị trí bản gốc {@code baseVersionId} trong danh sách bản của họ (null = bản mới nhất); không thuộc họ thì 404. */
    public static int baseIndex(List<Row> bases, Long baseVersionId) {
        if (baseVersionId == null) {
            return bases.size() - 1;
        }
        for (int i = 0; i < bases.size(); i++) {
            if (bases.get(i).lng("id") == baseVersionId) {
                return i;
            }
        }
        throw new NotFoundException("scenario base version");
    }
}
