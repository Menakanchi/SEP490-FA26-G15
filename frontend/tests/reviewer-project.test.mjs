import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Test the real client with mocked transport/storage; no browser, server or new test dependency.
const source = await readFile(new URL("../src/services/api.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
let moduleId = 0;

async function withClient(run, blockedStorage = false) {
  const originals = Object.fromEntries(["window", "localStorage", "sessionStorage", "fetch"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: blockedStorage ? {
    getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); },
  } : storage });
  const calls = [];
  let status = 200;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: new Headers(options.headers) });
    return new Response(JSON.stringify(status === 200 ? {} : { detail: "project unavailable" }), { status });
  };
  try {
    const api = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}#${moduleId++}`);
    await run(api, calls, (value) => { status = value; });
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test("pinned project stays on JSON, decisions and downloads after a failed context refresh", async () => {
  await withClient(async (api, calls, setStatus) => {
    api.selectReviewerProject(2);
    await api.apiRequest("/vehicsim/recommendations");
    setStatus(404);
    await assert.rejects(api.apiRequest("/vehicsim/context"), /project unavailable/);
    setStatus(200);
    await api.apiRequest("/vehicsim/recommendations/9/decision", { method: "POST", body: "{}" });
    await api.apiBlob("/vehicsim/regression/9/export.csv");
    assert.deepEqual(calls.map((call) => call.headers.get("X-VehicSim-Project")), ["2", "2", "2", "2"]);
    api.selectReviewerProject(3);
    await api.apiRequest("/vehicsim/recommendations");
    assert.equal(calls.at(-1).headers.get("X-VehicSim-Project"), "3");
  });
});

test("blocked browser storage still keeps the selected project in memory and login clears it", async () => {
  await withClient(async (api, calls) => {
    api.selectReviewerProject(2);
    await api.apiRequest("/vehicsim/regression");
    assert.equal(calls.at(-1).headers.get("X-VehicSim-Project"), "2");
    api.storeToken("new-session");
    await api.apiRequest("/vehicsim/context");
    assert.equal(calls.at(-1).headers.get("X-VehicSim-Project"), null);
    assert.equal(calls.at(-1).headers.get("Authorization"), "Bearer new-session");
  }, true);
});

test("password token rotation preserves project while a different login and logout clear it", async () => {
  await withClient(async (api, calls) => {
    api.storeToken("session-before-password-change");
    api.selectReviewerProject(2);
    api.storeToken("session-after-password-change", true);
    await api.apiRequest("/vehicsim/recommendations/9/decision", { method: "POST", body: "{}" });
    await api.apiBlob("/vehicsim/regression/9/export.csv");
    assert.deepEqual(calls.map((call) => call.headers.get("X-VehicSim-Project")), ["2", "2"]);
    assert.equal(calls[0].headers.get("Authorization"), "Bearer session-after-password-change");
    api.storeToken("different-login");
    await api.apiRequest("/vehicsim/context");
    assert.equal(calls.at(-1).headers.get("X-VehicSim-Project"), null);
    api.selectReviewerProject(3);
    api.storeToken(null, true);
    await api.apiRequest("/vehicsim/context");
    assert.equal(calls.at(-1).headers.get("X-VehicSim-Project"), null);
  });
});
