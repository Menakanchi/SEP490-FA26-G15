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


TOWN04_ROAD_41_MANEUVERS = frozenset(
    {
        ManeuverType.CUT_IN,
        ManeuverType.SUDDEN_BRAKE,
        ManeuverType.RUN_RED_LIGHT,
        # ManeuverType.JAYWALK đã gỡ 23/08/2026 — người đi bộ trên cao tốc là phi
        # lý, và cơ chế băng đường của ScenarioRunner định tuyến dọc làn chứ không
        # cắt ngang. Xem `_HIGHWAY_ACTORS_BY_MANEUVER` trong schemas.py.
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

TEMPLATE_CATALOG: dict[RoadType, ScenarioTemplate] = {
    # CHỈ có cao tốc. `URBAN_STRAIGHT` từng nằm ở đây và **trỏ vào đúng anchor cao
    # tốc này** — cùng map, cùng road, cùng lane, chỉ khác cái nhãn. Nó không dựng
    # ra con đường đô thị nào; nó chỉ khiến hệ thống trả lời "có hỗ trợ đô thị"
    # cho một câu hỏi mà câu trả lời thật là "chưa".
    #
    # Thêm road type mới nghĩa là thêm một anchor ĐÃ ĐO: tầm với dọc đường, mặt
    # cắt ngang (lề nằm ở đâu), và chạy thử từng maneuver trên đó. Khai báo mà
    # không đo là dựng lại đúng lời nói dối vừa gỡ.
    RoadType.HIGHWAY: ScenarioTemplate(
        map_name="Town04",
        road_type=RoadType.HIGHWAY,
        supported_maneuvers=TOWN04_ROAD_41_MANEUVERS,
        ego_spawn=_TOWN04_ANCHOR,
        s_offset_reach_m=_TOWN04_REACH_M,
        shoulder_lane_offsets=_TOWN04_SHOULDERS,
    ),
}


def get_template(road_type: RoadType) -> ScenarioTemplate | None:
    return TEMPLATE_CATALOG.get(road_type)
