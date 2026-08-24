"""So khớp động học gần trùng trước khi tiêu GPU (ADR-019).

Tên actor do LLM đặt không phải ngữ nghĩa. Hai spec dùng ``adv`` và
``motorcycle_1`` vẫn là cùng một phép thử nếu vai trò và động học khớp; vì vậy
module này ghép actor theo ``(category, is_ego)`` rồi mới so maneuver.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from itertools import permutations

from src.config import get_settings
from src.models.schemas import ActorSpec, DuplicateDiff, DuplicateDifference, ManeuverSpec, ScenarioSpec


def _difference(
    field: str,
    current: str | float | int | None,
    existing: str | float | int | None,
    *,
    delta: float | None = None,
    unit: str | None = None,
) -> DuplicateDifference | None:
    if current == existing:
        return None
    return DuplicateDifference(field=field, current=current, existing=existing, delta=delta, unit=unit)


def _actor_role(actor: ActorSpec) -> tuple[str, bool]:
    return actor.category.value, actor.is_ego


def _match_actors(
    spec_a: ScenarioSpec, spec_b: ScenarioSpec
) -> tuple[dict[str, str], list[DuplicateDifference]] | None:
    """Ghép một-một trong từng vai trò, chọn phép ghép có tổng delta nhỏ nhất."""
    roles_a = Counter(_actor_role(actor) for actor in spec_a.actors)
    roles_b = Counter(_actor_role(actor) for actor in spec_b.actors)
    if roles_a != roles_b:
        return None

    settings = get_settings()
    groups_a: dict[tuple[str, bool], list[ActorSpec]] = defaultdict(list)
    groups_b: dict[tuple[str, bool], list[ActorSpec]] = defaultdict(list)
    for actor in spec_a.actors:
        groups_a[_actor_role(actor)].append(actor)
    for actor in spec_b.actors:
        groups_b[_actor_role(actor)].append(actor)

    name_map: dict[str, str] = {}
    differences: list[DuplicateDifference] = []
    for role in sorted(groups_a):
        current = sorted(groups_a[role], key=lambda actor: actor.name)
        existing = groups_b[role]
        best: tuple[float, tuple[ActorSpec, ...]] | None = None
        for candidate_order in permutations(existing):
            score = 0.0
            compatible = True
            for actor_a, actor_b in zip(current, candidate_order):
                if actor_a.position.lane_offset != actor_b.position.lane_offset:
                    compatible = False
                    break
                distance_delta = abs(actor_a.position.s_offset_m - actor_b.position.s_offset_m)
                speed_delta = abs(actor_a.initial_speed_kmh - actor_b.initial_speed_kmh)
                if (
                    distance_delta > settings.near_duplicate_distance_m
                    or speed_delta > settings.near_duplicate_speed_kmh
                ):
                    compatible = False
                    break
                score += distance_delta + speed_delta
            if compatible and (best is None or score < best[0]):
                best = score, candidate_order
        if best is None:
            return None

        for actor_a, actor_b in zip(current, best[1]):
            name_map[actor_a.name] = actor_b.name
            role_label = "ego" if actor_a.is_ego else actor_a.category.value
            distance_delta = abs(actor_a.position.s_offset_m - actor_b.position.s_offset_m)
            speed_delta = abs(actor_a.initial_speed_kmh - actor_b.initial_speed_kmh)
            for item in (
                _difference(
                    f"actors.{role_label}.s_offset_m",
                    actor_a.position.s_offset_m,
                    actor_b.position.s_offset_m,
                    delta=round(distance_delta, 3),
                    unit="m",
                ),
                _difference(
                    f"actors.{role_label}.initial_speed_kmh",
                    actor_a.initial_speed_kmh,
                    actor_b.initial_speed_kmh,
                    delta=round(speed_delta, 3),
                    unit="km/h",
                ),
            ):
                if item:
                    differences.append(item)
    return name_map, differences


def _target_delta(current: float | None, existing: float | None) -> float | None:
    if current is None or existing is None:
        return None
    return abs(current - existing)


def _match_maneuvers(
    spec_a: ScenarioSpec,
    spec_b: ScenarioSpec,
    actor_map: dict[str, str],
) -> list[DuplicateDifference] | None:
    """Ghép maneuver theo actor đã ghép + loại hành vi, không dựa vào thứ tự list."""
    settings = get_settings()
    unmatched = list(spec_b.maneuvers)
    differences: list[DuplicateDifference] = []

    for maneuver_a in spec_a.maneuvers:
        expected_actor = actor_map[maneuver_a.actor_name]
        candidates: list[tuple[float, ManeuverSpec]] = []
        for maneuver_b in unmatched:
            if maneuver_b.actor_name != expected_actor or maneuver_b.maneuver != maneuver_a.maneuver:
                continue
            if maneuver_b.trigger.type != maneuver_a.trigger.type:
                continue
            if (maneuver_a.target_speed_kmh is None) != (maneuver_b.target_speed_kmh is None):
                continue
            trigger_delta = abs(maneuver_a.trigger.value - maneuver_b.trigger.value)
            target_delta = _target_delta(maneuver_a.target_speed_kmh, maneuver_b.target_speed_kmh)
            if trigger_delta > settings.near_duplicate_trigger_delta:
                continue
            if target_delta is not None and target_delta > settings.near_duplicate_speed_kmh:
                continue
            candidates.append((trigger_delta + (target_delta or 0.0), maneuver_b))
        if not candidates:
            return None

        _, maneuver_b = min(candidates, key=lambda item: item[0])
        unmatched.remove(maneuver_b)
        trigger_delta = abs(maneuver_a.trigger.value - maneuver_b.trigger.value)
        target_delta = _target_delta(maneuver_a.target_speed_kmh, maneuver_b.target_speed_kmh)
        trigger_unit = "s" if maneuver_a.trigger.type == "simulation_time" else "m"
        for item in (
            _difference(
                f"maneuvers.{maneuver_a.maneuver.value}.trigger.value",
                maneuver_a.trigger.value,
                maneuver_b.trigger.value,
                delta=round(trigger_delta, 3),
                unit=trigger_unit,
            ),
            _difference(
                f"maneuvers.{maneuver_a.maneuver.value}.target_speed_kmh",
                maneuver_a.target_speed_kmh,
                maneuver_b.target_speed_kmh,
                delta=round(target_delta, 3) if target_delta is not None else None,
                unit="km/h",
            ),
        ):
            if item:
                differences.append(item)

    if unmatched:
        return None
    return differences


def is_near_duplicate(spec_a: ScenarioSpec, spec_b: ScenarioSpec) -> DuplicateDiff | None:
    """Trả cảnh báo khi ODD, cấu trúc vai trò và động học đều gần nhau."""
    if spec_a.odd.key != spec_b.odd.key:
        return None

    actor_match = _match_actors(spec_a, spec_b)
    if actor_match is None:
        return None
    actor_map, actor_differences = actor_match

    maneuver_differences = _match_maneuvers(spec_a, spec_b, actor_map)
    if maneuver_differences is None:
        return None

    return DuplicateDiff(
        duplicate_scenario_id=spec_b.scenario_id,
        differences=[*actor_differences, *maneuver_differences],
    )
