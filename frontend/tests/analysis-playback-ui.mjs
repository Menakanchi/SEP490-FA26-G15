import { prepareAnalysisArtifacts } from "./helpers/analysis-artifacts.mjs";
/** Playback state/time regression: browser HTTP fixtures, no live backend/CARLA. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = process.env.PLAYBACK_BASELINE === "1";
const output = await prepareAnalysisArtifacts(path.join(root, "data/analysis-phase17-2026-11-16", baseline ? "before" : "after"));


const base = process.env.ANALYSIS_UI_URL || "http://127.0.0.1:3129";
const actor = { id: 999915, email: "explainability@example.invalid", full_name: "Metric fixture", role: "ENGINEER" };
const version = "adr040-stored-aggregation/1";
const values = { rms_jerk_mps3: 2.123, impact_speed_mps: 10, stopping_distance_m: 33.25 };
const run = { revision: "metric-fixture", run_id: 101, scenario_id: 42, scenario_version_id: 201, version_no: 1,
  family: "Metric fixture", variant: "CP-001", seed: 13, baseline_id: 7, vehicle_id: 2,
  simulator: "carla-0.9.16-xosc5", aeb_mode: "ON", dt: 0.25, status: "COMPLETED", outcome: "COLLISION",
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
let apiMode="normal";
const errors = [], writes = [], screenshots = [], requests = [], performanceResults=[];
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
    if (p === "/vehicsim/analysis/v3/explorer/scenarios/42/runs") return reply({project_id:actor.id,items:[],total:0,limit:1,offset:0});
    if (p === "/vehicsim/analysis/v3/sources") return reply({items:[],limit:20,offset:0}); // FE-R4: empty FA storage is independent of legacy runs.
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (/^\/vehicsim\/runs\/(101|102)\/playback$/.test(p)) {
      requests.push(p);
      if(apiMode==="error")return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Fixture playback unavailable"})});
      const body={...structuredClone(playback),run_id:p.includes("/102/")?102:101};
      if(apiMode==="slow")await new Promise(resolve=>setTimeout(resolve,1500));
      return reply(body);
    }
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
  await context.addInitScript(() => {
    const stats={pending:new Set(),max:0,calls:0};
    window.__playbackRaf=stats;
    const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>{
      const id=request(now=>{stats.pending.delete(id);stats.calls++;callback(now);});
      stats.pending.add(id);stats.max=Math.max(stats.max,stats.pending.size);return id;
    };
    window.cancelAnimationFrame=id=>{stats.pending.delete(id);cancel(id);};
    const hidden=Object.getOwnPropertyDescriptor(Document.prototype,"hidden")?.get;
    Object.defineProperty(document,"hidden",{configurable:true,get:()=>window.__fixtureHidden??hidden?.call(document)??false});
  });


  const shot=async name=>{await page.screenshot({path:path.join(output,name+".png"),fullPage:true});screenshots.push(name+".png");};
  const playbackUrl=base+"/analysis/failures/101/playback?t=0.25&signal=ego_accel_mps2&returnTo="+encodeURIComponent(returnTo);
  const controls=page.getByRole("region",{name:"Điều khiển playback",exact:true});
  const slider=page.getByRole("slider",{name:"Thời gian playback",exact:true});
  const play=()=>page.getByRole("button",{name:"Phát",exact:true});
  const pause=()=>page.getByRole("button",{name:"Tạm dừng",exact:true});
  const time=async()=>Number(await slider.inputValue());
  const goto=async(t=.25,rate=.5)=>{await page.goto(playbackUrl.replace("t=0.25",`t=${t}`)+`&rate=${rate}`);await controls.waitFor();};
  const seek=async value=>{
    await slider.evaluate((el,next)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,String(next));el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));},value);
    await page.waitForFunction(expected=>Number(document.querySelector('[aria-label="Thời gian playback"]').value)===expected,value);
    await page.waitForURL(u=>Number(u.searchParams.get("t"))===value);
  };
  const fixture=times=>({...original,...original.scene,duration_s:times.at(-1),related_runs:[],
    frames:times.map(t=>({...frames[0],t,ego_x:t,ego_v:10,aeb:false,fcw:false})),
    motion_telemetry:times.map(t=>({...original.motion_telemetry[0],t,ego_x_m:t,ego_speed_mps:10})),
    events:[{t:times[0],kind:"detection",label:"Detection"},{t:1.2,kind:"aeb_decision",label:"decision"},
      {t:1.201,kind:"brake_onset",label:"command"}]});
  for(const [width,height] of [[375,812],[390,844],[768,1024],[1024,768],[1440,900]]){
    await page.setViewportSize({width,height}); await page.goto(playbackUrl);
    await controls.waitFor(); await shot("playback-"+width);
    if(!baseline){
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Playback page overflow "+width);
      await slider.focus();await slider.press("End");await page.waitForURL(u=>u.searchParams.get("t")==="0.5");
      assert(await slider.evaluate(el=>el.matches(":focus-visible")));
      await page.getByRole("button",{name:"Về khung đầu",exact:true}).click();await page.waitForURL(u=>u.searchParams.get("t")==="0");
      const chart=page.getByRole("img",{name:"Gia tốc ego (m/s²) theo thời gian (s)",exact:true});
      assert.equal(Number(await chart.locator("[data-chart-cursor]").getAttribute("x1")),62);
      assert.equal(new URL(page.url()).searchParams.get("returnTo"),returnTo);
    }
  }

  if(!baseline){
    await page.setViewportSize({width:1440,height:900});
    // Review evidence must return to the review that opened it, without accepting external redirects.
    const reviewReturn="/validation/recommendations/9/review";
    await page.goto(base+"/analysis/failures/101/playback?returnTo="+encodeURIComponent(reviewReturn));
    await controls.waitFor();
    assert.equal(await page.getByRole("link",{name:"← Về màn hình duyệt",exact:true}).getAttribute("href"),reviewReturn);
    await page.goto(base+"/analysis/failures/101/playback?returnTo="+encodeURIComponent("https://example.invalid"));
    await controls.waitFor();
    assert.equal(await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).getAttribute("href"),"/analysis/failures?view=runs");
    // Replay must distinguish a recorded shadow decision from an active AEB intervention.
    // This fixture deliberately keeps aeb=true and both events in every mode, including OFF.
    for (const mode of ["OFF", "ON", null]) {
      playback={...structuredClone(original),aeb_mode:mode,frames,duration_s:0.5,related_runs:[],
        events:[{t:0,kind:"aeb_decision",label:"AEB brake command"},
          {t:0.25,kind:"brake_onset",label:"brake command"},{t:0.5,kind:"collision",label:"Collision"}]};
      await goto(0.25);
      const facts=page.getByRole("region",{name:"Số đo khung playback",exact:true});
      const log=page.getByRole("region",{name:"Nhật ký sự kiện",exact:true});
      const text=await page.locator("body").innerText();
      if(mode==="OFF") {
        assert.match(text,/AEB TẮT/);
        assert.equal(await page.getByText("Điều khiển",{exact:true}).count(),0);
        assert.equal(await page.getByText("Va chạm",{exact:true}).count(),1);
        assert.doesNotMatch(await facts.innerText(),/AEB ĐÃ RA QUYẾT ĐỊNH/);
        assert.match(await log.innerText(),/Tín hiệu AEB giả lập/);
        assert.match(await log.innerText(),/AEB tắt; chưa rõ nguồn/);
        assert.doesNotMatch(await log.innerText(),/Quyết định AEB/);
      } else if(mode==="ON") {
        assert.match(text,/AEB BẬT/);
        assert.equal(await page.getByText("Điều khiển",{exact:true}).count(),1);
        assert.match(await facts.innerText(),/AEB ĐÃ RA QUYẾT ĐỊNH/);
        assert.match(await log.innerText(),/Quyết định AEB/);
      } else {
        assert.match(text,/CHƯA RÕ CHẾ ĐỘ AEB/);
        assert.doesNotMatch(await facts.innerText(),/AEB ĐÃ RA QUYẾT ĐỊNH/);
        assert.match(await log.innerText(),/chưa rõ chế độ AEB/i);
      }
      await shot("aeb-mode-"+(mode??"unknown").toLowerCase());
      assert.equal(await log.locator('[data-event-id]').count(),3,"Keep original events visible");
      await log.getByRole("button",{name:/Va chạm|Collision/i}).click();
      await page.waitForURL(u=>u.searchParams.get("t")==="0.5");
      assert.match(await facts.innerText(),/VA CHẠM/,"Collision remains visible in every mode");
    }
    playback={...structuredClone(original),aeb_mode:"OFF",evaluation_valid:false,frames,duration_s:0.5,related_runs:[],events:[{t:0.5,kind:"collision",label:"Collision"}]};
    await goto(0.25);
    assert.equal(await page.getByText("Va chạm",{exact:true}).count(),1,"Recorded collision is shown even without AEB evaluation");
    assert.equal(await page.getByText("Điều khiển",{exact:true}).count(),0);
    playback=fixture([1,1.2,2.75,3]);await goto(3,1);
    await page.setViewportSize({width:375,height:812});
    assert(await page.getByRole("region",{name:"Cảnh playback đã ghi",exact:true}).locator("svg").isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Recorded scene overflow 375");
    const assertSceneLabels=async()=>{
      const scene=page.getByRole("region",{name:"Cảnh playback đã ghi",exact:true});
      const vehicle=await scene.getByText(/^Xe Fixture car ·/).boundingBox();
      const perception=await scene.getByText(/^Nhận thức · tin cậy/).boundingBox();
      assert(vehicle && perception && (vehicle.y+vehicle.height<=perception.y || perception.y+perception.height<=vehicle.y || vehicle.x+vehicle.width<=perception.x || perception.x+perception.width<=vehicle.x),"Vehicle and perception labels must not overlap");
    };
    await assertSceneLabels();
    await shot("recorded-scene-375");await page.setViewportSize({width:1440,height:900});
    await assertSceneLabels();
    assert.match(await page.locator("[data-playback-state]").innerText(),/Cuối dữ liệu/);
    await play().click();
    await page.waitForFunction(()=>{const t=Number(document.querySelector('[aria-label="Thời gian playback"]').value);return t>=1&&t<2;});
    await pause().click();const held=await time();
    await page.waitForTimeout(150);assert.equal(await time(),held,"Pause must freeze selected time");
    await page.getByRole("button",{name:"Về khung đầu",exact:true}).click();assert.equal(await time(),1);
    await seek(2.5);
    assert.match(await controls.innerText(),/cách 1\.300 s/);
    assert.match(await page.getByRole("region",{name:"Số đo khung playback",exact:true}).innerText(),/Khung 1.20 s · Thời gian đang xem 2.50 s/);
    await shot("irregular-gap");
    await page.getByRole("button",{name:"Về khung đầu",exact:true}).click();
    const log=page.getByRole("region",{name:"Nhật ký sự kiện",exact:true});
    await log.getByRole("button",{name:/Quyết định AEB · 1\.200 s/}).click();
    await controls.getByRole("button",{name:"Sự kiện sau ›",exact:true}).click();
    await page.waitForURL(u=>u.searchParams.get("t")==="1.201");
    assert.match(await log.locator('[aria-current="step"]').getAttribute("title"),/Thời điểm sự kiện đã ghi: 1.201 s/);
    assert.equal(await page.getByText("VA CHẠM",{exact:true}).count(),0);
    // Stable playback clock: speed, seek during play, rapid toggle and natural end.
    await seek(1);
    await play().click();await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Thời gian playback"]').value)>1.1);
    await page.getByRole("button",{name:"Tốc độ phát 2 lần",exact:true}).click();
    assert.equal(await page.getByRole("button",{name:"Tốc độ phát 2 lần",exact:true}).getAttribute("aria-pressed"),"true");
    await seek(1.5);assert(await play().isVisible());const sought=await time();await page.waitForTimeout(120);assert.equal(await time(),sought);
    await play().dblclick({delay:20});assert(await play().isVisible());
    const doubleClicked=await time();await page.waitForTimeout(100);assert.equal(await time(),doubleClicked);
    for(let i=0;i<8;i++){
      await controls.locator('button[aria-label="Phát"],button[aria-label="Tạm dừng"]').click();
    }
    assert(await play().isVisible());const still=await time();await page.waitForTimeout(100);assert.equal(await time(),still);
    // Synthetic visibility API event: the real RAF loop must stop and never catch up hidden time.
    await seek(1);await play().click();
    await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Thời gian playback"]').value)>1.05);
    await page.evaluate(()=>{window.__fixtureHidden=true;document.dispatchEvent(new Event("visibilitychange"));});
    await play().waitFor();const background=await time();await page.waitForTimeout(150);assert.equal(await time(),background);
    await page.evaluate(()=>{window.__fixtureHidden=false;document.dispatchEvent(new Event("visibilitychange"));});
    assert.match(await page.locator("[data-playback-state]").innerText(),/tab nền/);
    await page.waitForTimeout(100);assert.equal(await time(),background);
    await play().click();await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Thời gian playback"]').value)>1.2);
    await pause().click();
    await seek(2.99);await play().click();await play().waitFor();
    assert.equal(await time(),3);assert.match(await page.locator("[data-playback-state]").innerText(),/Cuối dữ liệu/);
    await page.waitForFunction(()=>window.__playbackRaf.pending.size===0);
    // Frames/projection duplicate timestamps are ambiguous, never joined as a unique value.
    playback={...fixture([0,1,2]),frames:[{...frames[0],t:1},{...frames[0],t:0},{...frames[0],t:1}],
      motion_telemetry:[{...original.motion_telemetry[0],t:1,crossing_distance_m:999}]};
    await goto(1);
    assert.match(await page.locator("[data-playback-quality]").innerText(),/1 khung trùng, 1 mốc lùi/);
    const facts=page.getByRole("region",{name:"Số đo khung playback",exact:true});
    assert.match(await facts.getByText("Khoảng cách tới vạch băng qua",{exact:true}).locator("..").innerText(),/—/);
    await shot("duplicate-timestamps");
    playback={...fixture([0,1,2]),frames:[{...frames[0],t:0},{...frames[0],t:1,ego_x:null},{...frames[0],t:2}]};
    await goto(2);
    const scene=page.getByRole("region",{name:"Cảnh playback đã ghi",exact:true});
    await scene.locator("[data-playback-path-quality]").waitFor();
    assert.equal(await scene.locator("polyline").count(),0,"Do not connect a trajectory through missing coordinates");
    const validTop=(await controls.boundingBox()).y;
    await seek(1);assert(Math.abs((await controls.boundingBox()).y-validTop)<1,"Missing-coordinate frame must preserve scene/control height");
    await seek(2);
    await shot("missing-coordinate-path");
    for(const item of [
      {...fixture([1]),duration_s:3},
      {...fixture([0]),duration_s:0},
      {...fixture([1,1]),duration_s:3},
      {...fixture([0,1]),frames:[],motion_telemetry:[]},
      {...fixture([0,1]),duration_s:null}
    ]){
      playback=item;await goto(99);assert(await play().isDisabled());
    }
    playback=fixture([0,1,2]);playback.related_runs=[{run_id:102,config:"other",purpose:"BASELINE",outcome:"SAFE"}];
    await goto(1);await play().click();apiMode="slow";
    await page.getByRole("link",{name:"Mở run liên quan · AEB other",exact:true}).click();
    await page.getByRole("status").filter({hasText:"Đang tải dữ liệu phân tích"}).waitFor();assert.equal(await facts.count(),0);
    await controls.waitFor();assert(await play().isVisible());assert.equal(new URL(page.url()).pathname,"/analysis/failures/102/playback");
    apiMode="error";await page.goto(playbackUrl);await page.getByRole("button",{name:"Thử tải lại",exact:true}).waitFor();
    assert.equal(await controls.count(),0);apiMode="normal";
    await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();await controls.waitFor();assert(await play().isVisible());
    // Large recorded trace, real DOM and animation; no points removed.
    const count=20000,times=Array.from({length:count},(_,i)=>i*.013);
    playback=fixture(times);const started=Date.now();await goto(200,1);
    const chart=page.getByRole("img",{name:"Gia tốc ego (m/s²) theo thời gian (s)",exact:true});
    await chart.waitFor();
    await chart.locator("path[data-recorded-dots]").waitFor({state:"attached"});
    assert.equal(await chart.locator("path[data-recorded-dots]").evaluate(el=>getComputedStyle(el).strokeWidth),"5px");
    const renderMs=Date.now()-started;
    assert.equal(await chart.locator("path[data-recorded-dots]").getAttribute("data-recorded-dots"),String(count));
    await page.waitForFunction(()=>window.__playbackRaf.pending.size===0);
    await page.evaluate(()=>{window.__playbackRaf.max=0;window.__playbackRaf.calls=0;});
    const playStart=Date.now();await play().click();await page.waitForTimeout(500);await pause().click();
    const elapsedMs=Date.now()-playStart,simulationDelta=(await time())-200;
    await page.waitForFunction(()=>window.__playbackRaf.pending.size===0);
    const stats=await page.evaluate(()=>({maxPending:window.__playbackRaf.max,callbacks:window.__playbackRaf.calls,heapBytes:performance.memory?.usedJSHeapSize??null}));
    assert.equal(stats.maxPending,1,"Only one active animation loop");
    assert(simulationDelta>0&&simulationDelta<=elapsedMs/1000+.1,"Elapsed clock, not sample count, advances playback");
    performanceResults.push({count,renderMs,elapsedMs,simulationDelta,...stats});
    await shot("large-playback-20000");
    assert(requests.length>0);
    // Unmount cleans the loop; returning to the route starts paused.
    await play().click();await page.getByRole("link",{name:"Xem phân tích run",exact:true}).click();
    try { await page.getByRole("region",{name:"Kết luận phân tích",exact:true}).waitFor(); }
    catch (error) { console.error("Run analysis navigation failed:", page.url(), await page.locator("body").innerText(), errors); throw error; }
    await page.waitForFunction(()=>window.__playbackRaf.pending.size===0);
    await page.goBack();await controls.waitFor();assert(await play().isVisible());
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:baseline?"BASELINE":"PASS",kind:"BROWSER_FIXTURE_ONLY",baseline,screenshots,performanceResults,errors,writes},null,2));
} finally {await browser.close();}
