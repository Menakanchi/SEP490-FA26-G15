from __future__ import annotations

from dataclasses import dataclass

from src.models.schemas import ManeuverType, RoadType


@dataclass(frozen=True)
class EgoSpawn:
    """OpenSCENARIO coordinates, already converted to its right-handed system."""

    x: float
    y: float
    z: float
    h: float
    lane_id: int


@dataclass(frozen=True)
class ScenarioTemplate:
    map_name: str
    road_type: RoadType
    supported_maneuvers: frozenset[ManeuverType]
    ego_spawn: EgoSpawn
    s_offset_reach_m: tuple[float, float]
    """Đoạn đường dùng được quanh anchor, tính bằng mét: (lùi tối đa, tiến tối đa).

    **Không đối xứng, và không phải giới hạn của schema.** ``Position.s_offset_m``
    cho phép ±200 vì đó là biên của kiểu dữ liệu; còn đây là biên của *anchor này
    trên map này*, đo bằng cách đi dọc làn và xem lane_id đổi ở đâu.

    ScenarioRunner giải ``RelativeLanePosition`` bằng số học lane_id so với ego.
    Ra khỏi đoạn mà làn giữ nguyên định danh thì lane đích không tồn tại, và
    ScenarioRunner chết bằng ``Error: Unable to add actors`` — một thông báo
    không nhắc gì tới khoảng cách.
    """


TOWN04_ROAD_41_MANEUVERS = frozenset(
    {
        ManeuverType.CUT_IN,
        ManeuverType.SUDDEN_BRAKE,
        ManeuverType.RUN_RED_LIGHT,
        ManeuverType.JAYWALK,
        ManeuverType.WRONG_WAY,
        ManeuverType.LANE_DRIFT,
        ManeuverType.STOP_IN_LANE,
    }
)

# ADR-012 smoke-tested anchor: Town04 road=41, lane=-3.  Semantic schemas do
# not know this CARLA/map detail; it stays on the converter side of the boundary.
_TOWN04_ANCHOR = EgoSpawn(
    x=-510.7297,
    y=-177.5400,
    z=0.3000,
    h=-1.577036,
    lane_id=-3,
)

# Đo trên CARLA ngày 22/08 bằng cách đi dọc làn từ anchor:
#
#   tiến  +40 m: vẫn road 23 lane -3      +50 m: sang road 1450 lane -1  <-- đổi
#   lùi  -120 m: vẫn road 23 lane -3      (ổn định tới ít nhất 120 m)
#
# Khớp với dữ liệu chạy thật: mọi kịch bản có |s_offset| <= 35 m đều chạy được,
# còn hai kịch bản đặt actor ở +120 m đều chết ở bước spawn.
_TOWN04_REACH_M = (-120.0, 40.0)

TEMPLATE_CATALOG: dict[RoadType, ScenarioTemplate] = {
    RoadType.HIGHWAY: ScenarioTemplate(
        map_name="Town04",
        road_type=RoadType.HIGHWAY,
        supported_maneuvers=TOWN04_ROAD_41_MANEUVERS,
        ego_spawn=_TOWN04_ANCHOR,
        s_offset_reach_m=_TOWN04_REACH_M,
    ),
    RoadType.URBAN_STRAIGHT: ScenarioTemplate(
        map_name="Town04",
        road_type=RoadType.URBAN_STRAIGHT,
        supported_maneuvers=TOWN04_ROAD_41_MANEUVERS,
        ego_spawn=_TOWN04_ANCHOR,
        s_offset_reach_m=_TOWN04_REACH_M,
    ),
}


def get_template(road_type: RoadType) -> ScenarioTemplate | None:
    return TEMPLATE_CATALOG.get(road_type)
