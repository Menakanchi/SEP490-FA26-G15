/** Overview contract/browser regression. API fixtures only; no live backend or simulator. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "data/analysis-phase12-2026-11-14", process.env.OVERVIEW_BASELINE === "1" ? "before" : "after");
await fs.mkdir(output, { recursive: true });
await fs.rm(path.join(output, "result.json"), { force: true });
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
    run(104, { outcome: "SAFE", metrics: { rms_jerk_mps3: 0, impact_speed_mps: null, stopping_distance_m: 0 } }), run(105), run(106)],
  evaluation_version: version, objective_groups: [{ identity: "7|2|carla-0.9.16-xosc5|0.01", simulator: "carla-0.9.16-xosc5",
    baseline_id: 7, vehicle_id: 2, carla_observational_only: true,
    objectives: { version, invalid_runs: 0, rms_jerk_mps3: objective(2.123, "m/s³"),
      impact_speed_mps: objective(0, "m/s"), stopping_distance_m: objective(15.5, "m") } }] };
let dashboard = structuredClone(initial), mode = "normal", role = actor.role;
const requests = [], writes = [], errors = [], pending = [], screenshots = [];
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
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
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
  const draftKey = "vehicsim.analysis.selection.v1:" + actor.id + ":" + project.id;
  const draft = { 101: { run: run(101), role: "OPTIMIZATION" } };
  const query = "/analysis/failures?scenario_id=42&view=overview&page=2&page_size=10&weather=RAIN&q=kept&d_q=kept";
  const overview = page.getByRole("region", { name: "Tổng quan baseline", exact: true });
  const kpi = name => overview.getByRole("article", { name: "KPI " + name, exact: true });
  const ready = async () => { await overview.getByRole("article", { name: "KPI Tổng lượt chạy", exact: true }).getByText(String(dashboard.total), { exact: true }).waitFor(); };
  const shot = async name => { await page.screenshot({ path: path.join(output, name + ".png"), fullPage: true }); screenshots.push(name + ".png"); };
  await page.goto(base + query); await ready();
  const scopedRequest = requests.find(url => url.pathname.endsWith("/analysis/runs") && url.searchParams.get("page") === "2");
  assert(scopedRequest);
  assert.equal(scopedRequest.searchParams.get("scenario_id"), "42");
  assert.equal(scopedRequest.searchParams.get("weather"), "RAIN");
  assert.equal(scopedRequest.searchParams.get("page_size"), "10");
  assert.equal(scopedRequest.searchParams.get("q"), null, "Page-local search must not be presented as server search");
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await shot("overview-" + width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "page overflow " + width);
  }
  // This assertion is the pre-change reproduction, not a permissive baseline exception.
  assert(!/vật lý phanh chưa hiệu chuẩn/.test(await overview.innerText()), "A profile alone cannot prove that every CARLA vehicle is uncalibrated");
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), { key: draftKey, value: draft });
  await page.reload(); await ready();
  assert.match(await kpi("An toàn").innerText(), /60[\s\S]*75%/);
  assert.equal((await kpi("Va chạm").locator("strong").innerText()).trim(), "7");
  assert.match(await overview.innerText(), /Phiên bản tổng hợp/);
  assert.match(await overview.getByRole("region", { name: "Chỉ số tổng hợp của nhóm 1", exact: true }).innerText(), /0\.000 m\/s/);
  const rows = overview.locator("tr[data-overview-run-id]");
  assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(n => Number(n.dataset.overviewRunId))), [101, 102, 103, 104, 105]);
  const first = rows.first();
  assert.match(await first.innerText(), /48846/); assert.match(await first.innerText(), /0\.01 s/);
  assert.match(await first.innerText(), /Mưa/); assert.match(await first.innerText(), /Ban đêm/);
  assert.equal((await first.locator("td[data-impact]").innerText()).trim(), "10.000 m/s");
  assert.equal((await rows.nth(1).locator("td[data-impact]").innerText()).trim(), "—");
  assert.equal((await rows.nth(2).locator("td[data-impact]").innerText()).trim(), "—", "A running run must not expose an inherited impact as a completed result");
  assert.equal(await rows.nth(1).getByRole("link", { name: /Playback/ }).count(), 0);
  assert.match(await overview.innerText(), /chưa cung cấp lệnh phanh AEB/);
  assert.equal(await overview.getByText(/AEB đã phanh|AEB không phanh|Nguyên nhân đã xác nhận/).count(), 0);
  for (const section of ["summary", "telemetry", "evidence"]) {
    const label = section === "summary" ? "Chi tiết" : section === "telemetry" ? "Telemetry" : "Bằng chứng";
    const link = first.getByRole("link", { name: label + " run 101", exact: true });
    const target = new URL(await link.getAttribute("href"), base);
    assert.equal(target.pathname, "/analysis/failures/101"); assert.equal(target.searchParams.get("section"), section);
    assert.equal(target.searchParams.get("returnTo"), query);
    await link.focus(); await page.keyboard.press("Enter");
    await page.waitForURL(u => u.pathname === "/analysis/failures/101");
    await page.getByRole("link", { name: "← Về danh sách đang xem", exact: true }).click();
    await page.waitForURL(base + query); await ready();
    assert.deepEqual(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), draftKey), draft);
  }
  const checks = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    const region = overview.getByRole("region", { name: "Run trong trang hiện tại, cuộn ngang", exact: true });
    await page.keyboard.press("Tab"); // Establish keyboard modality before checking :focus-visible.
    await region.focus(); assert(await region.evaluate(n => document.activeElement === n));
    assert.equal(await region.evaluate(n => getComputedStyle(n).outlineStyle), "solid");
    if (await region.evaluate(n => n.scrollWidth > n.clientWidth)) {
      await region.evaluate(n => { n.scrollLeft = 0; });
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.querySelector('[aria-label="Run trong trang hiện tại, cuộn ngang"]').scrollLeft > 0);
      const evidence = first.getByRole("link", { name: "Bằng chứng run 101", exact: true });
      await evidence.focus();
      const bounds = await evidence.boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, "Focused evidence link is brought into view inside the table");
      assert.equal(await page.evaluate(() => window.scrollX), 0);
    }
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (width < 1024) {
      await menu.focus(); await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector('button[aria-controls="vehicsim-navigation"]').getAttribute("aria-expanded") === "true");
      await page.keyboard.press("Escape"); assert.equal(await menu.getAttribute("aria-expanded"), "false");
      assert(await menu.evaluate(n => document.activeElement === n));
    }
    const tableScreenshot = "overview-runs-" + width + ".png";
    await region.screenshot({ path: path.join(output, tableScreenshot) }); screenshots.push(tableScreenshot);
    checks.push({ width, height, status: "PASS" });
  }
  dashboard = structuredClone(initial);
  dashboard.counts.SAFE = 60.5;
  dashboard.objective_groups[0].objectives.impact_speed_mps = { ...objective(36, "km/h"), status: "VALID" };
  dashboard.objective_groups[0].objectives.rms_jerk_mps3 = { ...objective(9.5, "m/s³"), status: "INCOMPLETE", missing: 2 };
  dashboard.objective_groups[0].objectives.stopping_distance_m = objective(0.0004, "m");
  await page.reload(); await ready();
  assert.equal((await kpi("An toàn").locator("strong").innerText()).trim(), "—");
  const objectives = overview.getByRole("region", { name: "Chỉ số tổng hợp của nhóm 1", exact: true });
  assert.match(await objectives.innerText(), /4\.00e-4 m/);
  assert(!/9\.500|36\.000|km\/h/.test(await objectives.innerText()));
  await shot("partial-invalid-metrics");
  dashboard.objective_groups[0].objectives.rms_jerk_mps3 = { ...objective(null, "m/s³"), status: "NOT_APPLICABLE", samples: 0, notApplicable: 6 };
  dashboard.objective_groups[0].objectives.impact_speed_mps = objective(-2, "m/s");
  await page.reload(); await ready();
  assert.match(await objectives.innerText(), /Không áp dụng/);
  assert(!/\-2\.000/.test(await objectives.innerText()));
  dashboard = { ...structuredClone(initial), total: 0, items: [], objective_groups: [], counts: Object.fromEntries(Object.keys(initial.counts).map(key => [key, 0])) };
  await page.reload(); await ready(); await overview.getByRole("heading", { name: "Chưa có run baseline phù hợp.", exact: true }).waitFor();
  assert.equal(await rows.count(), 0); assert.equal((await kpi("Va chạm").locator("strong").innerText()).trim(), "0");
  await shot("empty-filtered");
  await page.goto(base + "/analysis/failures"); await ready();
  await overview.getByText("API chưa trả về run baseline trong phạm vi này.", { exact: false }).waitFor();
  await shot("empty-unfiltered");
  dashboard = structuredClone(initial); mode = "hold";
  await page.reload(); await overview.getByRole("status").waitFor();
  assert.equal(await overview.getByRole("progressbar").count(), 0);
  assert.equal(await rows.count(), 0); await shot("loading");
  assert.equal(pending.length, 1); mode = "normal"; pending.shift()(); await ready();
  for (const behavior of ["error", "network", "forbidden"]) {
    mode = behavior; await page.reload(); await page.locator(".analysis-workspace").getByRole("alert").waitFor();
    assert.equal(await rows.count(), 0); assert.equal(await overview.getByRole("heading", { name: "Chưa có run baseline phù hợp.", exact: true }).count(), 0);
    await shot(behavior); mode = "normal"; await page.getByRole("button", { name: "Thử tải lại", exact: true }).click(); await ready();
  }
  dashboard = { ...structuredClone(initial), counts: null, objective_groups: null };
  await page.reload(); await overview.getByText("Dữ liệu tổng quan không hợp lệ.", { exact: true }).waitFor();
  assert.equal(await rows.count(), 0); await shot("malformed");
  dashboard = structuredClone(initial);
  dashboard.objective_groups.push({ ...structuredClone(initial.objective_groups[0]), identity: "7|2|vehicsim-kinematic-1.0|0.05", simulator: "vehicsim-kinematic-1.0", carla_observational_only: false });
  dashboard.items[4] = run(105, { simulator: "vehicsim-kinematic-1.0", dt: 0.05, metrics: { rms_jerk_mps3: 0, impact_speed_mps: 0, stopping_distance_m: 0 } });
  await page.reload(); await ready();
  assert.equal(await overview.locator("details[data-simulator]").count(), 2);
  assert.equal((await rows.nth(4).locator("td[data-impact]").innerText()).trim(), "0.000 m/s");
  assert.match(await rows.nth(4).innerText(), /vehicsim-kinematic-1\.0[\s\S]*0\.05 s/);
  await shot("mixed-sources-zero-impact");
  dashboard = structuredClone(initial); role = "MANAGER";
  await page.goto(base + query); await ready(); // Restore the filtered scope after the explicit unfiltered-empty case.
  assert.equal(await page.getByRole("link", { name: /Tối ưu toàn họ/ }).count(), 0);
  assert.equal(await first.getByRole("link", { name: "Bằng chứng run 101", exact: true }).count(), 1);
  await page.getByRole("navigation", { name: "Chế độ phân tích", exact: true }).getByRole("link", { name: "Tra cứu ca lỗi", exact: true }).click();
  await page.waitForURL(u => u.searchParams.get("view") === "failures");
  assert.equal(new URL(page.url()).searchParams.get("scenario_id"), "42");
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ status: "PASS", kind: "BROWSER_FIXTURE_ONLY", checks, screenshots,
    businessWrites: writes.length, errors, liveBackendVerified: false, carlaVerified: false, figmaVerified: false }, null, 2));
  console.log("PASS: Overview API mapping, states, navigation/context, keyboard and five viewports; fixture only");
} finally {
  for (const release of pending) release();
  await browser.close();
}
