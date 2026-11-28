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
let unblockDelete;
let deleteStarted;

async function session(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/v1/**", async route => {
    const p = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" };
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (p === "/auth/login") return reply({ access_token: "scenario-fixture", token_type: "bearer", expires_in: 3600, user: actor(role) });
    if (p === "/auth/me") return reply(actor(role));
    if (p === "/vehicsim/context") return reply({ project: { id: 1, name: "Fixture" }, workspace: null, vehicle: { id: 1, name: "Fixture" },
      system: { id: 1, baseline: null }, versions: [], families: families.map(({ id, code, name }) => ({ id, code, name })), parameters: [], reviewer_projects: [] });
    if (p === "/vehicsim/families" && method === "GET") return reply(families);
    if (p === "/vehicsim/regression") return reply({ items: [], kpis: { total: 0, passed: 0, failed: 0, running: 0 } });
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
  await context.close();

  // MANAGER chỉ xem: frontend không cho gửi DELETE, backend vẫn phải tự kiểm quyền.
  families = [family(41, malicious)];
  const readonly = await session("MANAGER");
  assert.equal(await readonly.page.locator("#family-41").getByRole("button", { name: /Xóa họ kịch bản/ }).isDisabled(), true);
  assert.deepEqual(readonly.errors, []);
  await readonly.context.close();
  console.log("PASS: cancel, 409, busy, success, readonly and text escaping");
} finally {
  await browser.close();
}
