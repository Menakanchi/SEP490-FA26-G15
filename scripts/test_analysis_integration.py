"""Integration smoke against the disposable analysis-test MySQL/Redis and backend :8101.

Creates only test-domain accounts and executes the shared Java kinematic runner.
Never points at the developer's MySQL container or changes real account data.
Requires isolated containers named vehicsim-analysis-mysql-test / -redis-test.
"""
import json
import subprocess
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = "http://127.0.0.1:8101/api/v1"
CONTAINER = "vehicsim-analysis-mysql-test"
EMAIL = "analysis-integration@example.invalid"
PASSWORD = "Analysis-test-only-2026!"
ROOT = Path(__file__).resolve().parents[1]


def sql(statement):
    return subprocess.check_output(
        ["docker", "exec", "-i", CONTAINER, "mysql", "-uroot", "-N", "vehicsim"],
        input=statement+";\n", text=True, encoding="utf-8",
    ).strip()


def call(path, body=None, token=None, expected=200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        with urlopen(request, timeout=90) as response:
            status, value = response.status, json.load(response)
    except HTTPError as error:
        status, value = error.code, json.load(error)
    assert status == expected, (path, status, value.get("detail", "unexpected response") if isinstance(value, dict) else "unexpected response")
    return value


def main():
    # Safety guard: this script is intentionally tied to the disposable container/port.
    assert "13316" in subprocess.check_output(["docker", "port", CONTAINER, "3306"], text=True)
    call("/vehicsim/analysis/runs", expected=401)
    existing = sql("SELECT COUNT(*) FROM users WHERE email='analysis-integration@example.invalid'")
    if existing == "0":
        call("/auth/register", {"email": EMAIL, "password": PASSWORD, "lastName": "Analysis", "firstName": "Integration"}, expected=200)
    sql("UPDATE users SET role_id=(SELECT id FROM roles WHERE code='ADMIN') WHERE email='analysis-integration@example.invalid'")
    token = call("/auth/login", {"email": EMAIL, "password": PASSWORD})["access_token"]
    call("/vehicsim/bootstrap", {}, token)
    family = call("/vehicsim/families", {
        "name": "Analysis integration CP crossing",
        "ego_speeds_kmh": [20, 40, 60],
        "trigger_distances_m": [15, 30, 50],  # 20 km/h + 60 m không tới vạch trong 12 s (FamilySpec.unreachablePairs)
        "pedestrian_speeds_mps": [1.4],
        "stops_at_curb": [False, True],
        "weathers": ["CLEAR"], "times_of_day": ["DAY"], "run_baseline": True,
    }, token, 201)
    scenario = family["scenario_id"]
    dashboard = call(f"/vehicsim/analysis/runs?scenario_id={scenario}&page_size=100", token=token)
    assert dashboard["total"] == 18, dashboard
    runs = dashboard["items"]
    assert all(run["status"] == "COMPLETED" and run["trace_available"] for run in runs)
    safe = [run for run in runs if run["outcome"] == "SAFE"]
    assert len(safe) >= 2, dashboard["counts"]
    optimization = [safe[0]]
    validation = [safe[1]]
    # Each subset includes a brake-phase observation as well as a safe case.
    for target in (optimization, validation):
        excluded = {run["run_id"] for run in optimization + validation}
        if not any(run["metrics"]["rms_jerk_mps3"] is not None for run in target):
            extra = next(run for run in runs if run["run_id"] not in excluded and run["metrics"]["rms_jerk_mps3"] is not None)
            target.append(extra)
    selected = optimization + validation
    payload = {
        "scenario_id": scenario, "baseline_id": selected[0]["baseline_id"],
        "optimization_run_ids": [run["run_id"] for run in optimization],
        "validation_run_ids": [run["run_id"] for run in validation],
        "run_revisions": {str(run["run_id"]): run["revision"] for run in selected},
    }
    # Unknown/missing run, stale preview and overlapping sets must not be saved.
    bad = {**payload, "run_revisions": {}}
    call("/vehicsim/analysis/selections", bad, token, 400)
    bad = {**payload, "validation_run_ids": payload["optimization_run_ids"]}
    call("/vehicsim/analysis/selections", bad, token, 400)
    saved = call("/vehicsim/analysis/selections", payload, token)
    dataset_id = saved["id"]
    loaded = call(f"/vehicsim/analysis/datasets/{dataset_id}", token=token)
    handed = call(f"/vehicsim/analysis/datasets/{dataset_id}/handoff", token=token)
    assert handed["runs"] == loaded["runs"]
    assert handed["optimization_run_ids"] == payload["optimization_run_ids"]
    assert handed["validation_run_ids"] == payload["validation_run_ids"]
    # Check expected aggregate against the actual recorded values, including no-collision objective zero.
    expected_impact = sum(run["metrics"]["impact_speed_mps"] or 0 for run in optimization) / len(optimization)
    assert abs(handed["optimization_objectives"]["impact_speed_mps"]["value"] - expected_impact) < 1e-9
    detail = call(f"/vehicsim/analysis/runs/{selected[0]['run_id']}", token=token)
    assert detail["detail"]["motion_telemetry"]
    playback = call(f"/vehicsim/runs/{selected[0]['run_id']}/playback", token=token)
    assert playback["motion_telemetry"]
    assert playback["duration_s"] == playback["frames"][-1]["t"]
    # Run baseline again through RunService: original dataset must keep its original run IDs and seeds.
    call(f"/vehicsim/families/{scenario}/run", {}, token, 202)
    reloaded = call(f"/vehicsim/analysis/datasets/{dataset_id}/handoff", token=token)
    assert reloaded["runs"] == handed["runs"]
    all_runs = call(f"/vehicsim/analysis/runs?scenario_id={scenario}&page_size=100", token=token)["items"]
    duplicate = next(run for run in all_runs if run["scenario_version_id"] == optimization[0]["scenario_version_id"]
                     and run["run_id"] != optimization[0]["run_id"])
    duplicate_payload = {**payload,
        "optimization_run_ids": payload["optimization_run_ids"] + [duplicate["run_id"]],
        "run_revisions": {**payload["run_revisions"], str(duplicate["run_id"]): duplicate["revision"]}}
    call("/vehicsim/analysis/selections", duplicate_payload, token, 400)
    failure = next(run for run in runs if run["outcome"] == "COLLISION")
    failure_detail = call(f"/vehicsim/analysis/runs/{failure['run_id']}", token=token)["detail"]
    assert failure_detail["chain"] and len(failure_detail["stage_evidence"]) == 4
    filtered = call(f"/vehicsim/analysis/runs?scenario_id={scenario}&status=FAILED&page_size=100", token=token)
    assert filtered["total"] == 0 and sum(filtered["counts"].values()) == 0

    # Seed lifecycle fixtures in the disposable DB only; these are not simulated outcomes.
    fixture_id = runs[-1]["run_id"]
    original = sql(f"SELECT status FROM simulation_runs WHERE id={fixture_id}")
    for status, end_reason, expected in [("STOPPED", "ERROR", "CANCELLED"), ("FAILED", "ERROR", "ERROR"), ("COMPLETED", "TIMEOUT", "TIMEOUT")]:
        old_reason = sql(f"SELECT end_reason FROM simulation_runs WHERE id={fixture_id}")
        sql(f"UPDATE simulation_runs SET status='{status}',end_reason='{end_reason}' WHERE id={fixture_id}")
        state = call(f"/vehicsim/analysis/runs/{fixture_id}", token=token)
        assert state["run"]["outcome"] == expected, state
        sql(f"UPDATE simulation_runs SET status='{original}',end_reason='{old_reason}' WHERE id={fixture_id}")

    # Verify content-digest invalidation without losing any real evidence (transactional fixture restore).
    source_id = selected[0]["run_id"]
    backup = subprocess.Popen(
        ["docker", "exec", "-i", CONTAINER, "mysql", "-uroot", "-N", "--unbuffered", "vehicsim"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8",
    )
    def statement(text, marker):
        backup.stdin.write(text + "; SELECT '" + marker + "';\n")
        backup.stdin.flush()
        while True:
            line = backup.stdout.readline()
            assert line, "backup SQL session closed unexpectedly"
            if line.strip() == marker:
                return
    statement(f"SET @analysis_saved_trace=(SELECT telemetry_json FROM simulation_runs WHERE id={source_id}); "
              f"UPDATE simulation_runs SET telemetry_json=JSON_SET(telemetry_json,'$.frames',JSON_ARRAY()) WHERE id={source_id}", "MUTATED")
    try:
        call(f"/vehicsim/analysis/datasets/{dataset_id}/handoff", token=token, expected=400)
        missing_trace = call(f"/vehicsim/analysis/runs/{source_id}", token=token)
        assert missing_trace["run"]["outcome"] == "INCOMPLETE"
    finally:
        statement(f"UPDATE simulation_runs SET telemetry_json=@analysis_saved_trace WHERE id={source_id}", "RESTORED")
        backup.stdin.close()
        assert backup.wait(timeout=10) == 0
    call(f"/vehicsim/analysis/datasets/{dataset_id}/handoff", token=token)
    evidence = {"scenario_id": scenario, "dataset_id": dataset_id,
                "run_ids": [run["run_id"] for run in selected], "failure_run_id": failure["run_id"], "selection": payload,
                "counts": dashboard["counts"], "evaluation": handed["evaluation"],
                "tests": ["schema009", "real_kinematic_baseline", "filters", "metrics",
                          "selection", "snapshot_after_new_runs", "lifecycle_fixtures", "missing_artifact_guard", "failure_chain", "duplicate_variant_seed_guard"]}
    output = ROOT / "data" / "analysis-integration"
    output.mkdir(parents=True, exist_ok=True)
    (output / "evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "sample-playback.json").write_text(json.dumps(playback, ensure_ascii=False), encoding="utf-8")
    print("PASS: real backend/MySQL integration, baseline runs, metrics, immutable split and invalid-data guards")
    print(json.dumps({"scenario_id": scenario, "dataset_id": dataset_id, "counts": dashboard["counts"]}))


if __name__ == "__main__":
    main()
