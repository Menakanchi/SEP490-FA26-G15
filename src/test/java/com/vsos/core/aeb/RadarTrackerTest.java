package com.vsos.core.aeb;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** {@link RadarTracker} trên "thế giới" tổng hợp có vận tốc xuyên tâm đúng hình học (ADR-043). */
class RadarTrackerTest {

    private static final double DT = 0.01;
    private static final double EGO_V = 11.0;

    /** Điểm radar của một vật tại (forward, left) với vận tốc tương đối (vF, vL) so với xe; azimuth dương = bên phải như CARLA. */
    private static RadarTracker.Point point(double forward, double left, double vF, double vL, double altitudeDeg) {
        double horizontal = Math.hypot(forward, left);
        double alt = Math.toRadians(altitudeDeg);
        double azimuth = Math.atan2(-left, forward);
        double radial = (vF * forward + vL * left) / horizontal;
        return new RadarTracker.Point(horizontal / Math.cos(alt), azimuth, alt, radial * Math.cos(alt));
    }

    /** Cột đèn bên đường và mặt đường: vật tĩnh (vận tốc tương đối = −v_ego dọc). */
    private static List<RadarTracker.Point> clutter(double travelled) {
        List<RadarTracker.Point> pts = new ArrayList<>();
        pts.add(point(30.0 - travelled, 6.0, -EGO_V, 0.0, 1.0));
        pts.add(point(45.0 - travelled, -7.0, -EGO_V, 0.0, 2.0));
        pts.add(point(12.0, 0.5, -EGO_V, 0.0, -3.0)); // mặt đường phía trước
        return pts;
    }

    @Test
    void staticClutterAndRoadReturnsNeverStartATrack() {
        RadarTracker tracker = new RadarTracker();
        for (int i = 0; i < 200; i++) {
            RadarTracker.Estimate e = tracker.update(i * DT, EGO_V, clutter(EGO_V * i * DT));
            assertThat(e.tracked()).as("tick %d", i).isFalse();
        }
    }

    @Test
    void crossingPedestrianIsTrackedWithSmallErrorAndItsLateralSpeed() {
        RadarTracker tracker = new RadarTracker();
        double pedForward = 25.0;
        double pedLeft = -3.6;
        double pedVLeft = 3.0;
        RadarTracker.Estimate last = null;
        double firstConfidentT = -1;
        for (int i = 0; i < 100; i++) {
            double t = i * DT;
            List<RadarTracker.Point> pts = clutter(EGO_V * t);
            // Hai điểm phản xạ trên thân người (vai trái/phải), vận tốc tương đối (−v_ego, v_ngang).
            pts.add(point(pedForward - 0.1, pedLeft + 0.2, -EGO_V, pedVLeft, 3.0));
            pts.add(point(pedForward + 0.1, pedLeft - 0.2, -EGO_V, pedVLeft, 2.0));
            last = tracker.update(t, EGO_V, pts);
            if (firstConfidentT < 0 && last.tracked() && last.confidence() >= AebStack.DETECTION_CONFIDENCE_THRESHOLD) {
                firstConfidentT = t;
            }
            pedForward -= EGO_V * DT;
            pedLeft += pedVLeft * DT;
        }
        // Phải chứng minh chuyển động trước khi báo: ≥ MOTION_MIN_SAMPLES mẫu (0,14 s) rồi đạt liên tục MOTION_CONFIRM_S (0,1 s). Bản một mục tiêu báo
        // trong 0,1 s nhưng báo luôn cả vật tĩnh (track giả ca c6).
        assertThat(firstConfidentT).as("có độ tin cậy ≥ 0,7 trong 0,3 s").isBetween(0.2, 0.3);
        assertThat(last.tracked()).isTrue();
        assertThat(last.confidence()).isEqualTo(1.0);
        // Vị trí thật ở tick cuối (đã cộng thêm một bước sau khi đo).
        assertThat(last.forward()).isCloseTo(pedForward + EGO_V * DT, within(0.3));
        assertThat(last.left()).isCloseTo(pedLeft - pedVLeft * DT, within(0.3));
        assertThat(last.vLeft()).isCloseTo(pedVLeft, within(0.1)); // hồi quy cửa sổ 0,2 s: bộ lọc α=0,5 đơn thuần không đạt
    }

    @Test
    void aLostTargetFadesThenIsDropped() {
        RadarTracker tracker = new RadarTracker();
        for (int i = 0; i < 30; i++) {
            // Xuất phát ở lề (−3,6 m) như kịch bản thật: ở đó phần dư Doppler ~0,4 m/s đủ mở track.
            tracker.update(i * DT, EGO_V, List.of(point(20.0 - EGO_V * i * DT, -3.6 + 3.0 * i * DT, -EGO_V, 3.0, 2.0)));
        }
        RadarTracker.Estimate fading = tracker.update(0.30 + 0.15, EGO_V, List.of());
        assertThat(fading.tracked()).isTrue();
        assertThat(fading.confidence()).isLessThan(AebStack.DETECTION_CONFIDENCE_THRESHOLD);
        assertThat(tracker.update(0.30 + 0.40, EGO_V, List.of()).tracked()).as("mất điểm quá LOST_S thì bỏ track").isFalse();
    }

    /** Giới hạn vật lý, không phải lỗi: gần tim làn, người băng ngang gần như vuông góc với tia radar nên phần dư Doppler quá nhỏ để mở track. */
    @Test
    void aCrossingTargetFirstSeenNearTheLaneCentreCannotStartATrack() {
        RadarTracker tracker = new RadarTracker();
        for (int i = 0; i < 30; i++) {
            RadarTracker.Estimate e = tracker.update(i * DT, EGO_V, List.of(point(20.0 - EGO_V * i * DT, -1.0 + 3.0 * i * DT, -EGO_V, 3.0, 2.0)));
            if (i < 10) {
                assertThat(e.tracked()).as("tick %d: |phần dư| < %s m/s", i, RadarTracker.RESIDUAL_MIN_MPS).isFalse();
            }
        }
    }

    /** Vật tĩnh mà Doppler lệch: radial lệch thêm {@code bias} so với hình học. */
    private static RadarTracker.Point biased(double forward, double left, double egoV, double bias) {
        RadarTracker.Point p = point(forward, left, -egoV, 0.0, 1.0);
        return new RadarTracker.Point(p.depth(), p.azimuth(), p.altitude(), p.velocity() + bias);
    }

    /**
     * Lệch Doppler chung của cả lần đo như đo trên CARLA 13/11/2026 (ca c6: |lệch| ~0,35 m/s, đổi dấu theo tick): tốc độ ego răng cưa lệch pha lần đo radar,
     * nên phần dư tính theo {@code egoV} của tick lệch cùng một lượng ở <b>mọi</b> điểm. Bản 22/10 mở track giả trên vật lề đường vì vậy.
     */
    private static double commonBias(int tick) {
        return tick % 2 == 0 ? 0.35 : -0.35;
    }

    /** Cảnh tĩnh: 20 cột hai bên đường, vị trí cố định trên mặt đất, cùng chịu lệch Doppler chung của tick. */
    private static List<RadarTracker.Point> scene(double travelled, double egoV, double bias) {
        List<RadarTracker.Point> pts = new ArrayList<>();
        for (int k = 0; k < 20; k++) {
            double forward = Math.floorMod((long) Math.round((4.0 * k - travelled) * 1000), 76_000L) / 1000.0 + 4.0;
            pts.add(biased(forward, k % 2 == 0 ? -7.5 : 8.0, egoV, bias));
        }
        return pts;
    }

    /** Ca c6: vật lề đường chịu lệch Doppler chung của tick không bao giờ được báo. */
    @Test
    void aStaticRoadsideObjectWithTheCommonDopplerOffsetIsNeverReported() {
        RadarTracker tracker = new RadarTracker();
        double v = 5.66;
        for (int i = 0; i < 300; i++) {
            double travelled = v * i * DT;
            List<RadarTracker.Point> pts = scene(travelled, v, commonBias(i));
            pts.add(biased(28.0 - travelled, -5.64, v, commonBias(i)));
            pts.add(biased(28.3 - travelled, -5.7, v, commonBias(i)));
            assertThat(tracker.update(i * DT, v, pts).tracked()).as("tick %d", i).isFalse();
        }
    }

    /**
     * Hàng rào dọc lề đường như đo trên CARLA 13/11/2026: điểm phản xạ ở khắp chiều dài, mỗi tick một vị trí khác; Doppler của <b>cả tick</b> lệch cùng
     * ±0,35 m/s (tốc độ ego răng cưa lệch pha lần đo radar) cộng nhiễu riêng từng điểm độ lệch chuẩn 0,05 m/s.
     */
    @Test
    void aFenceAlongTheRoadIsNeverReported() {
        RadarTracker tracker = new RadarTracker();
        java.util.Random rnd = new java.util.Random(7);
        for (int i = 0; i < 500; i++) {
            List<RadarTracker.Point> pts = new ArrayList<>();
            for (int k = 0; k < 40; k++) {
                pts.add(biased(5.0 + rnd.nextDouble() * 60.0, -5.6 + rnd.nextGaussian() * 0.05, EGO_V, commonBias(i) + rnd.nextGaussian() * 0.05));
            }
            assertThat(tracker.update(i * DT, EGO_V, pts).tracked()).as("tick %d", i).isFalse();
        }
    }

    /** Lệch Doppler chung của cả lần đo được bù bằng tốc độ radar ước lượng từ cảnh tĩnh, không bằng {@code egoV} của tick. */
    @Test
    void sensorSpeedComesFromTheStaticSceneNotFromTheTickEgoSpeed() {
        List<RadarTracker.Point> pts = new ArrayList<>();
        for (int k = 0; k < 20; k++) {
            pts.add(point(10.0 + k * 2.0, k % 2 == 0 ? -5.0 : 6.0, -5.36, 0.0, 1.0)); // radar thấy 5,36 m/s
        }
        assertThat(RadarTracker.sensorSpeed(5.75, pts)).isCloseTo(5.36, within(1e-6));
        assertThat(RadarTracker.sensorSpeed(5.75, pts.subList(0, 5))).as("quá ít điểm thì dùng egoV").isEqualTo(5.75);
    }

    /** Lỗi của bản một mục tiêu: track tĩnh mở trước che người đi bộ. Nay người đi bộ vẫn được báo, đúng vị trí. */
    @Test
    void aStaticTrackDoesNotHideAPedestrianWhoStartsCrossingLater() {
        RadarTracker tracker = new RadarTracker();
        double pedForward = 40.0;
        double pedLeft = -3.6;
        RadarTracker.Estimate last = null;
        for (int i = 0; i < 250; i++) {
            double t = i * DT;
            double travelled = EGO_V * t;
            List<RadarTracker.Point> pts = scene(travelled, EGO_V, commonBias(i));
            pts.add(biased(50.0 - travelled, -5.64, EGO_V, commonBias(i)));
            double pedVLeft = t >= 1.0 ? 3.0 : 0.0; // đứng ở lề 1 s rồi mới đi
            RadarTracker.Point ped = point(pedForward, pedLeft, -EGO_V, pedVLeft, 2.0);
            pts.add(new RadarTracker.Point(ped.depth(), ped.azimuth(), ped.altitude(), ped.velocity() + commonBias(i)));
            last = tracker.update(t, EGO_V, pts);
            if (t < 1.0) {
                assertThat(last.tracked()).as("tick %d: người đứng yên, vật lề đường tĩnh", i).isFalse();
            }
            pedForward -= EGO_V * DT;
            pedLeft += pedVLeft * DT;
        }
        assertThat(last.tracked()).isTrue();
        assertThat(last.confidence()).isEqualTo(1.0);
        assertThat(last.forward()).isCloseTo(pedForward + EGO_V * DT, within(0.3));
        assertThat(last.left()).isCloseTo(pedLeft - 3.0 * DT, within(0.3));
        assertThat(last.vLeft()).isCloseTo(3.0, within(0.1));
    }

    /** Ego phanh 8 m/s²: vật tĩnh tiến lại chậm dần trong khung xe, nhưng vận tốc mặt đất vẫn 0 nên không thành mục tiêu. */
    @Test
    void egoBrakingDoesNotMakeStaticObjectsLookMoving() {
        RadarTracker tracker = new RadarTracker();
        double v = 16.0;
        double travelled = 0.0;
        for (int i = 0; i < 200 && v > 0.5; i++) {
            List<RadarTracker.Point> pts = scene(travelled, v, commonBias(i));
            pts.add(biased(45.0 - travelled, -5.0, v, commonBias(i)));
            assertThat(tracker.update(i * DT, v, pts).tracked()).as("tick %d", i).isFalse();
            travelled += v * DT;
            v -= 8.0 * DT;
        }
    }

    /** Người dừng ở lề: được báo khi đang đi, thôi báo sau {@code STATIC_HOLD_S} đứng yên (không phanh oan vì người đã dừng ngoài làn). */
    @Test
    void aPedestrianWhoStopsAtTheCurbIsNoLongerReported() {
        RadarTracker tracker = new RadarTracker();
        double pedForward = 30.0;
        double pedLeft = -5.0;
        boolean reported = false;
        RadarTracker.Estimate last = null;
        for (int i = 0; i < 200; i++) {
            double t = i * DT;
            double pedVLeft = t < 0.8 ? 2.0 : 0.0;
            last = tracker.update(t, EGO_V, List.of(point(pedForward, pedLeft, -EGO_V, pedVLeft, 2.0)));
            reported |= last.tracked() && last.confidence() >= AebStack.DETECTION_CONFIDENCE_THRESHOLD;
            pedForward -= EGO_V * DT;
            pedLeft += pedVLeft * DT;
        }
        assertThat(reported).as("đang đi thì có báo").isTrue();
        assertThat(last.tracked()).as("đã đứng yên > STATIC_HOLD_S").isFalse();
    }

    /** Tốc độ người đi bộ nhỏ nhất của kịch bản (0,5 m/s) vẫn được báo; xuất phát xa tim làn nên phần dư Doppler đủ mở track. */
    @Test
    void theSlowestScenarioPedestrianIsStillReported() {
        RadarTracker tracker = new RadarTracker();
        double pedForward = 20.0;
        double pedLeft = -6.0;
        Double firstT = null;
        for (int i = 0; i < 150; i++) {
            double t = i * DT;
            RadarTracker.Estimate e = tracker.update(t, 8.0, List.of(point(pedForward, pedLeft, -8.0, 0.5, 2.0)));
            if (firstT == null && e.tracked() && e.confidence() >= AebStack.DETECTION_CONFIDENCE_THRESHOLD) {
                firstT = t;
            }
            pedForward -= 8.0 * DT;
            pedLeft += 0.5 * DT;
        }
        assertThat(firstT).as("báo trong 0,5 s").isNotNull().isLessThan(0.5);
    }

    @Test
    void regressionStandardErrorShrinksWithMoreSamples() {
        List<double[]> clean = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            clean.add(new double[] {i * DT, 0.0, 2.0 * i * DT});
        }
        RadarTracker.Fit f = RadarTracker.fit(clean, 2, Double.NEGATIVE_INFINITY);
        assertThat(f.slope()).isCloseTo(2.0, within(1e-9));
        assertThat(f.stderr()).isCloseTo(0.0, within(1e-6));
        assertThat(RadarTracker.fit(clean.subList(0, 4), 2, Double.NEGATIVE_INFINITY)).as("dưới VELOCITY_MIN_SAMPLES").isNull();
    }

    @Test
    void unphysicalSpawnReadingsAreIgnored() {
        RadarTracker tracker = new RadarTracker();
        RadarTracker.Estimate e = tracker.update(0.0, EGO_V, List.of(new RadarTracker.Point(60.0, 0.0, 0.0, -5604.0)));
        assertThat(e.tracked()).isFalse();
    }
}
