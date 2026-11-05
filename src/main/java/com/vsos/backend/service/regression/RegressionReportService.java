package com.vsos.backend.service.regression;

import com.vsos.backend.common.Csv;
import com.vsos.backend.common.Vs;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.dto.regression.RegressionRecords.DecidedRecommendation;
import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.dto.regression.RegressionRecords.RunInfo;
import com.vsos.backend.dto.regression.RegressionRecords.VehicleInfo;
import com.vsos.backend.dto.regression.RegressionResponses.BaselineItem;
import com.vsos.backend.dto.regression.RegressionResponses.CandidateSource;
import com.vsos.backend.dto.regression.RegressionResponses.DecisionHistory;
import com.vsos.backend.dto.regression.RegressionResponses.DecisionItem;
import com.vsos.backend.dto.regression.RegressionResponses.ExportCandidate;
import com.vsos.backend.dto.regression.RegressionResponses.ExportDecision;
import com.vsos.backend.dto.regression.RegressionResponses.ExportManifest;
import com.vsos.backend.dto.regression.RegressionResponses.ExportPair;
import com.vsos.backend.dto.regression.RegressionResponses.ExportScenario;
import com.vsos.backend.dto.regression.RegressionResponses.ExportVehicle;
import com.vsos.backend.dto.regression.RegressionResponses.ExportVersion;
import com.vsos.backend.dto.regression.RegressionResponses.PairResult;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionExport;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionSummary;
import com.vsos.backend.dto.regression.RegressionResponses.SimulatorCaveat;
import com.vsos.backend.exception.regression.RegressionExceptions.TestNotFinishedException;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.backend.service.simulation.RunService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class RegressionReportService {

    public static final String EXPORT_SCHEMA = "vehicsim.regression-export/v1";

    static final String XOSC_URL = "/api/v1/vehicsim/runs/%d/xosc";

    private static final List<String> CSV_COLUMNS = List.of("variant", "baseline_run_id", "candidate_run_id", "seed", "baseline_outcome",
            "candidate_outcome", "change", "baseline_false_activation", "candidate_false_activation", "min_ttc_delta_s",
            "baseline_rms_jerk_mps3", "candidate_rms_jerk_mps3", "baseline_impact_speed_mps", "candidate_impact_speed_mps",
            "baseline_stopping_distance_m", "candidate_stopping_distance_m");

    private final RegressionRepository repo;
    private final Queries queries;
    private final ProjectAccess projects;
    private final RegressionService regression;

    public RegressionReportService(RegressionRepository repo, Queries queries, RegressionService regression, ProjectAccess projects) {
        this.repo = repo;
        this.queries = queries;
        this.projects = projects;
        this.regression = regression;
    }

    public CandidateSource candidateSource(long candidateVersionId) {
        return repo.candidateSource(candidateVersionId);
    }

    public static SimulatorCaveat simulatorCaveat(String simulatorVersion) {
        return RunService.isCarla(simulatorVersion) ? new SimulatorCaveat(true, false) : null;
    }

    public RegressionExport export(long testId) {
        RegressionTestRow test = completedTest(testId);
        Row baseline = repo.findVersion(test.baselineVersionId());
        Row candidate = repo.findVersion(test.candidateVersionId());
        Row scenario = repo.findScenario(test.scenarioId());
        VehicleInfo vehicle = repo.vehicleInfo(test.vehicleModelId());
        RecommendationRow rec = regression.recommendationFor(testId);
        RegressionSummary summary = regression.summary(test);

        List<Long> nameIds = new ArrayList<>();
        nameIds.add(test.createdBy());
        nameIds.add(rec == null ? null : rec.reviewedBy());
        Map<Long, String> names = queries.displayNames(nameIds);

        Map<Long, RunInfo> runInfo = repo.runInfo(summary.pairs().stream().map(PairResult::candidateRunId).toList());
        List<ExportPair> pairs = summary.pairs().stream().map(p -> exportPair(p, runInfo.get(p.candidateRunId()))).toList();
        RunInfo firstRun = runInfo.values().stream().findFirst().orElse(null);

        ExportManifest manifest = new ExportManifest(
                EXPORT_SCHEMA,
                Vs.iso(Vs.now()),
                RegressionCodes.testCode(testId),
                RegressionCodes.recommendationCode(testId),
                test.simulatorVersion(),
                simulatorCaveat(test.simulatorVersion()),
                vehicle == null ? null : new ExportVehicle(vehicle.carlaBlueprintId(), vehicle.displayName(), vehicle.massKg(), vehicle.maxBrakeDecelMps2()),
                firstRun == null ? null : firstRun.fixedDeltaSeconds(),
                firstRun == null ? null : firstRun.maxDurationS(),
                RunService.VARIANT_FORMAT,
                null,
                new ExportScenario(scenario.lng("id"), scenario.str("code"), scenario.str("name")),
                test.scenarioSet(),
                new ExportVersion(test.baselineVersionId(), Vs.versionLabel(baseline)),
                new ExportCandidate(test.candidateVersionId(), Vs.versionLabel(candidate), candidateSource(test.candidateVersionId())),
                RegressionCodes.displayStatus(test),
                names.get(test.createdBy()),
                Vs.iso(test.createdDate()),
                test.finishedAt() == null ? null : Vs.iso(test.finishedAt()));

        ExportDecision decision = new ExportDecision(
                RegressionCodes.displayDecision(rec),
                rec == null ? null : names.get(rec.reviewedBy()),
                rec != null && rec.reviewedAt() != null ? Vs.iso(rec.reviewedAt()) : null,
                rec == null ? null : rec.reviewNotes(),
                rec == null ? null : rec.reviewConditions());

        return new RegressionExport(manifest, regression.parameterDiff(test.baselineVersionId(), test.candidateVersionId()),
                summary.criteria(), summary.counts(), summary.rates(), summary.medianMinTtc(), pairs, decision);
    }

    public String exportCsv(long testId) {
        StringBuilder csv = new StringBuilder(String.join(",", CSV_COLUMNS)).append("\r\n");
        for (ExportPair p : export(testId).pairs()) {
            List<Object> cells = Arrays.asList(p.variant(), p.baselineRunId(), p.candidateRunId(), p.seed(), p.baselineOutcome(),
                    p.candidateOutcome(), p.change(), p.baselineFalseActivation(), p.candidateFalseActivation(), p.minTtcDeltaS(),
                    p.baselineRmsJerkMps3(), p.candidateRmsJerkMps3(), p.baselineImpactSpeedMps(), p.candidateImpactSpeedMps(),
                    p.baselineStoppingDistanceM(), p.candidateStoppingDistanceM());
            csv.append(cells.stream().map(Csv::cell).collect(Collectors.joining(","))).append("\r\n");
        }
        return csv.toString();
    }

    public DecisionHistory decisionHistory() {
        long projectId = projects.currentProject().lng("id");
        Map<Long, Row> versions = new LinkedHashMap<>();
        queries.versions(projectId, false).forEach(v -> versions.put(v.lng("id"), v));
        List<DecidedRecommendation> decided = repo.decidedRecommendations(projectId);

        List<DecisionItem> decisions = new ArrayList<>();
        Map<Long, DecisionItem> promotions = new LinkedHashMap<>();
        for (DecidedRecommendation d : decided) {
            DecisionItem item = new DecisionItem(
                    RegressionCodes.recommendationCode(d.testId()),
                    RegressionCodes.testCode(d.testId()),
                    d.testId(),
                    label(versions, d.baselineVersionId()),
                    label(versions, d.candidateVersionId()),
                    d.decision(),
                    d.reviewerName(),
                    d.reviewedAt() == null ? null : Vs.iso(d.reviewedAt()),
                    d.reviewNotes(),
                    d.reviewConditions(),
                    d.decisionId(),
                    d.reviewedBy(),
                    d.source());
            decisions.add(item);
            if ("ACCEPT".equals(d.decision())) {
                promotions.put(d.candidateVersionId(), item);
            }
        }

        List<BaselineItem> baselines = new ArrayList<>();
        for (Row v : versions.values()) {
            String status = v.str("status");
            if (!"BASELINE".equals(status) && !"ARCHIVED".equals(status)) {
                continue;
            }
            DecisionItem promotion = promotions.get(v.lng("id"));
            baselines.add(new BaselineItem(v.lng("id"), v.lng("version_no"), Vs.versionLabel(v), status,
                    promotion == null ? null : promotion.reviewedBy(),
                    promotion == null ? null : promotion.reviewedAt(),
                    promotion == null ? null : promotion.regressionCode(),
                    promotion == null ? null : promotion.reason()));
        }
        return new DecisionHistory(decisions, baselines);
    }

    private RegressionTestRow completedTest(long testId) {
        RegressionTestRow test = repo.findTest(projects.currentProject().lng("id"), testId);
        if (test == null) {
            throw new NotFoundException("regression test");
        }
        if (!test.completed()) {
            throw new TestNotFinishedException("regression test chưa chạy xong hoặc bị lỗi nên chưa xuất được gói kết quả");
        }
        return test;
    }

    private static ExportPair exportPair(PairResult p, RunInfo info) {
        return new ExportPair(
                p.variantId(), p.label(), p.baselineRunId(), p.candidateRunId(),
                info == null ? null : info.randomSeed(),
                p.baselineOutcome(), p.candidateOutcome(), p.change(), p.baselineFalseActivation(), p.candidateFalseActivation(),
                p.minTtcDeltaS(),
                String.format(Locale.ROOT, XOSC_URL, p.baselineRunId()),
                String.format(Locale.ROOT, XOSC_URL, p.candidateRunId()),
                p.baselineRmsJerkMps3(), p.candidateRmsJerkMps3(), p.baselineImpactSpeedMps(), p.candidateImpactSpeedMps(),
                p.baselineStoppingDistanceM(), p.candidateStoppingDistanceM());
    }

    private static String label(Map<Long, Row> versions, long id) {
        Row v = versions.get(id);
        return v == null ? "#" + id : Vs.versionLabel(v);
    }
}
