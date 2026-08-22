"""Điều kiện hình học của ``cut_in`` và ``lane_drift``. **Một định nghĩa, hai chỗ dùng.**

Cùng bốn phép kiểm này chạy ở hai tầng, vì hai tầng cần hai thứ khác nhau:

- ``validate_node`` biến chúng thành ``ValidationIssue`` tiếng Việt kèm
  ``suggestion`` — thứ đi vào vòng repair của LLM;
- ``convert_xosc_node`` biến chúng thành ``ConversionError`` chặn hẳn — tới đó
  thì không còn ai sửa nữa, file .xosc sinh ra sẽ chạy thật trên GPU.

Trước đây mỗi tầng tự viết lấy số học. Hai bản sao của cùng một bất đẳng thức
hỏng theo kiểu tệ nhất có thể: **nới validator mà quên converter** thì draft đi
qua cổng duyệt rồi chết ở bước cuối với một thông báo tiếng Anh không repair
được; **siết validator mà quên converter** thì ba vòng repair đốt vào một kịch
bản mà converter vốn đã chấp nhận. Không có test nào bắt được kiểu lệch đó, vì
mỗi bên đều xanh khi test riêng.

Chỉ chứa **vị từ**, không chứa thông báo: câu chữ là việc của tầng gọi.
"""

from __future__ import annotations

from src.models.schemas import ActorSpec, ManeuverSpec


def cut_in_cannot_catch_up(actor: ActorSpec, ego: ActorSpec) -> bool:
    """Khoảng cách dọc không thu hẹp trước khi chủ thể tạt vào làn ego.

    Có hai hình học hợp lệ dùng cùng một OpenSCENARIO lane-change template:

    - vượt lên tạt đầu: actor ở sau và nhanh hơn ego;
    - từ lề/làn cạnh nhập vào: actor ở trước và chậm hơn ego, ego đuổi tới.

    Tích ``s_offset * relative_speed`` phải âm thì khoảng cách mới thu hẹp.
    Bằng 0 cũng không tạo điểm gặp nếu chỉ xét chuyển động đều trước trigger.
    """
    relative_speed = actor.initial_speed_kmh - ego.initial_speed_kmh
    return actor.position.s_offset_m * relative_speed >= 0


def cut_in_starts_in_ego_lane(actor: ActorSpec) -> bool:
    """Chủ thể xuất phát ngay trong làn của ego, nên không có làn nào để tạt sang.

    ``RelativeTargetLane value=0`` cũng làm ScenarioRunner 0.9.15 chết hẳn, nên
    đây vừa là lỗi ngữ nghĩa vừa là lỗi runtime.
    """
    return actor.position.lane_offset == 0


def cut_in_never_slows_down(maneuver: ManeuverSpec, actor: ActorSpec, ego: ActorSpec) -> bool:
    """Sau khi tạt vào làn, chủ thể vẫn không chậm hơn ego -> không thể va chạm.

    ``target_speed_kmh=None`` nghĩa là giữ nguyên ``initial_speed_kmh``, mà tốc
    độ đó buộc phải cao hơn ego (xem :func:`cut_in_cannot_catch_up`) — nên
    "không đặt tốc độ đích" rơi vào đúng trường hợp này, không phải một ca riêng.
    """
    post_speed = maneuver.target_speed_kmh if maneuver.target_speed_kmh is not None else actor.initial_speed_kmh
    return post_speed >= ego.initial_speed_kmh


def cut_in_trigger_is_unsigned(maneuver: ManeuverSpec) -> bool:
    """Trigger dùng khoảng cách, mà khoảng cách không phân biệt trước/sau ego.

    ``RelativeDistanceCondition`` trả trị tuyệt đối, nên nó bắn ngay lúc chủ thể
    còn **đằng sau** ego — tạt đầu vào khoảng không. Phải dùng
    ``simulation_time`` để nó vượt hẳn lên rồi mới tạt.
    """
    return maneuver.trigger.type != "simulation_time"


def time_until_alongside(actor: ActorSpec, ego: ActorSpec) -> float | None:
    """Giây thứ mấy thì hai xe đi ngang nhau, nếu điều đó xảy ra.

    Công khai vì ``validate_node`` cần **con số** chứ không chỉ cần biết đúng/sai:
    gợi ý sửa mà chỉ nói "đặt trigger sớm hơn" thì model phải tự làm phép chia
    ``s_offset / Δv`` — và đo trên output LLM thật ngày 22/08 thì nó không làm,
    nên hết ba vòng repair mà lỗi vẫn nguyên.

    ``None`` nghĩa là khoảng cách dọc không thu hẹp — chúng không bao giờ ngang
    nhau, và câu hỏi "lấn sớm hay muộn" không còn nghĩa.
    """
    gap_m = abs(actor.position.s_offset_m)
    closing_kmh = (
        ego.initial_speed_kmh - actor.initial_speed_kmh
        if actor.position.s_offset_m > 0
        else actor.initial_speed_kmh - ego.initial_speed_kmh
    )
    if closing_kmh <= 0:
        return None
    return gap_m / (closing_kmh / 3.6)


def lane_drift_trigger_too_late(maneuver: ManeuverSpec, actor: ActorSpec, ego: ActorSpec) -> bool:
    """Xe bắt đầu lấn làn sau khi ego đã đi ngang qua, nên lấn vào chỗ trống.

    ``lane_drift`` không dựng va chạm — nó dựng một lần **đi sát nhau**. Muốn có
    lần đó thì xe phải bắt đầu lệch **trước** thời điểm hai xe đi ngang nhau.

    Ngưỡng là "bắt đầu trước", không phải "lệch xong trước". Đo trên CARLA
    22/08, ba lần chạy cùng maneuver chỉ khác thời điểm trigger (khe hở ngang
    nhỏ nhất giữa hai thân xe):

    - ``sc_906`` trigger 5,5 s, ngang nhau ở 7,2 s -> **0,36 m**, suýt quẹt thật.
    - ``sc_906`` trigger 8,0 s, ngang nhau ở 7,2 s -> **0,51 m**; lệch chỉ thành
      hình khi ego đã qua, nên cái "sát" đó là quệt phần đuôi ego.
    - ``sc_901`` trigger 6,0 s, ngang nhau ở 4,5 s -> **1,01 m**, đúng bằng
      khoảng cách hai làn kề nhau lúc bình thường. Không có gì xảy ra.

    Lệch hết 0,7 m mất khoảng 2,3-2,5 s với ``maxLateralAcc=0.4`` mà converter
    đặt, nên bắt đầu càng sớm càng sát. Nhưng đòi "lệch xong trước lúc ngang
    nhau" thì chặn nhầm chính bản 5,5 s đã đo được là tốt — hai xe còn kề nhau
    thêm vài giây sau thời điểm đó, mà tính khoảng thời gian kề nhau lại cần
    chiều dài xe, thứ ``ScenarioSpec`` không có (kích thước xe nằm ở converter).
    Nên ngưỡng dừng ở chỗ dữ liệu đỡ được.

    ``CollisionTest`` trả 0 cho cả ba trường hợp, nên phép đo đó không phân biệt
    được. Đây là chỗ chặn rẻ nhất: bằng số học trên spec, trước khi tiêu GPU.

    Chỉ xét trigger ``simulation_time``; ``distance_to_ego`` bắn theo khoảng
    cách nên không so được với mốc thời gian — đó là câu hỏi riêng.
    """
    if maneuver.trigger.type != "simulation_time":
        return False
    alongside_s = time_until_alongside(actor, ego)
    if alongside_s is None:
        return False
    return maneuver.trigger.value >= alongside_s


MIN_CUT_IN_LEAD_M = 7.0
"""Chủ thể phải vượt lên trước ego ít nhất ngần này mét rồi mới được tạt vào.

Một thân xe ~4,5 m cộng khoảng an toàn. Đo trên bốn kịch bản chạy thật ngày
22/08: 4,67 m và 5,05 m đều thành tông đuôi; 8,33 m và 13,89 m đều tạt đầu đúng
ý. Ngưỡng nằm giữa hai cụm.

Bốn điểm dữ liệu là ít, nên con số này phải đo lại khi có batch lớn hơn — nhưng
nó có lý do vật lý chứ không phải khớp đường cong: tạt vào chỗ chưa vượt qua hết
thân xe thì theo định nghĩa là cắt ngang sườn, không phải cắt trước mũi.
"""


def _closing_speed_ms(actor: ActorSpec, ego: ActorSpec) -> float:
    """Tốc độ thu hẹp khoảng cách dọc, m/s. Luôn dương ở nhánh gọi nó."""
    return abs(actor.initial_speed_kmh - ego.initial_speed_kmh) / 3.6


def cut_in_trigger_before_overtake(maneuver: ManeuverSpec, actor: ActorSpec, ego: ActorSpec) -> bool:
    """Tạt đầu trước khi kịp vượt lên, nên nhập vào làn ego ở PHÍA SAU ego.

    ``cut_in`` là tạt **đầu**: chủ thể phải vượt qua ego rồi mới cắt vào làn. Nếu
    trigger bắn lúc nó còn phía sau, nó nhập làn sau lưng ego và — vì đang chạy
    nhanh hơn — đâm thẳng vào đuôi ego. Va chạm vẫn xảy ra, nên ``CollisionTest``
    vẫn báo "tìm được nguy hiểm"; chỉ là sai loại nguy hiểm so với câu người dùng
    gõ. Không phép đo nào ở tầng criteria phân biệt được hai thứ đó.

    Đo trên CARLA 22/08 với golden ``cut_in`` (adversary sau ego 25 m, 50 km/h so
    với ego 30 km/h, đi ngang nhau ở giây 4,5, trigger đặt ở giây 2,0): va chạm ở
    giây 4,72 với adversary nằm **sau ego 4,56 m**, và ego bị đẩy từ 8,4 lên
    11,6 m/s. Tông đuôi, không phải tạt đầu.

    Ngưỡng dùng lại :func:`_time_until_alongside` — cùng số học với
    :func:`lane_drift_trigger_too_late`, chỉ ngược dấu bất đẳng thức: lane_drift
    cần lệch **trước** lúc ngang nhau, cut_in cần cắt **sau** lúc đó.

    Chỉ xét trigger ``simulation_time``; ``distance_to_ego`` đã bị
    :func:`cut_in_trigger_is_unsigned` chặn từ trước vì lý do liên quan.
    """
    if maneuver.trigger.type != "simulation_time":
        return False
    alongside_s = time_until_alongside(actor, ego)
    if alongside_s is None:
        return False

    # Vượt qua thôi chưa đủ — phải vượt **đủ xa**. Thứ quyết định không phải biên
    # thời gian mà là khoảng cách đã vượt lên được lúc bắt đầu tạt: dưới một thân
    # xe thì nó cắt vào ngay sườn ego chứ không phải trước mũi.
    #
    # Bốn kịch bản cut_in chạy thật ngày 22/08, sắp theo khoảng vượt lúc trigger:
    #
    #   sc_022  4,67 m  -> tông đuôi ego (contact_longitudinal âm)
    #   sc_021  5,05 m  -> tông đuôi ego
    #   sc_011  8,33 m  -> tạt đầu đúng ý
    #   sc_012 13,89 m  -> tạt đầu đúng ý
    #
    # Hai cụm tách bạch quanh một thân xe (~4,5 m) cộng khoảng an toàn.
    lead_m = (maneuver.trigger.value - alongside_s) * _closing_speed_ms(actor, ego)
    return lead_m < MIN_CUT_IN_LEAD_M


def jaywalk_starts_in_ego_lane(actor: ActorSpec) -> bool:
    """Người đi bộ xuất phát ngay trong làn ego, nên không có gì để "băng ngang".

    Converter đã chặn từ trước, nhưng chặn ở đó là **terminal**: workflow chết mà
    không repair lần nào, dù lỗi sửa được bằng đúng một số. Đo trên chiến dịch
    ODD ngày 22/08: ô ``jaywalk`` hỏng hai lần liên tiếp vì LLM đặt
    ``lane_offset=0``, và cả hai lần đều không có vòng sửa nào chạy.

    Đưa lên validate thì nó thành ``ValidationIssue`` repair được; chốt ở
    converter giữ nguyên làm hàng rào cuối.
    """
    return actor.position.lane_offset == 0


LANE_WIDTH_M = 3.5
"""Bề rộng một làn. Dùng để quy độ lệch làn ra quãng đường người đi bộ phải bước."""


def jaywalk_walking_speed_kmh(maneuver: ManeuverSpec, actor: ActorSpec) -> float:
    """Tốc độ đi bộ thật sự dùng khi chạy: ``target_speed_kmh`` thắng tốc độ ban đầu.

    Converter phát một ``SpeedAction`` đặt tốc độ này ngay khi sự kiện bắt đầu,
    nên nó — chứ không phải ``initial_speed_kmh`` — quyết định người đi bộ mất bao
    lâu để sang tới làn ego.
    """
    return maneuver.target_speed_kmh if maneuver.target_speed_kmh else actor.initial_speed_kmh


def jaywalk_required_trigger_m(maneuver: ManeuverSpec, actor: ActorSpec, ego: ActorSpec) -> float | None:
    """Ego phải còn cách bao xa lúc người đi bộ bước xuống, để hai bên gặp nhau.

    Quãng đường phải bước = số làn lệch × bề rộng làn. Chia cho tốc độ đi bộ ra
    thời gian; nhân với tốc độ ego ra khoảng cách cần thiết.

    ``None`` khi không tính được (đứng sẵn trong làn ego, hoặc tốc độ bằng 0).
    """
    lanes = abs(actor.position.lane_offset)
    walk_ms = jaywalk_walking_speed_kmh(maneuver, actor) / 3.6
    if lanes == 0 or walk_ms <= 0 or ego.initial_speed_kmh <= 0:
        return None
    seconds_to_cross = (lanes * LANE_WIDTH_M) / walk_ms
    return (ego.initial_speed_kmh / 3.6) * seconds_to_cross


def jaywalk_trigger_too_close(maneuver: ManeuverSpec, actor: ActorSpec, ego: ActorSpec) -> bool:
    """Người đi bộ bước xuống quá muộn, ego đã đi qua trước khi họ tới nơi.

    Đo trên ``sc_026`` ngày 22/08: ego 88 km/h, người đi bộ 6 km/h lệch một làn,
    trigger đặt ở **18 m**. Người đi bộ cần 2,1 giây để bước qua 3,5 m, trong khi
    ego đi hết 18 m chỉ trong 0,7 giây. Kết quả đo: khe hở nhỏ nhất **107 m** —
    hai bên chưa bao giờ ở gần nhau.

    Cần ego còn cách ~51 m lúc đó. Đây là cùng một họ lỗi với
    :func:`lane_drift_trigger_too_late` và :func:`cut_in_trigger_before_overtake`
    — hành vi xảy ra sai thời điểm — chỉ khác là ``jaywalk`` kích hoạt theo
    **khoảng cách** nên phép tính đi theo đường khác.

    Ngưỡng nới 30%: chưa tính thời gian phản ứng của bộ điều khiển và độ trễ khi
    người đi bộ bắt đầu bước, nên chặn sát quá sẽ loại nhầm kịch bản dùng được.
    """
    if maneuver.trigger.type != "distance_to_ego":
        return False
    required = jaywalk_required_trigger_m(maneuver, actor, ego)
    if required is None:
        return False
    return maneuver.trigger.value < required * 0.7


def actor_beyond_anchor_reach(actor: ActorSpec, reach_m: tuple[float, float]) -> bool:
    """Chủ thể đặt ra ngoài đoạn đường mà anchor phủ được.

    ``Position.s_offset_m`` cho phép ±200 vì đó là biên của kiểu dữ liệu. Biên
    THẬT là của anchor: ScenarioRunner giải ``RelativeLanePosition`` bằng số học
    lane_id so với ego, nên ra khỏi đoạn mà làn giữ nguyên định danh thì lane
    đích không tồn tại.

    Triệu chứng khi lọt: ``Error: Unable to add actors`` — một thông báo không
    nhắc gì tới khoảng cách, nên rất khó lần ra. Hai kịch bản `wrong_way` đặt
    actor ở +120 m chết đúng kiểu đó ngày 22/08, trong khi mọi kịch bản
    |s_offset| <= 35 m đều chạy.
    """
    backward, forward = reach_m
    return not (backward <= actor.position.s_offset_m <= forward)
