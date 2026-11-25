/** Run only after actual opt-in FailureAnalysisDatabaseMysqlTest passes. No synthetic metrics. */
import fs from "node:fs/promises";
import path from "node:path";
import {repoRoot} from "./analysis-artifacts.mjs";
const dir=path.join(repoRoot,"target/fa-db-direct-evidence"),out=path.join(repoRoot,"frontend/tests/fixtures/fa-db-input");
const read=async name=>JSON.parse(await fs.readFile(path.join(dir,name+".json"),"utf8"));
const fixture={kind:"BROWSER_FIXTURE_ONLY",provenance:"Actual FailureAnalysisDatabaseMysqlTest outputs; real JDBC MySQL8.4, provided CARLA2499/2511 content, restored test DB identities. Not a production DB export or live browser E2E.",runs:await read("run-list"),collections:await read("collection-list"),missingRun:await read("missing-run-inspection"),cases:{}};
for(const name of ["run","collection","missing-member"]){
 const execution=await read(name+"-execution"),reportsPage=await read(name+"-reports"),reports={};for(const m of reportsPage.items)reports[m.id]=await read(name+"-report-"+m.run_key);
 fixture.cases[name]={execution,reportsPage,reports,inspection:await read(name+"-inspection"),handoff:await read(name+"-handoff-status")};
}
await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,"mysql-output.json"),JSON.stringify(fixture)+"\n");console.log("Stored BROWSER_FIXTURE_ONLY from real isolated MySQL outputs; no metrics fabricated.");
