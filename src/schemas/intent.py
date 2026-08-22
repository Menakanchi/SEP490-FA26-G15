"""Schema DTO cho parse_intent node (Hierarchical Taxonomy Sub-Category Model)."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from src.models.schemas import Assumption, AssumptionSource, ODDCell, ParsedIntent


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
    RUN_RED_LIGHT = "run_red_light"
    JAYWALK = "jaywalk"
    WRONG_WAY = "wrong_way"
    LANE_DRIFT = "lane_drift"  # Đồng bộ với ManeuverType trong schemas.py
    STOP_IN_LANE = "stop_in_lane"
    OVERTAKE = "overtake"
    UNKNOWN = "unknown"


class RoadType(StrEnum):
    URBAN_STRAIGHT = "urban_straight"
    HIGHWAY = "highway"
    INTERSECTION = "intersection"
    RESIDENTIAL_NARROW = "residential_narrow"  # Đồng bộ với RoadType trong schemas.py
    ROUNDABOUT = "roundabout"  # Đồng bộ với RoadType trong schemas.py
    UNKNOWN = "unknown"


class Weather(StrEnum):
    CLEAR = "clear"
    RAIN = "rain"  # Đồng bộ với Weather trong schemas.py
    HEAVY_RAIN = "heavy_rain"
    FOG = "fog"
    UNKNOWN = "unknown"


class ActorDetail(BaseModel):
    category: str = Field(
        default="unknown",
        description="Nhóm phương tiện chuẩn OpenSCENARIO: car, truck, bus, motorcycle, pedestrian, unknown",
    )
    specific_type: str = Field(
        default="unknown",
        description="Tên phương tiện thực tế từ prompt (ví dụ: xe_lu, xe_cau, container, sedan,...)",
    )


class ActorInfo(BaseModel):
    role: str = Field(
        default="adversary",
        description="Vai trò phương tiện: 'ego' (phương tiện chịu ảnh hưởng/quan sát) hoặc 'adversary' (phương tiện chính gây ra sự cố) hoặc 'secondary_adversary'",
    )
    category: str = Field(
        default="unknown",
        description="Nhóm phương tiện chuẩn: car, truck, bus, motorcycle, pedestrian, bicycle, unknown",
    )
    specific_type: str = Field(
        default="unknown",
        description="Tên/chi tiết phương tiện thực tế từ prompt (ví dụ: xe_khach_29_cho, xe_may)",
    )


class ManeuverDetail(BaseModel):
    category: str = Field(
        default="unknown",
        description="Nhóm hành vi chuẩn: cut_in, sudden_brake, lane_departure, overtake, stop_in_lane, unknown",
    )
    specific_action: str = Field(
        default="unknown",
        description="Hành vi chi tiết từ prompt (ví dụ: ui_dat, tat_dau, phanh_gap,...)",
    )


class ODDQuery(BaseModel):
    """Schema ODDQuery phân cấp (Sub-Category Model + Multi-Actor) cho Structured Output của parse_intent."""

    actor_type: ActorDetail = Field(default_factory=ActorDetail)
    maneuver: ManeuverDetail = Field(default_factory=ManeuverDetail)
    road_type: str = "unknown"
    weather: str = "unknown"
    inferred: list[str] = Field(
        default_factory=list,
        description="Trục do parse_intent suy ra (không phải người dùng gõ). Giá trị hợp lệ: road_type, weather, actor_type, maneuver",
    )
    actors: list[ActorInfo] = Field(
        default_factory=list,
        description="Danh sách đầy đủ phương tiện xuất hiện trong kịch bản kèm vai trò (ego / adversary)",
    )

    @computed_field
    def primary_actor(self) -> ActorDetail:
        """Trả về phương tiện chính (adversary) phục vụ cho Node 2 Vector Retrieve và downstream nodes."""
        if self.actors:
            for act in self.actors:
                if act.role == "adversary":
                    return ActorDetail(category=act.category, specific_type=act.specific_type)
            return ActorDetail(category=self.actors[0].category, specific_type=self.actors[0].specific_type)
        return self.actor_type

    @model_validator(mode="after")
    def _sync_actor_type_and_actors(self) -> ODDQuery:
        # Nếu có actors nhưng actor_type là unknown, sync actor_type từ primary_actor
        if self.actors and (self.actor_type.category == "unknown" and self.actor_type.specific_type == "unknown"):
            prim = self.primary_actor
            self.actor_type = prim
        # Nếu có actor_type nhưng actors rỗng, tự động điền actors
        elif not self.actors and (self.actor_type.category != "unknown" or self.actor_type.specific_type != "unknown"):
            self.actors = [
                ActorInfo(
                    role="adversary",
                    category=self.actor_type.category,
                    specific_type=self.actor_type.specific_type,
                )
            ]
        return self

    @field_validator("actor_type", mode="before")
    @classmethod
    def _parse_actor_type(cls, v: Any) -> Any:
        if isinstance(v, str):
            v_clean = v.strip().lower()
            if v_clean in ("unknown", "none", "n/a", "null", ""):
                return ActorDetail(category="unknown", specific_type="unknown")
            return ActorDetail(category=v_clean, specific_type=v_clean)
        if isinstance(v, dict):
            return ActorDetail(**v)
        return v

    @field_validator("maneuver", mode="before")
    @classmethod
    def _parse_maneuver(cls, v: Any) -> Any:
        if isinstance(v, str):
            v_clean = v.strip().lower()
            if v_clean in ("unknown", "none", "n/a", "null", ""):
                return ManeuverDetail(category="unknown", specific_action="unknown")
            return ManeuverDetail(category=v_clean, specific_action=v_clean)
        if isinstance(v, dict):
            return ManeuverDetail(**v)
        return v

    @field_validator("road_type", "weather", mode="before")
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
            return v_clean
        return v

    def missing_required_axes(self) -> list[str]:
        missing = []
        actor_cat = getattr(self.actor_type, "category", str(self.actor_type)) if self.actor_type else "unknown"
        actor_spec = getattr(self.actor_type, "specific_type", "unknown") if self.actor_type else "unknown"
        if actor_cat in ("unknown", "none", "") and actor_spec in ("unknown", "none", ""):
            missing.append("actor_type")
        return missing

    def with_defaults(self) -> tuple[ODDCell, list[Assumption]]:
        at_cat = "unknown"
        if self.actor_type and self.actor_type.category not in ("unknown", "none", ""):
            at_cat = self.actor_type.category
        elif self.actor_type and self.actor_type.specific_type not in ("unknown", "none", ""):
            spec = self.actor_type.specific_type.lower()
            if "dap" in spec:
                at_cat = "bicycle"
            elif "nguoi" in spec or "day" in spec or "bo_hanh" in spec:
                at_cat = "pedestrian"
            elif "tai" in spec or "cont" in spec or "lu" in spec:
                at_cat = "truck"
            elif "bus" in spec or "buyt" in spec or "cho" in spec:
                at_cat = "bus"
            elif "may" in spec or "ba_go" in spec:
                at_cat = "motorcycle"
            else:
                at_cat = "car"
        else:
            at_cat = "motorcycle"

        mv_cat = (
            self.maneuver.category
            if (self.maneuver and self.maneuver.category not in ("unknown", "none", ""))
            else "lane_departure"
        )
        rt = self.road_type if (self.road_type and str(self.road_type) not in ("unknown", "none")) else "urban_straight"
        wt = self.weather if (self.weather and str(self.weather) not in ("unknown", "none")) else "clear"

        rt_val = getattr(rt, "value", str(rt))
        wt_val = getattr(wt, "value", str(wt))
        at_val = getattr(at_cat, "value", str(at_cat))
        if at_val in ("xe_bus", "xe_khach"):
            at_val = "bus"
        mv_val = getattr(mv_cat, "value", str(mv_cat))
        if mv_val == "lane_departure":
            mv_val = "lane_drift"

        spec_type = (
            self.actor_type.specific_type if (self.actor_type and self.actor_type.specific_type != "unknown") else None
        )
        spec_act = (
            self.maneuver.specific_action if (self.maneuver and self.maneuver.specific_action != "unknown") else None
        )

        odd_hints = ODDCell(
            road_type=rt_val,
            weather=wt_val,
            actor_type=at_val,
            maneuver=mv_val,
            specific_type=spec_type,
            specific_action=spec_act,
        )
        assumptions = []
        if not self.road_type or str(self.road_type) in ("unknown", "none"):
            assumptions.append(
                Assumption(
                    field="road_type",
                    value=str(
                        odd_hints.road_type.value if hasattr(odd_hints.road_type, "value") else odd_hints.road_type
                    ),
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
    "ActorDetail",
    "ManeuverDetail",
    "ODDQuery",
    "ODDCell",
    "ParsedIntent",
    "Assumption",
]
