import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {repoRoot,analysisArtifactPath,prepareAnalysisArtifacts,validateAnalysisResult} from "./helpers/analysis-artifacts.mjs";

test("artifact output cannot overwrite repository code or escape data/",()=>{
  for(const destination of [repoRoot,path.join(repoRoot,"frontend"),path.join(repoRoot,"data"),path.join(repoRoot,"data/../frontend")])
    assert.throws(()=>analysisArtifactPath(destination),/subdirectory/);
  assert.equal(analysisArtifactPath(path.join(repoRoot,"data/qa/round-1")),path.join(repoRoot,"data/qa/round-1"));
});
test("every rerun removes an old PASS without removing neighboring evidence",async()=>{
  const output=await fs.mkdtemp(path.join(repoRoot,"data/analysis-infra-"));
  await fs.writeFile(path.join(output,"result.json"),'{"status":"PASS"}');
  await fs.writeFile(path.join(output,"keep.log"),"previous diagnostic");
  assert.equal(await prepareAnalysisArtifacts(output,""),output);
  await assert.rejects(fs.access(path.join(output,"result.json")));
  assert.equal(await fs.readFile(path.join(output,"keep.log"),"utf8"),"previous diagnostic");
});
test("an exit without completed assertions, baseline capture or browser error cannot become PASS",()=>{
  for(const result of [null,{}, {status:"RUNNING"}, {status:"PASS",kind:"OTHER"},
    {status:"PASS",kind:"BROWSER_FIXTURE_ONLY",baseline:true},{status:"PASS",kind:"BROWSER_FIXTURE_ONLY",errors:["uncaught error"]}])
    assert.throws(()=>validateAnalysisResult(result));
  assert.equal(validateAnalysisResult({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",errors:[]}).status,"PASS");
});
