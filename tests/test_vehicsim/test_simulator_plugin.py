"""Bộ mô phỏng cắm được (ADR-027): xuất JSON, chạy CARLA bằng tiến trình con, không trộn simulator.

CARLA được thay bằng ``fake_carla_cli.py`` — cùng hợp đồng CLI với
``worker/run_variant.py`` nhưng chạy bộ động học bên trong.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from sqlalchemy import select

from src.config import get_settings
from src.services.vehicsim import tables as t
from src.services.vehicsim.bundle import read_spec
from src.services.vehicsim.common import engine
from src.services.vehicsim.simulator import simulate

API = "/api/v1/vehicsim"
FAKE_CARLA = str(Path(__file__).with_name("fake_carla_cli.py"))
TINY_FAMILY = {
    "name": "Pedestrian Crossing",
    "ego_speeds_kmh": [40, 60],
    "trigger_distances_m": [20],
    "pedestrian_speeds_mps": [1.5],
    "stops_at_curb": [False],
    "weathers": ["CLEAR"],
    "times_of_day": ["DAY"],
}


@pytest.fixture
def use_simulator(monkeypatch, tmp_path):
    """``use_simulator("carla", "--exit-code", "3")`` đổi cấu hình cho các run tạo sau đó."""

    def _use(kind: str, *fake_args: str, command: bool = True) -> None:
        monkeypatch.setenv("VEHICSIM_SIMULATOR", kind)
        monkeypatch.setenv("VEHICSIM_DATA_ROOT", str(tmp_path / "data"))
        monkeypatch.setenv(
            "VEHICSIM_CARLA_COMMAND", json.dumps([sys.executable, FAKE_CARLA, *fake_args] if command else [])
        )
        get_settings.cache_clear()

    return _use


def _runs(scenario_id: int, purpose: str | None = None) -> list:
    q = select(t.simulation_runs).where(t.simulation_runs.c.scenario_id == scenario_id)
    if purpose:
        q = q.where(t.simulation_runs.c.purpose == purpose)
    with engine().connect() as conn:
        return conn.execute(q.order_by(t.simulation_runs.c.id)).all()


def _raw(run_id: int) -> dict:
    with engine().connect() as conn:
        return conn.execute(
            select(t.simulation_results.c.raw_metrics).where(t.simulation_results.c.simulation_run_id == run_id)
        ).scalar()


async def _family(client, engineer) -> int:
    res = await client.post(f"{API}/families", json=TINY_FAMILY, headers=engineer["headers"])
    assert res.status_code == 201, res.text
    return res.json()["scenario_id"]


@pytest.mark.asyncio
async def test_exported_bundle_reproduces_the_stored_run(client, engineer, viewer):
    run = _runs(await _family(client, engineer))[0]
    url = f"{API}/runs/{run.id}/bundle"

    assert (await client.get(url)).status_code == 401
    res = await client.get(url, headers=viewer["headers"])  # VIEWER được tải để chạy lại
    assert res.status_code == 200, res.text
    assert f'filename="vehicsim-run-{run.id}.json"' in res.headers["content-disposition"]

    doc = res.json()
    assert doc["seed"] == run.random_seed and doc["source"]["run_id"] == run.id
    spec = read_spec(doc)
    outcome = simulate(spec.case, spec.params, seed=spec.seed, vehicle=spec.vehicle)
    stored = _raw(run.id)
    assert outcome.frames == stored["frames"] and outcome.metrics == stored["metrics"]


@pytest.mark.asyncio
async def test_carla_runs_go_through_the_simulator_subprocess(client, engineer, use_simulator, tmp_path):
    use_simulator("carla")
    runs = _runs(await _family(client, engineer))

    assert runs and {r.status for r in runs} == {"COMPLETED"}
    assert {r.carla_version for r in runs} == {"carla-0.9.15"}
    with engine().connect() as conn:
        artifacts = conn.execute(select(t.simulation_artifacts)).all()
    assert {a.artifact_type for a in artifacts} == {"RESULT_JSON"} and len(artifacts) == len(runs)
    for run in runs:
        folder = tmp_path / "data" / "runs" / str(run.id)
        assert (folder / "bundle.json").exists() and (folder / "result.json").exists()
        spec = read_spec(json.loads((folder / "bundle.json").read_text(encoding="utf-8")))
        expected = simulate(spec.case, spec.params, seed=spec.seed, vehicle=spec.vehicle)
        assert _raw(run.id)["metrics"] == expected.metrics


@pytest.mark.asyncio
async def test_regression_never_pairs_kinematic_with_carla(client, engineer, use_simulator):
    scenario_id = await _family(client, engineer)  # baseline chạy bằng bộ động học
    ctx = (await client.get(f"{API}/context", headers=engineer["headers"])).json()
    candidate = await client.post(
        f"{API}/aeb/versions",
        json={"parent_version_id": ctx["system"]["baseline"]["id"], "label": "v1.1", "values": {"TTC_THRESHOLD": 1.8}},
        headers=engineer["headers"],
    )
    assert candidate.status_code == 201, candidate.text

    use_simulator("carla")
    res = await client.post(
        f"{API}/regression",
        json={"candidate_version_id": candidate.json()["id"], "scenario_id": scenario_id},
        headers=engineer["headers"],
    )
    assert res.status_code == 201, res.text

    by_id = {r.id: r for r in _runs(scenario_id)}
    pairs = [(by_id[r.baseline_run_id], r) for r in by_id.values() if r.purpose == "REGRESSION"]
    assert len(pairs) == len(TINY_FAMILY["ego_speeds_kmh"])
    for baseline, candidate_run in pairs:
        assert baseline.carla_version == candidate_run.carla_version == "carla-0.9.15"
        assert baseline.random_seed == candidate_run.random_seed
    # Baseline động học cũ vẫn còn, chỉ không được ghép cặp.
    assert any(r.carla_version == "vehicsim-kinematic-1.0" for r in by_id.values())


@pytest.mark.asyncio
async def test_carla_mode_without_a_command_is_rejected(client, engineer, use_simulator):
    use_simulator("carla", command=False)
    res = await client.post(f"{API}/families", json=TINY_FAMILY, headers=engineer["headers"])
    assert res.status_code == 400 and "VEHICSIM_CARLA_COMMAND" in res.json()["detail"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("fake_args", "message"),
    [
        (("--exit-code", "3"), "giả lập server sập"),
        (("--report-version", "0.9.16"), "yêu cầu carla-0.9.15"),
    ],
    ids=["simulator-crash", "other-carla-version"],
)
async def test_simulator_failure_marks_only_that_run_failed(client, engineer, use_simulator, fake_args, message):
    use_simulator("carla", *fake_args)
    runs = _runs(await _family(client, engineer))

    assert runs and {r.status for r in runs} == {"FAILED"}
    assert all(message in (r.error_message or "") for r in runs)
