"""REST API endpoints cho Scenario Forge.

**Ranh giới kiến trúc (test_architecture.py canh):**

- KHÔNG import ``sqlite3``, ``sqlalchemy``, ``numpy`` — DB logic nằm ở
  ``src/services/``. Router chỉ là lớp HTTP.
- KHÔNG import ``carla`` — ADR-001.

**MVP persistence:** dùng in-memory ``dict`` stores. Khi PR SQLAlchemy service
layer sẵn sàng, thay dict bằng service calls mà không đổi signature endpoint.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query

from src.models.schemas import (
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
    next_status_after_review,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# In-memory stores (MVP — thay bằng service layer khi có SQLAlchemy)
# ---------------------------------------------------------------------------

_generation_requests: dict[str, dict] = {}
"""request_id → { description_vi, validation_mode, step, progress, scenario_id, error, created_at }"""

_scenarios: dict[str, dict] = {}
"""scenario_id → full scenario dict (spec, xosc_content, status, review_logs, ...)"""

_jobs: dict[str, dict] = {}
"""job_id → { job_id, scenario_id, status, xosc_content, result, created_at }"""


# ---------------------------------------------------------------------------
# Step progress mapping
# ---------------------------------------------------------------------------

_STEP_ORDER = [
    "queued",
    "parse_intent",
    "retrieve",
    "generate_draft",
    "validate",
    "repair_draft",
    "convert_xosc",
    "persist",
]


def _step_progress(step: str) -> int:
    """Tính % tiến trình theo index của step."""
    if step == "done":
        return 100
    if step == "failed":
        # Giữ nguyên progress tại thời điểm fail
        return 0
    try:
        idx = _STEP_ORDER.index(step)
        return int((idx / len(_STEP_ORDER)) * 100)
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Mock workflow — chạy qua các bước rồi sinh scenario giả
# ---------------------------------------------------------------------------

def _extract_odd_fallback_from_prompt(prompt: str) -> dict:
    prompt_lower = prompt.lower()

    road_type = "unknown"
    if any(k in prompt_lower for k in ["ngã tư", "giao lộ", "ngã ba", "nga tu", "nga ba", "giao lo", "nga 4", "nga 3", "ngã 4", "ngã 3"]):
        road_type = "intersection"
    elif any(k in prompt_lower for k in ["cao tốc", "quốc lộ", "cao toc", "quoc lo"]):
        road_type = "highway"
    elif any(k in prompt_lower for k in ["vòng xoay", "bùng binh", "vong xoay", "bung binh"]):
        road_type = "roundabout"
    elif any(k in prompt_lower for k in ["ngõ", "hẹp", "ngo", "hep"]):
        road_type = "residential_narrow"
    elif any(k in prompt_lower for k in ["đường đô thị", "đường thẳng", "duong do thi", "duong thanh"]):
        road_type = "urban_straight"

    weather = "unknown"
    if any(k in prompt_lower for k in ["mưa lớn", "mưa to", "giông", "mua lon", "mua to", "giong"]):
        weather = "heavy_rain"
    elif any(k in prompt_lower for k in ["mưa", "mua", "troi mua"]):
        weather = "heavy_rain"
    elif any(k in prompt_lower for k in ["sương mù", "suong mu"]):
        weather = "fog"
    elif any(k in prompt_lower for k in ["trời quang", "nắng", "troi quang", "nang", "troi nang"]):
        weather = "clear"

    actor_type = "unknown"
    # Subject parsing: find first mentioned vehicle performing the maneuver
    pos_car = min([p for p in [prompt_lower.find("o to"), prompt_lower.find("oto"), prompt_lower.find("ô tô"), prompt_lower.find("xe con"), prompt_lower.find("sedan")] if p != -1], default=-1)
    pos_bike = min([p for p in [prompt_lower.find("xe may"), prompt_lower.find("xe máy"), prompt_lower.find("xemay"), prompt_lower.find("xe ga"), prompt_lower.find("xega"), prompt_lower.find("xe so"), prompt_lower.find("xeso")] if p != -1], default=-1)
    pos_truck = min([p for p in [prompt_lower.find("xe tải"), prompt_lower.find("xe tai"), prompt_lower.find("container"), prompt_lower.find("xe dau keo"), prompt_lower.find("xe ben"), prompt_lower.find("cont"), prompt_lower.find("xe cont")] if p != -1], default=-1)
    pos_bus = min([p for p in [prompt_lower.find("xe bus"), prompt_lower.find("xe buýt"), prompt_lower.find("xe buyet"), prompt_lower.find("xe 16 cho"), prompt_lower.find("16 cho"), prompt_lower.find("xe transit"), prompt_lower.find("xe khach")] if p != -1], default=-1)
    pos_ped = min([p for p in [prompt_lower.find("người đi bộ"), prompt_lower.find("nguoi di bo")] if p != -1], default=-1)

    positions = []
    if pos_car != -1:
        positions.append((pos_car, "car"))
    if pos_bike != -1:
        positions.append((pos_bike, "motorcycle"))
    if pos_truck != -1:
        positions.append((pos_truck, "truck"))
    if pos_bus != -1:
        positions.append((pos_bus, "car"))
    if pos_ped != -1:
        positions.append((pos_ped, "pedestrian"))

    if positions:
        positions.sort(key=lambda x: x[0])
        actor_type = positions[0][1]

    maneuver = "unknown"
    if any(k in prompt_lower for k in ["tạt đầu", "tat dau", "cướp làn", "cuop lan", "chặn đầu", "chan dau", "cúp đầu", "cup dau", "chèn ép", "chen ep", "chèn ngang", "chen ngang", "ép xe", "ep xe"]):
        maneuver = "cut_in"
    elif any(k in prompt_lower for k in ["vượt ẩu", "vuot au", "vượt phải", "vuot phai", "vượt trái", "vuot trai", "vượt xe", "vuot xe"]):
        maneuver = "overtake"
    elif any(k in prompt_lower for k in ["phanh gấp", "phanh gap", "thắng gấp", "thang gap", "dậm phanh", "dam phanh", "đập phanh", "dap phanh", "khựng lại", "khung lai"]):
        maneuver = "sudden_brake"
    elif any(k in prompt_lower for k in ["lấn làn", "lan lan", "đè vạch", "de vach", "mất lái", "mat lai"]):
        maneuver = "lane_drift"
    elif any(k in prompt_lower for k in ["vượt đèn đỏ", "vuot den do"]):
        maneuver = "run_red_light"
    elif any(k in prompt_lower for k in ["băng qua", "bang qua"]):
        maneuver = "jaywalk"
    elif any(k in prompt_lower for k in ["ngược chiều", "nguoc chieu"]):
        maneuver = "wrong_way"

    return {
        "road_type": road_type,
        "weather": weather,
        "actor_type": actor_type,
        "maneuver": maneuver,
    }


async def _run_mock_workflow(request_id: str) -> None:
    """Background task giả lập workflow 7 nodes.

    Thay bằng LangGraph workflow thật khi graph sẵn sàng.
    """
    req = _generation_requests.get(request_id)
    if not req:
        return

    for step in _STEP_ORDER:
        req["step"] = step
        req["progress"] = _step_progress(step)
        await asyncio.sleep(0.3)  # Giả lập latency

    # 1. Trích xuất ODD fallback từ từ khóa prompt
    odd_dict = _extract_odd_fallback_from_prompt(req["description_vi"])

    # 2. Thử gọi Node 1 (parse_intent) để lấy ODD từ LLM nếu kết nối thành công
    try:
        from src.agents.nodes.parse_intent import parse_intent_node
        res = parse_intent_node({"user_query": req["description_vi"]})
        odd_obj = res.get("odd_query") or res.get("odd_hints")
        if odd_obj:
            rt = getattr(odd_obj, "road_type", None)
            wt = getattr(odd_obj, "weather", None)
            at = getattr(odd_obj, "actor_type", None)
            mv = getattr(odd_obj, "maneuver", None)
            odd_dict = {
                "road_type": rt.value if hasattr(rt, "value") else (str(rt) if rt else odd_dict["road_type"]),
                "weather": wt.value if hasattr(wt, "value") else (str(wt) if wt else odd_dict["weather"]),
                "actor_type": at.value if hasattr(at, "value") else (str(at) if at else odd_dict["actor_type"]),
                "maneuver": mv.value if hasattr(mv, "value") else (str(mv) if mv else odd_dict["maneuver"]),
            }
    except Exception:
        pass

    # Sinh scenario_id
    counter = len(_scenarios) + 1
    scenario_id = f"sc_{counter:03d}"

    # Tạo scenario bằng ODD phân tích từ Node 1
    _scenarios[scenario_id] = {
        "scenario_id": scenario_id,
        "title": f"Kịch bản từ: {req['description_vi'][:60]}",
        "description_vi": req["description_vi"],
        "status": ScenarioStatus.PENDING_REVIEW.value,
        "odd": odd_dict,
        "time_of_day": "day",
        "spec": {
            "scenario_id": scenario_id,
            "description_vi": req["description_vi"],
            "title": f"Kịch bản từ: {req['description_vi'][:60]}",
            "odd": odd_dict,
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
                    "name": "adversary_1",
                    "category": odd_dict["actor_type"],
                    "position": {"lane_offset": 1, "s_offset_m": 30.0},
                    "initial_speed_kmh": 50.0,
                    "is_ego": False,
                },
            ],
            "maneuvers": [
                {
                    "actor_name": "adversary_1",
                    "maneuver": odd_dict["maneuver"],
                    "trigger": {"type": "distance_to_ego", "value": 15.0},
                    "target_speed_kmh": 40.0,
                },
            ],
            "duration_s": 30.0,
        },
        "xosc_content": f'<?xml version="1.0"?>\n<OpenSCENARIO><!-- {scenario_id} stub --></OpenSCENARIO>',
        "review_logs": [],
        "created_at": datetime.now(UTC).isoformat(),
        "validation_mode": req["validation_mode"],
    }

    # Cập nhật generation request
    req["step"] = "done"
    req["progress"] = 100
    req["scenario_id"] = scenario_id


# ===========================================================================
# POST /generate
# ===========================================================================


@router.post("/generate", response_model=GenerateResponse)
async def generate(body: GenerateRequest) -> GenerateResponse:
    prompt_text = body.prompt.strip()
    words = prompt_text.split()
    if len(prompt_text) < 10 or len(words) < 3 or prompt_text.isnumeric():
        raise HTTPException(
            status_code=400,
            detail="Mô tả kịch bản quá ngắn hoặc không đủ thông tin kịch bản giao thông.",
        )

    try:
        from src.agents.nodes.parse_intent import parse_intent_node
        res = parse_intent_node({"user_query": prompt_text})
        if isinstance(res, dict) and "issues" in res and res["issues"]:
            for issue in res["issues"]:
                msg = getattr(issue, "message_vi", str(issue))
                raise HTTPException(
                    status_code=400,
                    detail=msg,
                )
    except ValueError as err:
        raise HTTPException(
            status_code=400,
            detail=str(err),
        )
    except HTTPException as http_err:
        raise http_err
    except Exception:
        # Nếu LLM provider bị lỗi kết nối ở bước pre-check, tiếp tục đẩy vào pipeline
        pass

    request_id = str(uuid.uuid4())

    _generation_requests[request_id] = {
        "request_id": request_id,
        "description_vi": body.prompt,
        "validation_mode": body.validation_mode,
        "step": "queued",
        "progress": 0,
        "scenario_id": None,
        "error": None,
        "created_at": datetime.now(UTC).isoformat(),
    }

    # Kick off background task (mock workflow)
    asyncio.create_task(_run_mock_workflow(request_id))

    return GenerateResponse(request_id=request_id)


# ===========================================================================
# GET /status/{request_id}
# ===========================================================================


@router.get("/status/{request_id}", response_model=StatusResponse)
async def get_status(request_id: str) -> StatusResponse:
    """Polling trạng thái generation.

    Frontend gọi mỗi 3 giây, timeout sau 2 phút (logic ở client).
    """
    req = _generation_requests.get(request_id)
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
# POST /review
# ===========================================================================


@router.post("/review")
async def post_review(body: ReviewApiRequest) -> dict:
    """Gửi quyết định HITL tại một cổng duyệt.

    Validation:
    - FR-10: reviewer không được rỗng (Pydantic ``min_length=1``).
    - FR-10: reject bắt buộc có reason ≥ 10 ký tự.
    - ADR-011 §3.3: gọi ``next_status_after_review()`` — ``None`` = transition
      không hợp lệ → 409 Conflict.
    """
    # Tìm scenario
    scenario = _scenarios.get(body.scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{body.scenario_id}' không tồn tại")

    # Validate reason khi reject
    if not body.approved and len(body.reason.strip()) < 10:
        raise HTTPException(
            status_code=422,
            detail="Lý do từ chối phải có ít nhất 10 ký tự — người sau cần biết vì sao",
        )

    # Chuyển gate string → ReviewGate enum
    gate = ReviewGate(body.gate)
    current_status = ScenarioStatus(scenario["status"])

    # Kiểm tra transition hợp lệ
    next_status = next_status_after_review(current_status, gate, body.approved)
    if next_status is None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Không thể áp dụng quyết định '{gate.value}' (approved={body.approved}) "
                f"cho scenario đang ở trạng thái '{current_status.value}'"
            ),
        )

    # Cập nhật status
    scenario["status"] = next_status.value

    # Lưu review decision
    decision = {
        "scenario_id": body.scenario_id,
        "gate": body.gate,
        "approved": body.approved,
        "reviewer": body.reviewer,
        "reason": body.reason,
        "decided_at": datetime.now(UTC).isoformat(),
    }
    scenario.setdefault("review_logs", []).append(decision)

    # Nếu approve BEFORE_SIM → tạo ScenarioJob
    if body.approved and gate is ReviewGate.BEFORE_SIM and scenario.get("xosc_content"):
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        _jobs[job_id] = {
            "job_id": job_id,
            "scenario_id": body.scenario_id,
            "status": JobStatus.PENDING.value,
            "xosc_content": scenario["xosc_content"],
            "result": None,
            "created_at": datetime.now(UTC).isoformat(),
        }

    return {"ok": True}


# ===========================================================================
# GET /scenarios
# ===========================================================================


@router.get("/scenarios", response_model=ScenarioListResponse)
async def list_scenarios(
    search: str = Query("", description="Tìm kiếm theo title hoặc description"),
    road_type: str | None = Query(None),
    weather: str | None = Query(None),
    actor_type: str | None = Query(None),
    maneuver: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> ScenarioListResponse:
    """Danh sách scenarios với lọc ODD và phân trang.

    FR-11: chỉ scenario approve tại BEFORE_LIBRARY mới được tìm lại.
    Tuy nhiên MVP trả tất cả để frontend test được.
    """
    items = list(_scenarios.values())

    # Lọc theo search text
    if search:
        search_lower = search.lower()
        items = [
            s for s in items
            if search_lower in s.get("title", "").lower()
            or search_lower in s.get("description_vi", "").lower()
        ]

    # Lọc theo ODD axes
    if road_type:
        items = [s for s in items if s.get("odd", {}).get("road_type") == road_type]
    if weather:
        items = [s for s in items if s.get("odd", {}).get("weather") == weather]
    if actor_type:
        items = [s for s in items if s.get("odd", {}).get("actor_type") == actor_type]
    if maneuver:
        items = [s for s in items if s.get("odd", {}).get("maneuver") == maneuver]

    total = len(items)

    # Phân trang
    offset = (page - 1) * limit
    paged = items[offset : offset + limit]

    return ScenarioListResponse(items=paged, total=total)


# ===========================================================================
# GET /scenarios/{scenario_id}
# ===========================================================================


@router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str) -> dict:
    """Chi tiết một scenario bao gồm spec, xosc_content và review_logs.

    Frontend dùng response này cho Scenario Detail Page.
    """
    scenario = _scenarios.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' không tồn tại")

    return scenario


# ===========================================================================
# Internal — GPU Worker endpoints
# ===========================================================================


@router.get("/internal/jobs")
async def list_pending_jobs() -> dict:
    """Worker poll: trả pending jobs để worker nhận chạy.

    Worker gọi endpoint này định kỳ. Mỗi job chứa ``xosc_content`` (chuỗi XML)
    — worker không cần biết ``ScenarioSpec`` là gì (ADR-001, ARCHITECTURE.md).
    """
    pending = [
        j for j in _jobs.values()
        if j["status"] == JobStatus.PENDING.value
    ]
    return {"jobs": pending}


@router.post("/internal/jobs/{job_id}/result")
async def submit_job_result(job_id: str, body: ExecutionResult) -> dict:
    """Worker submit kết quả sau khi chạy ScenarioRunner.

    Cập nhật ``job.status`` và lưu ``ExecutionResult``. Scenario status
    không tự đổi — review decision mới đổi status (ADR-011 §3.3).
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' không tồn tại")

    job["status"] = JobStatus.DONE.value if body.success else JobStatus.FAILED.value
    job["result"] = body.model_dump()

    return {"ok": True}
