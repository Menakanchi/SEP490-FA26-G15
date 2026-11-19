/** Production evidence mapping; no physical calculation or evaluator replacement. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url = source => "data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const read = name => readFile(new URL("../src/components/analysis/"+name+".ts",import.meta.url),"utf8");
const fields=url(compile(await read("analysisFailurePresentation")));
const run=url(compile(await read("analysisRunData")));
const code=compile(await read("analysisEvidenceData")).replace('"./analysisFailurePresentation"',JSON.stringify(fields)).replace('"./analysisRunData"',JSON.stringify(run));
const {evidenceGroups,evidenceCanSeek,evidenceHref}=await import(url(code));
const {runMarkers}=await import(run);

test("actual API stages map source/unit/type without merging rule scores into measurements",()=>{
  const groups=evidenceGroups([{stage:"PERCEPTION",values:{first_detection_t:0,first_detection_distance_m:30}},
    {stage:"DECISION",values:{decision_t:0.251,decision_ttc_s:1.2}},
    {stage:"CONTROL",values:{brake_onset_t:0.252,response_time_s:0.001}},
    {stage:"VEHICLE_DYNAMICS",values:{max_deceleration_mps2:2,road_friction:0.65}}]);
  assert.equal(groups[1].rows[0].source,"stage_evidence[1].values.decision_t");
  assert.equal(groups[1].rows[0].time,0.251);
  assert.equal(groups[2].rows[1].kind,"Chỉ số đã tính");assert.equal(groups[2].rows[1].time,null);
  assert.equal(groups[3].rows[1].kind,"Cấu hình mô phỏng");assert.equal(groups[3].rows[0].unit,"m/s²");
  assert.equal(groups[0].rows[0].time,0,"Zero is a recorded timestamp");
});
test("null/partial groups retain valid siblings and exact source indices, no mutation",()=>{
  for(const value of [undefined,null,{},0]) assert.deepEqual(evidenceGroups(value),[]);
  const raw=[null,{stage:"CONTROL",values:null},{stage:"CONTROL",values:{response_time_s:0,brake_onset_t:null}},{}];
  const saved=structuredClone(raw);const out=evidenceGroups(raw);
  assert.equal(out.length,2);assert.equal(out[0].rows.length,0);
  assert.equal(out[1].rows[0].value,0);assert.equal(out[1].rows[1].value,null);
  assert.equal(out[1].rows[0].source,"stage_evidence[2].values.response_time_s");
  assert.deepEqual(raw,saved);
});
test("unknown field/stage retains signed numeric evidence without guessed unit/time/classification",()=>{
  for (const stage of ["CUSTOM", "constructor", "__proto__", "toString"]) {
    const [group]=evidenceGroups([{stage,values:{signed:-0.0004,decision_t:0.251}}]);
    assert.equal(group.rows[0].value,-0.0004);assert.equal(group.rows[0].raw,-0.0004);
    for(const row of group.rows){assert.equal(row.time,null);assert.equal(row.unit,"");assert.equal(row.kind,"Trường chưa có mô tả");}
  }
});
test("invalid known measurements are missing; zero and tiny timing differences survive",()=>{
  for(const value of [null,undefined,NaN,Infinity,-1,"0.25"]) {
    const [group]=evidenceGroups([{stage:"CONTROL",values:{brake_onset_t:value}}]);
    assert.equal(group.rows[0].value,null);assert.equal(group.rows[0].time,null);
  }
  const [group]=evidenceGroups([{stage:"CONTROL",values:{brake_onset_t:0.0004,response_time_s:0}}]);
  assert.equal(group.rows[0].time,0.0004);assert.equal(group.rows[1].value,0);
});
test("seek gating uses stored seconds in recorded domain, never a metric duration or index",()=>{
  for(const time of [null,undefined,NaN,Infinity,-1,0.249,0.501]) assert.equal(evidenceCanSeek(time,{min:0.25,max:0.5}),false);
  assert.equal(evidenceCanSeek(0.251,{min:0.25,max:0.5}),true);
  assert.equal(evidenceCanSeek(0,null),false);assert.equal(evidenceCanSeek(0,{min:0,max:0}),true);
});
test("links preserve run/context/signal and exact time; playback drops only section",()=>{
  const returnTo="/analysis/failures?weather=RAIN&page=2&q=giữ";
  for(const playback of [false,true]) {
    const link=new URL(evidenceHref(101,0.0004,"signal=jerk_mps3&section=evidence&custom=kept",returnTo,playback),"http://fixture.invalid");
    assert.equal(link.pathname,"/analysis/failures/101"+(playback?"/playback":""));
    assert.equal(link.searchParams.get("t"),"0.0004");assert.equal(link.searchParams.get("signal"),"jerk_mps3");
    assert.equal(link.searchParams.get("returnTo"),returnTo);assert.equal(link.searchParams.get("custom"),"kept");
    assert.equal(link.searchParams.get("section"),playback?null:"telemetry");
  }
});
test("timeline only uses explicit supported API timestamps, not threshold inference or null=zero",()=>{
  const detail={metrics:{first_detection_t:null,fcw_t:NaN,aeb_activation_t:0.251,brake_onset_t:0.252,max_deceleration_mps2:8,min_ttc_s:0},
    events:[{kind:"collision",t:0.5},{kind:"stopped",t:-1},{kind:"unknown",t:0.3}],chain:[],outcome:"COLLISION"};
  const markers=runMarkers(detail);
  assert.deepEqual(markers.map(m=>m.t),[0.251,0.252,0.5]);
  assert.deepEqual(markers.map(m=>m.source),["metrics.aeb_activation_t","metrics.brake_onset_t","events[kind=collision].t"]);
  assert(!markers.some(m=>/hazard|applied|decel/i.test(m.label)));
});
