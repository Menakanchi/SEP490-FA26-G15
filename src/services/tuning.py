"""Dò tham số để biến một kịch bản vô hại thành kịch bản tới hạn.

Vấn đề nó giải
--------------
Sinh ra file hợp lệ mới là nửa việc. Đo trên 8 lượt chạy chấm được ngày
22/08/2026: **5 kịch bản chạy trót lọt nhưng vô hại hoặc sai loại tai nạn**. Trong
tài liệu ngành đây là bước *concretization* — từ một kịch bản logic (tham số có
khoảng) chọn ra bộ giá trị cụ thể thật sự nguy hiểm — và nó được coi là bài toán
riêng, khó hơn việc viết ra file.

Vì sao không quét lưới
----------------------
Quét lưới trên toàn khoảng tham số vừa đắt (mỗi lượt chạy ~35 giây trên GPU) vừa
hay bỏ sót đúng vùng nguy hiểm. ``lane_drift`` neo vào thời điểm hai xe đi ngang
nhau tính từ spec. ``cut_in`` neo thẳng vào khoảng dẫn trước tối thiểu một thân
xe, vì tốc độ lệnh không bảo đảm tốc độ thật trên CARLA. Bốn lượt quanh mốc vật
lý này phủ vùng đáng quan tâm, thay vì 20 lượt rải đều.

Bằng chứng mốc neo này đúng: cùng kịch bản ``sc_906``, dời trigger từ 8,0 s
(sau mốc) về 5,5 s (trước mốc) kéo khe hở nhỏ nhất từ **1,05 m xuống 0,36 m**.

Ranh giới
---------
Hàm thuần trên ``ScenarioSpec``. Không chạy mô phỏng, không đụng DB: mỗi biến thể
đi qua đúng hàng đợi job và đúng cổng duyệt như mọi kịch bản khác. Tự chạy riêng
là dựng một đường tắt vòng qua HITL.
"""

from __future__ import annotations

from typing import Any

from src.models.schemas import ManeuverType, ScenarioSpec
from src.services.scenario.geometry import MIN_CUT_IN_LEAD_M, time_until_alongside

# Số bước dò. Bốn là đủ để bắc qua mốc neo mà vẫn dưới ba phút GPU cho một kịch bản.
SWEEP_STEPS = 4

# Khoảng cách giữa hai bước, giây.
STEP_S = 1.0

# Cut-in không còn dò theo giây. Bước một mét đủ mịn quanh ngưỡng một thân xe.
LEAD_STEP_M = 1.0

MANEUVER_RAMP_S = 2.6
"""Hành vi ngang cần bao lâu mới thành hình.

Thời gian lấn thành hình là ``2*sqrt(offset/maxLateralAcc)``. Converter đặt
``DRIFT_OFFSET_M = 1.35`` và ``DRIFT_LATERAL_ACC = 0.8`` -> 2,6 s.

Con số này **phải đi theo** hai hằng số đó — sửa biên độ lấn mà quên chỗ này thì
phép dò nhận cả những kịch bản mà hành vi không kịp thành hình.

Con số này là **điều kiện khả thi** của phép dò: nếu hai xe đi ngang nhau trước
khi hành vi kịp thành hình thì không giá trị trigger nào cứu được, và dò tiếp chỉ
đốt GPU để khẳng định lại. Đo trên ``sc_019``: ego 90 km/h đuổi xe 45 km/h cách
20 m -> ngang nhau ở giây 1,6, ngắn hơn cả thời gian lấn làn.
"""

CRITICAL_DISTANCE_M = 1.0
"""Dưới ngưỡng này coi là đã tới hạn — cùng ngưỡng suýt-va-chạm của M3."""


def propose_triggers(spec: ScenarioSpec) -> list[float]:
    """Danh sách giá trị ``trigger.value`` đáng thử quanh mốc hình học tương ứng.

    Hướng dò phụ thuộc maneuver, vì hai họ hành vi cần thời điểm ngược nhau:

    - ``cut_in`` dò trực tiếp số mét dẫn trước, neo ở ngưỡng một thân xe; không
      suy ra thời gian từ tốc độ lệnh.
    - ``lane_drift``, ``sudden_brake``, ``stop_in_lane`` phải xảy ra **trước** lúc
      ego tới nơi, nếu không chúng diễn ra trong khoảng trống phía sau.

    Trả rỗng trong hai trường hợp, và cả hai đều là **kết luận**, không phải lỗi:

    - hai xe không bao giờ tiến lại gần nhau;
    - chúng gặp nhau quá sớm để hành vi kịp thành hình (xem ``MANEUVER_RAMP_S``).

    Cả hai nói cùng một điều: vấn đề nằm ở vị trí và tốc độ ban đầu, không nằm ở
    thời điểm trigger — nên dò tiếp chỉ đốt GPU để khẳng định lại.
    """
    maneuver = spec.maneuvers[0] if spec.maneuvers else None
    if maneuver is None:
        return []

    if maneuver.maneuver is ManeuverType.CUT_IN:
        if maneuver.trigger.type != "lead_distance":
            return []
        candidates = [round(MIN_CUT_IN_LEAD_M + step * LEAD_STEP_M, 1) for step in range(SWEEP_STEPS)]
        current = maneuver.trigger.value
        return [candidate for candidate in candidates if abs(candidate - current) > 0.05]

    if maneuver.trigger.type != "simulation_time":
        return []

    ego = next((a for a in spec.actors if a.is_ego), None)
    actor = next((a for a in spec.actors if a.name == maneuver.actor_name), None)
    if ego is None or actor is None:
        return []

    alongside = time_until_alongside(actor, ego)
    if alongside is None:
        return []

    if alongside < MANEUVER_RAMP_S:
        # Hành vi không kịp thành hình trước lúc ego đi qua. Nguyên nhân nằm ở
        # chênh tốc độ hoặc khoảng cách ban đầu, không nằm ở thời điểm.
        return []
    candidates: list[float] = []
    for step in range(1, SWEEP_STEPS + 1):
        value = alongside - step * STEP_S
        # Trigger phải nằm trong kịch bản: sau 0 và trước lúc kết thúc.
        if 0.5 <= value < spec.duration_s:
            candidates.append(round(value, 1))

    current = maneuver.trigger.value
    return [c for c in candidates if abs(c - current) > 0.05]


def variant_specs(spec: ScenarioSpec) -> list[ScenarioSpec]:
    """Sinh các bản sao chỉ khác nhau ở thời điểm trigger.

    Đổi **đúng một tham số** có chủ đích: đổi nhiều thứ cùng lúc thì kết quả tốt
    lên cũng không biết nhờ cái nào, và kịch bản không còn là kịch bản mà người
    dùng mô tả nữa.
    """
    variants: list[ScenarioSpec] = []
    for trigger_value in propose_triggers(spec):
        data: dict[str, Any] = spec.model_dump(mode="json")
        data["maneuvers"][0]["trigger"]["value"] = trigger_value
        unit = "m lead" if data["maneuvers"][0]["trigger"]["type"] == "lead_distance" else "s"
        data["title"] = f"{spec.title} [trigger {trigger_value}{unit}]"
        variants.append(ScenarioSpec.model_validate(data))
    return variants


SWEEP_STOP_REACHED_CRITICAL = "reached_critical"
SWEEP_STOP_WAITING = "waiting"
SWEEP_STOP_EXHAUSTED = "exhausted"
SWEEP_NEXT = "next"


def plan_sweep_step(spec: ScenarioSpec, done: list[dict[str, Any]]) -> tuple[ScenarioSpec | None, str]:
    """Bước dò tiếp theo — hoặc lý do dừng. Mỗi lần đúng **một** biến thể.

    Vì sao không dựng cả 4 biến thể rồi chạy hết
    --------------------------------------------
    Mỗi lượt chạy là ~35 giây GPU, và phép dò thường trúng sớm: ``sc_024`` xuống
    0,63 m ngay ở bước thứ ba. Hai lượt còn lại chỉ để xác nhận chúng tệ hơn —
    biết trước rồi vì các bước xa mốc neo dần.

    Cẩn thận với con số "78,26 m -> 0,63 m" từng ghi ở đây: 78,26 m là nền đo khi
    converter còn lỗi. Sau khi sửa (đóng kịch bản khi va chạm, sửa dấu lệch làn,
    sửa thời điểm cut_in), đo lại ngày 23/08/2026 thì **chính bản gốc sc_024 đã
    xuống 0,68 m**, còn 4 biến thể nằm trong 0,62-0,70 m. Tức là phần lớn cải
    thiện đó thuộc về việc sửa converter, không thuộc về phép dò.

    Bằng chứng còn đứng vững cho phép dò là sc_906: 1,05 m -> 0,36 m, và đó là
    hiệu ứng thuần của thời điểm trigger.

    Ba trạng thái dừng, và cả ba đều là **kết luận**:

    - ``reached_critical``: đã có biến thể dưới ``CRITICAL_DISTANCE_M``. Dò tiếp
      không tìm được thứ gì đáng giá hơn thứ đã có.
    - ``waiting``: có biến thể đã tạo mà chưa chạy xong. Dựng thêm lúc này là tự
      xếp hàng cho một lượt GPU mà kết quả sắp tới có thể khiến nó thành thừa.
    - ``exhausted``: đã thử hết ``propose_triggers``. Thời điểm trigger không phải
      nguyên nhân — người đọc nên nhìn sang vị trí hoặc tốc độ ban đầu.

    ``done`` là các biến thể đã tạo: mỗi phần tử có ``scenario_id`` và ``metrics``
    (``metrics`` rỗng nghĩa là chưa chạy xong).
    """
    for item in done:
        distance = (item.get("metrics") or {}).get("min_distance_m")
        if distance is not None and distance < CRITICAL_DISTANCE_M:
            return None, SWEEP_STOP_REACHED_CRITICAL
    # `is None` chứ không phải falsy: khe hở 0,0 m là va chạm, không phải "chưa đo".
    if any((item.get("metrics") or {}).get("min_distance_m") is None for item in done):
        return None, SWEEP_STOP_WAITING

    variants = variant_specs(spec)
    if len(done) >= len(variants):
        return None, SWEEP_STOP_EXHAUSTED
    return variants[len(done)], SWEEP_NEXT


def rank_variants(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Xếp biến thể theo mức tới hạn, cao nhất trước.

    Tiêu chí là ``min_distance_m`` chứ **không** phải "có va chạm hay không". Một
    kịch bản khe hở 0,36 m không va chạm vẫn tới hạn hơn hẳn một kịch bản khe hở
    1,7 m, mà đếm va chạm thì hai cái đó bằng nhau — và với ``lane_drift`` thì
    không bao giờ có va chạm để đếm.

    Biến thể không đo được quỹ đạo bị xếp cuối chứ không bị loại: chúng vẫn là
    một lượt chạy đã tốn GPU, người đọc cần thấy chúng tồn tại.
    """

    def sort_key(item: dict[str, Any]) -> tuple[int, float, float]:
        metrics = item.get("metrics") or {}
        distance = metrics.get("min_distance_m")
        if distance is None:
            return (1, float("inf"), float("inf"))
        return (0, distance, metrics.get("ttc_min_s", float("inf")))

    return sorted(results, key=sort_key)


def summarise_tuning(baseline: dict[str, Any], results: list[dict[str, Any]]) -> dict[str, Any]:
    """Bản dò đã cải thiện được gì so với kịch bản gốc.

    ``improved=False`` là kết quả hợp lệ, không phải thất bại của công cụ: nó nói
    thời điểm trigger **không phải** thứ khiến kịch bản này vô hại, và người đọc
    nên nhìn sang vị trí hoặc tốc độ ban đầu.
    """
    ranked = rank_variants(results)
    best = ranked[0] if ranked else None
    baseline_distance = (baseline.get("metrics") or {}).get("min_distance_m")
    best_distance = (best or {}).get("metrics", {}).get("min_distance_m") if best else None

    improved = best_distance is not None and baseline_distance is not None and best_distance < baseline_distance - 0.05
    return {
        "baseline_min_distance_m": baseline_distance,
        "best_min_distance_m": best_distance,
        "best_scenario_id": (best or {}).get("scenario_id"),
        "improved": improved,
        "reached_critical": best_distance is not None and best_distance < CRITICAL_DISTANCE_M,
        "ranked": ranked,
    }
