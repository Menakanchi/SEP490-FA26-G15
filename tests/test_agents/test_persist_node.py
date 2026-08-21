from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import inspect

from src.agents.graph import build_persistence_tail, forge_finalization_agent
from src.agents.nodes.persist_node import persist_pending_sim_review_node
from src.models.schemas import IssueCode, ScenarioSpec, ScenarioStatus
from src.services.persistence import ScenarioRepository, make_engine

FIXTURE = Path(__file__).parents[2] / "fixtures" / "scenario_specs" / "sc_001.json"


@pytest.mark.asyncio
async def test_persist_node_ends_at_pending_sim_review(tmp_path: Path) -> None:
    spec = ScenarioSpec.model_validate(json.loads(FIXTURE.read_text(encoding="utf-8")))
    repository = ScenarioRepository(make_engine(f"sqlite:///{tmp_path / 'app.db'}"))
    repository.create_schema()
    result = await persist_pending_sim_review_node(
        {
            "request_id": "req_001",
            "user_query": "Câu hỏi gốc",
            "spec": spec,
            "xosc_content": "<OpenSCENARIO />",
            "iteration": 2,
            "model_used": "gpt-test",
            "issues": [],
        },
        repository,
    )
    assert result == {"scenario_id": spec.scenario_id, "scenario_status": ScenarioStatus.PENDING_SIM_REVIEW}
    assert repository.get_scenario(spec.scenario_id)["embedding"] is None


@pytest.mark.asyncio
async def test_retrieved_examples_survive_persist_and_reload() -> None:
    from src.services import db

    spec = ScenarioSpec.model_validate(json.loads(FIXTURE.read_text(encoding="utf-8")))
    retrieved = [{"id": "sc_777", "title": "Mẫu tương đồng", "similarity_score": 0.91}]
    result = await persist_pending_sim_review_node(
        {
            "request_id": "req_with_retrieval",
            "user_query": spec.description_vi,
            "spec": spec,
            "xosc_content": "<OpenSCENARIO />",
            "retrieved_examples": retrieved,
        }
    )

    assert result["scenario_id"] == spec.scenario_id
    assert db.get_scenario(spec.scenario_id)["retrieved_examples"] == retrieved


@pytest.mark.asyncio
async def test_persist_node_maps_write_failure_to_nonrepairable_issue(tmp_path: Path) -> None:
    repository = ScenarioRepository(make_engine(f"sqlite:///{tmp_path / 'app.db'}"))
    repository.create_schema()
    result = await persist_pending_sim_review_node({}, repository)
    issue = result["issues"][0]
    assert issue.code is IssueCode.PERSISTENCE_ERROR
    assert issue.repairable_by_llm is False
    assert issue.path == "/persistence"


@pytest.mark.asyncio
async def test_persist_node_does_not_run_schema_ddl(tmp_path: Path) -> None:
    spec = ScenarioSpec.model_validate(json.loads(FIXTURE.read_text(encoding="utf-8")))
    repository = ScenarioRepository(make_engine(f"sqlite:///{tmp_path / 'uninitialized.db'}"))
    result = await persist_pending_sim_review_node(
        {
            "request_id": "req_no_schema",
            "user_query": spec.description_vi,
            "spec": spec,
            "xosc_content": "<OpenSCENARIO />",
        },
        repository,
    )
    assert result["issues"][0].code is IssueCode.PERSISTENCE_ERROR
    assert inspect(repository.engine).get_table_names() == []


@pytest.mark.asyncio
async def test_persistence_tail_graph_converts_persists_and_ends(tmp_path: Path) -> None:
    spec = ScenarioSpec.model_validate(json.loads(FIXTURE.read_text(encoding="utf-8")))
    repository = ScenarioRepository(make_engine(f"sqlite:///{tmp_path / 'app.db'}"))
    repository.create_schema()
    graph = build_persistence_tail(repository)
    result = await graph.ainvoke(
        {
            "request_id": "req_graph",
            "user_query": spec.description_vi,
            "spec": spec,
            "issues": [],
        }
    )
    assert result["scenario_status"] == ScenarioStatus.PENDING_SIM_REVIEW
    assert repository.get_scenario(spec.scenario_id)["xosc_content"].startswith("<?xml")


def test_exported_forge_graph_has_persist_as_its_only_success_terminal() -> None:
    graph = forge_finalization_agent.get_graph()
    outgoing = {edge.source: edge.target for edge in graph.edges if edge.source == "persist_pending_sim_review"}
    assert outgoing == {"persist_pending_sim_review": "__end__"}
    assert "convert_xosc" in graph.nodes
    assert "persist_pending_sim_review" in graph.nodes
