package com.vsos.backend.service.regression;

import com.vsos.backend.common.Json;
import com.vsos.backend.dto.regression.RegressionRecords.CandidateRun;
import com.vsos.backend.dto.regression.RegressionRecords.RunResult;
import com.vsos.backend.dto.regression.RegressionResponses.Counts;
import com.vsos.backend.dto.regression.RegressionResponses.CriterionResult;
import com.vsos.backend.dto.regression.RegressionResponses.PairResult;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionSummary;
import com.vsos.backend.repository.common.Row;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntFunction;

import static com.vsos.backend.service.regression.RegressionCriteria.COLLISION_RATE_NOT_INCREASE;
import static com.vsos.backend.service.regression.RegressionCriteria.FALSE_ACTIVATION_INCREASE_MAX_PTS;
import static com.vsos.backend.service.regression.RegressionCriteria.IDENTICAL_SEEDS;
import static com.vsos.backend.service.regression.RegressionCriteria.MEDIAN_MIN_TTC_CHANGE_MIN_S;
import static com.vsos.backend.service.regression.RegressionCriteria.NO_NEW_COLLISION;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test sheet "summarize" of docs/Report5.1_Unit-Test_VSOS.xlsx: one test per UTCID column, designed with
 * Equivalence Partitioning and Boundary Value Analysis (see sheet EP-BVA). Each test builds n baseline/candidate pairs,
 * calls {@link RegressionSummarizer#summarize} and checks {@link RegressionSummarizer#verdict} plus the parts that decide it.
 *
 * <ul>
 *   <li>False activation increase Δ (points, rates rounded to 0.01): valid Δ ≤ 5.00. Boundaries 4.99, 5.00, 5.01 and a
 *       5.00 that floating point computes as 5.000000000000002.</li>
 *   <li>Median min-TTC change (s, deltas rounded to 0.001): valid ≥ -0.100 or no data. Boundaries -0.099, -0.100, -0.101;
 *       the even median flips when half of the pairs get worse (k = 9 | 10 of 20).</li>
 *   <li>New collisions: valid 0. Boundaries 0, 1; collision in both runs is not new; a swap keeps the collision rate.</li>
 *   <li>Pair outcome: near miss when min TTC &lt; 1.0 s or min distance &lt; 0.5 m. Boundaries 1.000 | 0.999 s, 0.500 | 0.499 m.</li>
 *   <li>Stored criteria: default, disabled, older threshold, value missing, key missing.</li>
 * </ul>
 */
class RegressionSummarizerBvaTest {

    private static final double BASE_TTC = 3.0;

    /** The part of a run that the summary reads; ids are assigned when the pairs are built. */
    private record Run(boolean collision, Double minTtcS, Double minDistanceM, boolean falseActivation, String verdict) {
        Run verdict(String newVerdict) {
            return new Run(collision, minTtcS, minDistanceM, falseActivation, newVerdict);
        }
    }

    private static Run safe() {
        return new Run(false, BASE_TTC, 5.0, false, "PASS");
    }

    private static Run ttc(Double minTtcS) {
        return new Run(false, minTtcS, 5.0, false, "PASS");
    }

    private static Run distance(double minDistanceM) {
        return new Run(false, BASE_TTC, minDistanceM, false, "PASS");
    }

    private static Run falseActivation() {
        return new Run(false, BASE_TTC, 5.0, true, "PASS");
    }

    private static Run collision() {
        return new Run(true, 0.0, 0.0, false, "FAIL");
    }

    // ------------------------------------------------------------------ normal partitions

    @Test
    @DisplayName("UTCID01 N: 20 unchanged pairs pass every criterion")
    void utcid01() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> safe()));

        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
        assertThat(summary.counts()).isEqualTo(new Counts(20, 0, 0, 20, 0));
        assertThat(summary.transitions().get("SAFE").get("SAFE")).isEqualTo(20);
        assertCriterion(summary, IDENTICAL_SEEDS, true, "enforced");
        assertThat(summary.families()).singleElement().satisfies(f -> {
            assertThat(f.scenarios()).isEqualTo(20);
            assertThat(f.name()).isEqualTo("Family A");
        });
    }

    @Test
    @DisplayName("UTCID02 N: candidate fixes 2 of 20 baseline collisions")
    void utcid02() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> i <= 2 ? collision() : safe(), i -> safe()));

        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
        assertThat(summary.counts().fixed()).isEqualTo(2);
        assertThat(summary.rates().collisionBaselinePct()).isEqualTo(10.0);
        assertThat(summary.rates().collisionCandidatePct()).isEqualTo(0.0);
        assertCriterion(summary, COLLISION_RATE_NOT_INCREASE, true, -10.0);
    }

    @Test
    @DisplayName("UTCID03 B: a single pair (minimum set size) is summarized")
    void utcid03() {
        RegressionSummary summary = summarize(defaults(), pairs(1, i -> safe(), i -> safe()));

        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
        assertThat(summary.counts().scenarios()).isEqualTo(1);
    }

    // ------------------------------------------------------------------ false activation increase <= 5.00 points

    @Test
    @DisplayName("UTCID04 B: false activation increase 4.99 points (max - 0.01, 20 of 401) passes")
    void utcid04() {
        RegressionSummary summary = summarize(defaults(), pairs(401, i -> safe(), i -> i <= 20 ? falseActivation() : safe()));

        assertCriterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS, true, 4.99);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID05 B: false activation increase 5.00 points (max, 20 of 400) passes")
    void utcid05() {
        RegressionSummary summary = summarize(defaults(), pairs(400, i -> safe(), i -> i <= 20 ? falseActivation() : safe()));

        assertCriterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS, true, 5.0);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID06 B: false activation increase 5.01 points (max + 0.01, 20 of 399) fails the test")
    void utcid06() {
        RegressionSummary summary = summarize(defaults(), pairs(399, i -> safe(), i -> i <= 20 ? falseActivation() : safe()));

        assertCriterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS, false, 5.01);
        assertThat(summary.counts().regressed()).isZero();
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("FAILED");
    }

    @Test
    @DisplayName("UTCID07 B: 11.67 -> 16.67 is 5.000000000000002 in floating point and still passes the 5.00 limit")
    void utcid07() {
        RegressionSummary summary = summarize(defaults(), pairs(60, i -> i <= 7 ? falseActivation() : safe(),
                i -> i <= 10 ? falseActivation() : safe()));

        double raw = summary.rates().falseActivationCandidatePct() - summary.rates().falseActivationBaselinePct();
        assertThat(raw).isGreaterThan(5.0);
        assertCriterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS, true, 5.0);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID08 N: false activation decreases by 5.00 points")
    void utcid08() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> i == 1 ? falseActivation() : safe(), i -> safe()));

        assertCriterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS, true, -5.0);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID09 A: a disabled false activation criterion is ignored by the verdict (increase 5.01)")
    void utcid09() {
        Map<String, Object> criteria = criteria(Map.of(FALSE_ACTIVATION_INCREASE_MAX_PTS, Map.of("enabled", false)));

        RegressionSummary summary = summarize(criteria, pairs(399, i -> safe(), i -> i <= 20 ? falseActivation() : safe()));

        CriterionResult fa = criterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS);
        assertThat(fa.enabled()).isEqualTo(false);
        assertThat(fa.passed()).isFalse();
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID10 A: a test stored with the old 0.5 point threshold is judged by it (increase 2.5 fails)")
    void utcid10() {
        Map<String, Object> criteria = criteria(Map.of(FALSE_ACTIVATION_INCREASE_MAX_PTS, Map.of("value", 0.5)));

        RegressionSummary summary = summarize(criteria, pairs(40, i -> safe(), i -> i == 1 ? falseActivation() : safe()));

        assertCriterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS, false, 2.5);
        assertThat(criterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS).threshold()).isEqualTo(0.5);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("FAILED");
    }

    @Test
    @DisplayName("UTCID11 A: stored criterion without a value falls back to 5.0, so an increase of 5.00 passes")
    void utcid11() {
        RegressionSummary summary = summarize(withoutFalseActivationValue(), pairs(400, i -> safe(), i -> i <= 20 ? falseActivation() : safe()));

        assertCriterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS, true, 5.0);
        assertThat(criterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS).threshold()).isNull();
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID12 A: a criterion missing from the stored criteria has no 'enabled' and is ignored (increase 10.00)")
    void utcid12() {
        Map<String, Object> criteria = defaults();
        criteria.remove(FALSE_ACTIVATION_INCREASE_MAX_PTS);

        RegressionSummary summary = summarize(criteria, pairs(20, i -> safe(), i -> i <= 2 ? falseActivation() : safe()));

        CriterionResult fa = criterion(summary, FALSE_ACTIVATION_INCREASE_MAX_PTS);
        assertThat(fa.enabled()).isNull();
        assertThat(fa.passed()).isFalse();
        assertThat(fa.actual()).isEqualTo(10.0);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    // ------------------------------------------------------------------ median min-TTC change >= -0.100 s

    @Test
    @DisplayName("UTCID13 B: median min-TTC change -0.099 s (min + 0.001) passes")
    void utcid13() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> ttc(2.901)));

        assertCriterion(summary, MEDIAN_MIN_TTC_CHANGE_MIN_S, true, -0.099);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID14 B: median min-TTC change -0.100 s (min) passes")
    void utcid14() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> ttc(2.9)));

        assertCriterion(summary, MEDIAN_MIN_TTC_CHANGE_MIN_S, true, -0.1);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID15 B: median min-TTC change -0.101 s (min - 0.001) fails the test")
    void utcid15() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> ttc(2.899)));

        assertCriterion(summary, MEDIAN_MIN_TTC_CHANGE_MIN_S, false, -0.101);
        assertThat(summary.counts().regressed()).isZero();
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("FAILED");
    }

    @Test
    @DisplayName("UTCID16 A: no min-TTC in any run leaves the TTC criterion passed with no value")
    void utcid16() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> ttc(null), i -> ttc(null)));

        assertCriterion(summary, MEDIAN_MIN_TTC_CHANGE_MIN_S, true, null);
        assertThat(summary.medianMinTtc().baseline()).isNull();
        assertThat(summary.medianMinTtc().candidate()).isNull();
        assertThat(summary.medianMinTtc().delta()).isNull();
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID17 A: pairs without a candidate min-TTC are left out of the median (8 of 20 at -0.2 s fails)")
    void utcid17() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i <= 12 ? ttc(null) : ttc(2.8)));

        assertCriterion(summary, MEDIAN_MIN_TTC_CHANGE_MIN_S, false, -0.2);
        assertThat(summary.medianMinTtc().baseline()).isEqualTo(3.0);
        assertThat(summary.medianMinTtc().candidate()).isEqualTo(2.8);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("FAILED");
    }

    @Test
    @DisplayName("UTCID18 B: 9 of 20 pairs drop 2 s, the median stays 0.000 and passes")
    void utcid18() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i <= 9 ? ttc(1.0) : safe()));

        assertCriterion(summary, MEDIAN_MIN_TTC_CHANGE_MIN_S, true, 0.0);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID19 B: 10 of 20 pairs drop 2 s, the even median averages -2 and 0 to -1.000 and fails")
    void utcid19() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i <= 10 ? ttc(1.0) : safe()));

        assertCriterion(summary, MEDIAN_MIN_TTC_CHANGE_MIN_S, false, -1.0);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("FAILED");
    }

    // ------------------------------------------------------------------ collisions

    @Test
    @DisplayName("UTCID20 B: one new collision (0 + 1) makes the test REGRESSED")
    void utcid20() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i == 1 ? collision() : safe()));

        assertCriterion(summary, NO_NEW_COLLISION, false, 1);
        assertCriterion(summary, COLLISION_RATE_NOT_INCREASE, false, 5.0);
        assertThat(summary.counts().newCollisions()).isEqualTo(1);
        assertThat(summary.counts().regressed()).isEqualTo(1);
        assertThat(summary.pairs().get(0).candidateImpactKmh()).isEqualTo(28.8);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("REGRESSED");
    }

    @Test
    @DisplayName("UTCID21 N: a collision in both runs is not a new collision")
    void utcid21() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> i == 1 ? collision() : safe(), i -> i == 1 ? collision() : safe()));

        assertCriterion(summary, NO_NEW_COLLISION, true, 0);
        assertCriterion(summary, COLLISION_RATE_NOT_INCREASE, true, 0.0);
        assertThat(summary.pairs().get(0).change()).isEqualTo("unchanged");
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID22 A: one collision fixed and one new keeps the collision rate but is REGRESSED")
    void utcid22() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> i == 1 ? collision() : safe(), i -> i == 2 ? collision() : safe()));

        assertCriterion(summary, COLLISION_RATE_NOT_INCREASE, true, 0.0);
        assertCriterion(summary, NO_NEW_COLLISION, false, 1);
        assertThat(summary.counts().fixed()).isEqualTo(1);
        assertThat(summary.counts().regressed()).isEqualTo(1);
        assertThat(summary.transitions().get("COLLISION").get("SAFE")).isEqualTo(1);
        assertThat(summary.transitions().get("SAFE").get("COLLISION")).isEqualTo(1);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("REGRESSED");
    }

    @Test
    @DisplayName("UTCID23 A: a near miss that becomes a collision counts as a new collision")
    void utcid23() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> i == 1 ? ttc(0.8) : safe(), i -> i == 1 ? collision() : safe()));

        assertThat(summary.pairs().get(0).baselineOutcome()).isEqualTo("NEAR_MISS");
        assertCriterion(summary, NO_NEW_COLLISION, false, 1);
        assertCriterion(summary, COLLISION_RATE_NOT_INCREASE, false, 5.0);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("REGRESSED");
    }

    // ------------------------------------------------------------------ pair outcome and change

    @Test
    @DisplayName("UTCID24 B: candidate min TTC 1.000 s (near-miss limit) is still SAFE")
    void utcid24() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i == 1 ? ttc(1.0) : safe()));

        assertThat(summary.pairs().get(0).candidateOutcome()).isEqualTo("SAFE");
        assertThat(summary.pairs().get(0).change()).isEqualTo("unchanged");
        assertThat(summary.counts().regressed()).isZero();
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID25 B: candidate min TTC 0.999 s (limit - 0.001) is a NEAR_MISS and regressed")
    void utcid25() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i == 1 ? ttc(0.999) : safe()));

        assertThat(summary.pairs().get(0).candidateOutcome()).isEqualTo("NEAR_MISS");
        assertThat(summary.pairs().get(0).change()).isEqualTo("regressed");
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID26 B: candidate min distance 0.500 m (near-miss limit) is still SAFE")
    void utcid26() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i == 1 ? distance(0.5) : safe()));

        assertThat(summary.pairs().get(0).candidateOutcome()).isEqualTo("SAFE");
        assertThat(summary.pairs().get(0).change()).isEqualTo("unchanged");
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID27 B: candidate min distance 0.499 m (limit - 0.001) is a NEAR_MISS and regressed")
    void utcid27() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i == 1 ? distance(0.499) : safe()));

        assertThat(summary.pairs().get(0).candidateOutcome()).isEqualTo("NEAR_MISS");
        assertThat(summary.pairs().get(0).change()).isEqualTo("regressed");
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID28 A: run verdict PASS -> FAIL with the same SAFE outcome counts as regressed")
    void utcid28() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> safe(), i -> i == 1 ? safe().verdict("FAIL") : safe()));

        assertThat(summary.pairs().get(0).change()).isEqualTo("regressed");
        assertThat(summary.counts().regressed()).isEqualTo(1);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID29 A: run verdict FAIL -> PASS with the same SAFE outcome counts as fixed")
    void utcid29() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> i == 1 ? safe().verdict("FAIL") : safe(), i -> safe()));

        assertThat(summary.pairs().get(0).change()).isEqualTo("fixed");
        assertThat(summary.counts().fixed()).isEqualTo(1);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    @Test
    @DisplayName("UTCID30 A: outcome better (NEAR_MISS -> SAFE) but verdict PASS -> FAIL is counted as regressed")
    void utcid30() {
        RegressionSummary summary = summarize(defaults(), pairs(20, i -> i == 1 ? ttc(0.8) : safe(), i -> i == 1 ? safe().verdict("FAIL") : safe()));

        assertThat(summary.pairs().get(0).baselineOutcome()).isEqualTo("NEAR_MISS");
        assertThat(summary.pairs().get(0).candidateOutcome()).isEqualTo("SAFE");
        assertThat(summary.pairs().get(0).change()).isEqualTo("regressed");
        assertThat(summary.counts().fixed()).isZero();
        assertThat(summary.counts().regressed()).isEqualTo(1);
        assertThat(RegressionSummarizer.verdict(summary)).isEqualTo("PASSED");
    }

    // ------------------------------------------------------------------ helpers

    /** Pairs 1..n: baseline run 1000 + i and candidate run 2000 + i on variant i (same seed, vehicle and simulator). */
    private record Fixture(List<CandidateRun> candidateRuns, Map<Long, Row> variants, Map<Long, RunResult> results) {
    }

    private static Fixture pairs(int n, IntFunction<Run> baseline, IntFunction<Run> candidate) {
        List<CandidateRun> candidateRuns = new ArrayList<>();
        Map<Long, Row> variants = new LinkedHashMap<>();
        Map<Long, RunResult> results = new LinkedHashMap<>();
        for (int i = 1; i <= n; i++) {
            long baselineRun = 1000L + i;
            long candidateRun = 2000L + i;
            candidateRuns.add(new CandidateRun(candidateRun, i, baselineRun));
            variants.put((long) i, new Row(Json.obj("id", (long) i, "version_no", (long) i)));
            results.put(baselineRun, result(baselineRun, baseline.apply(i)));
            results.put(candidateRun, result(candidateRun, candidate.apply(i)));
        }
        return new Fixture(candidateRuns, variants, results);
    }

    private static RegressionSummary summarize(Map<String, Object> criteria, Fixture f) {
        Row scenario = new Row(Json.obj("id", 20L, "code", "SC-A", "name", "Family A"));
        return RegressionSummarizer.summarize(criteria, scenario, f.variants(), f.candidateRuns(), f.results());
    }

    private static RunResult result(long id, Run r) {
        return new RunResult(id, "COMPLETED", r.collision(), r.minTtcS(), r.minDistanceM(), r.collision() ? 8.0 : null,
                r.falseActivation(), r.verdict(), 5.0, 10.0);
    }

    private static Map<String, Object> defaults() {
        return criteria(null);
    }

    private static Map<String, Object> criteria(Map<String, Map<String, Object>> overrides) {
        return new LinkedHashMap<>(RegressionCriteria.merge(overrides));
    }

    private static Map<String, Object> withoutFalseActivationValue() {
        Map<String, Object> criteria = defaults();
        Map<String, Object> fa = new LinkedHashMap<>(Json.asMap(criteria.get(FALSE_ACTIVATION_INCREASE_MAX_PTS)));
        fa.remove("value");
        criteria.put(FALSE_ACTIVATION_INCREASE_MAX_PTS, fa);
        return criteria;
    }

    private static CriterionResult criterion(RegressionSummary summary, String key) {
        return summary.criteria().stream().filter(c -> key.equals(c.key())).findFirst().orElseThrow();
    }

    private static void assertCriterion(RegressionSummary summary, String key, boolean passed, Object actual) {
        CriterionResult c = criterion(summary, key);
        assertThat(c.passed()).as(key + " passed").isEqualTo(passed);
        assertThat(c.actual()).as(key + " actual").isEqualTo(actual);
    }
}
