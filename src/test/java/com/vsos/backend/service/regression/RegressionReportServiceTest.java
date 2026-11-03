package com.vsos.backend.service.regression;

import com.vsos.backend.dto.regression.RegressionRecords.DecidedRecommendation;
import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.dto.regression.RegressionRecords.RunInfo;
import com.vsos.backend.dto.regression.RegressionRecords.VehicleInfo;
import com.vsos.backend.dto.regression.RegressionResponses.CandidateSource;
import com.vsos.backend.dto.regression.RegressionResponses.Counts;
import com.vsos.backend.dto.regression.RegressionResponses.CriterionResult;
import com.vsos.backend.dto.regression.RegressionResponses.DecisionHistory;
import com.vsos.backend.dto.regression.RegressionResponses.ExportPair;
import com.vsos.backend.dto.regression.RegressionResponses.MedianTtc;
import com.vsos.backend.dto.regression.RegressionResponses.PairResult;
import com.vsos.backend.dto.regression.RegressionResponses.ParameterDiff;
import com.vsos.backend.dto.regression.RegressionResponses.Rates;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionExport;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionSummary;
import com.vsos.backend.exception.regression.RegressionExceptions.TestNotFinishedException;
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.simulation.RunService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Gói xuất, cảnh báo bộ mô phỏng và lịch sử quyết định của màn 5: chỉ đọc, không email, không số giả. Repository giả. */
class RegressionReportServiceTest {

    private static final long PROJECT = 1L;
    private static final long TEST = 30L;
    private static final long BASELINE = 10L;
    private static final long CANDIDATE = 11L;

    private RegressionRepository repo;
    private Queries queries;
    private RegressionService regression;
    private RegressionReportService reports;

    @BeforeEach
    void setUp() {
        repo = mock(RegressionRepository.class);
        queries = mock(Queries.class);
        regression = mock(RegressionService.class);
        reports = new RegressionReportService(repo, queries, regression);
        when(queries.currentProject()).thenReturn(row("id", PROJECT));
    }

    private static Row row(Object... keyValues) {
        return new Row(Json.obj(keyValues));
    }

    @Test
    void onlyCarlaGetsTheUncalibratedCaveat() {
        assertThat(RegressionReportService.simulatorCaveat("carla-0.9.16-xosc2").carla()).isTrue();
        assertThat(RegressionReportService.simulatorCaveat("carla-0.9.16-xosc2").calibrated()).isFalse();
        assertThat(RegressionReportService.simulatorCaveat(RunService.KINEMATIC_SIMULATOR)).isNull();
        assertThat(RegressionReportService.simulatorCaveat(null)).isNull();
    }

    // ------------------------------------------------------------------ gói xuất

    private void arrangeTest(String executionStatus, String variantLabel) {
        RegressionTestRow test = new RegressionTestRow(TEST, PROJECT, 20L, BASELINE, CANDIDATE, 3L, "carla-0.9.16-xosc2", "t",
                Map.of("criteria", Map.of(), "scenario_set", Map.of("variant_count", 1)), executionStatus, "PASSED", 1L, 0L, 5L,
                LocalDateTime.of(2026, 10, 20, 9, 0), LocalDateTime.of(2026, 10, 20, 9, 5));
        when(repo.findTest(PROJECT, TEST)).thenReturn(test);
        when(repo.findVersion(anyLong())).thenAnswer(inv -> row("id", inv.getArgument(0), "label", ((Long) inv.getArgument(0)) == BASELINE ? "v1.0" : "v1.1"));
        when(repo.findScenario(20L)).thenReturn(row("id", 20L, "code", "SC-A", "name", "Họ A"));
        when(repo.vehicleInfo(3L)).thenReturn(new VehicleInfo("vehicle.audi.etron", "Audi e-tron", 2595.0, 8.0));
        when(repo.candidateSource(CANDIDATE)).thenReturn(new CandidateSource("MANUAL", null, null, null, null));
        when(repo.runInfo(any())).thenReturn(Map.of(2001L, new RunInfo(2001L, 48_101L, 0.05, 12.0)));
        when(regression.recommendationFor(TEST)).thenReturn(new RecommendationRow(77L, TEST, CANDIDATE, "ACCEPTED", 5L, 9L,
                LocalDateTime.of(2026, 10, 20, 10, 0), "đủ bằng chứng", "theo dõi thêm", null));
        when(queries.displayNames(any())).thenReturn(Map.of(5L, "Kỹ Sư A", 9L, "Người Duyệt B"));
        when(regression.parameterDiff(BASELINE, CANDIDATE)).thenReturn(List.of(
                new ParameterDiff("TTC_THRESHOLD", "TTC", "s", "DECISION", 1.5, 1.6, true)));
        when(regression.summary(any())).thenReturn(new RegressionSummary(
                new Counts(1, 1, 0, 0, 0), Map.of(), new Rates(100.0, 0.0, 0.0, 0.0), new MedianTtc(0.4, 1.2, 0.8), List.of(),
                List.of(new CriterionResult("no_new_collision", "No previously safe scenario may collide", true, true, null, 0, true)),
                List.of(new PairResult(101L, variantLabel, "Day · clear · 40 km/h", "Họ A", 1001L, 2001L, "COLLISION", "SAFE", "FAIL", "PASS",
                        false, false, 0.8, null, "fixed", 9.1, 6.4, 3.2, null, 14.0, 12.5)),
                null));
    }

    @Test
    void anUnfinishedTestCannotBeExported() {
        arrangeTest("RUNNING", "SC-A-001");
        assertThatThrownBy(() -> reports.export(TEST)).isInstanceOf(TestNotFinishedException.class).hasMessageContaining("chưa chạy xong");
        arrangeTest("FAILED", "SC-A-001");
        assertThatThrownBy(() -> reports.exportCsv(TEST)).isInstanceOf(TestNotFinishedException.class);
    }

    @Test
    void theExportCarriesTheManifestPairsSeedsAndDecisionButNoEmail() {
        arrangeTest("COMPLETED", "SC-A-001");

        RegressionExport data = reports.export(TEST);

        var manifest = data.manifest();
        assertThat(manifest.schema()).isEqualTo(RegressionReportService.EXPORT_SCHEMA);
        assertThat(manifest.regressionCode()).isEqualTo("RT-030");
        assertThat(manifest.simulatorVersion()).isEqualTo("carla-0.9.16-xosc2");
        assertThat(manifest.simulatorCaveat().calibrated()).isFalse();
        assertThat(manifest.vehicle().carlaBlueprintId()).isEqualTo("vehicle.audi.etron");
        assertThat(manifest.vehicle().massKg()).isEqualTo(2595.0);
        assertThat(manifest.vehicle().maxBrakeDecelMps2()).isEqualTo(8.0);
        assertThat(manifest.createdBy()).isEqualTo("Kỹ Sư A");
        assertThat(manifest.dtS()).isEqualTo(0.05);
        assertThat(manifest.maxDurationS()).isEqualTo(12.0);
        assertThat(manifest.bundleSchema()).isEqualTo(RunService.VARIANT_FORMAT);
        assertThat(manifest.codeVersion()).isNull();
        assertThat(data.pairs()).hasSize(1);
        ExportPair pair = data.pairs().get(0);
        assertThat(pair.seed()).isEqualTo(48_101L);
        assertThat(pair.baselineRunId()).isEqualTo(1001L);
        assertThat(pair.candidateRunId()).isEqualTo(2001L);
        assertThat(pair.baselineXoscUrl()).isEqualTo("/api/v1/vehicsim/runs/1001/xosc");
        assertThat(pair.candidateXoscUrl()).isEqualTo("/api/v1/vehicsim/runs/2001/xosc");
        assertThat(pair.baselineRmsJerkMps3()).isEqualTo(9.1);
        assertThat(pair.candidateRmsJerkMps3()).isEqualTo(6.4);
        assertThat(pair.candidateImpactSpeedMps()).isNull();
        assertThat(pair.candidateStoppingDistanceM()).isEqualTo(12.5);
        assertThat(data.decision().status()).isEqualTo("ACCEPT");
        assertThat(data.decision().reviewedBy()).isEqualTo("Người Duyệt B");
        assertThat(data.decision().reason()).isEqualTo("đủ bằng chứng");
        assertThat(data.decision().conditions()).isEqualTo("theo dõi thêm");
        assertThat(Json.write(data)).doesNotContain("email").doesNotContain("@");
    }

    @Test
    void theCsvHasOneRowPerPairAndNeutralisesFormulas() {
        arrangeTest("COMPLETED", "=HYPERLINK(\"http://x\")");

        String csv = reports.exportCsv(TEST);

        String[] lines = csv.split("\r\n");
        assertThat(lines).hasSize(2);
        assertThat(lines[0]).startsWith("variant,baseline_run_id,candidate_run_id,seed");
        assertThat(lines[0]).endsWith("baseline_stopping_distance_m,candidate_stopping_distance_m");
        // Không va chạm (NULL) là ô rỗng, không phải 0.
        assertThat(lines[1]).isEqualTo("\"'=HYPERLINK(\"\"http://x\"\")\",1001,2001,48101,COLLISION,SAFE,fixed,False,False,0.8,9.1,6.4,3.2,,14.0,12.5");
    }

    // ------------------------------------------------------------------ lịch sử

    @Test
    void theHistoryListsDecisionsNewestFirstAndTheBaselineChainWithItsInitialBaseline() {
        when(queries.versions(PROJECT, false)).thenReturn(List.of(
                row("id", 10L, "version_no", 1L, "label", "v1.0", "status", "ARCHIVED"),
                row("id", 11L, "version_no", 2L, "label", "v1.1", "status", "BASELINE"),
                row("id", 12L, "version_no", 3L, "label", "v1.2", "status", "REJECTED")));
        when(repo.decidedRecommendations(PROJECT)).thenReturn(List.of(
                new DecidedRecommendation(31L, 12L, 11L, "REJECTED", 9L, LocalDateTime.of(2026, 10, 21, 9, 0), "không đạt", null),
                new DecidedRecommendation(30L, 11L, 10L, "ACCEPTED", 9L, LocalDateTime.of(2026, 10, 20, 10, 0), "đủ bằng chứng", null)));
        when(queries.displayNames(any())).thenReturn(Map.of(9L, "Người Duyệt B"));

        DecisionHistory history = reports.decisionHistory();

        assertThat(history.decisions()).extracting(d -> d.regressionCode()).containsExactly("RT-031", "RT-030");
        assertThat(history.decisions()).extracting(d -> d.decision()).containsExactly("REJECT", "ACCEPT");
        assertThat(history.decisions().get(1).baseline()).isEqualTo("v1.0");
        assertThat(history.decisions().get(1).candidate()).isEqualTo("v1.1");
        assertThat(history.baselines()).extracting(b -> b.label()).containsExactly("v1.0", "v1.1");
        assertThat(history.baselines().get(0).promotedBy()).as("baseline khởi tạo không do quyết định nào nâng").isNull();
        assertThat(history.baselines().get(1).promotedBy()).isEqualTo("Người Duyệt B");
        assertThat(history.baselines().get(1).regressionCode()).isEqualTo("RT-030");
        assertThat(history.baselines().get(1).reason()).isEqualTo("đủ bằng chứng");
    }

    @Test
    void anEmptyHistoryIsEmptyNotAnError() {
        when(queries.versions(PROJECT, false)).thenReturn(List.of());
        when(repo.decidedRecommendations(PROJECT)).thenReturn(List.of());

        DecisionHistory history = reports.decisionHistory();

        assertThat(history.decisions()).isEmpty();
        assertThat(history.baselines()).isEmpty();
    }
}
