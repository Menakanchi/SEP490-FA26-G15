/** Tests production playback time/state and source validation, not a simulation engine. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const compile = s => ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url = s => "data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const load = async name => compile(await readFile(new URL("../src/components/"+name,import.meta.url),"utf8"));
const clockUrl=url(await load("analysis/playbackClockData.ts"));
const {initialPlaybackClock:initial,playbackClockReducer:reduce,playbackIndexAt:indexAt}=await import(clockUrl);
const code=(await load("analysis/playbackPresentation.ts"))
  .replace('"./playbackClockData"',JSON.stringify(clockUrl))
  .replace('"./analysisRunData"',JSON.stringify(url(await load("analysis/analysisRunData.ts"))))
  .replace('"@/components/vehicsimI18n"',JSON.stringify(url(await load("vehicsimI18n.ts"))));
const {playbackPresentation:prepare,frameStatus,eventName}=await import(url(code));
const ready=(patch={})=>reduce(initial,{type:"load",key:"101:0",time:1,start:1,end:4,canPlay:true,speed:.5,...patch});
const action=(type,patch={})=>({type,key:"101:0",...patch});

test("load is paused, speed is constrained, single/empty/invalid duration cannot animate",()=>{
  assert.equal(ready().playing,false);
  for(const speed of [0,-1,NaN,Infinity,10])assert.equal(ready({speed}).speed,.5);
  for(const domain of [{canPlay:false},{start:4,end:4},{end:NaN},{end:-1}])
    assert.equal(reduce(ready(domain),action("toggle")).playing,false);
});
test("elapsed seconds use selected rate, stop exactly at API end, restart from first recorded frame",()=>{
  let s=reduce(ready(),action("toggle"));
  s=reduce(s,action("tick",{elapsed:.3}));assert.equal(s.time,1.15);
  s=reduce(s,action("rate",{speed:2}));
  s=reduce(s,action("tick",{elapsed:.1}));assert(Math.abs(s.time-1.35)<1e-12);
  s=reduce(s,action("tick",{elapsed:100}));assert.equal(s.time,4);assert.equal(s.playing,false);
  s=reduce(s,action("toggle"));assert.equal(s.time,1);assert.equal(s.speed,2);assert.equal(s.playing,true);
});
test("pause/background pause hold time; queued ticks, invalid elapsed, old-run callbacks cannot advance it",()=>{
  let s=reduce(ready(),action("toggle"));
  for(const elapsed of [-1,NaN,Infinity])assert.equal(reduce(s,action("tick",{elapsed})),s);
  s=reduce(s,action("pause",{background:true}));assert.equal(s.backgroundPaused,true);
  assert.equal(reduce(s,action("tick",{elapsed:99})),s);
  s=reduce(s,{type:"load",key:"102:0",time:2,start:2,end:3,canPlay:true,speed:1});
  assert.equal(reduce(s,action("tick",{elapsed:1})),s);
  assert.equal(reduce(s,action("seek",{time:0})),s);
});
test("seek is paused, preserves sub-millisecond timestamp, clamps domain and never changes source",()=>{
  const s=reduce(ready(),action("toggle"));
  assert.equal(reduce(s,action("seek",{time:1.0000001})).time,1.0000001);
  assert.equal(reduce(s,action("seek",{time:-1})).time,0);
  assert.equal(reduce(s,action("seek",{time:99})).time,4);
  assert.equal(reduce(s,action("seek",{time:2})).playing,false);
  for(const time of [NaN,Infinity])assert.equal(reduce(s,action("seek",{time})),s);
});
test("rapid toggles are ordered pure transitions without duplicate-clock state",()=>{
  let s=ready();
  for(let i=0;i<100;i++)s=reduce(s,action("toggle"));
  assert.equal(s.playing,false);assert.equal(s.time,1);
  s=reduce(s,action("toggle"));assert.equal(s.playing,true);
  const old=s;for(const speed of [0,-1,Infinity,NaN])assert.equal(reduce(old,action("rate",{speed})),old);
});
test("floor lookup uses actual irregular time; no future epsilon, last stable duplicate, no interpolation",()=>{
  const p=[{t:1},{t:1.2},{t:1.2},{t:2.75}],copy=structuredClone(p);
  assert.equal(indexAt(p,.9),-1);assert.equal(indexAt(p,1.2-1e-7),0);
  assert.equal(indexAt(p,1.2),2);assert.equal(indexAt(p,2.5),2);assert.equal(indexAt(p,99),3);
  assert.equal(indexAt(p,NaN),-1);assert.equal(indexAt([],0),-1);assert.deepEqual(p,copy);
});
test("source preparation diagnoses duplicate/backward/invalid timestamps without inventing frames/events",()=>{
  const input={duration_s:3,frames:[{t:2},{t:1},{t:1},null,{t:NaN},{t:-1},{t:4}],events:[{t:2,kind:"x"},{t:1,kind:"x"},null,{t:99,kind:"collision"}]};
  const copy=structuredClone(input),v=prepare(input);
  assert.deepEqual(v.frames.map(f=>f.t),[1,1,2]);
  assert.equal(v.duplicateFrames,1);assert.equal(v.backwardFrames,1);assert.equal(v.invalidFrames,4);
  assert(v.ambiguousTimes.has(1));assert.equal(v.canPlay,true);
  assert.deepEqual(v.entries.map(e=>e.id),[1,0]);assert.equal(v.invalidEvents,2);
  assert.deepEqual(input,copy);
  for(const frames of [[],[{t:1}],[{t:1},{t:1}]])assert.equal(prepare({duration_s:3,frames,events:[]}).canPlay,false);
  assert.equal(prepare({duration_s:0,frames:[{t:0}],events:[]}).frames.length,1);
  for(const duration_s of [null,NaN,Infinity,-1])assert.equal(prepare({duration_s,frames:[{t:0}],events:[]}).durationValid,false);
});
test("discrete collision/stop state is never activated early or inferred from zero speed/TTC",()=>{
  const f={ego_v:0,ttc:0,aeb:false,fcw:false,detected:false};
  assert.equal(frameStatus(f,3,[]).label,"CHƯA CÓ CỜ AEB/FCW");
  const events=[{t:1,kind:"collision"}];
  assert.notEqual(frameStatus(f,1-1e-7,events).label,"VA CHẠM");
  assert.equal(frameStatus(f,1,events).label,"VA CHẠM");
  assert.equal(frameStatus({...f,aeb:true},1,[],"ON").label,"AEB ĐÃ RA QUYẾT ĐỊNH");
});
test("OFF shadow signals never become real AEB/FCW actions; missing mode remains unknown",()=>{
  const f={ego_v:10,ttc:1,aeb:true,fcw:true,detected:true};
  assert.equal(frameStatus(f,1,[],"OFF").label,"AEB TẮT");
  assert.match(frameStatus(f,1,[]).label,/CHƯA RÕ CHẾ ĐỘ/);
  assert.equal(frameStatus(f,1,[{kind:"collision",t:1}],"OFF").label,"VA CHẠM");
  assert.equal(eventName({kind:"aeb_decision"},"ON"),"Quyết định AEB");
  assert.match(eventName({kind:"aeb_decision"},"OFF"),/giả lập.*không tác động phanh/);
  assert.match(eventName({kind:"fcw"},"OFF"),/tính toán \(shadow\)/);
  assert.match(eventName({kind:"brake_onset"},"OFF"),/chưa rõ nguồn/);
  assert.match(eventName({kind:"aeb_decision"}),/chưa rõ chế độ/);
  assert.match(eventName({kind:"brake_onset"}),/chưa rõ chế độ/);
});
test("20,000 records keep every sample and support exact full-resolution floor lookup",()=>{
  const frames=Array.from({length:20000},(_,i)=>({t:i*.013,ego_v:i===19000?123.456:0}));
  const p=prepare({duration_s:260,frames,events:[]});
  assert.equal(p.frames.length,20000);
  for(let i=0;i<20000;i+=29)assert.equal(p.frames[indexAt(p.frames,frames[i].t)],frames[i]);
  assert.equal(p.frames[19000].ego_v,123.456);
});
