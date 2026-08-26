"""Tests cho src/agents/nodes/generate_draft.py"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from src.agents.nodes.generate_draft import (
    _build_user_content,
    _create_messages,
    generate_draft_node,
)
from src.models.schemas import (
    ActorType,
    ManeuverType,
    ODDCell,
    RoadType,
    ScenarioDraft,
    TimeOfDay,
    Weather,
)

# =============================================================================
# Constants - ODDCell samples
# =============================================================================

ODD_CELL_CUT_IN = ODDCell(
    road_type=RoadType.HIGHWAY,
    weather=Weather.CLEAR,
    actor_type=ActorType.MOTORCYCLE,
    maneuver=ManeuverType.CUT_IN,
)

ODD_CELL_SUDDEN_BRAKE = ODDCell(
    road_type=RoadType.URBAN_STRAIGHT,
    weather=Weather.FOG,
    actor_type=ActorType.TRUCK,
    maneuver=ManeuverType.SUDDEN_BRAKE,
)

ODD_CELL_JAYWALK = ODDCell(
    road_type=RoadType.INTERSECTION,
    weather=Weather.RAIN,
    actor_type=ActorType.PEDESTRIAN,
    maneuver=ManeuverType.JAYWALK,
)

ODD_CELL_LANE_DRIFT = ODDCell(
    road_type=RoadType.HIGHWAY,
    weather=Weather.HEAVY_RAIN,
    actor_type=ActorType.CAR,
    maneuver=ManeuverType.LANE_DRIFT,
)

ODD_CELL_WRONG_WAY = ODDCell(
    road_type=RoadType.URBAN_STRAIGHT,
    weather=Weather.CLEAR,
    actor_type=ActorType.MOTORCYCLE,
    maneuver=ManeuverType.WRONG_WAY,
)

# Các test dưới đây gọi API OpenAI THẬT: tốn tiền và mất ~25 giây.
#
# Phải bật bằng tay, không suy ra từ việc có key hay không. Máy dev nào cũng
# export OPENAI_API_KEY để chạy app, nên nếu lấy sự tồn tại của key làm điều
# kiện thì mỗi lần `pytest` — kể cả gate pre-push — sẽ gọi API chục lần mà
# người chạy không hề biết mình đang tiêu tiền.
#
# Chạy có chủ đích:  RUN_LLM_TESTS=1 pytest tests/test_agents/test_nodes/
requires_real_llm = pytest.mark.skipif(
    os.getenv("RUN_LLM_TESTS") != "1",
    reason="Test gọi API thật. Bật bằng RUN_LLM_TESTS=1",
)

# Danh sách test ODDCells
TEST_ODDCELLS = [
    ("cut_in", ODD_CELL_CUT_IN),
    ("sudden_brake", ODD_CELL_SUDDEN_BRAKE),
    ("jaywalk", ODD_CELL_JAYWALK),
    ("lane_drift", ODD_CELL_LANE_DRIFT),
    ("wrong_way", ODD_CELL_WRONG_WAY),
]


# =============================================================================
# Test _build_user_content (không cần API)
# =============================================================================


class TestBuildUserContent:
    """Test cho _build_user_content function."""

    def test_build_user_content_zero_shot(self):
        """Test khi không có examples → zero-shot."""
        content = _build_user_content(
            user_query="Xe máy vượt lên tạt đầu",
            odd_cell=ODD_CELL_CUT_IN,
            examples=None,
        )

        # Verify content có thông tin cần thiết
        assert "Xe máy vượt lên tạt đầu" in content
        assert "highway" in content
        assert "clear" in content
        assert "motorcycle" in content
        assert "cut_in" in content
        assert "zero-shot" in content.lower()

    def test_build_user_content_with_examples(self):
        """Test khi có examples → few-shot."""
        example = ScenarioDraft(
            title="Test example",
            odd=ODD_CELL_CUT_IN,
            time_of_day=TimeOfDay.DAY,
            actors=[
                {
                    "name": "hero",
                    "category": "car",
                    "position": {"lane_offset": 0, "s_offset_m": 0.0},
                    "initial_speed_kmh": 60.0,
                    "is_ego": True,
                },
                {
                    "name": "adv",
                    "category": "motorcycle",
                    "position": {"lane_offset": -1, "s_offset_m": -25.0},
                    "initial_speed_kmh": 80.0,
                    "is_ego": False,
                },
            ],
            maneuvers=[
                {
                    "actor_name": "adv",
                    "maneuver": "cut_in",
                    "trigger": {"type": "simulation_time", "value": 7.0},
                    "target_speed_kmh": 40.0,
                },
            ],
            duration_s=30.0,
        )

        content = _build_user_content(
            user_query="Xe máy vượt lên",
            odd_cell=ODD_CELL_CUT_IN,
            examples=[example],
        )

        # Verify examples được thêm vào
        assert "Examples" in content
        assert "Test example" in content

    def test_build_user_content_keeps_actor_mentions_and_explains_roles(self):
        content = _build_user_content(
            user_query="xe buýt tạt ra làn, xe máy phía sau không kịp tránh",
            odd_cell=ODD_CELL_SUDDEN_BRAKE.model_copy(update={"maneuver": ManeuverType.CUT_IN}),
            actor_hints=[
                {"category": "bus", "specific_type": "xe buýt", "role": "adversary"},
                {"category": "motorcycle", "specific_type": "xe máy", "role": "ego"},
            ],
        )

        assert '"specific_type": "xe buýt"' in content
        assert '"specific_type": "xe máy"' in content
        assert "không kịp tránh" in content
        assert '"role": "ego"' in content

    def test_build_user_content_marks_explicit_kinematics_as_required(self):
        content = _build_user_content(
            user_query="Ô tô chạy 68 km/h từ phía trước, ego chạy 96 km/h",
            odd_cell=ODD_CELL_CUT_IN.model_copy(update={"actor_type": ActorType.CAR}),
            kinematic_hints={
                "adversary_speed_kmh": 68.0,
                "ego_speed_kmh": 96.0,
                "adversary_relative_position": "ahead",
            },
        )

        assert '"adversary_speed_kmh": 68.0' in content
        assert '"ego_speed_kmh": 96.0' in content
        assert '"adversary_relative_position": "ahead"' in content
        assert "ràng buộc bắt buộc" in content
        assert "`s_offset_m > 0`" in content


# =============================================================================
# Test _create_messages (không cần API)
# =============================================================================


class TestCreateMessages:
    """Test cho _create_messages function."""

    def test_create_messages_has_system_and_user(self):
        """Test messages có system và user message."""
        messages = _create_messages(
            user_query="Test",
            odd_cell=ODD_CELL_CUT_IN,
            examples=None,
        )

        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"


def test_generate_keeps_cross_field_invalid_output_for_repair():
    """Invariant sai không được làm mất raw JSON trước node validate."""
    raw = {
        "title": "Xe máy tạt đầu",
        "odd": ODD_CELL_CUT_IN.model_dump(mode="json"),
        "time_of_day": "day",
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 60.0,
                "is_ego": True,
            },
            {
                "name": "adversary",
                "category": "motorcycle",
                "position": {"lane_offset": -1, "s_offset_m": -25.0},
                "initial_speed_kmh": 80.0,
                "is_ego": False,
            },
        ],
        # Lỗi đúng như production: maneuver bị gán cho ego.
        "maneuvers": [
            {
                "actor_name": "hero",
                "maneuver": "cut_in",
                "trigger": {"type": "simulation_time", "value": 7.0},
                "target_speed_kmh": 40.0,
            }
        ],
        "duration_s": 30.0,
    }

    with patch("src.services.llm.call_with_escalation", return_value=raw) as mock_llm:
        result = generate_draft_node("Xe máy tạt đầu ô tô", ODD_CELL_CUT_IN)

    assert result == raw
    schema = mock_llm.call_args.args[1]
    assert isinstance(schema, dict), "không truyền class Pydantic làm raw output bị validate quá sớm"


# =============================================================================
# Test generate_draft_node với API thật
# =============================================================================


@requires_real_llm
class TestGenerateDraftWithRealLLM:
    """Test generate_draft_node với LLM thật."""

    @pytest.mark.parametrize("name,odd_cell", TEST_ODDCELLS)
    def test_generate_draft_returns_scenario_draft(self, name, odd_cell):
        """Test generate_draft trả về ScenarioDraft."""
        user_queries = {
            "cut_in": "Xe máy chạy 80 km/h vượt lên từ phía sau ô tô đang chạy 60 km/h, tạt đầu rồi phanh gấp còn 40 km/h. Trời quang, ban ngày, cao tốc.",
            "sudden_brake": "Xe tải chạy trước phanh gấp đột ngột khi trời sương mù, ego chạy 50 km/h phía sau.",
            "jaywalk": "Người đi bộ bất ngờ băng qua đường ở ngã tư khi trời mưa, xe đang chạy 30 km/h.",
            "lane_drift": "Ô tô lấn làn đột ngột khi trời mưa to trên đường cao tốc.",
            "wrong_way": "Xe máy đi ngược chiều trên đường đô thị vào ban đêm.",
        }

        result = generate_draft_node(
            user_query=user_queries[name],
            odd_cell=odd_cell,
        )

        # Generate giữ raw JSON; validate_node mới dựng ScenarioDraft.
        result = ScenarioDraft.model_validate(result)
        # Verify ODDCell được giữ nguyên
        assert result.odd == odd_cell

    @pytest.mark.parametrize("name,odd_cell", TEST_ODDCELLS)
    def test_generate_draft_has_valid_structure(self, name, odd_cell):
        """Test cấu trúc ScenarioDraft hợp lệ."""
        user_queries = {
            "cut_in": "Xe máy vượt lên tạt đầu ô tô.",
            "sudden_brake": "Xe tải phanh gấp trước mặt.",
            "jaywalk": "Người đi bộ băng qua đường.",
            "lane_drift": "Ô tô lấn làn.",
            "wrong_way": "Xe máy đi ngược chiều.",
        }

        raw_result = generate_draft_node(
            user_query=user_queries[name],
            odd_cell=odd_cell,
        )
        result = ScenarioDraft.model_validate(raw_result)

        # 1 ego
        egos = [a for a in result.actors if a.is_ego]
        assert len(egos) == 1

        # >= 2 actors
        assert len(result.actors) >= 2

        # >= 1 maneuver
        assert len(result.maneuvers) >= 1

        # Ego không mang maneuver
        ego_name = egos[0].name
        for m in result.maneuvers:
            assert m.actor_name != ego_name
