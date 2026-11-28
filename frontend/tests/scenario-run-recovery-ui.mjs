/** Verify baseline family loading and mobile layout using intercepted read-only responses. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserOptions } from "./admin-test-utils.mjs";

const base = process.env.SCENARIO_UI_URL || "http://localhost:3000";
const host = new URL(base).hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) throw new Error("Only a local app is supported");
const browser = await chromium.launch(browserOptions());
let fail = true;
let role = "EXPERIENCER";
const problems = [];
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  await context.addInitScript(() => { localStorage.setItem("vehicsim_access_token", "fixture-only"); localStorage.setItem("vehicsim_project", "1"); });
  await context.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/v1", "");
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": "*" } });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project", "Access-Control-Allow-Methods": "GET,OPTIONS" } });
    if (req.method() !== "GET") { problems.push(`Unexpected write: ${req.method()} ${path}`); return reply({}, 405); }
    if (path === "/auth/me") return reply({ id: 99, email: "demo@example.invalid", full_name: "Fixture", role, is_active: true });
    if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (path === "/vehicsim/projects/1/journey") return reply({ detail: "Journey unavailable in fixture" }, 404);
    if (path === "/vehicsim/projects") return reply({ items: [], total: 0, page: 1, page_size: 9, active_count: 0, archived_count: 0 });
    if (path === "/vehicsim/context") return reply({ project: { id: 1, name: "Fixture" }, workspace: null, vehicle: { id: 1, name: "Fixture" }, system: { id: 1, name: "AEB", baseline: { id: 1, label: "v1" } }, simulator: "vehicsim-kinematic-1.4", versions: [], families: [{ id: 12, code: "PX", name: "Họ kiểm thử" }], parameters: [], reviewer_projects: [], reviewer_can_decide: false });
    if (path === "/vehicsim/families") {
      if (fail) return reply({ detail: "Fixture: không tải được họ" }, 503);
      return reply([{ id: 12, code: "PX", name: "Họ kiểm thử", version: 1, variants: 2, description: "", risk_counts: { DANGEROUS: 1, SAFE: 1 }, parameter_space: {}, baseline_progress: {}, runs: {}, failures: 0, baseline: "v1" }]);
    }
    problems.push(`Unexpected request: ${path}`);
    return reply({}, 404);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto(`${base}/scenarios/run`);
  try {
    await page.getByText("Không thể tải danh sách họ kịch bản.").waitFor({ timeout: 10000 });
  } catch (error) {
    console.error("Page:", await page.locator("body").innerText(), "Requests:", problems);
    throw error;
  }
  assert.equal(await page.getByText("Chưa có họ kịch bản nào").count(), 0);
  fail = false;
  await page.getByRole("button", { name: "Thử tải lại" }).click();
  await page.getByText("PX · Họ kiểm thử", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("Fixture: không tải được họ").count(), 0);
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, overflow: [...document.querySelectorAll("body *")].map((el) => ({ tag: el.tagName, className: el.getAttribute("class"), right: el.getBoundingClientRect().right })).filter((el) => el.right > document.documentElement.clientWidth + 1).slice(0, 8) }));
  assert.equal(dimensions.scroll <= dimensions.client, true, JSON.stringify(dimensions));
  await page.getByLabel("Chọn họ kịch bản kiểm thử").click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.keyboard.press("Escape");
  fail = true;
  await page.getByRole("button", { name: "Làm mới" }).click();
  await page.getByText(/Dữ liệu đang hiển thị có thể chưa được cập nhật/).waitFor();
  fail = false;
  await page.getByRole("button", { name: "Làm mới" }).click();
  await page.getByText(/Dữ liệu đang hiển thị có thể chưa được cập nhật/).waitFor({ state: "hidden" });
  role = "REVIEWER";
  await page.reload();
  await page.getByText("Chưa có lượt chạy nào cho cấu hình hiện tại.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Khởi chạy baseline" }).isDisabled(), true);
  assert.equal(await page.getByText("Chưa có lượt chạy nào. Bấm nút bên dưới để bắt đầu.").count(), 0);
  const reviewerDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, overflow: [...document.querySelectorAll("body *")].map((el) => ({ tag: el.tagName, className: el.getAttribute("class"), right: el.getBoundingClientRect().right })).filter((el) => el.right > document.documentElement.clientWidth + 1).slice(0, 8) }));
  assert.equal(reviewerDimensions.scroll <= reviewerDimensions.client, true, JSON.stringify(reviewerDimensions));
  await page.setViewportSize({ width: 1366, height: 768 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(problems, []);
  console.log("Baseline family loading recovery and mobile layout passed.");
} finally {
  await browser.close();
}
