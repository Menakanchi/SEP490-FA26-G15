/** Project UI against API fixtures only; no actual account or project is changed. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserOptions } from "./admin-test-utils.mjs";

const base = process.env.PROJECT_UI_URL || "http://localhost:3000";
const browser = await chromium.launch(browserOptions());
const journey = { round: 1, steps: [], next: "SCENARIO", counts: {}, last_activity_at: "2026-11-28T00:00:00" };
const personal = { id: 991, name: "Project cá nhân demo", status: "ACTIVE", workspace_id: null,
  description: "", vehicle_id: 1, vehicle_name: "Xe demo", family_count: 1, run_count: 1,
  regression_count: 0, has_running_work: false, created_date: "2026-11-28T00:00:00", journey };
const team = { ...personal, id: 992, name: "Project nhóm demo", workspace_id: 8 };

async function scenario(width, mode) {
  const engineer = mode === "engineer" || mode === "engineerLong";
  const teamProject = mode === "engineerLong" ? { ...team, name: "ABCDEFGHIJKLMNOPQR".repeat(5) } : team;
  const project = mode === "long" ? { ...personal, name: "ABCDEFGHIJKLMNOPQR".repeat(5) } : personal;
  const writes = [];
  const errors = [];
  const context = await browser.newContext({ viewport: { width, height: 850 } });
  await context.addInitScript((project) => {
    localStorage.setItem("vehicsim_access_token", "fixture-only");
    localStorage.setItem("vehicsim_project", String(project));
  }, engineer ? team.id : personal.id);
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
      "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project",
      "Access-Control-Allow-Methods": "GET,DELETE,OPTIONS" } });
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${path}`);
      if (request.method() === "DELETE" && path === `/vehicsim/projects/${personal.id}` && !engineer) {
        return mode === "partial" ? reply({ deleted: true, cleanup_failed_run_ids: [101] }) : route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
      }
      return reply({ detail: "Fixture từ chối thao tác" }, 403);
    }
    if (path === "/auth/me") return reply({ id: 91, email: "fixture@example.invalid", full_name: "Fixture", role: engineer ? "ENGINEER" : "EXPERIENCER", is_active: true });
    if (path === "/vehicsim/context") return reply({ project: engineer ? teamProject : project, workspace: engineer ? { id: 8, name: "Workspace demo" } : null,
      vehicle: { id: 1, name: "Xe demo" }, system: { id: 1, baseline: null }, versions: [], families: [], parameters: [], reviewer_projects: [], reviewer_can_decide: false });
    if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (path === "/vehicsim/projects/vehicle-options") return reply([]);
    if (path === `/vehicsim/projects/${personal.id}`) return reply({ ...project, has_running_work: mode === "busy" });
    if (path === "/vehicsim/projects") return reply({ items: engineer ? [teamProject, personal] : [], total: engineer ? 2 : 0,
      page: 1, page_size: 9, active_count: engineer ? 2 : 0, archived_count: 0 });
    return reply({ detail: `Unhandled fixture ${path}` }, 404);
  });
  const page = await context.newPage();
  page.on("pageerror", error => { errors.push(error.message); console.error("Fixture page error:", error.message); });
  try {
    if (engineer) {
      await page.goto(`${base}/projects`);
      await page.locator("#vehicsim-content").getByText(teamProject.name, { exact: true }).first().waitFor();
      try { await page.locator("#vehicsim-content").getByText(personal.name, { exact: true }).first().waitFor({ timeout: 8000 }); }
      catch (error) { console.error("Engineer fixture:", await page.locator("body").innerText()); throw error; }
      assert.equal(await page.getByText("Chỉ xem", { exact: true }).count(), 1);
      assert.equal(await page.getByRole("button", { name: /Xoá vĩnh viễn|Lưu trữ project/ }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "engineer list overflow");
      await page.goto(`${base}/projects/${personal.id}/settings`);
      await page.getByRole("region", { name: "Tóm tắt project" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Xoá vĩnh viễn", exact: true }).count(), 0,
        "Engineer must not be offered deletion of a former personal project");
      assert.equal(await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).count(), 0,
        "Engineer must not be offered editing of a former personal project");
      assert.deepEqual(writes, []);
    } else {
      await page.goto(`${base}/projects/${personal.id}/settings`);
      const start = page.getByRole("button", { name: "Xoá vĩnh viễn", exact: true });
      await start.waitFor();
      const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 8).map(el => ({ tag: el.tagName, className: el.className, text: el.textContent?.slice(0, 80) })) }));
      assert.ok(overflow.scroll <= overflow.width, `settings overflow: ${JSON.stringify(overflow)}`);
      if (mode === "busy") {
        assert.equal(await start.isDisabled(), true);
        assert.deepEqual(writes, []);
      } else {
        await start.click();
        const dialog = page.getByRole("dialog");
        assert.match(await dialog.innerText(), /file cục bộ/i);
        assert.match(await dialog.innerText(), /lưu trữ ngoài|S3/i);
        const confirm = dialog.getByRole("button", { name: "Xoá vĩnh viễn", exact: true });
        await dialog.locator("input").fill("Sai tên");
        assert.equal(await confirm.isDisabled(), true);
        await dialog.locator("input").fill(project.name);
        assert.equal(await confirm.isEnabled(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "dialog overflow");
        if (mode === "partial") {
          const warning = page.waitForEvent("dialog");
          await confirm.click();
          const alert = await warning;
          assert.match(alert.message(), /#101/);
          assert.match(alert.message(), /đang chờ dọn lại tự động/);
          await alert.accept();
        } else await confirm.click();
        await page.waitForURL("**/projects");
        await page.getByRole("heading", { name: "Thử phanh khẩn cấp AEB trong mô phỏng" }).waitFor();
        assert.equal(await page.getByText(/Đã xoá/).isVisible(), true, "successful deletion confirmation must remain visible");
        assert.deepEqual(writes, [`DELETE /vehicsim/projects/${personal.id}`]);
      }
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px ${mode}`);
  } finally {
    await context.close();
  }
}

try {
  const failures = [];
  for (const width of [320, 1440]) {
    for (const mode of ["busy", "partial", "success", "long", "engineer", "engineerLong"]) {
      try { await scenario(width, mode); }
      catch (error) { failures.push(`${width}px ${mode}: ${error.message}`); console.error(failures.at(-1)); }
    }
  }
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
}
