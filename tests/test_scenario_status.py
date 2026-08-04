"""Vòng đời scenario — ADR-011 §3.3, ép bằng test thay vì bằng sơ đồ mermaid.

Trước ADR-011, tám trạng thái chỉ tồn tại trong một khối mermaid ở
``docs/gate-1/03-wireframe-ui-flow.md`` §7: không enum, không test, không gì
chặn code viết sai. File này là chỗ biến sơ đồ đó thành thứ chặn được merge.
"""

from __future__ import annotations

import pytest

from src.models.schemas import (
    ALLOWED_SCENARIO_TRANSITIONS,
    JobStatus,
    ScenarioStatus,
    can_transition,
)

TERMINAL = {ScenarioStatus.REJECTED}


def test_every_status_has_a_transition_row() -> None:
    """Thiếu một hàng là ``can_transition`` ném ``KeyError`` giữa lúc review."""
    assert set(ALLOWED_SCENARIO_TRANSITIONS) == set(ScenarioStatus)


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (ScenarioStatus.PENDING_REVIEW, ScenarioStatus.REJECTED),
        (ScenarioStatus.PENDING_REVIEW, ScenarioStatus.APPROVED_LIBRARY),
        (ScenarioStatus.APPROVED_LIBRARY, ScenarioStatus.PENDING_SIM_REVIEW),
        (ScenarioStatus.PENDING_SIM_REVIEW, ScenarioStatus.APPROVED_LIBRARY),
    ],
)
def test_allowed_transitions(current: ScenarioStatus, target: ScenarioStatus) -> None:
    assert can_transition(current, target)


@pytest.mark.parametrize(
    ("current", "target"),
    [
        # Bỏ qua BEFORE_LIBRARY để vào thẳng hàng đợi sim — FR-12 cấm.
        (ScenarioStatus.PENDING_REVIEW, ScenarioStatus.PENDING_SIM_REVIEW),
        # Hồi sinh một scenario đã bị từ chối thay vì sinh lại từ đầu.
        (ScenarioStatus.REJECTED, ScenarioStatus.APPROVED_LIBRARY),
        (ScenarioStatus.REJECTED, ScenarioStatus.PENDING_REVIEW),
        # Reject ở BEFORE_SIM không được đá scenario ra khỏi thư viện.
        (ScenarioStatus.PENDING_SIM_REVIEW, ScenarioStatus.REJECTED),
        # Quay ngược về hàng chờ duyệt sau khi đã vào thư viện.
        (ScenarioStatus.APPROVED_LIBRARY, ScenarioStatus.PENDING_REVIEW),
    ],
)
def test_forbidden_transitions(current: ScenarioStatus, target: ScenarioStatus) -> None:
    assert not can_transition(current, target)


def test_rejected_is_the_only_terminal_state() -> None:
    """Mọi trạng thái khác phải còn đường đi tiếp, nếu không scenario mắc kẹt."""
    stuck = {s for s, nxt in ALLOWED_SCENARIO_TRANSITIONS.items() if not nxt}
    assert stuck == TERMINAL


def test_no_self_transition() -> None:
    """Ghi lại cùng một trạng thái là dấu hiệu logic review chạy hai lần."""
    assert all(s not in nxt for s, nxt in ALLOWED_SCENARIO_TRANSITIONS.items())


def test_job_states_do_not_leak_into_scenario_states() -> None:
    """ADR-011 §3.3: ``running``/``done``/``failed`` là của job, không của scenario.

    Nhân đôi chúng sang ``ScenarioStatus`` tạo hai cột cùng tên có thể lệch nhau
    — đúng loại bug không bao giờ tự lộ ra.
    """
    assert {s.value for s in ScenarioStatus} & {s.value for s in JobStatus} == set()
