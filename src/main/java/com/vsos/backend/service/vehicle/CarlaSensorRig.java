package com.vsos.backend.service.vehicle;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.core.aeb.RadarTracker;

/**
 * Bộ cảm biến adapter CARLA gắn lên xe ego ở mỗi run (VehicleConfig-10). Bảng {@code sensors} chưa có dòng nào, còn cảm biến
 * thật lại do code worker gắn lúc chạy, giống nhau cho mọi mẫu xe; liệt kê ở đây để màn "Phương tiện" hiện đúng cái đang dùng
 * thay vì khối trống.
 * <p>
 * Nguồn: {@code worker/sensor_recorder.py} ({@code SensorRecorder._attach}) và {@code worker/vehicsim_aeb_control.py} (radar AEB,
 * collision của controller). Radar AEB lấy thuộc tính từ {@link RadarTracker#sensorAttributes()}, đúng nguồn mà {@code .xosc}
 * truyền cho adapter. Các hằng còn lại phải khớp code Python: {@code CarlaSensorRigTest} đọc hai file đó và đỏ khi lệch.
 * <p>
 * Cảm biến gắn theo bounding box của xe lúc chạy (radar AEB, camera) không có tọa độ cố định: {@code location_m = null} và
 * {@code mount} ghi quy tắc gắn. DB chỉ lưu dài/rộng/cao, không lưu độ lệch tâm bounding box, nên không đoán số.
 */
final class CarlaSensorRig {

    static final String SOURCE = "CARLA_ADAPTER_CODE";

    /** Vị trí radar ghi dữ liệu và obstacle trong khung xe ({@code front} trong {@code SensorRecorder._attach}). */
    static final double RECORDER_FRONT_X_M = 2.3;
    static final double RECORDER_FRONT_Z_M = 0.7;
    static final double RECORDER_RADAR_FOV_DEG = 30.0;
    static final String RECORDER_RADAR_VERTICAL_FOV_DEG = "10";
    static final double RECORDER_RADAR_RANGE_M = 100.0;
    static final String RECORDER_RADAR_POINTS_PER_SECOND = "3000";
    static final String OBSTACLE_DISTANCE_M = "60";
    static final String OBSTACLE_HIT_RADIUS_M = "0.8";
    /** Radar AEB: mũi xe theo bounding box + 0,1 m, cao 1,0 m ({@code vehicsim_aeb_control.py}). */
    static final double AEB_RADAR_AHEAD_OF_NOSE_M = 0.1;
    static final double AEB_RADAR_Z_M = 1.0;
    static final int CAMERA_WIDTH = 1280;
    static final int CAMERA_HEIGHT = 720;
    static final int CAMERA_FOV_DEG = 90;
    static final double CAMERA_BACK_M = 5.5;
    static final double CAMERA_ABOVE_ROOF_M = 1.6;
    static final double CAMERA_PITCH_DEG = -11.0;

    private CarlaSensorRig() {
    }

    static List<Map<String, Object>> sensors() {
        return List.of(
                sensor("Radar AEB", "RADAR", "sensor.other.radar", null, rotation(0),
                        "Mũi xe (theo bounding box) + " + vi(AEB_RADAR_AHEAD_OF_NOSE_M) + " m, cao " + vi(AEB_RADAR_Z_M) + " m",
                        new LinkedHashMap<>(RadarTracker.sensorAttributes()),
                        "Perception của AEB ca người đi bộ (từ .xosc v9, ADR-043); xe phía trước vẫn dùng ground truth",
                        "Ca người đi bộ"),
                sensor("Radar ghi dữ liệu", "RADAR", "sensor.other.radar", location(RECORDER_FRONT_X_M, RECORDER_FRONT_Z_M), rotation(0),
                        null,
                        attributes("horizontal_fov", String.valueOf(RECORDER_RADAR_FOV_DEG), "vertical_fov", RECORDER_RADAR_VERTICAL_FOV_DEG,
                                "range", String.valueOf(RECORDER_RADAR_RANGE_M), "points_per_second", RECORDER_RADAR_POINTS_PER_SECOND),
                        "Ghi radar vào sensors/frames.csv để phân tích; AEB không đọc", null),
                sensor("Obstacle", "OBSTACLE", "sensor.other.obstacle", location(RECORDER_FRONT_X_M, RECORDER_FRONT_Z_M), rotation(0),
                        null,
                        attributes("distance", OBSTACLE_DISTANCE_M, "hit_radius", OBSTACLE_HIT_RADIUS_M, "only_dynamics", "true"),
                        "Ghi khoảng cách vật cản động vào sensors/frames.csv", null),
                sensor("IMU", "IMU", "sensor.other.imu", location(0, 0), rotation(0), null, Map.of(),
                        "Gia tốc và jerk của xe (chỉ số phanh); bỏ 0,5 s đầu và đoạn sau va chạm", null),
                sensor("Collision", "COLLISION", "sensor.other.collision", location(0, 0), rotation(0), null, Map.of(),
                        "Ghi sensors/collisions.json; controller AEB gắn thêm một bản ở cùng chỗ để xác nhận va chạm", null),
                sensor("Camera xem lại", "RGB_CAMERA", "sensor.camera.rgb", null, rotation(CAMERA_PITCH_DEG),
                        "Sau đuôi xe " + vi(CAMERA_BACK_M) + " m, trên nóc " + vi(CAMERA_ABOVE_ROOF_M) + " m (theo bounding box), chúc xuống "
                                + vi(Math.abs(CAMERA_PITCH_DEG)) + "°",
                        attributes("image_size_x", String.valueOf(CAMERA_WIDTH), "image_size_y", String.valueOf(CAMERA_HEIGHT),
                                "fov", String.valueOf(CAMERA_FOV_DEG), "motion_blur_intensity", "0.0"),
                        "Ảnh và video xem lại trên web; không dùng cho perception", "Khi chạy với --camera (web luôn bật)"));
    }

    private static Map<String, Object> sensor(String name, String type, String blueprint, Map<String, Object> location,
                                              Map<String, Object> rotation, String mount, Map<String, Object> attributes,
                                              String purpose, String condition) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("id", null);
        s.put("name", name);
        s.put("sensor_type", type);
        s.put("carla_blueprint_id", blueprint);
        s.put("location_m", location);
        s.put("rotation_deg", rotation);
        s.put("mount", mount);
        s.put("attributes", attributes);
        s.put("is_enabled", true);
        s.put("purpose", purpose);
        s.put("condition", condition);
        return s;
    }

    /** Số trong câu tiếng Việt: dấu phẩy thập phân, bỏ ",0" thừa (0,1; 1; 5,5). */
    static String vi(double value) {
        String s = value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
        return s.replace('.', ',');
    }

    private static Map<String, Object> location(double x, double z) {
        return Json.obj("x", x, "y", 0.0, "z", z);
    }

    private static Map<String, Object> rotation(double pitch) {
        return Json.obj("pitch", pitch, "yaw", 0.0, "roll", 0.0);
    }

    private static Map<String, Object> attributes(String... keyValues) {
        Map<String, Object> a = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            a.put(keyValues[i], keyValues[i + 1]);
        }
        return a;
    }
}
