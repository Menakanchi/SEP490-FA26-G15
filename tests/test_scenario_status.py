"""Vòng đời scenario — ADR-011 §3.3, ép bằng test thay vì bằng sơ đồ mermaid.

Trước ADR-011, tám trạng thái chỉ tồn tại trong một khối mermaid ở
``docs/gate-1/03-wireframe-ui-flow.md`` §7: không enum, không test, không gì
chặn code viết sai. File này là chỗ biến sơ đồ đó thành thứ chặn được merge.
"""

from __future__ import annotations

import pytest

from src.models.schemas import (
    ALLOWED_SCENARIO_TRANSITIONS,
    REVIEW_TRANSITIONS,
    JobStatus,
    ReviewGate,
    ScenarioStatus,
    can_request_simulation,
    next_status_after_review,
)

TERMINAL = {ScenarioStatus.REJECTED}


def test_every_status_has_a_transition_row() -> None:
    """Thiếu một hàng là tra cứu ném ``KeyError`` giữa lúc review."""
    assert set(ALLOWED_SCENARIO_TRANSITIONS) == set(ScenarioStatus)


@pytest.mark.parametrize(
    ("current", "gate", "approved", "expected"),
    [
        (ScenarioStatus.PENDING_REVIEW, ReviewGate.BEFORE_LIBRARY, True, ScenarioStatus.APPROVED_LIBRARY),
        (ScenarioStatus.PENDING_REVIEW, ReviewGate.BEFORE_LIBRARY, False, ScenarioStatus.REJECTED),
        (ScenarioStatus.PENDING_SIM_REVIEW, ReviewGate.BEFORE_SIM, True, ScenarioStatus.APPROVED_LIBRARY),
        (ScenarioStatus.PENDING_SIM_REVIEW, ReviewGate.BEFORE_SIM, False, ScenarioStatus.APPROVED_LIBRARY),
    ],
)
def test_allowed_review_transitions(
    current: ScenarioStatus, gate: ReviewGate, approved: bool, expected: ScenarioStatus
) -> None:
    assert next_status_after_review(current, gate, approved) is expected


@pytest.mark.parametrize(
    ("current", "gate", "approved"),
    [
        # Đúng trạng thái, SAI CỔNG — hai cổng HITL không được hoán đổi cho nhau.
        (ScenarioStatus.PENDING_REVIEW, ReviewGate.BEFORE_SIM, True),
        (ScenarioStatus.PENDING_REVIEW, ReviewGate.BEFORE_SIM, False),
        (ScenarioStatus.PENDING_SIM_REVIEW, ReviewGate.BEFORE_LIBRARY, True),
        # Duyệt một scenario đã bị từ chối, hoặc duyệt lại cái đã ở trong thư viện.
        (ScenarioStatus.REJECTED, ReviewGate.BEFORE_LIBRARY, True),
        (ScenarioStatus.APPROVED_LIBRARY, ReviewGate.BEFORE_LIBRARY, True),
        (ScenarioStatus.APPROVED_LIBRARY, ReviewGate.BEFORE_SIM, True),
    ],
)
def test_forbidden_review_transitions(current: ScenarioStatus, gate: ReviewGate, approved: bool) -> None:
    assert next_status_after_review(current, gate, approved) is None


def test_reject_before_sim_keeps_scenario_in_library() -> None:
    """Từ chối chạy sim không được đá scenario ra khỏi thư viện."""
    assert (
        next_status_after_review(ScenarioStatus.PENDING_SIM_REVIEW, ReviewGate.BEFORE_SIM, False)
        is ScenarioStatus.APPROVED_LIBRARY
    )


@pytest.mark.parametrize("status", list(ScenarioStatus))
def test_only_library_scenarios_can_request_simulation(status: ScenarioStatus) -> None:
    """FR-12: không có job CARLA nếu chưa qua ``BEFORE_LIBRARY``."""
    assert can_request_simulation(status) is (status is ScenarioStatus.APPROVED_LIBRARY)


def test_rejected_is_the_only_terminal_state() -> None:
    """Mọi trạng thái khác phải còn đường đi tiếp, nếu không scenario mắc kẹt."""
    stuck = {s for s, nxt in ALLOWED_SCENARIO_TRANSITIONS.items() if not nxt}
    assert stuck == TERMINAL


def test_no_self_transition() -> None:
    """Ghi lại cùng một trạng thái là dấu hiệu logic review chạy hai lần."""
    assert all(s not in nxt for s, nxt in ALLOWED_SCENARIO_TRANSITIONS.items())


def test_derived_graph_matches_review_table() -> None:
    """Bảng dẫn xuất không được rộng hơn bảng thật — nếu không nó lại thành nguồn cho phép."""
    from_reviews = {(src, target) for (src, _, _), target in REVIEW_TRANSITIONS.items()}
    derived = {(src, t) for src, targets in ALLOWED_SCENARIO_TRANSITIONS.items() for t in targets}
    extra = derived - from_reviews
    assert extra == {(ScenarioStatus.APPROVED_LIBRARY, ScenarioStatus.PENDING_SIM_REVIEW)}


def test_job_states_do_not_leak_into_scenario_states() -> None:
    """ADR-011 §3.3: ``running``/``done``/``failed`` là của job, không của scenario.

    Nhân đôi chúng sang ``ScenarioStatus`` tạo hai cột cùng tên có thể lệch nhau
    — đúng loại bug không bao giờ tự lộ ra.
    """
    assert {s.value for s in ScenarioStatus} & {s.value for s in JobStatus} == set()
