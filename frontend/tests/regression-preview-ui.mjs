/** Fixture-only check for out-of-order previews and recovery; requires a local app. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.REGRESSION_UI_URL || "http://localhost:3000";
const url = new URL(base);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Only a local app is supported");
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
let releaseFirst;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const actor = { id: 999912, email: "regression@example.invalid", full_name: "Fixture", role: "ENGINEER" };
  let fail = false, held = false;
  await context.route("**/api/v1/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace("/api/v1", "");
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": "*" } });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
    if (path === "/auth/login") return reply({ access_token: "fixture-only", token_type: "bearer", expires_in: 3600, user: actor });
    if (req.method() !== "GET") return reply({ detail: "Writes disabled in fixture" }, 405);
    if (path === "/auth/me") return reply(actor);
    if (path === "/vehicsim/context") return reply({ project: { id: 999912, name: "Fixture" }, workspace: { id: 1, name: "Fixture" }, vehicle: { id: 2, name: "Fixture" }, system: { id: 1, name: "AEB", baseline: { id: 7, label: "v7" } }, versions: [{ id: 8, label: "v8", status: "CANDIDATE" }], families: [{ id: 42, code: "A", name: "Họ A" }, { id: 43, code: "B", name: "Họ B" }], parameters: [], reviewer_projects: [], reviewer_can_decide: false });
    if (path === "/vehicsim/regression/preview") {
      const id = Number(new URL(req.url()).searchParams.get("scenario_id"));
      if (id === 42 && !held) { held = true; await new Promise(resolve => { releaseFirst = resolve; }); }
      if (fail) return reply({ detail: "Fixture unavailable" }, 503);
      return reply({ scenario_id: id, family: `Họ ${id}`, baseline: "v7", variant_count: id === 42 ? 99 : 3, old_critical_count: 1, baseline_runs_existing: 0, variants: [] });
    }
    if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    return reply([]);
  });
  const page = await context.newPage();
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Browser-fixture-only-12");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(u => u.pathname !== "/login");
  await page.goto(base + "/validation/regression/new");
  await page.getByText("Đang tải số liệu bộ kịch bản…").waitFor();
  await page.getByLabel("Chọn họ kịch bản").click();
  await page.getByText("B · Họ B", { exact: true }).click();
  await page.getByText("3 kịch bản", { exact: true }).waitFor();
  releaseFirst();
  await page.waitForTimeout(300);
  assert.equal(await page.getByText("99 kịch bản", { exact: true }).count(), 0);
  assert.equal(await page.getByText("3 kịch bản", { exact: true }).count(), 1);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  fail = true;
  await page.getByLabel("Chọn họ kịch bản").click();
  await page.getByText("A · Họ A", { exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Fixture unavailable" }).waitFor();
  assert.equal(await page.getByText("3 kịch bản", { exact: true }).count(), 0);
  fail = false;
  await page.getByRole("button", { name: "Thử tải lại" }).click();
  await page.getByText("99 kịch bản", { exact: true }).waitFor();
  console.log("PASS: out-of-order previews, error recovery and mobile width");
} finally {
  releaseFirst?.();
  await browser.close();
}
