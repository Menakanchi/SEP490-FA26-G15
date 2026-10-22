package com.vehicsim.core.mobo;

import com.vehicsim.core.Py;
import com.vehicsim.core.PyRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Multi-Objective Bayesian Optimization cho 4 tham số AEB theo 3 mục tiêu MINIMIZE (ADR-040): RMS jerk, vận tốc va chạm, quãng phanh dừng.
 *
 * <p>Đây là bộ đề xuất, không phải bộ chấm điểm: nó chỉ nhận kết quả các trial đã chạy và trả tham số tiếp theo. Mô phỏng và chỉ số vẫn do
 * {@code Simulator}/{@code Evaluation}/CARLA tính. Port từ {@code worker/vehicsim_core/mobo.py} (bản nhánh PhuongNA, 22/10); dùng {@link PyRandom} nên cùng seed
 * cho cùng dãy số ngẫu nhiên với bản Python.</p>
 *
 * <ol>
 *   <li>Dưới {@code nInitialPoints} trial hợp lệ: Bounded Random Sampling (không dùng LHS), bỏ điểm quá gần trial đã có.</li>
 *   <li>Từ đó: 3 GP độc lập trên [0, 1]^4, rồi qEHVI bằng Monte Carlo trên một pool hữu hạn (ngẫu nhiên phủ đều + nhiễu quanh nghiệm Pareto).</li>
 * </ol>
 */
public final class MoboEngine {

    public static final String INITIAL_DESIGN = "INITIAL_DESIGN";
    public static final String ACQUISITION = "ACQUISITION";

    private static final double[] REF_POINT = {1.1, 1.1, 1.1};
    private static final double DEDUP_TOLERANCE = 0.04;
    private static final int CANDIDATE_POOL_SIZE = 300;
    private static final int N_MC = 64;
    private static final int PERTURBATIONS_PER_PARETO_POINT = 8;
    private static final double PERTURBATION_SIGMA = 0.06;

    private final ParameterBounds bounds;
    private final int nInitialPoints;
    private final PyRandom rng;

    public MoboEngine(ParameterBounds bounds, int nInitialPoints, long seed) {
        this.bounds = bounds;
        this.nInitialPoints = nInitialPoints;
        this.rng = new PyRandom(seed);
    }

    /** Đề xuất cấu hình tiếp theo từ các trial đã chạy; {@code paretoTrialNumbers} là front hiện tại của chúng. */
    public MoboProposal propose(List<MoboTrial> trials) {
        List<MoboTrial> valid = trials.stream().filter(MoboTrial::valid).toList();
        List<Integer> paretoNumbers = Hypervolume.paretoFront(trials).stream().map(MoboTrial::number).sorted().toList();
        List<double[]> evaluated = trials.stream().map(t -> bounds.normalize(t.params())).toList();

        if (valid.size() < nInitialPoints) {
            for (int attempt = 0; attempt < 50; attempt++) {
                Map<String, Double> cand = randomCandidate();
                if (!isNearDuplicate(bounds.normalize(cand), evaluated)) {
                    return new MoboProposal(cand, INITIAL_DESIGN, null, paretoNumbers);
                }
            }
            return new MoboProposal(randomCandidate(), INITIAL_DESIGN, null, paretoNumbers);
        }

        Surrogate surrogate = new Surrogate(bounds, valid);
        List<MoboTrial> front = Hypervolume.paretoFront(valid);
        List<double[]> frontNorm = front.stream().map(t -> surrogate.normalizeObjectives(t.objectives())).toList();
        double baseHv = Hypervolume.compute(frontNorm, REF_POINT);

        List<double[]> pool = new ArrayList<>();
        for (int i = 0; i < CANDIDATE_POOL_SIZE; i++) {
            pool.add(bounds.normalize(randomCandidate()));
        }
        for (MoboTrial t : front) {
            double[] base = bounds.normalize(t.params());
            for (int i = 0; i < PERTURBATIONS_PER_PARETO_POINT; i++) {
                double[] perturbed = new double[base.length];
                for (int d = 0; d < base.length; d++) {
                    perturbed[d] = Math.max(0.0, Math.min(1.0, base[d] + rng.gauss(0.0, PERTURBATION_SIGMA)));
                }
                pool.add(perturbed);
            }
        }

        List<double[]> unique = pool.stream().filter(c -> !isNearDuplicate(c, evaluated)).toList();
        if (unique.isEmpty()) {
            unique = pool;
        }

        double[] best = null;
        double bestValue = Double.NEGATIVE_INFINITY;
        for (double[] cand : unique) {
            double value = qehvi(cand, surrogate, frontNorm, baseHv);
            if (value > bestValue) { // bằng nhau giữ ứng viên đứng trước, như sort ổn định giảm dần
                best = cand;
                bestValue = value;
            }
        }
        return new MoboProposal(bounds.denormalize(best), ACQUISITION, Py.round(Math.max(0.0, bestValue), 6), paretoNumbers);
    }

    private Map<String, Double> randomCandidate() {
        Map<String, Double> params = new LinkedHashMap<>();
        for (String k : ParameterBounds.PARAM_KEYS) {
            double lo = bounds.lower(k);
            double hi = bounds.upper(k);
            params.put(k, Py.round(lo + (hi - lo) * rng.random(), 3));
        }
        return params;
    }

    static boolean isNearDuplicate(double[] candidate, List<double[]> evaluated) {
        double tolSq = DEDUP_TOLERANCE * DEDUP_TOLERANCE;
        for (double[] prev : evaluated) {
            double distSq = 0.0;
            for (int d = 0; d < Math.min(candidate.length, prev.length); d++) {
                distSq += (candidate[d] - prev[d]) * (candidate[d] - prev[d]);
            }
            if (distSq < tolSq) {
                return true;
            }
        }
        return false;
    }

    /** qEHVI(x) = trung bình HVI của N_MC mẫu y ~ N(mu(x), sigma²(x)) trong không gian mục tiêu đã chuẩn hoá. */
    private double qehvi(double[] candidate, Surrogate surrogate, List<double[]> frontNorm, double baseHv) {
        double[][] preds = surrogate.predict(candidate);
        double[] means = {preds[0][0], preds[1][0], preds[2][0]};
        double[] stds = {preds[0][2], preds[1][2], preds[2][2]};
        if (stds[0] <= 1e-9 && stds[1] <= 1e-9 && stds[2] <= 1e-9) {
            return Hypervolume.improvement(means, frontNorm, REF_POINT, baseHv);
        }
        double total = 0.0;
        for (int s = 0; s < N_MC; s++) {
            double[] sample = {
                means[0] + stds[0] * rng.gauss(0.0, 1.0),
                means[1] + stds[1] * rng.gauss(0.0, 1.0),
                means[2] + stds[2] * rng.gauss(0.0, 1.0)};
            total += Hypervolume.improvement(sample, frontNorm, REF_POINT, baseHv);
        }
        return Math.max(0.0, total / N_MC);
    }

    /** 3 GP độc lập; mục tiêu được chuẩn hoá min-max về [0, 1] để hypervolume ổn định số học. */
    private static final class Surrogate {
        private final GaussianProcess[] gps = {new GaussianProcess(), new GaussianProcess(), new GaussianProcess()};
        private final double[][] objBounds = new double[3][];

        Surrogate(ParameterBounds bounds, List<MoboTrial> valid) {
            List<double[]> x = valid.stream().map(t -> bounds.normalize(t.params())).toList();
            for (int m = 0; m < 3; m++) {
                double[] y = new double[valid.size()];
                double min = Double.POSITIVE_INFINITY;
                double max = Double.NEGATIVE_INFINITY;
                for (int i = 0; i < y.length; i++) {
                    y[i] = valid.get(i).objectives()[m];
                    min = Math.min(min, y[i]);
                    max = Math.max(max, y[i]);
                }
                objBounds[m] = new double[] {min, max - min > 1e-6 ? max : min + 1.0};
                for (int i = 0; i < y.length; i++) {
                    y[i] = (y[i] - objBounds[m][0]) / (objBounds[m][1] - objBounds[m][0]);
                }
                gps[m].fit(x, y);
            }
        }

        double[] normalizeObjectives(double[] v) {
            double[] out = new double[3];
            for (int m = 0; m < 3; m++) {
                out[m] = (v[m] - objBounds[m][0]) / (objBounds[m][1] - objBounds[m][0]);
            }
            return out;
        }

        double[][] predict(double[] x) {
            return new double[][] {gps[0].predict(x), gps[1].predict(x), gps[2].predict(x)};
        }
    }
}
