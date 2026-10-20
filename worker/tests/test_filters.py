"""Bộ lọc Butterworth 10 Hz kiểm trên tín hiệu biết trước (không dùng CARLA)."""

from __future__ import annotations

import math

import pytest
from vehicsim_core.filters import butterworth_lowpass2, filtered_rms_jerk

DT = 0.01


def _steady_amplitude(freq_hz: float) -> float:
    n = 2000
    sine = [math.sin(2 * math.pi * freq_hz * i * DT) for i in range(n)]
    out = butterworth_lowpass2(sine, DT, 10.0)
    return max(abs(v) for v in out[n // 2:])  # bỏ quá độ đầu


def test_constant_signal_passes_unchanged_without_startup_transient() -> None:
    out = butterworth_lowpass2([4.6] * 50, DT)
    assert out == pytest.approx([4.6] * 50, abs=1e-9)


def test_gain_is_minus_3db_at_cutoff_and_flat_well_below() -> None:
    assert _steady_amplitude(10.0) == pytest.approx(1 / math.sqrt(2), abs=0.01)
    assert _steady_amplitude(1.0) == pytest.approx(1.0, abs=0.01)


def test_high_frequency_noise_is_attenuated_about_40db_per_two_decades() -> None:
    # Bậc 2: ~12 dB/octave. 40 Hz (hai octave trên 10 Hz) còn dưới 0,1.
    assert _steady_amplitude(40.0) < 0.1


def test_filter_is_causal_so_it_lags_a_step_rather_than_anticipating_it() -> None:
    step = [0.0] * 20 + [1.0] * 60
    out = butterworth_lowpass2(step, DT)
    assert max(out[:20]) == pytest.approx(0.0, abs=1e-12)  # không có phản ứng trước bước
    assert out[20] < 0.5 < out[40]


def test_cutoff_must_be_below_nyquist() -> None:
    with pytest.raises(ValueError, match="Nyquist"):
        butterworth_lowpass2([0.0, 1.0], 0.05, 10.0)


def test_filtered_jerk_of_ramp_equals_its_slope_and_ignores_a_noisy_spike_better_than_raw() -> None:
    ramp = [20.0 * i * DT for i in range(80)]  # dốc 20 m/s³ không bão hòa
    assert filtered_rms_jerk(ramp, 30, DT) == pytest.approx(20.0, rel=0.05)
    noisy = list(ramp)
    noisy[40] += 3.0
    raw_rms = math.sqrt(sum(((b - a) / DT) ** 2 for a, b in zip(noisy[29:], noisy[30:])) / len(noisy[30:]))
    # Gai 3 m/s² một mẫu: số thô tăng hơn 3 lần so với dốc sạch, số đã lọc tăng dưới 20 %.
    assert raw_rms > 3 * 20.0
    assert filtered_rms_jerk(noisy, 30, DT) < 1.2 * 20.0


def test_no_braking_frames_gives_none() -> None:
    assert filtered_rms_jerk([0.0] * 10, 10, DT) is None
    assert filtered_rms_jerk([], 0, DT) is None
