/** Telemetry chart regression: browser HTTP fixtures, no live backend/CARLA. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = process.env.TELEMETRY_BASELINE === "1";
const output = path.join(root, "data/analysis-phase16-2026-11-16", baseline ? "before" : "after");
await fs.mkdir(output, { recursive: true });
await fs.rm(path.join(output, "result.json"), { force: true });
const base = process.env.ANALYSIS_UI_URL || "http://127.0.0.1:3128";
const actor = { id: 999915, email: "explainability@example.invalid", full_name: "Metric fixture", role: "ENGINEER" };
const version = "adr040-stored-aggregation/1";
const values = { rms_jerk_mps3: 2.123, impact_speed_mps: 10, stopping_distance_m: 33.25 };
const run = { revision: "metric-fixture", run_id: 101, scenario_id: 42, scenario_version_id: 201, version_no: 1,
  family: "Metric fixture", variant: "CP-001", seed: 13, baseline_id: 7, vehicle_id: 2,
  simulator: "carla-0.9.16-xosc5", dt: 0.25, status: "COMPLETED", outcome: "COLLISION",
  weather: "CLEAR", time_of_day: "DAY", failure_class: "CONTROL", error: null, end_reason: "COLLISION",
  trace_available: true, created_at: "2026-11-14T08:00:00", metrics: values };
const objective = (value, unit) => ({ value, unit, samples: 1, missing: 0, notApplicable: 0, status: "VALID" });
const objectives = { version, invalid_runs: 0, rms_jerk_mps3: objective(2.123, "m/s³"),
  impact_speed_mps: objective(10, "m/s"), stopping_distance_m: objective(33.25, "m") };
const frames = [0, 0.25, 0.5].map(t => ({ t, ego_x: t, ego_v: 10, ego_a: -0.0004, ped_x: 30, ped_y: -1,
  ped_vy: 1, perceived_y: -1, detected: true, confidence: 0.8, ttc: null, ttc_gt: 1, aeb: true, fcw: true }));
let detail = { ...run, purpose: "BASELINE", variant_id: 201, vehicle: "Fixture car", config: "v7", date: run.created_at,
  verdict: "FAIL", evaluation_valid: true, failure_type: "COLLISION", headline: "Metric fixture", summary: "Fixture only",
  metrics: { ...values, metric_source: "SIMULATOR_RESULT", impact_speed_kmh: 36, min_distance_m: 0,
    min_ttc_s: 0, first_detection_t: 0, first_detection_distance_m: 30, aeb_activation_t: 0,
    aeb_activation_ttc_s: null, fcw_t: 0, brake_onset_t: 0.25, max_deceleration_mps2: 2,
    false_activation: false, missed_activation: false },
  configuration: [{ code: "BRAKE_ACTIVATION_DELAY", name: "Delay", value: 0.15, unit: "s" }],
  environment: { category: "CP_CROSSING", ego_speed_kmh: 36, trigger_distance_m: 30, pedestrian_speed_mps: 1, stops_at_curb: false,
    weather: "CLEAR", time_of_day: "DAY", road_friction: 0.65 },
  chain: [{ stage: "CONTROL", passed: false, summary: "Fixture", confidence: 0.8, cause_code: "FIXTURE", parameter_code: null }],
  chain_confidence: 0.8, evaluation_version: version,
  stage_evidence: [{ stage: "CONTROL", values: { brake_onset_t: 0.25, response_time_s: 0.25 } }],
  telemetry: frames.map(f => ({ t: f.t, ttc: null, speed_kmh: 36 })),
  motion_telemetry: frames.map(f => ({ t: f.t, ego_x_m: f.ego_x, ego_speed_mps: 10, ego_accel_mps2: -0.0004,
    target_y_m: -1, jerk_mps3: -0.0004, crossing_distance_m: 30 - f.ego_x, ttc_perceived_s: null,
    ttc_gt_s: 1, motion_state: "DECELERATING", derived_source: "RECORDED_GT_FINITE_DIFFERENCE" })),
  events: [{ t: 0, kind: "aeb_decision", label: "AEB brake command" }], ttc_threshold_s: 1.5,
  scene: { crossing_x: 30, vehicle_length_m: 4.8, vehicle_width_m: 2, lane_width_m: 3.5,
    path: frames.map(f => ({ t: f.t, x: f.ego_x, ped_y: f.ped_y })), end: frames.at(-1) }, similar: [] };
const original = structuredClone(detail);
let playback = { ...original, frames, duration_s: 0.5, related_runs: [] };
let inspectionRun = structuredClone(run);
const errors = [], writes = [], screenshots = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/v1/**", async route => {
    const p = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const reply = body => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": "*" } });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
    if (p === "/auth/login") return reply({ access_token: "explainability-fixture-only", token_type: "bearer", expires_in: 3600, user: actor });
    if (route.request().method() !== "GET") { writes.push(p); return reply({}); }
    if (p === "/auth/me") return reply(actor);
    if (p === "/vehicsim/context") return reply({ project: { id: actor.id, name: "Explainability fixture" }, workspace: { id: 1, name: "Fixture" },
      vehicle: { id: 2, name: "Fixture car" }, system: { id: 1, name: "AEB", baseline: { id: 7, label: "v7" } },
      versions: [{ id: 7, label: "v7", status: "BASELINE" }], families: [{ id: 42, name: "Metric fixture", code: "CP" }], parameters: [], reviewer_projects: [] });
    if (p === "/vehicsim/regression") return reply({ items: [], kpis: { total: 0, passed: 0, failed: 0, running: 0 } });
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (p === "/vehicsim/runs/101/playback") return reply(playback);
    if (p === "/vehicsim/analysis/runs/101") return reply({ run: inspectionRun, detail });
    if (p === "/vehicsim/analysis/runs") return reply({ total: 1, page: 1, page_size: 20, counts: { COLLISION: 1 }, items: [run], evaluation_version: version,
      objective_groups: [{ identity: "fixture", simulator: run.simulator, baseline_id: 7, vehicle_id: 2, objectives, carla_observational_only: true }] });
    return reply([]);
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Browser-fixture-only-15");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click(); await page.waitForURL(u => u.pathname !== "/login");
  const returnTo = "/analysis/failures?view=runs&scenario_id=42&page=2&weather=RAIN&q=kept";
  const url = "/analysis/failures/101?section=telemetry&signal=ego_accel_mps2&t=0.25&returnTo=" + encodeURIComponent(returnTo);

  const shot = async name => { await page.screenshot({ path: path.join(output,name+".png"),fullPage:true }); screenshots.push(name+".png"); };
  const combined = page.getByRole("img",{name:"TTC nhận thức (s) và tốc độ xe (km/h) theo thời gian (s)",exact:true});
  const motion = page.getByRole("img",{name:"Gia tốc ego (m/s²) theo thời gian (s)",exact:true});
  const slider = page.getByRole("slider",{name:"Thời gian phân tích",exact:true});
  const reload = async () => { await page.goto(base+url); await motion.waitFor(); };
  const performanceResults=[];
  for (const [width,height] of [[375,812],[390,844],[768,1024],[1024,768],[1440,900]]) {
    await page.setViewportSize({width,height}); await reload(); await shot("telemetry-"+width);
    if (!baseline) {
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Page overflow "+width);
      for (const name of ["Vùng cuộn biểu đồ TTC và tốc độ","Vùng cuộn biểu đồ chuyển động"]) {
        const region=page.getByRole("region",{name,exact:true});
        await region.focus(); await page.keyboard.press("Tab"); await region.focus();
        assert(await region.evaluate(el=>el.matches(":focus-visible")));
        const dims=await region.evaluate(el=>({inner:el.scrollWidth,outer:el.clientWidth,font:parseFloat(getComputedStyle(el.querySelector("text")).fontSize)}));
        assert(dims.font>=11,"SVG text must not shrink");
        if(width<=768) {
          assert(dims.inner>dims.outer); await region.press("ArrowRight");
          await page.waitForFunction(label => [...document.querySelectorAll('[role="region"]')]
            .find(el => el.getAttribute("aria-label") === label)?.scrollLeft > 0, name);
          await region.evaluate(el => { el.scrollLeft = 0; });
        }
      }
      assert.equal(await combined.locator("polyline[data-signal=ttc]").count(),0,"Null TTC has no series");
      assert.equal(await combined.locator("polyline[data-signal=speed_kmh]").getAttribute("stroke-dasharray"),"6 3");
      assert.equal(await combined.locator("[data-chart-cursor]").getAttribute("x1"),await motion.locator("[data-chart-cursor]").getAttribute("x1"));
      await slider.focus(); await slider.press("End"); await page.waitForURL(u=>u.searchParams.get("t")==="0.5");
      assert.match(await page.locator("[data-chart-readout]").last().innerText(),/t = 0\.500 s/);
      assert.equal(new URL(page.url()).searchParams.get("returnTo"),returnTo);
    }
  }
  if (!baseline) {
    await page.setViewportSize({width:1440,height:900});
    detail={...original,telemetry:[{t:0,ttc:12,speed_kmh:36},{t:.25,ttc:null,speed_kmh:0},{t:.5,ttc:8,speed_kmh:-3},{t:2,ttc:4,speed_kmh:6}]};
    await reload();
    assert.equal(await combined.locator('[data-signal="ttc"]').count(),3);
    assert.equal(await combined.locator('[data-signal="speed_kmh"]').count(),2);
    assert.match(await page.locator("[data-chart-quality]").nth(1).innerText(),/1 số đo ngoài hợp đồng/);
    await slider.focus(); await slider.press("End"); await page.waitForURL(u=>u.searchParams.get("t")==="2");
    assert.equal(await combined.locator("[data-chart-cursor]").getAttribute("x1"),await motion.locator("[data-chart-cursor]").getAttribute("x1"));
    assert.match(await page.locator("[data-chart-readout]").last().innerText(),/Chưa có mẫu trong khoảng đã ghi/,"Shorter source cannot extrapolate");
    await combined.scrollIntoViewIfNeeded();
    const box=await combined.boundingBox();
    await page.mouse.move(box.x+(62+582*.2)/706*box.width,box.y+box.height*.5);
    await page.waitForFunction(()=>document.querySelectorAll("[data-chart-hover]").length===2);
    const hoverX=Number(await combined.locator("[data-chart-hover]").getAttribute("x1"));
    assert(Math.abs(hoverX-178.4)<2);
    assert.equal(await combined.locator("[data-chart-hover]").getAttribute("x1"),await motion.locator("[data-chart-hover]").getAttribute("x1"));
    assert.match(await page.locator("[data-chart-readout]").last().innerText(),/t = 0\.500 s/);
    await page.mouse.move(0,0);
    const legends=page.getByLabel("Mốc đã ghi trên biểu đồ",{exact:true});
    assert.match(await legends.first().innerText(),/metrics\.brake_onset_t/);
    assert.doesNotMatch(await legends.first().innerText(),/Va chạm|Phanh có hiệu lực/);
    detail={...original,telemetry:[{t:0,ttc:1,speed_kmh:36},{t:.25,ttc:2,speed_kmh:0},{t:.25,ttc:3,speed_kmh:null},{t:.1,ttc:4,speed_kmh:1}]};
    await reload(); assert.match(await page.locator("[data-chart-quality]").first().innerText(),/2 mốc trùng\/lùi/);
    assert.equal(await combined.locator("polyline[data-signal=ttc]").count(),1);
    assert.equal(await combined.locator("circle[data-signal=ttc]").count(),2);
    await shot("quality-duplicates");
    detail={...original,events:[{t:.3,kind:"collision",label:"Collision"}]};
    await reload();
    assert.equal(await combined.locator("[data-collision-sample]").count(),0,"Collision time without exact speed sample gets no invented dot");
    detail={...original,events:[{t:.25,kind:"collision",label:"Collision"}]};
    await reload(); assert.equal(await combined.locator("[data-collision-sample]").count(),1);
    assert.match(await page.getByLabel("Mốc đã ghi trên biểu đồ",{exact:true}).first().innerText(),/events\[kind=collision\]\.t/);
    detail={...original,telemetry:[],motion_telemetry:[]};
    await page.goto(base+url); await page.getByText("Run chưa có telemetry để vẽ biểu đồ.",{exact:true}).waitFor();
    assert(await slider.isDisabled()); assert.equal(await combined.count(),0);
    detail={...original,telemetry:[original.telemetry[0]],motion_telemetry:[original.motion_telemetry[0]],events:[],
      metrics:{...original.metrics,first_detection_t:.005,fcw_t:null,aeb_activation_t:null,brake_onset_t:null}};
    await reload(); assert(await slider.isDisabled());
    assert.equal(await page.getByLabel("Mốc đã ghi trên biểu đồ",{exact:true}).first().innerText(),"","Axis padding for zero duration must not admit out-of-domain events");
    detail=structuredClone(original);
    playback={...original,frames,duration_s:.5,related_runs:[],events:[{t:.25,kind:"brake_onset",label:"command"},{t:99,kind:"collision",label:"outside"},{t:-1,kind:"stopped",label:"invalid"}]};
    await page.goto(base+"/analysis/failures/101/playback?t=0.25&signal=ego_accel_mps2&returnTo="+encodeURIComponent(returnTo));
    await motion.waitFor();
    assert.equal(await motion.locator("polyline").count(),0,"Playback lacks nominal dt; samples remain discrete");
    assert.equal(await motion.locator("circle[data-signal=ego_accel_mps2]").count(),3);
    assert.match(await page.locator("[data-chart-quality]").innerText(),/Chưa có dt danh định/);
    assert.match(await page.getByLabel("Mốc đã ghi trên biểu đồ",{exact:true}).innerText(),/events\[kind=brake_onset\]\.t/);
    assert.doesNotMatch(await page.getByLabel("Mốc đã ghi trên biểu đồ",{exact:true}).innerText(),/outside|Va chạm|Dừng/);
    const playbackSlider=page.getByRole("slider",{name:"Thời gian playback",exact:true});
    await playbackSlider.focus(); await playbackSlider.press("End");
    await page.waitForFunction(()=>new URL(location.href).searchParams.get("t")==="0.5");
    assert.equal(Number(await motion.locator("[data-chart-cursor]").getAttribute("x1")),644);
    await shot("playback-missing-dt");
    for(const count of [200,2000,20000]) {
      const points=Array.from({length:count},(_,i)=>({...original.motion_telemetry[0],t:i*.01,ego_accel_mps2:i===count-2?-123.456:i===count-1?12.345:-2}));
      detail={...original,telemetry:points.map(p=>({t:p.t,ttc:null,speed_kmh:36})),motion_telemetry:points};
      inspectionRun={...run,dt:.01};
      const started=Date.now(); await reload(); await motion.locator("polyline").waitFor();
      const renderMs=Date.now()-started;
      assert.equal((await motion.locator("polyline").getAttribute("points")).split(" ").length,count);
      assert.equal((await combined.locator("polyline").getAttribute("points")).split(" ").length,count);
      await slider.focus(); await slider.press("End");
      await page.waitForFunction(()=>document.querySelectorAll("[data-chart-readout]")[1]?.textContent.includes("12.35 m/s²"));
      await motion.scrollIntoViewIfNeeded();
      const handle=await motion.locator("polyline").elementHandle(), bounds=await motion.boundingBox(), delays=[];
      for(let i=1;i<=10;i++) {
        const tick=Date.now(); await page.mouse.move(bounds.x+(62+582*i/11)/706*bounds.width,bounds.y+bounds.height*.6);
        await page.waitForFunction(expected => {
          const cursors = [...document.querySelectorAll("[data-chart-hover]")];
          return cursors.length === 2 && cursors.every(el => Math.abs(Number(el.getAttribute("x1")) - expected) < 2);
        }, 62+582*i/11);
        delays.push(Date.now()-tick);
      }
      assert(await handle.evaluate(el=>el.isConnected),"Hover preserves static geometry");
      performanceResults.push({count,renderMs,pointerMaxMs:Math.max(...delays),pointerMeanMs:delays.reduce((a,b)=>a+b,0)/delays.length,
        domNodes:await page.locator("svg polyline, svg circle, svg path[data-recorded-dots]").count(),
        heapBytes:await page.evaluate(()=>performance.memory?.usedJSHeapSize??null)});
      await page.mouse.move(0,0);
    }
    await shot("large-20000");
    inspectionRun={...run,dt:null}; await reload();
    assert.equal(await motion.locator("path[data-recorded-dots]").getAttribute("data-recorded-dots"),"20000");
    assert.equal(await motion.locator("polyline").count(),0);
    assert.deepEqual(original.metrics,detail.metrics,"Exploring never recomputes stored metrics");
  }
  assert.deepEqual(errors,[]); assert.deepEqual(writes,[]);
  await fs.writeFile(path.join(output,"result.json"),JSON.stringify({baseline,screenshots,performanceResults,errors,writes},null,2));
} finally { await browser.close(); }
