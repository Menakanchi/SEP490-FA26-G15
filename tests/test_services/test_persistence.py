from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import func, insert, inspect, select

from src.models.schemas import ReviewDecision, ReviewGate, ScenarioSpec, ScenarioStatus, VerificationLevel
from src.services.persistence import (
    PersistenceError,
    ScenarioRepository,
    decode_embedding,
    encode_embedding,
    generation_requests,
    make_engine,
    metadata,
    review_decisions,
    scenario_jobs,
)

FIXTURE = Path(__file__).parents[2] / "fixtures" / "scenario_specs" / "sc_001.json"


@pytest.fixture
def spec() -> ScenarioSpec:
    return ScenarioSpec.model_validate(json.loads(FIXTURE.read_text(encoding="utf-8")))


@pytest.fixture(params=("sqlite", "postgres"))
def repository(request: pytest.FixtureRequest, tmp_path: Path) -> ScenarioRepository:
    if request.param == "postgres":
        database_url = os.getenv("TEST_POSTGRES_URL")
        if not database_url:
            pytest.skip("TEST_POSTGRES_URL is not configured")
    else:
        database_url = f"sqlite:///{tmp_path / 'app.db'}"
    repo = ScenarioRepository(make_engine(database_url))
    if request.param == "postgres":
        metadata.drop_all(repo.engine)
    repo.create_schema()
    yield repo
    repo.engine.dispose()


def persist(
    repository: ScenarioRepository,
    spec: ScenarioSpec,
    *,
    request_id: str = "req_001",
    created_by: str = "creator@example.com",
) -> None:
    repository.persist_pending_sim_review(
        request_id=request_id,
        request_description_vi="Câu hỏi gốc",
        scenario_description_vi=spec.description_vi,
        created_by=created_by,
        validation_mode="standard",
        spec=spec,
        xosc_content="<OpenSCENARIO />",
        assumptions=[{"field": "weather", "value": "clear"}],
        issue_history=[{"code": "LANE_OFFSET_IMPLAUSIBLE"}],
        node_metrics={"model": "gpt-test", "repair_iterations": 2},
    )


def test_schema_contains_exact_shared_tables(repository: ScenarioRepository) -> None:
    assert set(inspect(repository.engine).get_table_names()) == {
        # Chiến dịch ODD (chế độ nâng cao) — một hàng mỗi lần khoanh vùng, và
        # `generation_requests.campaign_id` nối ngược về đây.
        "campaigns",
        "generation_requests",
        # Nhãn người chấm ý định — thứ biến L4 từ "máy tự chấm máy" thành đo được.
        "intent_labels",
        "review_decisions",
        "scenario_jobs",
        "scenarios",
        "users",
    }


def test_persist_is_durable_pending_sim_review_without_embedding(
    repository: ScenarioRepository, spec: ScenarioSpec
) -> None:
    persist(repository, spec)
    row = repository.get_scenario(spec.scenario_id)
    assert row is not None
    assert row["status"] == ScenarioStatus.PENDING_SIM_REVIEW.value
    assert row["xosc_content"] == "<OpenSCENARIO />"
    assert row["spec"]["scenario_id"] == spec.scenario_id
    assert row["embedding"] is None
    assert row["embedding_model"] is None
    assert row["assumptions"] == [{"field": "weather", "value": "clear"}]
    with repository.engine.connect() as connection:
        request_row = connection.execute(select(generation_requests)).mappings().one()
    assert request_row["description_vi"] == "Câu hỏi gốc"
    assert request_row["issue_history"] == [{"code": "LANE_OFFSET_IMPLAUSIBLE"}]
    assert request_row["node_metrics"] == {"model": "gpt-test", "repair_iterations": 2}
    repository.engine.dispose()
    reopened = ScenarioRepository(make_engine(str(repository.engine.url)))
    assert reopened.get_scenario(spec.scenario_id)["xosc_content"] == "<OpenSCENARIO />"


def test_transaction_rolls_back_scenario_when_second_write_fails(
    repository: ScenarioRepository, spec: ScenarioSpec
) -> None:
    """Ghi hỏng nửa chừng thì **không** để lại scenario mồ côi.

    Scenario ghi trước, generation_request ghi sau. Nếu chỉ câu đầu thành công
    thì thư viện có một kịch bản không thuộc lần sinh nào — đếm coverage sai, và
    không ai lần ngược ra được nó từ đâu ra.

    Ép câu thứ hai hỏng bằng một giá trị không serialise được sang JSON.
    """
    with pytest.raises(PersistenceError):
        repository.persist_pending_sim_review(
            request_id="req_broken",
            request_description_vi="Câu hỏi gốc",
            scenario_description_vi=spec.description_vi,
            created_by="creator@example.com",
            validation_mode="standard",
            spec=spec,
            xosc_content="<OpenSCENARIO />",
            assumptions=[],
            issue_history=[],
            node_metrics={"khong_serialise_duoc": object()},
        )
    assert repository.get_scenario(spec.scenario_id) is None


def test_existing_request_row_is_finalised_not_duplicated(repository: ScenarioRepository, spec: ScenarioSpec) -> None:
    """Tầng HTTP tạo hàng request trước, workflow chốt lại sau.

    `POST /generate` phải trả `request_id` ngay để client poll `GET /status`,
    nên hàng `generation_requests` ra đời **trước** khi workflow chạy xong.
    Persist mà insert thẳng vào đó là vi phạm khoá chính, cả transaction đổ, và
    kịch bản sinh xong không lưu được — hỏng đúng ở bước cuối.
    """
    now = datetime.now(UTC)
    with repository.engine.begin() as connection:
        connection.execute(
            insert(generation_requests).values(
                request_id="req_existing",
                description_vi="Câu hỏi gốc",
                validation_mode="standard",
                status="running",
                step="retrieve",
                progress=25,
                scenario_id=None,
                issue_history=[],
                node_metrics={},
                created_at=now,
                updated_at=now,
            )
        )

    persist(repository, spec, request_id="req_existing")

    with repository.engine.connect() as connection:
        rows = connection.execute(select(generation_requests)).mappings().all()

    assert len(rows) == 1, "không được đẻ thêm hàng thứ hai cho cùng một request"
    assert rows[0]["status"] == "done"
    assert rows[0]["step"] == "done"
    assert rows[0]["progress"] == 100
    assert rows[0]["scenario_id"] == spec.scenario_id
    assert repository.get_scenario(spec.scenario_id) is not None


def test_before_library_is_only_place_embedding_is_written(repository: ScenarioRepository, spec: ScenarioSpec) -> None:
    persist(repository, spec)
    sim_review = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_SIM,
        approved=True,
        reviewer="sim-reviewer",
        decided_at=datetime.now(UTC),
    )
    repository.apply_review(sim_review, job_id="job_001")
    repository.record_execution(spec.scenario_id, VerificationLevel.ADVERSARIAL)
    decision = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_LIBRARY,
        approved=True,
        reviewer="reviewer@example.com",
        decided_at=datetime.now(UTC),
    )
    target = repository.apply_review(
        decision,
        embedding=[0.25, -0.5, 1.0],
        embedding_model="text-embedding-test",
    )
    row = repository.get_scenario(spec.scenario_id)
    assert target is ScenarioStatus.APPROVED_LIBRARY
    assert decode_embedding(row["embedding"]) == pytest.approx((0.25, -0.5, 1.0))
    assert row["embedding_model"] == "text-embedding-test"


def test_before_library_approval_without_embedding_rolls_back(
    repository: ScenarioRepository, spec: ScenarioSpec
) -> None:
    persist(repository, spec)
    sim_review = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_SIM,
        approved=True,
        reviewer="sim-reviewer",
        decided_at=datetime.now(UTC),
    )
    repository.apply_review(sim_review, job_id="job_001")
    repository.record_execution(spec.scenario_id, VerificationLevel.RAN_NO_HAZARD)
    decision = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_LIBRARY,
        approved=True,
        reviewer="reviewer@example.com",
        decided_at=datetime.now(UTC),
    )
    with pytest.raises(PersistenceError, match="requires embedding"):
        repository.apply_review(decision)
    assert repository.get_scenario(spec.scenario_id)["status"] == ScenarioStatus.PENDING_LIBRARY_REVIEW.value
    with repository.engine.connect() as connection:
        # BEFORE_SIM đã commit trước đó; transaction lỗi chỉ rollback quyết
        # định BEFORE_LIBRARY đang thử ghi.
        assert connection.scalar(select(func.count()).select_from(review_decisions)) == 1


def test_invalid_transition_is_rejected_without_review_row(repository: ScenarioRepository, spec: ScenarioSpec) -> None:
    persist(repository, spec)
    wrong_gate = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_LIBRARY,
        approved=True,
        reviewer="reviewer@example.com",
        decided_at=datetime.now(UTC),
    )
    with pytest.raises(PersistenceError, match="invalid scenario review transition"):
        repository.apply_review(wrong_gate, embedding=[1.0], embedding_model="model")
    with repository.engine.connect() as connection:
        count = connection.scalar(select(func.count()).select_from(review_decisions))
    assert count == 0
    assert repository.get_scenario(spec.scenario_id)["status"] == ScenarioStatus.PENDING_SIM_REVIEW.value


def test_before_sim_approval_creates_job_atomically(repository: ScenarioRepository, spec: ScenarioSpec) -> None:
    persist(repository, spec)
    sim_review = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_SIM,
        approved=True,
        reviewer="sim-reviewer",
        decided_at=datetime.now(UTC),
    )
    repository.apply_review(sim_review, job_id="job_001")
    with repository.engine.connect() as connection:
        job = connection.execute(select(scenario_jobs)).mappings().one()
    assert job["scenario_id"] == spec.scenario_id
    assert job["xosc_content"] == "<OpenSCENARIO />"
    assert job["job_kind"] == "scenario_validation"
    assert job["ego_controller"] == "constant_speed"
    assert repository.get_scenario(spec.scenario_id)["status"] == ScenarioStatus.SIMULATION_QUEUED.value


def test_worker_result_opens_library_gate_without_embedding(repository: ScenarioRepository, spec: ScenarioSpec) -> None:
    persist(repository, spec)
    decision = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_SIM,
        approved=True,
        reviewer="sim-reviewer",
        decided_at=datetime.now(UTC),
    )
    repository.apply_review(decision, job_id="job_001")

    target = repository.record_execution(spec.scenario_id, VerificationLevel.ADVERSARIAL)
    row = repository.get_scenario(spec.scenario_id)

    assert target is ScenarioStatus.PENDING_LIBRARY_REVIEW
    assert row["verification"] == VerificationLevel.ADVERSARIAL.value
    assert row["embedding"] is None


def test_embedding_codec_has_one_definition() -> None:
    """Đường ``struct`` và đường ``numpy`` phải là **cùng một định dạng**.

    Hai chỗ đọc/ghi cột ``scenarios.embedding``: ``persistence`` dùng ``struct``,
    ``library/retriever`` dùng ``np.frombuffer`` để lấy view không copy. Đó là
    một sự đánh đổi tốc độ có chủ đích, nhưng nó chỉ an toàn khi hai đường mô tả
    đúng cùng một byte layout.

    Nếu lệch, vector **không hỏng** — nó *lệch*. Cosine vẫn trả về một con số,
    chỉ là con số vô nghĩa, và retrieval xếp hạng sai mà không có lỗi nào bắn
    ra. Đúng loại hỏng im lặng mà ``ForgeModel(extra="forbid")`` sinh ra để
    chặn ở chỗ khác.
    """
    import numpy as np

    from src.services.persistence import EMBEDDING_DTYPE, EMBEDDING_ITEMSIZE

    values = [0.0, 1.0, -1.0, 0.5, 3.4028234663852886e38, 1.1754943508222875e-38]
    blob = encode_embedding(values)

    assert len(blob) == len(values) * EMBEDDING_ITEMSIZE
    assert decode_embedding(blob) == pytest.approx(values)
    assert np.frombuffer(blob, dtype=EMBEDDING_DTYPE).tolist() == pytest.approx(values)

    # Và ngược lại: numpy ghi ra thì struct phải đọc lại được.
    from_numpy = np.asarray(values, dtype=EMBEDDING_DTYPE).tobytes()
    assert from_numpy == blob


def test_embedding_blob_rejects_truncated_input() -> None:
    """Độ dài không chia hết cho 4 nghĩa là BLOB bị cắt — đừng đoán, hãy nổ."""
    with pytest.raises(ValueError, match="divisible by four"):
        decode_embedding(b"\x00\x00\x00")


def test_pack_blob_embedding_matches_the_shared_codec() -> None:
    """Bí danh phía retriever không được là một bản cài đặt thứ hai."""
    import numpy as np

    from src.services.library.retriever import pack_blob_embedding

    vector = np.asarray([0.25, -0.5, 2.0], dtype=np.float32)
    assert pack_blob_embedding(vector) == encode_embedding(vector.tolist())
