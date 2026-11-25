import { openRunContext } from "./helpers/analysis-disclosures.mjs";
import { prepareAnalysisArtifacts } from "./helpers/analysis-artifacts.mjs";
/** Metric explainability regression: browser HTTP fixtures, no live backend/CARLA. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = process.env.EXPLAINABILITY_BASELINE === "1";
const output = await prepareAnalysisArtifacts(path.join(root, "data/analysis-phase15-2026-11-15", baseline ? "before" : "after"));


const base = process.env.ANALYSIS_UI_URL || "http://127.0.0.1:3127";
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
    if (p === "/vehicsim/analysis/v3/sources") return reply({items:[],limit:20,offset:0}); // FE-R4: empty FA storage is independent of legacy runs.
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
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
  const url = "/analysis/failures/101?section=summary&signal=jerk_mps3&t=0.5&returnTo=" + encodeURIComponent(returnTo);
  const summary = page.getByRole("region", { name: "Kết quả và chỉ số run", exact: true });
  const explanation = kind => page.locator('details[data-metric-explanation="' + kind + '"]');
  const shot = async name => { await page.screenshot({ path: path.join(output, name + ".png"), fullPage: true }); screenshots.push(name + ".png"); };
  for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height }); await page.goto(base + url); await summary.waitFor(); await shot("summary-" + width);
    if (!baseline) {
      for (const kind of ["rms", "stopping", "ttc", "separation", "deceleration", "timeline", "impact"]) {
        if (!["rms","stopping","impact"].includes(kind)) await openRunContext(page);
        const disclosure = explanation(kind), control = disclosure.locator(":scope > summary");
        await page.keyboard.press("Tab"); await control.focus(); await control.press("Enter");
        assert.equal(await disclosure.getAttribute("open"), "");
        assert(await control.evaluate(el => el.matches(":focus-visible")));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Expanded " + kind + " overflow " + width);
        if (kind === "stopping") await shot("stopping-open-" + width);
        await control.press("Space"); assert.equal(await disclosure.getAttribute("open"), null); assert(await control.evaluate(el => el === document.activeElement));
      }
    }
  }
  if (!baseline) {
    const open = async kind => { if (!["rms","stopping","impact"].includes(kind)) await openRunContext(page); await explanation(kind).locator(":scope > summary").click(); await explanation(kind).locator("[data-metric-technical] > summary").click(); return explanation(kind); };
    let panel = await open("stopping");
    assert.match(await panel.innerText(), /33\.250 m/); assert.match(await panel.innerText(), /trace component và extrapolated component/);
    assert.match(await panel.innerText(), /API Detail chưa trả x_onset và a_available/);
    assert.match(await panel.innerText(), /#101 \/ #42/); assert.match(await panel.innerText(), /SIMULATOR_RESULT/);
    assert.match(await panel.innerText(), /CARLA qua lõi Java/); assert.match(await panel.innerText(), /chưa cung cấp phiên bản hiệu chuẩn/);
    const telemetryLink = new URL(await panel.getByRole("link", { name: "Xem telemetry run #101", exact: true }).getAttribute("href"), base);
    assert.equal(telemetryLink.pathname, "/analysis/failures/101"); assert.equal(telemetryLink.searchParams.get("t"), "0.25");
    assert.equal(telemetryLink.searchParams.get("signal"), "jerk_mps3"); assert.equal(telemetryLink.searchParams.get("returnTo"), returnTo);
    await panel.getByRole("link", { name: "Xem bằng chứng run #101", exact: true }).click();
    await page.getByRole("heading", { name: "Bằng chứng và giới hạn nhận định", exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("returnTo"), returnTo);
    await page.goto(base + url); await summary.waitFor(); panel = await open("ttc");
    assert.match(await panel.innerText(), /gap \/ v_ego/); assert.match(await panel.innerText(), /v_ego > 0,1/);
    const minLink = new URL(await panel.getByRole("link", { name: "Xem telemetry run #101", exact: true }).getAttribute("href"), base);
    assert.equal(minLink.searchParams.get("t"), null, "No invented timestamp for min TTC");
    detail = { ...original, metrics: { ...original.metrics, min_ttc_s: null, rms_jerk_mps3: null, stopping_distance_m: null, brake_onset_t: null, aeb_activation_t: null } };
    await page.reload(); await summary.waitFor(); panel = await open("rms");
    assert.match(await panel.innerText(), /Không có số đo hợp lệ hoặc không áp dụng/);
    assert.match(await panel.innerText(), /Bước danh định/); await shot("missing-rms");
    panel = await open("timeline"); assert.doesNotMatch(await panel.locator("[data-explanation-inputs]").innerText(), /Bắt đầu lệnh phanh|Quyết định AEB/);
    detail = { ...original, outcome: "SAFE", metrics: { ...original.metrics, impact_speed_mps: 10 } };
    await page.reload(); await summary.waitFor(); panel = await open("impact"); assert.match(await panel.innerText(), /Số đo đã lưu: —/);
    detail = { ...original, environment: { ...original.environment, category: "CCRM" } };
    await page.reload(); await summary.waitFor(); panel = await open("ttc");
    assert.match(await panel.innerText(), /v_ego − v_target,x/); assert.doesNotMatch(await panel.innerText(), /TTC_GT = gap \/ v_ego;/);
    await shot("ccr-ttc"); panel = await open("separation"); assert.match(await panel.innerText(), /giữa hai hộp xe/);
    for (const patch of [{ environment: { ...original.environment, category: undefined } }, { environment: { ...original.environment, category: "CPLA" } }, { simulator: "unknown" }, { metrics: { ...original.metrics, metric_source: undefined } }]) {
      detail = { ...original, ...patch }; inspectionRun = { ...run, simulator: detail.simulator }; await page.reload(); await summary.waitFor(); panel = await open("ttc");
      assert.match(await panel.innerText(), /Chưa xác minh phương pháp tính từ nguồn dữ liệu này/); assert.doesNotMatch(await panel.innerText(), /TTC_GT =/);
    }
    detail = { ...original, simulator: "vehicsim-kinematic-1.0" }; inspectionRun = { ...run, simulator: detail.simulator, dt: 0.05 };
    await page.reload(); await summary.waitFor(); panel = await open("rms");
    assert.match(await panel.innerText(), /Động học Java/); assert.match(await panel.innerText(), /0\.05 s/); assert.match(await panel.innerText(), /không phải dữ liệu xe thực/);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", kind: "BROWSER_FIXTURE_ONLY", screenshots, errors, businessWrites: 0, carlaRuntimeVerified: false, liveBackendVerified: false, figmaCompared: false }, null, 2));
    console.log("PASS: explainability unverified-method/category/source/inputs/missing, native keyboard disclosures, links/context, responsive fixtures");
  } else await fs.writeFile(path.join(output, "observed.json"), JSON.stringify({ kind: "BASELINE_CAPTURE_ONLY", screenshots, errors }, null, 2));
} finally { await browser.close(); }
