package com.vehicsim.core;

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
        assertThat(firstConfidentT).as("có độ tin cậy ≥ 0,7 trong 0,1 s").isBetween(0.0, 0.1);
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

    @Test
    void unphysicalSpawnReadingsAreIgnored() {
        RadarTracker tracker = new RadarTracker();
        RadarTracker.Estimate e = tracker.update(0.0, EGO_V, List.of(new RadarTracker.Point(60.0, 0.0, 0.0, -5604.0)));
        assertThat(e.tracked()).isFalse();
    }
}
