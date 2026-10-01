"""Hợp đồng JSON giữa web và bộ mô phỏng: một biến thể vào, một kết quả ra.

Web xuất một **variant bundle** (``vehicsim.variant/v1``) cho mỗi lần chạy: biến thể
kịch bản + bộ tham số AEB + thông số xe + seed. Cả hai bộ mô phỏng đọc đúng file
đó và ghi ra **result** (``vehicsim.result/v1``) cùng một hình dạng:

    python worker/kinematic_sim.py run_42.json            # động học, máy nào cũng chạy
    python worker/run_variant.py   run_42.json --video    # CARLA, cần GPU + server

Ngoài bundle đầy đủ, ``read_spec`` còn nhận Scenario IR trần (màn "Sinh từ mô tả")
— khi đó AEB là baseline v1.0 mặc định, xe là VF8 mặc định, seed = 0 trừ khi truyền.

Chỉ dùng thư viện chuẩn và cú pháp Python 3.10 (venv CARLA import file này).
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass, field

from src.services.vehicsim.aeb_stack import AebParams
from src.services.vehicsim.simulator import PedestrianCrossingCase, SimulationOutcome, VehicleSpec

VARIANT_FORMAT = "vehicsim.variant/v1"
RESULT_FORMAT = "vehicsim.result/v1"

# Danh tính bộ mô phỏng, ghi vào ``simulation_runs.carla_version``. Regression chỉ
# ghép hai run cùng giá trị này — không bao giờ so kết quả động học với CARLA, hay
# CARLA 0.9.15 với 0.9.16.
KINEMATIC_SIMULATOR = "vehicsim-kinematic-1.0"


def carla_simulator(version: str) -> str:
    """``"0.9.16"`` hoặc ``"0.9.16-12-gabc"`` (``client.get_server_version()``) -> ``"carla-0.9.16"``."""
    match = re.match(r"\d+\.\d+\.\d+", version.strip())
    return f"carla-{match.group(0) if match else version.strip()}"[:30]


WEATHERS = ("CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG")
TIMES = ("DAY", "DUSK", "NIGHT")
# Khớp FamilySpec.validate — biến thể ngoài khoảng này không dựng được họ kịch bản.
IR_BOUNDS = {
    "ego_speed_kmh": (10.0, 130.0),
    "trigger_distance_m": (5.0, 80.0),
    "pedestrian_speed_mps": (0.5, 8.0),
}


class BundleError(ValueError):
    """File JSON không đọc được thành một lần chạy. Thông điệp liệt kê mọi lỗi."""


@dataclass(frozen=True)
class RunSpec:
    """Đủ để chạy một lần, ở bất kỳ bộ mô phỏng nào."""

    case: PedestrianCrossingCase
    params: AebParams
    vehicle: VehicleSpec
    seed: int
    aeb_label: str | None = None
    vehicle_name: str | None = None
    source: dict = field(default_factory=dict)


def make_bundle(
    *,
    case: PedestrianCrossingCase,
    params: AebParams,
    vehicle: VehicleSpec,
    seed: int,
    aeb_label: str | None = None,
    vehicle_name: str | None = None,
    source: dict | None = None,
) -> dict:
    return {
        "format": VARIANT_FORMAT,
        "variant": {
            "ego_speed_kmh": case.ego_speed_kmh,
            "trigger_distance_m": case.trigger_distance_m,
            "pedestrian_speed_mps": case.pedestrian_speed_mps,
            "stops_at_curb": case.stops_at_curb,
            "weather": case.weather,
            "time_of_day": case.time_of_day,
            "friction": case.friction,
        },
        "aeb": {"label": aeb_label, "params": params.as_codes()},
        "vehicle": {"name": vehicle_name, **asdict(vehicle)},
        "seed": int(seed),
        "source": source or {},
    }


def read_spec(doc: dict, *, aeb: dict | None = None, seed: int | None = None) -> RunSpec:
    """JSON -> ``RunSpec``. ``aeb``/``seed`` (nếu có) ghi đè giá trị trong file.

    Nhận ba dạng: bundle đầy đủ (có ``variant``), kết quả màn "Sinh từ mô tả"
    (có ``ir``), hoặc Scenario IR trần (có ``ego_speed_kmh`` ở ngoài cùng).
    """
    if not isinstance(doc, dict):
        raise BundleError("file JSON phải là một object")
    fmt = doc.get("format")
    if fmt is not None and fmt != VARIANT_FORMAT:
        raise BundleError(f"không đọc được định dạng {fmt!r} (cần {VARIANT_FORMAT})")
    if isinstance(doc.get("variant"), dict):
        variant = doc["variant"]
    elif isinstance(doc.get("ir"), dict):
        variant = doc["ir"]
    else:
        variant = doc

    errors: list[str] = []
    case = _read_case(variant, errors)
    aeb_doc = aeb if aeb is not None else doc.get("aeb")
    params, aeb_label = _read_aeb(aeb_doc, errors)
    vehicle, vehicle_name = _read_vehicle(doc.get("vehicle"), errors)
    run_seed = seed if seed is not None else doc.get("seed", 0)
    if isinstance(run_seed, bool) or not isinstance(run_seed, int):
        errors.append(f"seed phải là số nguyên, nhận {run_seed!r}")
    if errors:
        raise BundleError("; ".join(errors))
    return RunSpec(
        case=case,
        params=params,
        vehicle=vehicle,
        seed=int(run_seed),
        aeb_label=aeb_label,
        vehicle_name=vehicle_name,
        source=doc.get("source") or {},
    )


def _number(data: dict, key: str, errors: list[str], *, required: bool = True) -> float | None:
    value = data.get(key)
    if value is None:
        if required:
            errors.append(f"thiếu {key}")
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        errors.append(f"{key} phải là số, nhận {value!r}")
        return None
    return float(value)


def _read_case(variant: dict, errors: list[str]) -> PedestrianCrossingCase:
    values: dict = {}
    for key, (lo, hi) in IR_BOUNDS.items():
        value = _number(variant, key, errors)
        if value is not None and not lo <= value <= hi:
            errors.append(f"{key} = {value:g} ngoài khoảng [{lo:g}, {hi:g}]")
        values[key] = value if value is not None else lo
    stops = variant.get("stops_at_curb", False)
    if not isinstance(stops, bool):
        errors.append(f"stops_at_curb phải là true/false, nhận {stops!r}")
    weather = variant.get("weather") or "CLEAR"
    if weather not in WEATHERS:
        errors.append(f"weather phải thuộc {list(WEATHERS)}, nhận {weather!r}")
    time_of_day = variant.get("time_of_day") or "DAY"
    if time_of_day not in TIMES:
        errors.append(f"time_of_day phải thuộc {list(TIMES)}, nhận {time_of_day!r}")
    friction = _number(variant, "friction", errors, required=False)
    if friction is not None and not 0.1 <= friction <= 1.2:
        errors.append(f"friction = {friction:g} ngoài khoảng [0.1, 1.2]")
    return PedestrianCrossingCase(
        ego_speed_kmh=values["ego_speed_kmh"],
        trigger_distance_m=values["trigger_distance_m"],
        pedestrian_speed_mps=values["pedestrian_speed_mps"],
        stops_at_curb=bool(stops),
        weather=weather if weather in WEATHERS else "CLEAR",
        time_of_day=time_of_day if time_of_day in TIMES else "DAY",
        friction=friction,
    )


def _read_aeb(aeb_doc, errors: list[str]) -> tuple[AebParams, str | None]:
    """``{"label", "params": {...}}``, một bundle khác, hoặc dict phẳng ``{"TTC_THRESHOLD": 1.5}``."""
    if aeb_doc is None:
        return AebParams(), "v1.0 (mặc định)"
    if not isinstance(aeb_doc, dict):
        errors.append("aeb phải là một object")
        return AebParams(), None
    if isinstance(aeb_doc.get("aeb"), dict):  # truyền cả một bundle khác làm file AEB
        aeb_doc = aeb_doc["aeb"]
    label = aeb_doc.get("label")
    raw = aeb_doc.get("params") if isinstance(aeb_doc.get("params"), dict) else aeb_doc
    known = AebParams().as_codes()
    codes: dict[str, float] = {}
    for key, value in raw.items():
        if key in ("label", "params"):
            continue
        code = key.upper()
        if code not in known:
            errors.append(f"tham số AEB không tồn tại: {key}")
            continue
        number = _number(raw, key, errors)
        if number is not None:
            codes[code] = number
    return AebParams.from_codes(codes), label


def _read_vehicle(vehicle_doc, errors: list[str]) -> tuple[VehicleSpec, str | None]:
    if vehicle_doc is None:
        return VehicleSpec(), None
    if not isinstance(vehicle_doc, dict):
        errors.append("vehicle phải là một object")
        return VehicleSpec(), None
    default = VehicleSpec()
    dims = {}
    for key in ("length_m", "width_m", "max_brake_decel_mps2"):
        value = _number(vehicle_doc, key, errors, required=False)
        if value is not None and value <= 0:
            errors.append(f"vehicle.{key} phải dương")
        dims[key] = value if value is not None and value > 0 else getattr(default, key)
    return VehicleSpec(**dims), vehicle_doc.get("name")


def result_document(
    spec: RunSpec, outcome: SimulationOutcome, *, simulator: str, artifacts: dict | None = None
) -> dict:
    """``result.json`` mà mọi bộ mô phỏng ghi ra. Backend tự chấm lại từ ``outcome``."""
    return {
        "format": RESULT_FORMAT,
        "simulator": simulator,
        "seed": spec.seed,
        "source": spec.source,
        "outcome": outcome.as_dict(),
        "artifacts": artifacts or {},
    }


def read_result(doc: dict) -> tuple[str, SimulationOutcome, dict]:
    """``result.json`` -> (tên simulator, outcome, artifacts). Sai định dạng thì ``BundleError``."""
    if not isinstance(doc, dict) or doc.get("format") != RESULT_FORMAT:
        raise BundleError(f"result.json không đúng định dạng {RESULT_FORMAT}")
    outcome = doc.get("outcome")
    if not isinstance(outcome, dict) or not {"frames", "events", "metrics", "end_reason"} <= set(outcome):
        raise BundleError("result.json thiếu outcome.frames/events/metrics/end_reason")
    return str(doc.get("simulator") or "unknown"), SimulationOutcome.from_dict(outcome), doc.get("artifacts") or {}
