"""Hợp đồng dữ liệu của Scenario Forge.

File này là **nguồn sự thật duy nhất** về hình dạng dữ liệu đi qua hệ thống.
Bốn người làm bốn nhánh khác nhau đều đọc file này thay vì đoán.

Luồng:

    câu tiếng Việt
        -> ScenarioSpec      (LLM sinh, Pydantic ép kiểu)
        -> .xosc             (converter.py, code thuần, KHÔNG có LLM)
        -> ExecutionResult   (worker GPU chạy ScenarioRunner)
        -> LibraryEntry      (vào Qdrant, quay lại làm few-shot)

Hai ranh giới cứng, đọc kỹ trước khi thêm trường:

1. ``ScenarioSpec`` phải **độc lập simulator** (ADR-005). Không được có
   blueprint CARLA, không được có tên map CARLA, không được có toạ độ theo
   hệ của CARLA. Việc dịch sang thứ CARLA hiểu là của ``converter.py``.
   Giữ được bất biến này thì thêm Isaac Sim sau là *viết converter thứ hai*,
   không phải viết lại. Phá nó là lời hứa trong ADR-005 thành nói dối.

2. ``src/`` **không bao giờ** ``import carla`` (ADR-001). Thứ đi qua ranh giới
   máy là chuỗi XML trong ``ScenarioJob.xosc_content``, không phải object Python.
   Hai venv khác version không chia sẻ object được.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
# Trục ODD — 5 x 4 x 3 x 4 = 240 ô (hạng mục nâng cao "Phủ ODD")
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


class ODDCell(ForgeModel):
    """Một ô trong ma trận ODD. 5 x 4 x 3 x 4 = 240 ô.

    ``coverage`` = tỉ lệ ô đã có ít nhất một scenario hợp lệ. Ngưỡng đạt: >= 0.75.
    """

    road_type: RoadType
    weather: Weather
    time_of_day: TimeOfDay
    actor_type: ActorType

    @property
    def key(self) -> str:
        """Khoá ổn định để đếm coverage và làm payload filter trong Qdrant.

        Mọi enum ở file này dùng ``StrEnum`` (Python 3.11+) chứ không phải
        ``(str, Enum)``. Lý do không phải thẩm mỹ: với ``(str, Enum)`` thì
        ``f"{RoadType.HIGHWAY}"`` cho ra ``"RoadType.HIGHWAY"``, và payload
        filter của Qdrant sẽ hỏng **im lặng** — không báo lỗi, chỉ là không khớp
        gì cả. ``StrEnum`` cho ra ``"highway"`` như mong đợi.

        ``test_odd_key_is_stable`` canh chỗ này; nó đã bắt được đúng lỗi đó một lần.
        """
        return "|".join(
            (
                self.road_type.value,
                self.weather.value,
                self.time_of_day.value,
                self.actor_type.value,
            )
        )


class ODDQuery(ForgeModel):
    """Nhãn ODD rút ra từ câu tiếng Việt. **Đầu ra của node `plan`.**

    Khác ``ODDCell`` ở chỗ **mọi trục đều có thể để trống**: câu *"xe máy tạt đầu
    lúc mưa"* chỉ nói được 2/4 trục. Lọc theo trục người dùng không hề nhắc tới là
    tự thu hẹp kết quả một cách vô căn cứ — sẽ bỏ sót đúng những ví dụ hữu ích.

    Node này chạy **trước** retrieve, không phải sau: payload filter của Qdrant cần
    nhãn để lọc, mà nhãn chính là thứ node này sinh ra. Đây cũng là lý do ADR-003
    chọn Qdrant — *vector search kết hợp payload filter*. Bỏ bước này thì phần
    "kết hợp" biến mất và ADR-003 mất một nửa lý do tồn tại.
    """

    road_type: RoadType | None = None
    weather: Weather | None = None
    time_of_day: TimeOfDay | None = None
    actor_type: ActorType | None = None

    def as_filter(self) -> dict[str, str]:
        """Payload filter cho Qdrant — **chỉ gồm trục thật sự được nói ra**."""
        pairs = (
            ("road_type", self.road_type),
            ("weather", self.weather),
            ("time_of_day", self.time_of_day),
            ("actor_type", self.actor_type),
        )
        return {k: v.value for k, v in pairs if v is not None}


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


class ManeuverType(StrEnum):
    """Hành vi mà chủ thể thực hiện khi trigger bắn.

    Danh sách này **đóng** có chủ đích: mỗi giá trị tương ứng một template
    ``.xosc`` mà converter biết dựng. LLM chỉ được chọn trong đây, không được
    tự bịa hành vi — đó là cách ta giữ tỉ lệ hợp lệ cao.
    """

    CUT_IN = "cut_in"  # tạt đầu
    SUDDEN_BRAKE = "sudden_brake"  # phanh gấp
    RUN_RED_LIGHT = "run_red_light"  # vượt đèn đỏ
    JAYWALK = "jaywalk"  # băng qua đường bất ngờ
    WRONG_WAY = "wrong_way"  # đi ngược chiều
    LANE_DRIFT = "lane_drift"  # lấn làn từ từ
    STOP_IN_LANE = "stop_in_lane"  # dừng chết giữa làn


class TriggerCondition(ForgeModel):
    """Điều kiện kích hoạt. Chỉ hỗ trợ khoảng cách và thời gian.

    Cố ý giữ hẹp: hai loại này phủ gần hết corner-case giao thông và
    ánh xạ 1-1 sang ``RelativeDistanceCondition`` / ``SimulationTimeCondition``
    của OpenSCENARIO 1.0.
    """

    type: Literal["distance_to_ego", "simulation_time"]
    value: float = Field(..., gt=0.0, description="mét nếu distance, giây nếu time")


class ManeuverSpec(ForgeModel):
    """Ai làm gì, khi nào. Đây là phần 'nguy hiểm' của kịch bản."""

    actor_name: str = Field(..., description="Trỏ tới ActorSpec.name")
    maneuver: ManeuverType
    trigger: TriggerCondition
    target_speed_kmh: float | None = Field(None, ge=0.0, le=150.0, description="Tốc độ sau khi thực hiện, nếu có")


class ScenarioSpec(ForgeModel):
    """Kịch bản ở dạng ngữ nghĩa. **Đầu ra của LLM, đầu vào của converter.**

    LLM chịu trách nhiệm ngữ nghĩa (ai, ở đâu, làm gì, khi nào).
    Converter chịu trách nhiệm cú pháp (tên element, hệ toạ độ, XML).
    Tách hai lớp để mỗi lỗi định vị được: lỗi cú pháp là bug của code (sửa một
    lần là hết), lỗi ngữ nghĩa là bug của prompt (đo được bằng eval).
    """

    scenario_id: str = Field(..., pattern=r"^sc_[0-9]{3,6}$", examples=["sc_001"])
    title: str = Field(..., min_length=1, max_length=120)
    description_vi: str = Field(..., min_length=1, description="Câu tiếng Việt gốc của người dùng")

    odd: ODDCell
    actors: list[ActorSpec] = Field(..., min_length=2, description="Ít nhất ego + 1 chủ thể")
    maneuvers: list[ManeuverSpec] = Field(..., min_length=1)

    duration_s: float = Field(30.0, gt=0.0, le=120.0, description="Trần thời gian mô phỏng")

    @model_validator(mode="after")
    def _check_refs(self) -> ScenarioSpec:
        egos = [a for a in self.actors if a.is_ego]
        if len(egos) != 1:
            raise ValueError(f"phải có đúng 1 ego, đang có {len(egos)}")

        names = {a.name for a in self.actors}
        if len(names) != len(self.actors):
            raise ValueError("tên actor bị trùng")

        for m in self.maneuvers:
            if m.actor_name not in names:
                raise ValueError(f"maneuver trỏ tới actor không tồn tại: {m.actor_name!r}")
            if m.actor_name == egos[0].name:
                raise ValueError(
                    "ego không được mang maneuver — ego là thứ ĐANG BỊ TEST, không phải thứ gây ra tình huống"
                )

            # Trigger bắn sau khi kịch bản đã dừng = hành vi không bao giờ chạy.
            # Kịch bản vẫn hợp lệ, vẫn chạy trót lọt, vẫn success=true — nhưng
            # KHÔNG CÓ GÌ XẢY RA. Đây đúng cái bẫy sc_002 mô tả, và nó làm hỏng
            # cả intent_match lẫn adversarial_found mà không báo lỗi ở đâu.
            if m.trigger.type == "simulation_time" and m.trigger.value >= self.duration_s:
                raise ValueError(
                    f"trigger bắn ở giây {m.trigger.value} nhưng kịch bản chỉ dài "
                    f"{self.duration_s}s — hành vi {m.maneuver.value!r} không bao giờ chạy"
                )

        # Nhãn ODD phải khớp thực tế. Nhãn này là thứ Qdrant lọc theo và là thứ
        # đếm ODD coverage; gắn nhãn "pedestrian" cho một kịch bản toàn ô tô sẽ
        # thổi phồng coverage và làm thư viện trả về kết quả sai nhãn.
        non_ego = {a.category.value for a in self.actors if not a.is_ego}
        if self.odd.actor_type.value not in non_ego:
            raise ValueError(
                f"odd.actor_type={self.odd.actor_type.value!r} nhưng không chủ thể nào "
                f"thuộc loại đó (đang có: {sorted(non_ego)})"
            )
        return self


# ---------------------------------------------------------------------------
# Kết quả chạy — ranh giới worker
# ---------------------------------------------------------------------------


class CriterionStatus(StrEnum):
    """Trạng thái một tiêu chí, theo đúng từ vựng của ScenarioRunner."""

    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    ACCEPTABLE = "ACCEPTABLE"
    TIMEOUT = "TIMEOUT"


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
    metrics: dict[str, float] = Field(default_factory=dict, examples=[{"total_ticks": 600, "duration_s": 30.0}])
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


class ReviewDecision(ForgeModel):
    """Một lần bấm duyệt.

    Luồng KHÔNG đứng chờ trong RAM. Tới cổng thì workflow **kết thúc** và ghi
    xuống DB trạng thái ``pending_review``; khi có quyết định thì một đường vào
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
    """Một dòng trong thư viện Qdrant.

    ``embedding_model`` ghi vào payload để biết vector nào sinh bằng model nào —
    đổi model embedding về sau bắt buộc re-embed toàn bộ corpus (ADR-006).
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
# Còn sót từ template — KHÔNG thuộc hợp đồng của Forge
# ---------------------------------------------------------------------------
# `src/api/routes.py` của template còn dùng hai model này. Giữ tạm để app không
# vỡ. Xoá cả khối này cùng lúc với route `/chat` khi Chi dựng router thật.


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    analysis: str = Field(default="", description="Phân tích nội bộ")
