import pytest
from src.models.schemas import CriterionStatus


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
    # Generate scenario with specific ODD keywords
    gen_res = await client.post(
        "/api/v1/generate",
        json={"prompt": "Xe tải lấn làn phanh gấp trong trời mưa lớn ban đêm", "validation_mode": "static"},
    )
    req_id = gen_res.json()["request_id"]

    import asyncio
    sc_id = None
    for _ in range(25):
        s_res = await client.get(f"/api/v1/status/{req_id}")
        sc_id = s_res.json().get("scenario_id")
        if sc_id:
            break
        await asyncio.sleep(0.2)

    assert sc_id is not None
    detail_res = await client.get(f"/api/v1/scenarios/{sc_id}")
    assert detail_res.status_code == 200
    sc = detail_res.json()
    assert "odd" in sc
    assert "spec" in sc
    # Ensure ODD is not default motorcycle/cut_in when prompt is truck/lane_drift or heavy_rain
    assert sc["odd"]["weather"] == "heavy_rain"
    assert sc["odd"]["actor_type"] == "truck"
    assert sc["spec"]["odd"]["weather"] == "heavy_rain"


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
    # Non-existent scenario
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

    # Rejection without sufficient reason (< 10 chars)
    gen_res = await client.post(
        "/api/v1/generate",
        json={"prompt": "Ô tô lấn làn", "validation_mode": "static"},
    )
    req_id = gen_res.json()["request_id"]
    
    # Wait briefly or poll until scenario_id is ready
    import asyncio
    for _ in range(20):
        s_res = await client.get(f"/api/v1/status/{req_id}")
        if s_res.json().get("scenario_id"):
            break
        await asyncio.sleep(0.2)
    
    sc_id = (await client.get(f"/api/v1/status/{req_id}")).json().get("scenario_id")
    if sc_id:
        # Test rejection reason validation
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

        # Test valid approval
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


@pytest.mark.asyncio
async def test_internal_worker_jobs(client):
    # GET /internal/jobs
    jobs_res = await client.get("/api/v1/internal/jobs")
    assert jobs_res.status_code == 200
    assert "jobs" in jobs_res.json()
