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
const output=path.join(root,"data/analysis-batch8-ui");await fs.mkdir(output,{recursive:true});
const version="adr040-stored-aggregation/1";
const cases=fixtures.filter(c=>c.evaluation.outcome!=="TIMEOUT").slice(0,45);
const runs=cases.map((c,i)=>({revision:`fixture-${i}`,run_id:1000+i,scenario_id:1,scenario_version_id:100+i,version_no:i+1,family:"CP Crossing · Fixture kiểm thử UI",variant:`CP-${String(i+1).padStart(3,"0")}`,seed:c.seed,baseline_id:1,vehicle_id:1,simulator:"vehicsim-kinematic-1.0",dt:0.05,status:"COMPLETED",outcome:c.evaluation.aeb_result.false_activation?"FALSE_BRAKING":c.evaluation.outcome,weather:c.case.weather,time_of_day:c.case.time_of_day,failure_class:c.evaluation.chain.find(s=>!s.passed)?.stage??null,error:null,end_reason:c.outcome.end_reason,trace_available:true,created_at:"2026-11-03T08:00:00",metrics:{rms_jerk_mps3:c.outcome.metrics.rms_jerk_mps3,impact_speed_mps:c.outcome.metrics.impact_speed_mps,stopping_distance_m:c.outcome.metrics.stopping_distance_m}}));
const user={id:999999,email:"ui-fixture@example.invalid",full_name:"UI Fixture",role:"ENGINEER"};
const context={project:{id:999999,name:"UI Fixture"},workspace:{id:999999,name:"Kiểm thử UI"},vehicle:{id:1,name:"Audi e-tron"},simulator:"vehicsim-kinematic-1.0",system:{id:1,name:"AEB",baseline:{id:1,label:"v1.0"}},versions:[{id:1,label:"v1.0",status:"BASELINE"}],families:[{id:1,code:"CP",name:runs[0].family}],parameters:[]};
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
 const base=process.env.ANALYSIS_UI_URL||"http://localhost:3100";
 // Next route announcements also use role=alert outside the workspace; only these are API/UI errors.
 const analysisAlerts=page.locator(".analysis-workspace").getByRole("alert");
 await page.goto(base+"/analysis/failures?scenario_id=1");
 await page.getByRole("heading",{name:"Phân tích baseline",exact:true}).waitFor();
 await page.getByRole("progressbar",{name:"An toàn",exact:true}).waitFor();
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});
  await page.screenshot({path:path.join(output,`overview-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overview overflow ${width}`);
 }
 // Batch 2: overview reads full-scope aggregates, keeps source identities and missing values.
 const originalDashboard=structuredClone(lastDashboard), originalGroup=originalDashboard.objective_groups[0];
 const carlaGroup={...structuredClone(originalGroup),identity:"1|1|carla-0.9.16-xosc4|0.01",simulator:"carla-0.9.16-xosc4",carla_observational_only:true};
 carlaGroup.objectives.rms_jerk_mps3={...carlaGroup.objectives.rms_jerk_mps3,value:12.345};
 carlaGroup.objectives.impact_speed_mps={...carlaGroup.objectives.impact_speed_mps,value:null,status:"INCOMPLETE",missing:3};
 const otherDtGroup={...structuredClone(carlaGroup),identity:"1|1|carla-0.9.16-xosc4|0.02"};
 otherDtGroup.objectives.rms_jerk_mps3.value=98.765;
 dashboardOverride={...structuredClone(originalDashboard),total:250,counts:{SAFE:200,COLLISION:12,FALSE_BRAKING:8,NEAR_MISS:10,MISSED_BRAKING:0,OTHER_FAILURE:0,ERROR:7,TIMEOUT:0,CANCELLED:0,INCOMPLETE:8,NOT_FINISHED:5},objective_groups:[originalGroup,carlaGroup,otherDtGroup]};
 await page.reload();
 const overview=page.getByRole("region",{name:"Tổng quan baseline",exact:true});
 await overview.getByRole("article",{name:"KPI Tổng lượt chạy",exact:true}).getByText("250",{exact:true}).waitFor();
 assert.match(await overview.getByRole("article",{name:"KPI An toàn",exact:true}).innerText(),/200[\s\S]*80%/);
 assert.match(await overview.getByRole("region",{name:"Trạng thái kỹ thuật và dữ liệu",exact:true}).innerText(),/Lỗi kỹ thuật[\s\S]*7/);
 assert.equal(await overview.getByRole("progressbar").count(),6);
 const groups=overview.locator("details[data-simulator]");assert.equal(await groups.count(),3);
 assert.equal(await groups.first().getAttribute("data-simulator"),"carla-0.9.16-xosc4");
 assert.match(await groups.first().innerText(),/12\.345/);
 assert.match(await groups.first().locator("strong").nth(1).innerText(),/—/);
 await groups.nth(1).locator("summary").click();
 assert.match(await groups.nth(1).innerText(),/98\.765/);
 assert.match(await groups.nth(1).innerText(),/0\.02/);
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:"instant"}));await page.screenshot({path:path.join(output,`overview-mixed-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overview mixed overflow ${width}`);
 }
 const profileResponse=page.waitForResponse(response=>response.url().includes("/analysis/runs?")&&new URL(response.url()).searchParams.get("simulator")==="carla-0.9.16-xosc4");
 await groups.first().getByRole("button",{name:"Lọc profile này",exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get("simulator")==="carla-0.9.16-xosc4");
 await profileResponse;
 assert.equal(new URL(page.url()).searchParams.get("scenario_id"),"1");
 dashboardOverride={...dashboardOverride,counts:{...dashboardOverride.counts,SAFE:undefined}};
 await page.reload();await overview.getByRole("article",{name:"KPI An toàn",exact:true}).getByText("Chưa có số liệu từ API",{exact:true}).waitFor();
 assert.equal((await overview.getByRole("article",{name:"KPI An toàn",exact:true}).locator("strong").innerText()).trim(),"—");
 assert.equal(await overview.getByRole("progressbar",{name:"An toàn",exact:true}).count(),0);
 dashboardOverride={...originalDashboard,total:0,counts:Object.fromEntries(Object.keys(originalDashboard.counts).map(key=>[key,0])),items:[],objective_groups:[]};
 await page.reload();await overview.getByRole("heading",{name:"Chưa có run baseline phù hợp.",exact:true}).waitFor();
 assert.equal(await overview.getByRole("progressbar").count(),0);
 assert.equal((await overview.getByRole("article",{name:"KPI An toàn",exact:true}).locator("strong").innerText()).trim(),"0");
 dashboardOverride=null;mode="slow";await page.goto(base+"/analysis/failures?scenario_id=1");
 await overview.getByRole("status").waitFor();assert.equal(await overview.getByRole("progressbar").count(),0);
 mode="error";await page.reload();await analysisAlerts.waitFor();
 assert.equal(await overview.getByRole("progressbar").count(),0);
 mode="normal";await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();
 await overview.getByRole("progressbar",{name:"An toàn",exact:true}).waitFor();
 await page.getByRole("navigation",{name:"Chế độ phân tích"}).getByRole("link",{name:"Lượt chạy",exact:true}).click();
 await page.getByRole("table").locator("tbody tr").first().waitFor();
 // Batch 3: recorded values remain authoritative; controlled boundary cases are UI fixtures only.
 const boundaryRuns=runs.slice(0,6).map((r,i)=>({...structuredClone(r),metrics:{rms_jerk_mps3:[null,0,7,null,7,2][i],impact_speed_mps:[0,null,2,null,2,1][i],stopping_distance_m:i===1?0:null},...(i===0?{trace_available:false,status:"FAILED",outcome:"ERROR",error:"Lỗi từ API: "+"bằng chứng ".repeat(25)}:{})}));
 dashboardOverride={...structuredClone(originalDashboard),total:6,page:1,page_size:10,items:boundaryRuns};
 await page.goto(base+"/analysis/failures?view=runs&scenario_id=1&page_size=10&sort=jerk");
 const explorer=page.getByRole("region",{name:"Khám phá lượt chạy baseline",exact:true});
 const explorerRows=explorer.locator("tbody tr");
 const rowIds=()=>explorerRows.evaluateAll(rows=>rows.map(r=>Number(r.dataset.runId)));
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-run-id]").length===6);
 assert.deepEqual(await rowIds(),[1004,1002,1005,1001,1003,1000]);
 assert.equal((await explorer.locator('tr[data-run-id="1001"] td.numeric').first().innerText()).trim(),"0.00");
 assert.equal((await explorer.locator('tr[data-run-id="1000"] td.numeric').first().innerText()).trim(),"—");
 assert(await page.getByLabel("Tập của run 1000",{exact:true}).isDisabled());
 assert.equal(await explorer.getByRole("link",{name:"Playback run 1000",exact:true}).count(),0);
 await explorer.getByText("Chưa có playback",{exact:true}).waitFor();
 const listRequests=()=>requests.filter(u=>u.pathname.endsWith("/analysis/runs")).length;
 const requestsBeforeLocal=listRequests();
 await page.getByLabel("Sắp xếp trong trang").selectOption("impact");
 await page.waitForURL(url=>url.searchParams.get("sort")==="impact");
 assert.deepEqual(await rowIds(),[1004,1002,1005,1000,1003,1001]);
 await page.getByLabel("Tìm trong trang hiện tại").fill("  CP-003  ");
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-run-id]").length===1);
 assert.deepEqual(await rowIds(),[1002]);
 assert.equal(listRequests(),requestsBeforeLocal,"Local search/sort must not fetch a global list");
 await page.reload();await page.getByRole("link",{name:"Chi tiết run 1002",exact:true}).waitFor();
 assert.equal(await page.getByLabel("Tìm trong trang hiện tại").inputValue(),"  CP-003  ");
 assert.equal(await page.getByLabel("Sắp xếp trong trang").inputValue(),"impact");
 await page.getByRole("button",{name:"Xóa tìm kiếm",exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-run-id]").length===6);
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});await page.screenshot({path:path.join(output,`runs-boundary-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Run boundary overflow ${width}`);
  const scrollRegion=page.getByRole("region",{name:"Bảng lượt chạy baseline, cuộn ngang để xem thêm",exact:true});
  await scrollRegion.focus();await scrollRegion.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  const sticky=await explorerRows.first().locator("td").first().evaluate(td=>({left:td.getBoundingClientRect().left,region:td.closest('[role="region"]').getBoundingClientRect().left}));
  assert(Math.abs(sticky.left-sticky.region)<3,"Run identity stays visible while scrolling");
  const pinnedAction=async()=>explorerRows.first().locator("td").last().evaluate(td=>({right:td.getBoundingClientRect().right,region:td.closest('[role="region"]').getBoundingClientRect().right}));
  let action=await pinnedAction();assert(Math.abs(action.right-action.region)<3,"Row actions stay visible at scroll end");
  await scrollRegion.evaluate(el=>{el.scrollLeft=0;});
  action=await pinnedAction();assert(Math.abs(action.right-action.region)<3,"Row actions stay visible before scrolling");
  await page.screenshot({path:path.join(output,`runs-boundary-${width}.png`),fullPage:true});
 }
 dashboardOverride=null;
 await page.goto(base+"/analysis/failures?view=runs&scenario_id=1&status=COMPLETED&page_size=10&page=2&q=CP&sort=oldest");
 await explorerRows.first().waitFor();
 const rowActionReturn=page.url();
 await explorerRows.first().getByRole("link",{name:/^Chi tiết run/}).click();
 await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).click();
 await page.waitForURL(rowActionReturn);assert.equal(page.url(),rowActionReturn);
 await explorerRows.first().getByRole("link",{name:/^Playback run/}).click();
 await page.getByRole("slider",{name:"Thời gian playback",exact:true}).waitFor();
 await page.getByRole("link",{name:"Danh sách phân tích",exact:true}).click();
 await page.waitForURL(rowActionReturn);assert.equal(page.url(),rowActionReturn);
 // Native browser Back also restores table state.
 await explorerRows.first().getByRole("link",{name:/^Chi tiết run/}).click();
 await page.getByRole("tab",{name:"Tổng quan & cấu hình",exact:true}).waitFor();
 await page.goBack();await explorerRows.first().waitFor();assert.equal(page.url(),rowActionReturn);
 await page.getByRole("button",{name:"Bỏ bộ lọc Trạng thái: Hoàn tất",exact:true}).click();
 await page.waitForURL(url=>!url.searchParams.has("status")&&!url.searchParams.has("page"));
 assert.equal(new URL(page.url()).searchParams.get("q"),"CP");
 assert.equal(new URL(page.url()).searchParams.get("sort"),"oldest");
 assert.equal(new URL(page.url()).searchParams.get("page_size"),"10");
 assert.equal(new URL(page.url()).searchParams.get("scenario_id"),"1");
 await explorerRows.first().waitFor();
 await page.getByLabel("Trạng thái",{exact:true}).selectOption("RUNNING");
 await page.getByText("Chưa có run baseline phù hợp.",{exact:true}).waitFor();
 assert.equal(await explorerRows.count(),0,"Changing server filters must hide stale rows");
 await page.getByRole("button",{name:"Bỏ bộ lọc Trạng thái: Đang chạy",exact:true}).click();
 await explorerRows.first().waitFor();
 await page.goto(base+"/analysis/failures?view=runs&scenario_id=1&page_size=10&page=999&sort=oldest");
 await page.waitForURL(url=>url.searchParams.get("page")==="5");
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-run-id]").length===5);
 assert(await page.getByRole("button",{name:"Trang sau",exact:true}).isDisabled());
 await page.getByLabel("Số dòng mỗi trang").selectOption("20");
 await page.waitForURL(url=>!url.searchParams.has("page")&&url.searchParams.get("page_size")==="20");
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-run-id]").length===20);
 assert(await page.getByRole("button",{name:"Trang trước",exact:true}).isDisabled());
 // Resume the shared analysis workflow checks on a fresh first page.
 await page.goto(base+"/analysis/failures?view=runs&scenario_id=1");
 await explorerRows.first().waitFor();
 await page.getByLabel("Số dòng mỗi trang").selectOption("10");
 await page.waitForFunction(()=>document.querySelectorAll("tbody tr").length===10);
 await page.getByRole("button",{name:"Trang sau",exact:true}).click();
 await page.waitForURL("**page=2");
 assert.equal(new URL(page.url()).searchParams.get("scenario_id"),"1");
 await page.getByLabel("Sắp xếp trong trang").selectOption("oldest");
 const missingRun=[...runs].reverse().slice(10,20).find(run=>run.metrics.rms_jerk_mps3==null);
 if(missingRun){const row=page.getByLabel(`Tập của run ${missingRun.run_id}`,{exact:true}).locator("xpath=ancestor::tr");assert.equal((await row.locator("td.numeric").first().innerText()).trim(),"—");}
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});await page.screenshot({path:path.join(output,`runs-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Runs overflow ${width}`);
 }
 await page.getByLabel("Tìm trong trang hiện tại").fill("không-tồn-tại");
 await page.getByText("Không có kết quả tìm trong trang này.",{exact:true}).waitFor();
 await page.getByLabel("Tìm trong trang hiện tại").fill("");
 await page.waitForURL(url=>!url.searchParams.has("q"));
 const runLink=page.getByRole("table").locator("tbody tr a").first(),backUrl=page.url();
 await runLink.click();
 await page.getByRole("tab",{name:"Tổng quan & cấu hình",exact:true}).waitFor();
 await page.screenshot({path:path.join(output,"detail-summary-tablet.png"),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Detail tablet overflow");
 await page.getByRole("tab",{name:"Telemetry & chỉ số",exact:true}).click();
 await page.getByLabel("Tín hiệu",{exact:true}).selectOption("jerk_mps3");
 await page.getByRole("img",{name:/Jerk từ gia tốc/}).waitFor();
 await page.screenshot({path:path.join(output,"detail-telemetry-tablet.png"),fullPage:true});
 await page.getByRole("tab",{name:"Nguyên nhân & bằng chứng",exact:true}).click();
 await page.getByRole("heading",{name:"Bằng chứng và giới hạn nhận định",exact:true}).waitFor();
 await page.screenshot({path:path.join(output,"detail-evidence-tablet.png"),fullPage:true});
 await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).click();
 await page.waitForURL(backUrl);assert.equal(page.url(),backUrl);
 const safe=runs.filter(r=>r.outcome==="SAFE"&&r.metrics.rms_jerk_mps3!=null).slice(0,2);assert.equal(safe.length,2);
 for(const [i,run] of safe.entries()){
  const position=[...runs].reverse().findIndex(r=>r.run_id===run.run_id),targetPage=Math.floor(position/10)+1;
  await page.goto(base+`/analysis/failures?view=runs&scenario_id=1&page_size=10&page=${targetPage}`);
  await page.getByLabel(`Tập của run ${run.run_id}`,{exact:true}).selectOption(i?"VALIDATION":"OPTIMIZATION");
  await page.waitForFunction(id=>document.querySelector(`tr[data-run-id="${id}"]`)?.dataset.selected==="true",run.run_id);
  if(i===0){
   const selectedUrl=page.url();
   await page.getByLabel("Trạng thái",{exact:true}).selectOption("RUNNING");
   await page.getByText("Chưa có run baseline phù hợp.",{exact:true}).waitFor();
   await page.goto(selectedUrl);await page.getByLabel(`Tập của run ${run.run_id}`,{exact:true}).waitFor();
   assert.equal(await page.getByLabel(`Tập của run ${run.run_id}`,{exact:true}).inputValue(),"OPTIMIZATION");
  }
 }
 await page.getByRole("navigation",{name:"Chế độ phân tích"}).getByRole("link",{name:/Tập bàn giao/}).click();
 await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).waitFor();
 assert.equal(await page.getByRole("table").locator("tbody tr").count(),2);
 await page.reload();await page.getByRole("table").locator("tbody tr").first().waitFor();
 assert.equal(await page.getByRole("table").locator("tbody tr").count(),2);
 await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).click();
 await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 assert.deepEqual(writes[0].body.optimization_run_ids,[safe[0].run_id]);
 assert.deepEqual(writes[0].body.validation_run_ids,[safe[1].run_id]);
 assert.equal(Object.keys(writes[0].body.run_revisions).length,2);
 await page.reload();await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 await page.screenshot({path:path.join(output,"dataset-tablet.png"),fullPage:true});
 await page.getByRole("button",{name:"Tiếp tục: Tối ưu AEB →",exact:true}).click();
 await page.waitForURL("**/aeb?dataset_id=9001");
 await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 assert(requests.some(url=>url.pathname.endsWith("/analysis/datasets/9001/handoff")));
 await page.screenshot({path:path.join(output,"aeb-handoff-fixture.png"),fullPage:true});
 const id=safe[0].run_id;
 await page.goto(base+`/analysis/failures/${id}?t=1.25`);
 await page.getByRole("link",{name:"Mở playback tại thời điểm đang xem",exact:true}).click();
 const slider=page.getByRole("slider",{name:"Thời gian playback",exact:true});await slider.waitFor();assert.equal(Number(await slider.inputValue()),1.25);
 await page.getByRole("button",{name:"Phát",exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Thời gian playback"]').value)>1.3);
 await page.getByRole("button",{name:"Tạm dừng",exact:true}).click();
 await slider.focus();await slider.press("Home");assert.equal(Number(await slider.inputValue()),0);await slider.press("ArrowRight");assert(Number(await slider.inputValue())>0);
 await page.getByRole("button",{name:"Tốc độ phát 2 lần",exact:true}).click();
 await page.screenshot({path:path.join(output,"playback-tablet.png"),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Playback tablet overflow");
 // Batch 1: intentionally contrasting fixture values prove the API is authoritative.
 // The CARLA identity here is fixture metadata, not a claim of live CARLA verification.
 const apiDetail=detailFor(id),recorded=caseFor(id).outcome;
 playbackOverride={...apiDetail,...recorded,simulator:"carla-0.9.16-xosc4",frames:recorded.frames.map(f=>({...f,ego_v:0,ego_a:1.25,aeb:true,ttc:0.1})),events:[{t:0,kind:"aeb_decision",label:"Lệnh AEB đã ghi"}],motion_telemetry:apiDetail.motion_telemetry.map(p=>({...p,crossing_distance_m:777.7})),vehicle_length_m:4.8,vehicle_width_m:2,lane_width_m:3.5,ttc_threshold_s:1.5,related_runs:[]};
 const playbackUrl=base+`/analysis/failures/${id}/playback?t=0`;
 await page.goto(playbackUrl);await page.getByRole("slider",{name:"Thời gian playback",exact:true}).waitFor();
 await page.getByText(/Nguồn API: carla-0.9.16-xosc4/).waitFor();
 const fact=label=>page.getByText(label,{exact:true}).locator("..");
 assert.match(await fact("Khoảng cách tới vạch băng qua").innerText(),/777\.7 m/);
 assert.match(await fact("Gia tốc ego đã ghi").innerText(),/1\.25 m\/s²/);
 assert.equal(await page.getByText("ĐÃ DỪNG",{exact:true}).count(),0,"Zero speed must not invent a stopped event");
 assert.equal(await page.getByText("Vùng TTC",{exact:true}).count(),0);
 assert.equal(await page.getByText("Lệch vị trí GT – nhận thức",{exact:true}).count(),0);
 assert.equal(await page.getByRole("button",{name:/TTC xuống dưới/}).count(),0,"Low TTC must not fabricate an event");
 await page.screenshot({path:path.join(output,"batch1-api-playback.png"),fullPage:true});
 playbackOverride={...playbackOverride,motion_telemetry:undefined,events:[...playbackOverride.events,{t:0,kind:"stopped",label:"Xe dừng theo API"},{t:0.75,kind:"ttc_below",label:"Mốc TTC do API ghi"}]};
 await page.goto(playbackUrl);await page.getByRole("slider",{name:"Thời gian playback",exact:true}).waitFor();
 assert.match(await fact("Khoảng cách tới vạch băng qua").innerText(),/—/);
 await page.getByText("ĐÃ DỪNG",{exact:true}).waitFor();
 await page.getByRole("region",{name:"Nhật ký sự kiện",exact:true}).getByRole("button",{name:/Mốc TTC do API ghi/}).waitFor();
 detailOverride={...apiDetail,simulator:"carla-0.9.16-xosc4",events:[],telemetry:apiDetail.telemetry.map(p=>({...p,ttc:0.1})),chain:[{stage:"DECISION",passed:false,summary:"Bằng chứng do backend cung cấp",parameter_code:null,cause_code:null,confidence:0.5}]};
 await page.goto(base+`/analysis/failures/${id}?section=telemetry`);
 await page.getByRole("heading",{name:"Dữ liệu đo",exact:true}).waitFor();
 assert.equal(await page.getByText("Mốc TTC từ backend",{exact:true}).count(),0);
 assert.equal(await page.getByRole("tabpanel",{name:"Telemetry & chỉ số",exact:true}).getByText(/Trễ kích hoạt/).count(),0);
 await page.getByRole("tabpanel",{name:"Telemetry & chỉ số",exact:true}).getByText("Bằng chứng do backend cung cấp",{exact:false}).waitFor();
 detailOverride={...detailOverride,events:[{t:0.75,kind:"ttc_below",label:"Mốc TTC do API ghi"}]};
 await page.reload();await page.getByText("Mốc TTC từ backend",{exact:true}).waitFor();
 playbackOverride=null;detailOverride=null;
 // Batch 5: playback controls, recorded frames/events, paused URL and source boundaries.
 const pbReturn="/analysis/failures?view=runs&scenario_id=1&page=2&page_size=10&q=CP&sort=impact";
 const pbUrl=base+`/analysis/failures/${id}/playback?returnTo=${encodeURIComponent(pbReturn)}`;
 const playbackFrames=[0,0.5,1,1.5,2].map((t,i)=>({...recorded.frames[0],t,ego_x:i,ego_v:i===1?0:10,ego_a:i===1?-1.25:1.25,ped_y:-1,perceived_y:null,confidence:null,ttc:i===1?null:0.1,ttc_gt:42,aeb:i===1,fcw:false,detected:false}));
 const playbackEvents=[{t:1.5,kind:"custom",label:"Nhãn trùng"},{t:0,kind:"gt_start",label:"Bắt đầu đã ghi"},{t:0.5,kind:"detection",label:"Nhãn trùng"},{t:0.51,kind:"fcw",label:"Cảnh báo đã ghi"},{t:1,kind:"aeb_decision",label:"Lệnh AEB đã ghi"},{t:1.51,kind:"extension",label:"Mốc mở rộng API"},{t:1.75,kind:"stopped",label:"Xe dừng theo API"}];
 const playbackMotion=playbackFrames.map((f,i)=>({...apiDetail.motion_telemetry[0],t:f.t,ego_x_m:f.ego_x,ego_speed_mps:f.ego_v,ego_accel_mps2:f.ego_a,ttc_perceived_s:f.ttc,ttc_gt_s:42,crossing_distance_m:[101,777.7,null,888.8,999.9][i]}));
 const pbFixture={...apiDetail,...recorded,simulator:"carla-0.9.16-xosc4",duration_s:2,frames:playbackFrames,events:playbackEvents,motion_telemetry:playbackMotion,vehicle_length_m:4.8,vehicle_width_m:2,lane_width_m:3.5,ttc_threshold_s:1.5,related_runs:[]};
 playbackOverride=pbFixture;
 await page.goto(pbUrl+"&t=0.75&signal=crossing_distance_m");await slider.waitFor();
 const player=page.getByRole("region",{name:"Điều khiển playback",exact:true});
 const log=page.getByRole("region",{name:"Nhật ký sự kiện",exact:true});
 const pbFacts=page.getByRole("region",{name:"Số đo khung playback",exact:true});
 const pbScene=page.getByRole("region",{name:"Cảnh playback đã ghi",exact:true});
 const pbValue=label=>pbFacts.getByText(label,{exact:true}).locator("..");
 assert.equal(await page.getByRole("slider").count(),1,"Playback exposes a single named native timeline");
 assert.match(await pbFacts.innerText(),/Khung 0.50 s · cursor 0.75 s/);
 assert.match(await pbValue("Khoảng cách tới vạch băng qua").innerText(),/777.7 m/);
 assert.match(await pbValue("Gia tốc ego đã ghi").innerText(),/-1.25 m\/s²/);
 assert.match(await pbValue("TTC nhận thức").innerText(),/—/);
 assert.match(await pbValue("TTC ground truth").innerText(),/42.00 s/);
 assert.equal(await page.getByText("ĐÃ DỪNG",{exact:true}).count(),0);
 assert.equal(await log.getByRole("button").count(),7,"All recorded event identities survive sorting/grouping");
 assert.equal(await pbScene.getByRole("button",{name:"Camera RGB",exact:true}).count(),0);
 await pbScene.getByText(/Camera\/RGB và LiDAR chưa được đồng bộ/).waitFor();
 const playbackRequests=()=>requests.filter(url=>/\/runs\/\d+\/playback$/.test(url.pathname)).length;
 const beforePlaybackActions=playbackRequests();
 await log.getByRole("button",{name:/Nhãn trùng · 0.50 s/}).click();await page.waitForURL(url=>url.searchParams.get("t")==="0.5");
 assert.equal(await log.locator('[aria-current="step"]').count(),1);
 assert.match(await log.locator('[aria-current="step"]').getAttribute("aria-label"),/0.50 s/);
 await log.getByRole("button",{name:/Nhãn trùng · 1.50 s/}).click();await page.waitForURL(url=>url.searchParams.get("t")==="1.5");
 assert.equal(await log.locator('[aria-current="step"]').count(),1,"Repeated labels must not highlight multiple records");
 assert.match(await log.locator('[aria-current="step"]').getAttribute("aria-label"),/1.50 s/);
 await player.getByRole("button",{name:"‹ Sự kiện trước",exact:true}).click();await page.waitForURL(url=>url.searchParams.get("t")==="1");
 await player.getByRole("button",{name:"Sự kiện sau ›",exact:true}).click();await page.waitForURL(url=>url.searchParams.get("t")==="1.5");
 const grouped=player.getByRole("button",{name:/^Mốc 0.50 s:/});
 assert.match(await grouped.getAttribute("aria-label"),/Nhãn trùng; Cảnh báo đã ghi/);
 await grouped.click();await page.waitForURL(url=>url.searchParams.get("t")==="0.5");
 assert.equal(Number(await slider.inputValue()),0.5,"Marker click seeks the recorded time without parent-track bubbling");
 await pbScene.getByRole("button",{name:"Nhận thức",exact:true}).click();assert.equal(await pbScene.getByRole("button",{name:"Nhận thức",exact:true}).getAttribute("aria-pressed"),"false");
 await pbScene.getByRole("button",{name:"Nhận thức",exact:true}).click();
 await page.getByLabel("Tín hiệu",{exact:true}).selectOption("ego_accel_mps2");await page.waitForURL(url=>url.searchParams.get("signal")==="ego_accel_mps2");
 await page.getByRole("button",{name:"Tốc độ phát 2 lần",exact:true}).click();await page.waitForURL(url=>url.searchParams.get("rate")==="2");
 await slider.focus();await slider.press("Home");await page.waitForURL(url=>url.searchParams.get("t")==="0");
 await slider.press("ArrowRight");await page.waitForURL(url=>Number(url.searchParams.get("t"))>0);
 await page.getByRole("button",{name:"Phát",exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Thời gian playback"]').value)>0.1);
 await page.getByRole("button",{name:"Tạm dừng",exact:true}).click();
 await page.waitForFunction(()=>Math.abs(Number(new URL(location.href).searchParams.get("t"))-Number(document.querySelector('[aria-label="Thời gian playback"]').value))<0.011);
 assert.equal(playbackRequests(),beforePlaybackActions,"Seek/play/pause/rate/layers/signal must not reload the playback API");
 await slider.focus();await slider.press("End");await page.waitForURL(url=>url.searchParams.get("t")==="2");
 await page.getByText("ĐÃ DỪNG",{exact:true}).waitFor();
 await page.reload();await slider.waitFor();assert.equal(Number(await slider.inputValue()),2);
 assert.equal(await page.getByRole("button",{name:"Tốc độ phát 2 lần",exact:true}).getAttribute("aria-pressed"),"true");
 assert.equal(await page.getByLabel("Tín hiệu",{exact:true}).inputValue(),"ego_accel_mps2");
 await page.getByRole("button",{name:"Phát",exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Thời gian playback"]').value)<1.5);
 await page.getByRole("button",{name:"Tạm dừng",exact:true}).click();
 await page.getByRole("link",{name:"Xem phân tích run",exact:true}).click();
 await page.getByRole("heading",{name:"Dữ liệu đo",exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get("returnTo"),pbReturn);
 assert.equal(new URL(page.url()).searchParams.get("signal"),"ego_accel_mps2");
 await page.getByLabel("Tín hiệu",{exact:true}).selectOption("crossing_distance_m");
 await page.getByRole("link",{name:"Mở playback tại thời điểm đang xem",exact:true}).click();await slider.waitFor();
 assert.equal(await page.getByLabel("Tín hiệu",{exact:true}).inputValue(),"crossing_distance_m","Detail-to-playback retains selected signal");
 assert.equal(new URL(page.url()).searchParams.get("returnTo"),pbReturn);
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});await page.screenshot({path:path.join(output,`playback-recorded-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Playback recorded overflow ${width}`);
 }
 // The projection must match the frame timestamp exactly; scene coordinates cannot fill the distance.
 playbackOverride={...pbFixture,motion_telemetry:playbackMotion.map(p=>({...p,t:p.t===0.5?0.5001:p.t}))};
 await page.goto(pbUrl+"&t=0.75");await pbFacts.waitFor();assert.match(await pbValue("Khoảng cách tới vạch băng qua").innerText(),/—/);
 // No frames and a partial single frame remain inspectable without invented coordinates or numbers.
 playbackOverride={...pbFixture,frames:[],motion_telemetry:[],events:[]};await page.goto(pbUrl);await player.waitFor();
 await page.getByText("Không có frame telemetry hợp lệ để phát lại.",{exact:true}).waitFor();assert(await slider.isDisabled());
 assert(await page.getByRole("button",{name:"Phát",exact:true}).isDisabled());assert.match(await pbValue("Tốc độ xe ego").innerText(),/—/);
 playbackOverride={...pbFixture,duration_s:0,frames:[{...playbackFrames[0],ego_v:null,ego_a:null,ego_x:null,ped_y:null,ttc:null,ttc_gt:null}],motion_telemetry:undefined,events:[]};
 await page.goto(pbUrl+"&t=99");await pbFacts.waitFor();assert.equal(Number(await slider.inputValue()),0);
 await page.getByText("Khung này chưa đủ tọa độ hoặc kích thước xe để dựng cảnh.",{exact:true}).waitFor();
 assert.match(await pbValue("Gia tốc ego đã ghi").innerText(),/—/);assert(await slider.isDisabled());
 playbackOverride={...pbFixture,duration_s:null};await page.goto(pbUrl);await player.waitFor();
 await page.getByText("Thời lượng từ API không hợp lệ. Chưa thể phát lại.",{exact:true}).waitFor();assert(await slider.isDisabled());
 playbackOverride={...pbFixture,outcome:"MISSED_BRAKING",frames:[playbackFrames[1],{...playbackFrames[0],t:null},{...playbackFrames[0],t:-1},{...playbackFrames[0],t:99},playbackFrames[0]],events:[playbackEvents[0],{t:99,kind:"out",label:"Ngoài khoảng"},{t:null,kind:"bad",label:"Không timestamp"},{t:-1,kind:"bad",label:"Âm"},playbackEvents[1]]};
 await page.goto(pbUrl+"&t=99");await pbFacts.waitFor();assert.equal(Number(await slider.inputValue()),2);
 await page.getByText("Bỏ sót phanh",{exact:true}).waitFor();await page.getByText("3 khung có timestamp không hợp lệ hoặc nằm ngoài khoảng phát.",{exact:true}).waitFor();
 await log.getByText("3 sự kiện có timestamp không hợp lệ hoặc nằm ngoài khoảng phát.",{exact:true}).waitFor();
 assert.equal(await log.getByRole("button").count(),2);assert.match(await pbFacts.innerText(),/Khung 0.50 s · cursor 2.00 s/);
 playbackOverride={...pbFixture,evaluation_valid:false,outcome:"SAFE"};await page.goto(pbUrl+"&t=-1");await player.waitFor();assert.equal(Number(await slider.inputValue()),0);
 assert.equal(await page.getByText("An toàn",{exact:true}).count(),0);
 const relatedId=id===1000?1001:1000;
 playbackOverride={...pbFixture,related_runs:[{run_id:relatedId,config:"v2-fixture",purpose:"BASELINE",outcome:"SAFE"}]};
 await page.goto(pbUrl+"&t=0.5");await pbFacts.waitFor();
 await page.getByRole("button",{name:"Phát",exact:true}).click();playbackOverride=null;playbackMode="slow";
 await page.getByRole("link",{name:"Mở run liên quan · AEB v2-fixture",exact:true}).click();
 await page.getByRole("status").filter({hasText:"Đang tải dữ liệu phân tích"}).waitFor();assert.equal(await pbFacts.count(),0);
 assert.equal(new URL(page.url()).searchParams.get("returnTo"),pbReturn);
 await pbFacts.waitFor();await page.getByRole("button",{name:"Phát",exact:true}).waitFor();playbackMode="normal";
 for(const nextMode of ["error","forbidden","notfound"]){
  playbackMode=nextMode;await page.goto(pbUrl);await analysisAlerts.waitFor();assert.equal(await player.count(),0);assert.equal(await pbFacts.count(),0);
 }
 playbackMode="normal";await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();await player.waitFor();
 await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).click();await page.waitForURL(base+pbReturn);
 playbackOverride=null;

 // Batch 4: distinct saved objectives, telemetry and derived signals must not overwrite each other.
 const baseRun=runs.find(r=>r.run_id===id);
 const sentinelDetail={...detailFor(id),simulator:"carla-0.9.16-xosc4",evaluation_version:version,
  metrics:{...detailFor(id).metrics,rms_jerk_mps3:77.777,impact_speed_mps:0,stopping_distance_m:null,first_detection_t:0,aeb_activation_t:null,fcw_t:null,brake_onset_t:null},
  events:[],telemetry:[{t:0,ttc:12,speed_kmh:36},{t:0.5,ttc:null,speed_kmh:null},{t:1,ttc:8,speed_kmh:0},{t:1.5,ttc:0,speed_kmh:-3},{t:2,ttc:4,speed_kmh:6}],
  motion_telemetry:[0,0.5,1,1.5,2].map((t,i)=>({t,ego_x_m:i,ego_speed_mps:100+i,ego_accel_mps2:i===0?1.25:-2,target_x_m:10,target_y_m:-1,target_vy_mps:0,perceived_y_m:null,ttc_perceived_s:null,ttc_gt_s:42,jerk_mps3:500,crossing_distance_m:i===1?null:777.7,motion_state:"STEADY",derived_source:"RECORDED_GT_FINITE_DIFFERENCE"}))};
 inspectionOverride={run:{...baseRun,simulator:"carla-0.9.16-xosc4",dt:0.01},detail:sentinelDetail};
 const preservedReturn="/analysis/failures?view=runs&scenario_id=1&page=2&page_size=10&q=CP&sort=impact";
 const detailUrl=base+`/analysis/failures/${id}?returnTo=${encodeURIComponent(preservedReturn)}`;
 await page.goto(detailUrl);
 const savedSummary=page.getByRole("region",{name:"Kết quả và chỉ số run",exact:true});
 const valueIn=(scope,label)=>scope.locator(`[aria-label="${label}"] dd`);
 await savedSummary.waitFor();
 assert.equal((await valueIn(savedSummary,"RMS jerk").innerText()).trim(),"77.78 m/s³");
 assert.equal((await valueIn(savedSummary,"Tốc độ va chạm").innerText()).trim(),"0.00 m/s");
 assert.equal((await valueIn(savedSummary,"Quãng phanh").innerText()).trim(),"—");
 const identity=page.getByRole("region",{name:"Danh tính và nguồn dữ liệu run",exact:true});
 assert.match(await identity.innerText(),/carla-0.9.16-xosc4[\s\S]*dt 0.01/);
 assert.match(await identity.innerText(),/chưa hiệu chuẩn/);
 assert.equal(await page.getByRole("tabpanel").count(),1,"Only the selected panel is exposed");
 const inspectionRequests=()=>requests.filter(url=>/\/analysis\/runs\/\d+$/.test(url.pathname)).length;
 const beforeExploration=inspectionRequests();
 const summaryTab=page.getByRole("tab",{name:"Tổng quan & cấu hình",exact:true});
 await summaryTab.focus();await summaryTab.press("ArrowRight");
 await page.waitForURL(url=>url.searchParams.get("section")==="telemetry");
 assert.equal(await page.getByRole("tab",{name:"Telemetry & chỉ số",exact:true}).getAttribute("aria-selected"),"true");
 await page.getByLabel("Tín hiệu",{exact:true}).selectOption("jerk_mps3");
 await page.waitForURL(url=>url.searchParams.get("signal")==="jerk_mps3");
 const readouts=page.getByRole("region",{name:"Số đo tại thời gian đang xem",exact:true});
 assert.equal((await valueIn(readouts,"Gia tốc ego tại khung").innerText()).trim(),"1.25");
 assert.equal((await valueIn(readouts,"Khoảng cách tới vạch tại khung").innerText()).trim(),"777.70");
 assert.match(await page.getByLabel("Số đo tín hiệu đang chọn",{exact:true}).innerText(),/500.000 m\/s³/);
 const combined=page.getByRole("img",{name:"TTC nhận thức (s) và tốc độ xe (km/h) theo thời gian (s)",exact:true});
 assert.equal(await combined.locator('circle[data-signal="ttc"]').count(),1,"A single recorded sample remains visible before a gap");
 assert.equal(await combined.locator('polyline[data-signal="ttc"]').count(),1,"Missing TTC splits the series");
 assert.equal(Number(await combined.locator('circle[data-signal="ttc"]').getAttribute("cy")),34);
 const afterGap=await combined.locator('polyline[data-signal="ttc"]').getAttribute("points");
 assert(Number(afterGap.split(" ")[0].split(",")[1])>34,"TTC 8 is below TTC 12; values are not clamped to 5 s");
 const timeSlider=page.getByRole("slider",{name:"Thời gian phân tích",exact:true});
 await timeSlider.focus();await timeSlider.press("End");
 await page.waitForURL(url=>url.searchParams.get("t")==="2");
 assert.equal((await valueIn(readouts,"Gia tốc ego tại khung").innerText()).trim(),"-2.00");
 assert.equal(inspectionRequests(),beforeExploration,"Changing tab/time/signal must not refetch inspection");
 assert.equal(new URL(page.url()).searchParams.get("returnTo"),preservedReturn);
 assert.match(await page.getByRole("region",{name:"Mốc thời gian phân tích",exact:true}).innerText(),/Trạng thái từ API: Tốc độ gần đều/,"Use stored motion state even when acceleration has a different sign");
 await page.reload();await readouts.waitFor();
 assert.equal(await page.getByLabel("Tín hiệu",{exact:true}).inputValue(),"jerk_mps3");
 assert.equal(Number(await timeSlider.inputValue()),2);
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});await page.screenshot({path:path.join(output,`detail-recorded-telemetry-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Detail telemetry overflow ${width}`);
  await page.getByRole("tab",{name:"Tổng quan & cấu hình",exact:true}).click();await savedSummary.waitFor();
  await page.screenshot({path:path.join(output,`detail-recorded-summary-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Detail summary overflow ${width}`);
  assert.equal((await valueIn(savedSummary,"RMS jerk").innerText()).trim(),"77.78 m/s³","Signal exploration must not recompute objective RMS jerk");
  await page.getByRole("tab",{name:"Telemetry & chỉ số",exact:true}).click();await readouts.waitFor();
 }
 await page.goto(detailUrl+"&section=telemetry&t=0.75&signal=ttc_perceived_s");await readouts.waitFor();
 assert.equal((await valueIn(readouts,"TTC nhận thức tại khung").innerText()).trim(),"—");
 assert.equal((await valueIn(readouts,"Tốc độ tại khung").innerText()).trim(),"—");
 assert.equal((await valueIn(readouts,"Khoảng cách tới vạch tại khung").innerText()).trim(),"—");
 assert.match(await readouts.innerText(),/Telemetry: 0.50 s/);
 assert.match(await page.getByLabel("Số đo tín hiệu đang chọn",{exact:true}).innerText(),/— s/);
 await page.getByLabel("Tín hiệu",{exact:true}).selectOption("ttc_gt_s");
 await page.waitForURL(url=>url.searchParams.get("signal")==="ttc_gt_s");
 assert.match(await page.getByLabel("Số đo tín hiệu đang chọn",{exact:true}).innerText(),/42.000 s/);
 await page.getByRole("tab",{name:"Telemetry & chỉ số",exact:true}).focus();
 await page.getByRole("tab",{name:"Telemetry & chỉ số",exact:true}).press("End");
 await page.getByRole("heading",{name:"Bằng chứng và giới hạn nhận định",exact:true}).waitFor();
 await page.getByRole("tab",{name:"Nguyên nhân & bằng chứng",exact:true}).press("Home");await savedSummary.waitFor();
 // Empty telemetry keeps stored metrics, disables the cursor and does not draw fallback values.
 inspectionOverride={...inspectionOverride,detail:{...sentinelDetail,telemetry:[],motion_telemetry:[],scene:{...sentinelDetail.scene,path:[],end:null}}};
 await page.goto(detailUrl+"&section=telemetry&t=999&signal=invalid");await readouts.waitFor();
 assert(await timeSlider.isDisabled());assert.equal(Number(await timeSlider.inputValue()),0);
 assert.equal(await combined.count(),0);assert.equal(await page.getByRole("img",{name:/Gia tốc ego.*theo thời gian/}).count(),0);
 assert.equal(await page.getByLabel("Tín hiệu",{exact:true}).inputValue(),"ego_accel_mps2");
 assert.equal((await valueIn(readouts,"Gia tốc ego tại khung").innerText()).trim(),"—");
 await page.getByRole("tab",{name:"Tổng quan & cấu hình",exact:true}).click();await savedSummary.waitFor();
 await page.getByText("Không đủ tọa độ hoặc kích thước xe tại khung này để dựng cảnh.",{exact:true}).waitFor();
 assert.equal((await valueIn(savedSummary,"RMS jerk").innerText()).trim(),"77.78 m/s³");
 // Repeated/decreasing timestamps break paths instead of connecting them backwards.
 inspectionOverride={...inspectionOverride,detail:{...sentinelDetail,
  telemetry:[{t:0,ttc:7,speed_kmh:0},{t:1,ttc:null,speed_kmh:null},{t:2,ttc:8,speed_kmh:1},{t:1,ttc:6,speed_kmh:2},{t:3,ttc:5,speed_kmh:3}],
  motion_telemetry:[0,0.5,1,0.75,2].map((t,i)=>({...sentinelDetail.motion_telemetry[i],t,ego_accel_mps2:[1.25,null,-2,3,0][i]}))}};
 await page.goto(detailUrl+"&section=telemetry&t=999");await combined.waitFor();
 assert.equal(Number(await timeSlider.inputValue()),3);
 assert.equal(await combined.locator('[data-signal="ttc"]').count(),3);
 const motionGapChart=page.getByRole("img",{name:"Gia tốc ego (m/s²) theo thời gian (s)",exact:true});
 assert.equal(await motionGapChart.locator("circle").count(),2);
 assert.equal(await motionGapChart.locator("polyline").count(),1,"Motion chart also splits missing and decreasing timestamps");
 assert.equal((await valueIn(readouts,"Gia tốc ego tại khung").innerText()).trim(),"0.00");
 inspectionOverride={run:{...baseRun,status:"RUNNING",trace_available:false,outcome:"NOT_FINISHED"},detail:null};
 await page.goto(detailUrl);await page.getByRole("region",{name:"Run chưa có kết quả phân tích",exact:true}).waitFor();
 assert.equal(await page.getByRole("tab").count(),0);
 assert.equal(await savedSummary.count(),0);assert.equal(await timeSlider.count(),0);
 assert.equal(await page.getByRole("link",{name:"▶ Phát lại",exact:true}).count(),0);
 inspectionOverride={run:baseRun,detail:{...sentinelDetail,evaluation_valid:false,outcome:"SAFE"}};
 await page.reload();await page.getByText("Run chưa có kết quả AEB hợp lệ; không dùng các số hiện có để kết luận an toàn.",{exact:true}).waitFor();
 assert.equal(await page.getByText("An toàn",{exact:true}).count(),0);
 // Moving between runs must hide the previous run while loading a new inspection.
 inspectionOverride=null;detailOverride={...sentinelDetail,similar:[{run_id:id===1000?1001:1000,variant:"Khác run",summary:"Fixture chuyển run",similarity_pct:50}]};
 await page.goto(detailUrl);await savedSummary.waitFor();
 detailOverride=null;inspectionMode="slow";
 await page.getByRole("region",{name:"Ca lỗi tương tự",exact:true}).getByRole("link").click();
 await page.getByRole("status").filter({hasText:"Đang tải dữ liệu phân tích"}).waitFor();
 assert.equal(await savedSummary.count(),0,"Previous run metrics disappear during navigation");
 await savedSummary.waitFor();inspectionMode="normal";
 for(const nextMode of ["error","forbidden","notfound"]){
  inspectionMode=nextMode;await page.goto(detailUrl);await analysisAlerts.waitFor();
  assert.equal(await page.getByRole("tab").count(),0);assert.equal(await savedSummary.count(),0);
 }
 inspectionMode="normal";await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();await savedSummary.waitFor();
 inspectionOverride=null;detailOverride=null;

 // Batch 6: server totals, page-local search, independent failure filters and source evidence.
 const failureUrl=base+"/analysis/failures?view=failures&scenario_id=1&page=2&q=baseline&sort=impact&f_size=10";
 const failureRows=page.locator("tr[data-failure-run]");
 const failureCount=()=>requests.filter(u=>u.pathname.endsWith("/failures")).length;
 const failureKpi=page.getByRole("article",{name:"KPI Tổng số ca lỗi",exact:true});
 await page.goto(failureUrl);await failureRows.first().waitFor();
 const originalFailures=structuredClone(lastFailures);
 assert(originalFailures.total>10,"Fixture exercises server pagination");
 assert.equal(await failureRows.count(),10);
 assert.equal(requests.filter(u=>u.pathname.endsWith("/failures")).at(-1).searchParams.get("scenario_id"),"1");
 await page.getByRole("button",{name:"Trang sau",exact:true}).click();
 await page.waitForURL(u=>u.searchParams.get("f_page")==="2");await failureRows.first().waitFor();
 assert.equal(new URL(page.url()).searchParams.get("page"),"2","Baseline pagination stays independent");
 await page.getByLabel("Số dòng mỗi trang",{exact:true}).selectOption("20");
 await page.waitForURL(u=>u.searchParams.get("f_size")==="20"&&!u.searchParams.has("f_page"));await failureRows.first().waitFor();
 await page.goto(failureUrl+"&f_page=999");
 await page.waitForURL(u=>u.searchParams.get("f_page")===String(originalFailures.pages));await failureRows.first().waitFor();
 for(const invalid of ["Infinity","1.5","-1"]){await page.goto(failureUrl+`&f_page=${invalid}`);await failureRows.first().waitFor();assert.equal(requests.filter(u=>u.pathname.endsWith("/failures")).at(-1).searchParams.get("page"),"1");}
 const failureBoundary=structuredClone(originalFailures.items.slice(0,2));
 Object.assign(failureBoundary[0],{failure_class:null,confidence:0,cause_code:"FIXTURE_ZERO",root_cause:"Nhận định bằng không từ API",impact_kmh:0,min_ttc_s:0});
 Object.assign(failureBoundary[1],{root_cause:"",confidence:null,cause_code:null,impact_kmh:null,min_ttc_s:null});
 failureOverride={...originalFailures,items:failureBoundary,total:250,pages:25,kpis:{total:250,this_week:0,collisions:200,near_misses:40,false_braking:10,by_class:{PERCEPTION:0,DECISION:220,CONTROL:undefined,VEHICLE_DYNAMICS:10}}};
 await page.goto(failureUrl);await failureKpi.getByText("250",{exact:true}).waitFor();
 const stageRegion=page.getByRole("region",{name:"Phân bố khâu nguyên nhân",exact:true});
 assert.equal(await stageRegion.getByRole("progressbar").count(),3);
 assert.equal(await stageRegion.getByRole("progressbar",{name:"Số ca Nhận thức",exact:true}).getAttribute("value"),"0");
 assert.equal(await stageRegion.getByRole("progressbar",{name:"Số ca Điều khiển",exact:true}).count(),0);
 assert.match(await page.getByRole("button",{name:"Lọc khâu Điều khiển",exact:true}).innerText(),/—/);
 await failureRows.first().getByText("Chưa có khâu nhận định",{exact:true}).waitFor();
 assert.equal(await failureRows.first().getByText("Biên an toàn",{exact:true}).count(),0);
 assert.match(await failureRows.first().innerText(),/Điểm luật: 0\.00/);
 assert.equal((await failureRows.first().locator("td.numeric").first().innerText()).trim(),"0.0");
 assert.equal((await failureRows.nth(1).locator("td.numeric").first().innerText()).trim(),"—");
 const beforeFailureSearch=failureCount();
 await page.getByLabel("Tìm trong trang ca lỗi",{exact:true}).fill("  fixture_zero  ");
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-failure-run]").length===1);
 assert.equal(failureCount(),beforeFailureSearch,"Failure search never fetches a global list");
 await page.getByLabel("Tìm trong trang ca lỗi",{exact:true}).fill("không tồn tại");
 await page.getByText("Không có kết quả tìm trong trang ca lỗi.",{exact:true}).waitFor();
 await page.getByRole("button",{name:"Xóa tìm kiếm ca lỗi",exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-failure-run]").length===2);
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Failure explorer overflow ${width}`);
  const tableRegion=page.getByRole("region",{name:"Bảng ca lỗi, cuộn ngang để xem thêm",exact:true});
  await tableRegion.focus();await tableRegion.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  const pinned=await failureRows.first().locator("td").first().evaluate(td=>({left:td.getBoundingClientRect().left,region:td.closest('[role="region"]').getBoundingClientRect().left}));
  assert(Math.abs(pinned.left-pinned.region)<3,"Failure identity stays visible while scrolling");
  await tableRegion.evaluate(el=>{el.scrollLeft=0;});
  await page.screenshot({path:path.join(output,`failures-${width}.png`),fullPage:true});
 }
 await page.getByLabel("Khâu chính",{exact:true}).selectOption("DECISION");
 await page.waitForURL(u=>u.searchParams.get("f_class")==="DECISION");await failureRows.first().waitFor();
 await page.getByLabel("Kết quả AEB",{exact:true}).selectOption("COLLISION");
 await page.waitForURL(u=>u.searchParams.get("f_outcome")==="COLLISION");await failureRows.first().waitFor();
 await page.getByLabel("Thời tiết",{exact:true}).selectOption("RAIN");
 await page.waitForURL(u=>u.searchParams.get("f_weather")==="RAIN");await failureRows.first().waitFor();
 await page.getByLabel("Cấu hình AEB",{exact:true}).selectOption("1");
 await page.waitForURL(u=>u.searchParams.get("f_aeb")==="1");await failureRows.first().waitFor();
 await page.getByLabel("Khoảng thời gian",{exact:true}).selectOption("30");
 await page.waitForURL(u=>u.searchParams.get("f_days")==="30");await failureRows.first().waitFor();
 const filteredRequest=requests.filter(u=>u.pathname.endsWith("/failures")).at(-1);
 for(const [key,value] of Object.entries({scenario_id:"1",failure_class:"DECISION",outcome:"COLLISION",weather:"RAIN",aeb_version_id:"1",days:"30"}))assert.equal(filteredRequest.searchParams.get(key),value);
 assert.equal(new URL(page.url()).searchParams.get("q"),"baseline");
 await page.getByLabel("Tìm trong trang ca lỗi",{exact:true}).fill("FIXTURE_ZERO");
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-failure-run]").length===1);
 const downloadEvent=page.waitForEvent("download");await page.getByRole("button",{name:"Xuất CSV",exact:true}).click();
 const failureDownload=await downloadEvent;assert.equal(failureDownload.suggestedFilename(),"failure_cases.csv");
 const csvQuery=requests.filter(u=>u.pathname.endsWith("/failures.csv")).at(-1).searchParams;
 for(const [key,value] of Object.entries({scenario_id:"1",failure_class:"DECISION",outcome:"COLLISION",weather:"RAIN",aeb_version_id:"1",days:"30"}))assert.equal(csvQuery.get(key),value);
 for(const key of ["q","f_q","page","page_size"])assert(!csvQuery.has(key),`CSV ignores ${key}`);
 const failureReturn=new URL(page.url()).pathname+new URL(page.url()).search;
 const failureId=failureBoundary[0].run_id;
 for(const section of ["evidence","telemetry","playback"]){
  const link=page.getByRole("link",{name:`${section==="evidence"?"Bằng chứng":section==="telemetry"?"Telemetry":"Playback"} run ${failureId}`,exact:true});
  const target=new URL(await link.getAttribute("href"),base);assert.equal(target.searchParams.get("returnTo"),failureReturn);
  if(section!=="playback")assert.equal(target.searchParams.get("section"),section);
 }
 await page.getByRole("link",{name:`Bằng chứng run ${failureId}`,exact:true}).click();
 await page.getByRole("heading",{name:"Bằng chứng và giới hạn nhận định",exact:true}).waitFor();
 await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).click();
 await page.waitForURL(base+failureReturn);await failureRows.first().waitFor();
 assert.equal(await page.getByLabel("Tìm trong trang ca lỗi",{exact:true}).inputValue(),"FIXTURE_ZERO");
 await page.getByRole("button",{name:"Bỏ bộ lọc Khâu: Quyết định",exact:true}).click();
 await page.waitForURL(u=>!u.searchParams.has("f_class"));await failureRows.first().waitFor();
 assert.equal(new URL(page.url()).searchParams.get("f_outcome"),"COLLISION");
 await page.getByRole("button",{name:"Xóa bộ lọc ca lỗi",exact:true}).click();
 await page.waitForURL(u=>u.searchParams.get("f_scenario")===""&&!u.searchParams.has("f_outcome"));await failureRows.first().waitFor();
 assert.equal(requests.filter(u=>u.pathname.endsWith("/failures")).at(-1).searchParams.get("scenario_id"),null,"Empty family overrides inherited baseline family");
 await page.reload();await failureRows.first().waitFor();assert.equal(await page.getByLabel("Họ kịch bản",{exact:true}).inputValue(),"");
 await page.goto(failureUrl+"&f_days=14&f_aeb=88&f_scenario=99");await failureRows.first().waitFor();
 assert.equal(await page.getByLabel("Khoảng thời gian",{exact:true}).inputValue(),"14");
 assert.equal(await page.getByLabel("Cấu hình AEB",{exact:true}).inputValue(),"88");
 assert.equal(await page.getByLabel("Họ kịch bản",{exact:true}).inputValue(),"99");
 failureOverride=null;failureMode="slow";await page.goto(failureUrl);
 await page.getByRole("status").filter({hasText:"Đang tải dữ liệu phân tích"}).waitFor();
 assert.equal(await failureRows.count(),0);assert.equal(await stageRegion.getByRole("progressbar").count(),0);
 assert.equal((await failureKpi.locator("dd").innerText()).trim(),"—");
 await failureRows.first().waitFor();failureMode="error";await page.reload();await analysisAlerts.waitFor();
 assert.equal(await failureRows.count(),0);assert(await page.getByRole("button",{name:"Xuất CSV",exact:true}).isDisabled());
 failureMode="forbidden";await page.reload();await analysisAlerts.getByText(/Bạn không có quyền/).waitFor();
 failureMode="normal";await page.getByRole("button",{name:"Thử tải lại",exact:true}).click();await failureRows.first().waitFor();
 failureMode="empty";await page.reload();await page.getByText("Không có ca lỗi nào với bộ lọc này.",{exact:true}).waitFor();
 assert.equal((await failureKpi.locator("dd").innerText()).trim(),"0");assert.equal(await stageRegion.getByRole("progressbar").count(),0);
 failureMode="normal";
 // Explicit API cause remains primary even when an earlier stage fails; no probability or inference.
 const evidenceDetail=detailFor(id);
 const evidenceStages=["PERCEPTION","DECISION","CONTROL","VEHICLE_DYNAMICS"].map((stage,i)=>({stage,passed:i===0?false:i===2?null:true,summary:`Nhận định khâu ${stage} từ API`,confidence:i===0?0:null,cause_code:i===0?"FIXTURE_CAUSE_ZERO":null,parameter_code:i===0?"TTC_THRESHOLD":null}));
 detailOverride={...evidenceDetail,failure_class:"DECISION",chain:evidenceStages,chain_confidence:0,evaluation_version:"fixture-rule-v6",stage_evidence:[{stage:"PERCEPTION",values:{first_detection_t:0,first_detection_distance_m:0}},{stage:"DECISION",values:{decision_t:999,decision_ttc_s:null}},{stage:"VEHICLE_DYNAMICS",values:{road_friction:null,max_deceleration_mps2:null}},{stage:"UNKNOWN_API_STAGE",values:{opaque_metric:7}}]};
 const evidenceReturn="/analysis/failures?view=failures&scenario_id=1&f_page=2&f_size=10&f_weather=RAIN&f_q=CP";
 const evidenceUrl=base+`/analysis/failures/${id}?section=evidence&signal=speed&returnTo=${encodeURIComponent(evidenceReturn)}`;
 await page.goto(evidenceUrl);await page.getByRole("heading",{name:"Bằng chứng và giới hạn nhận định",exact:true}).waitFor();
 const primaryCause=page.getByLabel("Nhận định chính từ backend",{exact:true});
 assert.equal(await primaryCause.locator("h3").innerText(),"Quyết định");assert.match(await primaryCause.innerText(),/0\.00/);
 const perceptionEvidence=page.getByRole("article",{name:"Khâu Nhận thức",exact:true});
 const decisionEvidence=page.getByRole("article",{name:"Khâu Quyết định",exact:true});
 assert.match(await perceptionEvidence.innerText(),/FIXTURE_CAUSE_ZERO/);assert.match(await perceptionEvidence.innerText(),/0\.000 s/);
 assert.match(await perceptionEvidence.innerText(),/Ngưỡng TTC/);assert.equal(await perceptionEvidence.locator("input,select").count(),0);
 assert.match(await page.getByRole("article",{name:"Khâu Điều khiển",exact:true}).innerText(),/Chưa có kết luận/);
 assert.match(await page.getByRole("article",{name:"Khâu Động lực học",exact:true}).innerText(),/Chưa có số đo để đối chiếu/);
 assert.equal(await decisionEvidence.getByRole("link").count(),0,"Out-of-range stage time cannot seek to a different recorded sample");
 await page.getByRole("region",{name:"Số đo chưa có nhận định",exact:true}).getByText("opaque_metric",{exact:true}).waitFor();
 const evidenceLink=perceptionEvidence.getByRole("link",{name:"Xem telemetry khâu Nhận thức tại 0.00 s",exact:true});
 const evidenceTarget=new URL(await evidenceLink.getAttribute("href"),base);
 assert.equal(evidenceTarget.searchParams.get("t"),"0");assert.equal(evidenceTarget.searchParams.get("signal"),"speed");assert.equal(evidenceTarget.searchParams.get("returnTo"),evidenceReturn);
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(output,`evidence-${width}.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Evidence overflow ${width}`);}
 const beforeEvidenceSeek=requests.filter(u=>u.pathname.endsWith(`/analysis/runs/${id}`)).length;
 await evidenceLink.click();await page.getByRole("heading",{name:"Dữ liệu đo",exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get("t"),"0");
 assert.equal(requests.filter(u=>u.pathname.endsWith(`/analysis/runs/${id}`)).length,beforeEvidenceSeek,"Evidence seek uses the same loaded run");
 await page.getByRole("tab",{name:"Nguyên nhân & bằng chứng",exact:true}).click();
 await perceptionEvidence.getByRole("link",{name:"Playback khâu Nhận thức tại 0.00 s",exact:true}).click();
 await page.waitForURL(u=>u.pathname.endsWith("/playback"));assert.equal(new URL(page.url()).searchParams.get("returnTo"),evidenceReturn);assert.equal(new URL(page.url()).searchParams.get("t"),"0");
 inspectionOverride={run:{...runs.find(r=>r.run_id===id),trace_available:false},detail:detailOverride};
 await page.goto(evidenceUrl);await perceptionEvidence.waitFor();assert.equal(await perceptionEvidence.getByRole("link",{name:/^Playback khâu/}).count(),0);
 inspectionOverride=null;
 detailOverride={...detailOverride,failure_class:null,chain:[],chain_confidence:null};
 await page.goto(evidenceUrl);await primaryCause.getByText("Chưa có khâu chính từ backend.",{exact:true}).waitFor();
 assert.equal(await page.getByRole("region",{name:"Chuỗi nhận định và số đo",exact:true}).getByRole("article").count(),0);
 await page.getByRole("region",{name:"Số đo chưa có nhận định",exact:true}).getByText("opaque_metric",{exact:true}).waitFor();
 detailOverride=null;
 // Batch 7: draft metadata and immutable snapshot are separate, with recoverable server checks.
 const draftKey=`vehicsim.analysis.selection.v1:${user.id}:${context.project.id}`;
 const datasetUrl=base+"/analysis/failures?view=dataset&scenario_id=1&page=2&page_size=10&q=baseline&sort=impact";
 const snapshotUrl=datasetUrl+"&dataset_id=9001";
 const draftRows=page.locator("tr[data-draft-run]");
 const optimizationDraft=page.getByRole("region",{name:"Tập tối ưu trong bản nháp",exact:true});
 const validationDraft=page.getByRole("region",{name:"Tập xác minh trong bản nháp",exact:true});
 const snapshotRegion=page.getByRole("region",{name:"Snapshot và bàn giao",exact:true});
 const checkRegion=page.getByRole("region",{name:"Kiểm tra bản nháp",exact:true});
 const setDraft=async chosen=>{await page.evaluate(({key,chosen})=>sessionStorage.setItem(key,JSON.stringify(chosen)),{key:draftKey,chosen});await page.goto(datasetUrl);await page.getByRole("heading",{name:"Bản nháp đang chọn",exact:true}).waitFor();};
 const originalDraft=Object.fromEntries(safe.map((run,i)=>[run.run_id,{run:structuredClone(run),role:i?"VALIDATION":"OPTIMIZATION"}]));
 await setDraft(originalDraft);await draftRows.first().waitFor();
 assert(await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).isEnabled());
 assert.equal(await optimizationDraft.locator("tbody tr").count(),1);assert.equal(await validationDraft.locator("tbody tr").count(),1);
 const beforeDraftSearch=requests.filter(u=>u.pathname.endsWith("/analysis/runs")).length;
 await page.getByLabel("Tìm trong bản nháp",{exact:true}).fill(`  ${safe[0].variant.toLowerCase()}  `);
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-draft-run]").length===1);
 assert.equal(requests.filter(u=>u.pathname.endsWith("/analysis/runs")).length,beforeDraftSearch,"Draft review never loads the baseline page");
 const draftReturn=page.url();await optimizationDraft.getByRole("link",{name:`Chi tiết run đã chọn ${safe[0].run_id}`,exact:true}).click();
 await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).click();await page.waitForURL(draftReturn);await draftRows.first().waitFor();
 assert.equal(await page.getByLabel("Tìm trong bản nháp",{exact:true}).inputValue(),`  ${safe[0].variant.toLowerCase()}  `);
 await page.getByRole("button",{name:"Xóa tìm kiếm bản nháp",exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll("tr[data-draft-run]").length===2);
 const zeroDraft=structuredClone(originalDraft);zeroDraft[safe[0].run_id].run.metrics={rms_jerk_mps3:0,impact_speed_mps:null,stopping_distance_m:0};
 await setDraft(zeroDraft);await optimizationDraft.locator("summary").click();
 assert.match(await optimizationDraft.locator("dl").innerText(),/0\.000[\s\S]*—[\s\S]*0\.000/);
 const violations=[
  [draft=>{draft[safe[1].run_id].run.scenario_version_id=draft[safe[0].run_id].run.scenario_version_id;},"Không trùng biến thể giữa hai tập; không lặp biến thể/seed"],
  [draft=>{draft[safe[1].run_id].run.vehicle_id=88;},"Cùng họ, baseline, xe, simulator và bước thời gian"],
  [draft=>{draft[safe[1].run_id].run.dt=0.01;},"Cùng họ, baseline, xe, simulator và bước thời gian"],
  [draft=>{draft[safe[1].run_id].run.simulator="carla-0.9.16-xosc4";},"Cùng họ, baseline, xe, simulator và bước thời gian"],
  [draft=>{draft[safe[1].run_id].run.outcome="COLLISION";},"Mỗi tập giữ ít nhất một ca an toàn"],
  [draft=>{for(const item of Object.values(draft))item.run.baseline_id=88;},"Baseline của lựa chọn khớp ngữ cảnh hiện hành"],
  [draft=>{draft[safe[1].run_id].run.trace_available=false;},"Run hoàn tất, có telemetry và revision"],
 ];
 for(const [mutate,label] of violations){const chosen=structuredClone(originalDraft);mutate(chosen);await setDraft(chosen);await draftRows.first().waitFor();assert(await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).isDisabled());assert.equal(await checkRegion.getByText(label,{exact:true}).locator("../..").getAttribute("data-passed"),"false");}
 assert(await page.getByLabel(`Tập của run ${safe[1].run_id}`,{exact:true}).isDisabled());
 await page.getByRole("button",{name:`Bỏ run ${safe[1].run_id} khỏi bản nháp`,exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll("tr[data-draft-run]").length===1);
 const repeated=structuredClone(originalDraft),repeatId=80001;
 repeated[repeatId]={run:{...structuredClone(safe[0]),run_id:repeatId},role:"OPTIMIZATION"};
 await setDraft(repeated);await draftRows.first().waitFor();assert(await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).isDisabled());
 const limitDraft={};for(let index=0;index<501;index++){const run={...structuredClone(safe[0]),run_id:50000+index,scenario_version_id:60000+index,seed:index,variant:`LIMIT-${index}`};limitDraft[run.run_id]={run,role:"OPTIMIZATION"};}limitDraft[safe[1].run_id]=originalDraft[safe[1].run_id];
 await setDraft(limitDraft);await draftRows.first().waitFor();assert(await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).isDisabled());
 assert.equal(await checkRegion.getByText("Mỗi tập có từ 1 đến 500 run",{exact:true}).locator("../..").getAttribute("data-passed"),"false");
 await optimizationDraft.getByRole("button",{name:"Trang sau",exact:true}).click();await optimizationDraft.getByText("Trang 2 / 51",{exact:true}).waitFor();
 await optimizationDraft.getByLabel("Số dòng mỗi trang",{exact:true}).selectOption("20");await optimizationDraft.getByText("Trang 1 / 26",{exact:true}).waitFor();
 delete limitDraft[50500];await setDraft(limitDraft);await draftRows.first().waitFor();assert(await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).isEnabled());
 // Freeze failures retain selection; retry posts only IDs and source revisions.
 await setDraft(originalDraft);await draftRows.first().waitFor();selectionMode="stale";
 await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).click();
 await checkRegion.getByRole("alert").getByText(/Dữ liệu đã thay đổi/).waitFor();assert.equal(await draftRows.count(),2);
 assert.equal(new URL(page.url()).searchParams.get("dataset_id"),null);
 selectionMode="slow";await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).click();
 await page.getByRole("button",{name:"Đang chốt hai tập…",exact:true}).waitFor();
 assert(await page.getByRole("button",{name:"Bỏ lựa chọn",exact:true}).isDisabled());
 assert(await page.getByLabel(`Tập của run ${safe[0].run_id}`,{exact:true}).isDisabled());
 await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();selectionMode="normal";
 assert.equal(writes.length,3);assert.deepEqual(writes[2].body,writes[0].body,"Retry freezes the original IDs and revisions, without client metrics");
 assert.equal((await checkRegion.getByRole("alert").count()),0);
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});
  for(const group of [optimizationDraft,validationDraft]){
   const bounds=await group.locator("tbody tr").first().locator("td").last().evaluate(td=>({right:td.getBoundingClientRect().right,limit:td.closest('[role="region"]').getBoundingClientRect().right}));
   assert(bounds.right<=bounds.limit+2,`Draft role/removal actions stay visible at ${width}`);
  }
  await page.screenshot({path:path.join(output,`dataset-ready-${width}.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Dataset overflow ${width}`);
 }
 // A saved read intentionally has no handoff_ready flag. Handoff revalidates on the server.
 await page.reload();await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 assert(await page.getByRole("button",{name:"Tiếp tục: Tối ưu AEB →",exact:true}).isEnabled());
 for(const nextMode of ["changed","baseline","forbidden","notready"]){handoffMode=nextMode;await page.getByRole("button",{name:"Tiếp tục: Tối ưu AEB →",exact:true}).click();await snapshotRegion.getByRole("alert").waitFor();assert.equal(new URL(page.url()).pathname,"/analysis/failures");assert.equal(await draftRows.count(),2);}
 handoffMode="slow";await page.getByRole("button",{name:"Tiếp tục: Tối ưu AEB →",exact:true}).click();await page.getByRole("button",{name:"Đang kiểm tra bàn giao…",exact:true}).waitFor();
 assert(await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).isDisabled());
 await page.waitForURL("**/aeb?dataset_id=9001");await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();handoffMode="normal";
 assert.deepEqual(writes.map(w=>w.path),Array(3).fill("/vehicsim/analysis/selections"),"Handoff never starts optimizer or regression");
 // Read failures retry the snapshot endpoint, not the baseline list; changing IDs hides old data.
 for(const nextMode of ["error","forbidden","notfound"]){snapshotMode=nextMode;await page.goto(snapshotUrl);await snapshotRegion.getByRole("alert").waitFor();assert.equal(await page.getByRole("heading",{name:/Tập đã chốt #9001/}).count(),0);snapshotMode="normal";await snapshotRegion.getByRole("button",{name:"Thử tải lại tập đã chốt",exact:true}).click();await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();}
 snapshotMode="slow";await page.evaluate(()=>{const url=new URL(location.href);url.searchParams.set("dataset_id","9002");history.replaceState(null,"",url);});
 await snapshotRegion.getByRole("status").filter({hasText:"Đang tải dữ liệu phân tích"}).waitFor();assert.equal(await page.getByRole("heading",{name:/Tập đã chốt #9001/}).count(),0);
 snapshotMode="normal";await page.evaluate(()=>{const url=new URL(location.href);url.searchParams.set("dataset_id","9001");history.replaceState(null,"",url);});
 await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 await page.waitForTimeout(850);assert.equal(await page.getByRole("heading",{name:/Tập đã chốt #9002/}).count(),0,"Late old response cannot replace current snapshot");
 snapshotOverride={...saved,baseline_current:false};await page.reload();await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();assert(await page.getByRole("button",{name:"Tiếp tục: Tối ưu AEB →",exact:true}).isDisabled());
 snapshotOverride={schema:"vehicsim.analysis-dataset/v1",id:9001};await page.reload();await snapshotRegion.getByRole("alert").getByText(/Tập dữ liệu cũ/).waitFor();assert.equal(await page.getByRole("button",{name:"Tiếp tục: Tối ưu AEB →",exact:true}).count(),0);
 snapshotOverride=null;
 for(const invalid of ["0","-1","Infinity","1.5","abc"]){const before=requests.filter(u=>u.pathname.includes("/analysis/datasets/")).length;await page.goto(datasetUrl+`&dataset_id=${invalid}`);await snapshotRegion.getByRole("alert").getByText("Mã tập phân tích không hợp lệ.",{exact:true}).waitFor();assert.equal(requests.filter(u=>u.pathname.includes("/analysis/datasets/")).length,before);}
 await page.goto(snapshotUrl);await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 await page.getByLabel(`Tập của run ${safe[0].run_id}`,{exact:true}).selectOption("VALIDATION");
 await page.waitForURL(u=>!u.searchParams.has("dataset_id"));await validationDraft.locator("tbody tr").nth(1).waitFor();
 assert.equal(saved.optimization_run_ids[0],safe[0].run_id,"Editing draft preserves immutable snapshot");
 assert.equal(await page.getByRole("heading",{name:/Tập đã chốt #9001/}).count(),0);
 await page.getByRole("button",{name:"Bỏ lựa chọn",exact:true}).click();await page.getByText("Chưa có run trong bản nháp.",{exact:true}).waitFor();
 await page.reload();await page.getByText("Chưa có run trong bản nháp.",{exact:true}).waitFor();
 await page.goto(snapshotUrl);await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();assert.equal(await draftRows.count(),0,"Snapshot can be read with an empty draft");
 await page.evaluate(key=>sessionStorage.setItem(key,"{invalid json"),draftKey);await page.goto(datasetUrl);await page.getByRole("status").getByText(/Không khôi phục được lựa chọn/).waitFor();
 await setDraft({...originalDraft,broken:{role:"OPTIMIZATION",run:{run_id:"broken"}}});await page.getByRole("status").getByText(/Một số lựa chọn trong phiên/).waitFor();assert.equal(await draftRows.count(),2);
 context.project.id=999998;await page.reload();await page.getByText("Chưa có run trong bản nháp.",{exact:true}).waitFor();context.project.id=999999;await page.reload();await draftRows.first().waitFor();assert.equal(await draftRows.count(),2,"Draft remains scoped to the fixture account/project");
 role="MANAGER";await page.goto(snapshotUrl);await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 assert(await page.getByRole("button",{name:"Chốt hai tập dữ liệu",exact:true}).isDisabled());assert(await page.getByRole("button",{name:"Bỏ lựa chọn",exact:true}).isDisabled());
 assert(await page.getByLabel(`Tập của run ${safe[0].run_id}`,{exact:true}).isDisabled());assert(await page.getByRole("button",{name:`Bỏ run ${safe[0].run_id} khỏi bản nháp`,exact:true}).isDisabled());
 assert(await page.getByRole("button",{name:"Tiếp tục: Tối ưu AEB →",exact:true}).isEnabled(),"Read-only role may follow the existing GET handoff");
 role="ENGINEER";
 for(const nextMode of ["slow","empty","error","forbidden"]){mode=nextMode;await page.goto(base+"/analysis/failures?view=runs");if(mode==="slow")await page.getByRole("status").filter({hasText:"Đang tải dữ liệu phân tích"}).waitFor();else if(mode==="empty")await page.getByText("Chưa có run baseline phù hợp.",{exact:true}).waitFor();else await analysisAlerts.waitFor();await page.screenshot({path:path.join(output,`state-${mode}.png`),fullPage:true});}
 mode="normal";role="MANAGER";await page.reload();await page.getByRole("table").locator("tbody tr").first().waitFor();
 assert(await page.locator('select[aria-label^="Tập của run"]').first().isDisabled());
 await page.goto(base+`/analysis/failures/${id}?section=telemetry`);await page.getByRole("region",{name:"Danh tính và nguồn dữ liệu run",exact:true}).waitFor();
 assert(await page.getByRole("button",{name:"Chạy trên CARLA",exact:true}).isDisabled());
 assert(await page.getByRole("button",{name:"Tải .xosc",exact:true}).isEnabled());
 await page.getByRole("heading",{name:"Dữ liệu đo",exact:true}).waitFor();
 // Batch 8: shared interaction semantics, responsive shell and complete navigation regression.
 role="ENGINEER";mode="normal";
 const auditId=runs.find(run=>caseFor(run.run_id).evaluation.chain.length)?.run_id??id;
 const auditViewports=[[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]];
 const auditScreens=[
  ["overview",base+"/analysis/failures?scenario_id=1",()=>page.getByRole("progressbar",{name:"An toàn",exact:true})],
  ["runs",base+"/analysis/failures?view=runs&scenario_id=1&page_size=10",()=>page.locator("tr[data-run-id]").first()],
  ["failures",failureUrl,()=>failureRows.first()],
  ["dataset",snapshotUrl,()=>page.getByRole("heading",{name:/Tập đã chốt #9001/})],
  ["summary",base+`/analysis/failures/${auditId}?section=summary`,()=>page.getByRole("region",{name:"Kết quả và chỉ số run",exact:true})],
  ["telemetry",base+`/analysis/failures/${auditId}?section=telemetry`,()=>page.getByRole("heading",{name:"Dữ liệu đo",exact:true})],
  ["evidence",base+`/analysis/failures/${auditId}?section=evidence`,()=>page.getByRole("heading",{name:"Bằng chứng và giới hạn nhận định",exact:true})],
  ["playback",base+`/analysis/failures/${auditId}/playback?t=0`,()=>page.getByRole("region",{name:"Điều khiển playback",exact:true})],
 ];
 for(const [name,url,ready] of auditScreens){
  await page.goto(url);await ready().waitFor();
  await page.waitForFunction(()=>document.title.endsWith("| VehicSim"));
  assert.equal(await page.getByRole("heading",{level:1}).count(),1,`One visible page heading: ${name}`);
  const duplicateIds=await page.locator(".analysis-workspace [id]").evaluateAll(nodes=>{const ids=nodes.map(n=>n.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});
  assert.deepEqual(duplicateIds,[],`No duplicate IDs in ${name}`);
  const unnamed=await page.locator(".analysis-workspace button:visible,.analysis-workspace input:visible,.analysis-workspace select:visible").evaluateAll(nodes=>nodes.filter(node=>!node.getAttribute("aria-label")&&!node.getAttribute("aria-labelledby")&&!node.labels?.length&&!node.textContent.trim()&&!node.title).map(node=>node.outerHTML));
  assert.deepEqual(unnamed,[],`Visible controls have names/labels in ${name}`);
  if(["overview","runs","failures","dataset"].includes(name))assert.equal(await page.getByRole("navigation",{name:"Chế độ phân tích",exact:true}).locator('a[aria-current="page"]').count(),1);
  for(const [width,height] of auditViewports){
   await page.setViewportSize({width,height});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Batch 8 ${name} page overflow ${width}`);
   const mainBounds=await page.locator(".analysis-workspace").evaluate(node=>node.getBoundingClientRect().width);
   assert(mainBounds>=Math.min(width>=768?width-248:width,600)-1,`Analysis content gets usable width for ${name} at ${width}`);
   assert.equal(await page.locator(".analysis-mobile-menu > summary:visible").count(),width<768?1:0);
   await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:"instant"}));
   await page.screenshot({path:path.join(output,`batch8-${name}-${width}.png`),fullPage:true});
  }
 }
 // Mobile navigation remains available, is keyboard operable and closes after navigation/Escape.
 await page.goto(base+"/analysis/failures?scenario_id=1");await page.getByRole("heading",{name:"Phân tích baseline",exact:true}).waitFor();
 const mobileMenu=page.locator(".analysis-mobile-menu"),menuToggle=mobileMenu.locator(":scope > summary");
 await menuToggle.focus();await page.keyboard.press("Enter");await mobileMenu.getByRole("link",{name:"Phương tiện",exact:true}).waitFor();
 assert.equal(await page.getByRole("button",{name:"Đăng xuất",exact:true}).count(),1);
 await page.screenshot({path:path.join(output,"batch8-mobile-menu-open.png"),fullPage:true});
 await page.keyboard.press("Escape");assert.equal(await mobileMenu.getAttribute("open"),null);assert(await menuToggle.evaluate(node=>node===document.activeElement));
 await page.keyboard.press("Space");await mobileMenu.getByRole("link",{name:"Kết quả & phân tích",exact:true}).click();
 await page.waitForURL(base+"/analysis/failures");assert.equal(await mobileMenu.getAttribute("open"),null);
 // Focused shared scroll regions can be scrolled using the keyboard, including saved snapshot.
 await page.goto(snapshotUrl);await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 for(const label of ["Phân trang tập tối ưu","Phân trang tập xác minh"])assert.equal(await page.getByRole("navigation",{name:label,exact:true}).count(),1);
 const snapshotTable=page.getByRole("region",{name:"Bảng run và seed trong snapshot, cuộn ngang",exact:true});
 await snapshotTable.focus();await page.keyboard.press("ArrowRight");
 await page.waitForFunction(()=>document.querySelector('[aria-label="Bảng run và seed trong snapshot, cuộn ngang"]').scrollLeft>0);
 assert.equal(await snapshotTable.evaluate(node=>getComputedStyle(node).outlineStyle),"solid");
 assert.equal(await snapshotTable.evaluate(node=>getComputedStyle(node).outlineOffset),"-3px");
 // Native list nav, browser back, detail/playback and nested returnTo preserve the same filters.
 const navigationUrl=base+"/analysis/failures?view=runs&scenario_id=1&page=2&page_size=10&q=CP&sort=impact&f_weather=RAIN&d_q=kept";
 await page.goto(navigationUrl);await page.locator("tr[data-run-id]").first().waitFor();
 const listNav=page.getByRole("navigation",{name:"Chế độ phân tích",exact:true});
 await listNav.getByRole("link",{name:"Tra cứu ca lỗi",exact:true}).click();await failureRows.first().waitFor();
 assert.equal(new URL(page.url()).searchParams.get("q"),"CP");assert.equal(new URL(page.url()).searchParams.get("f_weather"),"RAIN");
 await page.goBack();await page.waitForURL(navigationUrl);await page.locator("tr[data-run-id]").first().waitFor();
 const inspectedRun=Number(await page.locator("tr[data-run-id]").first().getAttribute("data-run-id"));
 await page.getByRole("link",{name:`Chi tiết run ${inspectedRun}`,exact:true}).click();
 await page.getByRole("region",{name:"Danh tính và nguồn dữ liệu run",exact:true}).waitFor();
 await page.waitForFunction(expected=>document.title===expected,`Lượt chạy #${inspectedRun} | VehicSim`);
 assert.equal(await page.title(),`Lượt chạy #${inspectedRun} | VehicSim`);
 await page.getByRole("link",{name:"Mở playback tại thời điểm đang xem",exact:true}).click();await page.getByRole("region",{name:"Điều khiển playback",exact:true}).waitFor();
 await page.getByRole("link",{name:"Xem phân tích run",exact:true}).click();await page.getByRole("region",{name:"Danh tính và nguồn dữ liệu run",exact:true}).waitFor();
 await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).click();await page.waitForURL(navigationUrl);
 // Invalid route IDs never issue malformed API requests; unsafe return targets fall back locally.
 const runRequests=()=>requests.filter(u=>/\/analysis\/runs\/|\/runs\/[^/]+\/playback$/.test(u.pathname)).length;
 for(const invalid of ["abc","0","-1","1.5","Infinity","9007199254740992"]){for(const suffix of ["","/playback"]){
  const before=runRequests();await page.goto(base+`/analysis/failures/${invalid}${suffix}?returnTo=${encodeURIComponent("https://example.invalid/outside")}`);
  await analysisAlerts.getByText("Mã lượt chạy không hợp lệ.",{exact:true}).waitFor();assert.equal(runRequests(),before);
  assert.equal(await page.getByRole("link",{name:"← Về danh sách đang xem",exact:true}).getAttribute("href"),"/analysis/failures?view=runs");
  await page.waitForFunction(()=>document.title==="Lượt chạy không hợp lệ | VehicSim");
  assert.equal(await page.title(),"Lượt chạy không hợp lệ | VehicSim");
  assert(!/NaN|Infinity/.test(await page.locator("h1").innerText()));
 }}
 // Detail errors follow the source run rather than persisting onto a client-side run change.
 const nextAuditId=auditId===id?safe[1].run_id:id;
 detailOverride={...detailFor(auditId),similar:[{run_id:nextAuditId,variant:"UI transition",summary:"Fixture navigation",similarity_pct:0}]};
 await page.goto(base+`/analysis/failures/${auditId}`);await page.getByRole("region",{name:"Ca lỗi tương tự",exact:true}).getByRole("link").waitFor();
 await page.getByRole("button",{name:"Tải .xosc",exact:true}).click();await analysisAlerts.getByText(/API 503/).waitFor();
 detailOverride=null;await page.getByRole("region",{name:"Ca lỗi tương tự",exact:true}).getByRole("link").click();
 await page.waitForURL(u=>u.pathname===`/analysis/failures/${nextAuditId}`);await page.getByRole("heading",{name:`Lượt chạy #${nextAuditId}`,exact:true}).waitFor();await page.getByRole("region",{name:"Danh tính và nguồn dữ liệu run",exact:true}).waitFor();
 assert.equal(await analysisAlerts.count(),0,"Previous run action error is hidden after navigation");
 // Reduced motion affects loading decoration without changing playback or stored measurements.
 await page.emulateMedia({reducedMotion:"reduce"});mode="slow";
 await page.goto(base+"/analysis/failures?view=runs");await page.getByRole("status").filter({hasText:"Đang tải dữ liệu phân tích"}).waitFor();
 assert.equal(await page.locator(".analysis-loading-spinner").evaluate(node=>getComputedStyle(node).animationName),"none");
 await page.locator("tr[data-run-id]").first().waitFor();mode="normal";await page.emulateMedia({reducedMotion:"no-preference"});
 // The shared shell and table summary still work outside Analysis; no mobile override leaks to AEB.
 await page.goto(base+"/aeb?dataset_id=9001");await page.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 await page.waitForFunction(()=>document.title==="VehicSim — Mô phỏng & kiểm định AEB/FCW");
 assert.equal(await page.locator("[data-analysis-shell]").count(),0);assert.equal(await page.locator(".analysis-mobile-menu").count(),0);
 assert.equal(await page.getByRole("region",{name:"Bảng run và seed trong snapshot, cuộn ngang",exact:true}).count(),1);
 const freshAeb=await browserContext.newPage();freshAeb.on("pageerror",error=>errors.push(error.message));
 await freshAeb.goto(base+"/aeb?dataset_id=9001");await freshAeb.getByRole("heading",{name:/Tập đã chốt #9001/}).waitFor();
 assert.equal(await freshAeb.getByRole("region",{name:"Bảng run và seed trong snapshot, cuộn ngang",exact:true}).evaluate(node=>getComputedStyle(node).overflowX),"auto","Shared table scrolling works without loading Analysis CSS first");
 await freshAeb.close();
 assert.deepEqual(errors,[]);assert.equal(writes.length,3);assert(!writes.some(w=>/optimizations|aeb\/versions|regression/.test(w.path)));
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",viewports:auditViewports,checks:["batch8 eight-view five-viewport consistency; named controls/no duplicate IDs; scoped mobile menu keyboard/Escape/navigation; shared scroll-region keyboard/focus and named pagers; route titles; browser back/filter/detail/playback return chain; malformed run ID guards; scoped action errors; reduced motion; shared AEB summary and no shell override leak", "batch7 draft/snapshot separation; safe cases/source/overlap/duplicate/eligibility/baseline/500-limit metadata; page-local draft search/return/role transfer/removal/paging; cache corruption/project scope; freeze stale revision/busy/retry unchanged payload; snapshot URL/legacy/503/403/404/retry/loading/race/current baseline; handoff rejection/response validation/retry/by ID/no optimizer mutations; empty draft/read-only; responsive screenshots", "batch6 failure full-scope server statistics/partial-zero; filter chips/reset/inherited scope; CSV server filters; local search; pagination/invalid URLs; evidence primary identity/raw scores/unknown evidence/partial-zero; recorded-time telemetry/playback links and return; missing trace; loading/error/403/retry; responsive screenshots", "batch5 single keyboard timeline/markers; duplicate event identity; play-pause-restart/rates; exact recorded frame/projection and no inference; paused URL/reload/detail signal/return; layers; partial/invalid/empty data; run change/loading/503/403/404/retry; responsive screenshots", "batch4 detail source/metrics/tabs/keyboard; URL time/signal/return/reload without refetch; recorded null-zero-signed samples; no GT fallback or objective recomputation; gaps/non-monotonic timestamps; TTC above 5; loading/run navigation/empty/invalid/error/403/404/retry; responsive screenshots", "batch3 row actions/detail/playback/browser-back URL restoration; filter chips/reset; last-page clamp; page-size reset; local sort null/zero/ties; trimmed search/reload; missing-telemetry restrictions; sticky column/overflow", "overview","batch2 full-scope KPI/source identities/partial-zero-loading-error/retry","URL filters/page/search/sort","detail return","selection persistence","freeze payload/revisions","saved archive reload","AEB ID handoff and shared summary","playback seek/play/pause/speed","batch1 API-only metrics/events and missing data","failure family scope","loading/empty/error/403","read-only role","no unrelated mutations"],screenshots:output,liveBackendVerified:false,figmaVerified:false},null,2));
 console.log("PASS: browser fixture UI checks; live backend/authentication/database/CARLA/Figma NOT verified. Screenshots:",output);
} finally {await browser.close();}
