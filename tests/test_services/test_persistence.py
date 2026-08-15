from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import func, insert, inspect, select

from src.models.schemas import ReviewDecision, ReviewGate, ScenarioSpec, ScenarioStatus
from src.services.persistence import (
    PersistenceError,
    ScenarioRepository,
    decode_embedding,
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


def persist(repository: ScenarioRepository, spec: ScenarioSpec, *, request_id: str = "req_001") -> None:
    repository.persist_pending_review(
        request_id=request_id,
        request_description_vi="Câu hỏi gốc",
        scenario_description_vi=spec.description_vi,
        validation_mode="standard",
        spec=spec,
        xosc_content="<OpenSCENARIO />",
        assumptions=[{"field": "weather", "value": "clear"}],
        issue_history=[{"code": "LANE_OFFSET_IMPLAUSIBLE"}],
        node_metrics={"model": "gpt-test", "repair_iterations": 2},
    )


def test_schema_contains_exact_shared_tables(repository: ScenarioRepository) -> None:
    assert set(inspect(repository.engine).get_table_names()) == {
        "generation_requests",
        "review_decisions",
        "scenario_jobs",
        "scenarios",
    }


def test_persist_is_durable_pending_review_without_embedding(
    repository: ScenarioRepository, spec: ScenarioSpec
) -> None:
    persist(repository, spec)
    row = repository.get_scenario(spec.scenario_id)
    assert row is not None
    assert row["status"] == ScenarioStatus.PENDING_REVIEW.value
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


def test_transaction_rolls_back_scenario_when_second_insert_fails(
    repository: ScenarioRepository, spec: ScenarioSpec
) -> None:
    now = datetime.now(UTC)
    with repository.engine.begin() as connection:
        connection.execute(
            insert(generation_requests).values(
                request_id="req_duplicate",
                description_vi="existing",
                validation_mode="standard",
                status="failed",
                scenario_id=None,
                issue_history=[],
                node_metrics={},
                failed_reason="expected",
                created_at=now,
                updated_at=now,
            )
        )
    with pytest.raises(PersistenceError):
        persist(repository, spec, request_id="req_duplicate")
    assert repository.get_scenario(spec.scenario_id) is None


def test_before_library_is_only_place_embedding_is_written(repository: ScenarioRepository, spec: ScenarioSpec) -> None:
    persist(repository, spec)
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
    decision = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_LIBRARY,
        approved=True,
        reviewer="reviewer@example.com",
        decided_at=datetime.now(UTC),
    )
    with pytest.raises(PersistenceError, match="requires embedding"):
        repository.apply_review(decision)
    assert repository.get_scenario(spec.scenario_id)["status"] == ScenarioStatus.PENDING_REVIEW.value
    with repository.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(review_decisions)) == 0


def test_invalid_transition_is_rejected_without_review_row(repository: ScenarioRepository, spec: ScenarioSpec) -> None:
    persist(repository, spec)
    wrong_gate = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_SIM,
        approved=True,
        reviewer="reviewer@example.com",
        decided_at=datetime.now(UTC),
    )
    with pytest.raises(PersistenceError, match="invalid scenario review transition"):
        repository.apply_review(wrong_gate, job_id="job_001")
    with repository.engine.connect() as connection:
        count = connection.scalar(select(func.count()).select_from(review_decisions))
    assert count == 0
    assert repository.get_scenario(spec.scenario_id)["status"] == ScenarioStatus.PENDING_REVIEW.value


def test_before_sim_approval_creates_job_atomically(repository: ScenarioRepository, spec: ScenarioSpec) -> None:
    persist(repository, spec)
    library_review = ReviewDecision(
        scenario_id=spec.scenario_id,
        gate=ReviewGate.BEFORE_LIBRARY,
        approved=True,
        reviewer="library-reviewer",
        decided_at=datetime.now(UTC),
    )
    repository.apply_review(library_review, embedding=[1.0], embedding_model="model")
    repository.request_simulation(spec.scenario_id)
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
    assert repository.get_scenario(spec.scenario_id)["status"] == ScenarioStatus.APPROVED_LIBRARY.value
