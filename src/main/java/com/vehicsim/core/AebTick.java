package com.vehicsim.core;

/** Những gì AEB thấy và quyết định trong một khung — đủ để ghi frame. {@code decelCmd} ≥ 0 (m/s²): mức giảm tốc AEB yêu cầu actuator. */
public record AebTick(boolean detected, double confidence, Double perceivedY, Double ttc, double decelCmd) {
}
