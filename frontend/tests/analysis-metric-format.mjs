/** Tests the TypeScript formatter used by production components, without a new test framework. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/analysis/analysisMetricFormat.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { formatMetric, formatObjective, formatMeasurement, formatRunImpact, speedKmh, objectiveState } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("m/s frame conversion preserves raw precision; API km/h is formatted directly", () => {
  assert.equal(speedKmh(10), 36);
  assert.equal(formatMeasurement(speedKmh(10), "km/h"), "36.0 km/h");
  assert.equal(formatMeasurement(36, "km/h"), "36.0 km/h");
  assert.equal(speedKmh(1.23456789), 1.23456789 * 3.6);
  assert.equal(speedKmh(0), 0);
  for (const v of [null, undefined, "10", NaN, Infinity, -Infinity, -1, Number.MAX_VALUE]) assert.equal(speedKmh(v), null);
});
test("missing/malformed/nonfinite remain unavailable, zero remains measured", () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity, "1", {}, false]) {
    assert.equal(formatMetric(value), "—");
    assert.equal(formatMeasurement(value, "s"), "—");
    assert.equal(formatObjective(value), "—");
  }
  assert.equal(formatMetric(0), "0.00");
  assert.equal(formatMetric(-0), "0.00");
  assert.equal(formatObjective(0), "0.000");
});
test("precision follows metric purpose and tiny values never become zero", () => {
  assert.equal(formatMeasurement(1.23456, "s"), "1.23 s");
  assert.equal(formatMeasurement(36.1234, "km/h"), "36.1 km/h");
  assert.equal(formatObjective(2.1234), "2.123");
  assert.equal(formatMeasurement(2.1234, "m/s³"), "2.123 m/s³");
  assert.equal(formatObjective(0.0004), "4.00e-4");
  assert.equal(formatMetric(0.004), "4.00e-3");
  assert.equal(formatMetric(-0.0004), "-4.00e-4");
  assert.equal(formatMeasurement(-2, "m/s²"), "-2.00 m/s²");
  assert.equal(formatMeasurement(-2, "m/s²", 2, true), "—");
  assert.equal(formatObjective(-2), "—");
});
test("per-run impact requires completed collision; it does not implement aggregate zero", () => {
  for (const outcome of ["SAFE", "NEAR_MISS", "FALSE_BRAKING", "INCOMPLETE"]) assert.equal(formatRunImpact(10, { status: "COMPLETED", outcome }), "—");
  assert.equal(formatRunImpact(10, { status: "RUNNING", outcome: "COLLISION" }), "—");
  const collision = { status: "COMPLETED", outcome: "COLLISION" };
  assert.equal(formatRunImpact(10, collision), "10.000");
  assert.equal(formatRunImpact(0, collision), "0.000");
  assert.equal(formatRunImpact(36, collision, 1), "36.0");
  for (const v of [null, undefined, -1, Infinity]) assert.equal(formatRunImpact(v, collision), "—");
});
test("aggregate status, expected SI unit and sample metadata must agree", () => {
  const valid = { value: 0, unit: "m/s³", status: "VALID", samples: 1, missing: 0, notApplicable: 0 };
  assert.equal(objectiveState(valid, "m/s³").valid, true);
  for (const patch of [{ status: "INCOMPLETE" }, { unit: "m/s²" }, { value: -1 }, { value: null }, { value: Infinity }, { samples: 0 }, { samples: 1.5 }, { missing: 1 }, { notApplicable: -1 }]) {
    assert.equal(objectiveState({ ...valid, ...patch }, "m/s³").valid, false);
  }
  assert.equal(objectiveState(undefined, "m/s³").label, "Chưa đủ dữ liệu hợp lệ");
  assert.equal(objectiveState({ ...valid, status: "NOT_APPLICABLE", value: null, samples: 0, notApplicable: 1 }, "m/s³").label, "Không áp dụng");
});
