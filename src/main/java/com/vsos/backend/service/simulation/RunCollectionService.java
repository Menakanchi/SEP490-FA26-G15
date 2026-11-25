package com.vsos.backend.service.simulation;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.core.common.MiniJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * File gộp theo biến thể cho Failure Analysis (ADR-065, mục C09): mọi run CARLA hoàn tất của một biến thể, <b>mỗi run giữ nguyên tài liệu
 * {@code result.json} của nó</b> (kèm khối {@code dataset}), cùng manifest, nhóm so sánh được và cặp AEB ON/OFF. Không gộp, không trung bình
 * số liệu giữa các run; phép so sánh nhiều run là việc của module phân tích.
 *
 * <p>Run chạy trước ADR-065 chưa có khối {@code dataset}: khối được dựng lúc xuất ({@code captured_when = COLLECTION_EXPORT}), không ghi lại vào
 * đĩa, không có {@code git_commit} (commit lúc xuất không phải commit lúc chạy). File gộp không được niêm phong bởi người có thẩm quyền.</p>
 */
@Service
public class RunCollectionService {

    public static final String FORMAT = "vehicsim.run-collection/v1";
    private static final String RESULT_FORMAT = "vehicsim.result/v1";

    private final Db db;
    private final ProjectAccess projects;
    private final RunService runs;

    public RunCollectionService(Db db, ProjectAccess projects, RunService runs) {
        this.db = db;
        this.projects = projects;
        this.runs = runs;
    }

    /** JSON (UTF-8) của file gộp. Biến thể phải thuộc project đang mở. */
    public byte[] variantCollection(long variantId) throws IOException {
        long projectId = projects.currentProject().lng("id");
        Row variant = db.first("SELECT v.id, v.scenario_id, v.version_no FROM scenario_versions v JOIN scenarios s ON s.id = v.scenario_id "
                + "WHERE v.id = ? AND s.project_id = ?", variantId, projectId);
        if (variant == null) {
            throw new NotFoundException("scenario variant");
        }
        List<Row> rows = db.list("SELECT * FROM simulation_runs WHERE project_id = ? AND scenario_version_id = ? AND simulator_type = 'CARLA' "
                + "AND status = 'COMPLETED' ORDER BY aeb_version_id, carla_vehicle_model_id, simulator_version, random_seed, aeb_mode, repetition, id",
                projectId, variantId);
        if (rows.isEmpty()) {
            throw new InvalidRequestException("Biến thể này chưa có run CARLA hoàn tất để xuất");
        }
        return MiniJson.write(collection(projectId, variant, rows)).getBytes(StandardCharsets.UTF_8);
    }

    Map<String, Object> collection(long projectId, Row variant, List<Row> rows) throws IOException {
        List<Object> manifest = new ArrayList<>();
        List<Object> documents = new ArrayList<>();
        int missing = 0;
        for (Row run : rows) {
            Map<String, Object> entry = manifestEntry(run);
            Map<String, Object> document = document(run, entry);
            if (document == null) {
                missing++;
            } else {
                documents.add(Json.obj("run_id", run.lng("id"), "result", document));
            }
            manifest.add(entry);
        }

        Map<String, Object> excluded = new LinkedHashMap<>();
        excluded.put("kinematic_runs", count("simulator_type = 'KINEMATIC'", projectId, variant.lng("id")));
        excluded.put("carla_runs_not_completed", count("simulator_type = 'CARLA' AND status <> 'COMPLETED'", projectId, variant.lng("id")));
        excluded.put("reason", "chỉ run CARLA hoàn tất mới có result.json và dữ liệu cảm biến trên đĩa; run động học không ghi file");

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("kind", "variant");
        meta.put("project_id", projectId);
        meta.put("scenario_id", variant.lng("scenario_id"));
        meta.put("variant_id", variant.lng("id"));
        meta.put("variant_version_no", variant.get("version_no"));
        meta.put("generated_at_utc", Instant.now().toString());
        meta.put("selection", "mọi run CARLA status = COMPLETED của biến thể, mọi purpose; xếp theo aeb_version, xe, simulator, seed, aeb_mode, repetition");
        meta.put("sealed", false);
        meta.put("sealing_note", "bản xuất tại thời điểm tải, chưa được người có thẩm quyền niêm phong thành cohort");
        meta.put("excluded", excluded);

        Map<String, Object> rules = new LinkedHashMap<>();
        rules.put("no_cross_run_aggregation", true);
        rules.put("note", "mỗi phần tử runs[] là nguyên tài liệu result.json của một run; collection không gộp, không trung bình số liệu giữa các run");
        rules.put("document_digest_spec", RunDatasetWriter.PAYLOAD_DIGEST_SPEC + "; áp cho runs[i].result");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("format", FORMAT);
        out.put("collection", meta);
        out.put("rules", rules);
        out.put("manifest", manifest);
        out.put("groups", groups(rows));
        out.put("status", missing == 0 ? RunDatasetWriter.state("OK", null)
                : RunDatasetWriter.state("MISSING", missing + " run có trong DB nhưng không còn result.json hợp lệ trên đĩa (xem manifest)"));
        out.put("runs", documents);
        return out;
    }

    private Map<String, Object> manifestEntry(Row run) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("run_id", run.lng("id"));
        e.put("aeb_mode", run.str("aeb_mode"));
        e.put("aeb_version_id", run.getLong("aeb_version_id"));
        e.put("carla_vehicle_model_id", run.getLong("carla_vehicle_model_id"));
        e.put("simulator", run.str("simulator_version"));
        e.put("seed", run.getLong("random_seed"));
        e.put("repetition", run.getLong("repetition"));
        e.put("attempt", run.getLong("attempt"));
        e.put("purpose", run.str("purpose"));
        e.put("end_reason", run.str("end_reason"));
        e.put("collision", run.boolOrNull("collision_occurred"));
        return e;
    }

    /** Tài liệu result.json của run (kèm khối dataset), hoặc null nếu không có/không hợp lệ; ghi trạng thái vào {@code entry}. */
    private Map<String, Object> document(Row run, Map<String, Object> entry) throws IOException {
        Path folder = runs.runDir(run.lng("id"));
        Path resultPath = folder.resolve("result.json");
        if (!Files.isRegularFile(resultPath)) {
            entry.put("document_state", RunDatasetWriter.state("MISSING", "không còn result.json trên đĩa"));
            return null;
        }
        Map<String, Object> result;
        try {
            result = MiniJson.parseObject(Files.readString(resultPath, StandardCharsets.UTF_8));
        } catch (RuntimeException e) {
            entry.put("document_state", RunDatasetWriter.state("INVALID", "result.json không đọc được: " + e.getMessage()));
            return null;
        }
        if (!RESULT_FORMAT.equals(result.get("format"))) {
            entry.put("document_state", RunDatasetWriter.state("INVALID", "result.json không đúng định dạng " + RESULT_FORMAT));
            return null;
        }
        if (result.containsKey("dataset")) {
            entry.put("dataset_source", "WRITTEN_AT_RUN");
        } else {
            Map<String, Object> bundle = readBundle(folder, run);
            Row version = db.first("SELECT id, project_id, version_no, label, status, source, parent_version_id FROM aeb_versions WHERE id = ?",
                    run.lng("aeb_version_id"));
            result.put("dataset", RunDatasetWriter.build(run, bundle, version == null ? null : Json.parseMap(Json.write(version.asMap())), result,
                    folder, null, RunDatasetWriter.CAPTURE_COLLECTION_EXPORT));
            entry.put("dataset_source", "BUILT_AT_EXPORT");
        }
        entry.put("document_sha256", RunDatasetWriter.payloadSha256(result));
        entry.put("document_state", RunDatasetWriter.state("OK", null));
        return result;
    }

    /** bundle.json đã đưa cho worker lúc chạy; thiếu thì dựng lại từ DB (cùng đầu vào, nhưng là bản dựng lại). */
    private Map<String, Object> readBundle(Path folder, Row run) {
        Path file = folder.resolve("bundle.json");
        try {
            if (Files.isRegularFile(file)) {
                return MiniJson.parseObject(Files.readString(file, StandardCharsets.UTF_8));
            }
        } catch (IOException | RuntimeException ignored) {
            // rơi xuống dựng lại từ DB
        }
        return runs.bundleForRun(run);
    }

    /** Nhóm so sánh được: cùng AEB version, xe, simulator và seed. Trong nhóm, run ON và OFF và các lần lặp được liệt kê riêng, không ghép số. */
    static List<Object> groups(List<Row> rows) {
        Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (Row run : rows) {
            String key = run.getLong("aeb_version_id") + "|" + run.getLong("carla_vehicle_model_id") + "|" + run.str("simulator_version") + "|"
                    + run.getLong("random_seed");
            Map<String, Object> group = byKey.computeIfAbsent(key, k -> {
                Map<String, Object> g = new LinkedHashMap<>();
                Map<String, Object> id = new LinkedHashMap<>();
                id.put("aeb_version_id", run.getLong("aeb_version_id"));
                id.put("carla_vehicle_model_id", run.getLong("carla_vehicle_model_id"));
                id.put("simulator", run.str("simulator_version"));
                id.put("seed", run.getLong("random_seed"));
                g.put("key", id);
                g.put("on", new ArrayList<>());
                g.put("off", new ArrayList<>());
                return g;
            });
            @SuppressWarnings("unchecked")
            List<Object> side = (List<Object>) group.get("OFF".equals(run.str("aeb_mode")) ? "off" : "on");
            side.add(Json.obj("run_id", run.lng("id"), "repetition", run.getLong("repetition"), "purpose", run.str("purpose")));
        }
        List<Object> out = new ArrayList<>();
        for (Map<String, Object> g : byKey.values()) {
            List<?> on = (List<?>) g.get("on");
            List<?> off = (List<?>) g.get("off");
            List<String> notes = new ArrayList<>();
            if (on.size() < 2) {
                notes.add("có " + on.size() + " run AEB ON: chưa đủ lần lặp để ước lượng dung sai chạy lặp");
            }
            if (off.isEmpty()) {
                notes.add("không có run AEB OFF cùng seed: không so được mức giảm va chạm nhờ AEB");
            }
            if (on.isEmpty()) {
                notes.add("không có run AEB ON");
            }
            g.put("on_off_comparable", !on.isEmpty() && !off.isEmpty());
            g.put("notes", notes);
            out.add(g);
        }
        return out;
    }

    private long count(String condition, long projectId, long variantId) {
        Object n = db.scalar("SELECT COUNT(*) FROM simulation_runs WHERE project_id = ? AND scenario_version_id = ? AND " + condition, projectId, variantId);
        return n instanceof Number c ? c.longValue() : 0L;
    }
}
