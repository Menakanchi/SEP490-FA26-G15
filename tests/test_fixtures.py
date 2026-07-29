"""Ép mọi fixture khớp schema.

Đây là thứ biến `src/models/schemas.py` từ một tài liệu thành một **hợp đồng**:
sửa schema mà quên sửa fixture (hoặc ngược lại) thì CI chặn, không phải tới
tuần 5 ghép code mới phát hiện.
"""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from src.models.schemas import (
    ActorType,
    CriterionStatus,
    ExecutionResult,
    LibraryEntry,
    ManeuverType,
    ODDCell,
    ODDQuery,
    ReviewDecision,
    RoadType,
    ScenarioSpec,
    Weather,
)

FIXTURES = Path(__file__).parent.parent / "fixtures"


def _load(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    data.pop("_comment", None)  # chú thích cho người đọc, không thuộc schema
    return data


def _files(subdir: str) -> list[Path]:
    return sorted((FIXTURES / subdir).glob("*.json"))


@pytest.mark.parametrize("path", _files("scenario_specs"), ids=lambda p: p.name)
def test_scenario_spec_fixtures_valid(path: Path) -> None:
    ScenarioSpec.model_validate(_load(path))


@pytest.mark.parametrize("path", _files("execution_results"), ids=lambda p: p.name)
def test_execution_result_fixtures_valid(path: Path) -> None:
    ExecutionResult.model_validate(_load(path))


def test_odd_matrix_is_560_cells() -> None:
    """4 trục, 5 x 4 x 4 x 7. Đổi số này là đổi mẫu số của ODD coverage.

    Trục thứ 4 là *tình huống*, không phải *thời điểm trong ngày* — đề bài đo
    "độ đa dạng của các tình huống". Test này canh để không ai lặng lẽ đổi lại.
    """
    assert len(RoadType) * len(Weather) * len(ActorType) * len(ManeuverType) == 560
    assert set(ODDCell.model_fields) == {"road_type", "weather", "actor_type", "maneuver"}


def test_odd_key_is_stable() -> None:
    cell = ODDCell(
        road_type=RoadType.HIGHWAY,
        weather=Weather.CLEAR,
        actor_type=ActorType.MOTORCYCLE,
        maneuver=ManeuverType.CUT_IN,
    )
    assert cell.key == "highway|clear|motorcycle|cut_in"


def test_ego_cannot_carry_maneuver() -> None:
    """Ego là thứ ĐANG BỊ TEST, không phải thứ gây ra tình huống."""
    spec = _load(FIXTURES / "scenario_specs" / "sc_001.json")
    spec["maneuvers"][0]["actor_name"] = "hero"
    with pytest.raises(ValidationError, match="ego không được mang maneuver"):
        ScenarioSpec.model_validate(spec)


def test_maneuver_must_reference_existing_actor() -> None:
    spec = _load(FIXTURES / "scenario_specs" / "sc_001.json")
    spec["maneuvers"][0]["actor_name"] = "khong_ton_tai"
    with pytest.raises(ValidationError, match="actor không tồn tại"):
        ScenarioSpec.model_validate(spec)


def test_collision_failure_means_adversarial_found() -> None:
    """Bài test canh chừng chỗ dễ hiểu ngược nhất dự án.

    `CollisionTest = FAILURE` là TIN TỐT: kịch bản đã dựng được tình huống
    nguy hiểm. Ai sửa `had_collision` theo trực giác "FAILURE là xấu" sẽ làm
    test này đỏ.
    """
    good = ExecutionResult.model_validate(_load(FIXTURES / "execution_results" / "sc_001_success_with_collision.json"))
    assert good.success is True
    assert good.had_collision is True, "va chạm = adversarial tìm được = điều ta MUỐN"

    useless = ExecutionResult.model_validate(_load(FIXTURES / "execution_results" / "sc_002_success_no_collision.json"))
    assert useless.success is True, "vẫn tính vào validity rate"
    assert useless.had_collision is False, "nhưng không tính vào adversarial_found"

    broken = ExecutionResult.model_validate(_load(FIXTURES / "execution_results" / "sc_003_failed.json"))
    assert broken.success is False, "chỉ trường hợp này mới trừ vào validity rate"
    assert broken.error is not None


def test_validity_rate_counts_success_not_collision() -> None:
    """validity rate = tỉ lệ success, KHÔNG phải tỉ lệ không va chạm."""
    results = [ExecutionResult.model_validate(_load(p)) for p in _files("execution_results")]
    validity_rate = sum(r.success for r in results) / len(results)
    adversarial_found = sum(r.had_collision for r in results)

    assert validity_rate == pytest.approx(2 / 3)
    assert adversarial_found == 1
    assert validity_rate != adversarial_found / len(results), "hai trục phải khác nhau"


def test_typo_in_field_name_is_rejected_not_ignored() -> None:
    """Gõ sai tên trường ở ranh giới máy phải NỔ, không được im lặng.

    Mặc định Pydantic bỏ qua trường lạ. Nếu để mặc định thì worker gửi
    ``criteria_result`` (thiếu ``s``) sẽ được nhận, thành ``criteria_results=[]``,
    ``had_collision`` trả False, và ``adversarial_found`` đếm thiếu — sai số liệu
    nộp bài mà không có một dòng lỗi nào.
    """
    payload = {
        "scenario_id": "sc_001",
        "xosc_path": "outputs/sc_001.xosc",
        "success": True,
        "criteria_result": [  # ← thiếu chữ "s"
            {"name": "CollisionTest", "result": "FAILURE", "actual": "collision"}
        ],
    }
    with pytest.raises(ValidationError):
        ExecutionResult.model_validate(payload)


def test_failed_execution_must_carry_error() -> None:
    """success=False mà không có error là một lần chạy hỏng không debug được."""
    with pytest.raises(ValidationError, match="bắt buộc có error"):
        ExecutionResult.model_validate({"scenario_id": "sc_x", "xosc_path": "x.xosc", "success": False})


@pytest.mark.parametrize("reviewer", ["", "   "])
def test_review_gate_requires_accountable_person(reviewer: str) -> None:
    """Đề bài bắt quyết định điều khiển thiết bị phải có người chịu trách nhiệm."""
    with pytest.raises(ValidationError, match="phải ghi rõ ai duyệt"):
        ReviewDecision.model_validate(
            {
                "scenario_id": "sc_001",
                "gate": "before_sim",
                "approved": True,
                "reviewer": reviewer,
                "decided_at": "2026-07-29T10:00:00",
            }
        )


def test_reject_requires_reason() -> None:
    with pytest.raises(ValidationError, match="phải ghi lý do"):
        ReviewDecision.model_validate(
            {
                "scenario_id": "sc_001",
                "gate": "before_library",
                "approved": False,
                "reviewer": "cong",
                "decided_at": "2026-07-29T10:00:00",
            }
        )


def test_cut_in_geometry_actually_produces_a_cut_in() -> None:
    """Chủ thể phải BẮT KỊP ego, nếu không trigger không bao giờ bắn.

    Lỗi đã từng có thật ở fixture này: đặt xe máy 20m phía TRƯỚC ego rồi cho
    chạy nhanh hơn. Nó chạy xa dần, không có gì xảy ra, kịch bản vẫn
    success=true — loại hỏng tệ nhất vì nó trông như thành công.
    """
    spec = ScenarioSpec.model_validate(_load(FIXTURES / "scenario_specs" / "sc_001.json"))
    ego = next(a for a in spec.actors if a.is_ego)
    adv = next(a for a in spec.actors if not a.is_ego)

    assert adv.position.s_offset_m < 0, "chủ thể phải xuất phát PHÍA SAU ego"
    assert adv.initial_speed_kmh > ego.initial_speed_kmh, "phải nhanh hơn thì mới vượt lên được"

    closing_ms = (adv.initial_speed_kmh - ego.initial_speed_kmh) / 3.6
    trigger = spec.maneuvers[0].trigger
    assert trigger.type == "simulation_time"

    lead_at_trigger_m = closing_ms * trigger.value + adv.position.s_offset_m
    assert lead_at_trigger_m > 5.0, (
        f"lúc trigger bắn, chủ thể mới ở {lead_at_trigger_m:.1f}m so với ego — "
        "phải đã vượt lên trước thì tạt đầu mới có nghĩa"
    )
    assert trigger.value < spec.duration_s, "trigger phải bắn trước khi hết giờ"

    # Lỗi thứ hai đã mắc: tạt đầu xong vẫn giữ tốc độ cao hơn ego. Khoảng cách
    # nới rộng ra, không thể có va chạm — kịch bản "thành công" mà vô hại.
    after = spec.maneuvers[0].target_speed_kmh
    assert after is not None, "cut_in phải nói rõ tốc độ sau khi tạt"
    assert after < ego.initial_speed_kmh, (
        f"tạt đầu xong chạy {after} km/h mà ego chạy {ego.initial_speed_kmh} km/h "
        "thì xe máy chạy xa dần — không bao giờ va chạm"
    )

    # Va chạm phải xảy ra trước khi hết giờ, nếu không kịch bản vô nghĩa.
    reclosing_ms = (ego.initial_speed_kmh - after) / 3.6
    t_collision = trigger.value + lead_at_trigger_m / reclosing_ms
    assert t_collision < spec.duration_s, (
        f"va chạm rơi vào giây {t_collision:.1f} nhưng kịch bản chỉ dài "
        f"{spec.duration_s}s — kéo dài duration hoặc phanh sâu hơn"
    )


def test_trigger_after_end_of_scenario_is_rejected() -> None:
    """Hành vi hẹn giờ sau lúc kịch bản dừng thì không bao giờ chạy.

    Nguy hiểm vì nó vẫn `success=true`: chạy trót lọt, không có gì xảy ra.
    """
    spec = _load(FIXTURES / "scenario_specs" / "sc_001.json")
    spec["maneuvers"][0]["trigger"] = {"type": "simulation_time", "value": 45.0}
    spec["duration_s"] = 30.0
    with pytest.raises(ValidationError, match="không bao giờ chạy"):
        ScenarioSpec.model_validate(spec)


def test_odd_label_must_match_actual_actors() -> None:
    """Nhãn ODD sai làm phồng coverage và làm thư viện trả về sai nhãn."""
    spec = _load(FIXTURES / "scenario_specs" / "sc_001.json")
    spec["odd"]["actor_type"] = "pedestrian"  # nhưng chủ thể là xe máy
    with pytest.raises(ValidationError, match="không chủ thể nào"):
        ScenarioSpec.model_validate(spec)


def test_library_entry_ids_must_agree() -> None:
    """Gán kết quả va chạm cho sai kịch bản là lỗi không bao giờ tự lộ."""
    spec = _load(FIXTURES / "scenario_specs" / "sc_001.json")
    entry = {
        "scenario_id": "sc_999",  # lệch với spec.scenario_id = sc_001
        "title": "x",
        "description_vi": "x",
        "odd": spec["odd"],
        "xosc_path": "outputs/sc_999.xosc",
        "spec": spec,
        "approved_by": "cong",
        "created_at": "2026-07-29T10:00:00",
    }
    with pytest.raises(ValidationError, match="lệch với entry"):
        LibraryEntry.model_validate(entry)


def test_criterion_status_matches_scenario_runner_vocabulary() -> None:
    """Từ vựng phải khớp ScenarioRunner in ra, nếu không parse sẽ hỏng im lặng."""
    assert {s.value for s in CriterionStatus} == {
        "SUCCESS",
        "FAILURE",
        "ACCEPTABLE",
        "TIMEOUT",
    }


def test_odd_query_only_filters_on_stated_axes() -> None:
    """Câu chỉ nói 2/4 trục thì chỉ được lọc theo 2 trục đó.

    Lọc thêm trục người dùng không nhắc tới là tự thu hẹp kết quả vô căn cứ —
    sẽ bỏ sót đúng những ví dụ hữu ích cho few-shot.
    """
    q = ODDQuery(actor_type=ActorType.MOTORCYCLE, weather=Weather.RAIN)
    assert q.as_filter() == {"actor_type": "motorcycle", "weather": "rain"}
    assert ODDQuery().as_filter() == {}, "không nói gì thì không lọc gì"


def test_odd_query_filter_keys_match_cell_axes() -> None:
    """Khoá của filter phải trùng tên trường của ODDCell, nếu không Qdrant lọc trượt."""
    full = ODDQuery(
        road_type=RoadType.HIGHWAY,
        weather=Weather.CLEAR,
        actor_type=ActorType.MOTORCYCLE,
        maneuver=ManeuverType.CUT_IN,
    )
    assert set(full.as_filter()) == set(ODDCell.model_fields)
