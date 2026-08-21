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

TEMPLATE_CATALOG: dict[RoadType, ScenarioTemplate] = {
    RoadType.HIGHWAY: ScenarioTemplate(
        map_name="Town04",
        road_type=RoadType.HIGHWAY,
        supported_maneuvers=TOWN04_ROAD_41_MANEUVERS,
        ego_spawn=_TOWN04_ANCHOR,
    ),
    RoadType.URBAN_STRAIGHT: ScenarioTemplate(
        map_name="Town04",
        road_type=RoadType.URBAN_STRAIGHT,
        supported_maneuvers=TOWN04_ROAD_41_MANEUVERS,
        ego_spawn=_TOWN04_ANCHOR,
    ),
}


def get_template(road_type: RoadType) -> ScenarioTemplate | None:
    return TEMPLATE_CATALOG.get(road_type)
