package com.vsos.core.failureanalysis;

import org.junit.jupiter.api.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import static com.vsos.core.failureanalysis.Evidence.*;
import static org.assertj.core.api.Assertions.*;

/** Real offline artifact integration. Missing corpus is a reported skip, never synthetic success. */
class Golden18IntegrationTest {
    private static final String ZIP_HASH = "22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339";
    private static Path zip;
    private static java.nio.file.attribute.FileTime modified;
    private static List<Run> runs;
    private static Map<String, Map<String,Object>> reports;

    @BeforeAll static void loadRealCorpus() throws Exception {
        zip = Path.of(System.getProperty("golden18.zip", "D:/Downloads/golden18_raw_artifacts.zip"));
        Assumptions.assumeTrue(Files.isRegularFile(zip), "BLOCKED: real Golden18 ZIP missing; supply -Dgolden18.zip=<path>");
        assertThat(sha256(Files.readAllBytes(zip))).as("actual audited corpus SHA256").isEqualTo(ZIP_HASH);
        modified = Files.getLastModifiedTime(zip);
        List<Run> loaded = new ArrayList<>();
        try (RawArtifactAdapter adapter = new RawArtifactAdapter(zip)) {
            for (String dir : adapter.runDirectories()) loaded.add(adapter.read(dir));
        }
        runs = List.copyOf(loaded);
        reports = new LinkedHashMap<>();
        for (Run r : runs) reports.put(r.runKey(), new EvidenceReport().analyze(r));
    }
    @AfterAll static void rawZipIsUnchanged() throws Exception {
        if (modified != null) {
            assertThat(Files.getLastModifiedTime(zip)).isEqualTo(modified);
            assertThat(sha256(Files.readAllBytes(zip))).isEqualTo(ZIP_HASH);
        }
    }
    @Test void exactly18Cases72DistinctRunsAnd54On18Off() {
        assertThat(runs).hasSize(72);
        assertThat(runs.stream().map(Run::caseKey).distinct()).hasSize(18);
        assertThat(runs.stream().map(Run::runKey).distinct()).hasSize(72);
        assertThat(runs.stream().filter(r -> "ON".equals(EvidenceReport.mode(r).value()))).hasSize(54);
        assertThat(runs.stream().filter(r -> "OFF".equals(EvidenceReport.mode(r).value()))).hasSize(18);
        for (String c : runs.stream().map(Run::caseKey).distinct().toList()) {
            assertThat(runs.stream().filter(r -> r.caseKey().equals(c))).hasSize(4);
            for (int rep = 1; rep <= 3; rep++) assertThat(reports).containsKey(c + "-R" + rep);
        }
    }
    @TestFactory Stream<DynamicTest> oa01All72ProducerValuesAndEvaluationCopiesIncludingNull() {
        return runs.stream().map(r -> DynamicTest.dynamicTest(r.runKey(), () -> {
            var report = reports.get(r.runKey());
            for (String k : CanonicalObjectiveReader.KEYS) {
                Object original = r.get("result", "/outcome/metrics/" + k);
                assertThat(at(report, "/report/objectives/" + k + "/canonical_value/value")).isEqualTo(original);
                assertThat(at(report, "/report/objectives/" + k + "/evaluation_copy/value")).isEqualTo(r.get("result", "/evaluation/aeb_result/" + k));
                assertThat(at(report, "/report/objectives/" + k + "/copy_agreement")).isEqualTo("MATCH");
            }
            assertThat(new EvidenceValidator().validate(r)).noneMatch(i -> i.status() == Status.INVALID || i.code().equals("INCONSISTENT_IDENTITY") || i.code().equals("CLOCK_MISMATCH"));
            assertThat(r.artifacts().values()).allMatch(a -> a.runKey().equals(r.runKey()));
            assertThat(r.artifacts().values()).filteredOn(a -> !a.id().equals("manifest.csv")).allMatch(a -> a.integrity() == Integrity.VERIFIED);
        }));
    }
    @Test void oa01PresenceCountsMatchRealCorpusRatherThanInventingZero() {
        long[][] expected = {{39,29,42},{0,14,0}};
        for (int i = 0; i < 2; i++) {
            String mode = i == 0 ? "ON" : "OFF";
            for (int j = 0; j < 3; j++) {
                String key = CanonicalObjectiveReader.KEYS.get(j);
                long n = runs.stream().filter(r -> mode.equals(EvidenceReport.mode(r).value()))
                        .filter(r -> r.get("result", "/outcome/metrics/" + key) != null).count();
                assertThat(n).as(mode + " " + key).isEqualTo(expected[i][j]);
            }
        }
    }
    @Test void all18R1ObjectiveTuplesMatchPinnedAuditExamples() {
        String[] cases = {"FA-G1-001","FA-G1-002","FA-G1-003","FA-G1-004","FA-G1-007","FA-G1-010","FA-G1-011","FA-G1-012",
                "FA-G2-026","FA-G2-027","FA-G2-028","FA-G2-029","FA-G3-061","FA-G3-064","FA-G4-091","FA-G5-125","FA-G6-144","FA-G6-168"};
        Double[][] expected = {{11.823,2.413,14.631},{null,null,null},{12.174,null,9.362},{13.428,null,9.350},{null,13.900,null},
                {12.051,null,14.590},{null,13.944,null},{null,8.545,null},{null,16.737,18.002},{18.387,8.800,9.499},{16.773,12.967,19.943},
                {13.432,10.436,20.404},{12.380,null,14.597},{11.869,null,20.547},{22.736,10.022,9.608},{11.178,10.409,23.844},
                {13.141,3.085,14.668},{9.872,null,14.868}};
        for (int c = 0; c < cases.length; c++) for (int k = 0; k < 3; k++)
            assertThat(at(reports.get(cases[c] + "-R1"), "/report/objectives/" + CanonicalObjectiveReader.KEYS.get(k) + "/canonical_value/value"))
                    .as(cases[c] + " " + CanonicalObjectiveReader.KEYS.get(k)).isEqualTo(expected[c][k]);
    }
    @Test void collision43AndSensor31RemainSeparateWith12Disagreements() {
        assertThat(runs.stream().filter(r -> Boolean.TRUE.equals(r.get("result", "/outcome/metrics/collision")))).hasSize(43);
        assertThat(reports.values().stream().filter(r -> ((Number)at(r, "/report/collision_evidence/sensor_event_count/value")).intValue() > 0)).hasSize(31);
        assertThat(reports.values().stream().filter(r -> {
            Object validation = at(r, "/report/validation");
            return validation instanceof List<?> list && list.stream().anyMatch(i -> "COLLISION_EVIDENCE_DISAGREEMENT".equals(at(i, "/reason_code")));
        })).hasSize(12);
        assertThat(at(reports.get("FA-G1-011-R1"), "/report/objectives/impact_speed_mps/canonical_value/value")).isEqualTo(13.944);
        assertThat(at(reports.get("FA-G1-011-R1"), "/report/objectives/impact_speed_mps/physical_event_impact/value")).isNull();
    }
    @Test void realPhysicalEventScalarIsNotCanonicalTickSpeed() {
        assertThat(at(reports.get("FA-G1-007-R1"), "/report/objectives/impact_speed_mps/canonical_value/value")).isEqualTo(13.900);
        assertThat(at(reports.get("FA-G1-007-R1"), "/report/objectives/impact_speed_mps/physical_event_impact/value")).isEqualTo(13.935);
        assertThat(at(reports.get("FA-G1-012-R1"), "/report/objectives/impact_speed_mps/physical_event_impact/value")).isEqualTo(8.242);
    }
    @Test void hf01EveryOfflineBaselineIdentityIsUnknownIncludingV1AndScore() {
        for (var report : reports.values()) {
            assertThat(at(report, "/input/baseline_binding/identity_status")).isEqualTo("UNKNOWN");
            for (String k : List.of("project_id", "variant_id", "version_id", "confirmed_as_v1", "baseline_score", "current", "database_run_id")) {
                assertThat(at(report, "/input/baseline_binding/" + k + "/value")).isNull();
                assertThat(at(report, "/input/baseline_binding/" + k + "/status")).isEqualTo("UNKNOWN");
            }
            assertThat(at(report, "/input/database_run_id")).isNull();
        }
    }
    @Test void case091KeepsActualPoint6ForAllFourRuns() {
        assertThat(reports.values().stream().filter(r -> "FA-G4-091".equals(at(r, "/input/case_key"))))
                .hasSize(4).allMatch(r -> Double.valueOf(.6).equals(at(r, "/input/parameters/ttc_threshold/value")));
        assertThat(reports.values().stream().filter(r -> Double.valueOf(1.5).equals(at(r, "/input/parameters/ttc_threshold/value")))).hasSize(68);
    }
    @Test void realJerkLineageAndMissing026WindowAreRetained() {
        var r = reports.get("FA-G2-026-R1");
        assertThat(at(r, "/input/metric_lineage/signal/value")).isEqualTo("ego_a");
        assertThat(at(r, "/input/metric_lineage/filter/value/order_per_pass")).isEqualTo(6L);
        assertThat(at(r, "/input/metric_lineage/window/value")).isEqualTo("T_AEB to end of run");
        assertThat(at(r, "/report/objectives/rms_jerk_mps3/canonical_value/value")).isNull();
        assertThat(at(r, "/report/objectives/stopping_distance_m/canonical_value/value")).isEqualTo(18.002);
        assertThat(at(r, "/report/objectives/stopping_distance_m/decomposition/trace_component/status")).isEqualTo("UNKNOWN");
    }
    @Test void noFailureOrRootIsInventedAndDigestIsReplayable() {
        for (var r : reports.values()) {
            assertThat(at(r, "/report/root_cause_hypotheses")).isEqualTo(List.of());
            assertThat(at(r, "/report/physical_outcome/status")).isEqualTo("UNKNOWN");
            assertThat(r.get("content_digest")).isEqualTo(EvidenceReport.contentDigest(r));
        }
    }
    @Test void realStreamRowCountsRetainSensorOnlyTail() {
        assertThat(runs.stream().mapToLong(r -> ((List<?>)r.get("result", "/outcome/frames")).size()).sum()).isEqualTo(31423);
        assertThat(runs.stream().mapToLong(r -> ((List<?>)r.get("frames", "")).size()).sum()).isEqualTo(31528);
        assertThat(runs.stream().mapToLong(r -> ((List<?>)r.get("ground_truth", "")).size()).sum()).isEqualTo(62768);
    }
}
