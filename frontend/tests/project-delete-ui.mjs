/** HTTP fixtures only: no account, database or project is created or deleted. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserOptions } from "./admin-test-utils.mjs";

const base = process.env.PROJECT_UI_URL || "http://localhost:3000";
const browser = await chromium.launch(browserOptions());
const user = { id: 991, email: "fixture@example.invalid", full_name: "Fixture", role: "EXPERIENCER" };
const project = { id: 991, name: "Project demo", status: "ACTIVE", description: "", vehicle_id: 1,
  vehicle_name: "Demo", family_count: 0, run_count: 0, regression_count: 0,
  has_running_work: false, created_date: "2026-11-28T00:00:00" };

try {
  for (const mode of ["network", "server", "client", "partial"]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
    await context.addInitScript(() => {
      localStorage.setItem("vehicsim_access_token", "fixture-token");
      localStorage.setItem("vehicsim_project", "991");
    });
    await context.route("**/api/v1/**", async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace("/api/v1", "");
      const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
        "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project", "Access-Control-Allow-Methods": "GET,DELETE,OPTIONS" } });
      if (path === "/auth/me") return reply(user);
      if (path === "/vehicsim/projects/991" && req.method() === "DELETE") {
        if (mode === "network") return route.abort("failed");
        if (mode === "server") return reply({ detail: "server error" }, 503);
        if (mode === "client") return reply({ detail: "Tên xác nhận không đúng." }, 409);
        return reply({ deleted: true, cleanup_failed_run_ids: [5, 7] });
      }
      if (path === "/vehicsim/projects/991") return reply(project);
      if (path === "/vehicsim/projects/vehicle-options") return reply([]);
      if (path === "/vehicsim/projects") return reply({ items: [], total: 0, page: 1, page_size: 9, active_count: 0, archived_count: 0 });
      if (path === "/vehicsim/context") return reply({ project, workspace: null, vehicle: { id: 1, name: "Demo" },
        system: { id: 1, baseline: null }, versions: [], families: [], parameters: [], reviewer_projects: [], reviewer_can_decide: false });
      if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
      return reply({ detail: `Unhandled fixture ${path}` }, 404);
    });
    const page = await context.newPage();
    page.on("pageerror", error => console.error("Page error:", error.message));
    page.setDefaultTimeout(20000);
    await page.goto(`${base}/projects/991/settings`);
    try {
      await page.getByRole("button", { name: "Xoá vĩnh viễn", exact: true }).click();
    } catch (error) {
      console.error("Page:", page.url(), await page.locator("body").innerText());
      throw error;
    }
    const modal = page.getByRole("dialog");
    await modal.locator("input").fill(project.name);
    if (mode === "partial") {
      const dialog = page.waitForEvent("dialog");
      await modal.getByRole("button", { name: "Xoá vĩnh viễn", exact: true }).click();
      const alert = await dialog;
      assert.match(alert.message(), /đã được xóa khỏi cơ sở dữ liệu/);
      assert.match(alert.message(), /#5, #7/);
      assert.match(alert.message(), /đang chờ dọn lại tự động/);
      assert.match(alert.message(), /Không cần xóa lại project/);
      await alert.accept();
      await page.waitForURL("**/projects");
    } else {
      await modal.getByRole("button", { name: "Xoá vĩnh viễn", exact: true }).click();
      if (mode === "client") await modal.getByText("Tên xác nhận không đúng.").waitFor();
      else await modal.getByText(/Chưa xác định được project đã xóa hay chưa/).waitFor();
    }
    await context.close();
    console.log(`PASS ${mode}`);
  }
} finally {
  await browser.close();
}
