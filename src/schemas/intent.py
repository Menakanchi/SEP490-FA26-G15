"""Schema DTO cho parse_intent node."""

from __future__ import annotations
from src.models.schemas import Assumption, AssumptionSource, ODDCell, ParsedIntent
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ActorType(StrEnum):
    CAR = "car"
    MOTORCYCLE = "motorcycle"
    TRUCK = "truck"
    BUS = "bus"
    PEDESTRIAN = "pedestrian"
    UNKNOWN = "unknown"


class Maneuver(StrEnum):
    CUT_IN = "cut_in"
    SUDDEN_BRAKE = "sudden_brake"
    LANE_DEPARTURE = "lane_departure"
    OVERTAKE = "overtake"
    UNKNOWN = "unknown"


class RoadType(StrEnum):
    URBAN_STRAIGHT = "urban_straight"
    HIGHWAY = "highway"
    INTERSECTION = "intersection"
    UNKNOWN = "unknown"


class Weather(StrEnum):
    CLEAR = "clear"
    HEAVY_RAIN = "heavy_rain"
    FOG = "fog"
    UNKNOWN = "unknown"




class ODDQuery(BaseModel):
    """Schema ODDQuery cho Structured Output của parse_intent."""

    road_type: RoadType | str | None = Field(default=RoadType.UNKNOWN)
    weather: Weather | str | None = Field(default=Weather.UNKNOWN)
    actor_type: ActorType | str | None = Field(default=ActorType.UNKNOWN)
    maneuver: Maneuver | str | None = Field(default=Maneuver.UNKNOWN)
    inferred: list[str] = Field(default_factory=list)

    @field_validator("road_type", "weather", "actor_type", "maneuver", mode="before")
    @classmethod
    def _normalize_unspecified_to_none(cls, v: Any) -> Any:
        if isinstance(v, str):
            v_clean = v.strip().lower()
            if v_clean in (
                "không xác định",
                "khong xac dinh",
                "khong_xac_dinh",
                "unknown",
                "none",
                "n/a",
                "null",
                "",
            ):
                return "unknown"
        return v

    def missing_required_axes(self) -> list[str]:
        missing = []
        if not self.actor_type or str(self.actor_type) in ("unknown", "none"):
            missing.append("actor_type")
        if not self.maneuver or str(self.maneuver) in ("unknown", "none"):
            missing.append("maneuver")
        return missing

    def with_defaults(self) -> tuple[ODDCell, list[Assumption]]:
        rt = self.road_type if (self.road_type and str(self.road_type) not in ("unknown", "none")) else "urban_straight"
        wt = self.weather if (self.weather and str(self.weather) not in ("unknown", "none")) else "clear"
        at = self.actor_type if (self.actor_type and str(self.actor_type) not in ("unknown", "none")) else "motorcycle"
        mv = self.maneuver if (self.maneuver and str(self.maneuver) not in ("unknown", "none")) else "cut_in"

        rt_val = getattr(rt, "value", str(rt))
        wt_val = getattr(wt, "value", str(wt))
        at_val = getattr(at, "value", str(at))
        if at_val in ("bus", "xe_bus", "xe_khach"):
            at_val = "car"
        mv_val = getattr(mv, "value", str(mv))
        if mv_val == "lane_departure":
            mv_val = "lane_drift"

        odd_hints = ODDCell(
            road_type=rt_val,
            weather=wt_val,
            actor_type=at_val,
            maneuver=mv_val,
        )
        assumptions = []
        if not self.road_type or str(self.road_type) in ("unknown", "none"):
            assumptions.append(
                Assumption(
                    field="road_type",
                    value=str(odd_hints.road_type.value if hasattr(odd_hints.road_type, "value") else odd_hints.road_type),
                    source=AssumptionSource.DEFAULT,
                    reason_vi="Bối cảnh đường mặc định",
                )
            )
        if not self.weather or str(self.weather) in ("unknown", "none"):
            assumptions.append(
                Assumption(
                    field="weather",
                    value=str(odd_hints.weather.value if hasattr(odd_hints.weather, "value") else odd_hints.weather),
                    source=AssumptionSource.DEFAULT,
                    reason_vi="Thời tiết mặc định",
                )
            )

        return odd_hints, assumptions


__all__ = [
    "ActorType",
    "Maneuver",
    "RoadType",
    "Weather",
    "ODDQuery",
    "ODDCell",
    "ParsedIntent",
    "Assumption",
]
