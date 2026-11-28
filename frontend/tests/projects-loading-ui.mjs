/** Exercise project-list races and recovery with intercepted read-only API responses. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserOptions } from "./admin-test-utils.mjs";

const base = process.env.PROJECTS_UI_URL || "http://localhost:3000";
const actor = { id: 101, email: "engineer@example.invalid", full_name: "Engineer Fixture", role: "ENGINEER", is_active: true };
const row = (id, name, status) => ({ id, name, status, workspace_id: 8, vehicle_name: "Xe kiểm thử" });
const list = (items) => ({ items, total: items.length, page: 1, page_size: 9, active_count: 1, archived_count: 1 });
let releaseFirst, firstRequested;
const firstPending = new Promise((resolve) => { releaseFirst = resolve; });
const firstSeen = new Promise((resolve) => { firstRequested = resolve; });
let activeCalls = 0;
let searchedFor = null;
const problems = [];
const browser = await chromium.launch(browserOptions());
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("vehicsim_access_token", "fixture-only"));
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project", "Access-Control-Allow-Methods": "GET,OPTIONS" } });
    if (request.method() !== "GET") { problems.push(`Unexpected write: ${request.method()} ${path}`); return reply({}, 405); }
    if (path === "/auth/me") return reply(actor);
    if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (path === "/vehicsim/context") return reply({ project: { id: 1, name: "Fixture" }, workspace: { id: 8, name: "Fixture" }, vehicle: { id: 1, name: "Fixture" }, system: { id: 1, baseline: null }, versions: [], families: [], parameters: [], reviewer_projects: [], reviewer_can_decide: false });
    if (path === "/vehicsim/projects") {
      const status = url.searchParams.get("status");
      if (!status) return reply(list([]));
      if (status === "ARCHIVED") return reply(list([row(2, "Project lưu trữ", status)]));
      if (url.searchParams.get("q")) { searchedFor = url.searchParams.get("q"); return reply(list([])); }
      activeCalls++;
      if (activeCalls === 1) { firstRequested(); await firstPending; return reply(list([row(1, "Project cũ", status)])); }
      if (activeCalls === 2) return reply({ detail: "Fixture: không tải được project" }, 503);
      return reply(list([row(3, "Project phục hồi", status)]));
    }
    problems.push(`Unexpected request: ${path}`);
    return reply({}, 404);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto(`${base}/projects`);
  await firstSeen;
  assert.equal(await page.getByLabel("Đang tải", { exact: true }).count(), 1);
  await page.getByRole("tab", { name: /Lưu trữ/ }).click();
  await page.getByText("Project lưu trữ", { exact: true }).waitFor();
  const oldResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get("status") === "ACTIVE");
  releaseFirst();
  await (await oldResponse).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByText("Project lưu trữ", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Project cũ", { exact: true }).count(), 0);
  await page.getByRole("tab", { name: /Đang hoạt động/ }).click();
  await page.getByRole("button", { name: "Thử tải lại" }).waitFor();
  assert.equal(await page.getByText("Project lưu trữ", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Thử tải lại" }).click();
  await page.getByText("Project phục hồi", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Thử tải lại" }).count(), 0);
  await page.getByLabel("Tìm theo tên project").fill("  không có kết quả  ");
  await page.getByRole("button", { name: "Tìm", exact: true }).click();
  await page.getByText("Không có project nào khớp “không có kết quả”", { exact: true }).waitFor();
  assert.equal(searchedFor, "không có kết quả");
  assert.equal(await page.getByText("Project phục hồi", { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1366, height: 768 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(problems, []);
  console.log("Project list race, retry, search and mobile fixture passed.");
} finally {
  releaseFirst?.();
  await browser.close();
}
