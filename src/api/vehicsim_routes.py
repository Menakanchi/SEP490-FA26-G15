"""HTTP cho vòng MVP VehicSim: ``/api/v1/vehicsim/*``.

Mọi route cần đăng nhập (``get_current_user``). VIEWER chỉ đọc; thao tác tạo /
chạy / quyết định cần ENGINEER hoặc ADMIN. Nghiệp vụ nằm trong
``src/services/vehicsim``; file này chỉ đổi lỗi thành mã HTTP.
"""

from __future__ import annotations

import csv
import io
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.api.auth_routes import CurrentUser, get_current_user
from src.services.auth import otp
from src.services.auth.users import User
from src.services.vehicsim import aeb, describe, family, regression, runs, views
from src.services.vehicsim.common import InvalidRequestError, NotFoundError

router = APIRouter(prefix="/vehicsim", tags=["vehicsim"], dependencies=[Depends(get_current_user)])

WRITE_ROLES = {"ADMIN", "ENGINEER"}


def require_engineer(user: CurrentUser) -> User:
    if not WRITE_ROLES & set(user.roles):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cần quyền ENGINEER để thực hiện thao tác này")
    return user


Engineer = Annotated[User, Depends(require_engineer)]


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except NotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Không tìm thấy: {exc}") from exc
    except InvalidRequestError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


def _project_id() -> int:
    return _call(views.context)["project"]["id"]


# ---------------------------------------------------------------------------
# Ngữ cảnh, họ kịch bản, AEB versions
# ---------------------------------------------------------------------------


@router.get("/context")
def get_context() -> dict:
    return _call(views.context)


class FamilyOrigin(BaseModel):
    """Bước 1 "Sinh từ mô tả": câu gốc + model + IR đã trích, lưu vào bản gốc của họ."""

    natural_language_input: str = Field(min_length=1, max_length=4000)
    llm_model: str | None = Field(default=None, max_length=100)
    described: dict | None = None


class FamilyRequest(BaseModel):
    name: str = Field(default=family.MOTIF_NAME, min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    ego_speeds_kmh: list[float] = Field(min_length=1, max_length=20)
    trigger_distances_m: list[float] = Field(min_length=1, max_length=20)
    pedestrian_speeds_mps: list[float] = Field(min_length=1, max_length=20)
    stops_at_curb: list[bool] = Field(min_length=1, max_length=2)
    weathers: list[Literal["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"]] = Field(min_length=1)
    times_of_day: list[Literal["DAY", "DUSK", "NIGHT"]] = Field(min_length=1)
    run_baseline: bool = True
    origin: FamilyOrigin | None = None


@router.get("/families")
def list_families() -> list[dict]:
    return _call(views.families)


@router.post("/families", status_code=status.HTTP_201_CREATED)
def create_family(body: FamilyRequest, user: Engineer) -> dict:
    spec = family.FamilySpec(**body.model_dump(exclude={"run_baseline", "origin"}))
    origin = body.origin.model_dump() if body.origin else None
    created = _call(family.create_family, _project_id(), spec, user.id, origin)
    if body.run_baseline:
        created["queued_runs"] = len(
            _call(runs.run_family, project_id=_project_id(), scenario_id=created["scenario_id"], user_id=user.id)
        )
    return created


class DescribeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# Mỗi lượt gọi tốn tiền LLM và app là public: giới hạn theo người dùng trong
# cửa sổ ``rate_limit_window_seconds`` (mặc định 15 phút).
DESCRIBE_LIMIT_PER_WINDOW = 30


@router.post("/scenarios/describe")
def describe_scenario(body: DescribeRequest, user: Engineer) -> dict:
    """Bước 1 của vòng MVP: câu mô tả tiếng Việt → Scenario IR (chưa lưu gì)."""
    if otp.hit_rate_limit("vs_describe", str(user.id), DESCRIBE_LIMIT_PER_WINDOW):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, detail="Gọi trích xuất quá nhiều lần, thử lại sau ít phút"
        )
    return _call(describe.describe, body.text)


class RunFamilyRequest(BaseModel):
    aeb_version_id: int | None = None


@router.post("/families/{scenario_id}/run", status_code=status.HTTP_202_ACCEPTED)
def run_family(scenario_id: int, body: RunFamilyRequest, user: Engineer) -> dict:
    ids = _call(
        runs.run_family,
        project_id=_project_id(),
        scenario_id=scenario_id,
        user_id=user.id,
        aeb_version_id=body.aeb_version_id,
    )
    return {"queued_runs": len(ids)}


@router.get("/aeb/versions")
def list_aeb_versions() -> list[dict]:
    return _call(views.aeb_versions)


class CandidateRequest(BaseModel):
    parent_version_id: int
    label: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=2000)
    values: dict[str, float] = Field(min_length=1)


@router.post("/aeb/versions", status_code=status.HTTP_201_CREATED)
def create_candidate(body: CandidateRequest, user: Engineer) -> dict:
    version_id = _call(
        aeb.create_candidate,
        project_id=_project_id(),
        user_id=user.id,
        parent_version_id=body.parent_version_id,
        values=body.values,
        label=body.label,
        notes=body.notes,
    )
    return {"id": version_id}


# ---------------------------------------------------------------------------
# FE-12 · Failure cases, detail, playback
# ---------------------------------------------------------------------------

FailureClass = Literal["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"]
Outcome = Literal["COLLISION", "NEAR_MISS", "FALSE_BRAKING"]


def _failure_filters(
    scenario_id: int | None = None,
    failure_class: FailureClass | None = None,
    outcome: Outcome | None = None,
    weather: str | None = None,
    aeb_version_id: int | None = None,
    days: int | None = Query(default=None, ge=1, le=3650),
) -> dict:
    return {
        "scenario_id": scenario_id,
        "failure_class": failure_class,
        "outcome": outcome,
        "weather": weather,
        "aeb_version_id": aeb_version_id,
        "days": days,
    }


@router.get("/failures")
def list_failures(
    filters: Annotated[dict, Depends(_failure_filters)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return _call(views.failure_list, **filters, page=page, page_size=page_size)


@router.get("/failures.csv")
def export_failures(filters: Annotated[dict, Depends(_failure_filters)]) -> StreamingResponse:
    data = _call(views.failure_list, **filters, page=1, page_size=100_000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    columns = [
        "run_id",
        "variant",
        "family",
        "summary",
        "outcome",
        "failure_type",
        "failure_class",
        "root_cause",
        "impact_kmh",
        "min_ttc_s",
        "config",
        "created_at",
    ]
    writer.writerow(columns)
    for item in data["items"]:
        writer.writerow([item.get(c) for c in columns])
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="failure_cases.csv"'},
    )


@router.get("/runs/{run_id}")
def get_run(run_id: int) -> dict:
    return _call(views.failure_detail, run_id)


@router.get("/runs/{run_id}/playback")
def get_playback(run_id: int) -> dict:
    return _call(views.playback, run_id)


# ---------------------------------------------------------------------------
# FE-14 · Regression, recommendation, review
# ---------------------------------------------------------------------------


class CriterionOverride(BaseModel):
    enabled: bool | None = None
    value: float | None = None


class RegressionRequest(BaseModel):
    candidate_version_id: int
    scenario_id: int
    include_old_critical: bool = True
    include_all_variants: bool = True
    criteria: dict[str, CriterionOverride] = Field(default_factory=dict)
    name: str | None = Field(default=None, max_length=150)


@router.get("/regression")
def list_regression(status_filter: str | None = Query(default=None, alias="status")) -> dict:
    return _call(views.regression_list, status_filter)


@router.get("/regression/preview")
def preview_regression(scenario_id: int) -> dict:
    return _call(regression.preview, project_id=_project_id(), scenario_id=scenario_id)


@router.post("/regression", status_code=status.HTTP_201_CREATED)
def create_regression(body: RegressionRequest, user: Engineer) -> dict:
    test_id = _call(
        regression.create_test,
        project_id=_project_id(),
        user_id=user.id,
        candidate_version_id=body.candidate_version_id,
        scenario_id=body.scenario_id,
        include_old_critical=body.include_old_critical,
        include_all_variants=body.include_all_variants,
        criteria={k: v.model_dump(exclude_none=True) for k, v in body.criteria.items()},
        name=body.name,
    )
    return {"id": test_id, "code": regression.test_code(test_id)}


@router.get("/regression/{test_id}")
def get_regression(test_id: int) -> dict:
    return _call(views.regression_detail, test_id)


@router.get("/recommendations")
def list_recommendations() -> list[dict]:
    return _call(views.recommendations)


@router.get("/recommendations/{test_id}")
def get_recommendation(test_id: int) -> dict:
    return _call(views.recommendation_detail, test_id)


class DecisionRequest(BaseModel):
    decision: Literal["ACCEPT", "REJECT", "REQUEST_MORE_TESTS"]
    reason: str = Field(min_length=1, max_length=4000)
    conditions: str | None = Field(default=None, max_length=4000)
    confirmed: bool


@router.post("/recommendations/{test_id}/decision")
def decide(test_id: int, body: DecisionRequest, user: Engineer) -> dict:
    _call(
        regression.decide,
        project_id=_project_id(),
        test_id=test_id,
        user_id=user.id,
        decision=body.decision,
        reason=body.reason,
        conditions=body.conditions,
        confirmed=body.confirmed,
    )
    return _call(views.recommendation_detail, test_id)
