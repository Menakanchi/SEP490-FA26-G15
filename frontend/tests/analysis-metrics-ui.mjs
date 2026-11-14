/** Metric rendering regression: browser HTTP fixtures, no live backend/CARLA. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = process.env.METRICS_BASELINE === "1";
const output = path.join(root, "data/analysis-phase13-2026-11-14", baseline ? "before" : "after");
await fs.mkdir(output, { recursive: true });
await fs.rm(path.join(output, "result.json"), { force: true });
const base = process.env.ANALYSIS_UI_URL || "http://127.0.0.1:3125";
const actor = { id: 999913, email: "metrics@example.invalid", full_name: "Metric fixture", role: "ENGINEER" };
const version = "adr040-stored-aggregation/1";
const values = { rms_jerk_mps3: 2.123, impact_speed_mps: 10, stopping_distance_m: 0.0004 };
const run = { revision: "metric-fixture", run_id: 101, scenario_id: 42, scenario_version_id: 201, version_no: 1,
  family: "Metric fixture", variant: "CP-001", seed: 13, baseline_id: 7, vehicle_id: 2,
  simulator: "carla-0.9.16-xosc5", dt: 0.01, status: "COMPLETED", outcome: "COLLISION",
  weather: "CLEAR", time_of_day: "DAY", failure_class: "CONTROL", error: null, end_reason: "COLLISION",
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
    weather: "CLEAR", time_of_day: "DAY", road_friction: 0.65 },
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
let sensor = { total_frames: 10, duration_s: 1, collisions: 0, impact_speed_mps: null, rms_jerk_mps3: 2.123,
  stopping_distance_m: 0.0004, first_brake_time_s: null, radar_min_ttc_s: null, obstacle_min_distance_m: null,
  max_deceleration_ms2: 2, mean_deceleration_ms2: 1, max_abs_jerk_mps3: 3,
  first_collision_time_s: null, relative_impact_speed_mps: null, impact_peak_accel_ms2: null };
const errors = [], writes = [], screenshots = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/v1/**", async route => {
    const p = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const reply = body => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": "*" } });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
    if (p === "/auth/login") return reply({ access_token: "metric-fixture-only", token_type: "bearer", expires_in: 3600, user: actor });
    if (route.request().method() !== "GET") { writes.push(p); assert.equal(p, "/vehicsim/telemetry/evaluate"); return reply(sensor); }
    if (p === "/auth/me") return reply(actor);
    if (p === "/vehicsim/context") return reply({ project: { id: 999913, name: "Metric fixture" }, workspace: { id: 1, name: "Fixture" },
      vehicle: { id: 2, name: "Fixture car" }, system: { id: 1, name: "AEB", baseline: { id: 7, label: "v7" } },
      versions: [{ id: 7, label: "v7", status: "BASELINE" }], families: [{ id: 42, name: "Metric fixture", code: "CP" }], parameters: [], reviewer_projects: [] });
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (p === "/vehicsim/analysis/runs") return reply({ total: 1, page: 1, page_size: 20, counts: { SAFE: 0, COLLISION: 1 },
      items: [run], evaluation_version: version, objective_groups: [{ identity: "metric-fixture", simulator: run.simulator,
        baseline_id: 7, vehicle_id: 2, objectives, carla_observational_only: true }] });
    if (p === "/vehicsim/analysis/runs/101") return reply({ run, detail });
    if (p === "/vehicsim/runs/101/playback") return reply({ ...detail, frames, duration_s: 0.1, crossing_x: 30,
      vehicle_length_m: 4.8, vehicle_width_m: 2, lane_width_m: 3.5, related_runs: [] });
    return reply([]);
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Browser-fixture-only-13");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(u => u.pathname !== "/login");
  const shot = async name => { await page.screenshot({ path: path.join(output, name + ".png"), fullPage: true }); screenshots.push(name + ".png"); };
  const summary = () => page.getByRole("region", { name: "Kết quả và chỉ số run", exact: true });
  for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base + "/analysis/failures/101?section=summary"); await summary().waitFor();
    await shot("summary-" + width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Detail overflow " + width);
  }
  if (baseline) {
    await page.goto(base + "/analysis/failures/101?section=evidence"); await page.getByRole("heading", { name: "Bằng chứng và giới hạn nhận định" }).waitFor(); await shot("evidence");
    await fs.writeFile(path.join(output, "observed.json"), JSON.stringify({ kind: "BASELINE_CAPTURE_ONLY", screenshots, errors }, null, 2));
  } else {
    const fact = label => summary().locator('[aria-label="' + label + '"]').locator("dd");
    assert.equal(await fact("RMS jerk").innerText(), "2.123 m/s³");
    assert.equal(await fact("Tốc độ va chạm").innerText(), "10.000 m/s");
    assert.equal(await fact("Quãng phanh").innerText(), "4.00e-4 m");
    assert.equal(await fact("TTC nhỏ nhất").innerText(), "0.00 s");
    await page.goto(base + "/analysis/failures?scenario_id=42&view=overview");
    const aggregate = page.getByRole("region", { name: "Chỉ số tổng hợp của nhóm 1", exact: true });
    await aggregate.waitFor();
    for (const text of ["2.123 m/s³", "10.000 m/s", "4.00e-4 m"]) assert((await aggregate.innerText()).includes(text));
    detail = { ...detail, outcome: "SAFE", metrics: { ...detail.metrics, impact_speed_mps: 10, rms_jerk_mps3: 0, stopping_distance_m: null, max_deceleration_mps2: -2 } };
    await page.goto(base + "/analysis/failures/101?section=summary"); await summary().waitFor();
    assert.equal(await fact("Tốc độ va chạm").innerText(), "—", "No collision must not display stale impact");
    assert.equal(await fact("RMS jerk").innerText(), "0.000 m/s³");
    assert.equal(await fact("Quãng phanh").innerText(), "—");
    assert.equal(await fact("Giảm tốc cực đại").innerText(), "—", "Do not abs a negative magnitude");
    await shot("missing-noncollision");
    await page.goto(base + "/analysis/failures/101?section=telemetry&t=0");
    const telemetry = page.getByRole("region", { name: "Số đo tại thời gian đang xem", exact: true }); await telemetry.waitFor();
    assert.equal(await telemetry.locator('[aria-label="TTC nhận thức tại khung"] dd').innerText(), "—");
    assert.equal(await telemetry.locator('[aria-label="Tốc độ tại khung"] dd').innerText(), "36.0");
    assert.equal(await telemetry.locator('[aria-label="Gia tốc ego tại khung"] dd').innerText(), "-4.00e-4");
    await page.getByRole("combobox", { name: "Tín hiệu", exact: true }).selectOption("jerk_mps3");
    assert.equal(await telemetry.getByLabel("Số đo tín hiệu đang chọn", { exact: true }).locator("strong").innerText(), "-4.00e-4 m/s³");
    await shot("telemetry");
    await page.goto(base + "/analysis/failures/101?section=evidence");
    await page.getByRole("heading", { name: "Bằng chứng và giới hạn nhận định" }).waitFor();
    const stage = page.getByRole("article", { name: "Khâu Điều khiển", exact: true });
    assert.match(await stage.innerText(), /Bắt đầu lệnh phanh[\s\S]*—[\s\S]*Trễ lệnh phanh[\s\S]*—/);
    assert.equal(await stage.getByRole("link").count(), 0, "No timestamp means no invented delay/event link");
    await shot("evidence");
    await page.goto(base + "/analysis/failures/101/playback?t=0");
    const playback = page.getByRole("region", { name: "Số đo khung playback", exact: true }); await playback.waitFor();
    assert.match(await playback.innerText(), /36\.0 km\/h/);
    assert.match(await playback.innerText(), /-4\.00e-4 m\/s²/);
    assert.match(await playback.innerText(), /AEB ĐÃ RA QUYẾT ĐỊNH/);
    assert.doesNotMatch(await playback.innerText(), /AEB ĐANG PHANH/);
    await shot("playback");
    // Exercise the actual CSV form and response mapper; the endpoint is intercepted.
    await page.goto(base + "/analysis/carla");
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({ name: "fixture.csv", mimeType: "text/csv", buffer: Buffer.from("sim_time_s,ego_speed_ms\n0.5,10\n0.6,9\n") });
    await page.getByRole("button", { name: "Tính số đo", exact: true }).click();
    await page.getByText("Tốc độ ego lúc va chạm", { exact: true }).waitFor();
    const sensorCard = page.getByText("Tốc độ ego lúc va chạm", { exact: true }).locator("..");
    assert.match(await sensorCard.innerText(), /—/); assert.doesNotMatch(await sensorCard.innerText(), /tính là 0/);
    assert.match(await page.getByText("RMS jerk lúc phanh", { exact: true }).locator("..").innerText(), /2\.123[\s\S]*m\/s³/);
    assert.match(await page.getByText("Quãng đường phanh", { exact: true }).locator("..").innerText(), /4\.00e-4[\s\S]*ngoại suy/);
    sensor = { ...sensor, collisions: 1, impact_speed_mps: 10, first_collision_time_s: 0.8 };
    await page.getByRole("button", { name: "Tính số đo", exact: true }).click();
    await sensorCard.getByText("10.000", { exact: true }).waitFor();
    assert.match(await sensorCard.innerText(), /36\.0 km\/h/);
    await shot("sensor-csv");
    assert.equal(writes.length, 2); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", kind: "BROWSER_FIXTURE_ONLY", screenshots,
      errors, interceptedTelemetryEvaluations: writes.length, liveBackendVerified: false, carlaRuntimeVerified: false, figmaCompared: false }, null, 2));
    console.log("PASS: Analysis metric mapping/rendering, signed tiny values, missing, sources and sensor CSV fixtures");
  }
} finally { await browser.close(); }
