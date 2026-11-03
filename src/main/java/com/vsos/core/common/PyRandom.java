package com.vsos.core.common;

import java.math.BigInteger;

/**
 * {@code random.Random(seed)} của CPython: Mersenne Twister 19937, gieo từ số nguyên bằng {@code init_by_array} và {@code gauss}
 * có nhớ giá trị thứ hai. Cùng seed ra đúng cùng chuỗi {@code random()} và {@code gauss(mu, sigma)} (ADR-042), nên run cũ vẫn tái lập.
 *
 * <p>{@code gauss} dùng {@code cos/sin/log} của libm trong CPython; ở đây dùng {@link StrictMath} (fdlibm) để kết quả không phụ thuộc máy.
 * Chênh lệch có thể ở bit cuối, bị che bởi làm tròn khi lưu; test đối chiếu chuỗi Python kiểm điều đó.</p>
 */
public final class PyRandom {

    private static final int N = 624;
    private static final int M = 397;
    private static final double TWO_PI = 2.0 * Math.PI;

    private final int[] mt = new int[N];
    private int index;
    private Double gaussNext;

    public PyRandom(long seed) {
        BigInteger magnitude = BigInteger.valueOf(seed).abs();
        int words = Math.max(1, (magnitude.bitLength() + 31) / 32);
        int[] key = new int[words];
        for (int i = 0; i < words; i++) {
            key[i] = magnitude.shiftRight(32 * i).intValue();
        }
        initByArray(key);
    }

    private void initGenrand(int seed) {
        mt[0] = seed;
        for (int i = 1; i < N; i++) {
            mt[i] = 1812433253 * (mt[i - 1] ^ (mt[i - 1] >>> 30)) + i;
        }
        index = N;
    }

    private void initByArray(int[] key) {
        initGenrand(19650218);
        int i = 1;
        int j = 0;
        for (int k = Math.max(N, key.length); k > 0; k--) {
            mt[i] = (mt[i] ^ ((mt[i - 1] ^ (mt[i - 1] >>> 30)) * 1664525)) + key[j] + j;
            i++;
            j++;
            if (i >= N) {
                mt[0] = mt[N - 1];
                i = 1;
            }
            if (j >= key.length) {
                j = 0;
            }
        }
        for (int k = N - 1; k > 0; k--) {
            mt[i] = (mt[i] ^ ((mt[i - 1] ^ (mt[i - 1] >>> 30)) * 1566083941)) - i;
            i++;
            if (i >= N) {
                mt[0] = mt[N - 1];
                i = 1;
            }
        }
        mt[0] = 0x80000000;
    }

    private int nextInt32() {
        if (index >= N) {
            for (int kk = 0; kk < N; kk++) {
                int y = (mt[kk] & 0x80000000) | (mt[(kk + 1) % N] & 0x7fffffff);
                int next = mt[(kk + M) % N] ^ (y >>> 1);
                mt[kk] = (y & 1) != 0 ? next ^ 0x9908b0df : next;
            }
            index = 0;
        }
        int y = mt[index++];
        y ^= y >>> 11;
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= y >>> 18;
        return y;
    }

    /** {@code random.random()}: 53 bit trong [0, 1). */
    public double random() {
        long a = (nextInt32() & 0xffffffffL) >>> 5;
        long b = (nextInt32() & 0xffffffffL) >>> 6;
        return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
    }

    /** {@code random.gauss(mu, sigma)}. */
    public double gauss(double mu, double sigma) {
        Double z = gaussNext;
        gaussNext = null;
        if (z == null) {
            double x2pi = random() * TWO_PI;
            double g2rad = Math.sqrt(-2.0 * StrictMath.log(1.0 - random()));
            z = StrictMath.cos(x2pi) * g2rad;
            gaussNext = StrictMath.sin(x2pi) * g2rad;
        }
        return mu + z * sigma;
    }
}
