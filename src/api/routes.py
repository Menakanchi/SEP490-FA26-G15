"""REST API endpoints cho Scenario Forge.

**Ranh giới kiến trúc (test_architecture.py canh):**

- KHÔNG import ``sqlite3``, ``sqlalchemy``, ``numpy`` — DB logic nằm ở
  ``src/services/``. Router chỉ là lớp HTTP.
- KHÔNG import ``carla`` — ADR-001.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, Response

from src.models.schemas import (
    # Domain models
    ExecutionResult,
    # API models
    GenerateRequest,
    GenerateResponse,
    IssueCode,
    JobStatus,
    ReviewApiRequest,
    ReviewGate,
    ScenarioListResponse,
    ScenarioStatus,
    StatusResponse,
    next_status_after_review,
)
from src.services import db
from src.services.library.retriever import SQLiteRetriever

router = APIRouter()


# ---------------------------------------------------------------------------
# In-memory fallback stores (giữ tương thích ngược cho cached views)
# ---------------------------------------------------------------------------

_generation_requests: dict[str, dict] = {}
_scenarios: dict[str, dict] = {}
_jobs: dict[str, dict] = {}


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
    req = db.get_generation_request(request_id) or _generation_requests.get(request_id)
    if not req:
        return

    for step in _STEP_ORDER:
        req["step"] = step
        req["progress"] = _step_progress(step)
        db.update_generation_request(request_id, step=step, progress=_step_progress(step))
        _generation_requests[request_id] = req
        await asyncio.sleep(0.05)

    odd_dict = {
        "road_type": "unknown",
        "weather": "unknown",
        "actor_type": "unknown",
        "maneuver": "unknown",
    }
    at_data = "unknown"
    mv_data = "unknown"
    parsed_actors_raw: list = []
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
                at_spec = getattr(odd_obj, "specific_type", None) or (at_cat if at_cat != "unknown" else None)
                at_data = {"category": at_cat, "specific_type": at_spec}

            if hasattr(mv, "model_dump"):
                mv_data = mv.model_dump()
            elif isinstance(mv, dict):
                mv_data = mv
            else:
                mv_cat = mv.value if hasattr(mv, "value") else str(mv if mv else "unknown")
                mv_spec = getattr(odd_obj, "specific_action", None) or (mv_cat if mv_cat != "unknown" else None)
                mv_data = {"category": mv_cat, "specific_action": mv_spec}

            odd_dict = {
                "road_type": rt_str,
                "weather": wt_str,
                "actor_type": at_data,
                "maneuver": mv_data,
            }

            parsed_actors_raw = getattr(odd_obj, "actors", []) or []
    except Exception:
        pass

    retrieved_examples: list[dict] = []
    try:
        from src.agents.nodes.retrieve import retrieve_node

        retrieve_k = req.get("limit", 3)
        res_ret = retrieve_node(
            {
                "user_query": req["description_vi"],
                "odd_query": odd_obj if "odd_obj" in locals() else None,
                "parsed_intent": odd_dict,
                "limit": retrieve_k,
            },
            k=retrieve_k,
        )
        retrieved_examples = res_ret.get("retrieved_examples", [])
        if not retrieved_examples:
            matched = []
            for sc in db.list_all_scenarios():
                sc_id = sc.get("scenario_id")
                title = sc.get("title", "")
                desc = sc.get("description_vi", "")
                odd = sc.get("odd", {})
                matched.append(
                    {
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
                    }
                )
                if len(matched) >= retrieve_k:
                    break
            retrieved_examples = matched
        retrieved_examples = retrieved_examples[:retrieve_k]
    except Exception:
        pass

    counter = db.get_scenario_count() + 1
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
    is_residential = (
        road_type_str in ("residential_narrow", "residential")
        or "nội bộ" in req["description_vi"].lower()
        or "ngõ" in req["description_vi"].lower()
    )

    if is_slow:
        default_init_speed = 10.0
    elif is_residential:
        default_init_speed = 20.0
    else:
        default_init_speed = 60.0

    if len(parsed_actors_raw) == 1:
        actor_info = parsed_actors_raw[0]
        cat = _normalize_cat(getattr(actor_info, "category", "unknown"))
        spec_type = getattr(actor_info, "specific_type", "unknown")
        act_init_speed = _compute_actor_speed(cat, spec_type, is_slow, is_residential, is_maneuver_target=False)

        hero_entry: dict = {
            "name": "hero",
            "category": cat,
            "position": {"lane_offset": 1, "s_offset_m": 0.0},
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
        def _get_actor_attr(a, key: str, default=None):
            if isinstance(a, dict):
                return a.get(key, default)
            return getattr(a, key, default)

        sorted_actors = sorted(
            parsed_actors_raw,
            key=lambda a: (
                0 if _get_actor_attr(a, "role", "adversary") == "ego" else 1,
                0 if _get_actor_attr(a, "role", "adversary") == "adversary" else 2,
            ),
        )
        adversary_counter = 0
        for i, actor_info in enumerate(sorted_actors):
            role = _get_actor_attr(actor_info, "role", "adversary")
            cat = _normalize_cat(_get_actor_attr(actor_info, "category", "unknown"))
            spec_type = _get_actor_attr(actor_info, "specific_type", "unknown")
            is_ego = role == "ego"

            if is_ego or (i == 0 and not any(_get_actor_attr(a, "role", "") == "ego" for a in sorted_actors)):
                actor_entry: dict = {
                    "name": "hero",
                    "category": cat,
                    "position": {"lane_offset": 1, "s_offset_m": 0.0},
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
                adv_lane_offset = 2 if (man_cat == "cut_in" and adversary_counter == 1) else (1 + adversary_counter)
                actor_entry = {
                    "name": adv_name,
                    "category": cat,
                    "position": {"lane_offset": adv_lane_offset, "s_offset_m": s_offset},
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
        adv_cat = at_data["category"] if isinstance(at_data, dict) else str(at_data)
        adv_spec_type = at_data.get("specific_type") if isinstance(at_data, dict) else None
        adv_cat = _normalize_cat(adv_cat)
        act_init_speed = _compute_actor_speed(adv_cat, adv_spec_type, is_slow, is_residential, is_maneuver_target=False)

        hero_entry: dict = {
            "name": "hero",
            "category": adv_cat,
            "position": {"lane_offset": 1, "s_offset_m": 0.0},
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

    spec_dict = {
        "scenario_id": scenario_id,
        "description_vi": req["description_vi"],
        "title": f"Kịch bản từ: {req['description_vi'][:60]}",
        "odd": odd_dict,
        "time_of_day": "day",
        "retrieved_examples": retrieved_examples,
        "actors": spec_actors,
        "maneuvers": spec_maneuvers,
        "duration_s": 30.0,
    }
    xosc_str = f'<?xml version="1.0"?>\n<OpenSCENARIO><!-- {scenario_id} stub --></OpenSCENARIO>'

    sc_dict = db.save_scenario(
        scenario_id=scenario_id,
        title=f"Kịch bản từ: {req['description_vi'][:60]}",
        description_vi=req["description_vi"],
        spec=spec_dict,
        odd=odd_dict,
        status=ScenarioStatus.PENDING_REVIEW.value,
        xosc_content=xosc_str,
        assumptions=[],
        tags=[],
        retrieved_examples=retrieved_examples,
        validation_mode=req.get("validation_mode", "fast"),
    )
    _scenarios[scenario_id] = sc_dict

    db.update_generation_request(
        request_id,
        status="done",
        step="done",
        progress=100,
        scenario_id=scenario_id,
    )
    req["step"] = "done"
    req["progress"] = 100
    req["scenario_id"] = scenario_id
    _generation_requests[request_id] = req


# ===========================================================================
# POST /generate & POST /scenarios/generate
# ===========================================================================


@router.post("/generate", response_model=GenerateResponse)
@router.post("/scenarios/generate", response_model=GenerateResponse)
async def generate(body: GenerateRequest) -> GenerateResponse:
    prompt_text = body.prompt.strip()
    words = prompt_text.split()
    if len(prompt_text) < 10 or len(words) < 3 or prompt_text.isnumeric():
        raise HTTPException(
            status_code=400,
            detail="Mô tả kịch bản quá ngắn hoặc không đủ thông tin kịch bản giao thông.",
        )

    request_id = str(uuid.uuid4())

    req_dict = db.create_generation_request(request_id, body.prompt, body.validation_mode, body.limit)
    _generation_requests[request_id] = req_dict

    asyncio.create_task(_run_mock_workflow(request_id))

    return GenerateResponse(request_id=request_id)


# ===========================================================================
# GET /status/{request_id}
# ===========================================================================


@router.get("/status/{request_id}", response_model=StatusResponse)
async def get_status(request_id: str) -> StatusResponse:
    """Polling trạng thái generation."""
    req = db.get_generation_request(request_id) or _generation_requests.get(request_id)
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

    scenario = db.get_scenario(target_id) or _scenarios.get(target_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{target_id}' không tồn tại")

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

    decision = db.save_review_decision(target_id, body.gate, body.approved, body.reviewer, body.reason)
    scenario.setdefault("review_logs", []).append(decision)
    _scenarios[target_id] = scenario

    if body.approved and gate is ReviewGate.BEFORE_SIM and scenario.get("xosc_content"):
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        job_dict = db.create_scenario_job(job_id, target_id, scenario["xosc_content"])
        _jobs[job_id] = job_dict

    return {"ok": True}


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
            sc = db.get_scenario(r["id"]) or _scenarios.get(r["id"])
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
        if not items:
            items = list(_scenarios.values())

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
    scenario = db.get_scenario(scenario_id) or _scenarios.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' không tồn tại")

    return scenario


# ===========================================================================
# GET /scenarios/{scenario_id}/xosc (Download .xosc with Status Gate HTTP 403)
# ===========================================================================


@router.get("/scenarios/{scenario_id}/xosc")
async def get_scenario_xosc(scenario_id: str) -> Response:
    """Tải file .xosc XML của scenario (chặn HTTP 403 khi chưa được duyệt BEFORE_LIBRARY)."""
    scenario = db.get_scenario(scenario_id) or _scenarios.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' không tồn tại")

    current_status = scenario.get("status")
    if current_status != ScenarioStatus.APPROVED_LIBRARY.value:
        raise HTTPException(
            status_code=403,
            detail="Chỉ kịch bản đã qua duyệt BEFORE_LIBRARY mới được phép tải file .xosc",
        )

    xosc_content = scenario.get("xosc_content") or f'<?xml version="1.0"?>\n<OpenSCENARIO><!-- {scenario_id} --></OpenSCENARIO>'
    return Response(content=xosc_content, media_type="application/xml")


# ===========================================================================
# Internal — GPU Worker endpoints
# ===========================================================================


@router.get("/internal/jobs")
async def list_pending_jobs() -> dict:
    """Worker poll: trả pending jobs để worker nhận chạy."""
    pending = db.get_pending_jobs()
    if not pending:
        pending = [j for j in _jobs.values() if j["status"] == JobStatus.PENDING.value]
    return {"jobs": pending}


@router.post("/internal/jobs/{job_id}/result")
async def submit_job_result(job_id: str, body: ExecutionResult) -> dict:
    """Worker submit kết quả sau khi chạy ScenarioRunner."""
    job = db.get_job(job_id) or _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' không tồn tại")

    new_status = JobStatus.DONE.value if body.success else JobStatus.FAILED.value
    db.update_job_result(job_id, new_status, body.model_dump())

    if job_id in _jobs:
        _jobs[job_id]["status"] = new_status
        _jobs[job_id]["result"] = body.model_dump()

    return {"ok": True}
