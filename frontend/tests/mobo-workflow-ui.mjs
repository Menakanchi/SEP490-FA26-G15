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
const errors=[],unexpected=[],writes=[],pending=[];
const campaignWrites=[];
let datasetMode="normal",campaignStatus=200,failedCampaign=false;
const digest="c".repeat(64);
const dataset={schema:"vehicsim.analysis-dataset/v2",id:91,baseline_current:true,handoff_ready:true,dataset_digest:digest,
 scenario:{id:5,name:"FA frozen fixture",code:"CP",category:"CP_CROSSING"},baseline:{id:10,label:"Baseline"},reference:{vehicle_id:1,simulator:"carla-0.9.16-xosc16",dt:0.01},
 runs:[11,12,13,14].map(run_id=>({run_id,metrics:{}})),optimization_run_ids:[11,12],validation_run_ids:[13,14],
 optimization_objectives:{rms_jerk_mps3:{},impact_speed_mps:{},stopping_distance_m:{}},validation_objectives:{rms_jerk_mps3:{},impact_speed_mps:{},stopping_distance_m:{}},evaluation:{version:"adr040-stored-aggregation/1",carla_observational_only:true}};
let empty=false,delayFirst=false,holdSelection=false;
const user={id:77,email:"mobo@example.invalid",full_name:"MOBO Fixture",role:"ENGINEER",is_active:true};
const runs=[1,2].map(id=>({id,name:"Campaign "+id,scenario_id:5,status:"COMPLETED",completed_trials:4,max_trials:4,pareto_count:1}));
const row={id:101,trial_number:1,status:"COMPLETED",sampling_source:"INITIAL_DESIGN",constraint_violated:false,is_pareto_optimal:true,acquisition_value:null,rms_jerk_mps3:0.0001,impact_speed_mps:0.0001,stopping_distance_m:1,parameters:{TTC_THRESHOLD:1.5,BRAKE_ACTIVATION_DELAY:0.1,BRAKE_BUILDUP_RATE:10,MAX_DECELERATION:8}};
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
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(req.method()==="OPTIONS")return route.fulfill({status:204});
  if(p==="/auth/me")return reply(user);
  if(p==="/vehicsim/notifications")return reply({items:[],unread_count:0});
  if(p==="/vehicsim/projects")return reply({items:[],total:0,page:1,page_size:20,active_count:0,archived_count:0});
  if(p==="/vehicsim/context")return reply({project:{id:1,name:"MOBO fixture"},workspace:null,vehicle:{id:1,name:"Fixture"},system:{id:1,baseline:{id:10,label:"Baseline"}},versions:[],families:[{id:5,code:"CP",name:"FA frozen fixture"}],parameters:[],reviewer_projects:[],reviewer_can_decide:false});
  if(p==="/vehicsim/carla/status")return reply({connected:false});
  if(p==="/vehicsim/aeb/versions")return reply([]);
  if(p==="/vehicsim/analysis/datasets/91/handoff")return datasetMode==="failure"?reply({detail:"Fixture source revision changed"},409):reply({...dataset,baseline_current:datasetMode!=="stale",dataset_digest:datasetMode==="missing-digest"?undefined:digest});
  if(p==="/vehicsim/optimizations"){
   if(req.method()==="POST"){campaignWrites.push(req.postDataJSON());return campaignStatus===200?reply({id:1,status:"PENDING"}):reply({detail:"Fixture dataset digest changed"},campaignStatus);}
   return reply(empty?[]:runs);
  }
  const detail=p.match(/^\/vehicsim\/optimizations\/(\d+)$/);
  if(detail)return reply({...runs.find(run=>run.id===Number(detail[1])),dataset_id:91,dataset_digest:digest,optimization_run_ids:[11,12],validation_run_ids:[13,14],...(failedCampaign?{status:"FAILED",error_message:"Analysis campaign dataset identity or checksum changed"}:{})});
  const match=p.match(/^\/vehicsim\/optimizations\/(\d+)\/(trials|pareto)$/);
  if(match){
   const id=Number(match[1]);
   if(delayFirst&&id===1)await new Promise(resolve=>pending.push(resolve));
   const completed={...row,id:id*100+1,trial_number:id*100+1};
   const missing={...row,id:id*100+90,trial_number:id*100+90,stopping_distance_m:null};
   return reply(match[2]==="pareto"?[completed,missing]:[completed,{...row,id:102,trial_number:2,status:"RUNNING",is_pareto_optimal:false},{...row,id:103,trial_number:3,status:"FAILED",is_pareto_optimal:false},{...row,id:104,trial_number:4,constraint_violated:true,is_pareto_optimal:false},missing]);
  }
  if(p.match(/^\/vehicsim\/optimizations\/\d+\/select\/\d+$/)&&req.method()==="POST"){
   writes.push(p);if(holdSelection)await new Promise(resolve=>pending.push(resolve));
   return reply({candidate_aeb_version_id:20,regression_test_id:30});
  }
  unexpected.push(p);return reply({detail:"Unhandled fixture"},404);
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on("pageerror",error=>errors.push(error.message));
 const choose=async id=>{await page.getByRole("button",{name:"Chọn đợt tối ưu hoá",exact:true}).click();await page.getByRole("option",{name:new RegExp("Run #"+id+" ·")}).click();};
 const noOverflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"No document overflow");
 const readableHeaders=async()=>assert(await page.locator("thead").evaluate(head=>{
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");canvas.width=canvas.height=1;
  const luminance=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=ctx.getImageData(0,0,1,1).data;return [...rgb].slice(0,3).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);};
  const background=luminance(getComputedStyle(head).backgroundColor);
  return [...head.querySelectorAll("th")].every(cell=>{const foreground=luminance(getComputedStyle(cell).color);return (Math.max(background,foreground)+0.05)/(Math.min(background,foreground)+0.05)>=4.5;});
 }),"Table header contrast is readable");
 await page.goto(base+"/aeb/mobo/trials?run_id=1");
 await page.getByRole("button",{name:"Hợp lệ (1)",exact:true}).waitFor();
 await readableHeaders();
 assert.equal(await page.getByRole("cell",{name:"Chưa đánh giá",exact:true}).count(),3,"Completed without a stopping metric remains unassessed");
 assert.equal(await page.getByRole("cell",{name:"Thỏa mãn",exact:true}).count(),1);
 await page.getByRole("button",{name:"Hợp lệ (1)",exact:true}).click();assert.equal(await page.locator("tbody tr").count(),1);
 assert.match(await page.locator("tbody").innerText(),/3\.60e-4/);
 for(const width of [1366,768,390,320]){await page.setViewportSize({width,height:844});await noOverflow();await page.screenshot({path:path.join(output,"trials-"+width+".png")});}
 // A slower response from a previous campaign must never replace the selected campaign.
 delayFirst=true;await page.goto(base+"/aeb/mobo/trials?run_id=1");
 await page.getByRole("button",{name:"Chọn đợt tối ưu hoá",exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Chọn đợt tối ưu hoá"]')?.textContent.includes("Run #1"));
 await choose(2);await page.getByRole("cell",{name:"#201",exact:true}).waitFor();
 assert(pending.length>0);delayFirst=false;for(const release of pending.splice(0))release();
 await page.waitForResponse(response=>response.url().endsWith("/optimizations/1/trials"));
 assert.equal(await page.getByRole("cell",{name:"#101",exact:true}).count(),0);
 await page.goto(base+"/aeb/mobo/pareto?run_id=1");await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).waitFor();
 assert.equal(await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).count(),1,"Incomplete historical Pareto rows are not eligible candidates");
 await readableHeaders();
 assert.equal(await page.getByText(/\(An toàn\)|Tránh va chạm/).count(),0);
 assert.match(await page.locator("tbody").innerText(),/3\.60e-4 km\/h/);
 for(const width of [1366,768,390,320]){await page.setViewportSize({width,height:844});await noOverflow();await page.screenshot({path:path.join(output,"pareto-"+width+".png")});}
 holdSelection=true;
 await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByRole("button",{name:"Đang lưu…",exact:true}).waitFor();
 assert(await page.getByRole("button",{name:"Chọn đợt tối ưu hoá",exact:true}).isDisabled());
 assert.equal(writes.length,1);holdSelection=false;for(const release of pending.splice(0))release();
 await page.getByText(/Đã tạo ứng viên AEB/).waitFor();assert.equal(await page.getByRole("link",{name:"Xem kiểm thử hồi quy →",exact:true}).getAttribute("href"),"/validation/regression/30");await choose(2);await page.getByRole("cell",{name:"#201",exact:true}).waitFor();
 assert.equal(await page.getByText(/Đã tạo ứng viên AEB/).count(),0);
 // The new combined studio uses the same evidence and campaign identity rules.
 await page.goto(base+"/aeb/mobo?run_id=1&tab=trials");await page.getByRole("cell",{name:"#101",exact:true}).waitFor();
 assert.equal(await page.getByText("Chưa đánh giá",{exact:true}).count(),3);
 await page.getByRole("button",{name:"Chỉ hợp lệ",exact:true}).click();assert.equal(await page.locator("tbody tr").count(),1);
 assert.match(await page.locator("tbody").innerText(),/3\.60e-4 km\/h/);
 for(const width of [1366,768,390,320]){await page.setViewportSize({width,height:844});await noOverflow();await page.screenshot({path:path.join(output,"studio-"+width+".png")});}
 delayFirst=true;await page.goto(base+"/aeb/mobo?run_id=1&tab=runs");
 await page.getByRole("button",{name:"Xem tối ưu",exact:true}).nth(1).click();await page.getByRole("cell",{name:"#201",exact:true}).waitFor();
 assert(pending.length>0);delayFirst=false;const old=page.waitForResponse(response=>response.url().endsWith("/optimizations/1/pareto"));for(const release of pending.splice(0))release();await old;
 assert.equal(await page.getByRole("cell",{name:"#101",exact:true}).count(),0);
 assert.equal(await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).count(),1);
 assert.equal(await page.getByText(/Đã chọn .* làm Ứng viên AEB/).count(),0);
 holdSelection=true;await page.getByRole("button",{name:"Chọn làm ứng viên",exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByRole("button",{name:"Đang lưu…",exact:true}).waitFor();assert.equal(writes.length,2);
 await page.getByRole("button",{name:/Lịch sử đợt chạy/}).click();await page.getByRole("button",{name:"Xem tối ưu",exact:true}).first().click();
 holdSelection=false;for(const release of pending.splice(0))release();await page.getByRole("cell",{name:"#101",exact:true}).waitFor();
 assert.equal(await page.getByText(/Đã chọn .* làm Ứng viên AEB/).count(),0,"Late selection from campaign 2 is not attached to campaign 1");
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
 empty=true;
 for(const route of ["trials","pareto"]){await page.goto(base+"/aeb/mobo/"+route);await page.getByText("Chưa có đợt tối ưu",{exact:true}).waitFor();assert(await page.getByRole("button",{name:"Chọn đợt tối ưu hoá",exact:true}).isDisabled());}
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await page.goto(base+"/aeb/mobo");await page.getByText("Chưa có đợt tối ưu",{exact:true}).waitFor();
 assert.equal(writes.length,2);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await fs.writeFile(path.join(output,"result.json"),JSON.stringify({status:"PASS",kind:"BROWSER_FIXTURE_ONLY",checks:["standalone and combined studio completed-only feasibility","tiny impact preserved without safety claim","mobile bounds","late response isolation","single candidate submission","candidate scoped to campaign including in-flight campaign change","exact regression detail navigation","FA dataset scenario/simulator/digest pinned in campaign request","stale/missing digest/source failure block without fallback; explicit retry","persisted campaign failure translated with exact frozen dataset source link","empty campaigns"],liveBackendVerified:false},null,2));
 console.log("PASS MOBO browser workflow; API fixtures only");
} finally {for(const release of pending)release();await browser.close();}
