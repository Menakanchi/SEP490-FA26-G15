/** Local/CI unit gate; optional browser gate needs an already running local production app. */
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {repoRoot,analysisArtifactPath,validateAnalysisResult} from "./helpers/analysis-artifacts.mjs";

const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2);
if(args.some(arg=>arg!=="--browser"&&!/^--repeat=[12]$/.test(arg)) || args.filter(a=>a.startsWith("--repeat=")).length>1 || args.filter(a=>a==="--browser").length>1)
  throw new Error("Usage: npm run test:analysis -- [--browser] [--repeat=1|2]");
const repeat=Number(args.find(a=>a.startsWith("--repeat="))?.split("=")[1]||1),browser=args.includes("--browser");
const base=process.env.ANALYSIS_UI_URL;
if(browser) {
  const url=new URL(base||"http://missing.invalid");
  if(!["http:","https:"].includes(url.protocol)||!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||url.username||url.password)
    throw new Error("Set ANALYSIS_UI_URL to the local test app before --browser");
}
const output=analysisArtifactPath(process.env.ANALYSIS_TEST_OUTPUT||path.join(repoRoot,"data/analysis-regression",new Date().toISOString().replace(/[:.]/g,"-")+"-"+process.pid));
await fs.mkdir(output,{recursive:true});
const units=["analysis-classification","analysis-metric-format","analysis-explainability","analysis-evidence","analysis-telemetry","analysis-playback","analysis-api-contract","analysis-test-infra","analysis-workflow","analysis-results","analysis-v3","analysis-db-input"];
// These tests exercise legacy analysis controls removed in the current detail/overview UI.
// Keep them for reference; results-ui and overview test the current screens instead.
const legacyBrowsers=["analysis-integrity-ui","analysis-classification-ui","analysis-metrics-ui","analysis-explainability-ui","analysis-evidence-ui","analysis-telemetry-ui","analysis-redesign"];
const browsers=["analysis-overview","analysis-playback-ui","analysis-workflow-ui","analysis-results-ui","analysis-v3-ui","analysis-db-input-ui"];
if(browser) console.log("Legacy browser tests not run (controls no longer in current UI): "+legacyBrowsers.join(", "));
const summary={status:"RUNNING",kind:"OFFLINE_ANALYSIS_REGRESSION",repeat,browser,results:[],legacyBrowserTestsNotRun:browser?legacyBrowsers:[],legacyBrowserReason:"Controls removed from current UI",liveBackendVerified:false,carlaRuntimeVerified:false};
const record=()=>fs.writeFile(path.join(output,"summary.json"),JSON.stringify(summary,null,2)+"\n");
await record();
async function execute(args,log,env) {
  const stream=await fs.open(log,"w");
  try {
    const code=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{cwd:frontend,env,stdio:["ignore",stream.fd,stream.fd]});
      child.once("error",reject);child.once("close",(code,signal)=>resolve(code??signal??1));
    });
    if(code!==0) throw new Error("Child test exited with "+code+"; see "+log);
  } finally {await stream.close();}
}
try {
  for(let pass=1;pass<=repeat;pass++) {
    const unitOrder=pass%2?units:[...units].reverse();
    const item={pass,suite:"node-unit",status:"RUNNING",startedAt:new Date().toISOString()};
    summary.results.push(item);await record();
    const folder=path.join(output,"pass-"+pass);await fs.mkdir(folder,{recursive:true});
    const start=performance.now();
    await execute(["--test","--test-reporter=tap",...unitOrder.map(name=>path.join(frontend,"tests",name+".mjs"))],path.join(folder,"unit.log"),process.env);
    const tap=await fs.readFile(path.join(folder,"unit.log"),"utf8");
    item.counts=Object.fromEntries(["tests","pass","fail","skipped"].map(key=>[key,Number(tap.match(new RegExp("^# "+key+" (\\d+)$","m"))?.[1]??NaN)]));
    if(!item.counts.tests||item.counts.fail!==0||item.counts.skipped!==0) throw new Error("Incomplete unit test result");
    item.status="PASS";item.elapsedMs=Math.round(performance.now()-start);await record();
    console.log("Analysis pass "+pass+": unit PASS "+item.counts.pass+"/"+item.counts.tests);
    if(browser) for(const suite of pass%2?browsers:[...browsers].reverse()) {
      const destination=analysisArtifactPath(path.join(folder,suite));await fs.mkdir(destination,{recursive:true});
      await fs.rm(path.join(destination,"result.json"),{force:true});
      const row={pass,suite,status:"RUNNING",startedAt:new Date().toISOString()};summary.results.push(row);await record();
      const started=performance.now(),env={...process.env,ANALYSIS_UI_URL:base,ANALYSIS_UI_OUTPUT:destination};
      for(const key of ["OVERVIEW_BASELINE","CLASSIFICATION_BASELINE","METRICS_BASELINE","EXPLAINABILITY_BASELINE","TELEMETRY_BASELINE","PLAYBACK_BASELINE","EVIDENCE_BASELINE"]) env[key]="0";
      await execute([path.join(frontend,"tests",suite+".mjs")],path.join(destination,"browser.log"),env);
      validateAnalysisResult(JSON.parse(await fs.readFile(path.join(destination,"result.json"),"utf8")));
      row.status="PASS";row.elapsedMs=Math.round(performance.now()-started);await record();
      console.log("Analysis pass "+pass+": "+suite+" PASS ("+row.elapsedMs+" ms)");
    }
  }
  summary.status="PASS";
} catch(error) {
  const active=summary.results.findLast(item=>item.status==="RUNNING");if(active)active.status="FAIL";
  summary.status="FAIL";summary.error=error instanceof Error?error.message:String(error);process.exitCode=1;
}
await record();
console.log("Analysis regression "+summary.status+": "+path.join(output,"summary.json"));
