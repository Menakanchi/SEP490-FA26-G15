import assert from "node:assert/strict";
import test from "node:test";
import {loadProduction} from "./helpers/load-production.mjs";
const d=await loadProduction("components/analysis/failureAnalysisDatabaseData.ts");
const api=(await loadProduction("services/failureAnalysisV3.ts")).failureAnalysisV3;
const page={schema_version:"vehicsim.fa-db-input/v1",selection_kind:"RUN",project_id:4,items:[{id:2499,project_id:4,repetition:1,attempt:1,aeb_mode:"ON"}],limit:20,offset:0};
test("DB input pages preserve numeric DB IDs separately from immutable UUID resources",()=>{
 assert.equal(d.databasePage(page,4,"runs"),page);assert.equal(d.databaseId(2499),2499);
 for(const id of [0,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>d.databaseId(id));
 assert.throws(()=>d.databasePage(page,2,"runs"));assert.throws(()=>d.databasePage(page,4,"collections"));assert.throws(()=>d.databasePage({...page,items:[{id:2499,project_id:2}]},4,"runs"));
});
test("missing DB source remains blocked with exact missing-field references",()=>{
 const x={schema_version:page.schema_version,selection_kind:"RUN",selection_id:2499,project_id:4,can_analyze:false,source_sha256:null,members:[{run_id:2499,issues:[{reason_code:"DATASET_REQUIRED",field:"/dataset"}]}],availability:"BLOCKED"};
 assert.equal(d.databaseInspection(x,4,"runs",2499),x);assert.throws(()=>d.databaseInspection({...x,can_analyze:true},4,"runs",2499));assert.throws(()=>d.databaseInspection(x,4,"runs",2511));
});
test("DB selection uses paged reads and a bodyless numeric-ID POST with conditional digest query",async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify(page),{headers:{"Content-Type":"application/json"}})};
 try {await api.databaseList(4,"runs",20);assert.match(calls[0].url,/database\/runs\?limit=20&offset=20$/);
  await assert.rejects(()=>api.databaseAnalyze(4,"runs",2499,"a".repeat(64))); // Deliberately malformed execution response, never a false success.
  assert.match(calls.at(-1).url,/database\/runs\/2499\/executions\?source_sha256=a{64}$/);assert.equal(calls.at(-1).options.body,undefined);
  assert.equal(new Headers(calls.at(-1).options.headers).get("X-Source-SHA256"),null,"No unsupported CORS request header");assert(!calls.some(c=>c.url.endsWith("/sources")));
  await assert.rejects(()=>api.databaseAnalyze(4,"runs",2499,"bad"),{code:"DATABASE_INSPECTION_REQUIRED"});
 }finally{globalThis.fetch=original}
});
