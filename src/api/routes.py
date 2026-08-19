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

from fastapi import APIRouter, HTTPException, Query, Response

from src.agents.graph import build_forge_graph
from src.models.schemas import (
    TOO_VAGUE_MESSAGE,
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
    can_request_simulation,
    is_too_vague_to_generate,
    next_status_after_review,
    verification_from_execution,
)
from src.services import db
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
    "persist_pending_review",
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

    Node ``persist_pending_review`` tự chốt hàng request thành ``done``, nên ở
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
                if node == "persist_pending_review":
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

    request_id = str(uuid.uuid4())

    # Ghi hàng request TRƯỚC khi chạy workflow: client nhận request_id rồi poll
    # ngay, nên hàng đó phải tồn tại trước. Node persist_pending_review sẽ chốt
    # nó thành done ở cuối luồng.
    db.create_generation_request(request_id, body.prompt, body.validation_mode, body.limit, created_by=body.created_by)

    asyncio.create_task(_run_workflow(request_id))

    return GenerateResponse(request_id=request_id)


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

    db.update_scenario_status(target_id, next_status.value)
    scenario["status"] = next_status.value

    db.save_review_decision(target_id, body.gate, body.approved, body.reviewer, body.reason)

    if body.approved and gate is ReviewGate.BEFORE_SIM and scenario.get("xosc_content"):
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        db.create_scenario_job(job_id, target_id, scenario["xosc_content"])

    # Static chỉ chứng minh file parse được, không chứng minh kịch bản có ý
    # nghĩa hay tái hiện đúng nguy hiểm mô tả. Qua được BEFORE_LIBRARY luôn mở
    # sẵn BEFORE_SIM — không còn tuỳ theo `validation_mode` người tạo chọn lúc
    # generate, vì "chỉ cần static" không phải một điểm dừng hợp lệ của sản phẩm.
    #
    # Vẫn KHÔNG tự chạy CARLA: cổng BEFORE_SIM còn nguyên, người vẫn phải gật
    # trước khi tốn GPU. Cái tự động ở đây chỉ là bước chuyển trạng thái, không
    # phải quyết định tiêu tài nguyên.
    auto_opened = False
    if body.approved and gate is ReviewGate.BEFORE_LIBRARY and _has_xosc(scenario):
        db.update_scenario_status(target_id, ScenarioStatus.PENDING_SIM_REVIEW.value)
        auto_opened = True
        logger.info("%s qua BEFORE_LIBRARY — mở sẵn cổng BEFORE_SIM", target_id)

    return {"ok": True, "sim_gate_opened": auto_opened}


# ===========================================================================
# POST /scenarios/{scenario_id}/request-sim — mở cổng duyệt thứ hai
# ===========================================================================


@router.post("/scenarios/{scenario_id}/request-sim")
async def request_simulation(scenario_id: str) -> dict:
    """``approved_library`` -> ``pending_sim_review``.

    Đây **không** phải lệnh chạy CARLA. Nó chỉ mở cổng duyệt thứ hai.

    Lý do cổng nằm ở đây, trước khi chạy chứ không sau: GPU là tài nguyên vật lý
    có hạn, và đề bài đòi *"kỹ sư phải phê duyệt trước khi đưa vào bộ kiểm thử"*.
    Để hệ thống tự đẩy job vào CARLA là để nó tự tiêu tài nguyên mà không ai gật.

    Số phận của kịch bản đã chốt ở cổng 1 rồi — cả duyệt lẫn từ chối ở cổng 2
    đều trả nó về ``approved_library`` (ADR-011 §3.3). Cổng 2 chỉ quyết định có
    tốn GPU cho nó hay không.
    """
    scenario = _scenario_or_404(scenario_id)

    current = ScenarioStatus(scenario["status"])
    if not can_request_simulation(current):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Chỉ kịch bản đã qua BEFORE_LIBRARY mới xin chạy mô phỏng được; kịch bản này đang ở '{current.value}'"
            ),
        )

    if not _has_xosc(scenario):
        # Không có file thì không có gì để chạy. Chặn ở đây thay vì để worker
        # nhận một job rỗng rồi chết bằng lỗi XML chẳng nói gì về nguyên nhân.
        raise HTTPException(status_code=409, detail=UNCOMPILED_SCENARIO_DETAIL)

    db.update_scenario_status(scenario_id, ScenarioStatus.PENDING_SIM_REVIEW.value)
    return {"ok": True, "status": ScenarioStatus.PENDING_SIM_REVIEW.value}


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


@router.get("/scenarios", response_model=ScenarioListResponse)
@router.get("/library/search", response_model=ScenarioListResponse)
async def list_scenarios(
    search: str = Query("", description="Tìm kiếm theo title hoặc description"),
    road_type: str | None = Query(None),
    weather: str | None = Query(None),
    actor_type: str | None = Query(None),
    maneuver: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> ScenarioListResponse:
    """Danh sách scenarios với lọc ODD và phân trang (sử dụng SQLiteRetriever)."""
    if search or road_type or weather or actor_type or maneuver:
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
    """Tải file .xosc XML của scenario (chặn HTTP 403 khi chưa được duyệt BEFORE_LIBRARY)."""
    scenario = _scenario_or_404(scenario_id)

    # `pending_sim_review` vẫn đã qua BEFORE_LIBRARY — cổng 2 tự mở ngay sau đó
    # (xem POST /review) nên kịch bản nằm ở đây suốt lúc chờ quyết định sim, và
    # vẫn phải tải được: FR-11 chỉ đòi "đã qua BEFORE_LIBRARY", không đòi thêm
    # điều kiện đã xong luôn BEFORE_SIM.
    current_status = scenario.get("status")
    if current_status not in (ScenarioStatus.APPROVED_LIBRARY.value, ScenarioStatus.PENDING_SIM_REVIEW.value):
        raise HTTPException(
            status_code=403,
            detail="Chỉ kịch bản đã qua duyệt BEFORE_LIBRARY mới được phép tải file .xosc",
        )

    if not _has_xosc(scenario):
        # Thà 409 còn hơn phát ra một file trông như thật mà rỗng ruột. Ca này
        # xảy ra với kịch bản nằm ngoài phạm vi converter (ADR-016): chúng vẫn
        # hữu ích cho retrieval nhưng chưa biên dịch được thành .xosc.
        raise HTTPException(status_code=409, detail=UNCOMPILED_SCENARIO_DETAIL)
    return Response(content=scenario["xosc_content"], media_type="application/xml")


# ===========================================================================
# Internal — GPU Worker endpoints
# ===========================================================================


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

    **Không** đổi ``status``: kịch bản không bị rút khỏi thư viện vì chạy ra
    không đúng ý. Số phận nó do người quyết ở cổng 1; đây chỉ là bằng chứng.
    """
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' không tồn tại")

    new_status = JobStatus.DONE.value if body.success else JobStatus.FAILED.value
    db.update_job_result(job_id, new_status, body.model_dump())

    level = verification_from_execution(body.success, body.criteria_results)
    db.set_verification(body.scenario_id, level)
    logger.info("Kịch bản %s -> mức kiểm chứng %s", body.scenario_id, level.value)

    return {"ok": True, "verification": level.value}
