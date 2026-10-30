package com.vsos.backend.service.regression;

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
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.backend.common.Vs;
import com.vsos.backend.common.Vs.NotFoundException;
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

/**
 * Regression test (FE-14, màn 5): tạo test, xem trước bộ kịch bản, ghép cặp run và chốt kết quả khi run xong.
 * <p>
 * Luồng: {@link #createTest} chốt một xe và một bộ mô phỏng, tạo run baseline còn thiếu và run REGRESSION chạy candidate với đúng seed
 * của run baseline (cơ chế chạy của {@code RunService}); mỗi run xong gọi {@link #tryFinalize} — đủ cặp thì ghi từng cặp, số ca
 * sửa được / xấu đi, verdict và tạo khuyến nghị. Quyết định của Reviewer ở {@link ReviewDecisionService}; SQL ở {@link RegressionRepository}.
 */
@Service
public class RegressionService {

    /** Giữ tên cũ mà ADR-044 / CLAUDE.md nhắc tới; giá trị nằm ở {@link RegressionCriteria}. */
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

    public RecommendationRow recommendationFor(long testId) {
        return repo.findRecommendation(testId);
    }

    // ------------------------------------------------------------------ chọn bộ kịch bản

    /** Run baseline mới nhất của mỗi biến thể, chỉ của bộ mô phỏng đang cấu hình và xe đang dùng (xem repository). */
    private Map<Long, Row> latestBaselineRuns(Row baseline, List<Long> variantIds) {
        return repo.latestBaselineRuns(baseline.lng("id"), variantIds, runs.configuredSimulator(),
                queries.activeVehicle(baseline.lng("project_id")).lng("id"));
    }

    /** Biến thể mà run baseline mới nhất (đã COMPLETED) có ghi nhận lỗi — "old critical". */
    public Set<Long> criticalVariantIds(Row baseline, List<Long> variantIds) {
        return failedVariantIds(latestBaselineRuns(baseline, variantIds));
    }

    private Set<Long> failedVariantIds(Map<Long, Row> baselineRuns) {
        List<Long> completed = baselineRuns.values().stream().filter(r -> "COMPLETED".equals(r.str("status"))).map(r -> r.lng("id")).toList();
        return repo.variantsWithFailures(completed);
    }

    /**
     * Tập chọn tay: id phải thuộc bộ biến thể hiện tại của họ; bỏ id trùng; giữ thứ tự của họ (version_no) để báo cáo ổn định.
     * Không chặn tập thiếu ca an toàn — màn tạo test cảnh báo; số ca an toàn được ghi vào {@code scenario_set.safe_count} của test.
     */
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

    /** Ca "trước đây an toàn": đã có run baseline COMPLETED và baseline không ghi nhận lỗi — dùng để phát hiện phanh oan / xấu đi. */
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

    // ------------------------------------------------------------------ xem trước

    /** Số liệu khung "Run summary" của màn tạo test — cùng cách chọn bộ kịch bản với {@link #createTest}. */
    public RegressionPreviewResponse preview(long projectId, long scenarioId) {
        return preview(projectId, scenarioId, null, false);
    }

    /**
     * Như {@link #preview(long, long)}, thêm phần tập chọn tay: {@code variantIds} khác null thì trả số biến thể / ca lỗi cũ / ca an toàn
     * của đúng tập đó (cùng luật kiểm với {@link #createTest}); {@code includeVariants} thì trả danh sách biến thể để màn tạo test chọn.
     */
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
                        // null = chưa có run baseline cùng bộ mô phỏng + xe (sẽ được chạy thêm khi tạo test).
                        res == null ? null : res.outcome(),
                        res == null ? null : res.falseActivation(),
                        run != null,
                        safeCount(List.of(v.lng("id")), baselineRuns, critical) == 1,
                        critical.contains(v.lng("id"))));
            }
        }
        // Biến thể đã có run baseline thì dùng lại, chỉ phần còn thiếu phải chạy thêm.
        return new RegressionPreviewResponse(scenarioId, scenario.str("name"), Vs.versionLabel(baseline), runs.configuredSimulator(),
                variants.size(), critical.size(), baselineRuns.size(), selectedCount, selectedCritical, selectedSafe, selectedExisting, list);
    }

    // ------------------------------------------------------------------ tạo test

    @Transactional
    public long createTest(long projectId, long userId, long candidateVersionId, long scenarioId, boolean includeOldCritical,
                           boolean includeAllVariants, Map<String, Map<String, Object>> criteria, String name) {
        return createTest(projectId, userId, candidateVersionId, scenarioId, includeOldCritical, includeAllVariants, criteria, name, null);
    }

    /**
     * {@code variantIds} khác null: chạy đúng tập biến thể chọn tay (vd. tập xác minh do phần phân tích chốt) thay cho hai lựa chọn
     * "ca lỗi cũ" / "toàn bộ biến thể"; null giữ nguyên cách chọn cũ.
     */
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
        runs.dispatch(all); // đẩy sau commit
        return testId;
    }

    // ------------------------------------------------------------------ chốt kết quả

    /** Mỗi run xong thì xét các regression test liên quan: chính test của nó, hoặc test dùng nó làm baseline. */
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

    /** Mọi run của test (candidate + baseline được ghép). */
    private static List<Long> pairedRunIds(List<CandidateRun> candidateRuns) {
        List<Long> ids = new ArrayList<>(candidateRuns.stream().map(CandidateRun::id).toList());
        candidateRuns.forEach(r -> ids.add(r.baselineRunId()));
        return ids;
    }

    /**
     * Đủ cặp thì chốt test: còn run chờ / chạy thì thôi; có run không COMPLETED (hỏng, bị dừng) thì test FAILED, không verdict và
     * không khuyến nghị; còn lại tính verdict, ghi từng cặp và tạo khuyến nghị — trong một transaction.
     */
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
                return; // worker khác đã chốt test này
            }
            repo.insertItems(testId, summary.pairs());
            createRecommendation(test, verdict, counts);
        });
    }

    /** Một khuyến nghị cho mỗi regression đã chạy xong — chỉ project thuộc workspace (ADR-035). */
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

    /** Bảng tổng hợp của một test đã chốt (tính lại từ run); test hỏng trả {@code error}; chưa xong thì rỗng. */
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

    private RegressionSummary summarize(RegressionTestRow test, List<CandidateRun> candidateRuns, Map<Long, RunResult> results) {
        Map<Long, Row> versions = repo.scenarioVersions(candidateRuns.stream().map(CandidateRun::scenarioVersionId).toList());
        return RegressionSummarizer.summarize(test.criteria(), repo.findScenario(test.scenarioId()), versions, candidateRuns, results);
    }

    /** Bốn tham số AEB của baseline và candidate. */
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
}
