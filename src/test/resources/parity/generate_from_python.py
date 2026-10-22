"""Sinh fixture parity cho bản port Java của lõi mô phỏng (ADR-042) từ lõi Python.

Chạy từ gốc repo, TRƯỚC khi xóa lõi Python (mốc M5), bằng commit chứa `worker/vehicsim_core`:

    python src/test/resources/parity/generate_from_python.py

Sinh ba file cạnh script này:
  rng.json              chuỗi `random.Random(seed)` (random() và gauss) cho nhiều seed, gồm BIGINT lớn và âm
  round.json            `round(x, n)` của Python với ca hòa nhị phân và ca thường
  format.json           `f"{x:.nf}"` và `f"{x:g}"` (chữ trong evaluation/bundle), gồm ca hòa và số âm nhỏ
  bundle.json           `read_spec` / `make_bundle` / `result_document`: tài liệu hợp lệ và không hợp lệ kèm đúng thông báo lỗi
  filters.json          `butterworth_lowpass2` và `filtered_rms_jerk` trên nhiều chuỗi và bước thời gian
  xosc.json             `export_xosc` (XML từng byte), `read_xosc`, `read_profile` trên các spec hợp lệ và các file .xosc lỗi
  libm.json             `math.hypot` (nhiều cặp) và `math.tan` cho bộ lọc: Java và CPython có thể lệch 1 ulp
  kinematic.json.gz     kết quả bộ động học + luật chấm đầy đủ cho các ca phủ mọi lý do kết thúc

Fixture là sự thật tham chiếu của Java; không sửa tay. Nếu lõi Python đổi, sinh lại và ghi rõ trong exec plan.
"""

from __future__ import annotations

import gzip
import itertools
import json
import random
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / "worker"))

from vehicsim_core.evaluation import evaluate, to_document  # noqa: E402
from vehicsim_core.simulator import AebParams, PedestrianCrossingCase, VehicleSpec, simulate  # noqa: E402

SEEDS = [0, 1, 7, 42, 48846, 2**31 - 1, 2**31, 2**32 - 1, 2**32, 2**32 + 5, 2**40 + 123, 2**63 - 1, -1, -3, -48846, -(2**40)]
GAUSS_SIGMAS = [0.05, 0.05, 0.1, 0.16, 0.05, 0.06, 0.14, 0.05]


def rng_fixture() -> list[dict]:
    out = []
    for seed in SEEDS:
        r = random.Random(seed)
        ops, values = [], []
        for i in range(60):
            if i % 7 == 3:  # random() xen kẽ để kiểm đồng bộ bộ đệm gauss
                ops.append("r")
                values.append(r.random())
            else:
                sigma = GAUSS_SIGMAS[i % len(GAUSS_SIGMAS)]
                ops.append(f"g{sigma!r}")
                values.append(r.gauss(0.0, sigma))
        out.append({"seed": seed, "ops": ops, "values": values})
    return out


def round_fixture() -> list[dict]:
    rng = random.Random(20261021)
    values = [0.125, 0.375, 2.675, 1.005, 0.0005, 0.0015, 0.0025, 1.0005, 10.0005, 0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5, 0.05, 0.15, 0.25, 0.35,
              2.0004999999999997, 12.3455, 12.3445, 9.9995, 99.9995, 0.0, -0.0, 1e-9, 1234567.0005, 3.0 * 0.1, 0.1 + 0.2, 1 / 3, 2 / 3, 20.0 / 3.0]
    values += [rng.uniform(-50, 200) for _ in range(300)]
    values += [round(rng.uniform(0, 100), 4) + 0.0005 for _ in range(300)]  # sát ca hòa thập phân
    values += [k / 8 for k in range(-40, 400)]  # hòa nhị phân chính xác
    out = []
    for x in values:
        for n in (1, 2, 3):
            out.append({"x": repr(x), "n": n, "expected": repr(round(x, n))})
    for x in (0.5, 1.5, 2.5, 3.5, 4.5, -0.5, -1.5, 0.4999999999999999, 2.4999999999999996, 100.0 / 20.0, 0.05 / 0.01, 0.1 / 0.05, 0.05 / 0.05, 0.25 / 0.05):
        out.append({"x": repr(x), "n": 0, "expected": repr(round(x))})
    return out


def format_fixture() -> list[dict]:
    rng = random.Random(7)
    values = [0.0, -0.0, -0.04, -0.05, -0.06, 0.05, 0.15, 0.25, 0.35, 0.45, 0.125, 0.375, 2.675, 1.5, 2.5, 0.5, 9.95, 99.95, 0.995, 130.0, 10.0, 0.1, 1e-5, 123456.0,
              1234567.0, 0.0001, 0.00001234, 1e16, 3.14159265, 12.0, 8.0, 4.6, 0.7, 1 / 3]
    values += [rng.uniform(-5, 100) for _ in range(400)] + [k / 16 for k in range(-20, 200)] + [rng.uniform(0, 1) for _ in range(100)]
    out = []
    for x in values:
        for spec in (".0f", ".1f", ".2f", "g"):
            out.append({"x": repr(x), "spec": spec, "expected": format(x, spec)})
    return out


def libm_fixture() -> dict:
    import math

    rng = random.Random(99)
    pairs = [(rng.uniform(-10, 90), rng.uniform(-6, 6)) for _ in range(3000)] + [(rng.uniform(0, 1e-3), rng.uniform(0, 1e-3)) for _ in range(200)]
    pairs += [(3.0, 4.0), (0.0, 0.0), (5.0, 0.0), (0.0, 7.25), (1e154, 1e154), (1e-160, 1e-160)]
    taus = [{"x": repr(math.pi * 10.0 * dt), "expected": repr(math.tan(math.pi * 10.0 * dt))} for dt in (0.01, 0.05, 0.02, 0.1)]
    return {"hypot": [{"a": repr(a), "b": repr(b), "expected": repr(math.hypot(a, b))} for a, b in pairs], "tan": taus,
            "pi": repr(math.pi)}


def bundle_fixture() -> list[dict]:
    from vehicsim_core.bundle import BundleError, make_bundle, read_spec, result_document

    base = {"ego_speed_kmh": 50, "trigger_distance_m": 20, "pedestrian_speed_mps": 4}
    full = make_bundle(case=PedestrianCrossingCase(50, 22, 3.5, True, "RAIN", "NIGHT", 0.6), params=AebParams(2.0, 0.1, 7.0, 15.0), vehicle=VehicleSpec(4.5, 1.9, 9.0),
                       seed=48846, aeb_label="v2", vehicle_name="VF8", source={"run_id": 5})
    carla = {"blueprint": "vehicle.audi.etron", "physics": {"mass": 2100.0, "drag_coefficient": 0.3, "center_of_mass": {"x": 0.0, "y": 0.0, "z": -0.3},
             "wheels": {"tire_friction": 3.0, "max_brake_torque": 1500}}, "dimensions": {"height_m": 1.6, "wheelbase_m": 2.9}}
    docs: list[tuple[object, dict]] = [
        (base, {}), ({**base, "seed": 12}, {}), (full, {}), ({"ir": dict(base)}, {}), ({"variant": dict(base), "aeb": {"label": "x", "params": {"TTC_THRESHOLD": 2.0}}}, {}),
        ({**full, "vehicle": {**full["vehicle"], "carla": carla}}, {}),
        ({**base, "ego_speed_kmh": 9.99}, {}), ({**base, "ego_speed_kmh": 130.5}, {}), ({**base, "trigger_distance_m": 4.9}, {}), ({**base, "pedestrian_speed_mps": 8.0}, {}),
        ({**base, "ego_speed_kmh": 10}, {}), ({**base, "ego_speed_kmh": True}, {}), ({**base, "ego_speed_kmh": "50"}, {}), ({"trigger_distance_m": 20}, {}),
        ({**base, "weather": "SNOW"}, {}), ({**base, "time_of_day": "MIDNIGHT"}, {}), ({**base, "stops_at_curb": "yes"}, {}), ({**base, "friction": 1.3}, {}),
        ({**base, "friction": 0.05}, {}), ({**base, "friction": 0.8, "weather": "FOG", "time_of_day": "DUSK"}, {}),
        ({**base, "aeb": "x"}, {}), ({**base, "aeb": {"params": {"TTC_THRESHOLD": "a"}}}, {}), ({**base, "aeb": {"TTC_THRESHOLD": 2.5, "JERK_LIMIT": 50, "FOO": 1}}, {}),
        ({**base, "aeb": {"aeb": {"label": "inner", "params": {"max_deceleration": 6}}}}, {}), ({**base, "aeb": {"label": "L", "params": {}}}, {}),
        ({**base, "vehicle": "car"}, {}), ({**base, "vehicle": {"length_m": -1, "width_m": 0, "name": "N"}}, {}), ({**base, "vehicle": {"length_m": 5.0, "width_m": "x"}}, {}),
        ({**base, "vehicle": {"carla": {"blueprint": "walker.x"}}}, {}), ({**base, "vehicle": {"carla": {"blueprint": "vehicle.tesla.model3", "bogus": 1}}}, {}),
        ({**base, "vehicle": {"carla": {"physics": {"mass": -5, "foo": 1, "center_of_mass": {"x": 1}}}}}, {}),
        ({**base, "vehicle": {"carla": {"physics": {"wheels": [{"tire_friction": 3}, {"radius": -1, "zzz": 2}]}}}}, {}),
        ({**base, "vehicle": {"carla": {"physics": {"wheels": []}}}}, {}), ({**base, "vehicle": {"carla": {"dimensions": {"height_m": 0, "depth": 1}}}}, {}),
        ({**base, "vehicle": {"carla": "x"}}, {}), ({**base, "seed": True}, {}), ({**base, "seed": 1.5}, {}), ({**base, "seed": "7"}, {}), ({**base, "seed": -9}, {}),
        ({**base, "seed": 2**62}, {}), ({**base, "format": "vehicsim.variant/v2"}, {}), ({**base, "format": "vehicsim.variant/v1"}, {}), ([1, 2], {}), ("x", {}),
        ({"ego_speed_kmh": None, "trigger_distance_m": 20}, {}), (base, {"seed": 99}), (base, {"aeb": {"TTC_THRESHOLD": 3.0}}), (full, {"seed": 5, "aeb": {"label": "o", "params": {"BRAKE_BUILDUP_RATE": 9}}}),
        ({**base, "ego_speed_kmh": 1e400 if False else 50.123456789}, {}), ({**base, "weather": None, "time_of_day": ""}, {}),
    ]
    out = []
    for doc, kwargs in docs:
        entry: dict = {"doc": doc, "seed_override": kwargs.get("seed"), "aeb_override": kwargs.get("aeb")}
        try:
            spec = read_spec(doc, **kwargs)
            entry["ok"] = {"case": spec.case.__dict__, "params": spec.params.as_codes(), "vehicle": spec.vehicle.__dict__, "seed": spec.seed,
                           "aeb_label": spec.aeb_label, "vehicle_name": spec.vehicle_name, "source": spec.source, "vehicle_carla": spec.vehicle_carla}
            outcome = simulate(spec.case, spec.params, spec.seed, spec.vehicle)
            entry["result"] = result_document(spec, outcome, simulator="vehicsim-kinematic-1.0", evaluation=to_document(evaluate(outcome, spec.params)))
            entry["make_bundle"] = make_bundle(case=spec.case, params=spec.params, vehicle=spec.vehicle, seed=spec.seed, aeb_label=spec.aeb_label,
                                               vehicle_name=spec.vehicle_name, source=spec.source, vehicle_carla=spec.vehicle_carla)
        except BundleError as exc:
            entry["error"] = str(exc)
        out.append(entry)
    assert any("error" in e for e in out) and any("ok" in e for e in out)
    return out


def filters_fixture() -> list[dict]:
    from vehicsim_core.filters import butterworth_lowpass2, filtered_rms_jerk

    rng = random.Random(31337)
    out = []
    # 10 Hz là tần số Nyquist của bước 0,05 s nên lõi từ chối; ở bước đó thử cutoff 5 Hz.
    for dt, n in ((0.01, 400), (0.05, 120), (0.02, 200), (0.01, 3), (0.05, 1)):
        cutoff = 5.0 if dt >= 0.05 else 10.0
        for kind in ("noise", "step", "ramp", "const"):
            if kind == "noise":
                xs = [round(rng.gauss(-3.0, 2.0), 3) for _ in range(n)]
            elif kind == "step":
                xs = [0.0 if i < n // 3 else -8.0 for i in range(n)]
            elif kind == "ramp":
                xs = [-min(8.0, 20.0 * i * dt) for i in range(n)]
            else:
                xs = [-4.25] * n
            starts = sorted({0, n // 4, n - 1, n, -1})
            out.append({"dt": dt, "cutoff": cutoff, "x": xs, "y": butterworth_lowpass2(xs, dt, cutoff),
                        "rms": {str(st): filtered_rms_jerk(xs, st, dt, cutoff) for st in starts}})
    return out


def xosc_fixture() -> list[dict]:
    from openscenario_export import export_xosc, read_profile, read_xosc
    from vehicsim_core.bundle import BundleError, read_spec

    import tempfile

    out = []
    tmp = Path(tempfile.mkdtemp(prefix="vsos-xosc-"))

    def record(name: str, xml: str, **extra) -> None:
        path = tmp / f"{len(out)}.xosc"
        path.write_text(xml, encoding="utf-8")
        entry: dict = {"name": name, "xml": xml, **extra}
        try:
            spec = read_xosc(path)
            entry["spec"] = {"case": spec.case.__dict__, "params": spec.params.as_codes(), "vehicle": spec.vehicle.__dict__, "seed": spec.seed,
                             "aeb_label": spec.aeb_label, "vehicle_name": spec.vehicle_name, "source": spec.source, "vehicle_carla": spec.vehicle_carla}
        except BundleError as exc:
            entry["spec_error"] = str(exc)
        try:
            entry["profile"] = list(read_profile(path))
        except BundleError as exc:
            entry["profile_error"] = str(exc)
        out.append(entry)

    for i, entry in enumerate(e for e in bundle_fixture() if "ok" in e):
        spec = read_spec(entry["doc"], aeb=entry["aeb_override"], seed=entry["seed_override"])
        record(f"export {i}", export_xosc(spec), bundle=entry["doc"], seed_override=entry["seed_override"], aeb_override=entry["aeb_override"])
    base = export_xosc(read_spec({"ego_speed_kmh": 50, "trigger_distance_m": 20, "pedestrian_speed_mps": 4, "source": {"run_id": 3, "scenario_id": 1,
                                  "scenario_version_id": 2, "aeb_version_id": 4, "carla_vehicle_model_id": 5, "simulator": "vehicsim-kinematic-1.0"}}))
    record("v2 legacy", base.replace("vehicsim.xosc/v3", "vehicsim.xosc/v2"))
    record("v1 old", base.replace("vehicsim.xosc/v3", "vehicsim.xosc/v1"))
    record("no format", base.replace('name="vs_format"', 'name="vs_formatx"'))
    record("foreign format", base.replace("vehicsim.xosc/v3", "other/v9"))
    record("missing friction", base.replace('name="vs_friction"', 'name="vs_frictionx"'))
    record("bad number", base.replace('name="vs_ego_speed_kmh" parameterType="string" value="50.0"', 'name="vs_ego_speed_kmh" parameterType="string" value="fast"'))
    record("bad seed", base.replace('name="vs_seed" parameterType="string" value="0"', 'name="vs_seed" parameterType="string" value="x"'))
    record("step not multiple", base.replace('name="vs_perception_period_s" parameterType="string" value="0.05"', 'name="vs_perception_period_s" parameterType="string" value="0.035"'))
    record("step zero", base.replace('name="vs_fixed_delta_seconds" parameterType="string" value="0.01"', 'name="vs_fixed_delta_seconds" parameterType="string" value="0.0"'))
    record("missing step", base.replace('name="vs_fixed_delta_seconds"', 'name="vs_fixed_delta_secondsx"'))
    record("out of bounds", base.replace('value="50.0"', 'value="500.0"', 1))
    assert any("spec_error" in e for e in out) and any("profile_error" in e for e in out) and any("spec" in e for e in out)
    return out


def kinematic_cases() -> list[dict]:
    cases = []
    default, tuned = AebParams(), AebParams(ttc_threshold=2.5, brake_activation_delay=0.05, max_deceleration=6.0, brake_buildup_rate=12.0)
    # Lưới có hệ thống.
    for speed, trig, ped, curb, weather, tod, seed in itertools.product(
        (30, 50, 70), (12, 22, 35), (2.0, 4.0), (False, True), ("CLEAR", "RAIN", "FOG"), ("DAY", "NIGHT"), (1, 48846)
    ):
        if (speed + trig + int(ped) + int(curb) + len(weather) + len(tod) + seed) % 5 == 0:  # lấy một phần lưới, tất định
            cases.append((PedestrianCrossingCase(speed, trig, ped, curb, weather, tod), default, seed, VehicleSpec()))
    # Ngẫu nhiên có hạt giống cố định, quét cả biên tham số.
    rng = random.Random(424242)
    weathers, times = ["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"], ["DAY", "DUSK", "NIGHT"]
    for _ in range(150):
        case = PedestrianCrossingCase(
            rng.choice([20, 30, 40, 50, 60, 70, 80, 90]) + rng.choice([0, 0, 0.5, 2.7]),
            round(rng.uniform(8, 40), 1),
            round(rng.uniform(0.8, 6.0), 2),
            rng.random() < 0.3,
            rng.choice(weathers),
            rng.choice(times),
            None if rng.random() < 0.6 else round(rng.uniform(0.4, 1.0), 2),
        )
        params = AebParams(round(rng.uniform(0.5, 4.0), 2), round(rng.uniform(0.0, 0.5), 3), round(rng.uniform(3.0, 10.0), 2), round(rng.uniform(5.0, 20.0), 1))
        vehicle = VehicleSpec(round(rng.uniform(3.5, 6.5), 2), round(rng.uniform(1.6, 2.2), 2), round(rng.uniform(6.0, 10.0), 2)) if rng.random() < 0.3 else VehicleSpec()
        cases.append((case, params, rng.choice(SEEDS[:12] + [rng.getrandbits(62) for _ in range(5)]), vehicle))
    cases.append((PedestrianCrossingCase(50, 22, 3, False, "CLEAR", "DAY"), tuned, 48846, VehicleSpec()))
    # Xe quá chậm để tới vạch trong 12 s: phủ lý do kết thúc TIMEOUT.
    for speed, trig, ped in ((5, 35, 1.0), (8, 40, 0.8), (3, 20, 2.0)):
        cases.append((PedestrianCrossingCase(speed, trig, ped, False, "CLEAR", "DAY"), default, 1, VehicleSpec()))
    out = []
    for case, params, seed, vehicle in cases:
        outcome = simulate(case, params, seed, vehicle)
        out.append({
            "case": {**case.__dict__}, "params": params.as_codes(), "seed": seed,
            "vehicle": {**vehicle.__dict__}, "outcome": outcome.as_dict(), "evaluation": to_document(evaluate(outcome, params)),
        })
    return out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252
    (HERE / "rng.json").write_text(json.dumps(rng_fixture()), encoding="utf-8")
    (HERE / "round.json").write_text(json.dumps(round_fixture()), encoding="utf-8")
    (HERE / "format.json").write_text(json.dumps(format_fixture()), encoding="utf-8")
    (HERE / "bundle.json").write_text(json.dumps(bundle_fixture()), encoding="utf-8")
    (HERE / "filters.json").write_text(json.dumps(filters_fixture()), encoding="utf-8")
    (HERE / "xosc.json").write_text(json.dumps(xosc_fixture()), encoding="utf-8")
    (HERE / "libm.json").write_text(json.dumps(libm_fixture()), encoding="utf-8")
    cases = kinematic_cases()
    # mtime=0 để file gz giống nhau giữa các lần sinh.
    with gzip.GzipFile(HERE / "kinematic.json.gz", "wb", mtime=0) as fh:
        fh.write(json.dumps(cases, sort_keys=True).encode("utf-8"))
    reasons = Counter(c["outcome"]["end_reason"] for c in cases)
    print(f"{len(cases)} ca động học; lý do kết thúc: {dict(reasons)}")
    assert {"COLLISION", "EGO_STOPPED", "TARGET_CLEARED", "TIMEOUT"} <= set(reasons), "fixture phải phủ các lý do kết thúc chính"


if __name__ == "__main__":
    main()
