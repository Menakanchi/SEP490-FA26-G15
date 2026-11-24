package com.vsos.backend.service.simulation;

import static org.assertj.core.api.Assertions.assertThat;

import com.vsos.backend.repository.common.Row;
import com.vsos.core.common.MiniJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Khối {@code dataset} của {@code result.json} (ADR-065): đủ mục, lỗi/thiếu dữ liệu thành trạng thái chứ không thành run lỗi. */
class RunDatasetWriterTest {

    private static final String GT_HEADER = "frame,sim_time_s,actor_id,role,type_id,x_m,y_m,z_m,yaw_deg,speed_ms";

    @Test
    void blockCarriesIdentityConfigObjectivesProvenanceTimeSeriesAndCollisionEvidence(@TempDir Path folder) throws IOException {
        writeSensors(folder, true);
        Map<String, Object> block = RunDatasetWriter.build(run(), bundle(), result(false), folder, "a".repeat(40));

        assertThat(map(block, "identity")).containsEntry("run_id", 7L).containsEntry("variant_id", 11L).containsEntry("seed", 49007L)
                .containsEntry("aeb_mode", "ON").containsEntry("repetition", null);
        assertThat(map(map(block, "config"), "vehicle")).containsEntry("width_m", 1.8);
        Map<String, Object> objectives = map(block, "objectives");
        assertThat(map(objectives, "impact_speed_mps")).containsEntry("value", 6.067).containsEntry("consistent", true);
        assertThat(objectives).containsEntry("impact_speed_definition", "relative_closing_speed");
        assertThat(state(block, "objectives")).isEqualTo("OK");

        Map<String, Object> provenance = map(block, "provenance");
        assertThat(provenance).containsEntry("git_commit", "a".repeat(40)).containsEntry("carla_version", "0.9.16");
        assertThat(provenance.get("bundle_sha256")).isEqualTo(RunDatasetWriter.sha256(folder.resolve("bundle.json")));
        assertThat(map(map(provenance, "files"), "sensors/ground_truth.csv")).containsEntry("rows", 4);

        Map<String, Object> series = map(block, "time_series");
        Map<String, Object> groundTruth = map(series, "ground_truth");
        assertThat(groundTruth).containsEntry("row_count", 4);
        assertThat(rows(groundTruth).get(0).get(0)).isEqualTo(1L); // số nguyên giữ là số nguyên, ô rỗng là null
        assertThat(rows(map(series, "frames")).get(0).get(3)).isNull();
        assertThat(series.get("coordinate_system")).isNotNull();

        Map<String, Object> collisions = map(block, "collisions");
        assertThat(collisions).containsEntry("count", 1).containsEntry("flag_in_result", true);
        assertThat(state(block, "collisions")).isEqualTo("OK");

        Map<String, Object> derived = map(block, "derived");
        assertThat(derived).containsEntry("role", "REFERENCE_ONLY");
        assertThat(map(derived, "values").get("d_min_geometric_clearance_m")).isNotNull(); // có ground truth ego + người đi bộ
        assertThat(derived.get("ground_truth_used")).isEqualTo(true);
    }

    @Test
    void missingSensorFilesBecomeMissingStatusesNotAnError(@TempDir Path folder) throws IOException {
        Map<String, Object> block = RunDatasetWriter.build(run(), bundle(), result(false), folder, null);

        assertThat(state(block, "provenance")).isEqualTo("MISSING");
        assertThat(state(block, "sensors")).isEqualTo("MISSING");
        assertThat(state(block, "collisions")).isEqualTo("MISSING");
        assertThat(state(block, "time_series")).isEqualTo("MISSING");
        assertThat(map(block, "time_series")).containsEntry("frames", null).containsEntry("ground_truth", null);
        assertThat(map(map(block, "derived"), "values").get("d_gt_peak_decel_0p1s_mps2")).isNull();
        assertThat(map(block, "provenance")).containsEntry("git_commit", null);
    }

    @Test
    void disagreementsAreReportedAsConflictingInsteadOfBeingHidden(@TempDir Path folder) throws IOException {
        writeSensors(folder, false); // collisions.json rỗng nhưng result nói có va chạm
        Map<String, Object> block = RunDatasetWriter.build(run(), bundle(), result(true), folder, null);

        assertThat(state(block, "collisions")).isEqualTo("CONFLICTING");
        assertThat(state(block, "objectives")).isEqualTo("CONFLICTING");
        assertThat(map(map(block, "objectives"), "rms_jerk_mps3")).containsEntry("consistent", false);
    }

    @Test
    void attachRewritesResultJsonWithTheBlockAndKeepsTheRestOfTheFile(@TempDir Path folder) throws IOException {
        writeSensors(folder, true);
        Map<String, Object> result = result(false);
        Path resultPath = folder.resolve("result.json");
        Files.writeString(resultPath, MiniJson.write(result), StandardCharsets.UTF_8);

        RunDatasetWriter.attach(resultPath, result, run(), bundle(), folder, folder);

        Map<String, Object> onDisk = MiniJson.parseObject(Files.readString(resultPath, StandardCharsets.UTF_8));
        assertThat(onDisk).containsKeys("format", "simulator", "outcome", "evaluation", "engine", "dataset");
        assertThat(map(onDisk, "dataset")).containsEntry("format", "vehicsim.run-dataset/v1");
        assertThat(result).containsKey("dataset"); // bản trong bộ nhớ (đi vào DB) cũng có
        assertThat(map(onDisk, "outcome")).isEqualTo(map(result, "outcome"));
    }

    // ---------------------------------------------------------------- dữ liệu mẫu

    private static Row run() {
        Map<String, Object> v = new HashMap<>();
        v.put("id", 7L);
        v.put("scenario_id", 3L);
        v.put("scenario_version_id", 11L);
        v.put("aeb_version_id", 5L);
        v.put("carla_vehicle_model_id", 2L);
        v.put("random_seed", 49007L);
        v.put("aeb_mode", "ON");
        v.put("purpose", "BASELINE");
        v.put("baseline_run_id", null);
        v.put("simulator_version", "carla-0.9.16-xosc15");
        return new Row(v);
    }

    private static Map<String, Object> bundle() {
        Map<String, Object> vehicle = new LinkedHashMap<>();
        vehicle.put("name", "Audi e-tron");
        vehicle.put("width_m", 1.8);
        vehicle.put("length_m", 5.0);
        Map<String, Object> aeb = new LinkedHashMap<>();
        aeb.put("label", "v1.0");
        aeb.put("params", Map.of("TTC_THRESHOLD", 1.5));
        Map<String, Object> bundle = new LinkedHashMap<>();
        bundle.put("aeb", aeb);
        bundle.put("vehicle", vehicle);
        bundle.put("variant", Map.of("ego_speed_kmh", 50.0));
        return bundle;
    }

    private static Map<String, Object> result(boolean disagree) {
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("collision", true);
        metrics.put("impact_speed_mps", 6.067);
        metrics.put("rms_jerk_mps3", 17.68);
        metrics.put("stopping_distance_m", 17.518);
        metrics.put("ego_initial_speed_mps", 13.889);
        metrics.put("brake_onset_t", 0.1);
        Map<String, Object> aebResult = new LinkedHashMap<>(metrics);
        if (disagree) {
            aebResult.put("rms_jerk_mps3", 12.0);
        }
        Map<String, Object> carla = new LinkedHashMap<>();
        carla.put("physics_applied", Map.of("length_m", 4.0, "width_m", 2.0));
        Map<String, Object> caseDoc = new LinkedHashMap<>();
        caseDoc.put("road_friction", 1.0);
        caseDoc.put("carla", carla);
        List<Object> frames = new ArrayList<>();
        frames.add(new LinkedHashMap<>(Map.of("t", 0.0, "ego_x", 0.0, "ego_v", 13.9, "ped_y", -3.0, "ped_vy", 0.0)));
        Map<String, Object> outcome = new LinkedHashMap<>();
        outcome.put("frames", frames);
        outcome.put("events", new ArrayList<>());
        outcome.put("metrics", metrics);
        outcome.put("params", new LinkedHashMap<>(Map.of("max_deceleration", 8.0)));
        outcome.put("case", caseDoc);
        outcome.put("crossing_x", 30.0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("format", "vehicsim.result/v1");
        result.put("simulator", "carla-0.9.16-xosc15");
        result.put("seed", 49007L);
        result.put("source", Map.of("run_id", 7L));
        result.put("outcome", outcome);
        result.put("artifacts", new LinkedHashMap<>());
        result.put("evaluation", new LinkedHashMap<>(Map.of("aeb_result", aebResult)));
        result.put("engine", "vsos-core-java/1");
        return result;
    }

    private static void writeSensors(Path folder, boolean collided) throws IOException {
        Path sensors = Files.createDirectories(folder.resolve("sensors"));
        Files.writeString(sensors.resolve("frames.csv"), "frame,sim_time_s,ego_speed_ms,radar_ttc_s\n1,0.0,13.9,\n2,0.01,13.9,4.5\n");
        Files.writeString(sensors.resolve("ground_truth.csv"), GT_HEADER + "\n"
                + "1,0.0,10,ego,vehicle.x,0.0,0.0,0.0,0.0,13.9\n"
                + "1,0.0,11,target,walker.y,5.0,0.0,0.0,0.0,0.0\n"
                + "2,0.01,10,ego,vehicle.x,3.0,0.0,0.0,0.0,13.8\n"
                + "2,0.01,11,target,walker.y,5.0,1.5,0.0,0.0,0.0\n");
        Files.writeString(sensors.resolve("collisions.json"), collided ? "[{\"sim_time_s\": 3.92, \"other_actor\": \"walker\"}]" : "[]");
        Files.writeString(sensors.resolve("summary.json"), "{\"frames\": 2, \"ground_truth\": {\"missing_frames\": 0, \"implausible_accel_rows\": 0, "
                + "\"coordinates\": {\"frame\": \"CARLA world\"}}}");
        Files.writeString(folder.resolve("bundle.json"), "{\"seed\": 49007}");
        Files.writeString(folder.resolve("scenario.xosc"), "<OpenSCENARIO/>");
        Files.writeString(folder.resolve("scenario.runtime.xosc"), "<OpenSCENARIO/>");
        Files.writeString(folder.resolve("scenario_runner.log"), "log");
        Files.writeString(folder.resolve("lifecycle.json"), "{\"core\": {\"sha256\": \"abc\"}}");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Map<String, Object> parent, String key) {
        return (Map<String, Object>) parent.get(key);
    }

    @SuppressWarnings("unchecked")
    private static List<List<Object>> rows(Map<String, Object> table) {
        return (List<List<Object>>) table.get("rows");
    }

    private static String state(Map<String, Object> block, String section) {
        return (String) map(map(block, "status"), section).get("state");
    }
}
