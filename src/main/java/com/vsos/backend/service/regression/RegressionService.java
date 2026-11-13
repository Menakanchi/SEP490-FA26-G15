package com.vsos.backend.service.regression;

import com.vsos.backend.common.Vs;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.dto.regression.RegressionRecords.CandidateRun;
import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.dto.regression.RegressionRecords.RunResult;
import com.vsos.backend.dto.regression.RegressionRecords.ScenarioSet;
import com.vsos.backend.dto.regression.RegressionResponses.Counts;
import com.vsos.backend.dto.regression.RegressionResponses.ParameterDiff;
import com.vsos.backend.dto.regression.RegressionResponses.PreviewVariant;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionPreviewResponse;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionSummary;
import com.vsos.backend.exception.regression.RegressionExceptions.InvalidCandidateException;
import com.vsos.backend.exception.regression.RegressionExceptions.InvalidScenarioSetException;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.backend.service.simulation.RunService;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
public class RegressionService {

    public static final double DEFAULT_FALSE_ACTIVATION_MAX_PTS = RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS;

    private final RegressionRepository repo;
    private final Queries queries;
    private final FamilyService families;
    private final RunService runs;
    private final TransactionTemplate tx;

    public RegressionService(RegressionRepository repo, Queries queries, FamilyService families, RunService runs, TransactionTemplate tx) {
        this.repo = repo;
        this.queries = queries;
        this.families = families;
        this.runs = runs;
        this.tx = tx;
    }

    public RegressionPreviewResponse preview(long projectId, long scenarioId) {
        return preview(projectId, scenarioId, null, false);
    }

    public RegressionPreviewResponse preview(long projectId, long scenarioId, List<Long> variantIds, boolean includeVariants) {
        Row baseline = requireBaseline(projectId);
        Row scenario = requireScenario(projectId, scenarioId);
        List<Row> variants = families.variantsOf(families.latestBaseVersionId(scenarioId));
        List<Long> familyIds = variants.stream().map(v -> v.lng("id")).toList();
        Map<Long, Row> baselineRuns = latestBaselineRuns(baseline, familyIds);
        Set<Long> critical = criticalVariantIds(baseline, familyIds);

        Integer selectedCount = null;
        Long selectedCritical = null;
        Long selectedSafe = null;
        Long selectedExisting = null;
        if (variantIds != null) {
            List<Long> ids = selectVariants(variants, variantIds).stream().map(v -> v.lng("id")).toList();
            selectedCount = ids.size();
            selectedCritical = ids.stream().filter(critical::contains).count();
            selectedSafe = safeCount(ids, baselineRuns, critical);
            selectedExisting = ids.stream().filter(baselineRuns::containsKey).count();
        }
        List<PreviewVariant> list = null;
        if (includeVariants) {
            Map<Long, RunResult> results = repo.runResults(baselineRuns.values().stream().map(r -> r.lng("id")).toList());
            list = new ArrayList<>();
            for (Row v : variants) {
                Row run = baselineRuns.get(v.lng("id"));
                RunResult res = run == null ? null : results.get(run.lng("id"));
                list.add(new PreviewVariant(
                        v.lng("id"),
                        Vs.variantLabel(scenario.str("code"), v.lng("version_no")),
                        Vs.variantSummary(v.json("scenario_ir_json")),
                        res == null ? null : res.outcome(),
                        res == null ? null : res.falseActivation(),
                        run != null,
                        safeCount(List.of(v.lng("id")), baselineRuns, critical) == 1,
                        critical.contains(v.lng("id"))));
            }
        }
        return new RegressionPreviewResponse(scenarioId, scenario.str("name"), Vs.versionLabel(baseline), runs.configuredSimulator(),
                variants.size(), critical.size(), baselineRuns.size(), selectedCount, selectedCritical, selectedSafe, selectedExisting, list);
    }

    @Transactional
    public long createTestAsReviewer(long projectId, long userId, long candidateVersionId, long scenarioId, boolean includeOldCritical,
                                     boolean includeAllVariants, Map<String, Map<String, Object>> criteria, String name, List<Long> variantIds) {
        Row scope = repo.lockReviewAccess(projectId, userId);
        if (scope == null) throw new NotFoundException("project");
        if (!"ACTIVE".equals(scope.str("project_status")) || !"ACTIVE".equals(scope.str("workspace_status"))) {
            throw new InvalidRequestException("Project hoặc workspace đã lưu trữ, chỉ được xem lịch sử");
        }
        return createTest(projectId, userId, candidateVersionId, scenarioId, includeOldCritical, includeAllVariants, criteria, name, variantIds);
    }

    @Transactional
    public long createTest(long projectId, long userId, long candidateVersionId, long scenarioId, boolean includeOldCritical,
                           boolean includeAllVariants, Map<String, Map<String, Object>> criteria, String name) {
        return createTest(projectId, userId, candidateVersionId, scenarioId, includeOldCritical, includeAllVariants, criteria, name, null);
    }

    @Transactional
    public long createTest(long projectId, long userId, long candidateVersionId, long scenarioId, boolean includeOldCritical,
                           boolean includeAllVariants, Map<String, Map<String, Object>> criteria, String name, List<Long> variantIds) {
        if (variantIds == null && !(includeOldCritical || includeAllVariants)) {
            throw new InvalidScenarioSetException("chọn ít nhất một bộ kịch bản");
        }
        Map<String, Map<String, Object>> merged = RegressionCriteria.merge(criteria);
        Row candidate = repo.findVersion(projectId, candidateVersionId);
        if (candidate == null) {
            throw new NotFoundException("candidate AEB version");
        }
        if (!"CANDIDATE".equals(candidate.str("status"))) {
            throw new InvalidCandidateException("chỉ version ở trạng thái CANDIDATE mới đem đi regression được");
        }
        Row baseline = requireBaseline(projectId);
        requireScenario(projectId, scenarioId);

        Row vehicle = queries.activeVehicle(projectId);
        List<Row> variants = families.variantsOf(families.latestBaseVersionId(scenarioId));
        List<Long> familyIds = variants.stream().map(v -> v.lng("id")).toList();
        Map<Long, Row> baselineRuns = latestBaselineRuns(baseline, familyIds);
        Set<Long> critical = failedVariantIds(baselineRuns);

        List<Row> selected = variantIds != null ? selectVariants(variants, variantIds)
                : includeAllVariants ? variants : variants.stream().filter(v -> critical.contains(v.lng("id"))).toList();
        List<Long> selectedIds = selected.stream().map(v -> v.lng("id")).toList();
        if (selected.isEmpty()) {
            throw new InvalidScenarioSetException("bộ kịch bản được chọn đang rỗng (chưa có ca lỗi nào của baseline)");
        }

        String testName = name != null && !name.isEmpty() ? name : Vs.versionLabel(baseline) + " → " + Vs.versionLabel(candidate);
        ScenarioSet scenarioSet = new ScenarioSet(
                variantIds != null ? "custom" : includeAllVariants ? "all_variants" : "old_critical",
                variantIds == null && includeOldCritical, variantIds == null && includeAllVariants,
                critical.size(), selected.size(), variantIds == null ? null : selectedIds, safeCount(selectedIds, baselineRuns, critical));
        long testId = repo.insertTest(projectId, scenarioId, baseline.lng("id"), candidate.lng("id"), vehicle.lng("id"), runs.configuredSimulator(),
                testName, merged, scenarioSet, selected.size(), userId);

        List<Row> missing = selected.stream().filter(v -> !baselineRuns.containsKey(v.lng("id"))).toList();
        List<Long> newBaselineIds = runs.createRuns(projectId, scenarioId, missing, vehicle.lng("id"), baseline.lng("id"), userId, "BASELINE", null, null);
        for (Row r : repo.runsByIds(newBaselineIds)) {
            baselineRuns.put(r.lng("scenario_version_id"), r);
        }
        List<Long> candidateIds = runs.createRuns(projectId, scenarioId, selected, vehicle.lng("id"), candidate.lng("id"), userId, "REGRESSION",
                testId, baselineRuns);
        List<Long> all = new ArrayList<>(newBaselineIds);
        all.addAll(candidateIds);
        runs.dispatch(all);
        return testId;
    }

    @EventListener
    public void onRunFinished(RunService.RunFinished event) {
        Row run = repo.findRun(event.runId());
        if (run == null) {
            return;
        }
        List<Long> testIds = run.getLong("regression_test_id") != null
                ? List.of(run.lng("regression_test_id"))
                : repo.testsUsingBaselineRun(event.runId());
        for (long testId : testIds) {
            tryFinalize(testId);
        }
    }

    public void tryFinalize(long testId) {
        tx.executeWithoutResult(status -> {
            RegressionTestRow test = repo.findTest(testId);
            if (test == null || !"RUNNING".equals(test.executionStatus())) {
                return;
            }
            List<CandidateRun> candidateRuns = repo.candidateRuns(testId);
            List<Long> ids = pairedRunIds(candidateRuns);
            Map<Long, RunResult> results = repo.runResults(ids);
            List<String> statuses = ids.stream().map(i -> results.containsKey(i) ? results.get(i).status() : null).toList();
            if (statuses.stream().anyMatch(s -> s == null || s.equals("PENDING") || s.equals("RUNNING") || s.equals("PAUSED"))) {
                return;
            }
            if (statuses.stream().anyMatch(s -> !s.equals("COMPLETED"))) {
                repo.markFailed(testId);
                return;
            }
            RegressionSummary summary = summarize(test, candidateRuns, results);
            String verdict = RegressionSummarizer.verdict(summary);
            Counts counts = summary.counts();
            if (!repo.markCompleted(testId, verdict, counts.scenarios(), counts.fixed(), counts.regressed())) {
                return;
            }
            repo.insertItems(testId, summary.pairs());
            createRecommendation(test, verdict, counts);
        });
    }

    public RegressionSummary summary(RegressionTestRow test) {
        if ("FAILED".equals(test.executionStatus())) {
            return RegressionSummary.failed("một số lần chạy mô phỏng hỏng — xem simulation_runs");
        }
        if (!test.completed()) {
            return RegressionSummary.EMPTY;
        }
        List<CandidateRun> candidateRuns = repo.candidateRuns(test.id());
        return summarize(test, candidateRuns, repo.runResults(pairedRunIds(candidateRuns)));
    }

    public List<ParameterDiff> parameterDiff(long baselineVersionId, long candidateVersionId) {
        Map<String, Double> base = queries.aebValues(baselineVersionId);
        Map<String, Double> cand = queries.aebValues(candidateVersionId);
        List<ParameterDiff> out = new ArrayList<>();
        for (Row p : queries.parameterCatalog()) {
            String code = p.str("code");
            out.add(new ParameterDiff(code, p.str("name"), p.str("unit"), p.str("category"), base.get(code), cand.get(code),
                    !Objects.equals(base.get(code), cand.get(code))));
        }
        return out;
    }

    public Set<Long> criticalVariantIds(Row baseline, List<Long> variantIds) {
        return failedVariantIds(latestBaselineRuns(baseline, variantIds));
    }

    public RecommendationRow recommendationFor(long testId) {
        return repo.findRecommendation(testId);
    }

    private Map<Long, Row> latestBaselineRuns(Row baseline, List<Long> variantIds) {
        return repo.latestBaselineRuns(baseline.lng("id"), variantIds, runs.configuredSimulator(),
                queries.activeVehicle(baseline.lng("project_id")).lng("id"));
    }

    private Set<Long> failedVariantIds(Map<Long, Row> baselineRuns) {
        List<Long> completed = baselineRuns.values().stream().filter(r -> "COMPLETED".equals(r.str("status"))).map(r -> r.lng("id")).toList();
        return repo.variantsWithFailures(completed);
    }

    private static List<Row> selectVariants(List<Row> variants, List<Long> variantIds) {
        if (variantIds.isEmpty()) {
            throw new InvalidScenarioSetException("tập biến thể chọn tay đang rỗng");
        }
        Set<Long> wanted = new LinkedHashSet<>(variantIds);
        Set<Long> known = new LinkedHashSet<>(variants.stream().map(v -> v.lng("id")).toList());
        List<Long> unknown = wanted.stream().filter(id -> !known.contains(id)).toList();
        if (!unknown.isEmpty()) {
            throw new InvalidScenarioSetException("biến thể không thuộc bộ biến thể hiện tại của họ kịch bản: " + unknown);
        }
        return variants.stream().filter(v -> wanted.contains(v.lng("id"))).toList();
    }

    private static long safeCount(List<Long> ids, Map<Long, Row> baselineRuns, Set<Long> critical) {
        return ids.stream().filter(id -> baselineRuns.containsKey(id) && "COMPLETED".equals(baselineRuns.get(id).str("status"))
                && !critical.contains(id)).count();
    }

    private Row requireBaseline(long projectId) {
        Row baseline = queries.baselineVersion(projectId);
        if (baseline == null) {
            throw new InvalidCandidateException("project chưa có baseline");
        }
        return baseline;
    }

    private Row requireScenario(long projectId, long scenarioId) {
        Row scenario = repo.findScenario(projectId, scenarioId);
        if (scenario == null) {
            throw new NotFoundException("scenario family");
        }
        return scenario;
    }

    private static List<Long> pairedRunIds(List<CandidateRun> candidateRuns) {
        List<Long> ids = new ArrayList<>(candidateRuns.stream().map(CandidateRun::id).toList());
        candidateRuns.forEach(r -> ids.add(r.baselineRunId()));
        return ids;
    }

    private RegressionSummary summarize(RegressionTestRow test, List<CandidateRun> candidateRuns, Map<Long, RunResult> results) {
        Map<Long, Row> versions = repo.scenarioVersions(candidateRuns.stream().map(CandidateRun::scenarioVersionId).toList());
        return RegressionSummarizer.summarize(test.criteria(), repo.findScenario(test.scenarioId()), versions, candidateRuns, results);
    }

    private void createRecommendation(RegressionTestRow test, String verdict, Counts counts) {
        if (!repo.projectInWorkspace(test.projectId())) {
            return;
        }
        Map<Long, Row> versions = repo.versionsById(test.baselineVersionId(), test.candidateVersionId());
        String content = "Candidate " + Vs.versionLabel(versions.get(test.candidateVersionId())) + " vs baseline "
                + Vs.versionLabel(versions.get(test.baselineVersionId())) + ": " + counts.fixed() + " fixed, "
                + counts.regressed() + " regressed of " + counts.scenarios() + " scenarios.";
        String confidence = RegressionCriteria.confidence("PASSED".equals(verdict), counts.regressed(), counts.scenarios()).toUpperCase();
        repo.insertRecommendation(test.projectId(), test.id(), test.candidateVersionId(), content, confidence, test.createdBy());
    }
}
