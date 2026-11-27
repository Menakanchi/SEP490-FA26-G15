import assert from "node:assert/strict";
import test from "node:test";
import { loadProduction } from "./helpers/load-production.mjs";
const { readSavedSelection, sameSavedSelection } = await loadProduction("components/analysis/analysisSnapshotData.ts");
// Synthetic wire boundary fixture; no physics/eligibility/production readiness claim.
const aggregate = { rms_jerk_mps3: { value: null }, impact_speed_mps: { value: 0 }, stopping_distance_m: { value: null } };
const fixture = () => ({ schema: "vehicsim.analysis-dataset/v2", id: 91,
  scenario: { id: 1, name: "Wire fixture" }, baseline: { id: 7, label: "Recorded" }, reference: {}, evaluation: { version: "adr040-stored-aggregation/1" },
  runs: [{ run_id: 1, revision: "a", seed: 4, metrics: { rms_jerk_mps3: null, impact_speed_mps: null, stopping_distance_m: null } }, { run_id: 2, revision: "b", seed: 5, metrics: {} }],
  optimization_run_ids: [1], validation_run_ids: [2], optimization_objectives: structuredClone(aggregate), validation_objectives: structuredClone(aggregate) });

test("archive read keeps producer nulls/zero and absent currentness flags without granting readiness", () => {
  const raw = fixture(), before = JSON.stringify(raw), result = readSavedSelection(raw, 91);
  assert.equal(result, raw); assert.equal(JSON.stringify(raw), before);
  assert.equal(result.runs[0].metrics.impact_speed_mps, null);
  assert.equal(result.optimization_objectives.impact_speed_mps.value, 0);
  assert.equal(result.baseline_current, undefined); assert.equal(result.handoff_ready, undefined);
});
test("wrong identity/schema and incomplete partition payloads cannot become a reviewable snapshot", () => {
  assert.throws(() => readSavedSelection(fixture(), 92));
  for (const raw of [null, {}, { ...fixture(), schema: "unrecognized" }, { ...fixture(), runs: null }, { ...fixture(), validation_objectives: null }, { ...fixture(), runs: [], optimization_run_ids: [], validation_run_ids: [] },
    { ...fixture(), validation_run_ids: [1] }, { ...fixture(), validation_run_ids: [3] }, { ...fixture(), runs: [fixture().runs[0], fixture().runs[0]] }])
    assert.throws(() => readSavedSelection(raw));
  assert.throws(() => readSavedSelection({ schema: "vehicsim.analysis-dataset/v1" }), /lưu trữ/);
});
test("handoff comparison tolerates object key order and response flags, without modifying payload", () => {
  const raw = fixture(), checked = { handoff_ready: true, baseline_current: true, dataset_digest: "a".repeat(64), ...Object.fromEntries(Object.entries(raw).reverse()) };
  assert.equal(sameSavedSelection(readSavedSelection(raw), readSavedSelection(checked)), true);
  assert.equal(raw.handoff_ready, undefined);
});
test("changed cohort, role, source revision, metric, seed or manifest invalidates the checked snapshot association", () => {
  const a = readSavedSelection(fixture());
  for (const field of ["revision", "seed", "metrics"]) {
    const b = fixture(); b.runs[0][field] = field === "metrics" ? { impact_speed_mps: 2 } : "changed";
    assert.equal(sameSavedSelection(a, readSavedSelection(b)), false, field);
  }
  for (const b of [{ ...fixture(), optimization_run_ids: [2], validation_run_ids: [1] }, { ...fixture(), manifests: [{ run_id: 1, artifact_digest: "changed" }] }])
    assert.equal(sameSavedSelection(a, readSavedSelection(b)), false);
});
