import { prepareAnalysisArtifacts } from "./helpers/analysis-artifacts.mjs";
/**
 * UI regression using recorded parity fixtures and browser-only API interception.
 * This does NOT verify a live backend, authentication, database, CARLA, or Figma.
 * npm install --no-save --package-lock=false playwright; npm run build; npm start -- --port 3100
 * node tests/analysis-redesign.mjs
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const fixtures=JSON.parse(gunzipSync(await fs.readFile(path.join(root,"src/test/resources/parity/kinematic.json.gz"))));
const output = await prepareAnalysisArtifacts(path.join(root,"data/analysis-batch8-ui"));
const version="adr040-stored-aggregation/1";
const cases=fixtures.filter(c=>c.evaluation.outcome!=="TIMEOUT").slice(0,45);
const runs=cases.map((c,i)=>({revision:`fixture-${i}`,run_id:1000+i,scenario_id:1,scenario_version_id:100+i,version_no:i+1,family:"CP Crossing · Fixture kiểm thử UI",variant:`CP-${String(i+1).padStart(3,"0")}`,seed:c.seed,baseline_id:1,vehicle_id:1,simulator:"vehicsim-kinematic-1.0",dt:0.05,status:"COMPLETED",outcome:c.evaluation.aeb_result.false_activation?"FALSE_BRAKING":c.evaluation.outcome,weather:c.case.weather,time_of_day:c.case.time_of_day,failure_class:c.evaluation.chain.find(s=>!s.passed)?.stage??null,error:null,end_reason:c.outcome.end_reason,trace_available:true,created_at:"2026-11-03T08:00:00",metrics:{rms_jerk_mps3:c.outcome.metrics.rms_jerk_mps3,impact_speed_mps:c.outcome.metrics.impact_speed_mps,stopping_distance_m:c.outcome.metrics.stopping_distance_m}}));
const user={id:999999,email:"ui-fixture@example.invalid",full_name:"UI Fixture",role:"ENGINEER"};
const context={project:{id:999999,name:"UI Fixture"},workspace:{id:999999,name:"Kiểm thử UI"},vehicle:{id:1,name:"Audi e-tron"},simulator:"vehicsim-kinematic-1.0",system:{id:1,name:"AEB",baseline:{id:1,label:"v1.0"}},versions:[{id:1,label:"v1.0",status:"BASELINE"}],families:[{id:1,code:"CP",name:runs[0].family}],parameters:[],reviewer_projects:[],reviewer_can_decide:true};
const caseFor=id=>cases[id-1000];
function detailFor(id){
 const c=caseFor(id),o=c.outcome,m=o.metrics,run=runs.find(r=>r.run_id===id);
 const motion=o.frames.map((f,i)=>({t:f.t,ego_x_m:f.ego_x,ego_speed_mps:f.ego_v,ego_accel_mps2:f.ego_a,target_x_m:f.ped_x,target_y_m:f.ped_y,target_vy_mps:f.ped_vy,perceived_y_m:f.perceived_y,ttc_perceived_s:f.ttc,ttc_gt_s:f.ttc_gt,jerk_mps3:i?(f.ego_a-o.frames[i-1].ego_a)/(f.t-o.frames[i-1].t):null,crossing_distance_m:o.crossing_x-f.ego_x,motion_state:"STEADY"}));
 const header={...run,purpose:"BASELINE",variant_id:run.scenario_version_id,vehicle:"Audi e-tron",config:"v1.0",date:run.created_at,evaluation_valid:true,summary:"Dữ liệu parity dùng riêng cho kiểm thử UI",headline:c.evaluation.headline,verdict:c.evaluation.verdict};
 return {...header,motion_telemetry:motion,chain:c.evaluation.chain,chain_confidence:c.evaluation.chain.find(s=>!s.passed)?.confidence??null,configuration:Object.entries(c.params).map(([code,value])=>({code,value,name:code,unit:""})),environment:{ego_speed_kmh:c.case.ego_speed_kmh,trigger_distance_m:c.case.trigger_distance_m,pedestrian_speed_mps:c.case.pedestrian_speed_mps,stops_at_curb:c.case.stops_at_curb,weather:c.case.weather,time_of_day:c.case.time_of_day,road_friction:o.case.road_friction},ttc_threshold_s:c.params.TTC_THRESHOLD,metrics:{...m,impact_speed_kmh:m.impact_speed_mps==null?null:m.impact_speed_mps*3.6,aeb_activation_t:m.aeb_decision_t,aeb_activation_ttc_s:m.aeb_decision_ttc_s,metric_source:"SIMULATOR_RESULT"},events:o.events,telemetry:o.frames.map(f=>({t:f.t,ttc:f.ttc,speed_kmh:f.ego_v*3.6})),stage_evidence:[{stage:"PERCEPTION",values:{first_detection_t:m.first_detection_t,first_detection_distance_m:m.first_detection_distance_m}},{stage:"CONTROL",values:{brake_onset_t:m.brake_onset_t,response_time_s:m.braking_latency_s}}],scene:{crossing_x:o.crossing_x,lane_width_m:3.5,vehicle_length_m:4.8,vehicle_width_m:2,path:o.frames.map(f=>({t:f.t,x:f.ego_x,ped_y:f.ped_y})),end:o.frames.at(-1)},similar:[]};
}
function aggregate(list){
 const out={version,invalid_runs:0};
 for(const [key,unit] of [["rms_jerk_mps3","m/s³"],["impact_speed_mps","m/s"],["stopping_distance_m","m"]]){
  const values=list.map(r=>key==="impact_speed_mps"&&r.outcome!=="COLLISION"?0:r.metrics[key]).filter(v=>v!=null);
  out[key]={value:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,samples:values.length,missing:0,notApplicable:list.length-values.length,unit,status:values.length?"VALID":"NOT_APPLICABLE"};
 }return out;
}
let role="ENGINEER", mode="normal", saved=null, playbackOverride=null, detailOverride=null, dashboardOverride=null, lastDashboard=null, inspectionOverride=null, inspectionMode="normal", playbackMode="normal", failureMode="normal", failureOverride=null, lastFailures=null, selectionMode="normal", snapshotMode="normal", handoffMode="normal", snapshotOverride=null;
const writes=[],requests=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
try {
 const browserContext=await browser.newContext({viewport:{width:1366,height:768}});
 await browserContext.addInitScript(()=>localStorage.setItem("vehicsim_access_token","browser-fixture-token"));
 await browserContext.route("**/api/v1/**",async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname.replace("/api/v1","");requests.push(url);
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Access-Control-Allow-Origin":"*"}});
  if(request.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
  if(request.method()!=="GET")writes.push({path:p,body:request.postDataJSON()});
  if(p==="/auth/me")return reply({...user,role});
  if(p==="/vehicsim/context")return reply(context);
  if(p==="/vehicsim/aeb/versions"||p==="/vehicsim/optimizations")return reply([]);
  if(/^\/vehicsim\/runs\/\d+\/xosc$/.test(p))return reply({detail:"Fixture download failed"},503);
    if (p === "/vehicsim/analysis/v3/sources") return reply({items:[],limit:20,offset:0}); // FE-R4: empty FA storage is independent of legacy runs.
    if (/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p)) return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:Number(route.request().headers()["x-vehicsim-project"]),items:[],limit:20,offset:0}); // Independent database source fixture.
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/analysis/selections"){
   if(selectionMode==="stale")return reply({detail:"Analysis preview changed; reload source runs"},409);
   if(selectionMode==="slow")await new Promise(resolve=>setTimeout(resolve,800));
   const body=request.postDataJSON();saved={schema:"vehicsim.analysis-dataset/v2",id:9001,baseline_current:true,handoff_ready:true,scenario:{id:1,code:"CP",name:runs[0].family,category:"CP_CROSSING"},baseline:{id:1,label:"v1.0"},reference:{vehicle_id:1,simulator:runs[0].simulator,dt:0.05},runs:runs.filter(r=>[...body.optimization_run_ids,...body.validation_run_ids].includes(r.run_id)),...body,evaluation:{version,carla_observational_only:false},optimization_objectives:aggregate(runs.filter(r=>body.optimization_run_ids.includes(r.run_id))),validation_objectives:aggregate(runs.filter(r=>body.validation_run_ids.includes(r.run_id)))};return reply(saved);
  }
  const datasetPath=p.match(/^\/vehicsim\/analysis\/datasets\/(\d+)(\/handoff)?$/);
  if(datasetPath){
   if(datasetPath[2]){
    if(handoffMode==="slow")await new Promise(resolve=>setTimeout(resolve,800));
    if(handoffMode==="changed")return reply({detail:"Analysis source runs changed or telemetry is missing"},409);
    if(handoffMode==="baseline")return reply({detail:"Analysis baseline changed"},409);
    if(handoffMode==="forbidden")return reply({detail:"Forbidden"},403);
    return reply(saved?{...saved,handoff_ready:handoffMode!=="notready"}: {},saved?200:404);
   }
   if(snapshotMode==="slow")await new Promise(resolve=>setTimeout(resolve,800));
   if(snapshotMode==="error")return reply({detail:"Fixture snapshot failure"},503);
   if(snapshotMode==="forbidden")return reply({detail:"Forbidden"},403);
   if(snapshotMode==="notfound")return reply({detail:"Fixture dataset not found"},404);
   return reply(snapshotOverride??(saved?{...saved,id:Number(datasetPath[1]),handoff_ready:undefined}:{}),saved?200:404);
  }
  if(p==="/vehicsim/analysis/runs"){
   if(mode==="error")return reply({detail:"Fixture network failure"},503);
   if(mode==="forbidden")return reply({detail:"Forbidden"},403);
   if(mode==="slow")await new Promise(resolve=>setTimeout(resolve,800));
   if(dashboardOverride)return reply(dashboardOverride);
   let rows=mode==="empty"?[]:[...runs].reverse();
   for(const [key,value] of url.searchParams){if(["scenario_id","aeb_version_id","variant_id","vehicle_id","simulator","status","weather","time_of_day","failure_class"].includes(key))rows=rows.filter(r=>String(r[key==="variant_id"?"scenario_version_id":key==="aeb_version_id"?"baseline_id":key])===value);}
   const page=Number(url.searchParams.get("page")),size=Number(url.searchParams.get("page_size"));
   lastDashboard={total:rows.length,page,page_size:size,items:rows.slice((page-1)*size,page*size),counts:Object.fromEntries(["SAFE","COLLISION","FALSE_BRAKING","NEAR_MISS","MISSED_BRAKING","OTHER_FAILURE","ERROR","CANCELLED","TIMEOUT","INCOMPLETE","NOT_FINISHED"].map(key=>[key,rows.filter(r=>r.outcome===key).length])),objective_groups:rows.length?[{identity:"fixture",simulator:runs[0].simulator,baseline_id:1,vehicle_id:1,objectives:aggregate(rows),carla_observational_only:false}]:[],evaluation_version:version};
   return reply(lastDashboard);
  }
  const inspection=p.match(/^\/vehicsim\/analysis\/runs\/(\d+)$/);
  if(inspection){
   if(inspectionMode==="slow")await new Promise(resolve=>setTimeout(resolve,800));
   if(inspectionMode==="error")return reply({detail:"Fixture detail failure"},503);
   if(inspectionMode==="forbidden")return reply({detail:"Forbidden"},403);
   if(inspectionMode==="notfound")return reply({detail:"Fixture run not found"},404);
   return reply(inspectionOverride??{run:runs.find(r=>r.run_id===Number(inspection[1])),detail:detailOverride??detailFor(Number(inspection[1]))});
  }
  const playback=p.match(/^\/vehicsim\/runs\/(\d+)\/playback$/);
  if(playback){
   if(playbackMode==="slow")await new Promise(resolve=>setTimeout(resolve,800));
   if(playbackMode==="error")return reply({detail:"Fixture playback failure"},503);
   if(playbackMode==="forbidden")return reply({detail:"Forbidden"},403);
   if(playbackMode==="notfound")return reply({detail:"Fixture playback not found"},404);
   const id=Number(playback[1]),d=detailFor(id),o=caseFor(id).outcome;return reply(playbackOverride??{...d,...o,motion_telemetry:d.motion_telemetry,vehicle_length_m:4.8,vehicle_width_m:2,lane_width_m:3.5,ttc_threshold_s:1.5,related_runs:[]});
  }
  if(p==="/vehicsim/failures.csv")return route.fulfill({status:200,contentType:"text/csv",headers:{"Content-Disposition":'attachment; filename="failure_cases.csv"'},body:"run_id,cause_code\n1000,FIXTURE_ONLY\n"});
  if(p==="/vehicsim/failures"){
   if(failureMode==="slow")await new Promise(resolve=>setTimeout(resolve,800));
   if(failureMode==="error")return reply({detail:"Fixture failure list error"},503);
   if(failureMode==="forbidden")return reply({detail:"Forbidden"},403);
   if(failureOverride)return reply(failureOverride);
   let rows=failureMode==="empty"?[]:runs.filter(r=>r.outcome!=="SAFE").map(r=>{const d=detailFor(r.run_id),primary=d.chain.find(s=>s.stage===d.failure_class);return {...r,failure_id:r.run_id+50000,summary:"Parity fixture",root_cause:caseFor(r.run_id).evaluation.headline,cause_code:primary?.cause_code??null,confidence:primary?.confidence??null,impact_kmh:r.metrics.impact_speed_mps==null?null:r.metrics.impact_speed_mps*3.6,min_ttc_s:caseFor(r.run_id).outcome.metrics.min_ttc_s,config:"v1.0",aeb_version_id:1,purpose:"BASELINE"};});
   for(const key of ["scenario_id","failure_class","outcome","weather","aeb_version_id"]){const value=url.searchParams.get(key);if(value)rows=rows.filter(r=>String(r[key])===value);}
   const page=Number(url.searchParams.get("page")),size=Number(url.searchParams.get("page_size"));
   lastFailures={items:rows.slice((page-1)*size,page*size),total:rows.length,page,page_size:size,pages:Math.max(1,Math.ceil(rows.length/size)),families:[],kpis:{total:rows.length,this_week:0,collisions:rows.filter(r=>r.outcome==="COLLISION").length,near_misses:rows.filter(r=>r.outcome==="NEAR_MISS").length,false_braking:rows.filter(r=>r.outcome==="FALSE_BRAKING").length,by_class:Object.fromEntries(["PERCEPTION","DECISION","CONTROL","VEHICLE_DYNAMICS"].map(stage=>[stage,rows.filter(r=>r.failure_class===stage).length]))}};
   return reply(lastFailures);
  }
  return reply({detail:`Unhandled fixture path ${p}`},404);
 });
 const page=await browserContext.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(20000);
 const base=process.env.ANALYSIS_UI_URL||"http://127.0.0.1:3141",checks=[],screenshots=[];
 const workspace=page.locator(".analysis-workspace"), alerts=workspace.getByRole("alert");
 const table=page.getByRole("region",{name:"Bảng lượt chạy baseline, cuộn ngang để xem thêm",exact:true});
 const dataset=page.locator('[data-analysis-tool="dataset"]'), legacy=page.locator('[data-analysis-tool="legacy"]');
 const rows=table.locator("tr[data-run-id]");
 const shot=async name=>{await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:"instant"}));await page.screenshot({path:path.join(output,name+".png"),fullPage:true});screenshots.push(name+".png");await page.screenshot({path:path.join(output,name+"-viewport.png"),fullPage:false});screenshots.push(name+"-viewport.png");};
 const ready=async()=>{await page.getByRole("heading",{name:"Dữ liệu & kết quả",exact:true}).waitFor();await rows.first().waitFor();};
 const goto=async(query="scenario_id=1")=>{await page.goto(base+"/analysis/failures?"+query);await ready();};
 const openDataset=async()=>{if(await dataset.getAttribute("open")===null)await dataset.locator(":scope > summary").click();await dataset.getByRole("heading",{name:"Bản nháp đang chọn",exact:true}).waitFor();};
 const openInvestigation=async()=>{const d=page.locator("[data-run-investigation]");if(await d.getAttribute("open")===null)await d.locator(":scope > summary").click();};
 const openActions=async()=>{await page.getByText("Phát lại và tác vụ khác",{exact:true}).click();};
 const formatted=value=>value==null||value<0?"—":value!==0&&Math.abs(value)<0.001?value.toExponential(2):value.toFixed(3);
 await goto();
 assert.equal(await page.getByRole("navigation",{name:"Chế độ phân tích"}).count(),0);
 assert.equal(await page.locator("tr[data-overview-run-id]").count(),0);
 assert.equal(await table.count(),1);assert.equal(await table.locator("thead th").count(),6);
 assert.equal(await legacy.getAttribute("open"),null);assert.equal(await dataset.getAttribute("open"),null);
 assert.equal(await page.getByRole("button",{name:/Analyze|Phân tích V3/}).count(),0);
 assert.equal(await page.getByRole("link",{name:/Tối ưu toàn họ/}).count(),0);
 checks.push("one workspace/table, six default columns, three objectives, collapsed optional tools, no fake analysis");
 for(const [width,height] of [[320,812],[375,812],[768,1024],[1280,900],[1440,900]]){
  await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Workspace overflow "+width);
  await table.focus();assert(await table.evaluate(n=>document.activeElement===n));await shot("workspace-"+width);
 }
 checks.push("workspace mobile/desktop and keyboard scroll region");
 await page.getByLabel("Số dòng mỗi trang").selectOption("10");
 const nextPageResponse=page.waitForResponse(r=>r.url().includes("/analysis/runs?")&&new URL(r.url()).searchParams.get("page")==="2");
 await page.getByRole("button",{name:"Trang sau",exact:true}).click();await nextPageResponse;await page.waitForURL(u=>u.searchParams.get("page")==="2");await rows.first().waitFor();
 const beforeSearch=requests.filter(u=>u.pathname.endsWith("/analysis/runs")).length;
 await page.getByLabel("Tìm trong trang hiện tại").fill("không-tồn-tại");await page.getByText("Không có kết quả tìm trong trang này.",{exact:true}).waitFor();
 await page.getByLabel("Tìm trong trang hiện tại").fill("");await rows.first().waitFor();assert.equal(requests.filter(u=>u.pathname.endsWith("/analysis/runs")).length,beforeSearch);
 await page.getByLabel("Sắp xếp trong trang").selectOption("oldest");const returnUrl=page.url();
 await rows.first().getByRole("link",{name:/^Chi tiết run/}).click();await page.getByRole("region",{name:"Kết quả và chỉ số run",exact:true}).waitFor();
 assert.equal(await page.locator("[data-run-investigation]").getAttribute("open"),null);
 await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).click();await page.waitForURL(returnUrl);await rows.first().waitFor();
 assert.equal(await page.getByLabel("Sắp xếp trong trang").inputValue(),"oldest");
 checks.push("pagination, page-local search/sort without refetch, exact detail return context");
 for(const view of ["overview","runs","failures","dataset"]){
  await goto("scenario_id=1&view="+view);assert.equal(await table.count(),1);
  assert.equal(await legacy.getAttribute("open")!==null,view==="failures");assert.equal(await dataset.getAttribute("open")!==null,view==="dataset");
 }
 checks.push("all four old view links open one workspace with the correct optional tool");
 const safe=runs.filter(r=>r.outcome==="SAFE"&&r.metrics.rms_jerk_mps3!=null).slice(0,2);assert.equal(safe.length,2);
 const draftKey=`vehicsim.analysis.selection.v1:${user.id}:${context.project.id}`;
 const cached=(opt,val)=>Object.fromEntries([...opt.map(run=>[run.run_id,{run,role:"OPTIMIZATION"}]),...val.map(run=>[run.run_id,{run,role:"VALIDATION"}])]);
 const first={...safe[0]}, second={...safe[1]};
 const invalidDrafts=[
  ["empty",{}], ["only optimization",cached([first],[])],
  ...["scenario_id","baseline_id","vehicle_id","simulator","dt"].map(field=>["mixed "+field,cached([first],[{...second,[field]:typeof second[field]==="string"?"other-profile":second[field]+1}])]),
  ["same variant in two roles",cached([first],[{...second,scenario_version_id:first.scenario_version_id,seed:first.seed+1}])],
  ["duplicate variant/seed",cached([first,{...first,run_id:888888}],[second])],
  ["no safe control",cached([{...first,outcome:"COLLISION"}],[second])],
  ["missing trace",cached([{...first,trace_available:false}],[second])],
  ["unfinished",cached([{...first,status:"RUNNING"}],[second])],
  ["missing revision",cached([{...first,revision:""}],[second])],
  ["501 optimization runs",cached(Array.from({length:501},(_,i)=>({...first,run_id:900000+i,scenario_version_id:900000+i,seed:i})),[second])],
 ];
 for(const [reason,value] of invalidDrafts){
  await page.evaluate(({key,value})=>sessionStorage.setItem(key,JSON.stringify(value)),{key:draftKey,value});
  await goto("view=dataset&scenario_id=1");await dataset.getByRole("heading",{name:"Kiểm tra và chốt",exact:true}).waitFor();
  assert(await dataset.getByRole("button",{name:"Chốt tập",exact:true}).isDisabled(),reason);
  assert.equal(writes.length,0,"No write from invalid metadata: "+reason);
 }
 await page.evaluate(key=>sessionStorage.setItem(key,"{broken"),draftKey);await page.reload();await ready();await page.getByText(/Không khôi phục được lựa chọn trong phiên/).waitFor();assert.equal(writes.length,0);
 await page.evaluate(key=>sessionStorage.removeItem(key),draftKey);
 checks.push("selection rejects empty/one-role, mixed source identity, variant leakage, duplicate seed, missing safe/trace/revision, unfinished, 501 members and corrupt cache");

 for(const [i,run] of safe.entries()){
  const position=[...runs].reverse().findIndex(r=>r.run_id===run.run_id),targetPage=Math.floor(position/10)+1;
  await goto(`view=dataset&scenario_id=1&page_size=10&page=${targetPage}`);
  await table.getByLabel(`Tập của run ${run.run_id}`,{exact:true}).selectOption(i?"VALIDATION":"OPTIMIZATION");
  await page.waitForFunction(id=>document.querySelector(`tr[data-run-id="${id}"]`)?.dataset.selected==="true",run.run_id);
 }
 const key=`vehicsim.analysis.selection.v1:${user.id}:${context.project.id}`;
 const expected=Object.fromEntries(safe.map((run,i)=>[run.run_id,{run,role:i?"VALIDATION":"OPTIMIZATION"}]));
 await page.reload();await ready();await dataset.getByRole("button",{name:"Chốt tập",exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key),expected);
 await dataset.locator(":scope > summary").click();await page.waitForURL(u=>u.searchParams.get("view")==="runs");assert.deepEqual(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key),expected);
 await openDataset();assert.equal(await dataset.locator("tbody tr").count(),2);
 selectionMode="stale";await dataset.getByRole("button",{name:"Chốt tập",exact:true}).click();await alerts.waitFor();assert.deepEqual(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key),expected);
 selectionMode="slow";await dataset.getByRole("button",{name:"Chốt tập",exact:true}).click();assert(await dataset.getByRole("button",{name:"Đang chốt hai tập…",exact:true}).isDisabled());
 await dataset.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();selectionMode="normal";
 assert.equal(writes.length,2);for(const w of writes){assert.equal(w.path,"/vehicsim/analysis/selections");assert.deepEqual(w.body.optimization_run_ids,[safe[0].run_id]);assert.deepEqual(w.body.validation_run_ids,[safe[1].run_id]);assert.deepEqual(w.body.run_revisions,Object.fromEntries(safe.map(r=>[r.run_id,r.revision])));}
 await page.reload();await dataset.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 const proceed=()=>dataset.getByRole("button",{name:"Kiểm tra trước bàn giao",exact:true});
 for(const failure of ["changed","baseline","notready","forbidden"]){handoffMode=failure;await proceed().click();await alerts.waitFor();assert.equal(new URL(page.url()).pathname,"/analysis/failures");assert.equal(writes.length,2);}
 handoffMode="normal";snapshotOverride={...saved,baseline_current:false};await page.reload();await dataset.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();assert(await proceed().isDisabled());snapshotOverride=null;
 checks.push("scoped draft/revision persistence, two roles/safe cases, server rejection and retry, busy guard, immutable snapshot reload, handoff/currentness rejection");
 await shot("dataset-review");
 await page.setViewportSize({width:1440,height:900});await goto("view=failures&scenario_id=1&f_scenario=1&f_outcome=COLLISION");
 await legacy.getByRole("region",{name:"Danh sách ca lỗi và bằng chứng",exact:true}).locator("tbody tr").first().waitFor();
 assert(requests.some(u=>u.pathname.endsWith("/failures")&&u.searchParams.get("outcome")==="COLLISION"));
 const mainRequest=requests.filter(u=>u.pathname.endsWith("/analysis/runs")).at(-1);assert.equal(mainRequest.searchParams.get("outcome"),null);
 failureMode="error";await page.reload();await legacy.getByRole("alert").waitFor();failureMode="normal";await legacy.getByRole("button",{name:"Thử tải lại",exact:true}).click();await legacy.locator("tbody tr").first().waitFor();
 assert(await legacy.getByRole("button",{name:"Xuất CSV lỗi",exact:true}).isEnabled()); checks.push("legacy lookup keeps its independent server scope, error/retry and CSV action availability");await shot("legacy-expanded");
 const id=safe[0].run_id, detail=detailFor(id),summary=page.getByRole("region",{name:"Kết quả và chỉ số run",exact:true});
 for(const section of ["summary","telemetry","evidence"]){
  await page.goto(base+`/analysis/failures/${id}?section=${section}&t=1.25&signal=jerk_mps3&returnTo=${encodeURIComponent(returnUrl)}`);await summary.waitFor();
  assert.equal(await page.locator("[data-run-investigation]").getAttribute("open")!==null,section!=="summary");
  if(section!=="summary")assert.equal(await page.getByRole("tab",{name:section==="telemetry"?"Telemetry & chỉ số":"Nhận định & bằng chứng",exact:true}).getAttribute("aria-selected"),"true");
  assert.equal(await summary.getByLabel("RMS jerk",{exact:true}).locator("dd").innerText(),formatted(detail.metrics.rms_jerk_mps3)+" m/s³");
  assert.equal(await summary.getByLabel("Tốc độ va chạm",{exact:true}).locator("dd").innerText(),"—");
  assert.equal(await summary.getByLabel("Quãng phanh",{exact:true}).locator("dd").innerText(),formatted(detail.metrics.stopping_distance_m)+" m");
 }
 await page.getByRole("tab",{name:"Nhận định & bằng chứng",exact:true}).focus();await page.keyboard.press("Home");await page.waitForFunction(()=>document.querySelector("#run-tab-telemetry")?.getAttribute("aria-selected")==="true");assert.equal(await page.getByRole("tab",{name:"Telemetry & chỉ số",exact:true}).getAttribute("aria-selected"),"true");await page.keyboard.press("End");await page.waitForFunction(()=>document.querySelector("#run-tab-evidence")?.getAttribute("aria-selected")==="true");assert.equal(await page.getByRole("tab",{name:"Nhận định & bằng chứng",exact:true}).getAttribute("aria-selected"),"true");
 await page.locator("[data-run-investigation] > summary").click();assert.equal(await page.locator("[data-run-investigation]").getAttribute("open"),null);
 for(const width of [320,375,768,1280,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Result overflow "+width);await shot("result-"+width);}
 checks.push("summary/objectives always visible, null impact, legacy section aliases, exact time/signal/return context, keyboard tabs and five widths");
 await openInvestigation();await page.getByRole("link",{name:"Mở playback tại thời điểm đang xem",exact:true}).click();const slider=page.getByRole("slider",{name:"Thời gian playback",exact:true});await slider.waitFor();assert.equal(Number(await slider.inputValue()),1.25);
 await page.getByRole("button",{name:"Phát",exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Thời gian playback"]').value)>1.3);await page.getByRole("button",{name:"Tạm dừng",exact:true}).click();
 checks.push("existing playback route/time and recorded clock retained");
 await page.goto(base+`/analysis/failures/${id}?section=summary`);await summary.waitFor();await openActions();await page.getByRole("button",{name:"Tải .xosc",exact:true}).click();await alerts.waitFor();assert.equal(new URL(page.url()).pathname,`/analysis/failures/${id}`);checks.push("secondary XOSC action/error remains available without a diagnostic job");
 mode="empty";await page.goto(base+"/analysis/failures?view=runs");await page.getByText("Chưa có run baseline để hiển thị.",{exact:true}).waitFor();assert.equal(await rows.count(),0);mode="error";await page.reload();await alerts.waitFor();assert.equal(await rows.count(),0);mode="normal";await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();await ready();
 role="MANAGER";await goto("view=dataset&scenario_id=1");assert(await dataset.getByRole("button",{name:"Chốt tập",exact:true}).isDisabled());assert(await table.getByLabel(`Tập của run ${runs.at(-1).run_id}`,{exact:true}).isDisabled());assert.equal(writes.length,2);
 checks.push("empty/error recovery and read-only dataset role; no optimizer/regression/controller mutations");
 assert.deepEqual(errors,[]);assert(!writes.some(w=>/optimizations|aeb\/versions|regression|carla/.test(w.path)));
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks,screenshots,errors,businessWrites:writes.length,liveBackendVerified:false,carlaRuntimeVerified:false,figmaVerified:false},null,2));
 console.log("PASS: FE-R1 composition, routes, scientific values, draft/freeze/currentness, isolation, states, keyboard/mobile; HTTP fixtures only");
} finally {await browser.close();}
