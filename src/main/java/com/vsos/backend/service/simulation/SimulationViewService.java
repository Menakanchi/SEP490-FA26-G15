package com.vsos.backend.service.simulation;

import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import com.vsos.backend.security.ProjectAccess;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
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

    /**
     * Gói .zip chứa một OpenSCENARIO cho mỗi run baseline của họ (cùng nội dung nút "Tải .xosc" từng lượt). Bỏ run của
     * regression/tối ưu; không lọc theo trạng thái vì .xosc dựng lại từ biến thể/AEB/xe/seed của run, không từ kết quả.
     * Tên entry {@code vehicsim-run-<id>.xosc} khớp tên file tải lẻ.
     */
    public byte[] familyXoscZip(long scenarioId) throws IOException {
        Row project = projects.currentProject();
        if (db.first("SELECT id FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, project.lng("id")) == null) {
            throw new NotFoundException("scenario family");
        }
        List<Row> rows = db.list("SELECT id FROM simulation_runs WHERE project_id = ? AND scenario_id = ? "
                + "AND regression_test_id IS NULL AND optimization_trial_id IS NULL ORDER BY id", project.lng("id"), scenarioId);
        if (rows.isEmpty()) {
            throw new InvalidRequestException("This scenario family has no runs to export");
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            for (Row r : rows) {
                long runId = r.lng("id");
                zip.putNextEntry(new ZipEntry("vehicsim-run-" + runId + ".xosc"));
                zip.write(runs.exportXosc(runVariantBundle(runId)).getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
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
