package com.vsos.core.evaluation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.vsos.core.evaluation.RunDataset.Geometry;
import com.vsos.core.evaluation.RunDataset.GroundTruth;
import com.vsos.core.evaluation.RunDataset.GtRow;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Công thức {@code d_*} (ADR-065) với số của dataset phân tích lỗi AEB 23/11/2026 làm giá trị chuẩn. */
class RunDatasetTest {

    @Test
    void brakingDistanceMatchesTheDatasetRowForTheFirstE_tronCase() {
        // FA-G1-001-R1: v tại quyết định 13,856 m/s; τ 0,15 s; J 20 m/s³; a 8 m/s² → d_required_braking_distance_m = 18,1812 (sheet 05).
        double d = RunDataset.brakingDistance(13.856, 0.15, 20.0, 8.0);
        assertThat(d).isCloseTo(18.1812, within(5e-4));
        // biên dừng mô hình = D − d = 18,205 − 18,1812 = 0,0238 (sheet 05)
        assertThat(18.205 - d).isCloseTo(0.0238, within(5e-4));
    }

    @Test
    void brakingDistanceIsContinuousWhereTheCarStopsInsideTheRamp() {
        double rampT = 8.0 / 20.0;
        double boundary = 8.0 * rampT / 2.0; // v0 làm xe vừa dừng đúng cuối pha tăng lực
        double below = RunDataset.brakingDistance(boundary - 1e-9, 0.15, 20.0, 8.0);
        double above = RunDataset.brakingDistance(boundary + 1e-9, 0.15, 20.0, 8.0);
        assertThat(below).isCloseTo(above, within(1e-6));
    }

    @Test
    void peakAndMeanDecelerationFollowTheGroundTruthSpeed() {
        double[] speeds = {10, 10, 10, 9, 8, 7, 6, 6, 6, 6, 6, 6};
        List<GtRow> ego = new ArrayList<>();
        for (int i = 0; i < speeds.length; i++) {
            ego.add(new GtRow(i, i * 0.1, 0, 0, 0, speeds[i]));
        }
        assertThat(RunDataset.peakDecel(ego)).isCloseTo(10.0, within(1e-6));
        assertThat(RunDataset.meanDecelFrom(ego, 0.2)).isCloseTo(4.0 / 0.9, within(1e-6));
    }

    @Test
    void postEncroachmentTimeIsZeroWhenTheIntervalsOverlapAndNullWhenTheCarNeverPassed() {
        assertThat(RunDataset.pet(1.0, 2.0, 3.0, 3.5)).isCloseTo(1.0, within(1e-9)); // xe vào sau khi người ra
        assertThat(RunDataset.pet(4.0, 5.0, 3.0, 3.5)).isCloseTo(0.5, within(1e-9)); // người vào sau khi đuôi xe qua
        assertThat(RunDataset.pet(1.0, 4.0, 3.0, 3.5)).isEqualTo(0.0);
        assertThat(RunDataset.pet(1.0, 2.0, 3.0, null)).isNull();
    }

    @Test
    void geometricClearanceIsMeasuredFromThePedestrianCentreToTheCarRectangle() {
        List<GtRow> ego = List.of(new GtRow(1, 0.0, 0, 0, 0, 5), new GtRow(2, 0.1, 3, 0, 0, 5));
        List<GtRow> ped = List.of(new GtRow(1, 0.0, 5, 0, 0, 0), new GtRow(2, 0.1, 5, 1.5, 0, 0));
        Geometry g = new Geometry(2.0, 4.0, 1.5, 4.0, 2.0);
        double[] clearance = RunDataset.minClearance(new GroundTruth(ego, ped), g);
        assertThat(clearance[0]).isCloseTo(0.5, within(1e-9)); // lon 2 ≤ L/2, lat 1,5 − W/2 = 0,5
        assertThat(clearance[1]).isCloseTo(0.1, within(1e-9));
    }

    @Test
    void derivedValuesOfACarThatNeverBrakedAreSelfConsistent() {
        Map<String, Object> result = syntheticResult();
        Map<String, Object> d = RunDataset.derived(result, new Geometry(1.8, 5.0, 1.0, null, null), GroundTruth.NONE);

        assertThat(d.get("d_ped_corridor_enter_t")).isEqualTo(1.5);
        assertThat(d.get("d_ped_corridor_exit_t")).isEqualTo(2.5);
        assertThat(d.get("d_veh_front_at_crossing_t")).isEqualTo(3.0);
        assertThat(d.get("d_veh_rear_clear_crossing_t")).isNull(); // đuôi xe chưa qua vạch trong dữ liệu
        assertThat(d.get("d_veh_reached_crossing")).isEqualTo(true);
        assertThat(d.get("d_pet_s")).isNull();
        assertThat(d.get("d_noBrake_conflict_by_gt")).isEqualTo(false); // người đã ra khỏi hành lang trước khi xe tới
        assertThat(d.get("d_noBrake_conflict_window_observed_fully")).isEqualTo(false);
        assertThat(d.get("d_v_at_decision_mps")).isEqualTo(10.0);
        assertThat(d.get("d_dist_to_crossing_at_decision_m")).isEqualTo(20.0);
        assertThat(d.get("d_required_decel_ideal_mps2")).isEqualTo(2.5);
        assertThat((Double) d.get("d_required_braking_distance_m")).isCloseTo(10.6967, within(5e-4));
        assertThat((Double) d.get("d_stopping_margin_model_m")).isCloseTo(9.3033, within(5e-4));
        assertThat(d.get("d_latest_feasible_decision_t")).isEqualTo(2.0);
        assertThat(d.get("d_actual_minus_latest_feasible_decision_s")).isEqualTo(-1.0);
        // không có ground truth → các cột phụ thuộc nó là null và có lý do
        assertThat(d.get("d_gt_peak_decel_0p1s_mps2")).isNull();
        assertThat(d.get("d_min_geometric_clearance_m")).isNull();
        Map<String, String> reasons = RunDataset.nullReasons(d);
        assertThat(reasons).containsKeys("d_pet_s", "d_gt_peak_decel_0p1s_mps2", "d_min_geometric_clearance_m", "d_stopping_margin_observed_m");
        assertThat(reasons).doesNotContainKey("d_v_at_decision_mps");
        d.keySet().forEach(key -> assertThat(d.get(key) == null).as(key).isEqualTo(reasons.containsKey(key)));
    }

    @Test
    void aStaticPedestrianInsideTheCorridorAfterTheRunEndsStillCountsAsAConflict() {
        Map<String, Object> result = syntheticResult();
        // người đứng yên ngay giữa làn: ngoại suy với ped_vy = 0 phải cho xung đột trong cửa sổ [3,0 ; 3,5]
        List<Map<String, Object>> frames = frames(result);
        for (Map<String, Object> f : frames) {
            f.put("ped_y", 0.0);
            f.put("ped_vy", 0.0);
        }
        assertThat(RunDataset.derived(result, new Geometry(1.8, 5.0, 1.0, null, null), GroundTruth.NONE).get("d_noBrake_conflict_by_gt")).isEqualTo(true);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> frames(Map<String, Object> result) {
        return (List<Map<String, Object>>) ((Map<String, Object>) result.get("outcome")).get("frames");
    }

    /** Xe giữ 10 m/s tới vạch ở x = 30; người băng ngang từ y = −3 với 1,5 m/s; AEB "quyết định" ở t = 1 (không phanh trong dữ liệu). */
    private static Map<String, Object> syntheticResult() {
        List<Object> frames = new ArrayList<>();
        for (int i = 0; i <= 6; i++) {
            double t = i * 0.5;
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("t", t);
            f.put("ego_x", 10.0 * t);
            f.put("ego_v", 10.0);
            f.put("ped_y", -3.0 + 1.5 * t);
            f.put("ped_vy", 1.5);
            frames.add(f);
        }
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("ego_initial_speed_mps", 10.0);
        metrics.put("aeb_decision_t", 1.0);
        metrics.put("decel_available_mps2", 8.0);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("brake_activation_delay", 0.15);
        params.put("brake_buildup_rate", 20.0);
        params.put("max_deceleration", 8.0);
        Map<String, Object> caseDoc = new LinkedHashMap<>();
        caseDoc.put("road_friction", 1.0);
        Map<String, Object> outcome = new LinkedHashMap<>();
        outcome.put("frames", frames);
        outcome.put("events", new ArrayList<>());
        outcome.put("metrics", metrics);
        outcome.put("params", params);
        outcome.put("case", caseDoc);
        outcome.put("crossing_x", 30.0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("outcome", outcome);
        return result;
    }
}
