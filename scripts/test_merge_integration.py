"""Live integration between analysis dataset v2 and layered regression/review.

Requires the disposable analysis-test services on MySQL :13316 and backend :8101.
Run test_analysis_integration.py first. All accounts and data are test fixtures.
This test deliberately Accepts a candidate in that disposable database.
"""
import csv
import io
import json
import subprocess
import time
from urllib.request import Request, urlopen

from test_analysis_integration import BASE, CONTAINER, EMAIL, PASSWORD, ROOT, call, sql

REVIEWER_EMAIL = "merge-reviewer@example.invalid"
REVIEWER_PASSWORD = "Merge-review-fixture-2026!"


def guard(evidence):
    assert BASE == "http://127.0.0.1:8101/api/v1"
    assert CONTAINER == "vehicsim-analysis-mysql-test"
    ports = subprocess.check_output(["docker", "port", CONTAINER, "3306"], text=True)
    assert ports.splitlines() and all(line.endswith(":13316") for line in ports.splitlines()), "Disposable MySQL port required"
    assert EMAIL.endswith("@example.invalid") and REVIEWER_EMAIL.endswith("@example.invalid")
    owner = sql("SELECT u.email FROM analysis_results a JOIN users u ON u.id=a.created_by_user_id "
                f"WHERE a.id={int(evidence['dataset_id'])} AND a.scenario_id={int(evidence['scenario_id'])}")
    assert owner == EMAIL, "Analysis fixture must belong to disposable test account"


def reviewer_token():
    if sql(f"SELECT COUNT(*) FROM users WHERE email='{REVIEWER_EMAIL}'") == "0":
        call("/auth/register", {"email": REVIEWER_EMAIL, "password": REVIEWER_PASSWORD,
                               "lastName": "Merge", "firstName": "Reviewer"})
    sql("UPDATE users SET role_id=(SELECT id FROM roles WHERE code='REVIEWER') "
        f"WHERE email='{REVIEWER_EMAIL}'")
    return call("/auth/login", {"email": REVIEWER_EMAIL, "password": REVIEWER_PASSWORD})["access_token"]


def csv_export(test_id, token):
    request = Request(BASE + f"/vehicsim/regression/{test_id}/export.csv",
                      headers={"Authorization": "Bearer " + token})
    with urlopen(request, timeout=30) as response:
        assert response.status == 200
        assert "text/csv" in response.headers["Content-Type"]
        return response.read().decode("utf-8")


def completed(test_id, token):
    deadline = time.monotonic() + 90
    while True:
        result = call(f"/vehicsim/regression/{test_id}", token=token)
        if result["status"] not in ("RUNNING", "PENDING"):
            assert result["status"] == "PASSED", f"Parity regression {test_id} was not PASSED"
            return result
        assert time.monotonic() < deadline, "Regression did not complete"
        time.sleep(0.25)


def main():
    output = ROOT / "data" / "analysis-integration"
    evidence = json.loads((output / "evidence.json").read_text(encoding="utf-8"))
    guard(evidence)
    token = call("/auth/login", {"email": EMAIL, "password": PASSWORD})["access_token"]
    reviewer = reviewer_token()
    scenario_id, dataset_id = evidence["scenario_id"], evidence["dataset_id"]
    frozen = call(f"/vehicsim/analysis/datasets/{dataset_id}/handoff", token=token)
    baseline_id = frozen["baseline"]["id"]
    validation_ids = set(frozen["validation_run_ids"])
    selected = [run for run in frozen["runs"] if run["run_id"] in validation_ids]
    variant_ids = [run["scenario_version_id"] for run in selected]
    assert len(variant_ids) == len(set(variant_ids)) and any(run["outcome"] == "SAFE" for run in selected)
    query = "&".join(f"variant_ids={variant}" for variant in variant_ids)
    preview = call(f"/vehicsim/regression/preview?scenario_id={scenario_id}&include_variants=true&{query}", token=token)
    assert preview["selected_count"] == len(variant_ids)
    assert preview["selected_safe_count"] >= 1
    assert preview["selected_baseline_runs_existing"] == len(variant_ids)

    baseline = next(version for version in call("/vehicsim/aeb/versions", token=token)
                    if version["id"] == baseline_id)
    parameters = baseline["parameters"]
    # Production correctly disallows a candidate identical to its immediate parent.
    # Use a valid intermediate parent, then restore the original values in children:
    # their values match the baseline exactly without bypassing application rules.
    context = call("/vehicsim/context", token=token)
    catalog = context["parameters"]
    ttc_catalog = next(item for item in catalog if item["code"] == "TTC_THRESHOLD")
    delta = 0.0001 if parameters["TTC_THRESHOLD"] + 0.0001 <= ttc_catalog["max_value"] else -0.0001
    changed = {**parameters, "TTC_THRESHOLD": round(parameters["TTC_THRESHOLD"] + delta, 4)}
    parent = call("/vehicsim/aeb/versions", {
        "parent_version_id": baseline_id, "label": "Merge integration intermediate",
        "values": changed, "notes": "Disposable fixture; never submitted for approval",
    }, token, 201)["id"]

    def candidate(label):
        return call("/vehicsim/aeb/versions", {
            "parent_version_id": parent, "label": label, "values": parameters,
            "notes": "Disposable exact-baseline parity fixture",
        }, token, 201)["id"]

    def regression(candidate_id):
        created = call("/vehicsim/regression", {
            "candidate_version_id": candidate_id, "scenario_id": scenario_id,
            "variant_ids": variant_ids, "include_old_critical": False, "include_all_variants": False,
            "name": "Merged analysis validation set parity",
        }, token, 201)
        detail = completed(created["id"], token)
        assert detail["baseline"]["id"] == baseline_id and detail["candidate"]["id"] == candidate_id
        assert detail["pass_criteria"]["scenario_set"]["mode"] == "custom"
        assert set(detail["pass_criteria"]["scenario_set"]["variant_ids"]) == set(variant_ids)
        assert detail["summary"]["counts"]["regressed"] == 0
        assert detail["summary"]["counts"]["new_collisions"] == 0
        assert all(not parameter["changed"] for parameter in detail["parameter_diff"])
        pairs = detail["summary"]["pairs"]
        assert len(pairs) == len(variant_ids) and {pair["variant_id"] for pair in pairs} == set(variant_ids)
        invalid = sql("SELECT COUNT(*) FROM simulation_runs c JOIN simulation_runs b ON b.id=c.baseline_run_id "
                      f"WHERE c.regression_test_id={created['id']} AND (c.random_seed<>b.random_seed "
                      "OR c.scenario_version_id<>b.scenario_version_id OR c.carla_vehicle_model_id<>b.carla_vehicle_model_id "
                      "OR c.simulator_version<>b.simulator_version OR c.fixed_delta_seconds<>b.fixed_delta_seconds "
                      "OR c.status<>'COMPLETED' OR b.status<>'COMPLETED')")
        assert invalid == "0", "Regression pairing identity mismatch"
        assert sql(f"SELECT COUNT(*) FROM simulation_runs WHERE regression_test_id={created['id']}") == str(len(variant_ids))
        exported = call(f"/vehicsim/regression/{created['id']}/export.json", token=token)
        assert exported["manifest"]["schema"] == "vehicsim.regression-export/v1"
        expected_seeds = {run["scenario_version_id"]: run["seed"] for run in selected}
        assert all(pair["seed"] == expected_seeds[pair["variant_id"]] for pair in exported["pairs"])
        content = csv_export(created["id"], token)
        csv_rows = list(csv.DictReader(io.StringIO(content)))
        assert len(csv_rows) == len(variant_ids)
        assert {int(row["candidate_run_id"]) for row in csv_rows} == {pair["candidate_run_id"] for pair in pairs}
        return created["id"], exported, content

    rejected_candidate = candidate("Merge integration rejection")
    rejected_test, rejected_export, rejected_csv = regression(rejected_candidate)
    decision = {"decision": "REJECT", "reason": "Disposable integration verifies explicit Reviewer rejection", "confirmed": True}
    call(f"/vehicsim/recommendations/{rejected_test}/decision", decision, expected=401)
    call(f"/vehicsim/recommendations/{rejected_test}/decision", decision, token, 403)
    call(f"/vehicsim/recommendations/{rejected_test}/decision", {**decision, "confirmed": False}, reviewer, 400)
    call(f"/vehicsim/recommendations/{rejected_test}/decision", {**decision, "reason": ""}, reviewer, 400)
    rejected = call(f"/vehicsim/recommendations/{rejected_test}/decision", decision, reviewer)
    assert rejected["review"]["decision"] == "REJECT"
    rejected_export = call(f"/vehicsim/regression/{rejected_test}/export.json", token=token)
    assert rejected_export["decision"]["status"] == "REJECT"
    assert sql(f"SELECT status FROM aeb_versions WHERE id={rejected_candidate}") == "REJECTED"
    assert call("/vehicsim/context", token=token)["system"]["baseline"]["id"] == baseline_id

    accepted_candidate = candidate("Merge integration acceptance")
    stale_candidate = candidate("Merge integration stale guard")
    accepted_test, accepted_export, accepted_csv = regression(accepted_candidate)
    stale_test, _, _ = regression(stale_candidate)
    accept = {"decision": "ACCEPT", "reason": "Disposable integration verifies parity evidence and baseline promotion", "confirmed": True}
    accepted = call(f"/vehicsim/recommendations/{accepted_test}/decision", accept, reviewer)
    assert accepted["review"]["decision"] == "ACCEPT"
    accepted_export = call(f"/vehicsim/regression/{accepted_test}/export.json", token=token)
    assert accepted_export["decision"]["status"] == "ACCEPT"
    assert call("/vehicsim/context", token=token)["system"]["baseline"]["id"] == accepted_candidate
    assert sql(f"SELECT status FROM aeb_versions WHERE id={baseline_id}") == "ARCHIVED"
    assert sql("SELECT COUNT(*) FROM aeb_versions WHERE status='BASELINE'") == "1"
    stale = call(f"/vehicsim/recommendations/{stale_test}/decision", accept, reviewer, 400)
    assert "baseline" in stale["detail"].lower()
    assert sql(f"SELECT status FROM aeb_versions WHERE id={stale_candidate}") == "CANDIDATE"
    history = call("/vehicsim/decisions", token=reviewer)
    decisions = {item["test_id"]: item["decision"] for item in history["decisions"]}
    assert decisions[rejected_test] == "REJECT" and decisions[accepted_test] == "ACCEPT"
    assert any(item["id"] == accepted_candidate and item["regression_code"] for item in history["baselines"])
    archived = call(f"/vehicsim/analysis/datasets/{dataset_id}", token=token)
    assert archived["baseline_current"] is False and archived["runs"] == frozen["runs"]
    call(f"/vehicsim/analysis/datasets/{dataset_id}/handoff", token=token, expected=400)
    for run in selected:
        call(f"/vehicsim/analysis/runs/{run['run_id']}", token=token)

    result = {
        "scenario_id": scenario_id, "dataset_id": dataset_id, "variant_ids": variant_ids,
        "previous_baseline_id": baseline_id, "new_baseline_id": accepted_candidate,
        "rejected_test_id": rejected_test, "accepted_test_id": accepted_test, "stale_test_id": stale_test,
        "tests": ["custom_variant_preview", "exact_baseline_parameter_parity", "completed_same_seed_vehicle_simulator_pairs",
                  "regression_json_export", "regression_csv_export", "reviewer_auth_and_role", "reason_and_confirmation",
                  "explicit_reject", "explicit_accept", "decision_history", "stale_baseline_guard",
                  "immutable_analysis_archive_after_accept", "stale_analysis_handoff_guard"],
    }
    (output / "merge-evidence.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (output / "merge-rejected-export.json").write_text(json.dumps(rejected_export, indent=2), encoding="utf-8")
    (output / "merge-accepted-export.json").write_text(json.dumps(accepted_export, indent=2), encoding="utf-8")
    (output / "merge-rejected-export.csv").write_text(rejected_csv, encoding="utf-8")
    (output / "merge-accepted-export.csv").write_text(accepted_csv, encoding="utf-8")
    print("PASS: merged analysis-to-regression integration, exports, Reviewer decisions and stale-baseline guards")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
