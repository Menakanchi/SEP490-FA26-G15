"""Điều kiện hình học của ``cut_in``. **Một định nghĩa, hai chỗ dùng.**

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
