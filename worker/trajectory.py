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
    ego_pose: tuple[float, float, float] = (0.0, 0.0, 0.0)
    """x, y, yaw(độ) của ego trong hệ toạ độ CARLA — để vẽ lại cho người duyệt."""
    adv_pose: tuple[float, float, float] = (0.0, 0.0, 0.0)
    lane_centre: tuple[float, float] = (0.0, 0.0)
    """Tim làn ego đang đi, hỏi thẳng map. Vẽ được mặt đường mà không phải suy diễn."""


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
    speeds = [s.adv_speed_ms for s in before_contact]
    metrics["adversary_min_speed_ms"] = round(min(speeds), 3)
    metrics["adversary_speed_drop_ms"] = round(max(speeds) - min(speeds), 3)

    # Bộ đo an toàn thay thế (surrogate safety measures) dùng chung trong ngành —
    # ISO 34502 và phần lớn công trình scenario-based testing báo cáo theo chúng.
    # Có ba số này thì bảng metric nói cùng ngôn ngữ với tài liệu tham chiếu, thay
    # vì chỉ có "khoảng cách nhỏ nhất" tự đặt tên.
    metrics.update(_surrogate_safety(before_contact))

    ttc = _min_time_to_collision(before_contact)
    if ttc is not None:
        metrics["ttc_min_s"] = round(ttc, 3)
    if contact is not None:
        metrics["contact_longitudinal_m"] = round(contact.longitudinal_m, 3)
        metrics["contact_time_s"] = round(contact.t, 3)
    return metrics


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
            world = client.get_world()
            carla_map = world.get_map()
            ego, adv = self._wait_for_actors(world)
            if ego is None or adv is None:
                self.error = "không thấy đủ ego + adversary"
                return
            self._record(world, carla_map, ego, adv)
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
                adv = next(a for role, a in actors.items() if role != EGO_ROLE)
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
                    adv_speed_ms=_speed(adv),
                    adv_lane_offset_m=_lane_offset(carla_map, adv),
                    ego_pose=_pose(transform),
                    adv_pose=_pose(adv_transform),
                    lane_centre=_lane_centre(carla_map, ego),
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
