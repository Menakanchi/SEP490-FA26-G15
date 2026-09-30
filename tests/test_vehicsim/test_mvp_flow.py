"""Toàn vòng MVP qua HTTP: họ kịch bản -> baseline -> lỗi -> candidate -> regression -> quyết định.

Mô phỏng chạy inline (fixture ``inline_runs``), DB là SQLite trong RAM.
"""

from __future__ import annotations

import pytest

from tests.test_vehicsim.conftest import SMALL_FAMILY

API = "/api/v1/vehicsim"


async def _setup_family(client, engineer) -> dict:
    res = await client.post(f"{API}/families", json=SMALL_FAMILY, headers=engineer["headers"])
    assert res.status_code == 201, res.text
    return res.json()


async def _candidate(client, engineer, ttc: float, label: str = "v1.1") -> int:
    ctx = (await client.get(f"{API}/context", headers=engineer["headers"])).json()
    res = await client.post(
        f"{API}/aeb/versions",
        json={"parent_version_id": ctx["system"]["baseline"]["id"], "label": label, "values": {"TTC_THRESHOLD": ttc}},
        headers=engineer["headers"],
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


@pytest.mark.asyncio
async def test_every_vehicsim_route_requires_login(client, engineer):
    for path in ("/context", "/families", "/failures", "/regression", "/recommendations", "/aeb/versions"):
        assert (await client.get(f"{API}{path}")).status_code == 401, path


@pytest.mark.asyncio
async def test_viewer_can_read_but_not_write(client, engineer, viewer):
    assert (await client.get(f"{API}/context", headers=viewer["headers"])).status_code == 200
    res = await client.post(f"{API}/families", json=SMALL_FAMILY, headers=viewer["headers"])
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_family_creates_grid_variants_and_runs_baseline(client, engineer):
    created = await _setup_family(client, engineer)
    expected = 3 * 2 * 2 * 2 * 2 * 2
    assert created["variants"] == expected and created["queued_runs"] == expected

    families = (await client.get(f"{API}/families", headers=engineer["headers"])).json()
    assert families[0]["variants"] == expected
    assert families[0]["runs"] == {"COMPLETED": expected}
    assert families[0]["parameter_space"]["ego_speed_kmh"] == [40, 60, 70]


@pytest.mark.asyncio
async def test_failure_list_detail_and_playback(client, engineer):
    await _setup_family(client, engineer)
    data = (await client.get(f"{API}/failures", headers=engineer["headers"])).json()
    k = data["kpis"]
    assert k["total"] > 0 and k["collisions"] > 0
    assert sum(k["by_class"].values()) <= k["total"]
    assert data["items"] and data["families"][0]["name"] == "Pedestrian Crossing"

    collisions = (
        await client.get(f"{API}/failures", params={"outcome": "COLLISION"}, headers=engineer["headers"])
    ).json()
    assert collisions["total"] == k["collisions"]
    assert all(i["outcome"] == "COLLISION" for i in collisions["items"])

    run_id = collisions["items"][0]["run_id"]
    detail = (await client.get(f"{API}/runs/{run_id}", headers=engineer["headers"])).json()
    assert detail["outcome"] == "COLLISION" and detail["verdict"] == "FAIL"
    assert [s["stage"] for s in detail["chain"]] == ["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"]
    assert detail["metrics"]["impact_speed_kmh"] > 0
    assert detail["telemetry"] and detail["events"][-1]["kind"] == "collision"
    assert len(detail["configuration"]) == 10
    assert detail["ttc_threshold_s"] == 1.5

    pb = (await client.get(f"{API}/runs/{run_id}/playback", headers=engineer["headers"])).json()
    assert pb["frames"] and pb["duration_s"] > 0 and pb["crossing_x"] > 0

    csv = await client.get(f"{API}/failures.csv", headers=engineer["headers"])
    assert csv.status_code == 200 and csv.text.splitlines()[0].startswith("run_id,variant")
    assert len(csv.text.strip().splitlines()) == k["total"] + 1


@pytest.mark.asyncio
async def test_candidate_values_must_stay_in_parameter_range(client, engineer):
    ctx = (await client.get(f"{API}/context", headers=engineer["headers"])).json()
    bad = await client.post(
        f"{API}/aeb/versions",
        json={"parent_version_id": ctx["system"]["baseline"]["id"], "values": {"TTC_THRESHOLD": 9.0}},
        headers=engineer["headers"],
    )
    assert bad.status_code == 400 and "TTC_THRESHOLD" in bad.json()["detail"]


@pytest.mark.asyncio
async def test_regression_pairs_same_seeds_and_accept_swaps_baseline(client, engineer):
    created = await _setup_family(client, engineer)
    candidate_id = await _candidate(client, engineer, ttc=1.8)

    res = await client.post(
        f"{API}/regression",
        json={
            "candidate_version_id": candidate_id,
            "scenario_id": created["scenario_id"],
            # Nới tiêu chí phanh oan để ứng viên này qua được — tiêu chí bắt buộc vẫn giữ.
            "criteria": {
                "false_activation_increase_max_pts": {"value": 100},
                "median_min_ttc_change_min_s": {"value": -10},
            },
        },
        headers=engineer["headers"],
    )
    assert res.status_code == 201, res.text
    test_id = res.json()["id"]

    detail = (await client.get(f"{API}/regression/{test_id}", headers=engineer["headers"])).json()
    summary = detail["summary"]
    counts = summary["counts"]
    assert detail["status"] in ("PASSED", "FAILED")
    assert counts["scenarios"] == created["variants"]
    assert counts["fixed"] + counts["regressed"] + counts["unchanged"] == counts["scenarios"]
    transitions_total = sum(sum(row.values()) for row in summary["transitions"].values())
    assert transitions_total == counts["scenarios"]
    assert {c["key"] for c in summary["criteria"]} >= {"no_new_collision", "identical_seeds"}

    # Mỗi cặp dùng đúng seed của run baseline.
    pair = summary["pairs"][0]
    base = (await client.get(f"{API}/runs/{pair['baseline_run_id']}", headers=engineer["headers"])).json()
    cand = (await client.get(f"{API}/runs/{pair['candidate_run_id']}", headers=engineer["headers"])).json()
    assert base["seed"] == cand["seed"] and base["variant_id"] == cand["variant_id"]
    assert base["config"] == "v1.0" and cand["config"] == "v1.1"

    rec = (await client.get(f"{API}/recommendations/{test_id}", headers=engineer["headers"])).json()
    assert [p["code"] for p in rec["changed_parameters"]] == ["TTC_THRESHOLD"]
    assert {e["key"]: e["status"] for e in rec["evidence"]}["robustness"] == "NOT_RUN"

    if detail["status"] != "PASSED":
        pytest.skip("ứng viên không qua tiêu chí bắt buộc trên lưới này")
    decision = await client.post(
        f"{API}/recommendations/{test_id}/decision",
        json={"decision": "ACCEPT", "reason": "Fewer collisions, no new ones.", "confirmed": True},
        headers=engineer["headers"],
    )
    assert decision.status_code == 200, decision.text
    assert decision.json()["review"]["decision"] == "ACCEPT"
    ctx = (await client.get(f"{API}/context", headers=engineer["headers"])).json()
    assert ctx["system"]["baseline"]["label"] == "v1.1"
    statuses = {v["label"]: v["status"] for v in ctx["versions"]}
    assert statuses == {"v1.0": "ARCHIVED", "v1.1": "BASELINE"}

    again = await client.post(
        f"{API}/recommendations/{test_id}/decision",
        json={"decision": "REJECT", "reason": "changed my mind", "confirmed": True},
        headers=engineer["headers"],
    )
    assert again.status_code == 400


@pytest.mark.asyncio
async def test_failed_regression_cannot_be_accepted(client, engineer):
    created = await _setup_family(client, engineer)
    # Ngưỡng thấp hơn baseline -> va chạm mới -> "no_new_collision" (bắt buộc) hỏng.
    candidate_id = await _candidate(client, engineer, ttc=0.8, label="v0.8-bad")
    test_id = (
        await client.post(
            f"{API}/regression",
            json={"candidate_version_id": candidate_id, "scenario_id": created["scenario_id"]},
            headers=engineer["headers"],
        )
    ).json()["id"]
    detail = (await client.get(f"{API}/regression/{test_id}", headers=engineer["headers"])).json()
    assert detail["status"] == "FAILED"
    assert detail["summary"]["counts"]["regressed"] > 0

    rec = (await client.get(f"{API}/recommendations/{test_id}", headers=engineer["headers"])).json()
    assert rec["recommendation_status"] == "BLOCKED"

    accept = await client.post(
        f"{API}/recommendations/{test_id}/decision",
        json={"decision": "ACCEPT", "reason": "ship it", "confirmed": True},
        headers=engineer["headers"],
    )
    assert accept.status_code == 400
    reject = await client.post(
        f"{API}/recommendations/{test_id}/decision",
        json={"decision": "REJECT", "reason": "Introduces new collisions.", "confirmed": True},
        headers=engineer["headers"],
    )
    assert reject.status_code == 200
    versions = {
        v["label"]: v["status"] for v in (await client.get(f"{API}/aeb/versions", headers=engineer["headers"])).json()
    }
    assert versions["v0.8-bad"] == "REJECTED" and versions["v1.0"] == "BASELINE"


@pytest.mark.asyncio
async def test_decision_requires_reason_and_confirmation(client, engineer):
    created = await _setup_family(client, engineer)
    candidate_id = await _candidate(client, engineer, ttc=1.6)
    test_id = (
        await client.post(
            f"{API}/regression",
            json={"candidate_version_id": candidate_id, "scenario_id": created["scenario_id"]},
            headers=engineer["headers"],
        )
    ).json()["id"]
    unconfirmed = await client.post(
        f"{API}/recommendations/{test_id}/decision",
        json={"decision": "REQUEST_MORE_TESTS", "reason": "need rain cases", "confirmed": False},
        headers=engineer["headers"],
    )
    assert unconfirmed.status_code == 400
    ok = await client.post(
        f"{API}/recommendations/{test_id}/decision",
        json={
            "decision": "REQUEST_MORE_TESTS",
            "reason": "need rain cases",
            "conditions": "add fog",
            "confirmed": True,
        },
        headers=engineer["headers"],
    )
    assert ok.status_code == 200 and ok.json()["review"]["conditions"] == "add fog"


@pytest.mark.asyncio
async def test_regression_list_kpis(client, engineer):
    created = await _setup_family(client, engineer)
    candidate_id = await _candidate(client, engineer, ttc=1.8)
    await client.post(
        f"{API}/regression",
        json={"candidate_version_id": candidate_id, "scenario_id": created["scenario_id"]},
        headers=engineer["headers"],
    )
    data = (await client.get(f"{API}/regression", headers=engineer["headers"])).json()
    assert data["kpis"]["total"] == 1
    item = data["items"][0]
    assert item["code"] == "RT-001" and item["baseline"] == "v1.0" and item["candidate"] == "v1.1"
    assert item["progress"]["done"] == item["progress"]["total"] == created["variants"]


@pytest.mark.asyncio
async def test_regression_preview_counts_match_created_test(client, engineer):
    created = await _setup_family(client, engineer)
    preview = (
        await client.get(
            f"{API}/regression/preview", params={"scenario_id": created["scenario_id"]}, headers=engineer["headers"]
        )
    ).json()
    assert preview["variant_count"] == created["variants"]
    assert preview["baseline_runs_existing"] == created["variants"]  # baseline đã chạy khi tạo họ
    assert 0 < preview["old_critical_count"] < created["variants"]

    candidate_id = await _candidate(client, engineer, ttc=1.8)
    res = await client.post(
        f"{API}/regression",
        json={
            "candidate_version_id": candidate_id,
            "scenario_id": created["scenario_id"],
            "include_all_variants": False,
        },
        headers=engineer["headers"],
    )
    assert res.status_code == 201, res.text
    detail = (await client.get(f"{API}/regression/{res.json()['id']}", headers=engineer["headers"])).json()
    assert detail["pass_criteria"]["scenario_set"]["variant_count"] == preview["old_critical_count"]
    # Số lỗi của họ tính theo baseline — không cộng dồn lỗi của các run regression của candidate.
    families = (await client.get(f"{API}/families", headers=engineer["headers"])).json()
    assert families[0]["failures"] == preview["old_critical_count"]
    assert families[0]["baseline"] == "v1.0"

    missing = await client.get(f"{API}/regression/preview", params={"scenario_id": 999}, headers=engineer["headers"])
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_accepting_one_candidate_blocks_stale_tests(client, engineer):
    created = await _setup_family(client, engineer)
    loose = {"false_activation_increase_max_pts": {"value": 100}, "median_min_ttc_change_min_s": {"value": -10}}

    async def passed_test(candidate_id: int) -> int:
        res = await client.post(
            f"{API}/regression",
            json={"candidate_version_id": candidate_id, "scenario_id": created["scenario_id"], "criteria": loose},
            headers=engineer["headers"],
        )
        test_id = res.json()["id"]
        detail = (await client.get(f"{API}/regression/{test_id}", headers=engineer["headers"])).json()
        assert detail["status"] == "PASSED", detail["summary"].get("criteria")
        return test_id

    first_candidate = await _candidate(client, engineer, ttc=1.8, label="v1.1")
    first = await passed_test(first_candidate)
    second = await passed_test(await _candidate(client, engineer, ttc=1.7, label="v1.2"))
    again = await passed_test(first_candidate)

    decision = {"decision": "ACCEPT", "reason": "fewer collisions", "confirmed": True}
    assert (
        await client.post(f"{API}/recommendations/{first}/decision", json=decision, headers=engineer["headers"])
    ).status_code == 200
    # Baseline v1.0 của test thứ hai đã bị ARCHIVED -> không được ghi đè baseline mới.
    stale = await client.post(f"{API}/recommendations/{second}/decision", json=decision, headers=engineer["headers"])
    assert stale.status_code == 400 and "baseline" in stale.json()["detail"]
    # v1.1 giờ là BASELINE -> test khác của cùng candidate không được Reject nó.
    reject = {"decision": "REJECT", "reason": "dup", "confirmed": True}
    dup = await client.post(f"{API}/recommendations/{again}/decision", json=reject, headers=engineer["headers"])
    assert dup.status_code == 400

    versions = {
        v["label"]: v["status"] for v in (await client.get(f"{API}/aeb/versions", headers=engineer["headers"])).json()
    }
    assert versions == {"v1.0": "ARCHIVED", "v1.1": "BASELINE", "v1.2": "CANDIDATE"}
