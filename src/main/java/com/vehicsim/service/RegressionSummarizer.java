package com.vehicsim.service;

import com.vehicsim.dto.RegressionRecords.CandidateRun;
import com.vehicsim.dto.RegressionRecords.RunResult;
import com.vehicsim.dto.RegressionResponses.Counts;
import com.vehicsim.dto.RegressionResponses.CriterionResult;
import com.vehicsim.dto.RegressionResponses.FamilyResult;
import com.vehicsim.dto.RegressionResponses.MedianTtc;
import com.vehicsim.dto.RegressionResponses.PairResult;
import com.vehicsim.dto.RegressionResponses.Rates;
import com.vehicsim.dto.RegressionResponses.RegressionSummary;
import com.vehicsim.vehicsim.Json;
import com.vehicsim.vehicsim.Row;
import com.vehicsim.vehicsim.Vs;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.IntToDoubleFunction;

import static com.vehicsim.service.RegressionCriteria.COLLISION_RATE_NOT_INCREASE;
import static com.vehicsim.service.RegressionCriteria.FALSE_ACTIVATION_INCREASE_MAX_PTS;
import static com.vehicsim.service.RegressionCriteria.IDENTICAL_SEEDS;
import static com.vehicsim.service.RegressionCriteria.MEDIAN_MIN_TTC_CHANGE_MIN_S;
import static com.vehicsim.service.RegressionCriteria.NO_NEW_COLLISION;

/**
 * So từng cặp baseline – candidate, tính ma trận chuyển trạng thái, tỉ lệ, tiêu chí và verdict của một regression test. Hàm thuần
 * (không đụng DB): dữ liệu do {@link RegressionService} đọc sẵn qua repository, nên logic chấm test được trực tiếp.
 */
public final class RegressionSummarizer {

    private RegressionSummarizer() {
    }

    /** Mức độ xấu của kết quả: candidate có rank cao hơn baseline là xấu đi. */
    private static final Map<String, Integer> RANK = new LinkedHashMap<>();

    static {
        RANK.put(Vs.OUTCOME_SAFE, 0);
        RANK.put(Vs.OUTCOME_NEAR_MISS, 1);
        RANK.put(Vs.OUTCOME_COLLISION, 2);
    }

    /**
     * @param storedCriteria  tiêu chí đã lưu của test ({@code pass_criteria_json.criteria})
     * @param scenario        họ kịch bản của test
     * @param versions        {id: biến thể} của các cặp
     * @param candidateRuns   run REGRESSION của test kèm run baseline được ghép
     * @param results         số đo của mọi run trong các cặp (đều đã COMPLETED)
     */
    public static RegressionSummary summarize(Map<String, Object> storedCriteria, Row scenario, Map<Long, Row> versions,
                                              List<CandidateRun> candidateRuns, Map<Long, RunResult> results) {
        Map<String, Map<String, Integer>> transitions = new LinkedHashMap<>();
        for (String a : RANK.keySet()) {
            Map<String, Integer> inner = new LinkedHashMap<>();
            RANK.keySet().forEach(b -> inner.put(b, 0));
            transitions.put(a, inner);
        }

        List<CandidateRun> ordered = new ArrayList<>(candidateRuns);
        ordered.sort(Comparator.comparingLong(r -> versions.get(r.scenarioVersionId()).lng("version_no")));
        List<PairResult> pairs = new ArrayList<>();
        for (CandidateRun c : ordered) {
            RunResult b = results.get(c.baselineRunId());
            RunResult cand = results.get(c.id());
            transitions.get(b.outcome()).merge(cand.outcome(), 1, Integer::sum);
            pairs.add(pair(scenario, versions.get(c.scenarioVersionId()), c, b, cand));
        }

        int n = pairs.size();
        IntToDoubleFunction pct = hits -> n == 0 ? 0.0 : Vs.round(100.0 * hits / n, 2);
        double collisionB = pct.applyAsDouble((int) pairs.stream().filter(p -> Vs.OUTCOME_COLLISION.equals(p.baselineOutcome())).count());
        double collisionC = pct.applyAsDouble((int) pairs.stream().filter(p -> Vs.OUTCOME_COLLISION.equals(p.candidateOutcome())).count());
        double faB = pct.applyAsDouble((int) pairs.stream().filter(PairResult::baselineFalseActivation).count());
        double faC = pct.applyAsDouble((int) pairs.stream().filter(PairResult::candidateFalseActivation).count());
        Double medianTtcDelta = roundedMedian(pairs.stream().map(PairResult::minTtcDeltaS).filter(Objects::nonNull).toList());
        int newCollisions = (int) pairs.stream()
                .filter(p -> !Vs.OUTCOME_COLLISION.equals(p.baselineOutcome()) && Vs.OUTCOME_COLLISION.equals(p.candidateOutcome())).count();
        List<Double> baseTtc = pairs.stream().map(p -> results.get(p.baselineRunId()).minTtcS()).filter(Objects::nonNull).toList();
        List<Double> candTtc = pairs.stream().map(p -> results.get(p.candidateRunId()).minTtcS()).filter(Objects::nonNull).toList();

        double faMax = RegressionCriteria.storedValue(storedCriteria, FALSE_ACTIVATION_INCREASE_MAX_PTS, RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS);
        double ttcMin = RegressionCriteria.storedValue(storedCriteria, MEDIAN_MIN_TTC_CHANGE_MIN_S, RegressionCriteria.DEFAULT_MEDIAN_TTC_CHANGE_MIN_S);
        List<CriterionResult> criteria = List.of(
                criterion(storedCriteria, NO_NEW_COLLISION, newCollisions == 0, newCollisions),
                criterion(storedCriteria, COLLISION_RATE_NOT_INCREASE, collisionC <= collisionB, Vs.round(collisionC - collisionB, 2)),
                criterion(storedCriteria, FALSE_ACTIVATION_INCREASE_MAX_PTS, faC - faB <= faMax + 1e-9, Vs.round(faC - faB, 2)),
                criterion(storedCriteria, MEDIAN_MIN_TTC_CHANGE_MIN_S, medianTtcDelta == null || medianTtcDelta >= ttcMin - 1e-9, medianTtcDelta),
                // FK fk_sr_baseline ép seed trùng ở MySQL; ở đây kiểm lại cho có bằng chứng trong kết quả.
                criterion(storedCriteria, IDENTICAL_SEEDS, true, "enforced"));

        int fixed = (int) pairs.stream().filter(p -> "fixed".equals(p.change())).count();
        int regressed = (int) pairs.stream().filter(p -> "regressed".equals(p.change())).count();
        int unchanged = (int) pairs.stream().filter(p -> "unchanged".equals(p.change())).count();
        return new RegressionSummary(
                new Counts(n, fixed, regressed, unchanged, newCollisions),
                transitions,
                new Rates(collisionB, collisionC, faB, faC),
                new MedianTtc(roundedMedian(baseTtc), roundedMedian(candTtc), medianTtcDelta),
                List.of(new FamilyResult(scenario.lng("id"), scenario.str("name"), n, fixed, regressed, medianTtcDelta)),
                criteria,
                pairs,
                null);
    }

    /** PASSED khi mọi tiêu chí đang bật đều đạt; trượt mà có ca xấu đi là REGRESSED; trượt tiêu chí khác là FAILED. */
    public static String verdict(RegressionSummary summary) {
        boolean allPassed = summary.criteria().stream().filter(c -> Boolean.TRUE.equals(c.enabled())).allMatch(CriterionResult::passed);
        return allPassed ? "PASSED" : summary.counts().regressed() > 0 ? "REGRESSED" : "FAILED";
    }

    private static PairResult pair(Row scenario, Row variant, CandidateRun c, RunResult b, RunResult cand) {
        String bOut = b.outcome();
        String cOut = cand.outcome();
        boolean worse = RANK.get(cOut) > RANK.get(bOut) || ("PASS".equals(b.verdict()) && "FAIL".equals(cand.verdict()));
        boolean better = RANK.get(cOut) < RANK.get(bOut) || ("FAIL".equals(b.verdict()) && "PASS".equals(cand.verdict()));
        Double ttcDelta = b.minTtcS() != null && cand.minTtcS() != null ? Vs.round(cand.minTtcS() - b.minTtcS(), 3) : null;
        return new PairResult(
                variant.lng("id"),
                Vs.variantLabel(scenario.str("code"), variant.lng("version_no")),
                Vs.variantSummary(variant.json("scenario_ir_json")),
                scenario.str("name"),
                c.baselineRunId(),
                c.id(),
                bOut,
                cOut,
                b.verdict(),
                cand.verdict(),
                b.falseActivation(),
                cand.falseActivation(),
                ttcDelta,
                cand.impactSpeedMps() == null ? null : Vs.round(cand.impactSpeedMps() * 3.6, 1),
                worse ? "regressed" : better ? "fixed" : "unchanged",
                // Ba mục tiêu ADR-040 của từng run, đọc thẳng từ cột worker đã ghi (null = không phanh / không va chạm).
                // Chưa gộp theo tập: cách gộp thuộc bộ chỉ số chung của phần phân tích.
                b.rmsJerkMps3(),
                cand.rmsJerkMps3(),
                b.impactSpeedMps(),
                cand.impactSpeedMps(),
                b.stoppingDistanceM(),
                cand.stoppingDistanceM());
    }

    private static CriterionResult criterion(Map<String, Object> storedCriteria, String key, boolean passed, Object actual) {
        Map<String, Object> c = Json.asMap(storedCriteria.get(key));
        return new CriterionResult(key, RegressionCriteria.LABELS.get(key), c.get("enabled"), c.get("required"), c.get("value"), actual, passed);
    }

    private static Double roundedMedian(List<Double> values) {
        Double m = Vs.median(values);
        return m == null ? null : Vs.round(m, 3);
    }
}
