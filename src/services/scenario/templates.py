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

    shoulder_lane_offsets: tuple[int, int]
    """``lane_offset`` của hai lề đường, theo thứ tự (phải ego, trái ego).

    Người đi bộ phải **đứng ở lề rồi băng sang lề bên kia**. Không có mặt cắt
    ngang này thì code chỉ còn cách đoán, và cách đoán cũ — lấy đích bằng cách
    đảo dấu ``lane_offset`` — đặt người đi bộ dừng **giữa làn xe chạy**, vì ego
    không nằm giữa mặt cắt.

    Đo trên CARLA ngày 23/08/2026 bằng ``get_left_lane``/``get_right_lane`` từ
    anchor (road 23, lane -3):

        lane -1  Shoulder   <- lane_offset -2
        lane -2  Driving       lane_offset -1
        lane -3  Driving       ego
        lane -4  Shoulder   <- lane_offset +1

    Chỉ **hai** làn xe chạy, hai bên là lề. Quan hệ là ``lane_id = ego_lane_id -
    lane_offset`` với anchor lane_id âm, nên hai lề lệch nhau **không đối xứng**:
    +1 và -2, không phải ±1.
    """

    traffic_signal_name: str | None = None
    """Tên đèn theo cú pháp ScenarioRunner, chỉ có ở anchor ``run_red_light``."""

    ego_traffic_signal_name: str | None = None
    """Đèn xanh chi phối ego ở template giao cắt, nếu có."""

    maneuver_actor_spawn: EgoSpawn | None = None
    """Approach vuông góc dành cho actor vượt đèn đỏ; không dùng ở highway."""


TOWN04_ROAD_41_MANEUVERS = frozenset(
    {
        ManeuverType.CUT_IN,
        ManeuverType.SUDDEN_BRAKE,
        # ManeuverType.JAYWALK đã gỡ 23/08/2026 — người đi bộ trên cao tốc là phi
        # lý, và cơ chế băng đường của ScenarioRunner định tuyến dọc làn chứ không
        # cắt ngang. Xem `_SUPPORTED_ACTORS_BY_ROAD_MANEUVER` trong schemas.py.
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

# Đo cùng ngày 23/08 bằng get_left_lane/get_right_lane từ anchor: lề nằm ở
# lane -4 (lane_offset +1) và lane -1 (lane_offset -2). Xem ScenarioTemplate.
_TOWN04_SHOULDERS = (1, -2)

# Anchor đô thị đo trực tiếp ngày 24/08/2026. Ego đi về phía đông theo đèn xanh
# id=118; actor đi từ phía bắc xuống, vượt đèn đỏ id=122. Hai quỹ đạo cắt nhau
# quanh CARLA (258, -169), thay vì actor chạy cùng làn phía trước ego như bản
# hiệu chuẩn sc_044/sc_045. Toạ độ dưới đây ở hệ OpenSCENARIO: y và yaw đổi dấu
# so với CARLA vì ScenarioRunner 0.9.15 dùng hệ tay phải.
_TOWN04_URBAN_SIGNAL_ANCHOR = EgoSpawn(
    x=217.0400,
    y=169.4200,
    z=0.3000,
    h=-0.005236,
    lane_id=-1,
)
_TOWN04_URBAN_SIGNAL_REACH_M = (-60.0, 25.0)
_TOWN04_URBAN_SHOULDERS = (1, -2)
_TOWN04_RED_LIGHT_ACTOR_SPAWN = EgoSpawn(
    x=258.3100,
    y=130.8600,
    z=0.3000,
    h=1.567306,
    lane_id=-1,
)

TEMPLATE_CATALOG: dict[RoadType, ScenarioTemplate] = {
    # Thêm road type mới nghĩa là thêm một anchor ĐÃ ĐO: tầm với dọc đường, mặt
    # cắt ngang (lề nằm ở đâu), và chạy thử từng maneuver trên đó. Khai báo mà
    # không đo sẽ làm nhãn ODD không còn phản ánh hình học CARLA thật.
    RoadType.HIGHWAY: ScenarioTemplate(
        map_name="Town04",
        road_type=RoadType.HIGHWAY,
        supported_maneuvers=TOWN04_ROAD_41_MANEUVERS,
        ego_spawn=_TOWN04_ANCHOR,
        s_offset_reach_m=_TOWN04_REACH_M,
        shoulder_lane_offsets=_TOWN04_SHOULDERS,
    ),
    RoadType.URBAN_STRAIGHT: ScenarioTemplate(
        map_name="Town04",
        road_type=RoadType.URBAN_STRAIGHT,
        supported_maneuvers=frozenset({ManeuverType.RUN_RED_LIGHT}),
        ego_spawn=_TOWN04_URBAN_SIGNAL_ANCHOR,
        s_offset_reach_m=_TOWN04_URBAN_SIGNAL_REACH_M,
        shoulder_lane_offsets=_TOWN04_URBAN_SHOULDERS,
        traffic_signal_name="id=122",
        ego_traffic_signal_name="id=118",
        maneuver_actor_spawn=_TOWN04_RED_LIGHT_ACTOR_SPAWN,
    ),
}


def get_template(road_type: RoadType) -> ScenarioTemplate | None:
    return TEMPLATE_CATALOG.get(road_type)
