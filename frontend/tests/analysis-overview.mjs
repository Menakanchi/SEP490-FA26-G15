import { prepareAnalysisArtifacts } from "./helpers/analysis-artifacts.mjs";
/** Overview contract/browser regression. API fixtures only; no live backend or simulator. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = await prepareAnalysisArtifacts(path.join(root, "data/analysis-phase12-2026-11-14", process.env.OVERVIEW_BASELINE === "1" ? "before" : "after"));


const base = process.env.ANALYSIS_UI_URL || "http://127.0.0.1:3124";
const viewports = [[375, 812], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
const actor = { id: 999912, email: "overview@example.invalid", full_name: "Overview fixture", role: "ENGINEER" };
const project = { id: 999912, name: "Overview fixture" };
const version = "adr040-stored-aggregation/1";
const objective = (value, unit) => ({ value, unit, samples: 8, missing: 0, notApplicable: 2, status: "VALID" });
const run = (id, patch = {}) => ({ revision: "fixture-" + id, run_id: id, scenario_id: 42, scenario_version_id: id + 100,
  version_no: id, family: "Xe phía trước · Fixture", variant: "CCRM-" + id, seed: 48846,
  baseline_id: 7, vehicle_id: 2, simulator: "carla-0.9.16-xosc5", dt: 0.01, status: "COMPLETED",
  outcome: "COLLISION", weather: "RAIN", time_of_day: "NIGHT", failure_class: null, error: null,
  end_reason: "COLLISION", trace_available: true, created_at: "2026-11-14T08:10:00",
  metrics: { rms_jerk_mps3: 2.123, impact_speed_mps: 10, stopping_distance_m: 15.5 }, ...patch });
const initial = { total: 80, page: 2, page_size: 10,
  counts: { SAFE: 60, COLLISION: 7, FALSE_BRAKING: 1, NEAR_MISS: 2, MISSED_BRAKING: 1, OTHER_FAILURE: 0,
    ERROR: 1, TIMEOUT: 2, CANCELLED: 1, INCOMPLETE: 3, NOT_FINISHED: 2 },
  items: [run(101), run(102, { outcome: "INCOMPLETE", trace_available: false, metrics: { rms_jerk_mps3: null, impact_speed_mps: null, stopping_distance_m: null } }),
    run(103, { status: "RUNNING", outcome: "NOT_FINISHED", end_reason: null, trace_available: false }),
    run(104, { outcome: "SAFE", metrics: { rms_jerk_mps3: 0, impact_speed_mps: null, stopping_distance_m: 0 } }), run(105), run(106),
    run(107, { outcome: "FALSE_BRAKING" }), run(108, { outcome: "MISSED_BRAKING" }), run(109, { outcome: "OTHER_FAILURE" }),
    run(110, { outcome: "REFERENCE", aeb_mode: "OFF" })],
  evaluation_version: version, objective_groups: [{ identity: "7|2|carla-0.9.16-xosc5|0.01", simulator: "carla-0.9.16-xosc5",
    baseline_id: 7, vehicle_id: 2, carla_observational_only: true,
    objectives: { version, invalid_runs: 0, rms_jerk_mps3: objective(2.123, "m/s³"),
      impact_speed_mps: objective(0, "m/s"), stopping_distance_m: objective(15.5, "m") } }] };
let dashboard = structuredClone(initial), mode = "normal", role = actor.role;
const requests = [], writes = [], errors = [], pending = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/v1/**", async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace("/api/v1", "");
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": "*" } });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
    requests.push(url);
    if (p === "/auth/login") return reply({ access_token: "overview-fixture-only", token_type: "bearer", expires_in: 3600, user: { ...actor, role } });
    if (req.method() !== "GET") { writes.push(p); return reply({ detail: "No business writes in Overview tests" }, 405); }
    if (p === "/auth/me") return reply({ ...actor, role });
    if (p === "/vehicsim/context") return reply({ project, workspace: { id: 1, name: "Fixture" }, vehicle: { id: 2, name: "Fixture vehicle" },
      system: { id: 1, name: "AEB", baseline: { id: 7, label: "v7" } }, versions: [{ id: 7, label: "v7", status: "BASELINE" }],
      families: [{ id: 42, code: "CCRM", name: initial.items[0].family }], parameters: [], reviewer_projects: [], reviewer_can_decide: false });
    if (p === "/vehicsim/analysis/v3/sources") return reply({items:[],limit:20,offset:0}); // FE-R4: empty FA storage is independent of legacy runs.
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (p === "/vehicsim/regression") return reply({ items: [], kpis: { total: 0, passed: 0, failed: 0, running: 0 } });
    if (p === "/vehicsim/analysis/runs") {
      const behavior = mode, body = structuredClone(dashboard);
      if (behavior === "hold") await new Promise(resolve => pending.push(resolve));
      if (behavior === "network") return route.abort("failed");
      if (behavior === "error") return reply({ detail: "Fixture Analysis unavailable" }, 503);
      if (behavior === "forbidden") return reply({ detail: "Fixture forbidden" }, 403);
      return reply(body);
    }
    const inspection = p.match(/^\/vehicsim\/analysis\/runs\/(\d+)$/);
    if (inspection) return reply({ run: run(Number(inspection[1]), { status: "RUNNING", outcome: "NOT_FINISHED", trace_available: false }), detail: null });
    return reply([], 200); // Other read-only home/context feeds do not supply Overview metrics.
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Browser-fixture-only-12");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(u => u.pathname !== "/login");
  const query = "/analysis/failures?scenario_id=42&view=overview&page=2&page_size=10&weather=RAIN&q=kept&d_q=kept";
  const overview=page.getByRole("region",{name:"Tổng quan baseline",exact:true});
  const kpi=name=>overview.getByRole("article").filter({hasText:name});
  const ready=async()=>{await kpi("Tổng lượt chạy").getByText(String(dashboard.total),{exact:true}).waitFor()};
  const rows=page.locator("tr[data-run-id]"),row=id=>page.locator(`tr[data-run-id="${id}"]`);
  const checks=[];
  await page.goto(base+query);await ready();assert.equal(await overview.getByRole("article").count(),3);
  assert.equal((await kpi("An toàn theo đánh giá đã lưu").locator("strong").innerText()).trim(),"60");
  assert.equal((await kpi("Va chạm đã ghi nhận").locator("strong").innerText()).trim(),"7");
  const scopedRequest=requests.find(url=>url.pathname.endsWith("/analysis/runs")&&url.searchParams.get("page")==="2");
  assert(scopedRequest);assert.equal(scopedRequest.searchParams.get("scenario_id"),"42");assert.equal(scopedRequest.searchParams.get("weather"),"RAIN");assert.equal(scopedRequest.searchParams.get("q"),null);
  await page.getByText("Không có kết quả tìm trong trang này.",{exact:true}).waitFor();await page.getByLabel("Tìm trong trang hiện tại").fill("");await rows.first().waitFor();assert.equal(await rows.count(),10);
  await page.getByLabel("Kết quả va chạm").selectOption("collision");assert.equal(await rows.count(),3);
  await page.getByLabel("Kết quả va chạm").selectOption("no_collision");assert.deepEqual(await rows.evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-run-id")).sort()),["104","107","108","109"]);
  await page.getByLabel("Kết quả va chạm").selectOption("");
  const target=new URL(await row(101).getByRole("link",{name:"Chi tiết run 101",exact:true}).getAttribute("href"),base);assert.equal(target.pathname,"/analysis/failures/101");assert(target.searchParams.get("returnTo").includes("weather=RAIN"));
  checks.push("filtered-scope counts, current-page search and collision filter, return context");
  const region=page.getByRole("region",{name:"Bảng lượt chạy baseline, cuộn ngang để xem thêm",exact:true});
  for(const [width,height] of viewports){await page.setViewportSize({width,height});await region.focus();assert(await region.evaluate(n=>document.activeElement===n));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"overflow "+width)}
  dashboard=structuredClone(initial);dashboard.counts.SAFE=60.5;dashboard.counts.REFERENCE=1;await page.reload();await ready();
  assert.equal((await kpi("An toàn theo đánh giá đã lưu").locator("strong").innerText()).trim(),"—");assert.match(await kpi("Tổng lượt chạy").innerText(),/Bao gồm lượt đối chứng AEB tắt/);
  dashboard={...structuredClone(initial),total:0,items:[],objective_groups:[],counts:Object.fromEntries(Object.keys(initial.counts).map(key=>[key,0]))};await page.reload();await ready();await page.getByText("Không có run khớp bộ lọc.",{exact:true}).waitFor();assert.equal(await rows.count(),0);
  dashboard=structuredClone(initial);mode="hold";await page.reload();await overview.getByRole("status").waitFor();assert.equal(await rows.count(),0);assert.equal(pending.length,1);mode="normal";pending.shift()();await ready();
  for(const behavior of ["error","network","forbidden"]){mode=behavior;await page.reload();await page.locator(".analysis-workspace").getByRole("alert").waitFor();assert.equal(await rows.count(),0);mode="normal";await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();await ready()}
  dashboard={...structuredClone(initial),counts:null,objective_groups:null};await page.reload();await page.locator(".analysis-workspace").getByRole("alert").filter({hasText:"Dữ liệu danh sách trả về thiếu cấu trúc cần thiết"}).waitFor();
  checks.push("invalid count, OFF reference, empty, loading, malformed and error recovery");
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks,liveBackendVerified:false,carlaVerified:false},null,2));console.log("PASS: current Analysis overview UI; fixture only");
} finally {for(const release of pending)release();await browser.close();}
