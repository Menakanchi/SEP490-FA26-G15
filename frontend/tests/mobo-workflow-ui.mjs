/** Real production browser, intercepted API fixtures; no backend or CARLA claim. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { browserOptions } from "./admin-test-utils.mjs";

const base=process.env.ANALYSIS_UI_URL||"http://127.0.0.1:3300";
const output=path.resolve(process.env.MOBO_UI_OUTPUT||"../data/postmerge-mobo");
await fs.mkdir(output,{recursive:true});
await fs.rm(path.join(output,"result.json"),{force:true});
const errors=[],unexpected=[],writes=[],pending=[],cancellations=[];
const campaignWrites=[];
const contextWrites=[],contextExecutions=[],datasetReads=[];
let datasetMode="normal",campaignStatus=200,failedCampaign=false;
let handoffMode="normal",contextStatus=200,executionStatus=200,handoffReady=true,v3Campaign=false;
const digest="c".repeat(64);
const dataset={schema:"vehicsim.analysis-dataset/v2",id:91,baseline_current:true,handoff_ready:true,dataset_digest:digest,
 scenario:{id:5,name:"FA frozen fixture",code:"CP",category:"CP_CROSSING"},baseline:{id:10,label:"Baseline"},reference:{vehicle_id:1,simulator:"carla-0.9.16-xosc16",dt:0.01},
 runs:[11,12,13,14].map(run_id=>({run_id,scenario_id:5,scenario_version_id:run_id,variant:"V-"+run_id,seed:run_id,baseline_id:10,vehicle_id:1,simulator:"carla-0.9.16-xosc16",dt:0.01,status:"COMPLETED",outcome:run_id%2===0?"SAFE":"COLLISION",revision:"fixture-"+run_id,trace_available:true,metrics:{}})),optimization_run_ids:[11,12],validation_run_ids:[13,14],
 optimization_objectives:{rms_jerk_mps3:{},impact_speed_mps:{},stopping_distance_m:{}},validation_objectives:{rms_jerk_mps3:{},impact_speed_mps:{},stopping_distance_m:{}},evaluation:{version:"adr040-stored-aggregation/1",carla_observational_only:true}};
const contextId="c0000000-0000-4000-8000-000000000001",sourceId="c0000000-0000-4000-8000-000000000002",executionId="c0000000-0000-4000-8000-000000000003",handoffId="c0000000-0000-4000-8000-000000000004",handoffDigest="e".repeat(64);
const v3Projection={schema:"vehicsim.fa-v3-campaign/v1",project_id:1,handoff_id:handoffId,handoff_digest:handoffDigest,
 scenario:dataset.scenario,baseline:dataset.baseline,reference:dataset.reference,optimization_run_ids:[11,12],validation_run_ids:[13,14],
 search_space:{TTC_THRESHOLD:[0.5,3],BRAKE_ACTIVATION_DELAY:[0,0.5],MAX_DECELERATION:[3,10],BRAKE_BUILDUP_RATE:[5,20]}};
const v3Execution={resource_schema:"vehicsim.fa-rest-resource/v1",resource_kind:"EXECUTION",id:executionId,project_id:1,source_id:sourceId,execution_id:executionId,context_id:contextId,handoff_id:handoffId,
 status:"COMPLETED",expected:4,accepted:4,analyzed:4,blocked:0,failed:0,missing:0,missing_is_subset_of_blocked:true,
 members:[11,12,13,14].map((key,i)=>({member_index:i,run_key:String(key),status:"ANALYZED",reason_codes:[],report_id:`c0000000-0000-4000-8000-00000000001${i}`}))};
let empty=false,delayFirst=false,holdSelection=false;
const user={id:77,email:"mobo@example.invalid",full_name:"MOBO Fixture",role:"ENGINEER",is_active:true};
const runs=[1,2].map(id=>({id,name:"Campaign "+id,scenario_id:5,status:"COMPLETED",completed_trials:4,max_trials:4,pareto_count:1}));
const row={id:101,trial_number:1,status:"COMPLETED",sampling_source:"SOBOL_INIT",constraint_violated:false,is_pareto_optimal:true,acquisition_value:null,rms_jerk_mps3:0.0001,impact_speed_mps:0.0001,stopping_distance_m:1,parameters:{TTC_THRESHOLD:1.5123456789123,BRAKE_ACTIVATION_DELAY:0.1234567891234,BRAKE_BUILDUP_RATE:10.123456789123,MAX_DECELERATION:8.123456789123}};
const source=await fs.readFile(new URL("../src/components/aeb/optimizationEvidence.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {hasCompleteTrialEvidence,isFeasibleTrial}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
assert(isFeasibleTrial({...row,rms_jerk_mps3:0,impact_speed_mps:0,stopping_distance_m:0}),"Measured zero is valid evidence");
for(const metric of ["rms_jerk_mps3","impact_speed_mps","stopping_distance_m"])
 for(const value of [null,undefined,NaN,Infinity,-Infinity,-1])assert.equal(hasCompleteTrialEvidence({...row,[metric]:value}),false);
assert.equal(hasCompleteTrialEvidence({...row,constraint_violated:null}),false);
assert.equal(isFeasibleTrial({...row,constraint_violated:true}),false);
assert.equal(isFeasibleTrial({...row,status:"RUNNING"}),false);
const browser=await chromium.launch(browserOptions());
try {
 const context=await browser.newContext({viewport:{width:1366,height:768}});
 await context.addInitScript(()=>localStorage.setItem("vehicsim_access_token","browser-fixture-only"));
 await context.route("**/api/v1/**",async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.replace("/api/v1","");
  const cors={"access-control-allow-origin":"*","access-control-allow-methods":"GET, POST, PUT, PATCH, DELETE, OPTIONS","access-control-allow-headers":"authorization, content-type, x-vehicsim-project"};
  const reply=(body,status=200)=>route.fulfill({status,headers:cors,contentType:"application/json",body:JSON.stringify(body)});
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:cors});
  if(p==="/auth/me")return reply(user);
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/regression"&&req.method()==="GET")return reply({items:[],kpis:{total:0,passed:0,failed:0,running:0}});
  if(p==="/vehicsim/projects")return reply({items:[],total:0,page:1,page_size:20,active_count:0,archived_count:0});
  if(p==="/vehicsim/context")return reply({project:{id:1,name:"MOBO fixture"},workspace:{id:1,name:"Fixture"},vehicle:{id:1,name:"Fixture"},system:{id:1,baseline:{id:10,label:"Baseline"}},versions:[],families:[{id:5,code:"CP",name:"FA frozen fixture"}],parameters:[],reviewer_projects:[],reviewer_can_decide:true,project_writable:true});
  if(p==="/vehicsim/carla/status")return reply({connected:false});
  if(p==="/vehicsim/aeb/versions")return reply([]);
  if(p==="/vehicsim/analysis/datasets/91/handoff"){datasetReads.push(p);return datasetMode==="failure"?reply({detail:"Fixture source revision changed"},409):reply({...dataset,baseline_current:datasetMode!=="stale",dataset_digest:datasetMode==="missing-digest"?undefined:digest});}
  if(p==="/vehicsim/analysis/datasets/91")return reply(dataset);
  if(p==="/vehicsim/analysis/runs")return reply({total:0,page:1,page_size:10,items:[],counts:{},objective_groups:[],evaluation_version:"adr040-stored-aggregation/1"});
  if(p==="/vehicsim/analysis/v3/sources")return reply({items:[],limit:20,offset:0});
  if(p==="/vehicsim/analysis/v3/explorer/scenarios")return reply({project_id:1,items:[],total:0,limit:20,offset:0});
  if(/^\/vehicsim\/analysis\/v3\/database\/(runs|collections)$/.test(p))return reply({schema_version:"vehicsim.fa-db-input/v1",selection_kind:p.endsWith("collections")?"COLLECTION":"RUN",project_id:1,items:[],limit:20,offset:0});
  if(p==="/vehicsim/analysis/v3/contexts"&&req.method()==="POST"){
   contextWrites.push(req.postDataJSON());return contextStatus===200?reply({context_id:contextId,context_digest:"d".repeat(64),source_id:sourceId}):reply({detail:"Fixture context approval unavailable"},contextStatus);
  }
  if(p===`/vehicsim/analysis/v3/contexts/${contextId}/executions`){contextExecutions.push(req.postData());return executionStatus===200?reply(v3Execution):reply({detail:"Fixture execution temporarily unavailable"},executionStatus);}
  if(p===`/vehicsim/analysis/v3/handoffs/${handoffId}`)return reply({resource_schema:"vehicsim.fa-rest-resource/v1",resource_kind:"HANDOFF",id:handoffId,project_id:1,source_id:sourceId,execution_id:executionId,context_id:contextId,status:handoffReady?"READY":"BLOCKED",dispatch_allowed:handoffReady,content_digest:handoffDigest,reason_codes:handoffReady?[]:["QUALITY_POLICY_REVIEW_REQUIRED"]});
  if(p===`/vehicsim/analysis/v3/handoffs/${handoffId}/campaign`){
   if(handoffMode==="failure")return reply({detail:"Fixture handoff stale"},409);
   return reply({...v3Projection,...(handoffMode==="wrong-checksum"?{handoff_digest:"f".repeat(64)}:handoffMode==="wrong-project"?{project_id:2}:handoffMode==="holdout-overlap"?{validation_run_ids:[11,14]}:handoffMode==="domain-missing"?{search_space:{}}:handoffMode==="stale"?{baseline:{id:9,label:"Old baseline"}}:{})});
  }
  if(p==="/vehicsim/optimizations"){
   if(req.method()==="POST"){campaignWrites.push(req.postDataJSON());return campaignStatus===200?reply({id:1,status:"PENDING"}):reply({detail:"Fixture dataset digest changed"},campaignStatus);}
   return reply(empty?[]:runs);
  }
  const detail=p.match(/^\/vehicsim\/optimizations\/(\d+)$/);
  if(detail)return reply({...runs.find(run=>run.id===Number(detail[1])),...(v3Campaign?{handoff_id:handoffId,handoff_digest:handoffDigest,handoff_execution_id:executionId}:{dataset_id:91,dataset_digest:digest}),optimization_run_ids:[11,12],validation_run_ids:[13,14],...(failedCampaign?{status:"FAILED",error_message:"Analysis campaign dataset identity or checksum changed"}:{})});
  const match=p.match(/^\/vehicsim\/optimizations\/(\d+)\/(trials|pareto)$/);
  if(match){
   const id=Number(match[1]);
   if(delayFirst&&id===1)await new Promise(resolve=>pending.push(resolve));
   const completed={...row,id:id*100+1,trial_number:id*100+1,candidate_aeb_version_id:id===1?20:21};
   const missing={...row,id:id*100+90,trial_number:id*100+90,stopping_distance_m:null};
   return reply(match[2]==="pareto"?[completed,missing]:[completed,{...row,id:102,trial_number:2,status:"RUNNING",is_pareto_optimal:false},{...row,id:103,trial_number:3,status:"FAILED",is_pareto_optimal:false},{...row,id:104,trial_number:4,constraint_violated:true,is_pareto_optimal:false},missing]);
  }
  if(p.match(/^\/vehicsim\/optimizations\/\d+\/cancel$/)&&req.method()==="POST"){
   cancellations.push(p);const run=runs.find(item=>item.id===Number(p.split("/")[3]));if(run)run.status="CANCELLED";
   return reply({id:run.id,status:"CANCELLED"});
  }
  if(p.match(/^\/vehicsim\/optimizations\/\d+\/select\/\d+$/)&&req.method()==="POST"){
   writes.push(p);if(holdSelection)await new Promise(resolve=>pending.push(resolve));
   return reply({candidate_aeb_version_id:p.includes('/optimizations/2/')?21:20,regression_test_id:30});
  }
  unexpected.push(p);return reply({detail:"Unhandled fixture"},404);
 });
 const page=await context.newPage();page.setDefaultTimeout(Number(process.env.MOBO_UI_TIMEOUT)||15000);page.on("pageerror",error=>errors.push(error.message));
 const choose=async id=>{await page.getByRole("button",{name:"Chọn đợt tối ưu hoá",exact:true}).click();await page.getByRole("option",{name:new RegExp("Đợt #"+id+" ·")}).click();};
 const noOverflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"No document overflow");
 const readableHeaders=async()=>assert(await page.locator("thead").evaluate(head=>{
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");canvas.width=canvas.height=1;
  const luminance=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=ctx.getImageData(0,0,1,1).data;return [...rgb].slice(0,3).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);};
  const background=luminance(getComputedStyle(head).backgroundColor);
  return [...head.querySelectorAll("th")].every(cell=>{const foreground=luminance(getComputedStyle(cell).color);return (Math.max(background,foreground)+0.05)/(Math.min(background,foreground)+0.05)>=4.5;});
 }),"Table header contrast is readable");
 await page.goto(base+"/aeb/mobo/trials?run_id=1");
 await page.getByRole("button",{name:"Hợp lệ (1)",exact:true}).waitFor();
 assert.equal(await page.getByText("Khởi tạo ban đầu",{exact:true}).count(),5);
 for(const name of ["TTC (s)","Trễ phanh (s)","Giảm tốc (m/s²)","Tăng lực phanh (m/s³)"])assert.equal(await page.getByRole("columnheader",{name,exact:true}).count(),1);
 await readableHeaders();
 assert.equal(await page.getByRole("columnheader",{name:"Va chạm (m/s)",exact:true}).count(),1);
 assert.equal(await page.getByRole("cell",{name:"Chưa đánh giá",exact:true}).count(),3,"Completed without a stopping metric remains unassessed");
 assert.equal(await page.getByRole("cell",{name:"Thỏa mãn",exact:true}).count(),1);
 await page.getByRole("button",{name:"Hợp lệ (1)",exact:true}).click();assert.equal(await page.locator("tbody tr").count(),1);
 assert.match(await page.locator("tbody").innerText(),/1\.00e-4/);
 for(const width of [1366,768,390,320]){await page.setViewportSize({width,height:844});await noOverflow();await page.screenshot({path:path.join(output,"trials-"+width+".png")});}
 // A slower response from a previous campaign must never replace the selected campaign.
 delayFirst=true;await page.goto(base+"/aeb/mobo/trials?run_id=1");
 await page.getByRole("button",{name:"Chọn đợt tối ưu hoá",exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Chọn đợt tối ưu hoá"]')?.textContent.includes("Đợt #1"));
 await choose(2);await page.getByRole("cell",{name:"#201",exact:true}).waitFor();
 assert(pending.length>0);delayFirst=false;for(const release of pending.splice(0))release();
 await page.waitForResponse(response=>response.url().endsWith("/optimizations/1/trials"));
 assert.equal(await page.getByRole("cell",{name:"#101",exact:true}).count(),0);
 await page.goto(base+"/aeb/mobo/pareto?run_id=1");await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).waitFor();
 await page.getByText("Trạng thái:").getByText("Hoàn tất",{exact:true}).waitFor();
 assert.equal(await page.getByRole("columnheader",{name:"Ngưỡng TTC (s)",exact:true}).count(),1);
 assert.equal(await page.getByRole("cell",{name:"1.512",exact:true}).count(),1);
 assert.equal(await page.getByRole("cell",{name:"1.512",exact:true}).getAttribute("title"),"1.5123456789123");
 assert.equal(await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).count(),1,"Incomplete historical Pareto rows are not eligible candidates");
 await readableHeaders();
 assert.equal(await page.getByText(/\(An toàn\)|Tránh va chạm/).count(),0);
 assert.match(await page.locator("tbody").innerText(),/1\.00e-4 m\/s/);
 await page.setViewportSize({width:1440,height:844});
 assert(await page.locator("table").evaluate(table => table.scrollWidth <= table.parentElement.clientWidth + 1), "Pareto table fits its container at 1440 px");
 assert(await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).evaluate(button => button.getBoundingClientRect().right <= button.closest(".overflow-x-auto").getBoundingClientRect().right), "Pareto action is visible at 1440 px");
 for(const width of [1366,768,390,320]){await page.setViewportSize({width,height:844});await noOverflow();await page.screenshot({path:path.join(output,"pareto-"+width+".png")});}
 holdSelection=true;
 await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByRole("button",{name:"Đang lưu…",exact:true}).waitFor();
 assert(await page.getByRole("button",{name:"Chọn đợt tối ưu hoá",exact:true}).isDisabled());
 assert.equal(writes.length,1);holdSelection=false;for(const release of pending.splice(0))release();
 await page.getByText(/Đã tạo ứng viên AEB/).waitFor();assert.equal(await page.getByRole("link",{name:"Xem kiểm thử hồi quy →",exact:true}).getAttribute("href"),"/validation/regression/30");
 await page.getByText("Đã chọn",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).count(),0);
 assert.equal(await page.getByRole("link",{name:"RT-030 →",exact:true}).getAttribute("href"),"/validation/regression/30");
 await choose(2);await page.getByRole("cell",{name:"#201",exact:true}).waitFor();
 assert.equal(await page.getByText(/Đã tạo ứng viên AEB/).count(),0);
 // The new combined studio uses the same evidence and campaign identity rules.
 await page.goto(base+"/aeb/mobo?run_id=1&tab=trials");await page.getByRole("cell",{name:"#101",exact:true}).waitFor();
 assert.equal(await page.getByText("Chưa đánh giá",{exact:true}).count(),3);
 await page.getByRole("button",{name:"Chỉ hợp lệ",exact:true}).click();assert.equal(await page.locator("tbody tr").count(),1);
 assert.match(await page.locator("tbody").innerText(),/1\.00e-4 m\/s/);
 for(const width of [1366,768,390,320]){await page.setViewportSize({width,height:844});await noOverflow();await page.screenshot({path:path.join(output,"studio-"+width+".png")});}
 await page.setViewportSize({width:1440,height:844});
 await page.goto(base+"/aeb/mobo?run_id=1&tab=pareto");await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).waitFor();
 assert(await page.locator("table").evaluate(table => table.scrollWidth <= table.parentElement.clientWidth + 1), "Studio Pareto table fits at 1440 px");
 assert(await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).evaluate(button => button.getBoundingClientRect().right <= button.closest(".overflow-x-auto").getBoundingClientRect().right), "Studio Pareto action is visible at 1440 px");
 delayFirst=true;await page.goto(base+"/aeb/mobo?run_id=1&tab=runs");
 await page.getByRole("button",{name:"Xem tối ưu",exact:true}).nth(1).click();await page.getByRole("cell",{name:"#201",exact:true}).waitFor();
 assert(pending.length>0);delayFirst=false;const old=page.waitForResponse(response=>response.url().endsWith("/optimizations/1/pareto"));for(const release of pending.splice(0))release();await old;
 assert.equal(await page.getByRole("cell",{name:"#101",exact:true}).count(),0);
 assert.equal(await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).count(),1);
 assert.equal(await page.getByText(/Đã chọn .* làm Ứng viên AEB/).count(),0);
 holdSelection=true;await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByRole("button",{name:"Đang lưu…",exact:true}).waitFor();assert.equal(writes.length,2);
 holdSelection=false;for(const release of pending.splice(0))release();
 await page.getByText("Đã chọn",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).count(),0);
 assert.equal(await page.getByRole("link",{name:"RT-030 →",exact:true}).getAttribute("href"),"/validation/regression/30");
 await page.getByRole("button",{name:/Lịch sử đợt chạy/}).click();await page.getByRole("button",{name:"Xem tối ưu",exact:true}).first().click();
 await page.getByRole("cell",{name:"#101",exact:true}).waitFor();
 assert.equal(await page.getByText(/Đã chọn .* làm Ứng viên AEB/).count(),0,"Selection from campaign 2 is not attached to campaign 1");
 holdSelection=true;await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).click();
 await page.getByRole("button",{name:"Đang lưu…",exact:true}).waitFor();
 await page.getByRole("button",{name:/Lịch sử đợt chạy/}).click();await page.getByRole("button",{name:"Xem tối ưu",exact:true}).nth(1).click();
 holdSelection=false;for(const release of pending.splice(0))release();await page.getByRole("cell",{name:"#201",exact:true}).waitFor();
 assert.equal(await page.getByText(/Đã chọn .* làm Ứng viên AEB/).count(),0,"Late selection from campaign 1 is not attached to campaign 2");
 // Frozen FA cohort must survive navigation and be submitted with server-issued checksum.
 await page.goto(base+"/aeb?dataset_id=91");assert.equal(await page.getByRole("link",{name:"Bắt đầu",exact:true}).getAttribute("href"),"/aeb/mobo/new?dataset_id=91");
 await page.getByRole("link",{name:"Bắt đầu",exact:true}).click();await page.getByRole("heading",{name:"Tập đã chốt #91 · FA frozen fixture",exact:true}).waitFor();
 assert(await page.getByRole("button",{name:"Kịch bản kiểm thử",exact:true}).isDisabled());
 assert(await page.getByRole("button",{name:/Mô phỏng Động học/}).isDisabled());
 assert(await page.getByRole("button",{name:/Mô phỏng CARLA 3D/}).isDisabled());
 assert.equal(await page.locator('input[type="file"]').count(),0);
 for(const width of [1366,390,320]){await page.setViewportSize({width,height:844});await noOverflow();await page.screenshot({path:path.join(output,"frozen-dataset-"+width+".png")});}
 campaignStatus=409;await page.getByRole("button",{name:"Bắt đầu tối ưu trên CARLA 3D",exact:true}).click();await page.getByText("Fixture dataset digest changed",{exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,"/aeb/mobo/new");assert.deepEqual(campaignWrites[0],{scenario_id:5,max_trials:10,n_initial_points:3,simulator_type:"CARLA",dataset_id:91,dataset_digest:digest,base_aeb_version_id:10});
 campaignStatus=200;await page.getByRole("button",{name:"Bắt đầu tối ưu trên CARLA 3D",exact:true}).click();await page.waitForURL(url=>url.pathname==="/aeb/mobo"&&url.searchParams.get("run_id")==="1");
 assert.deepEqual(campaignWrites[1],campaignWrites[0]);
 for(const mode of ["stale","missing-digest","failure"]){datasetMode=mode;await page.goto(base+"/aeb/mobo/new?dataset_id=91");await page.getByRole("button",{name:"Kiểm tra lại dataset",exact:true}).waitFor();assert(await page.getByRole("button",{name:/Bắt đầu tối ưu/}).isDisabled());}
 datasetMode="normal";await page.getByRole("button",{name:"Kiểm tra lại dataset",exact:true}).click();await page.getByRole("heading",{name:"Tập đã chốt #91 · FA frozen fixture",exact:true}).waitFor();
 await page.goto(base+"/aeb/mobo/new?dataset_id=invalid");await page.getByText("Mã tập phân tích không hợp lệ. Mở lại tập đã chốt từ Phân tích lỗi.",{exact:true}).waitFor();assert(await page.getByRole("button",{name:/Bắt đầu tối ưu/}).isDisabled());assert.equal(campaignWrites.length,2,"Invalid or stale datasets never silently create a different campaign");
 failedCampaign=true;await page.goto(base+"/aeb/mobo?run_id=1");await page.getByText("Định danh hoặc checksum dataset đã thay đổi. Không thể tiếp tục đợt tối ưu với nguồn này.",{exact:true}).waitFor();assert.equal(await page.getByRole("link",{name:"Xem tập nguồn",exact:true}).getAttribute("href"),"/analysis/failures?view=dataset&dataset_id=91");failedCampaign=false;
 // Explicit human confirmations create a V3 context; a transient execution failure retries the same stored context.
 await page.goto(base+"/analysis/failures?view=dataset&dataset_id=91");
 const review=page.getByRole("region",{name:"Rà soát bàn giao V3",exact:true});await review.waitFor();
 const confirmV3=review.getByRole("button",{name:"Xác nhận và phân tích V3",exact:true});assert(await confirmV3.isDisabled());
 await review.getByLabel("Lý do xác nhận bàn giao V3",{exact:true}).fill("Reviewed stored canonical targets and independent safe controls");
 await review.getByRole("checkbox",{name:/Đã rà soát ca đối chứng #12/}).check();
 await review.getByRole("checkbox",{name:/Chỉ tối ưu ba chỉ số đã lưu/}).check();
 await review.getByRole("checkbox",{name:/Hiệu chuẩn vật lý không áp dụng/}).check();
 await review.getByRole("checkbox",{name:/Tôi đã rà soát lựa chọn, hai tập độc lập/}).check();
 assert(await confirmV3.isDisabled(),"Both partitions need an explicitly reviewed control");assert.equal(contextWrites.length,0);
 await review.getByRole("checkbox",{name:/Đã rà soát ca đối chứng #14/}).check();
 for(const width of [1366,390,320]){await page.setViewportSize({width,height:844});await noOverflow();if(width!==390)await page.screenshot({path:path.join(output,"v3-context-"+width+".png"),fullPage:true});}
 executionStatus=503;await confirmV3.click();await review.getByText(/HTTP_REASON_UNAVAILABLE/).waitFor();
 assert.equal(contextWrites.length,1);assert.equal(contextExecutions.length,1);assert.equal(contextExecutions[0],null);
 assert.deepEqual(contextWrites[0],{dataset_id:91,dataset_digest:digest,reason:"Reviewed stored canonical targets and independent safe controls",confirmed:true,canonical_targets_only:true,calibration_not_applicable:true,nonhazard_run_ids:[12,14]});
 assert.equal(await review.getByRole("link",{name:"Mở MOBO từ handoff V3 →",exact:true}).count(),0);
 executionStatus=200;handoffReady=false;await review.getByRole("button",{name:"Thử lại phân tích với context đã lưu",exact:true}).click();await review.getByText("Chưa đủ điều kiện tối ưu",{exact:true}).waitFor();
 assert.match(await review.innerText(),/Hãy kiểm tra lại dữ liệu và điều kiện bàn giao/);assert.equal(contextWrites.length,1);
 assert.equal(await review.getByRole("link",{name:"Mở MOBO từ handoff V3 →",exact:true}).count(),0,"Blocked V3 never exposes a V2 optimizer substitute");
 handoffReady=true;await review.getByRole("button",{name:"Thử lại phân tích với context đã lưu",exact:true}).click();
 const v3Link=review.getByRole("link",{name:"Mở MOBO từ handoff V3 →",exact:true});await v3Link.waitFor();
 assert.equal(contextWrites.length,1);assert.equal(await v3Link.getAttribute("href"),`/aeb/mobo/new?handoff_id=${handoffId}&handoff_digest=${handoffDigest}`);
 const beforeV3Reads=datasetReads.length;await v3Link.click();await page.getByRole("heading",{name:"Tập bàn giao · FA frozen fixture",exact:true}).waitFor();
 assert(await page.getByRole("button",{name:"Kịch bản kiểm thử",exact:true}).isDisabled());assert(await page.getByRole("button",{name:/Mô phỏng CARLA 3D/}).isDisabled());
 assert.equal(await page.locator('input[type="file"]').count(),0);await page.getByText("Nguồn và miền tham số đã xác nhận",{exact:true}).click();await page.getByText("BRAKE_BUILDUP_RATE",{exact:true}).waitFor();
 await page.screenshot({path:path.join(output,"v3-campaign-320.png"),fullPage:true});
 v3Campaign=true;await page.getByRole("button",{name:"Bắt đầu tối ưu trên CARLA 3D",exact:true}).click();await page.waitForURL(url=>url.pathname==="/aeb/mobo"&&url.searchParams.get("run_id")==="1");
 assert.deepEqual(campaignWrites[2],{scenario_id:5,max_trials:10,n_initial_points:3,simulator_type:"CARLA",handoff_id:handoffId,handoff_digest:handoffDigest,base_aeb_version_id:10,search_space:v3Projection.search_space});
 assert.equal(await page.getByRole("link",{name:"Xem phân tích nguồn V3",exact:true}).getAttribute("href"),`/analysis/failures?fa_execution=${executionId}`);
 const v3Url=`/aeb/mobo/new?handoff_id=${handoffId}&handoff_digest=${handoffDigest}`;
 for(const mode of ["failure","wrong-checksum","wrong-project","holdout-overlap","domain-missing","stale"]){handoffMode=mode;await page.goto(base+v3Url);await page.getByRole("button",{name:"Kiểm tra lại tập bàn giao",exact:true}).waitFor();assert(await page.getByRole("button",{name:/Bắt đầu tối ưu/}).isDisabled());}
 handoffMode="normal";await page.getByRole("button",{name:"Kiểm tra lại tập bàn giao",exact:true}).click();await page.getByRole("heading",{name:"Tập bàn giao · FA frozen fixture",exact:true}).waitFor();
 for(const query of [`handoff_id=${handoffId}`,`handoff_id=invalid&handoff_digest=${handoffDigest}`,`handoff_id=${handoffId}&handoff_digest=${handoffDigest}&dataset_id=91`]){await page.goto(base+"/aeb/mobo/new?"+query);await page.getByRole("region",{name:"Tập bàn giao từ phân tích",exact:true}).getByRole("alert").waitFor();assert(await page.getByRole("button",{name:/Bắt đầu tối ưu/}).isDisabled());}
 assert.equal(datasetReads.length,beforeV3Reads,"V3 campaign errors never fetch a V2 dataset as fallback");assert.equal(campaignWrites.length,3,"Invalid V3 requests never create an alternate campaign");
 v3Campaign=false;
 runs[0].status="PENDING";
 page.once("dialog",dialog=>dialog.accept());
 await page.goto(base+"/aeb/mobo?run_id=1");await page.getByRole("button",{name:"Dừng đợt chạy",exact:true}).click();
 await page.getByRole("button",{name:"Dừng đợt chạy",exact:true}).waitFor({state:"hidden"});assert.deepEqual(cancellations,["/vehicsim/optimizations/1/cancel"]);
 empty=true;
 for(const route of ["trials","pareto"]){await page.goto(base+"/aeb/mobo/"+route);await page.getByText("Chưa có đợt tối ưu",{exact:true}).waitFor();assert(await page.getByRole("button",{name:"Chọn đợt tối ưu hoá",exact:true}).isDisabled());}
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await page.goto(base+"/aeb/mobo");await page.getByText("Chưa có đợt tối ưu",{exact:true}).waitFor();
 assert.equal(writes.length,3);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks:["standalone and combined studio completed-only feasibility","tiny impact preserved without safety claim","mobile bounds","late response isolation","single candidate submission","candidate scoped to campaign including in-flight campaign change","exact regression detail navigation","FA dataset scenario/simulator/digest pinned in campaign request","stale/missing digest/source failure block without fallback; explicit retry","persisted campaign failure translated with exact frozen dataset source link","V3 explicit human context confirmation and reviewed controls in both partitions","V3 execution retry reuses stored context, blocked handoff has no dispatch link","V3 handoff partition and domain pinned in exclusive campaign request","V3 missing/checksum/project/overlap/domain/stale failures never fall back to V2","empty campaigns"],liveBackendVerified:false},null,2));
 console.log("PASS MOBO browser workflow; API fixtures only");
} finally {for(const release of pending)release();await browser.close();}
