"""Final graph node: durably persist a scenario and stop at pending_review."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from src.agents.state import ForgeState
from src.config import get_settings
from src.models.schemas import IssueCode, ScenarioSpec, ScenarioStatus, ValidationIssue
from src.services.persistence import PersistenceError, ScenarioRepository, make_engine


@lru_cache(maxsize=1)
def get_repository() -> ScenarioRepository:
    return ScenarioRepository(make_engine(get_settings().database_url))


def _default_tags(spec: ScenarioSpec, state: ForgeState) -> list[str]:
    """Tag mặc định sinh từ chính ô ODD của kịch bản.

    Đề bài đòi "thư viện lưu trữ có gắn tag". Cột `tags` có sẵn nhưng luôn rỗng
    thì tính năng đó chỉ tồn tại trên giấy — không lọc được gì, không nhóm được
    gì. Bốn trục ODD là thứ người ta thực sự muốn lọc theo, nên gắn sẵn.

    Người dùng vẫn sửa được sau qua `PUT /scenarios/{id}/tags`; đây chỉ là điểm
    khởi đầu hữu ích thay vì một danh sách trống.
    """
    tags = [
        spec.odd.road_type.value,
        spec.odd.weather.value,
        spec.odd.actor_type.value,
        spec.odd.maneuver.value,
    ]
    # Chữ người dùng gõ, nếu parse_intent giữ được — đây mới là thứ đặc thù
    # giao thông Việt Nam mà bốn trục enum không diễn tả nổi.
    for extra in (spec.odd.specific_type, spec.odd.specific_action):
        if extra and extra.strip():
            tags.append(extra.strip().lower())
    tags.extend(state.get("tags", []) or [])
    # Bỏ trùng nhưng giữ thứ tự — thứ tự là "bốn trục trước, chi tiết sau".
    return list(dict.fromkeys(tags))


async def persist_pending_review_node(
    state: ForgeState,
    repository: ScenarioRepository | None = None,
) -> dict[str, Any]:
    """Write once and return; human review is a later HTTP transaction."""
    try:
        spec_value = state.get("spec")
        xosc_content = state.get("xosc_content")
        if spec_value is None or not xosc_content:
            raise PersistenceError("missing spec or xosc_content")
        spec = spec_value if isinstance(spec_value, ScenarioSpec) else ScenarioSpec.model_validate(spec_value)
        issues = list(state.get("issue_history", []))
        serialized_issues = [
            issue.model_dump(mode="json") if hasattr(issue, "model_dump") else issue for issue in issues
        ]
        for current_issue in state.get("issues", []):
            dumped = current_issue.model_dump(mode="json") if hasattr(current_issue, "model_dump") else current_issue
            if dumped not in serialized_issues:
                issues.append(current_issue)
                serialized_issues.append(dumped)
        assumptions = state.get("assumptions", [])
        metrics = dict(state.get("node_metrics", {}))
        metrics.setdefault("model", state.get("model_used", get_settings().model_name))
        metrics.setdefault("repair_iterations", state.get("iteration", 0))

        repo = repository or get_repository()
        repo.persist_pending_review(
            request_id=state.get("request_id", spec.scenario_id),
            request_description_vi=state.get("user_query", spec.description_vi),
            scenario_description_vi=spec.description_vi,
            created_by=state.get("created_by") or "unknown",
            validation_mode=state.get("validation_mode", "standard"),
            spec=spec,
            xosc_content=xosc_content,
            assumptions=[a.model_dump(mode="json") if hasattr(a, "model_dump") else a for a in assumptions],
            issue_history=[i.model_dump(mode="json") if hasattr(i, "model_dump") else i for i in issues],
            node_metrics=metrics,
            tags=_default_tags(spec, state),
        )
        return {"scenario_id": spec.scenario_id, "scenario_status": ScenarioStatus.PENDING_REVIEW}
    except Exception as exc:
        issue = ValidationIssue(
            code=IssueCode.PERSISTENCE_ERROR,
            path="/persistence",
            message_vi="Không thể lưu kịch bản để chờ duyệt.",
            suggestion="Kiểm tra kết nối database và thử lại; không gửi lỗi này vào vòng repair LLM.",
        )
        return {"issues": [issue], "failed_reason": str(exc) or type(exc).__name__}
