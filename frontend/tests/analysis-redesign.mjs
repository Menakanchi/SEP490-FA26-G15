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
const output=path.join(root,"data/analysis-batch3-ui");await fs.mkdir(output,{recursive:true});
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
let role="ENGINEER", mode="normal", saved=null, playbackOverride=null, detailOverride=null, dashboardOverride=null, lastDashboard=null;
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
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/analysis/selections"){
   const body=request.postDataJSON();saved={schema:"vehicsim.analysis-dataset/v2",id:9001,baseline_current:true,handoff_ready:true,scenario:{id:1,code:"CP",name:runs[0].family,category:"CP_CROSSING"},baseline:{id:1,label:"v1.0"},reference:{vehicle_id:1,simulator:runs[0].simulator,dt:0.05},runs:runs.filter(r=>[...body.optimization_run_ids,...body.validation_run_ids].includes(r.run_id)),...body,evaluation:{version,carla_observational_only:false},optimization_objectives:aggregate(runs.filter(r=>body.optimization_run_ids.includes(r.run_id))),validation_objectives:aggregate(runs.filter(r=>body.validation_run_ids.includes(r.run_id)))};return reply(saved);
  }
  if(p.startsWith("/vehicsim/analysis/datasets/"))return reply(saved??{},saved?200:404);
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
  if(inspection)return reply({run:runs.find(r=>r.run_id===Number(inspection[1])),detail:detailOverride??detailFor(Number(inspection[1]))});
  const playback=p.match(/^\/vehicsim\/runs\/(\d+)\/playback$/);
  if(playback){const id=Number(playback[1]),d=detailFor(id),o=caseFor(id).outcome;return reply(playbackOverride??{...d,...o,motion_telemetry:d.motion_telemetry,vehicle_length_m:4.8,vehicle_width_m:2,lane_width_m:3.5,ttc_threshold_s:1.5,related_runs:[]});}
  if(p==="/vehicsim/failures"){
   const rows=runs.filter(r=>r.outcome!=="SAFE").slice(0,20).map(r=>({...r,summary:"Parity fixture",root_cause:caseFor(r.run_id).evaluation.headline,impact_kmh:r.metrics.impact_speed_mps==null?null:r.metrics.impact_speed_mps*3.6,min_ttc_s:caseFor(r.run_id).outcome.metrics.min_ttc_s,config:"v1.0"}));
   return reply({items:rows,total:rows.length,page:1,page_size:20,pages:1,families:[],kpis:{total:rows.length,this_week:0,collisions:rows.filter(r=>r.outcome==="COLLISION").length,near_misses:rows.filter(r=>r.outcome==="NEAR_MISS").length,false_braking:rows.filter(r=>r.outcome==="FALSE_BRAKING").length,by_class:{PERCEPTION:0,DECISION:rows.length,CONTROL:0,VEHICLE_DYNAMICS:0}}});
  }
  return reply({detail:`Unhandled fixture path ${p}`},404);
 });
 const page=await browserContext.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(20000);
 const base=process.env.ANALYSIS_UI_URL||"http://localhost:3100";
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
 mode="error";await page.reload();await page.getByRole("alert").waitFor();
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
 await page.getByRole("button",{name:"Tổng quan & cấu hình",exact:true}).waitFor();
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
 await page.getByRole("button",{name:"Tổng quan & cấu hình",exact:true}).waitFor();
 await page.screenshot({path:path.join(output,"detail-summary-tablet.png"),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Detail tablet overflow");
 await page.getByRole("button",{name:"Telemetry & chỉ số",exact:true}).click();
 await page.getByLabel("Tín hiệu",{exact:true}).selectOption("jerk_mps3");
 await page.getByRole("img",{name:/Jerk từ gia tốc/}).waitFor();
 await page.screenshot({path:path.join(output,"detail-telemetry-tablet.png"),fullPage:true});
 await page.getByRole("button",{name:"Nguyên nhân & bằng chứng",exact:true}).click();
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
 await page.getByRole("button",{name:/Mốc TTC do API ghi/}).waitFor();
 detailOverride={...apiDetail,simulator:"carla-0.9.16-xosc4",events:[],telemetry:apiDetail.telemetry.map(p=>({...p,ttc:0.1})),chain:[{stage:"DECISION",passed:false,summary:"Bằng chứng do backend cung cấp",parameter_code:null,cause_code:null,confidence:0.5}]};
 await page.goto(base+`/analysis/failures/${id}?section=telemetry`);
 await page.getByRole("heading",{name:"Dữ liệu đo",exact:true}).waitFor();
 assert.equal(await page.getByText("Mốc TTC từ backend",{exact:true}).count(),0);
 assert.equal(await page.getByText(/Trễ kích hoạt/).count(),0);
 await page.getByText("Bằng chứng do backend cung cấp",{exact:false}).last().waitFor();
 detailOverride={...detailOverride,events:[{t:0.75,kind:"ttc_below",label:"Mốc TTC do API ghi"}]};
 await page.reload();await page.getByText("Mốc TTC từ backend",{exact:true}).waitFor();
 playbackOverride=null;detailOverride=null;
 await page.goto(base+"/analysis/failures?view=failures&scenario_id=1");await page.getByRole("heading",{name:"Tra cứu ca lỗi",exact:true}).waitFor();await page.getByRole("table").locator("tbody tr").first().waitFor();
 await page.screenshot({path:path.join(output,"failures-tablet.png"),fullPage:true});
 assert(requests.some(u=>u.pathname.endsWith("/failures")&&u.searchParams.get("scenario_id")==="1"));
 for(const nextMode of ["slow","empty","error","forbidden"]){mode=nextMode;await page.goto(base+"/analysis/failures?view=runs");if(mode==="slow")await page.getByRole("status").filter({hasText:"Đang tải dữ liệu phân tích"}).waitFor();else if(mode==="empty")await page.getByText("Chưa có run baseline phù hợp.",{exact:true}).waitFor();else await page.getByRole("alert").waitFor();await page.screenshot({path:path.join(output,`state-${mode}.png`),fullPage:true});}
 mode="normal";role="MANAGER";await page.reload();await page.getByRole("table").locator("tbody tr").first().waitFor();
 assert(await page.locator('select[aria-label^="Tập của run"]').first().isDisabled());
 assert.deepEqual(errors,[]);assert.equal(writes.length,1);assert(!writes.some(w=>/optimizations|aeb\/versions|regression/.test(w.path)));
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",viewports:[[1920,1080],[1366,768],[1024,768]],checks:["batch3 row actions/detail/playback/browser-back URL restoration; filter chips/reset; last-page clamp; page-size reset; local sort null/zero/ties; trimmed search/reload; missing-telemetry restrictions; sticky column/overflow", "overview","batch2 full-scope KPI/source identities/partial-zero-loading-error/retry","URL filters/page/search/sort","detail return","selection persistence","freeze payload/revisions","saved archive reload","AEB ID handoff and shared summary","playback seek/play/pause/speed","batch1 API-only metrics/events and missing data","failure family scope","loading/empty/error/403","read-only role","no unrelated mutations"],screenshots:output,liveBackendVerified:false,figmaVerified:false},null,2));
 console.log("PASS: browser fixture UI checks; live backend/authentication/database/CARLA/Figma NOT verified. Screenshots:",output);
} finally {await browser.close();}
