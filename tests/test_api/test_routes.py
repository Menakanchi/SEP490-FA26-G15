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


async def _approve_sim(client, scenario_id: str) -> str:
    response = await client.post(
        "/api/v1/review",
        json={
            "scenario_id": scenario_id,
            "gate": "before_sim",
            "approved": True,
            "reviewer": "Simulation Reviewer",
            "reason": "",
        },
    )
    assert response.status_code == 200, response.text
    jobs = (await client.get("/api/v1/internal/jobs")).json()["jobs"]
    return next(job["job_id"] for job in jobs if job["scenario_id"] == scenario_id)


async def _submit_result(
    client,
    scenario_id: str,
    job_id: str,
    *,
    success: bool = True,
    collision: bool = False,
) -> None:
    payload = {
        "scenario_id": scenario_id,
        "xosc_path": f"{scenario_id}.xosc",
        "success": success,
        "criteria_results": (
            [{"name": "CollisionTest", "result": "FAILURE" if collision else "SUCCESS", "actual": "1"}]
            if success
            else []
        ),
    }
    if not success:
        payload["error"] = "quá 300s, đã giết tiến trình"
    response = await client.post(f"/api/v1/internal/jobs/{job_id}/result", json=payload)
    assert response.status_code == 200, response.text


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
    # Reviewer phải tải được artifact trước cả hai quyết định.
    assert (await client.get(f"/api/v1/scenarios/{sc_id}/xosc")).status_code == 200


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
async def test_review_validation_and_flow(client):
    """Hai cổng không thể đảo: BEFORE_SIM -> result -> BEFORE_LIBRARY."""
    res = await client.post(
        "/api/v1/review",
        json={
            "scenario_id": "sc_99999",
            "gate": "before_sim",
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
            "gate": "before_sim",
            "approved": False,
            "reviewer": "Reviewer B",
            "reason": "Ngắn",
        },
    )
    assert rej_res.status_code == 422

    wrong_gate = await client.post(
        "/api/v1/review",
        json={
            "scenario_id": sc_id,
            "gate": "before_library",
            "approved": True,
            "reviewer": "Reviewer B",
            "reason": "",
        },
    )
    assert wrong_gate.status_code == 409

    job_id = await _approve_sim(client, sc_id)
    assert (await client.get(f"/api/v1/scenarios/{sc_id}")).json()["status"] == "simulation_queued"
    await _submit_result(client, sc_id, job_id, collision=True)
    assert (await client.get(f"/api/v1/scenarios/{sc_id}")).json()["status"] == "pending_library_review"

    app_res = await client.post(
        "/api/v1/review",
        json={
            "scenario_id": sc_id,
            "gate": "before_library",
            "approved": True,
            "reviewer": "Library Reviewer",
            "reason": "",
        },
    )
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "approved_library"


@pytest.mark.asyncio
async def test_before_sim_creates_a_job_and_keeps_the_scenario(client):
    """Cổng đầu tiên tạo job nhưng chưa đưa scenario vào thư viện."""
    sc_id = await _generate_one(client, "Xe máy tạt đầu ô tô trên đường cao tốc")
    await _approve_sim(client, sc_id)

    jobs = (await client.get("/api/v1/internal/jobs")).json()["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["scenario_id"] == sc_id
    # Worker chạy ở máy khác, không nối được vào DB — job phải tự mang .xosc đi.
    assert jobs[0]["xosc_content"].startswith("<?xml")

    detail = (await client.get(f"/api/v1/scenarios/{sc_id}")).json()
    assert detail["status"] == "simulation_queued"
    assert detail["verification"] == "unverified"


@pytest.mark.asyncio
async def test_execution_result_opens_library_review(client):
    """Worker evidence mở cổng cuối, không tự động publish."""
    sc_id = await _generate_one(client, "Xe máy tạt đầu ô tô trên đường cao tốc")
    assert (await client.get(f"/api/v1/scenarios/{sc_id}")).json()["verification"] == "unverified"
    job_id = await _approve_sim(client, sc_id)
    await _submit_result(client, sc_id, job_id)

    detail = (await client.get(f"/api/v1/scenarios/{sc_id}")).json()
    assert detail["verification"] == "ran_no_hazard"
    assert detail["status"] == "pending_library_review"
    assert detail["latest_execution_result"]["success"] is True
    assert detail["latest_execution_result"]["criteria_results"][0]["name"] == "CollisionTest"


@pytest.mark.asyncio
async def test_collision_failure_is_recorded_as_adversarial(client):
    """`CollisionTest = FAILURE` là **tin tốt** — kịch bản dựng được nguy hiểm.

    Đọc ngược dấu ở đây là cả hệ thống đi tối thiểu hoá đúng thứ phải tối đa hoá:
    `adversarial_found` chính là đếm số kịch bản làm ego va chạm.
    """
    sc_id = await _generate_one(client, "Xe máy tạt đầu ô tô trên đường cao tốc")
    job_id = await _approve_sim(client, sc_id)
    await _submit_result(client, sc_id, job_id, collision=True)
    detail = (await client.get(f"/api/v1/scenarios/{sc_id}")).json()
    assert detail["verification"] == "adversarial"
    assert detail["status"] == "pending_library_review"


@pytest.mark.asyncio
async def test_crashed_run_is_recorded_as_execution_failed(client):
    """`success=False` là kịch bản KHÔNG chạy nổi — khác hẳn chạy xong mà không va chạm."""
    sc_id = await _generate_one(client, "Xe máy tạt đầu ô tô trên đường cao tốc")
    job_id = await _approve_sim(client, sc_id)
    await _submit_result(client, sc_id, job_id, success=False)
    detail = (await client.get(f"/api/v1/scenarios/{sc_id}")).json()
    assert detail["verification"] == "execution_failed"
    assert detail["status"] == "pending_library_review"


@pytest.mark.asyncio
async def test_generation_always_stops_at_before_sim(client):
    """validation_mode không được bỏ qua quyết định tiêu GPU của con người."""
    with patch("src.services.llm.call_with_escalation", return_value=_cut_in_draft()):
        req_id = (
            await client.post(
                "/api/v1/generate",
                json={"prompt": "Xe máy tạt đầu ô tô trên đường cao tốc", "validation_mode": "sim"},
            )
        ).json()["request_id"]
        for _ in range(60):
            status = (await client.get(f"/api/v1/status/{req_id}")).json()
            if status.get("scenario_id") or status.get("step") == "failed":
                break
            await asyncio.sleep(0.05)

    sc_id = status["scenario_id"]
    assert (await client.get(f"/api/v1/scenarios/{sc_id}")).json()["status"] == "pending_sim_review"
    assert (await client.get("/api/v1/internal/jobs")).json()["jobs"] == []


@pytest.mark.asyncio
async def test_two_roles_are_recorded_separately(client):
    """Đề bài đòi "ít nhất 2 vai trò: người tạo và người duyệt".

    Không lưu ai tạo thì hệ thống có ĐÚNG MỘT vai trò, và không phân biệt được
    người tự duyệt bài của mình với người duyệt hộ — hai chuyện đó trông y hệt
    nhau trong dữ liệu.
    """
    with patch("src.services.llm.call_with_escalation", return_value=_cut_in_draft()):
        req_id = (
            await client.post(
                "/api/v1/generate",
                json={
                    "prompt": "Xe máy tạt đầu ô tô trên đường cao tốc",
                    "validation_mode": "static",
                    "created_by": "an.nguyen@vinuni.edu.vn",
                },
            )
        ).json()["request_id"]
        for _ in range(60):
            status = (await client.get(f"/api/v1/status/{req_id}")).json()
            if status.get("scenario_id") or status.get("step") == "failed":
                break
            await asyncio.sleep(0.05)

    sc_id = status["scenario_id"]
    detail = (await client.get(f"/api/v1/scenarios/{sc_id}")).json()
    assert detail["created_by"] == "an.nguyen@vinuni.edu.vn"

    await client.post(
        "/api/v1/review",
        json={
            "scenario_id": sc_id,
            "gate": "before_sim",
            "approved": True,
            "reviewer": "binh.tran@vinuni.edu.vn",
            "reason": "",
        },
    )
    reviewed = (await client.get(f"/api/v1/scenarios/{sc_id}")).json()
    assert reviewed["review_logs"][-1]["reviewer"] == "binh.tran@vinuni.edu.vn"
    # Hai vai trò tách rời và đọc ngược lại được — đó là điều kiện tối thiểu để
    # nói hệ thống có phân vai.
    assert reviewed["created_by"] != reviewed["review_logs"][-1]["reviewer"]


@pytest.mark.asyncio
async def test_scenario_is_tagged_from_its_odd_cell(client):
    """ "Thư viện lưu trữ có gắn tag" — cột `tags` luôn rỗng thì tính năng đó
    chỉ tồn tại trên giấy: không lọc được gì, không nhóm được gì.

    Bốn trục ODD gắn sẵn, cộng chữ người dùng gõ nếu parse_intent giữ được.
    """
    sc_id = await _generate_one(client, "Xe máy tạt đầu ô tô trên đường cao tốc")
    tags = (await client.get(f"/api/v1/scenarios/{sc_id}")).json()["tags"]

    assert {"highway", "clear", "motorcycle", "cut_in"} <= set(tags)


@pytest.mark.asyncio
async def test_tags_can_be_replaced(client):
    """PUT thay toàn bộ danh sách, không phải thêm vào — client gửi trạng thái cuối."""
    sc_id = await _generate_one(client, "Xe máy tạt đầu ô tô trên đường cao tốc")

    res = await client.put(
        f"/api/v1/scenarios/{sc_id}/tags",
        json={"tags": ["  Mưa Bão ", "regression", "regression", ""]},
    )
    # Chuẩn hoá: bỏ khoảng trắng, về chữ thường, bỏ trùng, bỏ rỗng.
    assert res.json()["tags"] == ["mưa bão", "regression"]
    assert (await client.get(f"/api/v1/scenarios/{sc_id}")).json()["tags"] == ["mưa bão", "regression"]

    assert (await client.put("/api/v1/scenarios/sc_99999/tags", json={"tags": []})).status_code == 404
