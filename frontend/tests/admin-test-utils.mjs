import { existsSync } from "node:fs";
import path from "node:path";

export function browserOptions() {
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const executablePath = process.env.BROWSER_EXECUTABLE ||
    (process.platform === "win32" && existsSync(edge) ? edge : undefined);
  return { headless: true, ...(executablePath ? { executablePath } : {}) };
}

export async function captureScreenshot(page, options, screenshots) {
  if (process.env.ADMIN_UI_SCREENSHOTS === "0") return;
  await page.screenshot(options);
  screenshots.push(path.basename(options.path));
}
