package com.vehicsim.vehicsim;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Làm tròn / định dạng phải khớp Python để số trả về giống backend cũ từng chữ số. */
class VsTest {

    @Test
    void roundIsHalfEvenOnTheExactBinaryValue() {
        assertEquals(0.12, Vs.round(0.125, 2)); // Python round(0.125, 2) == 0.12
        assertEquals(0.38, Vs.round(0.375, 2));
        assertEquals(2.67, Vs.round(2.675, 2)); // 2.675 được lưu là 2.67499999... nên Python cũng ra 2.67
        assertEquals(1.0, Vs.round(0.9999, 3));
        assertEquals(62L, Vs.roundToLong(62.5));
        assertEquals(64L, Vs.roundToLong(63.5));
    }

    @Test
    void fmt0MatchesPythonFormat() {
        assertEquals("62", Vs.fmt0(62.5));
        assertEquals("60", Vs.fmt0(60.0));
        assertEquals("63", Vs.fmt0(62.51));
    }

    @Test
    void isoDropsMicrosOnlyWhenZeroAndKeepsSeconds() {
        assertEquals("2026-10-13T12:34:56", Vs.iso(LocalDateTime.of(2026, 10, 13, 12, 34, 56)));
        assertEquals("2026-10-13T12:34:00", Vs.iso(LocalDateTime.of(2026, 10, 13, 12, 34, 0)));
        assertEquals("2026-10-13T12:34:56.000123", Vs.iso(LocalDateTime.of(2026, 10, 13, 12, 34, 56, 123_000)));
        assertNull(Vs.iso(null));
    }

    @Test
    void variantLabelAndSummary() {
        assertEquals("PX-007", Vs.variantLabel("PX", 7));
        assertEquals("Night · heavy rain · 60 km/h · stops at curb", Vs.variantSummary(
                Map.of("time_of_day", "NIGHT", "weather", "HEAVY_RAIN", "ego_speed_kmh", 60.0, "stops_at_curb", true)));
        assertEquals("Day · clear · 0 km/h", Vs.variantSummary(Map.of()));
    }

    @Test
    void classifyOutcome() {
        assertEquals("COLLISION", Vs.classifyOutcome(true, 5.0, 5.0));
        assertEquals("NEAR_MISS", Vs.classifyOutcome(false, 0.9, 3.0));
        assertEquals("NEAR_MISS", Vs.classifyOutcome(false, 3.0, 0.4));
        assertEquals("SAFE", Vs.classifyOutcome(false, null, null));
    }

    @Test
    void medianLikePythonStatistics() {
        assertNull(Vs.median(List.of()));
        assertEquals(2.0, Vs.median(List.of(3.0, 1.0, 2.0)));
        assertEquals(2.5, Vs.median(List.of(4.0, 1.0, 3.0, 2.0)));
    }
}
