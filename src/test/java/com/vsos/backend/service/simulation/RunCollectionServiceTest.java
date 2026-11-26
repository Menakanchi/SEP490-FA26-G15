package com.vsos.backend.service.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.core.common.MiniJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** File gộp theo biến thể (ADR-065, C09): mỗi run giữ nguyên tài liệu, có manifest, nhóm ON/OFF, không gộp số giữa các run. */
class RunCollectionServiceTest {

    private static final long PROJECT = 4L;
    private static final long VARIANT = 1033L;

    @TempDir
    Path root;

    private Db db;
    private RunService runs;
    private RunCollectionService service;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        runs = mock(RunService.class);
        ProjectAccess projects = mock(ProjectAccess.class);
        when(projects.currentProject()).thenReturn(new Row(Json.obj("id", PROJECT)));
        when(runs.runDir(anyLong())).thenAnswer(inv -> root.resolve(String.valueOf((Long) inv.getArgument(0))));
        when(db.first(startsWith("SELECT v.id"), any(Object[].class))).thenReturn(new Row(Json.obj("id", VARIANT, "scenario_id", 26L, "version_no", 7L)));
        when(db.first(startsWith("SELECT id, project_id, version_no"), any(Object[].class)))
                .thenReturn(new Row(Json.obj("id", 33L, "project_id", PROJECT, "version_no", 1L, "label", "v1.0", "status", "BASELINE", "source", "MANUAL")));
        when(db.scalar(startsWith("SELECT COUNT(*)"), any(Object[].class))).thenReturn(0L);
        service = new RunCollectionService(db, projects, runs);
    }

    @Test
    void everyRunKeepsItsOwnDocumentAndOnOffRunsOfTheSameSeedAreGroupedWithoutMerging() throws IOException {
        writeRun(2499L, true);
        writeRun(2511L, true);
        // 2600: ON lần lặp 2, file kết quả đã mất trên đĩa
        when(db.list(startsWith("SELECT r.*, ranked.collection_order"), any(Object[].class)))
                .thenReturn(List.of(ranked(run(2600L, "ON", 2L), 3), ranked(run(2499L, "ON", 1L), 1),
                        ranked(run(2511L, "OFF", 1L), 2)));

        Map<String, Object> doc = MiniJson.parseObject(new String(service.variantCollection(VARIANT), StandardCharsets.UTF_8));

        assertThat(doc).containsEntry("format", "vehicsim.run-collection/v1");
        assertThat(map(doc, "collection")).containsEntry("variant_id", VARIANT).containsEntry("sealed", false);
        assertThat(map(doc, "rules")).containsEntry("no_cross_run_aggregation", true);
        List<Map<String, Object>> manifest = list(doc, "manifest");
        assertThat(manifest).extracting(e -> e.get("run_id")).containsExactly(2499L, 2511L, 2600L);
        assertThat(manifest.get(0)).containsEntry("dataset_source", "BUILT_AT_EXPORT");
        assertThat(map(manifest.get(2), "document_state")).containsEntry("state", "MISSING");
        assertThat(map(doc, "status")).containsEntry("state", "MISSING");

        List<Map<String, Object>> documents = list(doc, "runs");
        assertThat(documents).extracting(d -> d.get("run_id")).containsExactly(2499L, 2511L);
        Map<String, Object> first = map(documents.get(0), "result");
        // tài liệu của từng run giữ nguyên outcome, có khối dataset dựng lúc xuất và digest khớp manifest
        assertThat(map(map(first, "outcome"), "metrics")).containsEntry("impact_speed_mps", 6.067);
        assertThat(map(first, "dataset")).containsEntry("captured_when", "COLLECTION_EXPORT");
        assertThat(manifest.get(0).get("document_sha256")).isEqualTo(RunDatasetWriter.payloadSha256(first));
        Map<String, Object> version = map(map(map(first, "dataset"), "config"), "aeb_version");
        assertThat(version).containsEntry("status_at_result_time", null).containsEntry("status_at_export_time", "BASELINE");
        assertThat(map(map(first, "dataset"), "provenance")).containsEntry("git_commit", null);

        List<Map<String, Object>> groups = list(doc, "groups");
        assertThat(groups).hasSize(1);
        assertThat(groups.get(0)).containsEntry("on_off_comparable", true);
        assertThat(list(groups.get(0), "on")).extracting(r -> r.get("run_id")).containsExactly(2499L, 2600L);
        assertThat(list(groups.get(0), "off")).extracting(r -> r.get("run_id")).containsExactly(2511L);
    }

    @Test
    void aRunThatAlreadyHasItsDatasetBlockIsExportedAsWritten() throws IOException {
        writeRun(2499L, true);
        Path resultPath = root.resolve("2499").resolve("result.json");
        Map<String, Object> written = MiniJson.parseObject(Files.readString(resultPath, StandardCharsets.UTF_8));
        written.put("dataset", Json.obj("format", "vehicsim.run-dataset/v1", "captured_when", "RESULT_WRITE"));
        Files.writeString(resultPath, MiniJson.write(written), StandardCharsets.UTF_8);
        when(db.list(startsWith("SELECT r.*, ranked.collection_order"), any(Object[].class)))
                .thenReturn(List.of(ranked(run(2499L, "ON", 1L), 1)));

        Map<String, Object> doc = MiniJson.parseObject(new String(service.variantCollection(VARIANT), StandardCharsets.UTF_8));

        assertThat(list(doc, "manifest").get(0)).containsEntry("dataset_source", "WRITTEN_AT_RUN");
        assertThat(map(map(list(doc, "runs").get(0), "result"), "dataset")).containsEntry("captured_when", "RESULT_WRITE");
        assertThat(list(list(doc, "groups").get(0), "notes")).isNotEmpty(); // không có OFF, chỉ 1 lần lặp
        assertThat(list(doc, "groups").get(0)).containsEntry("on_off_comparable", false);
    }

    @Test
    void differentSeedsOrAebVersionsAreNeverComparedInOneGroup() {
        List<Object> groups = RunCollectionService.groups(List.of(run(1L, "ON", 1L), run(2L, "OFF", 1L), withSeed(run(3L, "OFF", 1L), 777L)));
        assertThat(groups).hasSize(2);
    }

    @Test
    void aVariantOutsideTheOpenProjectIsNotFound() {
        when(db.first(startsWith("SELECT v.id"), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> service.variantCollection(VARIANT)).isInstanceOf(NotFoundException.class);
    }

    // ---------------------------------------------------------------- dữ liệu mẫu

    private static Row run(long id, String mode, long repetition) {
        Map<String, Object> v = new HashMap<>();
        v.put("id", id);
        v.put("project_id", PROJECT);
        v.put("scenario_id", 26L);
        v.put("scenario_version_id", VARIANT);
        v.put("aeb_version_id", 33L);
        v.put("carla_vehicle_model_id", 5L);
        v.put("random_seed", 49033L);
        v.put("aeb_mode", mode);
        v.put("repetition", repetition);
        v.put("attempt", 1L);
        v.put("purpose", "BASELINE");
        v.put("baseline_run_id", null);
        v.put("simulator_version", "carla-0.9.16-xosc15");
        v.put("end_reason", "COLLISION");
        v.put("collision_occurred", true);
        return new Row(v);
    }

    private static Row withSeed(Row row, long seed) {
        Map<String, Object> v = new HashMap<>(row.asMap());
        v.put("random_seed", seed);
        return new Row(v);
    }

    private static Row ranked(Row row, long rank) {
        Map<String, Object> values = new HashMap<>(row.asMap());
        values.put("collection_order", rank);
        return new Row(values);
    }

    private void writeRun(long id, boolean collided) throws IOException {
        Path folder = Files.createDirectories(root.resolve(String.valueOf(id)));
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("collision", collided);
        metrics.put("impact_speed_mps", 6.067);
        metrics.put("rms_jerk_mps3", null);
        metrics.put("stopping_distance_m", null);
        metrics.put("brake_onset_t", null);
        metrics.put("ego_initial_speed_mps", 13.889);
        Map<String, Object> outcome = new LinkedHashMap<>();
        outcome.put("end_reason", "COLLISION");
        outcome.put("frames", List.of(Json.obj("t", 0.0, "ego_x", 0.0, "ego_v", 13.9, "ped_y", -3.0, "ped_vy", 0.0)));
        outcome.put("events", List.of());
        outcome.put("metrics", metrics);
        outcome.put("params", Json.obj("max_deceleration", 8.0));
        outcome.put("case", Json.obj("road_friction", 1.0));
        outcome.put("crossing_x", 30.0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("format", "vehicsim.result/v1");
        result.put("simulator", "carla-0.9.16-xosc15");
        result.put("seed", 49033L);
        result.put("source", Json.obj("run_id", id));
        result.put("outcome", outcome);
        result.put("artifacts", Map.of());
        result.put("evaluation", Json.obj("aeb_result", new LinkedHashMap<>(metrics)));
        result.put("engine", "vsos-core-java/1");
        Files.writeString(folder.resolve("result.json"), MiniJson.write(result), StandardCharsets.UTF_8);
        Files.writeString(folder.resolve("bundle.json"), MiniJson.write(Json.obj("vehicle", Json.obj("width_m", 1.988, "length_m", 5.915),
                "aeb", Json.obj("label", "v1.0"), "variant", Json.obj("ego_speed_kmh", 50.0))), StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Map<String, Object> parent, String key) {
        return (Map<String, Object>) parent.get(key);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> parent, String key) {
        return (List<Map<String, Object>>) parent.get(key);
    }
}
