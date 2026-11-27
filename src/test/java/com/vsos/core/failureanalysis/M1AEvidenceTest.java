package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static org.assertj.core.api.Assertions.*;

class M1AEvidenceTest {
    @TempDir Path root;
    private final String dir = "runs/CASE/rep1_a1";
    private Map<String, Object> metrics, copy, result;
    private Path resultPath;

    @BeforeEach void fixture() throws Exception {
        metrics = obj("collision", true, "rms_jerk_mps3", 2.123, "impact_speed_mps", 6.0, "stopping_distance_m", 18.001,
                "brake_onset_t", 1.1, "t_aeb_s", 1.2, "aeb_decision_t", .9);
        copy = new LinkedHashMap<>(metrics); copy.put("aeb_triggered", true);
        result = obj("format", "vehicsim.result/v1", "simulator", "carla-0.9.16-xosc15", "seed", 12L, "engine", "vsos-core-java/1", "source", obj(),
                "outcome", obj("metrics", metrics, "params", obj("ttc_threshold", .6, "brake_activation_delay", .15, "max_deceleration", 8.0, "brake_buildup_rate", 20.0),
                        "case", obj("aeb_mode", "ON"), "frames", List.of(obj("t", 0.0), obj("t", .01))),
                "evaluation", obj("aeb_result", copy));
        resultPath = root.resolve(dir + "/result.json");
        writeJson(resultPath, result);
        write(root.resolve(dir + "/sensors/frames.csv"), "frame,sim_time_s,ego_speed_ms,brake\r\r\n10,0.0,10.0,0.0\r\r\n11,0.01,,\r\r\n");
        write(root.resolve(dir + "/sensors/ground_truth.csv"), "frame,sim_time_s,actor_id,role,type_id\n10,0.0,100,ego,vehicle\n10,0.0,101,target,pedestrian\n");
        writeJson(root.resolve(dir + "/sensors/collisions.json"), List.of(obj("frame", 11L, "sim_time_s", .01, "gt_frame_before", 10L,
                "other_actor_id", 101L, "relative_speed_before_ms", 6.1, "impulse_ns", 0.0)));
    }
    private void write(Path p, String content) throws Exception { Files.createDirectories(p.getParent()); Files.writeString(p, content); }
    private void writeJson(Path p, Object data) throws Exception { write(p, MiniJson.write(data)); }
    private Run read() throws Exception {
        writeJson(resultPath, result);
        try (RawArtifactAdapter a = new RawArtifactAdapter(root)) { return a.read(dir); }
    }
    private Map<String, Object> report() throws Exception { return new EvidenceReport().analyze(read()); }
    private String objective(String key, String suffix) { return "/report/objectives/" + key + "/" + suffix; }

    @Test void storedNumbersAndCopiesAreExact() throws Exception {
        var read = new CanonicalObjectiveReader().read(read());
        for (String k : CanonicalObjectiveReader.KEYS) {
            assertThat(read.get(k).canonicalValue().value()).isEqualTo(metrics.get(k));
            assertThat(read.get(k).copyAgreement()).isEqualTo("MATCH");
        }
    }
    @Test void missingApplicableValueDoesNotBecomeZero() throws Exception {
        metrics.put("rms_jerk_mps3", null); copy.put("rms_jerk_mps3", null);
        var o = new CanonicalObjectiveReader().read(read()).get("rms_jerk_mps3");
        assertThat(o.canonicalValue().value()).isNull();
        assertThat(o.canonicalValue().status()).isEqualTo(Status.UNKNOWN);
        assertThat(o.applicability()).isEqualTo("APPLICABLE");
    }
    @Test void collisionAfterActivationRequiresRecordedNullOnsetAndTraceForNotApplicable() throws Exception {
        for (String key : List.of("rms_jerk_mps3", "stopping_distance_m")) { metrics.put(key, null); copy.put(key, null); }
        metrics.put("brake_onset_t", null);
        Run explicitNull = read();
        assertThat(CanonicalObjectiveReader.recordedBraking(explicitNull)).isFalse();
        assertThat(new CanonicalObjectiveReader().read(explicitNull).get("rms_jerk_mps3").canonicalValue().status()).isEqualTo(Status.NOT_APPLICABLE);
        metrics.remove("brake_onset_t");
        Run absent = read();
        assertThat(CanonicalObjectiveReader.recordedBraking(absent)).isNull();
        assertThat(new CanonicalObjectiveReader().read(absent).get("rms_jerk_mps3").canonicalValue().status()).isEqualTo(Status.UNKNOWN);
        metrics.put("brake_onset_t", null);
        @SuppressWarnings("unchecked") Map<String, Object> outcome = (Map<String, Object>) result.get("outcome");
        outcome.put("frames", List.of());
        assertThat(CanonicalObjectiveReader.recordedBraking(read())).isNull();
    }
    @Test void missingSourceIsReportedWithReason() throws Exception {
        Files.delete(resultPath);
        try (RawArtifactAdapter a = new RawArtifactAdapter(root)) {
            Run r = a.read(dir);
            assertThat(new EvidenceValidator().validate(r)).extracting(Issue::code).contains("SOURCE_MISSING");
            assertThat(new CanonicalObjectiveReader().read(r).get("impact_speed_mps").canonicalValue().value()).isNull();
        }
    }
    @Test void missingFieldIsNotExplicitNotApplicableNull() throws Exception {
        metrics.remove("impact_speed_mps"); metrics.put("collision", false);
        var o = new CanonicalObjectiveReader().read(read()).get("impact_speed_mps");
        assertThat(o.canonicalValue().status()).isEqualTo(Status.UNKNOWN);
        assertThat(o.canonicalValue().reasonCodes()).contains("CANONICAL_FIELD_MISSING");
        assertThat(o.copyAgreement()).isEqualTo("UNKNOWN");
    }
    @Test void noCollisionImpactNullRemainsNull() throws Exception {
        metrics.put("collision", false); metrics.put("impact_speed_mps", null); copy.put("impact_speed_mps", null);
        var o = new CanonicalObjectiveReader().read(read()).get("impact_speed_mps");
        assertThat(o.canonicalValue().status()).isEqualTo(Status.NOT_APPLICABLE);
        assertThat(o.canonicalValue().value()).isNull();
    }
    @Test void copiesDisagreeWithoutAveragingOrOverwrite() throws Exception {
        copy.put("rms_jerk_mps3", 999.0);
        var o = new CanonicalObjectiveReader().read(read()).get("rms_jerk_mps3");
        assertThat(o.canonicalValue().value()).isEqualTo(2.123);
        assertThat(o.evaluationCopy().value()).isEqualTo(999.0);
        assertThat(o.canonicalValue().status()).isEqualTo(Status.CONFLICTING);
        assertThat(o.issues()).extracting(Issue::code).contains("CANONICAL_COPY_DISAGREEMENT");
    }
    @Test void validCopySurvivesInvalidProducerValue() throws Exception {
        metrics.put("impact_speed_mps", "6.0");
        var o = new CanonicalObjectiveReader().read(read()).get("impact_speed_mps");
        assertThat(o.canonicalValue().status()).isEqualTo(Status.INVALID);
        assertThat(o.evaluationCopy().value()).isEqualTo(6.0);
        assertThat(o.copyAgreement()).isEqualTo("DISAGREEMENT");
    }
    @Test void negativeAndNonfiniteValuesCannotReachReportJson() throws Exception {
        metrics.put("rms_jerk_mps3", -1.0);
        assertThat(at(report(), objective("rms_jerk_mps3", "canonical_value/status"))).isEqualTo("INVALID");
        String json = MiniJson.write(result).replace("\"rms_jerk_mps3\": -1.0", "\"rms_jerk_mps3\": 1e999");
        write(resultPath, json);
        try (RawArtifactAdapter a = new RawArtifactAdapter(root)) {
            var report = new EvidenceReport().analyze(a.read(dir));
            assertThat(at(report, objective("rms_jerk_mps3", "canonical_value/status"))).isEqualTo("INVALID");
            assertThatCode(() -> MiniJson.write(report)).doesNotThrowAnyException();
        }
    }
    @Test void hashFailureQuarantinesSourceAndKeepsOtherArtifact() throws Exception {
        write(root.resolve("manifest.csv"), "path_in_zip,sha256,size_bytes\n" + dir + "/result.json," + "0".repeat(64) + ",1\n");
        Run r = read();
        assertThat(r.artifact("result").integrity()).isEqualTo(Integrity.FAILED);
        assertThat(new CanonicalObjectiveReader().read(r).get("impact_speed_mps").canonicalValue().status()).isEqualTo(Status.INVALID);
        assertThat(at(new EvidenceReport().analyze(r), "/report/collision_evidence/physical_event_impact/value")).isEqualTo(6.1);
    }
    @Test void emptyEventsDoNotChangeCanonicalCollisionOrInventPhysicalImpact() throws Exception {
        writeJson(root.resolve(dir + "/sensors/collisions.json"), List.of());
        var report = report();
        assertThat(at(report, "/report/collision_evidence/canonical_collision/value")).isEqualTo(true);
        assertThat(at(report, "/report/collision_evidence/sensor_event_count/value")).isEqualTo(0);
        assertThat(at(report, objective("impact_speed_mps", "physical_event_impact/value"))).isNull();
        assertThat(MiniJson.write(report)).contains("COLLISION_EVIDENCE_DISAGREEMENT", "CONTACT_ABSENCE_UNCONFIRMED");
    }
    @Test void eventRelativeSpeedAndZeroImpulseAreRetainedSeparately() throws Exception {
        var r = report();
        assertThat(at(r, objective("impact_speed_mps", "canonical_value/value"))).isEqualTo(6.0);
        assertThat(at(r, objective("impact_speed_mps", "physical_event_impact/value"))).isEqualTo(6.1);
    }
    @Test void wrongTargetCannotSupplyPhysicalImpact() throws Exception {
        writeJson(root.resolve(dir + "/sensors/collisions.json"), List.of(obj("other_actor_id", 999L, "gt_frame_before", 10L, "relative_speed_before_ms", 6.1)));
        assertThat(at(report(), objective("impact_speed_mps", "physical_event_impact/value"))).isNull();
    }
    @Test void recorderClockMismatchIsConflictingAndCoreAlignmentIsUnknown() throws Exception {
        write(root.resolve(dir + "/sensors/ground_truth.csv"), "frame,sim_time_s,actor_id,role\n10,0.5,100,ego\n");
        var codes = new EvidenceValidator().validate(read()).stream().map(Issue::code).toList();
        assertThat(codes).contains("CLOCK_MISMATCH", "CLOCK_ALIGNMENT_UNKNOWN");
    }
    @Test void clockBackwardsAndDuplicateContentAreDetected() throws Exception {
        write(root.resolve(dir + "/sensors/frames.csv"), "frame,sim_time_s\n10,1.0\n10,0.5\n");
        assertThat(new EvidenceValidator().validate(read())).extracting(Issue::code).contains("TIMESTAMP_NON_MONOTONIC", "DUPLICATE_FRAME_DISAGREEMENT");
    }
    @Test void inconsistentRunMetadataAndBundleSeedAreDetected() throws Exception {
        write(root.resolve("metadata/runs_manifest_subset.jsonl"), MiniJson.write(obj("dir", "CASE\\rep1_a1", "run_id", "OTHER-R1", "case_id", "CASE")));
        writeJson(root.resolve("runs/CASE/bundle.json"), obj("seed", 999L));
        assertThat(new EvidenceValidator().validate(read())).filteredOn(i -> i.code().equals("INCONSISTENT_IDENTITY")).hasSize(2);
    }
    @Test void malformedSourcesDoNotBlockIndependentReads() throws Exception {
        write(root.resolve(dir + "/sensors/frames.csv"), "frame,sim_time_s\n10,0.0,extra\n");
        writeJson(root.resolve(dir + "/sensors/summary.json"), true);
        Run r = read();
        assertThat(r.artifact("frames").usable()).isFalse();
        assertThat(new EvidenceValidator().validate(r)).anyMatch(i -> i.code().equals("SCHEMA_TYPE_INVALID") && i.source().artifactId().endsWith("summary.json"));
        assertThat(new CanonicalObjectiveReader().read(r).get("impact_speed_mps").canonicalValue().value()).isEqualTo(6.0);
    }
    @Test void offHasShadowTimelineAndNoActualAebDiagnosis() throws Exception {
        @SuppressWarnings("unchecked") Map<String,Object> c = (Map<String,Object>) at(result, "/outcome/case"); c.put("aeb_mode", "OFF");
        var r = report();
        assertThat(at(r, "/input/mode/value")).isEqualTo("OFF");
        assertThat(at(r, "/report/aeb_timeline/actual_aeb_consumption/status")).isEqualTo("NOT_APPLICABLE");
        assertThat(at(r, "/report/aeb_timeline/decision/value")).isEqualTo(.9);
    }
    @Test void absentBindingNeverBecomesSeededV1() throws Exception {
        var binding = new BaselineBindingResolver().verify(read(), null);
        assertThat(binding.identityStatus()).isEqualTo("UNKNOWN");
        assertThat(binding.fields().values()).allMatch(v -> v.value() == null && v.status() == Status.UNKNOWN && !v.reasonCodes().isEmpty());
    }
    private Artifact snapshot(Run r, boolean lineage) throws Exception {
        Map<String,Object> data = obj("schema", "vehicsim.baseline-binding-snapshot/v1", "project_id", "40", "version_id", "50", "version_project_id", "40",
                "version_no", 1L, "label", "v1.0", "status", "BASELINE", "current_baseline_version_id", "50", "exported_at", "2026-11-23T00:00:00Z",
                "run", obj("run_id", "10", "project_id", "40", "scenario_id", "20", "scenario_version_id", "30", "aeb_version_id", "50", "result_sha256", r.artifact("result").sha256()),
                "parameters", obj("TTC_THRESHOLD", .6, "BRAKE_ACTIVATION_DELAY", .15, "MAX_DECELERATION", 8.0, "BRAKE_BUILDUP_RATE", 20.0));
        if (lineage) data.put("creation_lineage", obj("project_id", "40", "version_id", "50", "version_no", 1L, "label", "v1.0", "source", "MANUAL", "created_at", "2026-11-22T00:00:00Z"));
        Path p = root.resolve("authorized-export.json"); writeJson(p, data);
        return BaselineBindingResolver.readSnapshot(p, sha256(Files.readAllBytes(p)));
    }
    private Run dbBoundFixture() throws Exception {
        result.put("source", obj("run_id", 10L, "scenario_id", 20L, "scenario_version_id", 30L, "aeb_version_id", 50L)); return read();
    }
    @Test void hf02SyntheticBindingRequiresActualRunIdsParametersHashAndLineage() throws Exception {
        Run r = dbBoundFixture();
        var noLineage = new BaselineBindingResolver().verify(r, snapshot(r, false));
        assertThat(noLineage.identityStatus()).isEqualTo("PROJECT_BASELINE_CONFIRMED");
        assertThat(noLineage.fields().get("confirmed_as_v1").status()).isEqualTo(Status.UNKNOWN);
        var full = new BaselineBindingResolver().verify(r, snapshot(r, true));
        assertThat(full.fields().get("confirmed_as_v1").value()).isEqualTo(true);
        assertThat(full.fields().get("database_run_id").value()).isEqualTo("10");
    }
    @Test void exportedLabelAndSeedCannotBindOfflineRun() throws Exception {
        Run r = read();
        assertThat(new BaselineBindingResolver().verify(r, snapshot(r, true)).identityStatus()).isEqualTo("UNKNOWN");
    }
    @Test void changedResultCannotReuseBaselineSnapshot() throws Exception {
        Run old = dbBoundFixture(); Artifact export = snapshot(old, true);
        metrics.put("impact_speed_mps", 1.0);
        assertThat(new BaselineBindingResolver().verify(read(), export).identityStatus()).isEqualTo("CONFLICTING");
    }
    @Test void unpinnedExportCannotConfirmAnything() throws Exception {
        Run r = dbBoundFixture(); snapshot(r, true);
        var unpinned = BaselineBindingResolver.readSnapshot(root.resolve("authorized-export.json"), null);
        assertThat(new BaselineBindingResolver().verify(r, unpinned).identityStatus()).isEqualTo("UNKNOWN");
    }
    @Test void declaredMetricMetadataConflictRemainsVisible() throws Exception {
        @SuppressWarnings("unchecked") Map<String,Object> c = (Map<String,Object>) at(result, "/outcome/case");
        c.put("carla", obj("jerk_filtered", obj("signal", "imu_accel_x_ms2", "window", "before contact")));
        var p = new MetricProvenanceResolver().resolve(read());
        assertThat(p.fields().get("signal").status()).isEqualTo(Status.CONFLICTING);
        assertThat(p.fields().get("signal").value()).isEqualTo("imu_accel_x_ms2");
        assertThat(at(report(), objective("rms_jerk_mps3", "canonical_value/value"))).isEqualTo(2.123);
    }
    @Test void deterministicDigestExcludesOnlyRecordIdentityAndTimeAndNeverMutatesRaw() throws Exception {
        Run r = read(); byte[] before = Files.readAllBytes(resultPath);
        var first = new EvidenceReport().analyze(r); var second = new EvidenceReport().analyze(r);
        assertThat(first.get("analysis_id")).isNotEqualTo(second.get("analysis_id"));
        assertThat(first.get("content_digest")).isEqualTo(second.get("content_digest"));
        assertThat(EvidenceReport.contentDigest(first)).isEqualTo(first.get("content_digest"));
        assertThat(Files.readAllBytes(resultPath)).isEqualTo(before);
        assertThat(r.artifacts().values()).allMatch(a -> a.runKey().equals("CASE-R1"));
        assertThatThrownBy(() -> first.put("x", "y")).isInstanceOf(UnsupportedOperationException.class);
    }
    @Test void csvQuotesBomEmptyCellsAndRecorderLineEndingsArePreserved() {
        var rows = ArtifactCsv.read("\uFEFFframe,sim_time_s,note,value\r\r\n10,0.0,\"a,b\n\"\"c\"\"\",\r\r\n");
        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().get("note")).isEqualTo("a,b\n\"c\"");
        assertThat(rows.getFirst().get("value")).isNull();
    }
    @Test void runnerRefusesToWriteIntoRawInput() {
        assertThatThrownBy(() -> OfflineFailureAnalysis.main(new String[]{root.toString(), root.resolve("reports").toString()}))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("raw input");
    }
    @Test void schemaVersionIsValidatedBeforeClaimingCanonicalValues() throws Exception {
        result.put("format", "unrecognized/v9");
        assertThat(new CanonicalObjectiveReader().read(read()).get("impact_speed_mps").canonicalValue().status()).isEqualTo(Status.INVALID);
    }
    @Test void malformedSeedAndSensorNumberAreInvalidInsteadOfDefaulting() throws Exception {
        result.put("seed", "not-a-seed");
        write(root.resolve(dir + "/sensors/frames.csv"), "frame,sim_time_s,brake\n10,0.0,NaN\n");
        var r = report();
        assertThat(at(r, "/input/seed/status")).isEqualTo("INVALID");
        assertThat(MiniJson.write(r)).contains("STREAM_NUMBER_INVALID");
    }
    @Test void physicalImpactCannotCrossARecorderClockConflict() throws Exception {
        write(root.resolve(dir + "/sensors/ground_truth.csv"), "frame,sim_time_s,actor_id,role\n10,0.5,100,ego\n10,0.5,101,target\n");
        assertThat(at(report(), objective("impact_speed_mps", "physical_event_impact/status"))).isEqualTo("UNKNOWN");
    }
    @Test void objectiveLineageDoesNotCopyJerkSignalOntoOtherObjectives() throws Exception {
        var r = report();
        assertThat(at(r, objective("impact_speed_mps", "signal/value"))).isEqualTo("CORE_RELATIVE_VELOCITY");
        assertThat(at(r, objective("stopping_distance_m", "filter/status"))).isEqualTo("NOT_APPLICABLE");
    }
    @Test void v1CannotBeConfirmedFromMalformedCreationTimestamp() throws Exception {
        Run r = dbBoundFixture(); snapshot(r, true);
        Path p = root.resolve("authorized-export.json");
        write(p, Files.readString(p).replace("2026-11-22T00:00:00Z", "invalid"));
        Artifact invalid = BaselineBindingResolver.readSnapshot(p, sha256(Files.readAllBytes(p)));
        assertThat(new BaselineBindingResolver().verify(r, invalid).identityStatus()).isEqualTo("CONFLICTING");
    }
    @Test void sourceLocatorsUseCsvRecordsAndColumnsRatherThanInventedJsonPointers() throws Exception {
        var r = report();
        @SuppressWarnings("unchecked") List<Map<String,Object>> refs = (List<Map<String,Object>>) at(r, objective("impact_speed_mps", "physical_event_impact/source_refs"));
        assertThat(refs).anySatisfy(ref -> {
            assertThat(ref.get("artifact_id")).isEqualTo(dir + "/sensors/ground_truth.csv");
            assertThat(ref.get("locator")).isEqualTo("CSV record=3;column=*");
        });
    }
    @Test void everyEvidenceNullHasAReasonAndEveryObservedReferenceIsRegistered() throws Exception {
        var r = report();
        @SuppressWarnings("unchecked") List<Map<String,Object>> registry = (List<Map<String,Object>>) at(r, "/input/artifacts");
        Set<Object> ids = new HashSet<>(registry.stream().map(a -> a.get("id")).toList());
        validateEvidenceTree(r, ids);
    }
    private void validateEvidenceTree(Object node, Set<Object> ids) {
        if (node instanceof Map<?,?> m) {
            if (m.containsKey("value") && m.containsKey("status")) {
                if (m.get("value") == null) assertThat((List<?>)m.get("reason_codes")).isNotEmpty();
                if ("OBSERVED".equals(m.get("status"))) assertThat((List<?>)m.get("source_refs")).isNotEmpty();
                for (Object ref : (List<?>)m.get("source_refs")) assertThat(ids).contains(at(ref, "/artifact_id"));
            }
            m.values().forEach(v -> validateEvidenceTree(v, ids));
        } else if (node instanceof List<?> l) l.forEach(v -> validateEvidenceTree(v, ids));
    }
}
