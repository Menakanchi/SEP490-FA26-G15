package com.vsos.core.mobo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vsos.core.common.PyRandom;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Lõi MOBO Java (ADR-042: không giữ lõi Python song song). {@code parity/mobo_cases.json} do bản Python
 * {@code worker/vehicsim_core/mobo.py} (nhánh PhuongNA, 22/10) sinh ra trước khi gỡ; cùng seed phải ra cùng đề xuất.
 */
class MoboEngineTest {

    private static final double[] REF = {1.0, 1.0, 1.0};

    private static MoboTrial trial(int n, double jerk, double impact, double stop) {
        return new MoboTrial(n, Map.of(), jerk, impact, stop, false);
    }

    @Test
    void sameSeedAndTrialsGiveTheSameProposalAsThePythonReference() throws IOException {
        JsonNode cases;
        try (InputStream in = getClass().getResourceAsStream("/parity/mobo_cases.json")) {
            cases = new ObjectMapper().readTree(in);
        }
        assertThat(cases.size()).isEqualTo(3);
        for (String name : List.of("initial", "acq", "acq_seed")) {
            JsonNode payload = cases.get(name).get("payload");
            JsonNode expected = cases.get(name).get("expected");
            List<MoboTrial> trials = new ArrayList<>();
            for (JsonNode t : payload.get("trials")) {
                Map<String, Double> params = new LinkedHashMap<>();
                t.get("params").fields().forEachRemaining(e -> params.put(e.getKey(), e.getValue().asDouble()));
                trials.add(new MoboTrial(t.get("trial_number").asInt(), params, t.get("rms_jerk").asDouble(), t.get("impact_speed").asDouble(),
                        t.get("stopping_distance").asDouble(), t.get("constraint_violated").asBoolean()));
            }
            MoboProposal got = new MoboEngine(ParameterBounds.defaults(), payload.get("n_initial_points").asInt(), payload.get("seed").asLong()).propose(trials);

            assertThat(got.samplingSource()).as(name).isEqualTo(expected.get("sampling_source").asText());
            expected.get("proposed_params").fields().forEachRemaining(
                    e -> assertThat(got.params().get(e.getKey())).as(name + "/" + e.getKey()).isEqualTo(e.getValue().asDouble()));
            if (expected.get("acquisition_value").isNull()) {
                assertThat(got.acquisitionValue()).as(name).isNull();
            } else {
                assertThat(got.acquisitionValue()).as(name).isCloseTo(expected.get("acquisition_value").asDouble(), within(1e-6));
            }
            List<Integer> pareto = new ArrayList<>();
            expected.get("pareto_trial_numbers").forEach(n -> pareto.add(n.asInt()));
            assertThat(got.paretoTrialNumbers()).as(name).isEqualTo(pareto);
        }
    }

    @Test
    void boundsValidateAndNormalizeRoundTrip() {
        ParameterBounds bounds = ParameterBounds.defaults();
        Map<String, Double> ok = Map.of("TTC_THRESHOLD", 1.8, "BRAKE_ACTIVATION_DELAY", 0.2, "BRAKE_BUILDUP_RATE", 15.0, "MAX_DECELERATION", 8.0);
        assertThat(bounds.isValid(ok)).isTrue();
        Map<String, Double> outside = new LinkedHashMap<>(ok);
        outside.put("TTC_THRESHOLD", 9.9);
        assertThat(bounds.isValid(outside)).isFalse();
        double[] unit = bounds.normalize(ok);
        for (double u : unit) {
            assertThat(u).isBetween(0.0, 1.0);
        }
        assertThat(bounds.denormalize(unit).get("TTC_THRESHOLD")).isCloseTo(1.8, within(0.01));
    }

    @Test
    void initialDesignIsReproducibleAndInsideBounds() {
        ParameterBounds bounds = ParameterBounds.defaults();
        MoboProposal a = new MoboEngine(bounds, 5, 123).propose(List.of());
        MoboProposal b = new MoboEngine(bounds, 5, 123).propose(List.of());
        assertThat(a.params()).isEqualTo(b.params());
        assertThat(bounds.isValid(a.params())).isTrue();
        assertThat(a.samplingSource()).isEqualTo(MoboEngine.INITIAL_DESIGN);
        assertThat(a.acquisitionValue()).isNull();
    }

    @Test
    void rbfKernelIsSymmetricWithUnitDiagonal() {
        double[] x1 = {0.2, 0.4, 0.6, 0.8};
        double[] x2 = {0.5, 0.1, 0.9, 0.3};
        assertThat(GaussianProcess.kernel(x1, x1)).isEqualTo(1.0);
        assertThat(GaussianProcess.kernel(x1, x2)).isEqualTo(GaussianProcess.kernel(x2, x1));
    }

    @Test
    void choleskyReconstructsTheMatrix() {
        double[][] k = {{4.0, 1.0, 0.5}, {1.0, 5.0, 1.2}, {0.5, 1.2, 3.0}};
        double[][] l = GaussianProcess.cholesky(k, 0.0);
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                double v = 0.0;
                for (int m = 0; m < 3; m++) {
                    v += l[i][m] * l[j][m];
                }
                assertThat(v).isCloseTo(k[i][j], within(1e-4));
            }
        }
    }

    @Test
    void gaussianProcessInterpolatesTrainingPoints() {
        GaussianProcess gp = new GaussianProcess();
        List<double[]> x = List.of(new double[] {0.1, 0.2, 0.3, 0.4}, new double[] {0.5, 0.5, 0.5, 0.5}, new double[] {0.9, 0.8, 0.7, 0.6});
        gp.fit(x, new double[] {1.2, 3.4, 5.6});
        double[] p = gp.predict(x.get(1));
        assertThat(p[0]).isCloseTo(3.4, within(0.1));
        assertThat(p[1]).isGreaterThanOrEqualTo(0.0);
        assertThat(p[2]).isCloseTo(Math.sqrt(p[1]), within(1e-9));
    }

    @Test
    void paretoFrontKeepsOnlyNonDominatedValidTrials() {
        MoboTrial t1 = trial(1, 2.0, 0.0, 15.0);
        MoboTrial t2 = trial(2, 4.0, 5.0, 20.0); // bị t1 dominate
        MoboTrial t3 = trial(3, 1.0, 2.0, 14.0);
        MoboTrial violated = new MoboTrial(4, Map.of(), 0.1, 0.0, 1.0, true); // tốt nhất nhưng vi phạm ràng buộc
        assertThat(Hypervolume.dominates(t1.objectives(), t2.objectives())).isTrue();
        assertThat(Hypervolume.dominates(t2.objectives(), t1.objectives())).isFalse();
        assertThat(Hypervolume.paretoFront(List.of(t1, t2, t3, violated))).extracting(MoboTrial::number).containsExactly(1, 3);
    }

    @Test
    void hypervolumeAndImprovement() {
        double[] p = {0.5, 0.5, 0.5};
        double hv = Hypervolume.compute(List.of(p), REF);
        assertThat(hv).isCloseTo(0.125, within(1e-9));
        assertThat(Hypervolume.improvement(new double[] {0.2, 0.2, 0.2}, List.of(p), REF, hv)).isGreaterThan(0.0);
        assertThat(Hypervolume.improvement(new double[] {0.8, 0.8, 0.8}, List.of(p), REF, hv)).isZero();
        assertThat(Hypervolume.improvement(new double[] {1.2, 0.1, 0.1}, List.of(p), REF, hv)).isZero();
    }

    @Test
    void deduplicationUsesEuclideanToleranceInUnitSpace() {
        List<double[]> prev = List.of(new double[] {0.5, 0.5, 0.5, 0.5});
        assertThat(MoboEngine.isNearDuplicate(new double[] {0.5, 0.5, 0.5, 0.5}, prev)).isTrue();
        assertThat(MoboEngine.isNearDuplicate(new double[] {0.51, 0.5, 0.49, 0.5}, prev)).isTrue();
        assertThat(MoboEngine.isNearDuplicate(new double[] {0.8, 0.2, 0.1, 0.9}, prev)).isFalse();
    }

    @Test
    void fullLoopProposesInBoundsAndNeverRepeatsAnEvaluatedPoint() {
        ParameterBounds bounds = ParameterBounds.defaults();
        List<MoboTrial> trials = new ArrayList<>();
        for (int n = 1; n <= 8; n++) {
            MoboProposal next = new MoboEngine(bounds, 3, 42).propose(trials);
            assertThat(bounds.isValid(next.params())).isTrue();
            assertThat(next.samplingSource()).isEqualTo(n <= 3 ? MoboEngine.INITIAL_DESIGN : MoboEngine.ACQUISITION);
            for (MoboTrial prev : trials) {
                assertThat(MoboEngine.isNearDuplicate(bounds.normalize(next.params()), List.of(bounds.normalize(prev.params())))).isFalse();
            }
            double ttc = next.params().get("TTC_THRESHOLD");
            double delay = next.params().get("BRAKE_ACTIVATION_DELAY");
            double buildup = next.params().get("BRAKE_BUILDUP_RATE");
            double decel = next.params().get("MAX_DECELERATION");
            trials.add(new MoboTrial(n, next.params(), 0.25 * buildup + 0.3 * decel + 0.5 / (delay + 0.05),
                    Math.max(0.0, 18.0 - ((ttc - delay) * 8.5 + decel * 0.8)), Math.max(8.0, 10.0 + ttc * 4.0 - decel * 0.9), false));
        }
        assertThat(Hypervolume.paretoFront(trials)).isNotEmpty();
    }

    @Test
    void pyRandomMatchesPythonForSeed42() {
        // random.Random(42).random() == 0.6394267984578837 (CPython)
        assertThat(new PyRandom(42).random()).isEqualTo(0.6394267984578837);
    }
}
