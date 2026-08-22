"""REST API endpoints cho Scenario Forge.

**Ranh giới kiến trúc (test_architecture.py canh):**

- KHÔNG import ``sqlite3``, ``sqlalchemy``, ``numpy`` — DB logic nằm ở
  ``src/services/``. Router chỉ là lớp HTTP.
- KHÔNG import ``carla`` — ADR-001.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, Body, HTTPException, Query, Response
from pydantic import BaseModel, Field

from src.agents.graph import build_forge_graph
from src.models.schemas import (
    TOO_VAGUE_MESSAGE,
    DuplicateMatch,
    # Domain models
    ExecutionResult,
    # API models
    GenerateRequest,
    GenerateResponse,
    JobStatus,
    ReviewApiRequest,
    ReviewGate,
    ScenarioListResponse,
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
from src.services import db, metrics
from src.services.library.retriever import SQLiteRetriever

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
    try:
        async for event in build_forge_graph().astream(state):
            for node, update in event.items():
                final.update(update or {})
                # `astream` yield SAU khi node xong, nên đây là "vừa xong node X".
                # Không ghi đè lên trạng thái kết thúc: node persist tự chốt hàng
                # request thành done/100 ngay trong transaction của nó, và vòng
                # lặp này chạy sau đó — ghi đè là kéo ngược 100% về 88%, client
                # poll mãi không bao giờ thấy "done" dù kịch bản đã nằm trong DB.
                if node == "persist_pending_sim_review":
                    continue
                db.update_generation_request(request_id, step=node, progress=_step_progress(node))
    except Exception as exc:
        logger.exception("Workflow hỏng ở request %s", request_id)
        _mark_failed(request_id, str(exc) or type(exc).__name__)
        return

    if final.get("scenario_id"):
        # Chốt lại cho chắc. Persist đã đặt done/100, nhưng luồng này là thứ
        # client chờ nên nó phải tự chịu trách nhiệm về trạng thái cuối, không
        # trông vào việc node ở tầng dưới nhớ làm hộ.
        db.update_generation_request(
            request_id, status="done", step="done", progress=100, scenario_id=final["scenario_id"]
        )
        return

    # Tới đây là graph dừng sớm: thiếu thông tin, tổ hợp ngoài phạm vi, LLM
    # hỏng, hoặc hết ba vòng sửa. FR-14: **không** tạo scenario giả cho một lần
    # sinh thất bại — chỉ ghi lại dấu vết trên chính hàng request.
    issues = final.get("issues") or []
    reason = final.get("failed_reason") or (issues[0].message_vi if issues else "Không sinh được kịch bản")
    _mark_failed(request_id, reason)


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


@router.post("/review")
@router.post("/scenarios/{scenario_id}/review")
async def post_review(body: ReviewApiRequest, scenario_id: str | None = None) -> dict:
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

    db.update_scenario_status(target_id, next_status.value)
    scenario["status"] = next_status.value

    db.save_review_decision(target_id, body.gate, body.approved, body.reviewer, body.reason)

    job_created = False
    if body.approved and gate is ReviewGate.BEFORE_SIM:
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        db.create_scenario_job(job_id, target_id, scenario["xosc_content"])
        job_created = True

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
    items = db.list_public_scenarios()
    return ScenarioListResponse(items=items, total=len(items))


@router.get("/scenarios/me", response_model=ScenarioListResponse)
async def list_my_scenarios_endpoint(
    user: str = Query("creator", description="Username hiện tại"),
) -> ScenarioListResponse:
    items = db.list_my_scenarios(user)
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
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> ScenarioListResponse:
    """Danh sách scenarios với lọc ODD, phân quyền scope và phân trang."""
    if scope == "public":
        items = db.list_public_scenarios()
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

    total = len(items)
    offset = (page - 1) * limit
    paged = items[offset : offset + limit]

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


@router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str) -> dict:
    """Chi tiết một scenario bao gồm spec, xosc_content và review_logs."""
    return _scenario_or_404(scenario_id)


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


@router.get("/metrics/quality")
async def quality_report() -> dict:
    """Báo cáo M1/M2/M3 — mục "Báo cáo tỷ lệ kịch bản hợp lệ" của đề bài.

    Tính từ dữ liệu thật trong kho mỗi lần gọi, không có bảng tổng hợp riêng:
    số liệu báo cáo mà lệch với số liệu hệ thống là lỗi tệ nhất trong một báo cáo.
    """
    requests, scenarios, executions = db.metrics_rows()
    return metrics.build_report(requests, scenarios, executions)


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

    scenario = _scenario_or_404(body.scenario_id)
    next_status = next_status_after_execution(ScenarioStatus(scenario["status"]))
    if next_status is None:
        raise HTTPException(
            status_code=409,
            detail=f"Kịch bản đang ở '{scenario['status']}', không chờ kết quả mô phỏng",
        )

    new_status = JobStatus.DONE.value if body.success else JobStatus.FAILED.value
    db.update_job_result(job_id, new_status, body.model_dump())

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
async def register_user_endpoint(body: RegisterApiRequest) -> dict:
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


@router.get("/auth/me")
async def get_me_endpoint(user: str = Query("admin")) -> dict:
    u = db.get_user(user)
    if not u:
        u = db.get_user("admin")
    return u or {
        "id": "usr_admin",
        "username": "admin",
        "name": "Hệ Thống Admin",
        "email": "admin@forge.ai",
        "role": "admin",
        "status": "active",
    }


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
async def approve_reviewer_endpoint(username: str) -> dict:
    user = db.approve_reviewer_request(username)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu Reviewer")
    return {"ok": True, "user": user}


@router.post("/admin/users/{username}/reject")
async def reject_reviewer_endpoint(username: str) -> dict:
    user = db.reject_reviewer_request(username)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu Reviewer")
    return {"ok": True, "user": user}
