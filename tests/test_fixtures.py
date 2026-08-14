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
    DEFAULT_SUPPORT_POLICY,
    REPAIRABLE_CODES,
    ActorType,
    AssumptionSource,
    CriterionStatus,
    ExecutionResult,
    IssueCode,
    IssueSeverity,
    LibraryEntry,
    ManeuverType,
    ODDCell,
    ODDQuery,
    ReviewDecision,
    RoadType,
    ScenarioDraft,
    ScenarioSpec,
    SupportPolicy,
    ValidationIssue,
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
    """4 trục, 5 x 4 x 4 x 7. Đây là số tổ hợp **enum**, chưa phải mẫu số coverage.

    Trục thứ 4 là *tình huống*, không phải *thời điểm trong ngày* — đề bài đo
    "độ đa dạng của các tình huống". Test này canh để không ai lặng lẽ đổi lại.

    Mẫu số thật là ``SupportPolicy.denominator()`` — xem test ngay dưới.
    """
    assert len(RoadType) * len(Weather) * len(ActorType) * len(ManeuverType) == 560
    assert set(ODDCell.model_fields) == {"road_type", "weather", "actor_type", "maneuver"}


def test_default_support_policy_matches_verified_converter_scope() -> None:
    """Catalog có 6 vehicle maneuvers × 3 actors và jaywalk × pedestrian, trên 4 weather."""
    assert DEFAULT_SUPPORT_POLICY.denominator() == 76
    assert DEFAULT_SUPPORT_POLICY.supports(RoadType.HIGHWAY, ActorType.CAR, ManeuverType.CUT_IN)
    assert DEFAULT_SUPPORT_POLICY.supports(RoadType.HIGHWAY, ActorType.PEDESTRIAN, ManeuverType.JAYWALK)
    assert not DEFAULT_SUPPORT_POLICY.supports(RoadType.INTERSECTION, ActorType.CAR, ManeuverType.CUT_IN)
    assert not DEFAULT_SUPPORT_POLICY.supports(RoadType.HIGHWAY, ActorType.PEDESTRIAN, ManeuverType.CUT_IN)


def test_supported_cells_are_enumerated_not_computed() -> None:
    """Mẫu số phải chịu được mask không đều giữa các trục.

    Công thức đóng kiểu ``5 * 4 * 4 * |maneuver|`` sẽ ra sai ngay khi một tổ hợp
    bị loại ở ``roundabout`` mà không bị loại ở ``highway`` — và sai **im lặng**.
    """
    policy = SupportPolicy(
        unsupported=frozenset(
            {
                (RoadType.ROUNDABOUT, ActorType.PEDESTRIAN, ManeuverType.RUN_RED_LIGHT),
                (RoadType.HIGHWAY, ActorType.PEDESTRIAN, ManeuverType.JAYWALK),
            }
        )
    )
    assert policy.denominator() == 560 - 2 * len(Weather), "mỗi tổ hợp bị loại xoá đi 4 ô thời tiết"
    assert not policy.supports(RoadType.HIGHWAY, ActorType.PEDESTRIAN, ManeuverType.JAYWALK)
    assert policy.supports(RoadType.INTERSECTION, ActorType.PEDESTRIAN, ManeuverType.JAYWALK)
    assert len({c.key for c in policy.supported_cells()}) == policy.denominator(), "không được trùng ô"


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


def _invalid_drafts() -> list[Path]:
    return sorted((FIXTURES / "invalid_drafts").glob("*.json"))


def _invalid(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("path", _invalid_drafts(), ids=lambda p: p.stem)
def test_invalid_draft_declares_known_codes(path: Path) -> None:
    """Mọi ``expected_codes`` phải nằm trong ``IssueCode``.

    Fixture khai một code không tồn tại thì tới W5 failure analysis sẽ nhóm
    trượt và không ai phát hiện — code là khoá gom nhóm, không phải chú thích.
    """
    case = _invalid(path)
    assert case["caught_by"] in {"pydantic", "static_check", "validate_node"}
    assert case["expected_codes"], "fixture sai phải nói rõ nó sai code gì"
    assert len(case["expected_paths"]) == len(case["expected_codes"])
    assert all(path.startswith("/") for path in case["expected_paths"])
    for code in case["expected_codes"]:
        assert code in IssueCode.__members__, f"{code} không có trong IssueCode"
        if IssueCode[code] is not IssueCode.LANE_OFFSET_IMPLAUSIBLE:
            assert IssueCode[code] in REPAIRABLE_CODES, "mọi error ở đây đều là lỗi nội dung LLM sinh"


def test_invalid_fixtures_cover_every_validate_issue_code() -> None:
    required = {
        IssueCode.SCHEMA_INVALID,
        IssueCode.SCHEMA_EXTRA_FIELD,
        IssueCode.EGO_COUNT,
        IssueCode.DUP_ACTOR_NAME,
        IssueCode.DANGLING_ACTOR_REF,
        IssueCode.EGO_HAS_MANEUVER,
        IssueCode.TRIGGER_AFTER_END,
        IssueCode.ODD_ACTOR_MISMATCH,
        IssueCode.ODD_MANEUVER_MISMATCH,
        IssueCode.ODD_LABEL_DRIFT,
        IssueCode.GEOM_NO_CATCHUP,
        IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN,
        IssueCode.TRIGGER_DISTANCE_UNSIGNED,
        IssueCode.LANE_OFFSET_IMPLAUSIBLE,
    }
    covered = {IssueCode(code) for path in _invalid_drafts() for code in _invalid(path)["expected_codes"]}
    assert required <= covered


@pytest.mark.parametrize(
    "path",
    [p for p in _invalid_drafts() if _invalid(p)["caught_by"] == "pydantic"],
    ids=lambda p: p.stem,
)
def test_invalid_draft_rejected_by_schema(path: Path) -> None:
    """Nhóm lỗi Pydantic bắt được **ngay hôm nay**, không cần static_check."""
    case = _invalid(path)
    with pytest.raises(ValidationError, match=case["expected_message"]):
        ScenarioDraft.model_validate(case["draft"])


@pytest.mark.parametrize(
    "path",
    [p for p in _invalid_drafts() if _invalid(p)["caught_by"] == "static_check"],
    ids=lambda p: p.stem,
)
def test_geometry_bugs_pass_schema_and_need_static_check(path: Path) -> None:
    """Ba fixture này **hợp lệ về schema** — đó chính là điều làm chúng nguy hiểm.

    Chúng chạy trót lọt, ``success=true``, và không có gì xảy ra. Đây là bộ test
    có sẵn cho ``services/carla/static_check.py``: viết xong hàm đó thì thay
    dòng cuối bằng ``assert codes(static_check(draft)) == case["expected_codes"]``.
    """
    case = _invalid(path)
    draft = ScenarioDraft.model_validate(case["draft"])  # KHÔNG được ném — đó là cái bẫy
    assert draft.maneuvers, "fixture hình học phải có maneuver để kiểm"


def test_llm_never_gets_to_choose_scenario_id() -> None:
    """``ScenarioDraft`` không có ``scenario_id`` và ``description_vi``.

    Few-shot prompt chứa ``sc_001`` thì model trả ``sc_001`` — mỗi lần, cho mọi
    người dùng. Đó là trùng khoá chính. Cách chắc chắn nhất để nó không xảy ra
    là schema gửi cho model **không có ô đó**.
    """
    assert "scenario_id" not in ScenarioDraft.model_fields
    assert "description_vi" not in ScenarioDraft.model_fields
    assert {"scenario_id", "description_vi"} <= set(ScenarioSpec.model_fields)


def test_draft_and_spec_enforce_the_same_rules() -> None:
    """Draft lỏng hơn Spec là lỗi nguy hiểm: repair sẽ không bắt được lỗi mà Spec chặn sau."""
    bad = _load(FIXTURES / "invalid_drafts" / "ego_has_maneuver.json")["draft"]
    with pytest.raises(ValidationError, match="ego không được mang maneuver"):
        ScenarioDraft.model_validate(bad)

    spec_fields = set(ScenarioSpec.model_fields) - {"scenario_id", "description_vi"}
    assert spec_fields == set(ScenarioDraft.model_fields), "hai model phải khác nhau đúng 2 trường"


def test_promote_copies_user_sentence_verbatim() -> None:
    """Backend cấp id và copy câu gốc. Model không được chạm vào cả hai."""
    draft = ScenarioDraft.model_validate(
        {
            k: v
            for k, v in _load(FIXTURES / "scenario_specs" / "sc_001.json").items()
            if k not in {"scenario_id", "description_vi"}
        }
    )
    cau_goc = "xe máy tạt đầu lúc mưa ở ngã tư"
    spec = ScenarioSpec.promote(draft, scenario_id="sc_042", description_vi=cau_goc)

    assert spec.scenario_id == "sc_042"
    assert spec.description_vi == cau_goc, "paraphrase là hỏng cả retrieval eval lẫn intent match"
    assert spec.actors == draft.actors and spec.odd == draft.odd


def test_repairable_codes_exclude_system_and_safety_errors() -> None:
    """Gửi lỗi hệ thống cho LLM sửa là đốt 3 vòng để nhận về đúng lỗi cũ.

    ``GUARDRAIL_VIOLATION`` nằm ngoài vì lý do **an toàn**: đưa prompt injection
    vào vòng repair là tặng cho người tấn công lượt thử thứ hai và thứ ba.
    """
    for code in (
        IssueCode.GUARDRAIL_VIOLATION,
        IssueCode.LLM_PROVIDER_ERROR,
        IssueCode.LLM_OUTPUT_NOT_JSON,
        IssueCode.CONVERTER_ERROR,
        IssueCode.PERSISTENCE_ERROR,
        IssueCode.UNSUPPORTED_COMBINATION,
        IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
        IssueCode.BUDGET_EXCEEDED,
        IssueCode.NEED_MORE_DETAIL,
        IssueCode.VALIDATION_CONTEXT_MISSING,
    ):
        assert not ValidationIssue(code=code, message_vi="x").repairable_by_llm, code
    assert REPAIRABLE_CODES <= set(IssueCode)


def test_issue_survives_a_round_trip_through_the_database() -> None:
    """``issue_history`` ghi JSONB xuống Postgres rồi đọc lên lại ở W5.

    ``computed_field`` đưa ``severity`` vào ``model_dump()`` (đúng — reviewer và
    DB cần thấy), nhưng ``extra="forbid"`` sẽ làm chiều ngược lại vỡ nếu không
    gỡ ra. Vỡ ở đây nghĩa là mất sạch dữ liệu failure analysis, và chỉ lộ ra ở W5.
    """
    original = ValidationIssue(
        code=IssueCode.GEOM_NO_CATCHUP, message_vi="xe máy không bắt kịp ego", suggestion="đặt s_offset_m âm"
    )
    dumped = original.model_dump(mode="json")
    assert dumped["severity"] == "error", "reviewer phải đọc được severity từ JSON"
    assert dumped["repairable_by_llm"] is True

    assert ValidationIssue.model_validate(dumped) == original

    # Dòng DB cũ ghi sai severity KHÔNG được thắng code.
    doctored = {**dumped, "severity": "warning", "code": IssueCode.GUARDRAIL_VIOLATION.value}
    assert ValidationIssue.model_validate(doctored).severity is IssueSeverity.ERROR


def test_severity_follows_the_code_and_cannot_be_overridden() -> None:
    """Không ai được hạ một lỗi chặn xuống warning.

    Nếu severity là trường set tự do thì
    ``ValidationIssue(code=GUARDRAIL_VIOLATION, severity=WARNING)`` sẽ khiến
    ``route_after_validate`` bỏ qua và trả ``promote`` — prompt injection đi
    thẳng qua cổng. Cùng lỗ hổng cho ``SCHEMA_INVALID``: draft hỏng vẫn promote.
    """
    assert "severity" not in ValidationIssue.model_fields, "severity phải là computed, không phải field"

    for code in IssueCode:
        issue = ValidationIssue(code=code, message_vi="x")
        expected = IssueSeverity.WARNING if code is IssueCode.LANE_OFFSET_IMPLAUSIBLE else IssueSeverity.ERROR
        assert issue.severity is expected, code


def test_default_road_type_asks_the_support_policy_first() -> None:
    """Điền cứng ``urban_straight`` sẽ từ chối một yêu cầu vốn có lời giải hợp lệ.

    Câu *"xe máy tạt đầu"* không nói loại đường. Nếu catalog chỉ dựng được
    ``cut_in`` trên cao tốc mà code cứ điền ``urban_straight`` thì precheck trả
    ``UNSUPPORTED_COMBINATION`` — hệ thống tự tạo ra lỗi cho chính mình.
    """
    chi_cao_toc = SupportPolicy(
        unsupported=frozenset(
            {(road, ActorType.MOTORCYCLE, ManeuverType.CUT_IN) for road in RoadType if road is not RoadType.HIGHWAY}
        )
    )
    q = ODDQuery(actor_type=ActorType.MOTORCYCLE, maneuver=ManeuverType.CUT_IN)

    cell, _ = q.with_defaults(chi_cao_toc)
    assert cell.road_type is RoadType.HIGHWAY
    assert chi_cao_toc.supports(cell.road_type, cell.actor_type, cell.maneuver)

    assert q.with_defaults()[0].road_type is RoadType.HIGHWAY, "default policy phải khớp catalog đã xác minh"


def test_inference_is_recorded_so_reviewer_can_see_it() -> None:
    """Một suy luận không ghi lại là một suy luận không ai kiểm được.

    *"người băng qua đường"* suy ra ``pedestrian``: gần như chắc chắn, vẫn phải
    hiện ở cổng 1. Reviewer phải phân biệt được "trời mưa" là do họ nói hay do
    máy đoán.
    """
    q = ODDQuery(
        actor_type=ActorType.PEDESTRIAN,
        maneuver=ManeuverType.JAYWALK,
        inferred=["maneuver", "actor_type"],  # thứ tự lộn xộn — validator phải chuẩn hoá
    )
    _, assumptions = q.with_defaults()
    by_field = {a.field: a for a in assumptions}

    assert by_field["actor_type"].source is AssumptionSource.INFERRED
    assert by_field["maneuver"].source is AssumptionSource.INFERRED
    assert by_field["weather"].source is AssumptionSource.DEFAULT
    assert q.as_filter()["actor_type"] == "pedestrian", "suy luận gần-chắc-chắn vẫn được lọc"
    assert q.inferred == ["actor_type", "maneuver"], "thứ tự phải ổn định theo AXES"


def test_oddquery_schema_has_no_uniqueitems() -> None:
    """``ODDQuery`` là schema gửi thẳng cho model, nên nó bị giới hạn bởi tập
    từ khoá mà structured output hỗ trợ.

    Test này canh **đúng một** thứ đã từng hỏng thật: khai ``inferred`` là
    ``set``/``frozenset`` khiến Pydantic sinh ``uniqueItems: true``, và strict
    structured output từ chối request **trước khi model chạy** — `parse_intent`
    chết ngay dòng đầu chứ không phải lỗi lác đác lúc runtime.

    ⚠ Đây **không** phải bài kiểm tra đầy đủ cho strict mode. Strict còn đòi mọi
    property nằm trong ``required`` và ``additionalProperties: false``, mà cách
    thoả hai điều đó phụ thuộc client nào bọc lời gọi (LangChain
    ``with_structured_output`` tự lo; gọi thẳng OpenAI thì phải tự dựng). Chốt
    khi viết `parse_intent`, và siết test này lại lúc đó.
    """
    schema = json.dumps(ODDQuery.model_json_schema())
    assert "uniqueItems" not in schema, "set/frozenset trong schema gửi cho model = request bị từ chối"
    assert ODDQuery.model_json_schema()["properties"]["inferred"]["items"]["enum"] == list(ODDQuery.AXES), (
        "tên trục phải là enum trong schema thì model mới không sinh nổi tên sai"
    )


def test_inference_cannot_claim_an_empty_axis() -> None:
    """Đánh dấu suy luận cho trục rỗng là nói dối về nguồn gốc dữ liệu."""
    with pytest.raises(ValidationError, match="đánh dấu trục đang rỗng"):
        ODDQuery(actor_type=ActorType.CAR, inferred=["weather"])
    # Tên trục sai bị chặn ngay ở tầng Literal — và vì là Literal nên JSON Schema
    # gửi cho model cũng chặn, model không sinh nổi giá trị này ngay từ đầu.
    with pytest.raises(ValidationError, match="Input should be"):
        ODDQuery.model_validate({"actor_type": "car", "inferred": ["time_of_day"]})


def test_defaults_never_overwrite_what_user_said() -> None:
    """Trục người dùng nói rõ thì khoá cứng, và không sinh assumption nào."""
    q = ODDQuery(
        road_type=RoadType.HIGHWAY,
        weather=Weather.HEAVY_RAIN,
        actor_type=ActorType.TRUCK,
        maneuver=ManeuverType.SUDDEN_BRAKE,
    )
    cell, assumptions = q.with_defaults()
    assert assumptions == []
    assert cell.weather is Weather.HEAVY_RAIN
    assert q.as_filter() == {
        "road_type": "highway",
        "weather": "heavy_rain",
        "actor_type": "truck",
        "maneuver": "sudden_brake",
    }


def test_odd_query_filter_keys_match_cell_axes() -> None:
    """Khoá của filter phải trùng tên trường của ODDCell, nếu không mệnh đề WHERE lọc trượt."""
    full = ODDQuery(
        road_type=RoadType.HIGHWAY,
        weather=Weather.CLEAR,
        actor_type=ActorType.MOTORCYCLE,
        maneuver=ManeuverType.CUT_IN,
    )
    assert set(full.as_filter()) == set(ODDCell.model_fields)
