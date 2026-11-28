/** Browser fixture: verify report filtering without changing a real workspace. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserOptions } from "./admin-test-utils.mjs";

const base = process.env.WORKSPACE_UI_URL || "http://localhost:3000";
const engineer = { id: 101, email: "engineer@example.invalid", full_name: "Engineer Fixture", role: "ENGINEER", is_active: true };
const manager = { id: 103, email: "manager@example.invalid", full_name: "Manager Fixture", role: "MANAGER", is_active: true };
const project = { id: 3, name: "Project Fixture", status: "ACTIVE" };
const report = (id, title, submitted_by) => ({
  id, title, submitted_by, project, task: null, content: "Nội dung kiểm thử",
  status: "SUBMITTED", attachment_url: null, reviewed_by: null,
  review_note: null, created_date: "2026-11-28T08:00:00",
});
const reports = [
  report(1, "Báo cáo của kỹ sư", engineer),
  report(2, "Báo cáo của thành viên", { id: 102, full_name: "Thành viên Fixture" }),
];
reports[1].content = "dulieukhongkhoangtrang".repeat(30);
reports[1].attachment_url = `https://example.invalid/${"artifact".repeat(90)}`;
const errors = [];
let failReports = true;
const browser = await chromium.launch(browserOptions());
try {
  async function createPage(actor) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addInitScript(() => localStorage.setItem("vehicsim_access_token", "fixture-only"));
    await context.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace("/api/v1", "");
      const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
      if (path === "/auth/me") return reply(actor);
      if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
      if (path === "/vehicsim/projects") return reply({ items: [], total: 0, page: 1, page_size: 20 });
      if (path === "/vehicsim/context") return reply({ project: null, workspace: null, vehicle: null, system: null, versions: [], families: [], parameters: [], reviewer_projects: [], reviewer_can_decide: false });
      if (path === "/vehicsim/workspaces/8") return reply({ workspace: { id: 8, name: "Workspace Fixture", status: "ACTIVE" }, projects: [project] });
      if (path === "/vehicsim/workspaces/8/tasks") return reply([]);
      if (path === "/vehicsim/workspaces/8/reports") {
        if (failReports) { failReports = false; return reply({ detail: "Không tải được báo cáo thử nghiệm" }, 503); }
        return reply(reports);
      }
      if (path === "/vehicsim/my/reports" && request.method() === "POST") return reply({ detail: "Không thể nộp báo cáo thử nghiệm" }, 400);
      if (path === "/vehicsim/workspaces/8/reports/1/decision" && request.method() === "POST") {
        failReports = true;
        return reply(reports[0]);
      }
      errors.push(`${request.method()} ${path}`);
      return reply({ detail: "Unhandled fixture" }, 404);
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    return page;
  }
  const page = await createPage(engineer);
  await page.goto(`${base}/workspace/8/reports`);
  await page.getByText("Không tải được báo cáo thử nghiệm", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Thử tải lại báo cáo" }).click({ timeout: 5000 });
  try {
    await page.getByRole("button", { name: /Báo cáo của kỹ sư/ }).waitFor({ timeout: 15000 });
  } catch (error) {
    console.error("Fixture page:", page.url(), await page.locator("body").innerText(), errors);
    throw error;
  }
  assert.equal(await page.getByText("Không tải được báo cáo thử nghiệm", { exact: true }).count(), 0);
  await page.getByRole("button", { name: /Báo cáo của thành viên/ }).waitFor();
  const filter = page.getByRole("button", { name: /Báo cáo của tôi/ });
  await filter.click();
  assert.equal(await filter.getAttribute("aria-pressed"), "true");
  assert.equal(await page.getByRole("button", { name: /Báo cáo của kỹ sư/ }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /Báo cáo của thành viên/ }).count(), 0);
  assert.equal(await page.getByText("1 báo cáo", { exact: true }).count(), 1);
  await filter.click();
  assert.equal(await filter.getAttribute("aria-pressed"), "false");
  assert.equal(await page.getByRole("button", { name: /Báo cáo của thành viên/ }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await filter.click();
  assert.equal(await page.getByRole("button", { name: /Báo cáo của thành viên/ }).count(), 0);
  await filter.click();
  await page.getByRole("button", { name: /Báo cáo của thành viên/ }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Long report content and attachment must not overflow mobile viewport");
  const longContent = page.getByText(reports[1].content, { exact: true });
  assert.equal(await longContent.evaluate((element) => element.scrollWidth <= element.clientWidth), true, "Long report content must wrap instead of being clipped");
  const attachment = page.getByRole("link", { name: reports[1].attachment_url });
  assert.equal(await attachment.evaluate((element) => element.getBoundingClientRect().right <= document.documentElement.clientWidth), true, "Long attachment must wrap inside the viewport");
  await page.getByRole("button", { name: "+ Nộp báo cáo" }).click();
  const dialog = page.getByRole("dialog", { name: "Nộp báo cáo công việc" });
  await dialog.getByLabel("Tiêu đề báo cáo *").fill("Báo cáo thử");
  await dialog.getByLabel("Project *").selectOption("3");
  await dialog.getByLabel("Nội dung báo cáo *").fill("Nội dung thử");
  await dialog.getByRole("button", { name: "Nộp báo cáo", exact: true }).click();
  await dialog.getByRole("alert").waitFor({ timeout: 5000 });
  assert.match(await dialog.getByRole("alert").innerText(), /Không thể nộp báo cáo thử nghiệm/);
  await dialog.getByRole("button", { name: "Huỷ" }).click();
  const managerPage = await createPage(manager);
  await managerPage.goto(`${base}/workspace/8/reports`);
  await managerPage.getByRole("button", { name: /Báo cáo của kỹ sư/ }).click();
  assert.equal(await managerPage.getByRole("button", { name: /Báo cáo của tôi/ }).count(), 0);
  assert.equal(await managerPage.getByRole("button", { name: "+ Nộp báo cáo" }).count(), 0);
  managerPage.once("dialog", (confirm) => confirm.accept());
  await managerPage.getByRole("button", { name: "Duyệt", exact: true }).click();
  await managerPage.getByText("Không tải được báo cáo thử nghiệm", { exact: true }).waitFor();
  assert.equal(await managerPage.getByText("Đã duyệt báo cáo “Báo cáo của kỹ sư”.", { exact: true }).count(), 1);
  await managerPage.getByRole("button", { name: "Thử tải lại báo cáo" }).click();
  await managerPage.getByText("Không tải được báo cáo thử nghiệm", { exact: true }).waitFor({ state: "hidden" });
  assert.equal(await managerPage.getByText("Đã duyệt báo cáo “Báo cáo của kỹ sư”.", { exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log("Workspace reports filter fixture passed at desktop and mobile widths.");
} finally {
  await browser.close();
}
