import asyncio
from unittest.mock import patch

import pytest

from src.models.schemas import ScenarioDraft


async def _generate_one(client, prompt: str) -> str:
    """Sinh một scenario qua API với LLM mock, trả về scenario_id.

    Mock chứ không gọi thật: `POST /generate` chạy workflow trong background
    task, nên một test quên mock sẽ **âm thầm** gọi API trả phí rồi kết thúc
    trước khi task chạy xong — không ai thấy tiền đi đâu.
    """
    with patch("src.services.llm.call_with_escalation", return_value=_cut_in_draft()):
        req_id = (await client.post("/api/v1/generate", json={"prompt": prompt, "validation_mode": "static"})).json()[
            "request_id"
        ]

        for _ in range(60):
            status = (await client.get(f"/api/v1/status/{req_id}")).json()
            if status.get("scenario_id") or status.get("step") == "failed":
                break
            await asyncio.sleep(0.05)

    assert status.get("scenario_id"), f"workflow không sinh được scenario: {status}"
    return status["scenario_id"]


def _cut_in_draft() -> ScenarioDraft:
    """Draft cut_in hợp lệ trên cao tốc — qua được validate ngay vòng đầu."""
    return ScenarioDraft.model_validate(
        {
            "title": "Xe máy tạt đầu trên cao tốc",
            "odd": {
                "road_type": "highway",
                "weather": "clear",
                "actor_type": "motorcycle",
                "maneuver": "cut_in",
            },
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
                    "name": "adv",
                    "category": "motorcycle",
                    "position": {"lane_offset": -1, "s_offset_m": -25.0},
                    "initial_speed_kmh": 80.0,
                    "is_ego": False,
                },
            ],
            "maneuvers": [
                {
                    "actor_name": "adv",
                    "maneuver": "cut_in",
                    "trigger": {"type": "simulation_time", "value": 7.0},
                    "target_speed_kmh": 40.0,
                }
            ],
            "duration_s": 30.0,
        }
    )


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_generate_endpoint_validation(client):
    # Empty prompt should return 422 (Pydantic min_length=1)
    response = await client.post("/api/v1/generate", json={"prompt": "", "validation_mode": "static"})
    assert response.status_code == 422

    # Short or numeric prompt should return 400
    for invalid in ["0", "abc", "123", "a"]:
        res_400 = await client.post("/api/v1/generate", json={"prompt": invalid, "validation_mode": "static"})
        assert res_400.status_code == 400
        assert "Mô tả kịch bản quá ngắn hoặc không đủ thông tin" in res_400.json()["detail"]

    # Valid prompt returns request_id
    response = await client.post(
        "/api/v1/generate",
        json={"prompt": "Xe máy tạt đầu ô tô trên đường cao tốc", "validation_mode": "static"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "request_id" in data
    assert len(data["request_id"]) > 0


@pytest.mark.asyncio
async def test_generation_status_polling(client):
    # Start generation
    gen_res = await client.post(
        "/api/v1/generate",
        json={"prompt": "Xe máy phanh gấp ở giao lộ", "validation_mode": "static"},
    )
    req_id = gen_res.json()["request_id"]

    # Poll status
    status_res = await client.get(f"/api/v1/status/{req_id}")
    assert status_res.status_code == 200
    sdata = status_res.json()
    assert sdata["request_id"] == req_id
    assert "step" in sdata
    assert "progress" in sdata


@pytest.mark.asyncio
async def test_generated_scenario_dynamic_odd(client):
    """ODD phải bám theo câu người dùng, không rơi về mặc định.

    LLM được mock: thứ đang kiểm là **đường đi qua API** — request tạo ra, graph
    chạy, scenario nằm trong DB, `GET /scenarios/{id}` đọc lại được — chứ không
    phải chất lượng sinh của model. Đo chất lượng model là việc của `eval/`, và
    nó tốn tiền thật.
    """
    prompt = "Xe tải lấn làn phanh gấp trong trời mưa lớn ban đêm"
    draft = ScenarioDraft.model_validate(
        {
            "title": "Xe tải lấn làn trong mưa lớn",
            # parse_intent đọc ra đúng ô này; `highway` là mặc định vì câu không
            # nói loại đường và ADR-016 chỉ hỗ trợ cao tốc.
            "odd": {
                "road_type": "highway",
                "weather": "heavy_rain",
                "actor_type": "truck",
                "maneuver": "lane_drift",
            },
            "time_of_day": "night",
            "actors": [
                {
                    "name": "hero",
                    "category": "car",
                    "position": {"lane_offset": 0, "s_offset_m": 0.0},
                    "initial_speed_kmh": 60.0,
                    "is_ego": True,
                },
                {
                    "name": "adv",
                    "category": "truck",
                    "position": {"lane_offset": -1, "s_offset_m": 15.0},
                    "initial_speed_kmh": 55.0,
                    "is_ego": False,
                },
            ],
            "maneuvers": [
                {
                    "actor_name": "adv",
                    "maneuver": "lane_drift",
                    "trigger": {"type": "simulation_time", "value": 6.0},
                }
            ],
            "duration_s": 30.0,
        }
    )

    with patch("src.services.llm.call_with_escalation", return_value=draft):
        gen_res = await client.post(
            "/api/v1/generate",
            json={"prompt": prompt, "validation_mode": "static"},
        )
        req_id = gen_res.json()["request_id"]

        sc_id = None
        for _ in range(60):
            status = (await client.get(f"/api/v1/status/{req_id}")).json()
            sc_id = status.get("scenario_id")
            if sc_id or status.get("step") == "failed":
                break
            await asyncio.sleep(0.05)

    assert sc_id is not None, f"workflow không sinh được scenario: {status}"

    detail_res = await client.get(f"/api/v1/scenarios/{sc_id}")
    assert detail_res.status_code == 200
    sc = detail_res.json()

    assert sc["odd"]["weather"] == "heavy_rain"
    assert sc["odd"]["actor_type"] == "truck"
    assert sc["spec"]["odd"]["weather"] == "heavy_rain"
    # FR-01: câu gốc giữ nguyên văn — `intent_match` đối chiếu với chính nó.
    assert sc["description_vi"] == prompt
    # Chưa duyệt thì chưa tải được .xosc (FR-11).
    assert (await client.get(f"/api/v1/scenarios/{sc_id}/xosc")).status_code == 403


@pytest.mark.asyncio
async def test_unsupported_prompt_fails_without_creating_a_scenario(client):
    """FR-14: lần sinh hỏng để lại dấu vết, **không** để lại scenario giả."""
    with patch("src.services.llm.call_with_escalation") as mock_llm:
        gen_res = await client.post(
            "/api/v1/generate",
            json={"prompt": "Người đi bộ băng qua đường ở ngã tư lúc trời mưa", "validation_mode": "static"},
        )
        req_id = gen_res.json()["request_id"]

        for _ in range(60):
            status = (await client.get(f"/api/v1/status/{req_id}")).json()
            if status.get("step") in ("done", "failed"):
                break
            await asyncio.sleep(0.05)

    mock_llm.assert_not_called()
    assert status["step"] == "failed"
    assert status["scenario_id"] is None
    assert status["error"]
    assert (await client.get("/api/v1/scenarios")).json()["total"] == 0


@pytest.mark.asyncio
async def test_scenarios_list_and_detail(client):
    # GET /scenarios
    res = await client.get("/api/v1/scenarios")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_review_validation_and_flow(client):
    """Vòng duyệt: 404 khi không có, 422 khi từ chối cụt lý do, 200 khi duyệt."""
    res = await client.post(
        "/api/v1/review",
        json={
            "scenario_id": "sc_99999",
            "gate": "before_library",
            "approved": True,
            "reviewer": "Engineer A",
            "reason": "",
        },
    )
    assert res.status_code == 404

    sc_id = await _generate_one(client, "Xe máy tạt đầu ô tô trên đường cao tốc")

    # Từ chối phải kèm lý do đủ dài — người đọc lại sau này cần biết vì sao.
    rej_res = await client.post(
        "/api/v1/review",
        json={
            "scenario_id": sc_id,
            "gate": "before_library",
            "approved": False,
            "reviewer": "Reviewer B",
            "reason": "Ngắn",
        },
    )
    assert rej_res.status_code == 422

    app_res = await client.post(
        "/api/v1/review",
        json={
            "scenario_id": sc_id,
            "gate": "before_library",
            "approved": True,
            "reviewer": "Reviewer B",
            "reason": "",
        },
    )
    assert app_res.status_code == 200
    assert app_res.json() == {"ok": True}

    # Duyệt xong thì mới tải được .xosc (FR-11).
    assert (await client.get(f"/api/v1/scenarios/{sc_id}/xosc")).status_code == 200


@pytest.mark.asyncio
async def test_internal_worker_jobs(client):
    # GET /internal/jobs
    jobs_res = await client.get("/api/v1/internal/jobs")
    assert jobs_res.status_code == 200
    assert "jobs" in jobs_res.json()
