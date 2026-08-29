"""REST API endpoints cho Scenario Forge.

**Ranh giới kiến trúc (test_architecture.py canh):**

- KHÔNG import ``sqlite3``, ``sqlalchemy``, ``numpy`` — DB logic nằm ở
  ``src/services/``. Router chỉ là lớp HTTP.
- KHÔNG import ``carla`` — ADR-001.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.agents.graph import build_forge_graph
from src.agents.nodes.convert_xosc_node import convert_spec_to_xosc
from src.agents.nodes.validate_node import validate_node
from src.models.schemas import (
    DEFAULT_SUPPORT_POLICY,
    TOO_VAGUE_MESSAGE,
    DuplicateMatch,
    EgoControllerType,
    # Domain models
    ExecutionResult,
    # API models
    GenerateRequest,
    GenerateResponse,
    JobKind,
    JobStatus,
    ODDCell,
    ReviewApiRequest,
    ReviewGate,
    ScenarioListResponse,
    ScenarioSpec,
    ScenarioStatus,
    StatusResponse,
    TagUpdateRequest,
    is_too_vague_to_generate,
    next_status_after_execution,
    next_status_after_review,
    normalize_prompt,
    verification_from_execution,
)
from src.services import campaign as campaign_service
from src.services import db, metrics, tuning
from src.services.email import send_registration_received_email, send_reviewer_approval_email
from src.services.library.retriever import SQLiteRetriever
from src.services.llm import collect_provider_metrics, summarize_provider_metrics
from src.services.near_duplicate import is_near_duplicate

logger = logging.getLogger(__name__)

router = APIRouter()


# Không có cache trong RAM. NFR-05 cấm giữ trạng thái chờ người duyệt trong bộ
# nhớ process, và bản cũ có ba dict làm "fallback" cho đúng thứ đó. Chúng vừa
# thừa — dữ liệu đã durable từ #39 — vừa nguy: Render free tier ngủ sau 15 phút
# không traffic, nên hành vi của app khác nhau giữa lúc process còn nóng và lúc
# vừa tỉnh dậy, mà chỉ cái sau mới là thứ người dùng thật gặp.


# ---------------------------------------------------------------------------
# Step progress mapping
# ---------------------------------------------------------------------------

# Tên phải khớp **đúng** tên node trong `build_forge_graph`: `astream` trả về
# khoá là tên node, và `_step_progress` tra thẳng vào danh sách này. Lệch một
# chữ thì progress đứng im ở 0 mà không có lỗi nào.
_STEP_ORDER = [
    "queued",
    "parse_intent",
    "retrieve",
    "generate_draft",
    "validate",
    "repair_draft",
    "promote",
    "convert_xosc",
    "persist_pending_sim_review",
]


def _step_progress(step: str) -> int:
    """Tính % tiến trình theo index của step."""
    if step == "done":
        return 100
    if step == "failed":
        return 0
    try:
        idx = _STEP_ORDER.index(step)
        return int((idx / len(_STEP_ORDER)) * 100)
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Chạy workflow
# ---------------------------------------------------------------------------


async def _run_workflow(request_id: str) -> None:
    """Chạy graph 7 node và ghi tiến độ để `GET /status` có cái mà trả về.

    Dùng ``astream`` chứ không ``ainvoke``: client cần biết đang ở node nào chứ
    không chỉ biết "đang chạy". Mỗi lần một node xong là một lần ghi xuống
    ``generation_requests`` — tiến độ nằm trên đĩa, nên process chết giữa chừng
    thì client vẫn đọc được nó dừng ở đâu, thay vì poll mãi một thứ đã chết.

    Node ``persist_pending_sim_review`` tự chốt hàng request thành ``done``, nên ở
    đây không ghi đè lại; chỉ xử lý nhánh **hỏng**.
    """
    req = db.get_generation_request(request_id)
    if not req:
        logger.warning("Không tìm thấy generation request %s", request_id)
        return

    state: dict = {
        "user_query": req["description_vi"],
        "limit": req.get("limit") or 3,
        "request_id": request_id,
        "validation_mode": req.get("validation_mode") or "static",
        "created_by": req.get("created_by") or "unknown",
    }

    final: dict = {}
    workflow_started = time.perf_counter()
    node_started = workflow_started
    node_latency: dict[str, dict[str, float | int]] = {}

    with collect_provider_metrics() as provider_events:
        try:
            async for event in build_forge_graph().astream(state):
                node_finished = time.perf_counter()
                elapsed = node_finished - node_started
                for node, update in event.items():
                    final.update(update or {})
                    timing = node_latency.setdefault(node, {"calls": 0, "latency_s": 0.0})
                    timing["calls"] = int(timing["calls"]) + 1
                    timing["latency_s"] = round(float(timing["latency_s"]) + elapsed, 6)
                    # `astream` yield SAU khi node xong, nên đây là "vừa xong node X".
                    # Không ghi đè lên trạng thái kết thúc: node persist tự chốt hàng
                    # request thành done/100 ngay trong transaction của nó, và vòng
                    # lặp này chạy sau đó — ghi đè là kéo ngược 100% về 88%, client
                    # poll mãi không bao giờ thấy "done" dù kịch bản đã nằm trong DB.
                    if node == "persist_pending_sim_review":
                        continue
                    db.update_generation_request(request_id, step=node, progress=_step_progress(node))
                node_started = node_finished
        except Exception as exc:
            logger.exception("Workflow hỏng ở request %s", request_id)
            _mark_failed(request_id, str(exc) or type(exc).__name__)
        else:
            if final.get("scenario_id"):
                # Chốt lại cho chắc. Persist đã đặt done/100, nhưng luồng này là thứ
                # client chờ nên nó phải tự chịu trách nhiệm về trạng thái cuối, không
                # trông vào việc node ở tầng dưới nhớ làm hộ.
                db.update_generation_request(
                    request_id, status="done", step="done", progress=100, scenario_id=final["scenario_id"]
                )
            else:
                # Tới đây là graph dừng sớm: thiếu thông tin, tổ hợp ngoài phạm vi, LLM
                # hỏng, hoặc hết ba vòng sửa. FR-14: **không** tạo scenario giả cho một
                # lần sinh thất bại — chỉ ghi lại dấu vết trên chính hàng request.
                issues = final.get("issues") or []
                reason = final.get("failed_reason") or (issues[0].message_vi if issues else "Không sinh được kịch bản")
                _mark_failed(request_id, reason)
        finally:
            telemetry = {
                "telemetry_version": 1,
                "workflow_latency_s": round(time.perf_counter() - workflow_started, 6),
                "node_latency": node_latency,
                "provider": summarize_provider_metrics(provider_events),
            }
            try:
                db.merge_generation_node_metrics(request_id, telemetry)
            except Exception:
                # Telemetry không được phép biến một scenario đã sinh đúng thành
                # request failed. Log để vận hành thấy, nhưng giữ kết quả workflow.
                logger.exception("Không lưu được telemetry cho request %s", request_id)


def _mark_failed(request_id: str, reason: str) -> None:
    db.update_generation_request(request_id, status="failed", step="failed", progress=0, error=reason)


# ---------------------------------------------------------------------------
# Tra cứu dùng chung
# ---------------------------------------------------------------------------

MIN_XOSC_LENGTH = 100
"""Dưới ngưỡng này thì cột ``xosc_content`` coi như rỗng, không phải một file."""


def _scenario_or_404(scenario_id: str) -> dict:
    """Đọc scenario, hoặc 404 với đúng một câu.

    Sáu route mở đầu bằng cùng ba dòng này. Chép sáu lần thì câu 404 lệch nhau
    theo thời gian, và frontend — vốn khớp theo chuỗi để hiện thông báo — sẽ
    nhận hai câu khác nhau cho cùng một tình huống.
    """
    scenario = db.get_scenario(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' không tồn tại")
    return scenario


def _has_xosc(scenario: dict) -> bool:
    """Kịch bản đã biên dịch được thành .xosc chưa.

    Ngưỡng nằm ở một chỗ vì cả hai chỗ dùng nó đều trả **409 với cùng lý do**:
    tổ hợp ODD ngoài phạm vi converter (ADR-016). Hai hằng số rời thì một bên
    phát ra file rỗng ruột trong khi bên kia đã từ chối nó.
    """
    return len(scenario.get("xosc_content") or "") >= MIN_XOSC_LENGTH


UNCOMPILED_SCENARIO_DETAIL = (
    "Kịch bản chưa biên dịch được thành .xosc — tổ hợp ODD của nó nằm ngoài phạm vi converter hiện tại (ADR-016)."
)


# ===========================================================================
# POST /generate & POST /scenarios/generate
# ===========================================================================


@router.post("/generate", response_model=GenerateResponse)
@router.post("/scenarios/generate", response_model=GenerateResponse)
async def generate(body: GenerateRequest) -> GenerateResponse:
    if is_too_vague_to_generate(body.prompt):
        raise HTTPException(status_code=400, detail=TOO_VAGUE_MESSAGE)

    # Chặn trùng đứng TRƯỚC parse_intent (ADR-015 §15.1). Đặt sau nó thì đã tiêu
    # mất một lượt LLM trước khi biết là câu này đã chạy rồi; đặt ở đây thì một
    # lần gõ lại tốn đúng một phép seek trên index.
    normalized = normalize_prompt(body.prompt)
    if not body.force_generate:
        duplicate = db.find_duplicate_prompt(normalized)
        if duplicate:
            return _duplicate_response(duplicate)

    request_id = str(uuid.uuid4())

    # Ghi hàng request TRƯỚC khi chạy workflow: client nhận request_id rồi poll
    # ngay, nên hàng đó phải tồn tại trước. Node persist_pending_sim_review sẽ chốt
    # nó thành done ở cuối luồng.
    try:
        db.create_generation_request(
            request_id,
            body.prompt,
            body.validation_mode,
            body.limit,
            created_by=body.created_by,
            force_generate=body.force_generate,
        )
    except db.DuplicateRequestInFlightError:
        # Hai request giống hệt tới cùng lúc: cả hai cùng thấy "chưa có ai chạy"
        # ở phép tra bên trên, rồi unique index loại cái tới sau. Tra lại để trả
        # về lần sinh đã thắng, thay vì báo lỗi cho một request hợp lệ.
        duplicate = db.find_duplicate_prompt(normalized)
        if duplicate:
            return _duplicate_response(duplicate)
        raise

    asyncio.create_task(_run_workflow(request_id))

    return GenerateResponse(request_id=request_id)


def _duplicate_response(duplicate: dict) -> GenerateResponse:
    """Phản hồi "đã tồn tại" — **không** phải lỗi, nên không dùng 4xx.

    ``request_id`` được trả lại nguyên: với lần sinh đang chạy thì client poll
    tiếp lần sinh đó, với lần sinh đã xong thì ``GET /status`` trả ngay
    ``done`` + ``scenario_id``. Client không cần đường xử lý riêng để lấy kết
    quả — chỉ cần đọc ``duplicate`` nếu muốn giải thích cho người dùng vì sao
    không có gì chạy.
    """
    return GenerateResponse(
        request_id=duplicate.get("request_id"),
        duplicate=DuplicateMatch(
            scenario_id=duplicate.get("scenario_id"),
            scenario_status=duplicate.get("scenario_status"),
            title=duplicate.get("title"),
            reason=duplicate.get("reason"),
            request_status=duplicate.get("request_status"),
        ),
    )


# ===========================================================================
# GET /status/{request_id}
# ===========================================================================


@router.get("/status/{request_id}", response_model=StatusResponse)
async def get_status(request_id: str) -> StatusResponse:
    """Polling trạng thái generation."""
    req = db.get_generation_request(request_id)
    if not req:
        raise HTTPException(status_code=404, detail=f"Generation request '{request_id}' không tồn tại")

    return StatusResponse(
        request_id=req["request_id"],
        step=req["step"],
        progress=req["progress"],
        scenario_id=req.get("scenario_id"),
        error=req.get("error"),
    )


# ===========================================================================
# POST /review & POST /scenarios/{scenario_id}/review
# ===========================================================================


def _auto_simulate_background(job_id: str, scenario_id: str) -> None:
    import os
    from src.config import get_settings

    if os.environ.get("PYTEST_CURRENT_TEST") or get_settings().app_env == "test":
        return
    try:
        from worker.mock_runner import process_job

        process_job({"job_id": job_id, "scenario_id": scenario_id, "xosc_path": ""})
        logger.info("Background mock simulation completed for scenario %s", scenario_id)
    except Exception as exc:
        logger.warning("Background mock simulation failed for scenario %s: %s", scenario_id, exc)


@router.post("/review")
@router.post("/scenarios/{scenario_id}/review")
async def post_review(
    body: ReviewApiRequest,
    scenario_id: str | None = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> dict:
    """Gửi quyết định HITL tại một cổng duyệt."""
    target_id = scenario_id or body.scenario_id
    if not target_id:
        raise HTTPException(status_code=400, detail="Thiếu scenario_id")
    body.scenario_id = target_id

    scenario = _scenario_or_404(target_id)

    if not body.approved and len(body.reason.strip()) < 10:
        raise HTTPException(
            status_code=422,
            detail="Lý do từ chối phải có ít nhất 10 ký tự — người sau cần biết vì sao",
        )

    try:
        gate = ReviewGate(body.gate.lower())
    except ValueError:
        gate = ReviewGate(body.gate)
    current_status = ScenarioStatus(scenario["status"])

    # L4 là chốt tự động, không phải người duyệt thay thế. Khi oracle nói sai
    # rõ ràng, API chặn cú approve vô thức; reviewer vẫn có quyền override nhưng
    # phải gửi cờ tường minh và ghi lý do để review log còn truy được quyết định.
    if body.approved and gate is ReviewGate.BEFORE_LIBRARY:
        intent_evaluation = _intent_evaluation(scenario)
        if intent_evaluation["verdict"] is False and not body.force_intent_override:
            raise HTTPException(
                status_code=409,
                detail="L4 tự động báo kịch bản không khớp ý định; hãy từ chối hoặc xác nhận override kèm lý do",
            )
        if body.force_intent_override and len(body.reason.strip()) < 10:
            raise HTTPException(
                status_code=422,
                detail="Override cảnh báo L4 phải có lý do ít nhất 10 ký tự",
            )

    next_status = next_status_after_review(current_status, gate, body.approved)
    if next_status is None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Không thể áp dụng quyết định '{gate.value}' (approved={body.approved}) "
                f"cho scenario đang ở trạng thái '{current_status.value}'"
            ),
        )

    if body.approved and gate is ReviewGate.BEFORE_SIM and not _has_xosc(scenario):
        raise HTTPException(status_code=409, detail=UNCOMPILED_SCENARIO_DETAIL)

    # ADR-019: cảnh báo gần trùng trước khi tạo job CARLA. Biến thể do tuner
    # sinh ra cố ý đứng sát nhau để dò biên tới hạn, nên không đem chúng qua
    # chốt này; chúng vẫn phải qua đúng cổng người duyệt như trước.
    if (
        body.approved
        and gate is ReviewGate.BEFORE_SIM
        and not str(scenario.get("created_by") or "").startswith("tuner:")
    ):
        spec_moi = ScenarioSpec.model_validate(scenario["spec"])
        candidates = db.get_scenarios_for_near_duplicate_check(
            road_type=spec_moi.odd.road_type.value,
            weather=spec_moi.odd.weather.value,
            actor_type=spec_moi.odd.actor_type.value,
            maneuver=spec_moi.odd.maneuver.value,
            exclude_id=target_id,
        )
        for candidate in candidates:
            try:
                spec_cu = ScenarioSpec.model_validate(candidate["spec"])
            except ValidationError:
                logger.warning("Bỏ qua candidate gần trùng có spec hỏng: %s", candidate["scenario_id"])
                continue
            result = is_near_duplicate(spec_moi, spec_cu)
            if not result:
                continue
            # ID ở hàng DB là nguồn sự thật cho điều hướng. Dữ liệu tuning cũ
            # từng copy spec gốc nên ``spec.scenario_id`` có thể vẫn là ID base.
            result = result.model_copy(update={"duplicate_scenario_id": candidate["scenario_id"]})
            if not body.force_simulate:
                logger.info(
                    "near_duplicate_warning scenario=%s duplicate=%s differences=%s",
                    target_id,
                    result.duplicate_scenario_id,
                    len(result.differences),
                )
                return {
                    "ok": False,
                    "warning": "near_duplicate",
                    "duplicate": result.model_dump(mode="json"),
                    "status": current_status.value,
                    "job_created": False,
                }
            logger.info(
                "near_duplicate_force_simulate scenario=%s duplicate=%s reviewer=%s",
                target_id,
                result.duplicate_scenario_id,
                body.reviewer,
            )
            if not body.reason.strip():
                body.reason = f"Vẫn chạy dù gần trùng với {result.duplicate_scenario_id}"
            break

    db.update_scenario_status(target_id, next_status.value)
    scenario["status"] = next_status.value

    db.save_review_decision(target_id, body.gate, body.approved, body.reviewer, body.reason)

    job_created = False
    if body.approved and gate is ReviewGate.BEFORE_SIM:
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        db.create_scenario_job(job_id, target_id, scenario["xosc_content"])
        job_created = True
        if background_tasks is not None:
            background_tasks.add_task(_auto_simulate_background, job_id, target_id)

    return {"ok": True, "status": next_status.value, "job_created": job_created}


# ===========================================================================
# PUT /scenarios/{scenario_id}/tags
# ===========================================================================


@router.put("/scenarios/{scenario_id}/tags")
async def update_tags(scenario_id: str, body: TagUpdateRequest) -> dict:
    """Thay toàn bộ tag của một kịch bản.

    Thay chứ không thêm: client gửi danh sách cuối cùng nó muốn. Gộp thêm/bớt
    thành hai endpoint khác nhau chỉ tạo cơ hội cho hai bên hiểu khác nhau về
    trạng thái hiện tại.
    """
    _scenario_or_404(scenario_id)

    cleaned = list(dict.fromkeys(t.strip().lower() for t in body.tags if t.strip()))
    db.set_tags(scenario_id, cleaned)
    return {"ok": True, "tags": cleaned}


# ===========================================================================
# GET /scenarios & GET /library/search
# ===========================================================================


class DraftCreateRequest(BaseModel):
    title: str | None = "Bản nháp kịch bản ODD"
    description_vi: str
    odd: dict | None = None
    spec: dict | None = None
    xosc_content: str | None = ""
    created_by: str | None = "creator"


class ScenarioUpdateRequest(BaseModel):
    title: str | None = None
    description_vi: str | None = None
    odd: dict | None = None
    spec: dict | None = None
    xosc_content: str | None = None
    status: str | None = None
    user: str | None = None


def _is_operational_library_item(item: dict) -> bool:
    """Chỉ artifact thật được phép xuất hiện trong thư viện vận hành.

    ``seed-data`` tồn tại để retrieval có ví dụ đa dạng, không phải bằng chứng
    converter/CARLA. Một số seed cố ý nằm ngoài SupportPolicy và rỗng `.xosc`;
    gắn sẵn ``approved_library`` cho chúng rồi hiện cạnh artifact thật khiến UI
    nói sai rằng hệ thống hỗ trợ các ca như pedestrian/jaywalk.
    """
    if item.get("created_by") == metrics.SEED_AUTHOR or not _has_xosc(item):
        return False
    try:
        odd = ODDCell.model_validate(item.get("odd") or {})
    except ValidationError:
        return False
    return DEFAULT_SUPPORT_POLICY.supports(odd.road_type, odd.actor_type, odd.maneuver)


def _operational_library(items: list[dict]) -> list[dict]:
    return [item for item in items if _is_operational_library_item(item)]


@router.post("/scenarios/draft")
async def create_draft_scenario(body: DraftCreateRequest) -> dict:
    sc = db.save_draft_scenario(
        title=body.title or "Bản nháp kịch bản ODD",
        description_vi=body.description_vi,
        odd=body.odd or {},
        spec=body.spec or {},
        xosc_content=body.xosc_content or "",
        created_by=body.created_by or "creator",
    )
    return {"ok": True, "scenario_id": sc["scenario_id"], "scenario": sc}


@router.get("/scenarios/public", response_model=ScenarioListResponse)
async def list_public_scenarios_endpoint() -> ScenarioListResponse:
    items = _operational_library(db.list_public_scenarios())
    _attach_controller_evaluations(items)
    return ScenarioListResponse(items=items, total=len(items))


@router.get("/scenarios/me", response_model=ScenarioListResponse)
async def list_my_scenarios_endpoint(
    user: str = Query("creator", description="Username hiện tại"),
) -> ScenarioListResponse:
    items = db.list_my_scenarios(user)
    _attach_controller_evaluations(items)
    return ScenarioListResponse(items=items, total=len(items))


@router.get("/scenarios", response_model=ScenarioListResponse)
@router.get("/library/search", response_model=ScenarioListResponse)
async def list_scenarios(
    search: str = Query("", description="Tìm kiếm theo title hoặc description"),
    road_type: str | None = Query(None),
    weather: str | None = Query(None),
    actor_type: str | None = Query(None),
    maneuver: str | None = Query(None),
    scope: str | None = Query(None, description="public | me | all"),
    user: str | None = Query(None, description="Username lọc theo cá nhân"),
    review_queue: bool = Query(False, description="Loại bản nháp khỏi hàng làm việc của reviewer"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> ScenarioListResponse:
    """Danh sách scenarios với lọc ODD, phân quyền scope và phân trang."""
    if scope == "public":
        items = _operational_library(db.list_public_scenarios())
    elif scope == "me" or user:
        items = db.list_my_scenarios(user or "creator")
    elif search or road_type or weather or actor_type or maneuver:
        retriever = SQLiteRetriever()
        odd_query = {
            "road_type": road_type,
            "weather": weather,
            "actor_type": actor_type,
            "maneuver": maneuver,
        }
        retrieved_list = retriever.retrieve(query_text=search or "", odd_query=odd_query, limit=limit * page)
        items = []
        for r in retrieved_list:
            sc = db.get_scenario(r["id"])
            if sc:
                items.append(sc)
            else:
                items.append(
                    {
                        "scenario_id": r["id"],
                        "title": r.get("title", ""),
                        "description_vi": r.get("description_vi", ""),
                        "status": "approved_library",
                        "odd": r.get("metadata", {}),
                        "spec": {},
                    }
                )
    else:
        items = db.list_all_scenarios()

    # Đây là lọc theo ngữ nghĩa màn hình, không phải access control. Backend
    # hiện chưa xác thực bearer token nên tuyệt đối không gọi query-param này là
    # "quyền riêng tư"; nó chỉ ngăn draft xuất hiện ở nơi không thể review.
    if review_queue:
        items = [
            item
            for item in items
            if item.get("status") != ScenarioStatus.DRAFT.value
            and item.get("created_by") != metrics.SEED_AUTHOR
            and _is_operational_library_item(item)
        ]

    total = len(items)
    offset = (page - 1) * limit
    paged = items[offset : offset + limit]
    _attach_controller_evaluations(paged)

    return ScenarioListResponse(items=paged, total=total)


@router.put("/scenarios/{scenario_id}")
async def update_scenario_endpoint(scenario_id: str, body: ScenarioUpdateRequest) -> dict:
    sc = _scenario_or_404(scenario_id)
    if sc["status"] in ("approved_library", "approved_sim"):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Approved scenarios cannot be modified or deleted",
        )
    if body.user and sc.get("created_by") not in ("unknown", None, body.user):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not have permission to modify this scenario",
        )
    updated = db.update_scenario(
        scenario_id=scenario_id,
        title=body.title,
        description_vi=body.description_vi,
        odd=body.odd,
        spec=body.spec,
        xosc_content=body.xosc_content,
        status=body.status,
    )
    return {"ok": True, "scenario": updated}


@router.delete("/scenarios/{scenario_id}")
async def delete_scenario_endpoint(scenario_id: str, user: str = Query("creator")) -> dict:
    sc = _scenario_or_404(scenario_id)
    if sc["status"] in ("approved_library", "approved_sim"):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Approved scenarios cannot be modified or deleted",
        )
    if user and sc.get("created_by") not in ("unknown", None, user):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not have permission to delete this scenario",
        )
    db.delete_scenario(scenario_id)
    return {"ok": True, "scenario_id": scenario_id}


@router.post("/scenarios/{scenario_id}/submit")
async def submit_scenario_for_review(scenario_id: str) -> dict:
    sc = _scenario_or_404(scenario_id)
    if sc["status"] in ("approved_library", "approved_sim"):
        raise HTTPException(status_code=400, detail="Scenario is already approved")
    db.update_scenario_status(scenario_id, "pending_sim_review")
    return {"ok": True, "scenario_id": scenario_id, "status": "pending_sim_review"}


class CompleteSimulationRequest(BaseModel):
    passed: bool = Field(True, description="Chạy thử đạt (True) hoặc không đạt (False)")
    notes: str | None = Field(None, description="Ghi chú kết quả mô phỏng ngoại tuyến")


@router.post("/scenarios/{scenario_id}/complete-simulation")
async def complete_simulation_endpoint(scenario_id: str, body: CompleteSimulationRequest = Body(...)) -> dict:
    _scenario_or_404(scenario_id)
    updated = db.complete_manual_simulation(scenario_id, passed=body.passed, notes=body.notes)
    if not updated:
        raise HTTPException(status_code=400, detail="Không thể cập nhật trạng thái kịch bản")
    return {
        "ok": True,
        "scenario_id": scenario_id,
        "status": updated["status"],
        "scenario": updated,
    }


# ===========================================================================
# GET /scenarios/{scenario_id}
# ===========================================================================


def _intent_evaluation(scenario: dict) -> dict:
    """Phán quyết L4 của lượt validation mới nhất, ở dạng UI dùng trực tiếp.

    Không chép lại luật hình học ở router: báo cáo M1-L4, trang gắn nhãn và Cổng
    2 phải cùng gọi đúng một oracle, nếu không cùng một lượt chạy có thể vừa
    "đúng" trong báo cáo vừa "sai" trên form duyệt.
    """
    execution_result = scenario.get("latest_execution_result")
    if not execution_result:
        return {
            "verdict": None,
            "status": "not_measurable",
            "label_vi": "Chưa có đủ dữ liệu để máy chấm ý định",
        }

    odd = scenario.get("odd") or {}
    verdict = metrics.intent_verdict(
        {
            "scenario_id": scenario.get("scenario_id"),
            "maneuver": odd.get("maneuver"),
            "result": execution_result,
        }
    )
    if verdict is True:
        return {"verdict": True, "status": "matched", "label_vi": "Khớp ý định mô tả"}
    if verdict is False:
        return {"verdict": False, "status": "mismatched", "label_vi": "Không khớp ý định mô tả"}
    return {
        "verdict": None,
        "status": "not_measurable",
        "label_vi": "Luật L4 chưa đủ dữ liệu để kết luận",
    }


@router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str) -> dict:
    """Chi tiết một scenario bao gồm spec, xosc_content và review_logs."""
    scenario = _scenario_or_404(scenario_id)
    scenario["intent_evaluation"] = _intent_evaluation(scenario)
    return scenario


# ===========================================================================
# GET /scenarios/{scenario_id}/xosc (Download .xosc with Status Gate HTTP 403)
# ===========================================================================


@router.get("/scenarios/{scenario_id}/xosc")
async def get_scenario_xosc(scenario_id: str) -> Response:
    """Tải XML để reviewer có thể kiểm tra ở cả hai cổng."""
    scenario = _scenario_or_404(scenario_id)

    if not _has_xosc(scenario):
        # Thà 409 còn hơn phát ra một file trông như thật mà rỗng ruột. Ca này
        # xảy ra với kịch bản nằm ngoài phạm vi converter (ADR-016): chúng vẫn
        # hữu ích cho retrieval nhưng chưa biên dịch được thành .xosc.
        raise HTTPException(status_code=409, detail=UNCOMPILED_SCENARIO_DETAIL)
    return Response(content=scenario["xosc_content"], media_type="application/xml")


# ===========================================================================
# Internal — GPU Worker endpoints
# ===========================================================================


class CampaignCreateRequest(BaseModel):
    """Khoanh vùng ODD — đầu vào của chế độ nâng cao.

    Người dùng **không** gõ câu tiếng Việt ở đây; họ chọn ô trên ma trận ODD còn
    agent viết câu. Câu đó rồi đi qua đúng đường mà chế độ cơ bản đang đi.
    """

    cells: list[dict] = Field(..., min_length=1, max_length=200)
    per_cell: int = Field(1, ge=1, le=20)
    # Trần là điều kiện dừng, không phải tuỳ chọn — xem docstring `services/campaign.py`.
    max_scenarios: int = Field(10, ge=1, le=200)
    created_by: str = "creator"


async def _run_campaign(campaign_id: str, plan: list, created_by: str) -> None:
    """Chạy tuần tự: mỗi ô một câu, mỗi câu một lượt sinh đầy đủ.

    Không chạy song song có chủ đích. Backend free tier có một worker nên song
    song chỉ đổi chỗ hàng đợi, mà mất khả năng dừng đúng lúc chạm trần.

    Mỗi lỗi chỉ giết một ô, không giết chiến dịch: một câu bị chặn vì trùng, hay
    một lần LLM hỏng, không được làm mất phần còn lại của lô.
    """
    generated = failed = 0
    for cell in plan:
        if (db.get_campaign(campaign_id) or {}).get("status") == "stopped":
            break
        try:
            prompt = await asyncio.to_thread(campaign_service.compose_prompt, cell, db.campaign_prompts(campaign_id))
            request_id = str(uuid.uuid4())
            db.create_generation_request(request_id, prompt, "static", 3, created_by=created_by, force_generate=True)
            db.attach_request_to_campaign(request_id, campaign_id)
            await _run_workflow(request_id)
            req = db.get_generation_request(request_id) or {}
            if req.get("scenario_id"):
                generated += 1
            else:
                failed += 1
        except Exception:  # noqa: BLE001 — một ô hỏng không được kéo cả lô theo
            logger.exception("Chiến dịch %s hỏng ở ô %s", campaign_id, cell.key)
            failed += 1
        db.update_campaign(campaign_id, generated=generated, failed=failed)

    final = (db.get_campaign(campaign_id) or {}).get("status")
    db.update_campaign(campaign_id, status="stopped" if final == "stopped" else "done")


@router.post("/campaigns")
async def create_campaign(body: CampaignCreateRequest) -> dict:
    """Mở một chiến dịch ODD và chạy nền."""
    plan = campaign_service.plan_cells(body.cells, body.per_cell, body.max_scenarios)
    if not plan:
        raise HTTPException(
            status_code=422,
            detail="Không ô nào nằm trong phạm vi converter dựng được (hiện chỉ highway — ADR-016)",
        )
    campaign_id = f"cmp_{uuid.uuid4().hex[:8]}"
    db.create_campaign(
        campaign_id,
        [c.model_dump(mode="json") for c in plan],
        body.per_cell,
        body.max_scenarios,
        body.created_by,
    )
    asyncio.create_task(_run_campaign(campaign_id, plan, body.created_by))
    return {"campaign_id": campaign_id, "planned": len(plan)}


@router.get("/campaigns")
async def list_campaigns() -> dict:
    return {"campaigns": db.list_campaigns()}


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str) -> dict:
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Chiến dịch '{campaign_id}' không tồn tại")
    return campaign


@router.post("/campaigns/{campaign_id}/stop")
async def stop_campaign(campaign_id: str) -> dict:
    """Dừng giữa chừng. Ô đang chạy vẫn chạy nốt; các ô sau không bắt đầu nữa."""
    if not db.get_campaign(campaign_id):
        raise HTTPException(status_code=404, detail=f"Chiến dịch '{campaign_id}' không tồn tại")
    db.update_campaign(campaign_id, status="stopped")
    return {"ok": True, "status": "stopped"}


class BatchReviewRequest(BaseModel):
    """Duyệt CẢ LÔ ở cổng 1 — ADR-014 phương án A3."""

    model_config = ConfigDict(extra="ignore")

    reviewer: str = Field(..., min_length=1)
    approved: bool = True
    reason: str = ""
    force_simulate: bool = False
    force_intent_override: bool = False


@router.post("/campaigns/{campaign_id}/review")
async def review_campaign(campaign_id: str, body: BatchReviewRequest) -> dict:
    """Cổng ``BEFORE_SIM`` áp lên **lô**, không lên từng kịch bản (ADR-014 §A3).

    Vì sao không giữ mỗi kịch bản một cú bấm: với 72 ô thì người duyệt bấm 72
    lần mà không thực sự đọc, và **rubber-stamp còn tệ hơn không có cổng** — nó
    tạo cảm giác an toàn giả trong khi vẫn tốn thời gian người. Người duyệt ở đây
    nhìn đúng thứ họ có thông tin để quyết: phạm vi ODD nào, bao nhiêu kịch bản,
    trần bao nhiêu — rồi đồng ý một lần.

    Vì sao không bỏ cổng: đề bài bắt con người phê duyệt trước khi điều khiển
    thiết bị. Đó là thứ duy nhất trong ADR-014 không được đem ra đánh đổi.

    **Biên của phép cấp phép nằm trong chính quyết định**: nó chỉ áp cho các kịch
    bản của chiến dịch này đang đứng ở cổng 1, không áp cho kịch bản sinh sau.
    """
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Chiến dịch '{campaign_id}' không tồn tại")

    waiting = db.campaign_scenarios_awaiting_sim(campaign_id)
    decided: list[str] = []
    warnings: list[dict] = []
    for scenario in waiting:
        result = await post_review(
            ReviewApiRequest(
                scenario_id=scenario["scenario_id"],
                gate="before_sim",
                approved=body.approved,
                reviewer=body.reviewer,
                reason=body.reason or ("duyệt theo lô " + campaign_id),
                force_simulate=body.force_simulate,
            )
        )
        if result.get("ok"):
            decided.append(scenario["scenario_id"])
        elif result.get("warning") == "near_duplicate":
            warnings.append({"scenario_id": scenario["scenario_id"], **result})

    return {
        "ok": not warnings,
        "campaign_id": campaign_id,
        "scenarios": decided,
        "count": len(decided),
        "near_duplicates": warnings,
    }


@router.post("/scenarios/{scenario_id}/tune")
async def tune_scenario(scenario_id: str) -> dict:
    """Sinh các biến thể để tìm bộ tham số làm kịch bản **thật sự tới hạn**.

    Bước *concretization* của tài liệu ngành: file hợp lệ mới là nửa việc, chọn
    được giá trị cụ thể tái hiện được nguy hiểm mới là nửa còn lại. Đo ngày 22/08:
    5 trên 8 kịch bản chấm được đã chạy trót lọt mà vô hại.

    Biến thể đi qua **đúng hàng đợi job và đúng cổng duyệt** như mọi kịch bản
    khác — cố ý. Cho chúng tự chạy là dựng một đường tắt vòng qua HITL, mà đó là
    ràng buộc không được đánh đổi của đề bài.
    """
    scenario = _scenario_or_404(scenario_id)
    try:
        spec = ScenarioSpec.model_validate(scenario["spec"])
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Spec không hợp lệ: {exc}") from exc

    if not tuning.variant_specs(spec):
        raise HTTPException(
            status_code=422,
            detail=(
                "Không dò được theo thời điểm trigger. Hoặc hai xe không tiến lại gần nhau, "
                "hoặc chúng gặp nhau quá sớm để hành vi kịp thành hình (cần ~2,5s), hoặc trigger "
                "không phải simulation_time. Cả ba đều nói vấn đề nằm ở vị trí/tốc độ ban đầu."
            ),
        )

    done = _tuning_variants_so_far(scenario_id)
    variant, decision = tuning.plan_sweep_step(spec, done)
    if variant is None:
        return {
            "ok": True,
            "scenario_id": scenario_id,
            "variants": [],
            "count": 0,
            "stopped": decision,
            "tried": [item["scenario_id"] for item in done],
        }

    variant_id = f"{scenario_id}_t{len(done) + 1}"
    try:
        xosc = convert_spec_to_xosc(variant.model_copy(update={"scenario_id": variant_id}))
    except Exception as exc:  # noqa: BLE001 — một biến thể hỏng không được giết cả phép dò
        logger.warning("Biến thể %s không biên dịch được: %s", variant_id, exc)
        raise HTTPException(status_code=422, detail=f"Biến thể không biên dịch được: {exc}") from exc

    db.save_scenario(
        variant_id,
        variant.title,
        scenario["description_vi"],
        variant.model_dump(mode="json"),
        variant.odd.model_dump(mode="json"),
        xosc_content=xosc,
        created_by=f"tuner:{scenario_id}",
    )
    return {
        "ok": True,
        "scenario_id": scenario_id,
        "variants": [variant_id],
        "count": 1,
        "stopped": None,
        "tried": [item["scenario_id"] for item in done],
    }


def _tuning_variants_so_far(scenario_id: str) -> list[dict]:
    """Các biến thể đã tạo cho kịch bản này, kèm metrics nếu đã chạy xong.

    Sắp theo ``scenario_id`` được vì hậu tố là ``_t1``, ``_t2``… theo đúng thứ tự
    ``propose_triggers`` sinh ra, và phép dò không bao giờ tới hai chữ số.
    """
    _, scenarios, executions = db.metrics_rows()
    metrics_by_id = {e["scenario_id"]: (e.get("result") or {}).get("metrics") or {} for e in executions}
    return [
        {"scenario_id": row["scenario_id"], "metrics": metrics_by_id.get(row["scenario_id"], {})}
        for row in sorted(scenarios, key=lambda r: r["scenario_id"])
        if row["scenario_id"].startswith(f"{scenario_id}_t")
    ]


@router.get("/scenarios/{scenario_id}/tune")
async def tuning_result(scenario_id: str) -> dict:
    """So các biến thể đã chạy với kịch bản gốc."""
    _scenario_or_404(scenario_id)
    _, _, executions = db.metrics_rows()
    by_id = {e["scenario_id"]: e for e in executions}

    baseline = by_id.get(scenario_id) or {}
    results = [
        {"scenario_id": sid, "metrics": (by_id[sid].get("result") or {}).get("metrics") or {}}
        for sid in sorted(by_id)
        if sid.startswith(f"{scenario_id}_t")
    ]
    summary = tuning.summarise_tuning({"metrics": (baseline.get("result") or {}).get("metrics") or {}}, results)
    return {"scenario_id": scenario_id, **summary}


class IntentLabelRequest(BaseModel):
    """Nhãn người cho câu "kịch bản này có tái hiện đúng ý định không"."""

    label: Literal["correct", "wrong", "unsure"]
    reason: str = ""
    labeller: str = "unknown"


# Đường dẫn riêng chứ không phải /scenarios/awaiting-label: route động
# /scenarios/{scenario_id} khai báo trước sẽ nuốt nó, và lỗi hiện ra là
# "Scenario 'awaiting-label' không tồn tại" — chẳng trỏ về nguyên nhân.
@router.get("/label/queue")
@router.get("/intent-labels/queue")
async def intent_label_queue(labeller: str = "unknown") -> dict:
    """Các lượt chạy có quỹ đạo, kèm mô tả gốc — **không kèm phán quyết của máy**."""
    labeller = labeller.strip() if labeller and labeller.strip() else "unknown"
    _, scenarios, executions = db.metrics_rows()
    has_trajectories = False
    for ex in executions:
        res = ex.get("result") or {}
        if isinstance(res, str):
            try:
                res = json.loads(res)
            except Exception:
                res = {}
        if isinstance(res, dict) and (res.get("trajectory") or res.get("frames")):
            has_trajectories = True
            break

    if not has_trajectories:
        db.seed_default_trajectories()
        _, scenarios, executions = db.metrics_rows()

    described = {s["scenario_id"]: s for s in scenarios}
    mine = {row["scenario_id"] for row in db.intent_labels() if row["labeller"] == labeller}

    items = []
    for execution in sorted(executions, key=lambda e: e["scenario_id"]):
        result = execution.get("result") or {}
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except Exception:
                result = {}
        if not isinstance(result, dict):
            continue
        trajectory_data = result.get("trajectory") or result.get("frames")
        if not trajectory_data:
            continue

        scenario = db.get_scenario(execution["scenario_id"]) or {}
        items.append(
            {
                "scenario_id": execution["scenario_id"],
                "title": scenario.get("title", ""),
                "description_vi": scenario.get("description_vi", ""),
                "maneuver": execution.get("maneuver"),
                "road_type": described.get(execution["scenario_id"], {}).get("road_type"),
                "trajectory": trajectory_data,
                "contact_time_s": (result.get("metrics") or {}).get("contact_time_s"),
                "labelled": execution["scenario_id"] in mine,
            }
        )
    return {"items": items, "count": len(items)}


@router.post("/scenarios/{scenario_id}/intent-label")
async def label_intent(scenario_id: str, body: IntentLabelRequest) -> dict:
    """Ghi nhãn người, kèm phán quyết của máy **tại thời điểm chấm**.

    Chép lại phán quyết máy vào hàng nhãn để chỗ lệch còn truy được về sau khi
    luật L4 đã đổi. Không có nó thì mỗi lần sửa luật là mất sạch lịch sử bất
    đồng — mà bất đồng mới là thứ đáng giá.
    """
    _scenario_or_404(scenario_id)
    _, _, executions = db.metrics_rows()
    execution = next((e for e in executions if e["scenario_id"] == scenario_id), None)
    if execution is None:
        raise HTTPException(status_code=409, detail="Kịch bản chưa chạy nên chưa có gì để chấm")

    verdict = metrics.intent_verdict(execution)
    saved = db.save_intent_label(
        scenario_id,
        body.labeller,
        body.label,
        body.reason.strip(),
        None if verdict is None else ("correct" if verdict else "wrong"),
    )
    return {"ok": True, **saved}


@router.get("/metrics/intent-agreement")
async def intent_agreement_report() -> dict:
    """Chấm tự động khớp với người chấm tay tới đâu — và lệch ở đâu."""
    _, _, executions = db.metrics_rows()
    return metrics.intent_agreement(executions, db.intent_labels())


@router.get("/library/audit")
async def library_audit() -> dict:
    """Rà lại **toàn kho** theo luật hiện tại. Chỉ báo, không sửa.

    Vì sao cần: luật hình học được bổ sung dần, nhưng chỉ áp **lúc sinh**. Kịch
    bản vào kho trước khi một luật ra đời thì không bao giờ được kiểm lại.

    Bằng chứng ngày 23/08/2026: ``sc_022`` nằm trong kho vi phạm
    ``MIN_CUT_IN_LEAD_M`` — nó tạt vào làn ego khi mới dẫn trước 4,67 m, dưới
    ngưỡng 7,0 m. Người xem trực tiếp trên CARLA phát hiện ("lúc ego đi qua rồi
    mới thấy xe máy nó tạt sang"), rồi chạy validate lại mới thấy luật **đã có
    sẵn** và bắt được nó từ lâu.

    Lượt rà đầu tiên bắt đúng hai kịch bản mà người chấm tay đã đánh "sai"
    (``sc_021``, ``sc_022``), và **không báo nhầm** cái nào trong năm kịch bản
    người chấm "đúng".

    **Không tự sửa**: sửa là đổi nội dung kịch bản, và đó là quyết định của người
    duyệt (ADR-018). Trả về kèm ``suggestion`` để họ có số cụ thể mà áp.
    """
    _, scenarios, _ = db.metrics_rows()
    rows = [s for s in scenarios if (s.get("created_by") or "") != metrics.SEED_AUTHOR]

    clean: list[str] = []
    flagged: list[dict] = []
    unbuildable: list[dict] = []

    for row in sorted(rows, key=lambda r: r["scenario_id"]):
        scenario_id = row["scenario_id"]
        full = db.get_scenario(scenario_id) or {}
        spec_data = dict(full.get("spec") or {})
        draft = {k: v for k, v in spec_data.items() if k not in ("scenario_id", "description_vi")}

        result = await validate_node({"draft": draft, "odd_query": {**draft.get("odd", {}), "inferred": []}})
        issues = result["issues"]

        try:
            convert_spec_to_xosc(ScenarioSpec.model_validate(spec_data))
        except Exception as exc:  # noqa: BLE001 — mọi kiểu hỏng đều là "không dựng lại được"
            unbuildable.append({"scenario_id": scenario_id, "status": row["status"], "reason": str(exc)})
            continue

        if issues:
            flagged.append(
                {
                    "scenario_id": scenario_id,
                    "status": row["status"],
                    "maneuver": row["maneuver"],
                    "issues": [i.model_dump(mode="json") for i in issues],
                }
            )
        else:
            clean.append(scenario_id)

    return {
        "audited": len(rows),
        "clean": len(clean),
        "flagged": flagged,
        "unbuildable": unbuildable,
    }


@router.get("/metrics/quality")
async def quality_report() -> dict:
    """Báo cáo M1/M2/M3 — mục "Báo cáo tỷ lệ kịch bản hợp lệ" của đề bài.

    Tính từ dữ liệu thật trong kho mỗi lần gọi, không có bảng tổng hợp riêng:
    số liệu báo cáo mà lệch với số liệu hệ thống là lỗi tệ nhất trong một báo cáo.
    """
    requests, scenarios, executions = db.metrics_rows()
    return metrics.build_report(requests, scenarios, executions)


def _result_had_collision(result: dict | None) -> bool | None:
    if not result or not result.get("success"):
        return None
    return any(
        str(item.get("name", "")).lower().startswith("collision") and str(item.get("result", "")).upper() == "FAILURE"
        for item in result.get("criteria_results", [])
    )


def _initial_speed_delta_ms(baseline: dict | None, controller: dict | None) -> float | None:
    """Độ lệch vận tốc ego ở giây 2; thiếu metric thì không giả vờ là bằng nhau."""
    baseline_speed = (baseline or {}).get("metrics", {}).get("ego_speed_at_2s_ms")
    controller_speed = (controller or {}).get("metrics", {}).get("ego_speed_at_2s_ms")
    if baseline_speed is None or controller_speed is None:
        return None
    return round(abs(float(baseline_speed) - float(controller_speed)), 3)


def _create_controller_pair(scenario: dict) -> list[dict]:
    """Tạo đúng một cặp A/B; mọi endpoint dùng chung để không lệch cấu hình."""
    scenario_id = scenario["scenario_id"]
    run_id = uuid.uuid4().hex[:8]
    baseline_job = db.create_scenario_job(
        f"ctrlbase_{run_id}",
        scenario_id,
        scenario["xosc_content"],
        job_kind=JobKind.CONTROLLER_EVALUATION,
        ego_controller=EgoControllerType.SCENARIO_RUNNER_DEFAULT,
    )
    behavior_job = db.create_scenario_job(
        f"ctrl_{run_id}",
        scenario_id,
        scenario["xosc_content"],
        job_kind=JobKind.CONTROLLER_EVALUATION,
        ego_controller=EgoControllerType.BEHAVIOR_AGENT,
    )
    return [baseline_job, behavior_job]


def _controller_ineligible_reason(scenario: dict, *, skip_completed: bool = False) -> str | None:
    if scenario["status"] != ScenarioStatus.APPROVED_LIBRARY.value:
        return "not_approved_library"
    if scenario.get("verification") != "adversarial":
        return "not_adversarial"
    if not _has_xosc(scenario):
        return "missing_xosc"
    runs = db.get_controller_runs(scenario["scenario_id"])
    if any(run["status"] in (JobStatus.PENDING.value, JobStatus.RUNNING.value) for run in runs):
        return "controller_run_pending"
    if skip_completed and runs:
        return "already_evaluated"
    return None


@router.post("/scenarios/{scenario_id}/controller-runs")
async def create_controller_run(scenario_id: str) -> dict:
    """Xếp một cặp A/B mới trên artifact đã xác minh, không sửa workflow HITL."""
    scenario = _scenario_or_404(scenario_id)
    reason = _controller_ineligible_reason(scenario)
    messages = {
        "not_approved_library": "Chỉ đánh giá controller trên kịch bản đã vào thư viện",
        "not_adversarial": "Kịch bản phải tái hiện được nguy hiểm trước khi thử controller",
        "missing_xosc": UNCOMPILED_SCENARIO_DETAIL,
        "controller_run_pending": "Kịch bản đã có một lượt đánh giá controller đang chờ",
    }
    if reason:
        raise HTTPException(status_code=409, detail=messages[reason])
    return {"ok": True, "jobs": _create_controller_pair(scenario)}


def _controller_evaluation(scenario: dict, runs: list[dict]) -> dict:
    """Phân loại A/B dùng chung cho detail, campaign và badge thư viện."""
    scenario_id = scenario["scenario_id"]
    pending = any(run["status"] in (JobStatus.PENDING.value, JobStatus.RUNNING.value) for run in runs)
    latest = next(
        (
            run
            for run in runs
            if run.get("result") and run.get("ego_controller") == EgoControllerType.BEHAVIOR_AGENT.value
        ),
        None,
    )
    evaluation_baseline = next(
        (
            run
            for run in runs
            if run.get("result") and run.get("ego_controller") == EgoControllerType.SCENARIO_RUNNER_DEFAULT.value
        ),
        None,
    )
    baseline = (evaluation_baseline or {}).get("result") or scenario.get("latest_execution_result")
    controller_result = latest.get("result") if latest else None
    baseline_collision = _result_had_collision(baseline)
    controller_collision = _result_had_collision(controller_result)
    initial_speed_delta_ms = _initial_speed_delta_ms(baseline, controller_result)
    comparable_initial_conditions = initial_speed_delta_ms is None or initial_speed_delta_ms <= 1.0
    controller_metrics = (controller_result or {}).get("metrics", {})
    min_distance = controller_metrics.get("min_distance_m")
    ttc = controller_metrics.get("ttc_min_s")

    if pending:
        outcome = "pending"
        next_action = "wait_for_pair"
        recommendation_vi = "Đang chạy cặp baseline và BehaviorAgent trên cùng artifact; chờ đủ hai lượt để so sánh."
    elif latest is None:
        outcome = "not_run"
        next_action = "run_controller"
        recommendation_vi = "Chạy BehaviorAgent để đánh giá phản ứng closed-loop trên kịch bản này."
    elif latest["status"] == JobStatus.FAILED.value or not latest["result"].get("success"):
        outcome = "execution_failed"
        next_action = "fix_worker"
        recommendation_vi = "Lượt đánh giá bị lỗi thực thi; cần sửa worker trước khi kết luận mô hình lái."
    elif not comparable_initial_conditions:
        outcome = "incomparable_initial_conditions"
        next_action = "rerun_controller"
        recommendation_vi = (
            f"Hai lượt lệch vận tốc ego {initial_speed_delta_ms:.2f} m/s ở giây 2; "
            "phải chạy lại trước khi kết luận controller."
        )
    elif baseline_collision is True and controller_collision is False:
        if (min_distance is not None and min_distance < 1.0) or (ttc is not None and ttc < 1.0):
            outcome = "near_failure"
            next_action = "create_harder_variant"
            recommendation_vi = (
                "BehaviorAgent tránh được nhưng đã vào vùng tới hạn; ưu tiên sinh biến thể quanh điểm này."
            )
        else:
            outcome = "avoided_hazard"
            next_action = "create_harder_variant"
            recommendation_vi = "BehaviorAgent đã tránh tương đối dễ; tạo biến thể gần/gấp hơn cho vòng tiếp theo."
    elif controller_collision is True:
        outcome = "controller_collision"
        next_action = "keep_regression"
        recommendation_vi = (
            "BehaviorAgent đã phản ứng nhưng vẫn va chạm; giữ kịch bản này làm ca thất bại/regression của mô hình lái."
        )
    else:
        outcome = "inconclusive"
        next_action = "adjust_scenario"
        recommendation_vi = "Chưa có chênh lệch A/B rõ; nên điều chỉnh thời điểm hoặc mức nghiêm trọng của biến thể."

    return {
        "scenario_id": scenario_id,
        "baseline": baseline,
        "runs": runs,
        "comparison": {
            "outcome": outcome,
            "baseline_collision": baseline_collision,
            "controller_collision": controller_collision,
            "initial_speed_delta_ms": initial_speed_delta_ms,
            "comparable_initial_conditions": comparable_initial_conditions,
            "next_action": next_action,
            "recommendation_vi": recommendation_vi,
        },
    }


def _attach_controller_evaluations(items: list[dict]) -> None:
    """Gắn trạng thái controller cho card đã duyệt mà không đổi lifecycle.

    Chỉ query sau phân trang nên tối đa ``limit`` lần (API chặn ở 100), không
    quét toàn thư viện. Draft và hàng chờ không đủ điều kiện chạy controller nên
    không gắn badge để tránh nói "chưa đánh giá" cho một artifact chưa hợp lệ.
    """
    for item in items:
        if item.get("status") not in (
            ScenarioStatus.APPROVED_LIBRARY.value,
            ScenarioStatus.APPROVED_SIM.value,
        ):
            continue
        runs = db.get_controller_runs(item["scenario_id"])
        item["controller_evaluation"] = _controller_evaluation(item, runs)["comparison"]


@router.get("/scenarios/{scenario_id}/controller-runs")
async def list_controller_runs(scenario_id: str) -> dict:
    """Trả lịch sử closed-loop và kết luận A/B dễ đọc cho UI/demo."""
    scenario = _scenario_or_404(scenario_id)
    return _controller_evaluation(scenario, db.get_controller_runs(scenario_id))


@router.post("/campaigns/{campaign_id}/controller-runs")
async def create_campaign_controller_runs(campaign_id: str) -> dict:
    """Xếp BehaviorAgent cho mọi ca nguy hiểm đã duyệt trong một chiến dịch.

    Batch mặc định chỉ chạy mỗi scenario một lần. Nút bấm lại trang không được
    âm thầm nhân đôi chi phí GPU; muốn regression lần hai vẫn dùng endpoint của
    từng scenario, nơi người dùng nhìn đúng artifact mình đang chạy lại.
    """
    if not db.get_campaign(campaign_id):
        raise HTTPException(status_code=404, detail=f"Chiến dịch '{campaign_id}' không tồn tại")

    jobs: list[dict] = []
    queued_scenarios: list[str] = []
    skipped: list[dict] = []
    for row in db.campaign_scenarios(campaign_id):
        scenario = db.get_scenario(row["scenario_id"]) or row
        reason = _controller_ineligible_reason(scenario, skip_completed=True)
        if reason:
            skipped.append({"scenario_id": row["scenario_id"], "reason": reason})
            continue
        jobs.extend(_create_controller_pair(scenario))
        queued_scenarios.append(row["scenario_id"])

    return {
        "ok": True,
        "campaign_id": campaign_id,
        "queued_scenarios": queued_scenarios,
        "count": len(queued_scenarios),
        "job_count": len(jobs),
        "jobs": jobs,
        "skipped": skipped,
    }


@router.get("/campaigns/{campaign_id}/controller-runs")
async def list_campaign_controller_runs(campaign_id: str) -> dict:
    """Tổng hợp kết luận closed-loop của lô để reviewer lọc lỗi mô hình."""
    if not db.get_campaign(campaign_id):
        raise HTTPException(status_code=404, detail=f"Chiến dịch '{campaign_id}' không tồn tại")

    scenarios = db.campaign_scenarios(campaign_id)
    scenario_ids = [s["scenario_id"] for s in scenarios]
    runs_map = db.get_controller_runs_by_scenario_ids(scenario_ids)

    evaluations: list[dict] = []
    counts: dict[str, int] = {}
    for scenario_row in scenarios:
        sid = scenario_row["scenario_id"]
        runs = runs_map.get(sid, [])
        if not runs:
            continue
        full_scenario = db.get_scenario(sid) or scenario_row
        evaluation = _controller_evaluation(full_scenario, runs)
        evaluations.append(evaluation)
        outcome = evaluation["comparison"]["outcome"]
        counts[outcome] = counts.get(outcome, 0) + 1

    return {
        "campaign_id": campaign_id,
        "evaluations": evaluations,
        "counts": counts,
        "pending": any(item["comparison"]["outcome"] == "pending" for item in evaluations),
    }


@router.get("/internal/jobs")
async def list_pending_jobs() -> dict:
    """Worker poll: trả pending jobs để worker nhận chạy."""
    return {"jobs": db.get_pending_jobs()}


@router.post("/internal/jobs/{job_id}/result")
async def submit_job_result(job_id: str, body: ExecutionResult) -> dict:
    """Worker submit kết quả sau khi chạy ScenarioRunner.

    Đây là chỗ **đóng vòng lặp** (ADR-017). Trước đây kết quả chỉ được ghi vào
    ``scenario_jobs.result`` rồi nằm im — không gì đọc, không gì đổi theo nó.
    Giờ nó cập nhật mức kiểm chứng của chính kịch bản, và mức đó quyết định
    kịch bản có được dùng làm ví dụ few-shot nữa hay không.

    Worker result mở cổng thứ hai; nó không tự đưa scenario vào thư viện.
    """
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' không tồn tại")
    if body.scenario_id != job["scenario_id"]:
        raise HTTPException(status_code=422, detail="scenario_id trong kết quả không khớp job")

    new_status = JobStatus.DONE.value if body.success else JobStatus.FAILED.value
    if job.get("job_kind") == JobKind.CONTROLLER_EVALUATION.value:
        if body.ego_controller.value != job.get("ego_controller"):
            raise HTTPException(status_code=422, detail="ego_controller trong kết quả không khớp job")
        db.update_job_result(job_id, new_status, body.model_dump(mode="json"))
        return {"ok": True, "status": new_status, "job_kind": JobKind.CONTROLLER_EVALUATION.value}

    scenario = _scenario_or_404(body.scenario_id)
    next_status = next_status_after_execution(ScenarioStatus(scenario["status"]))
    if next_status is None:
        raise HTTPException(
            status_code=409,
            detail=f"Kịch bản đang ở '{scenario['status']}', không chờ kết quả mô phỏng",
        )

    db.update_job_result(job_id, new_status, body.model_dump(mode="json"))

    level = verification_from_execution(body.success, body.criteria_results)
    if not db.complete_simulation(body.scenario_id, level):
        raise HTTPException(status_code=409, detail="Trạng thái kịch bản đã đổi trong lúc nhận kết quả")
    logger.info("Kịch bản %s -> %s, chờ BEFORE_LIBRARY", body.scenario_id, level.value)

    return {"ok": True, "verification": level.value, "status": next_status.value}


# ===========================================================================
# Auth & User Management Endpoints
# ===========================================================================


class RegisterApiRequest(BaseModel):
    username: str
    name: str
    email: str
    role: str = "creator"
    password: str | None = None
    reason: str | None = None


class LoginApiRequest(BaseModel):
    username: str
    password: str | None = None
    role: str | None = None


class UserCreateRequest(BaseModel):
    username: str
    name: str
    email: str
    role: str = "creator"
    status: str = "active"
    password: str | None = None
    reason: str | None = None


class UserUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None
    status: str | None = None
    password: str | None = None
    reason: str | None = None


@router.post("/auth/register")
async def register_user_endpoint(body: RegisterApiRequest, background_tasks: BackgroundTasks) -> dict:
    existing = db.get_user(body.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username đã tồn tại trên hệ thống")

    status = "pending_approval" if body.role == "reviewer" else "active"
    user = db.create_user(
        username=body.username,
        name=body.name,
        email=body.email,
        role=body.role,
        status=status,
        reason=body.reason,
        password=body.password,
    )

    if body.role == "reviewer" and body.email:
        background_tasks.add_task(
            send_registration_received_email,
            to_email=body.email,
            recipient_name=body.name,
            username=body.username,
        )

    msg = (
        "Đăng ký tài khoản Reviewer thành công! Yêu cầu của bạn đang chờ Admin phê duyệt và cấp mật khẩu qua Email."
        if body.role == "reviewer"
        else "Đăng ký tài khoản thành công!"
    )
    return {"ok": True, "user": user, "status": status, "message_vi": msg}


@router.post("/auth/login")
async def login_user_endpoint(body: LoginApiRequest) -> dict:
    u_full = db.get_user_with_hash(body.username)
    if not u_full:
        # Tự động tạo nếu là login mock đầu tiên
        user = db.create_user(
            username=body.username,
            name=body.username.capitalize(),
            email=f"{body.username}@forge.ai",
            role=body.role or "creator",
            status="active",
            password=body.password or "123456",
        )
        return {
            "access_token": f"token_{uuid.uuid4().hex[:12]}",
            "token_type": "bearer",
            "user": user,
        }

    if u_full.get("status") == "pending_approval":
        raise HTTPException(
            status_code=403,
            detail="Tài khoản đang ở trạng thái 'Chờ duyệt'. Vui lòng đợi Admin phê duyệt và nhận mật khẩu qua email.",
        )

    if u_full.get("status") in ("inactive", "rejected"):
        raise HTTPException(
            status_code=403,
            detail="Tài khoản đã bị từ chối hoặc vô hiệu hóa. Vui lòng liên hệ Admin.",
        )

    stored_hash = u_full.get("password_hash")
    if stored_hash and body.password:
        if not db.verify_password(body.password, stored_hash):
            raise HTTPException(status_code=401, detail="Mật khẩu không chính xác")

    user_clean = db.get_user(body.username)
    return {
        "access_token": f"token_{uuid.uuid4().hex[:12]}",
        "token_type": "bearer",
        "user": user_clean,
    }


class ProfileUpdateRequest(BaseModel):
    username: str
    full_name: str | None = None
    avatar_url: str | None = None


class ChangePasswordApiRequest(BaseModel):
    username: str
    old_password: str
    new_password: str


@router.get("/auth/me")
async def get_me_endpoint(user: str = Query(..., min_length=1)) -> dict:
    """Khôi phục đúng user đã đăng nhập; tuyệt đối không mặc định thành Admin."""
    u = db.get_user(user)
    if not u:
        raise HTTPException(status_code=404, detail="Tài khoản đăng nhập không còn tồn tại")
    return u


@router.get("/users/profile")
async def get_user_profile_endpoint(username: str | None = Query(None), user: str | None = Query(None)) -> dict:
    target_username = username or user
    if not target_username:
        raise HTTPException(status_code=401, detail="Chưa xác thực người dùng. Vui lòng cung cấp username")
    u = db.get_user(target_username)
    if not u:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông tin người dùng")
    return u


@router.put("/users/profile")
async def update_user_profile_endpoint(body: ProfileUpdateRequest) -> dict:
    if not body.username:
        raise HTTPException(status_code=400, detail="Username là bắt buộc")
    updated = db.update_user_profile(
        username=body.username,
        full_name=body.full_name,
        avatar_url=body.avatar_url,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    return {"ok": True, "user": updated}


@router.post("/users/change-password")
async def change_password_endpoint(body: ChangePasswordApiRequest) -> dict:
    if not body.username or not body.old_password or not body.new_password:
        raise HTTPException(status_code=400, detail="Vui lòng điền đầy đủ các thông tin bắt buộc")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự")
    if len(body.new_password) > 128 or len(body.old_password) > 128:
        raise HTTPException(status_code=400, detail="Mật khẩu không được vượt quá 128 ký tự")

    success, msg = db.change_user_password(
        username=body.username,
        old_password=body.old_password,
        new_password=body.new_password,
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"ok": True, "message_vi": msg}


# ===========================================================================
# Admin Subsystem Endpoints (/admin)
# ===========================================================================


@router.get("/admin/stats")
async def get_admin_stats_endpoint() -> dict:
    return db.get_admin_stats()


@router.get("/admin/pending-reviewers")
async def list_pending_reviewers_endpoint() -> list[dict]:
    return db.get_pending_reviewers()


@router.get("/admin/users")
async def list_admin_users_endpoint(role: str | None = Query(None), status: str | None = Query(None)) -> list[dict]:
    return db.list_users(role=role, status=status)


@router.post("/admin/users")
async def create_admin_user_endpoint(body: UserCreateRequest) -> dict:
    existing = db.get_user(body.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username đã tồn tại")
    user = db.create_user(
        username=body.username,
        name=body.name,
        email=body.email,
        role=body.role,
        status=body.status,
        reason=body.reason,
        password=body.password,
    )
    return {"ok": True, "user": user}


@router.put("/admin/users/{username}")
async def update_admin_user_endpoint(username: str, body: UserUpdateRequest) -> dict:
    updated = db.update_user(
        username=username,
        name=body.name,
        email=body.email,
        role=body.role,
        status=body.status,
        reason=body.reason,
        password=body.password,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    return {"ok": True, "user": updated}


@router.delete("/admin/users/{username}")
async def delete_admin_user_endpoint(username: str) -> dict:
    success = db.delete_user(username)
    if not success:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    return {"ok": True, "username": username}


@router.post("/admin/users/{username}/approve")
async def approve_reviewer_endpoint(username: str, background_tasks: BackgroundTasks) -> dict:
    user = db.approve_reviewer_request(username)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu Reviewer")

    if user.get("email") and user.get("temp_password"):
        background_tasks.add_task(
            send_reviewer_approval_email,
            to_email=user["email"],
            recipient_name=user.get("name") or user.get("username", username),
            username=user.get("username", username),
            temp_password=user["temp_password"],
        )

    return {"ok": True, "user": user}


@router.post("/admin/users/{username}/reject")
async def reject_reviewer_endpoint(username: str) -> dict:
    user = db.reject_reviewer_request(username)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu Reviewer")
    return {"ok": True, "user": user}
