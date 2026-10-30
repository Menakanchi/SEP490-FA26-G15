package com.vsos.backend.service.simulation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import com.vsos.backend.common.Vs;

class TelemetryMetricsServiceTest {

    private TelemetryMetricsService service;

    @BeforeEach
    void setUp() {
        service = new TelemetryMetricsService();
    }

    @Test
    void nearestRadarTarget_detectsTargetAheadAndGivesTtc() {
        List<TelemetryMetricsService.RadarDetection> detections = List.of(
                new TelemetryMetricsService.RadarDetection(30.0, -5.0, 0.0, 0.0),
                new TelemetryMetricsService.RadarDetection(10.0, -2.5, 0.0, 0.0),
                new TelemetryMetricsService.RadarDetection(5.0, -1.0, 20.0, 0.0) // lệch ngoài nón (20 độ)
        );

        TelemetryMetricsService.RadarTargetResult result = service.nearestRadarTarget(detections);
        assertThat(result).isNotNull();
        assertThat(result.radarDepthM()).isEqualTo(10.0);
        assertThat(result.radarRelVelocityMs()).isEqualTo(-2.5);
        assertThat(result.radarTtcS()).isEqualTo(4.0);
    }

    @Test
    void nearestRadarTarget_ignoresRoadBouncesAndSpawnGlitches() {
        List<TelemetryMetricsService.RadarDetection> detections = List.of(
                new TelemetryMetricsService.RadarDetection(3.0, -8.0, 0.0, -5.0), // dội mặt đường (góc âm)
                new TelemetryMetricsService.RadarDetection(60.0, -5604.0, 0.0, 0.0) // số phi vật lý lúc spawn
        );

        TelemetryMetricsService.RadarTargetResult result = service.nearestRadarTarget(detections);
        assertThat(result).isNull();
    }

    @Test
    void nearestRadarTarget_recedingTargetHasNoTtc() {
        List<TelemetryMetricsService.RadarDetection> detections = List.of(
                new TelemetryMetricsService.RadarDetection(12.0, 1.5, 0.0, 0.0) // xe phía trước chạy nhanh hơn (xa dần)
        );

        TelemetryMetricsService.RadarTargetResult result = service.nearestRadarTarget(detections);
        assertThat(result).isNotNull();
        assertThat(result.radarTtcS()).isNull();
    }

    @Test
    void summarise_reportsBrakingAndCollisionMetrics() {
        // Tái hiện test case chuẩn của Chi trong test_sensor_recorder.py
        List<TelemetryMetricsService.TelemetryFrame> frames = List.of(
                new TelemetryMetricsService.TelemetryFrame(0.1, 10.0, -47.0, null, 0.3, null, null, null, null, null, null, null, null), // warmup lúc spawn
                new TelemetryMetricsService.TelemetryFrame(0.5, 9.8, 0.2, null, 0.0, null, null, 15.0, -5.0, 3.0, null, null, null),
                new TelemetryMetricsService.TelemetryFrame(1.0, 8.5, -6.5, -13.4, 0.8, null, null, 7.2, -6.0, 1.2, null, null, null),
                new TelemetryMetricsService.TelemetryFrame(1.5, 4.0, -8.0, null, 1.0, null, null, 3.0, -5.0, null, 1.5, "walker", null),
                new TelemetryMetricsService.TelemetryFrame(2.0, 0.0, -40.0, null, 1.0, null, null, 0.0, 0.0, null, 0.0, "walker", null) // xung lực đâm xe
        );

        List<TelemetryMetricsService.CollisionEvent> collisions = List.of(
                new TelemetryMetricsService.CollisionEvent(2.0, "walker", 2.0, 0.0, 2.0, 40.0)
        );

        TelemetryMetricsService.TelemetrySummary summary = service.summarise(frames, collisions, 8.0);

        assertThat(summary.radarMinTtcS()).isEqualTo(1.2);
        assertThat(summary.maxDecelerationMs2()).isEqualTo(8.0);
        assertThat(summary.maxAbsJerkMps3()).isEqualTo(13.4);
        assertThat(summary.firstBrakeTimeS()).isEqualTo(1.0);
        assertThat(summary.durationS()).isEqualTo(1.9);
        assertThat(summary.impactPeakAccelMs2()).isEqualTo(40.0);
        assertThat(summary.collisions()).isEqualTo(1);
        assertThat(summary.obstacleMinDistanceM()).isEqualTo(1.5);

        // 3 mục tiêu MOBO (ADR-040). Pha phanh = khung 1.0 và 1.5; khung 2.0 (−40 m/s², xung lực đâm xe) bị loại.
        assertThat(summary.rmsJerkMps3()).isEqualTo(13.4);       // chỉ mẫu imu_jerk đã làm mượt trong pha phanh
        assertThat(summary.impactSpeedMps()).isEqualTo(2.0);     // tốc độ ego lúc va chạm
        assertThat(summary.stoppingDistanceM()).isEqualTo(4.125); // (8.5+4)/2·0.5 = 3.125 + 4²/(2·8) = 1.0
        assertThat(summary.relativeImpactSpeedMps()).isEqualTo(2.0); // số đo phụ, ISO 22733-1:2022
    }

    @Test
    void calculateRmsJerk_excludesCollisionImpulse() {
        // Không có imu_jerk: lấy Δa/Δt, khung trước pha phanh làm điểm xuất phát.
        List<TelemetryMetricsService.TelemetryFrame> frames = List.of(
                frame(0.9, 10.0, 0.0),
                frame(1.0, 10.0, -2.0),
                frame(1.1, 9.8, -4.0),
                frame(1.2, 9.4, -4.0),
                frame(1.3, 9.0, -40.0) // va chạm: IMU đo xung lực đâm xe, jerk −360 m/s³ nếu lọt vào
        );

        // jerk = −20, −20, 0 → √(800/3)
        assertThat(service.calculateRmsJerk(frames, 1.0, 1.3)).isCloseTo(16.33, within(0.001));
        assertThat(service.calculateRmsJerk(frames, 1.0, null)).isGreaterThan(100.0);
    }

    @Test
    void noBrakingOrNoCollisionGivesNullObjectives() {
        List<TelemetryMetricsService.TelemetryFrame> frames = List.of(frame(0.6, 10.0, 0.0), frame(1.0, 10.0, 0.0));

        TelemetryMetricsService.TelemetrySummary summary = service.summarise(frames, List.of(), 8.0);

        assertThat(summary.rmsJerkMps3()).isNull();       // không phanh
        assertThat(summary.stoppingDistanceM()).isNull(); // không phanh
        assertThat(summary.impactSpeedMps()).isNull();    // không va chạm — gộp theo họ tính 0
    }

    @Test
    void parseCollisions_readsSensorRecorderOutputSortedByTime() {
        List<TelemetryMetricsService.CollisionEvent> events = service.parseCollisions(List.of(
                java.util.Map.of("frame", 120, "sim_time_s", 3.2, "other_actor", "walker.pedestrian.0001", "impulse_ns", 812.4),
                java.util.Map.of("frame", 90, "sim_time_s", 2.5, "other_actor", "vehicle.audi.tt"),
                java.util.Map.of("frame", 1)));

        assertThat(events).extracting(TelemetryMetricsService.CollisionEvent::simTimeS).containsExactly(2.5, 3.2);
        assertThat(events.get(0).actor()).isEqualTo("vehicle.audi.tt");
    }

    @Test
    void impactSpeedWithoutRecordedSpeedUsesTheFrameBeforeImpact() {
        // collisions.json thật của sensor_recorder không có tốc độ; khung t=2.0 đã chịu xung lực (v=0, a=−40).
        List<TelemetryMetricsService.TelemetryFrame> frames = List.of(frame(1.5, 4.0, -8.0), frame(2.0, 0.0, -40.0));
        List<TelemetryMetricsService.CollisionEvent> collisions = service.parseCollisions(List.of(
                java.util.Map.of("frame", 40, "sim_time_s", 2.0, "other_actor", "walker.pedestrian.0001", "impulse_ns", 812.4)));

        assertThat(service.calculateImpactSpeed(frames, collisions)).isEqualTo(4.0);
        assertThat(service.calculateRelativeImpactSpeed(frames, collisions)).isEqualTo(4.0);
    }

    @Test
    void summaryJsonUsesSnakeCaseKeysTheFrontendReads() throws Exception {
        String json = new com.fasterxml.jackson.databind.ObjectMapper()
                .writeValueAsString(service.summarise(List.of(frame(0.6, 10.0, 0.0)), List.of(), 8.0));

        assertThat(json).contains("\"rms_jerk_mps3\"", "\"impact_speed_mps\"", "\"stopping_distance_m\"", "\"radar_min_ttc_s\"",
                "\"max_deceleration_ms2\"", "\"first_brake_time_s\"", "\"total_frames\"");
    }

    private static TelemetryMetricsService.TelemetryFrame frame(double t, double v, double a) {
        return new TelemetryMetricsService.TelemetryFrame(t, v, a, null, a < 0 ? 1.0 : 0.0, null, null, null, null, null, null, null, null);
    }

    @Test
    void calculateRmsJerk_matchesFormula() {
        // Uniform jerk = 5.0 m/s3
        List<TelemetryMetricsService.TelemetryFrame> frames = List.of(
                new TelemetryMetricsService.TelemetryFrame(0.0, 10.0, 0.0, 5.0, 0.8, null, null, null, null, null, null, null, null),
                new TelemetryMetricsService.TelemetryFrame(0.5, 8.0, -2.5, 5.0, 0.8, null, null, null, null, null, null, null, null),
                new TelemetryMetricsService.TelemetryFrame(1.0, 5.0, -5.0, 5.0, 0.8, null, null, null, null, null, null, null, null)
        );

        Double rms = service.calculateRmsJerk(frames, 0.0, null);
        assertThat(rms).isNotNull();
        assertThat(rms).isCloseTo(5.0, within(0.01));
    }

    @Test
    void calculateRelativeImpactSpeed_iso22733() {
        List<TelemetryMetricsService.TelemetryFrame> frames = List.of(
                new TelemetryMetricsService.TelemetryFrame(1.0, 12.0, -5.0, null, 1.0, null, null, null, null, null, null, null, 2.0)
        );
        List<TelemetryMetricsService.CollisionEvent> collisions = List.of(
                new TelemetryMetricsService.CollisionEvent(1.0, "car", 12.0, 2.0, null, null)
        );

        Double relSpeed = service.calculateRelativeImpactSpeed(frames, collisions);
        // |12.0 - 2.0| = 10.0 m/s
        assertThat(relSpeed).isEqualTo(10.0);
    }

    @Test
    void parseCsvFrames_readsAllFieldsCorrectly() {
        String csv = """
                frame,sim_time_s,ego_speed_ms,throttle,brake,steer,imu_accel_x_ms2,imu_jerk_ms3,radar_points,radar_depth_m,radar_rel_velocity_ms,radar_ttc_s,obstacle_distance_m,obstacle_actor
                10,0.50,11.11,0.0,0.5,0.0,-2.50,-5.00,12,25.0,-10.0,2.5,30.0,hero
                20,1.00,8.50,0.0,1.0,0.0,-6.00,-7.00,10,12.0,-8.0,1.5,15.0,hero
                """;

        List<TelemetryMetricsService.TelemetryFrame> frames = service.parseCsvFrames(csv);
        assertThat(frames).hasSize(2);
        assertThat(frames.get(0).simTimeS()).isEqualTo(0.50);
        assertThat(frames.get(0).egoSpeedMs()).isEqualTo(11.11);
        assertThat(frames.get(0).egoAccelMs2()).isEqualTo(-2.50);
        assertThat(frames.get(0).imuJerkMs3()).isEqualTo(-5.00);
        assertThat(frames.get(0).radarTtcS()).isEqualTo(2.5);
        assertThat(frames.get(1).obstacleDistanceM()).isEqualTo(15.0);
    }

    @Test
    void sensorOnlyFrameDoesNotBecomeAStopOrZeroImpactSpeed() {
        // Recorder có thể ghi frame IMU/radar mà luồng lấy ground truth đã bỏ lỡ.
        String csv = "sim_time_s,ego_speed_ms,brake,imu_accel_x_ms2\n0.5,10,1,-1\n0.6,,,-1\n0.7,9.8,1,-1\n";
        List<TelemetryMetricsService.TelemetryFrame> frames = service.parseCsvFrames(csv);

        assertThat(frames).hasSize(2);
        assertThat(service.summarise(frames, List.of(), 8.0).stoppingDistanceM()).isEqualTo(7.983);
        var collisions = List.of(new TelemetryMetricsService.CollisionEvent(0.65, "walker", null, null, null, null));
        assertThat(service.calculateImpactSpeed(frames, collisions)).isEqualTo(10.0);
    }

    @Test
    void invalidKinematicsAreSkippedButMeasuredZeroSpeedIsKept() {
        List<TelemetryMetricsService.TelemetryFrame> frames = service.parseCsvFrames("""
                sim_time_s,ego_speed_ms,brake
                0.5,10,1
                0.6,broken,1
                ,9,1
                NaN,8,1
                0.7,Infinity,1
                0.8,-1,1
                -1,8,1
                0.9,0,1
                """);

        assertThat(frames).extracting(TelemetryMetricsService.TelemetryFrame::egoSpeedMs).containsExactly(10.0, 0.0);
        assertThat(service.summarise(frames, List.of(), 8.0).stoppingDistanceM()).isEqualTo(2.0);
    }

    @Test
    void csvWithoutUsableKinematicsIsRejectedInsteadOfReportingSafeZeros() {
        for (String csv : List.of("wrong,header\n1,2\n", "sim_time_s,ego_speed_ms\n", "sim_time_s,ego_speed_ms\n0.5,\n")) {
            assertThatThrownBy(() -> service.parseCsvFrames(csv)).isInstanceOf(Vs.InvalidRequestException.class);
        }
    }
}
