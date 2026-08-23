"""Hợp đồng dữ liệu của Scenario Forge.

File này là **nguồn sự thật duy nhất** về hình dạng dữ liệu đi qua hệ thống.
Bốn người làm bốn nhánh khác nhau đều đọc file này thay vì đoán.

Luồng:

    câu tiếng Việt
        -> ODDQuery          (parse_intent, LLM — chỉ nhãn người dùng nói ra)
        -> ScenarioDraft     (generate_draft, LLM sinh — KHÔNG có scenario_id)
        -> ScenarioSpec      (backend promote: cấp id + copy câu gốc)
        -> .xosc             (converter.py, code thuần, KHÔNG có LLM)
        -> ExecutionResult   (worker GPU chạy ScenarioRunner)
        -> LibraryEntry      (vào thư viện, quay lại làm few-shot)

Ba ranh giới cứng, đọc kỹ trước khi thêm trường:

1. ``ScenarioSpec`` phải **độc lập simulator** (ADR-005). Không được có
   blueprint CARLA, không được có tên map CARLA, không được có toạ độ theo
   hệ của CARLA. Việc dịch sang thứ CARLA hiểu là của ``converter.py``.
   Giữ được bất biến này thì thêm Isaac Sim sau là *viết converter thứ hai*,
   không phải viết lại. Phá nó là lời hứa trong ADR-005 thành nói dối.

2. ``src/`` **không bao giờ** ``import carla`` (ADR-001). Thứ đi qua ranh giới
   máy là chuỗi XML trong ``ScenarioJob.xosc_content``, không phải object Python.
   Hai venv khác version không chia sẻ object được.

3. **LLM sinh ``ScenarioDraft``, không sinh ``ScenarioSpec``.** ``scenario_id``
   và ``description_vi`` là của backend: id để tránh trùng giữa các request,
   câu gốc để retrieval eval và DeepEval còn so lại được với thứ người dùng
   thật sự gõ. Đưa hai trường đó vào output của LLM là mời nó đặt trùng id
   (few-shot có ``sc_001`` thì nó trả ``sc_001``) và paraphrase câu gốc.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from enum import StrEnum
from typing import ClassVar, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator
from pydantic_core import PydanticCustomError


class ForgeModel(BaseModel):
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


# ---------------------------------------------------------------------------
# Trục ODD — 5 x 4 x 4 x 7 = 560 ô (hạng mục nâng cao "Phủ ODD")
# ---------------------------------------------------------------------------


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


class ODDCell(ForgeModel):
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


class SupportPolicy(ForgeModel):
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


class AssumptionSource(StrEnum):
    """Vì sao một trục ODD có giá trị mà người dùng không gõ ra.

    Hai nguồn, độ tin cậy khác hẳn nhau — reviewer ở cổng 1 cần biết cái nào
    đáng nghi hơn:

    - ``inferred`` — ``parse_intent`` đọc câu mà suy ra. *"người băng qua đường"*
      -> ``pedestrian`` + ``jaywalk``. Thường đúng, nhưng vẫn là suy luận.
    - ``default`` — code điền theo quy ước, câu không hề nhắc tới.

    **Không** có ``explicit``: trục người dùng nói thẳng thì *không sinh
    Assumption nào*. Vắng mặt chính là dấu hiệu, và một trạng thái không ai sinh
    ra sẽ chỉ làm nhánh xử lý chết trong UI.
    """

    INFERRED = "inferred"
    DEFAULT = "default"


class Assumption(ForgeModel):
    """Một giá trị hệ thống tự điền thay người dùng.

    **Không** nằm trong ``ScenarioSpec``: đây là metadata của *lần sinh này*,
    không phải thuộc tính của kịch bản. Spec đi vào ``LibraryEntry`` rồi quay
    lại làm few-shot — nhét assumption vào đó là dạy LLM rằng "trời quang" là
    một phần của câu hỏi. Chỗ ở đúng: ``ForgeState`` và một cột JSONB trong DB,
    hiển thị cho reviewer ở cổng 1.
    """

    field: str = Field(..., examples=["weather"])
    value: str = Field(..., examples=["clear"])
    source: AssumptionSource
    reason_vi: str = Field("", max_length=200)


def odd_axis_value(value: object, default: str = "unknown") -> str:
    """Một trục ODD -> **chuỗi enum**, bất kể nó tới dưới hình dạng nào.

    Trục ODD đi qua hệ thống dưới ba hình dạng, tuỳ tầng: giá trị enum
    (``RoadType.HIGHWAY``), chuỗi thuần (``"highway"`` — đọc lên từ DB hoặc từ
    JSON), và object ``{"category": ...}`` của ``parsed_intent``, nơi chữ người
    dùng gõ còn được giữ bên cạnh ô enum.

    Phép bóc này từng có **ba** bản: ở ``services/db.py``, ở
    ``agents/nodes/parse_intent.py`` và ở ``agents/nodes/retrieve.py`` — mỗi bản
    xử lý một tập con hình dạng khác nhau. Lệch ở đây không ném lỗi: nó ghi
    ``"RoadType.HIGHWAY"`` hoặc ``"unknown"`` vào cột mà ADR-013 lọc bằng
    ``WHERE``, và retrieval **trả rỗng trong im lặng**.

    ``default`` cho phép chỗ gọi chọn cách nói "không có": ``"unknown"`` khi giá
    trị sẽ được ghi xuống cột NOT NULL, ``""`` khi nó chỉ dùng để ghép câu.
    """
    if isinstance(value, dict):
        value = value.get("category")
    if value is None:
        return default
    return str(getattr(value, "value", value))


ODDAxis = Literal["road_type", "weather", "actor_type", "maneuver"]
"""Tên bốn trục ODD. Là ``Literal`` để lọt được vào strict structured output."""


class ODDQuery(ForgeModel):
    """Nhãn ODD rút ra từ câu tiếng Việt. **Đầu ra của node `parse_intent`.**

    Khác ``ODDCell`` ở chỗ **mọi trục đều có thể để trống**: câu *"xe máy tạt đầu
    lúc mưa"* chỉ nói được 2/4 trục. Lọc theo trục người dùng không hề nhắc tới là
    tự thu hẹp kết quả một cách vô căn cứ — sẽ bỏ sót đúng những ví dụ hữu ích.

    Node này chạy **trước** retrieve, không phải sau: retrieval cần nhãn để lọc,
    mà nhãn chính là thứ node này sinh ra. Đây là nửa "lọc" của *vector search
    kết hợp lọc ODD* (ADR-013). Bỏ bước này thì phần "kết hợp" biến mất và
    retrieval tụt về tìm vector thuần.

    **Đây là output DUY NHẤT của ``parse_intent``.** Generation cần đủ 4 trục
    (``ODDCell`` không cho trục nào rỗng) nhưng phần thiếu được điền bằng
    ``with_defaults()`` — một hàm thuần, test được bằng bảng tham số. Để LLM trả
    về hai phiên bản sự thật (một cho filter, một cho generation) là tự tạo ra
    một lớp bug không debug được: cùng một câu, retrieval hiểu một kiểu,
    generation hiểu kiểu khác, và không có gì trong log nói cho biết vì sao.

    ``inferred`` là **provenance từng trục**, không phải một giá trị thứ hai:
    nó chỉ nói *trục nào là suy luận chứ không phải người dùng gõ ra*. Thiếu nó
    thì một suy luận sai vừa lọc hẹp retrieval vừa **không hiện ra ở cổng 1** —
    reviewer không có cách nào biết "trời mưa" là do họ nói hay do máy đoán.
    """

    AXES: ClassVar[tuple[ODDAxis, ...]] = get_args(ODDAxis)

    road_type: RoadType | None = None
    weather: Weather | None = None
    actor_type: ActorType | None = None
    maneuver: ManeuverType | None = None

    specific_type: str | None = Field(
        default=None, max_length=120, description="Loại phương tiện chi tiết theo lời người dùng"
    )
    specific_action: str | None = Field(
        default=None, max_length=120, description="Hành vi chi tiết theo lời người dùng"
    )

    @field_validator("road_type", "weather", "actor_type", "maneuver", mode="before")
    @classmethod
    def _sentinel_means_empty(cls, value: object) -> object:
        """Model hay trả ``"unknown"`` thay vì bỏ trống trường — coi đó là rỗng.

        Trường rỗng ở đây có nghĩa **người dùng không nhắc tới trục này**, và
        ``with_defaults()`` sẽ điền kèm một ``Assumption`` để reviewer thấy.
        Một chuỗi ``"unknown"`` lọt qua thì Pydantic ném ``ValidationError`` và cả
        request chết, dù nội dung nó nói đúng điều mà ``None`` đã nói.

        Chỉ nhận các **sentinel rỗng**, cố ý không dịch từ vựng tiếng Việt ở đây:
        ánh xạ *"mưa bão" → heavy_rain* là việc của ``parse_intent`` (bảng từ
        khoá nằm ở ``src/schemas/taxonomy_rules.json``). Nhét nó vào contract thì
        converter, retriever và persistence cùng thừa hưởng một bảng từ vựng mà
        chúng không cần và không ai đi kiểm.
        """
        if isinstance(value, str) and value.strip().lower() in {"unknown", "none", "null", "n/a", ""}:
            return None
        return value

    inferred: list[ODDAxis] = Field(
        default_factory=list,
        description="Trục do parse_intent SUY RA, không phải người dùng gõ ra",
    )
    """``list[Literal]`` chứ **không** phải ``set[str]``, dù ngữ nghĩa là tập hợp chuỗi.

    ``Literal`` vì đây là schema gửi cho model: bốn tên trục thành enum trong JSON
    Schema, nên model **không sinh nổi** ``"time_of_day"``. Chặn ngay lúc sinh rẻ
    hơn hẳn bắt lúc validate — bắt lúc validate nghĩa là request đã tốn tiền rồi
    mới hỏng, và hỏng ở dạng khó sửa bằng repair vì nó là lỗi tên trường.

    ``list`` chứ không phải ``set``: Pydantic sinh ``uniqueItems: true`` cho set,
    mà strict structured output không hỗ trợ từ khoá đó — request bị từ chối
    **trước khi model chạy**, tức `parse_intent` chết ngay dòng đầu tiên. Tính duy
    nhất ép ở validator, chỗ nó không phải chui vào JSON Schema.
    """

    @model_validator(mode="after")
    def _inferred_must_point_at_filled_axes(self) -> ODDQuery:
        """Đánh dấu suy luận cho một trục rỗng là nói dối về nguồn gốc dữ liệu.

        Không cần kiểm "tên trục có tồn tại không" — ``ODDAxis`` là ``Literal``
        nên Pydantic đã chặn từ trước, và chặn ngay trong JSON Schema gửi cho model.
        """
        if empty := sorted(a for a in self.inferred if getattr(self, a) is None):
            raise ValueError(f"inferred đánh dấu trục đang rỗng: {empty}")
        # Khử trùng + thứ tự ổn định: log và snapshot test không được đổi theo
        # thứ tự model tình cờ liệt kê ra.
        object.__setattr__(self, "inferred", [a for a in self.AXES if a in set(self.inferred)])
        return self

    def as_filter(self) -> dict[str, str]:
        """Điều kiện lọc ODD cho retrieval — **chỉ gồm trục có giá trị**.

        Trục ``inferred`` **vẫn được lọc**. *"người băng qua đường"* suy ra
        ``pedestrian`` là gần như chắc chắn, và bỏ nó khỏi filter thì mất đúng
        cái lợi của *vector + lọc ODD*. Cái giá phải trả — suy luận sai
        thì lọc hẹp sai — được xử ở tầng retrieval: kết quả sau filter ít hơn
        ``k`` thì tìm lại lần nữa **bỏ các trục ``inferred``**. Đó là việc của
        ``services/library/search.py``, không phải của hợp đồng này.
        """
        return {a: v.value for a in self.AXES if (v := getattr(self, a)) is not None}

    def missing_required_axes(self) -> list[str]:
        """Trục **không được phép** điền default. Rỗng thì mới sinh được.

        ``actor_type`` và ``maneuver`` **là nội dung** của kịch bản, không phải
        bối cảnh. Điền đại ``maneuver=cut_in`` cho câu *"tình huống nguy hiểm ở
        ngã tư"* là tự bịa ra yêu cầu của người dùng — và nó làm hỏng đúng
        ``Danger trigger rate`` (PRD §8), thước đo hỏi *"gõ 'xe máy tạt
        đầu' thì trigger tạt đầu có bắn không"*. Nếu maneuver do code chọn thì
        metric đó đang đo code chứ không đo hệ thống.

        Thiếu thì trả ``422 NEED_MORE_DETAIL`` kèm gợi ý tương thích — rẻ hơn
        một vòng hội thoại, và không im lặng bịa.
        """
        return [name for name in ("actor_type", "maneuver") if getattr(self, name) is None]

    def with_defaults(self, policy: SupportPolicy | None = None) -> tuple[ODDCell, list[Assumption]]:
        """Điền nốt các trục **bối cảnh** bằng code thuần. Không gọi LLM.

        Chỉ ``road_type`` và ``weather`` — đoán sai bối cảnh cho ra kịch bản
        *vẫn dùng được, chỉ không đúng ý*, reviewer sửa được ở cổng 1 nên giá
        của sai lầm thấp. (``time_of_day`` không phải trục ODD; nó có default
        riêng ngay trong ``ScenarioSpec``.)

        Default **phải hỏi ``policy``**, không được chọn cứng. Câu *"xe máy tạt
        đầu"* không nói loại đường; điền cứng ``urban_straight`` trong khi
        catalog chỉ dựng được ``cut_in`` trên ``highway`` sẽ cho ra ``422
        UNSUPPORTED_COMBINATION`` — từ chối một yêu cầu vốn có lời giải hợp lệ,
        chỉ vì code tự chọn sai chỗ trống. Ưu tiên ``urban_straight``, không
        được thì lấy loại đường đầu tiên mà policy chấp nhận.

        Gọi ``missing_required_axes()`` trước; hàm này không tự quyết thay bạn.
        Không tổ hợp nào hợp lệ thì hàm vẫn trả về ô ưu tiên — việc từ chối là
        của precheck, để chỉ có **một** chỗ trong hệ thống nói câu "không hỗ trợ".
        """
        if missing := self.missing_required_axes():
            raise ValueError(f"không được điền default cho trục nội dung: {missing}")
        assert self.actor_type is not None and self.maneuver is not None  # missing_required_axes()

        policy = policy or DEFAULT_SUPPORT_POLICY
        assumptions: list[Assumption] = []

        def _note(field: str, value: StrEnum, source: AssumptionSource, reason: str) -> None:
            assumptions.append(Assumption(field=field, value=value.value, source=source, reason_vi=reason))

        # Trục do parse_intent suy ra: giá trị đã có sẵn, nhưng reviewer phải
        # thấy được rằng nó là suy luận chứ không phải lời người dùng.
        for axis in self.AXES:
            if axis in self.inferred:
                _note(axis, getattr(self, axis), AssumptionSource.INFERRED, "suy ra từ ngữ cảnh câu")

        road_type = self.road_type
        if road_type is None:
            preferred = (RoadType.URBAN_STRAIGHT, *RoadType)
            road_type = next(
                (r for r in preferred if policy.supports(r, self.actor_type, self.maneuver)),
                RoadType.URBAN_STRAIGHT,
            )
            _note("road_type", road_type, AssumptionSource.DEFAULT, "câu không nhắc tới, dùng mặc định")

        weather = self.weather
        if weather is None:
            weather = Weather.CLEAR
            _note("weather", weather, AssumptionSource.DEFAULT, "câu không nhắc tới, dùng mặc định")

        cell = ODDCell(
            road_type=road_type,
            weather=weather,
            actor_type=self.actor_type,
            maneuver=self.maneuver,
            specific_type=self.specific_type,
            specific_action=self.specific_action,
        )
        return cell, assumptions


# ---------------------------------------------------------------------------
# ScenarioSpec — biểu diễn trung gian, độc lập simulator
# ---------------------------------------------------------------------------


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


class Position(ForgeModel):
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


class ActorSpec(ForgeModel):
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


class TriggerCondition(ForgeModel):
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


class ManeuverSpec(ForgeModel):
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


class ScenarioCore(ForgeModel):
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


# ---------------------------------------------------------------------------
# Lỗi validate — thứ đi vào vòng repair, hoặc dừng hẳn
# ---------------------------------------------------------------------------


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


class ValidationIssue(ForgeModel):
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


# ---------------------------------------------------------------------------
# Kết quả chạy — ranh giới worker
# ---------------------------------------------------------------------------


class CriterionStatus(StrEnum):
    """Trạng thái một tiêu chí, theo đúng từ vựng của ScenarioRunner."""

    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    ACCEPTABLE = "ACCEPTABLE"
    TIMEOUT = "TIMEOUT"


class TrajectoryPoint(ForgeModel):
    """Một mẫu quỹ đạo **đo được** trong lúc chạy, dùng để vẽ lại cho người duyệt.

    Đây là dữ liệu đo, không phải mô hình. Phân biệt này là lý do trường tồn tại:
    bản preview 2D trước đây dựng lại hình học từ ``lane_offset`` rồi vẽ ra một
    thế giới không ai kiểm chứng — nên nó vẽ một cú tạt đầu đẹp đẽ cho đúng cái
    file mà thực tế là tông đuôi. Toạ độ ở đây lấy thẳng từ CARLA, kể cả
    ``lane_centre`` (tim làn của ego, hỏi từ map), nên không có bước suy diễn nào
    để sai.

    Chỉ hiện ở cổng ``BEFORE_LIBRARY``: trước khi chạy thì chưa có gì để vẽ, và
    vẽ dự đoán chính là thứ vừa bỏ đi.
    """

    t: float = Field(..., ge=0.0, description="Giây kể từ lúc bắt đầu ghi")
    ego: tuple[float, float, float] = Field(..., description="x, y, yaw(độ) của ego trong hệ toạ độ CARLA")
    adv: tuple[float, float, float] = Field(..., description="x, y, yaw(độ) của adversary")
    lane_centre: tuple[float, float] = Field(..., description="x, y tim làn ego đang đi — vẽ được mặt đường thật")
    rel: tuple[float, float] = Field(
        (0.0, 0.0),
        description=(
            "Vị trí adversary trong hệ quy chiếu ego: (dọc, ngang) mét. Dọc dương = ở trước ego. "
            "Đây là hệ toạ độ để VẼ cho người duyệt: ở hệ thế giới, một cú tạt đầu chỉ là vài pixel "
            "vì khung nhìn phải phủ hàng trăm mét đường."
        ),
    )


class CriterionResult(ForgeModel):
    """Kết quả một tiêu chí do ScenarioRunner chấm.

    ============================ ĐỌC KỸ ============================

    ``CollisionTest = FAILURE`` **thường là TIN TỐT.**

    Chữ FAILURE là góc nhìn của *xe đang bị test* ("xe này trượt bài kiểm tra
    va chạm"), KHÔNG phải góc nhìn của Forge ("kịch bản của tôi hỏng").

    Forge tồn tại để sinh ra kịch bản **nguy hiểm**. Chạy xong mà không va chạm
    gì thì kịch bản đó có thể vô dụng — nó không dựng lại được tình huống mà
    câu tiếng Việt mô tả.

    Hạng mục nâng cao "Săn lỗi xe tự hành" có ngưỡng ``adversarial_found >= 3``,
    và con số đó **chính là đếm số kịch bản làm ego va chạm**. Hiểu ngược dấu
    ở đây là cả đội đi tối thiểu hoá đúng cái đáng lẽ phải tối đa hoá.

    ================================================================
    """

    name: str = Field(..., examples=["CollisionTest", "DrivenDistanceTest", "MaxVelocityTest"])
    result: CriterionStatus
    actual: str = Field("", description="Giá trị thật, dạng chuỗi do ScenarioRunner in ra")


class ExecutionResult(ForgeModel):
    """Kết quả worker trả về sau khi chạy ScenarioRunner.

    Hai trục **tách rời**, đừng bao giờ trộn:

      - ``success``          -> kịch bản CHẠY ĐƯỢC không. Đây là thứ vào validity rate.
      - ``criteria_results`` -> kịch bản TÁI HIỆN ĐÚNG NGUY HIỂM không.

    Một kịch bản ``success=True`` kèm ``CollisionTest=FAILURE`` là kết quả
    lý tưởng: chạy trót lọt, và dựng được đúng tình huống nguy hiểm.
    """

    scenario_id: str
    xosc_path: str = Field(..., description="Đường dẫn file trên máy worker")

    success: bool = Field(
        ...,
        description=("ScenarioRunner chạy hết mà không crash / timeout / lỗi XML. KHÔNG có nghĩa là 'không va chạm'."),
    )
    criteria_results: list[CriterionResult] = Field(default_factory=list)
    metrics: dict[str, float] = Field(
        default_factory=dict,
        description=(
            "Số đo quỹ đạo do worker ghi trong lúc chạy (`worker/trajectory.py`). Các khoá đáng đọc: "
            "`min_distance_m` khe hở nhỏ nhất giữa hai thân xe — phân biệt 'suýt quẹt thật' với "
            "'chẳng có gì xảy ra', thứ `CollisionTest` mù hoàn toàn vì cả hai đều 0 va chạm; "
            "`contact_longitudinal_m` vị trí adversary lúc chạm, ÂM = nó tông đuôi ego, DƯƠNG = ego đâm nó, "
            "tức nó phân biệt cut_in đúng ý với tông đuôi trong khi criteria báo FAILURE cho cả hai; "
            "`adversary_lane_deviation_m` ~0 nghĩa là hành vi ngang không hề xảy ra; `ttc_min_s`. "
            "Khoá vắng mặt nghĩa là **không đo được**, không phải bằng 0."
        ),
        examples=[{"min_distance_m": 0.36, "ttc_min_s": 1.5, "adversary_lane_deviation_m": 0.7}],
    )
    trajectory: list[TrajectoryPoint] = Field(
        default_factory=list,
        description=(
            "Quỹ đạo đo được, đã giảm mẫu để gửi qua HTTP. Rỗng nghĩa là **không đo được** "
            "(worker cũ, CARLA từ chối kết nối, scenario chết trước khi spawn) — không phải xe đứng yên."
        ),
    )
    error: str | None = Field(None, description="Bắt buộc khi success=False")

    @model_validator(mode="after")
    def _error_required_on_failure(self) -> ExecutionResult:
        """Chạy hỏng thì phải nói hỏng vì sao.

        Một ``success=False`` không kèm ``error`` vẫn kéo validity rate xuống
        nhưng không ai debug được — nó biến một lần chạy hỏng thành một con số
        mất tích. Chặn ngay ở ranh giới, đừng để lọt vào báo cáo.
        """
        if not self.success and not (self.error or "").strip():
            raise ValueError("success=False thì bắt buộc có error — kịch bản hỏng phải nói vì sao")
        return self

    @property
    def had_collision(self) -> bool:
        """Ego có va chạm không. Dùng cái này để đếm adversarial, đừng đọc ``success``."""
        return any(c.name == "CollisionTest" and c.result is CriterionStatus.FAILURE for c in self.criteria_results)


# ---------------------------------------------------------------------------
# Job — thứ đi qua ranh giới máy
# ---------------------------------------------------------------------------


class JobStatus(StrEnum):
    PENDING = "pending"  # đã tạo, chưa worker nào nhận
    RUNNING = "running"  # worker đã nhận
    DONE = "done"
    FAILED = "failed"


class VerificationLevel(StrEnum):
    """Kịch bản đã được kiểm chứng tới đâu. **Trục thứ hai, không phải cổng.**

    ``ScenarioStatus`` trả lời *"có người chịu trách nhiệm giữ nó lại không"*.
    Enum này trả lời một câu khác hẳn: *"nó có thật sự tái hiện được nguy hiểm
    đã mô tả không"*. Gộp hai câu vào một trạng thái là chỗ hỏng của thiết kế
    cũ — không có ô nào diễn tả được "đã duyệt nhưng chạy ra không đúng ý",
    nên kịch bản kém nằm lại thư viện và tiếp tục làm few-shot.

    Vì sao dùng nhãn thay vì thêm một cổng duyệt thứ ba, hoặc một nút xoá:

    - Xoá là **mất thông tin**. Một kịch bản chạy không va chạm chưa chắc vô
      dụng — có khi chỉ lệch vài km/h. Vứt nó đi là vứt luôn bằng chứng đã chạy.
    - Ép người duyệt bấm thêm một lần nữa sau mỗi lần mô phỏng là bắt con người
      làm việc mà dữ liệu đã tự trả lời.
    - Có nhãn thì ``ODD coverage`` tách được thành hai con số: bao nhiêu ô đã
      phủ, và bao nhiêu ô đã phủ bằng kịch bản **đã kiểm chứng thật**.

    Chỉ ``ADVERSARIAL`` mới là thứ ta muốn nhân bản qua few-shot. Xem
    ``REPRODUCES_HAZARD`` bên dưới. Chi tiết ở ADR-017.
    """

    UNVERIFIED = "unverified"  # chưa chạy CARLA lần nào — mọi kịch bản mới đều ở đây
    ADVERSARIAL = "adversarial"  # chạy được VÀ dựng được tình huống nguy hiểm
    RAN_NO_HAZARD = "ran_no_hazard"  # chạy trót lọt nhưng KHÔNG có nguy hiểm nào
    EXECUTION_FAILED = "execution_failed"  # crash / timeout / lỗi XML


PROVEN_BAD_FOR_FEW_SHOT: frozenset[VerificationLevel] = frozenset(
    {VerificationLevel.RAN_NO_HAZARD, VerificationLevel.EXECUTION_FAILED}
)
"""Mức đã **chứng minh** là không nên dạy lại cho LLM.

Cố ý **không** gồm ``UNVERIFIED``: loại cả nó thì few-shot chết ngay, vì mọi
kịch bản mới sinh đều bắt đầu ở đó và cụm seed cũng phần lớn chưa chạy được
(ngoài phạm vi converter). Loại thứ *chưa chứng minh* khác hẳn loại thứ *đã
chứng minh là hỏng* — chỉ làm vế sau.
"""


def verification_from_execution(success: bool, criteria: list[CriterionResult]) -> VerificationLevel:
    """``ExecutionResult`` -> mức kiểm chứng. Code thuần, không phán đoán.

    ``CollisionTest = FAILURE`` là **tin tốt** (xem :class:`CriterionResult`):
    xe bị test trượt bài kiểm va chạm, tức kịch bản đã dựng được nguy hiểm.
    Đọc ngược dấu ở đây là cả hệ thống đi tối thiểu hoá đúng thứ phải tối đa hoá.
    """
    if not success:
        return VerificationLevel.EXECUTION_FAILED
    had_collision = any(
        c.name.lower().startswith("collision") and c.result is CriterionStatus.FAILURE for c in criteria
    )
    return VerificationLevel.ADVERSARIAL if had_collision else VerificationLevel.RAN_NO_HAZARD


ValidationMode = Literal["static", "sim"]
"""``static`` = chỉ validate XML, không cần GPU. ``sim`` = chạy thật trên worker.

Live URL luôn phục vụ được ở chế độ ``static`` kể cả khi worker tắt — đó là
bất biến của ADR-001 và là thứ giữ Deliverable #5 sống.
"""


class ScenarioJob(ForgeModel):
    """Payload đi từ backend sang worker GPU.

    Mang ``xosc_content`` (chuỗi XML) chứ **không** mang ``ScenarioSpec``, vì:
      - converter đã chạy xong ở cloud nên worker không cần biết converter là gì;
      - validate tĩnh đã xong trước khi qua ranh giới, rác không chạm tới GPU;
      - worker giữ được vai trò 'cục ngu': ghi file -> chạy -> POST kết quả.
    """

    job_id: str
    scenario_id: str
    xosc_content: str = Field(..., description="Nội dung file .xosc, không phải đường dẫn")
    status: JobStatus = JobStatus.PENDING
    created_at: datetime
    timeout_s: float = Field(120.0, gt=0.0)


# ---------------------------------------------------------------------------
# HITL — hai cổng duyệt
# ---------------------------------------------------------------------------


class ReviewGate(StrEnum):
    """Hai cổng người duyệt.

    ``BEFORE_SIM``     — trước khi đẩy job sang worker. Chạy sim ăn GPU khan hiếm,
                         và đề bài bắt điều khiển thiết bị phải có người phê duyệt.
    ``BEFORE_LIBRARY`` — trước khi vào thư viện. Quan trọng hơn: thư viện quay lại
                         làm few-shot, nên rác vào đây là rác nhân lên theo thời gian.
    """

    BEFORE_SIM = "before_sim"
    BEFORE_LIBRARY = "before_library"


class ScenarioStatus(StrEnum):
    DRAFT = "draft"
    PENDING_SIM_REVIEW = "pending_sim_review"  # workflow xong, chờ cấp phép GPU
    SIMULATION_QUEUED = "simulation_queued"  # đã duyệt BEFORE_SIM, chờ worker trả kết quả
    PENDING_LIBRARY_REVIEW = "pending_library_review"  # đã có bằng chứng CARLA, chờ duyệt thư viện
    APPROVED_SIM = "approved_sim"  # đã duyệt mô phỏng
    APPROVED_LIBRARY = "approved_library"  # cổng cuối đã duyệt, có embedding
    REJECTED = "rejected"  # bị từ chối ở một trong hai cổng


REVIEW_TRANSITIONS: dict[tuple[ScenarioStatus, ReviewGate, bool], ScenarioStatus] = {
    (ScenarioStatus.PENDING_SIM_REVIEW, ReviewGate.BEFORE_SIM, True): ScenarioStatus.SIMULATION_QUEUED,
    (ScenarioStatus.PENDING_SIM_REVIEW, ReviewGate.BEFORE_SIM, False): ScenarioStatus.REJECTED,
    (ScenarioStatus.PENDING_LIBRARY_REVIEW, ReviewGate.BEFORE_LIBRARY, True): ScenarioStatus.APPROVED_LIBRARY,
    (ScenarioStatus.PENDING_LIBRARY_REVIEW, ReviewGate.BEFORE_LIBRARY, False): ScenarioStatus.REJECTED,
}
"""Hai cổng không thể hoán đổi: BEFORE_SIM trước, BEFORE_LIBRARY sau CARLA.

Khoá gồm cả **cổng**, không chỉ trạng thái. Nếu chỉ khoá theo ``(từ, sang)`` thì
một quyết định gửi nhầm cổng — ``BEFORE_LIBRARY`` bấm lên một scenario đang
``pending_sim_review`` — vẫn lọt, và hai cổng HITL trở thành có thể hoán đổi cho
nhau. Đó đúng là thứ ràng buộc *"kỹ sư phải phê duyệt trước khi đưa vào bộ kiểm
thử"* của đề bài cấm.

Transition ``SIMULATION_QUEUED -> PENDING_LIBRARY_REVIEW`` do worker result,
không phải quyết định review, nên nằm riêng bên dưới.
"""


EXECUTION_TRANSITIONS: dict[ScenarioStatus, ScenarioStatus] = {
    ScenarioStatus.SIMULATION_QUEUED: ScenarioStatus.PENDING_LIBRARY_REVIEW,
}


def next_status_after_review(current: ScenarioStatus, gate: ReviewGate, approved: bool) -> ScenarioStatus | None:
    """Trạng thái kế tiếp, hoặc ``None`` nếu quyết định này không hợp lệ.

    ``None`` gồm cả trường hợp *đúng trạng thái nhưng sai cổng* — gọi hàm này
    rồi bỏ qua ``None`` là tự mở lại đúng lỗ vừa bịt.
    """
    return REVIEW_TRANSITIONS.get((current, gate, approved))


def next_status_after_execution(current: ScenarioStatus) -> ScenarioStatus | None:
    """Mở cổng thư viện chỉ sau khi worker đã trả bằng chứng thực thi."""
    return EXECUTION_TRANSITIONS.get(current)


DRAFT_TRANSITIONS: dict[ScenarioStatus, ScenarioStatus] = {
    ScenarioStatus.DRAFT: ScenarioStatus.PENDING_SIM_REVIEW,
}


ALLOWED_SCENARIO_TRANSITIONS: dict[ScenarioStatus, frozenset[ScenarioStatus]] = {
    status: frozenset(
        {target for (src, _, _), target in REVIEW_TRANSITIONS.items() if src is status}
        | ({EXECUTION_TRANSITIONS[status]} if status in EXECUTION_TRANSITIONS else set())
        | ({DRAFT_TRANSITIONS[status]} if status in DRAFT_TRANSITIONS else set())
    )
    for status in ScenarioStatus
}
"""Bản dẫn xuất *chỉ để kiểm tra hình dạng đồ thị* — đừng dùng để cho phép.

Nó cố tình được **sinh ra** từ :data:`REVIEW_TRANSITIONS` chứ không viết tay,
để không thể tồn tại một đường đi hợp lệ ở đây mà không hợp lệ ở kia.
"""


class ReviewDecision(ForgeModel):
    """Một lần bấm duyệt.

    Luồng KHÔNG đứng chờ trong RAM. Tới cổng thì workflow **kết thúc** và ghi
    xuống DB trạng thái ``pending_sim_review``; khi có quyết định thì một đường vào
    khác nhặt lên chạy tiếp.

    Lý do rất cụ thể: Render free tier ngủ khi không có request, nên mọi thứ
    'chờ' nằm trong bộ nhớ process đều chắc chắn chết.
    """

    scenario_id: str
    gate: ReviewGate
    approved: bool
    reviewer: str = Field(..., description="Ai chịu trách nhiệm — không được để trống")
    reason: str = Field("", max_length=1000, description="Bắt buộc khi approved=False")
    decided_at: datetime

    @model_validator(mode="after")
    def _accountability(self) -> ReviewDecision:
        """Cổng duyệt mà không có người chịu trách nhiệm thì không phải cổng duyệt.

        Đề bài ghi rõ: các quyết định điều khiển thiết bị **phải có người chịu
        trách nhiệm phê duyệt**. ``reviewer=""`` lọt qua nghĩa là HITL chỉ còn là
        một cái nút bấm — mất đúng thứ mà cả hai cổng sinh ra để bảo đảm.
        """
        if not self.reviewer.strip():
            raise ValueError("phải ghi rõ ai duyệt — cổng HITL không nhận reviewer rỗng")
        if not self.approved and not self.reason.strip():
            raise ValueError("từ chối thì phải ghi lý do — người sau cần biết vì sao")
        return self


# ---------------------------------------------------------------------------
# Thư viện
# ---------------------------------------------------------------------------


class LibraryEntry(ForgeModel):
    """Một dòng trong thư viện.

    ``embedding_model`` được lưu cạnh vector để biết vector nào sinh bằng model
    nào — đổi model embedding về sau bắt buộc re-embed toàn bộ corpus (ADR-006).
    Chỗ lưu là một cột cạnh cột BLOB trong cùng bảng (ADR-013).
    """

    scenario_id: str
    title: str
    description_vi: str
    odd: ODDCell
    tags: list[str] = Field(default_factory=list)

    xosc_path: str
    spec: ScenarioSpec
    last_execution: ExecutionResult | None = None

    embedding_model: str = Field("text-embedding-3-small")
    approved_by: str = Field(..., description="Ai duyệt ở cổng BEFORE_LIBRARY")
    created_at: datetime

    @model_validator(mode="after")
    def _ids_must_agree(self) -> LibraryEntry:
        """Ba chỗ mang scenario_id thì cả ba phải là một.

        Ghép nhầm ``spec`` của kịch bản này với ``last_execution`` của kịch bản
        khác là loại lỗi không bao giờ tự lộ ra: thư viện vẫn tra cứu được, UI
        vẫn hiển thị, chỉ có điều va chạm bị gán cho sai kịch bản. Nó làm hỏng
        cả retrieval eval lẫn ``adversarial_found`` mà không ai thấy.
        """
        if not self.approved_by.strip():
            raise ValueError("library entry phải ghi rõ người duyệt BEFORE_LIBRARY")
        if self.spec.scenario_id != self.scenario_id:
            raise ValueError(
                f"spec.scenario_id={self.spec.scenario_id!r} lệch với entry scenario_id={self.scenario_id!r}"
            )
        if self.last_execution and self.last_execution.scenario_id != self.scenario_id:
            raise ValueError(
                f"last_execution.scenario_id={self.last_execution.scenario_id!r} lệch với "
                f"entry scenario_id={self.scenario_id!r}"
            )
        return self


# ---------------------------------------------------------------------------
# Hợp đồng HTTP giữa frontend và backend
# ---------------------------------------------------------------------------
# Tách khỏi domain model (``ScenarioSpec``, ``ReviewDecision``, ...) có chủ đích:
# một bên là hình dạng JSON đi qua dây, bên kia là hình dạng dữ liệu nội bộ.
# Trộn hai thứ nghĩa là đổi một cột trong DB sẽ đổi luôn payload của frontend —
# và người sửa DB không có cách nào biết mình vừa làm vỡ FE.


GateType = Literal["before_library", "before_sim"]
"""Cổng duyệt dưới dạng chuỗi thuần cho tầng HTTP.

``Literal`` chứ không phải ``ReviewGate`` vì frontend gửi JSON, không gửi enum
Python. Quy đổi sang ``ReviewGate`` xảy ra trong route — đúng một chỗ, và chỗ đó
ném 400 nếu chuỗi lạ, thay vì để một giá trị không hợp lệ trôi vào tầng dưới.
"""


TOO_VAGUE_MESSAGE = "Mô tả kịch bản quá ngắn hoặc không đủ thông tin kịch bản giao thông."
"""Câu trả lời cho prompt rác. Cùng một câu ở HTTP 400 và ở guardrail của `parse_intent`."""


def is_too_vague_to_generate(prompt: str) -> bool:
    """Prompt rác: quá ngắn, quá ít từ, hoặc chỉ là một con số.

    Phép kiểm này chạy ở **hai** chỗ, và phải là **một** phép kiểm: tầng HTTP
    chặn sớm để không tốn một task nền, còn ``parse_intent`` chặn lại vì nó cũng
    được gọi thẳng từ test và từ graph, không chỉ qua route. Hai bản sao của
    cùng một ngưỡng thì lệch nhau vào lần đầu ai đó nới một bên — và bên còn lại
    sẽ từ chối đúng thứ bên kia vừa nhận, với cùng một thông báo lỗi.
    """
    text = prompt.strip()
    return len(text) < 10 or len(text.split()) < 3 or text.isnumeric()


_WHITESPACE_RUN = re.compile(r"\s+")


def normalize_prompt(prompt: str) -> str:
    """Khoá tra cứu trùng lặp của một câu mô tả (ADR-015 §15.2).

    NFC -> cắt hai đầu -> gộp khoảng trắng -> ``casefold()``. Đây là **nguồn sự
    thật duy nhất**: cả đường ghi (``create_generation_request``,
    ``persist_pending_sim_review``) lẫn đường tra đều gọi hàm này. Hai đường mà
    chuẩn hoá khác nhau thì tra không bao giờ trúng, và hỏng **im lặng** — không
    lỗi nào bắn ra, chỉ là tính năng chặn trùng ngừng hoạt động.

    **Không bỏ dấu tiếng Việt.** "tạt đầu" và "tát đầu" là hai câu khác nhau; bỏ
    dấu là gộp nhầm chúng làm một, và đây là khoá dùng để **không chạy lại** một
    lần sinh — gộp nhầm nghĩa là trả về kết quả của câu khác.

    NFC đứng trước ``casefold()`` vì thứ tự ngược lại không ổn định trên tổ hợp
    dấu tiếng Việt: cùng một câu gõ bằng Telex và bằng bàn phím Unicode dựng sẵn
    cho ra hai chuỗi code point khác nhau mà mắt người không phân biệt được.
    """
    text = unicodedata.normalize("NFC", prompt or "")
    return _WHITESPACE_RUN.sub(" ", text).strip().casefold()


class GenerateRequest(ForgeModel):
    """``POST /generate`` — body từ frontend.

    ``prompt`` giữ **nguyên văn** câu tiếng Việt (FR-01): đây là thứ được lưu lại
    và đem đối chiếu khi đo ``intent_match``, nên không được chuẩn hoá ở biên.
    """

    prompt: str = Field(..., min_length=1, max_length=5000, description="Câu mô tả tiếng Việt, giữ nguyên văn")
    created_by: str = Field(
        "unknown",
        max_length=255,
        description="Người tạo. Đề bài đòi hai vai trò tạo/duyệt — đây là vế thứ nhất.",
    )
    validation_mode: ValidationMode = "static"
    limit: int = Field(3, ge=1, le=20, description="Số kịch bản mẫu cần retrieve (top-k)")
    force_generate: bool = Field(
        False,
        description="Sinh mới kể cả khi câu này đã được sinh trước đó (ADR-015 §15.4).",
    )


class DuplicateMatch(ForgeModel):
    """Lần sinh cũ của **đúng câu này**, đính kèm phản hồi của ``POST /generate``.

    Không phải lỗi và không phải 4xx (ADR-015 §Hệ quả): người dùng vẫn được sinh
    mới bằng ``force_generate``. Đây là thông tin để họ quyết định.

    ``reason`` là trường đắt nhất ở đây. Với một kịch bản đã bị từ chối, nó nói
    vì sao hướng đó đã bị loại — thứ mà sinh lại lần nữa không bao giờ nói được,
    vì lần sinh mới chỉ tạo ra một bản anh-em-họ rồi vào lại hàng chờ duyệt.
    """

    scenario_id: str | None = None
    scenario_status: str | None = None
    title: str | None = None
    reason: str | None = Field(None, description="Lý do từ chối, nếu kịch bản cũ bị loại")
    request_status: str | None = Field(None, description="running/done/failed của lần sinh cũ")


class GenerateResponse(ForgeModel):
    """``POST /generate`` — response. Client dùng ``request_id`` để poll ``/status``.

    ``request_id`` là ``None`` **chỉ** khi câu này trùng với một kịch bản không
    có hàng ``generation_requests`` nào trỏ tới (dữ liệu seed, hoặc bản ghi từ
    trước khi có bảng đó). Không có gì để poll, nên client đọc thẳng
    ``duplicate.scenario_id``.
    """

    request_id: str | None = None
    duplicate: DuplicateMatch | None = None


class StatusResponse(ForgeModel):
    """``GET /status/{request_id}`` — response cho polling.

    ``step`` là tên node đang chạy, hoặc ``done``/``failed``. ``scenario_id`` chỉ
    có giá trị khi ``step == "done"`` — trước đó chưa có scenario nào tồn tại,
    và FR-14 cấm đẻ ra scenario giả cho một lần sinh chưa xong.
    """

    request_id: str
    step: str = Field("queued", description="Tên node đang chạy, hoặc done/failed")
    progress: int = Field(0, ge=0, le=100)
    scenario_id: str | None = None
    error: str | None = None


class ReviewApiRequest(ForgeModel):
    """``POST /review`` — quyết định HITL tại một cổng duyệt."""

    scenario_id: str = Field(..., min_length=1)
    gate: GateType
    approved: bool
    reviewer: str = Field(..., min_length=1, description="Tên người chịu trách nhiệm duyệt")
    reason: str = Field("", max_length=1000, description="Bắt buộc khi approved=False")


class TagUpdateRequest(ForgeModel):
    """``PUT /scenarios/{id}/tags`` — danh sách tag cuối cùng, không phải phần thêm."""

    tags: list[str] = Field(default_factory=list, max_length=20)


class ScenarioListResponse(ForgeModel):
    """``GET /scenarios`` — wrapper có ``total`` để frontend phân trang.

    ``items`` để ``list[dict]`` chứ không phải ``list[ScenarioSpec]``: danh sách
    thư viện trả về cả trạng thái, review log và metadata retrieval — những thứ
    không thuộc spec. Ép nó thành ``ScenarioSpec`` sẽ hoặc mất dữ liệu, hoặc kéo
    mấy trường HTTP đó ngược vào domain model.
    """

    items: list[dict] = Field(default_factory=list)
    total: int = 0
