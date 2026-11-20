package com.vsos.core.aeb;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Bộ lọc gia tốc theo Euro NCAP AEB/LSS VRU Test Protocol v4.5.1 (4.4.1.2: "12-pole phaseless Butterworth filter with a cut off frequency of 10Hz") và
 * T_AEB (mục 2). Kiểm bằng tín hiệu biết trước ở 100 Hz, như CARLA v6.
 */
class EuroNcapFilterTest {

    private static final double DT = 0.01;

    private static List<Double> filter(List<Double> x) {
        return Filters.butterworthZeroPhase(x, DT, Filters.EURO_NCAP_CUTOFF_HZ, Filters.EURO_NCAP_ORDER_PER_PASS);
    }

    private static List<Double> sine(double hz, int n) {
        List<Double> x = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            x.add(Math.sin(2 * Math.PI * hz * i * DT));
        }
        return x;
    }

    /** Biên độ ở giữa chuỗi (bỏ hai biên) của tín hiệu sin đã lọc. */
    private static double amplitude(List<Double> y) {
        double max = 0.0;
        for (int i = y.size() / 4; i < 3 * y.size() / 4; i++) {
            max = Math.max(max, Math.abs(y.get(i)));
        }
        return max;
    }

    @Test
    void aConstantPassesUnchanged() {
        List<Double> y = filter(new ArrayList<>(java.util.Collections.nCopies(300, -4.5)));
        for (double v : y) {
            assertThat(v).isCloseTo(-4.5, within(1e-9));
        }
    }

    /** Không lệch pha nên đầu ra là đầu vào nhân hệ số khuếch đại, từng mẫu (bỏ hai biên). */
    private static void assertGain(double hz, double gain, double tolerance) {
        List<Double> x = sine(hz, 1000);
        List<Double> y = filter(x);
        for (int i = 250; i < 750; i++) {
            assertThat(y.get(i)).as("%s Hz, mẫu %d", hz, i).isCloseTo(gain * x.get(i), within(tolerance));
        }
    }

    /** Hai lượt Butterworth thiết kế ở 10 Hz: đáp ứng tổng −6 dB (hệ số 0,5) đúng tại 10 Hz; dải thông gần như nguyên vẹn, dải chặn bị cắt mạnh. */
    @Test
    void frequencyResponseOfTheTwelvePolePhaselessFilter() {
        assertGain(2.0, 1.0, 0.01);
        assertGain(10.0, 0.5, 0.01);
        assertThat(amplitude(filter(sine(25.0, 1000)))).isLessThan(1e-3);
    }

    /** "Phaseless": một xung đối xứng sau khi lọc vẫn đạt đỉnh đúng chỗ — bộ lọc một chiều bậc 2 cũ làm đỉnh trễ. */
    @Test
    void aSymmetricPulseKeepsItsPeakInPlace() {
        List<Double> x = new ArrayList<>();
        for (int i = 0; i < 301; i++) {
            double t = (i - 150) * DT;
            x.add(Math.exp(-t * t / (2 * 0.05 * 0.05)));
        }
        List<Double> y = filter(x);
        int peak = 0;
        for (int i = 1; i < y.size(); i++) {
            if (y.get(i) > y.get(peak)) {
                peak = i;
            }
        }
        assertThat(peak).isEqualTo(150);
        List<Double> causal = Filters.butterworthLowpass2(x, DT, 10.0);
        int causalPeak = 0;
        for (int i = 1; i < causal.size(); i++) {
            if (causal.get(i) > causal.get(causalPeak)) {
                causalPeak = i;
            }
        }
        assertThat(causalPeak).as("bộ lọc cũ có trễ pha").isGreaterThan(150);
    }

    @Test
    void cutoffMustBeBelowNyquistAndOrderEven() {
        assertThatThrownBy(() -> Filters.butterworthZeroPhase(sine(1.0, 50), 0.05, 10.0, 6)).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Nyquist");
        assertThatThrownBy(() -> Filters.butterworthZeroPhase(sine(1.0, 50), DT, 10.0, 5)).isInstanceOf(IllegalArgumentException.class);
        assertThat(Filters.butterworthZeroPhase(List.of(), DT, 10.0, 6)).isEmpty();
        List<Double> single = Filters.butterworthZeroPhase(List.of(2.0), DT, 10.0, 6);
        assertThat(single).hasSize(1);
        assertThat(single.get(0)).isCloseTo(2.0, within(1e-12));
    }

    /** T_AEB: lần cuối gia tốc vượt xuống −1 m/s², lùi về lúc nó vượt −0,3 m/s². Lần phanh ngắn trước đó (cũng xuống dưới −1) không được chọn. */
    @Test
    void tAebIsTheLastBrakeOnsetMeasuredFromTheMinusZeroPointThreeCrossing() {
        List<Double> a = new ArrayList<>(List.of(0.0, 0.0, -0.2, -0.5, -1.2, -0.8, -0.1, 0.0, 0.0, -0.1, -0.2, -0.4, -0.7, -1.5, -6.0, -6.0));
        assertThat(Filters.tAebIndex(a)).isEqualTo(11);
        assertThat(Filters.tAebIndex(List.of(0.0, -0.2, -0.9, -0.5))).as("không xuống dưới −1 = không phanh").isEqualTo(-1);
        assertThat(Filters.tAebIndex(List.of(-2.0, -3.0))).as("đã phanh từ khung đầu").isZero();
    }

    @Test
    void rmsJerkOfALinearRampIsItsSlope() {
        List<Double> a = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            a.add(i < 10 ? 0.0 : -20.0 * (i - 10) * DT);
        }
        // Từ khung 11: mỗi bước giảm 0,2 m/s² trong 0,01 s = 20 m/s³.
        assertThat(Filters.rmsJerk(a, 11, DT)).isCloseTo(20.0, within(1e-9));
        assertThat(Filters.rmsJerk(a, -1, DT)).isNull();
    }
}
