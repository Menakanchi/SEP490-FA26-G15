/** Verify Manager search results stay bound to the submitted email, using mocked API responses. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserOptions } from "./admin-test-utils.mjs";

const base = process.env.WORKSPACE_UI_URL || "http://localhost:3000";
const actor = { id: 101, email: "manager@example.invalid", full_name: "Manager Fixture", role: "MANAGER", is_active: true };
const workspace = { id: 8, name: "Workspace Fixture", description: null, status: "ACTIVE", manager: actor, member_count: 0, project_count: 0, pending_report_count: 0, created_date: "2026-11-28" };
const candidate = (email, name, user_id) => ({ email, full_name: name, user_id, role: "EXPERIENCER" });
const errors = [];
let releaseOld;
const oldReply = new Promise((resolve) => { releaseOld = resolve; });
let oldRequested;
const oldStarted = new Promise((resolve) => { oldRequested = resolve; });
const browser = await chromium.launch(browserOptions());
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("vehicsim_access_token", "fixture-only"));
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,OPTIONS" } });
    if (path === "/auth/me") return reply(actor);
    if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (path === "/vehicsim/projects") return reply({ items: [], total: 0, page: 1, page_size: 20 });
    if (path === "/vehicsim/context") return reply({ project: null, workspace: null, vehicle: null, system: null, versions: [], families: [], parameters: [], reviewer_projects: [], reviewer_can_decide: false });
    if (path === "/vehicsim/workspaces/8") return reply({ workspace, projects: [] });
    if (path === "/vehicsim/workspaces/8/members" || path === "/vehicsim/workspaces/8/messages") return reply([]);
    if (path.endsWith("/messages/stream")) return route.fulfill({ status: 403, contentType: "application/json", body: "{}" });
    if (path === "/vehicsim/workspaces/8/member-candidates") {
      const email = url.searchParams.get("q");
      if (email === "old@example.invalid") {
        oldRequested();
        await oldReply;
        return reply([candidate(email, "Người cũ", 1)]);
      }
      return reply([candidate(email, "Người mới", 2)]);
    }
    errors.push(`${request.method()} ${path}`);
    return reply({ detail: "Unhandled fixture" }, 404);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/workspace/8`);
  await page.getByRole("button", { name: "+ Thêm thành viên" }).click();
  const input = page.getByRole("textbox", { name: "Email của người dùng cần thêm" });
  await input.fill("old@example.invalid");
  await page.getByRole("button", { name: "Tìm", exact: true }).click();
  await oldStarted;
  assert.equal(await page.getByText("Đang tìm tài khoản…").count(), 1);
  await input.fill("new@example.invalid");
  await page.getByRole("button", { name: "Tìm", exact: true }).click();
  await page.getByText("Người mới", { exact: true }).waitFor();
  const oldResponse = page.waitForResponse((response) => response.url().includes("old%40example.invalid"));
  releaseOld();
  await oldResponse;
  assert.equal(await page.getByText("Người cũ", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Người mới", { exact: true }).count(), 1);
  await input.fill("other@example.invalid");
  assert.equal(await page.getByText("Người mới", { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1366, height: 768 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("Workspace member search fixture passed: stale responses and mobile/desktop widths.");
} finally {
  releaseOld();
  await browser.close();
}
