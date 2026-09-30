"""Họ kịch bản "người đi bộ băng qua đường" (FE-07, bản tối thiểu cho vòng MVP).

Một họ = một dòng ``scenarios`` + một bản gốc (``scenario_versions`` source MANUAL,
giữ không gian tham số trong ``scenario_ir``) + các biến thể dạng lưới (source
GENERATED, ``parent_version_id`` = bản gốc). Mỗi biến thể có đủ
``scenario_objects`` / ``scenario_environments`` / ``scenario_parameters``.

Chưa có LLM ở đây: form nhập tham số tạo ra cùng IR mà NL → IR (FE-06) sau này
sinh ra, nên phần đó cắm vào mà không đổi bảng.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field

from sqlalchemy import func, insert, select

from src.services.vehicsim import tables as t
from src.services.vehicsim.common import InvalidRequestError, NotFoundError, engine, now
from src.services.vehicsim.simulator import WEATHER_FRICTION

MOTIF = "pedestrian_crossing"
MOTIF_NAME = "Pedestrian Crossing"
DEFAULT_MAP = "Town10HD"  # bản đồ CARLA dự kiến khi runner thật thay simulator
MAX_VARIANTS = 300  # trần mỗi lần sinh — ngân sách chạy 50–100+ run của kế hoạch rủi ro

WEATHERS = ("CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG")
TIMES = ("DAY", "DUSK", "NIGHT")


@dataclass
class FamilySpec:
    """Không gian tham số. Mỗi trục là danh sách giá trị; biến thể = tích Descartes."""

    name: str = MOTIF_NAME
    description: str = ""
    ego_speeds_kmh: list[float] = field(default_factory=lambda: [40, 50, 60, 70])
    trigger_distances_m: list[float] = field(default_factory=lambda: [20, 30, 40])
    pedestrian_speeds_mps: list[float] = field(default_factory=lambda: [1.5, 3.0])
    stops_at_curb: list[bool] = field(default_factory=lambda: [False, True])
    weathers: list[str] = field(default_factory=lambda: ["CLEAR"])
    times_of_day: list[str] = field(default_factory=lambda: ["DAY"])

    def validate(self) -> None:
        axes = {
            "ego_speeds_kmh": (self.ego_speeds_kmh, 10, 130),
            "trigger_distances_m": (self.trigger_distances_m, 5, 80),
            "pedestrian_speeds_mps": (self.pedestrian_speeds_mps, 0.5, 8),
        }
        for name, (values, lo, hi) in axes.items():
            if not values:
                raise InvalidRequestError(f"{name} cần ít nhất một giá trị")
            bad = [v for v in values if not lo <= v <= hi]
            if bad:
                raise InvalidRequestError(f"{name} ngoài khoảng [{lo}, {hi}]: {bad}")
        if not self.stops_at_curb:
            raise InvalidRequestError("stops_at_curb cần ít nhất một giá trị")
        if not self.weathers or any(w not in WEATHERS for w in self.weathers):
            raise InvalidRequestError(f"weathers phải thuộc {WEATHERS}")
        if not self.times_of_day or any(x not in TIMES for x in self.times_of_day):
            raise InvalidRequestError(f"times_of_day phải thuộc {TIMES}")
        if self.variant_count() > MAX_VARIANTS:
            raise InvalidRequestError(f"{self.variant_count()} biến thể vượt trần {MAX_VARIANTS}")

    def variant_count(self) -> int:
        return (
            len(set(self.ego_speeds_kmh))
            * len(set(self.trigger_distances_m))
            * len(set(self.pedestrian_speeds_mps))
            * len(set(self.stops_at_curb))
            * len(set(self.weathers))
            * len(set(self.times_of_day))
        )

    def grid(self) -> list[dict]:
        return [
            {
                "motif": MOTIF,
                "ego_speed_kmh": float(speed),
                "trigger_distance_m": float(dist),
                "pedestrian_speed_mps": float(ped),
                "stops_at_curb": bool(stop),
                "weather": weather,
                "time_of_day": tod,
            }
            for speed, dist, ped, stop, weather, tod in itertools.product(
                sorted(set(self.ego_speeds_kmh)),
                sorted(set(self.trigger_distances_m)),
                sorted(set(self.pedestrian_speeds_mps)),
                sorted(set(self.stops_at_curb)),
                list(dict.fromkeys(self.weathers)),
                list(dict.fromkeys(self.times_of_day)),
            )
        ]

    def parameter_space(self) -> dict:
        return {
            "ego_speed_kmh": sorted(set(self.ego_speeds_kmh)),
            "trigger_distance_m": sorted(set(self.trigger_distances_m)),
            "pedestrian_speed_mps": sorted(set(self.pedestrian_speeds_mps)),
            "stops_at_curb": sorted(set(self.stops_at_curb)),
            "weather": list(dict.fromkeys(self.weathers)),
            "time_of_day": list(dict.fromkeys(self.times_of_day)),
        }


def _next_code(conn, project_id: int) -> str:
    taken = {r.code for r in conn.execute(select(t.scenarios.c.code).where(t.scenarios.c.project_id == project_id))}
    if "PX" not in taken:
        return "PX"
    n = 2
    while f"PX{n}" in taken:
        n += 1
    return f"PX{n}"


def create_family(project_id: int, spec: FamilySpec, user_id: int, origin: dict | None = None) -> dict:
    """Tạo họ + bản gốc + toàn bộ biến thể trong **một** transaction.

    ``origin`` (từ bước 1 "Sinh từ mô tả"): ``natural_language_input``,
    ``llm_model`` và ``described`` (IR đã trích + nguồn gốc từng trường). Có nó thì
    bản gốc là ``NATURAL_LANGUAGE`` để truy vết được câu mô tả ban đầu.
    """
    spec.validate()
    nl_text = ((origin or {}).get("natural_language_input") or "").strip()
    ts = now()
    with engine().begin() as conn:
        if conn.execute(select(t.projects.c.id).where(t.projects.c.id == project_id)).first() is None:
            raise NotFoundError("project")
        code = _next_code(conn, project_id)
        scenario_id = conn.execute(
            insert(t.scenarios).values(
                project_id=project_id,
                code=code,
                name=spec.name.strip() or MOTIF_NAME,
                description=spec.description or None,
                category="PEDESTRIAN",
                created_by=user_id,
                created_at=ts,
                updated_at=ts,
            )
        ).inserted_primary_key[0]
        base_id = conn.execute(
            insert(t.scenario_versions).values(
                scenario_id=scenario_id,
                version_number=1,
                source="NATURAL_LANGUAGE" if nl_text else "MANUAL",
                natural_language_input=nl_text or None,
                llm_model=((origin or {}).get("llm_model") or None) if nl_text else None,
                scenario_ir={
                    "motif": MOTIF,
                    "parameter_space": spec.parameter_space(),
                    **(
                        {"described": origin.get("described")} if nl_text and origin and origin.get("described") else {}
                    ),
                },
                validation_status="VALID",
                opendrive_map=DEFAULT_MAP,
                change_note="Family from natural-language description"
                if nl_text
                else "Family definition (parameter space)",
                created_by=user_id,
                created_at=ts,
            )
        ).inserted_primary_key[0]

        for index, ir in enumerate(spec.grid(), start=2):
            version_id = conn.execute(
                insert(t.scenario_versions).values(
                    scenario_id=scenario_id,
                    version_number=index,
                    source="GENERATED",
                    parent_version_id=base_id,
                    scenario_ir=ir,
                    validation_status="VALID",
                    opendrive_map=DEFAULT_MAP,
                    created_by=user_id,
                    created_at=ts,
                )
            ).inserted_primary_key[0]
            ego_id = conn.execute(
                insert(t.scenario_objects).values(
                    scenario_version_id=version_id,
                    name="ego",
                    role="EGO",
                    object_type="EGO_VEHICLE",
                    carla_blueprint="vehicle.tesla.model3",
                )
            ).inserted_primary_key[0]
            ped_id = conn.execute(
                insert(t.scenario_objects).values(
                    scenario_version_id=version_id,
                    name="pedestrian_1",
                    role="TARGET",
                    object_type="PEDESTRIAN",
                    carla_blueprint="walker.pedestrian.0001",
                )
            ).inserted_primary_key[0]
            friction = WEATHER_FRICTION.get(ir["weather"], 1.0)
            conn.execute(
                insert(t.scenario_environments).values(
                    scenario_version_id=version_id,
                    weather=ir["weather"],
                    time_of_day=ir["time_of_day"],
                    road_condition="WET" if friction < 1.0 else "DRY",
                    friction=friction,
                )
            )
            conn.execute(
                insert(t.scenario_parameters),
                [
                    {
                        "scenario_version_id": version_id,
                        "scenario_object_id": ego_id,
                        "param_name": "speed_kmh",
                        "value": ir["ego_speed_kmh"],
                        "unit": "km/h",
                    },
                    {
                        "scenario_version_id": version_id,
                        "scenario_object_id": ped_id,
                        "param_name": "trigger_distance_m",
                        "value": ir["trigger_distance_m"],
                        "unit": "m",
                    },
                    {
                        "scenario_version_id": version_id,
                        "scenario_object_id": ped_id,
                        "param_name": "speed_mps",
                        "value": ir["pedestrian_speed_mps"],
                        "unit": "m/s",
                    },
                    {
                        "scenario_version_id": version_id,
                        "scenario_object_id": ped_id,
                        "param_name": "stops_at_curb",
                        "value": 1 if ir["stops_at_curb"] else 0,
                        "unit": "bool",
                    },
                ],
            )
    return {"scenario_id": scenario_id, "code": code, "base_version_id": base_id, "variants": spec.variant_count()}


def latest_base_version_id(conn, scenario_id: int) -> int:
    """Bản gốc mới nhất của họ — bộ biến thể đang dùng là con của nó."""
    base = conn.execute(
        select(func.max(t.scenario_versions.c.id)).where(
            t.scenario_versions.c.scenario_id == scenario_id,
            t.scenario_versions.c.source != "GENERATED",
        )
    ).scalar()
    if base is None:
        raise NotFoundError("scenario base version")
    return int(base)


def variants_of(conn, base_version_id: int) -> list:
    return conn.execute(
        select(t.scenario_versions)
        .where(t.scenario_versions.c.parent_version_id == base_version_id)
        .order_by(t.scenario_versions.c.version_number)
    ).all()
