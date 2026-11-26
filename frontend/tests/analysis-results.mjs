import assert from "node:assert/strict";
import test from "node:test";
import {loadProduction} from "./helpers/load-production.mjs";
import {resultFixture} from "./helpers/analysis-result-fixture.mjs";
const {assertInspection, legacyDisagreements, recordedOutcome} = await loadProduction("components/analysis/analysisResultData.ts");
const {metricExplanation, UNVERIFIED_METHOD} = await loadProduction("components/analysis/analysisMetricExplanationData.ts");

test("result reader preserves exact canonical producer values and nulls", () => {
  const f=resultFixture(), original=structuredClone(f);
  assertInspection(f,101); assert.deepEqual(f,original);
  f.detail.metrics.impact_speed_mps=null; assertInspection(f,101);
  assert.equal(metricExplanation("impact",f.detail,f.run).value,"—");
  assert.equal(f.detail.metrics.impact_speed_mps,null);
});
test("empty/malformed inspection cannot be mistaken for unfinished or SAFE", () => {
  const f=resultFixture();
  for(const value of [null,{},[],{run:f.run},{run:f.run,detail:{}},{...f,detail:{...f.detail,metrics:null}},
    {...f,detail:{...f.detail,headline:{bad:true}}},{...f,detail:{...f.detail,configuration:[{code:{bad:true}}]}},
    {...f,run:{...f.run,family:{bad:true}}},{...f,detail:{...f.detail,events:[null]}},{...f,detail:{...f.detail,scene:{path:"wrong"}}}])
    assert.throws(()=>assertInspection(value,101));
  assert.doesNotThrow(()=>assertInspection({run:{...f.run,status:"RUNNING"},detail:null},101));
});
test("identity mismatch rejects run, scenario, variant, seed, simulator and status", () => {
  const f=resultFixture(); assert.throws(()=>assertInspection(f,102));
  for(const patch of [{run_id:102},{scenario_id:999},{variant_id:999},{seed:999},{simulator:"other"},{status:"RUNNING"}])
    assert.throws(()=>assertInspection({...f,detail:{...f.detail,...patch}},101));
});
test("missing measurements stay unknown without inferred null reasons", () => {
  const f=resultFixture(); f.detail.metrics={}; assertInspection(f,101);
  for(const key of ["rms","stopping","impact"]) assert.equal(metricExplanation(key,f.detail,f.run).value,"—");
  assert.match(recordedOutcome({...f.detail,outcome:"UNKNOWN"}),/không suy ra an toàn/);
});
test("PASS/failure and collision/false-activation disagreements retained, not adjudicated", () => {
  const f=resultFixture(), d={...f.detail,verdict:"PASS",metrics:{...f.detail.metrics,false_activation:true}}, before=structuredClone(d);
  assert.equal(legacyDisagreements(d).length,2); assert.deepEqual(d,before);
  assert.match(legacyDisagreements({...d,outcome:"FALSE_BRAKING"}).join(" "),/không cung cấp cờ contact độc lập/);
});
test("no current REST profile is independently verified by name or aggregation version", () => {
  const f=resultFixture();
  for(const simulator of [null,"unknown","carla-0.9.16-xosc5","carla-0.9.16-xosc9","carla-0.9.16-xosc15","carla-0.9.16-xosc999","vehicsim-kinematic-1.0","vehicsim-kinematic-1.4","vehicsim-kinematic-99.0"]) {
    const data=metricExplanation("rms",{...f.detail,simulator},f.run);
    assert.equal(data.profileStatus,UNVERIFIED_METHOD); assert.equal(data.formula,null);
    assert.equal(data.value,"2.123 m/s³");
  }
});
test("CARLA reference keeps T_AEB/filter separate from kinematic/raw/chart jerk", () => {
  const f=resultFixture();
  const carla=metricExplanation("rms",{...f.detail,simulator:"carla-0.9.16-xosc15"},f.run);
  assert.match(carla.method,/Butterworth.*10 Hz.*T_AEB/);
  assert.doesNotMatch(carla.method,/dt danh định/);
  const kin=metricExplanation("rms",{...f.detail,simulator:"vehicsim-kinematic-1.4"},f.run);
  assert.match(kin.method,/jerk chưa lọc/);
  assert.doesNotMatch(metricExplanation("rms",{...f.detail,simulator:"carla-0.9.16-xosc999"},f.run).method,/Butterworth/);
});
test("stopping measured/extrapolated components remain unknown, no configured substitution", () => {
  const f=resultFixture(), data=metricExplanation("stopping",f.detail,f.run);
  assert.match(data.limitations.join(" "),/chưa tách trace component và extrapolated component/);
  assert.match(data.interpretation,/Quãng ngắn hơn chưa chắc tốt hơn/);
  assert.equal(data.value,"33.250 m");
});
test("GT, contact and controller events are separate references, not physical diagnosis", () => {
  const f=resultFixture();
  assert.match(metricExplanation("ttc",f.detail,f.run).interpretation,/TTC 1D không phải physical collision truth/);
  assert.match(metricExplanation("timeline",f.detail,f.run).limitations.join(" "),/writer attribution/);
  assert.match(metricExplanation("separation",f.detail,f.run).interpretation,/không phải sensor contact/);
});
test("hostile chart/config data cannot recompute canonical objectives", () => {
  const f=resultFixture(), before=structuredClone(f.detail.metrics);
  f.detail.motion_telemetry.forEach(p=>{p.jerk_mps3=999999;p.ego_accel_mps2=9999});
  f.detail.configuration.forEach(p=>{p.value=999});
  assert.equal(metricExplanation("rms",f.detail,f.run).value,"2.123 m/s³");
  assert.equal(metricExplanation("stopping",f.detail,f.run).value,"33.250 m");
  assert.deepEqual(f.detail.metrics,before);
});

test("disputed outcome does not conceal the raw stored impact in technical references", () => {
  const f=resultFixture(), data=metricExplanation("impact",{...f.detail,outcome:"FALSE_BRAKING"},f.run);
  assert.equal(data.value,"—");
  assert.equal(data.inputs.find(input=>input.field==="metrics.impact_speed_mps").value,"10 m/s");
  assert.equal(f.detail.metrics.impact_speed_mps,10);
});
