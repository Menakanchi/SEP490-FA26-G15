package com.vsos.backend.common;

import com.vsos.backend.repository.common.Row;
import com.vsos.core.evaluation.AnalysisMetrics;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Bằng chứng run dùng chung cho phân tích, MOBO và regression. */
class RunEvidenceTest {

    private static Row run(Boolean activated, Boolean collision, Object onset, Double jerk, Double stopping) {
        Map<String, Object> m = new HashMap<>();
        m.put("status", "COMPLETED");
        m.put("end_reason", collision != null && collision ? "COLLISION" : "STOPPED");
        m.put("aeb_mode", "ON");
        m.put("verdict", collision != null && collision ? "FAIL" : "PASS");
        m.put("aeb_activated", activated);
        m.put("collision_occurred", collision);
        m.put("is_false_positive", false);
        m.put("is_false_negative", false);
        m.put("impact_speed_mps", collision != null && collision ? 16.9 : 0.0);
        m.put("rms_jerk_mps3", jerk);
        m.put("stopping_distance_m", stopping);
        m.put("brake_onset", onset);
        m.put("trace_frames", 54);
        return new Row(m);
    }

    @Test
    void aebActivatedButCollidedBeforeBrakingIsNotBraked() {
        // Run 1573/1574: AEB kích hoạt, va chạm trước khi phanh tác động, không có mốc phanh/jerk/quãng phanh.
        var row = run(true, true, null, null, null);
        assertThat(RunEvidence.sample(row).braked()).isFalse();
        assertThat(RunEvidence.completeAebOn(row)).isTrue();
    }

    @Test
    void aebActivatedWithoutCollisionAndWithoutBrakeDataStaysIncomplete() {
        var row = run(true, false, null, null, null);
        assertThat(RunEvidence.sample(row).braked()).isNull();
        assertThat(RunEvidence.completeAebOn(row)).isFalse();
    }

    @Test
    void recordedBrakeOnsetStillCountsAsBraked() {
        var row = run(true, true, 1.25, 4.2, 12.5);
        assertThat(RunEvidence.sample(row).braked()).isTrue();
        assertThat(AnalysisMetrics.evidenceComplete(List.of(RunEvidence.sample(row)))).isTrue();
    }
}
