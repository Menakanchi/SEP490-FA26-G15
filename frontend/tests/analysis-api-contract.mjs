/** Shared golden is checked against real Java read services by AnalysisApiContractTest. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import test from "node:test";
import {loadProduction} from "./helpers/load-production.mjs";

const contract=JSON.parse(gunzipSync(await readFile(new URL("../../src/test/resources/analysis/analysis-api-contract.json.gz",import.meta.url))));
const {formatMetric,formatMeasurement,formatRunImpact,speedKmh}=await loadProduction("components/analysis/analysisMetricFormat.ts");
const {classificationPresentation}=await loadProduction("components/analysis/analysisClassificationData.ts");
const {evidenceGroups,evidenceCanSeek,evidenceHref}=await loadProduction("components/analysis/analysisEvidenceData.ts");
const {recordedRange,recordedAt,runMarkers}=await loadProduction("components/analysis/analysisRunData.ts");

test("Java fixture provenance, source identities and full frame/event projections are explicit",()=>{
  assert.equal(contract.kind,"OFFLINE_KINEMATIC_SERVICE_CONTRACT");assert.equal(contract.schema,1);
  assert.match(contract.limitation,/mocked/);
  assert.deepEqual(contract.cases.map(c=>c.id),[101,102,103,104]);
  for (const {id,recording,inspection:{run,detail},playback} of contract.cases) {
    assert.equal(run.run_id,id);assert.equal(detail.run_id,id);assert.equal(playback.run_id,id);
    assert.equal(run.scenario_id,detail.scenario_id);assert.equal(run.scenario_version_id,detail.variant_id);
    assert.equal(run.simulator,detail.simulator);assert.equal(playback.source,"RECORDED_SIMULATOR_RESULT");
    assert.equal(detail.metrics.metric_source,"SIMULATOR_RESULT");
    assert.deepEqual(playback.frames,recording.frames);assert.deepEqual(playback.events,recording.events);
    assert.deepEqual(detail.motion_telemetry,playback.motion_telemetry);
    assert.equal(playback.duration_s,recording.frames.at(-1).t);
  }
});
test("serialized API SI/kmh mapping is consumed without changing source precision or GT fallback",()=>{
  for (const {recording,inspection:{detail},playback} of contract.cases) {
    assert.equal(detail.telemetry.length,recording.frames.length);
    for (let i=0;i<recording.frames.length;i++) {
      const f=recording.frames[i], motion=detail.motion_telemetry[i], chart=detail.telemetry[i];
      assert.equal(chart.t,f.t);assert.equal(motion.t,f.t);
      assert.equal(chart.ttc,f.ttc);assert.equal(motion.ttc_perceived_s,f.ttc);
      assert.equal(motion.ttc_gt_s,f.ttc_gt);assert.equal(motion.ego_accel_mps2,f.ego_a);
      assert(Math.abs(chart.speed_kmh-speedKmh(f.ego_v))<=0.0050000001,"Backend rounds kmh, frontend does not multiply API kmh again");
      assert.equal(formatMeasurement(chart.speed_kmh,"km/h"),chart.speed_kmh.toFixed(1)+" km/h");
    }
    assert(detail.telemetry.some(p=>p.ttc===null),"Perceived TTC can be unavailable");
    assert.equal(formatRunImpact(detail.metrics.impact_speed_mps,detail),detail.outcome==="COLLISION"?detail.metrics.impact_speed_mps.toFixed(3):"—");
    assert.equal(playback.frames[0].t,0);
  }
});
test("collision, valid PASS/null classification, zero and no-brake NULL remain distinct across real service payloads",()=>{
  const hit=contract.cases[0].inspection.detail, safe=contract.cases[1].inspection.detail, ccr=contract.cases[2].inspection.detail;
  assert.equal(hit.metrics.min_distance_m,0);assert.equal(formatMetric(hit.metrics.min_distance_m),"0.00");
  assert.equal(classificationPresentation(hit).classification,"Va chạm được ghi nhận");
  assert.equal(safe.failure_type,null);assert.equal(safe.metrics.impact_speed_mps,null);
  assert.equal(safe.metrics.brake_onset_t,null);assert.equal(safe.metrics.rms_jerk_mps3,null);
  assert.equal(classificationPresentation(safe).classification,"API chưa có phân loại lỗi");
  assert.equal(classificationPresentation(safe).evaluation,"Đạt theo luật hiện hành (PASS)");
  assert.equal(ccr.environment.category,"CCRS");assert(ccr.metrics.brake_onset_t>0);
});
test("stage evidence points to exact API items and only stored absolute timestamps can seek",()=>{
  for (const {id,inspection:{detail}} of contract.cases) {
    const range=recordedRange(detail), rows=evidenceGroups(detail.stage_evidence).flatMap(g=>g.rows);
    assert.equal(rows.length,8);
    for (const row of rows) {
      const source=row.source.match(/^stage_evidence\[(\d+)\]\.values\.(.+)$/);
      assert(source);assert.equal(row.raw,detail.stage_evidence[Number(source[1])].values[source[2]]);
      if (evidenceCanSeek(row.time,range)) {
        const link=new URL(evidenceHref(id,row.time,"signal=jerk_mps3","/analysis/failures?view=runs",true),"http://fixture.invalid");
        assert.equal(Number(link.searchParams.get("t")),row.raw);assert(link.pathname.startsWith("/analysis/failures/"+id+"/"));
        assert(recordedAt(detail.motion_telemetry,row.time)?.t<=row.time);
      }
      if (row.key==="response_time_s" || row.key==="max_deceleration_mps2" || row.key==="road_friction") assert.equal(row.time,null);
    }
    for (const marker of runMarkers(detail)) assert(marker.source.startsWith("metrics.") || detail.events.some(e=>e.t===marker.t));
  }
});
