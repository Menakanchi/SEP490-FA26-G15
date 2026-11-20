/** Exercise the production chart preparation; no new chart/testing dependency. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/components/analysis/telemetryChartData.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { prepareChartSeries: prepare, nearestChartSample: nearest, chartEnd, CHART_LEFT, CHART_RIGHT } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const series = (points, step = 0.1, magnitude = false, end = 10) => prepare(points, p => p.v, end, step, magnitude);

test("actual seconds/irregular intervals are preserved; missing cadence has no fabricated connections", () => {
  const points = [{t: 1.101, v: 3}, {t: 1.19, v: 0}, {t: 2.75, v: 2}];
  const result = series(points);
  assert.deepEqual(result.segments, [[{t:1.101,value:3},{t:1.19,value:0}],[{t:2.75,value:2}]]);
  assert.equal(result.quality.gaps, 1);
  assert.deepEqual(prepare(points,p=>p.v,10).segments.map(s=>s.length),[1,1,1]);
  assert.equal(chartEnd(points),2.75); assert.equal(chartEnd(points,6),6);
  assert.equal(CHART_LEFT,62); assert.equal(CHART_RIGHT,644);
  assert.equal(chartEnd(points,.005),.005,"positive API duration is never stretched to a different end time");
});
test("invalid timestamps, missing values and duplicate/backward timestamps break paths without rewriting source", () => {
  const points = [{t:0,v:0},{t:.1,v:1},{t:NaN,v:2},{t:.2,v:2},{t:.2,v:3},{t:.15,v:4},{t:.25,v:null},{t:.3,v:5},{t:.4,v:Infinity},{t:-1,v:9},{t:Infinity,v:0}];
  const original=structuredClone(points), result=series(points);
  assert.deepEqual(result.segments.map(s=>s.length),[2,1,1,1,1]);
  assert.equal(result.quality.invalidTime,3); assert.equal(result.quality.nonIncreasing,2);
  assert.equal(result.quality.missing,1); assert.equal(result.quality.invalidValue,1);
  assert.equal(nearest(result.samples,.25).value,null,"missing sample is not replaced by a nearby finite one");
  assert.deepEqual(points,original);
  const reordered=series([{t:3,v:3},{t:NaN,v:0},{t:1,v:1},{t:1.1,v:2}]);
  assert.equal(nearest(reordered.samples,1).value,1,"lookup sorts its own index even after an invalid-time barrier");
  assert.deepEqual(reordered.segments.map(s=>s.map(p=>p.t)),[[3],[1,1.1]],"SVG retains recorded order");
});
test("speed/TTC magnitudes reject negative/nonfinite values without clamping; signed signals retain negatives", () => {
  const points=[{t:0,v:0},{t:.1,v:-3},{t:.2,v:NaN},{t:.3,v:null},{t:.4,v:.0004},{t:.5,v:'1'}];
  const speed=series(points,.1,true), accel=series(points);
  assert.deepEqual(speed.segments.flat().map(p=>p.value),[0,.0004]);
  assert.equal(speed.quality.invalidValue,3); assert.equal(speed.quality.missing,1);
  assert.equal(accel.low,-3); assert.equal(accel.segments[0][1].value,-3);
});
test("nearest uses recorded timestamp, earlier tie, no interpolation/extrapolation or input mutation", () => {
  const result=series([{t:1,v:1},{t:2,v:null},{t:2,v:99},{t:4,v:4}]);
  assert.equal(nearest(result.samples,1.5).t,1);
  assert.equal(nearest(result.samples,2).value,null,"first recorded duplicate remains identifiable, not overwritten");
  assert.equal(nearest(result.samples,3.5).t,4);
  for (const t of [0,4.01,NaN,Infinity,null]) assert.equal(nearest(result.samples,t),null);
});
test("empty/partial sources and authoritative common end never extrapolate or extend playback duration", () => {
  assert.equal(series([]).count,0); assert.equal(nearest([],1),null);
  const result=series([{t:.1,v:1},{t:.2,v:2},{t:1,v:3}],.1,false,.5);
  assert.equal(result.quality.outside,1); assert.equal(result.count,2);
  assert.equal(nearest(result.samples,.4),null);
  assert.equal(chartEnd([],0),.01);
  for(const dt of [null,0,-1,Infinity,NaN]) assert.equal(series([{t:0,v:0},{t:.1,v:1}],dt).segments.length,2);
});
test("20,000 recorded samples preserve every timestamp, missing gap and extrema; no downsampling", () => {
  const points=Array.from({length:20000},(_,i)=>({t:i*.01,v:i===10000?-1000:i===10001?1000:i===1234?null:i%7}));
  const original=structuredClone(points), result=series(points,.01,false,200);
  assert.equal(result.samples.length,20000); assert.equal(result.count,19999);
  assert.equal(result.low,-1000); assert.equal(result.high,1000);
  assert.equal(result.segments.length,2);
  for(let i=0;i<20000;i+=13) assert.equal(nearest(result.samples,points[i].t).t,points[i].t);
  assert.deepEqual(points,original);
});
