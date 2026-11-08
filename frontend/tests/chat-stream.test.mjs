import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Kênh chat realtime: chạy apiEventStream thật với fetch giả trả về luồng SSE bị cắt ở chỗ bất kỳ; không cần server hay trình duyệt.
const source = await readFile(new URL("../src/services/api.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
let moduleId = 0;

function streamOf(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function withClient(response, run) {
  const originals = Object.fromEntries(["window", "localStorage", "sessionStorage", "fetch"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const values = new Map([["vehicsim_access_token", "tok"]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const dispatched = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: (e) => dispatched.push(e.type), addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: new Headers(options.headers), signal: options.signal });
    return response();
  };
  try {
    const api = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}#${moduleId++}`);
    await run(api, calls, dispatched);
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test("events split across chunks, CRLF, comments and multi-line data are parsed in order", async () => {
  const chunks = [
    "event:ready\r\ndata:ok\r\n\r\n",
    ":ping\n\n",
    'event:message\nid:7\ndata:{"id":7,',
    '"message_text":"xin chào"}\n\nevent:mess',
    "age\nid:8\ndata: dòng 1\ndata: dòng 2\n\n",
    "data:no-event-name\n\n",
  ];
  await withClient(() => new Response(streamOf(chunks), { status: 200, headers: { "Content-Type": "text/event-stream" } }), async (api, calls) => {
    const events = [];
    await api.apiEventStream("/vehicsim/workspaces/1/messages/stream", (event, data) => events.push([event, data]), new AbortController().signal);
    assert.deepEqual(events, [
      ["ready", "ok"],
      ["message", '{"id":7,"message_text":"xin chào"}'],
      ["message", "dòng 1\ndòng 2"],
      ["message", "no-event-name"],
    ]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://localhost:8001/api/v1/vehicsim/workspaces/1/messages/stream");
    assert.equal(calls[0].headers.get("Authorization"), "Bearer tok", "token đi qua header, không lên URL");
    assert.match(calls[0].headers.get("Accept"), /text\/event-stream/);
    assert.ok(!calls[0].url.includes("tok"));
  });
});

test("a refused stream throws the backend message and a 401 ends the session", async () => {
  await withClient(() => new Response(JSON.stringify({ detail: "Không tìm thấy workspace" }), { status: 404 }), async (api) => {
    await assert.rejects(
      api.apiEventStream("/vehicsim/workspaces/9/messages/stream", () => {}, new AbortController().signal),
      (err) => err instanceof api.ApiError && err.status === 404 && err.message === "Không tìm thấy workspace",
    );
  });
  await withClient(() => new Response("{}", { status: 401 }), async (api, _calls, dispatched) => {
    await assert.rejects(api.apiEventStream("/vehicsim/workspaces/1/messages/stream", () => {}, new AbortController().signal));
    assert.deepEqual(dispatched, ["vehicsim:session-expired"]);
  });
});

test("the abort signal is handed to fetch so leaving the page closes the stream", async () => {
  const ctrl = new AbortController();
  await withClient(() => new Response(streamOf([]), { status: 200 }), async (api, calls) => {
    await api.apiEventStream("/vehicsim/workspaces/1/messages/stream", () => {}, ctrl.signal);
    assert.equal(calls[0].signal, ctrl.signal);
  });
});
