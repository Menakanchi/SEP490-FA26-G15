"""Đo quỹ đạo trong lúc ScenarioRunner chạy, để trả lời *ý định có xảy ra không*.

Vì sao cần thứ này
------------------
``criteria_results`` của ScenarioRunner chỉ nói **có va chạm hay không**. Ngày
22/08/2026, ba lỗi ngữ nghĩa lọt qua cả 355 test lẫn toàn bộ criteria — chỉ lộ
ra khi đọc quỹ đạo:

1. Bốn maneuver kết thúc sau ~2,6 giây, ego mới đi 16,6 m. ``CollisionTest`` báo
   0 va chạm, đúng như một kịch bản hiền lành.
2. ``lane_drift`` lấn **ngược hướng** suốt từ đầu. Cũng 0 va chạm — mà maneuver
   này vốn không dựng va chạm, nên 0 trông như đúng.
3. ``cut_in`` tạt vào làn ego khi còn ở **sau** ego rồi tông đuôi. ``CollisionTest``
   báo FAILURE = "tìm được nguy hiểm", nên bản hỏng trông y hệt bản đúng.

Ba lỗi, ba kiểu, và không cái nào phân biệt được bằng criteria. Bốn số dưới đây
phân biệt được cả ba.

Ranh giới
---------
``import carla`` nằm **trong hàm**, không ở đầu file có chủ đích: phần toán ở
đây là hàm thuần trên list ``Sample``, nên bộ test của backend (Python 3.12,
không có carla) import được và kiểm được bằng dữ liệu dựng tay. Chỉ
:func:`record_run` mới cần CARLA thật.

Phụ thuộc: chỉ thư viện chuẩn, như phần còn lại của ``worker/``.
"""

from __future__ import annotations

import math
import threading
from dataclasses import dataclass

EGO_ROLE = "hero"

SAME_CORRIDOR_M = 2.5
"""Lệch ngang bao nhiêu thì còn coi là "cùng hành lang" khi tính TTC.

Làn rộng ~3,5 m. Quá ngưỡng này thì hai xe ở hai làn khác nhau và khoảng cách
dọc thu hẹp không còn nghĩa là sắp đâm nhau — tính TTC ở đó ra một con số nhỏ
đáng sợ cho một tình huống vượt xe hoàn toàn bình thường.
"""

MOVING_THRESHOLD_MS = 0.5
"""Trên ngưỡng này thì coi là actor đã thật sự bắt đầu chạy.

Dùng để cắt bỏ các tick đầu, lúc bộ ghi đã chạy mà ScenarioRunner chưa áp tốc độ
ban đầu. Xem :func:`_from_first_movement`.
"""

MIN_CLOSING_SPEED_MS = 0.1
"""Dưới ngưỡng này coi như không thu hẹp; chia cho nó ra TTC vô nghĩa lớn."""


@dataclass(frozen=True)
class Sample:
    """Một tick: vị trí tương đối của adversary trong hệ quy chiếu của ego."""

    t: float
    longitudinal_m: float
    """Dương = adversary ở TRƯỚC ego. Dấu của nó là thứ phân biệt tạt đầu với tông đuôi."""
    lateral_m: float
    """Dương = adversary ở bên phải ego."""
    gap_lon_m: float
    """Khe hở dọc giữa hai thân xe. Âm = hai hộp bao chồng nhau theo chiều dọc."""
    gap_lat_m: float
    """Khe hở ngang giữa hai thân xe. Âm = chồng nhau theo chiều ngang."""
    ego_speed_ms: float
    adv_speed_ms: float
    adv_lane_offset_m: float
    """Adversary lệch bao nhiêu so với tim làn nó đang ở. Dùng để biết maneuver có xảy ra không."""
    ego_throttle: float = 0.0
    ego_brake: float = 0.0
    ego_steer: float = 0.0
    ego_lane_offset_m: float = 0.0
    ego_half_width_m: float = 0.9
    """Nửa bề rộng thân ego. Cần để tính mép thân xe, không chỉ tâm xe."""
    adv_half_width_m: float = 0.9
    ego_pose: tuple[float, float, float] = (0.0, 0.0, 0.0)
    """x, y, yaw(độ) của ego trong hệ toạ độ CARLA — để vẽ lại cho người duyệt."""
    adv_pose: tuple[float, float, float] = (0.0, 0.0, 0.0)
    lane_centre: tuple[float, float] = (0.0, 0.0)
    """Tim làn ego đang đi, hỏi thẳng map. Vẽ được mặt đường mà không phải suy diễn."""
    adv_red_light_active: bool = False
    """Một đèn đỏ đang trực tiếp chi phối adversary ở tick này."""
    adv_crossed_red_light: bool = False
    """Sticky flag: adversary đã rời vùng chi phối khi đèn vẫn đỏ và còn chạy."""
    adv_traffic_light_id: int | None = None


def summarise(samples: list[Sample]) -> dict[str, float]:
    """Rút list tick thành bốn con số đi vào ``ExecutionResult.metrics``.

    - ``min_distance_m`` — khe hở nhỏ nhất giữa hai **thân xe** (không phải
      tâm-tâm). 0 nghĩa là đã chạm. Đây là thứ phân biệt "suýt quẹt thật" với
      "chẳng có gì": đo được 0,36 m ở bản `lane_drift` đúng, 1,01 m ở bản mà xe
      lấn sau khi ego đã đi khỏi — trong khi ``CollisionTest`` trả 0 cho cả hai.
    - ``ttc_min_s`` — thời gian tới va chạm nhỏ nhất, chỉ tính khi hai xe còn
      cùng hành lang và khoảng cách đang thu hẹp.
    - ``adversary_min_speed_ms`` / ``adversary_speed_drop_ms`` — để chấm được các
      maneuver dọc (`sudden_brake`, `stop_in_lane`): xe có thật sự chậm lại không.
    - ``contact_longitudinal_m`` — vị trí adversary lúc **chạm đầu tiên**. Âm =
      nó ở sau ego, tức nó tông đuôi ego. Dương = ego đâm vào nó.
    - ``adversary_lane_deviation_m`` — độ lệch tim làn lớn nhất. Bằng ~0 nghĩa
      là hành vi ngang **không hề xảy ra**, dù kịch bản chạy hết và không lỗi.

    Mọi số trên chỉ tính tới **va chạm đầu tiên**; ``trajectory_samples`` thì đếm
    cả lượt. Sau cú đâm, xe bị hất khỏi làn nên số đo hành vi thành vô nghĩa.

    Trả về dict rỗng khi không có mẫu nào: worker vẫn gửi kết quả về, chỉ là
    không kèm số quỹ đạo — thiếu số còn hơn số bịa.
    """
    if not samples:
        return {}

    contact_index = next(
        (i for i, s in enumerate(samples) if s.gap_lon_m < 0 and s.gap_lat_m < 0),
        None,
    )
    contact = samples[contact_index] if contact_index is not None else None

    # Cắt tại va chạm đầu tiên. Sau cú đâm, xe bị hất khỏi làn và mọi số đo hành
    # vi thành rác: đo trên sc_001 ngày 22/08, tính cả phần sau va chạm cho
    # `adversary_lane_deviation_m` = 21,18 m — xe máy nằm giữa đồng, chứ không
    # phải nó đã lấn 21 mét. Cùng lý do khiến `CheckDrivenDistance` = 486 m trong
    # đó ~300 m là sau khi đã đâm.
    before_contact = samples[: contact_index + 1] if contact_index is not None else samples

    min_distance = min(_freespace_distance(s) for s in before_contact)

    metrics = {
        "trajectory_samples": float(len(samples)),
        "min_distance_m": round(min_distance, 3),
        "adversary_lane_deviation_m": round(max(abs(s.adv_lane_offset_m) for s in before_contact), 3),
    }

    # Tốc độ adversary: hai số này làm cho `sudden_brake` và `stop_in_lane` chấm
    # được ý định. Không có chúng thì chỉ maneuver ngang mới kiểm chứng được, còn
    # maneuver dọc chỉ biết "có va chạm hay không" — đúng cái mù mà checker sinh
    # ra để vá.
    # Đo TỪ LÚC ACTOR ĐÃ CHUYỂN ĐỘNG, không đo từ tick đầu tiên.
    #
    # Bộ ghi chạy trước khi ScenarioRunner kịp áp tốc độ ban đầu, nên mẫu đầu
    # luôn là 0 m/s. Đo cả nó thì `adversary_min_speed_ms` = 0 ở **mọi** kịch bản
    # — đo được ngày 23/08/2026 trên cả 17 lượt, kể cả `lane_drift` (xe không bao
    # giờ dừng) lẫn `jaywalk` (người đi bộ đi liên tục).
    #
    # Đó không phải một con số hơi lệch, nó làm hai luật chấm thành RỖNG NGHĨA:
    # `stop_in_lane` hỏi "tốc độ nhỏ nhất <= 0,5 m/s?" nên luôn ĐÚNG, còn
    # `adversary_speed_drop_ms` = max - min thực chất đang đo *tốc độ ban đầu* chứ
    # không đo phanh, nên `sudden_brake` cũng luôn ĐÚNG.
    moving = _from_first_movement(before_contact)
    if moving:
        speeds = [s.adv_speed_ms for s in moving]
        metrics["adversary_min_speed_ms"] = round(min(speeds), 3)
        metrics["adversary_speed_drop_ms"] = round(max(speeds) - min(speeds), 3)

    # Tín hiệu phản ứng của ego controller. Bỏ phần đứng yên trước Init nhưng
    # giữ mọi mẫu sau khi ego bắt đầu chạy, kể cả nó phanh về 0.
    ego_start = next(
        (index for index, sample in enumerate(before_contact) if sample.ego_speed_ms > MOVING_THRESHOLD_MS),
        None,
    )
    ego_motion = before_contact[ego_start:] if ego_start is not None else []
    if ego_motion:
        ego_speeds = [sample.ego_speed_ms for sample in ego_motion]
        peak_index = max(range(len(ego_speeds)), key=ego_speeds.__getitem__)
        post_peak_speeds = ego_speeds[peak_index:]
        metrics["ego_min_speed_ms"] = round(min(ego_speeds), 3)
        metrics["ego_speed_drop_ms"] = round(max(ego_speeds) - min(ego_speeds), 3)
        metrics["ego_peak_speed_ms"] = round(ego_speeds[peak_index], 3)
        metrics["ego_post_peak_min_speed_ms"] = round(min(post_peak_speeds), 3)
        metrics["ego_post_peak_speed_drop_ms"] = round(
            ego_speeds[peak_index] - min(post_peak_speeds),
            3,
        )
    max_brake = max((sample.ego_brake for sample in before_contact), default=0.0)
    metrics["ego_max_brake"] = round(max_brake, 3)
    metrics["ego_braked"] = 1.0 if max_brake >= 0.1 else 0.0
    metrics["ego_max_abs_steer"] = round(max((abs(sample.ego_steer) for sample in before_contact), default=0.0), 3)
    metrics["ego_max_lane_deviation_m"] = round(
        max((abs(sample.ego_lane_offset_m) for sample in before_contact), default=0.0),
        3,
    )
    steering_signs = [
        1 if sample.ego_steer > 0 else -1
        for sample in before_contact
        if abs(sample.ego_steer) >= 0.05
    ]
    metrics["ego_steering_reversals"] = float(
        sum(current != previous for previous, current in zip(steering_signs, steering_signs[1:], strict=False))
    )

    # Bộ đo an toàn thay thế (surrogate safety measures) dùng chung trong ngành —
    # ISO 34502 và phần lớn công trình scenario-based testing báo cáo theo chúng.
    # Có ba số này thì bảng metric nói cùng ngôn ngữ với tài liệu tham chiếu, thay
    # vì chỉ có "khoảng cách nhỏ nhất" tự đặt tên.
    metrics.update(_surrogate_safety(before_contact))

    # Hai tín hiệu cho maneuver mà bốn số kia mù: người đi bộ băng ngang, và xe
    # đi ngược chiều. Không có chúng thì `jaywalk` với `wrong_way` mãi ở trạng
    # thái "chưa chấm được" — mà chấm bừa bằng `adversary_lane_deviation_m` thì
    # sai hẳn: người đi bộ rời khỏi mặt đường nên "lệch tim làn" của họ đo được
    # 39,9 m ở sc_026, một con số không mang nghĩa gì.
    # LUÔN phát khoá này, kể cả khi bằng 0. Chỉ phát lúc True thì "vắng mặt" mang
    # hai nghĩa chồng nhau — "worker cũ không đo" và "đo rồi, không băng qua" —
    # và tầng chấm điểm không tách được, nên nó phải trả "chưa chấm được" cho cả
    # hai. Đúng chuyện xảy ra với sc_026 ngày 22/08.
    metrics["adversary_crossed_ego_path"] = 1.0 if _crossed_ego_path(before_contact) else 0.0

    # Có thật sự lấn vào làn ego không — đo bằng khoảng cách ngang trong hệ quy
    # chiếu ego, KHÔNG bằng `adversary_lane_deviation_m`.
    #
    # Vì sao chỉ số kia không dùng được cho việc này: `_lane_offset` chiếu xe lên
    # **làn nó đang ở**. Khi xe vượt qua vạch, waypoint nhảy sang làn mới và độ
    # lệch tụt về gần 0 — nó bão hoà ở nửa bề rộng làn rồi quay đầu, nên một xe
    # lấn hẳn sang làn ego và một xe chỉ bám sát vạch cho ra con số như nhau.
    #
    # Đo trên ba lượt chạy ngày 23/08/2026, đối chiếu với người chấm tay:
    #   sc_024 lane_drift 2,80 m -> chưa vào (người chấm: sai)
    #   sc_019 lane_drift 3,09 m -> chưa vào (người chấm: sai)
    #   sc_011 cut_in     0,03 m -> đã vào   (người chấm: đúng)
    # Đo bằng MÉP THÂN XE, không phải tâm xe. "Lấn làn đè vạch" nghĩa là thân xe
    # đè qua vạch; đòi tâm xe vượt vạch là đòi nó nằm hẳn trong làn ego, và với
    # một ego chạy thẳng thì đó luôn là va chạm chứ không còn là suýt va chạm.
    #
    # Người xem trực tiếp ngày 23/08/2026 bắt được đúng chỗ này: bản đặt biên độ
    # theo tâm xe (2,2 m) làm hai xe đâm nhau, "lần này thì tôi thấy nó còn va
    # chạm nhau rồi".
    lateral = [abs(s.lateral_m) for s in before_contact]
    incursion = max(EGO_LANE_HALF_WIDTH_M - (abs(s.lateral_m) - s.adv_half_width_m) for s in before_contact)
    metrics["adversary_min_lateral_m"] = round(min(lateral), 3)
    metrics["adversary_lane_incursion_m"] = round(incursion, 3)
    metrics["adversary_entered_ego_lane"] = 1.0 if incursion > 0 else 0.0

    # Lúc **vào làn và giữ hướng đi vào**, tác nhân đang ở trước hay sau ego.
    # Dương = trước. Xem `_lane_entry_longitudinal`: bỏ lần lắc nhẹ qua vạch rồi
    # quay ra của actor rộng trước khi maneuver chính bắt đầu.
    #
    # Đây là thứ phân biệt tạt đầu thật với nhập làn sau lưng rồi bám đuôi. Luật
    # cũ chỉ chặn được trường hợp có va chạm (`contact_longitudinal_m < 0`), nên
    # một cú cắt vào sau lưng mà không đâm ai thì lọt sạch: `sc_022` vào làn ego ở
    # **-8,25 m sau lưng**, khe hở 2,79 m, không va chạm — máy chấm ĐÚNG, người
    # xem trực tiếp trên CARLA nói "lúc ego đi qua rồi mới thấy xe máy nó tạt
    # sang". Người đúng.
    entry = _lane_entry_longitudinal(before_contact)
    if entry is not None:
        metrics["adversary_entry_longitudinal_m"] = round(entry, 3)
    heading = _max_heading_delta_deg(before_contact)
    if heading is not None:
        metrics["adversary_heading_delta_deg"] = round(heading, 1)

    # Tín hiệu chuyên biệt cho run_red_light. ``adv_crossed_red_light`` được
    # recorder chốt tại transition: xe từng chịu một đèn RED, rồi rời vùng ảnh
    # hưởng của chính đèn đó trong khi vẫn chuyển động. Converter giữ đèn đỏ nên
    # transition này chính là lúc xe vượt vạch, không phải lúc pha đổi xanh.
    encountered_red = any(sample.adv_red_light_active for sample in before_contact)
    crossing = next((sample for sample in before_contact if sample.adv_crossed_red_light), None)
    metrics["adversary_encountered_red_light"] = 1.0 if encountered_red else 0.0
    metrics["adversary_ran_red_light"] = 1.0 if crossing is not None else 0.0
    if crossing is not None:
        metrics["adversary_red_light_crossing_time_s"] = round(crossing.t, 3)
    traffic_light_id = next(
        (sample.adv_traffic_light_id for sample in before_contact if sample.adv_traffic_light_id is not None),
        None,
    )
    if traffic_light_id is not None:
        metrics["adversary_traffic_light_id"] = float(traffic_light_id)

    ttc = _min_time_to_collision(before_contact)
    if ttc is not None:
        metrics["ttc_min_s"] = round(ttc, 3)
    if contact is not None:
        metrics["contact_longitudinal_m"] = round(contact.longitudinal_m, 3)
        metrics["contact_time_s"] = round(contact.t, 3)
    return metrics


EGO_LANE_HALF_WIDTH_M = 1.75
"""Nửa bề rộng làn — vạch kẻ nằm ở đây, tính từ tim làn ego.

``adversary_lane_incursion_m`` là **mép thân** tác nhân đè qua vạch bao nhiêu mét.
Dương = đã đè vạch. Đo mép thân chứ không đo tâm: "lấn làn đè vạch" nói về thân
xe, còn đòi tâm xe vượt vạch là đòi nó nằm hẳn trong làn ego — với một ego chạy
thẳng thì đó luôn thành va chạm, không còn là suýt va chạm nữa.
"""

CROSSING_RANGE_M = 30.0
"""Băng ngang ở xa hơn ngần này thì không liên quan tới ego.

Người đi bộ sang đường cách ego 200 m là chuyện giao thông bình thường, không
phải tình huống nguy hiểm mà kịch bản định dựng.
"""

OPPOSING_HEADING_DEG = 150.0
"""Lệch hướng bao nhiêu độ thì coi là đi ngược chiều.

180 độ là ngược hẳn; nới xuống 150 để đường cong và lúc đánh lái không làm trượt
phép đo. Dưới ngưỡng này là cắt ngang hoặc cùng chiều, không phải ngược chiều.
"""


def _lane_entry_longitudinal(samples: list[Sample]) -> float | None:
    """Vị trí dọc của lần vào làn ego cuối cùng trước va chạm/kết thúc.

    Actor rộng như xe tải có thể lắc nhẹ qua vạch lúc controller vừa khởi động,
    rồi trở lại làn bên trước khi cut-in thật sự. Lấy lần đè vạch đầu tiên đã làm
    sc_021 báo ``-20 m`` dù maneuver chính bắt đầu khi actor dẫn trước ~10 m.
    Lần chuyển trạng thái cuối cùng là lần vào làn mà actor còn giữ tới kết quả;
    nếu chỉ có một lần vào thì giá trị không đổi. ``None`` khi chưa từng vào.
    """
    inside = False
    entry: float | None = None
    for sample in samples:
        now = EGO_LANE_HALF_WIDTH_M - (abs(sample.lateral_m) - sample.adv_half_width_m) > 0
        if now and not inside:
            entry = sample.longitudinal_m
        inside = now
    return entry


def _from_first_movement(samples: list[Sample]) -> list[Sample]:
    """Bỏ các tick đầu khi actor còn đứng yên vì kịch bản chưa khởi động.

    Trả rỗng nếu actor **chưa bao giờ** chuyển động — và đó là câu trả lời đúng:
    tầng chấm điểm sẽ thấy thiếu số liệu tốc độ và trả "chưa chấm được", thay vì
    nhận một số 0 trông y hệt "xe đã dừng lại" và chấm ĐÚNG cho một kịch bản chưa
    từng chạy.
    """
    for index, sample in enumerate(samples):
        if sample.adv_speed_ms > MOVING_THRESHOLD_MS:
            return samples[index:]
    return []


def _crossed_ego_path(samples: list[Sample]) -> bool:
    """Adversary có đi ngang qua trục dọc của ego không, lúc còn ở gần.

    Đo bằng **đổi dấu** của độ lệch ngang: từ một bên sang bên kia nghĩa là nó
    cắt qua đường đi của ego. Chỉ tính lúc khoảng cách dọc còn trong tầm — xem
    ``CROSSING_RANGE_M``.
    """
    near = [s for s in samples if abs(s.longitudinal_m) <= CROSSING_RANGE_M]
    signs = {s.lateral_m > 0 for s in near if abs(s.lateral_m) > 0.5}
    return len(signs) > 1


def _max_heading_delta_deg(samples: list[Sample]) -> float | None:
    """Chênh hướng lớn nhất giữa hai xe, quy về [0, 180] độ.

    ``None`` khi chưa ghi được pose (worker cũ). Không trả 0: 0 độ nghĩa là hai
    xe cùng hướng, một câu hoàn toàn khác với "không đo được".
    """
    deltas = []
    for s in samples:
        if s.ego_pose == (0.0, 0.0, 0.0) and s.adv_pose == (0.0, 0.0, 0.0):
            continue
        raw = abs(s.adv_pose[2] - s.ego_pose[2]) % 360.0
        deltas.append(min(raw, 360.0 - raw))
    return max(deltas) if deltas else None


def _freespace_distance(sample: Sample) -> float:
    """Khoảng cách giữa hai thân xe, xấp xỉ bằng hộp bao trục-song-song.

    Chồng nhau ở chiều nào thì chiều đó đóng góp 0 — nên hai xe đi song song sát
    nhau cho đúng khe hở ngang, không bị khoảng cách dọc pha loãng.
    """
    return math.hypot(max(sample.gap_lon_m, 0.0), max(sample.gap_lat_m, 0.0))


def _min_time_to_collision(samples: list[Sample]) -> float | None:
    """TTC nhỏ nhất, đo bằng tốc độ thu hẹp khe hở dọc thật giữa hai tick.

    Lấy đạo hàm số của ``gap_lon_m`` thay vì hiệu vận tốc: nó tự đúng cho cả lúc
    adversary phanh, lúc nó tăng tốc, và lúc đường cong.
    """
    best: float | None = None
    for previous, current in zip(samples, samples[1:]):
        dt = current.t - previous.t
        if dt <= 0 or abs(current.lateral_m) > SAME_CORRIDOR_M:
            continue
        closing_ms = (previous.gap_lon_m - current.gap_lon_m) / dt
        if closing_ms < MIN_CLOSING_SPEED_MS or current.gap_lon_m < 0:
            continue
        ttc = current.gap_lon_m / closing_ms
        if best is None or ttc < best:
            best = ttc
    return best


def _surrogate_safety(samples: list[Sample]) -> dict[str, float]:
    """THW, PET và DRAC — ba phép đo nguy hiểm chuẩn của ngành.

    - ``thw_min_s`` **time headway**: ego mất bao lâu để tới chỗ adversary đang
      đứng. Khác TTC ở chỗ nó không cần hai xe đang tiến lại gần nhau — hai xe
      bám nhau ở cùng tốc độ có THW nhỏ mà TTC vô hạn, và bám quá gần vẫn là
      nguy hiểm.
    - ``pet_min_s`` **post-encroachment time**: chênh thời gian giữa lúc xe này
      rời một điểm và xe kia tới đúng điểm đó. Đây là phép đo kinh điển cho xung
      đột cắt ngang — `cut_in`, `jaywalk`, `lane_drift` đều thuộc loại đó.
    - ``drac_max_ms2`` **deceleration rate to avoid crash**: cần giảm tốc bao
      nhiêu để không đâm. Trên ~3,4 m/s² là mức phanh gấp; trên ~5 thì người lái
      bình thường không kịp.

    **Đây là xấp xỉ từ quỹ đạo lấy mẫu, không phải định nghĩa giải tích.** Ghi rõ
    vì con số sẽ đi vào báo cáo: PET tính theo khe hở dọc chia cho tốc độ xe
    nhanh hơn tại thời điểm hai thân xe chồng nhau theo chiều ngang, chứ không
    truy vết chính xác từng điểm xung đột.
    """
    thw: float | None = None
    pet: float | None = None
    drac: float | None = None

    for previous, current in zip(samples, samples[1:]):
        dt = current.t - previous.t
        if dt <= 0:
            continue
        gap = current.gap_lon_m
        if gap < 0:
            continue

        same_corridor = abs(current.lateral_m) <= SAME_CORRIDOR_M
        if same_corridor and current.longitudinal_m > 0 and current.ego_speed_ms > MIN_CLOSING_SPEED_MS:
            candidate = gap / current.ego_speed_ms
            thw = candidate if thw is None else min(thw, candidate)

        # Hai thân xe chồng nhau theo chiều NGANG nghĩa là chúng đang tranh cùng
        # một dải đường; lúc đó khe hở dọc quy ra thời gian chính là PET.
        if current.gap_lat_m < 0:
            faster = max(current.ego_speed_ms, current.adv_speed_ms)
            if faster > MIN_CLOSING_SPEED_MS:
                candidate = gap / faster
                pet = candidate if pet is None else min(pet, candidate)

        closing_ms = (previous.gap_lon_m - gap) / dt
        if same_corridor and closing_ms > MIN_CLOSING_SPEED_MS and gap > 0.1:
            candidate = (closing_ms**2) / (2 * gap)
            drac = candidate if drac is None else max(drac, candidate)

    out: dict[str, float] = {}
    if thw is not None:
        out["thw_min_s"] = round(thw, 3)
    if pet is not None:
        out["pet_min_s"] = round(pet, 3)
    if drac is not None:
        out["drac_max_ms2"] = round(drac, 3)
    return out


def downsample(samples: list[Sample], max_points: int = 150) -> list[dict]:
    """Giảm mẫu để gửi qua HTTP, giữ nguyên hình dạng quỹ đạo.

    ~500 mẫu mỗi lượt ở 20 Hz là quá nhiều cho một payload JSON đi qua NAT, mà
    người duyệt cũng không phân biệt được 20 Hz với 5 Hz khi xem lại. Lấy đều
    theo chỉ số và **luôn giữ mẫu cuối** — mẫu cuối là lúc kết thúc, bỏ nó đi
    thì đoạn cuối kịch bản biến mất khỏi bản vẽ.

    Làm tròn 2 chữ số: dưới centimet không ai nhìn thấy, mà payload nhỏ đi một nửa.
    """
    if not samples:
        return []
    step = max(1, len(samples) // max_points)
    picked = samples[::step]
    if picked[-1] is not samples[-1]:
        picked.append(samples[-1])
    return [
        {
            "t": round(s.t, 2),
            "ego": [round(v, 2) for v in s.ego_pose],
            "adv": [round(v, 2) for v in s.adv_pose],
            "lane_centre": [round(v, 2) for v in s.lane_centre],
            # Vị trí tương đối là thứ người duyệt thực sự nhìn: ở hệ toạ độ thế
            # giới, cả cú tạt đầu chỉ là 7 px dịch ngang trên khung 720 px vì
            # khung phải phủ 320 m đường. Hai số này đã đo sẵn mỗi tick.
            "rel": [round(s.longitudinal_m, 2), round(s.lateral_m, 2)],
        }
        for s in picked
    ]


class TrajectoryRecorder:
    """Ghi quỹ đạo song song với ScenarioRunner, trong một thread riêng.

    **Chỉ đọc trạng thái world**: dùng ``wait_for_tick()`` chứ không ``tick()``,
    nên không đụng tới chế độ synchronous mà ScenarioRunner đang giữ. Cùng cơ
    chế ``follow_hero.py`` đã dùng.
    """

    def __init__(self, host: str, port: int, tick_timeout_s: float = 5.0) -> None:
        self._host, self._port = host, int(port)
        self._tick_timeout_s = tick_timeout_s
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.samples: list[Sample] = []
        self.error: str | None = None
        self._tracked_red_light_id: int | None = None
        self._ran_red_light = False
        self._red_light_crossing_id: int | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="trajectory", daemon=True)
        self._thread.start()

    def stop(self, join_timeout_s: float = 10.0) -> tuple[dict[str, float], list[dict]]:
        """Trả (metrics, quỹ đạo đã giảm mẫu). Không đo được thì cả hai đều rỗng."""
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=join_timeout_s)
        return summarise(self.samples), downsample(self.samples)

    def _run(self) -> None:
        try:
            import carla  # noqa: PLC0415 — xem docstring module: chỉ nhánh này cần CARLA
        except ImportError as exc:
            self.error = f"không import được carla: {exc}"
            return

        try:
            client = carla.Client(self._host, self._port)
            client.set_timeout(20.0)
            # ScenarioRunner gọi load_world() sau khi recorder đã khởi động.
            # Tham chiếu world lấy trước lần load đó trỏ vào world CŨ và không
            # bao giờ thấy actor mới — cùng bẫy mà follow_hero.py phải xử lý.
            # Mỗi lần world ngừng tick mà chưa thấy đủ actor, lấy lại world từ
            # client thay vì kết luận recorder hỏng.
            while not self._stop.is_set():
                world = client.get_world()
                carla_map = world.get_map()
                ego, adv = self._wait_for_actors(world)
                if ego is not None and adv is not None:
                    self._record(world, carla_map, ego, adv)
                    return
            if not self.samples:
                self.error = "không thấy đủ ego + adversary"
        except Exception as exc:  # noqa: BLE001 — đo hỏng không được làm hỏng lượt chạy
            self.error = f"{type(exc).__name__}: {exc}"

    def _wait_for_actors(self, world) -> tuple[object | None, object | None]:  # noqa: ANN001
        while not self._stop.is_set():
            actors = {}
            for kind in ("vehicle.*", "walker.*"):
                for actor in world.get_actors().filter(kind):
                    actors[actor.attributes.get("role_name", f"id{actor.id}")] = actor
            if EGO_ROLE in actors and len(actors) >= 2:
                ego = actors[EGO_ROLE]
                # Chọn actor GẦN EGO NHẤT, không phải "actor không phải hero" đầu tiên.
                #
                # Lượt chạy trước bị CARLA treo hoặc chết giữa chừng để lại actor
                # trong world; ScenarioRunner không kịp dọn. Lấy bừa thì recorder
                # bám nhầm một chiếc cách vài trăm mét — đo được ngày 22/08:
                # "khe hở nhỏ nhất 228 m", "lệch làn 63 m", toàn số vô nghĩa mà
                # trông vẫn như số thật.
                #
                # Adversary luôn spawn tương đối theo ego (ADR-010) nên nó ở trong
                # vài chục mét; xe sót thì không.
                others = [a for role, a in actors.items() if role != EGO_ROLE]
                adv = min(others, key=lambda a: a.get_location().distance(ego.get_location()))
                return ego, adv
            if not self._wait_tick(world):
                break
        return None, None

    def _record(self, world, carla_map, ego, adv) -> None:  # noqa: ANN001
        ego_half = (ego.bounding_box.extent.x, ego.bounding_box.extent.y)
        adv_half = (adv.bounding_box.extent.x, adv.bounding_box.extent.y)
        t0: float | None = None

        while not self._stop.is_set():
            snapshot = self._wait_tick(world)
            if snapshot is None or not (ego.is_alive and adv.is_alive):
                break
            t = snapshot.timestamp.elapsed_seconds
            t0 = t if t0 is None else t0

            transform = ego.get_transform()
            adv_transform = adv.get_transform()
            ego_control = ego.get_control()
            adv_speed = _speed(adv)
            light_id, light_is_red = _traffic_light_observation(adv)
            self._tracked_red_light_id, crossed_id = _advance_red_light_tracker(
                self._tracked_red_light_id,
                light_id,
                light_is_red,
                adv_speed,
            )
            if crossed_id is not None:
                self._ran_red_light = True
                self._red_light_crossing_id = crossed_id
            forward, right = transform.get_forward_vector(), transform.get_right_vector()
            rel = adv.get_location() - ego.get_location()
            longitudinal = rel.x * forward.x + rel.y * forward.y
            lateral = rel.x * right.x + rel.y * right.y

            self.samples.append(
                Sample(
                    t=round(t - t0, 3),
                    longitudinal_m=longitudinal,
                    lateral_m=lateral,
                    gap_lon_m=abs(longitudinal) - (ego_half[0] + adv_half[0]),
                    gap_lat_m=abs(lateral) - (ego_half[1] + adv_half[1]),
                    ego_speed_ms=_speed(ego),
                    adv_speed_ms=adv_speed,
                    adv_lane_offset_m=_lane_offset(carla_map, adv),
                    ego_throttle=float(getattr(ego_control, "throttle", 0.0)),
                    ego_brake=float(getattr(ego_control, "brake", 0.0)),
                    ego_steer=float(getattr(ego_control, "steer", 0.0)),
                    ego_lane_offset_m=_lane_offset(carla_map, ego),
                    ego_half_width_m=ego_half[1],
                    adv_half_width_m=adv_half[1],
                    ego_pose=_pose(transform),
                    adv_pose=_pose(adv_transform),
                    lane_centre=_lane_centre(carla_map, ego),
                    adv_red_light_active=light_is_red,
                    adv_crossed_red_light=self._ran_red_light,
                    adv_traffic_light_id=light_id or self._red_light_crossing_id,
                )
            )

    def _wait_tick(self, world):  # noqa: ANN001, ANN201
        """``wait_for_tick`` có timeout: hết scenario thì world không tick nữa.

        Thiếu timeout ở đây thì thread treo vĩnh viễn sau khi ScenarioRunner
        thoát, và worker không bao giờ gửi kết quả về.
        """
        try:
            return world.wait_for_tick(seconds=self._tick_timeout_s)
        except RuntimeError:
            return None


def _speed(actor) -> float:  # noqa: ANN001
    velocity = actor.get_velocity()
    return math.hypot(velocity.x, velocity.y)


def _traffic_light_observation(actor) -> tuple[int | None, bool]:  # noqa: ANN001
    """Đèn đang chi phối vehicle và nó có đỏ không; actor khác trả ``(None, False)``."""
    get_light = getattr(actor, "get_traffic_light", None)
    if get_light is None:
        return None, False
    light = get_light()
    if light is None:
        return None, False
    state = str(light.get_state()).rsplit(".", maxsplit=1)[-1].lower()
    return int(light.id), state == "red"


def _advance_red_light_tracker(
    tracked_id: int | None,
    light_id: int | None,
    light_is_red: bool,
    speed_ms: float,
) -> tuple[int | None, int | None]:
    """Máy trạng thái nhỏ phân biệt vượt đèn đỏ với chờ tới xanh rồi đi.

    Trả ``(đèn đang theo dõi, id đèn vừa bị vượt)``. Nếu chính đèn đang theo dõi
    chuyển xanh trước khi vehicle rời trigger thì xoá theo dõi; vì vậy việc rời
    trigger sau đó không bị ghi nhầm thành vi phạm.
    """
    if light_id is not None and light_is_red:
        return light_id, None
    if light_id == tracked_id and not light_is_red:
        return None, None
    if tracked_id is not None and light_id is None and speed_ms > MOVING_THRESHOLD_MS:
        return None, tracked_id
    return tracked_id, None


def _lane_offset(carla_map, actor) -> float:  # noqa: ANN001
    """Lệch bao nhiêu mét so với tim làn đang đi. Dương = lệch phải."""
    waypoint = carla_map.get_waypoint(actor.get_location(), project_to_road=True)
    if waypoint is None:
        return 0.0
    centre = waypoint.transform.location
    right = waypoint.transform.get_right_vector()
    location = actor.get_location()
    return (location.x - centre.x) * right.x + (location.y - centre.y) * right.y


def _pose(transform) -> tuple[float, float, float]:  # noqa: ANN001
    return (transform.location.x, transform.location.y, transform.rotation.yaw)


def _lane_centre(carla_map, actor) -> tuple[float, float]:  # noqa: ANN001
    """Tim làn ego đang đi. Nối các điểm này lại là có mặt đường thật để vẽ."""
    waypoint = carla_map.get_waypoint(actor.get_location(), project_to_road=True)
    if waypoint is None:
        location = actor.get_location()
        return (location.x, location.y)
    return (waypoint.transform.location.x, waypoint.transform.location.y)
