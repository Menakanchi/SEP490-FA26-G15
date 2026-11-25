/** Presentation tests for production mappings. No evaluator or physical thresholds here. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/analysis/analysisClassificationData.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { failureTypeLabel, classificationPresentation, recordedChain } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const evaluated = { status: "COMPLETED", evaluation_valid: true, verdict: "FAIL", failure_type: "COLLISION" };

test("labels cover actual Evaluation.failure_type values", () => {
  for (const [code, label] of Object.entries({ COLLISION: "Va chạm được ghi nhận", FALSE_BRAKING: "Phanh oan theo luật", MISSED_BRAKING: "Bỏ sót phanh theo luật", LATE_BRAKING: "Phanh muộn theo luật", NEAR_MISS: "Suýt va chạm theo luật" })) assert.equal(failureTypeLabel(code), label);
  for (const value of [null, undefined, "", 0]) assert.equal(failureTypeLabel(value), "API chưa có phân loại lỗi");
});
test("collision and metrics never generate missed or ineffective braking", () => {
  const view = classificationPresentation({ ...evaluated, failure_type: null, outcome: "COLLISION", metrics: { impact_speed_mps: 20 } });
  assert.equal(view.classification, "API chưa có phân loại lỗi");
  assert.equal(view.evaluation, "Không đạt theo luật đã lưu (FAIL)");
});
test("null classification stays unavailable even when evaluation is valid PASS", () => {
  const view = classificationPresentation({ ...evaluated, verdict: "PASS", failure_type: null });
  assert.equal(view.classification, "API chưa có phân loại lỗi");
  assert.equal(view.evaluation, "Đạt theo luật đã lưu (PASS)");
  assert.equal(view.trusted, true);
  assert.equal(classificationPresentation({ ...evaluated, verdict: "PASS", failure_type: undefined }).classification, "API chưa có phân loại lỗi");
  assert.equal(classificationPresentation({ ...evaluated, verdict: "PASS", failure_type: null, evaluation_valid: false }).trusted, false);
});
test("a recorded command with no collision never generates false braking", () => {
  const view = classificationPresentation({ ...evaluated, verdict: "PASS", failure_type: null, outcome: "SAFE", metrics: { aeb_activation_t: 0 } });
  assert.equal(view.classification, "API chưa có phân loại lỗi");
  assert.doesNotMatch(view.classification, /Phanh oan/);
});
test("missing/false validity and missing verdict cannot publish pass/fail conclusions", () => {
  for (const patch of [{ evaluation_valid: false }, { evaluation_valid: undefined }, { evaluation_valid: null }, { verdict: null }, { verdict: undefined }]) {
    const view = classificationPresentation({ ...evaluated, ...patch });
    assert.equal(view.trusted, false);
    assert.doesNotMatch(view.evaluation, /\(PASS\)|\(FAIL\)/);
    assert.equal(view.classification, "Va chạm được ghi nhận", "Keep the stored label, qualified by the UI as archived");
  }
});
test("execution states do not invent evaluation lifecycle or safe labels", () => {
  for (const status of ["PENDING", "RUNNING", "FAILED", "STOPPED"]) {
    const view = classificationPresentation({ ...evaluated, status });
    assert.equal(view.trusted, false); assert.equal(view.evaluation, "Run chưa hoàn tất");
  }
});
test("null/absent/empty chain is unavailable evidence, not all stages passed", () => {
  for (const chain of [null, undefined, [], {}]) assert.deepEqual(recordedChain(chain), []);
  const stage = { stage: "CONTROL", passed: false, cause_code: null, confidence: 0 };
  assert.deepEqual(recordedChain([null, {}, stage]), [stage]);
});
