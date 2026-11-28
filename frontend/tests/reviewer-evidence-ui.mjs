/** Reviewer checklist against fixture evidence; never sends decisions to the backend. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.REVIEWER_UI_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Only a local app is supported");
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
try {
  for (const width of [390, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const actor = { id: 999913, email: "reviewer@example.invalid", full_name: "Reviewer fixture", role: "REVIEWER" };
    let pairs = [{ change: "regressed", candidate_run_id: 77 }];
    let status = "FAILED";
    let decisionPosts = 0;
    await context.route("**/api/v1/**", async (route) => {
      const req = route.request(), path = new URL(req.url()).pathname.replace("/api/v1", "");
      const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "Access-Control-Allow-Origin": "*" } });
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,x-vehicsim-project", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
      if (path === "/auth/login") return reply({ access_token: "fixture-only", token_type: "bearer", expires_in: 3600, user: actor });
      if (req.method() !== "GET") { decisionPosts++; return reply({ detail: "Writes disabled" }, 405); }
      if (path === "/auth/me") return reply(actor);
      if (path === "/vehicsim/context") return reply({ project: { id: 99, name: "Fixture" }, workspace: { id: 1, name: "Fixture" }, vehicle: { id: 2, name: "Fixture" }, system: { id: 1, name: "AEB", baseline: { id: 7, label: "v7" } }, versions: [], families: [], parameters: [], reviewer_projects: [], reviewer_can_decide: true });
      if (path === "/vehicsim/recommendations/9") return reply({ id: 9, code: "RT-9", recommendation_code: "REC-9", status, recommendation_status: "BLOCKED", baseline: { label: "v7", status: "BASELINE" }, candidate: { label: "v8", status: "CANDIDATE" }, summary: { pairs, counts: { fixed: 0, regressed: 1 } }, review: { decision: "PENDING", conditions: null }, changed_parameters: [], evidence: [{ key: "pareto", status: "PASS", title: "Pareto", detail: "On front" }], simulator_caveat: null });
      if (path === "/vehicsim/notifications") return reply({ items: [], unread_count: 0 });
      return reply([]);
    });
    const page = await context.newPage();
    await page.goto(base + "/login");
    await page.getByLabel("Email", { exact: true }).fill(actor.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("Fixture-only-123");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL((u) => u.pathname !== "/login");
    await page.goto(base + "/validation/recommendations/9/review");
    await page.getByRole("checkbox", { name: "Tôi đã phát lại kịch bản bị xấu đi" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "kịch bản bị xấu đi" }).getAttribute("href"), "/analysis/failures/77/playback");
    assert.equal(await page.getByText("Tôi hiểu rằng bằng chứng độ bền vững, Pareto và độ nhạy chưa được chạy cho ứng viên này").count(), 0);
    assert.equal(await page.getByRole("button", { name: /Chấp nhận/ }).isDisabled(), true);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    pairs = [{ change: "fixed", candidate_run_id: 79 }, { change: "regressed", candidate_run_id: 77 }];
    await page.reload();
    await page.getByRole("checkbox", { name: "Tôi đã phát lại kịch bản được sửa và kịch bản bị xấu đi" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "kịch bản được sửa" }).getAttribute("href"), "/analysis/failures/79/playback");
    assert.equal(await page.getByRole("link", { name: "kịch bản bị xấu đi" }).getAttribute("href"), "/analysis/failures/77/playback");
    pairs = [{ change: "unchanged", candidate_run_id: 78 }];
    await page.reload();
    await page.getByRole("checkbox", { name: "Tôi đã phát lại kịch bản trong kiểm thử" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "kịch bản trong kiểm thử" }).getAttribute("href"), "/analysis/failures/78/playback");
    pairs = [];
    await page.reload();
    await page.getByRole("checkbox", { name: "Tôi đã xem danh sách các ca trong kiểm thử, không có lượt phát lại" }).waitFor();
    status = "RUNNING";
    await page.reload();
    await page.getByText("Kiểm thử hồi quy chưa hoàn tất; hãy chờ kết quả trước khi duyệt.").waitFor();
    assert.equal(await page.getByRole("button", { name: /Yêu cầu thêm kiểm thử/ }).isDisabled(), true);
    assert.equal(decisionPosts, 0);
    await context.close();
  }
  console.log("PASS: Reviewer evidence, replay branches and failed-test guard on desktop and mobile");
} finally {
  await browser.close();
}
