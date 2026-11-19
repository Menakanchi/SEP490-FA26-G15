import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(frontend);
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && !/^--repeat=[1-5]$/.test(args[0]))) {
  throw new Error("Usage: npm run test:admin -- [--repeat=1..5]");
}
const repeat = Number(args[0]?.split("=")[1] ?? 1);
const suites = [
  "admin-dashboard", "admin-users-table", "admin-user-search", "admin-user-forms",
  "admin-workspaces", "admin-consistency", "admin-redesign",
];
const output = path.resolve(root, process.env.ADMIN_UI_OUTPUT || "data/admin-regression");
const base = process.env.ADMIN_UI_URL || "http://127.0.0.1:3100";
const screenshots = process.env.ADMIN_UI_SCREENSHOTS ?? "0";
const summary = {
  status: "RUNNING", kind: "BROWSER_FIXTURE_ONLY", base, repeat, screenshotsEnabled: screenshots !== "0",
  results: [], liveBackendVerified: false, figmaVerified: false,
};
await fs.mkdir(output, { recursive: true });
const record = () => fs.writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
await record();
try {
  for (let run = 1; run <= repeat; run++) {
    const order = run % 2 ? suites : [...suites].reverse();
    for (const suite of order) {
      const item = { run, suite, status: "RUNNING" };
      summary.results.push(item);
      await record();
      const destination = path.join(output, "run-" + run, suite);
      await fs.mkdir(destination, { recursive: true });
      // An earlier PASS must never survive as evidence for a failed or interrupted rerun.
      await fs.rm(path.join(destination, "result.json"), { force: true });
      try {
        const code = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [path.join(frontend, "tests", suite + ".mjs")], {
            cwd: frontend, stdio: "inherit",
            env: { ...process.env, ADMIN_UI_URL: base, ADMIN_UI_OUTPUT: destination, ADMIN_UI_SCREENSHOTS: screenshots },
          });
          child.once("error", reject);
          child.once("close", (code, signal) => resolve(code ?? signal ?? 1));
        });
        if (code !== 0) throw new Error(suite + " exited with " + code);
        const result = JSON.parse(await fs.readFile(path.join(destination, "result.json"), "utf8"));
        if (result.status !== "PASS" || result.kind !== "BROWSER_FIXTURE_ONLY" || !Array.isArray(result.screenshots)) {
          throw new Error(suite + " did not produce a valid fixture result");
        }
        item.status = "PASS";
        item.screenshots = result.screenshots.length;
      } catch (error) {
        item.status = "FAIL";
        throw error;
      }
      await record();
    }
  }
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
}
await record();
console.log("Admin regression: " + summary.status + ", " +
  summary.results.filter(item => item.status === "PASS").length + "/" + suites.length * repeat +
  " suite runs; HTTP fixtures only. " + path.join(output, "summary.json"));
