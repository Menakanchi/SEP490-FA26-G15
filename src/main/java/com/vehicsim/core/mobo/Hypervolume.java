package com.vehicsim.core.mobo;

import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/** Pareto dominance, lọc Pareto front và Hypervolume 3D cho 3 mục tiêu MINIMIZE. */
final class Hypervolume {

    private Hypervolume() {
    }

    /** a dominates b khi a_i <= b_i với mọi i và có j sao cho a_j < b_j. */
    static boolean dominates(double[] a, double[] b) {
        boolean notWorse = a[0] <= b[0] && a[1] <= b[1] && a[2] <= b[2];
        boolean strictlyBetter = a[0] < b[0] || a[1] < b[1] || a[2] < b[2];
        return notWorse && strictlyBetter;
    }

    /** Các trial hợp lệ không bị trial hợp lệ nào khác dominate, theo thứ tự đầu vào. */
    static List<MoboTrial> paretoFront(List<MoboTrial> trials) {
        List<MoboTrial> valid = trials.stream().filter(MoboTrial::valid).toList();
        List<MoboTrial> front = new ArrayList<>();
        for (MoboTrial t : valid) {
            boolean dominated = false;
            for (MoboTrial other : valid) {
                if (other != t && dominates(other.objectives(), t.objectives())) {
                    dominated = true;
                    break;
                }
            }
            if (!dominated) {
                front.add(t);
            }
        }
        return front;
    }

    /** Hypervolume của tập điểm so với ref point: chia lát theo Z, mỗi lát quét theo X để lấy diện tích hợp trên (X, Y). */
    static double compute(List<double[]> points, double[] ref) {
        List<double[]> inside = new ArrayList<>();
        for (double[] p : points) {
            if (p[0] < ref[0] && p[1] < ref[1] && p[2] < ref[2]) {
                inside.add(p);
            }
        }
        if (inside.isEmpty()) {
            return 0.0;
        }
        List<Double> zs = distinctSorted(inside, 2);
        double total = 0.0;
        for (int i = 0; i < zs.size(); i++) {
            double zCur = zs.get(i);
            double dz = (i + 1 < zs.size() ? zs.get(i + 1) : ref[2]) - zCur;
            if (dz <= 1e-9) {
                continue;
            }
            List<double[]> slice = new ArrayList<>();
            for (double[] p : inside) {
                if (p[2] <= zCur) {
                    slice.add(p);
                }
            }
            List<Double> xs = distinctSorted(slice, 0);
            double area = 0.0;
            for (int j = 0; j < xs.size(); j++) {
                double xCur = xs.get(j);
                double dx = (j + 1 < xs.size() ? xs.get(j + 1) : ref[0]) - xCur;
                if (dx <= 1e-9) {
                    continue;
                }
                double minY = Double.POSITIVE_INFINITY;
                for (double[] p : slice) {
                    if (p[0] <= xCur) {
                        minY = Math.min(minY, p[1]);
                    }
                }
                if (minY != Double.POSITIVE_INFINITY) {
                    area += dx * Math.max(0.0, ref[1] - minY);
                }
            }
            total += area * dz;
        }
        return Math.max(0.0, total);
    }

    /** Mức tăng hypervolume khi thêm {@code sample}; 0 nếu nằm ngoài ref point hoặc bị một điểm của front dominate. */
    static double improvement(double[] sample, List<double[]> front, double[] ref, double baseHv) {
        if (sample[0] >= ref[0] || sample[1] >= ref[1] || sample[2] >= ref[2]) {
            return 0.0;
        }
        for (double[] p : front) {
            if (dominates(p, sample)) {
                return 0.0;
            }
        }
        List<double[]> extended = new ArrayList<>(front);
        extended.add(sample);
        return Math.max(0.0, compute(extended, ref) - baseHv);
    }

    private static List<Double> distinctSorted(List<double[]> points, int axis) {
        TreeSet<Double> set = new TreeSet<>();
        for (double[] p : points) {
            set.add(p[axis]);
        }
        return new ArrayList<>(set);
    }
}
