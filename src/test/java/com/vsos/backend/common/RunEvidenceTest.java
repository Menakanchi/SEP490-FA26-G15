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
        m.put("brake_onset_type", onset == null ? "NULL" : "DOUBLE");
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

    @Test
    void missingOnsetAndMissingTraceDoNotEstablishNoBrake() {
        Map<String, Object> missing = new HashMap<>(run(true, true, null, null, null).asMap());
        missing.put("brake_onset_type", null); // JSON_TYPE returns SQL NULL when the key is absent.
        assertThat(RunEvidence.sample(new Row(missing)).braked()).isNull();
        assertThat(RunEvidence.completeAebOn(new Row(missing))).isFalse();
        missing.put("brake_onset_type", "NULL");
        missing.put("trace_frames", 0);
        assertThat(RunEvidence.sample(new Row(missing)).braked()).isNull();
        assertThat(RunEvidence.completeAebOn(new Row(missing))).isFalse();
    }

    @Test
    void fullTelemetryDistinguishesAbsentFromExplicitNull() {
        Map<String, Object> full = new HashMap<>(run(true, true, null, null, null).asMap());
        full.remove("brake_onset"); full.remove("brake_onset_type"); full.remove("trace_frames");
        full.put("telemetry_json", "{\"metrics\":{},\"frames\":[{}]}");
        assertThat(RunEvidence.completeAebOn(new Row(full))).isFalse();
        full.put("telemetry_json", "{\"metrics\":{\"brake_onset_t\":null},\"frames\":[{}]}");
        assertThat(RunEvidence.sample(new Row(full)).braked()).isFalse();
        assertThat(RunEvidence.completeAebOn(new Row(full))).isTrue();
    }
}
