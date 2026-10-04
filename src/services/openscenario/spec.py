"""Hợp đồng dữ liệu của bộ sinh OpenSCENARIO (``ScenarioSpec`` -> ``.xosc``).

Tách từ ``src/models/schemas.py`` của Scenario Forge khi gỡ Forge (ADR-032): chỉ giữ đúng các
kiểu mà ``converter.py``, ``geometry.py``, ``templates.py`` và test của chúng dùng.

Hai ranh giới cứng giữ nguyên từ Forge:

1. ``ScenarioSpec`` **độc lập simulator** (ADR-005): không blueprint CARLA, không tên map CARLA,
   không toạ độ theo hệ CARLA. Dịch sang thứ CARLA hiểu là việc của ``converter.py``.
2. ``src/`` **không bao giờ** ``import carla`` (ADR-001): đầu ra là chuỗi XML ``.xosc``.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator
from pydantic_core import PydanticCustomError


class SpecModel(BaseModel):
    """Base của mọi model trong hợp đồng. Cấm trường lạ.

    ``extra="forbid"`` là quyết định có chủ đích, không phải mặc định của Pydantic.
    Lý do: đây là hợp đồng đi qua **ranh giới máy** giữa hai venv khác version do
    hai người khác nhau bảo trì. Một cái gõ nhầm ``criteria_result`` (thiếu ``s``)
    mà Pydantic bỏ qua sẽ cho ra ``criteria_results=[]`` -> ``had_collision=False``
    -> ``adversarial_found`` đếm thiếu. **Hỏng im lặng, sai số liệu nộp bài.**

    Cấm trường lạ biến lỗi đó thành ``ValidationError`` ngay tại ranh giới.

    Với ``ScenarioSpec`` (đầu ra LLM) thì nghiêm ngặt cũng đúng: LLM bịa thêm
    trường là dấu hiệu nó hiểu sai, và vòng repair sinh ra chính để xử việc đó.
    """

    model_config = ConfigDict(extra="forbid")


class RoadType(StrEnum):
    """5 loại đường. Chọn theo giao thông Việt Nam, không copy ODD của EU/US."""

    INTERSECTION = "intersection"  # giao lộ có/không đèn
    URBAN_STRAIGHT = "urban_straight"  # đường đô thị thẳng
    HIGHWAY = "highway"  # cao tốc / quốc lộ
    RESIDENTIAL_NARROW = "residential_narrow"  # ngõ, đường khu dân cư hẹp
    ROUNDABOUT = "roundabout"  # vòng xuyến


class Weather(StrEnum):
    """4 mức thời tiết."""

    CLEAR = "clear"
    RAIN = "rain"
    HEAVY_RAIN = "heavy_rain"
    FOG = "fog"


class TimeOfDay(StrEnum):
    """3 mốc thời gian."""

    DAY = "day"
    DUSK = "dusk"
    NIGHT = "night"


class ActorType(StrEnum):
    """4 loại chủ thể gây tình huống.

    MOTORCYCLE đứng đầu vì đó là chủ thể chi phối giao thông Việt Nam —
    phần lớn kịch bản corner-case của bài toán này xoay quanh xe máy.
    """

    MOTORCYCLE = "motorcycle"
    CAR = "car"
    PEDESTRIAN = "pedestrian"
    TRUCK = "truck"


class ManeuverType(StrEnum):
    """Hành vi mà chủ thể thực hiện khi trigger bắn.

    Danh sách này **đóng** có chủ đích: mỗi giá trị tương ứng một template
    ``.xosc`` mà converter biết dựng. LLM chỉ được chọn trong đây, không được
    tự bịa hành vi — đó là cách ta giữ tỉ lệ hợp lệ cao.

    Đồng thời là **trục thứ 4 của ma trận ODD** (xem ``ODDCell``): đề bài đo
    *"độ đa dạng của các tình huống"*, nên tình huống phải là một trục đo phủ,
    không chỉ là một trường mô tả.
    """

    CUT_IN = "cut_in"  # tạt đầu
    SUDDEN_BRAKE = "sudden_brake"  # phanh gấp
    RUN_RED_LIGHT = "run_red_light"  # vượt đèn đỏ
    JAYWALK = "jaywalk"  # băng qua đường bất ngờ
    WRONG_WAY = "wrong_way"  # đi ngược chiều
    LANE_DRIFT = "lane_drift"  # lấn làn từ từ
    STOP_IN_LANE = "stop_in_lane"  # dừng chết giữa làn


class ODDCell(SpecModel):
    """Một ô trong ma trận ODD. 5 x 4 x 4 x 7 = 560 ô.

    ``coverage`` = tỉ lệ ô đã có ít nhất một scenario hợp lệ.

    **Trục thứ 4 là `maneuver`, không phải `time_of_day`.** Đề bài đo *"độ đa
    dạng của các tình huống"* — phủ 75% ma trận mà chưa từng sinh một kịch bản
    người đi bộ băng ngang thì không đạt yêu cầu đó. ``TimeOfDay`` vẫn còn trong
    ``ScenarioSpec`` để dựng cảnh, chỉ thôi làm trục đo phủ.

    Dùng **trọn** ``ManeuverType`` chứ không phải một tập con: một danh sách con
    riêng cho ODD sẽ thành nguồn sự thật thứ hai, và sẽ lệch khỏi enum ngay lần
    đầu ai đó thêm hành vi mới.

    Đếm coverage thì gom theo ``key`` (chuỗi, hashable) chứ đừng gom theo chính
    object — đó là lý do ``key`` tồn tại.
    """

    road_type: RoadType
    weather: Weather
    actor_type: ActorType
    maneuver: ManeuverType

    # Hai trường dưới đây là **nhãn mô tả**, không phải trục ODD. Chúng giữ lại
    # đúng chữ người dùng gõ ("xe khách 29 chỗ", "vượt ẩu tạt đầu") sau khi
    # ``parse_intent`` đã quy nó về ô enum gần nhất. Không có chỗ này thì thông
    # tin đó mất hẳn, và người đọc lại kịch bản không biết vì sao một câu nói về
    # xe khách lại ra ``actor_type=truck``.
    #
    # Cố ý **không** đưa chúng vào ``key``: coverage đếm theo ô enum, và một
    # trục thứ năm dạng chuỗi tự do sẽ làm mẫu số vô hạn.
    specific_type: str | None = Field(
        default=None, max_length=120, description="Loại phương tiện chi tiết theo lời người dùng, trước khi quy về enum"
    )
    specific_action: str | None = Field(
        default=None, max_length=120, description="Hành vi chi tiết theo lời người dùng, trước khi quy về enum"
    )

    @property
    def key(self) -> str:
        """Khoá ổn định để đếm coverage và làm điều kiện lọc ODD khi retrieval.

        Mọi enum ở file này dùng ``StrEnum`` (Python 3.11+) chứ không phải
        ``(str, Enum)``. Lý do không phải thẩm mỹ: với ``(str, Enum)`` thì
        ``f"{RoadType.HIGHWAY}"`` cho ra ``"RoadType.HIGHWAY"``, và mệnh đề
        ``WHERE`` sẽ hỏng **im lặng** — không báo lỗi, chỉ là không khớp gì cả.
        ``StrEnum`` cho ra ``"highway"`` như mong đợi.

        ``test_odd_key_is_stable`` canh chỗ này; nó đã bắt được đúng lỗi đó một lần.
        """
        return "|".join(
            (
                self.road_type.value,
                self.weather.value,
                self.actor_type.value,
                self.maneuver.value,
            )
        )


class SupportPolicy(SpecModel):
    """Tổ hợp ODD nào converter dựng được. **Mẫu số của ODD coverage.**

    560 là số tổ hợp enum, **không** phải số ô có thể phủ. Nếu catalog template
    không dựng được ``(roundabout, pedestrian, run_red_light)`` thì ô đó không
    phải "chưa phủ" mà là "không bao giờ phủ được" — báo cáo ``x/560`` lúc đó
    trông như thất bại trong khi thực chất là quyết định thu hẹp phạm vi có
    chủ đích — PRD §6.1 bắt mẫu số phải dùng ``SupportPolicy.denominator()``
    chứ không phải 560.

    Nên báo cáo **hai** số, không phải một::

        Phạm vi hỗ trợ: 240 / 560 tổ hợp enum
        Đã phủ:         168 / 240 ô hỗ trợ = 70%

    ``unsupported`` là tập **loại trừ** chứ không phải tập cho phép: mặc định
    mọi thứ được hỗ trợ, ai thu hẹp thì phải viết ra. Ngược lại (whitelist) thì
    thêm một ``ManeuverType`` mới sẽ **im lặng** rơi khỏi phạm vi.

    Nội dung mask phải khớp catalog converter — PRD §10, *"danh sách
    maneuver/map thực sự được converter hỗ trợ"*. Tổ hợp chưa có anchor/template
    đã kiểm chứng phải bị loại ở đây để chặn trước khi gọi LLM.

    Giá trị hiện tại và ngưỡng để nới nó nằm ở ADR-016 — đừng sửa mask ở đây
    mà không đi qua ADR, vì nó là mẫu số của ``ODD coverage``.
    """

    unsupported: frozenset[tuple[RoadType, ActorType, ManeuverType]] = frozenset()

    def supports(self, road_type: RoadType, actor_type: ActorType, maneuver: ManeuverType) -> bool:
        return (road_type, actor_type, maneuver) not in self.unsupported

    def supported_cells(self) -> list[ODDCell]:
        """**Liệt kê** ô khả thi, không tính bằng công thức đóng.

        Công thức kiểu ``5 * 4 * 4 * |maneuver|`` chỉ đúng khi mọi ``road_type``
        hỗ trợ đúng cùng một số maneuver. Ngay lần đầu ai đó loại
        ``(roundabout, *, run_red_light)`` mà không loại nó ở ``highway`` thì
        công thức sai và **không ai biết** — mẫu số lệch âm thầm. Liệt kê thì
        không vỡ, kể cả khi mask sau này phụ thuộc cả ``actor_type``
        (``pedestrian`` + ``cut_in`` chẳng hạn).
        """
        return [
            ODDCell(road_type=road, weather=weather, actor_type=actor, maneuver=maneuver)
            for road in RoadType
            for weather in Weather
            for actor in ActorType
            for maneuver in ManeuverType
            if self.supports(road, actor, maneuver)
        ]

    def denominator(self) -> int:
        """Mẫu số của ``ODD coverage``. Dùng cái này, đừng hard-code 560."""
        return len(self.supported_cells())


_VEHICLE_ACTORS = frozenset({ActorType.CAR, ActorType.MOTORCYCLE, ActorType.TRUCK})


_SUPPORTED_ACTORS_BY_ROAD_MANEUVER: dict[tuple[RoadType, ManeuverType], frozenset[ActorType]] = {
    (RoadType.HIGHWAY, maneuver): _VEHICLE_ACTORS
    for maneuver in ManeuverType
    if maneuver not in {ManeuverType.JAYWALK, ManeuverType.RUN_RED_LIGHT}
}


_SUPPORTED_ACTORS_BY_ROAD_MANEUVER[(RoadType.URBAN_STRAIGHT, ManeuverType.RUN_RED_LIGHT)] = _VEHICLE_ACTORS


"""``jaywalk`` **không có actor nào** — nó nằm ngoài phạm vi, có chủ đích.

Hai lý do độc lập, mỗi lý do đủ để loại:

**Phi lý về nội dung.** Băng qua đường là hành vi đô thị. Anchor duy nhất đã đo
kỹ là một đoạn cao tốc Town04, và đặt người đi bộ đi bộ trên làn ô tô cao tốc là
sai ngay từ đề bài — sửa cho nó chạy mượt cũng chỉ ra một kịch bản vô lý mượt mà.

**Hỏng về cơ chế, và không phải lỗi bản đồ.** ScenarioRunner dịch
``AcquirePositionAction`` thành ``ChangeActorWaypoints(..., 'fastest')``, một bộ
định tuyến trên **đồ thị đường**. Đồ thị đường không có cạnh cắt ngang mặt đường,
nên người đi bộ được vạch lộ trình **dọc theo làn** thay vì băng qua. Đo trên
``sc_026`` ngày 23/08/2026: trong 2,6 giây họ dịch ngang **0,54 m** trong khi
chạy dọc 44 m. Đổi sang bản đồ đô thị **không** sửa được chuyện này.

Muốn mở lại thì cần hai thứ, không phải một: một anchor đô thị đã đo (tầm với,
mặt cắt ngang, chạy thử từng maneuver), **và** một cơ chế băng đường khác — quỹ
đạo tường minh, hoặc lưới điều hướng người đi bộ của CARLA.

Đếm nó vào độ phủ trong khi không dựng nổi một lần băng đường nào là tự dìm giá
trị của chính con số đó.
"""


DEFAULT_SUPPORT_POLICY = SupportPolicy(
    unsupported=frozenset(
        (road, actor, maneuver)
        for road in RoadType
        for actor in ActorType
        for maneuver in ManeuverType
        if actor not in _SUPPORTED_ACTORS_BY_ROAD_MANEUVER.get((road, maneuver), frozenset())
    )
)


"""72 ô đã đo: 60 highway + 12 urban ``run_red_light``, qua bốn weather.

``run_red_light`` không nằm ở highway: đèn gần anchor cao tốc nhất cách 211,8 m,
ngoài tầm +40 m. Nó dùng anchor đô thị Town04 riêng, ngay trước vạch dừng. Năm
maneuver xe còn lại ở highway; ``jaywalk`` bị loại — xem trên.
"""


class VehicleCategory(StrEnum):
    """Loại phương tiện theo **ngữ nghĩa**, không phải theo blueprint CARLA.

    ``converter.py`` ánh xạ sang blueprint cụ thể (``vehicle.yamaha.yzf`` ...).
    Chỗ nào trong ``src/`` viết thẳng tên blueprint là đã phá ADR-005.
    """

    CAR = "car"
    MOTORCYCLE = "motorcycle"
    TRUCK = "truck"
    BICYCLE = "bicycle"
    PEDESTRIAN = "pedestrian"


class Position(SpecModel):
    """Vị trí tương đối theo **làn đường**, không phải toạ độ tuyệt đối.

    Dùng lane-relative vì:
      - độc lập map: cùng spec chạy được trên nhiều map;
      - LLM sinh ra được (nó không biết toạ độ thật của Town04);
      - converter dịch sang WorldPosition khi cần.

    Ngoại lệ có chủ đích: ``run_red_light`` dùng vị trí 0/0 như khoá chọn
    approach vuông góc đã đo trong template đô thị. Converter từ chối mọi giá trị
    khác để không im lặng bỏ qua hình học do LLM sinh.
    """

    lane_offset: int = Field(
        0,
        ge=-4,
        le=4,
        description="Lệch bao nhiêu làn so với làn của ego. Âm = trái, dương = phải.",
    )
    s_offset_m: float = Field(
        0.0,
        ge=-200.0,
        le=200.0,
        description="Lệch bao nhiêu mét dọc đường so với ego. Âm = phía sau.",
    )


class ActorSpec(SpecModel):
    """Một chủ thể trong kịch bản. Ego luôn là actor đầu tiên, tên ``hero``."""

    name: str = Field(..., min_length=1, max_length=40, description="Định danh trong kịch bản")
    category: VehicleCategory
    position: Position
    initial_speed_kmh: float = Field(..., ge=0.0, le=150.0)
    is_ego: bool = Field(False, description="Đúng một actor được đặt True")

    # Cùng vai trò với ``ODDCell.specific_type``: giữ chữ người dùng gõ sau khi
    # đã quy về ``category``. Converter không đọc trường này — nó chỉ chọn
    # blueprint theo ``category`` — nên thêm giá trị lạ ở đây không làm vỡ .xosc.
    specific_type: str | None = Field(
        default=None, max_length=120, description="Loại phương tiện chi tiết theo lời người dùng"
    )


class TriggerCondition(SpecModel):
    """Điều kiện kích hoạt, không chứa toạ độ hay định danh làn CARLA.

    ``lead_distance`` là khoảng cách dọc có dấu theo ngữ nghĩa: maneuver bắn khi
    actor đã ở **trước** ego ``value`` mét. Converter ánh xạ nó sang một
    ``ReachPositionCondition`` động, neo vào ``hero``; spec vẫn độc lập map.
    """

    type: Literal["distance_to_ego", "simulation_time", "lead_distance"]
    value: float = Field(
        ...,
        gt=0.0,
        description="mét nếu distance/lead_distance, giây nếu simulation_time",
    )


class ManeuverSpec(SpecModel):
    """Ai làm gì, khi nào. Đây là phần 'nguy hiểm' của kịch bản."""

    actor_name: str = Field(..., description="Trỏ tới ActorSpec.name")
    maneuver: ManeuverType
    trigger: TriggerCondition
    target_speed_kmh: float | None = Field(
        None,
        ge=0.0,
        le=150.0,
        description="Tốc độ sau khi thực hiện; None nghĩa là giữ initial_speed_kmh của actor",
    )


class ScenarioCore(SpecModel):
    """Phần kịch bản mà **LLM chịu trách nhiệm**. Không có id, không có câu gốc.

    LLM chịu trách nhiệm ngữ nghĩa (ai, ở đâu, làm gì, khi nào).
    Converter chịu trách nhiệm cú pháp (tên element, hệ toạ độ, XML).
    Tách hai lớp để mỗi lỗi định vị được: lỗi cú pháp là bug của code (sửa một
    lần là hết), lỗi ngữ nghĩa là bug của prompt (đo được bằng eval).

    Lý do class này tồn tại thay vì viết hai model song song: ``ScenarioDraft``
    và ``ScenarioSpec`` phải kiểm **cùng một bộ ràng buộc**. Hai model song song
    sẽ lệch nhau ngay lần thứ hai ai đó thêm validator, và lệch về phía nguy
    hiểm — draft lỏng hơn spec nghĩa là repair không bắt được lỗi mà spec sẽ
    chặn sau đó. Kế thừa làm việc lệch trở thành bất khả.
    """

    title: str = Field(..., min_length=1, max_length=120)

    odd: ODDCell
    time_of_day: TimeOfDay = Field(
        TimeOfDay.DAY,
        description=(
            "Dùng để dựng cảnh (góc mặt trời, đèn xe) — **không** phải trục đo phủ ODD. "
            "Xem ODDCell: đề bài đo đa dạng tình huống, không đo đa dạng giờ trong ngày."
        ),
    )
    actors: list[ActorSpec] = Field(..., min_length=2, description="Ít nhất ego + 1 chủ thể")
    maneuvers: list[ManeuverSpec] = Field(..., min_length=1)

    duration_s: float = Field(30.0, gt=0.0, le=120.0, description="Trần thời gian mô phỏng")

    @model_validator(mode="after")
    def _check_refs(self) -> ScenarioCore:
        egos = [a for a in self.actors if a.is_ego]
        if len(egos) != 1:
            raise PydanticCustomError(
                "EGO_COUNT",
                "phải có đúng 1 ego, đang có {ego_count}",
                {"ego_count": len(egos)},
            )

        names = {a.name for a in self.actors}
        if len(names) != len(self.actors):
            first_index_by_name: dict[str, int] = {}
            duplicate_index = 0
            duplicate_name = ""
            for actor_index, actor in enumerate(self.actors):
                if actor.name in first_index_by_name:
                    duplicate_index = actor_index
                    duplicate_name = actor.name
                    break
                first_index_by_name[actor.name] = actor_index
            raise PydanticCustomError(
                "DUP_ACTOR_NAME",
                "tên actor bị trùng: {actor_name}",
                {"actor_name": duplicate_name, "actor_index": duplicate_index},
            )

        for maneuver_index, m in enumerate(self.maneuvers):
            if m.actor_name not in names:
                raise PydanticCustomError(
                    "DANGLING_ACTOR_REF",
                    "maneuver trỏ tới actor không tồn tại: {actor_name}",
                    {"actor_name": repr(m.actor_name), "maneuver_index": maneuver_index},
                )
            if m.actor_name == egos[0].name:
                raise PydanticCustomError(
                    "EGO_HAS_MANEUVER",
                    "ego không được mang maneuver — ego là thứ ĐANG BỊ TEST, không phải thứ gây ra tình huống",
                    {"maneuver_index": maneuver_index},
                )

            # Trigger bắn sau khi kịch bản đã dừng = hành vi không bao giờ chạy.
            # Kịch bản vẫn hợp lệ, vẫn chạy trót lọt, vẫn success=true — nhưng
            # KHÔNG CÓ GÌ XẢY RA. Đây đúng cái bẫy sc_002 mô tả, và nó làm hỏng
            # cả intent_match lẫn adversarial_found mà không báo lỗi ở đâu.
            if m.trigger.type == "simulation_time" and m.trigger.value >= self.duration_s:
                raise PydanticCustomError(
                    "TRIGGER_AFTER_END",
                    "trigger bắn ở giây {trigger_time} nhưng kịch bản chỉ dài "
                    "{duration}s — hành vi {maneuver} không bao giờ chạy",
                    {
                        "trigger_time": m.trigger.value,
                        "duration": self.duration_s,
                        "maneuver": repr(m.maneuver.value),
                        "maneuver_index": maneuver_index,
                    },
                )

        # Nhãn ODD phải khớp thực tế. Nhãn này là thứ retrieval lọc theo và là thứ
        # đếm ODD coverage; gắn nhãn "pedestrian" cho một kịch bản toàn ô tô sẽ
        # thổi phồng coverage và làm thư viện trả về kết quả sai nhãn.
        non_ego = {a.category.value for a in self.actors if not a.is_ego}
        if self.odd.actor_type.value not in non_ego:
            raise PydanticCustomError(
                "ODD_ACTOR_MISMATCH",
                "odd.actor_type={actor_type} nhưng không chủ thể nào thuộc loại đó (đang có: {actual_types})",
                {
                    "actor_type": repr(self.odd.actor_type.value),
                    "actual_types": sorted(non_ego),
                },
            )

        # Cùng lý do, cho trục tình huống. Gắn nhãn "jaywalk" cho một kịch bản chỉ
        # có hành vi tạt đầu sẽ báo đã phủ ô jaywalk trong khi ô đó vẫn trống —
        # tức là tự khai khống đúng con số mà đề bài dùng để chấm độ đa dạng.
        done = {m.maneuver.value for m in self.maneuvers}
        if self.odd.maneuver.value not in done:
            raise PydanticCustomError(
                "ODD_MANEUVER_MISMATCH",
                "odd.maneuver={maneuver} nhưng không maneuver nào thực hiện hành vi đó (đang có: {actual_maneuvers})",
                {
                    "maneuver": repr(self.odd.maneuver.value),
                    "actual_maneuvers": sorted(done),
                },
            )
        return self


class ScenarioDraft(ScenarioCore):
    """**Đầu ra của node `generate_draft`.** Đúng bằng ``ScenarioCore``, không hơn.

    Cố ý không thêm trường nào. Class này tồn tại để nói một điều duy nhất:
    *đây là thứ LLM được phép sinh*. Structured output schema gửi cho model
    chính là schema của class này — ngắn hơn ``ScenarioSpec`` hai trường, trong
    đó có một trường regex mà model hay vi phạm.
    """


class ScenarioSpec(ScenarioCore):
    """Kịch bản hoàn chỉnh. **Đầu vào của converter, đầu ra của backend.**

    Hai trường thêm so với ``ScenarioDraft`` đều **không** do LLM cấp:

    - ``scenario_id`` — backend cấp. Few-shot prompt chứa ``sc_001`` thì model
      sẽ trả ``sc_001``, mỗi lần, cho mọi người dùng. Đó là trùng khoá chính,
      không phải lỗi thẩm mỹ.
    - ``description_vi`` — copy **nguyên văn** câu người dùng gõ. Retrieval eval
      và DeepEval intent match đều so lại với câu gốc; để model paraphrase là
      hỏng cả hai phép đo mà không có gì báo.
    """

    scenario_id: str = Field(..., pattern=r"^sc_[0-9]{3,6}$", examples=["sc_001"])
    description_vi: str = Field(..., min_length=1, description="Câu tiếng Việt gốc của người dùng")

    @classmethod
    def promote(cls, draft: ScenarioDraft, *, scenario_id: str, description_vi: str) -> ScenarioSpec:
        """``ScenarioDraft`` -> ``ScenarioSpec``. Code thuần, không phải một node.

        Đây là chỗ **duy nhất** được cấp ``scenario_id``. Ai gọi
        ``ScenarioSpec(...)`` thẳng từ output LLM là đã bỏ qua ranh giới này.
        """
        return cls(**draft.model_dump(), scenario_id=scenario_id, description_vi=description_vi)


class IssueSeverity(StrEnum):
    """``error`` chặn luồng. ``warning`` chỉ hiện cho reviewer.

    Có ``warning`` vì một số phép kiểm là **suy đoán**, không phải sự thật —
    ví dụ "``lane_offset=-3`` chắc là quá số làn của đường này". Heuristic mà
    chặn luồng thì mỗi lần nó đoán sai là ba vòng repair đốt vào việc sửa một
    kịch bản vốn đã đúng: mất tiền, mất latency, và kéo tụt ``Repair success``.
    Cho nó cảnh báo, log lại, đối chiếu với ``ExecutionResult.success`` thật ở
    W3; **có số rồi** mới quyết có nâng lên chặn hay không.
    """

    ERROR = "error"
    WARNING = "warning"


class IssueCode(StrEnum):
    """Danh sách đóng. Là khoá để phân loại lỗi trong failure analysis (W5).

    Chuỗi tự do thì mỗi chỗ viết một kiểu và tới W5 không nhóm lại được — mà
    W5 là lúc phải phân tích 20 case để ra prompt v2.
    """

    # -- LLM sinh sai nội dung: SỬA ĐƯỢC bằng repair -------------------------
    SCHEMA_INVALID = "SCHEMA_INVALID"  # Pydantic từ chối: thiếu trường, sai kiểu, ngoài range
    SCHEMA_EXTRA_FIELD = "SCHEMA_EXTRA_FIELD"  # model bịa thêm trường (extra="forbid")
    EGO_COUNT = "EGO_COUNT"
    DUP_ACTOR_NAME = "DUP_ACTOR_NAME"
    DANGLING_ACTOR_REF = "DANGLING_ACTOR_REF"
    EGO_HAS_MANEUVER = "EGO_HAS_MANEUVER"
    TRIGGER_AFTER_END = "TRIGGER_AFTER_END"
    ODD_ACTOR_MISMATCH = "ODD_ACTOR_MISMATCH"
    ODD_MANEUVER_MISMATCH = "ODD_MANEUVER_MISMATCH"
    ACTOR_ROLE_MISMATCH = "ACTOR_ROLE_MISMATCH"
    ODD_LABEL_DRIFT = "ODD_LABEL_DRIFT"  # đổi nhãn người dùng đã nói rõ
    INTENT_SPEED_MISMATCH = "INTENT_SPEED_MISMATCH"  # đổi tốc độ người dùng đã nói rõ
    INTENT_POSITION_MISMATCH = "INTENT_POSITION_MISMATCH"  # đảo trước/sau so với câu gốc
    GEOM_NO_CATCHUP = "GEOM_NO_CATCHUP"  # chủ thể không bao giờ bắt kịp ego
    GEOM_NO_COLLISION_AFTER_CUTIN = "GEOM_NO_COLLISION_AFTER_CUTIN"
    TRIGGER_DISTANCE_UNSIGNED = "TRIGGER_DISTANCE_UNSIGNED"
    TRIGGER_CUTIN_NOT_POSITIONAL = "TRIGGER_CUTIN_NOT_POSITIONAL"
    GEOM_CUTIN_LEAD_TOO_SHORT = "GEOM_CUTIN_LEAD_TOO_SHORT"
    GEOM_DRIFT_AFTER_PASS = "GEOM_DRIFT_AFTER_PASS"  # lấn làn sau khi ego đã đi ngang qua
    GEOM_JAYWALK_IN_EGO_LANE = "GEOM_JAYWALK_IN_EGO_LANE"  # người đi bộ đứng sẵn trong làn ego
    GEOM_JAYWALK_TRIGGER_TOO_CLOSE = "GEOM_JAYWALK_TRIGGER_TOO_CLOSE"  # bước xuống muộn, ego đã đi qua
    GEOM_JAYWALK_NOT_FROM_SHOULDER = "GEOM_JAYWALK_NOT_FROM_SHOULDER"  # xuất phát giữa phần xe chạy
    GEOM_RUN_RED_LIGHT_NOT_CROSSING_APPROACH = "GEOM_RUN_RED_LIGHT_NOT_CROSSING_APPROACH"
    GEOM_ACTOR_BEYOND_ANCHOR_REACH = "GEOM_ACTOR_BEYOND_ANCHOR_REACH"  # đặt ngoài đoạn đường anchor phủ được

    # -- Suy đoán, chỉ cảnh báo ---------------------------------------------
    LANE_OFFSET_IMPLAUSIBLE = "LANE_OFFSET_IMPLAUSIBLE"

    # -- Lỗi hệ thống / chính sách: KHÔNG gửi cho LLM sửa --------------------
    GUARDRAIL_VIOLATION = "GUARDRAIL_VIOLATION"
    NEED_MORE_DETAIL = "NEED_MORE_DETAIL"
    UNSUPPORTED_COMBINATION = "UNSUPPORTED_COMBINATION"
    TEMPLATE_CATALOG_INCONSISTENT = "TEMPLATE_CATALOG_INCONSISTENT"
    LLM_OUTPUT_NOT_JSON = "LLM_OUTPUT_NOT_JSON"
    LLM_PROVIDER_ERROR = "LLM_PROVIDER_ERROR"
    CONVERTER_ERROR = "CONVERTER_ERROR"
    PERSISTENCE_ERROR = "PERSISTENCE_ERROR"
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED"
    VALIDATION_CONTEXT_MISSING = "VALIDATION_CONTEXT_MISSING"


REPAIRABLE_CODES: frozenset[IssueCode] = frozenset(
    {
        IssueCode.SCHEMA_INVALID,
        IssueCode.SCHEMA_EXTRA_FIELD,
        IssueCode.EGO_COUNT,
        IssueCode.DUP_ACTOR_NAME,
        IssueCode.DANGLING_ACTOR_REF,
        IssueCode.EGO_HAS_MANEUVER,
        IssueCode.TRIGGER_AFTER_END,
        IssueCode.ODD_ACTOR_MISMATCH,
        IssueCode.ODD_MANEUVER_MISMATCH,
        IssueCode.ACTOR_ROLE_MISMATCH,
        IssueCode.ODD_LABEL_DRIFT,
        IssueCode.INTENT_SPEED_MISMATCH,
        IssueCode.INTENT_POSITION_MISMATCH,
        IssueCode.GEOM_NO_CATCHUP,
        IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN,
        IssueCode.TRIGGER_DISTANCE_UNSIGNED,
        IssueCode.TRIGGER_CUTIN_NOT_POSITIONAL,
        IssueCode.GEOM_CUTIN_LEAD_TOO_SHORT,
        IssueCode.GEOM_DRIFT_AFTER_PASS,
        IssueCode.GEOM_JAYWALK_IN_EGO_LANE,
        IssueCode.GEOM_JAYWALK_TRIGGER_TOO_CLOSE,
        IssueCode.GEOM_JAYWALK_NOT_FROM_SHOULDER,
        IssueCode.GEOM_RUN_RED_LIGHT_NOT_CROSSING_APPROACH,
        IssueCode.GEOM_ACTOR_BEYOND_ANCHOR_REACH,
    }
)


"""Một câu hỏi quyết định tất cả: *sửa nội dung LLM sinh ra có làm lỗi này biến mất không?*

Nếu không thì gửi cho LLM là đốt ba vòng để nhận về đúng lỗi cũ. Rate limit,
lỗi DB, bug template converter — LLM không sửa được cái nào.

``GUARDRAIL_VIOLATION`` nằm ngoài danh sách này vì lý do **an toàn**, không phải
vì hiệu quả: đưa một prompt injection vào vòng repair là tặng cho người tấn công
lượt thử thứ hai và thứ ba.
"""


WARNING_ONLY_CODES: frozenset[IssueCode] = frozenset({IssueCode.LANE_OFFSET_IMPLAUSIBLE})


"""Code chỉ được phép là ``warning``. Ép ở validator để không ai vô tình làm nó chặn luồng."""


class ValidationIssue(SpecModel):
    """Một lỗi/cảnh báo có cấu trúc. Đầu vào của repair prompt và của failure analysis.

    ``suggestion`` không phải trang trí: nó là thứ làm repair prompt hiệu quả.
    *"s_offset_m sai"* thì model đoán; *"muốn vượt lên rồi tạt thì phải xuất
    phát PHÍA SAU, s_offset_m âm"* thì model sửa được ngay.

    ⚠ Chỉ bốn trường đầu được đưa vào repair prompt. Không stack trace, không
    tên file, không câu SQL — vừa là an toàn, vừa giữ prompt ngắn.
    """

    @model_validator(mode="before")
    @classmethod
    def _drop_derived(cls, data: object) -> object:
        """Bỏ ``severity``/``repairable_by_llm`` nếu chúng có trong input.

        ``computed_field`` khiến hai trường này **có** trong ``model_dump()`` —
        đúng như ta muốn, vì reviewer và DB cần thấy chúng. Nhưng ``extra="forbid"``
        thì lại làm vòng ``dump -> validate`` vỡ, mà đó chính là đường đi của
        ``issue_history``: ghi JSONB xuống PostgreSQL rồi đọc lên lại ở W5 để
        làm failure analysis.

        Bỏ đi thay vì nhận: giá trị đúng luôn được suy ra từ ``code``. Một dòng
        DB cũ ghi ``severity="warning"`` cho ``GUARDRAIL_VIOLATION`` **không**
        được phép thắng code — đó đúng là lỗ hổng mà severity-dẫn-xuất sinh ra để bịt.
        """
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if k not in {"severity", "repairable_by_llm"}}
        return data

    code: IssueCode
    path: str = Field(default="", examples=["/actors/1/position/s_offset_m"], description="JSON pointer")
    message_vi: str = Field(..., min_length=1)
    suggestion: str = Field(default="", description="Sửa thế nào, viết cho model đọc")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def severity(self) -> IssueSeverity:
        """Dẫn xuất từ ``code``. **Không** phải trường ai cũng set được.

        Nếu để set tự do thì một chỗ nào đó gán
        ``ValidationIssue(code=GUARDRAIL_VIOLATION, severity=WARNING)`` là
        ``route_after_validate`` bỏ qua nó và trả ``promote`` — prompt injection
        đi thẳng qua cổng. Cùng lỗ hổng đó áp cho ``SCHEMA_INVALID`` và
        ``UNSUPPORTED_COMBINATION``: draft hỏng vẫn được promote.

        Một cờ mà set sai thì mất cả chốt chặn an toàn lẫn chốt chặn tính đúng
        đắn thì không nên tồn tại. Severity đi theo code, không đi theo người gọi.
        """
        return IssueSeverity.WARNING if self.code in WARNING_ONLY_CODES else IssueSeverity.ERROR

    @computed_field  # type: ignore[prop-decorator]
    @property
    def repairable_by_llm(self) -> bool:
        """Dẫn xuất từ ``code``, **không** phải một trường ai cũng tự set được.

        Nếu để mỗi chỗ sinh issue tự quyết boolean này thì sẽ có chỗ set sai, và
        cái giá của việc set sai là gửi stack trace cho LLM sửa.
        """
        return self.code in REPAIRABLE_CODES
