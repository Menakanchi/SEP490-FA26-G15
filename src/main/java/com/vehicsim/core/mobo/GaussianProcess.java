package com.vehicsim.core.mobo;

import java.util.List;

/** Gaussian Process một mục tiêu: RBF kernel với length scale 0,35 trên [0, 1]^4, phân rã Cholesky thuần JDK. */
final class GaussianProcess {

    private static final double LENGTH_SCALE = 0.35;
    private static final double SIGNAL_VARIANCE = 1.0;
    private static final double NOISE = 1e-4;
    private static final double JITTER = 1e-6;

    private double[][] xTrain = new double[0][];
    private double[][] chol = new double[0][];
    private double[] alpha = new double[0];

    static double kernel(double[] a, double[] b) {
        double sq = 0.0;
        for (int d = 0; d < Math.min(a.length, b.length); d++) {
            double diff = a[d] - b[d];
            sq += diff * diff / (LENGTH_SCALE * LENGTH_SCALE);
        }
        return SIGNAL_VARIANCE * Math.exp(-0.5 * sq);
    }

    void fit(List<double[]> x, double[] y) {
        int n = x.size();
        xTrain = x.toArray(new double[0][]);
        if (n == 0) {
            return;
        }
        double[][] k = new double[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                k[i][j] = kernel(xTrain[i], xTrain[j]);
            }
            k[i][i] += NOISE + JITTER;
        }
        chol = cholesky(k, JITTER);
        alpha = backward(chol, forward(chol, y));
    }

    /** Trả về {mean, variance, std} của phân phối hậu nghiệm tại x. */
    double[] predict(double[] x) {
        if (xTrain.length == 0) {
            return new double[] {0.0, 1.0, 1.0};
        }
        double[] kStar = new double[xTrain.length];
        double mean = 0.0;
        for (int i = 0; i < kStar.length; i++) {
            kStar[i] = kernel(xTrain[i], x);
            mean += kStar[i] * alpha[i];
        }
        double vSq = 0.0;
        for (double v : forward(chol, kStar)) {
            vSq += v * v;
        }
        double variance = Math.max(0.0, kernel(x, x) + NOISE - vSq);
        return new double[] {mean, variance, Math.sqrt(variance)};
    }

    /** A + jitter·I = L·Lᵀ; nếu pivot không dương thì tăng jitter ×10, tối đa 5 lần, rồi chặn pivot ở 1e-6. */
    static double[][] cholesky(double[][] a, double jitter) {
        int n = a.length;
        double cur = jitter;
        for (int attempt = 0; attempt < 5; attempt++) {
            double[][] l = new double[n][n];
            boolean ok = true;
            for (int i = 0; i < n && ok; i++) {
                for (int j = 0; j <= i; j++) {
                    double s = 0.0;
                    for (int k = 0; k < j; k++) {
                        s += l[i][k] * l[j][k];
                    }
                    if (i == j) {
                        double val = a[i][i] + cur - s;
                        if (val <= 1e-12) {
                            ok = false;
                            break;
                        }
                        l[i][j] = Math.sqrt(val);
                    } else {
                        if (l[j][j] <= 1e-12) {
                            ok = false;
                            break;
                        }
                        l[i][j] = (a[i][j] - s) / l[j][j];
                    }
                }
            }
            if (ok) {
                return l;
            }
            cur *= 10.0;
        }
        double[][] l = new double[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j <= i; j++) {
                double s = 0.0;
                for (int k = 0; k < j; k++) {
                    s += l[i][k] * l[j][k];
                }
                if (i == j) {
                    l[i][j] = Math.sqrt(Math.max(1e-6, a[i][i] + cur - s));
                } else {
                    l[i][j] = (a[i][j] - s) / Math.max(1e-6, l[j][j]);
                }
            }
        }
        return l;
    }

    /** Giải L·y = b. */
    static double[] forward(double[][] l, double[] b) {
        int n = l.length;
        double[] y = new double[n];
        for (int i = 0; i < n; i++) {
            double s = 0.0;
            for (int j = 0; j < i; j++) {
                s += l[i][j] * y[j];
            }
            y[i] = (b[i] - s) / pivot(l[i][i]);
        }
        return y;
    }

    /** Giải Lᵀ·x = y. */
    static double[] backward(double[][] l, double[] y) {
        int n = l.length;
        double[] x = new double[n];
        for (int i = n - 1; i >= 0; i--) {
            double s = 0.0;
            for (int j = i + 1; j < n; j++) {
                s += l[j][i] * x[j];
            }
            x[i] = (y[i] - s) / pivot(l[i][i]);
        }
        return x;
    }

    private static double pivot(double d) {
        return Math.abs(d) > 1e-12 ? d : 1e-6;
    }
}
