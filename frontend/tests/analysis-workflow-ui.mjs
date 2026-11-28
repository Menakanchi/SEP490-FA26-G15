import { prepareAnalysisArtifacts } from "./helpers/analysis-artifacts.mjs";
/**
 * UI regression using recorded parity fixtures and browser-only API interception.
 * This does NOT verify a live backend, authentication, database, CARLA, or Figma.
 * npm install --no-save --package-lock=false playwright; npm run build; npm start -- --port 3100
 * node tests/analysis-redesign.mjs
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const fixtures=JSON.parse(gunzipSync(await fs.readFile(path.join(root,"src/test/resources/parity/kinematic.json.gz"))));
const output = await prepareAnalysisArtifacts(path.join(root,"data/analysis-fe-r2/workflow"));
const version="adr040-stored-aggregation/1";
const cases=fixtures.filter(c=>c.evaluation.outcome!=="TIMEOUT").slice(0,45);
const runs=cases.map((c,i)=>({revision:`fixture-${i}`,run_id:1000+i,scenario_id:1,scenario_version_id:100+i,version_no:i+1,family:"CP Crossing · Fixture kiểm thử UI",variant:`CP-${String(i+1).padStart(3,"0")}`,seed:c.seed,baseline_id:1,vehicle_id:1,simulator:"vehicsim-kinematic-1.0",dt:0.05,status:"COMPLETED",outcome:c.evaluation.aeb_result.false_activation?"FALSE_BRAKING":c.evaluation.outcome,weather:c.case.weather,time_of_day:c.case.time_of_day,failure_class:c.evaluation.chain.find(s=>!s.passed)?.stage??null,error:null,end_reason:c.outcome.end_reason,trace_available:true,created_at:"2026-11-03T08:00:00",metrics:{rms_jerk_mps3:c.outcome.metrics.rms_jerk_mps3,impact_speed_mps:c.outcome.metrics.impact_speed_mps,stopping_distance_m:c.outcome.metrics.stopping_distance_m}}));
const user={id:999999,email:"ui-fixture@example.invalid",full_name:"UI Fixture",role:"ENGINEER"};
const context={project:{id:999999,name:"UI Fixture"},workspace:{id:999999,name:"Kiểm thử UI"},vehicle:{id:1,name:"Audi e-tron"},simulator:"vehicsim-kinematic-1.0",system:{id:1,name:"AEB",baseline:{id:1,label:"v1.0"}},versions:[{id:1,label:"v1.0",status:"BASELINE"}],families:[{id:1,code:"CP",name:runs[0].family}],parameters:[],reviewer_projects:[],reviewer_can_decide:true,project_writable:true};
const caseFor=id=>cases[id-1000];
function detailFor(id){
 const c=caseFor(id),o=c.outcome,m=o.metrics,run=runs.find(r=>r.run_id===id);
 const motion=o.frames.map((f,i)=>({t:f.t,ego_x_m:f.ego_x,ego_speed_mps:f.ego_v,ego_accel_mps2:f.ego_a,target_x_m:f.ped_x,target_y_m:f.ped_y,target_vy_mps:f.ped_vy,perceived_y_m:f.perceived_y,ttc_perceived_s:f.ttc,ttc_gt_s:f.ttc_gt,jerk_mps3:i?(f.ego_a-o.frames[i-1].ego_a)/(f.t-o.frames[i-1].t):null,crossing_distance_m:o.crossing_x-f.ego_x,motion_state:"STEADY"}));
 const header={...run,purpose:"BASELINE",variant_id:run.scenario_version_id,vehicle:"Audi e-tron",config:"v1.0",date:run.created_at,evaluation_valid:true,summary:"Dữ liệu parity dùng riêng cho kiểm thử UI",headline:c.evaluation.headline,verdict:c.evaluation.verdict};
 return {...header,motion_telemetry:motion,chain:c.evaluation.chain,chain_confidence:c.evaluation.chain.find(s=>!s.passed)?.confidence??null,configuration:Object.entries(c.params).map(([code,value])=>({code,value,name:code,unit:""})),environment:{ego_speed_kmh:c.case.ego_speed_kmh,trigger_distance_m:c.case.trigger_distance_m,pedestrian_speed_mps:c.case.pedestrian_speed_mps,stops_at_curb:c.case.stops_at_curb,weather:c.case.weather,time_of_day:c.case.time_of_day,road_friction:o.case.road_friction},ttc_threshold_s:c.params.TTC_THRESHOLD,metrics:{...m,impact_speed_kmh:m.impact_speed_mps==null?null:m.impact_speed_mps*3.6,aeb_activation_t:m.aeb_decision_t,aeb_activation_ttc_s:m.aeb_decision_ttc_s,metric_source:"SIMULATOR_RESULT"},events:o.events,telemetry:o.frames.map(f=>({t:f.t,ttc:f.ttc,speed_kmh:f.ego_v*3.6})),stage_evidence:[{stage:"PERCEPTION",values:{first_detection_t:m.first_detection_t,first_detection_distance_m:m.first_detection_distance_m}},{stage:"CONTROL",values:{brake_onset_t:m.brake_onset_t,response_time_s:m.braking_latency_s}}],scene:{crossing_x:o.crossing_x,lane_width_m:3.5,vehicle_length_m:4.8,vehicle_width_m:2,path:o.frames.map(f=>({t:f.t,x:f.ego_x,ped_y:f.ped_y})),end:o.frames.at(-1)},similar:[]};
}
function aggregate(list){
 const out={version,invalid_runs:0};
 for(const [key,unit] of [["rms_jerk_mps3","m/s³"],["impact_speed_mps","m/s"],["stopping_distance_m","m"]]){
  const values=list.map(r=>key==="impact_speed_mps"&&r.outcome!=="COLLISION"?0:r.metrics[key]).filter(v=>v!=null);
  out[key]={value:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,samples:values.length,missing:0,notApplicable:list.length-values.length,unit,status:values.length?"VALID":"NOT_APPLICABLE"};
 }return out;
}
// Parity scalars above are unchanged. Ownership/status/error controls below are UI fixtures only.
let actor = { ...user }, defaultProject = context.project.id, listMode = "normal", saveStatus = 200, checkMode = "normal", unfinished = false;
let contextFailure = false, withSibling = false;
const safeSource = runs.find(run => run.outcome === "SAFE" && run.metrics.rms_jerk_mps3 != null && run.metrics.stopping_distance_m != null);
const uiSibling = { ...safeSource, run_id: 8000, revision: "UI-ONLY-variant-seed-sibling", seed: safeSource.seed + 1, variant: "UI-only sibling of " + safeSource.variant };
let saved = null, snapshotCurrent = true, nextId = 9201, pendingGate = null;
const errors = [], runtimeWarnings = [], writes = [], requests = [], checks = [], screenshots = [], gates = [];
const secondProject = context.project.id - 1;
function holdNext(predicate) {
  let release, seen;
  const released = new Promise(resolve => { release = resolve; }), requested = new Promise(resolve => { seen = resolve; });
  const gate = { predicate, release, seen, released, requested }; pendingGate = gate; gates.push(gate); return gate;
}
const scopedRuns = project => { const members = withSibling ? [...runs, uiSibling] : runs; return project === secondProject ? members.map(run => ({ ...run, run_id: run.run_id + 5000, revision: "project-b-" + run.revision, family: "UI Project B fixture" })) : members; };
function dashboard(url, project, mode) {
  let items = mode === "empty" ? [] : [...scopedRuns(project)].reverse();
  for (const [key, value] of url.searchParams)
    if (["scenario_id", "variant_id", "aeb_version_id", "vehicle_id", "simulator", "status", "weather", "time_of_day", "failure_class"].includes(key))
      items = items.filter(run => String(run[key === "variant_id" ? "scenario_version_id" : key === "aeb_version_id" ? "baseline_id" : key]) === value);
  const page = Number(url.searchParams.get("page")), size = Number(url.searchParams.get("page_size"));
  return { total: items.length, page, page_size: size, items: items.slice((page - 1) * size, page * size),
    counts: Object.fromEntries(["SAFE", "COLLISION", "FALSE_BRAKING", "NEAR_MISS", "MISSED_BRAKING", "OTHER_FAILURE", "ERROR", "CANCELLED", "TIMEOUT", "INCOMPLETE", "NOT_FINISHED"].map(key => [key, items.filter(run => run.outcome === key).length])),
    objective_groups: [], evaluation_version: version };
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
try {
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await browserContext.addInitScript(() => {
    window.__analysisDecoded = [];
    const fetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetch(...args), json = response.json.bind(response);
      response.json = async () => { const body = await json(); window.__analysisDecoded.push(response.url); return body; };
      return response;
    };
  });
  await browserContext.route("**/api/v1/**", async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace("/api/v1", ""), method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
    const project = Number(req.headers()["x-vehicsim-project"]) || defaultProject;
    requests.push({ path: p, query: url.search, method, project });
    const reply = async (body, status = 200) => {
      if (pendingGate?.predicate({ p, url, method })) { const gate = pendingGate; pendingGate = null; gate.seen(); await gate.released; }
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    };
    if (p === "/auth/login") return reply({ access_token: "fe-r2-fixture-session-" + actor.id, token_type: "bearer", expires_in: 3600, user: actor });
    if (p === "/auth/me") return reply(actor);
    if (p === "/vehicsim/context" && contextFailure) return reply({ detail: "Fixture context temporarily unavailable" }, 503);
    if (p === "/vehicsim/projects") return reply({items:[],total:0,page:1,page_size:9,active_count:0,archived_count:0});
    if (p === "/vehicsim/context") return reply({ ...context, project: { id: project, name: project === secondProject ? "UI Project B fixture" : "UI Project A fixture" },
      reviewer_projects: [context.project.id, secondProject].map(id => ({ id, name: id === secondProject ? "Project B" : "Project A", workspace_name: "QA", can_decide: true })) });
    if (p === "/vehicsim/analysis/v3/sources") return reply({items:[],limit:20,offset:0}); // FE-R4: empty FA storage is independent of legacy runs.
    if (p === "/vehicsim/analysis/v3/explorer/scenarios") return reply({project_id:project,items:[],total:0,limit:20,offset:0});
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (p === "/vehicsim/analysis/runs") {
      if (listMode === "network") return route.abort("failed");
      if ([401, 403, 503].includes(listMode)) return reply({ detail: "Fixture request failed" }, listMode);
      if (listMode === "malformed") return reply({ items: null });
      return reply(dashboard(url, project, listMode));
    }
    if (p === "/vehicsim/analysis/selections") {
      const body = req.postDataJSON(); writes.push({ path: p, body, project });
      if (saveStatus !== 200) return reply({ detail: "Fixture rejected selection; review recorded sources" }, saveStatus);
      const all = [...body.optimization_run_ids, ...body.validation_run_ids], members = scopedRuns(project).filter(run => all.includes(run.run_id));
      saved = { schema: "vehicsim.analysis-dataset/v2", id: nextId++, baseline_current: true, handoff_ready: true, scenario: { id: 1, name: "UI snapshot fixture", code: "CP", category: "CP_CROSSING" }, baseline: { id: 1, label: "Fixture v1.0" },
        reference: { vehicle_id: 1, simulator: runs[0].simulator, dt: .05 }, evaluation: { version, carla_observational_only: false }, runs: members,
        optimization_run_ids: body.optimization_run_ids, validation_run_ids: body.validation_run_ids,
        optimization_objectives: aggregate(members.filter(run => body.optimization_run_ids.includes(run.run_id))), validation_objectives: aggregate(members.filter(run => body.validation_run_ids.includes(run.run_id))) };
      return reply(saved);
    }
    const snapshot = p.match(/^\/vehicsim\/analysis\/datasets\/(\d+)(\/handoff)?$/);
    if (snapshot) {
      if (!saved) return reply({ detail: "Fixture snapshot not found" }, 404);
      const body = { ...saved, id: Number(snapshot[1]), baseline_current: snapshotCurrent, handoff_ready: undefined };
      if (snapshot[2]) {
        if ([400, 403, 409, 503].includes(checkMode)) return reply({ detail: "Fixture source revision or baseline rejected" }, checkMode);
        return reply({ ...body, dataset_digest: "d".repeat(64), handoff_ready: checkMode !== "notready", ...(checkMode === "mismatch" ? { optimization_run_ids: saved.validation_run_ids, validation_run_ids: saved.optimization_run_ids } : {}) });
      }
      return reply(body);
    }
    const inspection = p.match(/^\/vehicsim\/analysis\/runs\/(\d+)$/);
    if (inspection) {
      const id = Number(inspection[1]);
      return reply(unfinished ? { run: { ...runs.find(run => run.run_id === id), status: "RUNNING", outcome: "NOT_FINISHED" }, detail: null } : { run: runs.find(run => run.run_id === id), detail: detailFor(id) });
    }
    const playback = p.match(/^\/vehicsim\/runs\/(\d+)\/playback$/);
    if (playback) { const id = Number(playback[1]); return reply({ ...detailFor(id), ...caseFor(id).outcome, related_runs: [], motion_telemetry: detailFor(id).motion_telemetry }); }
    // Shared landing pages are navigation-only dependencies of fixture login/project switching.
    if (method !== "GET") { writes.push({ path: p, project }); return reply({ detail: "Forbidden fixture mutation" }, 405); }
    return reply({ detail: "Outside the Failure Analysis fixture scope" }, 404);
  });
  const page = await browserContext.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (["warning", "error"].includes(message.type()) && !/Failed to load resource|net::ERR_/.test(message.text())) runtimeWarnings.push(message.text()); });
  const base = process.env.ANALYSIS_UI_URL || "http://127.0.0.1:3142";
  const table = page.getByRole("region", { name: "Bảng lượt chạy baseline, cuộn ngang để xem thêm", exact: true }), rows = table.locator("tr[data-run-id]");
  const dataset = page.locator('[data-analysis-tool="dataset"]'), snapshotPanel = dataset.getByRole("region", { name: "Snapshot và bàn giao", exact: true });
  const safe = runs.filter(run => run.outcome === "SAFE" && run.metrics.rms_jerk_mps3 != null && run.metrics.stopping_distance_m != null).slice(0, 2);
  assert.equal(safe.length, 2);
  const choose = (run, role) => table.getByLabel(`Tập của run ${run.run_id}`, { exact: true }).selectOption(role);
  const freeze = () => dataset.getByRole("button", { name: "Chốt tập", exact: true });
  const check = () => snapshotPanel.getByRole("button", { name: "Kiểm tra trước bàn giao", exact: true });
  const open = () => snapshotPanel.getByRole("button", { name: "Mở module tối ưu →", exact: true });
  const ready = () => rows.first().waitFor();
  const goto = async (query = "page_size=50") => { await page.goto(base + "/analysis/failures?" + query); await ready(); };
  const login = async () => { await page.goto(base + "/login"); await page.getByLabel("Email", { exact: true }).fill(actor.email); await page.getByLabel("Mật khẩu", { exact: true }).fill("Fixture-password-only"); await page.getByRole("button", { name: "Đăng nhập", exact: true }).click(); await page.waitForURL(u => u.pathname !== "/login"); };
  const draftKey = (who = actor.id, project = context.project.id) => `vehicsim.analysis.selection.v1:${who}:${project}`;
  const draft = key => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "{}"), key);
  const capture = async name => {
    await page.screenshot({ path: path.join(output, name + ".png"), fullPage: true }); screenshots.push(name + ".png");
    if (name.startsWith("snapshot-")) { await snapshotPanel.screenshot({ path: path.join(output, name + "-panel.png") }); screenshots.push(name + "-panel.png"); }
    if (name.startsWith("freeze-error")) { await dataset.getByRole("region", { name: "Kiểm tra bản nháp", exact: true }).screenshot({ path: path.join(output, name + "-panel.png") }); screenshots.push(name + "-panel.png"); }
    if (name.startsWith("workspace-")) { await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })); await page.screenshot({ path: path.join(output, name + "-viewport.png"), fullPage: false }); screenshots.push(name + "-viewport.png"); }
  };
  await login(); await goto("view=runs&scenario_id=1&page=2&page_size=10&sort=oldest&q=CP");
  const backUrl = page.url(); await table.getByRole("link", { name: /^Chi tiết run / }).first().click();
  await page.getByRole("region", { name: "Kết luận phân tích", exact: true }).waitFor();
  await page.getByRole("link", { name: "← Về danh sách đang xem", exact: true }).click(); await ready(); assert.equal(page.url(), backUrl);
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("COMPLETED"); await ready(); assert.equal(new URL(page.url()).searchParams.get("page"), null);
  checks.push("filter/page/size/q/sort preserved through detail/return; changing filter resets page only");

  await goto(); const requestCount = requests.filter(r => r.path === "/vehicsim/analysis/runs").length;
  await page.getByLabel("Tìm trong trang hiện tại", { exact: true }).fill("not-on-this-page"); await page.getByText("Không có kết quả tìm trong trang này.", { exact: true }).waitFor();
  assert.equal(requests.filter(r => r.path === "/vehicsim/analysis/runs").length, requestCount);
  await page.getByRole("button", { name: "Hiện toàn bộ trang này", exact: true }).click(); await ready();
  const late = holdNext(({ p, url }) => p === "/vehicsim/analysis/runs" && url.searchParams.get("status") === "RUNNING");
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("RUNNING"); await late.requested;
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("COMPLETED"); await ready(); late.release();
  await page.waitForFunction(() => window.__analysisDecoded.some(url => url.includes("status=RUNNING")));
  assert.equal(await rows.count(), runs.length); assert.equal(await page.getByLabel("Trạng thái", { exact: true }).inputValue(), "COMPLETED");
  checks.push("current-page search makes no API query; held old filter response cannot overwrite current rows");

  await page.getByLabel("Họ kịch bản", { exact: true }).selectOption("");
  // A direct shared URL with an unknown family is not evidence that the project has no runs.
  await page.goto(base + "/analysis/failures?scenario_id=123456"); await page.getByText("Không có run khớp bộ lọc.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Xóa bộ lọc danh sách", exact: true }).click(); await ready();
  listMode = "empty"; await page.getByRole("button", { name: "Tải lại kết quả", exact: true }).click(); await page.getByText("Chưa có run baseline để hiển thị.", { exact: true }).waitFor();
  for (const failure of [503, 403, "network", "malformed"]) {
    listMode = failure; await page.getByRole("button", { name: "Tải lại kết quả", exact: true }).click(); await page.locator(".analysis-workspace").getByRole("alert").waitFor(); assert.equal(await rows.count(), 0);
    listMode = "normal"; await page.getByRole("button", { name: "Thử tải lại", exact: true }).click(); await ready();
  }
  checks.push("no baseline / no filter match / network / malformed / 403 / 503 are separate, recoverable states");

  await goto("view=dataset&page_size=50");
  await choose(safe[0], "OPTIMIZATION"); await choose(safe[1], "VALIDATION");
  await dataset.getByRole("button", { name: "Đóng rà soát", exact: true }).click(); await page.waitForFunction(() => document.activeElement?.id === "analysis-prepare-trigger");
  await page.keyboard.press("Enter"); await dataset.getByRole("heading", { name: "Bản nháp đang chọn", exact: true }).waitFor();
  const expectedDraft = await draft(draftKey()); assert.equal(Object.keys(expectedDraft).length, 2);
  await choose(safe[1], "OPTIMIZATION"); assert(await freeze().isDisabled()); await choose(safe[1], "VALIDATION"); assert(await freeze().isEnabled());
  withSibling = true; await page.getByRole("button", { name: "Tải lại kết quả", exact: true }).click(); await table.getByLabel(`Tập của run ${uiSibling.run_id}`, { exact: true }).waitFor();
  await choose(uiSibling, "VALIDATION"); assert(await freeze().isDisabled());
  assert.equal(await dataset.getByText("Không trùng biến thể giữa hai tập; không lặp biến thể/seed", { exact: true }).locator("../..").getAttribute("data-passed"), "false");
  await choose(uiSibling, ""); withSibling = false; await page.getByRole("button", { name: "Tải lại kết quả", exact: true }).click(); await ready(); assert(await freeze().isEnabled());
  checks.push("explicit UI-only sibling metadata exercises cross-role variant isolation with real role selection; producer scalars unchanged");
  const failedStates = [400, 409, 429, 500, 403];
  for (const status of failedStates) {
    saveStatus = status; const count = writes.length; await freeze().click();
    const alert = dataset.locator(".analysis-action-error"); await alert.waitFor(); await page.waitForFunction(() => document.activeElement?.classList.contains("analysis-action-error"));
    assert.equal(writes.length, count + 1); assert.deepEqual(await draft(draftKey()), expectedDraft); assert(await freeze().isEnabled());
    await page.getByLabel("Trạng thái", { exact: true }).selectOption(status === 429 ? "COMPLETED" : ""); await ready(); assert.equal(writes.length, count + 1, "No automatic POST retry");
  }
  await capture("freeze-error-preserves-draft");
  saveStatus = 200; const savedGate = holdNext(({ p }) => p === "/vehicsim/analysis/selections"), beforeSave = writes.length;
  await freeze().dblclick(); await savedGate.requested; assert(await dataset.getByRole("button", { name: "Đang chốt hai tập…", exact: true }).isDisabled()); assert.equal(writes.length, beforeSave + 1);
  savedGate.release(); await snapshotPanel.getByRole("heading", { name: /Tập đã chốt #9201/ }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/analysis/failures"); assert.equal(await open().count(), 0); assert.equal(await snapshotPanel.locator("[data-handoff-checked]").count(), 0);
  assert.equal(requests.filter(r => r.path.endsWith("/handoff")).length, 0, "POST ready flag does not trigger a handoff check or navigation");
  await choose(safe[1], "OPTIMIZATION"); assert.equal(new URL(page.url()).searchParams.get("dataset_id"), "9201"); assert.equal(saved.validation_run_ids[0], safe[1].run_id);
  await snapshotPanel.getByRole("heading", { name: /Tập đã chốt #9201/ }).waitFor(); await choose(safe[1], "VALIDATION");
  await page.reload(); await snapshotPanel.getByRole("heading", { name: /Tập đã chốt #9201/ }).waitFor(); assert.deepEqual(await draft(draftKey()), expectedDraft);
  await snapshotPanel.locator("summary").filter({ hasText: "Bàn giao theo quy trình trước" }).click();
  await check().click(); await snapshotPanel.locator("[data-handoff-checked]").waitFor(); assert(await open().isEnabled()); assert.equal(new URL(page.url()).pathname, "/analysis/failures");
  await capture("snapshot-checked-desktop");
  for (const failure of [409, 403, "notready", "mismatch"]) {
    checkMode = failure; await check().click(); await dataset.locator(".analysis-action-error").waitFor(); assert.equal(await open().count(), 0);
  }
  checkMode = "normal"; await check().click(); await open().waitFor(); await open().click(); await page.waitForURL(u => u.pathname === "/aeb/mobo/new" && u.searchParams.get("dataset_id") === "9201");
  await page.goBack(); await snapshotPanel.getByRole("heading", { name: /Tập đã chốt #9201/ }).waitFor(); assert.equal(await open().count(), 0);
  snapshotCurrent = false; await dataset.getByRole("button", { name: "Tải lại tập đã chốt", exact: true }).click(); await snapshotPanel.getByText(/Baseline đã đổi hoặc chưa được xác nhận/).waitFor(); await snapshotPanel.locator("summary").filter({ hasText: "Bàn giao theo quy trình trước" }).click(); assert(await check().isDisabled()); await capture("snapshot-stale-read-only"); snapshotCurrent = true;
  checks.push("draft close/reopen/focus, reassign, revisions, 400/409/429/500/403 retention, no retry/double POST, immutable saved ID, explicit check/open, stale/reload revoke readiness");

  const id = safe[0].run_id, returnTo = "/validation/regression/77", query = `?section=telemetry&t=1.25&signal=jerk_mps3&compare=${safe[1].run_id}&returnTo=${encodeURIComponent(returnTo)}`;
  unfinished = true; await page.goto(base + `/analysis/failures/${id}` + query); await page.getByRole("region", { name: "Run chưa có kết quả phân tích", exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Kết luận phân tích", exact: true }).count(), 0); unfinished = false; await page.getByRole("button", { name: "Kiểm tra lại trạng thái", exact: true }).click();
  await page.getByRole("link", { name: "Phát lại mô phỏng", exact: true }).click(); await page.getByRole("slider", { name: "Thời gian playback", exact: true }).waitFor();
  assert.equal(Number(await page.getByRole("slider", { name: "Thời gian playback", exact: true }).inputValue()), 1.25);
  await page.getByRole("link", { name: "Xem phân tích run", exact: true }).click(); await page.getByRole("region", { name: "Kết luận phân tích", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("t"), "1.25"); assert.equal(new URL(page.url()).searchParams.get("compare"), String(safe[1].run_id)); assert.equal(new URL(page.url()).searchParams.get("signal"), "jerk_mps3"); assert.equal(new URL(page.url()).searchParams.get("returnTo"), returnTo);
  await page.getByRole("link", { name: "← Về kiểm chứng RT-077", exact: true }).waitFor();
  checks.push("unfinished status-only refresh, regression whitelist, recorded playback/detail time/signal/compare compatibility");

  await goto("view=dataset&page_size=50");
  const staleSave = holdNext(({ p }) => p === "/vehicsim/analysis/selections");
  await freeze().click(); await staleSave.requested;
  const oldProject = holdNext(({ p }) => p === "/vehicsim/analysis/runs");
  await page.getByRole("button", { name: "Tải lại kết quả", exact: true }).click(); await oldProject.requested;
  await page.getByLabel("Project đang xem", { exact: true }).selectOption(String(secondProject)); await page.waitForURL(u => u.pathname === "/");
  const resultsLink = page.getByRole("link", { name: "Kết quả & phân tích", exact: true });
  if (!(await resultsLink.isVisible())) await page.getByRole("button", { name: "Mở rộng Xem kết quả", exact: true }).click();
  await resultsLink.click(); await page.waitForURL(u => u.pathname === "/analysis/failures"); await page.getByRole("heading", { name: "Họ kịch bản", exact: true }).waitFor();
  await page.evaluate(() => history.pushState(null, "", "/analysis/failures?view=dataset&page_size=50")); await ready();
  await dataset.getByRole("heading", { name: "Bản nháp đang chọn", exact: true }).waitFor(); assert.equal(await dataset.locator("tr[data-draft-run]").count(), 0); assert.equal(await rows.first().getAttribute("data-run-id"), String(runs.at(-1).run_id + 5000));
  const decodedBeforeRelease = await page.evaluate(() => window.__analysisDecoded.filter(url => url.includes("analysis/runs")).length);
  oldProject.release(); await page.waitForFunction(before => window.__analysisDecoded.filter(url => url.includes("analysis/runs")).length > before, decodedBeforeRelease);
  const savesDecoded = await page.evaluate(() => window.__analysisDecoded.filter(url => url.includes("analysis/selections")).length);
  staleSave.release(); await page.waitForFunction(before => window.__analysisDecoded.filter(url => url.includes("analysis/selections")).length > before, savesDecoded);
  assert.equal(new URL(page.url()).searchParams.get("dataset_id"), null); assert.equal(await snapshotPanel.getByRole("heading", { name: /Tập đã chốt #/ }).count(), 0);
  assert.equal(await rows.first().getAttribute("data-run-id"), String(runs.at(-1).run_id + 5000)); assert.deepEqual(await draft(draftKey(user.id)), expectedDraft);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click(); await page.waitForURL(u => u.pathname === "/login");
  actor = { ...user, id: user.id + 1, email: "fe-r2-second-actor@example.invalid" }; defaultProject = secondProject;
  await login(); await goto("view=dataset&page_size=50"); assert.equal(await dataset.locator("tr[data-draft-run]").count(), 0); assert.deepEqual(await draft(draftKey(user.id)), expectedDraft);
  assert.deepEqual(await draft(draftKey(actor.id, secondProject)), {});
  checks.push("actual project selector and logout/login isolate account/project rows and drafts; prior draft retained only under its original key");

  actor = { ...actor, role: "REVIEWER" }; await goto("view=dataset&page_size=50"); assert(await freeze().isDisabled()); assert(await table.getByRole("combobox").first().isDisabled());
  checks.push("read-only role keeps reading but cannot assign or freeze");
  await goto("page_size=10");
  for (const width of [320, 375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await table.focus(); await page.keyboard.press("ArrowRight");
    if (await table.evaluate(node => node.scrollWidth > node.clientWidth + 1))
      await page.waitForFunction(() => document.querySelector('[aria-label="Bảng lượt chạy baseline, cuộn ngang để xem thêm"]').scrollLeft > 0);
    for (let n = 0; n < 8; n++) { await page.keyboard.press("Tab"); if (/Chi tiết run/.test(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || ""))) break; }
    assert(await page.evaluate(() => /Chi tiết run/.test(document.activeElement?.getAttribute("aria-label") || "")));
    assert(await page.evaluate(() => document.activeElement?.matches(":focus-visible")));
    if ([375, 1440].includes(width)) await capture("workspace-" + width);
  }
  const cdp = await browserContext.newCDPSession(page); await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  assert.equal(await page.evaluate(() => visualViewport.scale), 2); await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await page.setViewportSize({ width: 720, height: 450 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await capture("zoom-equivalent-reflow");
  assert(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches));
  checks.push("five widths, isolated keyboard table scroll/action/focus-visible; reduced-motion; 200% CDP pinch and 720px reflow (not native browser zoom certification)");
  const beforeMissingContext = requests.filter(r => r.path === "/vehicsim/analysis/runs").length;
  contextFailure = true; await page.reload(); await page.getByRole("heading", { name: "Chưa tải được ngữ cảnh dự án", exact: true }).waitFor();
  assert.equal(await rows.count(), 0); assert.equal(requests.filter(r => r.path === "/vehicsim/analysis/runs").length, beforeMissingContext);
  contextFailure = false; await page.getByRole("button", { name: "Thử tải lại ngữ cảnh", exact: true }).click(); await ready();
  checks.push("missing/error project context suspends analysis reads and hides previous content until real provider refresh");
  listMode = 401; await page.getByRole("button", { name: "Tải lại kết quả", exact: true }).click(); await page.waitForURL(u => u.pathname === "/login"); assert.equal(await rows.count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("vehicsim_access_token")), null);
  checks.push("401 uses real shared session-expiry flow; no prior analysis data after logout");
  actor = { ...actor, role: "EXPERIENCER" }; listMode = "normal";
  await login(); const readsBeforeNoProject = requests.filter(r => r.path === "/vehicsim/analysis/runs").length;
  await page.goto(base + "/analysis/failures"); await page.waitForURL(u => u.pathname === "/projects");
  assert.equal(requests.filter(r => r.path === "/vehicsim/analysis/runs").length, readsBeforeNoProject); assert.equal(await rows.count(), 0);
  checks.push("no selected project follows existing project picker and never queries or reuses old analysis rows");
  assert.deepEqual(errors, []); assert.deepEqual(runtimeWarnings, []); assert(writes.every(w => w.path === "/vehicsim/analysis/selections"));
  await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", kind: "BROWSER_FIXTURE_ONLY", checks, screenshots, errors, runtimeWarnings,
    businessWrites: writes.length, liveBackendVerified: false, carlaRuntimeVerified: false, figmaVerified: false }, null, 2));
  console.log("PASS: FE-R2 real UI workflow/races/ownership/freeze/check/open/accessibility; HTTP fixtures only");
} finally { for (const gate of gates) gate.release(); await browser.close(); }
