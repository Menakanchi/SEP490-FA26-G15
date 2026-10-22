package com.vehicsim.service;

import com.vehicsim.dto.RegressionRecords.RecommendationRow;
import com.vehicsim.dto.RegressionRecords.RegressionTestRow;
import com.vehicsim.dto.RegressionResponses.Counts;
import com.vehicsim.dto.RegressionResponses.Evidence;
import com.vehicsim.dto.RegressionResponses.ExpectedEffect;
import com.vehicsim.dto.RegressionResponses.KeyParameter;
import com.vehicsim.dto.RegressionResponses.MedianTtc;
import com.vehicsim.dto.RegressionResponses.ParameterDiff;
import com.vehicsim.dto.RegressionResponses.Progress;
import com.vehicsim.dto.RegressionResponses.Rates;
import com.vehicsim.dto.RegressionResponses.RecommendationDetailResponse;
import com.vehicsim.dto.RegressionResponses.RecommendationListItem;
import com.vehicsim.dto.RegressionResponses.RegressionDetailResponse;
import com.vehicsim.dto.RegressionResponses.RegressionKpis;
import com.vehicsim.dto.RegressionResponses.RegressionListItem;
import com.vehicsim.dto.RegressionResponses.RegressionListResponse;
import com.vehicsim.dto.RegressionResponses.RegressionSummary;
import com.vehicsim.dto.RegressionResponses.ReviewInfo;
import com.vehicsim.dto.RegressionResponses.RunningProgress;
import com.vehicsim.dto.RegressionResponses.VersionRef;
import com.vehicsim.repository.RegressionRepository;
import com.vehicsim.vehicsim.Json;
import com.vehicsim.vehicsim.Queries;
import com.vehicsim.vehicsim.Row;
import com.vehicsim.vehicsim.Vs;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Dữ liệu cho các màn regression và khuyến nghị (16 danh sách, 04 kết quả, 17 khuyến nghị, 18 duyệt). Chuyển ra từ {@code ViewsService};
 * dạng JSON giữ nguyên (khoá snake_case) để frontend không phải đổi.
 */
@Service
public class RegressionViewService {

    /** Tham số hiện trên thẻ phiên bản ở màn kết quả (tham số không còn trong danh mục thì bỏ qua). */
    private static final List<String> KEY_PARAMS = List.of("TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "DETECTION_CONFIDENCE_THRESHOLD", "MAX_DECELERATION");

    private final RegressionRepository repo;
    private final Queries queries;
    private final RegressionService regression;
    private final RegressionReportService reports;

    public RegressionViewService(RegressionRepository repo, Queries queries, RegressionService regression, RegressionReportService reports) {
        this.repo = repo;
        this.queries = queries;
        this.regression = regression;
        this.reports = reports;
    }

    // ------------------------------------------------------------------ 16 · danh sách regression

    /** Tiến độ run REGRESSION: COMPLETED / FAILED / STOPPED đều là đã kết thúc (không đếm STOPPED thì thanh kẹt dưới 100%). */
    private Progress progress(long testId) {
        long done = 0;
        long total = 0;
        for (Map.Entry<String, Long> e : repo.runCountsByStatus(testId).entrySet()) {
            total += e.getValue();
            if ("COMPLETED".equals(e.getKey()) || "FAILED".equals(e.getKey()) || "STOPPED".equals(e.getKey())) {
                done += e.getValue();
            }
        }
        return new Progress(done, total);
    }

    private Map<Long, Row> versionsOf(long projectId) {
        Map<Long, Row> versions = new LinkedHashMap<>();
        queries.versions(projectId, false).forEach(v -> versions.put(v.lng("id"), v));
        return versions;
    }

    public RegressionListResponse regressionList(String status) {
        long projectId = queries.currentProject().lng("id");
        List<RegressionTestRow> tests = repo.listTests(projectId);
        Map<Long, Row> versions = versionsOf(projectId);
        Map<Long, RecommendationRow> recs = repo.recommendationsByTest(tests.stream().map(RegressionTestRow::id).toList());
        Map<Long, String> names = queries.displayNames(tests.stream().map(RegressionTestRow::createdBy).toList());

        List<RegressionListItem> items = new ArrayList<>();
        for (RegressionTestRow x : tests) {
            boolean done = x.completed();
            items.add(new RegressionListItem(
                    x.id(),
                    RegressionCodes.testCode(x.id()),
                    x.name(),
                    Vs.versionLabel(versions.get(x.baselineVersionId())),
                    Vs.versionLabel(versions.get(x.candidateVersionId())),
                    x.candidateVersionId(),
                    RegressionCodes.displayStatus(x),
                    RegressionCodes.displayDecision(recs.get(x.id())),
                    Json.asMap(x.scenarioSet()).get("variant_count"),
                    progress(x.id()),
                    done ? x.fixedScenarios() : null,
                    done ? x.regressedScenarios() : null,
                    names.get(x.createdBy()),
                    Vs.iso(x.createdDate())));
        }
        List<RegressionListItem> filtered = items.stream().filter(i -> status == null || status.equals(i.status())).toList();
        RunningProgress running = items.stream().filter(i -> "RUNNING".equals(i.status())).findFirst()
                .map(i -> new RunningProgress(i.code(), i.progress().done(), i.progress().total())).orElse(null);
        return new RegressionListResponse(
                new RegressionKpis(
                        items.size(),
                        items.stream().filter(i -> "PASSED".equals(i.status())).count(),
                        items.stream().filter(i -> "FAILED".equals(i.status())).count(),
                        items.stream().filter(i -> "RUNNING".equals(i.status())).count(),
                        running,
                        items.isEmpty() ? null : items.get(items.size() - 1).createdAt()),
                filtered);
    }

    // ------------------------------------------------------------------ 04 · kết quả một regression

    private RegressionTestRow test(long projectId, long testId) {
        RegressionTestRow test = repo.findTest(projectId, testId);
        if (test == null) {
            throw new NotFoundException("regression test");
        }
        return test;
    }

    public RegressionDetailResponse regressionDetail(long testId) {
        return regressionDetail(test(queries.currentProject().lng("id"), testId));
    }

    private RegressionDetailResponse regressionDetail(RegressionTestRow test) {
        Row baseline = repo.findVersion(test.baselineVersionId());
        Row candidate = repo.findVersion(test.candidateVersionId());
        List<ParameterDiff> diff = regression.parameterDiff(test.baselineVersionId(), test.candidateVersionId());
        Row scenario = repo.findScenario(test.scenarioId());
        Map<Long, String> names = queries.displayNames(List.of(test.createdBy()));
        RecommendationRow rec = regression.recommendationFor(test.id());

        Map<String, ParameterDiff> byCode = new LinkedHashMap<>();
        diff.forEach(d -> byCode.put(d.code(), d));
        List<KeyParameter> keyParameters = new ArrayList<>();
        for (String code : KEY_PARAMS) {
            ParameterDiff d = byCode.get(code);
            if (d != null) {
                keyParameters.add(new KeyParameter(d.code(), d.name(), d.unit(), d.baseline(), d.candidate(), d.changed()));
            }
        }
        return new RegressionDetailResponse(
                test.id(),
                RegressionCodes.testCode(test.id()),
                RegressionCodes.recommendationCode(test.id()),
                test.name(),
                RegressionCodes.displayStatus(test),
                RegressionCodes.displayDecision(rec),
                scenario.str("name"),
                scenario.lng("id"),
                new VersionRef(baseline.lng("id"), Vs.versionLabel(baseline), baseline.str("status")),
                new VersionRef(candidate.lng("id"), Vs.versionLabel(candidate), candidate.str("status")),
                keyParameters,
                diff,
                test.passCriteria(),
                test.simulatorVersion(),
                RegressionReportService.simulatorCaveat(test.simulatorVersion()),
                reports.candidateSource(candidate.lng("id")),
                progress(test.id()),
                names.get(test.createdBy()),
                Vs.iso(test.createdDate()),
                regression.summary(test));
    }

    // ------------------------------------------------------------------ 17 · khuyến nghị · 18 · duyệt

    public List<RecommendationListItem> recommendations() {
        long projectId = queries.currentProject().lng("id");
        List<RegressionTestRow> tests = repo.listCompletedTests(projectId);
        Map<Long, Row> versions = versionsOf(projectId);
        Map<Long, RecommendationRow> recs = repo.recommendationsByTest(tests.stream().map(RegressionTestRow::id).toList());
        List<RecommendationListItem> out = new ArrayList<>();
        for (RegressionTestRow x : tests) {
            RegressionSummary summary = regression.summary(x);
            RecommendationRow rec = recs.get(x.id());
            LocalDateTime createdAt = rec != null ? rec.updatedAt() : x.finishedAt() != null ? x.finishedAt() : x.createdDate();
            out.add(new RecommendationListItem(
                    x.id(),
                    RegressionCodes.recommendationCode(x.id()),
                    RegressionCodes.testCode(x.id()),
                    Vs.versionLabel(versions.get(x.baselineVersionId())),
                    Vs.versionLabel(versions.get(x.candidateVersionId())),
                    RegressionCodes.recommendationStatus(x, rec),
                    summary.rates(),
                    summary.counts(),
                    Vs.iso(createdAt)));
        }
        return out;
    }

    public RecommendationDetailResponse recommendationDetail(long testId) {
        RegressionTestRow test = test(queries.currentProject().lng("id"), testId);
        RegressionDetailResponse detail = regressionDetail(test);
        RecommendationRow rec = regression.recommendationFor(testId);
        List<Long> nameIds = new ArrayList<>();
        nameIds.add(test.createdBy());
        nameIds.add(rec == null ? null : rec.reviewedBy());
        Map<Long, String> names = queries.displayNames(nameIds);

        RegressionSummary summary = detail.summary();
        Rates rates = summary.rates();
        Counts counts = summary.counts();
        MedianTtc ttc = summary.medianMinTtc();
        List<ParameterDiff> changed = detail.parameterDiff().stream().filter(ParameterDiff::changed).toList();
        long regressions = counts == null ? 0 : counts.regressed();
        Integer fixed = counts == null ? null : counts.fixed();

        boolean passed = "PASSED".equals(detail.status());
        String status = RegressionCodes.recommendationStatus(test, rec);
        String decision = RegressionCodes.displayDecision(rec);
        return new RecommendationDetailResponse(
                detail,
                status,
                RegressionCodes.recommendationStatusLabel(status, decision),
                changed,
                new ExpectedEffect(
                        Arrays.asList(rates == null ? null : rates.collisionBaselinePct(), rates == null ? null : rates.collisionCandidatePct()),
                        Arrays.asList(rates == null ? null : rates.falseActivationBaselinePct(), rates == null ? null : rates.falseActivationCandidatePct()),
                        Arrays.asList(ttc == null ? null : ttc.baseline(), ttc == null ? null : ttc.candidate()),
                        fixed,
                        regressions),
                tradeoffs(rates, regressions),
                RegressionCriteria.confidence(passed, (int) regressions, counts == null ? 0 : counts.scenarios()),
                List.of(
                        new Evidence("regression", "Regression " + detail.code(), passed ? "PASS" : "FAIL",
                                regressions + " regressions · " + (fixed == null ? 0 : fixed) + " fixed"),
                        // FE-13 chưa làm: nói rõ là chưa chạy, không vẽ tick xanh giả.
                        new Evidence("robustness", "Robustness validation", "NOT_RUN", "FE-13 — not run yet"),
                        new Evidence("pareto", "Pareto front", "NOT_RUN", "FE-13 — not run yet"),
                        new Evidence("sensitivity", "Sensitivity analysis", "NOT_RUN", "FE-12 — not run yet")),
                new ReviewInfo(
                        decision,
                        rec == null ? null : names.get(rec.reviewedBy()),
                        rec != null && rec.reviewedAt() != null ? Vs.iso(rec.reviewedAt()) : null,
                        rec == null ? null : rec.reviewNotes(),
                        rec == null ? null : rec.reviewConditions(),
                        names.get(test.createdBy())));
    }

    /** Câu tiếng Anh (frontend dịch qua vehicsimI18n): phanh oan tăng, số ca xấu đi, tỉ lệ còn va chạm. */
    private static List<String> tradeoffs(Rates rates, long regressions) {
        List<String> out = new ArrayList<>();
        if (rates != null && rates.falseActivationCandidatePct() > rates.falseActivationBaselinePct()) {
            out.add(String.format(Locale.ROOT, "False activation rises from %.1f%% to %.1f%% (pedestrians who stop at the curb).",
                    Vs.round(rates.falseActivationBaselinePct(), 1), Vs.round(rates.falseActivationCandidatePct(), 1)));
        }
        if (regressions > 0) {
            out.add(regressions + " scenario(s) get worse than on the baseline.");
        }
        if (rates != null && rates.collisionCandidatePct() > 0) {
            out.add(String.format(Locale.ROOT, "%.1f%% of scenarios still end in a collision — mostly late dart-outs that no threshold can stop in time.",
                    Vs.round(rates.collisionCandidatePct(), 1)));
        }
        return out;
    }
}
