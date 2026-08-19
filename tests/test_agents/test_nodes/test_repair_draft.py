"""Tests cho src/agents/nodes/repair_draft.py"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from src.agents.nodes.repair_draft import (
    NothingToRepairError,
    _build_user_content,
    _create_messages,
    repair_draft,
)
from src.models.schemas import (
    REPAIRABLE_CODES,
    ActorSpec,
    ActorType,
    IssueCode,
    IssueSeverity,
    ManeuverSpec,
    ManeuverType,
    ODDCell,
    RoadType,
    ScenarioDraft,
    TimeOfDay,
    TriggerCondition,
    ValidationIssue,
    Weather,
)

# =============================================================================
# Fixtures
# =============================================================================

ODD_CELL_CUT_IN = ODDCell(
    road_type=RoadType.HIGHWAY,
    weather=Weather.CLEAR,
    actor_type=ActorType.MOTORCYCLE,
    maneuver=ManeuverType.CUT_IN,
)


def create_valid_draft() -> ScenarioDraft:
    """Tạo draft hợp lệ để test."""
    return ScenarioDraft(
        title="Test draft",
        odd=ODD_CELL_CUT_IN,
        time_of_day=TimeOfDay.DAY,
        actors=[
            ActorSpec(
                name="hero",
                category="car",
                position={"lane_offset": 0, "s_offset_m": 0.0},
                initial_speed_kmh=60.0,
                is_ego=True,
            ),
            ActorSpec(
                name="adv",
                category="motorcycle",
                position={"lane_offset": -1, "s_offset_m": -25.0},
                initial_speed_kmh=80.0,
                is_ego=False,
            ),
        ],
        maneuvers=[
            ManeuverSpec(
                actor_name="adv",
                maneuver=ManeuverType.CUT_IN,
                trigger=TriggerCondition(type="simulation_time", value=7.0),
                target_speed_kmh=40.0,
            )
        ],
        duration_s=30.0,
    )


def create_issue(
    code: IssueCode,
    path: str = "/maneuvers/0/actor_name",
    message: str = "Test message",
    suggestion: str = "Test suggestion",
) -> ValidationIssue:
    """Tạo ValidationIssue để test."""
    return ValidationIssue(
        code=code,
        path=path,
        message_vi=message,
        suggestion=suggestion,
    )


# =============================================================================
# Test _build_user_content
# =============================================================================


class TestBuildUserContent:
    """Test cho _build_user_content function."""

    def test_build_user_content_contains_draft(self):
        """Test content chứa draft JSON."""
        draft = create_valid_draft()
        issues = [create_issue(IssueCode.GEOM_NO_CATCHUP)]

        content = _build_user_content(draft, issues)

        assert "Draft hiện tại" in content
        assert "hero" in content

    def test_build_user_content_multiple_issues(self):
        """Test content với nhiều issues."""
        draft = create_valid_draft()
        issues = [
            create_issue(IssueCode.GEOM_NO_CATCHUP),
            create_issue(IssueCode.TRIGGER_AFTER_END, suggestion="trigger < duration"),
        ]

        content = _build_user_content(draft, issues)

        assert "Lỗi 1" in content
        assert "Lỗi 2" in content
        assert "GEOM_NO_CATCHUP" in content
        assert "TRIGGER_AFTER_END" in content


# =============================================================================
# Test _create_messages
# =============================================================================


class TestCreateMessages:
    """Test cho _create_messages function."""

    def test_create_messages_has_system_and_user(self):
        """Test messages có system và user."""
        draft = create_valid_draft()
        issues = [create_issue(IssueCode.GEOM_NO_CATCHUP)]

        messages = _create_messages(draft, issues)

        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"


# =============================================================================
# Test với LLM thật
# =============================================================================


def create_draft_with_s_offset_error() -> ScenarioDraft:
    """Draft có lỗi s_offset_m sai (phía trước với cut_in)."""
    return ScenarioDraft(
        title="Test cut-in",
        odd=ODD_CELL_CUT_IN,
        time_of_day=TimeOfDay.DAY,
        actors=[
            ActorSpec(
                name="hero",
                category="car",
                position={"lane_offset": 0, "s_offset_m": 0.0},
                initial_speed_kmh=60.0,
                is_ego=True,
            ),
            ActorSpec(
                name="adv",
                category="motorcycle",
                position={"lane_offset": -1, "s_offset_m": 20.0},  # Lỗi: phía trước
                initial_speed_kmh=80.0,
                is_ego=False,
            ),
        ],
        maneuvers=[
            ManeuverSpec(
                actor_name="adv",
                maneuver=ManeuverType.CUT_IN,
                trigger=TriggerCondition(type="simulation_time", value=7.0),
                target_speed_kmh=40.0,
            )
        ],
        duration_s=30.0,
    )


# Test dưới đây gọi API OpenAI THẬT: tốn tiền và mất vài giây.
#
# Phải bật bằng tay chứ không suy ra từ việc có key hay không — máy dev nào cũng
# export OPENAI_API_KEY để chạy app, nên lấy sự tồn tại của key làm điều kiện thì
# mỗi lần `pytest`, kể cả gate pre-push, sẽ âm thầm tiêu tiền.
#
# Chạy có chủ đích:  RUN_LLM_TESTS=1 pytest tests/test_agents/test_nodes/
requires_real_llm = pytest.mark.skipif(
    os.getenv("RUN_LLM_TESTS") != "1",
    reason="Test gọi API thật. Bật bằng RUN_LLM_TESTS=1",
)


@requires_real_llm
class TestRepairDraftWithRealLLM:
    """Test repair_draft với LLM thật."""

    def test_repair_s_offset_error(self):
        """Sửa xong thì lỗi phải HẾT, không chỉ là trả về đúng kiểu."""
        draft = create_draft_with_s_offset_error()
        issues = [
            ValidationIssue(
                code=IssueCode.GEOM_NO_CATCHUP,
                path="/actors/1/position/s_offset_m",
                message_vi="s_offset_m dương với cut_in không hợp lý",
                suggestion="cut_in cần s_offset_m ÂM (phía sau ego) để đuổi kịp và vượt",
            )
        ]

        result = repair_draft(draft, issues)

        assert isinstance(result, ScenarioDraft)
        # Không đổi nhãn ODD — ràng buộc số 3 của prompt.
        assert result.odd == ODD_CELL_CUT_IN

        # Và lỗi phải thật sự hết. Chỉ `isinstance` thôi thì một bản trả về y
        # nguyên draft hỏng cũng pass, tức test không đo gì cả.
        ego = next(a for a in result.actors if a.is_ego)
        adv = next(a for a in result.actors if not a.is_ego)
        assert adv.position.s_offset_m < 0, "chủ thể tạt đầu phải xuất phát sau ego"
        assert adv.initial_speed_kmh > ego.initial_speed_kmh, "và phải chạy nhanh hơn ego"


# =============================================================================
# Test Coverage Requirements
# =============================================================================


class TestGuardrail:
    """Thứ được phép đi vào prompt — đây là chỗ tiền thật đi ra."""

    def test_warning_only_code_never_reaches_the_llm(self):
        """Warning là suy đoán. Bắt model sửa theo suy đoán là dạy nó sai."""
        issue = ValidationIssue(
            code=IssueCode.LANE_OFFSET_IMPLAUSIBLE,
            path="/actors/1/position/lane_offset",
            message_vi="lane_offset hơi lạ",
            suggestion="xem lại",
        )
        assert issue.severity is IssueSeverity.WARNING

        with patch("src.services.llm.call_with_escalation") as mock_llm:
            with pytest.raises(NothingToRepairError):
                repair_draft(create_valid_draft(), [issue])
        mock_llm.assert_not_called()

    def test_non_repairable_code_never_reaches_the_llm(self):
        """GUARDRAIL_VIOLATION không sửa được — gọi LLM là trả tiền cho một vòng chắc chắn hỏng."""
        issue = ValidationIssue(
            code=IssueCode.GUARDRAIL_VIOLATION,
            path="/",
            message_vi="nội dung bị chặn",
            suggestion="không có",
        )
        assert issue.repairable_by_llm is False

        with patch("src.services.llm.call_with_escalation") as mock_llm:
            with pytest.raises(NothingToRepairError):
                repair_draft(create_valid_draft(), [issue])
        mock_llm.assert_not_called()

    def test_repairable_issue_survives_the_filter(self):
        """Lọc chặt quá thì repair không bao giờ chạy — kiểm cả chiều ngược lại."""
        repaired = create_valid_draft()

        with patch("src.services.llm.call_with_escalation", return_value=repaired) as mock_llm:
            result = repair_draft(create_draft_with_s_offset_error(), [create_issue(IssueCode.GEOM_NO_CATCHUP)])

        assert result is repaired
        mock_llm.assert_called_once()

    def test_mixed_list_sends_only_the_repairable_ones(self):
        """Lẫn lộn thì chỉ phần sửa được đi vào prompt, phần còn lại bị bỏ."""
        issues = [
            ValidationIssue(code=IssueCode.LANE_OFFSET_IMPLAUSIBLE, path="/x", message_vi="w", suggestion="s"),
            create_issue(IssueCode.TRIGGER_AFTER_END, suggestion="trigger phải nhỏ hơn duration_s"),
        ]

        with patch("src.services.llm.call_with_escalation", return_value=create_valid_draft()) as mock_llm:
            repair_draft(create_valid_draft(), issues)

        prompt = mock_llm.call_args[0][0][1]["content"]
        assert "TRIGGER_AFTER_END" in prompt
        assert "LANE_OFFSET_IMPLAUSIBLE" not in prompt, "warning không được lọt vào prompt"

    def test_llm_returning_wrong_type_fails_here_not_downstream(self):
        """Sai kiểu phải nổ tại repair kèm tên node — không trôi xuống convert_xosc."""
        with patch("src.services.llm.call_with_escalation", return_value={"not": "a draft"}):
            with pytest.raises(TypeError, match="repair_draft"):
                repair_draft(create_valid_draft(), [create_issue(IssueCode.GEOM_NO_CATCHUP)])


class TestPromptCoversEveryRepairableCode:
    """Prompt phải nói cho model biết nó được phép sửa những mã nào."""

    @pytest.mark.parametrize("code", sorted(REPAIRABLE_CODES, key=lambda c: c.value), ids=lambda c: c.value)
    def test_code_is_listed_in_the_prompt(self, code: IssueCode):
        """Sinh từ REPAIRABLE_CODES nên thêm mã mới là test tự phủ theo.

        Bản đầu gõ tay 13 mã vào prompt. Lúc đó khớp, nhưng thêm một mã sửa được
        mà quên sửa prompt thì model không biết mình được phép sửa nó — vòng
        repair lặng lẽ bỏ qua một loại lỗi, không ai thấy.
        """
        assert code.value in _create_messages(create_valid_draft(), [create_issue(code)])[0]["content"]

    @pytest.mark.parametrize(
        "code",
        [
            IssueCode.GEOM_NO_CATCHUP,
            IssueCode.TRIGGER_AFTER_END,
            IssueCode.EGO_HAS_MANEUVER,
            IssueCode.DANGLING_ACTOR_REF,
            IssueCode.ODD_LABEL_DRIFT,
        ],
        ids=lambda c: c.value,
    )
    def test_issue_detail_reaches_the_user_message(self, code: IssueCode):
        """Cả bốn trường của issue phải tới được model, nhất là `suggestion`."""
        issue = create_issue(code, path="/actors/1", suggestion=f"gợi ý cho {code.value}")
        content = _build_user_content(create_valid_draft(), [issue])

        assert code.value in content
        assert "/actors/1" in content
        assert f"gợi ý cho {code.value}" in content
