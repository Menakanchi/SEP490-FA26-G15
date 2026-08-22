"""Ba metric của đề bài, tính từ dữ liệu thật trong kho.

    M1  tỷ lệ kịch bản hợp lệ      — bốn mức L1..L4
    M2  độ phủ ODD                 — bao nhiêu ô trong ma trận đã có kịch bản
    M3  tỷ lệ kích hoạt nguy hiểm  — bao nhiêu lượt chạy dựng được tình huống

**Hàm thuần trên list dict.** Truy vấn nằm ở ``db.py``, câu chữ nằm ở API. Tách
ra vì ba metric này là thứ đi vào báo cáo nộp bài: chúng phải test được bằng dữ
liệu dựng tay, không phải bằng cách dựng cả một database.

Quy ước xuyên suốt: **không đo được thì trả ``None``, không trả 0.** Một tỷ lệ
0% và một "chưa có dữ liệu" là hai câu hoàn toàn khác nhau trong báo cáo, mà 0
thì trông như thất bại.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any

from src.models.schemas import DEFAULT_SUPPORT_POLICY, ManeuverType, ODDCell

# Ngưỡng dưới đây đều lấy từ số đo trên CARLA ngày 22/08/2026, không phải chọn cho tròn.

LATERAL_DEVIATION_M = 0.3
"""Lệch tim làn bao nhiêu thì coi là hành vi ngang **đã xảy ra**.

Kịch bản `lane_drift` chạy đúng đo được 0,70 m; bản lấn ngược hướng (lỗi dấu) và
bản chưa kịp lấn đều dưới 0,15 m. Đặt ở 0,3 m là ở giữa hai cụm.
"""

NEAR_MISS_M = 1.0
"""Khe hở nhỏ hơn ngần này mà không va chạm thì tính là **suýt va chạm**.

Hai xe đi hai làn kề nhau bình thường cách nhau ~1,05 m (đo trên sc_906). Một cú
lấn làn thật kéo xuống 0,36 m. Ngưỡng 1,0 m tách đúng hai trường hợp đó.
"""

SPEED_DROP_MS = 2.0
"""Giảm tốc bao nhiêu thì coi là "phanh". ~7 km/h, đủ để loại nhiễu bám tốc độ."""

STOPPED_MS = 0.5
"""Dưới ngưỡng này coi như đã dừng hẳn."""

SEED_AUTHOR = "seed-data"
"""Kịch bản mock dựng sẵn để demo giao diện — **không** được tính vào báo cáo.

Chúng không đi qua pipeline: không có lần sinh, phần lớn không có ``.xosc``, và ô
ODD của chúng do người gõ tay chứ không do ``parse_intent`` đọc ra từ câu. Đếm
chúng vào M2 là báo cáo độ phủ bằng dữ liệu bịa — đúng loại lỗi mà cả module này
tồn tại để tránh.

Loại ra nhưng **đếm riêng và hiện lên**, không lọc ngầm: người đọc báo cáo phải
thấy có bao nhiêu hàng bị bỏ và vì sao.
"""


def build_report(
    requests: list[dict],
    scenarios: list[dict],
    executions: list[dict],
) -> dict[str, Any]:
    """Gộp ba metric thành một payload cho ``GET /metrics/quality``."""
    real = [s for s in scenarios if s.get("created_by") != SEED_AUTHOR]
    seeded = len(scenarios) - len(real)
    return {
        "m1_validity": validity(requests, real, executions),
        "m2_coverage": {**coverage(real), "excluded_seed_data": seeded},
        "m3_hazard": hazard(executions),
        "excluded_seed_data": seeded,
    }


# ---------------------------------------------------------------------------
# M1 — tỷ lệ hợp lệ, bốn mức
# ---------------------------------------------------------------------------


def validity(requests: list[dict], scenarios: list[dict], executions: list[dict]) -> dict[str, Any]:
    """Bốn mức, mỗi mức trả lời một câu khác nhau.

    Bốn mức này **không** cộng dồn thành một con số duy nhất có chủ đích: "90%
    hợp lệ" mà không nói hợp lệ theo nghĩa nào là câu vô nghĩa. Một kịch bản qua
    L3 (chạy không crash) vẫn có thể vô dụng ở L4 (chẳng có gì xảy ra) — đó đúng
    là loại hỏng tệ nhất mà behavior checker sinh ra để bắt.
    """
    finished = [r for r in requests if r.get("status") in ("done", "failed")]
    l1 = _ratio(sum(1 for r in finished if r.get("status") == "done"), len(finished))

    # Chỉ tính kịch bản NẰM TRONG phạm vi converter. Kịch bản đô thị/ngã tư không
    # có .xosc vì chưa có anchor cho road_type đó (ADR-016) — đó là quyết định thu
    # hẹp phạm vi, không phải converter hỏng. Gộp chung thì bảng số tự bôi bẩn:
    # 6 seed ngoài phạm vi kéo L2 xuống 50% và không ai đọc ra được vì sao.
    in_scope = [s for s in scenarios if _in_scope(s)]
    out_of_scope = len(scenarios) - len(in_scope)
    l2 = _ratio(sum(1 for s in in_scope if (s.get("xosc_content") or "").strip()), len(in_scope))

    ran = [e for e in executions if e.get("result")]
    l3 = _ratio(sum(1 for e in ran if (e["result"] or {}).get("success")), len(ran))

    verdicts = [intent_verdict(e) for e in ran]
    judged = [v for v in verdicts if v is not None]
    l4 = _ratio(sum(judged), len(judged))

    return {
        "l1_schema": _level(l1, "Draft qua được schema và validate"),
        "l2_xosc": _level(
            l2,
            "Biên dịch được thành .xosc (chỉ tính ô trong phạm vi converter)",
            not_measurable=out_of_scope,
        ),
        "l3_runtime": _level(l3, "ScenarioRunner chạy hết, không crash / timeout"),
        "l4_intent": _level(
            l4,
            "Tái hiện đúng hành vi mà câu tiếng Việt mô tả",
            not_measurable=len(verdicts) - len(judged),
        ),
    }


_AXES = ("road_type", "weather", "actor_type", "maneuver")


def _pairwise(scenarios: list[dict], supported: list[ODDCell]) -> dict[str, Any]:
    """Độ phủ **từng cặp trục**, chuẩn của kiểm thử tổ hợp (combinatorial testing).

    Vì sao báo thêm số này bên cạnh phủ toàn phần: lý thuyết kiểm thử tổ hợp nói
    phần lớn lỗi do **tương tác giữa hai yếu tố**, nên phủ hết các cặp bắt được
    gần hết lỗi mà chỉ tốn một phần nhỏ số ca so với phủ toàn phần. Với ma trận
    4 trục ở đây, phủ hết cặp cần khoảng 15-20 kịch bản thay vì 76.

    Nói cách khác: 12/76 ô nghe như "mới làm được 16%", nhưng nếu 12 kịch bản đó
    phủ hết các cặp thì về mặt kiểm thử chúng đã làm gần hết việc. Hai con số trả
    lời hai câu khác nhau và **không** thay thế nhau — phủ toàn phần vẫn là thứ
    cần khi muốn nói "đã thử mọi tổ hợp".

    Mẫu số chỉ đếm cặp **khả thi**: cặp nào không xuất hiện trong ô nào mà
    ``SupportPolicy`` hỗ trợ thì không bao giờ phủ được, đưa vào mẫu số là tự dìm
    con số bằng thứ không tồn tại.
    """
    feasible: set[tuple[str, str, str, str]] = set()
    for cell in supported:
        values = cell.model_dump(mode="json")
        for left, right in combinations(_AXES, 2):
            feasible.add((left, right, values[left], values[right]))

    covered: set[tuple[str, str, str, str]] = set()
    for scenario in scenarios:
        if not all(scenario.get(axis) for axis in _AXES):
            continue
        for left, right in combinations(_AXES, 2):
            pair = (left, right, scenario[left], scenario[right])
            if pair in feasible:
                covered.add(pair)

    return {
        "covered_pairs": len(covered),
        "feasible_pairs": len(feasible),
        "rate_pairwise": _ratio(len(covered), len(feasible)),
    }


def _in_scope(scenario: dict) -> bool:
    """Ô ODD của kịch bản có nằm trong phạm vi converter dựng được không."""
    axes = (
        scenario.get("road_type"),
        scenario.get("weather"),
        scenario.get("actor_type"),
        scenario.get("maneuver"),
    )
    if not all(axes):
        return False
    key = ODDCell(road_type=axes[0], weather=axes[1], actor_type=axes[2], maneuver=axes[3]).key
    return key in {c.key for c in DEFAULT_SUPPORT_POLICY.supported_cells()}


def intent_verdict(execution: dict) -> bool | None:
    """Kịch bản có tái hiện **đúng ý định** không. ``None`` = chưa chấm được.

    Đây là mức L4, và nó chỉ tồn tại được nhờ số đo quỹ đạo: criteria của
    ScenarioRunner trả FAILURE cho cả cú tạt đầu đúng ý lẫn cú tông đuôi do
    trigger sai, nên đọc criteria thì hai thứ đó giống hệt nhau.

    Trả ``None`` thay vì ``False`` khi chưa có luật cho maneuver đó. Đếm một
    kịch bản chưa chấm được thành "sai ý định" là bịa ra một thất bại.
    """
    result = execution.get("result") or {}
    metrics = result.get("metrics") or {}
    maneuver = execution.get("maneuver")
    if not metrics or not maneuver:
        return None

    deviation = metrics.get("adversary_lane_deviation_m")
    contact = metrics.get("contact_longitudinal_m")
    drop = metrics.get("adversary_speed_drop_ms")
    min_speed = metrics.get("adversary_min_speed_ms")

    if maneuver == ManeuverType.CUT_IN.value:
        if deviation is None:
            return None
        # Tạt đầu = vượt lên rồi cắt vào. Chạm lúc adversary còn ở phía sau nghĩa
        # là nó nhập làn sau lưng ego rồi tông đuôi — có va chạm, nhưng sai loại.
        if contact is not None and contact < 0:
            return False
        return deviation >= LATERAL_DEVIATION_M

    if maneuver == ManeuverType.LANE_DRIFT.value:
        if deviation is None:
            return None
        # Lấn làn không dựng va chạm; nó dựng một lần đi sát nhau. Lấn mà không
        # gặp ai (ego đã đi khỏi) thì hành vi có xảy ra nhưng kịch bản vô dụng.
        near = metrics.get("min_distance_m")
        return deviation >= LATERAL_DEVIATION_M and near is not None and near < NEAR_MISS_M

    if maneuver == ManeuverType.SUDDEN_BRAKE.value:
        return None if drop is None else drop >= SPEED_DROP_MS

    if maneuver == ManeuverType.STOP_IN_LANE.value:
        return None if min_speed is None else min_speed <= STOPPED_MS

    # jaywalk / wrong_way / run_red_light cần tín hiệu riêng (người đi bộ sang
    # được bên kia đường; xe đi ngược chiều dòng; xe vượt vạch lúc đèn đỏ) mà
    # bốn số hiện có không nói lên được. Chưa chấm còn hơn chấm bừa.
    return None


# ---------------------------------------------------------------------------
# M2 — độ phủ ODD
# ---------------------------------------------------------------------------


def coverage(scenarios: list[dict]) -> dict[str, Any]:
    """Đếm ô ODD đã có kịch bản, trên **hai** mẫu số khác nhau.

    ``supported`` là mẫu số thật: số ô converter dựng được (``SupportPolicy``).
    ``enum`` là 560 tổ hợp enum — báo cáo x/560 trông như thất bại trong khi phần
    lớn ô đó là *quyết định thu hẹp phạm vi có chủ đích* (ADR-016), không phải
    chỗ chưa làm. Hiện cả hai để không ai đọc nhầm theo hướng nào.
    """
    supported = DEFAULT_SUPPORT_POLICY.supported_cells()
    supported_keys = {c.key for c in supported}

    covered_keys: set[str] = set()
    per_maneuver: dict[str, int] = {}
    for s in scenarios:
        axes = (s.get("road_type"), s.get("weather"), s.get("actor_type"), s.get("maneuver"))
        if not all(axes):
            continue
        key = ODDCell(road_type=axes[0], weather=axes[1], actor_type=axes[2], maneuver=axes[3]).key
        covered_keys.add(key)
        per_maneuver[axes[3]] = per_maneuver.get(axes[3], 0) + 1

    in_scope = covered_keys & supported_keys
    return {
        **_pairwise(scenarios, supported),
        "covered_supported": len(in_scope),
        "supported_total": len(supported_keys),
        "rate_supported": _ratio(len(in_scope), len(supported_keys)),
        "covered_any": len(covered_keys),
        "enum_total": 5 * 4 * 4 * len(ManeuverType),
        # Ô nằm ngoài phạm vi converter: có kịch bản nhưng không mô phỏng được.
        "covered_out_of_scope": len(covered_keys - supported_keys),
        "scenarios_per_maneuver": dict(sorted(per_maneuver.items())),
    }


# ---------------------------------------------------------------------------
# M3 — tỷ lệ kích hoạt hành vi nguy hiểm
# ---------------------------------------------------------------------------


def hazard(executions: list[dict]) -> dict[str, Any]:
    """Bao nhiêu lượt chạy dựng được tình huống nguy hiểm.

    Đếm **hai** loại, vì va chạm không phải hình thái nguy hiểm duy nhất:
    ``lane_drift`` cố ý không va chạm — nó dựng một lần đi sát nhau, và đo bằng
    ``CollisionTest`` thì nó luôn trông như thất bại. Suýt va chạm là kết quả
    đạt, không phải kết quả trượt.
    """
    ran = [e for e in executions if (e.get("result") or {}).get("success")]
    collided = 0
    near_miss = 0
    nothing = 0
    for e in ran:
        result = e["result"]
        metrics = result.get("metrics") or {}
        if _had_collision(result):
            collided += 1
            continue
        distance = metrics.get("min_distance_m")
        if distance is not None and distance < NEAR_MISS_M:
            near_miss += 1
        else:
            nothing += 1

    hazardous = collided + near_miss
    return {
        "executed": len(ran),
        "collision": collided,
        "near_miss": near_miss,
        "no_hazard": nothing,
        "rate": _ratio(hazardous, len(ran)),
        "collision_rate": _ratio(collided, len(ran)),
    }


def _had_collision(result: dict) -> bool:
    """Đọc riêng dòng ``CollisionTest``.

    **Không** đọc ``success`` (nó chỉ nói chạy xong không crash) và **không** đọc
    ``GLOBAL RESULT`` (nó là AND của mọi criteria, nên `CheckDrivenDistance`
    trượt là đủ kéo nó xuống FAILURE khi không có va chạm nào — đo được 4 lần như
    thế ngày 22/08).
    """
    return any(
        (c.get("name") or "").lower().startswith("collision") and c.get("result") == "FAILURE"
        for c in result.get("criteria_results") or []
    )


# ---------------------------------------------------------------------------


def _ratio(passed: int, total: int) -> dict[str, Any]:
    return {
        "passed": passed,
        "total": total,
        "rate": round(passed / total, 4) if total else None,
    }


def _level(ratio: dict[str, Any], label: str, not_measurable: int = 0) -> dict[str, Any]:
    return {**ratio, "label": label, "not_measurable": not_measurable}
