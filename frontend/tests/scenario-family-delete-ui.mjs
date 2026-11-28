/** Kiểm tra tương tác xóa họ với HTTP fixture; không gọi backend hoặc sửa dữ liệu thật. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCENARIO_UI_URL || "http://localhost:3130";
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const actor = role => ({ id: 999901, email: "scenario@example.invalid", full_name: "Fixture", role });
const family = (id, name) => ({ id, code: `CP-${id}`, name, description: null, category: "CP_CROSSING",
  version: 1, version_count: 1, parameter_space: {}, variants: 1, runs: {}, failures: 0, created_at: "2026-11-27T10:00:00" });
const malicious = '<img src=x onerror="window.__injected=1">';
let families = [family(41, malicious), family(42, "Có dữ liệu")];
const writes = [];
const requests = [];
let unblockDelete;
let deleteStarted;

async function session(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/v1/**", async route => {
    const p = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    requests.push({ path: p, project: route.request().headers()["x-vehicsim-project"] });
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" };
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (p === "/auth/login") return reply({ access_token: "scenario-fixture", token_type: "bearer", expires_in: 3600, user: actor(role) });
    if (p === "/auth/me") return reply(actor(role));
    if (p === "/vehicsim/reviewer/projects") return reply([{ id: 77, name: "Workspace fixture", workspace_name: "Fixture", can_decide: true }]);
    if (p === "/vehicsim/context") return reply({ project: { id: Number(route.request().headers()["x-vehicsim-project"]) || 1, name: "Fixture" }, workspace: null, vehicle: { id: 1, name: "Fixture" },
      system: { id: 1, baseline: null }, versions: [], families: families.map(({ id, code, name }) => ({ id, code, name })), parameters: [], reviewer_projects: [] });
    if (p === "/vehicsim/families" && method === "GET") return reply(families);
    if (p === "/vehicsim/regression") return reply({ items: [], kpis: { total: 0, passed: 0, failed: 0, running: 0 } });
    if (p === "/vehicsim/decisions") return reply({ decisions: [], baselines: [] });
    if (p === "/vehicsim/my/work") return reply({ tasks: [], reports: [] });
    if (p === "/vehicsim/analysis/runs") return reply({ total: 0, page: 1, page_size: 10, counts: {}, items: [], objective_groups: [], evaluation_version: "adr040-stored-aggregation/1" });
    if (p === "/vehicsim/analysis/v3/sources") return reply({ items: [], limit: 20, offset: 0 });
    if (p === "/vehicsim/analysis/v3/explorer/scenarios/42/runs") return reply({ project_id: 77, items: [], total: 0, limit: 20, offset: 0 });
    if (p === "/vehicsim/analysis/v3/explorer/scenarios") return reply({ project_id: 77, items: [], total: 0, limit: 20, offset: 0 });
    if (p === "/vehicsim/families/42" && method === "DELETE") {
      writes.push(p);
      return reply({ detail: "This scenario family has runs or related analysis, optimization or regression data and cannot be deleted" }, 409);
    }
    if (p === "/vehicsim/families/41" && method === "DELETE") {
      writes.push(p);
      deleteStarted();
      await new Promise(resolve => { unblockDelete = resolve; });
      families = families.filter(item => item.id !== 41);
      return route.fulfill({ status: 204, headers });
    }
    if (p === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
    return reply([]);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(actor(role).email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Fixture-password-15");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(url => url.pathname !== "/login");
  await page.goto(base + "/scenarios");
  await page.locator("#family-41").waitFor();
  return { context, page, errors };
}

try {
  const { context, page, errors } = await session("ENGINEER");
  const first = page.locator("#family-41");
  const blocked = page.locator("#family-42");
  assert.equal(await first.locator("img").count(), 0, "Tên do người dùng đặt phải hiển thị dưới dạng văn bản");
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  assert.equal(await first.getByRole("button", { name: "Sửa v2" }).count(), 1);

  page.once("dialog", dialog => dialog.dismiss());
  await first.getByRole("button", { name: /Xóa họ kịch bản/ }).click();
  assert.equal(writes.length, 0, "Hủy xác nhận không được gửi DELETE");
  assert.equal(await first.count(), 1);

  page.once("dialog", dialog => dialog.accept());
  await blocked.getByRole("button", { name: /Xóa họ kịch bản/ }).click();
  await page.getByText(/Không thể xóa họ kịch bản vì đã có lượt chạy/).waitFor();
  assert.equal(await blocked.count(), 1, "Họ phải được giữ khi backend trả 409");

  const started = new Promise(resolve => { deleteStarted = resolve; });
  page.once("dialog", dialog => dialog.accept());
  await first.getByRole("button", { name: /Xóa họ kịch bản/ }).click();
  await started;
  assert.equal(await first.getByRole("button", { name: /Xóa họ kịch bản/ }).isDisabled(), true, "Không gửi xóa hai lần khi đang chờ");
  assert.equal(await blocked.getByRole("button", { name: /Xóa họ kịch bản/ }).isDisabled(), true);
  unblockDelete();
  await first.waitFor({ state: "detached" });
  await page.getByText(/Đã xóa họ kịch bản CP-41/).waitFor();
  assert.equal(writes.filter(p => p.endsWith("/41")).length, 1);
  assert.deepEqual(errors, [], "Không có lỗi JavaScript khi thao tác");
  const selectedContext = page.waitForResponse(response => response.url().includes("/vehicsim/context") && response.request().headers()["x-vehicsim-project"] === "77");
  await page.goto(base + "/projects/77");
  await page.waitForURL(url => url.pathname === "/");
  await selectedContext;
  assert(requests.some(r => r.path === "/vehicsim/context" && r.project === "77"), "Workspace project phải được chọn đúng context");
  assert(!requests.some(r => r.path === "/vehicsim/projects/77"), "Không gọi API project cá nhân cho project workspace");
  await page.goto(base + "/analysis/failures?scenario_id=42");
  await page.getByRole("heading", { name: "Biến thể và lượt chạy", exact: true }).waitFor();
  assert(requests.some(r => r.path === "/vehicsim/analysis/v3/explorer/scenarios/42/runs"), "Mở đúng họ từ scenario_id");
  await page.getByRole("button", { name: "← Các họ kịch bản", exact: true }).click();
  await page.getByRole("heading", { name: "Họ kịch bản", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("scenario_id"), false);
  await context.close();

  // REVIEWER chỉ xem: không hiện thao tác ghi, cả khi mở đường dẫn tạo trực tiếp.
  families = [family(41, malicious)];
  const readonly = await session("REVIEWER");
  assert.equal(await readonly.page.locator("#family-41").getByRole("button", { name: /Xóa họ kịch bản/ }).count(), 0);
  assert.equal(await readonly.page.locator("#family-41").getByRole("button", { name: "Sửa v2" }).count(), 0);
  assert.equal(await readonly.page.locator("#family-41").getByRole("link", { name: "Chạy", exact: true }).count(), 0);
  await readonly.page.goto(base + "/scenarios/new");
  await readonly.page.getByText(/chỉ có quyền xem kịch bản/).waitFor();
  assert.equal(await readonly.page.getByRole("textbox").count(), 0);
  await readonly.page.goto(base + "/scenarios?new=1");
  await readonly.page.getByText(/chỉ có quyền xem kịch bản/).waitFor();
  assert.deepEqual(readonly.errors, []);
  await readonly.context.close();
  console.log("PASS: cancel, 409, busy, success, readonly and text escaping");
} finally {
  await browser.close();
}
