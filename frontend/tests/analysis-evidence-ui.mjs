/** Run detail/evidence traceability regression: browser HTTP fixtures, no live backend/CARLA. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = process.env.EVIDENCE_BASELINE === "1";
const output = path.join(root, "data/analysis-phase18-2026-11-16", baseline ? "before" : "after");
await fs.mkdir(output, { recursive: true });
await fs.rm(path.join(output, "result.json"), { force: true });
const base = process.env.ANALYSIS_UI_URL || "http://127.0.0.1:3130";
const actor = { id: 999915, email: "explainability@example.invalid", full_name: "Metric fixture", role: "ENGINEER" };
const version = "adr040-stored-aggregation/1";
const values = { rms_jerk_mps3: 2.123, impact_speed_mps: 10, stopping_distance_m: 33.25 };
const run = { revision: "metric-fixture", run_id: 101, scenario_id: 42, scenario_version_id: 201, version_no: 1,
  family: "Metric fixture", variant: "CP-001", seed: 13, baseline_id: 7, vehicle_id: 2,
  simulator: "carla-0.9.16-xosc5", dt: 0.01, status: "COMPLETED", outcome: "COLLISION",
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
let inspectionRun = structuredClone(run);
const errors = [], writes = [], screenshots = [];
let mode = "normal";
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

    if (/^\/vehicsim\/analysis\/runs\/10[12]$/.test(p)) {
      if (mode === "error") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({message:"Fixture unavailable"}) });
      const id = Number(p.split("/").at(-1));
      if (mode === "slow" && id === 101) await new Promise(resolve => setTimeout(resolve, 700));
      return reply({ run: {...inspectionRun, run_id: mode === "wrong-run" ? 999 : id},
        detail: detail === null ? null : {...detail, run_id: mode === "wrong-detail" ? 999 : id, headline: id === 102 ? "Run 102 only" : detail.headline } });
    }
    if (p === "/vehicsim/runs/101/playback") return reply({...detail, run_id:101, duration_s:0.5, frames, related_runs:[], crossing_x:30, lane_width_m:3.5, vehicle_length_m:4.8, vehicle_width_m:2, ttc_threshold_s:1.5});

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
  const url = "/analysis/failures/101?section=summary&signal=jerk_mps3&t=0.5&returnTo=" + encodeURIComponent(returnTo);

  const evidenceUrl = url.replace("section=summary", "section=evidence");
  const evidence = page.getByRole("tabpanel", {name:"Nguyên nhân & bằng chứng",exact:true});
  const identity = page.getByRole("region", {name:"Danh tính và nguồn dữ liệu run",exact:true});
  const summary = page.getByRole("region", {name:"Kết quả và chỉ số run",exact:true});
  const shot = async name => {await page.screenshot({path:path.join(output,name+".png"),fullPage:true});screenshots.push(name+".png");};
  const load = async () => {await page.goto(base+evidenceUrl);await evidence.waitFor();};
  for (const width of [375,390,768,1024,1440]) {
    await page.setViewportSize({width,height:900});await load();await shot("evidence-"+width);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Evidence overflow "+width);
    if (!baseline) {
      const first = evidence.getByRole("link",{name:/^Xem mốc/}).first();
      await first.focus();assert(await first.evaluate(el=>el.matches(":focus-visible")));
      await page.getByRole("tab",{name:"Nguyên nhân & bằng chứng",exact:true}).focus();
      await page.keyboard.press("Home");assert.equal(await page.getByRole("tab",{name:"Tổng quan & cấu hình",exact:true}).getAttribute("aria-selected"),"true");
      await page.keyboard.press("End");assert.equal(await evidence.getAttribute("hidden"),null);
    }
    await page.getByRole("tab",{name:"Tổng quan & cấu hình",exact:true}).click();await summary.waitFor();await shot("summary-"+width);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Page overflow "+width);
  }
  if (!baseline) {
    await page.goto(base+url);await summary.waitFor();
    assert.match(await summary.getByLabel("Va chạm theo outcome",{exact:true}).innerText(),/Có ghi nhận va chạm/);
    assert.match(await summary.getByLabel("Tốc độ va chạm",{exact:true}).innerText(),/10\.000 m\/s/);
    assert.match(await summary.getByLabel("Bắt đầu lệnh phanh",{exact:true}).innerText(),/0\.250 s/);
    detail={...original,metrics:{...original.metrics,impact_speed_mps:null}};
    await page.reload();await summary.waitFor();assert.match(await summary.getByLabel("Tốc độ va chạm",{exact:true}).innerText(),/—/);
    assert.match(await summary.getByLabel("RMS jerk",{exact:true}).innerText(),/2\.123/);
    detail=structuredClone(original);await load();
    assert.match(await identity.innerText(),/#42/);assert.match(await identity.innerText(),/CP_CROSSING/);
    assert.match(await identity.innerText(),/carla-0.9.16-xosc5/);
    const recorded = evidence.getByRole("region",{name:"Dữ liệu và mốc đã ghi",exact:true});
    await recorded.waitFor();
    assert.match(await recorded.innerText(),/metrics\.brake_onset_t/);
    assert.match(await recorded.innerText(),/không phải.*phanh thực sự/i);
    assert.equal(await recorded.locator("[data-evidence-marker]").count(),4);
    assert.equal(await recorded.locator('[data-evidence-marker*="hazard"],[data-evidence-marker*="applied"]').count(),0);
    const control = evidence.getByRole("article",{name:"Khâu Điều khiển",exact:true});
    assert.match(await control.innerText(),/stage_evidence\[0\]\.values\.brake_onset_t/);
    assert.match(await control.innerText(),/Chỉ số đã tính/);
    let link = control.getByRole("link",{name:/^Playback khâu/});
    await link.focus();assert(await link.evaluate(el=>el.matches(":focus-visible")));await link.press("Enter");
    await page.waitForURL(u=>u.pathname.endsWith("/playback"));
    let u=new URL(page.url());assert.equal(u.searchParams.get("t"),"0.25");assert.equal(u.searchParams.get("signal"),"jerk_mps3");assert.equal(u.searchParams.get("returnTo"),returnTo);
    await load();
    await page.getByRole("tab",{name:"Nguyên nhân & bằng chứng",exact:true}).focus();
    await page.keyboard.press("Home");assert.equal(await page.getByRole("tab",{name:"Tổng quan & cấu hình",exact:true}).getAttribute("aria-selected"),"true");
    await page.keyboard.press("End");assert.equal(await evidence.getAttribute("hidden"),null);
    detail={...original,verdict:"PASS",outcome:"SAFE",failure_type:null,chain:[],failure_class:null,chain_confidence:null};
    await load();assert.match(await evidence.innerText(),/API chưa có phân loại lỗi/);assert.match(await evidence.innerText(),/Đạt theo luật hiện hành \(PASS\)/);
    assert.doesNotMatch(await evidence.innerText(),/Không ghi nhận lỗi theo luật hiện hành/);
    detail={...original,chain:null,failure_class:null,chain_confidence:null,stage_evidence:[null,{stage:"CONTROL",values:null},{stage:"CONTROL",values:{brake_onset_t:null,response_time_s:0}},{stage:"CUSTOM",values:{signed:-0.0004,decision_t:0.25}}]};
    await load();assert.match(await evidence.innerText(),/Chưa có số đo/);assert.match(await evidence.innerText(),/0\.000 s/);
    assert.match(await evidence.innerText(),/CUSTOM/);assert.match(await evidence.innerText(),/-0\.0004/);
    assert.equal(await evidence.locator('[data-evidence-source="stage_evidence[3].values.decision_t"]').getByRole("link").count(),0,"Unknown stage cannot invent a timed event");
    await shot("partial-evidence");
    detail={...original,stage_evidence:[{stage:"CONTROL",values:{brake_onset_t:0.251,response_time_s:0.001}},{stage:"CONTROL",values:{brake_onset_t:9,response_time_s:null}}]};
    await load();link=evidence.getByRole("article",{name:"Khâu Điều khiển",exact:true}).getByRole("link",{name:/^Playback khâu/});
    assert.equal(await link.count(),1);assert.match(await link.innerText(),/0\.251/);assert.equal(new URL(await link.getAttribute("href"),base).searchParams.get("t"),"0.251");
    assert.equal(await evidence.locator('[data-evidence-source="stage_evidence[1].values.brake_onset_t"]').getByRole("link").count(),0);
    detail={...original,metrics:{...original.metrics,brake_onset_t:null,min_ttc_s:null},events:[],telemetry:[],motion_telemetry:[]};
    await load();assert.equal(await evidence.getByRole("link",{name:/^(Playback khâu|Xem telemetry khâu|Xem mốc)/}).count(),0);
    assert.match(await evidence.innerText(),/chưa có timestamp hợp lệ|ngoài vùng telemetry|không có vùng telemetry/i);await shot("no-telemetry");
    for (const patch of [{evaluation_valid:false},{evaluation_valid:undefined},{verdict:null},{failure_type:"UNSUPPORTED_NEW_TYPE",chain:[],failure_class:null}]) {
      detail={...original,...patch};await load();
      if ("evaluation_valid" in patch || patch.verdict===null) assert.match(await evidence.innerText(),/Chưa đủ dữ liệu|chưa xác nhận|chưa có verdict/);
      if (patch.failure_type) assert.match(await evidence.innerText(),/UNSUPPORTED_NEW_TYPE/);
    }
    detail={...original,simulator:null,environment:{...original.environment,category:"CPLA"}};inspectionRun={...run,simulator:null};
    await load();assert.match(await identity.innerText(),/Chưa có danh tính simulator/);assert.match(await identity.innerText(),/chưa được hỗ trợ/i);await shot("unknown-source-unsupported");
    detail=null;inspectionRun={...run,status:"RUNNING",trace_available:false};await page.reload();await page.getByRole("region",{name:"Run chưa có kết quả phân tích",exact:true}).waitFor();
    inspectionRun={...run,status:"FAILED",trace_available:false,error:"Fixture worker failed",end_reason:"FAILED"};await page.reload();await page.getByRole("alert").filter({hasText:"Fixture worker failed"}).waitFor();
    detail=structuredClone(original);inspectionRun=structuredClone(run);
    for (mode of ["wrong-run","wrong-detail"]) {
      await page.reload();await page.getByText("Dữ liệu trả về không khớp lượt chạy đang mở.",{exact:true}).waitFor();
      assert.equal(await evidence.count(),0);assert.equal(await identity.count(),0);
    }
    mode="error";await page.reload();await page.getByRole("button",{name:"Thử tải lại",exact:true}).waitFor();
    mode="normal";await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();await evidence.waitFor();
    mode="slow";const request101=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith("/analysis/runs/101"));
    await page.goto(base+evidenceUrl);await request101;
    await page.goto(base+evidenceUrl.replace("/101?","/102?"));await evidence.waitFor();
    await page.waitForTimeout(800);assert.equal(new URL(page.url()).pathname,"/analysis/failures/102");
    assert.match(await page.getByRole("heading",{level:1}).innerText(),/102/);
    assert.equal(await evidence.locator('[data-evidence-run="101"]').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",screenshots,errors,businessWrites:0,carlaRuntimeVerified:false,liveBackendVerified:false,figmaCompared:false},null,2));
    console.log("PASS: run identity, source mapping, null/partial, observed vs rules, exact timestamp links, mismatch/error/retry/run switching, five viewports and keyboard");
  } else await fs.writeFile(path.join(output,"observed.json"),JSON.stringify({kind:"BASELINE_CAPTURE_ONLY",screenshots,errors},null,2));
} finally {await browser.close();}
