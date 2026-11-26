import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import {loadProduction} from "./helpers/load-production.mjs";
const d=await loadProduction("components/analysis/failureAnalysisV3Data.ts");
const api=(await loadProduction("services/failureAnalysisV3.ts")).failureAnalysisV3;
const shared=await loadProduction("services/api.ts");
const read=async name=>JSON.parse(await fs.readFile(new URL(`./fixtures/fa-v3/http-${name}.json`,import.meta.url),"utf8"));
const [s,e,p,r,h]=await Promise.all(["source","execution","reports","report","handoff-status"].map(read));
test("presentation giữ riêng va chạm, dấu hiệu AEB và mức chắc chắn",()=>{
 const base=structuredClone(r.report), evidence=(value,status="OBSERVED",unit=null)=>({value,status,unit});
 const view=(patch)=>d.diagnosticPresentation({...base,...patch});
 const candidate=(type,status="SUSPECTED")=>({type,status});
 const noFailure=view({failure_candidates:[],functional_assessment:evidence("NO_SUPPORTED_FAILURE","DERIVED")});
 assert.match(noFailure.conclusion,/Chưa phát hiện lỗi/);
 for(const [type,label] of [["NO_BRAKING","không phanh"],["INEFFECTIVE_BRAKING","phanh không hiệu quả"],["FALSE_BRAKING","phanh không cần thiết"]]) {
  assert.match(view({failure_candidates:[candidate(type)]}).conclusion,new RegExp(`Nghi ngờ ${label}`));
  assert(!view({failure_candidates:[candidate(type,"SUPPORTED")]}).conclusion.startsWith("Nghi ngờ"));
 }
 assert.match(view({failure_candidates:[],functional_assessment:evidence("INCONCLUSIVE","CONDITIONAL")}).conclusion,/Chưa đủ/);
 const crash=view({failure_candidates:[],functional_assessment:evidence("INCONCLUSIVE"),physical_outcome:evidence("COLLISION")});
 assert.match(crash.outcomeText,/Có va chạm/);assert.match(crash.conclusion,/Chưa đủ/);
 const noCrash=view({physical_outcome:evidence("SAFE"),failure_candidates:[candidate("FALSE_BRAKING")]});
 assert.match(noCrash.outcomeText,/Không ghi nhận/);assert.match(noCrash.conclusion,/Nghi ngờ phanh không cần thiết/);
 const many=view({failure_candidates:[candidate("NO_BRAKING"),candidate("INEFFECTIVE_BRAKING")]});
 assert.equal(many.candidates.length,2);assert.match(many.conclusion,/nhiều dấu hiệu/);
 assert.match(view({failure_candidates:[candidate("UNKNOWN_NEW_TYPE")]}).conclusion,/Chưa đủ/);
 assert.match(view({physical_outcome:evidence("COLLISION","UNKNOWN")}).outcomeText,/Chưa xác định/);
});
test("presentation không bịa dự đoán hoặc biến null và dữ liệu không hợp lệ thành số",()=>{
 const base=structuredClone(r.report), ev=(value,status="OBSERVED",unit="s")=>({value,status,unit});
 const actual={...base,physical_outcome:ev("COLLISION","OBSERVED",null),impact_analysis:{contact_time:ev(3.92)},aeb_timeline:{detection:ev(2.35),command_onset:ev(null,"UNKNOWN")}};
 let view=d.diagnosticPresentation(actual);
 assert(view.metrics.some(x=>x.label==="Va chạm thực tế"));assert(!view.metrics.some(x=>/dự kiến/i.test(x.label)));assert(!view.metrics.some(x=>x.label==="Lệnh phanh AEB"));
 const future={...actual,physical_outcome:ev(null,"UNKNOWN",null),impact_analysis:{contact_time:ev(null,"UNKNOWN")},prediction:{time:ev(4)}};
 view=d.diagnosticPresentation(future);assert(!view.metrics.some(x=>/va chạm/i.test(x.label)));
 const objectives=structuredClone(base.objectives);objectives.stopping_distance_m.canonical_value=ev(0,"INVALID","m");
 view=d.diagnosticPresentation({...actual,objectives,aeb_timeline:{detection:ev(0,"OBSERVED"),command_onset:ev(0,"UNKNOWN")}});
 assert(view.metrics.some(x=>x.label==="Phát hiện mục tiêu"&&x.data.value===0));
 assert(!view.metrics.some(x=>x.label==="Lệnh phanh AEB"||x.label==="Quãng đường dừng"));
 view=d.diagnosticPresentation({...actual,observed_behavior:ev("OFF_HYPOTHETICAL_ONLY","OBSERVED",null),aeb_timeline:{hypothetical:true,detection:ev(1),command_onset:ev(2)}});
 assert(!view.metrics.some(x=>["Phát hiện mục tiêu","Lệnh phanh AEB"].includes(x.label)),"hypothetical AEB OFF events are not actual events");
 objectives.stopping_distance_m.canonical_applicability="NOT_APPLICABLE";objectives.stopping_distance_m.canonical_value=ev(10,"OBSERVED","m");
 assert(!d.diagnosticPresentation({...actual,objectives}).metrics.some(x=>x.label==="Quãng đường dừng"));
});
test("actual BE-R1 resource pages, IDs, scope and accounting round trip unchanged",()=>{
 assert.equal(d.source(s,1),s);assert.equal(d.execution(e,1),e);assert.equal(d.page(p,v=>d.reportMetadata(v,1)).items[0],p.items[0]);assert.equal(d.handoff(h,1),h);
 assert.throws(()=>d.source(s,2));assert.throws(()=>d.resource({...s,id:"2499"},"SOURCE",1));
 for(const bad of [{...p,limit:0},{...p,offset:-1},{...p,items:{}},{...p,limit:21}])assert.throws(()=>d.page(bad,v=>v));
 assert.throws(()=>d.execution({...e,expected:e.expected+1},1));assert.throws(()=>d.execution({...e,missing:e.blocked+1},1));assert.throws(()=>d.execution({...e,members:[e.members[0],e.members[0]]},1));
 assert.throws(()=>d.source({...s,declared_member_identities:[null]},1),{code:"MALFORMED_RESOURCE"});assert.throws(()=>d.execution({...e,members:[null,...e.members.slice(1)]},1),{code:"MALFORMED_RESOURCE"});
});
test("actual core schema, canonical provenance and run linkage preserved",()=>{
 assert.equal(d.diagnostic(r),r);d.matchReport(r,p.items[0],e);
 assert.throws(()=>d.matchReport({...r,input:{...r.input,run_key:"other"}},p.items[0],e));
 assert.throws(()=>d.diagnostic({...r,schema_version:"vehicsim.failure-analysis/v2"}),{code:"UNSUPPORTED_REPORT_SCHEMA"});
 assert.throws(()=>d.diagnostic({run:2499,detail:{}}),{code:"MALFORMED_RESOURCE"});
 assert.throws(()=>d.diagnostic({...r,input:{...r.input,metric_aggregation_version:"new"}}));
});
test("null, zero and every evidence status survive without fallback calculations",()=>{
 for(const status of ["OBSERVED","DERIVED","CONDITIONAL","UNKNOWN","INVALID","CONFLICTING","NOT_APPLICABLE"]) for(const value of [null,0,1.234567]) {
  const ev={value,status,unit:"m/s"};assert.equal(d.evidence(ev),ev);assert.match(d.evidenceText(ev),new RegExp(status));
  const copy=structuredClone(r);copy.report.objectives.impact_speed_mps.canonical_value=ev;
  assert.equal(d.diagnostic(copy).report.objectives.impact_speed_mps.canonical_value.value,value);
 }
 assert.match(d.evidenceText({value:0,status:"OBSERVED",unit:"m"}),/^0 m/);
 assert.match(d.evidenceText({value:null,status:"UNKNOWN",unit:"m"}),/^Chưa có giá trị/);
 for(const value of [NaN,Infinity])assert.throws(()=>d.evidence({value,status:"OBSERVED",unit:"m"}));
});
test("only READY with approved context, digest and no blockers can acquire a dispatch action",()=>{
 assert.equal(d.handoff(h,1).dispatch_allowed,false);
 assert.throws(()=>d.handoff({...h,dispatch_allowed:true},1));
 const ready={...h,status:"READY",dispatch_allowed:true,context_id:s.id,content_digest:"a".repeat(64),reason_codes:[]};
 assert.equal(d.handoff(ready,1),ready);
 for(const patch of [{status:"DIAGNOSTIC_ONLY"},{dispatch_allowed:false},{context_id:null},{content_digest:null},{content_digest:"bad"},{reason_codes:["QUALITY_MISSING"]}])
  assert.throws(()=>d.handoff({...ready,...patch},1));
});

const campaign={schema:"vehicsim.fa-v3-campaign/v1",project_id:1,handoff_id:h.id,handoff_digest:"b".repeat(64),
 scenario:{id:42,name:"Explicit V3 fixture"},baseline:{id:7,label:"v7"},reference:{vehicle_id:2,simulator:"carla-0.9.16-xosc16",dt:0.01},
 optimization_run_ids:[2499,2500],validation_run_ids:[2511,2512],search_space:{TTC_THRESHOLD:[0.5,3],BRAKE_ACTIVATION_DELAY:[0,0.5],MAX_DECELERATION:[3,10],BRAKE_BUILDUP_RATE:[5,20]}};
test("V3 campaign projection pins server source, checksum, disjoint partitions and approved domain",()=>{
 assert.equal(d.campaignInput(campaign,1,h.id,campaign.handoff_digest),campaign);
 assert.throws(()=>d.campaignInput(campaign,2,h.id,campaign.handoff_digest));
 assert.throws(()=>d.campaignInput(campaign,1,s.id,campaign.handoff_digest));
 assert.throws(()=>d.campaignInput(campaign,1,h.id,"c".repeat(64)));
 for(const patch of [{schema:"vehicsim.analysis-dataset/v2"},{validation_run_ids:[2499]},{optimization_run_ids:[2499,2499]},{validation_run_ids:[]},{optimization_run_ids:[0]},
  {reference:{...campaign.reference,simulator:"unknown"}},{search_space:{}},{search_space:{...campaign.search_space,TTC_THRESHOLD:[2,1]}},
  {search_space:{...campaign.search_space,EXTRA:[0,1]}},{search_space:{...campaign.search_space,TTC_THRESHOLD:[0,Infinity]}}])
  assert.throws(()=>d.campaignInput({...campaign,...patch},1,h.id,campaign.handoff_digest));
});

test("context confirmation and bodyless execution use authenticated V3 APIs, no V2 optimizer substitution",async()=>{
 const original=globalThis.fetch,calls=[];
 const context={context_id:p.items[0].id,context_digest:"d".repeat(64),source_id:s.id};
 const body={dataset_id:91,dataset_digest:"e".repeat(64),confirmed:true,reason:"Reviewed recorded canonical targets",canonical_targets_only:true,calibration_not_applicable:true,nonhazard_run_ids:[2500,2512]};
 try{
  globalThis.fetch=async(url,options={})=>{
   calls.push({url:String(url),options});
   return new Response(JSON.stringify(String(url).endsWith("/contexts")?context:String(url).includes("/campaign?")?campaign:{...e,context_id:context.context_id}));
  };
  assert.deepEqual(await api.createContext(body),context);assert.deepEqual(JSON.parse(calls.at(-1).options.body),body);
  await api.analyzeContext(1,context.context_id);assert.equal(calls.at(-1).options.body,undefined);assert.equal(calls.at(-1).options.method,"POST");
  await api.campaign(1,h.id,campaign.handoff_digest);assert(calls.at(-1).url.endsWith(`/handoffs/${h.id}/campaign?digest=${campaign.handoff_digest}`));
  const count=calls.length;assert.throws(()=>api.campaign(1,h.id,"invalid"));assert.equal(calls.length,count,"Missing checksum never performs a request or falls back");
  globalThis.fetch=async()=>new Response(JSON.stringify({...e,context_id:s.id}));await assert.rejects(()=>api.analyzeContext(1,context.context_id),{code:"CONTEXT_IDENTITY_MISMATCH"});
  globalThis.fetch=async()=>new Response(JSON.stringify({...context,context_digest:null}));await assert.rejects(()=>api.createContext(body),{code:"MALFORMED_RESOURCE"});
 }finally{globalThis.fetch=original}
});
test("all real service fixture paths preserve members, mode, repetition and report identities",async()=>{
 for(const name of ["collection","standalone","partial","blocked"]){
  const f=JSON.parse(await fs.readFile(new URL(`./fixtures/fa-v3/${name}.json`,import.meta.url),"utf8"));
  d.source(f.source,1);d.execution(f.execution,1);d.handoff(f.handoff,1);
  for(const m of f.reportsPage.items){d.reportMetadata(m,1);const report=JSON.parse(Buffer.from(f.reportBytesBase64[m.id],"base64"));d.matchReport(d.diagnostic(report),m,f.execution);assert(m.run_identity.aeb_mode);assert(m.run_identity.repetition)}
  assert.equal(f.execution.members.length,f.execution.expected);
 }
 const bad=structuredClone(e);bad.members[0].status="BLOCKED";assert.throws(()=>d.execution(bad,1));
});
test("authenticated original-byte upload, bodyless analyze and safe downloads use real shared transport",async()=>{
 const originalFetch=globalThis.fetch; const calls=[];
 const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
 globalThis.window={};globalThis.localStorage=storage();globalThis.sessionStorage=storage();
 shared.storeToken("fe-r4-unit-token");shared.setSelectedProjectId(1);
 globalThis.fetch=async(url,options={})=>{calls.push({url,options});const suffix=String(url).split("/v3")[1];return new Response(suffix.endsWith("/download")?' {"exact": true}\n':JSON.stringify(suffix.endsWith("/executions")?e:s),{headers:{"Content-Type":"application/json"}})};
 try {
  const file=new File([' {"source": true}\n'],"input.json",{type:"application/json"});await api.upload(1,file);assert.equal(calls.at(-1).options.body,file);
  await api.analyze(1,s.id);assert.equal(calls.at(-1).options.body,undefined);
  const bytes=await api.download("sources",s.id);assert.equal(await bytes.text(),' {"exact": true}\n');
  assert.equal(new Headers(calls.at(-1).options.headers).get("Authorization"),"Bearer fe-r4-unit-token");
  assert.equal(new Headers(calls.at(-1).options.headers).get("X-VehicSim-Project"),"1");
  await assert.rejects(()=>api.download("sources","../../evil"));
  globalThis.fetch=async()=>new Response("<html>not JSON</html>",{headers:{"Content-Type":"text/html"}});await assert.rejects(()=>api.download("reports",p.items[0].id),{code:"INVALID_DOWNLOAD"});
  await assert.rejects(()=>api.source(1,s.id),{code:"MALFORMED_RESOURCE"});
  globalThis.fetch=async()=>new Response(JSON.stringify({...s,id:p.items[0].id}));await assert.rejects(()=>api.source(1,s.id),{code:"IDENTITY_MISMATCH"});
 } finally {globalThis.fetch=originalFetch;shared.storeToken(null);shared.setSelectedProjectId(null);delete globalThis.window;delete globalThis.localStorage;delete globalThis.sessionStorage}
});
test("each actual HTTP status retained; missing nested FA codes explicitly unknown",async()=>{
 const original=globalThis.fetch;
 try {for(const status of [400,401,403,404,409,413,422,429,500,503]){
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:"FIXTURE_CODE",module:"FAILURE_ANALYSIS",retryable:false}}),{status});
  await assert.rejects(()=>api.source(1,s.id),err=>err.status===status&&err.code==="HTTP_REASON_UNAVAILABLE"&&err.message===d.errorMessage(status));
 }} finally {globalThis.fetch=original}
});
