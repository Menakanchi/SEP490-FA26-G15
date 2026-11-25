package com.vsos.backend.service.vehicle;

import static org.assertj.core.api.Assertions.assertThat;

import com.vsos.core.aeb.RadarTracker;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * {@link CarlaSensorRig} là bản mô tả của cảm biến mà worker CARLA gắn; test đọc chính code Python để bản mô tả không lệch
 * khi ai đó đổi worker mà quên sửa ở đây (VehicleConfig-10).
 */
class CarlaSensorRigTest {
    private static final Path RECORDER = Path.of("worker/sensor_recorder.py");
    private static final Path AEB_CONTROL = Path.of("worker/vehicsim_aeb_control.py");

    private static String read(Path path) throws IOException {
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    private static Matcher find(String source, String regex) {
        Matcher m = Pattern.compile(regex).matcher(source);
        assertThat(m.find()).as("không tìm thấy /%s/ trong code worker", regex).isTrue();
        return m;
    }

    @Test
    void everySensorBlueprintTheWorkerSpawnsIsListed() throws IOException {
        Set<String> spawned = new TreeSet<>();
        Matcher m = Pattern.compile("find\\(\"(sensor\\.[a-z_.]+)\"\\)").matcher(read(RECORDER) + read(AEB_CONTROL));
        while (m.find()) {
            spawned.add(m.group(1));
        }
        Set<String> listed = new TreeSet<>();
        CarlaSensorRig.sensors().forEach(s -> listed.add((String) s.get("carla_blueprint_id")));
        assertThat(listed).isEqualTo(spawned);
    }

    @Test
    void recorderConstantsMatchSensorRecorder() throws IOException {
        String src = read(RECORDER);
        Matcher front = find(src, "front = carla\\.Transform\\(carla\\.Location\\(x=([0-9.]+), z=([0-9.]+)\\)\\)");
        assertThat(Double.parseDouble(front.group(1))).isEqualTo(CarlaSensorRig.RECORDER_FRONT_X_M);
        assertThat(Double.parseDouble(front.group(2))).isEqualTo(CarlaSensorRig.RECORDER_FRONT_Z_M);
        assertThat(Double.parseDouble(find(src, "(?m)^RADAR_FOV_DEG = ([0-9.]+)").group(1))).isEqualTo(CarlaSensorRig.RECORDER_RADAR_FOV_DEG);
        assertThat(Double.parseDouble(find(src, "(?m)^RADAR_RANGE_M = ([0-9.]+)").group(1))).isEqualTo(CarlaSensorRig.RECORDER_RADAR_RANGE_M);
        assertThat(find(src, "radar_bp\\.set_attribute\\(\"vertical_fov\", \"([0-9.]+)\"\\)").group(1))
                .isEqualTo(CarlaSensorRig.RECORDER_RADAR_VERTICAL_FOV_DEG);
        assertThat(find(src, "radar_bp\\.set_attribute\\(\"points_per_second\", \"([0-9]+)\"\\)").group(1))
                .isEqualTo(CarlaSensorRig.RECORDER_RADAR_POINTS_PER_SECOND);
        assertThat(find(src, "obstacle_bp\\.set_attribute\\(\"distance\", \"([0-9.]+)\"\\)").group(1)).isEqualTo(CarlaSensorRig.OBSTACLE_DISTANCE_M);
        assertThat(find(src, "obstacle_bp\\.set_attribute\\(\"hit_radius\", \"([0-9.]+)\"\\)").group(1)).isEqualTo(CarlaSensorRig.OBSTACLE_HIT_RADIUS_M);

        Matcher camera = find(src, "(?m)^CAMERA_WIDTH, CAMERA_HEIGHT, CAMERA_FOV_DEG = ([0-9]+), ([0-9]+), ([0-9]+)");
        assertThat(Integer.parseInt(camera.group(1))).isEqualTo(CarlaSensorRig.CAMERA_WIDTH);
        assertThat(Integer.parseInt(camera.group(2))).isEqualTo(CarlaSensorRig.CAMERA_HEIGHT);
        assertThat(Integer.parseInt(camera.group(3))).isEqualTo(CarlaSensorRig.CAMERA_FOV_DEG);
        Matcher mount = find(src, "(?m)^CAMERA_BACK_M, CAMERA_ABOVE_ROOF_M, CAMERA_PITCH_DEG = ([0-9.]+), ([0-9.]+), (-?[0-9.]+)");
        assertThat(Double.parseDouble(mount.group(1))).isEqualTo(CarlaSensorRig.CAMERA_BACK_M);
        assertThat(Double.parseDouble(mount.group(2))).isEqualTo(CarlaSensorRig.CAMERA_ABOVE_ROOF_M);
        assertThat(Double.parseDouble(mount.group(3))).isEqualTo(CarlaSensorRig.CAMERA_PITCH_DEG);
    }

    @Test
    void aebRadarMountMatchesTheControllerAndAttributesComeFromTheCore() throws IOException {
        Matcher m = find(read(AEB_CONTROL), "carla\\.Location\\(x=front_offset \\+ ([0-9.]+), z=([0-9.]+)\\)");
        assertThat(Double.parseDouble(m.group(1))).isEqualTo(CarlaSensorRig.AEB_RADAR_AHEAD_OF_NOSE_M);
        assertThat(Double.parseDouble(m.group(2))).isEqualTo(CarlaSensorRig.AEB_RADAR_Z_M);

        Map<String, Object> aebRadar = CarlaSensorRig.sensors().getFirst();
        assertThat(aebRadar).containsEntry("name", "Radar AEB").containsEntry("location_m", null);
        assertThat(aebRadar.get("attributes")).isEqualTo(RadarTracker.sensorAttributes());
    }

    @Test
    void sensorsMountedByBoundingBoxHaveARuleInsteadOfGuessedCoordinates() {
        List<Map<String, Object>> rig = CarlaSensorRig.sensors();
        for (Map<String, Object> s : rig) {
            assertThat(s.get("location_m") == null).as("%s: đúng một trong location_m / mount", s.get("name"))
                    .isEqualTo(s.get("mount") != null);
            assertThat((String) s.get("purpose")).isNotBlank();
        }
        assertThat(rig).extracting(s -> s.get("name"))
                .containsExactly("Radar AEB", "Radar ghi dữ liệu", "Obstacle", "IMU", "Collision", "Camera xem lại");
        assertThat(rig.getFirst().get("mount")).isEqualTo("Mũi xe (theo bounding box) + 0,1 m, cao 1 m");
        assertThat(rig.getLast().get("mount")).isEqualTo("Sau đuôi xe 5,5 m, trên nóc 1,6 m (theo bounding box), chúc xuống 11°");
    }
}
