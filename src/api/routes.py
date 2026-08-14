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
# Mock workflow helpers & workflow
# ---------------------------------------------------------------------------


def _is_slow_speed(man_category: str, specific_action: str | None, desc: str) -> bool:
    desc_lower = desc.lower()
    act_lower = (specific_action or "").lower()
    slow_terms = ["lùi", "lui", "chậm", "cham", "dừng", "dung", "đỗ", "do", "hỏng", "hong", "bê tông", "be tong", "xe nâng", "xe nang"]
    if man_category in ("stop_in_lane", "sudden_brake"):
        return True
    return any(t in desc_lower or t in act_lower for t in slow_terms)


def _compute_actor_speed(cat: str, spec_type: str | None, is_slow: bool, is_residential: bool, is_maneuver_target: bool = False) -> float:
    """Tính toán tốc độ ban đầu và tốc độ mục tiêu thích hợp theo loại xe và bối cảnh đường."""
    st = str(spec_type or "").lower()
    is_forklift = any(w in st for w in ("xe nâng", "xe_nang", "xenang", "forklift", "xe lu", "xe ui"))
    if is_maneuver_target:
        if is_forklift or is_slow:
            return 5.0
        if is_residential:
            return 10.0
        return 40.0

    if is_forklift or is_slow:
        return 10.0
    if is_residential:
        return 15.0
    return 50.0


def _normalize_cat(raw_cat: str) -> str:
    """Chuẩn hóa category về enum chuẩn OpenSCENARIO."""
    cat = raw_cat.strip().lower()
    if cat in ("xe_bus", "xe_khach"):
        return "bus"
    return cat if cat not in ("", "none", "null", "n/a") else "car"


async def _run_mock_workflow(request_id: str) -> None:
    """Background task giả lập workflow 7 nodes."""
    req = _generation_requests.get(request_id)
    if not req:
        return

    for step in _STEP_ORDER:
        req["step"] = step
        req["progress"] = _step_progress(step)
        await asyncio.sleep(0.05)  # Giả lập latency

    # 1. Thử gọi Node 1 (parse_intent) để lấy ODD theo Hybrid Pipeline (Rule-based + LLM Fallback)
    odd_dict = {
        "road_type": "unknown",
        "weather": "unknown",
        "actor_type": "unknown",
        "maneuver": "unknown",
    }
    at_data = "unknown"
    mv_data = "unknown"
    parsed_actors_raw: list = []  # Danh sách tác nhân từ multi-actor parsing
    odd_obj = None
    try:
        from src.agents.nodes.parse_intent import parse_intent_node

        res = parse_intent_node({"user_query": req["description_vi"]})
        raw_odd = res.get("odd_query")
        hints_odd = res.get("odd_hints")
        odd_obj = raw_odd or hints_odd
        if odd_obj:
            rt = getattr(raw_odd, "road_type", None) if raw_odd else getattr(odd_obj, "road_type", None)
            wt = getattr(raw_odd, "weather", None) if raw_odd else getattr(odd_obj, "weather", None)
            at = getattr(odd_obj, "actor_type", None)
            mv = getattr(odd_obj, "maneuver", None)

            rt_str = rt.value if hasattr(rt, "value") else (str(rt) if rt else "unknown")
            wt_str = wt.value if hasattr(wt, "value") else (str(wt) if wt else "unknown")

            if hasattr(at, "model_dump"):
                at_data = at.model_dump()
            elif isinstance(at, dict):
                at_data = at
            else:
                at_cat = at.value if hasattr(at, "value") else str(at if at else "unknown")
                at_spec = getattr(odd_obj, "specific_type", None)
                at_data = {"category": at_cat, "specific_type": at_spec} if (at_spec and at_spec != "unknown") else at_cat

            if hasattr(mv, "model_dump"):
                mv_data = mv.model_dump()
            elif isinstance(mv, dict):
                mv_data = mv
            else:
                mv_cat = mv.value if hasattr(mv, "value") else str(mv if mv else "unknown")
                mv_spec = getattr(odd_obj, "specific_action", None)
                mv_data = {"category": mv_cat, "specific_action": mv_spec} if (mv_spec and mv_spec != "unknown") else mv_cat

            odd_dict = {
                "road_type": rt_str,
                "weather": wt_str,
                "actor_type": at_data,
                "maneuver": mv_data,
            }

            # Trích xuất danh sách multi-actor từ Node 1
            parsed_actors_raw = getattr(odd_obj, "actors", []) or []
    except Exception:
        pass

    # 2. Gọi Node 2 (retrieve_node) để lấy Top-3 kịch bản mẫu động từ Vector DB / Repo Store
    retrieved_examples: list[dict] = []
    try:
        from src.agents.nodes.retrieve import retrieve_node
        res_ret = retrieve_node({
            "user_query": req["description_vi"],
            "odd_query": odd_obj if "odd_obj" in locals() else None,
            "parsed_intent": odd_dict,
        }, k=3)
        retrieved_examples = res_ret.get("retrieved_examples", [])
        if not retrieved_examples:
            matched = []
            for sc_id, sc in list(_scenarios.items()):
                title = sc.get("title", "")
                desc = sc.get("description_vi", "")
                odd = sc.get("odd", {})
                matched.append({
                    "id": sc_id,
                    "title": title,
                    "content": desc or title,
                    "metadata": {
                        "scenario_id": sc_id,
                        "road_type": str(odd.get("road_type", "")),
                        "weather": str(odd.get("weather", "")),
                        "actor_type": str(odd.get("actor_type", "")),
                        "maneuver": str(odd.get("maneuver", "")),
                    },
                    "similarity_score": round(0.95 - (len(matched) * 0.05), 2),
                })
                if len(matched) >= 3:
                    break
            retrieved_examples = matched
    except Exception as exc:
        logger.warning(f"Lỗi khi gọi retrieve_node trong API route: {exc}")

    # Sinh scenario_id
    counter = len(_scenarios) + 1
    scenario_id = f"sc_{counter:03d}"

    man_cat = mv_data["category"] if isinstance(mv_data, dict) else str(mv_data)
    man_spec_act = mv_data.get("specific_action") if isinstance(mv_data, dict) else None
    if man_cat == "lane_departure":
        man_cat = "lane_drift"
    elif man_cat == "unknown":
        man_cat = "cut_in"

    spec_actors: list[dict] = []
    spec_maneuvers: list[dict] = []
    is_slow = _is_slow_speed(man_cat, man_spec_act, req["description_vi"])
    road_type_str = str(odd_dict.get("road_type", "")).lower()
    is_residential = road_type_str in ("residential_narrow", "residential") or "nội bộ" in req["description_vi"].lower() or "ngõ" in req["description_vi"].lower()

    if is_slow:
        default_init_speed = 10.0
    elif is_residential:
        default_init_speed = 20.0
    else:
        default_init_speed = 60.0

    if len(parsed_actors_raw) == 1:
        # KỊCH BẢN 1 TÁC NHÂN (SINGLE ACTOR SCENARIO)
        # Chỉ tạo DUY NHẤT 1 object trong spec.actors (hero/ego)
        actor_info = parsed_actors_raw[0]
        cat = _normalize_cat(getattr(actor_info, "category", "unknown"))
        spec_type = getattr(actor_info, "specific_type", "unknown")
        act_init_speed = _compute_actor_speed(cat, spec_type, is_slow, is_residential, is_maneuver_target=False)

        hero_entry: dict = {
            "name": "hero",
            "category": cat,
            "position": {"lane_offset": 0, "s_offset_m": 0.0},
            "initial_speed_kmh": act_init_speed,
            "is_ego": True,
        }
        if spec_type and spec_type != "unknown":
            hero_entry["specific_type"] = spec_type
        spec_actors = [hero_entry]

        hero_maneuver: dict = {
            "actor_name": "hero",
            "maneuver": man_cat,
            "trigger": {"type": "simulation_time", "value": 1.0},
            "target_speed_kmh": _compute_actor_speed(cat, spec_type, is_slow, is_residential, is_maneuver_target=True),
        }
        if man_spec_act and man_spec_act != "unknown":
            hero_maneuver["specific_action"] = man_spec_act
        spec_maneuvers = [hero_maneuver]

    elif len(parsed_actors_raw) > 1:
        # KỊCH BẢN NHIỀU TÁC NHÂN (MULTI-ACTOR SCENARIO)
        sorted_actors = sorted(
            parsed_actors_raw,
            key=lambda a: (0 if getattr(a, "role", "adversary") == "ego" else 1,
                           0 if getattr(a, "role", "adversary") == "adversary" else 2),
        )
        adversary_counter = 0
        for i, actor_info in enumerate(sorted_actors):
            role = getattr(actor_info, "role", "adversary")
            cat = _normalize_cat(getattr(actor_info, "category", "unknown"))
            spec_type = getattr(actor_info, "specific_type", "unknown")
            is_ego = role == "ego"

            if is_ego or (i == 0 and not any(getattr(a, "role", "") == "ego" for a in sorted_actors)):
                actor_entry: dict = {
                    "name": "hero",
                    "category": cat,
                    "position": {"lane_offset": 0, "s_offset_m": 0.0},
                    "initial_speed_kmh": default_init_speed,
                    "is_ego": True,
                }
                if spec_type and spec_type != "unknown":
                    actor_entry["specific_type"] = spec_type
                spec_actors.insert(0, actor_entry)
            else:
                adversary_counter += 1
                adv_name = f"adversary_{adversary_counter}"
                s_offset = 20.0 + (adversary_counter - 1) * 15.0
                adv_speed = _compute_actor_speed(cat, spec_type, is_slow, is_residential, is_maneuver_target=False)
                actor_entry = {
                    "name": adv_name,
                    "category": cat,
                    "position": {"lane_offset": 1 if adversary_counter == 1 else 0, "s_offset_m": s_offset},
                    "initial_speed_kmh": adv_speed,
                    "is_ego": False,
                }
                if spec_type and spec_type != "unknown":
                    actor_entry["specific_type"] = spec_type
                spec_actors.append(actor_entry)

                if adversary_counter == 1:
                    adv_maneuver: dict = {
                        "actor_name": adv_name,
                        "maneuver": man_cat,
                        "trigger": {"type": "distance_to_ego", "value": 15.0},
                        "target_speed_kmh": _compute_actor_speed(cat, spec_type, is_slow, is_residential, is_maneuver_target=True),
                    }
                    if man_spec_act and man_spec_act != "unknown":
                        adv_maneuver["specific_action"] = man_spec_act
                    spec_maneuvers.append(adv_maneuver)

        has_ego = any(a.get("is_ego") for a in spec_actors)
        if not has_ego and spec_actors:
            spec_actors[0]["is_ego"] = True
            spec_actors[0]["name"] = "hero"
    else:
        # SINGLE ACTOR FALLBACK (Đơn phương tiện từ Node 1 actor_type)
        # TUYỆT ĐỐI KHÔNG TỰ BỊA THÊM Ô TÔ CON (car) HOẶC ADVERSARY_1
        adv_cat = at_data["category"] if isinstance(at_data, dict) else str(at_data)
        adv_spec_type = at_data.get("specific_type") if isinstance(at_data, dict) else None
        adv_cat = _normalize_cat(adv_cat)
        act_init_speed = _compute_actor_speed(adv_cat, adv_spec_type, is_slow, is_residential, is_maneuver_target=False)

        hero_entry: dict = {
            "name": "hero",
            "category": adv_cat,
            "position": {"lane_offset": 0, "s_offset_m": 0.0},
            "initial_speed_kmh": act_init_speed,
            "is_ego": True,
        }
        if adv_spec_type and adv_spec_type != "unknown":
            hero_entry["specific_type"] = adv_spec_type
        spec_actors = [hero_entry]

        hero_maneuver = {
            "actor_name": "hero",
            "maneuver": man_cat,
            "trigger": {"type": "simulation_time", "value": 1.0},
            "target_speed_kmh": _compute_actor_speed(adv_cat, adv_spec_type, is_slow, is_residential, is_maneuver_target=True),
        }
        if man_spec_act and man_spec_act != "unknown":
            hero_maneuver["specific_action"] = man_spec_act
        spec_maneuvers = [hero_maneuver]

    _scenarios[scenario_id] = {
        "scenario_id": scenario_id,
        "title": f"Kịch bản từ: {req['description_vi'][:60]}",
        "description_vi": req["description_vi"],
        "status": ScenarioStatus.PENDING_REVIEW.value,
        "odd": odd_dict,
        "time_of_day": "day",
        "retrieved_examples": retrieved_examples,
        "spec": {
            "scenario_id": scenario_id,
            "description_vi": req["description_vi"],
            "title": f"Kịch bản từ: {req['description_vi'][:60]}",
            "odd": odd_dict,
            "time_of_day": "day",
            "retrieved_examples": retrieved_examples,
            "actors": spec_actors,
            "maneuvers": spec_maneuvers,
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
                code = getattr(issue, "code", None)
                status_code = 422 if code in (IssueCode.NEED_MORE_DETAIL, IssueCode.UNSUPPORTED_COMBINATION) else 400
                raise HTTPException(
                    status_code=status_code,
                    detail=msg,
                )
    except ValueError as err:
        raise HTTPException(
            status_code=422,
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
            s
            for s in items
            if search_lower in s.get("title", "").lower() or search_lower in s.get("description_vi", "").lower()
        ]

    # Lọc theo ODD axes (hỗ trợ cả string và dict object phân cấp)
    def _match_axis(item_val: any, target: str) -> bool:
        if not item_val:
            return False
        if isinstance(item_val, dict):
            return item_val.get("category") == target
        return str(item_val) == target

    if road_type:
        items = [s for s in items if _match_axis(s.get("odd", {}).get("road_type"), road_type)]
    if weather:
        items = [s for s in items if _match_axis(s.get("odd", {}).get("weather"), weather)]
    if actor_type:
        items = [s for s in items if _match_axis(s.get("odd", {}).get("actor_type"), actor_type)]
    if maneuver:
        items = [s for s in items if _match_axis(s.get("odd", {}).get("maneuver"), maneuver)]

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
    pending = [j for j in _jobs.values() if j["status"] == JobStatus.PENDING.value]
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
