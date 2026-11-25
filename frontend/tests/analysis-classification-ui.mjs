import { prepareAnalysisArtifacts } from "./helpers/analysis-artifacts.mjs";
/** Failure classification regression: browser HTTP fixtures, no live backend/CARLA. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = process.env.CLASSIFICATION_BASELINE === "1";
const output = await prepareAnalysisArtifacts(path.join(root, "data/analysis-phase14-2026-11-15", baseline ? "before" : "after"));


const base = process.env.ANALYSIS_UI_URL || "http://127.0.0.1:3126";
const actor = { id: 999914, email: "classification@example.invalid", full_name: "Metric fixture", role: "ENGINEER" };
const version = "adr040-stored-aggregation/1";
const values = { rms_jerk_mps3: 2.123, impact_speed_mps: 10, stopping_distance_m: 0.0004 };
const run = { revision: "metric-fixture", run_id: 101, scenario_id: 42, scenario_version_id: 201, version_no: 1,
  family: "Metric fixture", variant: "CP-001", seed: 13, baseline_id: 7, vehicle_id: 2,
  simulator: "carla-0.9.16-xosc5", dt: 0.01, status: "COMPLETED", outcome: "COLLISION",
  weather: "RAIN", time_of_day: "DAY", failure_class: "CONTROL", error: null, end_reason: "COLLISION",
  trace_available: true, created_at: "2026-11-14T08:00:00", metrics: values };
const objective = (value, unit) => ({ value, unit, samples: 1, missing: 0, notApplicable: 0, status: "VALID" });
const objectives = { version, invalid_runs: 0, rms_jerk_mps3: objective(2.123, "m/s³"),
  impact_speed_mps: objective(10, "m/s"), stopping_distance_m: objective(0.0004, "m") };
const frames = [0, 0.1].map(t => ({ t, ego_x: t, ego_v: 10, ego_a: -0.0004, ped_x: 30, ped_y: -1,
  ped_vy: 1, perceived_y: -1, detected: true, confidence: 0.8, ttc: null, ttc_gt: 1, aeb: true, fcw: true }));
let detail = { ...run, purpose: "BASELINE", variant_id: 201, vehicle: "Fixture car", config: "v7", date: run.created_at,
  verdict: "FAIL", evaluation_valid: true, failure_type: "COLLISION", headline: "Metric fixture", summary: "Fixture only",
  metrics: { ...values, metric_source: "SIMULATOR_RESULT", impact_speed_kmh: 36, min_distance_m: 0,
    min_ttc_s: 0, first_detection_t: 0, first_detection_distance_m: 30, aeb_activation_t: 0,
    aeb_activation_ttc_s: null, fcw_t: 0, brake_onset_t: null, max_deceleration_mps2: 2,
    false_activation: false, missed_activation: false },
  configuration: [{ code: "BRAKE_ACTIVATION_DELAY", name: "Delay", value: 0.15, unit: "s" }],
  environment: { ego_speed_kmh: 36, trigger_distance_m: 30, pedestrian_speed_mps: 1, stops_at_curb: false,
    weather: "RAIN", time_of_day: "DAY", road_friction: 0.65 },
  chain: [{ stage: "CONTROL", passed: false, summary: "Fixture", confidence: 0.8, cause_code: "FIXTURE", parameter_code: null }],
  chain_confidence: 0.8, evaluation_version: version,
  stage_evidence: [{ stage: "CONTROL", values: { brake_onset_t: null, response_time_s: null } }],
  telemetry: frames.map(f => ({ t: f.t, ttc: null, speed_kmh: 36 })),
  motion_telemetry: frames.map(f => ({ t: f.t, ego_x_m: f.ego_x, ego_speed_mps: 10, ego_accel_mps2: -0.0004,
    target_y_m: -1, jerk_mps3: -0.0004, crossing_distance_m: 30 - f.ego_x, ttc_perceived_s: null,
    ttc_gt_s: 1, motion_state: "DECELERATING", derived_source: "RECORDED_GT_FINITE_DIFFERENCE" })),
  events: [{ t: 0, kind: "aeb_decision", label: "AEB brake command" }], ttc_threshold_s: 1.5,
  scene: { crossing_x: 30, vehicle_length_m: 4.8, vehicle_width_m: 2, lane_width_m: 3.5,
    path: frames.map(f => ({ t: f.t, x: f.ego_x, ped_y: f.ped_y })), end: frames.at(-1) }, similar: [] };
const original = structuredClone(detail);
let inspectionRun = { ...run }, inspectionMode = "normal", listMode = "normal";
let items = [
  { ...run, failure_id: 201, failure_type: "COLLISION", root_cause: null, cause_code: null, confidence: null, impact_kmh: 36, min_ttc_s: 0, config: "v7" },
  { ...run, run_id: 102, failure_id: 202, outcome: "FALSE_BRAKING", failure_type: "FALSE_BRAKING", root_cause: "Fixture suspected cause", cause_code: "PATH_PREDICTION_TOO_CONSERVATIVE", confidence: 0.8, impact_kmh: null, min_ttc_s: null, config: "v7" },
];
const requests = [], writes = [], errors = [], screenshots = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname.replace("/api/v1", "");
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": "*" } });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
    if (p === "/auth/login") return reply({ access_token: "classification-fixture-only", token_type: "bearer", expires_in: 3600, user: actor });
    if (request.method() !== "GET") { writes.push(p); return reply({ detail: "No business writes in classification QA" }, 405); }
    requests.push(url);
    if (p === "/auth/me") return reply(actor);
    if (p === "/vehicsim/context") return reply({ project: { id: actor.id, name: "Classification fixture" }, workspace: { id: 1, name: "Fixture" },
      vehicle: { id: 2, name: "Fixture car" }, system: { id: 1, name: "AEB", baseline: { id: 7, label: "v7" } },
      versions: [{ id: 7, label: "v7", status: "BASELINE" }], families: [{ id: 42, name: "Metric fixture", code: "CP" }], parameters: [], reviewer_projects: [] });
    if (p === "/vehicsim/analysis/v3/sources") return reply({items:[],limit:20,offset:0}); // FE-R4: empty FA storage is independent of legacy runs.
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (p === "/vehicsim/regression") return reply({ items: [], kpis: { total: 0, passed: 0, failed: 0, running: 0, review_pending: 0 } });
    if (p === "/vehicsim/analysis/runs") return reply({ total: 1, page: 1, page_size: 20, counts: { SAFE: 0, COLLISION: 1 }, items: [run], evaluation_version: version,
      objective_groups: [{ identity: "fixture", simulator: run.simulator, baseline_id: 7, vehicle_id: 2, objectives, carla_observational_only: true }] });
    if (p === "/vehicsim/failures") {
      if (listMode === "error") return reply({ detail: "Fixture failure list unavailable" }, 503);
      const rows = listMode === "empty" ? [] : items.filter(item => (!url.searchParams.get("failure_class") || item.failure_class === url.searchParams.get("failure_class")) && (!url.searchParams.get("outcome") || item.outcome === url.searchParams.get("outcome")));
      return reply({ total: rows.length, page: 1, page_size: 20, pages: 1, items: rows, families: [],
        kpis: { total: rows.length, this_week: 0, collisions: rows.filter(r => r.outcome === "COLLISION").length,
          near_misses: 0, false_braking: rows.filter(r => r.outcome === "FALSE_BRAKING").length,
          by_class: { PERCEPTION: 0, DECISION: 0, CONTROL: rows.length, VEHICLE_DYNAMICS: 0 } } });
    }
    if (p === "/vehicsim/analysis/runs/101") {
      if (inspectionMode === "error") return reply({ detail: "Fixture evaluation unavailable" }, 503);
      return reply({ run: inspectionRun, detail });
    }
    return reply([]);
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Browser-fixture-only-14");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click(); await page.waitForURL(u => u.pathname !== "/login");
  const listUrl = "/analysis/failures?view=failures&scenario_id=42&f_scenario=42&f_weather=RAIN&f_page=1&f_size=20";
  const detailUrl = "/analysis/failures/101?section=evidence&returnTo=" + encodeURIComponent(listUrl);
  const list = page.getByRole("region", { name: "Danh sách ca lỗi và bằng chứng", exact: true });
  const state = () => page.getByRole("region", {name:"Kết quả và chỉ số run",exact:true}).getByLabel("Đánh giá và phân loại từ backend", { exact: true });
  const shot = async name => { await page.screenshot({ path: path.join(output, name + ".png"), fullPage: true }); screenshots.push(name + ".png"); };
  for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height }); await page.goto(base + listUrl); await list.locator("tbody tr").first().waitFor(); await shot("failures-" + width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "List overflow " + width);
    await page.goto(base + detailUrl); await page.getByRole("heading", { name: "Bằng chứng và giới hạn nhận định", exact: true }).waitFor(); await shot("evidence-" + width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Evidence overflow " + width);
  }
  if (baseline) {
    detail = { ...original, evaluation_valid: false };
    await page.reload(); await page.getByRole("article", { name: "Khâu Điều khiển", exact: true }).waitFor(); await shot("invalid-stages");
    await fs.writeFile(path.join(output, "observed.json"), JSON.stringify({ kind: "BASELINE_CAPTURE_ONLY", screenshots, errors }, null, 2));
  } else {
    assert.match(await state().innerText(), /Không đạt theo luật đã lưu \(FAIL\)/);
    assert.match(await state().innerText(), /Va chạm được ghi nhận/);
    assert.doesNotMatch(await state().innerText(), /Bỏ sót phanh theo luật|Phanh không hiệu quả/);
    await page.goto(base + listUrl); await list.locator("tbody tr").first().waitFor();
    const row = id => list.locator('tr[data-failure-run="' + id + '"]');
    assert.match(await row(101).innerText(), /Va chạm được ghi nhận/);
    assert.match(await row(101).innerText(), /Chưa có giả thuyết nguyên nhân riêng/);
    assert.match(await row(102).innerText(), /Phanh oan theo luật/);
    assert.match(await row(102).innerText(), /Giả thuyết/);
    // List filters send existing outcome/stage fields, never invent a failure_type endpoint filter.
    await page.getByRole("combobox", { name: "Kết quả AEB", exact: true }).selectOption("FALSE_BRAKING");
    await row(102).waitFor(); await page.waitForFunction(() => document.querySelectorAll("tr[data-failure-run]").length === 1);
    assert(requests.some(u => u.pathname.endsWith("/failures") && u.searchParams.get("outcome") === "FALSE_BRAKING"));
    assert(!requests.some(u => u.searchParams.has("failure_type")));
    await page.goto(base + listUrl); await row(101).waitFor();
    await page.keyboard.press("Tab");
    const region = list.getByRole("region", { name: "Bảng ca lỗi, cuộn ngang để xem thêm", exact: true });
    await region.focus(); assert(await region.evaluate(el => el.matches(":focus-visible")));
    await page.setViewportSize({ width: 375, height: 812 });
    await region.focus(); await region.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector('[aria-label="Bảng ca lỗi, cuộn ngang để xem thêm"]')?.scrollLeft > 0);
    const evidence = row(101).getByRole("link", { name: "Bằng chứng run 101", exact: true });
    await evidence.focus(); await evidence.press("Enter"); await state().waitFor();
    assert.equal(new URL(page.url()).searchParams.get("returnTo"), listUrl);
    await page.getByRole("link", { name: "← Về danh sách đang xem", exact: true }).click(); await page.waitForURL(base + listUrl);
    for (const [type, outcome, verdict, label] of [["FALSE_BRAKING", "FALSE_BRAKING", "FAIL", "Phanh oan theo luật"], ["MISSED_BRAKING", "SAFE", "FAIL", "Bỏ sót phanh theo luật"], ["LATE_BRAKING", "NEAR_MISS", "PASS", "Phanh muộn theo luật"], ["NEAR_MISS", "NEAR_MISS", "PASS", "Suýt va chạm theo luật"]]) {
      detail = { ...original, failure_type: type, outcome, verdict };
      await page.goto(base + detailUrl); await state().waitFor(); assert((await state().innerText()).includes(label));
    }
    // A recorded command and no collision do not create false braking.
    detail = { ...original, outcome: "SAFE", verdict: "PASS", failure_type: null, failure_class: null, chain: [], chain_confidence: null };
    await page.goto(base + detailUrl); await state().waitFor();
    assert.match(await state().innerText(), /API chưa có phân loại lỗi/); assert.match(await state().innerText(), /Đạt theo luật đã lưu \(PASS\)/); assert.doesNotMatch(await state().innerText(), /Phanh oan theo luật/);
    detail = { ...original, failure_class: null, chain: [], chain_confidence: null };
    await page.goto(base + detailUrl); await state().waitFor();
    assert.match(await state().innerText(), /Va chạm được ghi nhận/);
    await page.getByText("Chưa có khâu chính từ backend.", { exact: true }).waitFor();
    await page.getByText("Run không có chuỗi nhận định để hiển thị. Xem kết quả và dữ liệu nguồn trước khi kết luận.", { exact: true }).waitFor();
    await shot("classification-no-cause");
    for (const patch of [{ evaluation_valid: false }, { evaluation_valid: undefined }, { verdict: null }, { failure_type: undefined, chain: null }]) {
      detail = { ...original, ...patch }; await page.goto(base + detailUrl); await state().waitFor();
      if (patch.evaluation_valid !== undefined || "evaluation_valid" in patch) {
        const stage = page.getByRole("article", { name: "Khâu Điều khiển", exact: true });
        assert.doesNotMatch(await stage.innerText(), /Không đạt theo luật|Đạt theo luật/);
        assert.match(await stage.innerText(), /Chưa có kết luận hợp lệ/);
        if (patch.evaluation_valid === false) await shot("invalid-stages");
      }
      if ("failure_type" in patch) assert.match(await state().innerText(), /API chưa có phân loại lỗi/);
    }
    detail = { ...original, evaluation_valid: false, telemetry: [], motion_telemetry: [], chain: null, failure_type: null };
    await page.goto(base + detailUrl); await state().waitFor(); assert.match(await state().innerText(), /Chưa đủ dữ liệu đánh giá/); await shot("missing-telemetry");
    // No category applicability/lifecycle status is exposed. Do not invent UNSUPPORTED or evaluation-failure enums.
    detail = { ...original, evaluation_valid: undefined, verdict: null, failure_type: null, environment: { ...original.environment, category: "CPLA" } };
    await page.goto(base + detailUrl); await state().waitFor(); assert.match(await state().innerText(), /API chưa xác nhận điều kiện đánh giá/); await shot("unknown-applicability");
    for (const status of ["PENDING", "RUNNING", "FAILED"]) {
      detail = null; inspectionRun = { ...run, status, trace_available: false, outcome: status === "FAILED" ? "ERROR" : "NOT_FINISHED" };
      await page.goto(base + detailUrl); await page.getByRole("region", { name: "Run chưa có kết quả phân tích", exact: true }).waitFor(); assert.equal(await state().count(), 0);
      assert.match(await page.getByRole("region", { name: "Run chưa có kết quả phân tích", exact: true }).innerText(), /Không có kết quả AEB hợp lệ/);
    }
    inspectionMode = "error"; await page.goto(base + detailUrl); await page.getByRole("button", { name: "Thử tải lại", exact: true }).waitFor(); assert.equal(await state().count(), 0); await shot("detail-api-error");
    listMode = "empty"; await page.goto(base + listUrl); await page.getByText("Không có ca lỗi nào với bộ lọc này.", { exact: true }).waitFor(); assert.match(await list.innerText(), /không chứng minh an toàn/);
    listMode = "error"; await page.reload(); await page.getByText("Chưa tải được ca lỗi. Dùng nút “Thử tải lại” phía trên.", { exact: true }).waitFor(); assert.equal(await list.locator("tbody tr").count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", kind: "BROWSER_FIXTURE_ONLY", screenshots, errors, businessWrites: 0, liveBackendVerified: false, carlaRuntimeVerified: false, figmaCompared: false }, null, 2));
    console.log("PASS: classification labels, validity/missing fallback, no metric inference, filters/context, keyboard and responsive fixtures");
  }
} finally { await browser.close(); }
