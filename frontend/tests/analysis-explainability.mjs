/** Exercise the production explanation mapper with varying API data, without calculating new metrics. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const formatUrl = moduleUrl(compile(await readFile(new URL("../src/components/analysis/analysisMetricFormat.ts", import.meta.url), "utf8")));
const code = compile(await readFile(new URL("../src/components/analysis/analysisMetricExplanationData.ts", import.meta.url), "utf8")).replace('"./analysisMetricFormat"', JSON.stringify(formatUrl));
const { metricExplanation } = await import(moduleUrl(code));
const original = { run_id: 101, scenario_id: 42, status: "COMPLETED", outcome: "COLLISION", simulator: "carla-0.9.16-xosc5",
  metrics: { metric_source: "SIMULATOR_RESULT", rms_jerk_mps3: 2.123, impact_speed_mps: 10, stopping_distance_m: 33.25,
    min_ttc_s: 0, min_distance_m: 0, max_deceleration_mps2: 2, aeb_activation_t: 0, brake_onset_t: 0.25, first_detection_t: 0 },
  environment: { category: "CP_CROSSING", road_friction: 0.65 }, scene: { vehicle_length_m: 4.8, vehicle_width_m: 2 },
  configuration: [{ code: "MAX_DECELERATION", value: 8 }, { code: "BRAKE_ACTIVATION_DELAY", value: 0.15 }],
  events: [{ kind: "stopped", t: 1 }, { kind: "collision", t: NaN }],
  stage_evidence: [{ stage: "CONTROL", values: { response_time_s: 0.25 } }] };
const run = { run_id: 101, dt: 0.01 };

test("TTC method and geometry follow explicit API category, never the scene/name", () => {
  assert.match(metricExplanation("ttc", original, run).formula, /gap \/ v_ego;/);
  assert.match(metricExplanation("separation", original, run).formula, /r = 0,30 m/);
  for (const category of ["CCRS", "CCRM", "CCRB"]) {
    const d = { ...original, environment: { ...original.environment, category } };
    assert.match(metricExplanation("ttc", d, run).formula, /v_ego − v_target,x/);
    assert.match(metricExplanation("separation", d, run).formula, /giữa hai hộp xe/);
  }
});
test("unknown/unsupported category, simulator or metric source never receives a guessed formula", () => {
  for (const patch of [{ environment: {} }, { environment: { category: "CPLA" } }, { simulator: null }, { simulator: "unknown" }, { metrics: { ...original.metrics, metric_source: undefined } }]) {
    const data = metricExplanation("ttc", { ...original, ...patch }, run);
    assert.equal(data.formula, null); assert.equal(data.variables, null);
    assert.match(data.conditions, /Chưa đủ category/);
  }
});
test("stored values/units/missing/zero are preserved without substitution", () => {
  assert.equal(metricExplanation("stopping", original, run).value, "33.250 m");
  assert.equal(metricExplanation("ttc", original, run).value, "0.00 s");
  assert.equal(metricExplanation("rms", original, run).value, "2.123 m/s³");
  for (const value of [null, undefined, NaN, Infinity, -1]) assert.equal(metricExplanation("rms", { ...original, metrics: { ...original.metrics, rms_jerk_mps3: value } }, run).value, "—");
  assert.equal(metricExplanation("impact", { ...original, outcome: "SAFE" }, run).value, "—");
  const changed = { ...original, metrics: { ...original.metrics, stopping_distance_m: 0.0004 } };
  assert.equal(metricExplanation("stopping", changed, run).value, "4.00e-4 m");
  assert.equal(metricExplanation("stopping", { ...original, configuration: [{ code: "MAX_DECELERATION", value: 15 }] }, run).value, "33.250 m", "Config is not a substitute for stored objective");
});
test("available inputs have source fields, nominal dt belongs to the same run only", () => {
  const data = metricExplanation("stopping", original, run);
  assert.deepEqual(data.inputs.map(input => input.field), ["metrics.brake_onset_t", "run.dt"]);
  assert.equal(data.inputs[1].value, "0.01 s");
  assert(!metricExplanation("rms", original, { run_id: 102, dt: 999 }).inputs.some(input => input.field === "run.dt"));
  assert.match(data.limitations.join(" "), /chưa trả x_onset và a_available/);
  const decel = metricExplanation("deceleration", original, run);
  assert.equal(decel.value, "2.00 m/s²"); assert.equal(decel.inputs[0].value, "8.00 m/s²");
});
test("timeline only lists recorded finite timestamps; missing markers are not computed", () => {
  const data = metricExplanation("timeline", original, run);
  assert(data.inputs.some(input => input.field === "metrics.aeb_activation_t" && input.value === "0.00 s"));
  assert(data.inputs.some(input => input.field === "events[kind=stopped].t" && input.value === "1.00 s"));
  assert(!data.inputs.some(input => input.field === "events[kind=collision].t"));
  const missing = metricExplanation("timeline", { ...original, metrics: { ...original.metrics, aeb_activation_t: null, brake_onset_t: null }, events: [] }, run);
  assert(!missing.inputs.some(input => input.field === "metrics.aeb_activation_t" || input.field === "metrics.brake_onset_t"));
});
test("source mapping distinguishes simulator model from real-world measurements and leaves API inputs intact", () => {
  const snapshot = structuredClone(original);
  assert.equal(metricExplanation("rms", original, run).engine, "CARLA qua lõi Java");
  assert.equal(metricExplanation("rms", { ...original, simulator: "vehicsim-kinematic-1.0" }, { ...run, dt: 0.05 }).engine, "Động học Java");
  assert.deepEqual(original, snapshot);
});

test("partial evidence group does not hide other metric explanations or invent command delay", () => {
  const detail = {...original,stage_evidence:[null,{stage:"CONTROL",values:null}]};
  const view = metricExplanation("timeline", detail, run);
  assert(view);
  assert.equal(view.inputs.find(input => input.label === "Trễ lệnh đã lưu").value, "—");
  assert.match(JSON.stringify(view.inputs), /Quyết định AEB/);
});
