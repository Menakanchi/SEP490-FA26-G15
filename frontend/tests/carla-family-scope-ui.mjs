/** CARLA family management against intercepted API responses; no backend data is changed. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserOptions } from "./admin-test-utils.mjs";

const base = process.env.CARLA_UI_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Only a local app is supported");
const browser = await chromium.launch(browserOptions());
const writes = [];
const errors = [];
const selectedProject = 1;
let failNextRuns = false;
const families = {
  1: [{ id: 11, code: "PX", name: "Họ một" }, { id: 12, code: "PX2", name: "Họ hai" }],
 2: [{ id: 21, code: "PY", name: "Họ project khác" }],
};
const runs = [
  { id: 101, project_id: 1, scenario_id: 12, status: "FAILED", purpose: "BASELINE", regression_test_id: null, optimization_trial_id: null, created_by_user_id: 1 },
  { id: 201, project_id: 2, scenario_id: 21, status: "RUNNING", purpose: "BASELINE", regression_test_id: null, optimization_trial_id: null, created_by_user_id: 1 },
];
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("vehicsim_access_token", "fixture-only"));
  await context.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/api/v1", "");
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": "*" } });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" } });
    if (path === "/auth/me") return reply({ id: 1, email: "fixture@example.invalid", full_name: "Fixture", role: "ADMIN", is_active: true });
    if (path === "/vehicsim/context") return reply({ project: { id: selectedProject, name: `Project ${selectedProject}` }, workspace: null, vehicle: { id: 1, name: "Xe" }, simulator: "carla-0.9.16-xosc16", system: { id: 1, name: "AEB", baseline: { id: 1, label: "v1" } }, versions: [], parameters: [], families: families[selectedProject], reviewer_projects: [], reviewer_can_decide: true });
    if (path === "/vehicsim/carla/status") return reply({ connected: false, configured: true, compatible: true, scenario_runner: true, simulator: "carla-0.9.16-xosc16" });
    if (path === "/vehicsim/carla/run-projects") return reply([{ id: 1, name: "Project 1", run_count: 1 }, { id: 2, name: "Project 2", run_count: 1 }]);
    if (path === "/vehicsim/carla/runs") {
      if (failNextRuns) { failNextRuns = false; return reply({ detail: "Fixture refresh failure" }, 503); }
      return reply(url.searchParams.has("project_id") ? runs.filter(run => run.project_id === Number(url.searchParams.get("project_id"))) : runs);
    }
    if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    if (path === "/vehicsim/families/12/cancel" && req.method() === "POST") { writes.push(`${req.method()} ${path}${url.search}`); failNextRuns = true; return reply({ stopped: 1, stopping: 0 }); }
    if (path === "/vehicsim/families/12/baseline-runs" && req.method() === "DELETE") { writes.push(`${req.method()} ${path}${url.search}`); return reply({ deleted: 1, skipped_completed: 1, skipped_active: 0, skipped_in_use: 0, skipped_not_owner: 0 }); }
    if (req.method() !== "GET") { errors.push(`Unexpected write: ${req.method()} ${path}`); return reply({}, 405); }
    return reply([]);
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(`${base}/analysis/carla?family=999`);
  await page.getByRole("tab", { name: "Lượt chạy", exact: true }).click();
  assert.equal(await page.getByLabel("Họ kịch bản để quản lý").inputValue(), "11");
  await page.getByLabel("Họ kịch bản để quản lý").selectOption("12");
  await page.getByText("Bộ lọc trên chỉ thay đổi danh sách", { exact: false }).waitFor();
  await page.getByText("Quản lý họ kịch bản", { exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Hủy lượt chạy #0201" }).isDisabled(), true);
  await page.getByRole("button", { name: "Hủy lượt đang chạy", exact: true }).click();
  await page.getByText("Đã hủy 1 lượt đang chờ", { exact: false }).waitFor();
  await page.getByText("Đã gửi yêu cầu hủy nhưng không tải lại được danh sách", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Xóa lượt baseline lỗi / đã hủy", exact: true }).click();
  await page.getByText("Đã xóa 1 lượt baseline", { exact: false }).waitFor();
  assert.deepEqual(writes, ["POST /vehicsim/families/12/cancel?simulator_type=CARLA", "DELETE /vehicsim/families/12/baseline-runs?simulator_type=CARLA"]);
  await page.getByLabel("Xem lượt chạy của project").selectOption("2");
  await page.getByText("Project 1", { exact: false }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Hủy lượt chạy #0201" }).isDisabled(), true);
  assert.equal(await page.getByLabel("Họ kịch bản để quản lý").inputValue(), "12");
  await page.addStyleTag({ content: "html { overflow-y: scroll; } ::-webkit-scrollbar { width: 15px; height: 15px; }" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(errors, []);
  await context.close();
  console.log("CARLA family scope, simulated actions and 320px layout passed.");
} finally {
  await browser.close();
}
