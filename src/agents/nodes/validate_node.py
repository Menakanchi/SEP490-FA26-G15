from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from src.agents.state import ForgeState
from src.models.schemas import IssueCode, ODDQuery, ScenarioDraft, ValidationIssue
from src.services.scenario.geometry import (
    MIN_CUT_IN_LEAD_M,
    cut_in_cannot_catch_up,
    cut_in_lead_too_short,
    cut_in_never_slows_down,
    cut_in_starts_in_ego_lane,
    cut_in_trigger_is_not_positional,
    jaywalk_effective_gap_m,
    jaywalk_max_ego_speed_kmh,
    jaywalk_required_trigger_m,
    jaywalk_starts_in_ego_lane,
    jaywalk_starts_on_carriageway,
    jaywalk_trigger_too_close,
    lane_drift_trigger_too_late,
    time_until_alongside,
)
from src.services.scenario.templates import get_template


def _shoulders_for(road_type) -> tuple[int, int] | None:
    template = get_template(road_type)
    return template.shoulder_lane_offsets if template else None


def _shoulder_suggestion(actor_idx: int, road_type) -> str:
    """Khuyên đặt người đi bộ lên **lề**, và nói rõ lề nằm ở đâu.

    Bản cũ khuyên cứng ``lane_offset = -1`` kèm chú thích "bên lề trái". Trên
    anchor Town04 thì -1 là **làn xe chạy**; hai lề nằm ở +1 và -2. Một gợi ý sai
    trong vòng repair không dừng ở một kịch bản — nó sinh ra cả một họ kịch bản
    sai, và ``sc_035`` là con đẻ của chính câu đó.
    """
    shoulders = _shoulders_for(road_type)
    if not shoulders:
        return f"Đặt /actors/{actor_idx}/position/lane_offset ra lề đường để người đi bộ băng qua làn ego."
    right, left = shoulders
    return (
        f"Đặt /actors/{actor_idx}/position/lane_offset = {right} (lề phải) hoặc {left} (lề trái) "
        f"— người đi bộ phải đứng ở lề rồi băng qua làn ego sang lề bên kia."
    )


def _jaywalk_suggestion(index: int, actor_idx: int, maneuver, actor, ego, required: float, road_type) -> str:
    """Gợi ý sửa jaywalk, có tính tới tầm với của anchor.

    Nếu khoảng cách cần thiết vượt tầm anchor thì bảo model dời chỗ đứng là đẩy nó
    vào vòng lặp bất khả thi — converter chặn ngay sau đó, và ba vòng repair trôi
    đi mà không sửa được gì (đo ngày 23/08: ego 88 km/h cần 62 m, anchor với tới
    40 m). Lối thoát thật lúc ấy là **giảm tốc độ ego** hoặc **cho người đi bộ
    chạy vụt qua**.
    """
    template = get_template(road_type)
    forward = template.s_offset_reach_m[1] if template else None
    if forward is not None and required > forward:
        max_speed = jaywalk_max_ego_speed_kmh(maneuver, actor, forward)
        cap = f"{max_speed:.0f} km/h" if max_speed else "thấp hơn"
        return (
            f"Cần {round(required)}m nhưng anchor chỉ với tới {forward:.0f}m, nên dời chỗ đứng là bất khả thi. "
            f"Giảm tốc độ ego xuống <= {cap}, hoặc tăng /maneuvers/{index}/target_speed_kmh "
            f"(người đi bộ chạy vụt qua) để rút thời gian băng đường."
        )
    return (
        f"Đặt CẢ HAI: /actors/{actor_idx}/position/s_offset_m >= {round(required)} "
        f"và /maneuvers/{index}/trigger/value = {round(required)}. "
        f"Trigger rộng hơn khoảng cách xuất phát thì vô nghĩa — nó bắn ngay giây 0."
    )


def _earlier_than(alongside_s: float) -> float:
    """Mốc trigger an toàn TRƯỚC lúc hai xe ngang nhau, không bao giờ âm."""
    return max(round((alongside_s - 1.5) * 2) / 2, 0.5)


_INVARIANT_SUGGESTIONS: dict[IssueCode, str] = {
    IssueCode.EGO_COUNT: "Chỉ định đúng một actor có is_ego=True.",
    IssueCode.DUP_ACTOR_NAME: "Đảm bảo mỗi actor có một thuộc tính name duy nhất.",
    IssueCode.DANGLING_ACTOR_REF: "Sửa actor_name trong maneuver để trỏ tới một actor có thật.",
    IssueCode.EGO_HAS_MANEUVER: "Xóa maneuver của ego. Ego là đối tượng bị test.",
    IssueCode.TRIGGER_AFTER_END: "Giảm thời gian trigger hoặc tăng duration_s của kịch bản.",
    IssueCode.ODD_ACTOR_MISMATCH: "Thêm actor có category khớp với ODD.",
    IssueCode.ODD_MANEUVER_MISMATCH: "Đảm bảo có ít nhất một maneuver khớp với ODD.",
}


def _schema_suggestion(error: dict[str, Any], path: str) -> str:
    """Build an actionable suggestion from stable Pydantic error metadata."""
    error_type = error.get("type", "")
    context = error.get("ctx") or {}
    field = path or "giá trị"

    bounds = {
        "greater_than": ("lớn hơn", "gt"),
        "greater_than_equal": ("lớn hơn hoặc bằng", "ge"),
        "less_than": ("nhỏ hơn", "lt"),
        "less_than_equal": ("nhỏ hơn hoặc bằng", "le"),
    }
    if error_type in bounds:
        relation, key = bounds[error_type]
        return f"Đặt {field} {relation} {context.get(key)}."
    if error_type == "missing":
        return f"Bổ sung trường bắt buộc {field}."
    if error_type in {"string_too_short", "too_short"}:
        return f"Đảm bảo {field} có ít nhất {context.get('min_length')} phần tử hoặc ký tự."
    if error_type in {"string_too_long", "too_long"}:
        return f"Giới hạn {field} ở tối đa {context.get('max_length')} phần tử hoặc ký tự."
    if error_type in {"literal_error", "enum"}:
        return f"Đặt {field} thành một giá trị được phép: {context.get('expected')}."

    expected_types = {
        "bool_parsing": "boolean",
        "bool_type": "boolean",
        "dict_type": "object",
        "float_parsing": "số",
        "float_type": "số",
        "int_parsing": "số nguyên",
        "int_type": "số nguyên",
        "list_type": "danh sách",
        "string_type": "chuỗi",
    }
    if expected := expected_types.get(error_type):
        return f"Đặt {field} thành {expected} hợp lệ."
    if error_type == "finite_number":
        return f"Đặt {field} thành một số hữu hạn."
    return f"Kiểm tra lại kiểu dữ liệu và giá trị tại {field}."


def _value_at_location(data: object, location: tuple[object, ...]) -> object | None:
    """Read raw input defensively so issue mapping can use sibling fields."""
    current = data
    for part in location:
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and isinstance(part, int) and 0 <= part < len(current):
            current = current[part]
        else:
            return None
    return current


def _invariant_path(code: IssueCode, context: dict[str, Any]) -> str:
    """Map model-level invariant errors back to actionable JSON pointers."""
    fixed_paths = {
        IssueCode.EGO_COUNT: "/actors",
        IssueCode.ODD_ACTOR_MISMATCH: "/odd/actor_type",
        IssueCode.ODD_MANEUVER_MISMATCH: "/odd/maneuver",
    }
    if code in fixed_paths:
        return fixed_paths[code]
    if code is IssueCode.DUP_ACTOR_NAME:
        return f"/actors/{context.get('actor_index', 0)}/name"
    maneuver_index = context.get("maneuver_index", 0)
    suffix = {
        IssueCode.DANGLING_ACTOR_REF: "actor_name",
        IssueCode.EGO_HAS_MANEUVER: "actor_name",
        IssueCode.TRIGGER_AFTER_END: "trigger/value",
    }.get(code)
    return f"/maneuvers/{maneuver_index}/{suffix}" if suffix else ""


async def validate_node(state: ForgeState) -> dict[str, Any]:
    """Validate a draft and return structured issues for routing.

    Node này thực hiện validation theo schema và chuyển lỗi thành issue có cấu
    trúc để workflow dùng cho routing tiếp theo.
    Đồng thời áp dụng các Geometry Checks nâng cao.
    """
    draft_dict = state.get("draft")
    if draft_dict is None:
        return {
            "issues": [
                ValidationIssue(
                    code=IssueCode.SCHEMA_INVALID,
                    message_vi="Không có draft để validate",
                    suggestion="Cung cấp draft hợp lệ",
                )
            ]
        }

    issues: list[ValidationIssue] = []
    draft: ScenarioDraft | None = None

    try:
        if isinstance(draft_dict, dict):
            draft = ScenarioDraft.model_validate(draft_dict)
        else:
            draft = ScenarioDraft.model_validate(draft_dict.model_dump())
    except ValidationError as exc:
        for err in exc.errors():
            msg = err.get("msg", "")
            loc_tuple = err.get("loc", [])
            path = "/" + "/".join(str(part) for part in loc_tuple) if loc_tuple else ""
            error_type = err.get("type", "")

            code = IssueCode.SCHEMA_INVALID
            suggestion = _schema_suggestion(err, path)

            if error_type == "extra_forbidden":
                code = IssueCode.SCHEMA_EXTRA_FIELD
                suggestion = "Xóa các trường thừa không có trong schema."
            else:
                try:
                    invariant_code = IssueCode(error_type)
                except ValueError:
                    invariant_code = None
                if invariant_code in _INVARIANT_SUGGESTIONS:
                    code = invariant_code
                    path = _invariant_path(code, err.get("ctx") or {})
                    suggestion = _INVARIANT_SUGGESTIONS[invariant_code]
                elif (
                    error_type == "greater_than"
                    and tuple(loc_tuple[-2:]) == ("trigger", "value")
                    and isinstance(
                        trigger_input := _value_at_location(draft_dict, tuple(loc_tuple[:-1])),
                        dict,
                    )
                    and trigger_input.get("type") == "distance_to_ego"
                ):
                    code = IssueCode.TRIGGER_DISTANCE_UNSIGNED
                    suggestion = "Khoảng cách distance_to_ego phải luôn dương (>0)."

            issues.append(
                ValidationIssue(
                    code=code,
                    path=path,
                    message_vi=msg,
                    suggestion=suggestion,
                )
            )

        # Nếu đã lỗi Pydantic thì các logic hình học không nên chạy (tránh lỗi NoneType hoặc field thiếu)
        return {"issues": issues}
    except Exception as exc:  # pragma: no cover
        return {
            "issues": [
                ValidationIssue(
                    code=IssueCode.SCHEMA_INVALID,
                    message_vi=str(exc),
                    suggestion="Sửa draft để khớp schema của ScenarioDraft",
                )
            ]
        }

    # Geometry & Custom Checks if schema is valid
    if draft:
        odd_query_input = state.get("odd_query")
        if odd_query_input is None:
            issues.append(
                ValidationIssue(
                    code=IssueCode.VALIDATION_CONTEXT_MISSING,
                    path="/odd_query",
                    message_vi="Thiếu odd_query gốc nên không thể kiểm tra ODD_LABEL_DRIFT.",
                    suggestion="Đảm bảo parse_intent ghi odd_query vào state trước khi chạy validate.",
                )
            )
        else:
            try:
                odd_query = ODDQuery.model_validate(odd_query_input)
            except ValidationError as exc:
                issues.append(
                    ValidationIssue(
                        code=IssueCode.VALIDATION_CONTEXT_MISSING,
                        path="/odd_query",
                        message_vi=f"odd_query trong state không hợp lệ: {exc.errors()[0]['msg']}",
                        suggestion="Sửa đầu ra parse_intent để khớp schema ODDQuery trước khi chạy validate.",
                    )
                )
                odd_query = None

            # Chỉ các trục có giá trị trong ODDQuery mới là nhãn cần được giữ nguyên.
            if odd_query:
                for axis in ODDQuery.AXES:
                    expected = getattr(odd_query, axis)
                    actual = getattr(draft.odd, axis)
                    if expected is None or actual == expected:
                        continue
                    expected_str = expected.value if hasattr(expected, "value") else str(expected)
                    actual_str = actual.value if hasattr(actual, "value") else str(actual)
                    issues.append(
                        ValidationIssue(
                            code=IssueCode.ODD_LABEL_DRIFT,
                            path=f"/odd/{axis}",
                            message_vi=f"Nhãn ODD {axis} bị đổi từ {expected_str} sang {actual_str}.",
                            suggestion=f"Đặt /odd/{axis} thành '{expected_str}' như odd_query gốc.",
                        )
                    )

        ego = next((a for a in draft.actors if a.is_ego), None)
        # ScenarioDraft đảm bảo có đúng một ego. Guard này ngăn static checks chạy
        # với dữ liệu vi phạm contract nếu validation bị mock/bypass ở integration.
        if ego is None:
            issues.append(
                ValidationIssue(
                    code=IssueCode.EGO_COUNT,
                    path="/actors",
                    message_vi="Không tìm thấy ego sau khi schema validation hoàn tất.",
                    suggestion="Chỉ định đúng một actor có is_ego=True.",
                )
            )
            return {"issues": issues}

        actor_hints = state.get("actors") or []
        hinted_ego = next((actor for actor in actor_hints if actor.get("role") == "ego"), None)
        if hinted_ego and hinted_ego.get("category"):
            aliases = {"bus": "truck", "bicycle": "motorcycle"}
            raw_category = str(hinted_ego["category"])
            expected_category = aliases.get(raw_category, raw_category)
            if ego.category.value != expected_category:
                ego_idx = draft.actors.index(ego)
                issues.append(
                    ValidationIssue(
                        code=IssueCode.ACTOR_ROLE_MISMATCH,
                        path=f"/actors/{ego_idx}/is_ego",
                        message_vi=(
                            f"Câu gốc xác định {hinted_ego.get('specific_type') or expected_category} là ego, "
                            f"nhưng draft lại chọn {ego.specific_type or ego.category.value}."
                        ),
                        suggestion=(
                            f"Chọn actor category={expected_category} làm hero/is_ego=true, "
                            "và đặt is_ego=false cho actor hiện tại."
                        ),
                    )
                )

        # ActorSpec.position là required. Preflight phòng thủ này chỉ bảo vệ
        # integration bị mock/bypass; lỗi contract phải dừng toàn bộ geometry checks.
        missing_positions = [
            (act_idx, actor) for act_idx, actor in enumerate(draft.actors) if getattr(actor, "position", None) is None
        ]
        if missing_positions:
            issues.extend(
                ValidationIssue(
                    code=IssueCode.SCHEMA_INVALID,
                    path=f"/actors/{act_idx}/position",
                    message_vi=f"Actor {actor.name} thiếu position.",
                    suggestion="Bổ sung position hợp lệ cho actor trước khi chạy các kiểm tra hình học.",
                )
                for act_idx, actor in missing_positions
            )
            return {"issues": issues}

        for act_idx, actor in enumerate(draft.actors):
            if actor.is_ego:
                continue

            position = actor.position

            # LANE_OFFSET_IMPLAUSIBLE
            if abs(position.lane_offset) > 3:
                issues.append(
                    ValidationIssue(
                        code=IssueCode.LANE_OFFSET_IMPLAUSIBLE,
                        path=f"/actors/{act_idx}/position/lane_offset",
                        message_vi=f"Lane offset {position.lane_offset} của {actor.name} quá lớn, có thể vượt ra ngoài đường.",
                        suggestion="Giảm lane_offset xuống giá trị nhỏ hơn (vd: -2, -1, 0, 1, 2).",
                    )
                )

        for i, m in enumerate(draft.maneuvers):
            actor_idx = next((idx for idx, a in enumerate(draft.actors) if a.name == m.actor_name), None)
            if actor_idx is None:
                continue
            actor = draft.actors[actor_idx]
            position = actor.position

            if m.maneuver == "jaywalk" and jaywalk_starts_in_ego_lane(actor):
                issues.append(
                    ValidationIssue(
                        code=IssueCode.GEOM_JAYWALK_IN_EGO_LANE,
                        path=f"/actors/{actor_idx}/position/lane_offset",
                        message_vi=(
                            f"{actor.name} đứng sẵn trong làn ego (lane_offset=0) nên không có gì để băng ngang."
                        ),
                        suggestion=_shoulder_suggestion(actor_idx, draft.odd.road_type),
                    )
                )

            if m.maneuver == "jaywalk" and not jaywalk_starts_in_ego_lane(actor):
                shoulders = _shoulders_for(draft.odd.road_type)
                if shoulders and jaywalk_starts_on_carriageway(actor, shoulders):
                    issues.append(
                        ValidationIssue(
                            code=IssueCode.GEOM_JAYWALK_NOT_FROM_SHOULDER,
                            path=f"/actors/{actor_idx}/position/lane_offset",
                            message_vi=(
                                f"{actor.name} xuất phát giữa phần xe chạy "
                                f"(lane_offset={actor.position.lane_offset}) chứ không đứng ở lề, "
                                "nên đây là đi bộ trên đường chứ không phải băng qua đường."
                            ),
                            suggestion=_shoulder_suggestion(actor_idx, draft.odd.road_type),
                        )
                    )

            if m.maneuver == "jaywalk" and jaywalk_trigger_too_close(m, actor, ego):
                required = jaywalk_required_trigger_m(m, actor, ego) or 0.0
                issues.append(
                    ValidationIssue(
                        code=IssueCode.GEOM_JAYWALK_TRIGGER_TOO_CLOSE,
                        path=f"/maneuvers/{i}/trigger/value",
                        message_vi=(
                            f"{actor.name} bước xuống khi ego chỉ còn cách "
                            f"{jaywalk_effective_gap_m(m, actor, ego):.0f}m, "
                            f"nhưng ego chạy {ego.initial_speed_kmh}km/h nên đã đi qua trước khi "
                            f"người đi bộ sang tới làn."
                        ),
                        suggestion=_jaywalk_suggestion(i, actor_idx, m, actor, ego, required, draft.odd.road_type),
                    )
                )

            # GEOM_DRIFT_AFTER_PASS — lấn làn phải bắt đầu trước lúc hai xe
            # đi ngang nhau, nếu không nó lấn vào chỗ ego đã rời khỏi. Số học ở
            # ``services/scenario/geometry.py`` cùng chỗ với các vị từ cut_in.
            if m.maneuver == "lane_drift" and lane_drift_trigger_too_late(m, actor, ego):
                alongside_s = time_until_alongside(actor, ego) or 0.0
                issues.append(
                    ValidationIssue(
                        code=IssueCode.GEOM_DRIFT_AFTER_PASS,
                        path=f"/maneuvers/{i}/trigger/value",
                        message_vi=(
                            f"{actor.name} bắt đầu lấn làn ở giây {m.trigger.value} nhưng ego đã đi ngang qua "
                            f"trước đó, nên xe lấn vào khoảng trống phía sau ego."
                        ),
                        suggestion=(
                            f"Đặt /maneuvers/{i}/trigger/value = {_earlier_than(alongside_s)} "
                            f"(hai xe đi ngang nhau ở giây {alongside_s:.1f}; lấn phải bắt đầu trước đó), "
                            f"hoặc tăng /actors/{actor_idx}/position/s_offset_m để chúng gặp nhau muộn hơn."
                        ),
                    )
                )

            # GEOM_NO_COLLISION_AFTER_CUTIN
            if m.maneuver == "cut_in":
                ego_speed = ego.initial_speed_kmh
                post_maneuver_speed = m.target_speed_kmh if m.target_speed_kmh is not None else actor.initial_speed_kmh

                # Số học của bốn phép kiểm dưới đây nằm ở
                # ``services/scenario/geometry.py``, dùng chung với converter —
                # xem docstring ở đó. Chỗ này chỉ lo câu chữ và JSON pointer.
                #
                # Phép kiểm này chỉ có nghĩa với cut_in. Áp cho mọi actor thì
                # một người đi bộ jaywalk đứng sau ego cũng bị chặn luồng, và
                # gợi ý sửa hoá ra là bảo LLM cho người đi bộ chạy nhanh hơn ô
                # tô — ba vòng repair đốt vào một kịch bản vốn đã đúng.
                catchup_problem: tuple[str, str] | None = None
                if cut_in_cannot_catch_up(actor, ego):
                    # Hai vế của cùng một vị từ, tách ra chỉ để nói đúng vế nào
                    # đang hỏng — model sửa được "đặt ra sau" nhanh hơn nhiều so
                    # với một câu chung chung về "không đuổi kịp".
                    if position.s_offset_m >= 0:
                        catchup_problem = (
                            f"{actor.name} ở phía trước ego ({position.s_offset_m}m) nhưng không chậm hơn ego "
                            f"({actor.initial_speed_kmh}km/h so với {ego_speed}km/h), nên khoảng cách không thu hẹp.",
                            f"Giảm /actors/{actor_idx}/initial_speed_kmh xuống thấp hơn tốc độ ego, hoặc đặt actor phía sau và nhanh hơn ego.",
                        )
                    else:
                        catchup_problem = (
                            f"{actor.name} ở phía sau ego ({position.s_offset_m}m) nhưng vận tốc "
                            f"({actor.initial_speed_kmh}km/h) lại chậm hơn hoặc bằng ego ({ego_speed}km/h).",
                            "Tăng initial_speed_kmh của chủ thể lên cao hơn ego, hoặc đặt actor phía trước và chậm hơn ego.",
                        )
                if catchup_problem is not None:
                    issues.append(
                        ValidationIssue(
                            code=IssueCode.GEOM_NO_CATCHUP,
                            path=f"/actors/{actor_idx}",
                            message_vi=catchup_problem[0],
                            suggestion=catchup_problem[1],
                        )
                    )

                if cut_in_trigger_is_not_positional(m):
                    issues.append(
                        ValidationIssue(
                            code=IssueCode.TRIGGER_CUTIN_NOT_POSITIONAL,
                            path=f"/maneuvers/{i}/trigger/type",
                            message_vi=(
                                "cut_in không được kích hoạt theo thời gian hoặc khoảng cách vô hướng: "
                                "tốc độ thực trên CARLA có thể lệch tốc độ lệnh, nên actor vẫn có thể ở sau ego."
                            ),
                            suggestion=(
                                f"Đặt /maneuvers/{i}/trigger = "
                                f"{{'type': 'lead_distance', 'value': {MIN_CUT_IN_LEAD_M}}} để chỉ tạt "
                                "khi actor đã ở trước ego đủ một thân xe."
                            ),
                        )
                    )

                if cut_in_lead_too_short(m):
                    issues.append(
                        ValidationIssue(
                            code=IssueCode.GEOM_CUTIN_LEAD_TOO_SHORT,
                            path=f"/maneuvers/{i}/trigger/value",
                            message_vi=(
                                f"{actor.name} chỉ dẫn trước {m.trigger.value}m khi bắt đầu tạt; "
                                f"cần ít nhất {MIN_CUT_IN_LEAD_M}m để không cắt vào sườn hoặc đuôi ego."
                            ),
                            suggestion=(
                                f"Đặt /maneuvers/{i}/trigger/value >= {MIN_CUT_IN_LEAD_M}; "
                                "giá trị này là mét dẫn trước ego, không phải giây."
                            ),
                        )
                    )
                collision_reasons: list[str] = []
                repair_steps: list[str] = []
                if cut_in_starts_in_ego_lane(actor):
                    collision_reasons.append("lane_offset=0 nên actor không xuất phát ở làn bên cạnh")
                    repair_steps.append(f"đặt /actors/{actor_idx}/position/lane_offset khác 0")
                # Pha sau maneuver: target_speed khác initial_speed. Ego chỉ
                # thu hẹp khoảng cách khi target sau cut-in chậm hơn ego.
                if cut_in_never_slows_down(m, actor, ego):
                    collision_reasons.append(
                        f"tốc độ sau maneuver ({post_maneuver_speed}km/h) không thấp hơn ego ({ego_speed}km/h)"
                    )
                    repair_steps.append(f"đặt /maneuvers/{i}/target_speed_kmh thấp hơn {ego_speed}")

                if collision_reasons:
                    issues.append(
                        ValidationIssue(
                            code=IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN,
                            path=f"/maneuvers/{i}",
                            message_vi=f"{actor.name} không thể tạo va chạm sau cut-in: {'; '.join(collision_reasons)}.",
                            suggestion="; ".join(repair_steps).capitalize() + ".",
                        )
                    )

    # Chuẩn hoá raw dict thành model chỉ sau khi toàn bộ schema validation đã
    # qua. Node promote/converter từ đây luôn nhận ScenarioDraft thật.
    return {"issues": issues, "draft": draft}
